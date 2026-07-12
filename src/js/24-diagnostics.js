/* ============================================================
   DIAGNOSTICS — Operation Logging & Data Verification
   ============================================================ */
(function() {
'use strict';

// ============================================================
// DIAGNOSTICS — Operation Logging & Data Verification
// ============================================================
// This module wraps DataStore and StatsEngine to log every operation.

const DIAG = {
  MAX_LOG: 200,
  ops: [],
  
  _log(opType, details) {
    const entry = {
      t: new Date().toISOString(),
      op: opType,
      details: details,
      memRecords: DataStore.getRecords().length,
      lsRecords: 0
    };
    // Read localStorage directly for comparison
    try {
      const raw = localStorage.getItem('budgetAppData');
      if (raw) {
        const lsData = JSON.parse(raw);
        entry.lsRecords = (lsData.records || []).length;
        entry.lsSize = raw.length;
        // Detect discrepancy
        entry.discrepancy = (entry.memRecords !== entry.lsRecords);
      }
    } catch(e) {
      entry.lsError = e.message;
    }
    this.ops.push(entry);
    if (this.ops.length > this.MAX_LOG) this.ops.shift();
    
    // Always log to console for real-time debugging
    console.log('[DIAG] ' + opType, details, 
      'mem=' + entry.memRecords + ' ls=' + entry.lsRecords + (entry.discrepancy ? ' ⚠️ MISMATCH' : ''));
    
    return entry;
  },

  clearLog() {
    this.ops = [];
  },

  getLog() {
    return this.ops.slice();
  },

  // Wrap a DataStore method to add before/after logging
  wrapDataStoreMethod(methodName) {
    const original = DataStore[methodName];
    if (typeof original !== 'function') return;
    
    DataStore[methodName] = function(...args) {
      // Snapshot before
      const beforeRecords = this._data ? this._data.records.length : -1;
      const beforeIds = this._data ? this._data.records.map(r => r.id).slice(0, 5) : [];
      
      // Call original
      const result = original.apply(this, args);
      
      // Snapshot after
      const afterRecords = this._data ? this._data.records.length : -1;
      const afterIds = this._data ? this._data.records.map(r => r.id).slice(0, 5) : [];
      
      // Log
      DIAG._log('DataStore.' + methodName, {
        args: args.map(a => typeof a === 'string' ? a.substring(0, 40) : a),
        before: { recordCount: beforeRecords, sampleIds: beforeIds },
        after: { recordCount: afterRecords, sampleIds: afterIds },
        pendingDelete: this._pendingDelete ? this._pendingDelete.id : null
      });
      
      return result;
    };
  },

  // Compare in-memory _data with localStorage directly
  compareWithStorage() {
    const result = {
      memRecords: DataStore.getRecords().length,
      memRecordIds: DataStore.getRecords().map(r => r.id),
      lsRecords: 0,
      lsRecordIds: [],
      inMemNotLS: [],
      inLSNotMem: [],
      match: false,
      pendingDelete: null
    };
    
    try {
      const raw = localStorage.getItem('budgetAppData');
      if (raw) {
        const lsData = JSON.parse(raw);
        const lsRecords = lsData.records || [];
        result.lsRecords = lsRecords.length;
        result.lsRecordIds = lsRecords.map(r => r.id);
        
        // Find records in memory but not in localStorage
        const lsIdSet = new Set(result.lsRecordIds);
        result.inMemNotLS = result.memRecordIds.filter(id => !lsIdSet.has(id));
        
        // Find records in localStorage but not in memory
        const memIdSet = new Set(result.memRecordIds);
        result.inLSNotMem = result.lsRecordIds.filter(id => !memIdSet.has(id));
        
        result.match = (result.memRecords === result.lsRecords) && result.inLSNotMem.length === 0;
      }
    } catch(e) {
      result.error = e.message;
    }
    
    result.pendingDelete = DataStore.getPendingDelete() ? DataStore.getPendingDelete().id : null;
    
    DIAG._log('compareWithStorage', {
      match: result.match,
      inLSNotMem: result.inLSNotMem.length,
      inMemNotLS: result.inMemNotLS.length
    });
    
    return result;
  },

  // Get full storage info
  getStorageInfo() {
    const info = {
      memory: { records: DataStore.getRecords().length, categories: DataStore.getCategories().length },
      localStorage: { totalSize: 0, appDataSize: 0, logSize: 0 },
      pendingDelete: DataStore.getPendingDelete() ? DataStore.getPendingDelete().id : null
    };
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        const val = localStorage.getItem(key);
        const size = (val ? val.length : 0);
        if (key === 'budgetAppData') info.localStorage.appDataSize = size;
        else if (key === 'budgetAppLog') info.localStorage.logSize = size;
        info.localStorage.totalSize += size;
      }
    } catch(e) {
      info.error = e.message;
    }
    return info;
  },

  // Export full diagnostic report as text
  exportDiagnosticReport() {
    const compare = this.compareWithStorage();
    const storage = this.getStorageInfo();
    const log = this.getLog();
    const pending = DataStore.getPendingDelete();
    
    let text = '=== Budget App Diagnostic Report ===\n';
    text += 'Generated: ' + new Date().toISOString() + '\n';
    text += 'Version: v2.7.0\n';
    text += '\n--- Memory vs LocalStorage ---\n';
    text += 'Memory records: ' + compare.memRecords + '\n';
    text += 'LocalStorage records: ' + compare.lsRecords + '\n';
    text += 'Match: ' + (compare.match ? 'YES ✅' : 'NO ⚠️') + '\n';
    if (compare.inLSNotMem.length > 0) {
      text += 'Records in LS but NOT in memory: ' + compare.inLSNotMem.length + '\n';
      text += '  IDs: ' + compare.inLSNotMem.slice(0, 20).join(', ') + '\n';
    }
    if (compare.inMemNotLS.length > 0) {
      text += 'Records in memory but NOT in LS: ' + compare.inMemNotLS.length + '\n';
      text += '  IDs: ' + compare.inMemNotLS.slice(0, 20).join(', ') + '\n';
    }
    
    text += '\n--- Storage Info ---\n';
    text += 'localStorage total: ' + storage.localStorage.totalSize + ' bytes\n';
    text += 'budgetAppData: ' + storage.localStorage.appDataSize + ' bytes\n';
    text += 'budgetAppLog: ' + storage.localStorage.logSize + ' bytes\n';
    text += 'Pending delete: ' + (pending ? pending.id : 'none') + '\n';
    
    text += '\n--- Categories ---\n';
    const cats = DataStore.getCategories();
    text += 'Total categories: ' + cats.length + '\n';
    
    text += '\n--- Operation Log (last 50) ---\n';
    log.slice(-50).forEach(e => {
      text += '[' + (e.t.substring(11, 23)) + '] ' + e.op + ' | mem=' + e.memRecords + ' ls=' + e.lsRecords;
      if (e.discrepancy) text += ' ⚠️ MISMATCH';
      text += '\n';
      if (e.details) {
        text += '  args: ' + JSON.stringify(e.details.args || e.details) + '\n';
      }
    });
    
    text += '\n--- Full Record List (memory) ---\n';
    DataStore.getRecords().forEach(r => {
      const cat = DataStore.getCategory(r.categoryId);
      text += '  ' + r.id + ' | ' + (r.date || 'no-date') + ' | RM' + r.amount + ' | ' + (cat ? cat.name : 'unknown') + ' | ' + (r.note || '') + '\n';
    });
    
    text += '\n========== END REPORT ==========\n';
    return text;
  }
};

