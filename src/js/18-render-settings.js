/* ============================================================
   RENDER: Settings Page
   ============================================================ */
(function() {
'use strict';
function renderSettings() {
  const el = document.getElementById('page-settings');
  const now = new Date();
  const month = getMonthKey(now.toISOString());
  const budgets = DataStore.getBudgets();
  const savings = DataStore.getSavingsTarget();

  el.innerHTML = `
    <!-- Theme Toggle -->
    <div class="card mb-16">
      <div class="card-title">${__('settings.display.title')}</div>
      <div class="flex items-center justify-between">
        <span class="text-sm">🌙 ${__('settings.display.darkMode')}</span>
        <button class="btn ${document.documentElement.getAttribute('data-theme') === 'dark' ? 'btn-primary' : 'btn-outline'}" onclick="toggleTheme()" id="themeToggleBtn">
          ${document.documentElement.getAttribute('data-theme') === 'dark' ? '☀️ ' + __('settings.display.lightMode') : '🌙 ' + __('settings.display.darkMode')}
        </button>
      </div>
    </div>

    <!-- Language Switcher -->
    <div class="card mb-16">
      <div class="card-title">语言 / Language</div>
      <select class="input-field" onchange="setLocale(this.value)" id="localeSelect">
        <option value="zh">简体中文</option>
        <option value="en">English</option>
      </select>
    </div>

    <!-- Stats Range -->
    <div class="card mb-16">
      <div class="card-title">📊 ${__('settings.stats.title')}</div>
      <div class="flex items-center justify-between" style="margin-bottom:8px">
        <span class="text-sm">${__('settings.stats.basedOn')}</span>
      </div>
      <div class="flex gap-8" style="margin-bottom:8px">
        <button class="btn btn-sm ${getStatsRange() === 'month' ? 'btn-primary' : 'btn-outline'}" 
          onclick="DataStore.setStatsRange('month');renderSettings();refreshCurrentPage()">
          📅 ${__('settings.stats.month')}
        </button>
        <button class="btn btn-sm ${getStatsRange() === 'rolling30' ? 'btn-primary' : 'btn-outline'}"
          onclick="DataStore.setStatsRange('rolling30');renderSettings();refreshCurrentPage()">
          📆 ${__('settings.stats.rolling30')}
        </button>
      </div>
      <div class="text-xs text-muted" id="statsRangeHint">
        ${getStatsRange() === 'month' 
          ? __('settings.stats.hintMonth')
          : __('settings.stats.hintRolling')}
      </div>
    </div>

    <!-- Budget → moved to Bills Center -->
    <div class="card mb-16 settings-nav-card" onclick="openBillsCenter()">
      <div class="flex items-center gap-8">
        <span class="settings-nav-icon">📋</span>
        <div>
          <div class="settings-nav-title">${__('settings.nav.billsCenter')}</div>
          <div class="settings-nav-subtitle">${__('settings.nav.subtitle')}</div>
        </div>
        <span class="settings-nav-arrow">${__('settings.nav.arrow')}</span>
      </div>
      <div class="settings-nav-hint">${__('settings.nav.hint')}</div>
    </div>

    <!-- Savings Target -->
    <div class="card mb-16">
      <div class="card-title">${__('settings.savings.title')}</div>
      <div class="input-group">
        <label class="input-label">${__('settings.savings.type')}</label>
        <div class="flex gap-8">
          <label class="btn btn-sm ${savings.type === 'fixed' ? 'btn-primary' : 'btn-outline'}" onclick="setSavingsType('fixed')">
            <input type="radio" name="savingsType" value="fixed" ${savings.type === 'fixed' ? 'checked' : ''} style="display:none"> ${__('settings.savings.fixed')}
          </label>
          <label class="btn btn-sm ${savings.type === 'percent' ? 'btn-primary' : 'btn-outline'}" onclick="setSavingsType('percent')">
            <input type="radio" name="savingsType" value="percent" ${savings.type === 'percent' ? 'checked' : ''} style="display:none"> ${__('settings.savings.percent')}
          </label>
        </div>
      </div>
      <div id="savingsFixedInput" class="input-group" style="display:${savings.type === 'fixed' ? 'block' : 'none'}">
        <label class="input-label">${__('settings.savings.fixedLabel')}</label>
        <input type="number" id="savingsFixedAmount" class="input-field" value="${savings.fixedAmount || ''}" placeholder="0">
      </div>
      <div id="savingsPercentInput" class="input-group" style="display:${savings.type === 'percent' ? 'block' : 'none'}">
        <label class="input-label">${__('settings.savings.percentLabel')}</label>
        <input type="number" id="savingsPercent" class="input-field" value="${savings.percent || ''}" placeholder="0" min="0" max="100">
      </div>
      <div class="input-group percent-base-group ${savings.type === 'percent' ? 'visible' : ''}" id="percentBaseGroup">
        <label class="input-label">${__('settings.savings.percentBase')}</label>
        <div class="flex gap-8">
          <label class="btn btn-sm ${(DataStore.getPercentBase()) === 'gross' ? 'btn-primary' : 'btn-outline'}" onclick="setPercentBase('gross')">${__('settings.savings.gross')}</label>
          <label class="btn btn-sm ${(DataStore.getPercentBase()) === 'net' ? 'btn-primary' : 'btn-outline'}" onclick="setPercentBase('net')">${__('settings.savings.net')}</label>
        </div>
      </div>
      <button class="btn btn-primary" onclick="saveSavingsTarget()">💾 ${__('settings.savings.save')}</button>
    </div>

    <!-- PIN Protection -->
    <div class="card mb-16">
      <div class="card-title">🔐 ${__('settings.security.title')}</div>
      <div id="pinStatusSection">
        ${(() => {
          const hasPin = !!localStorage.getItem('budgetAppPinHash');
          if (hasPin) {
            return `
              <div class="flex flex-col gap-8">
                <div class="flex items-center gap-8">
                  <span style="width:10px;height:10px;border-radius:50%;background:var(--success);display:inline-block"></span>
                  <span class="text-sm">${__('settings.security.enabled')}</span>
                </div>
                <div class="flex gap-8">
                  <button class="btn btn-outline btn-sm" onclick="showChangePinModal()">${__('settings.security.changePin')}</button>
                  <button class="btn btn-ghost btn-sm" style="color:var(--danger)" onclick="showClearPinModal()">${__('settings.security.disablePin')}</button>
                </div>
                <div style="margin-top:8px;padding-top:8px;border-top:1px solid var(--border)">
                  <label class="text-sm text-secondary" style="display:block;margin-bottom:6px">⏱ ${__('settings.security.autoLock')}</label>
                  <div class="flex gap-6" style="flex-wrap:wrap">
                    ${[
                      {labelKey:'settings.security.autoLock.1min', val:1},
                      {labelKey:'settings.security.autoLock.5min', val:5},
                      {labelKey:'settings.security.autoLock.15min', val:15},
                      {labelKey:'settings.security.autoLock.30min', val:30},
                      {labelKey:'settings.security.autoLock.never', val:0}
                    ].map(opt => `
                      <button class="btn btn-sm ${getAutoLockTimeout() === opt.val ? 'btn-primary' : 'btn-outline'}"
                        onclick="setAutoLockTimeout(${opt.val});renderSettings()">
                        ${__(opt.labelKey)}
                      </button>
                    `).join('')}
                  </div>
                </div>
              </div>
            `;
          } else {
            return `
              <div class="flex flex-col gap-8">
                <div class="flex items-center gap-8">
                  <span style="width:10px;height:10px;border-radius:50%;background:var(--text-muted);display:inline-block"></span>
                  <span class="text-sm">${__('settings.security.disabled')}</span>
                </div>
                <button class="btn btn-primary btn-sm" onclick="showSetPinModal()">🔐 ${__('settings.security.setPin')}</button>
              </div>
            `;
          }
        })()}
      </div>
    </div>

    <!-- Tag Management -->
    <div class="card mb-16">
      <div class="card-title">🏷️ ${__('settings.tags.title')}</div>
      <div id="tagList">
        ${(() => {
          const tags = DataStore.getAllTags();
          if (tags.length === 0) return '<div class="text-sm text-muted">' + __('settings.tags.empty') + '</div>';
          return tags.map(tag => {
            const stats = DataStore.getTagStats(tag);
            return `
              <div class="flex items-center justify-between" style="padding:6px 0;border-bottom:1px solid var(--border)">
                <span>${escHtml(tag)}</span>
                <div class="flex items-center gap-8">
                  <span class="text-xs text-muted">${__('settings.tags.recordCount', stats.count, formatMoney(stats.total))}</span>
                  <button class="btn btn-ghost btn-sm" style="color:var(--danger);font-size:0.65rem" onclick="deleteTag('${escHtml(tag)}')">${__('settings.tags.delete')}</button>
                </div>
              </div>
            `;
          }).join('');
        })()}
      </div>
      <div class="text-xs text-muted mt-8">
        <span>${__('settings.tags.hint')}</span>
      </div>
    </div>

    <!-- Data Management -->
    <div class="card mb-16">
      <div class="card-title">${__('settings.data.title')}</div>
      <div class="flex flex-col gap-8">
        <button class="btn btn-outline btn-block" onclick="exportJSON()">📥 ${__('settings.data.exportJSON')}</button>
        <button class="btn btn-outline btn-block" onclick="document.getElementById('importJSONInput').click()">📤 ${__('settings.data.importJSON')}</button>
        <input type="file" id="importJSONInput" accept=".json" style="display:none" onchange="importJSON(event)">
        <button class="btn btn-outline btn-block" onclick="exportToExcel()">📥 ${__('settings.data.exportExcel')}</button>
        <button class="btn btn-outline btn-block" onclick="exportCSV()">📊 ${__('settings.data.exportCSV')}</button>
        <button class="btn btn-primary btn-block" onclick="if(window.LANSync)LANSync.open();else showToast(__('settings.toast.lanSyncNotLoaded'),'error')">📶 ${__('settings.data.lanSync')}</button>
        <button class="btn btn-danger btn-block" onclick="clearAllData()">🗑️ ${__('settings.data.clearAll')}</button>
        <button class="btn btn-primary btn-block" onclick="repairData()">🔧 ${__('settings.data.repair')}</button>
      </div>
    </div>

    <!-- Data Sync Verification -->
    <div class="card mb-16" style="border-left:4px solid #818CF8">
      <div class="card-title" style="display:flex;align-items:center;gap:8px">
        <span>🔄 ${__('settings.sync.title')}</span>
        <button class="btn btn-sm btn-primary" onclick="refreshSyncFingerprint()" style="font-size:0.72rem">${__('settings.sync.refresh')}</button>
      </div>
      <div id="syncFingerprint">
        <div class="text-sm text-secondary" style="margin-bottom:8px">
          ${__('settings.sync.description')}
        </div>
        <div class="flex items-center gap-8" style="padding:6px 10px;background:var(--bg);border-radius:var(--radius-sm);margin-bottom:6px">
          <span class="text-xs text-muted" style="min-width:60px">${__('settings.sync.fingerprintLabel')}</span>
          <span id="syncFingerprintCode" style="font-family:monospace;font-size:1.3rem;font-weight:700;letter-spacing:2px;color:var(--primary)">------</span>
        </div>
        <div class="flex items-center gap-8" style="padding:6px 10px;background:var(--bg);border-radius:var(--radius-sm)">
          <span class="text-xs text-muted" style="min-width:60px">${__('settings.sync.lastChange')}</span>
          <span id="syncFingerprintTime" class="text-sm" style="font-weight:500">—</span>
        </div>
      </div>
      <div class="text-xs text-muted" style="margin-top:6px;line-height:1.4">
        ${__('settings.sync.hint')}
      </div>
    </div>
    <!-- Data Inspector (Diagnostics) -->
    ${renderDataInspector()}
    <div style="text-align:center;padding:12px 0 4px">
      <button class="btn btn-ghost btn-sm" onclick="refreshPageData()" style="font-size:0.8rem">🔄 ${__('settings.refreshPage')}</button>
    </div>
    <div style="text-align:center;padding:8px 0 8px;font-size:0.65rem;color:var(--text-muted);opacity:0.5">v2.8.0</div>
  `;
  // Set current locale in language switcher
  var sel = document.getElementById('localeSelect');
  if (sel) sel.value = getCurrentLocale();
  setTimeout(refreshSyncFingerprint, 100);
}

function setSavingsType(type) {
  const savings = DataStore.getSavingsTarget();
  savings.type = type;
  DataStore.setSavingsTarget(savings);
  renderSettings();
}

function saveBudget() {
  const month = document.getElementById('budgetMonth').value;
  const amount = parseFloat(document.getElementById('budgetAmount').value) || 0;
  DataStore.setBudget(month, amount);
  showToast(__('settings.toast.budgetSaved'));
}

function saveSavingsTarget() {
  const type = DataStore.getSavingsTarget().type;
  const fixedAmount = parseFloat(document.getElementById('savingsFixedAmount')?.value) || 0;
  const percent = parseFloat(document.getElementById('savingsPercent')?.value) || 0;
  DataStore.setSavingsTarget({ type, fixedAmount, percent });
  showToast(__('settings.toast.savingsSaved'));
}

function setPercentBase(base) {
  DataStore.setPercentBase(base);
  renderSettings();
  showToast(__('settings.toast.percentBaseChanged', base === 'gross' ? __('settings.savings.gross') : __('settings.savings.net')));
}

function exportJSON() {
  const data = DataStore.exportJSON();
  const blob = new Blob([data], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'budget-data-' + new Date().toISOString().slice(0, 10) + '.json';
  a.click();
  URL.revokeObjectURL(url);
  showToast(__('settings.toast.jsonExported'));
}

let importJSONContent = null;

function importJSON(event) {
  const file = event.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = function(e) {
    importJSONContent = e.target.result;
    showModal(`
      <div class="modal-title">${__('settings.import.title')}</div>
      <p class="text-sm text-secondary mb-16">${__('settings.import.description')}</p>
      <div class="flex flex-col gap-8">
        <button class="btn btn-primary btn-block" onclick="confirmImportJSON('replace')">🔄 ${__('settings.import.replace')}</button>
        <button class="btn btn-outline btn-block" onclick="confirmImportJSON('merge')">🔀 ${__('settings.import.merge')}</button>
      </div>
      <div class="modal-actions"><button class="btn btn-ghost" onclick="closeModal()">${__('settings.import.cancel')}</button></div>
    `);
  };
  reader.readAsText(file);
  event.target.value = '';
}

function confirmImportJSON(mode) {
  if (!importJSONContent) { showToast(__('settings.toast.noImportData'), 'error'); return; }
  const success = DataStore.importJSON(importJSONContent, mode);
  importJSONContent = null;
  closeModal();
  if (success) {
    showToast(__('settings.toast.importSuccess'));
    renderSettings();
  } else {
    showToast(__('settings.toast.importFailed'), 'error');
  }
}

function exportCSV() {
  const csv = DataStore.exportCSV();
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'budget-records-' + new Date().toISOString().slice(0, 10) + '.csv';
  a.click();
  URL.revokeObjectURL(url);
  showToast(__('settings.toast.csvExported'));
}

function clearAllData() {
  showModal(`
    <div class="modal-title">${__('settings.clearAll.title')}</div>
    <p style="color:var(--danger);margin-bottom:16px">${__('settings.clearAll.warning')}</p>
    <div class="modal-actions">
      <button class="btn btn-ghost" onclick="closeModal()">${__('settings.clearAll.cancel')}</button>
      <button class="btn btn-danger" onclick="confirmClearAll()">${__('settings.clearAll.confirm')}</button>
    </div>
  `);
}

function confirmClearAll() {
  DataStore.clearAll();
  closeModal();
  showToast(__('settings.toast.dataCleared'));
  navigateTo('overview');
}

function refreshSyncFingerprint() {
  const codeEl = document.getElementById('syncFingerprintCode');
  const timeEl = document.getElementById('syncFingerprintTime');
  if (codeEl) codeEl.textContent = DataStore.getDataHash();
  if (timeEl) {
    const t = DataStore.getLastUpdateTime();
    timeEl.textContent = t ? t.replace('T', ' ').substring(0, 19) : __('settings.noData');
  }
}

function renderLogPreview() {
  const log = DataStore.getDiagnosticLog();
  if (!log || log.length === 0) return '<span style="color:var(--text-muted)">' + __('settings.noRecords') + '</span>';
  return log.slice(-20).reverse().map(e => {
    const time = e.t.substring(11, 23);
    return `<div>${time} [${e.a}] ${e.d}  | ${__('settings.diag.logRecords')}${e.recordsCount} ${__('settings.diag.logPending')}${e.pendingId || '—'}</div>`;
  }).join('');
}

function exportDiagnosticLog() {
  const log = DataStore.getDiagnosticLog();
  if (!log || log.length === 0) {
    showToast(__('settings.toast.noLog'), 'warning');
    return;
  }
  let text = '=== Budget App Diagnostic Log ===\n';
  text += 'Exported: ' + new Date().toISOString() + '\n';
  text += 'Version: v2.8.0\n';
  text += 'Records: ' + DataStore.getRecords().length + '\n';
  text += 'Pending Delete: ' + (DataStore.getPendingDelete() ? DataStore.getPendingDelete().id : 'none') + '\n';
  text += 'LocalStorage: ' + (localStorage.getItem('budgetAppData') || '').length + ' bytes\n';
  text += 'Theme: ' + (document.documentElement.getAttribute('data-theme') || 'light') + '\n';
  text += 'User Agent: ' + navigator.userAgent + '\n';
  text += '\n--- Event Log ---\n';
  log.forEach(e => {
    text += `[${e.t}] ${e.a} | ${e.d} | records=${e.recordsCount} pending=${e.pendingId || '—'}\n`;
  });
  const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'budget-diagnostic-log-' + new Date().toISOString().substring(0, 10) + '.txt';
  a.click();
  URL.revokeObjectURL(url);
  showToast(__('settings.toast.logExported'), 'success');
}

function renderDataInspector() {
  const compare = typeof DataStore.compareWithStorage === 'function' ? DataStore.compareWithStorage() : null;
  const storage = typeof DataStore.getStorageInfo === 'function' ? DataStore.getStorageInfo() : null;
  const log = typeof DataStore.getDiagnosticLog === 'function' ? DataStore.getDiagnosticLog() : [];
  
  let html = '<div class="card mb-16">';
  html += '<div class="card-title" style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">';
  html += '<span>🔬 ' + __('settings.diag.title') + '</span>';
  html += '<button class="btn btn-sm btn-primary" onclick="renderDataInspector()" style="font-size:0.72rem">🔄 ' + __('settings.diag.refresh') + '</button>';
  html += '<button class="btn btn-sm btn-ghost" onclick="exportDiagnosticReport()" style="font-size:0.72rem">📥 ' + __('settings.diag.exportReport') + '</button>';
  html += '</div>';
  
  // Comparison table
  html += '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;margin-bottom:12px">';
  if (compare) {
    html += '<div style="padding:8px;border-radius:8px;background:' + (compare.match ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.1)') + ';border:1px solid ' + (compare.match ? 'var(--success)' : 'var(--danger)') + '">' +
      '<div class="text-xs text-secondary">' + __('settings.diag.consistency') + '</div>' +
      '<div class="font-bold" style="color:' + (compare.match ? 'var(--success)' : 'var(--danger)') + '">' + (compare.match ? __('settings.diag.consistent') : __('settings.diag.inconsistent')) + '</div>' +
      '<div class="text-xs text-muted">' + __('settings.diag.memory', compare.memRecords, compare.lsRecords) + '</div>' +
      (compare.inLSNotMem.length > 0 ? '<div class="text-xs" style="color:var(--danger)">' + __('settings.diag.lsExtra', compare.inLSNotMem.length) + '</div>' : '') +
    '</div>';
  }
  if (storage) {
    html += '<div style="padding:8px;border-radius:8px;background:var(--bg);border:1px solid var(--border)">' +
      '<div class="text-xs text-secondary">' + __('settings.diag.storageUsage') + '</div>' +
      '<div class="font-bold">' + (storage.localStorage.totalSize / 1024).toFixed(1) + ' KB</div>' +
      '<div class="text-xs text-muted">' + __('settings.diag.pendingDelete', storage.pendingDelete ? storage.pendingDelete.substring(0, 8) + '...' : __('settings.diag.none')) + '</div>' +
    '</div>';
    html += '<div style="padding:8px;border-radius:8px;background:var(--bg);border:1px solid var(--border)">' +
      '<div class="text-xs text-secondary">localStorage</div>' +
      '<div class="font-bold text-sm">appData: ' + (storage.localStorage.appDataSize / 1024).toFixed(1) + ' KB</div>' +
      '<div class="text-xs text-muted">log: ' + (storage.localStorage.logSize / 1024).toFixed(1) + ' KB</div>' +
    '</div>';
  }
  html += '</div>';
  
  // Stats engine audit with month selector
  html += '<details style="margin-bottom:8px">';
  html += '<summary style="cursor:pointer;font-weight:600;font-size:0.85rem;padding:4px 0">📊 ' + __('settings.diag.statsEngine') + '</summary>';
  html += '<div style="padding:8px;background:var(--bg);border-radius:8px;margin-top:4px">';
  html += '<p class="text-xs text-muted mb-8">' + __('settings.diag.statsEngineDesc') + '</p>';
  
  const currentAuditMonth = getMonthKey(new Date().toISOString());
  html += '<div style="display:flex;align-items:center;gap:8px;margin-bottom:8px">' +
    '<label class="text-xs text-secondary">' + __('settings.diag.month') + '</label>' +
    '<input type="month" id="auditMonth" class="input-field" style="width:160px" value="' + currentAuditMonth + '" onchange="refreshStatsAudit()">' +
    '<button class="btn btn-sm btn-ghost" onclick="refreshStatsAudit()" style="font-size:0.72rem">🔄</button>' +
  '</div>';
  
  html += '<div id="statsAuditContainer">';
  if (typeof StatsEngine !== 'undefined') {
    const auditRecords = StatsEngine.getRecordsInMonth(currentAuditMonth);
    const auditTotal = auditRecords.reduce((s, r) => s + r.amount, 0);
    if (auditRecords.length > 0) {
      html += '<div class="text-xs text-secondary mb-4">' + __('settings.diag.monthStats', currentAuditMonth, auditRecords.length, formatMoney(auditTotal)) + '</div>';
      html += '<div style="max-height:200px;overflow-y:auto;font-size:0.7rem;font-family:monospace">';
      auditRecords.forEach(r => {
        const cat = DataStore.getCategory(r.categoryId);
        html += '<div style="padding:2px 4px;border-bottom:1px solid var(--border);display:flex;gap:4px">' +
          '<span style="color:var(--text-muted);min-width:80px" title="' + r.id + '">' + r.id.substring(0, 8) + '</span>' +
          '<span style="min-width:60px">RM' + r.amount.toFixed(2) + '</span>' +
          '<span style="min-width:60px">' + (cat ? cat.icon + cat.name : '?') + '</span>' +
          '<span style="color:var(--text-muted);flex:1;overflow:hidden;text-overflow:ellipsis">' + (r.note || '') + '</span>' +
          '<span style="color:var(--text-muted);min-width:80px">' + (r.date || '') + '</span>' +
        '</div>';
      });
      html += '</div>';
    } else {
      html += '<div class="text-sm text-muted">' + __('settings.diag.noRecordsForMonth') + '</div>';
    }
  }
  html += '</div>'; // end statsAuditContainer
  
  html += '</div></details>';
  
  // Full unfiltered records dump
  html += '<details style="margin-bottom:8px">';
  html += '<summary style="cursor:pointer;font-weight:600;font-size:0.85rem;padding:4px 0">📋 ' + __('settings.diag.allRecords') + '</summary>';
  html += '<div style="padding:8px;background:var(--bg);border-radius:8px;margin-top:4px">';
  html += '<p class="text-xs text-muted mb-8">' + __('settings.diag.allRecordsDesc') + '</p>';
  
  const allRecords = DataStore.getRecords();
  html += '<div class="text-xs font-semibold mb-4">' + __('settings.diag.totalRecords', allRecords.length) + '</div>';
  
  if (allRecords.length > 0) {
    html += '<div style="max-height:400px;overflow-y:auto;font-size:0.65rem;font-family:monospace;border:1px solid var(--border);border-radius:8px">';
    html += '<div style="display:flex;padding:4px 6px;font-weight:600;border-bottom:2px solid var(--border);position:sticky;top:0;background:var(--bg)">';
    html += '<span style="width:70px">' + __('settings.diag.colId') + '</span>';
    html += '<span style="width:45px">' + __('settings.diag.colAmount') + '</span>';
    html += '<span style="width:55px">' + __('settings.diag.colCategory') + '</span>';
    html += '<span style="width:80px">' + __('settings.diag.colDate') + '</span>';
    html += '<span style="width:70px">' + __('settings.diag.colCreatedAt') + '</span>';
    html += '<span style="width:15px">📌</span>';
    html += '<span style="flex:1">' + __('settings.diag.colNote') + '</span>';
    html += '</div>';
    
    allRecords.forEach(r => {
      const cat = DataStore.getCategory(r.categoryId);
      const monthKey2 = getMonthKey(r.date || r.createdAt);
      // Check if this record is in the current audit month's result
      const auditMonthEl = document.getElementById('auditMonth');
      const auditMonthVal = auditMonthEl ? auditMonthEl.value : '';
      const inAudit = auditMonthVal ? StatsEngine.getRecordsInMonth(auditMonthVal).some(ra => ra.id === r.id) : true;
      
      html += '<div style="display:flex;padding:3px 6px;border-bottom:1px solid var(--border);align-items:center' + (!inAudit ? ';background:rgba(239,68,68,0.05)' : '') + '">';
      html += '<span style="width:70px;overflow:hidden;text-overflow:ellipsis;color:var(--text-muted)" title="' + r.id + '">' + r.id.substring(0, 6) + '</span>';
      html += '<span style="width:45px;font-weight:500">' + formatMoney(r.amount) + '</span>';
      html += '<span style="width:55px;overflow:hidden;text-overflow:ellipsis" title="catId=' + r.categoryId + '">' + (cat ? cat.icon + cat.name.substring(0,3) : '❓' + r.categoryId.substring(0,4)) + '</span>';
      html += '<span style="width:80px;color:var(--text-muted)">' + (r.date ? r.date.substring(0, 10) : '-') + '</span>';
      html += '<span style="width:70px;color:var(--text-muted)">' + (r.createdAt ? r.createdAt.substring(0, 10) : '-') + '</span>';
      html += '<span style="width:15px;color:var(--text-muted)">' + (r.excludeFromAvg ? '📌' : '') + '</span>';
      html += '<span style="flex:1;overflow:hidden;text-overflow:ellipsis;color:var(--text-muted)">' + (r.note || '') + '</span>';
      html += '<button class="btn btn-ghost" style="padding:1px 4px;font-size:0.6rem;flex-shrink:0;opacity:0.5" onclick="showRecordRaw(\'' + r.id + '\')" title="' + __('settings.diag.viewRaw') + '">🔍</button>';
      html += '</div>';
    });
    
    html += '</div>';
  } else {
    html += '<div class="text-sm text-muted">' + __('settings.diag.noRecords') + '</div>';
  }
  
  html += '</div></details>';
  
  // Operation log
  const logCount = Math.min(log.length, 50);
  html += '<details>';
  html += '<summary style="cursor:pointer;font-weight:600;font-size:0.85rem;padding:4px 0">📝 ' + __('settings.diag.operationLog', logCount) + '</summary>';
  html += '<div style="max-height:250px;overflow-y:auto;font-size:0.6rem;font-family:monospace;background:var(--bg);padding:8px;border-radius:8px;margin-top:4px;border:1px solid var(--border);line-height:1.6">';
  if (log.length === 0) {
    html += '<span style="color:var(--text-muted)">' + __('settings.diag.noLogRecords') + '</span>';
  } else {
    log.slice(-50).reverse().forEach(e => {
      const time = e.t.substring(11, 23);
      const warn = e.discrepancy ? '⚠️' : '';
      html += '<div>' + warn + time + ' [' + e.op + '] mem=' + e.memRecords + ' ls=' + e.lsRecords + '</div>';
    });
  }
  html += '</div></details>';
  
  html += '</div>';
  
  return html;
}

function exportDiagnosticReport() {
  if (typeof DIAG === 'undefined' || typeof DIAG.exportDiagnosticReport !== 'function') {
    showToast(__('settings.toast.diagNotLoaded'), 'error');
    return;
  }
  const report = DIAG.exportDiagnosticReport();
  const blob = new Blob([report], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'budget-diagnostic-report-' + new Date().toISOString().substring(0, 10) + '.txt';
  a.click();
  URL.revokeObjectURL(url);
  showToast(__('settings.toast.reportExported'));
}

function repairData() {
  // Check if DataStore._data and localStorage are in sync
  let fixed = 0;
  try {
    const raw = localStorage.getItem('budgetAppData');
    if (!raw) {
      showToast(__('settings.toast.noRepairNeeded'), 'success');
      return;
    }
    const lsData = JSON.parse(raw);
    const memRecords = DataStore.getRecords().length;
    const lsRecords = (lsData.records || []).length;
    
    // Check 1: if localStorage has records that memory doesn't (stale in-memory)
    // We reload from localStorage which is the source of truth
    const success = DataStore.reload();
    
    // Split-feature data repair: sign, excludeFromAvg, orphan linking, share sums
    const SPLIT_ID = (typeof SplitEngine !== 'undefined' && SplitEngine.SPLIT_ID) ? SplitEngine.SPLIT_ID : '__split__';
    const splitBills = DataStore._data.splitBills || [];
    DataStore._data.records = (DataStore._data.records || []).map(r => {
      if (typeof r.amount === 'number' && r.amount < 0) { r.amount = Math.abs(r.amount); fixed++; }
      if (r.categoryId === SPLIT_ID) {
        if (r.excludeFromAvg !== false) { r.excludeFromAvg = false; fixed++; }
        if (!r.splitBillId) {
          const m = splitBills.filter(b => Math.abs((parseFloat(b.amount) || 0) - (parseFloat(r.amount) || 0)) < 0.01 && String(b.date || '').slice(0, 10) === String(r.date || '').slice(0, 10));
          if (m.length === 1) { r.splitBillId = m[0].id; fixed++; }
        }
      }
      return r;
    });
    splitBills.forEach(b => {
      const amt = parseFloat(b.amount) || 0;
      const selfShare = parseFloat(b.selfShare) || 0;
      const partsSum = (b.participants || []).reduce((s, p) => s + (parseFloat(p.share) || 0), 0);
      if (amt > 0 && partsSum + selfShare > 0 && Math.abs((partsSum + selfShare) - amt) > 0.01) {
        if (partsSum > 0 && (amt - selfShare) > 0) {
          const scale = (amt - selfShare) / partsSum;
          b.participants = (b.participants || []).map(p => Object.assign({}, p, { share: Math.round((parseFloat(p.share) || 0) * scale * 100) / 100 }));
          fixed++;
        }
      }
    });
    if (fixed > 0) DataStore.save();
    
    if (success) {
      // Also clear any pending delete state which might be stale
      const pending = DataStore.getPendingDelete();
      if (pending) {
        DataStore._finalizeDelete(pending.id);
      }
      showToast(__('settings.toast.repairSuccess', lsRecords, fixed), 'success');
    }
    
    // Check 2: verify pending delete is not stuck
    const pendingCheck = DataStore.getPendingDelete();
    if (pendingCheck) {
      DataStore._finalizeDelete(pendingCheck.id);
    }
    
    // Re-render all pages
    if (typeof renderOverview === 'function') renderOverview();
    if (typeof renderAddPage === 'function') renderAddPage();
    if (typeof renderRecords === 'function') renderRecords();
    if (typeof renderCategories === 'function') renderCategories();
    if (typeof renderStats === 'function') renderStats();
    if (typeof renderReport === 'function') renderReport();
    if (typeof renderSettings === 'function') renderSettings();
    if (typeof renderWhatIf === 'function') renderWhatIf();
  } catch(e) {
    showToast(__('settings.toast.repairFailed', e.message), 'error');
  }
}

function refreshStatsAudit() {
  const container = document.getElementById('statsAuditContainer');
  if (!container) return;
  const monthInput = document.getElementById('auditMonth');
  if (!monthInput) return;
  const month = monthInput.value;
  if (!month) return;
  
  if (typeof StatsEngine === 'undefined') {
    container.innerHTML = '<div class="text-sm text-muted">' + __('settings.diag.statsEngineNotLoaded') + '</div>';
    return;
  }
  
  const records = StatsEngine.getRecordsInMonth(month);
  const total = records.reduce((s, r) => s + r.amount, 0);
  
  if (records.length > 0) {
    let auditHtml = '<div class="text-xs text-secondary mb-4">' + __('settings.diag.monthStats', month, records.length, formatMoney(total)) + '</div>';
    auditHtml += '<div style="max-height:200px;overflow-y:auto;font-size:0.7rem;font-family:monospace">';
    records.forEach(r => {
      const cat = DataStore.getCategory(r.categoryId);
      auditHtml += '<div style="padding:2px 4px;border-bottom:1px solid var(--border);display:flex;gap:4px">' +
        '<span style="color:var(--text-muted);min-width:80px" title="' + r.id + '">' + r.id.substring(0, 8) + '</span>' +
        '<span style="min-width:60px">RM' + r.amount.toFixed(2) + '</span>' +
        '<span style="min-width:60px">' + (cat ? cat.icon + cat.name : '?') + '</span>' +
        '<span style="color:var(--text-muted);flex:1;overflow:hidden;text-overflow:ellipsis">' + (r.note || '') + '</span>' +
        '<span style="color:var(--text-muted);min-width:80px">' + (r.date || '') + '</span>' +
      '</div>';
    });
    auditHtml += '</div>';
    container.innerHTML = auditHtml;
  } else {
    container.innerHTML = '<div class="text-sm text-muted">' + __('settings.diag.noRecordsForMonth') + '</div>';
  }
}

function deleteTag(tag) {
  if (!confirm(__('settings.deleteTag.confirm', tag))) return;
  // Remove from all records
  DataStore._data.records.forEach(r => {
    if (r.tags) {
      r.tags = r.tags.filter(t => t !== tag);
    }
  });
  DataStore.cleanUnusedTags();
  DataStore.save();
  renderSettings();
  showToast(__('settings.toast.tagDeleted', tag));
}

  // === I18N ENTRIES ===
  window.addI18nEntries({
    // Display settings
    'settings.display.title': { zh: '显示设置', en: 'Display Settings' },
    'settings.display.darkMode': { zh: '深色模式', en: 'Dark Mode' },
    'settings.display.lightMode': { zh: '浅色模式', en: 'Light Mode' },

    // Stats range
    'settings.stats.title': { zh: '📊 统计范围', en: '📊 Stats Range' },
    'settings.stats.basedOn': { zh: '数据统计基于', en: 'Stats based on' },
    'settings.stats.month': { zh: '📅 本月', en: '📅 This Month' },
    'settings.stats.rolling30': { zh: '📆 近30天', en: '📆 Last 30 Days' },
    'settings.stats.hintMonth': { zh: '当前：按自然月统计（1日至月末）', en: 'Current: Calendar month (1st to end)' },
    'settings.stats.hintRolling': { zh: '当前：按近30天滚动窗口统计', en: 'Current: Rolling 30-day window' },

    // Nav / Bills center
    'settings.nav.billsCenter': { zh: '月账单中心', en: 'Monthly Bills Center' },
    'settings.nav.subtitle': { zh: '管理月收入、账单分类及金额', en: 'Manage income, bill categories & amounts' },
    'settings.nav.arrow': { zh: '前往 →', en: 'Go →' },
    'settings.nav.hint': { zh: '💡 月收入与账单管理已移至概览页「月账单中心」', en: '💡 Income & bill management moved to Bills Center in overview' },

    // Savings target
    'settings.savings.title': { zh: '储蓄目标', en: 'Savings Target' },
    'settings.savings.type': { zh: '类型', en: 'Type' },
    'settings.savings.fixed': { zh: '固定金额', en: 'Fixed Amount' },
    'settings.savings.percent': { zh: '百分比', en: 'Percentage' },
    'settings.savings.fixedLabel': { zh: '固定金额 (RM)', en: 'Fixed Amount (RM)' },
    'settings.savings.percentLabel': { zh: '预算百分比 (%)', en: 'Budget Percentage (%)' },
    'settings.savings.percentBase': { zh: '百分比基准', en: 'Percentage Base' },
    'settings.savings.gross': { zh: '纯收入', en: 'Gross Income' },
    'settings.savings.net': { zh: '净收入(除去账单)', en: 'Net Income (after bills)' },
    'settings.savings.save': { zh: '💾 保存目标', en: '💾 Save Target' },

    // Security
    'settings.security.title': { zh: '🔐 安全设置', en: '🔐 Security Settings' },
    'settings.security.enabled': { zh: 'PIN锁已启用，数据已加密', en: 'PIN lock enabled, data encrypted' },
    'settings.security.disabled': { zh: 'PIN锁未启用，数据明文存储', en: 'PIN lock disabled, data stored in plain text' },
    'settings.security.changePin': { zh: '修改PIN码', en: 'Change PIN' },
    'settings.security.disablePin': { zh: '关闭PIN锁', en: 'Disable PIN Lock' },
    'settings.security.setPin': { zh: '🔐 设置PIN锁', en: '🔐 Set PIN Lock' },
    'settings.security.autoLock': { zh: '⏱ 自动锁定', en: '⏱ Auto Lock' },
    'settings.security.autoLock.1min': { zh: '1分钟', en: '1 min' },
    'settings.security.autoLock.5min': { zh: '5分钟', en: '5 min' },
    'settings.security.autoLock.15min': { zh: '15分钟', en: '15 min' },
    'settings.security.autoLock.30min': { zh: '30分钟', en: '30 min' },
    'settings.security.autoLock.never': { zh: '从不', en: 'Never' },

    // Tags
    'settings.tags.title': { zh: '🏷️ 标签管理', en: '🏷️ Tag Management' },
    'settings.tags.empty': { zh: '暂无标签', en: 'No tags yet' },
    'settings.tags.recordCount': { zh: '{0}笔 · {1}', en: '{0} records · {1}' },
    'settings.tags.delete': { zh: '删除', en: 'Delete' },
    'settings.tags.hint': { zh: '💡 标签在添加记录时创建，此处可查看和清理无用标签', en: '💡 Tags are created when adding records. Review and clean up unused tags here.' },

    // Data management
    'settings.data.title': { zh: '数据管理', en: 'Data Management' },
    'settings.data.exportJSON': { zh: '导出 JSON', en: 'Export JSON' },
    'settings.data.importJSON': { zh: '导入 JSON', en: 'Import JSON' },
    'settings.data.exportExcel': { zh: '导出 Excel (可修改·含公式)', en: 'Export Excel (editable · with formulas)' },
    'settings.data.exportCSV': { zh: '导出 CSV', en: 'Export CSV' },
    'settings.data.lanSync': { zh: '局域网同步', en: 'LAN Sync' },
    'settings.data.clearAll': { zh: '🗑️ 清除所有数据', en: '🗑️ Clear All Data' },
    'settings.data.repair': { zh: '🔧 数据修复 (重新加载+清理)', en: '🔧 Repair Data (reload + cleanup)' },

    // Sync verification
    'settings.sync.title': { zh: '🔄 数据同步校验', en: '🔄 Data Sync Verification' },
    'settings.sync.refresh': { zh: '刷新', en: 'Refresh' },
    'settings.sync.description': { zh: '对比两台设备的数据指纹，确认同步是否成功。', en: 'Compare data fingerprints between two devices to verify sync.' },
    'settings.sync.fingerprintLabel': { zh: '指纹码', en: 'Fingerprint' },
    'settings.sync.lastChange': { zh: '最新变更', en: 'Last Change' },
    'settings.sync.hint': { zh: '💡 两台设备数据完全一致时指纹码相同。导入/导出/同步后请点击「刷新」重新计算。', en: '💡 Identical fingerprints confirm data is in sync. Click Refresh after import/export/sync.' },

    // Refresh button
    'settings.refreshPage': { zh: '🔄 刷新页面数据', en: '🔄 Refresh Page Data' },

    // Toasts
    'settings.toast.budgetSaved': { zh: '✅ 预算已保存', en: '✅ Budget saved' },
    'settings.toast.savingsSaved': { zh: '✅ 储蓄目标已保存', en: '✅ Savings target saved' },
    'settings.toast.percentBaseChanged': { zh: '✅ 百分比基准已切换为{0}', en: '✅ Percentage base switched to {0}' },
    'settings.toast.jsonExported': { zh: '✅ JSON 已导出', en: '✅ JSON exported' },
    'settings.toast.noImportData': { zh: '没有可导入的数据', en: 'No data to import' },
    'settings.toast.importSuccess': { zh: '✅ 数据导入成功', en: '✅ Data imported successfully' },
    'settings.toast.importFailed': { zh: '❌ 导入失败，文件格式无效', en: '❌ Import failed, invalid file format' },
    'settings.toast.csvExported': { zh: '✅ CSV 已导出', en: '✅ CSV exported' },
    'settings.toast.dataCleared': { zh: '✅ 所有数据已清除', en: '✅ All data cleared' },
    'settings.toast.lanSyncNotLoaded': { zh: 'lan-sync.js 未加载', en: 'lan-sync.js not loaded' },
    'settings.toast.noLog': { zh: '⚠️ 暂无日志可导出', en: '⚠️ No log to export' },
    'settings.toast.logExported': { zh: '✅ 日志已导出', en: '✅ Log exported' },
    'settings.toast.diagNotLoaded': { zh: '⚠️ 诊断系统未加载', en: '⚠️ Diagnostic system not loaded' },
    'settings.toast.reportExported': { zh: '✅ 诊断报告已导出', en: '✅ Diagnostic report exported' },
    'settings.toast.noRepairNeeded': { zh: '✅ 没有需要修复的数据', en: '✅ No data needs repair' },
    'settings.toast.repairSuccess': { zh: '✅ 数据已从 localStorage 重新加载 ({0} 条记录)，修复 {1} 项问题', en: '✅ Data reloaded from localStorage ({0} records), {1} issues fixed' },
    'settings.toast.repairFailed': { zh: '❌ 修复失败: {0}', en: '❌ Repair failed: {0}' },
    'settings.toast.tagDeleted': { zh: '已删除标签: {0}', en: 'Deleted tag: {0}' },

    // Import modal
    'settings.import.title': { zh: '导入数据', en: 'Import Data' },
    'settings.import.description': { zh: '选择导入方式：', en: 'Choose import method:' },
    'settings.import.replace': { zh: '🔄 替换当前数据', en: '🔄 Replace current data' },
    'settings.import.merge': { zh: '🔀 合并到当前数据', en: '🔀 Merge into current data' },
    'settings.import.cancel': { zh: '取消', en: 'Cancel' },

    // Clear all modal
    'settings.clearAll.title': { zh: '⚠️ 清除所有数据', en: '⚠️ Clear All Data' },
    'settings.clearAll.warning': { zh: '此操作不可恢复！所有记录、分类、预算设置将被删除。', en: 'This action cannot be undone! All records, categories, and budget settings will be deleted.' },
    'settings.clearAll.cancel': { zh: '取消', en: 'Cancel' },
    'settings.clearAll.confirm': { zh: '确认清除', en: 'Confirm Clear' },

    // Delete tag confirm
    'settings.deleteTag.confirm': { zh: '确认删除标签"{0}"？此操作不会删除记录，只会移除标签引用。', en: 'Delete tag "{0}"? This will not delete records, only remove tag references.' },

    // Misc text
    'settings.noData': { zh: '无数据', en: 'No data' },
    'settings.noRecords': { zh: '（无记录）', en: '(No records)' },

    // Data inspector / diagnostics
    'settings.diag.title': { zh: '🔬 数据诊断', en: '🔬 Data Diagnosis' },
    'settings.diag.refresh': { zh: '🔄 刷新', en: '🔄 Refresh' },
    'settings.diag.exportReport': { zh: '📥 导出报告', en: '📥 Export Report' },
    'settings.diag.consistency': { zh: '数据一致性', en: 'Data Consistency' },
    'settings.diag.consistent': { zh: '✅ 一致', en: '✅ Consistent' },
    'settings.diag.inconsistent': { zh: '⚠️ 不一致', en: '⚠️ Inconsistent' },
    'settings.diag.memory': { zh: '内存: {0} 条 | LS: {1} 条', en: 'Memory: {0} | LS: {1}' },
    'settings.diag.lsExtra': { zh: 'LS有多余: {0} 条', en: 'LS has extra: {0}' },
    'settings.diag.storageUsage': { zh: '存储用量', en: 'Storage Usage' },
    'settings.diag.pendingDelete': { zh: '待删除: {0}', en: 'Pending delete: {0}' },
    'settings.diag.none': { zh: '无', en: 'None' },
    'settings.diag.statsEngine': { zh: '📊 统计引擎审计 (点击展开)', en: '📊 Stats Engine Audit (click to expand)' },
    'settings.diag.statsEngineDesc': { zh: '查看任意月份统计引擎实际使用的记录列表', en: 'View records used by the stats engine for any month' },
    'settings.diag.statsEngineNotLoaded': { zh: 'StatsEngine 未加载', en: 'StatsEngine not loaded' },
    'settings.diag.month': { zh: '月份', en: 'Month' },
    'settings.diag.monthStats': { zh: '{0} 月: {1} 条记录, 合计 {2}', en: '{0}: {1} records, total {2}' },
    'settings.diag.noRecordsForMonth': { zh: '该月暂无记录', en: 'No records for this period' },
    'settings.diag.allRecords': { zh: '📋 全量记录原始数据 (无过滤) (点击展开)', en: '📋 All Records Raw Data (unfiltered) (click to expand)' },
    'settings.diag.allRecordsDesc': { zh: '直接从 DataStore.getRecords() 读取，无任何过滤。用于排查流水页看不到的记录。', en: 'Read directly from DataStore.getRecords(), unfiltered. Use to debug missing records in the ledger.' },
    'settings.diag.totalRecords': { zh: '总计 {0} 条记录', en: 'Total {0} records' },
    'settings.diag.colId': { zh: 'ID', en: 'ID' },
    'settings.diag.colAmount': { zh: '金额', en: 'Amount' },
    'settings.diag.colCategory': { zh: '分类', en: 'Category' },
    'settings.diag.colDate': { zh: '日期', en: 'Date' },
    'settings.diag.colCreatedAt': { zh: '创建时间', en: 'Created At' },
    'settings.diag.colNote': { zh: '备注', en: 'Note' },
    'settings.diag.viewRaw': { zh: '查看原始数据', en: 'View raw data' },
    'settings.diag.noRecords': { zh: '暂无记录', en: 'No records' },
    'settings.diag.operationLog': { zh: '📝 操作日志 (最近 {0} 条)', en: '📝 Operation Log (last {0})' },
    'settings.diag.noLogRecords': { zh: '（无记录）', en: '(No records)' },
    'settings.diag.logRecords': { zh: '记录:', en: 'records:' },
    'settings.diag.logPending': { zh: '待删:', en: 'pending:' }
  });

  // === EXPORTS ===
  window.renderSettings = renderSettings;
  window.renderDataInspector = renderDataInspector;
  window.exportDiagnosticReport = exportDiagnosticReport;
  window.exportDiagnosticLog = exportDiagnosticLog;
  window.setSavingsType = setSavingsType;
  window.saveBudget = saveBudget;
  window.saveSavingsTarget = saveSavingsTarget;
  window.setPercentBase = setPercentBase;
  window.exportJSON = exportJSON;
  window.importJSON = importJSON;
  window.confirmImportJSON = confirmImportJSON;
  window.exportCSV = exportCSV;
  window.clearAllData = clearAllData;
  window.confirmClearAll = confirmClearAll;
  window.refreshSyncFingerprint = refreshSyncFingerprint;
  window.repairData = repairData;
  window.refreshStatsAudit = refreshStatsAudit;
  window.deleteTag = deleteTag;
})();
