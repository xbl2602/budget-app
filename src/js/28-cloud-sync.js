/* ============================================================
   CLOUD SYNC — optional, end-to-end encrypted, OFF by default
   ------------------------------------------------------------
   Design: docs/superpowers/specs/2026-09-28-cloud-sync-design-v2.md

   The hard constraints, in the order they bite:
   * N1  Existing data never disappears. The ledger shape is untouched; every piece
         of sync state lives in its own `budgetSync*` keys. Enabling snapshots the
         ledger first (and aborts if it cannot); any failure leaves the local ledger
         exactly as it was.
   * N2  Works without logging in, exactly as before. Disabled (the default) means
         zero network requests, zero timers, zero listeners and no secret ever read.
         "Logging in" is pasting one recovery code; there is no account.
   * E2E The server only ever holds ciphertext. A 16-byte secret (the recovery code)
         is split by HKDF into an auth key (sent, hashed server-side) and an
         encryption key (never leaves the device, non-extractable).

   Everything here is defensive about failing: it is loaded inside build.sh's
   per-file try/catch, and DataStore.save() only reaches it through a guarded call.
   ============================================================ */
(function() {
'use strict';

const CFG = {
  // Public values by design: the table access is closed to anon, and every RPC
  // authenticates with the secret-derived key, not with this one.
  URL: 'https://sfwnpwchujslqfnmdyxo.supabase.co',
  KEY: 'sb_publishable_ZwBzyVpFzgH_QiAoewoM2Q_p5Efrx68',
  DEBOUNCE_MS: 3000,        // quiet time after an edit before syncing
  MAX_WAIT_MS: 30000,       // ...but never wait longer than this under constant editing
  LAUNCH_DELAY_MS: 2000,
  FETCH_TIMEOUT_MS: 20000,
  RETRIES: 3,               // conflict retries per sync
  MAX_BLOB_CHARS: 4 * 1024 * 1024,   // must match the server's limit
  MAX_CONFLICTS: 20,
  MASS_DELETE_RATIO: 0.5,   // G2: a merge that would remove this share...
  MASS_DELETE_COUNT: 20     // ...or this many records asks first
};

const K = {
  secret: 'budgetSyncSecret', meta: 'budgetSyncMeta', base: 'budgetSyncBase',
  backup: 'budgetSyncBackup', backupTime: 'budgetSyncBackupTime',
  premerge: 'budgetSyncPremerge', premergeTime: 'budgetSyncPremergeTime',
  conflicts: 'budgetSyncConflicts', bulk: 'budgetSyncBulk', lock: 'budgetSyncLock'
};

class SyncError extends Error {
  constructor(code, detail) { super(code + (detail ? ': ' + detail : '')); this.code = code; this.detail = detail || ''; }
}

/* ---------- small helpers ---------- */
const enc = s => new TextEncoder().encode(s);
const dec = b => new TextDecoder().decode(b);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const clone = x => JSON.parse(JSON.stringify(x));
function bytesToB64(bytes) {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(s);
}
function b64ToBytes(b64) {
  const s = atob(b64), out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}
function bytesToHex(bytes) { return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join(''); }
function concat() {
  const parts = Array.prototype.slice.call(arguments);
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0; parts.forEach(p => { out.set(p, o); o += p.length; });
  return out;
}
function u64be(n) {
  const b = new Uint8Array(8), dv = new DataView(b.buffer);
  dv.setUint32(0, Math.floor(n / 4294967296)); dv.setUint32(4, n >>> 0);
  return b;
}
function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
// Writes and READS BACK. A silent quota failure must never look like success (G6).
function lsSet(k, v) { try { localStorage.setItem(k, v); return localStorage.getItem(k) === v; } catch (e) { return false; } }
function lsDel(k) { try { localStorage.removeItem(k); } catch (e) { /* ignore */ } }
function hasLocalPin() { return !!lsGet('budgetAppPinHash'); }

/* ============================================================
   RECOVERY CODE — 16 random bytes as Crockford Base32 (26 chars) plus a
   2-char CRC-8, shown as 7 groups of 4. A typo is caught at paste time, not
   later as a mysterious decryption failure.
   ============================================================ */
const B32 = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
function crc8(bytes) {
  let c = 0;
  for (let i = 0; i < bytes.length; i++) {
    c ^= bytes[i];
    for (let j = 0; j < 8; j++) c = (c & 0x80) ? (((c << 1) ^ 0x07) & 0xFF) : ((c << 1) & 0xFF);
  }
  return c;
}
function b32encode(bytes) {
  let bits = 0, val = 0, out = '';
  for (let i = 0; i < bytes.length; i++) {
    val = (val << 8) | bytes[i]; bits += 8;
    while (bits >= 5) { out += B32[(val >>> (bits - 5)) & 31]; bits -= 5; }
    val &= (1 << bits) - 1;
  }
  if (bits > 0) out += B32[(val << (5 - bits)) & 31];
  return out;
}
function encodeSecret(bytes) {
  const crc = crc8(bytes);
  const s = b32encode(bytes) + B32[crc >> 5] + B32[crc & 31];
  return s.match(/.{4}/g).join('-');
}
// -> { ok:true, bytes } | { ok:false, reason: 'length' | 'chars' | 'padding' | 'checksum' }
function decodeSecret(input) {
  let s = String(input || '').toUpperCase().replace(/[\s\-_]/g, '').replace(/O/g, '0').replace(/[IL]/g, '1');
  if (s.length !== 28) return { ok: false, reason: 'length' };
  const vals = [];
  for (let i = 0; i < s.length; i++) {
    const v = B32.indexOf(s[i]);
    if (v < 0) return { ok: false, reason: 'chars' };
    vals.push(v);
  }
  const bytes = new Uint8Array(16);
  let bits = 0, val = 0, o = 0;
  for (let i = 0; i < 26; i++) {
    val = (val << 5) | vals[i]; bits += 5;
    if (bits >= 8) { bytes[o++] = (val >>> (bits - 8)) & 0xFF; bits -= 8; }
    val &= (1 << bits) - 1;
  }
  if (val !== 0) return { ok: false, reason: 'padding' };      // the 2 spare bits must be zero
  if (vals[26] > 7) return { ok: false, reason: 'checksum' };
  if (((vals[26] << 5) | vals[27]) !== crc8(bytes)) return { ok: false, reason: 'checksum' };
  return { ok: true, bytes };
}

/* ============================================================
   KEYS AND BLOBS (WebCrypto primitives only — nothing home-made)
   ============================================================ */
let keyCache = null;   // { code, keys } — the derived keys for the current secret
async function deriveKeys(secretBytes) {
  const subtle = crypto.subtle, salt = enc('budget-sync/v1');
  const km = await subtle.importKey('raw', secretBytes, 'HKDF', false, ['deriveBits', 'deriveKey']);
  const authKey = new Uint8Array(await subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt, info: enc('auth') }, km, 256));
  const encKey = await subtle.deriveKey({ name: 'HKDF', hash: 'SHA-256', salt, info: enc('enc') }, km,
    { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
  const keyHash = new Uint8Array(await subtle.digest('SHA-256', authKey));
  return { authHex: bytesToHex(authKey), keyHash, keyHashHex: bytesToHex(keyHash), encKey };
}
async function getKeys() {
  const code = lsGet(K.secret);
  if (!code) throw new SyncError('nosecret');
  if (keyCache && keyCache.code === code) return keyCache.keys;
  const d = decodeSecret(code);
  if (!d.ok) throw new SyncError('nosecret', d.reason);
  const keys = await deriveKeys(d.bytes);
  keyCache = { code, keys };
  return keys;
}

async function gzip(bytes) {
  if (typeof CompressionStream === 'undefined') return null;
  try {
    return new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(new CompressionStream('gzip'))).arrayBuffer());
  } catch (e) { return null; }
}
async function gunzip(bytes) {
  if (typeof DecompressionStream === 'undefined') throw new SyncError('format', 'gzip unsupported here');
  try {
    return new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer());
  } catch (e) { throw new SyncError('format', 'gunzip failed'); }
}

// blob = base64( 0x01 | flags(bit0 = gzip) | IV(12) | AES-GCM ciphertext+tag )
// AAD  = "budget-sync/v1" | keyHash(32) | version(uint64 BE). The server stores the
// version in the clear AND it is bound here, so a server that lies about the version
// (or moves v3's ciphertext onto v5) makes decryption fail instead of being believed.
async function sealLedger(json, keys, version) {
  let plain = enc(json), flags = 0;
  const z = await gzip(plain);
  if (z && z.length < plain.length) { plain = z; flags |= 1; }
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const aad = concat(enc('budget-sync/v1'), keys.keyHash, u64be(version));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: aad }, keys.encKey, plain));
  return bytesToB64(concat(new Uint8Array([1, flags]), iv, ct));
}
async function openLedger(b64, keys, version) {
  let bytes;
  try { bytes = b64ToBytes(String(b64)); } catch (e) { throw new SyncError('format', 'not base64'); }
  if (bytes.length < 2 + 12 + 16) throw new SyncError('format', 'too short');
  if (bytes[0] !== 1) throw new SyncError('format', 'unknown blob version ' + bytes[0]);
  const flags = bytes[1];
  if (flags & ~1) throw new SyncError('format', 'unknown flags');
  const aad = concat(enc('budget-sync/v1'), keys.keyHash, u64be(version));
  let plain;
  try {
    plain = new Uint8Array(await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: bytes.slice(2, 14), additionalData: aad }, keys.encKey, bytes.slice(14)));
  } catch (e) { throw new SyncError('decrypt'); }
  if (flags & 1) plain = await gunzip(plain);
  return dec(plain);
}

// Local snapshots (pre-enable backup, pre-merge snapshot, sync base). Compressed when possible.
async function packSnapshot(json) {
  const z = await gzip(enc(json));
  return z ? 'g1:' + bytesToB64(z) : 'r1:' + json;
}
async function unpackSnapshot(s) {
  if (!s) return null;
  if (s.indexOf('r1:') === 0) return s.slice(3);
  if (s.indexOf('g1:') === 0) return dec(await gunzip(b64ToBytes(s.slice(3))));
  return null;
}

async function contentHash(obj) {
  const h = await crypto.subtle.digest('SHA-256', enc(DataStore._canonStringify(obj)));
  return bytesToHex(new Uint8Array(h));
}
let hashCache = { rev: -1, data: null, hash: '' };
async function localHash() {
  const d = DataStore._data;
  if (hashCache.data === d && hashCache.rev === DataStore._rev) return hashCache.hash;
  const rev = DataStore._rev, hash = await contentHash(d);
  hashCache = { rev, data: d, hash };
  return hash;
}

