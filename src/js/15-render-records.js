/* ============================================================
   RENDER: Records Page
   ============================================================ */
(function() {
'use strict';
let recordsFilter = { keyword: '', categoryId: '', dateStart: '', dateEnd: '', amountMin: '', amountMax: '', overspentOnly: false, tags: [] };
let recordsPage = 0;
let compactRecordsView = JSON.parse(localStorage.getItem('budgetCompactView') || 'false');
let recordsPerPage = window.recordsPerPage = parseInt(localStorage.getItem('budgetRecordsPerPage') || '20');
let batchMode = false;
let selectedRecordIds = new Set();
let recordsSort = JSON.parse(localStorage.getItem('budgetRecordsSort') || '[{"field":"date","dir":"desc"}]');

function renderRecords() {
  logEvent('renderRecords', 'start');
  const el = document.getElementById('page-records');
  const cats = DataStore.getCategories();

  // Set default date range for rolling30 mode
  if (getStatsRange() === 'rolling30') {
    const { start, end } = getPeriodDateRange();
    if (!recordsFilter.dateStart) {
      recordsFilter.dateStart = start.toISOString().substr(0, 10);
    }
    if (!recordsFilter.dateEnd) {
      recordsFilter.dateEnd = end.toISOString().substr(0, 10);
    }
  }

  const filterCat = recordsFilter.categoryId ? DataStore.getCategory(recordsFilter.categoryId) : null;

  el.innerHTML = `
    <div class="card mb-16">
      <div class="card-title mb-8">搜索筛选</div>
      <div class="input-group" style="margin-bottom:8px">
        <input type="text" id="filterKeyword" class="input-field" placeholder="🔍 搜索备注..." value="${escHtml(recordsFilter.keyword)}" oninput="applyRecordsFilter()">
      </div>
      <div class="input-group" style="margin-bottom:8px">
        <label class="text-sm text-secondary">标签</label>
        <div style="display:flex;flex-wrap:wrap;gap:4px" id="recordsTagFilterDisplay">
          ${recordsFilter.tags && recordsFilter.tags.length > 0
            ? recordsFilter.tags.map(t => `<span style="display:inline-flex;align-items:center;gap:4px;padding:1px 6px;background:var(--primary);color:white;border-radius:10px;font-size:0.7rem">${escHtml(t)}<span style="cursor:pointer" onclick="removeRecordsTagFilter('${escHtml(t)}')">✕</span></span>`).join('')
            : '<span class="text-xs text-muted">全部</span>'}
        </div>
        <button type="button" class="btn btn-sm btn-outline" style="font-size:0.72rem" onclick="openTagPickerForRecords()">🏷️ 筛选标签</button>
      </div>
      <div class="input-group" style="margin-bottom:8px">
        <label class="text-sm text-secondary">分类</label>
        <button type="button" class="input-field" style="text-align:left;cursor:pointer" onclick="openCategoryFilterPicker()">
          <span id="filterCategoryDisplay">${filterCat ? escHtml(filterCat.icon) + ' ' + escHtml(filterCat.name) : '全部分类'}</span>
        </button>
      </div>
      <div class="grid-2">
        <div class="input-group" style="margin-bottom:8px">
          <label class="text-sm text-secondary">开始日期</label>
          <input type="date" id="filterDateStart" class="input-field" value="${recordsFilter.dateStart}" onchange="applyRecordsFilter()">
        </div>
        <div class="input-group" style="margin-bottom:8px">
          <label class="text-sm text-secondary">结束日期</label>
          <input type="date" id="filterDateEnd" class="input-field" value="${recordsFilter.dateEnd}" onchange="applyRecordsFilter()">
        </div>
      </div>
      <div class="grid-2">
        <div class="input-group" style="margin-bottom:8px">
          <label class="text-sm text-secondary">最低金额</label>
          <input type="number" id="filterAmountMin" class="input-field" placeholder="0" value="${recordsFilter.amountMin}" oninput="applyRecordsFilter()">
        </div>
        <div class="input-group" style="margin-bottom:8px">
          <label class="text-sm text-secondary">最高金额</label>
          <input type="number" id="filterAmountMax" class="input-field" placeholder="9999" value="${recordsFilter.amountMax}" oninput="applyRecordsFilter()">
        </div>
      </div>
      <div class="flex gap-8 mt-8" style="flex-wrap:wrap">
        <button class="btn btn-outline btn-sm" onclick="clearRecordsFilter()">清除筛选</button>
        <button class="btn btn-sm ${recordsFilter.overspentOnly ? 'btn-danger' : 'btn-outline'}" onclick="toggleOverspentFilter()" title="只显示超支分类的记录">
          ${recordsFilter.overspentOnly ? '⚠️ 超支分类 (已选)' : '⚠️ 超支分类'}
        </button>
        <button class="btn btn-sm ${batchMode ? 'btn-primary' : 'btn-outline'}" onclick="toggleBatchMode()" title="${batchMode ? '退出批量选择' : '进入批量选择'}">
          ${batchMode ? '✅ 完成选择' : '☑️ 选择'}
        </button>
        <button class="btn btn-primary btn-sm" onclick="exportToExcel()">📥 导出 Excel</button>
        <button class="btn btn-ghost btn-sm" onclick="refreshPageData()" title="从 localStorage 重新读取数据并刷新页面">🔄 刷新数据</button>
        <button class="view-toggle-btn ${compactRecordsView ? 'active' : ''}" onclick="toggleRecordsView()" title="${compactRecordsView ? '切换为卡片视图' : '切换为紧凑视图'}">
          ${compactRecordsView ? '📋 卡片视图' : '📄 紧凑视图'}
        </button>
        <span class="text-sm text-secondary" style="align-self:center" id="recordsCount"></span>
        <span class="text-xs text-muted" style="display:inline-flex;align-items:center;gap:4px">
          每页 <input type="number" id="recordsPageSizeInput" value="${window.recordsPerPage || recordsPerPage}" min="5" max="200" 
          onchange="
            var v = parseInt(this.value) || 20;
            if (v < 5) v = 5;
            if (v > 200) v = 200;
            this.value = v;
            localStorage.setItem('budgetRecordsPerPage', v);
            recordsPerPage = v;
  window.recordsPage = 0;
  renderRecordsList();
          " style="width:50px;padding:2px 4px;border:1px solid var(--border);border-radius:4px;font-size:0.75rem;text-align:center;background:var(--card-bg);color:var(--text)"> 条
        </span>
      </div>
      <!-- Sort section -->
      <div style="margin-top:12px;padding-top:12px;border-top:1px solid var(--border)">
        <div class="flex items-center gap-8 mb-4" style="flex-wrap:wrap">
          <span class="text-sm font-semibold">🔀 排序：</span>
          <div id="sortControls"></div>
          <button class="btn btn-ghost btn-sm" onclick="addSortLevel()">＋ 添加排序</button>
          <button class="btn btn-ghost btn-sm" onclick="clearSort()">清除排序</button>
        </div>
      </div>
    </div>
    <div id="recordsList"></div>
    <!-- Batch toolbar -->
    <div id="batchToolbar" style="position:fixed;bottom:80px;left:50%;transform:translateX(-50%);z-index:150;background:var(--card-bg);border-radius:var(--radius);box-shadow:var(--shadow-lg);padding:10px 18px;display:${batchMode ? 'flex' : 'none'};align-items:center;gap:12px;border:1px solid var(--border);white-space:nowrap">
      <span class="text-sm font-semibold" id="batchCount">已选 0 条</span>
      <button class="btn btn-danger btn-sm" onclick="batchDelete()">🗑️ 批量删除</button>
      <button class="btn btn-primary btn-sm" onclick="batchChangeCategory()">📂 批量修改分类</button>
      <button class="btn btn-ghost btn-sm" onclick="batchCancel()">取消</button>
    </div>
  `;

  window.recordsPage = 0;
  renderRecordsList();
  updateBatchCount();
  renderSortControls();
}

function toggleRecordsView() {
  compactRecordsView = !compactRecordsView;
  localStorage.setItem('budgetCompactView', JSON.stringify(compactRecordsView));
  renderRecords();
}

function getFilteredRecords() {
  let records = DataStore.getRecords();
  const f = recordsFilter;
  if (f.keyword) {
    const kw = f.keyword.toLowerCase();
    records = records.filter(r => (r.note || '').toLowerCase().includes(kw));
  }
  if (f.categoryId) {
    const descIds = DataStore.getDescendantIds(f.categoryId);
    records = records.filter(r => descIds.includes(r.categoryId));
  }
  if (f.dateStart) {
    records = records.filter(r => (r.date || r.createdAt) >= f.dateStart);
  }
  if (f.dateEnd) {
    records = records.filter(r => (r.date || r.createdAt) <= f.dateEnd + 'T23:59');
  }
  if (f.amountMin) {
    records = records.filter(r => r.amount >= parseFloat(f.amountMin));
  }
  if (f.amountMax) {
    records = records.filter(r => r.amount <= parseFloat(f.amountMax));
  }
  if (f.overspentOnly) {
    // Get the current month's overspent category IDs
    const currentMonth = getBudgetMonth();
    const catBudgets = DataStore.getAllCategoryBudgets();
    const overspentIds = new Set();
    const catTotals = {};
    // Calculate spending per root category for current month
    records.forEach(r => {
      const m = getMonthKey(r.date || r.createdAt);
      if (m === currentMonth) {
        const rootId = getRootAncestorId(r.categoryId);
        if (rootId) {
          catTotals[rootId] = (catTotals[rootId] || 0) + r.amount;
        }
      }
    });
    // Find overspent root categories
    Object.entries(catBudgets).forEach(([key, budget]) => {
      if (budget > 0) {
        const [catId, month] = key.split(':');
        if (month === currentMonth) {
          const spent = catTotals[catId] || 0;
          if (spent > budget) {
            overspentIds.add(catId);
            // Also add all descendant IDs
            DataStore.getDescendantIds(catId).forEach(id => overspentIds.add(id));
          }
        }
      }
    });
    if (overspentIds.size > 0) {
      records = records.filter(r => {
        const rootId = getRootAncestorId(r.categoryId);
        return rootId && overspentIds.has(rootId);
      });
    }
  }
  // Tag filter
  if (f.tags && f.tags.length > 0) {
    records = records.filter(r => r.tags && f.tags.some(t => r.tags.includes(t)));
  }
  // Apply sorting
  if (recordsSort && recordsSort.length > 0) {
    records.sort((a, b) => {
      for (const level of recordsSort) {
        let cmp = 0;
        const dir = level.dir === 'asc' ? 1 : -1;
        switch (level.field) {
          case 'date':
            cmp = ((a.date || a.createdAt) || '').localeCompare((b.date || b.createdAt) || '');
            break;
          case 'amount':
            cmp = (a.amount || 0) - (b.amount || 0);
            break;
          case 'note':
            cmp = (a.note || '').localeCompare(b.note || '');
            break;
          case 'category': {
            const ca = DataStore.getCategory(a.categoryId);
            const cb = DataStore.getCategory(b.categoryId);
            cmp = (ca ? ca.name : '').localeCompare(cb ? cb.name : '');
            break;
          }
        }
        if (cmp !== 0) return cmp * dir;
      }
      return 0;
    });
  }
  return records;
}

function toggleOverspentFilter() {
  recordsFilter.overspentOnly = !recordsFilter.overspentOnly;
  window.recordsPage = 0;
  renderRecords();
}

function applyRecordsFilter() {
  recordsFilter.keyword = document.getElementById('filterKeyword').value;
  recordsFilter.dateStart = document.getElementById('filterDateStart').value;
  recordsFilter.dateEnd = document.getElementById('filterDateEnd').value;
  recordsFilter.amountMin = document.getElementById('filterAmountMin').value;
  recordsFilter.amountMax = document.getElementById('filterAmountMax').value;
  window.recordsPage = 0;
  renderRecordsList();
}

function openCategoryFilterPicker() {
  const cats = DataStore.getRootCategories();
  let html = '<div class="modal-title">选择分类筛选</div><div style="max-height:50vh;overflow-y:auto">';
  html += `<div style="padding:8px 12px;cursor:pointer;border-radius:var(--radius-sm);transition:var(--transition-fast);display:flex;align-items:center;gap:8px"
       onmouseover="this.style.background='var(--bg)'" onmouseout="this.style.background=''"
       onclick="selectCategoryFilter('')">
    <span>📁</span><span>全部分类</span>
  </div>`;
  html += buildCategoryTreeFilterPicker(cats, 0);
  html += '</div><div class="modal-actions"><button class="btn btn-ghost" onclick="closeModal()">取消</button></div>';
  showModal(html);
}

function buildCategoryTreeFilterPicker(cats, depth) {
  let html = '';
  cats.forEach(cat => {
    const children = DataStore.getChildren(cat.id);
    const indent = depth * 20;
    html += `
      <div style="padding:8px 12px;cursor:pointer;border-radius:var(--radius-sm);transition:var(--transition-fast);display:flex;align-items:center;gap:8px;margin-left:${indent}px"
           onmouseover="this.style.background='var(--bg)'" onmouseout="this.style.background=''"
           onclick="selectCategoryFilter('${cat.id}')">
        <span style="width:10px;height:10px;border-radius:50%;background:${cat.color};display:inline-block"></span>
        <span>${escHtml(cat.icon)}</span>
        <span>${escHtml(cat.name)}</span>
        <span class="text-xs text-muted">(含子分类)</span>
      </div>
    `;
    if (children.length) {
      html += buildCategoryTreeFilterPicker(children, depth + 1);
    }
  });
  return html;
}

function selectCategoryFilter(catId) {
  recordsFilter.categoryId = catId;
  const display = document.getElementById('filterCategoryDisplay');
  if (display) {
    if (catId) {
      const cat = DataStore.getCategory(catId);
      display.textContent = cat ? cat.icon + ' ' + cat.name : '全部分类';
    } else {
      display.textContent = '全部分类';
    }
  }
  closeModal();
  applyRecordsFilter();
}

function clearRecordsFilter() {
  recordsFilter = { keyword: '', categoryId: '', dateStart: '', dateEnd: '', amountMin: '', amountMax: '', overspentOnly: false };
  renderRecords();
}

function renderRecordsList() {
  const container = document.getElementById('recordsList');
  const countEl = document.getElementById('recordsCount');
  if (!container) return;

  const filtered = getFilteredRecords();
  countEl.textContent = filtered.length + ' 条记录';

  const perPage = window.recordsPerPage || parseInt(localStorage.getItem('budgetRecordsPerPage') || '20');
  let page = window.recordsPage || 0;
  const totalPages = Math.max(1, Math.ceil(filtered.length / perPage));
  if (page >= totalPages) page = Math.max(0, totalPages - 1);
  const start = page * perPage;
  const end = Math.min(start + perPage, filtered.length);
  window.recordsPage = page;
  const pageRecords = filtered.slice(start, end);

  if (!pageRecords.length) {
    container.innerHTML = '<div class="empty-state"><div class="empty-icon">📭</div><div class="empty-text">暂无记录</div><div class="empty-hint">点击"记账"开始记录你的第一笔支出</div></div>';
    return;
  }

  let html = '';
  pageRecords.forEach(r => {
    const cat = DataStore.getCategory(r.categoryId);
    const dateStr = (r.date || r.createdAt).replace('T', ' ');
    const isSelected = selectedRecordIds.has(r.id);
    const selStyle = isSelected ? 'border-color:var(--primary);background:rgba(99,102,241,0.05)' : '';
    if (compactRecordsView) {
      // ===== COMPACT VIEW =====
      html += `
        <div class="card record-card compact" data-id="${r.id}" style="${selStyle}" onclick="${batchMode ? '' : "openEditRecord('" + r.id + "')"}">
          <div class="compact-row">
            ${batchMode ? `<input type="checkbox" class="batch-checkbox" ${isSelected ? 'checked' : ''} onclick="event.stopPropagation();toggleRecordSelection('${r.id}')" style="flex-shrink:0;width:16px;height:16px;cursor:pointer">` : ''}
            <span class="compact-date">${dateStr.slice(0, 10)}</span>
            <span class="compact-cat">${cat ? escHtml(cat.icon) + escHtml(cat.name) : '❓未知'}</span>
            <span class="compact-note">${r.note ? '📝 ' + escHtml(r.note) : ''}</span>
            ${r.tags && r.tags.length > 0 ? `<span style="display:inline-flex;flex-wrap:wrap;gap:2px;margin-left:4px">${r.tags.map(t => `<span style="padding:0 4px;background:var(--bg);border-radius:4px;font-size:0.6rem;color:var(--text-muted)">${escHtml(t)}</span>`).join('')}</span>` : ''}
            ${r.excludeFromAvg ? '<span class="text-xs text-muted" style="font-size:0.6rem;margin-left:2px" title="不计日均">📌</span>' : ''}
            <span class="compact-amount" style="color:var(--primary)">${formatMoney(r.amount)}</span>
            ${!batchMode ? `<button class="btn btn-ghost btn-sm record-del-btn" style="padding:0 4px;font-size:0.7rem;opacity:0.5;flex-shrink:0;background:none;border:none;cursor:pointer"
              onclick="event.stopPropagation();deleteRecordConfirm('${r.id}')" title="删除">🗑️</button>` : ''}
          </div>
        </div>
      `;
    } else {
      // ===== NORMAL (CARD) VIEW =====
      html += `
      <div class="card record-card" style="cursor:${batchMode ? 'default' : 'pointer'};position:relative;overflow:hidden;${selStyle}" data-id="${r.id}" onclick="${batchMode ? "toggleRecordSelection('" + r.id + "')" : "openEditRecord('" + r.id + "')"}">
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-12">
            ${batchMode ? `<input type="checkbox" class="batch-checkbox" ${isSelected ? 'checked' : ''} onclick="event.stopPropagation();toggleRecordSelection('${r.id}')" style="width:18px;height:18px;cursor:pointer;flex-shrink:0">` : ''}
            <div style="width:40px;height:40px;border-radius:50%;background:${cat ? cat.color + '20' : '#eee'};display:flex;align-items:center;justify-content:center;font-size:1.2rem;flex-shrink:0">
              ${cat ? escHtml(cat.icon) : '❓'}
            </div>
            <div>
              <div class="font-semibold">${cat ? escHtml(cat.name) : '未知分类'}</div>
              <div class="text-sm text-muted">${dateStr.slice(0, 16)}</div>
              ${r.note ? '<div class="text-sm text-secondary">' + escHtml(r.note) + '</div>' : ''}
              ${r.tags && r.tags.length > 0 ? `<div style="display:flex;flex-wrap:wrap;gap:2px;margin-top:2px">${r.tags.map(t => `<span style="padding:0 4px;background:var(--bg);border-radius:4px;font-size:0.65rem;color:var(--text-muted)">${escHtml(t)}</span>`).join('')}</div>` : ''}
              ${r.excludeFromAvg ? '<span class="text-xs text-muted" style="font-size:0.6rem;margin-left:4px" title="不计日均">📌</span>' : ''}
            </div>
          </div>
          <div class="text-right">
            <div class="font-bold text-lg" style="color:var(--primary)">${formatMoney(r.amount)}</div>
          </div>
        </div>
        ${!batchMode ? `
        <!-- Swipe delete hint -->
        <div class="record-delete-btn" style="position:absolute;right:-80px;top:0;bottom:0;width:80px;background:var(--danger);color:white;display:flex;align-items:center;justify-content:center;font-weight:600;transition:right 0.25s ease;border-radius:0 var(--radius) var(--radius) 0">
          删除
        </div>
        <!-- Desktop delete button (always visible on hover) -->
        <button class="btn btn-ghost btn-sm record-del-btn" 
          style="position:absolute;top:4px;right:4px;padding:2px 6px;font-size:0.75rem;opacity:0;transition:opacity 0.2s"
          onclick="event.stopPropagation();deleteRecordConfirm('${r.id}')" title="删除">🗑️</button>
        ` : ''}
      </div>
    `;
    }
  });

  // Pagination controls
  if (totalPages > 1) {
    const p = page;
    const btnStyle = 'padding:4px 10px;font-size:0.78rem;border:1px solid var(--border);border-radius:4px;background:var(--card-bg);color:var(--text);cursor:pointer';
    const btnActive = 'padding:4px 10px;font-size:0.78rem;border:1px solid var(--primary);border-radius:4px;background:var(--primary);color:#fff;cursor:pointer';
    const btnDisabled = 'padding:4px 10px;font-size:0.78rem;border:1px solid var(--border);border-radius:4px;background:var(--card-bg);color:var(--text-muted);cursor:default;opacity:0.4';
    
    html += '<div style="display:flex;align-items:center;gap:6px;justify-content:center;padding:16px 0 8px;flex-wrap:wrap">';
    
    // First page
    html += `<button style="${p === 0 ? btnDisabled : btnStyle}" onclick="recordsPage=0;renderRecordsList()" ${p === 0 ? 'disabled' : ''}>«</button>`;
    // Prev page
    html += `<button style="${p === 0 ? btnDisabled : btnStyle}" onclick="recordsPage=${p-1};renderRecordsList()" ${p === 0 ? 'disabled' : ''}>‹</button>`;
    
    // Page numbers - show at most 7 around current page
    const pageWindowStart = Math.max(0, p - 3);
    const pageWindowEnd = Math.min(totalPages - 1, p + 3);
    for (let i = pageWindowStart; i <= pageWindowEnd; i++) {
      html += `<button style="${i === p ? btnActive : btnStyle}" onclick="recordsPage=${i};renderRecordsList()">${i+1}</button>`;
    }
    
    // Next page
    html += `<button style="${p >= totalPages - 1 ? btnDisabled : btnStyle}" onclick="recordsPage=${p+1};renderRecordsList()" ${p >= totalPages - 1 ? 'disabled' : ''}>›</button>`;
    // Last page
    html += `<button style="${p >= totalPages - 1 ? btnDisabled : btnStyle}" onclick="recordsPage=${totalPages-1};renderRecordsList()" ${p >= totalPages - 1 ? 'disabled' : ''}>»</button>`;
    
    html += `<span class="text-xs text-muted" style="margin-left:4px">${p+1}/${totalPages} 页 (${filtered.length} 条)</span>`;
    html += '</div>';
  }

  container.innerHTML = html;

  // Attach per-card events (normal view only for swipe; compact handles its own)
  container.querySelectorAll('.record-card').forEach(card => {
    const isCompact = card.classList.contains('compact');

    if (!isCompact) {
      // Normal view: mouse hover for delete button
      card.addEventListener('mouseenter', () => {
        const btn = card.querySelector('.record-del-btn');
        if (btn) btn.style.opacity = '0.6';
      });
      card.addEventListener('mouseleave', () => {
        const btn = card.querySelector('.record-del-btn');
        if (btn) btn.style.opacity = '0';
      });
      card.addEventListener('click', (e) => {
        if (e.target.closest('.record-delete-btn') || e.target.closest('.record-del-btn')) return;
        openEditRecord(card.dataset.id);
      });

      // Swipe to delete (normal view only)
      let startX = 0, currentX = 0, isDragging = false;
      card.addEventListener('touchstart', (e) => {
        startX = e.touches[0].clientX;
        isDragging = true;
      });
      card.addEventListener('touchmove', (e) => {
        if (!isDragging) return;
        currentX = e.touches[0].clientX;
        const diff = startX - currentX;
        if (diff > 0) {
          const deleteBtn = card.querySelector('.record-delete-btn');
          deleteBtn.style.right = Math.max(-80 + Math.min(diff, 80)) + 'px';
          card.style.transform = `translateX(${-Math.min(diff, 80)}px)`;
        }
      });
      card.addEventListener('touchend', () => {
        isDragging = false;
        const diff = startX - currentX;
        const deleteBtn = card.querySelector('.record-delete-btn');
        if (diff > 40) {
          deleteBtn.style.right = '0';
          card.style.transform = 'translateX(-80px)';
          deleteBtn.onclick = (e) => {
            e.stopPropagation();
            deleteRecordConfirm(card.dataset.id);
          };
        } else {
          deleteBtn.style.right = '-80px';
          card.style.transform = '';
        }
      });
    }
  });

  // Remove any leftover sentinel
  const oldSentinel = document.getElementById('recordsSentinel');
  if (oldSentinel) oldSentinel.remove();
}

/* ===== BATCH OPERATIONS ===== */
function toggleBatchMode() {
  batchMode = !batchMode;
  if (!batchMode) {
    selectedRecordIds.clear();
  }
  renderRecords();
}

function toggleRecordSelection(id) {
  if (selectedRecordIds.has(id)) {
    selectedRecordIds.delete(id);
  } else {
    selectedRecordIds.add(id);
  }
  renderRecordsList();
  updateBatchCount();
}

function updateBatchCount() {
  const countEl = document.getElementById('batchCount');
  if (countEl) {
    countEl.textContent = '已选 ' + selectedRecordIds.size + ' 条';
  }
  const toolbar = document.getElementById('batchToolbar');
  if (toolbar) {
    const count = selectedRecordIds.size;
    // Keep toolbar visible in batch mode even if nothing selected
  }
}

function batchCancel() {
  selectedRecordIds.clear();
  batchMode = false;
  renderRecords();
}

function batchDelete() {
  const count = selectedRecordIds.size;
  if (count === 0) {
    showToast('请先选择要删除的记录', 'warning');
    return;
  }
  showModal(`
    <div class="modal-title">确认批量删除</div>
    <p style="color:var(--text-secondary);margin-bottom:16px">确定要删除选中的 <strong>${count}</strong> 条记录吗？此操作不可撤销。</p>
    <div class="modal-actions">
      <button class="btn btn-ghost" onclick="closeModal()">取消</button>
      <button class="btn btn-danger" onclick="confirmBatchDelete()">删除 ${count} 条</button>
    </div>
  `);
}

function confirmBatchDelete() {
  const ids = [...selectedRecordIds];
  ids.forEach(id => {
    DataStore.softDeleteRecord(id);
  });
  selectedRecordIds.clear();
  batchMode = false;
  closeModal();
  showToast(`🗑️ 已删除 ${ids.length} 条记录`);
  refreshCurrentPage();
}

function batchChangeCategory() {
  const count = selectedRecordIds.size;
  if (count === 0) {
    showToast('请先选择要修改的记录', 'warning');
    return;
  }
  // Show category picker
  const roots = DataStore.getRootCategories();
  let html = `<div class="modal-title">批量修改分类</div>
    <p class="text-sm text-secondary mb-8">将选中的 <strong>${count}</strong> 条记录分类修改为：</p>
    <div style="max-height:50vh;overflow-y:auto">`;
  html += buildBatchCategoryTree(roots, 0);
  html += '</div><div class="modal-actions"><button class="btn btn-ghost" onclick="closeModal()">取消</button></div>';
  showModal(html);
}

function buildBatchCategoryTree(cats, depth) {
  let html = '';
  cats.forEach(cat => {
    const children = DataStore.getChildren(cat.id);
    const indent = depth * 20;
    html += `
      <div style="padding:8px 12px;cursor:pointer;border-radius:var(--radius-sm);transition:var(--transition-fast);display:flex;align-items:center;gap:8px;margin-left:${indent}px"
           onmouseover="this.style.background='var(--bg)'" onmouseout="this.style.background=''"
           onclick="confirmBatchChangeCategory('${cat.id}')">
        <span style="width:10px;height:10px;border-radius:50%;background:${cat.color};display:inline-block"></span>
        <span>${escHtml(cat.icon)}</span>
        <span>${escHtml(cat.name)}</span>
      </div>`;
    if (children.length) {
      html += buildBatchCategoryTree(children, depth + 1);
    }
  });
  return html;
}

function confirmBatchChangeCategory(catId) {
  const cat = DataStore.getCategory(catId);
  if (!cat) return;
  const ids = [...selectedRecordIds];
  ids.forEach(id => {
    DataStore.updateRecord(id, { categoryId: catId });
  });
  selectedRecordIds.clear();
  batchMode = false;
  closeModal();
  showToast(`✅ 已将 ${ids.length} 条记录分类改为 ${cat.icon} ${cat.name}`);
  refreshCurrentPage();
}

function deleteRecordConfirm(id) {
  const record = DataStore.getRecord(id);
  if (!record) return;
  const cat = DataStore.getCategory(record.categoryId);
  showModal(`
    <div class="modal-title">确认删除</div>
    <p style="color:var(--text-secondary);margin-bottom:16px">确定要删除这条记录吗？</p>
    <div style="border:1px solid var(--border);border-radius:8px;padding:12px;margin-bottom:16px">
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px">
        <span>${cat ? cat.icon : '❓'}</span>
        <span>${cat ? escHtml(cat.name) : '未知分类'}</span>
        <span style="margin-left:auto;font-weight:700">${formatMoney(record.amount)}</span>
      </div>
      ${record.note ? '<div style="font-size:0.85rem;color:var(--text-muted)">' + escHtml(record.note) + '</div>' : ''}
    </div>
    <div style="display:flex;gap:8px;justify-content:flex-end">
      <button class="btn btn-ghost" onclick="closeModal()">取消</button>
      <button class="btn btn-outline" onclick="confirmDeleteRecord('${id}')">软删除（可撤销）</button>
      <button class="btn btn-danger" onclick="confirmHardDeleteRecord('${id}')">立即删除</button>
    </div>
  `);
}

function confirmDeleteRecord(id) {
  logEvent('confirmDeleteRecord', 'id=' + id);
  const record = DataStore.softDeleteRecord(id);
  closeModal();
  if (record) {
    // Show undo toast
    const container = document.getElementById('toastContainer');
    const toast = document.createElement('div');
    toast.className = 'toast warning';
    toast.innerHTML = `<span>🗑️</span> 已删除，<button class="btn btn-sm btn-primary" style="padding:2px 10px;font-size:0.8rem" onclick="undoDelete(this)">撤销</button>`;
    container.appendChild(toast);
    toast._pendingId = id;
    // Auto-dismiss after 5s
    toast._autoTimeout = setTimeout(() => {
      if (toast.parentNode) {
        toast.style.opacity = '0';
        toast.style.transform = 'translateY(-10px)';
        toast.style.transition = 'all 0.3s ease';
        setTimeout(() => toast.remove(), 300);
      }
    }, 5000);
  }
  refreshCurrentPage();
}

function confirmHardDeleteRecord(id) {
  logEvent('confirmHardDeleteRecord', 'id=' + id);
  closeModal();
  const success = DataStore.forceDeleteRecord(id);
  if (success) {
    showToast('🗑️ 已永久删除', 'success');
  } else {
    showToast('❌ 删除失败：记录不存在', 'error');
  }
  refreshCurrentPage();
}

function undoDelete(btn) {
  const toast = btn.closest('.toast');
  if (!toast) return;
  const success = DataStore.undoDelete();
  if (success) {
    toast.innerHTML = `<span>✅</span> 已恢复`;
    toast.classList.add('success');
    toast.classList.remove('warning');
    clearTimeout(toast._autoTimeout);
    setTimeout(() => {
      if (toast.parentNode) {
        toast.style.opacity = '0';
        toast.style.transform = 'translateY(-10px)';
        toast.style.transition = 'all 0.3s ease';
        setTimeout(() => toast.remove(), 300);
      }
    }, 2000);
    refreshCurrentPage();
  } else {
    toast.innerHTML = `<span>❌</span> 无法撤销（已超时）`;
    toast.classList.add('error');
    toast.classList.remove('warning');
  }
}

function openEditRecord(id) {
  const record = DataStore.getRecord(id);
  if (!record) return;
  const cat = DataStore.getCategory(record.categoryId);
  selectedCategoryId = record.categoryId;

  showModal(`
    <div class="modal-title">编辑记录</div>
    <form id="editForm" onsubmit="submitEditRecord(event, '${id}')">
      <div class="input-group">
        <label class="input-label">金额 (RM)</label>
        <div style="position:relative">
          <span style="position:absolute;left:14px;top:50%;transform:translateY(-50%);font-weight:700;color:var(--primary)">RM</span>
          <input type="text" id="editAmount" class="input-field" value="${record.amount}" style="padding-left:44px;font-size:1.2rem;font-weight:700" inputmode="decimal">
        </div>
      </div>
      <div class="input-group">
        <label class="input-label">分类</label>
        <button type="button" class="input-field" style="text-align:left;cursor:pointer" onclick="openCategoryPicker('edit')">
          <span id="editCategoryDisplay">${cat ? escHtml(cat.icon) + ' ' + escHtml(cat.name) : '请选择'}</span>
        </button>
      </div>
      <div class="input-group">
        <label class="input-label">日期时间</label>
        <input type="datetime-local" id="editDateTime" class="input-field" value="${(record.date || record.createdAt).slice(0, 16)}">
      </div>
      <div class="input-group">
        <label class="input-label">备注</label>
        <input type="text" id="editNote" class="input-field" value="${escHtml(record.note || '')}">
      </div>
      <!-- Tags -->
      <div class="input-group" style="margin-bottom:12px">
        <label class="input-label">🏷️ 标签</label>
        <div id="editTagsDisplay" style="display:flex;flex-wrap:wrap;gap:4px;min-height:28px;padding:4px 0">
          ${record.tags && record.tags.length > 0
            ? record.tags.map(t => `<span style="display:inline-flex;align-items:center;gap:4px;padding:2px 8px;background:var(--primary);color:white;border-radius:12px;font-size:0.75rem">${escHtml(t)}<span style="cursor:pointer;opacity:0.7" onclick="removeEditTag('${escHtml(t)}')">✕</span></span>`).join('')
            : '<span class="text-xs text-muted">无标签</span>'}
        </div>
        <button type="button" class="btn btn-sm btn-outline" onclick="openEditTagPicker()">＋ 添加标签</button>
        <input type="hidden" id="editTagsInput" value='${JSON.stringify(record.tags || [])}'>
      </div>
      <div class="input-group">
        <label style="display:flex;align-items:center;gap:8px;cursor:pointer;padding:4px 0">
          <input type="checkbox" id="editExcludeAvg" ${record.excludeFromAvg ? 'checked' : ''} style="width:18px;height:18px;cursor:pointer">
          <span class="text-sm text-secondary">📌 不计日均（一次性大额消费）</span>
        </label>
      </div>
      <div class="modal-actions">
        <button type="button" class="btn btn-ghost" onclick="closeModal()">取消</button>
        <button type="button" class="btn btn-danger" onclick="closeModal();deleteRecordConfirm('${id}')">🗑️ 删除</button>
        <button type="submit" class="btn btn-primary">保存</button>
      </div>
    </form>
  `);

  // Amount input formatting
  const editAmountInput = document.getElementById('editAmount');
  if (editAmountInput) {
    editAmountInput.addEventListener('input', function() {
      let val = this.value.replace(/[^0-9.]/g, '');
      const parts = val.split('.');
      if (parts.length > 2) val = parts[0] + '.' + parts.slice(1).join('');
      if (parts[1] && parts[1].length > 2) val = parts[0] + '.' + parts[1].slice(0, 2);
      this.value = val;
    });
  }
}

function submitEditRecord(e, id) {
  e.preventDefault();
  const amount = parseFloat(document.getElementById('editAmount').value);
  if (!amount || amount <= 0) { showToast('请输入有效金额', 'error'); return; }
  if (!selectedCategoryId) { showToast('请选择分类', 'error'); return; }

  DataStore.updateRecord(id, {
    amount,
    categoryId: selectedCategoryId,
    date: document.getElementById('editDateTime').value,
    note: document.getElementById('editNote').value.trim(),
    excludeFromAvg: document.getElementById('editExcludeAvg').checked,
    tags: (() => {
      try { return JSON.parse(document.getElementById('editTagsInput').value); }
      catch(e) { return []; }
    })(),
    updatedAt: new Date().toISOString()
  });
  selectedCategoryId = null;
  closeModal();
  showToast('✅ 记录已更新');
  refreshCurrentPage();
}

function refreshPageData() {
  // Force-reload ALL data from localStorage, clearing any stale in-memory state
  const success = DataStore.reload();
  // Also clear any pending soft-delete state
  const pending = DataStore.getPendingDelete();
  if (pending) {
    DataStore._finalizeDelete(pending.id);
  }
  if (success) {
    showToast('✅ 数据已刷新', 'success');
  } else {
    showToast('❌ 数据刷新失败', 'error');
  }
  // Re-render ALL pages to ensure every view reflects current data
  if (typeof renderOverview === 'function') renderOverview();
  if (typeof renderAddPage === 'function') renderAddPage();
  if (typeof renderCategories === 'function') renderCategories();
  if (typeof renderStats === 'function') renderStats();
  if (typeof renderReport === 'function') renderReport();
  if (typeof renderSettings === 'function') renderSettings();
  if (typeof renderWhatIf === 'function') renderWhatIf();
  // Finally re-render the records page (current context)
  renderRecords();
}

/* ===== SORT FUNCTIONS ===== */
function renderSortControls() {
  const container = document.getElementById('sortControls');
  if (!container) return;
  const fieldLabels = { date: '日期', amount: '金额', note: '备注', category: '分类' };
  let html = '';
  recordsSort.forEach((level, idx) => {
    const arrow = level.dir === 'asc' ? '↑' : '↓';
    html += `
      <div class="sort-level" style="display:inline-flex;align-items:center;gap:4px;margin:2px 4px;padding:2px 6px;border:1px solid var(--border);border-radius:4px;background:var(--card-bg);">
        <select onchange="updateSortField(${idx}, this.value)" style="padding:2px 4px;font-size:0.75rem;border:1px solid var(--border);border-radius:3px;background:var(--card-bg);color:var(--text);">
          ${['date','amount','note','category'].map(f => `<option value="${f}" ${level.field === f ? 'selected' : ''}>${fieldLabels[f]}</option>`).join('')}
        </select>
        <button class="btn btn-ghost btn-sm" style="padding:0 4px;font-size:0.8rem;border:none;cursor:pointer;background:none" onclick="toggleSortDir(${idx})" title="切换排序方向">${arrow}</button>
        ${recordsSort.length > 1 ? `<button class="btn btn-ghost btn-sm" style="padding:0 4px;font-size:0.8rem;border:none;cursor:pointer;background:none;color:var(--danger)" onclick="removeSortLevel(${idx})" title="移除排序">×</button>` : ''}
      </div>
    `;
  });
  container.innerHTML = html;
}

function addSortLevel() {
  recordsSort.push({ field: 'date', dir: 'desc' });
  applySort();
}

function removeSortLevel(idx) {
  recordsSort.splice(idx, 1);
  if (recordsSort.length === 0) {
    recordsSort.push({ field: 'date', dir: 'desc' });
  }
  applySort();
}

function updateSortField(idx, field) {
  recordsSort[idx].field = field;
  applySort();
}

function toggleSortDir(idx) {
  recordsSort[idx].dir = recordsSort[idx].dir === 'asc' ? 'desc' : 'asc';
  applySort();
}

function clearSort() {
  recordsSort = [{ field: 'date', dir: 'desc' }];
  applySort();
}

function applySort() {
  localStorage.setItem('budgetRecordsSort', JSON.stringify(recordsSort));
  window.recordsPage = 0;
  renderRecordsList();
  renderSortControls();
}

function openEditTagPicker() {
  const input = document.getElementById('editTagsInput');
  if (!input) return;
  const current = (() => { try { return JSON.parse(input.value); } catch(e) { return []; } })();
  openTagPicker(current, function(selected) {
    input.value = JSON.stringify(selected);
    renderEditTagsDisplay();
  });
}

function renderEditTagsDisplay() {
  const container = document.getElementById('editTagsDisplay');
  const input = document.getElementById('editTagsInput');
  if (!container || !input) return;
  const tags = (() => { try { return JSON.parse(input.value); } catch(e) { return []; } })();
  if (tags.length === 0) {
    container.innerHTML = '<span class="text-xs text-muted">无标签</span>';
  } else {
    container.innerHTML = tags.map(t =>
      `<span style="display:inline-flex;align-items:center;gap:4px;padding:2px 8px;background:var(--primary);color:white;border-radius:12px;font-size:0.75rem">${escHtml(t)}<span style="cursor:pointer;opacity:0.7" onclick="removeEditTag('${escHtml(t)}')">✕</span></span>`
    ).join('');
  }
}

function removeEditTag(tag) {
  const input = document.getElementById('editTagsInput');
  if (!input) return;
  const tags = (() => { try { return JSON.parse(input.value); } catch(e) { return []; } })();
  input.value = JSON.stringify(tags.filter(t => t !== tag));
  renderEditTagsDisplay();
}

  // === EXPORTS ===
  window.refreshPageData = refreshPageData;
  window.recordsFilter = recordsFilter;
  window.recordsPage = recordsPage;
  window.compactRecordsView = compactRecordsView;
  window.recordsPerPage = recordsPerPage;
  window.batchMode = batchMode;
  window.selectedRecordIds = selectedRecordIds;
  window.renderRecords = renderRecords;
  window.toggleRecordsView = toggleRecordsView;
  window.getFilteredRecords = getFilteredRecords;
  window.toggleOverspentFilter = toggleOverspentFilter;
  window.applyRecordsFilter = applyRecordsFilter;
  window.openCategoryFilterPicker = openCategoryFilterPicker;
  window.buildCategoryTreeFilterPicker = buildCategoryTreeFilterPicker;
  window.selectCategoryFilter = selectCategoryFilter;
  window.clearRecordsFilter = clearRecordsFilter;
  window.renderRecordsList = renderRecordsList;
  window.toggleBatchMode = toggleBatchMode;
  window.toggleRecordSelection = toggleRecordSelection;
  window.updateBatchCount = updateBatchCount;
  window.batchCancel = batchCancel;
  window.batchDelete = batchDelete;
  window.confirmBatchDelete = confirmBatchDelete;
  window.batchChangeCategory = batchChangeCategory;
  window.buildBatchCategoryTree = buildBatchCategoryTree;
  window.confirmBatchChangeCategory = confirmBatchChangeCategory;
  window.deleteRecordConfirm = deleteRecordConfirm;
  window.confirmDeleteRecord = confirmDeleteRecord;
  window.confirmHardDeleteRecord = confirmHardDeleteRecord;
  window.undoDelete = undoDelete;
  window.openEditRecord = openEditRecord;
  window.submitEditRecord = submitEditRecord;
  window.recordsSort = recordsSort;
  window.renderSortControls = renderSortControls;
  window.addSortLevel = addSortLevel;
  window.removeSortLevel = removeSortLevel;
  window.updateSortField = updateSortField;
  window.toggleSortDir = toggleSortDir;
  window.clearSort = clearSort;
  window.applySort = applySort;
  // Tag filter helpers
  window.openTagPickerForRecords = openTagPickerForRecords;
  window.removeRecordsTagFilter = removeRecordsTagFilter;
  window.setRecordsTagFilter = setRecordsTagFilter;
  window.openEditTagPicker = openEditTagPicker;
  window.renderEditTagsDisplay = renderEditTagsDisplay;
  window.removeEditTag = removeEditTag;

function openTagPickerForRecords() {
  const current = recordsFilter.tags || [];
  openTagPicker(current, function(selected) {
    recordsFilter.tags = selected;
    window.recordsPage = 0;
    renderRecordsList();
  });
}

function removeRecordsTagFilter(tag) {
  recordsFilter.tags = (recordsFilter.tags || []).filter(t => t !== tag);
  window.recordsPage = 0;
  renderRecordsList();
}

function setRecordsTagFilter(tag) {
  recordsFilter.tags = [tag];
  recordsFilter.keyword = '';
  recordsPage = 0;
  // Re-render records list
  if (typeof renderRecordsList === 'function') renderRecordsList();
  // Update filter UI if on records page
  var display = document.getElementById('recordsTagFilterDisplay');
  if (display) {
    display.innerHTML = '<span style="display:inline-flex;align-items:center;gap:4px;padding:1px 6px;background:var(--primary);color:white;border-radius:10px;font-size:0.7rem">' + escHtml(tag) + '</span>';
  }
}
})();