// Wrap all critical DataStore methods
const methodsToWrap = [
  'addRecord', 'updateRecord', 'deleteRecord', 'forceDeleteRecord', 
  'softDeleteRecord', '_finalizeDelete', 'undoDelete',
  'clearAll', 'importJSON', 'reload', 'save'
];
methodsToWrap.forEach(m => DIAG.wrapDataStoreMethod(m));

// === Also wrap StatsEngine to trace which records contribute ===
const originalGetRecordsInMonth = StatsEngine.getRecordsInMonth;
StatsEngine.getRecordsInMonth = function(month) {
  const records = originalGetRecordsInMonth.call(this, month);
  console.log('[DIAG] StatsEngine.getRecordsInMonth("' + month + '") → ' + records.length + ' records:',
    records.map(r => ({ id: r.id, amount: r.amount, catId: r.categoryId, date: r.date })));
  return records;
};

const originalGetMonthTotal = StatsEngine.getMonthTotal;
StatsEngine.getMonthTotal = function(month) {
  const total = originalGetMonthTotal.call(this, month);
  const records = this.getRecordsInMonth(month);
  console.log('[DIAG] StatsEngine.getMonthTotal("' + month + '") → RM' + total + ' from ' + records.length + ' records');
  return total;
};

const originalGetCategoryTotals = StatsEngine.getCategoryTotals;
StatsEngine.getCategoryTotals = function(month) {
  const result = originalGetCategoryTotals.call(this, month);
  console.log('[DIAG] StatsEngine.getCategoryTotals("' + month + '") → ' + Object.keys(result).length + ' categories');
  return result;
};