/* ---------- transport ---------- */
async function rpc(name, body) {
  if (typeof fetch !== 'function') throw new SyncError('unsupported', 'fetch');
  const ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const timer = ctrl ? setTimeout(() => ctrl.abort(), CFG.FETCH_TIMEOUT_MS) : null;
  let res;
  try {
    res = await fetch(CFG.URL + '/rest/v1/rpc/' + name, {
      method: 'POST',
      headers: { 'apikey': CFG.KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: ctrl ? ctrl.signal : undefined
    });
  } catch (e) {
    throw new SyncError('network', e && e.message);
  } finally { if (timer) clearTimeout(timer); }
  if (!res.ok) {
    let detail = '';
    try { detail = (await res.text()).slice(0, 160); } catch (e) { /* ignore */ }
    throw new SyncError(res.status >= 500 ? 'server' : 'http', 'HTTP ' + res.status + ' ' + detail);
  }
  try { return await res.json(); } catch (e) { throw new SyncError('server', 'bad JSON'); }
}

/* ============================================================
   STATE
   ============================================================ */
let meta = null;              // parsed budgetSyncMeta; null = sync off
let active = false;           // listeners + timers registered
let applying = false;         // we are writing merged data into the store: don't re-trigger
let inflight = false, rerun = false;
let debounceTimer = null, dirtySince = 0;
let lastFinished = 0;
const st = { phase: 'idle', error: null, awaiting: null };
const approvals = { merge: null, empty: false, bulk: null, conflicts: null };
// Set only while showAwaiting() found some OTHER modal open and is waiting for it to
// close before it can show the sync approval prompt (see showAwaiting()).
let awaitObserver = null;
// The conflict resolver's in-progress picks, kept across re-renders of the same
// awaiting batch (button clicks re-render the whole modal) but reset whenever a
// genuinely new batch of conflicts arrives (a new st.awaiting object identity).
let conflictDraft = null, conflictDraftFor = null;
function ensureConflictDraft(a) {
  if (conflictDraftFor !== a) {
    conflictDraft = {};
    (a.pairs || []).forEach(p => { conflictDraft[conflictKey(p)] = { action: null, value: null, editing: false }; });
    conflictDraftFor = a;
  }
  return conflictDraft;
}

function loadMeta() {
  try { const s = lsGet(K.meta); meta = s ? JSON.parse(s) : null; } catch (e) { meta = null; }
  if (meta && typeof meta !== 'object') meta = null;
  return meta;
}
function saveMeta() { return lsSet(K.meta, JSON.stringify(meta)); }
function isEnabled() { return !!(meta && meta.state === 'enabled'); }
function supported() { return typeof fetch === 'function' && !!(window.crypto && crypto.subtle) && typeof TextEncoder !== 'undefined'; }

function getConflicts() { try { const c = JSON.parse(lsGet(K.conflicts) || '[]'); return Array.isArray(c) ? c : []; } catch (e) { return []; } }
function addConflicts(list) {
  if (!list || !list.length) return;
  const at = new Date().toISOString();
  const all = list.map(c => Object.assign({ at }, c)).concat(getConflicts()).slice(0, CFG.MAX_CONFLICTS);
  lsSet(K.conflicts, JSON.stringify(all));
}

function pausedReason() {
  if (window._pinRequired || hasLocalPin()) return 'pin';
  if (!DataStore._data) return 'nodata';
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return 'offline';
  return null;
}

function setPhase(phase, extra) {
  st.phase = phase;
  if (phase === 'ok' || phase === 'syncing') st.error = null;
  if (extra && extra.error) st.error = extra.error;
  renderPill();
  refreshCard();
}
function recordError(err) {
  const e = { code: err.code, detail: err.detail, at: new Date().toISOString() };
  if (meta) { meta.lastError = e; saveMeta(); }
  setPhase(err.code === 'network' && typeof navigator !== 'undefined' && navigator.onLine === false ? 'offline' : 'error', { error: e });
}

/* ---------- single flight: one sync at a time, across tabs where we can ---------- */
async function withLock(fn) {
  if (inflight) { rerun = true; return { status: 'busy' }; }
  inflight = true;
  try {
    if (typeof navigator !== 'undefined' && navigator.locks && navigator.locks.request) {
      return await navigator.locks.request('budget-cloud-sync', { ifAvailable: true },
        async lock => lock ? fn() : { status: 'busy' });
    }
    const now = Date.now(), held = parseInt(lsGet(K.lock) || '0', 10);
    if (held && now - held < 60000) return { status: 'busy' };
    const token = String(now);
    lsSet(K.lock, token);
    try { return await fn(); } finally { if (lsGet(K.lock) === token) lsDel(K.lock); }
  } finally {
    inflight = false;
    if (rerun) { rerun = false; setTimeout(() => { syncOnce('rerun'); }, 500); }
  }
}

/* ============================================================
   LEDGER VALIDATION (structure only — see spec §7.5 on why NOT sanitizeIncoming)
   ============================================================ */
function parseRemote(json) {
  let data;
  try { data = JSON.parse(json); } catch (e) { throw new SyncError('format', 'not JSON'); }
  if (!data || typeof data !== 'object' || !Array.isArray(data.records) || !Array.isArray(data.categories))
    throw new SyncError('format', 'not a ledger');
  const src = data.records.length;
  data.records = data.records.filter(r => r && r.id !== undefined && r.id !== null && r.id !== ''
    && typeof r.amount === 'number' && isFinite(r.amount));
  data.categories = data.categories.filter(c => c && c.id && typeof c.name === 'string');
  // Every record rejected while the sender clearly had some: the formats disagree. Refuse
  // the whole payload rather than "merge" it into nothing.
  if (src > 0 && data.records.length === 0) throw new SyncError('format', 'all records rejected');
  const dropped = src - data.records.length;
  DataStore._sanitizeEntities(data);
  return { ledger: DataStore._normalize(data), dropped };
}

function isPristine(d) {
  if (!d) return true;
  const empty = o => !o || (Array.isArray(o) ? o.length === 0 : Object.keys(o).length === 0);
  return empty(d.records) && empty(d.contacts) && empty(d.splitBills) && empty(d.purchasePlans) && empty(d.billCategories)
    && empty(d.allTags) && empty(d.billAmounts) && empty(d.budgets) && empty(d.categoryBudgets) && empty(d.monthlyIncome)
    && DataStore._canonStringify(d.categories) === DataStore._canonStringify(DataStore._defaults().categories);
}

function counts(d) { return { records: (d.records || []).length, bills: (d.splitBills || []).length, plans: (d.purchasePlans || []).length }; }

/* ============================================================
   APPLYING + COMMITTING
   ============================================================ */
// Make the page on screen show the data a sync just changed. navigateTo() is no use for
// this: it returns early when you are already on that page. The add page is left alone —
// it is a form, and re-rendering it would wipe whatever is being typed.
function refreshUI() {
  try {
    if (window.currentTab === 'add') return;
    if (typeof refreshCurrentPage === 'function') refreshCurrentPage();
  } catch (e) { /* cosmetic */ }
}

// Replace the live ledger, verifying the write really landed; otherwise put it back.
function applyToLocal(ledger) {
  const prev = DataStore._data;
  applying = true;
  try {
    DataStore._data = DataStore._normalize(clone(ledger));
    DataStore._rev = (DataStore._rev || 0) + 1;
    DataStore.save();
    if (lsGet('budgetAppData') !== JSON.stringify(DataStore._data)) {
      DataStore._data = prev; DataStore._rev = (DataStore._rev || 0) + 1;
      throw new SyncError('quota', 'could not write the merged ledger');
    }
  } finally { applying = false; }
  refreshUI();
}

async function snapshot(key, timeKey) {
  const json = JSON.stringify(DataStore._data);
  const packed = await packSnapshot(json);
  if (!lsSet(key, packed)) throw new SyncError('quota', 'snapshot');
  if ((await unpackSnapshot(lsGet(key))) !== json) throw new SyncError('quota', 'snapshot verify');
  if (timeKey) lsSet(timeKey, new Date().toISOString());
}

// Record "the cloud now holds exactly `ledger` at `version`". Base first, meta second:
// if the base cannot be stored we keep the old version, and the next sync simply pulls
// our own push back and merges it into itself — harmless, unlike a version that
// outruns its base.
async function commitSynced(ledger, json, version) {
  const packed = await packSnapshot(json);
  if (!lsSet(K.base, packed)) throw new SyncError('quota', 'base');
  meta.version = version;
  meta.baseHash = await contentHash(ledger);
  meta.baseRecords = (ledger.records || []).length;
  meta.lastSyncAt = new Date().toISOString();
  meta.lastError = null;
  if (!saveMeta()) throw new SyncError('quota', 'meta');
}
async function loadBase() {
  const s = lsGet(K.base);
  if (!s) return null;
  try { return JSON.parse(await unpackSnapshot(s)); } catch (e) { return null; }
}

/* ============================================================
   PUSH
   ============================================================ */
async function pushLedger(keys, ledger, expected, invite) {
  const json = JSON.stringify(ledger);
  const blob = await sealLedger(json, keys, expected + 1);
  if (blob.length > CFG.MAX_BLOB_CHARS) throw new SyncError('toolarge');
  const body = { p_auth_key: keys.authHex, p_expected_version: expected, p_blob: blob, p_invite: invite || null };
  let res = await rpc('ledger_push', body);
  if (res.status === 'too_fast') { await sleep(2100); res = await rpc('ledger_push', body); }
  return { res, json };
}

/* ============================================================
   SYNC ONE ROUND
   ============================================================ */
async function syncOnce(reason) {
  if (!isEnabled()) return { status: 'disabled' };
  const paused = pausedReason();
  if (paused) { setPhase(paused === 'offline' ? 'offline' : 'paused'); return { status: 'paused', reason: paused }; }
  return withLock(async () => {
    setPhase('syncing');
    try {
      const out = await runSync(reason);
      lastFinished = Date.now();
      setPhase(out.status === 'awaiting' ? 'awaiting' : out.status === 'paused' ? 'paused' : 'ok');
      return out;
    } catch (e) {
      const err = e instanceof SyncError ? e : new SyncError('internal', e && e.message);
      recordError(err);
      return { status: 'error', code: err.code };
    }
  });
}

async function runSync(reason) {
  const keys = await getKeys();
  const bulk = readBulk();
  if (bulk && !approvals.bulk) return requestBulk(bulk);
  if (bulk && approvals.bulk === 'later') return { status: 'paused', reason: 'bulk-later' };
  const useCloud = !!bulk && approvals.bulk === 'use-cloud';

  for (let attempt = 0; attempt < CFG.RETRIES; attempt++) {
    // "Use the cloud's copy" needs the blob even when the version has not moved
    const pull = await rpc('ledger_pull', { p_auth_key: keys.authHex, p_known_version: useCloud ? null : meta.version });
    if (pull.status === 'none') throw new SyncError('gone');
    if (pull.status !== 'ok' && pull.status !== 'unchanged') throw new SyncError('server', 'pull ' + pull.status);
    const cloudVersion = pull.version;
    if (cloudVersion < meta.version) throw new SyncError('rollback', cloudVersion + ' < ' + meta.version);   // G4
    const local = DataStore._data;

    // The user chose "keep this device's data" after a bulk replace: overwrite the cloud with it.
    if (bulk && approvals.bulk === 'keep-local') {
      const { res, json } = await pushLedger(keys, local, cloudVersion);
      if (res.status === 'conflict') continue;
      if (res.status !== 'ok') throw pushError(res);
      await commitSynced(local, json, res.version);
      clearBulk();
      return { status: 'ok', pushed: true };
    }

    // The user chose the cloud's copy after a bulk replace: take it wholesale (snapshot first).
    if (useCloud) {
      const remoteJson = await openLedger(pull.blob, keys, cloudVersion);                                  // G5
      const remote = parseRemote(remoteJson).ledger;
      await snapshot(K.premerge, K.premergeTime);                                                          // G6
      applyToLocal(remote);
      await commitSynced(remote, remoteJson, cloudVersion);
      clearBulk();
      return { status: 'ok', restored: true };
    }

    const changed = (await localHash()) !== meta.baseHash;
    if (cloudVersion === meta.version) {
      if (!changed) return { status: 'ok', unchanged: true };
      if ((local.records || []).length === 0 && (meta.baseRecords || 0) > 0 && !approvals.empty)
        throw new SyncError('emptyguard');                                                                 // G1
      const { res, json } = await pushLedger(keys, local, cloudVersion);
      if (res.status === 'conflict') continue;
      if (res.status !== 'ok') throw pushError(res);
      await commitSynced(local, json, res.version);
      approvals.empty = false;
      return { status: 'ok', pushed: true };
    }

    // The cloud is ahead of what we last saw: bring it in.
    const remoteJson = await openLedger(pull.blob, keys, cloudVersion);                                   // G5
    const parsed = parseRemote(remoteJson);
    const remote = parsed.ledger;
    if (parsed.dropped > 0 && typeof showToast === 'function') showToast(__('cloud.warn.dropped', parsed.dropped), 'warning');

    const base = await loadBase();
    const merge = DataStore._mergeData(remote, { base, dryRun: true });
    let merged = merge.data;

    // G7: both sides genuinely disagree on the same record/split bill — ask instead
    // of silently taking the generic algorithm's guess (see buildConflictPairs()).
    const conflictPairs = buildConflictPairs(local, remote, base, merge.conflicts);
    if (conflictPairs.length) {
      const resolved = approvals.conflicts && approvals.conflicts.cloudVersion === cloudVersion ? approvals.conflicts.map : null;
      if (!resolved || conflictPairs.some(p => !resolved[conflictKey(p)])) {
        return requestConflicts({ pairs: conflictPairs, singles: buildConflictSingles(local, remote, base, conflictPairs), cloudVersion });
      }
      // A single shared ledger version can't hold "no decision yet" for one record while
      // still committing everything else — whatever we pushed would become the agreed
      // value and the conflict would quietly vanish instead of staying open. So a defer
      // anywhere in the batch skips this whole round untouched (nothing pushed, nothing
      // applied locally): the next sync recomputes the same base/remote diff and asks
      // again, exactly like choosing "later" on the other approval prompts.
      if (conflictPairs.some(p => resolved[conflictKey(p)].action === 'defer')) {
        approvals.conflicts = null;
        return { status: 'paused', reason: 'conflict-deferred' };
      }
      merged = applyConflictResolutions(merged, conflictPairs, resolved);
      approvals.conflicts = null;
    }

    // G2: this merge would delete a large share of what is on this device. Ask first.
    const removedList = removedRecords(local, merged);
    const removed = removedList.length;
    const total = (local.records || []).length;
    if ((removed >= CFG.MASS_DELETE_COUNT || (total > 0 && removed / total >= CFG.MASS_DELETE_RATIO))
        && approvals.merge !== cloudVersion) {
      return requestMassDelete({ removed, total, cloudVersion, sample: removedList.slice(0, 5) });
    }

    const localChanged = DataStore._canonStringify(merged) !== DataStore._canonStringify(local);
    if (localChanged) {
      await snapshot(K.premerge, K.premergeTime);                                                          // G6
      applyToLocal(merged);
    }
    addConflicts(merge.conflicts);
    approvals.merge = null;

    const mergedHash = await contentHash(merged);
    if (mergedHash === await contentHash(remote)) {
      await commitSynced(remote, remoteJson, cloudVersion);
      return { status: 'ok', merged: localChanged, conflicts: merge.conflicts.length };
    }
    const { res, json } = await pushLedger(keys, merged, cloudVersion);
    if (res.status === 'conflict') continue;
    if (res.status !== 'ok') throw pushError(res);
    await commitSynced(merged, json, res.version);
    return { status: 'ok', merged: localChanged, pushed: true, conflicts: merge.conflicts.length };
  }
  throw new SyncError('busy', 'still conflicting after ' + CFG.RETRIES + ' tries');
}

function pushError(res) {
  const map = { too_large: 'toolarge', gone: 'gone', invite_required: 'invite', invite_invalid: 'invite', too_fast: 'busy', bad_request: 'server' };
  return new SyncError(map[res.status] || 'server', 'push ' + res.status);
}
// The local records a merge would drop, so the approval prompt can name them
// instead of just counting them.
function removedRecords(local, merged) {
  const keep = new Set((merged.records || []).map(r => r && r.id));
  return (local.records || []).filter(r => r && !keep.has(r.id));
}

/* ============================================================
   G7: GENUINE TWO-SIDED CONFLICTS (records / split bills) — ask, don't guess
   ------------------------------------------------------------
   _mergeData already resolves every clash on its own (newer edit wins,
   an edit beats a delete) and that stays the behavior for everything else
   (categories, tags, budgets, one-sided additions, uncontested deletions —
   only one side touched those, so there is nothing to contest). This layer
   is additive and narrow: when BOTH sides changed the same record or split
   bill differently since the last common point, stop and let the user pick,
   instead of silently taking the generic algorithm's guess.
   ============================================================ */
const CONFLICT_COLLECTIONS = ['records', 'splitBills'];

// _merge3's conflict paths look like ".records[id:xxx]" (a whole entity —
// delete-vs-edit) or ".records[id:xxx].note" (one field of it — edit-vs-edit,
// possibly several per entity). Either way, the entity key is what matters
// here: the user resolves a whole record/split bill at once, not one field
// at a time.
function entityKeyFromConflictPath(path) {
  for (let i = 0; i < CONFLICT_COLLECTIONS.length; i++) {
    const coll = CONFLICT_COLLECTIONS[i], prefix = '.' + coll + '[id:';
    if (path.indexOf(prefix) !== 0) continue;
    const rest = path.slice(prefix.length), close = rest.indexOf(']');
    if (close === -1) continue;
    return { coll: coll, id: rest.slice(0, close) };
  }
  return null;
}
function findEntity(list, id) { return (list || []).find(x => x && String(x.id) === String(id)) || null; }
// One row per contested entity, each carrying its full local/remote/base copy
// (or null where a side has none — deleted, or never existed) so the modal
// can show complete records, not just the field that happened to clash.
function buildConflictPairs(local, remote, base, mergeConflicts) {
  const seen = new Map();
  (mergeConflicts || []).forEach(c => {
    if (c.kind === 'orphan-record') return;   // recovery bookkeeping, not a real clash
    const k = entityKeyFromConflictPath(c.path);
    if (k) seen.set(k.coll + ':' + k.id, k);
  });
  return [...seen.values()].map(k => ({
    coll: k.coll, id: k.id,
    local: findEntity(local[k.coll], k.id),
    remote: findEntity(remote[k.coll], k.id),
    base: findEntity(base && base[k.coll], k.id)
  }));
}
// Items that exist on only one side and were never in the shared base —
// i.e. genuinely new there, not "the other side deleted this" (that stays
// G2's job). Shown for visibility only: they auto-merge (both kept) same as
// before, no decision required.
function buildConflictSingles(local, remote, base, pairs) {
  const paired = new Set(pairs.map(p => p.coll + ':' + p.id));
  const out = [];
  CONFLICT_COLLECTIONS.forEach(coll => {
    const L = local[coll] || [], R = remote[coll] || [], B = (base && base[coll]) || [];
    const idSet = arr => new Set(arr.filter(x => x && x.id != null).map(x => String(x.id)));
    const lIds = idSet(L), rIds = idSet(R), bIds = idSet(B);
    L.forEach(x => {
      if (x && x.id != null && !rIds.has(String(x.id)) && !bIds.has(String(x.id)) && !paired.has(coll + ':' + x.id))
        out.push({ coll: coll, id: x.id, side: 'local', item: x });
    });
    R.forEach(x => {
      if (x && x.id != null && !lIds.has(String(x.id)) && !bIds.has(String(x.id)) && !paired.has(coll + ':' + x.id))
        out.push({ coll: coll, id: x.id, side: 'remote', item: x });
    });
  });
  return out;
}
function conflictKey(p) { return p.coll + ':' + p.id; }
// Turns the user's per-row choices into the entities that should actually
// land in `merged`, on top of whatever the generic algorithm already guessed.
function applyConflictResolutions(merged, pairs, resolutions) {
  const out = clone(merged);
  pairs.forEach(p => {
    const r = resolutions[conflictKey(p)];
    if (!r) return;   // shouldn't happen — caller checks every pair has one first
    let final;
    if (r.action === 'local') final = p.local;
    else if (r.action === 'remote') final = p.remote;
    else if (r.action === 'newer') {
      const lt = (p.local && (p.local.updatedAt || p.local.createdAt)) || '';
      const rt = (p.remote && (p.remote.updatedAt || p.remote.createdAt)) || '';
      final = rt > lt ? p.remote : p.local;
    } else if (r.action === 'edit') final = r.value;
    else final = p.local;   // defensive fallback only — runSync() bails out before this point whenever any action is 'defer'
    const list = out[p.coll] = Array.isArray(out[p.coll]) ? out[p.coll] : [];
    const idx = list.findIndex(x => x && String(x.id) === String(p.id));
    if (final) { const copy = clone(final); if (idx === -1) list.push(copy); else list[idx] = copy; }
    else if (idx !== -1) list.splice(idx, 1);
  });
  return out;
}
function requestConflicts(info) {
  st.awaiting = Object.assign({ type: 'conflicts' }, info);
  if (window.CloudSync && CloudSync.ui) setTimeout(() => CloudSync.ui.showAwaiting(), 0);
  return { status: 'awaiting', type: 'conflicts' };
}

/* ---------- things that need the user's yes (G2, G3) ---------- */
function readBulk() { try { return JSON.parse(lsGet(K.bulk) || 'null'); } catch (e) { return null; } }
function clearBulk() { lsDel(K.bulk); approvals.bulk = null; }
function markBulk(kind) {
  if (!isEnabled()) return;            // sync off: nothing to protect, nothing to record
  lsSet(K.bulk, JSON.stringify({ kind, at: new Date().toISOString() }));
  approvals.bulk = null;
}
function requestBulk(bulk) {
  st.awaiting = { type: 'bulk', kind: bulk.kind };
  if (window.CloudSync && CloudSync.ui) setTimeout(() => CloudSync.ui.showAwaiting(), 0);
  return { status: 'awaiting', type: 'bulk' };
}
function requestMassDelete(info) {
  st.awaiting = Object.assign({ type: 'massdelete' }, info);
  if (window.CloudSync && CloudSync.ui) setTimeout(() => CloudSync.ui.showAwaiting(), 0);
  return { status: 'awaiting', type: 'massdelete' };
}
function resolveAwaiting(choice) {
  const a = st.awaiting;
  st.awaiting = null;
  if (!a) return;
  if (a.type === 'bulk') approvals.bulk = choice;              // 'keep-local' | 'use-cloud' | 'later'
  if (a.type === 'massdelete') { if (choice === 'apply') approvals.merge = a.cloudVersion; else { setPhase('paused'); return; } }
  if (choice === 'later') { setPhase('paused'); return; }
  syncOnce('confirmed');
}
// G7's resolution isn't a single choice — it's one action per contested
// record/split bill — so it gets its own entry point instead of overloading
// resolveAwaiting(). `map` is keyed by conflictKey(pair), e.g. "records:id".
function resolveConflicts(map) {
  const a = st.awaiting;
  if (!a || a.type !== 'conflicts') return Promise.resolve({ status: 'noop' });
  approvals.conflicts = { cloudVersion: a.cloudVersion, map: map };
  st.awaiting = null;
  return syncOnce('confirmed');
}

/* ============================================================
   TRIGGERS
   ============================================================ */
function notify() {
  if (!active || applying) return;
  const now = Date.now();
  if (!dirtySince) dirtySince = now;
  clearTimeout(debounceTimer);
  const wait = Math.max(0, Math.min(CFG.DEBOUNCE_MS, dirtySince + CFG.MAX_WAIT_MS - now));
  debounceTimer = setTimeout(() => { dirtySince = 0; debounceTimer = null; syncOnce('edit'); }, wait);
}
function onVisible() {
  if (typeof document !== 'undefined' && document.visibilityState === 'visible' && Date.now() - lastFinished > 5000) syncOnce('visible');
}
function onOnline() { syncOnce('online'); }
function activate() {
  if (active) return;
  active = true;
  document.addEventListener('visibilitychange', onVisible);
  window.addEventListener('online', onOnline);
}
function deactivate() {
  active = false;
  clearTimeout(debounceTimer); debounceTimer = null; dirtySince = 0;
  if (awaitObserver) { awaitObserver.disconnect(); awaitObserver = null; }
  try { document.removeEventListener('visibilitychange', onVisible); window.removeEventListener('online', onOnline); } catch (e) { /* ignore */ }
}

/* ============================================================
   ENABLE / LOGIN / DISABLE (the UI drives these; they are also what the tests drive)
   ============================================================ */
let wiz = null;   // wizard state: { secretBytes, code, keys, create, remote, remoteJson, remoteVersion }

async function prepareCreate() {
  if (!supported()) throw new SyncError('unsupported');
  if (hasLocalPin()) throw new SyncError('pin');
  await snapshot(K.backup, K.backupTime);                                    // N1-3: no backup, no sync
  const secretBytes = crypto.getRandomValues(new Uint8Array(16));
  wiz = { secretBytes, code: encodeSecret(secretBytes), create: true, keys: await deriveKeys(secretBytes) };
  return { code: wiz.code };
}

async function prepareLogin(codeInput) {
  if (!supported()) throw new SyncError('unsupported');
  if (hasLocalPin()) throw new SyncError('pin');
  const d = decodeSecret(codeInput);
  if (!d.ok) throw new SyncError('badcode', d.reason);
  await snapshot(K.backup, K.backupTime);
  wiz = { secretBytes: d.bytes, code: encodeSecret(d.bytes), create: false, keys: await deriveKeys(d.bytes) };
}

// Talks to the cloud for the wizard. Resolves one of:
//   { kind:'created' }                  new cloud ledger made, sync is on
//   { kind:'restored' }                 this device was empty: took the cloud's copy, sync is on
//   { kind:'confirm', summary }         both sides have data: waiting for the user's yes
//   { kind:'notfound' } | { kind:'invite' }
async function establish(invite) {
  if (!wiz) throw new SyncError('internal', 'no wizard');
  return notBusy(await withLock(async () => {
    const keys = wiz.keys, local = DataStore._data;
    const pull = await rpc('ledger_pull', { p_auth_key: keys.authHex, p_known_version: null });
    if (pull.status === 'none') {
      if (!wiz.create) return { kind: 'notfound' };
      const { res, json } = await pushLedger(keys, local, 0, invite);
      if (res.status === 'invite_required' || res.status === 'invite_invalid') return { kind: 'invite', why: res.status };
      if (res.status === 'conflict') return establishExisting(keys, local, await rpc('ledger_pull', { p_auth_key: keys.authHex, p_known_version: null }));
      if (res.status !== 'ok') throw pushError(res);
      await enableWith(local, json, res.version);
      return { kind: 'created' };
    }
    if (pull.status !== 'ok') throw new SyncError('server', 'pull ' + pull.status);
    return establishExisting(keys, local, pull);
  }));
}
// withLock answers { status:'busy' } when another sync round holds the lock
function notBusy(out) { if (out && out.status === 'busy') throw new SyncError('busy'); return out; }
async function establishExisting(keys, local, pull) {
  const remoteJson = await openLedger(pull.blob, keys, pull.version);       // wrong code / damaged => 'decrypt'
  const parsed = parseRemote(remoteJson);
  wiz.remote = parsed.ledger; wiz.remoteJson = remoteJson; wiz.remoteVersion = pull.version; wiz.dropped = parsed.dropped;
  if (isPristine(local)) {                                                     // a fresh device: nothing here to lose
    applyToLocal(parsed.ledger);
    await enableWith(parsed.ledger, remoteJson, pull.version);
    return { kind: 'restored' };
  }
  const merge = DataStore._mergeData(parsed.ledger, { base: null, dryRun: true });
  wiz.merge = merge;
  return { kind: 'confirm', summary: { local: counts(local), cloud: counts(parsed.ledger), merged: counts(merge.data), conflicts: merge.conflicts.length } };
}
// The user said yes to the first merge: union (nothing is deleted), then push it.
async function confirmFirstMerge() {
  if (!wiz || !wiz.merge) throw new SyncError('internal', 'nothing to confirm');
  return notBusy(await withLock(async () => {
    const keys = wiz.keys, merged = wiz.merge.data;
    await snapshot(K.premerge, K.premergeTime);
    if (DataStore._canonStringify(merged) !== DataStore._canonStringify(DataStore._data)) applyToLocal(merged);
    addConflicts(wiz.merge.conflicts);
    if (await contentHash(merged) === await contentHash(wiz.remote)) {
      await enableWith(wiz.remote, wiz.remoteJson, wiz.remoteVersion);
      return { kind: 'merged' };
    }
    const { res, json } = await pushLedger(keys, merged, wiz.remoteVersion);
    if (res.status === 'conflict') { wiz.needRetry = true; return { kind: 'retry' }; }
    if (res.status !== 'ok') throw pushError(res);
    await enableWith(merged, json, res.version);
    return { kind: 'merged' };
  }));
}
async function enableWith(ledger, json, version) {
  const wrote = [];
  try {
    if (!lsSet(K.secret, wiz.code)) throw new SyncError('quota', 'secret');
    wrote.push(K.secret);
    meta = { state: 'enabled', keyHash: wiz.keys.keyHashHex, version: 0, baseHash: '', baseRecords: 0,
      lastSyncAt: null, lastError: null, enabledAt: new Date().toISOString() };
    await commitSynced(ledger, json, version);
  } catch (e) {
    meta = null; wrote.forEach(lsDel); lsDel(K.base); lsDel(K.meta);
    throw e;
  }
  keyCache = { code: wiz.code, keys: wiz.keys };
  wiz = null;
  activate();
  setPhase('ok');
  refreshUI();
}

function disable() {
  deactivate();
  Object.keys(K).forEach(k => lsDel(K[k]));
  meta = null; keyCache = null; wiz = null;
  st.phase = 'idle'; st.error = null; st.awaiting = null;
  approvals.merge = null; approvals.empty = false; approvals.bulk = null; approvals.conflicts = null;
  renderPill(); refreshCard();
}
async function deleteCloudCopy() {
  const keys = await getKeys();
  const res = await rpc('ledger_delete', { p_auth_key: keys.authHex });
  if (res.status !== 'ok' && res.status !== 'none') throw new SyncError('server', 'delete ' + res.status);
  disable();
  return res;
}

async function listHistory() {
  const keys = await getKeys();
  const res = await rpc('ledger_history', { p_auth_key: keys.authHex });
  if (res.status === 'none') return [];
  if (res.status !== 'ok') throw new SyncError('server', 'history ' + res.status);
  return res.versions;
}
// Decrypts one retained cloud version back into plain ledger JSON (for export -> import).
async function fetchVersionJson(version) {
  const keys = await getKeys();
  const res = await rpc('ledger_fetch', { p_auth_key: keys.authHex, p_version: version });
  if (res.status !== 'ok') throw new SyncError('server', 'fetch ' + res.status);
  return openLedger(res.blob, keys, version);
}

/* ============================================================
   UI — everything below only ever runs after the user opens the settings card or
   sync is already on. With sync off, the ONLY thing on screen is that one card.
   ============================================================ */
function fmtTime(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d)) return '—';
  const p = n => String(n).padStart(2, '0');
  const t = p(d.getHours()) + ':' + p(d.getMinutes());
  return d.toDateString() === new Date().toDateString() ? t : p(d.getMonth() + 1) + '-' + p(d.getDate()) + ' ' + t;
}
function errText(code, detail) {
  // A finer message when one exists (e.g. badcode.length), else the general one for the code
  const specific = detail ? __('cloud.err.' + code + '.' + detail) : '??';
  if (specific.indexOf('??') !== 0) return specific;
  const t = __('cloud.err.' + code);
  return t.indexOf('??') === 0 ? __('cloud.err.other', code) : t;
}
function statusInfo() {
  const map = {
    syncing:  { cls: 'busy',  text: __('cloud.status.syncing') },
    ok:       { cls: 'ok',    text: __('cloud.status.ok', fmtTime(meta && meta.lastSyncAt)) },
    error:    { cls: 'bad',   text: __('cloud.status.error') },
    offline:  { cls: 'bad',   text: __('cloud.status.offline') },
    paused:   { cls: 'warn',  text: __('cloud.status.paused') },
    awaiting: { cls: 'warn',  text: __('cloud.status.awaiting') },
    idle:     { cls: 'idle',  text: meta && meta.lastSyncAt ? __('cloud.status.ok', fmtTime(meta.lastSyncAt)) : __('cloud.status.idle') }
  };
  return map[st.phase] || map.idle;
}

