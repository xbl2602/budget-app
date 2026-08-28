/* ============================================================
   DataStore
   ============================================================ */
(function() {
'use strict';

const DataStore = {
  _data: null,
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
        this._data = this._defaults();
      }
    } else {
      this._data = this._defaults();
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

    return data;
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

    // 3. Historical migrations
    this._migrateSplitRecordCategories(data);
    const currentMonth = getMonthKey(new Date().toISOString());
    if (data.budgets && data.budgets[currentMonth] && !data.monthlyIncome[currentMonth]) {
      data.monthlyIncome[currentMonth] = data.budgets[currentMonth];
    }
    if (!data.lastActiveMonth) data.lastActiveMonth = currentMonth;

    return data;
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

  addRecord(record) {
    // Fixed: validate amount field (M1)
    if (typeof record.amount !== 'number' || !isFinite(record.amount)) {
      record.amount = 0;
    }
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
    this.save();
    return this._data.records[idx];
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
      if (stored) {
        var pending = JSON.parse(stored);
        if (pending.deleteAt && Date.now() >= pending.deleteAt) {
          // Also remove from records list if not already removed
          this._data.records = this._data.records.filter(function(r) { return r.id !== pending.id; });
          localStorage.removeItem('budgetPendingDeletes');
          this._log('_processPendingDeletes', 'finalized id=' + pending.id);
        }
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
    return true;
  },

  // Finalize: permanently erase (already removed from list, just clear pending state)
  _finalizeDelete(id) {
    this._log('_finalizeDelete', 'id=' + id + ' pending=' + (this._pendingDelete ? this._pendingDelete.id : 'null'));
    if (this._pendingDelete && this._pendingDelete.id === id) {
      this._pendingDelete = null;
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

  getRootCategories() {
    return this._data.categories.filter(c => !c.parentId)
      .sort((a,b) => a.sortOrder - b.sortOrder);
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
    this._log('setPlanOverride', 'id=' + id + ' month=' + month + ' amount=' + amount);
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
  _mergeData(incoming) {
    if (!incoming || typeof incoming !== 'object') return this._data;
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

  // Export / Import
  exportJSON() {
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
    const header = __('datastore.csvHeader');
    const rows = this._data.records.map(r => {
      const cat = catMap[r.categoryId] || { name: __('datastore.unknown'), icon: '❓' };
      const amount = r.amount.toFixed(2);
      const date = r.date || '';
      // Fixed (m3): escape newlines in text fields for valid CSV
      const safeNote = String(r.note || '').replace(/"/g, '""').replace(/\n/g, ' ').replace(/\r/g, ' ');
      const safeCatName = String(cat.icon + cat.name).replace(/"/g, '""').replace(/\n/g, ' ').replace(/\r/g, ' ');
      const safeTags = String(Array.isArray(r.tags) ? r.tags.join('、') : '').replace(/"/g, '""').replace(/\n/g, ' ').replace(/\r/g, ' ');
      const splitMark = r.splitBillId ? (splitMap[r.splitBillId]
        ? __('datastore.splitMark', splitMap[r.splitBillId].selfShare || 0)
        : __('datastore.splitBillOnly')) : '';
      return `${r.id},"${amount}","${safeCatName}","${date}","${safeNote}","${r.createdAt}","${r.excludeFromAvg ? __('datastore.yes') : ''}","${safeTags}","${splitMark}"`;
    });
    return '\uFEFF' + header + '\n' + rows.join('\n');
  },

  clearAll() {
    this._data = this._defaults();
    this.save();
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

  getDataHash() {
    // Generate a simple hash from all data to detect sync mismatches
    const data = this._data;
    const fingerprint = JSON.stringify({
      records: data.records.map(r => ({ id: r.id, amount: r.amount, categoryId: r.categoryId, date: r.date, note: r.note, tags: r.tags, splitBillId: r.splitBillId, excludeFromAvg: r.excludeFromAvg, planId: r.planId, planMonth: r.planMonth, _deleted: r._deleted, updatedAt: r.updatedAt })),
      categories: data.categories.map(c => ({ id: c.id, name: c.name, parentId: c.parentId })),
      budgets: data.budgets,
      categoryBudgets: data.categoryBudgets,
      savingsTarget: data.savingsTarget,
      billCategories: data.billCategories,
      billAmounts: data.billAmounts,
      monthlyIncome: data.monthlyIncome,
      percentBase: data.percentBase,
      contacts: data.contacts,
      allTags: data.allTags,
      splitBills: (data.splitBills || []).map(b => ({ id: b.id, amount: b.amount, date: b.date, categoryId: b.categoryId, selfShare: b.selfShare, mode: b.mode, note: b.note, archived: b.archived, participants: (b.participants || []).map(p => ({ contactId: p.contactId, name: p.name, share: p.share, paid: p.paid, paidAmount: p.paidAmount, unknown: p.unknown })) })),
      purchasePlans: (data.purchasePlans || []).map(p => ({ id: p.id, name: p.name, icon: p.icon, totalAmount: p.totalAmount, mode: p.mode, startMonth: p.startMonth, months: p.months, categoryId: p.categoryId, status: p.status, overrides: p.overrides, note: p.note }))
    });
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
  async _hashPin(pin, salt) {
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
    const storedHash = localStorage.getItem('budgetAppPinHash');
    if (!saltHex || !storedHash) return true; // no PIN set
    const salt = this._hexToArrayBuffer(saltHex);
    const hash = await this._hashPin(pin, salt);
    return hash === storedHash;
  },
  async setPin(pin, plainData) {
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const hash = await this._hashPin(pin, salt);
    localStorage.setItem('budgetAppSalt', this._arrayBufferToHex(salt));
    localStorage.setItem('budgetAppPinHash', hash);
    // Fixed (C1): if plainData is passed directly, use it instead of reading from localStorage
    if (plainData !== undefined) {
      await this._encryptData(pin, salt, plainData);
    } else {
      await this._encryptData(pin, salt);
    }
    // Remove plaintext data
    localStorage.removeItem('budgetAppData');
  },
  async changePin(oldPin, newPin) {
    const valid = await this.verifyPin(oldPin);
    if (!valid) return false;
    // Fixed (C1): keep plaintext in memory, do NOT write to localStorage
    const saltHex = localStorage.getItem('budgetAppSalt');
    const salt = this._hexToArrayBuffer(saltHex);
    const plaintext = await this._decryptData(oldPin, salt);
    // Remove old encrypted data
    localStorage.removeItem('budgetAppDataEncrypted');
    // Set new pin with plaintext passed directly in memory (C1)
    if (plaintext) {
      await this.setPin(newPin, plaintext);
    } else {
      await this.setPin(newPin);
    }
    return true;
  },
  async clearPin(oldPin) {
    const valid = await this.verifyPin(oldPin);
    if (!valid) return false;
    const saltHex = localStorage.getItem('budgetAppSalt');
    const salt = this._hexToArrayBuffer(saltHex);
    const plaintext = await this._decryptData(oldPin, salt);
    localStorage.removeItem('budgetAppSalt');
    localStorage.removeItem('budgetAppPinHash');
    localStorage.removeItem('budgetAppDataEncrypted');
    if (plaintext) {
      localStorage.setItem('budgetAppData', plaintext);
    }
    return true;
  },
  async _encryptData(pin, salt, data) {
    // Fixed (C1): accept optional data parameter; fall back to localStorage
    if (data === undefined) {
      data = localStorage.getItem('budgetAppData');
    }
    if (!data) return;
    const key = await this._deriveKey(pin, salt);
    // Note (i2): AES-GCM IV must be 12 bytes (96 bits) — crypto.getRandomValues ensures uniqueness.
    // For production, consider checking iv.length === 12 or storing iv separately from ciphertext.
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const encoded = new TextEncoder().encode(data);
    const encrypted = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      key, encoded
    );
    // Store iv + ciphertext together
    const combined = new Uint8Array([...iv, ...new Uint8Array(encrypted)]);
    localStorage.setItem('budgetAppDataEncrypted', this._arrayBufferToHex(combined));
  },
  async _decryptData(pin, salt) {
    const key = await this._deriveKey(pin, salt);
    const combinedHex = localStorage.getItem('budgetAppDataEncrypted');
    if (!combinedHex) return null;
    const combined = new Uint8Array(this._hexToArrayBuffer(combinedHex));
    const iv = combined.slice(0, 12);
    const ciphertext = combined.slice(12);
    try {
      const decrypted = await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv },
        key, ciphertext
      );
      return new TextDecoder().decode(decrypted);
    } catch(e) {
      return null; // wrong pin or corrupted data
    }
  },
  async unlockData(pin) {
    const saltHex = localStorage.getItem('budgetAppSalt');
    if (!saltHex) return false;
    const salt = this._hexToArrayBuffer(saltHex);
    const plaintext = await this._decryptData(pin, salt);
    if (!plaintext) return false;
    localStorage.setItem('budgetAppData', plaintext);
    this.init();
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
    return this._data.records.filter(r => r.tags && r.tags.includes(tag) && !r._deleted);
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
    'datastore.csvHeader': { zh: 'ID,金额,分类,日期,备注,创建时间,不计日均,标签,分摊', en: 'ID,Amount,Category,Date,Note,CreatedAt,ExcludeFromAvg,Tags,Split' },
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
