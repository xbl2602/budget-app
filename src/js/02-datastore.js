/* ============================================================
   DataStore
   ============================================================ */
(function() {
'use strict';

const DataStore = {
  _data: null,
  // AES key derived from the PIN, in memory only: set by setPin / unlockData, dropped
  // by lockApp / clearPin. It exists so that locking can re-encrypt the ledger — see
  // sealForLock(). It is a non-extractable CryptoKey, never the PIN itself.
  _pinKey: null,
  _pendingDelete: null, // { id, record, timeoutId }
  __log: [],            // Diagnostic log entries

  _log(action, detail) {
    const entry = {
      t: new Date().toISOString(),
      a: action,
      d: detail,
      recordsCount: this._data ? this._data.records.length : -1,
      pendingId: this._pendingDelete ? this._pendingDelete.id : null
    };
    this.__log.push(entry);
    if (this.__log.length > 500) this.__log.shift(); // cap at 500
    // Also persist to localStorage so log survives page reload
    try {
      const persisted = JSON.parse(localStorage.getItem('budgetAppLog') || '[]');
      persisted.push(entry);
      if (persisted.length > 500) persisted.splice(0, persisted.length - 500);
      localStorage.setItem('budgetAppLog', JSON.stringify(persisted));
    } catch(e) { /* ignore */ }
  },

  getDiagnosticLog() { return this.__log.slice(); },
  clearDiagnosticLog() { this.__log = []; },

  _defaults() {
    return {
      records: [],
      categories: JSON.parse(JSON.stringify(DEFAULT_CATEGORIES)),
      budgets: {},
      categoryBudgets: {},
      savingsTarget: { type: 'fixed', fixedAmount: 0, percent: 0 },
      colorIndex: DEFAULT_CATEGORIES.length,
      billCategories: [],
      billAmounts: {},
      monthlyIncome: {},
      percentBase: 'gross',
      lastActiveMonth: '',
      whatIfParams: null,
      contacts: [],
      splitBills: [],
      purchasePlans: [],
      // Declared here rather than created lazily on first write: being absent
      // from _defaults() is exactly why these two fell out of LAN sync, the
      // merge path and the fingerprint.
      allTags: [],
      tagColors: {}
    };
  },

  init() {
    // Check if data is encrypted and needs PIN
    const isProtected = !!localStorage.getItem('budgetAppPinHash');
    const hasEncrypted = !!localStorage.getItem('budgetAppDataEncrypted');
    const hasPlaintext = !!localStorage.getItem('budgetAppData');
    if (isProtected && hasEncrypted && !hasPlaintext) {
      // Data is encrypted and not yet decrypted - don't load, show PIN prompt
      this._data = this._defaults();
      // Signal to app that PIN is needed
      window._pinRequired = true;
      this._log('init', 'pin_required_data_encrypted');
      return;
    }
    // Restore diagnostic log from localStorage (survives page reload)
    try {
      this.__log = JSON.parse(localStorage.getItem('budgetAppLog') || '[]');
      if (!Array.isArray(this.__log)) this.__log = [];
    } catch(e) { this.__log = []; }
    const restored = this.__log.length;
    const raw = localStorage.getItem('budgetAppData');
    this._log('init', 'raw=' + (raw ? raw.length + 'chars' : 'null') + ' restoredLog=' + restored);
  
    if (raw) {
      try {
        this._data = this._normalize(JSON.parse(raw));
      } catch(e) {
        this._data = this._normalize(this._defaults());
      }
    } else {
      // Routed through _normalize like the restored branch, so a brand-new store
      // gets the same migrations a restored one does — without this a fresh
      // install never seeds the income categories (nothing else adds them) and
      // the income picker is empty from day one.
      this._data = this._normalize(this._defaults());
    }

    // Process any expired pending deletes from previous sessions (M2)
    this._processPendingDeletes();

    this.save();
  },

  // Entity-level cleanup that is safe to run on ANY data object, including one
  // that is only a partial payload. Split out from _normalize() because the
  // merge path must clean incoming entities WITHOUT backfilling defaults —
  // a backfilled `savingsTarget` would otherwise overwrite the local one.
  _sanitizeEntities(data) {
    if (!data || typeof data !== 'object') return data;

    // Markup-safety of the fields that the UI interpolates into HTML attributes
    // (onclick="edit('${id}')", style="background:${color}") or raw into text
    // (${icon}). Data can arrive from a LAN peer, an imported file or the cloud, and
    // the CSP allows inline handlers, so a hostile id/icon/color is script execution.
    // Valid values pass through untouched; only unsafe ones are dropped or replaced.
    const SAFE_ID = /^[A-Za-z0-9_.:\-]{1,100}$/;
    const SAFE_COLOR = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;
    const safeId = v => typeof v === 'string' && SAFE_ID.test(v);
    const cleanIcon = v => {
      if (typeof v !== 'string') return v;
      const s = v.replace(/[&<>"'`\\]/g, '');
      return s.length > 24 ? '📁' : s;
    };
    const cleanEntity = (e, fallbackColor) => {
      if (Object.prototype.hasOwnProperty.call(e, 'icon')) e.icon = cleanIcon(e.icon);
      if (Object.prototype.hasOwnProperty.call(e, 'color') && !SAFE_COLOR.test(String(e.color))) e.color = fallbackColor;
      return e;
    };
    if (Array.isArray(data.categories)) {
      data.categories = data.categories.filter(c => c && safeId(c.id) && (c.parentId == null || safeId(c.parentId)))
        .map(c => cleanEntity(c, '#6366F1'));
      // `kind` splits the two trees. Drop anything that is neither value rather
      // than defaulting it: absence already means expense, so normalising would
      // only rewrite every pre-income category and churn the sync fingerprint.
      data.categories.forEach(c => {
        if (c.kind != null && c.kind !== 'income' && c.kind !== 'expense') delete c.kind;
      });
    }
    if (Array.isArray(data.billCategories)) {
      data.billCategories = data.billCategories.filter(c => c && safeId(c.id)).map(c => cleanEntity(c, '#6366F1'));
    }
    if (Array.isArray(data.contacts)) {
      data.contacts = data.contacts.filter(c => c && safeId(c.id));
    }
    if (Array.isArray(data.records)) {
      data.records = data.records.filter(r => r && safeId(r.id));
      data.records.forEach(r => {
        if (r.categoryId != null && !safeId(r.categoryId)) r.categoryId = 'uncategorized';
        if (r.splitBillId != null && !safeId(r.splitBillId)) delete r.splitBillId;
        // Only these two values are readable; anything else is dropped so the
        // record falls back to the pre-income default of expense.
        if (r.type != null && r.type !== 'income' && r.type !== 'expense') delete r.type;
      });
    }
    if (Array.isArray(data.splitBills)) {
      data.splitBills = data.splitBills.filter(b => b && safeId(b.id));
      data.splitBills.forEach(b => { if (b.categoryId != null && !safeId(b.categoryId)) b.categoryId = 'uncategorized'; });
    }
    if (Array.isArray(data.purchasePlans)) {
      data.purchasePlans = data.purchasePlans.filter(p => p && safeId(p.id));
    }

    if (Array.isArray(data.splitBills)) {
      const seen = new Set();
      data.splitBills = data.splitBills.filter(b => {
        if (!b || !b.id || seen.has(b.id)) return false;
        if (typeof b.amount !== 'number' || !isFinite(b.amount)) return false;
        if (!Array.isArray(b.participants)) return false;
        seen.add(b.id);
        // `payer` gates every split statistic (getSplitContrib / getSplitUnpaid /
        // getSplitOthers). Only the add-record flow writes it, so bills arriving
        // by import, LAN sync, the mobile build or an old backup have none — and
        // the whole bill silently drops out of the money maths. Self-paid is the
        // only shape the app has ever produced, so absence means 'self'.
        if (!b.payer) b.payer = 'self';
        return true;
      });
    }

    if (Array.isArray(data.purchasePlans)) {
      const seen = new Set();
      data.purchasePlans = data.purchasePlans.filter(p => {
        if (!p || !p.id || seen.has(p.id)) return false;
        if (typeof p.totalAmount !== 'number' || !isFinite(p.totalAmount) || p.totalAmount <= 0) return false;
        if (typeof p.months !== 'number' || !isFinite(p.months) || p.months < 1) return false;
        if (p.mode !== 'save' && p.mode !== 'borrow' && p.mode !== 'credit') return false;
        if (!p.overrides || typeof p.overrides !== 'object') p.overrides = {};
        if (!p.status) p.status = 'active';
        seen.add(p.id);
        return true;
      });
    }

    this._repairRecordTypes(data);

    return data;
  },

  // A record's `type` and its category's `kind` must agree. The UI can only keep
  // them in step for records it creates itself, but an imported file, a LAN peer
  // or a move in the categories page can cross the line — and a mismatch is
  // expensive: an income row filed under 餐饮 would vanish from every expense
  // total while still being counted as income. The category is the side that can
  // be resolved, so it wins; records with no resolvable category keep whatever
  // they say.
  //
  // Runs inside _sanitizeEntities, not _normalize, because the LAN-merge and
  // cloud-merge paths only call the former — and those are exactly the paths
  // that can carry a mismatched record in from another device.
  _repairRecordTypes(data) {
    if (!data || !Array.isArray(data.records) || !Array.isArray(data.categories)) return;
    const kindById = {};
    data.categories.forEach(c => { if (c && c.id) kindById[c.id] = c.kind === 'income' ? 'income' : 'expense'; });
    data.records.forEach(r => {
      if (!r) return;
      const kind = kindById[r.categoryId];
      if (!kind) return;
      if (kind === 'income') r.type = 'income';
      else delete r.type;
    });
  },

  // Single entry point for making an arbitrary data object safe to use: fills in
  // missing keys, drops malformed entries, and runs the historical migrations.
  //
  // Every path that brings data in from outside — init(), reload(), importJSON(),
  // and LAN sync — MUST route through here. Keeping this logic inline in init()
  // was the root cause of a family of bugs where a reloaded or imported store was
  // missing keys that the rest of the app assumes exist (Excel export threw on a
  // missing `budgets`, split stats silently returned 0 on a missing `payer`).
  //
  // Contract: only ever ADD what is missing or REMOVE what is malformed. Never
  // rewrite a value that is already present and valid.
  _normalize(data) {
    if (!data || typeof data !== 'object') return this._defaults();

    // 1. Backfill every key declared in _defaults()
    const defaults = this._defaults();
    Object.keys(defaults).forEach(k => {
      const cur = data[k];
      const missing = cur === undefined || cur === null
        || (Array.isArray(defaults[k]) && !Array.isArray(cur))
        || (defaults[k] !== null && typeof defaults[k] === 'object' && !Array.isArray(defaults[k]) && typeof cur !== 'object');
      // whatIfParams legitimately defaults to null, so absence is not a defect
      if (k === 'whatIfParams') { if (cur === undefined) data[k] = null; return; }
      if (missing) data[k] = defaults[k];
    });
    if (!data.categories.length) {
      data.categories = JSON.parse(JSON.stringify(DEFAULT_CATEGORIES));
    }

    // 2. Drop malformed entities
    this._sanitizeEntities(data);
    if (!data.categories.length) {
      data.categories = JSON.parse(JSON.stringify(DEFAULT_CATEGORIES));
    }

    // 3. Historical migrations
    this._migrateSplitRecordCategories(data);
    this._migrateIncomeCategories(data);
    const currentMonth = getMonthKey(new Date().toISOString());
    if (data.budgets && data.budgets[currentMonth] && !data.monthlyIncome[currentMonth]) {
      data.monthlyIncome[currentMonth] = data.budgets[currentMonth];
    }
    if (!data.lastActiveMonth) data.lastActiveMonth = currentMonth;

    return data;
  },

  // Income support arrived long after the stores. Every existing ledger already
  // has an expense `categories` array, so the empty-array backfill above can
  // never fire for it and 工资/副业/报销 would simply not exist — the picker
  // would be empty and the feature unreachable. Seed them when the income tree
  // is entirely absent.
  //
  // Deliberately derived from `categories` rather than guarded by a persisted
  // flag: a new boolean key would have to sync like any other field, so the
  // first device to normalise would push it and every peer would see a content
  // change it never made. The only behaviour this gives up is that deleting
  // every income category at once brings the defaults back — an empty income
  // tree is useless anyway, and it costs one restore.
  _migrateIncomeCategories(data) {
    if (!data || !Array.isArray(data.categories)) return;
    if (data.categories.some(c => c && c.kind === 'income')) return;
    const byId = {};
    data.categories.forEach(c => { if (c && c.id) byId[c.id] = c; });
    // Parent first: a child whose parent is missing would land in the expense
    // picker's tree with no visible root.
    DEFAULT_INCOME_CATEGORIES.forEach(def => {
      if (byId[def.id]) return;
      if (def.parentId && !byId[def.parentId]) return;
      data.categories.push(JSON.parse(JSON.stringify(def)));
      byId[def.id] = def;
    });
  },

  // A record's `type` and its category's `kind` must agree. The UI can only keep
  // them in step for records it creates itself, but an imported file, a LAN peer
  // or a move in the categories page can cross the line — and a mismatch is
  // expensive: an income row filed under 餐饮 would vanish from every expense
  // total while still being counted as income. The category is the side that can
  // be resolved, so it wins; uncategorized records keep whatever they say.
  _repairRecordTypes(data) {
    if (!data || !Array.isArray(data.records) || !Array.isArray(data.categories)) return;
    const kindById = {};
    data.categories.forEach(c => { if (c && c.id) kindById[c.id] = c.kind === 'income' ? 'income' : 'expense'; });
    data.records.forEach(r => {
      if (!r) return;
      const kind = kindById[r.categoryId];
      if (!kind) return;
      if (kind === 'income') r.type = 'income';
      else delete r.type;
    });
  },

  // Split-bill storage refactor (B): records were stored with the '__split__'
  // pseudo-category; resolve each to the linked bill's real category so stats and
  // charts aggregate split spending under the true category (餐饮/交通/...).
  _migrateSplitRecordCategories(data) {
    if (!data || !Array.isArray(data.records) || !Array.isArray(data.splitBills)) return;
    const SPLIT_ID = '__split__';
    const billById = {};
    data.splitBills.forEach(b => { if (b && b.id) billById[b.id] = b; });
    data.records.forEach(r => {
      if (!r || r.categoryId !== SPLIT_ID || !r.splitBillId) return;
      const bill = billById[r.splitBillId];
      const real = bill && bill.categoryId && bill.categoryId !== SPLIT_ID ? bill.categoryId : 'uncategorized';
      r.categoryId = real;
    });
  },

  save() {
    try {
      // Monotonic revision — cheap cache-invalidation signal for derived computations
      // (PlanMath memoizes its month-by-month waterfall against this)
      this._rev = (this._rev || 0) + 1;
      localStorage.setItem('budgetAppData', JSON.stringify(this._data));
      this._log('save', 'records=' + this._data.records.length);
      // Optional cloud sync. Guarded and swallowed: it must never be able to fail a save,
      // and with sync off (the default) this is one property read.
      try { if (window.CloudSync) window.CloudSync.notify(); } catch (e2) { /* never break saving */ }
    } catch(e) {
      this._log('save_error', e.message);
      // Try to notify user via toast if available
      if (typeof showToast === 'function') {
        showToast(__('datastore.saveFailed', e.message), 'error');
      }
    }
  },

  // Records
  getRecords() { return this._data.records; },
  getRecord(id) { return this._data.records.find(r => r.id === id); },
  // The two spend-facing accessors. Anything answering "how much did I spend"
  // must use one of these — bare getRecords() now also carries income rows.
  getExpenseRecords() { return expenseRecords(this._data.records); },
  getIncomeRecords() { return incomeRecords(this._data.records); },

  addRecord(record) {
    // Fixed: validate amount field (M1)
    if (typeof record.amount !== 'number' || !isFinite(record.amount)) {
      record.amount = 0;
    }
    // Derived from the category rather than trusted from the caller: the add form
    // writes both, and if they ever disagree the category is the one that decides
    // which tree the record is visible in. Written only when it is income, so
    // this stays byte-identical to what _repairRecordTypes() would leave behind.
    if (record.categoryId && this.isIncomeCategory(record.categoryId)) record.type = 'income';
    else delete record.type;
    record.id = uuid();
    record.createdAt = record.createdAt || new Date().toISOString();
    this._data.records.unshift(record);
    this.save();
    return record;
  },

  updateRecord(id, updates) {
    const idx = this._data.records.findIndex(r => r.id === id);
    if (idx === -1) return null;
    updates.updatedAt = new Date().toISOString();
    Object.assign(this._data.records[idx], updates);
    // Switching the type without switching the category (the edit form lets you)
    // would leave the record unreachable from either tree, so the two are pinned
    // together here the same way addRecord pins them.
    const rec = this._data.records[idx];
    if (rec.categoryId && this.isIncomeCategory(rec.categoryId)) rec.type = 'income';
    else delete rec.type;
    this.save();
    return rec;
  },

  deleteRecord(id) {
    this._log('deleteRecord', 'id=' + id);
    // If this record is pending delete, just finalize it early
    if (this._pendingDelete && this._pendingDelete.id === id) {
      clearTimeout(this._pendingDelete.timeoutId);
      this._pendingDelete = null;
      return;
    }
    // If there's a pending delete for a different record, finalize it
    if (this._pendingDelete) {
      clearTimeout(this._pendingDelete.timeoutId);
      this._pendingDelete = null;
    }
    // Deleting a split record cascades to its whole bill chain
    const scope = (typeof SplitEngine !== 'undefined') ? this._splitCascade(this.getRecord(id)) : null;
    // Remove from active list
    this._data.records = this._data.records.filter(r => r.id !== id && (!scope || r.splitBillId !== scope.bill.id));
    if (scope) this._data.splitBills = (this._data.splitBills || []).filter(b => b.id !== scope.bill.id);
    this.save();
  },

  // When a split record is deleted, the whole bill chain (bill + all its linked
  // records) goes with it so no ghost bills / phantom contributions remain
  _splitCascade(record) {
    if (!record || !record.splitBillId) return null;
    if (!record.splitBillId) return null;
    const bill = (SplitEngine && SplitEngine.getSplitBill) ? SplitEngine.getSplitBill(record.splitBillId) : null;
    if (!bill) return null;
    return {
      bill,
      records: (this._data.records || []).filter(r => r.splitBillId === bill.id && r.id !== record.id)
    };
  },

  // Persist pending deletes to localStorage to survive page reload (M2)
  _savePendingDelete() {
    if (this._pendingDelete) {
      try {
        localStorage.setItem('budgetPendingDeletes', JSON.stringify({
          id: this._pendingDelete.id,
          deleteAt: Date.now() + 86400000 // 24 hours from now
        }));
      } catch(e) { /* ignore */ }
    } else {
      try { localStorage.removeItem('budgetPendingDeletes'); } catch(e) { /* ignore */ }
    }
  },

  // Check for and finalize expired pending deletes on init (M2)
  _processPendingDeletes() {
    try {
      var stored = localStorage.getItem('budgetPendingDeletes');
      if (!stored) return;
      var pending = JSON.parse(stored);
      // Deliberately does NOT restore the buffer into memory. A restored entry
      // would carry no timer, so it could never expire on its own — exactly the
      // "pending delete is stuck" state that 142ea5c added the repairData()
      // sweeps to clear. The 5-second undo window is in-memory by design.
      if (pending.deleteAt && Date.now() >= pending.deleteAt) {
        this._data.records = this._data.records.filter(function(r) { return r.id !== pending.id; });
        localStorage.removeItem('budgetPendingDeletes');
        this._log('_processPendingDeletes', 'finalized id=' + pending.id);
      }
    } catch(e) { /* ignore */ }
  },

  // Undo-capable delete: moves to pending buffer, scheduled for permanent removal
  softDeleteRecord(id) {
    const record = this.getRecord(id);
    if (!record) { this._log('softDeleteRecord', 'id=' + id + ' NOT_FOUND'); return null; }
    this._log('softDeleteRecord', 'id=' + id + ' pending=' + (this._pendingDelete ? this._pendingDelete.id : 'null'));
    // Cancel any existing pending delete
    if (this._pendingDelete) {
      clearTimeout(this._pendingDelete.timeoutId);
      // If the same record is being re-deleted, just restart timer
      if (this._pendingDelete.id === id) {
        // Record is already pending, restart timeout
        this._pendingDelete.timeoutId = setTimeout(() => {
          this._finalizeDelete(id);
        }, 5000);
        this._savePendingDelete();
        return this._pendingDelete.record;
      }
      // Different record: finalize the previous one immediately
      this._finalizeDelete(this._pendingDelete.id);
    }
    // Remove from records list
    const scope = (typeof SplitEngine !== 'undefined') ? this._splitCascade(record) : null;
    this._data.records = this._data.records.filter(r => r.id !== id && (!scope || r.splitBillId !== scope.bill.id));
    if (scope) this._data.splitBills = (this._data.splitBills || []).filter(b => b.id !== scope.bill.id);
    this.save();
    // Set pending with localStorage fallback (M2) — the whole split chain is
    // kept so "undo" can restore bill + linked records together
    this._pendingDelete = {
      id,
      record,
      scope: scope ? { bill: scope.bill, records: scope.records } : null,
      timeoutId: setTimeout(() => {
        this._finalizeDelete(id);
      }, 5000)
    };
    this._savePendingDelete();
    return record;
  },

  // Undo a pending delete
  undoDelete() {
    if (!this._pendingDelete) { this._log('undoDelete', 'NOTHING_PENDING'); return false; }
    this._log('undoDelete', 'id=' + this._pendingDelete.id);
    clearTimeout(this._pendingDelete.timeoutId);
    // Restore the split chain (bill + its linked records) first, then the record
    if (this._pendingDelete.scope && this._pendingDelete.scope.bill) {
      if (!(this._data.splitBills || []).some(b => b.id === this._pendingDelete.scope.bill.id)) {
        this._data.splitBills = this._data.splitBills || [];
        this._data.splitBills.unshift(this._pendingDelete.scope.bill);
      }
      (this._pendingDelete.scope.records || []).forEach(r => {
        if (!this._data.records.some(x => x.id === r.id)) this._data.records.unshift(r);
      });
    }
    // Restore the record at the beginning of the list
    this._data.records.unshift(this._pendingDelete.record);
    this.save();
    this._pendingDelete = null;
    this._savePendingDelete();
    return true;
  },

  // Finalize: permanently erase (already removed from list, just clear pending state)
  _finalizeDelete(id) {
    this._log('_finalizeDelete', 'id=' + id + ' pending=' + (this._pendingDelete ? this._pendingDelete.id : 'null'));
    if (this._pendingDelete && this._pendingDelete.id === id) {
      this._pendingDelete = null;
      this._savePendingDelete();
      // No need to save() — record was already removed from _data during softDeleteRecord
    }
  },

  getPendingDelete() {
    return this._pendingDelete;
  },

  reload() {
    const raw = localStorage.getItem('budgetAppData');
    if (raw) {
      try {
        // Same normalisation as init() — a reloaded store that skipped the
        // backfill would crash Excel export and lose the __split__ migration.
        this._data = this._normalize(JSON.parse(raw));
        this._rev = (this._rev || 0) + 1;
        this._log('reload', 'OK records=' + this._data.records.length);
        return true;
      } catch(e) {
        this._log('reload', 'PARSE_ERROR ' + e.message);
        return false;
      }
    }
    this._data = this._defaults();
    this._log('reload', 'NO_DATA defaulted');
    return true;
  },

  forceDeleteRecord(id) {
    this._log('forceDeleteRecord', 'id=' + id);
    if (this._pendingDelete && this._pendingDelete.id === id) {
      clearTimeout(this._pendingDelete.timeoutId);
      this._pendingDelete = null;
    }
    const record = this.getRecord(id);
    if (!record) {
      this._log('forceDeleteRecord', 'id=' + id + ' NOT_FOUND');
      return false;
    }
    const len = this._data.records.length;
    // Deleting a split record cascades to its whole bill chain
    const scope = (typeof SplitEngine !== 'undefined') ? this._splitCascade(record) : null;
    this._data.records = this._data.records.filter(r => r.id !== id && (!scope || r.splitBillId !== scope.bill.id));
    if (scope) this._data.splitBills = (this._data.splitBills || []).filter(b => b.id !== scope.bill.id);
    if (this._data.records.length < len) {
      this.save();
      return true;
    }
    this._log('forceDeleteRecord', 'id=' + id + ' NOT_FOUND');
    return false;
  },

  // Categories
  getCategories() { return this._data.categories; },
  getCategory(id) {
    if (typeof SplitEngine !== 'undefined' && id === SplitEngine.SPLIT_ID) {
      return { id, name: __('split.synthName'), icon: SplitEngine.SPLIT_PIE_ICON, color: SplitEngine.SPLIT_COLOR, children: [] };
    }
    return this._data.categories.find(c => c.id === id) || null;
  },

  // `kind` splits the two trees: 'expense' (the default, and what every category
  // written before income existed is) and 'income'. Omitting it returns both, so
  // the many existing callers keep working; the spenders below pass 'expense'
  // explicitly so 工资 can never show up as an expense category.
  getRootCategories(kind) {
    let roots = this._data.categories.filter(c => !c.parentId);
    if (kind) roots = roots.filter(c => (c.kind === 'income' ? 'income' : 'expense') === kind);
    return roots.sort((a,b) => a.sortOrder - b.sortOrder);
  },
  getExpenseRootCategories() { return this.getRootCategories('expense'); },
  getIncomeRootCategories() { return this.getRootCategories('income'); },
  isIncomeCategory(id) {
    const c = this._data.categories.find(x => x.id === id);
    return !!(c && c.kind === 'income');
  },

  getChildren(parentId) {
    return this._data.categories.filter(c => c.parentId === parentId)
      .sort((a,b) => a.sortOrder - b.sortOrder);
  },

  getDescendantIds(id) {
    const ids = [id];
    this.getChildren(id).forEach(child => {
      ids.push(...this.getDescendantIds(child.id));
    });
    return ids;
  },

  addCategory(cat) {
    cat.id = uuid();
    // A subcategory inherits its parent's tree. Without this a 报销 child added
    // under 工资 would land in the expense picker while its records, typed
    // income, would then disagree with it — the exact mismatch
    // _repairRecordTypes has to undo later.
    if (cat.parentId) {
      const parent = this._data.categories.find(c => c.id === cat.parentId);
      if (parent) cat.kind = parent.kind === 'income' ? 'income' : 'expense';
    } else {
      cat.kind = cat.kind === 'income' ? 'income' : 'expense';
    }
    if (!cat.color) {
      // A child inherits its parent's color so one branch reads as one family in
      // charts and lists; only root categories consume a new palette slot.
      const parent = cat.parentId ? this._data.categories.find(c => c.id === cat.parentId) : null;
      if (parent && parent.color) {
        cat.color = parent.color;
      } else {
        const idx = this._data.colorIndex || 0;
        cat.color = COLORS[idx % COLORS.length];
        this._data.colorIndex = (this._data.colorIndex || 0) + 1;
      }
    }
    this._data.categories.push(cat);
    this.save();
    return cat;
  },

  updateCategory(id, updates) {
    const cat = this._data.categories.find(c => c.id === id);
    if (!cat) return null;
    Object.assign(cat, updates);
    this.save();
    return cat;
  },

  deleteCategory(id, options = {}) {
    const children = this.getChildren(id);
    if (children.length) {
      if (options.moveToParent) {
        const parentId = options.moveToParent;
        children.forEach(child => {
          child.parentId = parentId;
        });
      } else if (!options.deleteChildren) {
        return false;
      } else {
        children.forEach(child => this.deleteCategory(child.id, { deleteChildren: true }));
      }
    }
    this._data.categories = this._data.categories.filter(c => c.id !== id);
    this.save();
    return true;
  },

  getNextColor() {
    const idx = this._data.colorIndex || 0;
    const color = COLORS[idx % COLORS.length];
    this._data.colorIndex = (this._data.colorIndex || 0) + 1;
    this.save();
    return color;
  },

  // Bill Categories
  getBillCategories() {
    return (this._data.billCategories || []).slice().sort((a,b) => (a.sortOrder||0) - (b.sortOrder||0));
  },
  getBillCategory(id) {
    return (this._data.billCategories || []).find(c => c.id === id);
  },
  addBillCategory(cat) {
    cat.id = uuid();
    if (!cat.color) {
      const idx = this._data.colorIndex || 0;
      cat.color = COLORS[idx % COLORS.length];
      this._data.colorIndex = (this._data.colorIndex || 0) + 1;
    }
    if (cat.sortOrder === undefined) cat.sortOrder = (this._data.billCategories || []).length;
    this._data.billCategories.push(cat);
    this.save();
    return cat;
  },
  updateBillCategory(id, updates) {
    const cat = (this._data.billCategories || []).find(c => c.id === id);
    if (!cat) return null;
    Object.assign(cat, updates);
    this.save();
    return cat;
  },
  deleteBillCategory(id) {
    this._data.billCategories = (this._data.billCategories || []).filter(c => c.id !== id);
    // Clean up billAmounts entries
    Object.keys(this._data.billAmounts || {}).forEach(month => {
      delete this._data.billAmounts[month][id];
    });
    this.save();
  },

  // Bill Amounts
  getBillAmounts(month) {
    return (this._data.billAmounts && this._data.billAmounts[month]) || {};
  },
  setBillAmount(month, billId, amount) {
    if (!this._data.billAmounts) this._data.billAmounts = {};
    if (!this._data.billAmounts[month]) this._data.billAmounts[month] = {};
    this._data.billAmounts[month][billId] = amount;
    this.save();
  },
  getBillTotal(month) {
    const amounts = this.getBillAmounts(month);
    return Object.values(amounts).reduce((s, v) => s + (parseFloat(v) || 0), 0);
  },

  // Monthly Income
  getMonthlyIncome(month) {
    return (this._data.monthlyIncome && this._data.monthlyIncome[month]) || 0;
  },
  setMonthlyIncome(month, amount) {
    if (!this._data.monthlyIncome) this._data.monthlyIncome = {};
    this._data.monthlyIncome[month] = amount;
    this.save();
  },

  // Percent Base (gross / net)
  getPercentBase() {
    return this._data.percentBase || 'gross';
  },
  setPercentBase(base) {
    this._data.percentBase = base;
    this.save();
  },

  // Last Active Month
  getLastActiveMonth() {
    return this._data.lastActiveMonth || '';
  },
  setLastActiveMonth(month) {
    this._data.lastActiveMonth = month;
    this.save();
  },

  // Net Disposable = income - totalBills
  getNetDisposable(month) {
    const income = this.getMonthlyIncome(month);
    const totalBills = this.getBillTotal(month);
    return income - totalBills;
  },

  // Budgets
  getBudgets() { return this._data.budgets; },
  // Fixed (m2): return undefined when no budget is set, so callers can distinguish "not set" from "set to 0"
  getBudget(month) { return this._data.budgets[month] !== undefined ? this._data.budgets[month] : 0; },
  setBudget(month, amount) {
    this._data.budgets[month] = amount;
    this.save();
  },

  // Category Budgets
  getCategoryBudget(catId, month) {
    const key = catId + ':' + month;
    const raw = this._data.categoryBudgets[key];
    if (raw === undefined || raw === null) return { value: 0, type: 'fixed' };
    if (typeof raw === 'number') return { value: raw, type: 'fixed' };
    if (typeof raw === 'object') return { value: raw.value || 0, type: raw.type || 'fixed' };
    return { value: 0, type: 'fixed' };
  },
  setCategoryBudget(catId, month, amount, type) {
    const key = catId + ':' + month;
    if (!amount || amount <= 0) {
      // Fixed (M3): preserve type info when amount is 0, instead of deleting the key
      this._data.categoryBudgets[key] = { value: 0, type: this.getCategoryBudget(catId, month).type || 'fixed' };
    } else {
      this._data.categoryBudgets[key] = { value: amount, type: type || 'fixed' };
    }
    this.save();
  },
  getAllCategoryBudgets() {
    return this._data.categoryBudgets || {};
  },

  // Savings Target
  getSavingsTarget() { return this._data.savingsTarget; },
  setSavingsTarget(target) {
    this._data.savingsTarget = target;
    this.save();
  },

  // Purchase Plans (大额分期消费计划)
  // Ledger is NOT stored — actual repayment per month is derived by PlanMath from
  // that month's income/bills/records. Only manual interventions live in `overrides`.
  getPurchasePlans() {
    return Array.isArray(this._data.purchasePlans) ? this._data.purchasePlans : [];
  },
  getPurchasePlan(id) {
    return this.getPurchasePlans().find(p => p.id === id) || null;
  },
  addPurchasePlan(plan) {
    if (!Array.isArray(this._data.purchasePlans)) this._data.purchasePlans = [];
    if (!plan.id) plan.id = uuid();
    if (!plan.overrides) plan.overrides = {};
    if (!plan.status) plan.status = 'active';
    plan.createdAt = plan.createdAt || new Date().toISOString();
    plan.updatedAt = plan.createdAt;
    this._data.purchasePlans.unshift(plan);
    this.save();
    this._log('addPurchasePlan', 'id=' + plan.id + ' mode=' + plan.mode);
    return plan;
  },
  updatePurchasePlan(id, updates) {
    const list = this._data.purchasePlans || [];
    const idx = list.findIndex(p => p.id === id);
    if (idx === -1) return null;
    updates.updatedAt = new Date().toISOString();
    Object.assign(list[idx], updates);
    this.save();
    this._log('updatePurchasePlan', 'id=' + id);
    return list[idx];
  },
  // Deleting a plan cascades to the credit-mode installment records it generated,
  // so no orphan records keep inflating month totals (mirrors _splitCascade intent)
  deletePurchasePlan(id) {
    if (!Array.isArray(this._data.purchasePlans)) return false;
    const before = this._data.purchasePlans.length;
    this._data.purchasePlans = this._data.purchasePlans.filter(p => p.id !== id);
    if (this._data.purchasePlans.length === before) return false;
    const killed = (this._data.records || []).filter(r => r && r.planId === id).length;
    this._data.records = (this._data.records || []).filter(r => !r || r.planId !== id);
    this.save();
    this._log('deletePurchasePlan', 'id=' + id + ' cascadedRecords=' + killed);
    return true;
  },
  setPlanOverride(id, month, amount) {
    const plan = this.getPurchasePlan(id);
    if (!plan) return null;
    if (!plan.overrides) plan.overrides = {};
    if (amount === null || amount === undefined) delete plan.overrides[month];
    else plan.overrides[month] = amount;
    plan.updatedAt = new Date().toISOString();
    this.save();
    this._log('setPlanOverride', 'id=' + id + ' month=' + month);
    return plan;
  },

  // The ONE merge implementation. importJSON('merge') and LAN sync's
  // mergeIntoDataStore() both route through here.
  //
  // They used to be two independent hand-written merges that disagreed:
  // importJSON did `records = [...incoming, ...local]` with no de-duplication
  // at all, so importing the same backup twice doubled every expense, while
  // LAN sync keyed on id. Neither carried allTags / tagColors / colorIndex.
  //
  // `incoming` must already have been through _sanitizeEntities().
  //
  // Second mode (cloud sync): pass `{ base }` — the ledger as it was at the last
  // successful sync — and this becomes a THREE-way merge. Without `base` the union
  // below cannot tell "the other side never had it" from "the other side deleted
  // it", so a delete on one device is resurrected by the next merge. With it, both
  // are distinguishable and no timestamp or tombstone needs to be added to the
  // ledger. `{ base, dryRun: true }` computes the result without touching the store.
  // Returns { data, conflicts } in this mode. Without `base` nothing here changed.
  _mergeData(incoming, opts) {
    if (!incoming || typeof incoming !== 'object') return this._data;
    if (opts && Object.prototype.hasOwnProperty.call(opts, 'base')) {
      const result = this._merge3(opts.base || null, this._data, incoming);
      if (opts.dryRun) return result;
      this._data = this._normalize(result.data);
      this._rev = (this._rev || 0) + 1;
      return result;
    }
    const cur = this._data;

    // Records: keyed by id, newest timestamp wins. A missing stamp counts as
    // oldest so an incoming row never silently discards a locally edited one.
    const recMap = new Map();
    (cur.records || []).forEach(r => { if (r && r.id) recMap.set(r.id, r); });
    (incoming.records || []).forEach(r => {
      if (!r || !r.id) return;
      const exist = recMap.get(r.id);
      if (!exist) { recMap.set(r.id, r); return; }
      const stampA = exist.updatedAt || exist.createdAt || '';
      const stampB = r.updatedAt || r.createdAt || '';
      if (stampB >= stampA) recMap.set(r.id, r);
    });
    cur.records = [...recMap.values()].sort((a, b) => {
      const da = (a && (a.date || a.createdAt)) || '';
      const db = (b && (b.date || b.createdAt)) || '';
      return da > db ? -1 : da < db ? 1 : 0;
    });

    // Id-keyed collections: add what is new, leave existing entries alone.
    // (Updating existing splitBills / purchasePlans needs a conflict policy —
    // see the known limitation in docs/ai/REFERENCE.md.)
    ['categories', 'contacts', 'billCategories', 'splitBills', 'purchasePlans'].forEach(k => {
      if (!Array.isArray(incoming[k])) return;
      if (!Array.isArray(cur[k])) cur[k] = [];
      const ids = new Set(cur[k].map(x => x && x.id).filter(Boolean));
      incoming[k].forEach(x => {
        if (!x || !x.id || ids.has(x.id)) return;
        cur[k].push(x);
        ids.add(x.id);
      });
    });

    // Keyed maps: incoming wins per key.
    ['budgets', 'categoryBudgets', 'monthlyIncome', 'billAmounts', 'tagColors'].forEach(k => {
      if (!incoming[k] || typeof incoming[k] !== 'object') return;
      if (!cur[k] || typeof cur[k] !== 'object') cur[k] = {};
      Object.assign(cur[k], incoming[k]);
    });

    // Tag library: union, kept sorted the way addTagUsage() maintains it.
    if (Array.isArray(incoming.allTags)) {
      if (!Array.isArray(cur.allTags)) cur.allTags = [];
      incoming.allTags.forEach(t => {
        if (typeof t === 'string' && t && cur.allTags.indexOf(t) === -1) cur.allTags.push(t);
      });
      cur.allTags.sort();
    }

    // Scalars: only overwrite when the payload actually carries one.
    if (incoming.savingsTarget) cur.savingsTarget = incoming.savingsTarget;
    if (incoming.whatIfParams) cur.whatIfParams = incoming.whatIfParams;
    if (incoming.percentBase) cur.percentBase = incoming.percentBase;
    // Highest wins — rewinding it would hand the next new category a colour
    // that is already in use.
    if (typeof incoming.colorIndex === 'number' && isFinite(incoming.colorIndex)) {
      cur.colorIndex = Math.max(cur.colorIndex || 0, incoming.colorIndex);
    }
    if (incoming.lastActiveMonth && incoming.lastActiveMonth > (cur.lastActiveMonth || '')) {
      cur.lastActiveMonth = incoming.lastActiveMonth;
    }

    return cur;
  },

  // Canonical serialisation for CHANGE DETECTION and merge equality. Unlike
  // _stableStringify (whose output is the fingerprint users compare across devices
  // and must not change) every array is order-free here: elements are identified by
  // their id or their content, so ordering differences alone never look like an edit.
  // Two devices holding the same data must hash the same however merging ordered it.
  _canonStringify(v, cache) {
    if (v === undefined) return 'null';
    if (v === null || typeof v !== 'object') return JSON.stringify(v);
    if (cache && cache.has(v)) return cache.get(v);
    let out;
    if (Array.isArray(v)) {
      out = '[' + v.map(x => this._canonStringify(x, cache)).sort().join(',') + ']';
    } else {
      const keys = Object.keys(v).filter(k => v[k] !== undefined).sort();
      out = '{' + keys.map(k => JSON.stringify(k) + ':' + this._canonStringify(v[k], cache)).join(',') + '}';
    }
    if (cache) cache.set(v, out);
    return out;
  },

  // Pure three-way merge of whole ledgers: base = the ledger at the last sync,
  // local = this device now, remote = the other side now. Never mutates its inputs.
  // Returns { data, conflicts }.
  //
  //   both sides equal                    -> that value
  //   only one side changed vs base       -> that side (including a deletion)
  //   both changed, both are objects      -> merge key by key
  //   both changed, both are arrays       -> align by id (strings/other: by content)
  //   both changed a repayment amount     -> base + local delta + remote delta
  //   one side deleted, the other edited  -> keep the edit, report a conflict
  //   same field edited to two values     -> newer `updatedAt` wins, else this device
  //
  // With base == null everything counts as "added on both sides": a plain union
  // that deletes nothing — the safe first merge when a device joins a cloud ledger.
  _merge3(base, local, remote) {
    const self = this;
    const cache = new WeakMap();
    const S = v => v === undefined ? '\u0001' : self._canonStringify(v, cache);
    const same = (a, b) => S(a) === S(b);
    const isObj = x => x !== null && typeof x === 'object' && !Array.isArray(x);
    const isNum = x => typeof x === 'number' && isFinite(x);
    const conflicts = [];
    const keptBills = new Set();
    // Preferences the user never set deliberately: this device's value wins, quietly.
    const SILENT = ['.savingsTarget', '.whatIfParams', '.percentBase'];
    // Composite settings that only make sense as a whole: two devices each changing a
    // different field would otherwise be stitched into a combination nobody chose.
    const ATOMIC = { '.savingsTarget': true, '.whatIfParams': true };
    const brief = v => v === undefined ? '—' : (v !== null && typeof v === 'object') ? '{…}' : String(v).slice(0, 60);
    const labelOf = x => (x && typeof x === 'object' && (x.name || x.note || (x.amount !== undefined ? String(x.amount) : ''))) || '';
    function note(path, kind, ctx, l, r) {
      if (SILENT.some(k => path === k || path.indexOf(k + '.') === 0)) return;
      if (conflicts.length < 200) conflicts.push({ path, kind, label: ctx.label || '', local: brief(l), remote: brief(r) });
    }
    function index(path, arr) {
      const map = new Map(), seen = {};
      arr.forEach(x => {
        let key;
        if (typeof x === 'string') key = 's:' + x;
        else if (isObj(x) && /participants$/.test(path)) key = 'p:' + (x.contactId || 'n:' + (x.name || ''));
        else if (isObj(x) && x.id !== undefined && x.id !== null) key = 'id:' + x.id;
        else key = 'h:' + S(x);
        // Two anonymous items can share a key; number them rather than lose one
        if (seen[key] === undefined) seen[key] = 0; else key += '#' + (++seen[key]);
        map.set(key, x);
      });
      return map;
    }
    function m(b, l, r, path, ctx) {
      if (same(l, r)) return l;
      if (same(b, l)) return r;                    // only the remote changed (or deleted it)
      if (same(b, r)) return l;                    // only this device changed (or deleted it)
      // Both changed, and differently.
      if (/\.updatedAt$/.test(path) && typeof l === 'string' && typeof r === 'string') return l > r ? l : r;
      if (path === '.colorIndex' && isNum(l) && isNum(r)) return Math.max(l, r);
      if (path === '.lastActiveMonth' && typeof l === 'string' && typeof r === 'string') return l > r ? l : r;
      if (l === undefined || r === undefined) {
        // One side deleted it, the other edited it. Money data: keep the edit.
        const bill = /^\.splitBills\[id:([^\]]+)\]$/.exec(path);
        if (bill) keptBills.add(bill[1]);
        note(path, 'delete-vs-edit', ctx, l, r);
        return l === undefined ? r : l;
      }
      if (!ATOMIC[path] && isObj(l) && isObj(r)) {
        const bo = isObj(b) ? b : {};
        // An entry stamped on both sides: the more recently edited copy wins a true clash
        const prefer = ('updatedAt' in l || 'updatedAt' in r)
          ? ((r.updatedAt || '') > (l.updatedAt || '') ? 'r' : 'l') : ctx.prefer;
        const child = { prefer, label: ctx.label };
        const out = {};
        new Set([...Object.keys(bo), ...Object.keys(l), ...Object.keys(r)]).forEach(k => {
          const v = m(bo[k], l[k], r[k], path + '.' + k, child);
          if (v !== undefined) out[k] = v;
        });
        return out;
      }
      if (!ATOMIC[path] && Array.isArray(l) && Array.isArray(r)) {
        const B = index(path, Array.isArray(b) ? b : []), L = index(path, l), R = index(path, r);
        const out = [];
        new Set([...L.keys(), ...R.keys()]).forEach(key => {
          const lv = L.get(key), rv = R.get(key);
          const v = m(B.get(key), lv, rv, path + '[' + key + ']',
            { prefer: ctx.prefer, label: labelOf(lv !== undefined ? lv : rv) || ctx.label });
          if (v !== undefined) out.push(v);
        });
        return out;
      }
      // A running total (money repaid): each side's increment counts, not just one of them.
      if (/\.paidAmount$/.test(path) && isNum(l) && isNum(r)) {
        const b0 = isNum(b) ? b : 0;
        return b0 + (l - b0) + (r - b0);
      }
      note(path, 'edit-vs-edit', ctx, l, r);
      return ctx.prefer === 'r' ? r : l;
    }

    const merged = m(base || {}, local, remote, '', { prefer: 'l', label: '' });
    // Detach from the inputs: the closing steps below edit in place.
    const res = JSON.parse(JSON.stringify(merged));

    // 1. Repayment totals are clamped into [0, share] and `paid` follows them. Only
    //    participants that carry paidAmount — a legacy boolean-only one is left alone.
    if (typeof SplitEngine !== 'undefined' && Array.isArray(res.splitBills)) {
      res.splitBills.forEach(bill => {
        if (!bill || !Array.isArray(bill.participants)) return;
        bill.participants = bill.participants.map(p =>
          p && p.paidAmount !== undefined && p.paidAmount !== null ? SplitEngine.withPaidAmount(p, p.paidAmount) : p);
      });
    }

    // 2. A split bill and its linked records travel as one chain (deleting one record
    //    cascades to the whole chain). If the bill survived a delete-vs-edit clash,
    //    bring its records back; if records survived without their bill, bring the
    //    bill back. Either way nothing is silently lost.
    if (Array.isArray(res.records) && Array.isArray(res.splitBills)) {
      const pool = (arr, key) => (arr && Array.isArray(arr[key])) ? arr[key] : [];
      const inputs = [local, remote, base];
      const haveRec = new Set(res.records.filter(r => r && r.id).map(r => r.id));
      const haveBill = new Set(res.splitBills.filter(b => b && b.id).map(b => b.id));
      keptBills.forEach(billId => {
        inputs.forEach(src => pool(src, 'records').forEach(r => {
          if (r && r.id && r.splitBillId === billId && !haveRec.has(r.id)) {
            res.records.push(JSON.parse(JSON.stringify(r))); haveRec.add(r.id);
          }
        }));
      });
      res.records.slice().forEach(r => {
        if (!r || !r.splitBillId || haveBill.has(r.splitBillId)) return;
        for (const src of inputs) {
          const bill = pool(src, 'splitBills').find(b => b && b.id === r.splitBillId);
          if (bill) {
            res.splitBills.push(JSON.parse(JSON.stringify(bill))); haveBill.add(bill.id);
            note('.splitBills[id:' + bill.id + ']', 'orphan-record', { label: labelOf(bill) }, bill, undefined);
            break;
          }
        }
      });
    }

    // 3. Each device back-fills the current month's instalment records on launch, with
    //    fresh ids, so two devices that both launched produce the same period twice.
    //    Keep one per (plan, month): the smallest id, which both sides agree on.
    if (Array.isArray(res.records)) {
      const winner = new Map();
      res.records.forEach(r => {
        if (!r || !r.planId || !r.planMonth) return;
        const k = r.planId + '|' + r.planMonth, cur = winner.get(k);
        if (cur === undefined || String(r.id) < String(cur)) winner.set(k, r.id);
      });
      res.records = res.records.filter(r => !r || !r.planId || !r.planMonth || winner.get(r.planId + '|' + r.planMonth) === r.id);
      res.records.sort((a, b) => {
        const da = (a && (a.date || a.createdAt)) || '', db = (b && (b.date || b.createdAt)) || '';
        return da > db ? -1 : da < db ? 1 : (String(a && a.id) < String(b && b.id) ? -1 : 1);
      });
    }

    return { data: res, conflicts };
  },

  // Export / Import
  exportJSON() {
    // lockData() sets _data to null. Serialising that produced the string
    // "null" — a normally-named backup file containing nothing at all.
    if (!this._data) return null;
    return JSON.stringify(this._data, null, 2);
  },

  importJSON(jsonStr, mode = 'replace') {
    try {
      const data = JSON.parse(jsonStr);
      if (!data.records || !data.categories) return false;
      // replace takes over the whole store, so it needs the full normalisation.
      // merge only contributes entities — backfilling defaults into it would let
      // a default savingsTarget / percentBase overwrite the local one.
      if (mode === 'replace') this._normalize(data);
      else this._sanitizeEntities(data);
      if (mode === 'replace') {
        this._data = data;
        this._markBulk('import-replace');
      } else {
        this._mergeData(data);
      }
      this.save();
      return true;
    } catch(e) {
      return false;
    }
  },

  exportCSV() {
    const cats = this._data.categories;
    const catMap = {};
    cats.forEach(c => catMap[c.id] = c);
    const splitBills = Array.isArray(this._data.splitBills) ? this._data.splitBills : [];
    const splitMap = {};
    splitBills.forEach(b => { if (b && b.id) splitMap[b.id] = b; });
    const planMap = {};
    (this._data.purchasePlans || []).forEach(p => { if (p && p.id) planMap[p.id] = p; });
    // Root of a subcategory, so the 分类 column stays comparable with Excel's
    const rootOf = id => {
      let cur = catMap[id];
      const guard = new Set();
      while (cur && cur.parentId && catMap[cur.parentId] && !guard.has(cur.id)) { guard.add(cur.id); cur = catMap[cur.parentId]; }
      return cur || null;
    };
    const header = __('datastore.csvHeader');
    const rows = this._data.records.map(r => {
      const cat = catMap[r.categoryId] || { name: __('datastore.unknown'), icon: '❓' };
      const root = cat.parentId ? rootOf(r.categoryId) : cat;
      const amount = r.amount.toFixed(2);
      const date = r.date || '';
      // Fixed (m3): escape newlines in text fields for valid CSV
      const safeNote = String(r.note || '').replace(/"/g, '""').replace(/\n/g, ' ').replace(/\r/g, ' ');
      const clean = v => String(v == null ? '' : v).replace(/"/g, '""').replace(/\n/g, ' ').replace(/\r/g, ' ');
      const safeCatName = clean((root ? root.icon + ' ' + root.name : cat.icon + ' ' + cat.name));
      const safeSubName = clean(cat.parentId ? cat.icon + ' ' + cat.name : '');
      const safeTags = clean(Array.isArray(r.tags) ? r.tags.join('、') : '');
      const splitMark = r.splitBillId ? (splitMap[r.splitBillId]
        ? __('datastore.splitMark', (parseFloat(splitMap[r.splitBillId].selfShare) || 0).toFixed(2))
        : __('datastore.splitBillOnly')) : '';
      // Instalment rows are ordinary expenses in every other column; without
      // this you cannot tell which of them belong to a 大额计划.
      const planMark = r.planId ? clean(planMap[r.planId]
        ? ((planMap[r.planId].icon || '') + ' ' + (planMap[r.planId].name || '') + (r.planMonth ? ' · ' + r.planMonth : '')).trim()
        : __('datastore.planGone')) : '';
      // Every field is quoted, the id included. It used to be the one bare field, which
      // was harmless only because the very next character was a comma — put a
      // quoted column after it and a lenient CSV reader can end up treating the
      // first comma as data. Uniform quoting removes the special case.
      return `"${r.id}","${isIncomeRec(r) ? __('datastore.typeIncome') : __('datastore.typeExpense')}","${amount}","${safeCatName}","${safeSubName}","${date}","${safeNote}","${r.createdAt}","${r.excludeFromAvg ? __('datastore.yes') : ''}","${safeTags}","${splitMark}","${planMark}"`;
    });
    return '\uFEFF' + header + '\n' + rows.join('\n');
  },

  clearAll() {
    // _normalize, not the bare defaults, for the same reason init() is: this must
    // leave the app in the state a fresh install would produce, migrations and all.
    this._data = this._normalize(this._defaults());
    this._markBulk('clear');
    this.save();
  },

  // Whole-ledger replacement (clear / replace-import / LAN replace). With cloud sync on,
  // the next sync must ASK before propagating it: a three-way merge reads "everything is
  // gone" as a mass deletion and would push it to every device. No-op with sync off.
  _markBulk(kind) {
    try { if (window.CloudSync) window.CloudSync.markBulk(kind); } catch (e) { /* never break the operation */ }
  },

  // What-If Analysis
  getWhatIfParams() {
    return this._data.whatIfParams || null;
  },
  setWhatIfParams(params) {
    this._data.whatIfParams = params;
    this.save();
  },
  clearWhatIfParams() {
    this._data.whatIfParams = null;
    this.save();
  },

  // Stats Range
  getStatsRange() {
    return localStorage.getItem('budgetStatsRange') || 'month';
  },
  setStatsRange(val) {
    if (val !== 'month' && val !== 'rolling30') return;
    localStorage.setItem('budgetStatsRange', val);
    this.save();
  },

  // Data hash for sync verification
  getLastUpdateTime() {
    const records = this._data.records;
    if (!records.length) return __('datastore.noData');
    let latest = '';
    records.forEach(r => {
      if (r.updatedAt && r.updatedAt > latest) latest = r.updatedAt;
      if (r.createdAt && r.createdAt > latest) latest = r.createdAt;
      if (r.date && r.date > latest) latest = r.date;
    });
    return latest || __('datastore.noData');
  },

  // Fields the fingerprint deliberately ignores: per-device state that drifts on
  // its own and would report a false mismatch between two devices holding
  // identical ledgers.
  _FINGERPRINT_IGNORE: ['lastActiveMonth'],

  // Order-independent, key-sorted serialisation. Two stores holding the same
  // data must hash the same even if their keys or their record arrays are in a
  // different order — merging and syncing both reorder things routinely.
  _stableStringify(v) {
    if (v === undefined) return 'null';
    if (v === null || typeof v !== 'object') return JSON.stringify(v);
    if (Array.isArray(v)) {
      // Sort by id when every element has one, so array order stops mattering
      let arr = v;
      if (v.length && v.every(x => x && typeof x === 'object' && x.id !== undefined)) {
        arr = v.slice().sort((a, b) => String(a.id) < String(b.id) ? -1 : String(a.id) > String(b.id) ? 1 : 0);
      }
      return '[' + arr.map(x => this._stableStringify(x)).join(',') + ']';
    }
    const keys = Object.keys(v).filter(k => v[k] !== undefined).sort();
    return '{' + keys.map(k => JSON.stringify(k) + ':' + this._stableStringify(v[k])).join(',') + '}';
  },

  getDataHash() {
    // Serialise EVERYTHING except an explicit ignore list.
    //
    // This used to be a hand-maintained whitelist of fields, last updated in
    // v3.1.0. Every field added after that silently fell outside it: category
    // icon and colour, splitBills.selfUnknown, splitBills.tag, tagColors — and
    // worst of all `payer`, which gates the entire split-bill money maths. Two
    // devices could differ by RM150 in net spending and still show the same
    // fingerprint. A whitelist can only ever lag behind; an ignore list cannot.
    const data = this._data;
    if (!data) return '------';
    const subset = {};
    Object.keys(data).sort().forEach(k => {
      if (k.charAt(0) === '_') return;                    // _rev and friends
      if (this._FINGERPRINT_IGNORE.indexOf(k) !== -1) return;
      subset[k] = data[k];
    });
    const fingerprint = this._stableStringify(subset);
    // DJB2 hash
    let hash = 5381;
    for (let i = 0; i < fingerprint.length; i++) {
      hash = ((hash << 5) + hash) + fingerprint.charCodeAt(i);
      hash = hash & hash;
    }
    // Convert to base36 uppercase, take 6 chars
    return Math.abs(hash).toString(36).toUpperCase().substring(0, 6).padStart(6, '0');
  },

  // === PIN Protection ===
  _arrayBufferToHex(buf) {
    return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
  },
  _hexToArrayBuffer(hex) {
    const bytes = new Uint8Array(hex.length / 2);
    for (let i = 0; i < hex.length; i += 2) {
      bytes[i/2] = parseInt(hex.substr(i, 2), 16);
    }
    return bytes.buffer;
  },
  _stringToUtf8ArrayBuffer(str) {
    return new TextEncoder().encode(str).buffer;
  },
  _utf8ArrayBufferToString(buf) {
    return new TextDecoder().decode(buf);
  },
  async _deriveKey(pin, salt) {
    const enc = new TextEncoder();
    const keyMaterial = await crypto.subtle.importKey(
      'raw', enc.encode(pin),
      'PBKDF2', false, ['deriveKey']
    );
    return crypto.subtle.deriveKey(
      { name: 'PBKDF2', salt: salt, iterations: 100000, hash: 'SHA-256' },
      keyMaterial,
      { name: 'AES-GCM', length: 256 },
      false, ['encrypt', 'decrypt']
    );
  },
  // PIN verifier (budgetAppPinHash). It used to be SHA-256(salt‖pin): one hash per
  // guess, so anyone holding this browser's storage could try every 4–6-digit PIN in
  // well under a second and then derive the AES key — the PBKDF2 cost protected
  // nothing. The verifier is now a fixed marker sealed with the SAME PBKDF2-derived
  // key as the ledger ('v2:' + iv‖ciphertext), so testing a guess costs as much as
  // decrypting the data. The key name is unchanged because other code only tests
  // for its presence. A legacy hex hash is replaced on the next correct PIN.
  //
  // Even so, a short numeric PIN can still be brute-forced offline by someone who
  // copies this storage; it guards against a person picking up the device.
  _PIN_CHECK: 'budget-pin-check/v2',
  async _makePinCheck(key) {
    return 'v2:' + await this._encryptWithKey(key, this._PIN_CHECK);
  },
  async _legacyHashPin(pin, salt) {
    const enc = new TextEncoder();
    const combined = new Uint8Array([...new Uint8Array(salt), ...enc.encode(pin)]);
    const hash = await crypto.subtle.digest('SHA-256', combined);
    return this._arrayBufferToHex(hash);
  },
  async isPinProtected() {
    return !!localStorage.getItem('budgetAppPinHash');
  },
  async verifyPin(pin) {
    const saltHex = localStorage.getItem('budgetAppSalt');
    const stored = localStorage.getItem('budgetAppPinHash');
    if (!saltHex || !stored) return true; // no PIN set
    const salt = this._hexToArrayBuffer(saltHex);
    if (stored.indexOf('v2:') === 0) {
      const key = await this._deriveKey(pin, salt);
      return (await this._decryptWithKey(key, stored.slice(3))) === this._PIN_CHECK;
    }
    if ((await this._legacyHashPin(pin, salt)) !== stored) return false;
    // Correct PIN against a legacy hash: upgrade it now. Failing to upgrade must not
    // lock the user out — the old hash still verifies next time.
    try {
      const key = await this._deriveKey(pin, salt);
      localStorage.setItem('budgetAppPinHash', await this._makePinCheck(key));
    } catch (e) { this._log('pin_upgrade_error', e && e.message); }
    return true;
  },
  // The ciphertext in budgetAppDataEncrypted is only as fresh as the last moment it
  // was written, while save() only ever writes the plaintext. So the ciphertext can
  // be arbitrarily stale, and every path that trusted it over the live ledger lost
  // data: lockApp() removed the plaintext, then unlock restored the stale copy;
  // changePin() re-encrypted the stale copy; clearPin() overwrote the plaintext with
  // it. The rules that keep it safe:
  //   - a plaintext ledger in storage is never older than the ciphertext (it is only
  //     removed after a verified re-seal), so it wins whenever both exist;
  //   - the live in-memory ledger is the freshest of all;
  //   - the plaintext is only removed once the ciphertext provably holds the same data.
  async setPin(pin, plainData) {
    const salt = crypto.getRandomValues(new Uint8Array(16));
    // Fixed (C1): if plainData is passed directly, use it instead of reading from localStorage.
    // Otherwise seal what is live in memory — the stored plaintext is only as new as the last save().
    if (plainData === undefined) {
      plainData = this._data ? JSON.stringify(this._data) : localStorage.getItem('budgetAppData');
    }
    // Everything that can fail runs before anything is written, so a failure cannot
    // leave a new PIN hash next to a ciphertext that was sealed with the old key.
    const key = await this._deriveKey(pin, salt);
    const check = await this._makePinCheck(key);
    const blob = plainData ? await this._encryptWithKey(key, plainData) : null;
    localStorage.setItem('budgetAppSalt', this._arrayBufferToHex(salt));
    localStorage.setItem('budgetAppPinHash', check);
    if (blob) {
      localStorage.setItem('budgetAppDataEncrypted', blob);
      // Remove plaintext data — only once the ciphertext holds it
      localStorage.removeItem('budgetAppData');
    }
    this._pinKey = key;
    this._purgePlaintextExtras();
  },
  async changePin(oldPin, newPin) {
    const valid = await this.verifyPin(oldPin);
    if (!valid) return false;
    // Fixed (C1): keep plaintext in memory, do NOT write to localStorage.
    // The live ledger is the truth; the old ciphertext is the fallback of last resort
    // (it is stale by construction — it was only written when the PIN was set/changed).
    let plaintext = this._data ? JSON.stringify(this._data) : localStorage.getItem('budgetAppData');
    if (!plaintext) {
      const salt = this._hexToArrayBuffer(localStorage.getItem('budgetAppSalt'));
      plaintext = await this._decryptData(oldPin, salt);
    }
    // setPin() overwrites the ciphertext only after the new one is ready
    await this.setPin(newPin, plaintext || undefined);
    return true;
  },
  async clearPin(oldPin) {
    const valid = await this.verifyPin(oldPin);
    if (!valid) return false;
    // Freshest wins: live memory > plaintext in storage > (stale) ciphertext
    let plaintext = this._data ? JSON.stringify(this._data) : localStorage.getItem('budgetAppData');
    if (!plaintext) {
      const salt = this._hexToArrayBuffer(localStorage.getItem('budgetAppSalt'));
      plaintext = await this._decryptData(oldPin, salt);
    }
    localStorage.removeItem('budgetAppSalt');
    localStorage.removeItem('budgetAppPinHash');
    localStorage.removeItem('budgetAppDataEncrypted');
    this._pinKey = null;
    if (plaintext) {
      localStorage.setItem('budgetAppData', plaintext);
    }
    return true;
  },
  async _encryptWithKey(key, data) {
    // Note (i2): AES-GCM IV must be 12 bytes (96 bits) — crypto.getRandomValues ensures uniqueness.
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const encrypted = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      key, new TextEncoder().encode(data)
    );
    // Store iv + ciphertext together
    return this._arrayBufferToHex(new Uint8Array([...iv, ...new Uint8Array(encrypted)]));
  },
  async _decryptWithKey(key, combinedHex) {
    if (!combinedHex) return null;
    const combined = new Uint8Array(this._hexToArrayBuffer(combinedHex));
    try {
      const decrypted = await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv: combined.slice(0, 12) },
        key, combined.slice(12)
      );
      return new TextDecoder().decode(decrypted);
    } catch(e) {
      return null; // wrong pin or corrupted data
    }
  },
  async _encryptData(pin, salt, data) {
    // Fixed (C1): accept optional data parameter; fall back to localStorage
    if (data === undefined) {
      data = localStorage.getItem('budgetAppData');
    }
    const key = await this._deriveKey(pin, salt);
    this._pinKey = key;
    if (!data) return;
    localStorage.setItem('budgetAppDataEncrypted', await this._encryptWithKey(key, data));
  },
  async _decryptData(pin, salt) {
    const key = await this._deriveKey(pin, salt);
    const plaintext = await this._decryptWithKey(key, localStorage.getItem('budgetAppDataEncrypted'));
    if (plaintext !== null) this._pinKey = key;   // a correct PIN: keep the key so lock can re-seal
    return plaintext;
  },
  // Re-encrypt the LIVE ledger with the key kept since unlock, so that removing the
  // plaintext can never strand newer data behind a stale ciphertext. Resolves true
  // only when the new ciphertext was written AND reads back to exactly the same JSON.
  // Resolves false (touching nothing that matters) when there is no key or no data —
  // the caller must then leave the plaintext where it is.
  async sealForLock() {
    if (!this._data || !this._pinKey) return false;
    for (let attempt = 0; attempt < 3; attempt++) {
      const rev = this._rev;
      const json = JSON.stringify(this._data);
      const blob = await this._encryptWithKey(this._pinKey, json);
      if (this._rev !== rev) continue;            // edited while encrypting — seal again
      localStorage.setItem('budgetAppDataEncrypted', blob);
      return (await this._decryptWithKey(this._pinKey, localStorage.getItem('budgetAppDataEncrypted'))) === json;
    }
    return false;
  },
  // With a PIN set, nothing that reveals the ledger may outlive a lock in plain text.
  // Two things used to: the LAN-sync pre-merge backup (a full plaintext copy of the
  // ledger that nothing ever reads back) and diagnostic entries written by older
  // builds, which carried contact names and amounts. Called after setPin() and after
  // a lock whose re-seal succeeded — never while the plaintext ledger is still the
  // only good copy.
  _purgePlaintextExtras() {
    try {
      localStorage.removeItem('budgetBackupBeforeSync');
      localStorage.removeItem('budgetBackupTime');
    } catch (e) { /* ignore */ }
    const scrub = e => {
      if (e && typeof e.d === 'string') {
        e.d = e.d.replace(/\bname=.*$/, 'name=[redacted]').replace(/\bamount=[^\s,]*/g, 'amount=[redacted]');
      }
      return e;
    };
    this.__log.forEach(scrub);
    try {
      const persisted = JSON.parse(localStorage.getItem('budgetAppLog') || '[]');
      if (Array.isArray(persisted)) localStorage.setItem('budgetAppLog', JSON.stringify(persisted.map(scrub)));
    } catch (e) { /* ignore */ }
  },
  async unlockData(pin) {
    const saltHex = localStorage.getItem('budgetAppSalt');
    if (!saltHex) return false;
    const salt = this._hexToArrayBuffer(saltHex);
    const plaintext = await this._decryptData(pin, salt);
    if (!plaintext) return false;
    // A plaintext ledger already in storage is newer than the ciphertext (see above):
    // it is only left behind when a lock could not re-seal. Never overwrite it with
    // the older copy.
    if (localStorage.getItem('budgetAppData') === null) {
      localStorage.setItem('budgetAppData', plaintext);
    }
    this.init();
    // We hold the key again: refresh the ciphertext right away instead of waiting for the next lock
    try { await this.sealForLock(); } catch(e) { this._log('seal_error', e.message); }
    return true;
  },
  lockData() {
    // Remove plaintext data from memory and storage
    this._data = null;
    localStorage.removeItem('budgetAppData');
  },

  // === Tags ===
  getAllTags() {
    if (!this._data.allTags) this._data.allTags = [];
    return this._data.allTags;
  },
  addTagUsage(tag) {
    if (!this._data.allTags) this._data.allTags = [];
    const trimmed = tag.trim();
    if (trimmed && !this._data.allTags.includes(trimmed)) {
      this._data.allTags.push(trimmed);
      this._data.allTags.sort();
      this.save();
    }
  },
  getRecordsByTag(tag) {
    return this._data.records.filter(r => r.tags && r.tags.includes(tag));
  },
  getTagStats(tag) {
    const records = this.getRecordsByTag(tag);
    const total = records.reduce((s, r) => s + r.amount, 0);
    return { count: records.length, total, records };
  },
  cleanUnusedTags() {
    if (!this._data.allTags) return;
    const usedTags = new Set();
    this._data.records.forEach(r => {
      if (r.tags) r.tags.forEach(t => usedTags.add(t));
    });
    this._data.allTags = this._data.allTags.filter(t => usedTags.has(t));
    this.save();
  },

  // === Tag Colors ===
  getTagColor(tagName) {
    if (!this._data.tagColors) this._data.tagColors = {};
    return this._data.tagColors[tagName] || null;
  },
  setTagColor(tagName, color) {
    if (!this._data.tagColors) this._data.tagColors = {};
    this._data.tagColors[tagName] = color;
    this.save();
  },
  resetTagColor(tagName) {
    if (this._data.tagColors && this._data.tagColors[tagName]) {
      delete this._data.tagColors[tagName];
      this.save();
    }
  },
  getAllTagColors() {
    return this._data.tagColors || {};
  },
};

  // i18n translations
  addI18nEntries({
    'datastore.saveFailed': { zh: '❌ 数据保存失败: {0}', en: '❌ Save failed: {0}' },
    'datastore.csvHeader': { zh: 'ID,类型,金额,分类,子分类,日期,备注,创建时间,不计日均,标签,分摊,所属计划', en: 'ID,Type,Amount,Category,Subcategory,Date,Note,CreatedAt,ExcludeFromAvg,Tags,Split,Plan' },
    'datastore.typeExpense': { zh: '支出', en: 'Expense' },
    'datastore.typeIncome': { zh: '收入', en: 'Income' },
    'datastore.planGone': { zh: '（计划已删除）', en: '(plan deleted)' },
    'datastore.unknown': { zh: '未知', en: 'Unknown' },
    'datastore.yes': { zh: '是', en: 'Yes' },
    'datastore.splitBillOnly': { zh: '🧾 分摊账单', en: '🧾 Split bill' },
    'datastore.splitMark': { zh: '🧾 分摊（自份额 {0}）', en: '🧾 Split bill (my share {0})' },
    'datastore.noData': { zh: '无数据', en: 'No data' }
  });

  // === EXPORTS ===
  window.DataStore = DataStore;
  window.DataStore.getStatsRange = DataStore.getStatsRange.bind(DataStore);
  window.DataStore.setStatsRange = DataStore.setStatsRange.bind(DataStore);
  window.logEvent = function(action, detail) {
    DataStore._log(action, detail);
  };
  // PIN Protection async exports
  window.DataStore.isPinProtected = DataStore.isPinProtected.bind(DataStore);
  window.DataStore.verifyPin = DataStore.verifyPin.bind(DataStore);
  window.DataStore.setPin = DataStore.setPin.bind(DataStore);
  window.DataStore.changePin = DataStore.changePin.bind(DataStore);
  window.DataStore.clearPin = DataStore.clearPin.bind(DataStore);
  window.DataStore._normalize = DataStore._normalize.bind(DataStore);
  window.DataStore._sanitizeEntities = DataStore._sanitizeEntities.bind(DataStore);
  window.DataStore._mergeData = DataStore._mergeData.bind(DataStore);
  window.DataStore.unlockData = DataStore.unlockData.bind(DataStore);
  window.DataStore.lockData = DataStore.lockData.bind(DataStore);
  window.DataStore.getAllTags = DataStore.getAllTags.bind(DataStore);
  window.DataStore.addTagUsage = DataStore.addTagUsage.bind(DataStore);
  window.DataStore.getRecordsByTag = DataStore.getRecordsByTag.bind(DataStore);
  window.DataStore.getTagStats = DataStore.getTagStats.bind(DataStore);
  window.DataStore.cleanUnusedTags = DataStore.cleanUnusedTags.bind(DataStore);
  window.DataStore.getTagColor = DataStore.getTagColor.bind(DataStore);
  window.DataStore.setTagColor = DataStore.setTagColor.bind(DataStore);
  window.DataStore.resetTagColor = DataStore.resetTagColor.bind(DataStore);
  window.DataStore.getAllTagColors = DataStore.getAllTagColors.bind(DataStore);
})();