function renderPill() {
  let el = document.getElementById('cloudSyncPill');
  if (!isEnabled()) { if (el) el.remove(); return; }
  if (!el) {
    const header = document.getElementById('topHeader');
    if (!header) return;
    el = document.createElement('button');
    el.id = 'cloudSyncPill';
    el.type = 'button';
    el.onclick = () => { if (st.awaiting) ui.showAwaiting(); else if (typeof navigateTo === 'function') navigateTo('settings'); };
    // Just before the guide button: margin-left:auto then keeps it hugging the right edge
    header.insertBefore(el, header.querySelector('.guide-btn'));
  }
  const s = statusInfo();
  el.className = 'cloud-pill cloud-pill-' + s.cls;
  el.textContent = '☁️ ' + s.text;
  el.title = st.error ? errText(st.error.code) : __('cloud.title');
}

function refreshCard() {
  const el = document.getElementById('cloudSyncCard');
  if (el && !ui._busy) el.innerHTML = renderCardBody();
}

function renderCard() { return '<div class="card mb-16" id="cloudSyncCard">' + renderCardBody() + '</div>'; }

function renderCardBody() {
  const title = '<div class="card-title">☁️ ' + __('cloud.title') + '</div>';
  if (!isEnabled()) {
    if (hasLocalPin()) return title + '<div class="text-sm text-secondary">' + __('cloud.pinBlocked') + '</div>';
    return title +
      '<div class="text-sm text-secondary" style="margin-bottom:10px;line-height:1.5">' + __('cloud.intro') + '</div>' +
      '<div class="flex flex-col gap-8">' +
        '<button class="btn btn-primary btn-block" onclick="CloudSync.ui.openEnable()">☁️ ' + __('cloud.enable') + '</button>' +
        '<button class="btn btn-outline btn-block" onclick="CloudSync.ui.openLogin()">🔑 ' + __('cloud.login') + '</button>' +
      '</div>';
  }
  const s = statusInfo();
  const conflicts = getConflicts();
  return title +
    '<div class="cloud-status cloud-status-' + s.cls + '"><span class="cloud-dot"></span><span>' + escHtml(s.text) + '</span></div>' +
    (st.error ? '<div class="text-xs" style="color:var(--danger);margin:6px 0">' + escHtml(errText(st.error.code)) +
      (st.error.detail ? ' <span class="text-muted">(' + escHtml(String(st.error.detail).slice(0, 80)) + ')</span>' : '') + '</div>' : '') +
    (st.awaiting ? '<button class="btn btn-sm btn-primary" style="margin:6px 0" onclick="CloudSync.ui.showAwaiting()">⚠️ ' + __('cloud.needsYou') + '</button>' : '') +
    '<div class="text-xs text-muted" style="margin:6px 0 10px">' + __('cloud.lastSync', fmtTime(meta.lastSyncAt), meta.version) + '</div>' +
    '<div class="flex gap-8" style="flex-wrap:wrap;margin-bottom:10px">' +
      '<button class="btn btn-primary btn-sm" onclick="CloudSync.ui.syncNow()">🔄 ' + __('cloud.syncNow') + '</button>' +
      '<button class="btn btn-outline btn-sm" onclick="CloudSync.ui.showCode()">🔑 ' + __('cloud.showCode') + '</button>' +
      '<button class="btn btn-outline btn-sm" onclick="CloudSync.ui.openHistory()">🕘 ' + __('cloud.history') + '</button>' +
    '</div>' +
    '<div id="cloudCodeBox"></div>' +
    '<div id="cloudHistoryBox"></div>' +
    (conflicts.length ? '<details class="cloud-conflicts"><summary>' + __('cloud.conflicts', conflicts.length) + '</summary>' +
      '<div class="text-xs text-muted" style="margin:6px 0">' + __('cloud.conflictsHint') + '</div>' +
      conflicts.map(c => '<div class="cloud-conflict-row"><b>' + escHtml(conflictKind(c.kind)) + '</b> ' + escHtml(c.label || c.path) +
        ' <span class="text-muted">· ' + escHtml(c.local) + ' ⇄ ' + escHtml(c.remote) + ' · ' + escHtml(fmtTime(c.at)) + '</span></div>').join('') +
      '<button class="btn btn-ghost btn-sm" onclick="CloudSync.ui.clearConflicts()">' + __('cloud.conflictsClear') + '</button></details>' : '') +
    '<div class="text-xs text-muted" style="margin:10px 0 6px">' + __('cloud.snapshots') + '</div>' +
    '<div class="flex gap-8" style="flex-wrap:wrap;margin-bottom:10px">' +
      (lsGet(K.backup) ? '<button class="btn btn-ghost btn-sm" onclick="CloudSync.ui.exportSnapshot(\'backup\')">📥 ' + __('cloud.exportBackup', fmtTime(lsGet(K.backupTime))) + '</button>' : '') +
      (lsGet(K.premerge) ? '<button class="btn btn-ghost btn-sm" onclick="CloudSync.ui.exportSnapshot(\'premerge\')">📥 ' + __('cloud.exportPremerge', fmtTime(lsGet(K.premergeTime))) + '</button>' : '') +
    '</div>' +
    '<div class="flex gap-8" style="flex-wrap:wrap;padding-top:10px;border-top:1px solid var(--border)">' +
      '<button class="btn btn-ghost btn-sm" onclick="CloudSync.ui.confirmDisable()">⏻ ' + __('cloud.disable') + '</button>' +
      '<button class="btn btn-ghost btn-sm" style="color:var(--danger)" onclick="CloudSync.ui.confirmDeleteCloud()">🗑️ ' + __('cloud.deleteCloud') + '</button>' +
    '</div>';
}
function conflictKind(k) {
  const t = __('cloud.conflictKind.' + k);
  return t.indexOf('??') === 0 ? k : t;
}