// Exports
window.DIAG = DIAG;
window.DataStore.getStorageInfo = DIAG.getStorageInfo.bind(DIAG);
window.DataStore.compareWithStorage = DIAG.compareWithStorage.bind(DIAG);
window.DataStore.getDiagnosticLog = function() { return DIAG.getLog(); };
window.DataStore.clearDiagnosticLog = function() { DIAG.clearLog(); };

// Show raw record data in a modal
window.showRecordRaw = function showRecordRaw(id) {
  const record = DataStore.getRecord(id);
  if (!record) {
    showToast('❌ 记录不存在: ' + id, 'error');
    return;
  }
  
  // Get the category info
  const cat = DataStore.getCategory(record.categoryId);
  
  // Test what getMonthKey returns for this record
  const monthKey = getMonthKey(record.date || record.createdAt);
  const datePrefix = (record.date || record.createdAt).slice(0, 10);
  
  // Check if this record appears in StatsEngine audit
  const inStatsEngine = StatsEngine.getRecordsInMonth(monthKey).some(r => r.id === id);
  
  // Check if this record appears in getFilteredRecords
  let inFilteredRecords = false;
  try {
    const filtered = window.getFilteredRecords ? getFilteredRecords() : [];
    inFilteredRecords = filtered.some(r => r.id === id);
  } catch(e) { /* ignore */ }
  
  // Build raw data display
  const recordJSON = JSON.stringify(record, null, 2);
  const catInfo = cat ? { id: cat.id, name: cat.name, icon: cat.icon, color: cat.color, parentId: cat.parentId } : null;
  
  const html = `
    <div class="modal-title">🔍 记录原始数据</div>
    <div style="max-height:70vh;overflow-y:auto;font-family:monospace;font-size:0.75rem;line-height:1.6">
      <div style="margin-bottom:12px;padding:8px;background:var(--bg);border-radius:8px;border:1px solid var(--border)">
        <div class="font-semibold" style="margin-bottom:6px">📋 记录状态</div>
        <div>在统计引擎审计中: ${inStatsEngine ? '✅ 是' : '❌ 否'}</div>
        <div>在流水页过滤结果中: ${inFilteredRecords ? '✅ 是' : '❌ 否'}</div>
        <div>getMonthKey(日期) = ${monthKey}</div>
        <div>日期前10字符: "${datePrefix}"</div>
        <div>分类: ${cat ? cat.icon + ' ' + cat.name + ' (id=' + cat.id + ', parentId=' + cat.parentId + ')' : '❌ 已删除 (id=' + record.categoryId + ')'}</div>
        ${cat && cat.parentId ? '<div style="color:var(--warning)">⚠️ 注意：该记录分类有父级，不是根分类</div>' : ''}
        ${record.excludeFromAvg ? '<div>📌 excludeFromAvg = true</div>' : ''}
      </div>
      <div style="font-weight:600;margin-bottom:4px">完整 JSON:</div>
      <pre style="background:var(--bg);padding:8px;border-radius:8px;border:1px solid var(--border);overflow-x:auto;white-space:pre-wrap;word-break:break-all">${escHtml(recordJSON)}</pre>
    </div>
    <div class="modal-actions" style="margin-top:12px">
      <button class="btn btn-primary" onclick="closeModal()">关闭</button>
      <button class="btn btn-outline" onclick="closeModal();openEditRecord('${id}')">✏️ 编辑</button>
      <button class="btn btn-danger" onclick="closeModal();deleteRecordConfirm('${id}')">🗑️ 删除</button>
    </div>
  `;
  showModal(html);
};

})();
