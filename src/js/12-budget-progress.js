/* ===== BUDGET PROGRESS CARD ===== */
(function() {
'use strict';

let budgetProgressSort = 'usage';
let budgetProgressView = 'solid';
let budgetMonitoredIds = null; // null = show all; array of category IDs

function loadBudgetMonitored() {
  // Fixed: wrap localStorage access in try-catch (m6)
  try {
    budgetProgressSort = localStorage.getItem('budgetProgressSort') || 'usage';
    budgetProgressView = localStorage.getItem('budgetProgressView') || 'solid';
  } catch(e) { /* use defaults */ }
  const stored = (function() { try { return localStorage.getItem('budgetMonitoredIds'); } catch(e) { return null; } })();
  if (stored) {
    try { budgetMonitoredIds = JSON.parse(stored); }
    catch(e) { budgetMonitoredIds = null; }
  } else {
    budgetMonitoredIds = null; // first time: show all
  }
}
loadBudgetMonitored();

function refreshBudgetCards(month) {
  console.log('[budgetProgress] refreshBudgetCards month:', month);
  document.querySelectorAll('#budgetProgressInner,#overviewProgressInner').forEach(e => {
    if (e) e.innerHTML = renderBudgetProgressCardInner(month);
  });
}

function toggleBudgetView(month) {
  console.log('[budgetProgress] toggle view from:', budgetProgressView);
  budgetProgressView = budgetProgressView === 'solid' ? 'segmented' : 'solid';
  localStorage.setItem('budgetProgressView', budgetProgressView);
  console.log('[budgetProgress] toggle view to:', budgetProgressView);
  
  // Update toggle DOM directly (no re-render) so CSS transition plays
  var toggle = document.getElementById('budgetViewToggle');
  if (toggle) {
    toggle.classList.toggle('segmented', budgetProgressView === 'segmented');
    var labels = toggle.querySelectorAll('.bvt-label');
    if (labels.length >= 2) {
      labels[0].classList.toggle('active', budgetProgressView === 'solid');
      labels[1].classList.toggle('active', budgetProgressView === 'segmented');
    }
  }
  
  refreshBudgetCards(month);
}

function showBudgetSelector(month) {
  const rootCats = DataStore.getRootCategories();
  const catBudgets = DataStore.getAllCategoryBudgets();
  // Get categories with budgets (including children)
  const budgeted = [];
  rootCats.forEach(cat => {
    const bk = cat.id + ':' + month;
    const raw = catBudgets[bk];
    const hasBudget = raw && ((typeof raw === 'number' && raw > 0) || (typeof raw === 'object' && raw.value > 0));
    if (hasBudget) budgeted.push(cat);
    // Also check children
    const children = DataStore.getChildren(cat.id);
    children.forEach(child => {
      const ck = child.id + ':' + month;
      const craw = catBudgets[ck];
      const chasBudget = craw && ((typeof craw === 'number' && craw > 0) || (typeof craw === 'object' && craw.value > 0));
      if (chasBudget) budgeted.push(child);
    });
  });
  // Load current selection
  let selected = budgetMonitoredIds ? [...budgetMonitoredIds] : budgeted.map(c => c.id);
  
  let html = '<div class="modal-title">' + __('budgetProgress.selectTitle') + '</div>';
  html += '<div style="max-height:50vh;overflow-y:auto;margin-bottom:12px">';
  html += '<div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:10px;padding-bottom:8px;border-bottom:1px solid var(--border)">';
  html += '<button class="btn btn-sm btn-outline" onclick="(function(){var c=document.querySelectorAll(\'.budget-sel-cb\');c.forEach(function(e){e.checked=true})})()">' + __('budgetProgress.selectAll') + '</button>';
  html += '<button class="btn btn-sm btn-outline" onclick="(function(){var c=document.querySelectorAll(\'.budget-sel-cb\');c.forEach(function(e){e.checked=false})})()">' + __('budgetProgress.deselectAll') + '</button>';
  html += '<button class="btn btn-sm btn-outline" onclick="(function(){var c=document.querySelectorAll(\'.budget-sel-cb\');c.forEach(function(e){e.checked=!e.checked})})()">' + __('budgetProgress.invert') + '</button>';
  html += '</div>';
  
  budgeted.forEach(cat => {
    const checked = selected.includes(cat.id);
    const isChild = !!cat.parentId;
    html += '<label style="display:flex;align-items:center;gap:8px;padding:6px 10px;cursor:pointer;border-radius:var(--radius-sm);transition:background 0.15s;margin-bottom:2px' + (isChild ? ';margin-left:24px;font-size:0.85rem' : '') + '" onmouseover="this.style.background=\'var(--bg)\'" onmouseout="this.style.background=\'\'">';
    html += '<input type="checkbox" class="budget-sel-cb" value="' + cat.id + '" ' + (checked ? 'checked' : '') + ' style="width:18px;height:18px;cursor:pointer">';
    html += '<span style="width:10px;height:10px;border-radius:50%;background:' + cat.color + ';display:inline-block"></span>';
    html += '<span>' + (isChild ? '↳ ' : '') + cat.icon + ' ' + cat.name + '</span>';
    html += '</label>';
  });
  
  html += '</div>';
  html += '<div class="modal-actions">';
  html += '<button class="btn btn-ghost" onclick="closeModal()">' + __('budgetProgress.cancel') + '</button>';
  html += '<button class="btn btn-primary" onclick="confirmBudgetSelection(\'' + month + '\')">' + __('budgetProgress.confirm') + '</button>';
  html += '</div>';
  
  showModal(html);
}

function confirmBudgetSelection(month) {
  const cbs = document.querySelectorAll('.budget-sel-cb:checked');
  const ids = Array.from(cbs).map(cb => cb.value);
  if (ids.length === 0) {
    showToast(__('budgetProgress.selectAtLeastOne'), 'warning');
    return;
  }
  if (ids.length === DataStore.getRootCategories().filter(c => {
    const bk = c.id + ':' + month;
    return (DataStore.getAllCategoryBudgets()[bk] || 0) > 0;
  }).length) {
    budgetMonitoredIds = null; // all selected → store null
    localStorage.removeItem('budgetMonitoredIds');
  } else {
    budgetMonitoredIds = ids;
    localStorage.setItem('budgetMonitoredIds', JSON.stringify(ids));
  }
  closeModal();
  refreshBudgetCards(month);
}

function renderBudgetProgressCard(month, showHeader) {
  console.log('[budgetProgress] renderBudgetProgressCard month:', month, 'view:', budgetProgressView, 'sort:', budgetProgressSort);
  const rootCats = DataStore.getRootCategories();
  const catBudgets = DataStore.getAllCategoryBudgets();
  const records = DataStore.getRecords().filter(r => getMonthKey(r.date || r.createdAt) === month);
  
  // Calculate spent per root category
  const catSpent = {};
  records.forEach(r => {
    const rootId = getRootAncestorId(r.categoryId);
    if (rootId) catSpent[rootId] = (catSpent[rootId] || 0) + r.amount;
  });

  // Build rows for categories that HAVE a budget set
  let rows = [];
  rootCats.forEach(cat => {
    const budgetKey = cat.id + ':' + month;
    const rawBudget = catBudgets[budgetKey];
    let budget = 0, budgetType = 'fixed';
    if (typeof rawBudget === 'number') { budget = rawBudget; budgetType = 'fixed'; }
    else if (rawBudget && typeof rawBudget === 'object') { budget = rawBudget.value || 0; budgetType = rawBudget.type || 'fixed'; }
    if (budget <= 0) return; // skip if no budget
    if (budgetMonitoredIds && !budgetMonitoredIds.includes(cat.id)) return;
    const spent = catSpent[cat.id] || 0;
    const pct = Math.min((spent / budget) * 100, 200);
    const children = DataStore.getChildren(cat.id);
    // Get child breakdown for segmented view
    const childData = [];
    children.forEach(child => {
      const childTotal = records.filter(r => r.categoryId === child.id).reduce((s, r) => s + r.amount, 0);
      if (childTotal > 0) childData.push({ cat: child, total: childTotal });
    });
    rows.push({ cat, budget, spent, pct, childData });
    // Also add children with their own budgets for empty-state check
    children.forEach(child => {
      const childKey = child.id + ':' + month;
      const childRaw = catBudgets[childKey];
      let cb = 0;
      if (typeof childRaw === 'number') cb = childRaw;
      else if (childRaw && typeof childRaw === 'object') cb = childRaw.value || 0;
      if (cb > 0) rows.push({ cat: child, budget: cb, spent: 0, pct: 0, childData: [] });
    });
  });

  // Sort (read from window to pick up inline onchange changes)
  const _sort = window.budgetProgressSort || budgetProgressSort;
  if (_sort === 'usage') rows.sort((a, b) => b.pct - a.pct);
  else if (_sort === 'amount') rows.sort((a, b) => b.spent - a.spent);
  else if (_sort === 'name') rows.sort((a, b) => a.cat.name.localeCompare(b.cat.name));

  if (!rows.length) { console.log('[budgetProgress] no budgeted categories for month:', month); return '<div class="card mb-16"><div class="card-title">' + __('budgetProgress.emptyTitle') + '</div><div class="text-sm text-muted" style="padding:12px 0;text-align:center">' + __('budgetProgress.emptyMessage') + '</div></div>'; }

  const totalBudget = rows.reduce((s, r) => s + r.budget, 0);
  const totalSpent = rows.reduce((s, r) => s + r.spent, 0);
  const totalPct = totalBudget > 0 ? (totalSpent / totalBudget * 100) : 0;

  let html = '<div class="card mb-16">';
  html += '<div class="card-title" style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">';
  html += '<span>' + __('budgetProgress.cardTitle') + '</span>';
  // View toggle — single slider-style toggle
  html += '<div id="budgetViewToggle" class="budget-view-toggle' + (budgetProgressView === 'segmented' ? ' segmented' : '') + '" onclick="toggleBudgetView(\'' + month + '\')">';
  html += '<div class="bvt-slider"></div>';
  html += '<span class="bvt-label' + (budgetProgressView === 'solid' ? ' active' : '') + '">' + __('budgetProgress.solidView') + '</span>';
  html += '<span class="bvt-label' + (budgetProgressView === 'segmented' ? ' active' : '') + '">' + __('budgetProgress.segmentedView') + '</span>';
  html += '</div>';
  // Sort dropdown
  html += '<select class="input-field" style="width:auto;font-size:0.72rem;padding:2px 6px" onchange="budgetProgressSort=this.value;localStorage.setItem(\'budgetProgressSort\',this.value);refreshBudgetCards(\'' + month + '\')">';
  const sortOpts = [['usage', __('budgetProgress.sortUsage')], ['amount', __('budgetProgress.sortAmount')], ['name', __('budgetProgress.sortName')]];
  sortOpts.forEach(([v,l]) => html += '<option value="' + v + '" ' + ((window.budgetProgressSort || budgetProgressSort) === v ? 'selected' : '') + '>' + l + '</option>');
  html += '</select>';
  // Select button
  html += '<div class="view-toggle-btn" onclick="showBudgetSelector(\'' + month + '\')" style="font-size:0.7rem" title="' + __('budgetProgress.selectBtnTitle') + '">' + __('budgetProgress.selectBtn') + '</div>';
  html += '</div>'; // end card-title
  // Guide text
  html += '<div style="font-size:0.72rem;color:var(--text-muted);margin-bottom:8px;line-height:1.4;padding:0 2px">' + __('budgetProgress.guideText') + '</div>';
  html += '<div id="budgetProgressInner" style="animation:bpFadeIn 0.25s ease">' + renderBudgetProgressCardInner(month) + '</div>';
  html += '</div>';
  return html;
}

function renderBudgetProgressCardInner(month) {
  console.log('[budgetProgress] renderBudgetProgressCardInner month:', month);
  const rootCats = DataStore.getRootCategories();
  const catBudgets = DataStore.getAllCategoryBudgets();
  const records = DataStore.getRecords().filter(r => getMonthKey(r.date || r.createdAt) === month);
  
  const catSpent = {};
  records.forEach(r => {
    const rootId = getRootAncestorId(r.categoryId);
    if (rootId) catSpent[rootId] = (catSpent[rootId] || 0) + r.amount;
  });

  // Build parent rows only; children with budgets stay grouped under parent
  let rows = [];
  rootCats.forEach(cat => {
    const budgetKey = cat.id + ':' + month;
    const rawBudget = catBudgets[budgetKey];
    let budget = 0, budgetType = 'fixed';
    if (typeof rawBudget === 'number') { budget = rawBudget; budgetType = 'fixed'; }
    else if (rawBudget && typeof rawBudget === 'object') { budget = rawBudget.value || 0; budgetType = rawBudget.type || 'fixed'; }
      if (budgetType === 'percent' && budget > 0) {
        const monthlyBudget = DataStore.getMonthlyIncome(month) || DataStore.getBudget(month);
        budget = monthlyBudget > 0 ? (budget / 100) * monthlyBudget : 0;
      }
    if (budget <= 0) return;
    if (budgetMonitoredIds && !budgetMonitoredIds.includes(cat.id)) return;
    const spent = catSpent[cat.id] || 0;
    const pct = Math.min((spent / budget) * 100, 200);
    const children = DataStore.getChildren(cat.id);
    // Child spending data (for segmented bar)
    const childData = [];
    children.forEach(child => {
      const childTotal = records.filter(r => r.categoryId === child.id).reduce((s, r) => s + r.amount, 0);
      if (childTotal > 0) childData.push({ cat: child, total: childTotal });
    });
    // Children that have their own budgets (shown as separate indented rows under parent)
    const childBudgetRows = [];
    children.forEach(child => {
      const childKey = child.id + ':' + month;
      const childRaw = catBudgets[childKey];
      let childBudget = 0, childType = 'fixed';
      if (typeof childRaw === 'number') { childBudget = childRaw; childType = 'fixed'; }
      else if (childRaw && typeof childRaw === 'object') { childBudget = childRaw.value || 0; childType = childRaw.type || 'fixed'; }
      if (childBudget <= 0) return;
      if (childType === 'percent' && childBudget > 0) {
        const monthlyBudget = DataStore.getMonthlyIncome(month) || DataStore.getBudget(month);
        childBudget = monthlyBudget > 0 ? (childBudget / 100) * monthlyBudget : 0;
      }
      const childSpent = records.filter(r => r.categoryId === child.id).reduce((s, r) => s + r.amount, 0);
      const childPct = Math.min((childSpent / childBudget) * 100, 200);
      childBudgetRows.push({ cat: child, budget: childBudget, spent: childSpent, pct: childPct, parentName: cat.name });
    });
    rows.push({ cat, budget, spent, pct, childData, childBudgetRows });
  });

  // Sort only parent rows — children stay with their parent (read from window to pick up inline onchange)
  const _sort2 = window.budgetProgressSort || budgetProgressSort;
  if (_sort2 === 'usage') rows.sort((a, b) => b.pct - a.pct);
  else if (_sort2 === 'amount') rows.sort((a, b) => b.spent - a.spent);
  else if (_sort2 === 'name') rows.sort((a, b) => a.cat.name.localeCompare(b.cat.name));

  // Total: parent budgets already include child budget share (no double-count)
  const totalBudget = rows.reduce((s, r) => s + r.budget, 0);
  const totalSpent = rows.reduce((s, r) => s + r.spent, 0);
  const totalPct = totalBudget > 0 ? (totalSpent / totalBudget * 100) : 0;

  let html = '';
  rows.forEach(r => {
    // ── Render parent row ──
    const pStatus = r.pct >= 100 ? 'danger' : (r.pct >= 80 ? 'warning' : 'success');
    const pBarColor = r.pct >= 100 ? '#EF4444' : (r.pct >= 80 ? '#F59E0B' : '#10B981');

    html += '<div style="margin-bottom:10px">';
    html += '<div style="display:flex;align-items:center;gap:6px;margin-bottom:4px">';
    html += '<span>' + r.cat.icon + '</span>';
    html += '<span class="font-semibold" style="font-size:0.85rem;flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + r.cat.name + '</span>';
    html += '<span style="font-size:0.78rem;font-weight:600">' + formatMoney(r.spent) + '</span>';
    html += '<span class="text-xs text-muted">/ ' + formatMoney(r.budget) + '</span>';
    html += '<span style="font-size:0.8rem;font-weight:700;color:' + pBarColor + ';width:48px;text-align:right">' + r.pct.toFixed(0) + '%</span>';
    if (r.pct > 100) html += '<span class="badge badge-danger" style="font-size:0.6rem">' + __('budgetProgress.overspent') + '</span>';
    html += '</div>';

    // Progress bar
    if (budgetProgressView === 'solid') {
      html += '<div style="height:8px;background:var(--border);border-radius:4px;overflow:hidden">';
      html += '<div style="height:100%;width:' + Math.min(r.pct, 100) + '%;background:' + pBarColor + ';border-radius:4px;transition:width 0.3s"></div>';
      html += '</div>';
    } else {
      // Segmented bar - show children
      const totalFillPct = Math.min(r.pct, 100);
      html += '<div style="height:8px;background:var(--border);border-radius:4px;overflow:hidden;display:flex;gap:1px">';
      if (r.childData.length > 0) {
        r.childData.forEach((cd, ci) => {
          const segFillRatio = r.spent > 0 ? cd.total / r.spent : 0;
          const segW = segFillRatio * totalFillPct;
          if (segW > 0) {
            const segColor = (cd.cat.color === r.cat.color) ? COLORS[ci % COLORS.length] : cd.cat.color;
            html += '<div style="height:100%;width:' + segW + '%;background:' + segColor + ';border-radius:2px;min-width:4px" title="' + cd.cat.name + ': ' + formatMoney(cd.total) + '"></div>';
          }
        });
        const directSpent = r.spent - r.childData.reduce((s, cd) => s + cd.total, 0);
        if (directSpent > 0.01) {
          const directFillRatio = directSpent / r.spent;
          const directW = directFillRatio * totalFillPct;
          html += '<div style="height:100%;width:' + directW + '%;background:' + pBarColor + ';border-radius:2px;min-width:4px;opacity:0.5" title="直接: ' + formatMoney(directSpent) + '"></div>';
        }
      }
      let filledSum = 0;
      if (r.childData.length > 0) {
        r.childData.forEach(cd => { filledSum += r.spent > 0 ? (cd.total / r.spent) * totalFillPct : 0; });
        const directSpent = r.spent - r.childData.reduce((s, cd) => s + cd.total, 0);
        if (directSpent > 0.01) filledSum += (directSpent / r.spent) * totalFillPct;
      }
      if (filledSum < 100) {
        html += '<div style="flex:1;height:100%;background:var(--border);border-radius:2px"></div>';
      }
      html += '</div>';
      if (r.childData.length > 0) {
        html += '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:3px">';
        r.childData.forEach((cd, ci) => {
          const dotColor = (cd.cat.color === r.cat.color) ? COLORS[ci % COLORS.length] : cd.cat.color;
          html += '<span style="font-size:0.65rem;color:var(--text-muted);display:flex;align-items:center;gap:2px"><span style="width:6px;height:6px;border-radius:50%;background:' + dotColor + ';display:inline-block"></span>' + cd.cat.name + ' ' + formatMoney(cd.total) + '</span>';
        });
        html += '</div>';
      }
    }
    html += '</div>';

    // ── Render child budget rows right after parent ──
    r.childBudgetRows.forEach(cr => {
      const cBarColor = cr.pct >= 100 ? '#EF4444' : (cr.pct >= 80 ? '#F59E0B' : '#10B981');
      html += '<div style="margin-bottom:6px;margin-left:16px">';
      html += '<div style="display:flex;align-items:center;gap:6px;margin-bottom:4px">';
      html += '<span class="text-xs text-muted" style="flex-shrink:0">↳</span>';
      html += '<span>' + cr.cat.icon + '</span>';
      html += '<span class="font-semibold" style="font-size:0.78rem;flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + cr.cat.name + '</span>';
      html += '<span class="text-xs text-muted" style="flex-shrink:0">(' + cr.parentName + ')</span>';
      html += '<span style="font-size:0.78rem;font-weight:600">' + formatMoney(cr.spent) + '</span>';
      html += '<span class="text-xs text-muted">/ ' + formatMoney(cr.budget) + '</span>';
      html += '<span style="font-size:0.8rem;font-weight:700;color:' + cBarColor + ';width:48px;text-align:right">' + cr.pct.toFixed(0) + '%</span>';
      if (cr.pct > 100) html += '<span class="badge badge-danger" style="font-size:0.6rem">' + __('budgetProgress.overspent') + '</span>';
      html += '</div>';
      // Child solid bar
      html += '<div style="height:8px;background:var(--border);border-radius:4px;overflow:hidden">';
      html += '<div style="height:100%;width:' + Math.min(cr.pct, 100) + '%;background:' + cBarColor + ';border-radius:4px;transition:width 0.3s"></div>';
      html += '</div>';
      html += '</div>';
    });
  });

  // Total row
  html += '<div style="border-top:1px solid var(--border);padding-top:8px;margin-top:4px;display:flex;align-items:center;gap:6px">';
  html += '<span class="font-bold" style="font-size:0.85rem;flex:1">' + __('budgetProgress.total') + '</span>';
  html += '<span style="font-size:0.85rem;font-weight:600">' + formatMoney(totalSpent) + '</span>';
  html += '<span class="text-xs text-muted">/ ' + formatMoney(totalBudget) + '</span>';
  html += '<span style="font-size:0.85rem;font-weight:700;color:' + (totalPct >= 100 ? '#EF4444' : (totalPct >= 80 ? '#F59E0B' : '#10B981')) + '">' + totalPct.toFixed(1) + '%</span>';
  html += '</div>';

  console.log('[budgetProgress] rendered', rows.length, 'rows');
  return html;
}

  // i18n translations
  addI18nEntries({
    'budgetProgress.selectTitle': { zh: '选择监控分类', en: 'Select Categories to Monitor' },
    'budgetProgress.selectAll': { zh: '全选', en: 'Select All' },
    'budgetProgress.deselectAll': { zh: '取消全选', en: 'Deselect All' },
    'budgetProgress.invert': { zh: '反选', en: 'Invert Selection' },
    'budgetProgress.cancel': { zh: '取消', en: 'Cancel' },
    'budgetProgress.confirm': { zh: '确认', en: 'Confirm' },
    'budgetProgress.selectAtLeastOne': { zh: '请至少选择一个分类', en: 'Please select at least one category' },
    'budgetProgress.emptyTitle': { zh: '📊 预算进度', en: '📊 Budget Progress' },
    'budgetProgress.emptyMessage': { zh: '暂未设置分类预算，前往「分类」页面设置', en: 'No category budgets set. Go to Categories page to set them.' },
    'budgetProgress.cardTitle': { zh: '📊 预算进度', en: '📊 Budget Progress' },
    'budgetProgress.solidView': { zh: '▬ 单色', en: '▬ Solid' },
    'budgetProgress.segmentedView': { zh: '▣ 分段', en: '▣ Segmented' },
    'budgetProgress.sortUsage': { zh: '按使用率', en: 'By Usage' },
    'budgetProgress.sortAmount': { zh: '按金额', en: 'By Amount' },
    'budgetProgress.sortName': { zh: '按名称', en: 'By Name' },
    'budgetProgress.selectBtn': { zh: '👁️ 选择', en: '👁️ Select' },
    'budgetProgress.selectBtnTitle': { zh: '选择要监控的分类', en: 'Select categories to monitor' },
    'budgetProgress.guideText': { zh: '每个分类的预算使用进度，可点击▬单色/▣分段切换视图，点击👁️选择要关注的分类，下拉菜单调整排序方式。子分类若有独立预算也会显示。', en: 'Budget usage per category. Click ▬Solid/▣Segmented to toggle views, click 👁️ to select categories, use the dropdown to sort. Child categories with their own budgets are also shown.' },
    'budgetProgress.overspent': { zh: '超支', en: 'Overspent' },
    'budgetProgress.total': { zh: '总计', en: 'Total' }
  });

  // === EXPORTS ===
  window.budgetProgressSort = budgetProgressSort;
  window.budgetProgressView = budgetProgressView;
  window.budgetMonitoredIds = budgetMonitoredIds;
  window.loadBudgetMonitored = loadBudgetMonitored;
  window.refreshBudgetCards = refreshBudgetCards;
  window.toggleBudgetView = toggleBudgetView;
  window.showBudgetSelector = showBudgetSelector;
  window.confirmBudgetSelection = confirmBudgetSelection;
  window.renderBudgetProgressCard = renderBudgetProgressCard;
  window.renderBudgetProgressCardInner = renderBudgetProgressCardInner;
})();