const ui = {
  _busy: false,
  // `wide` widens #modalContent for the one modal that needs the room (the
  // conflict resolver); every other call implicitly narrows it back, so the
  // class never leaks onto an unrelated modal shown afterwards.
  _modal(html, dismissable, wide) {
    const content = document.getElementById('modalContent');
    if (content) content.classList.toggle('modal-wide', !!wide);
    showModal(html, dismissable !== false);
  },
  _err(code, detail) { return '<div class="cloud-error">' + escHtml(errText(code, detail)) + (detail && code !== 'badcode' ? ' <span class="text-muted">(' + escHtml(String(detail).slice(0, 100)) + ')</span>' : '') + '</div>'; },
  _progress(msg) { const b = document.getElementById('cloudWizBody'); if (b) b.innerHTML = '<div class="text-sm" style="padding:16px 0">⏳ ' + escHtml(msg) + '</div>'; },

  /* ---- enable: new cloud ledger ---- */
  openEnable() {
    if (!supported()) { showToast(__('cloud.err.unsupported'), 'error'); return; }
    if (hasLocalPin()) { showToast(__('cloud.pinBlocked'), 'warning'); return; }
    ui._modal(
      '<div class="modal-title">☁️ ' + __('cloud.enableTitle') + '</div>' +
      '<div id="cloudWizBody"><ul class="cloud-points">' +
        '<li>' + __('cloud.enable.p1') + '</li><li>' + __('cloud.enable.p2') + '</li>' +
        '<li>' + __('cloud.enable.p3') + '</li><li>' + __('cloud.enable.p4') + '</li></ul></div>' +
      '<div class="modal-actions"><button class="btn btn-ghost" onclick="closeModal()">' + __('cloud.cancel') + '</button>' +
      '<button class="btn btn-primary" onclick="CloudSync.ui.enableStep2()">' + __('cloud.continue') + '</button></div>');
  },
  async enableStep2() {
    ui._busy = true; ui._progress(__('cloud.backingUp'));
    try {
      const { code } = await prepareCreate();
      document.getElementById('cloudWizBody').innerHTML =
        '<div class="text-sm" style="margin-bottom:8px">' + __('cloud.code.title') + '</div>' +
        '<div class="cloud-code" id="cloudWizCode">' + escHtml(code) + '</div>' +
        '<button class="btn btn-outline btn-sm" style="margin:8px 0" onclick="CloudSync.ui.copyCode()">📋 ' + __('cloud.code.copy') + '</button>' +
        '<div class="text-xs" style="color:var(--danger);margin-bottom:10px;line-height:1.5">' + __('cloud.code.warn') + '</div>' +
        '<label class="text-sm" style="display:flex;gap:8px;align-items:flex-start;margin-bottom:10px">' +
          '<input type="checkbox" id="cloudWizSaved" onchange="CloudSync.ui.enableCheck()"> <span>' + __('cloud.code.saved') + '</span></label>' +
        '<div class="input-group"><label class="input-label">' + __('cloud.invite.label') + '</label>' +
          '<input type="text" id="cloudWizInvite" class="input-field" autocomplete="off" autocapitalize="off" spellcheck="false" oninput="CloudSync.ui.enableCheck()"></div>' +
        '<div id="cloudWizMsg"></div>';
      const actions = document.querySelector('#modalContent .modal-actions');
      if (actions) actions.innerHTML = '<button class="btn btn-ghost" onclick="CloudSync.ui.cancelWizard()">' + __('cloud.cancel') + '</button>' +
        '<button class="btn btn-primary" id="cloudWizGo" disabled onclick="CloudSync.ui.enableGo()">' + __('cloud.enableGo') + '</button>';
    } catch (e) {
      document.getElementById('cloudWizBody').innerHTML = ui._err(e.code || 'internal', e.detail || e.message);
    } finally { ui._busy = false; }
  },
  enableCheck() {
    const ok = document.getElementById('cloudWizSaved').checked && document.getElementById('cloudWizInvite').value.trim().length >= 8;
    document.getElementById('cloudWizGo').disabled = !ok;
  },
  async enableGo() {
    const invite = document.getElementById('cloudWizInvite').value.trim();
    const btn = document.getElementById('cloudWizGo'); if (btn) btn.disabled = true;
    ui._busy = true;
    const msg = document.getElementById('cloudWizMsg'); if (msg) msg.innerHTML = '<div class="text-sm">⏳ ' + __('cloud.working') + '</div>';
    try {
      const r = await establish(invite);
      if (r.kind === 'invite') { if (msg) msg.innerHTML = ui._err('invite_' + (r.why === 'invite_required' ? 'required' : 'invalid')); if (btn) btn.disabled = false; return; }
      if (r.kind === 'created') { closeModal(); showToast('✅ ' + __('cloud.enabledOk')); renderIfSettings(); return; }
      if (r.kind === 'restored' || r.kind === 'confirm') { ui._afterEstablish(r); return; }
    } catch (e) {
      if (msg) msg.innerHTML = ui._err(e.code || 'internal', e.detail || e.message) + '<div class="text-xs text-muted" style="margin-top:6px">' + __('cloud.enableRetryHint') + '</div>';
      if (btn) btn.disabled = false;
    } finally { ui._busy = false; }
  },
  copyCode() {
    const code = (wiz && wiz.code) || lsGet(K.secret) || '';
    const done = () => showToast(__('cloud.code.copied'));
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(code).then(done, () => ui._selectCode());
    else ui._selectCode();
  },
  _selectCode() {
    const el = document.getElementById('cloudWizCode') || document.getElementById('cloudShownCode');
    if (!el) return;
    try { const r = document.createRange(); r.selectNodeContents(el); const s = window.getSelection(); s.removeAllRanges(); s.addRange(r); document.execCommand('copy'); } catch (e) { /* user can copy by hand */ }
    showToast(__('cloud.code.selected'));
  },
  cancelWizard() { wiz = null; closeModal(); },

  /* ---- login: paste an existing recovery code ---- */
  openLogin() {
    if (!supported()) { showToast(__('cloud.err.unsupported'), 'error'); return; }
    if (hasLocalPin()) { showToast(__('cloud.pinBlocked'), 'warning'); return; }
    ui._modal(
      '<div class="modal-title">🔑 ' + __('cloud.loginTitle') + '</div>' +
      '<div id="cloudWizBody"><div class="text-sm text-secondary" style="margin-bottom:10px;line-height:1.5">' + __('cloud.login.desc') + '</div>' +
        '<div class="input-group"><input type="text" id="cloudLoginCode" class="input-field" placeholder="XXXX-XXXX-XXXX-XXXX-XXXX-XXXX-XXXX" ' +
          'autocomplete="off" autocapitalize="characters" spellcheck="false" oninput="CloudSync.ui.loginCheck()"></div>' +
        '<div id="cloudWizMsg"></div></div>' +
      '<div class="modal-actions"><button class="btn btn-ghost" onclick="CloudSync.ui.cancelWizard()">' + __('cloud.cancel') + '</button>' +
      '<button class="btn btn-primary" id="cloudWizGo" disabled onclick="CloudSync.ui.loginGo()">' + __('cloud.continue') + '</button></div>');
  },
  loginCheck() {
    const v = document.getElementById('cloudLoginCode').value;
    const msg = document.getElementById('cloudWizMsg'), go = document.getElementById('cloudWizGo');
    const d = decodeSecret(v);
    // Complain as soon as a full-length code is wrong; stay quiet while it is still being typed
    const full = v.replace(/[\s\-_]/g, '').length >= 28;
    msg.innerHTML = (!d.ok && full) ? ui._err('badcode', d.reason) : '';
    go.disabled = !d.ok;
  },
  async loginGo() {
    const v = document.getElementById('cloudLoginCode').value;
    const btn = document.getElementById('cloudWizGo'); btn.disabled = true;
    const msg = document.getElementById('cloudWizMsg');
    ui._busy = true; msg.innerHTML = '<div class="text-sm">⏳ ' + __('cloud.working') + '</div>';
    try {
      await prepareLogin(v);
      const r = await establish(null);
      if (r.kind === 'notfound') { msg.innerHTML = ui._err('notfound'); btn.disabled = false; return; }
      ui._afterEstablish(r);
    } catch (e) {
      msg.innerHTML = ui._err(e.code || 'internal', e.detail || e.message); btn.disabled = false;
    } finally { ui._busy = false; }
  },
  _afterEstablish(r) {
    if (r.kind === 'restored') { closeModal(); showToast('✅ ' + __('cloud.restoredOk')); renderIfSettings(); return; }
    if (r.kind === 'confirm') {
      const s = r.summary;
      ui._modal(
        '<div class="modal-title">🔀 ' + __('cloud.merge.title') + '</div>' +
        '<div id="cloudWizBody"><div class="text-sm text-secondary" style="margin-bottom:10px;line-height:1.5">' + __('cloud.merge.desc') + '</div>' +
          '<div class="cloud-summary">' +
            '<div><span>' + __('cloud.merge.local') + '</span><b>' + __('cloud.merge.counts', s.local.records, s.local.bills) + '</b></div>' +
            '<div><span>' + __('cloud.merge.cloud') + '</span><b>' + __('cloud.merge.counts', s.cloud.records, s.cloud.bills) + '</b></div>' +
            '<div><span>' + __('cloud.merge.result') + '</span><b>' + __('cloud.merge.counts', s.merged.records, s.merged.bills) + '</b></div>' +
          '</div>' +
          (s.conflicts ? '<div class="text-xs text-muted" style="margin-top:8px">' + __('cloud.merge.conflicts', s.conflicts) + '</div>' : '') +
          '<div id="cloudWizMsg"></div></div>' +
        '<div class="modal-actions"><button class="btn btn-ghost" onclick="CloudSync.ui.cancelWizard()">' + __('cloud.cancel') + '</button>' +
        '<button class="btn btn-primary" id="cloudWizGo" onclick="CloudSync.ui.mergeGo()">' + __('cloud.merge.go') + '</button></div>', false);
    }
  },
  async mergeGo() {
    const btn = document.getElementById('cloudWizGo'); btn.disabled = true;
    const msg = document.getElementById('cloudWizMsg');
    ui._busy = true; msg.innerHTML = '<div class="text-sm">⏳ ' + __('cloud.working') + '</div>';
    try {
      const r = await confirmFirstMerge();
      if (r.kind === 'retry') { msg.innerHTML = ui._err('busy'); btn.disabled = false; return; }
      closeModal(); showToast('✅ ' + __('cloud.mergedOk')); renderIfSettings();
    } catch (e) {
      msg.innerHTML = ui._err(e.code || 'internal', e.detail || e.message); btn.disabled = false;
    } finally { ui._busy = false; }
  },

  /* ---- everyday ---- */
  async syncNow() {
    if (st.phase === 'error' && st.error && st.error.code === 'emptyguard') approvals.empty = true;
    if (readBulk() && approvals.bulk === 'later') approvals.bulk = null;   // "not now" earlier: ask again
    showToast(__('cloud.syncing'));
    const r = await syncOnce('manual');
    if (r.status === 'ok') showToast('✅ ' + __('cloud.syncedOk'));
    else if (r.status === 'error') showToast(errText(r.code), 'error');
    else if (r.status === 'paused') showToast(__('cloud.status.paused'), 'warning');
  },
  showCode() {
    const box = document.getElementById('cloudCodeBox');
    if (!box) return;
    if (box.innerHTML) { box.innerHTML = ''; return; }
    box.innerHTML = '<div class="cloud-code" id="cloudShownCode">' + escHtml(lsGet(K.secret) || '') + '</div>' +
      '<div class="flex gap-8" style="margin:8px 0"><button class="btn btn-outline btn-sm" onclick="CloudSync.ui.copyCode()">📋 ' + __('cloud.code.copy') + '</button></div>' +
      '<div class="text-xs text-muted" style="margin-bottom:10px;line-height:1.5">' + __('cloud.code.keepSafe') + '</div>';
  },
  async openHistory() {
    const box = document.getElementById('cloudHistoryBox');
    if (!box) return;
    box.innerHTML = '<div class="text-sm">⏳ ' + __('cloud.working') + '</div>';
    try {
      const list = await listHistory();
      box.innerHTML = '<div class="text-xs text-muted" style="margin:6px 0">' + __('cloud.history.hint') + '</div>' +
        (list.length ? list.map(v => '<div class="cloud-history-row"><span>v' + v.version + ' · ' + escHtml(fmtTime(v.at)) + '</span>' +
          '<button class="btn btn-ghost btn-sm" onclick="CloudSync.ui.exportVersion(' + v.version + ')">📥 ' + __('cloud.history.export') + '</button></div>').join('')
          : '<div class="text-sm text-muted">' + __('cloud.history.none') + '</div>');
    } catch (e) { box.innerHTML = ui._err(e.code || 'internal', e.detail || e.message); }
  },
  async exportVersion(v) {
    try {
      const json = await fetchVersionJson(v);
      ui._download(json, 'budget-cloud-v' + v + '-' + new Date().toISOString().slice(0, 10) + '.json');
      showToast('✅ ' + __('cloud.history.exported'));
    } catch (e) { showToast(errText(e.code || 'internal'), 'error'); }
  },
  async exportSnapshot(which) {
    try {
      const json = await unpackSnapshot(lsGet(which === 'backup' ? K.backup : K.premerge));
      if (!json) throw new SyncError('internal', 'empty');
      ui._download(json, 'budget-' + (which === 'backup' ? 'before-sync' : 'before-merge') + '-' + new Date().toISOString().slice(0, 10) + '.json');
      showToast('✅ ' + __('cloud.history.exported'));
    } catch (e) { showToast(errText(e.code || 'internal'), 'error'); }
  },
  _download(text, name) {
    const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
    const a = document.createElement('a'); a.href = url; a.download = name; a.click(); URL.revokeObjectURL(url);
  },
  clearConflicts() { lsDel(K.conflicts); refreshCard(); },

  /* ---- turning it off ---- */
  confirmDisable() {
    ui._modal('<div class="modal-title">⏻ ' + __('cloud.disable') + '</div>' +
      '<p class="text-sm text-secondary" style="line-height:1.5;margin-bottom:12px">' + __('cloud.disable.desc') + '</p>' +
      '<div class="cloud-code" style="margin-bottom:12px">' + escHtml(lsGet(K.secret) || '') + '</div>' +
      '<div class="modal-actions"><button class="btn btn-ghost" onclick="closeModal()">' + __('cloud.cancel') + '</button>' +
      '<button class="btn btn-primary" onclick="CloudSync.ui.doDisable()">' + __('cloud.disable.go') + '</button></div>');
  },
  doDisable() { disable(); closeModal(); showToast(__('cloud.disabledOk')); renderIfSettings(); },
  confirmDeleteCloud() {
    ui._modal('<div class="modal-title">🗑️ ' + __('cloud.deleteCloud') + '</div>' +
      '<p class="text-sm" style="color:var(--danger);line-height:1.5;margin-bottom:12px">' + __('cloud.delete.desc') + '</p>' +
      '<div class="input-group"><label class="input-label">' + __('cloud.delete.type') + '</label>' +
      '<input type="text" id="cloudDeleteWord" class="input-field" autocomplete="off" oninput="document.getElementById(\'cloudDeleteGo\').disabled = this.value.trim() !== \'' + __('cloud.delete.word') + '\'"></div>' +
      '<div id="cloudWizMsg"></div>' +
      '<div class="modal-actions"><button class="btn btn-ghost" onclick="closeModal()">' + __('cloud.cancel') + '</button>' +
      '<button class="btn btn-danger" id="cloudDeleteGo" disabled onclick="CloudSync.ui.doDeleteCloud()">' + __('cloud.deleteCloud') + '</button></div>');
  },
  async doDeleteCloud() {
    const btn = document.getElementById('cloudDeleteGo'); btn.disabled = true;
    try { await deleteCloudCopy(); closeModal(); showToast(__('cloud.deletedOk')); renderIfSettings(); }
    catch (e) { document.getElementById('cloudWizMsg').innerHTML = ui._err(e.code || 'internal', e.detail || e.message); btn.disabled = false; }
  },

  /* ---- confirmations raised by a background sync (G2 / G3) ---- */
  // If some other modal is already open, showing this one over it would either fight
  // the user's typing or get shown for a split second and closed with it. Wait instead:
  // watch modalOverlay and try again the moment it closes, however that happens. The
  // approval itself (st.awaiting) already survives until resolved, so nothing is lost
  // in the meantime — the user just doesn't see the prompt yet.
  showAwaiting() {
    const a = st.awaiting;
    if (!a) return;
    const overlay = document.getElementById('modalOverlay');
    if (overlay && overlay.classList.contains('open')) {
      if (!awaitObserver) {
        awaitObserver = new MutationObserver(() => {
          if (overlay.classList.contains('open')) return;
          awaitObserver.disconnect();
          awaitObserver = null;
          if (st.awaiting) ui.showAwaiting();
        });
        awaitObserver.observe(overlay, { attributes: true, attributeFilter: ['class'] });
      }
      return;
    }
    if (awaitObserver) { awaitObserver.disconnect(); awaitObserver = null; }
    if (a.type === 'bulk') {
      ui._modal('<div class="modal-title">⚠️ ' + __('cloud.bulk.title') + '</div>' +
        '<p class="text-sm text-secondary" style="line-height:1.5;margin-bottom:12px">' + __('cloud.bulk.desc.' + a.kind) + '</p>' +
        '<div class="flex flex-col gap-8">' +
          '<button class="btn btn-primary btn-block" onclick="CloudSync.ui.resolve(\'keep-local\')">' + __('cloud.bulk.keepLocal') + '</button>' +
          '<button class="btn btn-outline btn-block" onclick="CloudSync.ui.resolve(\'use-cloud\')">' + __('cloud.bulk.useCloud') + '</button>' +
          '<button class="btn btn-ghost btn-block" onclick="CloudSync.ui.resolve(\'later\')">' + __('cloud.bulk.later') + '</button></div>', false);
    } else if (a.type === 'massdelete') {
      ui._modal('<div class="modal-title">⚠️ ' + __('cloud.mass.title') + '</div>' +
        '<p class="text-sm text-secondary" style="line-height:1.5;margin-bottom:12px">' + __('cloud.mass.desc', a.removed, a.total) + '</p>' +
        ui._sampleList(a.sample, a.removed) +
        '<div class="modal-actions"><button class="btn btn-ghost" onclick="CloudSync.ui.resolve(\'later\')">' + __('cloud.mass.skip') + '</button>' +
        '<button class="btn btn-danger" onclick="CloudSync.ui.resolve(\'apply\')">' + __('cloud.mass.apply') + '</button></div>', false);
    } else if (a.type === 'conflicts') {
      ui._conflictModal(a);
    }
  },
  // A short, human-readable list of the records a mass-delete prompt is actually about,
  // so the choice isn't made blind on a bare count. Best-effort: absent/malformed fields
  // fall back to placeholders rather than breaking the modal.
  _sampleList(sample, totalRemoved) {
    if (!sample || !sample.length) return '';
    const rows = sample.map(r => {
      const cat = (r && r.categoryId && typeof DataStore.getCategory === 'function') ? DataStore.getCategory(r.categoryId) : null;
      const date = (r && (r.date || r.createdAt) || '').slice(0, 10) || '—';
      const amount = (r && typeof r.amount === 'number' && typeof formatMoney === 'function') ? formatMoney(r.amount) : '—';
      const label = (cat && cat.name) || __('cloud.mass.uncategorized');
      const note = r && r.note ? ' · ' + escHtml(String(r.note).slice(0, 30)) : '';
      return '<li>' + escHtml(date) + ' · ' + escHtml(amount) + ' · ' + escHtml(label) + note + '</li>';
    }).join('');
    const more = (typeof totalRemoved === 'number' && totalRemoved > sample.length)
      ? '<div class="text-xs text-muted" style="margin:-6px 0 12px">' + __('cloud.mass.more', totalRemoved - sample.length) + '</div>' : '';
    return '<div class="text-xs text-muted" style="margin-bottom:4px">' + __('cloud.mass.sampleHeader') + '</div>' +
      '<ul class="text-xs text-secondary" style="margin:0 0 8px;padding-left:18px;line-height:1.6">' + rows + '</ul>' + more;
  },
  resolve(choice) { closeModal(); resolveAwaiting(choice); },

  /* ---- G7: pick a side per contested record/split bill (see runSync()) ---- */
  // A short read-only summary of one full record or split bill, for the two
  // "what does each side have" columns. Best-effort formatting only.
  _entityHtml(coll, item) {
    if (!item) return '';
    const upd = item.updatedAt || item.createdAt || '';
    const stamp = upd ? '<div class="text-muted" style="font-size:0.7rem;margin-top:2px">' + escHtml(fmtTime(upd)) + '</div>' : '';
    if (coll === 'records') {
      const cat = (item.categoryId && typeof DataStore.getCategory === 'function') ? DataStore.getCategory(item.categoryId) : null;
      const date = (item.date || item.createdAt || '').slice(0, 10) || '—';
      const amount = (typeof item.amount === 'number' && typeof formatMoney === 'function') ? formatMoney(item.amount) : String(item.amount);
      const label = (cat && cat.name) || __('cloud.mass.uncategorized');
      const note = item.note ? '<div class="text-muted">' + escHtml(String(item.note)) : '';
      return '<div>' + escHtml(date) + ' · ' + escHtml(amount) + ' · ' + escHtml(label) + '</div>' + (note ? note + '</div>' : '') + stamp;
    }
    // splitBills
    const amount = (typeof item.amount === 'number' && typeof formatMoney === 'function') ? formatMoney(item.amount) : String(item.amount);
    const note = item.note ? ' · ' + escHtml(String(item.note)) : '';
    const names = Array.isArray(item.participants) ? item.participants.map(p => p && p.name).filter(Boolean).map(escHtml).join('、') : '';
    return '<div>' + escHtml(amount) + note + '</div>' + (names ? '<div class="text-muted">' + __('cloud.conflict.participants', names) + '</div>' : '') + stamp;
  },
  _conflictEditForm(p, d) {
    const base = d.value || p.local || p.remote || {};
    const amt = typeof base.amount === 'number' ? base.amount : '';
    const note = base.note ? String(base.note) : '';
    const dateVal = (base.date || base.createdAt || '').slice(0, 16);
    const idb = 'cfEdit_' + p.coll + '_' + p.id;
    return '<div class="conflict-edit-form">' +
      (p.coll === 'records' ? '<input type="datetime-local" class="input-field" id="' + idb + '_date" value="' + escHtml(dateVal) + '">' : '') +
      '<input type="number" step="0.01" class="input-field" id="' + idb + '_amount" placeholder="' + __('cloud.conflict.amount') + '" value="' + escHtml(String(amt)) + '">' +
      '<input type="text" class="input-field" id="' + idb + '_note" placeholder="' + __('cloud.conflict.note') + '" value="' + escHtml(note) + '">' +
      '<div class="flex gap-8">' +
        '<button class="btn btn-primary btn-sm" onclick="CloudSync.ui.cfSaveEdit(\'' + escHtml(conflictKey(p)) + '\')">' + __('cloud.conflict.save') + '</button>' +
        '<button class="btn btn-ghost btn-sm" onclick="CloudSync.ui.cfCancelEdit(\'' + escHtml(conflictKey(p)) + '\')">' + __('cloud.cancel') + '</button>' +
      '</div></div>';
  },
  _conflictPairRow(p, draft) {
    const key = conflictKey(p);
    const d = draft[key] || (draft[key] = { action: null, value: null, editing: false });
    const btn = (action, label) => '<button class="btn btn-sm btn-outline' + (d.action === action ? ' is-picked' : '') +
      '" onclick="CloudSync.ui.cfPick(\'' + escHtml(key) + '\',\'' + action + '\')">' + label + '</button>';
    const canNewer = !!(p.local && p.remote);   // "newer" needs a timestamp on both sides to mean anything
    const actionsHtml = (canNewer ? btn('newer', __('cloud.conflict.useNewer')) : '') +
      btn('local', __('cloud.conflict.useLocal')) + btn('remote', __('cloud.conflict.useRemote')) +
      '<button class="btn btn-sm btn-outline' + (d.action === 'edit' ? ' is-picked' : '') +
        '" onclick="CloudSync.ui.cfEdit(\'' + escHtml(key) + '\')">' + __('cloud.conflict.useEdited') + '</button>' +
      btn('defer', __('cloud.conflict.defer'));
    return '<div class="conflict-row">' +
      '<div class="conflict-col">' + (p.local
        ? '<div class="conflict-col-label">' + __('cloud.conflict.thisDevice') + '</div>' + ui._entityHtml(p.coll, p.local)
        : '<div class="conflict-col-empty">' + __('cloud.conflict.deletedHere') + '</div>') + '</div>' +
      '<div class="conflict-col">' + (p.remote
        ? '<div class="conflict-col-label">' + __('cloud.conflict.otherDevice') + '</div>' + ui._entityHtml(p.coll, p.remote)
        : '<div class="conflict-col-empty">' + __('cloud.conflict.deletedThere') + '</div>') + '</div>' +
      '<div class="conflict-actions">' + actionsHtml + (d.editing ? ui._conflictEditForm(p, d) : '') + '</div>' +
    '</div>';
  },
  _conflictSingleRow(s) {
    const label = s.side === 'local' ? __('cloud.conflict.thisDeviceOnly') : __('cloud.conflict.otherDeviceOnly');
    return '<div class="conflict-row is-single"><div class="conflict-col">' +
      '<div class="conflict-col-label">' + label + '</div>' + ui._entityHtml(s.coll, s.item) + '</div></div>';
  },
  _conflictModal(a) {
    const draft = ensureConflictDraft(a);
    const pairsHtml = (a.pairs || []).map(p => ui._conflictPairRow(p, draft)).join('');
    const singlesHtml = (a.singles || []).map(s => ui._conflictSingleRow(s)).join('');
    const allPicked = (a.pairs || []).every(p => draft[conflictKey(p)] && draft[conflictKey(p)].action);
    const html = '<div class="modal-title">⚠️ ' + __('cloud.conflict.title') + '</div>' +
      '<p class="text-sm text-secondary" style="line-height:1.5;margin-bottom:12px">' + __('cloud.conflict.desc', (a.pairs || []).length) + '</p>' +
      '<div class="conflict-list">' + pairsHtml + singlesHtml + '</div>' +
      '<div class="modal-actions">' +
        '<button class="btn btn-ghost" onclick="CloudSync.ui.cfDeferAll()">' + __('cloud.conflict.deferAll') + '</button>' +
        '<button class="btn btn-primary" id="cfConfirmBtn" ' + (allPicked ? '' : 'disabled') + ' onclick="CloudSync.ui.cfConfirm()">' + __('cloud.conflict.confirm') + '</button>' +
      '</div>';
    ui._modal(html, false, true);
  },
  cfPick(key, action) {
    const a = st.awaiting; if (!a || a.type !== 'conflicts') return;
    const draft = ensureConflictDraft(a);
    if (!draft[key]) return;
    draft[key].action = action; draft[key].value = null; draft[key].editing = false;
    ui._conflictModal(a);
  },
  cfEdit(key) {
    const a = st.awaiting; if (!a || a.type !== 'conflicts') return;
    const draft = ensureConflictDraft(a);
    if (!draft[key]) return;
    draft[key].editing = true;
    ui._conflictModal(a);
  },
  cfCancelEdit(key) {
    const a = st.awaiting; if (!a || a.type !== 'conflicts') return;
    const draft = ensureConflictDraft(a);
    if (draft[key]) draft[key].editing = false;
    ui._conflictModal(a);
  },
  cfSaveEdit(key) {
    const a = st.awaiting; if (!a || a.type !== 'conflicts') return;
    const draft = ensureConflictDraft(a);
    const p = (a.pairs || []).find(x => conflictKey(x) === key);
    if (!p || !draft[key]) return;
    const idb = 'cfEdit_' + p.coll + '_' + p.id;
    const base = clone(draft[key].value || p.local || p.remote || {});
    base.id = p.id;
    const amountEl = document.getElementById(idb + '_amount');
    const noteEl = document.getElementById(idb + '_note');
    const dateEl = document.getElementById(idb + '_date');
    if (amountEl) { const n = parseFloat(amountEl.value); if (isFinite(n)) base.amount = n; }
    if (noteEl) base.note = noteEl.value;
    if (dateEl && dateEl.value) base.date = dateEl.value;
    base.updatedAt = new Date().toISOString();
    draft[key].value = base; draft[key].action = 'edit'; draft[key].editing = false;
    ui._conflictModal(a);
  },
  cfDeferAll() {
    const a = st.awaiting; if (!a || a.type !== 'conflicts') return;
    const map = {};
    (a.pairs || []).forEach(p => { map[conflictKey(p)] = { action: 'defer' }; });
    ui._closeConflictModal();
    resolveConflicts(map);
  },
  cfConfirm() {
    const a = st.awaiting; if (!a || a.type !== 'conflicts') return;
    const draft = ensureConflictDraft(a);
    const map = {};
    for (const p of (a.pairs || [])) {
      const d = draft[conflictKey(p)];
      if (!d || !d.action) return;   // button should be disabled until every pair is picked
      map[conflictKey(p)] = d.action === 'edit' ? { action: 'edit', value: d.value } : { action: d.action };
    }
    ui._closeConflictModal();
    resolveConflicts(map);
  },
  // Narrows #modalContent back (see _modal()'s `wide` param) and clears the
  // in-progress picks so the next batch of conflicts starts with a clean draft.
  _closeConflictModal() {
    const content = document.getElementById('modalContent');
    if (content) content.classList.remove('modal-wide');
    closeModal();
    conflictDraft = null; conflictDraftFor = null;
  }
};

