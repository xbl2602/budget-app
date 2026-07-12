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
      whatIfParams: null
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
        this._data = JSON.parse(raw);
        if (!this._data.categories || !this._data.categories.length) {
          this._data.categories = JSON.parse(JSON.stringify(DEFAULT_CATEGORIES));
        }
        if (!this._data.savingsTarget) {
          this._data.savingsTarget = { type: 'fixed', fixedAmount: 0, percent: 0 };
        }
        if (!this._data.categoryBudgets) {
          this._data.categoryBudgets = {};
        }
        if (!this._data.billCategories) {
          this._data.billCategories = [];
        }
        if (!this._data.billAmounts) {
          this._data.billAmounts = {};
        }
        if (!this._data.monthlyIncome) {
          this._data.monthlyIncome = {};
        }
        if (!this._data.percentBase) {
          this._data.percentBase = 'gross';
        }
        if (!this._data.lastActiveMonth) {
          this._data.lastActiveMonth = '';
        }
        if (!this._data.whatIfParams) {
          this._data.whatIfParams = null;
        }
      } catch(e) {
        this._data = this._defaults();
      }
    } else {
      this._data = this._defaults();
    }

    // Task 2: Migration — copy existing budget to monthlyIncome if present
    const currentMonth = getMonthKey(new Date().toISOString());
    if (this._data.budgets && this._data.budgets[currentMonth]) {
      if (!this._data.monthlyIncome[currentMonth]) {
        this._data.monthlyIncome[currentMonth] = this._data.budgets[currentMonth];
      }
    }
    if (!this._data.lastActiveMonth) {
      this._data.lastActiveMonth = currentMonth;
    }

    this.save();
  },

  save() {
    try {
      localStorage.setItem('budgetAppData', JSON.stringify(this._data));
      this._log('save', 'records=' + this._data.records.length);
    } catch(e) {
      this._log('save_error', e.message);
      // Try to notify user via toast if available
      if (typeof showToast === 'function') {
        showToast('❌ 数据保存失败: ' + e.message, 'error');
      }
    }
  },

  // Records
  getRecords() { return this._data.records; },
  getRecord(id) { return this._data.records.find(r => r.id === id); },

  addRecord(record) {
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
    // Remove from active list
    this._data.records = this._data.records.filter(r => r.id !== id);
    this.save();
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
        return this._pendingDelete.record;
      }
      // Different record: finalize the previous one immediately
      this._finalizeDelete(this._pendingDelete.id);
    }
    // Remove from records list
    this._data.records = this._data.records.filter(r => r.id !== id);
    this.save();
    // Set pending
    this._pendingDelete = {
      id,
      record,
      timeoutId: setTimeout(() => {
        this._finalizeDelete(id);
      }, 5000)
    };
    return record;
  },

  // Undo a pending delete
  undoDelete() {
    if (!this._pendingDelete) { this._log('undoDelete', 'NOTHING_PENDING'); return false; }
    this._log('undoDelete', 'id=' + this._pendingDelete.id);
    clearTimeout(this._pendingDelete.timeoutId);
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
        this._data = JSON.parse(raw);
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
    const len = this._data.records.length;
    this._data.records = this._data.records.filter(r => r.id !== id);
    if (this._data.records.length < len) {
      this.save();
      return true;
    }
    this._log('forceDeleteRecord', 'id=' + id + ' NOT_FOUND');
    return false;
  },

  // Categories
  getCategories() { return this._data.categories; },
  getCategory(id) { return this._data.categories.find(c => c.id === id); },

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
      const idx = this._data.colorIndex || 0;
      cat.color = COLORS[idx % COLORS.length];
      this._data.colorIndex = (this._data.colorIndex || 0) + 1;
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
  getBudget(month) { return this._data.budgets[month] || 0; },
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
      delete this._data.categoryBudgets[key];
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

  // Export / Import
  exportJSON() {
    return JSON.stringify(this._data, null, 2);
  },

  importJSON(jsonStr, mode = 'replace') {
    try {
      const data = JSON.parse(jsonStr);
      if (!data.records || !data.categories) return false;
      if (mode === 'replace') {
        this._data = data;
      } else {
        this._data.records = [...data.records, ...this._data.records];
        const existIds = new Set(this._data.categories.map(c => c.id));
        data.categories.forEach(c => {
          if (!existIds.has(c.id)) {
            this._data.categories.push(c);
            existIds.add(c.id);
          }
        });
        Object.assign(this._data.budgets, data.budgets || {});
        if (data.savingsTarget) this._data.savingsTarget = data.savingsTarget;
        if (data.billCategories) {
          this._data.billCategories = [...this._data.billCategories, ...data.billCategories];
        }
        Object.assign(this._data.monthlyIncome || {}, data.monthlyIncome || {});
        Object.assign(this._data.billAmounts || {}, data.billAmounts || {});
        if (data.percentBase) this._data.percentBase = data.percentBase;
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
    const header = 'ID,金额,分类,日期,备注,创建时间,不计日均';
    const rows = this._data.records.map(r => {
      const cat = catMap[r.categoryId] || { name: '未知', icon: '❓' };
      const amount = r.amount.toFixed(2);
      const date = r.date || '';
      const note = (r.note || '').replace(/"/g, '""');
      return `${r.id},"${amount}","${cat.icon}${cat.name}","${date}","${note}","${r.createdAt}","${r.excludeFromAvg ? '是' : ''}"`;
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
    if (!records.length) return '无数据';
    let latest = '';
    records.forEach(r => {
      if (r.updatedAt && r.updatedAt > latest) latest = r.updatedAt;
      if (r.createdAt && r.createdAt > latest) latest = r.createdAt;
      if (r.date && r.date > latest) latest = r.date;
    });
    return latest || '无数据';
  },

  getDataHash() {
    // Generate a simple hash from all data to detect sync mismatches
    const data = this._data;
    const fingerprint = JSON.stringify({
      records: data.records.map(r => ({ id: r.id, amount: r.amount, categoryId: r.categoryId, date: r.date, note: r.note, updatedAt: r.updatedAt })),
      categories: data.categories.map(c => ({ id: c.id, name: c.name, parentId: c.parentId })),
      budgets: data.budgets,
      categoryBudgets: data.categoryBudgets,
      savingsTarget: data.savingsTarget,
      billCategories: data.billCategories,
      billAmounts: data.billAmounts,
      monthlyIncome: data.monthlyIncome,
      percentBase: data.percentBase
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
  async setPin(pin) {
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const hash = await this._hashPin(pin, salt);
    localStorage.setItem('budgetAppSalt', this._arrayBufferToHex(salt));
    localStorage.setItem('budgetAppPinHash', hash);
    // Encrypt existing data
    await this._encryptData(pin, salt);
    // Remove plaintext data
    localStorage.removeItem('budgetAppData');
  },
  async changePin(oldPin, newPin) {
    const valid = await this.verifyPin(oldPin);
    if (!valid) return false;
    // Decrypt with old pin first
    const saltHex = localStorage.getItem('budgetAppSalt');
    const salt = this._hexToArrayBuffer(saltHex);
    const plaintext = await this._decryptData(oldPin, salt);
    if (plaintext) {
      localStorage.setItem('budgetAppData', plaintext);
      localStorage.removeItem('budgetAppDataEncrypted');
    }
    // Set new pin (re-encrypts)
    await this.setPin(newPin);
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
  async _encryptData(pin, salt) {
    const key = await this._deriveKey(pin, salt);
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const data = localStorage.getItem('budgetAppData');
    if (!data) return;
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
