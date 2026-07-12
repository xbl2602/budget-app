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
      <div class="card-title">显示设置</div>
      <div class="flex items-center justify-between">
        <span class="text-sm">🌙 深色模式</span>
        <button class="btn ${document.documentElement.getAttribute('data-theme') === 'dark' ? 'btn-primary' : 'btn-outline'}" onclick="toggleTheme()" id="themeToggleBtn">
          ${document.documentElement.getAttribute('data-theme') === 'dark' ? '☀️ 浅色模式' : '🌙 深色模式'}
        </button>
      </div>
    </div>

    <!-- Stats Range -->
    <div class="card mb-16">
      <div class="card-title">📊 统计范围</div>
      <div class="flex items-center justify-between" style="margin-bottom:8px">
        <span class="text-sm">数据统计基于</span>
      </div>
      <div class="flex gap-8" style="margin-bottom:8px">
        <button class="btn btn-sm ${getStatsRange() === 'month' ? 'btn-primary' : 'btn-outline'}" 
          onclick="DataStore.setStatsRange('month');renderSettings();refreshCurrentPage()">
          📅 本月
        </button>
        <button class="btn btn-sm ${getStatsRange() === 'rolling30' ? 'btn-primary' : 'btn-outline'}"
          onclick="DataStore.setStatsRange('rolling30');renderSettings();refreshCurrentPage()">
          📆 近30天
        </button>
      </div>
      <div class="text-xs text-muted" id="statsRangeHint">
        ${getStatsRange() === 'month' 
          ? '当前：按自然月统计（1日至月末）'
          : '当前：按近30天滚动窗口统计'}
      </div>
    </div>

    <!-- Budget → moved to Bills Center -->
    <div class="card mb-16 settings-nav-card" onclick="openBillsCenter()">
      <div class="flex items-center gap-8">
        <span class="settings-nav-icon">📋</span>
        <div>
          <div class="settings-nav-title">月账单中心</div>
          <div class="settings-nav-subtitle">管理月收入、账单分类及金额</div>
        </div>
        <span class="settings-nav-arrow">前往 →</span>
      </div>
      <div class="settings-nav-hint">💡 月收入与账单管理已移至概览页「月账单中心」</div>
    </div>

    <!-- Savings Target -->
    <div class="card mb-16">
      <div class="card-title">储蓄目标</div>
      <div class="input-group">
        <label class="input-label">类型</label>
        <div class="flex gap-8">
          <label class="btn btn-sm ${savings.type === 'fixed' ? 'btn-primary' : 'btn-outline'}" onclick="setSavingsType('fixed')">
            <input type="radio" name="savingsType" value="fixed" ${savings.type === 'fixed' ? 'checked' : ''} style="display:none"> 固定金额
          </label>
          <label class="btn btn-sm ${savings.type === 'percent' ? 'btn-primary' : 'btn-outline'}" onclick="setSavingsType('percent')">
            <input type="radio" name="savingsType" value="percent" ${savings.type === 'percent' ? 'checked' : ''} style="display:none"> 百分比
          </label>
        </div>
      </div>
      <div id="savingsFixedInput" class="input-group" style="display:${savings.type === 'fixed' ? 'block' : 'none'}">
        <label class="input-label">固定金额 (RM)</label>
        <input type="number" id="savingsFixedAmount" class="input-field" value="${savings.fixedAmount || ''}" placeholder="0">
      </div>
      <div id="savingsPercentInput" class="input-group" style="display:${savings.type === 'percent' ? 'block' : 'none'}">
        <label class="input-label">预算百分比 (%)</label>
        <input type="number" id="savingsPercent" class="input-field" value="${savings.percent || ''}" placeholder="0" min="0" max="100">
      </div>
      <div class="input-group percent-base-group ${savings.type === 'percent' ? 'visible' : ''}" id="percentBaseGroup">
        <label class="input-label">百分比基准</label>
        <div class="flex gap-8">
          <label class="btn btn-sm ${(DataStore.getPercentBase()) === 'gross' ? 'btn-primary' : 'btn-outline'}" onclick="setPercentBase('gross')">纯收入</label>
          <label class="btn btn-sm ${(DataStore.getPercentBase()) === 'net' ? 'btn-primary' : 'btn-outline'}" onclick="setPercentBase('net')">净收入(除去账单)</label>
        </div>
      </div>
      <button class="btn btn-primary" onclick="saveSavingsTarget()">💾 保存目标</button>
    </div>

    <!-- PIN Protection -->
    <div class="card mb-16">
      <div class="card-title">🔐 安全设置</div>
      <div id="pinStatusSection">
        ${(() => {
          const hasPin = !!localStorage.getItem('budgetAppPinHash');
          if (hasPin) {
            return `
              <div class="flex flex-col gap-8">
                <div class="flex items-center gap-8">
                  <span style="width:10px;height:10px;border-radius:50%;background:var(--success);display:inline-block"></span>
                  <span class="text-sm">PIN锁已启用，数据已加密</span>
                </div>
                <div class="flex gap-8">
                  <button class="btn btn-outline btn-sm" onclick="showChangePinModal()">修改PIN码</button>
                  <button class="btn btn-ghost btn-sm" style="color:var(--danger)" onclick="showClearPinModal()">关闭PIN锁</button>
                </div>
                <div style="margin-top:8px;padding-top:8px;border-top:1px solid var(--border)">
                  <label class="text-sm text-secondary" style="display:block;margin-bottom:6px">⏱ 自动锁定</label>
                  <div class="flex gap-6" style="flex-wrap:wrap">
                    ${[
                      {label:'1分钟', val:1},
                      {label:'5分钟', val:5},
                      {label:'15分钟', val:15},
                      {label:'30分钟', val:30},
                      {label:'从不', val:0}
                    ].map(opt => `
                      <button class="btn btn-sm ${getAutoLockTimeout() === opt.val ? 'btn-primary' : 'btn-outline'}"
                        onclick="setAutoLockTimeout(${opt.val});renderSettings()">
                        ${opt.label}
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
                  <span class="text-sm">PIN锁未启用，数据明文存储</span>
                </div>
                <button class="btn btn-primary btn-sm" onclick="showSetPinModal()">🔐 设置PIN锁</button>
              </div>
            `;
          }
        })()}
      </div>
    </div>

    <!-- Tag Management -->
    <div class="card mb-16">
      <div class="card-title">🏷️ 标签管理</div>
      <div id="tagList">
        ${(() => {
          const tags = DataStore.getAllTags();
          if (tags.length === 0) return '<div class="text-sm text-muted">暂无标签</div>';
          return tags.map(tag => {
            const stats = DataStore.getTagStats(tag);
            return `
              <div class="flex items-center justify-between" style="padding:6px 0;border-bottom:1px solid var(--border)">
                <span>${escHtml(tag)}</span>
                <div class="flex items-center gap-8">
                  <span class="text-xs text-muted">${stats.count}笔 · ${formatMoney(stats.total)}</span>
                  <button class="btn btn-ghost btn-sm" style="color:var(--danger);font-size:0.65rem" onclick="deleteTag('${escHtml(tag)}')">删除</button>
                </div>
              </div>
            `;
          }).join('');
        })()}
      </div>
      <div class="text-xs text-muted mt-8">
        <span>💡 标签在添加记录时创建，此处可查看和清理无用标签</span>
      </div>
    </div>

    <!-- Data Management -->
    <div class="card mb-16">
      <div class="card-title">数据管理</div>
      <div class="flex flex-col gap-8">
        <button class="btn btn-outline btn-block" onclick="exportJSON()">📥 导出 JSON</button>
        <button class="btn btn-outline btn-block" onclick="document.getElementById('importJSONInput').click()">📤 导入 JSON</button>
        <input type="file" id="importJSONInput" accept=".json" style="display:none" onchange="importJSON(event)">
        <button class="btn btn-outline btn-block" onclick="exportToExcel()">📥 导出 Excel (可修改·含公式)</button>
        <button class="btn btn-outline btn-block" onclick="exportCSV()">📊 导出 CSV</button>
        <button class="btn btn-primary btn-block" onclick="if(window.LANSync)LANSync.open();else showToast('lan-sync.js 未加载','error')">📶 局域网同步</button>
        <button class="btn btn-danger btn-block" onclick="clearAllData()">🗑️ 清除所有数据</button>
        <button class="btn btn-primary btn-block" onclick="repairData()">🔧 数据修复 (重新加载+清理)</button>
      </div>
    </div>

    <!-- Data Sync Verification -->
    <div class="card mb-16" style="border-left:4px solid #818CF8">
      <div class="card-title" style="display:flex;align-items:center;gap:8px">
        <span>🔄 数据同步校验</span>
        <button class="btn btn-sm btn-primary" onclick="refreshSyncFingerprint()" style="font-size:0.72rem">刷新</button>
      </div>
      <div id="syncFingerprint">
        <div class="text-sm text-secondary" style="margin-bottom:8px">
          对比两台设备的数据指纹，确认同步是否成功。
        </div>
        <div class="flex items-center gap-8" style="padding:6px 10px;background:var(--bg);border-radius:var(--radius-sm);margin-bottom:6px">
          <span class="text-xs text-muted" style="min-width:60px">指纹码</span>
          <span id="syncFingerprintCode" style="font-family:monospace;font-size:1.3rem;font-weight:700;letter-spacing:2px;color:var(--primary)">------</span>
        </div>
        <div class="flex items-center gap-8" style="padding:6px 10px;background:var(--bg);border-radius:var(--radius-sm)">
          <span class="text-xs text-muted" style="min-width:60px">最新变更</span>
          <span id="syncFingerprintTime" class="text-sm" style="font-weight:500">—</span>
        </div>
      </div>
      <div class="text-xs text-muted" style="margin-top:6px;line-height:1.4">
        💡 两台设备数据完全一致时指纹码相同。导入/导出/同步后请点击「刷新」重新计算。
      </div>
    </div>
    <!-- Data Inspector (Diagnostics) -->
    ${renderDataInspector()}
    <div style="text-align:center;padding:12px 0 4px">
      <button class="btn btn-ghost btn-sm" onclick="refreshPageData()" style="font-size:0.8rem">🔄 刷新页面数据</button>
    </div>
    <div style="text-align:center;padding:8px 0 8px;font-size:0.65rem;color:var(--text-muted);opacity:0.5">v2.3.2</div>
  `;
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
  showToast('✅ 预算已保存');
}

function saveSavingsTarget() {
  const type = DataStore.getSavingsTarget().type;
  const fixedAmount = parseFloat(document.getElementById('savingsFixedAmount')?.value) || 0;
  const percent = parseFloat(document.getElementById('savingsPercent')?.value) || 0;
  DataStore.setSavingsTarget({ type, fixedAmount, percent });
  showToast('✅ 储蓄目标已保存');
}

function setPercentBase(base) {
  DataStore.setPercentBase(base);
  renderSettings();
  showToast('✅ 百分比基准已切换为' + (base === 'gross' ? '纯收入' : '净收入'));
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
  showToast('✅ JSON 已导出');
}

let importJSONContent = null;

function importJSON(event) {
  const file = event.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = function(e) {
    importJSONContent = e.target.result;
    showModal(`
      <div class="modal-title">导入数据</div>
      <p class="text-sm text-secondary mb-16">选择导入方式：</p>
      <div class="flex flex-col gap-8">
        <button class="btn btn-primary btn-block" onclick="confirmImportJSON('replace')">🔄 替换当前数据</button>
        <button class="btn btn-outline btn-block" onclick="confirmImportJSON('merge')">🔀 合并到当前数据</button>
      </div>
      <div class="modal-actions"><button class="btn btn-ghost" onclick="closeModal()">取消</button></div>
    `);
  };
  reader.readAsText(file);
  event.target.value = '';
}

function confirmImportJSON(mode) {
  if (!importJSONContent) { showToast('没有可导入的数据', 'error'); return; }
  const success = DataStore.importJSON(importJSONContent, mode);
  importJSONContent = null;
  closeModal();
  if (success) {
    showToast('✅ 数据导入成功');
    renderSettings();
  } else {
    showToast('❌ 导入失败，文件格式无效', 'error');
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
  showToast('✅ CSV 已导出');
}

function clearAllData() {
  showModal(`
    <div class="modal-title">⚠️ 清除所有数据</div>
    <p style="color:var(--danger);margin-bottom:16px">此操作不可恢复！所有记录、分类、预算设置将被删除。</p>
    <div class="modal-actions">
      <button class="btn btn-ghost" onclick="closeModal()">取消</button>
      <button class="btn btn-danger" onclick="confirmClearAll()">确认清除</button>
    </div>
  `);
}

function confirmClearAll() {
  DataStore.clearAll();
  closeModal();
  showToast('✅ 所有数据已清除');
  navigateTo('overview');
}

function refreshSyncFingerprint() {
  const codeEl = document.getElementById('syncFingerprintCode');
  const timeEl = document.getElementById('syncFingerprintTime');
  if (codeEl) codeEl.textContent = DataStore.getDataHash();
  if (timeEl) {
    const t = DataStore.getLastUpdateTime();
    timeEl.textContent = t ? t.replace('T', ' ').substring(0, 19) : '无数据';
  }
}

function renderLogPreview() {
  const log = DataStore.getDiagnosticLog();
  if (!log || log.length === 0) return '<span style="color:var(--text-muted)">（无记录）</span>';
  return log.slice(-20).reverse().map(e => {
    const time = e.t.substring(11, 23);
    return `<div>${time} [${e.a}] ${e.d}  | 记录:${e.recordsCount} 待删:${e.pendingId || '—'}</div>`;
  }).join('');
}

function exportDiagnosticLog() {
  const log = DataStore.getDiagnosticLog();
  if (!log || log.length === 0) {
    showToast('⚠️ 暂无日志可导出', 'warning');
    return;
  }
  let text = '=== Budget App Diagnostic Log ===\n';
  text += 'Exported: ' + new Date().toISOString() + '\n';
  text += 'Version: v2.3.2\n';
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
  showToast('✅ 日志已导出', 'success');
}

function renderDataInspector() {
  const compare = typeof DataStore.compareWithStorage === 'function' ? DataStore.compareWithStorage() : null;
  const storage = typeof DataStore.getStorageInfo === 'function' ? DataStore.getStorageInfo() : null;
  const log = typeof DataStore.getDiagnosticLog === 'function' ? DataStore.getDiagnosticLog() : [];
  
  let html = '<div class="card mb-16">';
  html += '<div class="card-title" style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">';
  html += '<span>🔬 数据诊断</span>';
  html += '<button class="btn btn-sm btn-primary" onclick="renderDataInspector()" style="font-size:0.72rem">🔄 刷新</button>';
  html += '<button class="btn btn-sm btn-ghost" onclick="exportDiagnosticReport()" style="font-size:0.72rem">📥 导出报告</button>';
  html += '</div>';
  
  // Comparison table
  html += '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;margin-bottom:12px">';
  if (compare) {
    html += '<div style="padding:8px;border-radius:8px;background:' + (compare.match ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.1)') + ';border:1px solid ' + (compare.match ? 'var(--success)' : 'var(--danger)') + '">' +
      '<div class="text-xs text-secondary">数据一致性</div>' +
      '<div class="font-bold" style="color:' + (compare.match ? 'var(--success)' : 'var(--danger)') + '">' + (compare.match ? '✅ 一致' : '⚠️ 不一致') + '</div>' +
      '<div class="text-xs text-muted">内存: ' + compare.memRecords + ' 条 | LS: ' + compare.lsRecords + ' 条</div>' +
      (compare.inLSNotMem.length > 0 ? '<div class="text-xs" style="color:var(--danger)">LS有多余: ' + compare.inLSNotMem.length + ' 条</div>' : '') +
    '</div>';
  }
  if (storage) {
    html += '<div style="padding:8px;border-radius:8px;background:var(--bg);border:1px solid var(--border)">' +
      '<div class="text-xs text-secondary">存储用量</div>' +
      '<div class="font-bold">' + (storage.localStorage.totalSize / 1024).toFixed(1) + ' KB</div>' +
      '<div class="text-xs text-muted">待删除: ' + (storage.pendingDelete ? storage.pendingDelete.substring(0, 8) + '...' : '无') + '</div>' +
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
  html += '<summary style="cursor:pointer;font-weight:600;font-size:0.85rem;padding:4px 0">📊 统计引擎审计 (点击展开)</summary>';
  html += '<div style="padding:8px;background:var(--bg);border-radius:8px;margin-top:4px">';
  html += '<p class="text-xs text-muted mb-8">查看任意月份统计引擎实际使用的记录列表</p>';
  
  const currentAuditMonth = getMonthKey(new Date().toISOString());
  html += '<div style="display:flex;align-items:center;gap:8px;margin-bottom:8px">' +
    '<label class="text-xs text-secondary">月份</label>' +
    '<input type="month" id="auditMonth" class="input-field" style="width:160px" value="' + currentAuditMonth + '" onchange="refreshStatsAudit()">' +
    '<button class="btn btn-sm btn-ghost" onclick="refreshStatsAudit()" style="font-size:0.72rem">🔄</button>' +
  '</div>';
  
  html += '<div id="statsAuditContainer">';
  if (typeof StatsEngine !== 'undefined') {
    const auditRecords = StatsEngine.getRecordsInMonth(currentAuditMonth);
    const auditTotal = auditRecords.reduce((s, r) => s + r.amount, 0);
    if (auditRecords.length > 0) {
      html += '<div class="text-xs text-secondary mb-4">' + currentAuditMonth + ' 月: ' + auditRecords.length + ' 条记录, 合计 ' + formatMoney(auditTotal) + '</div>';
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
      html += '<div class="text-sm text-muted">本月暂无记录</div>';
    }
  }
  html += '</div>'; // end statsAuditContainer
  
  html += '</div></details>';
  
  // Full unfiltered records dump
  html += '<details style="margin-bottom:8px">';
  html += '<summary style="cursor:pointer;font-weight:600;font-size:0.85rem;padding:4px 0">📋 全量记录原始数据 (无过滤) (点击展开)</summary>';
  html += '<div style="padding:8px;background:var(--bg);border-radius:8px;margin-top:4px">';
  html += '<p class="text-xs text-muted mb-8">直接从 DataStore.getRecords() 读取，无任何过滤。用于排查流水页看不到的记录。</p>';
  
  const allRecords = DataStore.getRecords();
  html += '<div class="text-xs font-semibold mb-4">总计 ' + allRecords.length + ' 条记录</div>';
  
  if (allRecords.length > 0) {
    html += '<div style="max-height:400px;overflow-y:auto;font-size:0.65rem;font-family:monospace;border:1px solid var(--border);border-radius:8px">';
    html += '<div style="display:flex;padding:4px 6px;font-weight:600;border-bottom:2px solid var(--border);position:sticky;top:0;background:var(--bg)">';
    html += '<span style="width:70px">ID</span>';
    html += '<span style="width:45px">金额</span>';
    html += '<span style="width:55px">分类</span>';
    html += '<span style="width:80px">日期</span>';
    html += '<span style="width:70px">创建时间</span>';
    html += '<span style="width:15px">📌</span>';
    html += '<span style="flex:1">备注</span>';
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
      html += '<button class="btn btn-ghost" style="padding:1px 4px;font-size:0.6rem;flex-shrink:0;opacity:0.5" onclick="showRecordRaw(\'' + r.id + '\')" title="查看原始数据">🔍</button>';
      html += '</div>';
    });
    
    html += '</div>';
  } else {
    html += '<div class="text-sm text-muted">暂无记录</div>';
  }
  
  html += '</div></details>';
  
  // Operation log
  const logCount = Math.min(log.length, 50);
  html += '<details>';
  html += '<summary style="cursor:pointer;font-weight:600;font-size:0.85rem;padding:4px 0">📝 操作日志 (最近 ' + logCount + ' 条)</summary>';
  html += '<div style="max-height:250px;overflow-y:auto;font-size:0.6rem;font-family:monospace;background:var(--bg);padding:8px;border-radius:8px;margin-top:4px;border:1px solid var(--border);line-height:1.6">';
  if (log.length === 0) {
    html += '<span style="color:var(--text-muted)">（无记录）</span>';
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
    showToast('⚠️ 诊断系统未加载', 'error');
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
  showToast('✅ 诊断报告已导出');
}

function repairData() {
  // Check if DataStore._data and localStorage are in sync
  try {
    const raw = localStorage.getItem('budgetAppData');
    if (!raw) {
      showToast('✅ 没有需要修复的数据', 'success');
      return;
    }
    const lsData = JSON.parse(raw);
    const memRecords = DataStore.getRecords().length;
    const lsRecords = (lsData.records || []).length;
    
    // Check 1: if localStorage has records that memory doesn't (stale in-memory)
    // We reload from localStorage which is the source of truth
    const success = DataStore.reload();
    if (success) {
      // Also clear any pending delete state which might be stale
      const pending = DataStore.getPendingDelete();
      if (pending) {
        DataStore._finalizeDelete(pending.id);
      }
      showToast('✅ 数据已从 localStorage 重新加载 (' + lsRecords + ' 条记录)', 'success');
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
    showToast('❌ 修复失败: ' + e.message, 'error');
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
    container.innerHTML = '<div class="text-sm text-muted">StatsEngine 未加载</div>';
    return;
  }
  
  const records = StatsEngine.getRecordsInMonth(month);
  const total = records.reduce((s, r) => s + r.amount, 0);
  
  if (records.length > 0) {
    let auditHtml = '<div class="text-xs text-secondary mb-4">' + month + ' 月: ' + records.length + ' 条记录, 合计 ' + formatMoney(total) + '</div>';
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
    container.innerHTML = '<div class="text-sm text-muted">该月暂无记录</div>';
  }
}

function deleteTag(tag) {
  if (!confirm(`确认删除标签"${tag}"？此操作不会删除记录，只会移除标签引用。`)) return;
  // Remove from all records
  DataStore._data.records.forEach(r => {
    if (r.tags) {
      r.tags = r.tags.filter(t => t !== tag);
    }
  });
  DataStore.cleanUnusedTags();
  DataStore.save();
  renderSettings();
  showToast('已删除标签: ' + tag);
}

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