function renderIfSettings() {
  try { if (window.currentTab === 'settings' && typeof renderSettings === 'function') renderSettings(); } catch (e) { /* cosmetic */ }
}

/* ============================================================
   BOOT — with sync off this reads ONE key (the meta) and does nothing else.
   ============================================================ */
function boot() {
  loadMeta();
  if (!isEnabled()) return;
  activate();
  renderPill();
  setTimeout(() => { syncOnce('launch'); }, CFG.LAUNCH_DELAY_MS);
}

addI18nEntries({
  'cloud.title': { zh: '云端同步（可选）', en: 'Cloud sync (optional)' },
  'cloud.intro': { zh: '在多台设备间同步账本。默认关闭；不开启时不会发出任何网络请求。账本在本机加密后才上传，服务器只看到密文。无需注册账号——只需一串恢复码。', en: 'Keep your ledger in step across devices. Off by default — with it off, the app makes no network requests at all. The ledger is encrypted on your device before upload, so the server only sees ciphertext. No account: just one recovery code.' },
  'cloud.pinBlocked': { zh: '开启 PIN 锁时暂不支持云端同步（同步密钥会以明文放在本机，会让 PIN 形同虚设）。如需同步，请先关闭 PIN 锁。', en: 'Cloud sync is not available while a PIN lock is on (the sync key would sit on this device in plain text and defeat the PIN). Turn the PIN lock off first to use sync.' },
  'cloud.enable': { zh: '启用云端同步', en: 'Turn on cloud sync' },
  'cloud.login': { zh: '已有恢复码？登录', en: 'Have a recovery code? Log in' },
  'cloud.cancel': { zh: '取消', en: 'Cancel' },
  'cloud.continue': { zh: '继续', en: 'Continue' },
  'cloud.working': { zh: '处理中…', en: 'Working…' },
  'cloud.backingUp': { zh: '正在备份本机账本…', en: 'Backing up this device’s ledger…' },
  'cloud.enableTitle': { zh: '启用云端同步', en: 'Turn on cloud sync' },
  'cloud.enable.p1': { zh: '账本在你的设备上加密后才上传，服务器只看到密文。', en: 'Your ledger is encrypted on this device before upload; the server only sees ciphertext.' },
  'cloud.enable.p2': { zh: '加密钥匙就是一串「恢复码」。丢了它，云端那份没人能解开（包括作者）；每台设备上的本地账本不受影响。', en: 'The key is a “recovery code”. If you lose it, nobody (the author included) can decrypt the cloud copy. The ledger on each of your devices is unaffected.' },
  'cloud.enable.p3': { zh: '创建云端账本需要一个邀请码（向作者索取）。', en: 'Creating a cloud ledger needs an invite code (ask the author).' },
  'cloud.enable.p4': { zh: '开始前会先在本机自动备份一份；备份失败则不会启用，账本原样不动。', en: 'A backup of this device’s ledger is taken first. If that fails, sync is not turned on and nothing changes.' },
  'cloud.code.title': { zh: '你的恢复码', en: 'Your recovery code' },
  'cloud.code.copy': { zh: '复制恢复码', en: 'Copy recovery code' },
  'cloud.code.warn': { zh: '请立刻抄下或存进密码管理器。它只会显示在这里和「设置 → 云端同步」里。丢了它，云端副本无法找回。', en: 'Write it down or store it in a password manager now. It is shown only here and in Settings → Cloud sync. Lose it and the cloud copy cannot be recovered.' },
  'cloud.code.saved': { zh: '我已把恢复码保存到安全的地方', en: 'I have saved the recovery code somewhere safe' },
  'cloud.code.copied': { zh: '已复制恢复码', en: 'Recovery code copied' },
  'cloud.code.selected': { zh: '已选中，请手动复制', en: 'Selected — copy it manually' },
  'cloud.code.keepSafe': { zh: '换新设备时，在「登录」里粘贴这串码即可。请勿发给他人。', en: 'On a new device, paste this code under “Log in”. Do not share it.' },
  'cloud.invite.label': { zh: '邀请码', en: 'Invite code' },
  'cloud.enableGo': { zh: '启用', en: 'Turn on' },
  'cloud.enableRetryHint': { zh: '如果云端其实已经创建成功，请改用「已有恢复码？登录」粘贴上面的恢复码。', en: 'If the cloud ledger was actually created, use “Have a recovery code? Log in” and paste the code above.' },
  'cloud.enabledOk': { zh: '云端同步已启用', en: 'Cloud sync is on' },
  'cloud.loginTitle': { zh: '登录（粘贴恢复码）', en: 'Log in (paste recovery code)' },
  'cloud.login.desc': { zh: '粘贴另一台设备上的恢复码。本机数据不会被删除：如果两边都有数据，只会取并集，并先让你确认。', en: 'Paste the recovery code from your other device. Nothing on this device is deleted: if both sides have data they are only combined, and you confirm first.' },
  'cloud.restoredOk': { zh: '已从云端恢复，同步已启用', en: 'Restored from the cloud — sync is on' },
  'cloud.merge.title': { zh: '合并本机与云端', en: 'Combine this device and the cloud' },
  'cloud.merge.desc': { zh: '两边都有数据。只做「并集」：任何一边独有的记录都保留，不会删除任何东西。合并前已在本机备份。', en: 'Both sides have data. They are only combined — anything either side has is kept, nothing is deleted. A backup was taken first.' },
  'cloud.merge.local': { zh: '本机', en: 'This device' },
  'cloud.merge.cloud': { zh: '云端', en: 'Cloud' },
  'cloud.merge.result': { zh: '合并后', en: 'After combining' },
  'cloud.merge.counts': { zh: '{0} 条记录 · {1} 个分摊账单', en: '{0} records · {1} split bills' },
  'cloud.merge.conflicts': { zh: '其中 {0} 处两边改得不一样，已按规则取舍，可在设置里查看。', en: '{0} items were edited differently on both sides; they were settled by the rules and are listed in Settings.' },
  'cloud.merge.go': { zh: '合并并启用', en: 'Combine and turn on' },
  'cloud.mergedOk': { zh: '已合并，云端同步已启用', en: 'Combined — cloud sync is on' },
  'cloud.status.idle': { zh: '等待同步', en: 'Waiting to sync' },
  'cloud.status.syncing': { zh: '同步中…', en: 'Syncing…' },
  'cloud.status.ok': { zh: '已同步 {0}', en: 'Synced {0}' },
  'cloud.status.error': { zh: '同步失败', en: 'Sync failed' },
  'cloud.status.offline': { zh: '离线', en: 'Offline' },
  'cloud.status.paused': { zh: '已暂停', en: 'Paused' },
  'cloud.status.awaiting': { zh: '需要你确认', en: 'Needs your OK' },
  'cloud.needsYou': { zh: '有一件事需要你确认', en: 'Something needs your confirmation' },
  'cloud.lastSync': { zh: '上次成功同步：{0}（云端版本 v{1}）', en: 'Last successful sync: {0} (cloud v{1})' },
  'cloud.syncNow': { zh: '立即同步', en: 'Sync now' },
  'cloud.syncing': { zh: '同步中…', en: 'Syncing…' },
  'cloud.syncedOk': { zh: '同步完成', en: 'Sync complete' },
  'cloud.showCode': { zh: '恢复码', en: 'Recovery code' },
  'cloud.history': { zh: '历史版本', en: 'Versions' },
  'cloud.history.hint': { zh: '云端保留最近的几个版本。导出为 JSON 后，可用「导入数据」恢复到那个时间点。', en: 'The cloud keeps the last few versions. Export one as JSON, then restore it with “Import data”.' },
  'cloud.history.export': { zh: '导出', en: 'Export' },
  'cloud.history.none': { zh: '暂无历史版本', en: 'No versions yet' },
  'cloud.history.exported': { zh: '已导出，可用「导入数据」恢复', en: 'Exported — restore it with “Import data”' },
  'cloud.conflicts': { zh: '{0} 条合并冲突记录', en: '{0} merge conflicts' },
  'cloud.conflictsHint': { zh: '两台设备改了同一处时按「较新的为准」处理；这里留个记录，供你核对。', en: 'When two devices edited the same thing, the newer one won. This is a record so you can double-check.' },
  'cloud.conflictsClear': { zh: '清除记录', en: 'Clear list' },
  'cloud.conflictKind.delete-vs-edit': { zh: '一边删除、一边修改（已保留修改）', en: 'Deleted on one side, edited on the other (kept the edit)' },
  'cloud.conflictKind.edit-vs-edit': { zh: '同一处改成不同值', en: 'Same field edited differently' },
  'cloud.conflictKind.orphan-record': { zh: '关联记录还在，已恢复其分摊账单', en: 'Linked records survived; split bill restored' },
  'cloud.snapshots': { zh: '本机快照（可导出为 JSON 再导入）', en: 'Local snapshots (export as JSON, import to restore)' },
  'cloud.exportBackup': { zh: '启用前备份 {0}', en: 'Before-sync backup {0}' },
  'cloud.exportPremerge': { zh: '最近合并前快照 {0}', en: 'Last pre-merge snapshot {0}' },
  'cloud.disable': { zh: '关闭同步', en: 'Turn off sync' },
  'cloud.disable.desc': { zh: '关闭后本机账本原样保留，云端副本也保留，恢复码继续有效。但本机会忘掉这串恢复码——请确认已保存：', en: 'Your ledger stays as it is and the cloud copy is kept; the recovery code stays valid. But this device forgets the code — make sure you have saved it:' },
  'cloud.disable.go': { zh: '我已保存，关闭同步', en: 'I saved it — turn off' },
  'cloud.disabledOk': { zh: '云端同步已关闭，本机数据未改动', en: 'Cloud sync is off; your local data is untouched' },
  'cloud.deleteCloud': { zh: '删除云端副本', en: 'Delete cloud copy' },
  'cloud.delete.desc': { zh: '这会永久删除云端的账本和所有历史版本，并关闭同步。本机账本不受影响。删除后无法恢复云端副本。', en: 'This permanently deletes the cloud ledger and all its versions, and turns sync off. Your local ledger is unaffected. The cloud copy cannot be brought back.' },
  'cloud.delete.type': { zh: '输入「删除」以确认', en: 'Type DELETE to confirm' },
  'cloud.delete.word': { zh: '删除', en: 'DELETE' },
  'cloud.deletedOk': { zh: '云端副本已删除，同步已关闭', en: 'Cloud copy deleted; sync is off' },
  'cloud.bulk.title': { zh: '你刚整体替换了本机数据', en: 'You just replaced this device’s data wholesale' },
  'cloud.bulk.desc.clear': { zh: '你刚清空了本机数据。若继续同步，你其他设备上的数据也会被清空。', en: 'You just cleared this device. If you sync now, your other devices will be cleared too.' },
  'cloud.bulk.desc.import-replace': { zh: '你刚用「替换」方式导入了一份数据。若以本机为准同步，其他设备上比它更新的记录都会被删掉。', en: 'You just imported data in “replace” mode. If this device wins, records newer than it on your other devices will be deleted.' },
  'cloud.bulk.desc.lan-replace': { zh: '你刚通过局域网同步整体替换了本机数据。若以本机为准同步，其他设备上的数据也会被替换。', en: 'You just replaced this device via LAN sync. If this device wins, your other devices will be replaced too.' },
  'cloud.bulk.keepLocal': { zh: '以本机为准并同步（其他设备也会变成这样）', en: 'Keep this device’s data and sync it (other devices will match)' },
  'cloud.bulk.useCloud': { zh: '放弃这次替换，用云端覆盖本机（先自动备份）', en: 'Undo this replacement: overwrite this device with the cloud (backed up first)' },
  'cloud.bulk.later': { zh: '先不同步', en: 'Don’t sync for now' },
  'cloud.mass.title': { zh: '这次同步会删掉本机很多记录', en: 'This sync would delete many records here' },
  'cloud.mass.desc': { zh: '云端那边把 {1} 条里的 {0} 条删掉了。继续会在本机同样删除（已先备份）。', en: 'The cloud removed {0} of the {1} records here. Continuing removes them on this device too (backed up first).' },
  'cloud.mass.skip': { zh: '先不同步', en: 'Not now' },
  'cloud.mass.apply': { zh: '继续并删除', en: 'Continue and delete' },
  'cloud.mass.uncategorized': { zh: '无分类', en: 'Uncategorized' },
  'cloud.mass.sampleHeader': { zh: '将被删除的记录（举例）：', en: 'Records this would delete (examples):' },
  'cloud.mass.more': { zh: '另有 {0} 条未列出。', en: '{0} more not shown.' },
  'cloud.conflict.title': { zh: '有记录两边都改了，选一下怎么处理', en: 'Some items were changed on both sides — pick how to resolve them' },
  'cloud.conflict.desc': { zh: '下面 {0} 组是两边真正冲突的记录/账单，逐条选一个操作；只有一边有的记录会照常保留，不需要处理。', en: 'The {0} item(s) below were genuinely changed on both sides — pick an action for each. Items that only exist on one side are kept automatically and need no action.' },
  'cloud.conflict.thisDevice': { zh: '本机', en: 'This device' },
  'cloud.conflict.otherDevice': { zh: '对方', en: 'Other device' },
  'cloud.conflict.thisDeviceOnly': { zh: '只有本机有', en: 'Only on this device' },
  'cloud.conflict.otherDeviceOnly': { zh: '只有对方有', en: 'Only on the other device' },
  'cloud.conflict.deletedHere': { zh: '本机已删除', en: 'Deleted on this device' },
  'cloud.conflict.deletedThere': { zh: '对方已删除', en: 'Deleted on the other device' },
  'cloud.conflict.useNewer': { zh: '以最新为准', en: 'Use whichever is newer' },
  'cloud.conflict.useLocal': { zh: '以本机为准', en: 'Use this device' },
  'cloud.conflict.useRemote': { zh: '以对方为准', en: 'Use the other device' },
  'cloud.conflict.useEdited': { zh: '修改后覆盖两者', en: 'Edit, then apply to both' },
  'cloud.conflict.defer': { zh: '待定（先不管）', en: 'Defer (decide later)' },
  'cloud.conflict.deferAll': { zh: '全部待定，下次再问', en: 'Defer all, ask again next time' },
  'cloud.conflict.confirm': { zh: '确认并继续同步', en: 'Confirm and continue syncing' },
  'cloud.conflict.amount': { zh: '金额', en: 'Amount' },
  'cloud.conflict.note': { zh: '备注', en: 'Note' },
  'cloud.conflict.save': { zh: '保存', en: 'Save' },
  'cloud.conflict.participants': { zh: '参与人：{0}', en: 'Participants: {0}' },
  'cloud.warn.dropped': { zh: '云端有 {0} 条记录格式不认识，已跳过', en: '{0} records from the cloud were not understood and were skipped' },
  'cloud.err.network': { zh: '连不上云端（网络或服务暂时不可用）。本机数据没有改动。', en: 'Cannot reach the cloud (network or service unavailable). Nothing on this device was changed.' },
  'cloud.err.server': { zh: '云端返回了错误。本机数据没有改动。', en: 'The cloud returned an error. Nothing on this device was changed.' },
  'cloud.err.http': { zh: '云端拒绝了请求。本机数据没有改动。', en: 'The cloud rejected the request. Nothing on this device was changed.' },
  'cloud.err.decrypt': { zh: '解密失败：恢复码不对，或云端数据已损坏。本机数据没有改动。', en: 'Could not decrypt: wrong recovery code, or the cloud data is damaged. Nothing on this device was changed.' },
  'cloud.err.format': { zh: '云端数据的格式不认识（可能来自更新的版本）。已整体拒绝，本机数据没有改动。', en: 'The cloud data’s format is not understood (maybe from a newer version). Rejected as a whole; nothing was changed.' },
  'cloud.err.rollback': { zh: '云端版本比本机记住的更旧，已拒绝（可能被回滚）。本机数据没有改动。', en: 'The cloud is older than what this device last saw — rejected (it may have been rolled back). Nothing was changed.' },
  'cloud.err.gone': { zh: '云端副本已经不存在（可能被删除了）。本机数据没有改动；如需继续同步，请关闭同步后重新启用。', en: 'The cloud copy no longer exists (it may have been deleted). Nothing was changed; turn sync off and on again to continue.' },
  'cloud.err.quota': { zh: '本机存储空间不足，已中止。账本没有改动。', en: 'Not enough storage on this device — stopped. Your ledger was not changed.' },
  'cloud.err.toolarge': { zh: '账本太大，超过了云端单次 4MB 的上限。', en: 'The ledger is larger than the cloud’s 4 MB limit.' },
  'cloud.err.emptyguard': { zh: '为防误删，已暂停上传：本机账本是空的，而之前同步过的账本有数据。确认要用空账本覆盖云端？请点「立即同步」再次确认。', en: 'Upload paused to protect you: this device’s ledger is empty but the synced one had data. To overwrite the cloud with an empty ledger, press “Sync now” again.' },
  'cloud.err.busy': { zh: '云端同时在被其他设备修改，稍后会自动重试。', en: 'Another device is updating the cloud right now; it will retry shortly.' },
  'cloud.err.nosecret': { zh: '找不到本机保存的恢复码。', en: 'The recovery code saved on this device is missing.' },
  'cloud.err.unsupported': { zh: '当前浏览器不支持云端同步所需的功能（加密或网络）。', en: 'This browser lacks what cloud sync needs (encryption or networking).' },
  'cloud.err.pin': { zh: '开启 PIN 锁时暂不支持云端同步。', en: 'Cloud sync is not available while a PIN lock is on.' },
  'cloud.err.badcode.length': { zh: '恢复码应为 28 位字母数字（7 组，每组 4 位）。', en: 'A recovery code is 28 letters/digits (7 groups of 4).' },
  'cloud.err.badcode': { zh: '恢复码不正确：请对照抄写是否有误（校验位不符）。', en: 'That recovery code is not valid — check it for typos (checksum mismatch).' },
  'cloud.err.notfound': { zh: '云端找不到这个恢复码对应的账本。', en: 'No cloud ledger matches this recovery code.' },
  'cloud.err.invite': { zh: '邀请码无效。', en: 'The invite code is not valid.' },
  'cloud.err.invite_required': { zh: '需要邀请码。', en: 'An invite code is required.' },
  'cloud.err.invite_invalid': { zh: '邀请码无效或已被使用。', en: 'That invite code is invalid or already used.' },
  'cloud.err.internal': { zh: '同步遇到了意外错误。本机数据没有改动。', en: 'Sync hit an unexpected error. Nothing on this device was changed.' },
  'cloud.err.other': { zh: '同步失败（{0}）。本机数据没有改动。', en: 'Sync failed ({0}). Nothing on this device was changed.' }
});

// === EXPORTS ===
window.CloudSync = {
  notify, markBulk, isEnabled, renderCard, syncOnce, boot, disable,
  ui,
  // Exposed for the test suite and for diagnostics; not a stable API.
  _cfg: CFG, _keys: K, _state: st, _approvals: approvals,
  _t: {
    crc8, encodeSecret, decodeSecret, deriveKeys, sealLedger, openLedger, packSnapshot, unpackSnapshot,
    prepareCreate, prepareLogin, establish, confirmFirstMerge, deleteCloudCopy, listHistory, fetchVersionJson,
    getMeta: () => meta, loadMeta, contentHash, isPristine, resolveAwaiting, resolveConflicts, conflictKey, isActive: () => active,
    resetForTests() { deactivate(); meta = null; keyCache = null; wiz = null; inflight = false; rerun = false; lastFinished = 0; hashCache = { rev: -1, data: null, hash: '' };
      st.phase = 'idle'; st.error = null; st.awaiting = null;
      approvals.merge = null; approvals.empty = false; approvals.bulk = null; approvals.conflicts = null;
      if (awaitObserver) { awaitObserver.disconnect(); awaitObserver = null; } }
  }
};
try { boot(); } catch (e) { console.error('[CloudSync] boot failed', e); }
})();
