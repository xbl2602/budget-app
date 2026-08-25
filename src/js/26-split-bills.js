/* ============================================================
   SPLIT BILLS (分摊收款单 / 代付追账)
   ============================================================ */
(function() {
'use strict';

const SPLIT_ID = '__split__';
const SPLIT_COLOR = '#F59E0B';
const SPLIT_PIE_ICON = '🧾';

/* ============================================================
   DATE-KEY HELPERS (mirror each consumer's date convention)
   ============================================================ */
function _billDateStr(bill) { return String(bill.date || bill.createdAt || ''); }

// Month key 'YYYY-MM' (matches getMonthKey local-timezone behavior)
function _billMonth(bill) { return _billDateStr(bill).slice(0, 7); }

// Raw date key 'YYYY-MM-DD' (matches getCustomRangeTotals / getLast7Days / today-yesterday)
function _billDayRaw(bill) { return _billDateStr(bill).slice(0, 10); }

// UTC ISO date key (matches getPeriodDailyTotals dayKey convention)
function _billDayUTC(bill) {
  const d = new Date(_billDateStr(bill));
  return isNaN(d.getTime()) ? '' : d.toISOString().substr(0, 10);
}

/* ============================================================
   CONTRIBUTION MATH
   ============================================================ */
// Current contribution of one bill: my share (always) + unpaid others' shares
/* ============================================================
   PARTICIPANT PAYMENT MODEL (supports partial repayment)

   A participant owes `share` and has repaid `paidAmount`. Bills written before
   partial repayment existed carry only the boolean `paid`, which is read as
   all-or-nothing. Every write sets BOTH fields, so exports, LAN sync and any
   older reader keep seeing a correct `paid` flag.
   ============================================================ */
function partShare(p) { return Math.max(0, parseFloat(p && p.share) || 0); }

function partPaid(p) {
  if (!p) return 0;
  const share = partShare(p);
  if (p.paidAmount !== undefined && p.paidAmount !== null && p.paidAmount !== '') {
    const v = parseFloat(p.paidAmount);
    if (isFinite(v)) return Math.min(share, Math.max(0, round2(v)));
    return 0;
  }
  return p.paid === true ? share : 0;   // legacy boolean-only bill
}

function partOwed(p) { return round2(partShare(p) - partPaid(p)); }

function partSettled(p) { return partOwed(p) <= 0.005; }

/* Returns a NEW participant with the repaid amount clamped into [0, share] */
function withPaidAmount(p, amount) {
  const share = partShare(p);
  const v = Math.min(share, Math.max(0, round2(parseFloat(amount) || 0)));
  return Object.assign({}, p, { paidAmount: v, paid: (share - v) <= 0.005 });
}

function billContrib(bill) {
  const my = Math.max(0, parseFloat(bill.selfShare) || 0);
  let unpaid = 0;
  (bill.participants || []).forEach(p => { unpaid += partOwed(p); });
  return { my, unpaid: round2(unpaid), total: round2(my + unpaid) };
}

function _sumRange(bills, startKey, endKey, keyFn, rangeFn) {
  const res = { my: 0, unpaid: 0, total: 0 };
  bills.forEach(b => {
    if (!rangeFn(b, startKey, endKey)) return;
    const c = billContrib(b);
    res.my += c.my;
    res.unpaid += c.unpaid;
    res.total += c.total;
  });
  return res;
}

// Month contribution: bills whose month matches
function getSplitMonthContrib(month) {
  const bills = (DataStore._data.splitBills || []).filter(b => _billMonth(b) === month);
  return _sumRange(bills, month, month, null, () => true);
}

// Date-range contribution (Date object comparison — mirrors getPeriodRecords/getCustomRangeTotals)
function getSplitRangeByDate(startDate, endDate) {
  const bills = (DataStore._data.splitBills || []).filter(b => {
    const d = new Date(_billDateStr(b));
    return !isNaN(d.getTime()) && d >= startDate && d <= endDate;
  });
  return _sumRange(bills, null, null, null, () => true);
}

// Day map for month daily totals: { dayIdx: {my, unpaid, total} } (matches getDailyTotals)
function getSplitDayMap(month) {
  const map = {};
  (DataStore._data.splitBills || []).forEach(b => {
    if (_billMonth(b) !== month) return;
    const day = parseInt(_billDateStr(b).slice(8, 10), 10);
    if (!day) return;
    const c = billContrib(b);
    if (!map[day]) map[day] = { my: 0, unpaid: 0, total: 0 };
    map[day].my += c.my;
    map[day].unpaid += c.unpaid;
    map[day].total += c.total;
  });
  return map;
}

// Day map for period daily totals: { 'YYYY-MM-DD': {..} } keyed by UTC (matches getPeriodDailyTotals)
function getSplitDayMapUTC(startKey, endKey) {
  const map = {};
  (DataStore._data.splitBills || []).forEach(b => {
    const k = _billDayUTC(b);
    if (!k || k < startKey || k > endKey) return;
    const c = billContrib(b);
    if (!map[k]) map[k] = { my: 0, unpaid: 0, total: 0 };
    map[k].my += c.my;
    map[k].unpaid += c.unpaid;
    map[k].total += c.total;
  });
  return map;
}

// Day map for raw-range daily totals: { 'YYYY-MM-DD': {..} } keyed by raw string (matches getCustomRangeTotals.daily)
function getSplitDayMapRaw(startKey, endKey) {
  const map = {};
  (DataStore._data.splitBills || []).forEach(b => {
    const k = _billDayRaw(b);
    if (!k || k < startKey || k > endKey) return;
    const c = billContrib(b);
    if (!map[k]) map[k] = { my: 0, unpaid: 0, total: 0 };
    map[k].my += c.my;
    map[k].unpaid += c.unpaid;
    map[k].total += c.total;
  });
  return map;
}

// Single-day contribution by raw key (overview today / yesterday)
function getSplitDayContrib(dateKey) {
  return getSplitDayMapRaw(dateKey, dateKey)[dateKey] || { my: 0, unpaid: 0, total: 0 };
}

/* ============================================================
   PENDING SUMMARY (who owes, across all bills)
   ============================================================ */
function getPendingSummary(opts) {
  const includePaid = !!(opts && opts.includePaid);
  const perContact = {};
  const bills = (typeof DataStore !== 'undefined' && DataStore._data && Array.isArray(DataStore._data.splitBills)) ? DataStore._data.splitBills : [];
  bills.forEach(b => {
    (b.participants || []).forEach(p => {
      const amt = partShare(p);
      if (amt <= 0) return;
      const owed = partOwed(p);
      const paidAmt = partPaid(p);
      const settled = partSettled(p);
      if (settled && !includePaid) return;
      const key = p.contactId || 'anon:' + (p.name || '');
      if (!perContact[key]) {
        perContact[key] = { contactId: p.contactId || '', name: p.name || __('split.unknown'), total: 0, paidTotal: 0, bills: [] };
      }
      // A partially repaid row contributes to BOTH sides
      perContact[key].total = round2(perContact[key].total + owed);
      perContact[key].paidTotal = round2(perContact[key].paidTotal + paidAmt);
      perContact[key].bills.push({
        billId: b.id,
        billNote: b.note || '',
        billTag: b.tag || '',
        billCategoryId: b.categoryId || '',
        amount: amt,
        owed,
        paidAmount: paidAmt,
        partial: paidAmt > 0.005 && !settled,
        archived: !!b.archived,
        date: _billDayRaw(b),
        paid: settled,
        unknown: !!p.unknown
      });
    });
  });
  const list = Object.values(perContact).sort((a, b) => (b.total + b.paidTotal) - (a.total + a.paidTotal));
  return {
    perContact: list,
    total: round2(list.reduce((s, x) => s + x.total, 0)),
    count: list.reduce((s, x) => s + x.bills.filter(bl => !bl.paid).length, 0)
  };
}

function getSplitBillCount() {
  if (typeof DataStore === 'undefined' || !DataStore._data || !Array.isArray(DataStore._data.splitBills)) return 0;
  return DataStore._data.splitBills.length;
}

function getContribBreakdown(start, end) {
  const startT = new Date(start).getTime();
  const endT = new Date(end).getTime();
  const rows = [];
  const bills = (typeof DataStore !== 'undefined' && DataStore._data && Array.isArray(DataStore._data.splitBills)) ? DataStore._data.splitBills : [];
  bills.forEach(b => {
    if (b.payer !== 'self') return;
    const t = new Date(b.date).getTime();
    if (isNaN(t) || t < startT || t > endT) return;
    (b.participants || []).forEach(p => {
      const amt = partPaid(p);
      if (amt <= 0.005) return;
      rows.push({
        billId: b.id,
        billNote: b.note || '',
        billTag: b.tag || '',
        contactName: p.name || (p.contactId && p.contactId.indexOf('anon:') === 0 ? p.contactId.slice(5) : __('split.unknown')),
        amount: amt,
        date: _billDayRaw(b)
      });
    });
  });
  rows.sort((a, b) => (a.date || '').localeCompare(b.date || ''));
  return rows;
}

/* ============================================================
   CONTACTS CRUD
   ============================================================ */
function getContacts() {
  if (typeof DataStore === 'undefined' || !DataStore._data || !Array.isArray(DataStore._data.contacts)) return [];
  return DataStore._data.contacts.slice().sort((a, b) => (a.name || '').localeCompare(b.name || ''));
}

function addContact(name) {
  const trimmed = String(name || '').trim();
  if (!trimmed) return null;
  const existing = getContacts().find(c => c.name === trimmed);
  if (existing) return existing;
  const contact = { id: uuid(), name: trimmed };
  DataStore._data.contacts.push(contact);
  DataStore.save();
  logEvent('splitAddContact', 'name=' + trimmed);
  return contact;
}

function renameContact(id, name) {
  const c = (DataStore._data.contacts || []).find(x => x.id === id);
  const trimmed = String(name || '').trim();
  if (!c || !trimmed) return;
  c.name = trimmed;
  DataStore.save();
  logEvent('splitRenameContact', 'id=' + id);
}

function deleteContact(id) {
  DataStore._data.contacts = (DataStore._data.contacts || []).filter(c => c.id !== id);
  DataStore.save();
  logEvent('splitDeleteContact', 'id=' + id);
}

/* ============================================================
   SPLIT BILLS CRUD
   ============================================================ */
function getSplitBills() {
  if (typeof DataStore === 'undefined' || !DataStore._data || !Array.isArray(DataStore._data.splitBills)) return [];
  return DataStore._data.splitBills.slice().sort((a, b) => {
    return String(b.date || b.createdAt).localeCompare(String(a.date || a.createdAt));
  });
}

function getSplitBill(id) {
  return (DataStore._data.splitBills || []).find(b => b.id === id) || null;
}

// Link a record to its split bill: prefer the stored splitBillId, fall back to same day + amount
function getSplitBillForRecord(record) {
  if (!record) return null;
  if (record.splitBillId) {
    const byId = getSplitBill(record.splitBillId);
    if (byId) return byId;
  }
  const recDay = String(record.date || '').slice(0, 10);
  if (!recDay) return null;
  const amt = parseFloat(record.amount) || 0;
  return (DataStore._data.splitBills || []).find(b => {
    return (parseFloat(b.amount) || 0) === amt && String(b.date || '').slice(0, 10) === recDay;
  }) || null;
}

function getSplitBillUnpaid(bill) {
  if (!bill) return 0;
  return round2((bill.participants || []).reduce((s, p) => s + partOwed(p), 0));
}

function setBillCategory(billId, categoryId) {
  const bill = getSplitBill(billId);
  if (!bill) return;
  const real = String(categoryId || '') && String(categoryId || '') !== SPLIT_ID ? String(categoryId || '') : 'uncategorized';
  updateSplitBill(billId, { categoryId: real });
  // Split records carry the bill's real category — keep them in sync
  (DataStore._data.records || []).forEach(r => {
    if (r.splitBillId === billId) r.categoryId = real;
  });
  DataStore.save();
}

// Sync the linked split bill when its record is edited on the records page
function applyRecordEditToBill(billId, patch) {
  const bill = getSplitBill(billId);
  if (!bill) return;
  const up = {};
  if (patch.amount !== undefined && patch.amount > 0) {
    up.amount = patch.amount;
    // Re-scale all shares proportionally so participants+self always equal the new amount
    const oldTotal = parseFloat(bill.amount) || 0;
    if (oldTotal > 0 && Math.abs(patch.amount - oldTotal) > 0.01) {
      const ratio = patch.amount / oldTotal;
      const items = [];
      if ((parseFloat(bill.selfShare) || 0) > 0) items.push({ key: 'self', share: parseFloat(bill.selfShare) });
      (bill.participants || []).forEach(p => items.push({ key: p.contactId || ('anon:' + (p.name || '')), share: parseFloat(p.share) || 0, part: p }));
      const scaled = items.map(it => Object.assign({}, it, { share: round2(it.share * ratio) }));
      let total = round2(scaled.reduce((s, x) => s + x.share, 0));
      const diff = round2(patch.amount - total);
      if (Math.abs(diff) > 0.005 && scaled.length) {
        let maxIdx = 0;
        scaled.forEach((s, i) => { if (s.share > scaled[maxIdx].share) maxIdx = i; });
        scaled[maxIdx].share = round2(scaled[maxIdx].share + diff);
      }
      let newSelf = 0;
      const newParts = [];
      scaled.forEach(s => {
        if (s.key === 'self') newSelf = s.share;
        else newParts.push(Object.assign({}, s.part, { share: s.share }));
      });
      up.selfShare = newSelf;
      up.participants = newParts;
    }
  }
  if (patch.date) up.date = patch.date;
  if (patch.note !== undefined) up.note = patch.note;
  if (Array.isArray(patch.tags)) up.tag = patch.tags.map(t => String(t || '').trim()).filter(Boolean).join('、');
  if (Object.keys(up).length) updateSplitBill(billId, up);
}

// Delete a bill together with its linked record(s) so no orphan remains in stats/records
function deleteSplitBillWithRecords(billId) {
  const bill = getSplitBill(billId);
  if (!bill) return;
  deleteSplitBill(billId);
  DataStore._data.records = (DataStore._data.records || []).filter(r => {
    // Only records explicitly linked to this bill are removed — never unrelated
    // same-day/same-amount orphans (they belong to some other, already deleted bill)
    return r.splitBillId !== billId;
  });
  DataStore.save();
  logEvent('splitDeleteBillWithRecords', 'id=' + billId);
}

function addSplitBill(bill) {
  if (!bill.id) bill.id = uuid();
  bill.createdAt = bill.createdAt || new Date().toISOString();
  bill.updatedAt = bill.updatedAt || bill.createdAt;
  DataStore._data.splitBills.unshift(bill);
  DataStore.save();
  logEvent('splitAddBill', 'id=' + bill.id + ' amount=' + bill.amount);
  return bill;
}

function updateSplitBill(id, updates) {
  const idx = (DataStore._data.splitBills || []).findIndex(b => b.id === id);
  if (idx === -1) return null;
  updates.updatedAt = new Date().toISOString();
  Object.assign(DataStore._data.splitBills[idx], updates);
  DataStore.save();
  logEvent('splitUpdateBill', 'id=' + id);
  return DataStore._data.splitBills[idx];
}

function deleteSplitBill(id) {
  DataStore._data.splitBills = (DataStore._data.splitBills || []).filter(b => b.id !== id);
  DataStore.save();
  logEvent('splitDeleteBill', 'id=' + id);
}

/* ============================================================
   SHARE COMPUTATION (equal vs specified, remainder to last)
   ============================================================ */
function round2(n) { return Math.round(n * 100) / 100; }

// pool: array of { id, name, specified (number|null) } incl. self marker {id: 'self'}
// returns { shares: [{id, name, share}], error }
function computeShares(total, pool, selfInvolved) {
  const n = pool.length;
  if (n <= 0) return { error: __('split.errorNoPeople') };
  if (!(total > 0)) return { error: __('split.errorAmount') };
  const shares = [];
  let specifiedSum = 0;
  const specified = [];
  const unspecified = [];
  for (const m of pool) {
    const val = m.specified !== null && m.specified !== undefined && m.specified !== '' ? parseFloat(m.specified) : null;
    if (val !== null && isFinite(val)) {
      if (val < 0) return { error: __('split.errorNegative') };
      specified.push({ m, val });
      specifiedSum += val;
    } else {
      unspecified.push(m);
    }
  }
  if (specifiedSum > total + 0.01) return { error: __('split.errorOverSpecified') };

  // Equal split style (no specified values)
  if (specified.length === 0) {
    const base = round2(total / n);
    let remaining = round2(total);
    pool.forEach((m, i) => {
      const share = i === n - 1 ? round2(remaining) : base;
      remaining = round2(remaining - share);
      shares.push({ id: m.id, name: m.name, share, specified: m.specified });
    });
  } else {
    // Mixed: set remaining equally among unspecified; remainder to last unspecified.
    // When EVERYONE is specified and something remains, the remainder is my own
    // share (self-involved alone is a legal configuration); otherwise it's a mismatch.
    const remain = round2(total - specifiedSum);
    if (remain > 0 && unspecified.length === 0) {
      const selfSpec = specified.find(s => s.m.id === 'self');
      if (selfSpec) {
        selfSpec.val = round2(selfSpec.val + remain);
        specifiedSum = round2(specifiedSum + remain);
      }
    }
    let remainingUnspec = round2(total - specifiedSum);
    const partBase = unspecified.length > 0 ? round2(remainingUnspec / unspecified.length) : 0;
    shares.push(...specified.map(s => ({ id: s.m.id, name: s.m.name, share: round2(s.val), specified: s.m.specified })));
    unspecified.forEach((m, i) => {
      const isLast = i === unspecified.length - 1;
      const share = isLast ? round2(remainingUnspec) : partBase;
      remainingUnspec = round2(remainingUnspec - share);
      shares.push({ id: m.id, name: m.name, share, specified: m.specified });
    });
  }

  const sum = round2(shares.reduce((s, x) => s + x.share, 0));
  if (Math.abs(sum - total) > 0.01) return { error: __('split.errorSumMismatch') };
  return { shares };
}

/* ============================================================
   REPAYMENT ALLOCATION

   Someone hands over one lump sum that clears part of several bills. All maths
   runs in integer cents so repeated splitting never drifts a cent, and every
   strategy is capped by what each bill actually still owes — an allocation can
   never push a participant past their share.
   ============================================================ */
function toCents(x) { return Math.round((parseFloat(x) || 0) * 100); }
function fromCents(c) { return c / 100; }

/* Even split across the selected bills. A bill that fills up drops out and its
   leftover is redistributed, so "even" never means "overpay the small ones". */
function allocateEvenCents(amountC, caps) {
  const alloc = caps.map(() => 0);
  let pool = amountC;
  let idxs = caps.map((c, i) => i).filter(i => caps[i] > 0);
  while (pool > 0 && idxs.length) {
    const base = Math.floor(pool / idxs.length);
    if (base === 0) {
      // Final few cents: hand them out one at a time, largest room first, so the
      // total always lands exactly on the amount entered.
      const order = idxs.slice().sort((a, b) => (caps[b] - alloc[b]) - (caps[a] - alloc[a]));
      for (const i of order) {
        if (pool <= 0) break;
        if (alloc[i] < caps[i]) { alloc[i]++; pool--; }
      }
      break;
    }
    let consumed = 0;
    const next = [];
    for (const i of idxs) {
      const give = Math.min(caps[i] - alloc[i], base);
      alloc[i] += give;
      consumed += give;
      if (alloc[i] < caps[i]) next.push(i);
    }
    pool -= consumed;
    if (consumed === 0) break;
    idxs = next;
  }
  return { alloc, leftover: pool };
}

/* Oldest bill first — clear one debt fully before starting the next. */
function allocateOrderedCents(amountC, caps) {
  const alloc = caps.map(() => 0);
  let pool = amountC;
  for (let i = 0; i < caps.length && pool > 0; i++) {
    const give = Math.min(caps[i], pool);
    alloc[i] = give;
    pool -= give;
  }
  return { alloc, leftover: pool };
}

/* rows: [{ billId, contactKey, remaining, date }] already filtered to selected.
   mode: 'even' | 'ordered' | 'manual'
   manual: { billId: amountString } — only read in manual mode.
   Returns { ok, error, alloc: [{billId, contactKey, amount}], allocated, leftover } */
function allocateRepayment(amount, rows, mode, manual) {
  if (!Array.isArray(rows) || rows.length === 0) {
    return { ok: false, error: __('split.pay.errorNoSelection') };
  }
  const caps = rows.map(r => Math.max(0, toCents(r.remaining)));
  const capTotal = caps.reduce((a, b) => a + b, 0);
  if (capTotal <= 0) return { ok: false, error: __('split.pay.errorNothingDue') };

  if (mode === 'manual') {
    const alloc = [];
    let sum = 0;
    for (let i = 0; i < rows.length; i++) {
      const raw = manual ? manual[rows[i].billId] : '';
      const v = (raw === undefined || raw === null || String(raw).trim() === '') ? 0 : parseFloat(raw);
      if (!isFinite(v) || v < 0) return { ok: false, error: __('split.pay.errorNegative') };
      const c = toCents(v);
      if (c > caps[i]) {
        return { ok: false, error: __('split.pay.errorOverBill', rows[i].label || '', formatMoney(fromCents(caps[i]))) };
      }
      alloc.push(c);
      sum += c;
    }
    if (sum <= 0) return { ok: false, error: __('split.pay.errorZero') };
    return {
      ok: true,
      alloc: rows.map((r, i) => ({ billId: r.billId, contactKey: r.contactKey, amount: fromCents(alloc[i]) })).filter(a => a.amount > 0),
      allocated: fromCents(sum),
      leftover: 0
    };
  }

  const amountC = toCents(amount);
  if (!isFinite(amountC) || amountC <= 0) return { ok: false, error: __('split.pay.errorZero') };
  if (amountC > capTotal) {
    return { ok: false, error: __('split.pay.errorOverTotal', formatMoney(fromCents(capTotal))) };
  }
  const res = mode === 'ordered' ? allocateOrderedCents(amountC, caps) : allocateEvenCents(amountC, caps);
  return {
    ok: true,
    alloc: rows.map((r, i) => ({ billId: r.billId, contactKey: r.contactKey, amount: fromCents(res.alloc[i]) })).filter(a => a.amount > 0),
    allocated: fromCents(amountC - res.leftover),
    leftover: fromCents(res.leftover)
  };
}

/* Apply an allocation produced above. Each bill is re-read at write time so a
   stale preview can never push a participant past their share. */
function applyRepayment(alloc) {
  let applied = 0, touched = 0;
  (alloc || []).forEach(a => {
    if (!(a.amount > 0)) return;
    const bill = getSplitBill(a.billId);
    if (!bill) return;
    const target = (bill.participants || []).find(p => (p.contactId || 'anon:' + (p.name || '')) === a.contactKey);
    if (!target) return;
    const room = partOwed(target);
    const add = Math.min(room, round2(a.amount));
    if (add <= 0.005) return;
    const next = round2(partPaid(target) + add);
    const participants = (bill.participants || []).map(p => {
      const key = p.contactId || 'anon:' + (p.name || '');
      return key === a.contactKey ? withPaidAmount(p, next) : p;
    });
    updateSplitBill(a.billId, { participants });
    applied = round2(applied + add);
    touched++;
  });
  if (touched) logEvent('splitRepayment', 'bills=' + touched + ' amount=' + applied);
  return { applied, touched };
}

/* ============================================================
   ADD-PAGE SPLIT FORM STATE + RENDER
   ============================================================ */
function _resetAddSplitState() {
  window._addSplitState = {
    enabled: false,
    selfInvolved: false,
    selfUnknown: false,
    mode: 'equal',
    selfAmount: '',
    rows: getContacts().map(c => ({ contactId: c.id, name: c.name, included: false, amount: '', unknown: false }))
  };
}
_resetAddSplitState();

function toggleAddSplitForm(checked) {
  window._addSplitState.enabled = !!checked;
  const section = document.getElementById('addSplitSection');
  if (!section) return;
  section.style.display = checked ? 'block' : 'none';
  if (checked) renderAddSplitForm();
}

function setSplitMode(mode) {
  window._addSplitState.mode = mode === 'specified' ? 'specified' : 'equal';
  renderAddSplitForm();
}

function toggleSplitSelfInvolved(checked) {
  window._addSplitState.selfInvolved = !!checked;
  if (!checked) window._addSplitState.selfUnknown = false;
  renderAddSplitForm();
  previewSplitShares();
}

// My own share can be unknown too — same marker participants already get
function toggleSplitSelfUnknown(checked) {
  const st = window._addSplitState;
  if (!st) return;
  st.selfUnknown = !!checked;
  if (st.selfUnknown) st.selfAmount = '';
  renderAddSplitForm();
  previewSplitShares();
}

function toggleSplitRowIncluded(contactId, checked) {
  const row = window._addSplitState.rows.find(r => r.contactId === contactId);
  if (row) row.included = !!checked;
  previewSplitShares();
}

// Mark a participant's owed amount as unknown (display-only; share is still
// computed equally — they just can't type a specified amount)
function toggleSplitRowUnknown(contactId, checked) {
  const row = window._addSplitState.rows.find(r => r.contactId === contactId);
  if (row) {
    row.unknown = !!checked;
    if (row.unknown) row.amount = '';
  }
  renderSplitPeopleList();
  previewSplitShares();
}

function setSplitRowAmount(contactId, val) {
  const row = window._addSplitState.rows.find(r => r.contactId === contactId);
  if (row) row.amount = val;
  previewSplitShares();
}

function setSplitSelfAmount(val) {
  if (!window._addSplitState) return;
  window._addSplitState.selfAmount = String(val || '').replace(/[^0-9.]/g, '');
  previewSplitShares();
}

function _syncSplitRows() {
  const st = window._addSplitState;
  if (!st) return;
  const contacts = getContacts();
  st.rows = contacts.map(c => {
    const existing = (st.rows || []).find(r => r.contactId === c.id);
    return existing || { contactId: c.id, name: c.name, included: false, amount: '', unknown: false };
  });
}

function renderAddSplitForm() {
  const section = document.getElementById('addSplitSection');
  if (!section) return;
  if (!window._addSplitState) window._addSplitState = { enabled: false, selfInvolved: false, selfUnknown: false, mode: 'equal', selfAmount: '', rows: [] };
  const st = window._addSplitState;
  _syncSplitRows();
  section.innerHTML = `
    <div class="split-form">
      <div class="split-form-row">
        <label style="display:flex;align-items:center;gap:6px;cursor:pointer;flex:1;min-width:0">
          <input type="checkbox" ${st.selfInvolved ? 'checked' : ''} style="width:18px;height:18px;cursor:pointer" onchange="toggleSplitSelfInvolved(this.checked)">
          <span class="split-form-label" style="margin:0">${__('split.selfInvolved')}</span>
        </label>
        <label title="${__('split.selfUnknownHint')}" style="display:flex;align-items:center;gap:3px;cursor:${st.selfInvolved ? 'pointer' : 'not-allowed'};flex-shrink:0;opacity:${st.selfInvolved ? '1' : '0.45'}">
          <input type="checkbox" ${st.selfUnknown ? 'checked' : ''} ${st.selfInvolved ? '' : 'disabled'} style="width:14px;height:14px;cursor:inherit" onchange="toggleSplitSelfUnknown(this.checked)">
          <span class="text-xs text-muted" style="font-size:0.68rem">❓ ${__('split.unknownAmount')}</span>
        </label>
      </div>
      ${st.selfInvolved && !st.selfUnknown && st.mode === 'specified' ? `
      <div class="split-form-row">
        <span class="split-form-label">${__('split.selfAmountLabel')}</span>
        <span style="display:flex;align-items:center;gap:2px;flex-shrink:0">
          <span style="font-size:0.7rem;color:var(--text-muted)">RM</span>
          <input type="number" id="splitSelfAmount" class="input-field" min="0" step="0.01" placeholder="0.00" value="${escHtml(st.selfAmount || '')}" oninput="setSplitSelfAmount(this.value)" style="width:110px">
        </span>
      </div>
      ` : ''}
      <div class="split-form-row split-form-row-top">
        <span class="split-form-label">${__('split.mode')}</span>
        <label class="split-mode-opt"><input type="radio" name="splitMode" value="equal" ${st.mode !== 'specified' ? 'checked' : ''} onchange="setSplitMode('equal')"> ${__('split.modeEqual')}</label>
        <label class="split-mode-opt"><input type="radio" name="splitMode" value="specified" ${st.mode === 'specified' ? 'checked' : ''} onchange="setSplitMode('specified')"> ${__('split.modeSpecified')}</label>
      </div>
      <div class="split-form-label" style="margin:6px 0 2px">${__('split.people')}</div>
      <div id="splitPeopleList" class="split-people-list"></div>
      <div class="flex gap-8" style="margin-top:6px;flex-wrap:wrap">
        <button type="button" class="btn btn-sm btn-outline" onclick="openSplitQuickAdd()">＋ ${__('split.addPerson')}</button>
        <button type="button" class="btn btn-sm btn-ghost" onclick="openSplitContactManager()">${__('split.manageContacts')}</button>
      </div>
      <div id="splitSharePreview" class="split-share-preview" style="margin-top:8px"></div>
    </div>
  `;
  renderSplitPeopleList();
  previewSplitShares();
}

function renderSplitPeopleList() {
  const list = document.getElementById('splitPeopleList');
  if (!list) return;
  const st = window._addSplitState;
  const contacts = getContacts();
  if (contacts.length === 0) {
    list.innerHTML = '<div class="text-xs text-muted" style="padding:4px 0">' + __('split.noContacts') + '</div>';
    return;
  }
  list.innerHTML = contacts.map(c => {
    const row = st.rows.find(r => r.contactId === c.id);
    const included = row ? row.included : false;
    const amt = row ? row.amount : '';
    const unknown = row ? !!row.unknown : false;
    return `
      <div class="split-person-row">
        <label style="display:flex;align-items:center;gap:6px;cursor:pointer;flex:1;min-width:0">
          <input type="checkbox" ${included ? 'checked' : ''} style="width:16px;height:16px;cursor:pointer" onchange="toggleSplitRowIncluded('${c.id}', this.checked)">
          <span style="flex:1;min-width:0;word-break:break-word">${escHtml(c.name)}</span>
          <label title="${__('split.unknownAmountTitle')}" style="display:flex;align-items:center;gap:3px;cursor:pointer;flex-shrink:0" onclick="event.stopPropagation()">
            <input type="checkbox" ${unknown ? 'checked' : ''} style="width:14px;height:14px;cursor:pointer" onchange="toggleSplitRowUnknown('${c.id}', this.checked)">
            <span class="text-xs text-muted" style="font-size:0.68rem">❓ ${__('split.unknownAmount')}</span>
          </label>
        </label>
        ${st.mode === 'specified' ? `
          <span style="display:flex;align-items:center;gap:2px;flex-shrink:0">
            <span style="font-size:0.7rem;color:var(--text-muted)">RM</span>
            <input type="number" class="input-field split-person-amount" min="0" step="0.01" placeholder="0.00" value="${escHtml(amt)}" ${unknown ? 'disabled' : ''}
              oninput="setSplitRowAmount('${c.id}', this.value)">
          </span>
        ` : ''}
      </div>
    `;
  }).join('');
}

function previewSplitShares() {
  const preview = document.getElementById('splitSharePreview');
  const amountEl = document.getElementById('addAmount');
  if (!preview || !amountEl) return;
  const st = window._addSplitState;
  const total = parseFloat(amountEl.value);
  if (!(total > 0)) {
    preview.innerHTML = '<span class="text-xs text-muted">' + __('split.previewNeedAmount') + '</span>';
    return;
  }
  const pool = [];
  if (st.selfInvolved) pool.push({ id: 'self', name: __('split.me'), specified: st.selfUnknown ? null : _selfSpecified(st) });
  st.rows.forEach(r => {
    if (r.included) pool.push({ id: r.contactId, name: r.name, specified: r.unknown ? null : r.amount });
  });
  const result = computeShares(total, pool, st.selfInvolved);
  if (result.error) {
    preview.innerHTML = '<span class="text-xs" style="color:var(--danger)">⚠️ ' + result.error + '</span>';
    return;
  }
  preview.innerHTML = result.shares.map(s => {
    const selfTag = s.id === 'self' ? ' (自己)' : '';
    const unk = s.id === 'self' ? !!st.selfUnknown : !!(st.rows || []).find(r => r.contactId === s.id && r.unknown);
    if (unk) {
      return `<span class="split-share-chip" style="color:var(--text-secondary)">${escHtml(s.name)}${selfTag}: <b>❓ ${__('split.unknownAmount')}</b></span>`;
    }
    return `<span class="split-share-chip" style="color:var(--text-secondary)">${escHtml(s.name)}${selfTag}: <b>${formatMoney(s.share)}</b></span>`;
  }).join('');
}

function openSplitQuickAdd() {
  try {
    if (!window._addSplitState) window._addSplitState = { enabled: false, selfInvolved: false, selfUnknown: false, mode: 'equal', selfAmount: '', rows: [] };
    showModal(`
    <div class="modal-title">＋ ${__('split.addPerson')}</div>
    <div class="input-group">
      <label class="input-label">${__('split.personName')}</label>
      <input type="text" id="quickContactName" class="input-field" placeholder="${__('split.personNamePlaceholder')}" maxlength="30">
    </div>
    <div class="modal-actions">
      <button class="btn btn-ghost" onclick="closeModal()">${__('split.cancel')}</button>
      <button class="btn btn-primary" onclick="confirmSplitQuickAdd()">✅ ${__('split.confirmAdd')}</button>
    </div>
  `);
  } catch (err) {
    console.error('[split] openSplitQuickAdd failed:', err);
    showToast('新增人员打开失败: ' + (err && err.message ? err.message : err), 'error');
    return;
  }
  setTimeout(() => {
    const inp = document.getElementById('quickContactName');
    if (inp) inp.focus();
  }, 100);
}

function confirmSplitQuickAdd() {
  try {
    _confirmSplitQuickAdd();
  } catch (err) {
    console.error('[split] confirmSplitQuickAdd failed:', err);
    showToast('新增人员失败: ' + (err && err.message ? err.message : err), 'error');
  }
}

function _confirmSplitQuickAdd() {
  const name = document.getElementById('quickContactName').value.trim();
  if (!name) { showToast(__('split.nameRequired'), 'error'); return; }
  const contact = addContact(name);
  if (!contact) { showToast(__('split.nameRequired'), 'error'); return; }
  const row = window._addSplitState.rows.find(r => r.contactId === contact.id);
  const isNew = !row;
  if (isNew) {
    window._addSplitState.rows.push({ contactId: contact.id, name: contact.name, included: false, amount: '', unknown: false });
  }
  closeModal();
  renderAddSplitForm();
  showToast(isNew ? __('split.personAdded', contact.name) : __('split.personExists', contact.name), isNew ? 'success' : 'error');
}

/* ============================================================
   SAVE FROM ADD PAGE
   ============================================================ */
function _selfSpecified(st) {
  const v = (st && st.selfAmount !== undefined && st.selfAmount !== null && st.selfAmount !== '') ? parseFloat(st.selfAmount) : null;
  return (v !== null && isFinite(v)) ? v : null;
}

function collectSplitBill(args) {
  const st = window._addSplitState || {};
  const pool = [];
  if (st.selfInvolved) pool.push({ id: 'self', name: __('split.me'), specified: st.selfUnknown ? null : _selfSpecified(st) });
  (st.rows || []).forEach(r => {
    if (!r.included) return;
    // Unknown-amount participants cannot type a specified amount; they get the
    // equal-share remainder like any unspecified person (display-only marker)
    pool.push({ id: r.contactId, name: r.name, specified: r.unknown ? null : r.amount });
  });
  const result = computeShares(args.amount, pool, st.selfInvolved);
  if (result.error) return { ok: false, error: result.error };
  const selfShare = st.selfInvolved
    ? (result.shares.find(s => s.id === 'self') || { share: 0 }).share
    : 0;
  const participants = result.shares
    .filter(s => s.id !== 'self')
    .map(s => {
      const row = (st.rows || []).find(r => r.contactId === s.id);
      return {
        contactId: s.id,
        name: s.name,
        share: s.share,
        paid: false,
        paidAmount: 0,
        unknown: !!(row && row.unknown)
      };
    });
  const bill = {
    amount: args.amount,
    date: args.date,
    note: args.note || '',
    tag: Array.isArray(args.tags) ? args.tags.map(t => t.trim()).filter(Boolean).join('、') : String(args.tag || '').trim(),
    categoryId: args.categoryId || '',
    selfShare,
    selfUnknown: !!(st.selfInvolved && st.selfUnknown),
    participants,
    // Remember how the split was entered so the editor reopens in the same mode
    // (equal-split shares are NOT treated as user-specified values on reopen)
    mode: (st.mode === 'specified') ? 'specified' : 'equal'
  };
  return { ok: true, bill, participants };
}

/* ============================================================
   SPLIT CENTER (追账中心) MODAL
   ============================================================ */
let _splitCenterView = 'people';      // 'people' | 'bill' | 'archived'
let _splitCompactView = true;         // compact one-line cards by default
const _splitExpandStates = {};        // 'bill:<id>' / 'contact:<key>' → expanded

function setSplitCenterView(view) {
  _splitCenterView = (view === 'bill' || view === 'archived') ? view : 'people';
  openSplitCenter();
}

function toggleSplitCompactView() {
  _splitCompactView = !_splitCompactView;
  openSplitCenter();
}

function toggleSplitBillExpand(billId) {
  const key = 'bill:' + billId;
  _splitExpandStates[key] = !_splitExpandStates[key];
  const overlay = document.getElementById('modalOverlay');
  if (!overlay || !overlay.classList.contains('open')) return;
  const body = overlay.querySelector('[id^="splitCenterBody_"]');
  if (!body) return;
  const bill = getSplitBill(billId);
  const card = body.querySelector('.split-history-row[data-bill-id="' + billId + '"]');
  if (card && bill) {
    const tmp = document.createElement('div');
    tmp.innerHTML = _splitBillCard(bill, { archived: !!bill.archived });
    card.replaceWith(tmp.firstElementChild);
    _bindPaidControls(tmp.firstElementChild);
  }
}

function toggleSplitContactExpand(contactKey) {
  const key = 'contact:' + contactKey;
  _splitExpandStates[key] = !_splitExpandStates[key];
  const overlay = document.getElementById('modalOverlay');
  if (!overlay || !overlay.classList.contains('open')) return;
  const body = overlay.querySelector('[id^="splitCenterBody_"]');
  if (!body) return;
  const pcs = getPendingSummary({ includePaid: true }).perContact;
  const pc = pcs.find(x => (x.contactId || 'anon:' + x.name) === contactKey);
  const card = body.querySelector('.split-contact-card[data-contact="' + escHtml(contactKey) + '"]');
  if (pc && card) {
    const tmp = document.createElement('div');
    tmp.innerHTML = _splitContactCardHtml(pc);
    card.replaceWith(tmp.firstElementChild);
    _bindPaidControls(tmp.firstElementChild);
  }
}

function _splitCatChip(catId) {
  if (!catId) return '';
  const cat = DataStore.getCategory(catId);
  if (!cat) return '';
  return `<span class="split-cat-chip">${escHtml(cat.icon)} ${escHtml(cat.name)}</span>`;
}

/* opts: { paidAmount, share } — when given, a part-paid row shows its progress.
   The badge and the "part" button both open the amount dialog, which is also the
   only way to walk a payment back. */
function _splitPaidControl(billId, contactId, name, paid, opts) {
  const key = contactId || 'anon:' + name;
  const editBtn = `<button class="btn btn-ghost btn-sm split-partial-btn" title="${__('split.pay.setAmountTitle')}"
      onclick="openSplitPartial('${escHtml(billId)}','${escHtml(key)}')">${__('split.pay.partial')}</button>`;
  if (paid) {
    return `<span class="split-paid-badge" style="cursor:pointer" title="${__('split.pay.setAmountTitle')}"
      onclick="openSplitPartial('${escHtml(billId)}','${escHtml(key)}')">✅ ${__('split.paidLabel')}</span>`;
  }
  const paidAmt = opts ? (parseFloat(opts.paidAmount) || 0) : 0;
  const progress = paidAmt > 0.005
    ? `<span class="split-partial-chip" title="${__('split.pay.setAmountTitle')}"
        onclick="openSplitPartial('${escHtml(billId)}','${escHtml(key)}')">${formatMoney(paidAmt)} / ${formatMoney(parseFloat(opts.share) || 0)}</span>`
    : '';
  return `
    ${progress}
    <label class="split-paid-toggle" title="${__('split.markPaidTitle')}">
      <input type="checkbox" data-mark-paid data-bill="${escHtml(billId)}" data-pkey="${escHtml(key)}" style="width:16px;height:16px;cursor:pointer">
      <span>${__('split.paidLabel')}</span>
    </label>
    ${editBtn}`;
}

function _splitBillTitle(b) {
  const tag = (b.tag || '').trim();
  const note = (b.note || '').trim();
  return { title: tag || note || __('split.billDefault'), note };
}

function _splitEmpty() {
  return `<div class="empty-state"><div class="empty-icon">🎉</div><div class="empty-text">${__('split.noPending')}</div></div>`;
}

function _splitContactCardHtml(pc) {
  const owe = pc.total;
  const settledAll = owe === 0;
  const hasUnknown = (pc.bills || []).some(b => b.unknown);
  const key = pc.contactId || 'anon:' + pc.name;
  const expanded = _splitExpandStates['contact:' + key] === true;
  return `
    <div class="card split-contact-card" data-contact="${escHtml(key)}">
      <div class="split-contact-header">
        <span style="font-weight:600;word-break:break-word;cursor:pointer;flex:1;min-width:0" onclick="toggleSplitContactExpand('${escHtml(key)}')">${expanded ? '▼' : '▶'} 👤 ${escHtml(pc.name)}</span>
        ${settledAll
          ? `<span class="split-paid-badge">✅ ${__('split.allSettled')}</span>`
          : `<span style="color:var(--danger);font-weight:700;cursor:pointer" onclick="toggleSplitContactExpand('${escHtml(key)}')">${formatMoney(owe)}${hasUnknown ? ' ❓' : ''}</span>
             <button class="btn btn-outline btn-sm" style="flex-shrink:0;padding:1px 8px;font-size:0.72rem" onclick="openSplitReceive('${escHtml(key)}')">💰 ${__('split.pay.receive')}</button>`}
      </div>
      ${expanded ? pc.bills.map(b => {
        const t = _splitBillTitle({ tag: b.billTag, note: b.billNote });
        return `
          <div class="split-pending-row" data-bill-id="${b.billId}" style="${b.paid ? 'opacity:0.75' : ''}">
            <div style="flex:1;min-width:0">
              <div style="word-break:break-word;font-size:0.85rem">
                ${escHtml(t.title)}
              </div>
              <div style="display:flex;align-items:center;gap:4px;flex-wrap:wrap">
                ${_splitCatChip(b.billCategoryId)}
                ${t.note && t.note !== t.title ? `<span class="text-xs text-muted" style="word-break:break-word">📝 ${escHtml(t.note)}</span>` : ''}
                <span class="text-xs text-muted">${b.date} · ${b.unknown ? '❓ ' + __('split.unknownAmount') : formatMoney(b.amount)}</span>
                ${b.partial ? `<span class="text-xs" style="color:var(--warning)">${__('split.pay.remainingShort', formatMoney(b.owed))}</span>` : ''}
              </div>
            </div>
            <div style="display:flex;align-items:center;gap:6px;flex-shrink:0;flex-wrap:wrap;justify-content:flex-end">
              ${_splitPaidControl(b.billId, pc.contactId, pc.name, b.paid, { paidAmount: b.paidAmount, share: b.amount })}
              <button class="btn btn-ghost btn-sm" style="padding:0 6px;font-size:0.7rem" onclick="openSplitBillEditor('${b.billId}')" title="${__('split.editBillTitle')}">✏️</button>
            </div>
          </div>`;
      }).join('') : ''}
    </div>`;
}

function _splitPeopleView() {
  const pending = getPendingSummary({ includePaid: true });
  if (pending.perContact.length === 0) return _splitEmpty();
  return pending.perContact.map(pc => _splitContactCardHtml(pc)).join('');
}

function _splitPersonRow(name, amtDisp, controlHtml) {
  return `
    <div class="split-person-row">
      <span style="flex:1;min-width:0;word-break:break-word">👤 ${escHtml(name)}</span>
      <span class="font-semibold" style="flex-shrink:0">${amtDisp}</span>
      ${controlHtml || ''}
    </div>`;
}

function _splitBillCard(b, opts) {
  const c = billContrib(b);
  const settled = c.unpaid <= 0;
  const archived = !!b.archived;
  const t = _splitBillTitle(b);
  const expanded = _splitExpandStates['bill:' + b.id] === true;
  const compact = _splitCompactView && !expanded;
  const statusHtml = archived
    ? `<span class="split-paid-badge">🗂 ${__('split.archived')}</span>`
    : (settled
      ? `<span class="text-xs" style="color:var(--success);font-weight:600">✅ ${__('split.allSettled')}</span>`
      : `<span class="text-xs" style="color:var(--warning);font-weight:600">${__('split.unpaid')} ${formatMoney(c.unpaid)}</span>`);
  const actionsHtml = archived
    ? `
      <button class="btn btn-ghost btn-sm" onclick="openSplitBillEditor('${b.id}')">✏️ ${__('split.editBillTitle')}</button>
      <button class="btn btn-outline btn-sm" onclick="unarchiveSplitBill('${b.id}')">↩️ ${__('split.unarchiveBtn')}</button>`
    : `
      <button class="btn btn-ghost btn-sm" onclick="openSplitBillEditor('${b.id}')">✏️ ${__('split.editBillTitle')}</button>
      ${settled ? `<button class="btn btn-outline btn-sm" style="color:var(--danger);border-color:var(--danger)" onclick="openSplitBillSettleOptions('${b.id}')">🗑 ${__('split.deleteBill')}</button>` : ''}`;
  const peopleHtml = `
    <div style="border-top:1px dashed var(--border);margin-top:8px;padding-top:8px;display:flex;flex-direction:column;gap:4px">
      ${((b.selfShare || 0) > 0 || b.selfUnknown) ? _splitPersonRow(__('split.me'), b.selfUnknown ? '❓ ' + __('split.unknownAmount') : formatMoney(b.selfShare), `<span class="split-paid-badge">✅ ${__('split.paidLabel')}</span>`) : ''}
      ${(b.participants || []).map(p => {
        const amt = partShare(p);
        const pd = partPaid(p);
        const base = p.unknown ? '❓ ' + __('split.unknownAmount') : formatMoney(amt);
        const disp = (pd > 0.005 && !partSettled(p))
          ? `${base} <span class="text-xs" style="color:var(--warning)">(${__('split.pay.remainingShort', formatMoney(partOwed(p)))})</span>`
          : base;
        const control = b.archived ? '' : _splitPaidControl(b.id, p.contactId, p.name, partSettled(p), { paidAmount: pd, share: amt });
        return _splitPersonRow(p.name || __('split.unknown'), disp, control);
      }).join('')}
    </div>`;
  const headerHtml = compact
    ? `<div style="display:flex;align-items:center;gap:8px;cursor:pointer;min-width:0" onclick="toggleSplitBillExpand('${b.id}')">
        <span style="flex-shrink:0;font-size:0.7rem;color:var(--text-muted)">▶</span>
        <span style="font-weight:600;font-size:0.88rem;word-break:break-word;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1;min-width:0">${escHtml(t.title)}</span>
        ${_splitCatChip(b.categoryId)}
        <span class="text-xs text-muted" style="flex-shrink:0">${String(b.date || '').slice(0, 10)}</span>
        <span class="font-bold" style="font-size:0.9rem;flex-shrink:0">${formatMoney(b.amount)}</span>
        <span style="flex-shrink:0">${statusHtml}</span>
      </div>`
    : `<div style="display:flex;align-items:flex-start;justify-content:space-between;gap:8px">
        <div style="flex:1;min-width:0">
          <div style="display:flex;align-items:center;gap:6px;cursor:pointer" onclick="toggleSplitBillExpand('${b.id}')">
            <span style="flex-shrink:0;font-size:0.75rem;color:var(--text-muted)">${expanded ? '▼' : '▶'}</span>
            <span style="font-size:0.95rem;font-weight:600;word-break:break-word;line-height:1.35">${escHtml(t.title)}</span>
          </div>
          ${t.note && t.note !== t.title ? `<div class="text-xs text-muted" style="margin-top:2px;word-break:break-word">📝 ${escHtml(t.note)}</div>` : ''}
          <div style="display:flex;align-items:center;gap:4px;flex-wrap:wrap;margin-top:2px">
            ${_splitCatChip(b.categoryId)}
            <span class="text-xs text-muted">${String(b.date || '').slice(0, 10)}</span>
            <span class="text-xs text-muted">${__('split.myShare')} ${b.selfUnknown ? '❓ ' + __('split.unknownAmount') : formatMoney(b.selfShare || 0)}</span>
          </div>
        </div>
        <div class="text-right" style="flex-shrink:0;display:flex;flex-direction:column;align-items:flex-end;gap:2px">
          <div class="font-bold" style="font-size:0.95rem">${formatMoney(b.amount)}</div>
          ${statusHtml}
        </div>
      </div>`;
  return `
    <div class="card split-history-row" data-bill-id="${b.id}" style="${archived ? 'opacity:0.72' : ''}">
      ${headerHtml}
      ${compact ? '' : `
      <div style="display:flex;gap:6px;margin-top:8px;justify-content:flex-end;flex-wrap:wrap">${actionsHtml}</div>
      ${expanded ? peopleHtml : ''}
      `}
    </div>`;
}

function _splitBillView() {
  const bills = getSplitBills();
  if (bills.length === 0) return _splitEmpty();
  const active = bills.filter(b => !b.archived);
  if (active.length === 0) return _splitEmpty();
  return active.map(b => _splitBillCard(b)).join('');
}

function _splitArchivedView() {
  const archivedList = getSplitBills().filter(b => b.archived);
  if (archivedList.length === 0) {
    return `<div class="empty-state"><div class="empty-icon">🗂</div><div class="empty-text">${__('split.archivedEmpty')}</div></div>`;
  }
  return archivedList.map(b => _splitBillCard(b, { archived: true })).join('');
}

function openSplitCenter() {
  _splitEditorFromRecords = false;
  const pending = getPendingSummary();
  const archivedCount = getSplitBills().filter(b => b.archived).length;
  const bodyId = 'splitCenterBody_' + Date.now();

  const overlay = document.getElementById('modalOverlay');
  const content = document.getElementById('modalContent');
  content.innerHTML = '';
  content.insertAdjacentHTML('beforeend',
    `<div class="modal-title" style="font-size:1.1rem">🧾 ${__('split.centerTitle')}</div>` +
    `<div class="split-tabs">` +
      `<button class="split-tab ${_splitCenterView === 'people' ? 'active' : ''}" onclick="setSplitCenterView('people')">👥 ${__('split.viewPeople')}</button>` +
      `<button class="split-tab ${_splitCenterView === 'bill' ? 'active' : ''}" onclick="setSplitCenterView('bill')">🧾 ${__('split.viewBills')}</button>` +
      `<button class="split-tab ${_splitCenterView === 'archived' ? 'active' : ''}" onclick="setSplitCenterView('archived')">${__('split.archivedSection')} (${archivedCount})</button>` +
      `<button class="split-tab" style="margin-left:auto" onclick="toggleSplitCompactView()" title="${__('split.compactToggleTitle')}">${_splitCompactView ? '📖 ' + __('split.viewDetailed') : '📏 ' + __('split.viewCompact')}</button>` +
    `</div>` +
    `<div style="max-height:62vh;overflow-y:auto;overscroll-behavior:contain;padding:4px 0" id="${bodyId}"></div>`
  );
  const body = document.getElementById(bodyId);

  if (_splitCenterView !== 'archived') {
    // Summary (unpaid only)
    body.insertAdjacentHTML('beforeend',
      `<div class="card split-summary-card">` +
        `<div class="flex items-center justify-between" style="padding:4px 0">` +
          `<span class="text-sm">${__('split.pendingTotal')}</span>` +
          `<span class="font-bold" style="color:${pending.total > 0 ? 'var(--danger)' : 'var(--success)'}">${formatMoney(pending.total)}</span>` +
        `</div>` +
        `<div class="flex items-center justify-between" style="padding:4px 0">` +
          `<span class="text-sm">${__('split.pendingCount')}</span>` +
          `<span class="font-semibold">${pending.count} ${__('split.items')}</span>` +
        `</div>` +
      `</div>`
    );
  }

  // View content
  body.insertAdjacentHTML('beforeend',
    _splitCenterView === 'archived' ? _splitArchivedView()
      : (_splitCenterView === 'bill' ? _splitBillView() : _splitPeopleView())
  );

  // Actions
  content.insertAdjacentHTML('beforeend',
    `<div class="modal-actions" style="flex-wrap:wrap">` +
      `<button class="btn btn-outline btn-sm" onclick="openSplitContactManager()">👥 ${__('split.manageContacts')}</button>` +
      `<button class="btn btn-primary" onclick="closeSplitCenter()">✅ ${__('split.done')}</button>` +
    `</div>`
  );

  overlay.classList.add('open');
  document.body.classList.add('modal-open');
  overlay.onclick = (e) => { if (e.target === overlay) closeSplitCenter(); };

  // Delegate paid-toggling (avoids inline JS with user-supplied names)
  _bindPaidControls(body);
}

function _bindPaidControls(scope) {
  (scope || document).querySelectorAll('[data-mark-paid]').forEach(cb => {
    cb.addEventListener('change', function() {
      markSplitPaid(this.getAttribute('data-bill'), this.getAttribute('data-pkey'), this.checked);
    });
  });
}

function _refreshCenterPaidState(billId, contactKey, paid) {
  const overlay = document.getElementById('modalOverlay');
  if (!overlay || !overlay.classList.contains('open')) return;
  const body = overlay.querySelector('[id^="splitCenterBody_"]');
  if (!body) return;
  const bill = getSplitBill(billId);
  const p = getPendingSummary();
  const sumCard = body.querySelector('.split-summary-card');
  if (sumCard) {
    const vals = sumCard.querySelectorAll('.font-bold, .font-semibold');
    if (vals.length >= 2) {
      vals[0].textContent = formatMoney(p.total);
      vals[0].style.color = p.total > 0 ? 'var(--danger)' : 'var(--success)';
      vals[1].textContent = p.count + ' ' + __('split.items');
    }
  }
  if (_splitCenterView === 'bill') {
    const cb = body.querySelector('.split-paid-toggle input[data-bill="' + billId + '"]');
    const card = cb ? cb.closest('.split-history-row') : null;
    if (card) {
      const tmp = document.createElement('div');
      tmp.innerHTML = _splitBillCard(bill);
      card.replaceWith(tmp.firstElementChild);
      _bindPaidControls(tmp.firstElementChild);
    }
  } else {
    const pcs = getPendingSummary({ includePaid: true }).perContact;
    const pc = pcs.find(x => x.contactId === contactKey);
    const row = body.querySelector('.split-pending-row[data-bill-id="' + billId + '"]');
    const card = row ? row.closest('.split-contact-card') : null;
    if (pc && card) {
      const tmp = document.createElement('div');
      tmp.innerHTML = _splitContactCardHtml(pc);
      card.replaceWith(tmp.firstElementChild);
      _bindPaidControls(tmp.firstElementChild);
    }
  }
}

function closeSplitCenter() {
  closeModal();
  refreshCurrentPage();
}

function markSplitPaid(billId, contactKey, paid) {
  const bill = getSplitBill(billId);
  if (!bill) return;
  if (bill.archived) return;
  const participants = (bill.participants || []).map(p => {
    const key = p.contactId || 'anon:' + (p.name || '');
    return key === contactKey ? withPaidAmount(p, paid ? partShare(p) : 0) : p;
  });
  updateSplitBill(billId, { participants });
  showToast(paid ? __('split.paidToast') : __('split.unpaidToast'));
  _refreshCenterPaidState(billId, contactKey, paid);
}

/* Set one participant's repaid amount outright (partial repayment / correction).
   Returns { ok, error } so callers can surface the limit that was hit. */
function setSplitPaidAmount(billId, contactKey, amount) {
  const bill = getSplitBill(billId);
  if (!bill) return { ok: false, error: __('split.pay.errorNoBill') };
  const target = (bill.participants || []).find(p => (p.contactId || 'anon:' + (p.name || '')) === contactKey);
  if (!target) return { ok: false, error: __('split.pay.errorNoPerson') };
  const share = partShare(target);
  const v = parseFloat(amount);
  if (!isFinite(v) || v < 0) return { ok: false, error: __('split.pay.errorNegative') };
  if (round2(v) > round2(share) + 0.005) {
    return { ok: false, error: __('split.pay.errorOverShare', formatMoney(share)) };
  }
  const participants = (bill.participants || []).map(p => {
    const key = p.contactId || 'anon:' + (p.name || '');
    return key === contactKey ? withPaidAmount(p, v) : p;
  });
  const patch = { participants };
  // Reopening an archived bill that is no longer fully settled keeps the two
  // states consistent (same rule the editor uses).
  if (bill.archived && participants.some(x => !partSettled(x))) patch.archived = false;
  updateSplitBill(billId, patch);
  logEvent('splitSetPaidAmount', 'bill=' + billId + ' amount=' + round2(v));
  return { ok: true };
}

/* ============================================================
   PARTIAL REPAYMENT DIALOGS
   ============================================================ */

/* One participant on one bill: set the repaid amount outright. Doubles as the
   undo path — the quick buttons cover "all of it" and "nothing yet". */
function openSplitPartial(billId, contactKey) {
  const bill = getSplitBill(billId);
  if (!bill) { showToast(__('split.pay.errorNoBill'), 'error'); return; }
  const p = (bill.participants || []).find(x => (x.contactId || 'anon:' + (x.name || '')) === contactKey);
  if (!p) { showToast(__('split.pay.errorNoPerson'), 'error'); return; }
  const share = partShare(p);
  const paid = partPaid(p);
  const t = _splitBillTitle(bill);
  showModal(`
    <div class="modal-title">💰 ${__('split.pay.setAmountTitle')}</div>
    <div class="split-form">
      <div class="split-pay-head">
        <div style="font-weight:600;word-break:break-word">👤 ${escHtml(p.name || __('split.unknown'))}</div>
        <div class="text-xs text-muted" style="word-break:break-word">${escHtml(t.title)} · ${String(bill.date || '').slice(0, 10)}</div>
      </div>
      <div class="split-form-row">
        <span class="split-form-label">${__('split.pay.shareLabel')}</span>
        <span class="font-semibold">${formatMoney(share)}</span>
      </div>
      <div class="split-form-row">
        <span class="split-form-label">${__('split.pay.paidLabel')}</span>
        <span style="display:flex;align-items:center;gap:2px;flex-shrink:0">
          <span style="font-size:0.7rem;color:var(--text-muted)">RM</span>
          <input type="number" id="splitPartialAmount" class="input-field" min="0" max="${share}" step="0.01"
                 value="${paid > 0.005 ? round2(paid) : ''}" placeholder="0.00" style="width:120px"
                 oninput="_splitPartialPreview(${share})">
        </span>
      </div>
      <div class="flex gap-8" style="flex-wrap:wrap;margin-top:2px">
        <button type="button" class="btn btn-sm btn-outline" onclick="_splitPartialSet(${round2(share)},${share})">${__('split.pay.quickFull')}</button>
        <button type="button" class="btn btn-sm btn-ghost" onclick="_splitPartialSet(0,${share})">${__('split.pay.quickNone')}</button>
      </div>
      <div id="splitPartialPreview" class="split-share-preview" style="margin-top:8px"></div>
      <div class="modal-actions" style="margin-top:10px">
        <button class="btn btn-ghost" onclick="closeModal();openSplitCenter()">${__('split.cancel')}</button>
        <button class="btn btn-primary" onclick="confirmSplitPartial('${escHtml(billId)}','${escHtml(contactKey)}')">💾 ${__('split.save')}</button>
      </div>
    </div>
  `);
  _splitPartialPreview(share);
}

function _splitPartialSet(v, share) {
  const el = document.getElementById('splitPartialAmount');
  if (el) el.value = v > 0 ? v : '';
  _splitPartialPreview(share);
}

function _splitPartialPreview(share) {
  const el = document.getElementById('splitPartialAmount');
  const box = document.getElementById('splitPartialPreview');
  if (!el || !box) return;
  const raw = String(el.value).trim();
  const v = raw === '' ? 0 : parseFloat(raw);
  if (!isFinite(v) || v < 0) {
    box.innerHTML = '<span class="text-xs" style="color:var(--danger)">⚠️ ' + __('split.pay.errorNegative') + '</span>';
    return;
  }
  if (round2(v) > round2(share) + 0.005) {
    box.innerHTML = '<span class="text-xs" style="color:var(--danger)">⚠️ ' + __('split.pay.errorOverShare', formatMoney(share)) + '</span>';
    return;
  }
  const left = round2(share - v);
  box.innerHTML = left <= 0.005
    ? '<span class="split-share-chip">✅ ' + __('split.allSettled') + '</span>'
    : '<span class="split-share-chip">' + __('split.pay.remainingShort', formatMoney(left)) + '</span>';
}

function confirmSplitPartial(billId, contactKey) {
  const el = document.getElementById('splitPartialAmount');
  const raw = el ? String(el.value).trim() : '';
  const res = setSplitPaidAmount(billId, contactKey, raw === '' ? 0 : raw);
  if (!res.ok) { showToast(res.error, 'error'); return; }
  closeModal();
  showToast(__('split.pay.savedToast'));
  openSplitCenter();
  refreshCurrentPage();
}

/* ---------- Multi-bill repayment ("收款登记") ---------- */
let _payState = null;   // { contactKey, name, rows, selected:Set, mode }

function openSplitReceive(contactKey) {
  const rows = [];
  (DataStore._data.splitBills || []).forEach(b => {
    if (b.archived) return;   // archived debts are closed — reopen them first
    (b.participants || []).forEach(p => {
      const key = p.contactId || 'anon:' + (p.name || '');
      if (key !== contactKey) return;
      const owed = partOwed(p);
      if (owed <= 0.005) return;
      const t = _splitBillTitle(b);
      rows.push({
        billId: b.id, contactKey: key, name: p.name || __('split.unknown'),
        label: t.title, date: String(b.date || '').slice(0, 10),
        share: partShare(p), paidAmount: partPaid(p), remaining: owed,
        unknown: !!p.unknown
      });
    });
  });
  if (rows.length === 0) { showToast(__('split.pay.errorNothingDue'), 'error'); return; }
  rows.sort((a, b) => (a.date || '').localeCompare(b.date || ''));   // oldest first
  _payState = {
    contactKey,
    name: rows[0].name,
    rows,
    selected: new Set(rows.map(r => r.billId)),   // start with everything selected
    mode: 'even'
  };
  _renderSplitReceive();
}

function _renderSplitReceive() {
  const st = _payState;
  if (!st) return;
  const totalDue = round2(st.rows.reduce((s, r) => s + r.remaining, 0));
  showModal(`
    <div class="modal-title">💰 ${__('split.pay.receiveTitle', escHtml(st.name))}</div>
    <div class="split-form">
      <div class="split-form-row">
        <span class="split-form-label">${__('split.pay.totalDue')}</span>
        <span class="font-bold" style="color:var(--danger)">${formatMoney(totalDue)}</span>
      </div>
      <div class="split-form-row">
        <span class="split-form-label">${__('split.pay.amountLabel')}</span>
        <span style="display:flex;align-items:center;gap:2px;flex-shrink:0">
          <span style="font-size:0.7rem;color:var(--text-muted)">RM</span>
          <input type="number" id="splitPayAmount" class="input-field" min="0" step="0.01" placeholder="0.00"
                 style="width:130px" oninput="updateSplitPayPreview()">
        </span>
        <button type="button" class="btn btn-sm btn-ghost" onclick="setSplitPayAmountToSelected()">${__('split.pay.fillSelected')}</button>
      </div>
      <div class="split-form-row split-form-row-top">
        <span class="split-form-label">${__('split.pay.modeLabel')}</span>
        <label class="split-mode-opt"><input type="radio" name="splitPayMode" value="even" ${st.mode === 'even' ? 'checked' : ''} onchange="setSplitPayMode('even')"> ${__('split.pay.modeEven')}</label>
        <label class="split-mode-opt"><input type="radio" name="splitPayMode" value="ordered" ${st.mode === 'ordered' ? 'checked' : ''} onchange="setSplitPayMode('ordered')"> ${__('split.pay.modeOrdered')}</label>
        <label class="split-mode-opt"><input type="radio" name="splitPayMode" value="manual" ${st.mode === 'manual' ? 'checked' : ''} onchange="setSplitPayMode('manual')"> ${__('split.pay.modeManual')}</label>
      </div>
      <div class="text-xs text-muted">${__('split.pay.modeHint.' + st.mode)}</div>
      <div class="split-form-row split-form-row-top" style="gap:6px">
        <span class="split-form-label">${__('split.pay.selectLabel')}</span>
        <button type="button" class="btn btn-sm btn-ghost" onclick="splitPaySelectAll()">${__('split.pay.selectAll')}</button>
        <button type="button" class="btn btn-sm btn-ghost" onclick="splitPaySelectNone()">${__('split.pay.selectNone')}</button>
        <button type="button" class="btn btn-sm btn-ghost" onclick="splitPaySelectInvert()">${__('split.pay.selectInvert')}</button>
      </div>
      <div id="splitPayList" class="split-pay-list">${_splitPayRowsHtml()}</div>
      <div id="splitPayPreview" class="split-share-preview" style="margin-top:8px"></div>
      <div class="modal-actions" style="margin-top:10px">
        <button class="btn btn-ghost" onclick="closeModal();openSplitCenter()">${__('split.cancel')}</button>
        <button class="btn btn-primary" id="splitPayConfirmBtn" onclick="confirmSplitReceive()">✅ ${__('split.pay.confirm')}</button>
      </div>
    </div>
  `);
  updateSplitPayPreview();
}

function _splitPayRowsHtml() {
  const st = _payState;
  if (!st) return '';
  return st.rows.map(r => {
    const on = st.selected.has(r.billId);
    return `
      <div class="split-pay-row ${on ? '' : 'off'}" data-bill="${escHtml(r.billId)}">
        <label style="display:flex;align-items:center;gap:6px;cursor:pointer;flex:1;min-width:0">
          <input type="checkbox" ${on ? 'checked' : ''} style="width:16px;height:16px;cursor:pointer"
                 onchange="toggleSplitPayRow('${escHtml(r.billId)}', this.checked)">
          <span style="flex:1;min-width:0">
            <span style="word-break:break-word">${escHtml(r.label)}${r.unknown ? ' ❓' : ''}</span>
            <span class="text-xs text-muted" style="display:block">${r.date} · ${__('split.pay.rowRemaining', formatMoney(r.remaining), formatMoney(r.share))}</span>
          </span>
        </label>
        <span class="split-pay-alloc" data-alloc="${escHtml(r.billId)}"></span>
        <span class="split-pay-manual" style="display:${st.mode === 'manual' ? '' : 'none'};align-items:center;gap:2px;flex-shrink:0">
          <span style="font-size:0.7rem;color:var(--text-muted)">RM</span>
          <input type="number" class="input-field split-person-amount" min="0" max="${r.remaining}" step="0.01"
                 placeholder="0.00" data-manual="${escHtml(r.billId)}" ${on ? '' : 'disabled'}
                 oninput="updateSplitPayPreview()">
        </span>
      </div>`;
  }).join('');
}

function setSplitPayMode(mode) {
  if (!_payState) return;
  _payState.mode = (mode === 'ordered' || mode === 'manual') ? mode : 'even';
  _renderSplitReceive();
}

function toggleSplitPayRow(billId, on) {
  if (!_payState) return;
  if (on) _payState.selected.add(billId); else _payState.selected.delete(billId);
  const row = document.querySelector('.split-pay-row[data-bill="' + billId + '"]');
  if (row) {
    row.classList.toggle('off', !on);
    const man = row.querySelector('input[data-manual]');
    if (man) { man.disabled = !on; if (!on) man.value = ''; }
  }
  updateSplitPayPreview();
}

function splitPaySelectAll() { _splitPaySetSelection(() => true); }
function splitPaySelectNone() { _splitPaySetSelection(() => false); }
function splitPaySelectInvert() {
  if (!_payState) return;
  const sel = _payState.selected;
  _splitPaySetSelection(r => !sel.has(r.billId));
}

function _splitPaySetSelection(pred) {
  const st = _payState;
  if (!st) return;
  const next = new Set();
  st.rows.forEach(r => { if (pred(r)) next.add(r.billId); });
  st.selected = next;
  document.querySelectorAll('.split-pay-row').forEach(row => {
    const id = row.getAttribute('data-bill');
    const on = next.has(id);
    const cb = row.querySelector('input[type="checkbox"]');
    if (cb) cb.checked = on;
    row.classList.toggle('off', !on);
    const man = row.querySelector('input[data-manual]');
    if (man) { man.disabled = !on; if (!on) man.value = ''; }
  });
  updateSplitPayPreview();
}

/* Selected rows in list order (already oldest-first, which is what 'ordered' means) */
function _splitPaySelectedRows() {
  const st = _payState;
  if (!st) return [];
  return st.rows.filter(r => st.selected.has(r.billId));
}

function setSplitPayAmountToSelected() {
  const el = document.getElementById('splitPayAmount');
  if (!el) return;
  const sum = round2(_splitPaySelectedRows().reduce((s, r) => s + r.remaining, 0));
  el.value = sum > 0 ? sum : '';
  updateSplitPayPreview();
}

function _splitPayManualMap() {
  const map = {};
  document.querySelectorAll('#splitPayList input[data-manual]').forEach(el => {
    if (!el.disabled) map[el.getAttribute('data-manual')] = el.value;
  });
  return map;
}

function updateSplitPayPreview() {
  const st = _payState;
  const box = document.getElementById('splitPayPreview');
  if (!st || !box) return;
  const rows = _splitPaySelectedRows();
  const amtEl = document.getElementById('splitPayAmount');
  const btn = document.getElementById('splitPayConfirmBtn');
  document.querySelectorAll('[data-alloc]').forEach(el => { el.textContent = ''; });

  const manual = st.mode === 'manual' ? _splitPayManualMap() : null;
  const amount = st.mode === 'manual'
    ? 0
    : (amtEl && String(amtEl.value).trim() !== '' ? parseFloat(amtEl.value) : 0);

  if (st.mode !== 'manual' && !(amount > 0)) {
    window._payPlan = null;
    if (btn) btn.disabled = true;
    box.innerHTML = '<span class="text-xs text-muted">' + __('split.pay.previewNeedAmount') + '</span>';
    return;
  }
  const res = allocateRepayment(amount, rows, st.mode, manual);
  if (!res.ok) {
    window._payPlan = null;
    if (btn) btn.disabled = true;
    box.innerHTML = '<span class="text-xs" style="color:var(--danger)">⚠️ ' + res.error + '</span>';
    return;
  }
  window._payPlan = res.alloc;
  if (btn) btn.disabled = false;
  // Mirror the plan onto each row, and in manual mode keep the header total live
  const byId = {};
  res.alloc.forEach(a => { byId[a.billId] = a.amount; });
  st.rows.forEach(r => {
    const el = document.querySelector('[data-alloc="' + r.billId + '"]');
    if (!el) return;
    const v = byId[r.billId] || 0;
    el.textContent = v > 0 ? '→ ' + formatMoney(v) : '';
  });
  if (st.mode === 'manual' && amtEl) amtEl.value = res.allocated > 0 ? round2(res.allocated) : '';
  const cleared = res.alloc.filter(a => {
    const r = st.rows.find(x => x.billId === a.billId);
    return r && round2(r.remaining - a.amount) <= 0.005;
  }).length;
  box.innerHTML =
    `<span class="split-share-chip">${__('split.pay.previewApplied', formatMoney(res.allocated), res.alloc.length)}</span>` +
    (cleared > 0 ? `<span class="split-share-chip">✅ ${__('split.pay.previewCleared', cleared)}</span>` : '');
}

function confirmSplitReceive() {
  const plan = window._payPlan;
  if (!plan || !plan.length) { showToast(__('split.pay.previewNeedAmount'), 'error'); return; }
  const res = applyRepayment(plan);
  window._payPlan = null;
  _payState = null;
  closeModal();
  if (res.touched === 0) { showToast(__('split.pay.errorNothingDue'), 'error'); openSplitCenter(); return; }
  showToast(__('split.pay.appliedToast', formatMoney(res.applied), res.touched));
  openSplitCenter();
  refreshCurrentPage();
}

/* ============================================================
   SPLIT BILL EDITOR MODAL
   ============================================================ */
let _splitEditorFromRecords = false;

function openSplitBillEditor(billId, fromRecords) {
  const bill = getSplitBill(billId);
  if (!bill) return;
  _splitEditorFromRecords = !!fromRecords;
  window._editingSplitBillId = billId;
  const contacts = getContacts();
  const selfInvolved = (bill.selfShare || 0) > 0 || !!bill.selfUnknown;
  const pCount = (bill.participants || []).length;
  const divCount = pCount + (selfInvolved ? 1 : 0);
  const uniform = bill.amount > 0 && divCount > 0 ? bill.amount / divCount : 0;
  // Prefer the stored split mode (B): equal splits reopen as "equal" so computed
  // shares stay blank inputs, not dead "specified" values. Legacy bills without a
  // mode field fall back to deviation detection.
  let mode = 'equal';
  if (bill.mode === 'specified') {
    mode = 'specified';
  } else if (!bill.mode && bill.amount > 0 && divCount > 0) {
    const selfDev = selfInvolved && !bill.selfUnknown && Math.abs((bill.selfShare || 0) - uniform) > 0.01;
    const partDev = (bill.participants || []).some(p => !p.unknown && Math.abs((parseFloat(p.share) || 0) - uniform) > 0.01);
    if (selfDev || partDev) mode = 'specified';
  }
  const rowsByKey = {};
  contacts.forEach(c => { rowsByKey[c.id] = { contactId: c.id, name: c.name, included: false, amount: '', unknown: false }; });
  (bill.participants || []).forEach(p => {
    const key = p.contactId || ('anon:' + (p.name || ''));
    // An unknown-amount person has no meaningful typed value — leave the box empty
    // so unchecking "unknown" gives a clean, editable field.
    const amt = p.unknown ? '' : String(p.share);
    if (rowsByKey[key]) {
      rowsByKey[key].included = true;
      rowsByKey[key].amount = amt;
      rowsByKey[key].unknown = !!p.unknown;
    } else {
      rowsByKey[key] = { contactId: key, name: p.name || __('split.unknown'), included: true, amount: amt, unknown: !!p.unknown };
    }
  });
  const st = {
    selfInvolved,
    selfUnknown: !!bill.selfUnknown,
    mode,
    tag: bill.tag || '',
    rows: Object.values(rowsByKey)
  };
  const dtValue = String(bill.date || bill.createdAt || '').slice(0, 16);
  // keep local; render editor
  showModal(`
    <div class="modal-title">🧾 ${__('split.editTitle')}</div>
    <div class="split-form">
      <div class="split-form-row">
        <span class="split-form-label">${__('split.formTag')}</span>
        <input type="text" id="editSplitTag" class="input-field" placeholder="${__('split.formTagPlaceholder')}" maxlength="30" value="${escHtml(bill.tag || '')}" style="flex:1">
      </div>
      <div class="split-form-row">
        <span class="split-form-label">${__('split.formCategory')}</span>
        <button type="button" class="input-field" id="editSplitCatBtn" style="text-align:left;cursor:pointer;flex:1;display:flex;align-items:center;gap:6px" onclick="openCategoryPicker('split-edit')">
          ${bill.categoryId && DataStore.getCategory(bill.categoryId)
            ? `<span style="width:10px;height:10px;border-radius:50%;background:${escHtml(DataStore.getCategory(bill.categoryId).color)};display:inline-block;flex-shrink:0"></span><span>${escHtml(DataStore.getCategory(bill.categoryId).icon)} ${escHtml(DataStore.getCategory(bill.categoryId).name)}</span>`
            : `<span class="text-muted">${__('split.formCategoryPlaceholder')}</span>`}
        </button>
      </div>
      <div class="split-form-row">
        <span class="split-form-label">${__('split.dateLabel')}</span>
        <input type="datetime-local" id="editSplitDateTime" class="input-field" value="${escHtml(dtValue)}" style="flex:1">
      </div>
      <div class="split-form-row">
        <span class="split-form-label">${__('split.noteLabel')}</span>
        <input type="text" id="editSplitNote" class="input-field" placeholder="${__('split.notePlaceholder')}" value="${escHtml(bill.note || '')}" style="flex:1">
      </div>
      <div class="split-form-row">
        <span class="split-form-label">${__('split.totalLabel')}</span>
        <span style="display:flex;align-items:center;gap:2px;flex-shrink:0">
          <span style="font-size:0.7rem;color:var(--text-muted)">RM</span>
          <input type="number" id="editSplitAmount" class="input-field" min="0" step="0.01" value="${escHtml(String(bill.amount))}" oninput="updateEditSplitPreview()" style="width:110px">
        </span>
      </div>
      <div class="split-form-row">
        <label style="display:flex;align-items:center;gap:6px;cursor:pointer;flex:1;min-width:0">
          <input type="checkbox" id="editSplitSelf" ${st.selfInvolved ? 'checked' : ''} style="width:18px;height:18px;cursor:pointer" onchange="updateEditSplitPreview()">
          <span class="split-form-label" style="margin:0">${__('split.selfInvolved')}</span>
        </label>
        <label title="${__('split.unknownAmountTitle')}" style="display:flex;align-items:center;gap:3px;cursor:pointer;flex-shrink:0">
          <input type="checkbox" id="editSplitSelfUnknown" ${st.selfUnknown ? 'checked' : ''} style="width:14px;height:14px;cursor:pointer" onchange="updateEditSplitPreview()">
          <span class="text-xs text-muted" style="font-size:0.68rem">❓ ${__('split.unknownAmount')}</span>
        </label>
      </div>
      <div class="split-form-row" id="editSplitSelfRow">
        <span class="split-form-label">${__('split.selfAmountLabel')}</span>
        <span style="display:flex;align-items:center;gap:2px;flex-shrink:0">
          <span style="font-size:0.7rem;color:var(--text-muted)">RM</span>
          <input type="number" id="editSplitSelfAmount" class="input-field" min="0" step="0.01" placeholder="0.00" value="${escHtml(st.selfInvolved && !st.selfUnknown ? String(bill.selfShare) : '')}" oninput="onEditSplitAmountTyped(this)" style="width:110px">
        </span>
      </div>
      <div class="split-form-row split-form-row-top">
        <span class="split-form-label">${__('split.mode')}</span>
        <label class="split-mode-opt"><input type="radio" name="editSplitMode" value="equal" ${mode !== 'specified' ? 'checked' : ''} onchange="updateEditSplitPreview()"> ${__('split.modeEqual')}</label>
        <label class="split-mode-opt"><input type="radio" name="editSplitMode" value="specified" ${mode === 'specified' ? 'checked' : ''} onchange="updateEditSplitPreview()"> ${__('split.modeSpecified')}</label>
      </div>
      <div class="split-form-label" style="margin:6px 0 2px">${__('split.people')}</div>
      <div id="editSplitPeopleList">
        ${st.rows.map(r => `
          <div class="split-person-row">
            <label style="display:flex;align-items:center;gap:6px;cursor:pointer;flex:1;min-width:0">
              <input type="checkbox" data-edit-include ${r.included ? 'checked' : ''} style="width:16px;height:16px;cursor:pointer" onchange="updateEditSplitPreview()">
              <span style="flex:1;min-width:0;word-break:break-word">${escHtml(r.name)}</span>
            </label>
            <label title="${__('split.unknownAmountTitle')}" style="display:flex;align-items:center;gap:3px;cursor:pointer;flex-shrink:0">
              <input type="checkbox" data-edit-unknown="${escHtml(r.contactId || 'anon:' + r.name)}" ${r.unknown ? 'checked' : ''} style="width:14px;height:14px;cursor:pointer" onchange="updateEditSplitPreview()">
              <span class="text-xs text-muted" style="font-size:0.68rem">❓ ${__('split.unknownAmount')}</span>
            </label>
            <span style="display:flex;align-items:center;gap:2px;flex-shrink:0">
              <span style="font-size:0.7rem;color:var(--text-muted)">RM</span>
              <input type="number" class="input-field split-person-amount" min="0" step="0.01" placeholder="0.00" value="${escHtml(r.amount)}" oninput="onEditSplitAmountTyped(this)">
            </span>
          </div>
        `).join('')}
      </div>
      <div id="editSplitPreview" class="split-share-preview" style="margin-top:8px"></div>
      <div class="input-group" style="margin-top:6px">
        <label class="input-label">${__('split.paidCountLabel')}</label>
        <div id="editPaidCheckboxes" style="display:flex;flex-wrap:wrap;gap:8px">
          ${(bill.participants || []).map(p => `
            <label style="display:flex;align-items:center;gap:4px;cursor:pointer;font-size:0.8rem">
              <input type="checkbox" data-paid-contact="${escHtml(p.contactId || 'anon:' + p.name)}" ${partSettled(p) ? 'checked' : ''} style="width:15px;height:15px;cursor:pointer">
              ${escHtml(p.name || '')}${partPaid(p) > 0.005 && !partSettled(p)
                ? `<span class="text-xs" style="color:var(--warning)">(${__('split.partialPaidShort', formatMoney(partPaid(p)))})</span>` : ''}
            </label>
          `).join('') || '<span class="text-xs text-muted">' + __('split.noParticipants') + '</span>'}
        </div>
      </div>
      <div class="modal-actions" style="margin-top:10px">
        <button class="btn btn-ghost" onclick="closeModal();${_splitEditorFromRecords ? '' : "openSplitCenter();"}">${__('split.cancel')}</button>
        <button class="btn btn-danger btn-sm" onclick="openSplitBillDeleteConfirm('${billId}')">🗑️ ${__('split.delete')}</button>
        <button class="btn btn-primary" onclick="saveSplitBillEditor('${billId}')">💾 ${__('split.save')}</button>
      </div>
    </div>
  `);
  window._editSplitRows = st.rows;
  window._editSplitBillAmount = bill.amount;
  updateEditSplitPreview();
}

function _editSplitMode() {
  const radios = document.querySelectorAll('input[name="editSplitMode"]');
  for (const r of radios) if (r.checked) return r.value;
  return 'equal';
}

// Typing any per-person amount means the split is no longer a plain even share —
// flip the mode radio instead of silently discarding what was typed.
function onEditSplitAmountTyped(el) {
  if (el && String(el.value).trim() !== '' && _editSplitMode() !== 'specified') {
    const radio = document.querySelector('input[name="editSplitMode"][value="specified"]');
    if (radio) radio.checked = true;
  }
  updateEditSplitPreview();
}

function updateEditSplitPreview() {
  const rows = window._editSplitRows || [];
  const mode = _editSplitMode();
  const selfChk = document.getElementById('editSplitSelf');
  const selfUnkChk = document.getElementById('editSplitSelfUnknown');
  const selfRow = document.getElementById('editSplitSelfRow');
  const selfAmtEl = document.getElementById('editSplitSelfAmount');
  const self = selfChk ? selfChk.checked : false;
  const selfUnknown = self && selfUnkChk ? selfUnkChk.checked : false;
  if (selfUnkChk) selfUnkChk.disabled = !self;
  // "My amount" row: shown whenever I'm in the split and my share is known.
  // It is NOT gated on the mode — an empty box just means "give me the even share".
  if (selfRow) selfRow.style.display = (self && !selfUnknown) ? '' : 'none';
  if (selfUnknown && selfAmtEl) selfAmtEl.value = '';
  if (mode !== 'specified' && selfAmtEl) selfAmtEl.value = '';

  // Sync every row's state FROM the DOM — including the typed amount, which the
  // preview and the save path both read back out of state.
  document.querySelectorAll('#editSplitPeopleList .split-person-row').forEach((rowEl, i) => {
    const chk = rowEl.querySelector('input[data-edit-include]');
    const unkChk = rowEl.querySelector('input[data-edit-unknown]');
    const amt = rowEl.querySelector('.split-person-amount');
    const r = rows[i];
    if (!r) return;
    r.included = chk ? chk.checked : false;
    r.unknown = unkChk ? unkChk.checked : false;
    if (unkChk) unkChk.disabled = !r.included;
    if (amt) {
      // Equal mode has no per-person amounts; unknown people have none either.
      if (mode !== 'specified' || r.unknown) amt.value = '';
      amt.disabled = r.unknown || !r.included;
      r.amount = amt.value;
    } else {
      r.amount = '';
    }
  });

  const preview = document.getElementById('editSplitPreview');
  if (!preview) return;
  const amtEl = document.getElementById('editSplitAmount');
  const total = amtEl ? (parseFloat(amtEl.value) || 0) : (window._editSplitBillAmount || 0);
  window._editSplitBillAmount = total;
  const pool = [];
  if (self) {
    const selfVal = (!selfUnknown && mode === 'specified' && selfAmtEl && selfAmtEl.value !== '')
      ? parseFloat(selfAmtEl.value) : null;
    pool.push({ id: 'self', name: __('split.me'), specified: (selfVal !== null && isFinite(selfVal)) ? selfVal : null });
  }
  rows.forEach(r => { if (r.included) pool.push({ id: r.contactId, name: r.name, specified: mode === 'specified' && !r.unknown ? r.amount : null }); });
  if (!(total > 0) || pool.length === 0) {
    window._editSplitComputed = null;
    preview.innerHTML = '<span class="text-xs text-muted">' + __('split.previewNeedPeople') + '</span>';
    return;
  }
  const result = computeShares(total, pool, self);
  if (result.error) {
    window._editSplitComputed = null;
    preview.innerHTML = '<span class="text-xs" style="color:var(--danger)">⚠️ ' + result.error + '</span>';
    return;
  }
  preview.innerHTML = result.shares.map(s => {
    const selfTag = s.id === 'self' ? ' (自己)' : '';
    const unk = s.id === 'self' ? selfUnknown : !!rows.find(r => r.contactId === s.id && r.unknown);
    if (unk) {
      return `<span class="split-share-chip">${escHtml(s.name)}${selfTag}: <b>❓ ${__('split.unknownAmount')}</b></span>`;
    }
    return `<span class="split-share-chip">${escHtml(s.name)}${selfTag}: <b>${formatMoney(s.share)}</b></span>`;
  }).join('');
  // Show each person's computed share as a placeholder so an empty box reads as
  // "auto", not "missing" — the user can see the number they'd be overriding.
  document.querySelectorAll('#editSplitPeopleList .split-person-row').forEach((rowEl, i) => {
    const amt = rowEl.querySelector('.split-person-amount');
    const r = rows[i];
    if (!amt || !r) return;
    const sh = result.shares.find(s => s.id === r.contactId);
    amt.placeholder = (r.included && !r.unknown && sh) ? formatMoney(sh.share).replace(/[^\d.]/g, '') : '0.00';
  });
  if (selfAmtEl) {
    const selfSh = result.shares.find(s => s.id === 'self');
    selfAmtEl.placeholder = selfSh ? formatMoney(selfSh.share).replace(/[^\d.]/g, '') : '0.00';
  }
  // persist current computed shares for save
  window._editSplitComputed = result.shares;
  window._editSplitSelfUnknown = selfUnknown;
}

function saveSplitBillEditor(billId) {
  const bill = getSplitBill(billId);
  if (!bill) return;
  const tag = document.getElementById('editSplitTag') ? document.getElementById('editSplitTag').value.trim() : '';
  const noteEl = document.getElementById('editSplitNote');
  const note = noteEl ? noteEl.value.trim() : (bill.note || '');
  const dtEl = document.getElementById('editSplitDateTime');
  const newDate = dtEl && dtEl.value ? dtEl.value : (bill.date || '');
  const self = document.getElementById('editSplitSelf') ? document.getElementById('editSplitSelf').checked : false;
  const selfUnknown = self && !!window._editSplitSelfUnknown;
  const shares = window._editSplitComputed;
  if (!shares) { showToast(__('split.previewNeedPeople'), 'error'); return; }
  const selfShare = self ? (shares.find(s => s.id === 'self') || { share: 0 }).share : 0;
  const paidMap = {};
  document.querySelectorAll('#editPaidCheckboxes input[type="checkbox"]').forEach(chk => {
    paidMap[chk.getAttribute('data-paid-contact')] = chk.checked;
  });
  const participants = shares
    .filter(s => s.id !== 'self')
    .map(s => {
      const key = s.id;
      const prev = (bill.participants || []).find(p => (p.contactId || 'anon:' + p.name) === key);
      const unk = (window._editSplitRows || []).find(r => r.contactId === key);
      const base = { contactId: s.id, name: s.name, share: s.share,
                     unknown: unk ? !!unk.unknown : (prev ? !!prev.unknown : false) };
      const wasSettled = prev ? partSettled(prev) : false;
      const prevPaid = prev ? partPaid(prev) : 0;
      const checked = paidMap[key] !== undefined ? paidMap[key] : wasSettled;
      // Unchecking someone who only PARTLY repaid must not wipe what they did pay
      // — it just means they are not settled yet. The amount is re-clamped to the
      // (possibly edited) share by withPaidAmount.
      const amount = checked ? s.share : (wasSettled ? 0 : prevPaid);
      return withPaidAmount(base, amount);
    });
  const patch = {
    tag,
    note,
    selfShare,
    selfUnknown,
    participants,
    // Round-trip the entry mode so reopening the editor shows the same layout it
    // was saved with (without this, a custom split reopens as an even one).
    mode: _editSplitMode() === 'specified' ? 'specified' : 'equal'
  };
  if (bill.archived && participants.some(p => !partSettled(p))) patch.archived = false;
  const amtEl = document.getElementById('editSplitAmount');
  const newAmount = amtEl ? (parseFloat(amtEl.value) || 0) : bill.amount;
  const amountChanged = newAmount > 0 && Math.abs(newAmount - (parseFloat(bill.amount) || 0)) > 0.01;
  if (amountChanged) patch.amount = newAmount;
  if (newDate) patch.date = newDate;
  // The bill's tag field IS the record's tag list, joined — split it back so the
  // two never drift apart (records page filters and stats read r.tags)
  const recTags = tag.split(/[、,，]/).map(t => t.trim()).filter(Boolean);
  recTags.forEach(t => DataStore.addTagUsage(t));
  // Keep the linked record(s) in step with everything editable here
  (DataStore._data.records || []).forEach(r => {
    if (r.splitBillId !== billId) return;
    if (amountChanged) r.amount = newAmount;
    if (newDate) r.date = newDate;
    r.note = note;
    r.tags = recTags;
    r.updatedAt = new Date().toISOString();
  });
  if (amountChanged) logEvent('splitEditorAmountSync', 'id=' + billId);
  updateSplitBill(billId, patch);
  DataStore.save();
  closeModal();
  showToast(__('split.savedToast'));
  if (!_splitEditorFromRecords) openSplitCenter();
  refreshCurrentPage();
}

function openSplitBillSettleOptions(billId) {
  const bill = getSplitBill(billId);
  if (!bill) return;
  const t = _splitBillTitle(bill);
  showModal(`
    <div class="modal-title">🎉 ${__('split.settleTitle')}</div>
    <div style="border:1px solid var(--border);border-radius:8px;padding:10px 12px;margin-bottom:10px;word-break:break-word">
      <div style="font-weight:600">${escHtml(bill.tag || _splitBillTitle(bill).note || __('split.billDefault'))}</div>
      ${t.note && t.note !== (bill.tag || '').trim() ? `<div class="text-sm" style="color:var(--text-secondary)">📝 ${escHtml(t.note)}</div>` : ''}
      <div class="text-sm text-muted">${String(bill.date || '').slice(0, 10)} · ${formatMoney(bill.amount)}</div>
    </div>
    <div style="display:flex;flex-direction:column;gap:8px">
      <button class="btn btn-outline" onclick="archiveSplitBill('${billId}')">🗂 ${__('split.settleArchiveBtn')}</button>
      <button class="btn btn-primary" onclick="convertSplitBillToRecord('${billId}')">📒 ${__('split.settleConvertBtn')}</button>
    </div>
    <div class="text-xs text-muted" style="text-align:center;margin-top:10px">
      <a href="javascript:void(0)" style="color:var(--danger)" onclick="openSplitBillDeleteConfirm('${billId}')">🗑 ${__('split.settleDeleteLink')}</a>
    </div>
  `);
}

function archiveSplitBill(billId) {
  const bill = getSplitBill(billId);
  if (!bill) return;
  if (getSplitBillUnpaid(bill) > 0) {
    showToast(__('split.errorUnpaidArchive'), 'error');
    return;
  }
  updateSplitBill(billId, { archived: true });
  showToast(__('split.archivedToast'));
  if (!_splitEditorFromRecords) openSplitCenter();
  refreshCurrentPage();
}

function unarchiveSplitBill(billId) {
  const bill = getSplitBill(billId);
  if (!bill) return;
  updateSplitBill(billId, { archived: false });
  showToast(__('split.unarchiveToast'));
  openSplitCenter();
  refreshCurrentPage();
}

function convertSplitBillToRecord(billId) {
  const bill = getSplitBill(billId);
  if (!bill) return;
  const selfShare = parseFloat(bill.selfShare) || 0;
  if (!(selfShare > 0)) {
    showToast(__('split.convertNoSelfShare'), 'error');
    return;
  }
  (DataStore._data.records || []).forEach(r => {
    if (r.splitBillId === billId) {
      // Records carried the full bill amount; converting to a normal record must
      // only keep MY share — the repaid others' shares were never my real spending
      r.amount = selfShare;
      delete r.splitBillId;
    }
  });
  deleteSplitBill(billId);
  DataStore.save();
  showToast(__('split.convertToast'));
  if (!_splitEditorFromRecords) openSplitCenter();
  refreshCurrentPage();
  logEvent('splitConvertToRecord', 'id=' + billId);
}

function openSplitBillDeleteConfirm(billId) {
  const bill = getSplitBill(billId);
  if (!bill) return;
  showModal(`
    <div class="modal-title">${__('split.deleteTitle')}</div>
    <p style="color:var(--text-secondary);margin-bottom:14px">${__('split.deleteText')}</p>
    <div style="border:1px solid var(--border);border-radius:8px;padding:10px 12px;margin-bottom:14px">
      <div style="font-weight:600">${escHtml(bill.tag || bill.note || __('split.billDefault'))}</div>
      <div class="text-sm text-muted">${String(bill.date || '').slice(0, 10)} · ${formatMoney(bill.amount)}</div>
      ${!(bill.selfShare > 0) && (bill.participants || []).length === 0 ? '<div class="text-xs" style="color:var(--danger)">' + __('split.neverCounted') + '</div>' : ''}
    </div>
    <div class="modal-actions">
      <button class="btn btn-ghost" onclick="closeModal();openSplitBillEditor('${billId}')">${__('split.cancel')}</button>
      <button class="btn btn-danger" onclick="confirmDeleteSplitBill('${billId}')">${__('split.deleteConfirmBtn')}</button>
    </div>
  `);
}

function confirmDeleteSplitBill(billId) {
  deleteSplitBillWithRecords(billId);
  closeModal();
  showToast(__('split.deletedToast'));
  if (!_splitEditorFromRecords) openSplitCenter();
  refreshCurrentPage();
}

/* ============================================================
   CONTACT MANAGER MODAL
   ============================================================ */
function openSplitContactManager() {
  const contacts = getContacts();
  showModal(`
    <div class="modal-title">👥 ${__('split.managerTitle')}</div>
    <div style="max-height:50vh;overflow-y:auto;padding:4px 0">
      ${contacts.length === 0 ? `<div class="text-sm text-muted" style="padding:12px;text-align:center">${__('split.managerEmpty')}</div>` : ''}
      ${contacts.map(c => `
        <div class="flex items-center justify-between" style="padding:8px 4px;border-bottom:1px solid var(--border)">
          <span style="flex:1;min-width:0;word-break:break-word">${escHtml(c.name)}</span>
          <button class="btn btn-ghost btn-sm" style="font-size:0.7rem" onclick="openRenameContact('${c.id}')">✏️</button>
          <button class="btn btn-ghost btn-sm" style="font-size:0.7rem;color:var(--danger)" onclick="confirmDeleteContact('${c.id}')">🗑️</button>
        </div>
      `).join('')}
    </div>
    <div class="modal-actions" style="flex-wrap:wrap">
      <button class="btn btn-outline btn-sm" onclick="closeModal();openSplitQuickAdd()">＋ ${__('split.addPerson')}</button>
      <button class="btn btn-ghost btn-sm" onclick="closeModal()">${__('split.done')}</button>
    </div>
  `);
}

function openRenameContact(contactId) {
  const c = (DataStore._data.contacts || []).find(x => x.id === contactId);
  if (!c) return;
  showModal(`
    <div class="modal-title">✏️ ${__('split.renameTitle')}</div>
    <div class="input-group">
      <input type="text" id="renameContactInput" class="input-field" value="${escHtml(c.name)}" maxlength="30">
    </div>
    <div class="modal-actions">
      <button class="btn btn-ghost" onclick="closeModal()">${__('split.cancel')}</button>
      <button class="btn btn-primary" onclick="confirmRenameContact('${contactId}')">💾 ${__('split.save')}</button>
    </div>
  `);
  setTimeout(() => {
    const inp = document.getElementById('renameContactInput');
    if (inp) { inp.focus(); inp.select(); }
  }, 100);
}

function confirmRenameContact(contactId) {
  const name = document.getElementById('renameContactInput').value.trim();
  if (!name) { showToast(__('split.nameRequired'), 'error'); return; }
  renameContact(contactId, name);
  closeModal();
  showToast(__('split.savedToast'));
  openSplitContactManager();
}

function confirmDeleteContact(contactId) {
  const c = (DataStore._data.contacts || []).find(x => x.id === contactId);
  if (!c) return;
  showModal(`
    <div class="modal-title">${__('split.deleteContactTitle')}</div>
    <p style="color:var(--text-secondary);margin-bottom:14px">${__('split.deleteContactText', escHtml(c.name))}</p>
    <div class="modal-actions">
      <button class="btn btn-ghost" onclick="closeModal()">${__('split.cancel')}</button>
      <button class="btn btn-danger" onclick="doDeleteContact('${contactId}')">${__('split.deleteConfirmBtn')}</button>
    </div>
  `);
}

function doDeleteContact(contactId) {
  deleteContact(contactId);
  closeModal();
  showToast(__('split.contactDeleted'));
  openSplitContactManager();
}

/* ============================================================
   I18N
   ============================================================ */
addI18nEntries({
  'split.unknown': { zh: '未知', en: 'Unknown' },
  'split.me': { zh: '自己', en: 'Me' },
  'split.formTag': { zh: '用途/标签', en: 'Type / Tag' },
  'split.formTagPlaceholder': { zh: '如：🍚 聚餐 / 团购', en: 'e.g. 🍚 Dinner / Group buy' },
  'split.selfInvolved': { zh: '我自己也参与分摊', en: 'I am part of this split' },
  'split.selfAmountLabel': { zh: '我自己这份（指定金额）', en: 'My amount (specified)' },
  'split.billLabel': { zh: '分摊账单', en: 'Split bill' },
  'split.mode': { zh: '分摊方式', en: 'Split mode' },
  'split.modeEqual': { zh: '人均均分', en: 'Split equally' },
  'split.modeSpecified': { zh: '指定金额（未指定的人均分剩余）', en: 'Set amounts (rest split equally)' },
  'split.people': { zh: '参与分摊的人', en: 'Participants' },
  'split.noContacts': { zh: '还没有人员名单，点下方按钮添加', en: 'No contacts yet. Add one below.' },
  'split.addPerson': { zh: '新增人员', en: 'Add Person' },
  'split.manageContacts': { zh: '管理名单', en: 'Manage Contacts' },
  'split.personName': { zh: '姓名', en: 'Name' },
  'split.personNamePlaceholder': { zh: '输入姓名', en: 'Enter name' },
  'split.cancel': { zh: '取消', en: 'Cancel' },
  'split.confirmAdd': { zh: '确认添加', en: 'Add' },
  'split.nameRequired': { zh: '请输入姓名', en: 'Please enter a name' },
  'split.personAdded': { zh: '✅ 已添加 {0}', en: '✅ Added {0}' },
  'split.personExists': { zh: '⚠️ {0} 已在名单中', en: '⚠️ {0} already in the list' },
  'split.previewNeedAmount': { zh: '填写金额后可预览分摊', en: 'Enter amount to preview the split' },
  'split.previewNeedPeople': { zh: '请至少选择 1 位参与人（含自己）', en: 'Select at least 1 participant (incl. yourself)' },
  'split.errorNoPeople': { zh: '请至少选择 1 位参与人（含自己）', en: 'Select at least 1 participant (incl. yourself)' },
  'split.errorAmount': { zh: '金额无效', en: 'Invalid amount' },
  'split.errorNegative': { zh: '金额不能为负数', en: 'Amount cannot be negative' },
  'split.errorOverSpecified': { zh: '指定金额总和超过账单金额', en: 'Specified amounts exceed the bill total' },
  'split.errorSumMismatch': { zh: '分摊金额与账单金额不一致', en: 'Split amounts do not match the bill total' },
  'split.errorUnpaidArchive': { zh: '还有未还份额，请先收齐再归档', en: 'Unpaid shares remain — settle them before archiving' },
  'split.centerTitle': { zh: '分摊收款中心', en: 'Split Collection Center' },
  'split.pendingTotal': { zh: '待收回总额', en: 'Total Pending' },
  'split.pendingCount': { zh: '待收条目', en: 'Pending Items' },
  'split.items': { zh: '笔', en: 'item(s)' },
  'split.noPending': { zh: '没有待收款项 🎉', en: 'Nothing pending 🎉' },
  'split.billDefault': { zh: '分摊账单', en: 'Split bill' },
  'split.markPaidTitle': { zh: '标记此人为“已还钱”', en: 'Mark as paid back' },
  'split.paidLabel': { zh: '已还', en: 'Paid' },
  'split.editBillTitle': { zh: '编辑此账单', en: 'Edit this bill' },
  'split.allBills': { zh: '全部账单', en: 'All Bills' },
  'split.myShare': { zh: '我的份额', en: 'My share' },
  'split.unpaid': { zh: '待收', en: 'Pending' },
  'split.allSettled': { zh: '已全部还清', en: 'All settled' },
  'split.peoplePaidCount': { zh: '{0}/{1} 人已还', en: '{0}/{1} paid' },
  'split.done': { zh: '完成', en: 'Done' },
  'split.paidToast': { zh: '✅ 已标记为已还', en: '✅ Marked as paid' },
  'split.unpaidToast': { zh: '已改回未还', en: 'Marked as unpaid' },
  'split.editTitle': { zh: '编辑分摊账单', en: 'Edit Split Bill' },
  'split.totalLabel': { zh: '账单总金额', en: 'Total amount' },
  'split.dateLabel': { zh: '日期时间', en: 'Date & time' },
  'split.noteLabel': { zh: '备注', en: 'Note' },
  'split.notePlaceholder': { zh: '选填', en: 'Optional' },
  'split.selfUnknownHint': { zh: '我自己这份金额也不明', en: 'My own amount is unknown too' },
  'split.paidCountLabel': { zh: '还款状态', en: 'Repayment Status' },
  'split.noParticipants': { zh: '暂无其他人参与', en: 'No other participants' },
  'split.delete': { zh: '删除', en: 'Delete' },
  'split.save': { zh: '保存', en: 'Save' },
  'split.deleteTitle': { zh: '删除分摊账单', en: 'Delete Split Bill' },
  'split.deleteText': { zh: '账单及其关联的流水记录将一并删除，不再计入任何统计，已还/未还记录一并清除。', en: 'The bill and its linked record will be deleted together and removed from all stats.' },
  'split.settleTitle': { zh: '🎉 账单已结清，接下来？', en: '🎉 Bill settled — what now?' },
  'split.settleArchiveBtn': { zh: '🗂 归档到"已结清"列表（保留流水，可随时再编辑）', en: '🗂 Archive to settled list (keep record, editable later)' },
  'split.settleConvertBtn': { zh: '📒 转为普通记账记录（保留这条流水，从追账中心移除）', en: '📒 Convert to a normal expense record (keep the record, leave the center)' },
  'split.settleDeleteLink': { zh: '彻底删除（连同流水记录一起删除）', en: 'Delete permanently (with the linked record)' },
  'split.archived': { zh: '已结清 · 已归档', en: 'Settled · Archived' },
  'split.archivedSection': { zh: '🗂 已结清归档', en: '🗂 Settled archive' },
  'split.archivedToast': { zh: '🗂 已归档（按账单页可找回并恢复）', en: '🗂 Archived (restorable in Bills view)' },
  'split.unarchiveToast': { zh: '↩️ 已恢复，回到追账列表', en: '↩️ Restored to the tracking list' },
  'split.unarchiveBtn': { zh: '恢复', en: 'Restore' },
  'split.convertToast': { zh: '📒 已转为普通记账记录', en: '📒 Converted to a normal expense record' },
  'split.neverCounted': { zh: '（自己无份额且无他人分摊，从未计入统计）', en: '(No share, never counted in stats)' },
  'split.deleteConfirmBtn': { zh: '确认删除', en: 'Delete' },
  'split.deletedToast': { zh: '🗑️ 已删除分摊账单', en: '🗑️ Split bill deleted' },
  'split.savedToast': { zh: '✅ 已保存', en: '✅ Saved' },
  'split.managerTitle': { zh: '人员名单', en: 'Contacts' },
  'split.managerEmpty': { zh: '暂无人员，点击下方添加', en: 'No contacts yet. Add one below.' },
  'split.renameTitle': { zh: '重命名', en: 'Rename' },
  'split.deleteContactTitle': { zh: '删除人员', en: 'Delete Contact' },
  'split.deleteContactText': { zh: '确定删除 "{0}" ? 历史分摊账单仍会保留该名字快照，不受影响。', en: 'Delete "{0}"? Historical split bills keep the name snapshot.' },
  'split.contactDeleted': { zh: '已删除', en: 'Deleted' },
  'split.pieLabel': { zh: '分摊收款', en: 'Split Bills' },
  'split.centerEntry': { zh: '🧾 追账中心', en: '🧾 Collection' },
  'split.overviewBanner': { zh: '{0} 笔待收回 · {1}', en: '{0} pending · {1}' },
  'split.bannerTitle': { zh: '待收回款项', en: 'Pending Collections' },
  'split.bannerHint': { zh: '点击查看谁还欠钱、逐单标记已还', en: 'Tap to see who owes and mark payments' },
  'split.addToggle': { zh: '🧾 这是分摊收款单（我代付，他人之后还钱给我）', en: '🧾 This is a split bill (I paid, others owe me)' },
  'split.synthName': { zh: '分摊收款', en: 'Split collection' },
  'split.viewPeople': { zh: '按人员', en: 'By person' },
  'split.viewBills': { zh: '按账单', en: 'By bill' },
  'split.deleteBill': { zh: '删除账单', en: 'Delete bill' },
  'split.contribTitle': { zh: '🧾 他人已还（冲减支出）', en: '🧾 Paid back (reduces spending)' },
  'split.moreRows': { zh: '还有 {0} 笔，前往追账中心查看', en: '{0} more, see Collection Center' },
  'split.needShare': { zh: '请至少勾选一位参与人，或勾选"自己也有份额"', en: 'Select at least one participant, or check "I have a share"' },
  'split.unknownAmount': { zh: '金额不明', en: 'Amount unknown' },
  'split.partialPaidShort': { zh: '已还 {0}', en: 'paid {0}' },
  'split.pay.receive': { zh: '收款', en: 'Receive' },
  'split.pay.receiveTitle': { zh: '登记收款 — {0}', en: 'Record repayment — {0}' },
  'split.pay.partial': { zh: '部分', en: 'Part' },
  'split.pay.setAmountTitle': { zh: '设置已还金额', en: 'Set repaid amount' },
  'split.pay.shareLabel': { zh: '应还', en: 'Owes' },
  'split.pay.paidLabel': { zh: '已还', en: 'Repaid' },
  'split.pay.quickFull': { zh: '✅ 全额', en: '✅ Full' },
  'split.pay.quickNone': { zh: '↺ 清零', en: '↺ Clear' },
  'split.pay.remainingShort': { zh: '还差 {0}', en: '{0} left' },
  'split.pay.savedToast': { zh: '✅ 已更新还款金额', en: '✅ Repaid amount updated' },
  'split.pay.totalDue': { zh: '未收总额', en: 'Total outstanding' },
  'split.pay.amountLabel': { zh: '本次收到', en: 'Amount received' },
  'split.pay.fillSelected': { zh: '＝所选合计', en: '= selected total' },
  'split.pay.modeLabel': { zh: '记账方式', en: 'Allocation' },
  'split.pay.modeEven': { zh: '平均分配', en: 'Even' },
  'split.pay.modeOrdered': { zh: '按日期先后', en: 'Oldest first' },
  'split.pay.modeManual': { zh: '手动指定', en: 'Manual' },
  'split.pay.modeHint.even': { zh: '金额在所选账单间平均分配；某笔还满后，多出的部分自动分给其余账单。', en: 'Split evenly across the selected bills; once one is settled its leftover flows to the rest.' },
  'split.pay.modeHint.ordered': { zh: '从最早的账单开始逐笔还清，再轮到下一笔。', en: 'Clear the oldest bill first, then move on to the next.' },
  'split.pay.modeHint.manual': { zh: '为每笔账单单独填写金额，总额自动累加。', en: 'Enter each bill\'s amount yourself; the total adds up automatically.' },
  'split.pay.selectLabel': { zh: '选择账单', en: 'Bills' },
  'split.pay.selectAll': { zh: '全选', en: 'All' },
  'split.pay.selectNone': { zh: '全不选', en: 'None' },
  'split.pay.selectInvert': { zh: '反选', en: 'Invert' },
  'split.pay.rowRemaining': { zh: '还差 {0} / 共 {1}', en: '{0} left of {1}' },
  'split.pay.confirm': { zh: '确认收款', en: 'Record' },
  'split.pay.previewNeedAmount': { zh: '填写收到的金额后显示分配预览', en: 'Enter an amount to preview the allocation' },
  'split.pay.previewApplied': { zh: '共冲抵 {0}，涉及 {1} 笔', en: 'Allocates {0} across {1} bill(s)' },
  'split.pay.previewCleared': { zh: '其中 {0} 笔将结清', en: '{0} will be fully settled' },
  'split.pay.appliedToast': { zh: '✅ 已登记收款 {0}（{1} 笔）', en: '✅ Recorded {0} across {1} bill(s)' },
  'split.pay.errorNoBill': { zh: '账单不存在', en: 'Bill not found' },
  'split.pay.errorNoPerson': { zh: '该账单里没有这个人', en: 'That person is not on this bill' },
  'split.pay.errorNegative': { zh: '金额不能为负数', en: 'Amount cannot be negative' },
  'split.pay.errorZero': { zh: '请填写大于 0 的金额', en: 'Enter an amount greater than 0' },
  'split.pay.errorOverShare': { zh: '不能超过他应还的 {0}', en: 'Cannot exceed the {0} owed' },
  'split.pay.errorOverBill': { zh: '「{0}」最多只能收 {1}', en: '"{0}" can take at most {1}' },
  'split.pay.errorOverTotal': { zh: '超出所选账单的未收合计 {0}', en: 'Exceeds the {0} outstanding on the selected bills' },
  'split.pay.errorNoSelection': { zh: '请至少选择一笔账单', en: 'Select at least one bill' },
  'split.pay.errorNothingDue': { zh: '没有待收的账单', en: 'Nothing outstanding' },
  'split.unknownAmountTitle': { zh: '勾选后该参与人的金额视为不明：不能输入指定金额，均分计算不受影响（仅展示 ❓）', en: 'Mark this person\'s amount as unknown: cannot type a specified amount, equal-split math is unaffected (shown as ❓)' },
  'split.formCategory': { zh: '分类', en: 'Category' },
  'split.formCategoryPlaceholder': { zh: '选择分类', en: 'Select category' },
  'split.archivedEmpty': { zh: '暂无归档账单', en: 'No archived bills yet' },
  'split.convertNoSelfShare': { zh: '自己无份额，无法转为普通记账记录（可归档或删除）', en: 'You have no share — cannot convert to a normal record (archive or delete instead)' },
  'split.viewCompact': { zh: '紧凑', en: 'Compact' },
  'split.viewDetailed': { zh: '详细', en: 'Detailed' },
  'split.compactToggleTitle': { zh: '切换紧凑/详细视角（紧凑默认收起，点击卡片展开）', en: 'Toggle compact/detailed view (compact is collapsed by default, tap to expand)' }
});

  // === EXPORTS ===
  window.SplitEngine = {
    partShare, partPaid, partOwed, partSettled, withPaidAmount,
    allocateRepayment, applyRepayment, setSplitPaidAmount,
    SPLIT_ID,
    SPLIT_COLOR,
    SPLIT_PIE_ICON,
    getSplitMonthContrib,
    getSplitRangeByDate,
    getSplitDayMap,
    getSplitDayMapUTC,
    getSplitDayMapRaw,
    getSplitDayContrib,
    getPendingSummary,
    getContribBreakdown,
    getSplitBills,
    getSplitBill,
    getSplitBillCount,
    getSplitBillForRecord,
    getSplitBillUnpaid,
    setBillCategory,
    applyRecordEditToBill,
    deleteSplitBillWithRecords,
    getContacts,
    addContact,
    computeShares,
    collectSplitBill,
    resetAddSplitState: _resetAddSplitState,
    renderAddSplitForm,
    updateEditSplitPreview,
    // View builders (exposed for tests)
    _billView: _splitBillView,
    _archivedView: _splitArchivedView,
    _peopleView: _splitPeopleView,
    _billCard: _splitBillCard,
    _contactCard: _splitContactCardHtml,
    _expandStates: _splitExpandStates,
    _compactView: () => _splitCompactView
  };
  window.toggleAddSplitForm = toggleAddSplitForm;
  window.previewSplitShares = previewSplitShares;
  window.setSplitMode = setSplitMode;
  window.toggleSplitSelfInvolved = toggleSplitSelfInvolved;
  window.toggleSplitSelfUnknown = toggleSplitSelfUnknown;
  window.toggleSplitRowIncluded = toggleSplitRowIncluded;
  window.toggleSplitRowUnknown = toggleSplitRowUnknown;
  window.setSplitRowAmount = setSplitRowAmount;
  window.setSplitSelfAmount = setSplitSelfAmount;
  window.openSplitQuickAdd = openSplitQuickAdd;
  window.confirmSplitQuickAdd = confirmSplitQuickAdd;
  window.resetAddSplitState = _resetAddSplitState;
  window.openSplitCenter = openSplitCenter;
  window.closeSplitCenter = closeSplitCenter;
  window.deleteContact = deleteContact;
  window.setSplitCenterView = setSplitCenterView;
  window.toggleSplitCompactView = toggleSplitCompactView;
  window.toggleSplitBillExpand = toggleSplitBillExpand;
  window.toggleSplitContactExpand = toggleSplitContactExpand;
  window.markSplitPaid = markSplitPaid;
  window.setSplitPaidAmount = setSplitPaidAmount;
  window.openSplitPartial = openSplitPartial;
  window.confirmSplitPartial = confirmSplitPartial;
  window._splitPartialSet = _splitPartialSet;
  window._splitPartialPreview = _splitPartialPreview;
  window.openSplitReceive = openSplitReceive;
  window.setSplitPayMode = setSplitPayMode;
  window.toggleSplitPayRow = toggleSplitPayRow;
  window.splitPaySelectAll = splitPaySelectAll;
  window.splitPaySelectNone = splitPaySelectNone;
  window.splitPaySelectInvert = splitPaySelectInvert;
  window.setSplitPayAmountToSelected = setSplitPayAmountToSelected;
  window.updateSplitPayPreview = updateSplitPayPreview;
  window.confirmSplitReceive = confirmSplitReceive;
  window.openSplitBillEditor = openSplitBillEditor;
  window.updateEditSplitPreview = updateEditSplitPreview;
  window.onEditSplitAmountTyped = onEditSplitAmountTyped;
  window.saveSplitBillEditor = saveSplitBillEditor;
  window.openSplitBillDeleteConfirm = openSplitBillDeleteConfirm;
  window.openSplitBillSettleOptions = openSplitBillSettleOptions;
  window.archiveSplitBill = archiveSplitBill;
  window.unarchiveSplitBill = unarchiveSplitBill;
  window.convertSplitBillToRecord = convertSplitBillToRecord;
  window.confirmDeleteSplitBill = confirmDeleteSplitBill;
  window.openSplitContactManager = openSplitContactManager;
  window.openRenameContact = openRenameContact;
  window.confirmRenameContact = confirmRenameContact;
  window.confirmDeleteContact = confirmDeleteContact;
  window.doDeleteContact = doDeleteContact;
})();