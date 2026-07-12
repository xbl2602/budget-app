/* ============================================================
   🔮 假设分析 — What-If Simulation Page
   ============================================================ */
(function() {
'use strict';

// Global state for this page
let whatIfExpandStates = {};  // { 'wi-expand-{catId}': true/false } — params section
let whatIfCompareExpandStates = {};  // { 'wi-cmp-{catId}': true/false } — compare table

function renderWhatIf() {
  const section = document.getElementById('page-whatif');
  const isRolling = getStatsRange() === 'rolling30';
  const month = getMonthKey(new Date().toISOString());
  const savedParams = DataStore.getWhatIfParams();
  console.log('[WhatIf] render, month:', month, 'savedParams:', savedParams);

  // Log Overview baseline for comparison
  const overviewPredicted = isRolling ? StatsEngine.getPeriodPredictedTotal() : StatsEngine.getPredictedTotal(month);
  const overviewDailyAvg = isRolling ? StatsEngine.getPeriodDailyAverage() : StatsEngine.getDailyAverage(month);
  const overviewMonthTotal = isRolling ? StatsEngine.getPeriodTotal() : StatsEngine.getMonthTotal(month);
  const overviewBillsActual = isRolling ? StatsEngine.getPeriodBillSpending() : StatsEngine.getBillSpendingActual(month);
  const overviewBillsPlanned = DataStore.getBillTotal(month);
  const overviewVariable = isRolling ? StatsEngine.getPeriodVariableSpending() : StatsEngine.getVariableSpending(month);
  console.log('[WhatIf] Overview baseline:', {
    predicted: overviewPredicted,
    dailyAvg: overviewDailyAvg,
    monthTotal: overviewMonthTotal,
    billsActual: overviewBillsActual,
    billsPlanned: overviewBillsPlanned,
    variableSpending: overviewVariable,
    daysPassed: new Date().getDate()
  });

  // Strip legacy fields from old saved params (income/bills/savingsTarget no longer customizable)
  if (savedParams && (savedParams.income !== undefined || savedParams.bills !== undefined || savedParams.savingsTarget !== undefined)) {
    delete savedParams.income;
    delete savedParams.bills;
    delete savedParams.savingsTarget;
    DataStore.setWhatIfParams(savedParams);
  }

  // Clean stale category references (Fix 3)
  if (savedParams && savedParams.categoryAdjustments) {
    const validCatIds = new Set(DataStore.getCategories().map(c => c.id));
    let changed = false;
    Object.keys(savedParams.categoryAdjustments).forEach(catId => {
      if (!validCatIds.has(catId)) {
        delete savedParams.categoryAdjustments[catId];
        changed = true;
      }
    });
    if (changed) DataStore.setWhatIfParams(savedParams);
  }

  let html = `<div class="whatif-container">
    <div class="section-title">🔮 假设分析</div>
    <p class="text-sm text-muted" style="margin-bottom:16px">调整未来消费假设，预测月末结果。当前${isRolling ? '周期' : '月份'}：${isRolling ? periodOpts.label : month}，剩余 ${isRolling ? Math.max(0, periodOpts.daysInPeriod - periodOpts.daysPassed) : Math.max(0, new Date(parseInt(month.split('-')[0]), parseInt(month.split('-')[1]), 0).getDate() - new Date().getDate())} 天</p>
    <div class="whatif-two-col">
      <div class="whatif-left">`;

  const periodOpts = isRolling ? getPeriodDateRange() : null;
  html += renderWhatIfParams(month, savedParams, periodOpts);

  html += `</div>
      <div class="whatif-right">`;

  if (savedParams) {
    const result = SimulationEngine.run(month, savedParams, { period: periodOpts });
    if (result) {
      html += renderWhatIfResults(result);
    } else {
      html += `<div class="whatif-right-empty">🔮 调整参数后点击「生成预测」查看结果</div>`;
    }
  } else {
    html += `<div class="whatif-right-empty">🔮 调整参数后点击「生成预测」查看结果</div>`;
  }

  html += `</div></div></div>`;

  section.innerHTML = html;

  // Attach event listeners after rendering
  attachWhatIfListeners(month);
}

function renderWhatIfParams(month, savedParams, periodOpts) {
  const isRolling = periodOpts && periodOpts.isRolling;
  const allCats = DataStore.getCategories();
  const today = new Date().getDate();
  const daysInMonth = isRolling
    ? periodOpts.daysInPeriod
    : new Date(parseInt(month.split('-')[0]), parseInt(month.split('-')[1]), 0).getDate();
  const daysPassed = isRolling ? periodOpts.daysPassed : today;

  // Get actual spending per category for the period
  const records = isRolling
    ? DataStore.getRecords().filter(r => {
        const d = new Date(r.date || r.createdAt);
        return d >= periodOpts.start && d <= periodOpts.end && !StatsEngine.isBillCategory(r.categoryId);
      })
    : DataStore.getRecords()
        .filter(r => getMonthKey(r.date || r.createdAt) === month && !StatsEngine.isBillCategory(r.categoryId));
  const catActual = {};
  records.forEach(r => {
    catActual[r.categoryId] = (catActual[r.categoryId] || 0) + r.amount;
  });

  // Compute daily avg per category
  const catDailyAvg = {};
  Object.entries(catActual).forEach(([catId, total]) => {
    catDailyAvg[catId] = daysPassed > 0 ? total / daysPassed : 0;
  });

  const adj = savedParams ? savedParams.categoryAdjustments || {} : {};
  const globalAdj = savedParams ? savedParams.globalAdjustment || { mode: null, value: null } : { mode: null, value: null };
  const hypos = savedParams ? savedParams.hypotheticalCategories || [] : [];

  let html = '';

  // === 分类支出调整 ===
  html += `<div class="card mb-16">
    <div class="card-title">🏷️ 分类支出调整</div>
    <p class="text-xs text-muted" style="margin-bottom:8px">调整每个分类在剩余天数的支出方式。点击名称展开子分类。<br>「固定剩余总额」= 剩余天数总共花指定金额；「比趋势± %/天」= 在日均基础上增减。</p>`;

  // Build category tree
  const treeMap = {};
  allCats.forEach(c => treeMap[c.id] = { ...c, children: [] });
  const treeRoots = [];
  allCats.forEach(c => {
    if (!c.parentId) treeRoots.push(treeMap[c.id]);
    else if (treeMap[c.parentId]) treeMap[c.parentId].children.push(treeMap[c.id]);
  });

  // Recursive render: flat structure (no nested bodies to avoid cumulative padding)
  function renderCatNode(node, depth) {
    const expandKey = 'wi-expand-' + node.id;
    const isExpanded = whatIfExpandStates[expandKey] === true;
    const nodeAdj = adj[node.id] || { mode: 'trend', value: null };
    const hasChildren = node.children.length > 0;

    // Compute daily avg: use direct spending or sum of children
    let nodeDailyAvg = catDailyAvg[node.id] || 0;
    if (!nodeDailyAvg && hasChildren) {
      nodeDailyAvg = node.children.reduce((s, c) => s + (catDailyAvg[c.id] || 0), 0);
    }

    // Compute total spent: direct spending or sum of children
    let nodeSpent = catActual[node.id] || 0;
    if (!nodeSpent && hasChildren) {
      nodeSpent = node.children.reduce((s, c) => s + (catActual[c.id] || 0), 0);
    }

    // Check if any ancestor has mode 'zero' → disable this node
    let isDisabled = false;
    let ancestor = node.parentId ? treeMap[node.parentId] : null;
    while (ancestor) {
      const ancAdj = adj[ancestor.id];
      if (ancAdj && ancAdj.mode === 'zero') { isDisabled = true; break; }
      ancestor = ancestor.parentId ? treeMap[ancestor.parentId] : null;
    }

    // Flat indentation: header indents left, control row indents 16px more
    const headerIndent = depth * 24;
    const bodyIndent = headerIndent + 24;

    let out = '';

    // Header row — only for nodes that have children (expand/collapse purpose)
    if (hasChildren) {
      out += `<div class="whatif-cat-root-header" onclick="toggleWhatIfExpand('${node.id}')" style="cursor:pointer;padding-left:${headerIndent + 12}px">
        <span class="whatif-expand-icon">${isExpanded ? '▼' : '▶'}</span>
        <span>${node.icon} ${node.name}</span>
        <span class="text-xs text-muted" style="margin-left:8px">日均 ${formatMoney(nodeDailyAvg)}</span>
        <span class="text-xs text-muted" style="margin-left:auto">已花 ${formatMoney(nodeSpent)}</span>
      </div>`;
    }

    // Controls row — always shown for leaves; for parents only when expanded
    if (!hasChildren || isExpanded) {
      out += `<div class="whatif-cat-row" style="padding-left:${bodyIndent + 12}px">
        <span class="whatif-cat-label">${node.icon} ${node.name}${hasChildren ? '（整体）' : ''}</span>
        <select class="input-field whatif-mode-select" data-cat="${node.id}" data-level="${depth === 0 ? 'root' : 'child'}" ${isDisabled ? 'disabled' : ''}>
          <option value="trend" ${nodeAdj.mode === 'trend' ? 'selected' : ''}>保持趋势</option>
          <option value="daily" ${nodeAdj.mode === 'daily' ? 'selected' : ''}>设日均值</option>
          <option value="total" ${nodeAdj.mode === 'total' ? 'selected' : ''}>固定剩余总额</option>
          <option value="percent" ${nodeAdj.mode === 'percent' ? 'selected' : ''}>比趋势± %</option>
          <option value="adjust" ${nodeAdj.mode === 'adjust' ? 'selected' : ''}>比趋势± RM/天</option>
          <option value="zero" ${nodeAdj.mode === 'zero' ? 'selected' : ''}>取消消费</option>
        </select>
        <input type="number" class="input-field whatif-value-input" data-cat="${node.id}" value="${nodeAdj.value || ''}" min="0" step="0.01" placeholder="值" ${isDisabled || nodeAdj.mode === 'trend' || nodeAdj.mode === 'zero' ? 'style="display:none"' : ''}>
        <span class="text-xs text-muted" style="min-width:60px;text-align:right">日均 ${formatMoney(nodeDailyAvg)}</span>
      </div>`;
    }

    // Children — rendered flat (not nested inside body div)
    if (isExpanded && hasChildren) {
      out += node.children.map(ch => renderCatNode(ch, depth + 1)).join('');
    }

    return out;
  }

  treeRoots.forEach(root => {
    html += `<div class="whatif-cat-root">`;
    html += renderCatNode(root, 0);
    html += `</div>`;
  });

  html += `</div>`; // end card

  // === 全局调整 ===
  html += `<div class="card mb-16">
    <div class="card-title">🌐 全局调整</div>
    <p class="text-xs text-muted" style="margin-bottom:8px">对所有保持趋势的分类统一调整。不覆盖已单独设置的分类。</p>
    <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
      <select class="input-field" id="wi-global-mode" style="width:auto;min-width:120px">
        <option value="" ${!globalAdj.mode ? 'selected' : ''}>无</option>
        <option value="percent" ${globalAdj.mode === 'percent' ? 'selected' : ''}>± %</option>
        <option value="amount" ${globalAdj.mode === 'amount' ? 'selected' : ''}>± RM/天</option>
      </select>
      <input type="number" class="input-field" id="wi-global-value" value="${globalAdj.value || ''}" min="0" step="0.01" placeholder="值" style="width:100px">
      <span class="text-xs text-muted">负值=减少，正值=增加（如 −10% 或 −5）</span>
    </div>
  </div>`;

  // === 添加假设分类 ===
  html += `<div class="card mb-16">
    <div class="card-title">➕ 添加假设分类</div>
    <p class="text-xs text-muted" style="margin-bottom:8px">添加一个当前不存在的新分类来评估其影响。</p>
    <div id="wi-hypo-list">
      ${hypos.map((h, i) => `
        <div class="whatif-hypo-row" data-index="${i}">
          <input type="text" class="input-field wi-hypo-icon" value="${h.icon || ''}" placeholder="图标" style="width:50px">
          <input type="text" class="input-field wi-hypo-name" value="${h.name || ''}" placeholder="分类名" style="flex:1">
          <input type="number" class="input-field wi-hypo-amount" value="${h.amount || ''}" min="0" step="0.01" placeholder="金额" style="width:100px">
          <select class="input-field wi-hypo-type" style="width:auto">
            <option value="daily" ${h.type === 'daily' ? 'selected' : ''}>/天</option>
            <option value="total" ${h.type === 'total' ? 'selected' : ''}>/月</option>
          </select>
          <button class="btn btn-ghost btn-sm" onclick="removeWhatIfHypo(${i})" style="color:var(--danger)">✕</button>
        </div>
      `).join('')}
    </div>
    <button class="btn btn-sm btn-outline mt-8" onclick="addWhatIfHypo()">＋ 添加假设分类</button>
  </div>`;

  // === Action buttons ===
  html += `<div style="display:flex;gap:12px;margin-bottom:24px">
    <button class="btn btn-primary btn-lg" onclick="runWhatIfSimulation()" style="flex:1">🔮 生成预测</button>
    ${savedParams ? '<button class="btn btn-ghost btn-lg" onclick="clearWhatIfSimulation()" style="color:var(--danger)">🗑️ 清除场景</button>' : ''}
  </div>`;

  return html;
}

function renderWhatIfResults(result) {
  if (!result) return '';

  const { 
    income, bills, netDisposable, targetAmount, spendable,
    daysPassed, remainingDays, daysInMonth,
    actualSpent, totalProjected, projectedRemaining, projectedDailyAvg,
    projectedSavings, savingsAttained, hypotheticalTotal,
    trendTotal, trendDailyAvg, trendSavings,
    hypotheticalProjections, categoryProjections
  } = result;

  const savingsDiff = projectedSavings - targetAmount;
  const savingsPct = targetAmount > 0 ? projectedSavings / targetAmount : 0;

  // Adjusted values: base on trend methodology + what-if variable adjustment
  // This ensures zero adjustments => adjusted = trend (apples-to-apples)
  const unpaidBillsAdj = Math.max(0, DataStore.getBillTotal(getMonthKey(new Date().toISOString())) - StatsEngine.getBillSpendingActual(getMonthKey(new Date().toISOString())));
  const varSpentTotal = StatsEngine.getVariableSpending(getMonthKey(new Date().toISOString()));
  const varTrendTotal = daysPassed > 0 ? varSpentTotal / daysPassed * daysInMonth : 0;
  const varAdjustment = totalProjected - varTrendTotal;
  const adjustedTotal = trendTotal + varAdjustment;
  const adjustedDailyAvg = adjustedTotal / daysInMonth;
  const adjustedSavings = income - adjustedTotal - unpaidBillsAdj;
  console.log('[WhatIfResults] adjusted values:', {
    totalProjected, varTrendTotal, varAdjustment,
    trendTotal, adjustedTotal, adjustedDailyAvg,
    adjustedSavings, trendSavings, unpaidBillsAdj
  });
  // Recompute attainment
  const savingsDiffForDisplay = adjustedSavings - targetAmount;
  const savingsAttainedForDisplay = adjustedSavings >= targetAmount;
  const savingsPctForDisplay = targetAmount > 0 ? adjustedSavings / targetAmount : 0;

  let html = `<div>

    <div class="section-title">🔮 预测结果</div>`;

  // === 对比摘要 (with clearer labels) ===
  html += `<div class="card mb-16 whatif-summary-card">
    <div class="card-title">📊 总支出预测</div>
    <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:16px;text-align:center">
      <div>
        <div class="text-xs text-muted">当前趋势 · 预测总支出</div>
        <div class="text-lg font-bold" style="color:var(--text-muted)">${formatMoney(trendTotal)}</div>
        <div class="text-xs ${trendSavings >= 0 ? 'text-success' : 'text-danger'}">可储蓄 ${trendSavings >= 0 ? '+' : ''}${formatMoney(trendSavings)}</div>
      </div>
      <div style="display:flex;flex-direction:column;justify-content:center">
        <div class="text-lg" style="font-size:1.5rem">${adjustedTotal > trendTotal ? '📈' : '📉'}</div>
        <div class="text-sm font-bold" style="color:${adjustedTotal > trendTotal ? 'var(--danger)' : 'var(--success)'}">
          ${Math.abs(adjustedTotal - trendTotal) > 0.01 ? (adjustedTotal > trendTotal ? '+' : '') + formatMoney(adjustedTotal - trendTotal) : '持平'}
        </div>
        <div class="text-xs text-muted">较趋势差额</div>
      </div>
      <div>
        <div class="text-xs text-muted">假设调整后 · 预测总支出</div>
        <div class="text-lg font-bold" style="color:var(--primary)">${formatMoney(adjustedTotal)}</div>
        <div class="text-xs ${adjustedSavings >= 0 ? 'text-success' : 'text-danger'}">可储蓄 ${adjustedSavings >= 0 ? '+' : ''}${formatMoney(adjustedSavings)}</div>
      </div>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:16px;text-align:center;margin-top:12px;padding-top:12px;border-top:1px solid var(--border)">
      <div>
        <div class="text-xs text-muted">日均支出（趋势）</div>
        <div>${formatMoney(trendDailyAvg)}</div>
      </div>
      <div>
        <div class="text-xs text-muted">储蓄目标</div>
        <div>${formatMoney(targetAmount)}</div>
      </div>
      <div>
        <div class="text-xs text-muted">日均支出（假设）</div>
        <div>${formatMoney(adjustedDailyAvg)}</div>
      </div>
    </div>
  </div>`;

  // === 储蓄对比 (horizontal bar, baseline = trend savings) ===
  const baseSavings = trendSavings;
  const diffSavings = adjustedSavings - baseSavings;
  const pctOfBase = baseSavings > 0 ? Math.abs(diffSavings) / baseSavings * 100 : 0;
  const displayPct = Math.min(pctOfBase, 500);
  const fillWidth = baseSavings > 0 ? (displayPct / 200 * 100) : 0;
  const isBetter = diffSavings >= 0;

  html += `<div class="card mb-16">
    <div class="card-title">💰 储蓄对比</div>
    ${baseSavings > 0 ? `
    <div class="savings-row">
      <span class="text-xs text-muted">趋势</span>
      <span class="savings-value">${formatMoney(baseSavings)}</span>
      <span class="savings-arrow">→</span>
      <span class="text-xs text-muted">假设</span>
      <span class="savings-value" style="color:${isBetter ? 'var(--success)' : 'var(--danger)'}">${formatMoney(adjustedSavings)}</span>
      <span class="savings-pct">(${diffSavings >= 0 ? '+' : ''}${pctOfBase.toFixed(1)}%)</span>
    </div>
    <div class="savings-bar-wrapper">
      <div class="savings-bar-track">
        <div class="savings-bar-fill ${isBetter ? 'fill-better' : 'fill-worse'}"
             style="${isBetter ? `left:50%;width:${fillWidth}%` : `right:50%;width:${fillWidth}%`}">
        </div>
        <div class="savings-bar-baseline"></div>
      </div>
      <div class="savings-bar-scale">
        <span>−100%</span>
        <span>基准</span>
        <span>+100%</span>
      </div>
    </div>` : `
    <div class="text-xs text-muted" style="text-align:center;padding:12px">
      ⚠️ 趋势储蓄为 RM 0 或负值，无法计算百分比。
      <div>趋势: ${formatMoney(baseSavings)} → 假设: ${formatMoney(adjustedSavings)}</div>
    </div>`}
    <div class="savings-compare-footer">
      <span class="savings-target">🎯 ${formatMoney(targetAmount)}</span>
      <span class="savings-status" style="color:${savingsAttainedForDisplay ? 'var(--success)' : 'var(--danger)'}">
        ${savingsAttainedForDisplay ? '✅ 达标' : `❌ 还差 ${formatMoney(Math.abs(savingsDiffForDisplay))}`}
      </span>
    </div>
  </div>`;

  // === 支出对比 (ring charts with clearer labels) ===
  html += `<div class="card mb-16">
    <div class="card-title">📊 支出对比</div>
    <p class="text-xs text-muted" style="margin-bottom:12px">总支出占收入比例 — 圆圈越大，花得越多。</p>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px">
      <div style="text-align:center">
        <div class="text-xs text-muted mb-8">当前趋势 · 预测总支出</div>
        <canvas class="whatif-ring" id="wi-ring-trend-wi" width="140" height="140" style="max-width:140px;max-height:140px;width:100%;height:auto"></canvas>
        <div class="text-sm font-bold">${formatMoney(trendTotal)}</div>
        <div class="text-xs text-muted">占收入 ${income > 0 ? ((trendTotal / income) * 100).toFixed(1) : 0}%</div>
      </div>
      <div style="text-align:center">
        <div class="text-xs text-muted mb-8">假设调整 · 预测总支出</div>
        <canvas class="whatif-ring" id="wi-ring-proj-wi" width="140" height="140" style="max-width:140px;max-height:140px;width:100%;height:auto"></canvas>
        <div class="text-sm font-bold">${formatMoney(adjustedTotal)}</div>
        <div class="text-xs text-muted">占收入 ${income > 0 ? ((adjustedTotal / income) * 100).toFixed(1) : 0}%</div>
      </div>
    </div>
  </div>`;

  // === 分类对比表 ===
  html += `<div class="card mb-16">
    <div class="card-title">📋 分类预测明细</div>
    <div class="whatif-compare-table">
      <div class="whatif-compare-header">
        <span>分类</span>
        <span>本月已花</span>
        <span>预测剩余</span>
        <span>预测月末</span>
        <span>较趋势</span>
      </div>`;

  // Build full category projection tree (all nesting levels)
  const allCats = DataStore.getCategories();
  const projMap = categoryProjections || {};
  // Create tree nodes
  const treeNodes = {};
  allCats.forEach(c => {
    treeNodes[c.id] = {
      category: c,
      currentTotal: 0,
      projectedRemaining: 0,
      projectedTotal: 0,
      trendTotal: 0,
      mode: 'trend',
      children: []
    };
  });
  // Fill leaf data from simulation
  Object.values(projMap).forEach(p => {
    const node = treeNodes[p.category.id];
    if (node) {
      node.currentTotal = p.currentTotal || 0;
      node.projectedRemaining = p.projectedRemaining || 0;
      node.projectedTotal = p.projectedTotal || 0;
      node.mode = p.mode || 'trend';
      node.trendTotal = daysPassed > 0 ? (p.currentDailyAvg || 0) * daysInMonth : 0;
    }
  });
  // Build parent-child links
  const rootNodes = [];
  allCats.forEach(c => {
    if (!c.parentId) {
      rootNodes.push(treeNodes[c.id]);
    } else if (treeNodes[c.parentId]) {
      treeNodes[c.parentId].children.push(treeNodes[c.id]);
    }
  });
  // Aggregate non-leaf nodes upward
  function aggregateUp(node) {
    if (node.children.length > 0) {
      node.children.forEach(aggregateUp);
      node.currentTotal = node.children.reduce((s, ch) => s + ch.currentTotal, 0);
      node.projectedRemaining = node.children.reduce((s, ch) => s + ch.projectedRemaining, 0);
      node.projectedTotal = node.currentTotal + node.projectedRemaining;
      node.trendTotal = node.children.reduce((s, ch) => s + ch.trendTotal, 0);
    }
  }
  rootNodes.forEach(aggregateUp);

  // Recursive render of the tree (collapsible, default collapsed)
  function renderTreeNodes(nodes, depth) {
    let out = '';
    nodes.forEach(node => {
      const diff = node.projectedTotal - node.trendTotal;
      const isAdjusted = node.mode !== 'trend' && node.mode !== undefined;
      const hasChildren = node.children.length > 0;
      const cmpKey = 'wi-cmp-' + node.category.id;
      const isExpanded = whatIfCompareExpandStates[cmpKey] === true;

      const label = isAdjusted
        ? `${node.category.icon} ${node.category.name} <span class="text-xs text-muted">(已调整)</span>`
        : `${node.category.icon} ${node.category.name}`;
      out += `<div class="whatif-compare-row ${depth > 0 ? 'whatif-child-row' : ''}">
        <span style="${depth > 0 ? `padding-left:${depth * 20 + 4}px` : ''};font-weight:${depth === 0 ? '700' : '400'}">
          ${hasChildren ? `<span class="whatif-expand-icon" onclick="toggleWhatIfCompareExpand('${node.category.id}')" style="cursor:pointer;margin-right:4px">${isExpanded ? '▼' : '▶'}</span>` : '<span class="whatif-expand-icon" style="visibility:hidden;margin-right:4px">▶</span>'}
          ${label}
        </span>
        <span>${formatMoney(node.currentTotal)}</span>
        <span>${formatMoney(node.projectedRemaining)}</span>
        <span>${formatMoney(node.projectedTotal)}</span>
        <span style="color:${Math.abs(diff) < 0.01 ? 'var(--text-muted)' : (diff > 0 ? 'var(--danger)' : 'var(--success)')}">
          ${Math.abs(diff) < 0.01 ? '—' : (diff > 0 ? '+' : '') + formatMoney(diff)}
        </span>
      </div>`;
      if (hasChildren && isExpanded) {
        out += renderTreeNodes(node.children, depth + 1);
      }
    });
    return out;
  }
  html += renderTreeNodes(rootNodes, 0);

  // Hypothetical categories row
  hypotheticalProjections.forEach(hp => {
    html += `<div class="whatif-compare-row" style="color:var(--primary);font-style:italic">
      <span>${hp.icon} ${hp.name} <span class="text-xs text-muted">(假设)</span></span>
      <span>—</span>
      <span>${formatMoney(hp.projectedRemaining)}</span>
      <span>${formatMoney(hp.projectedRemaining)}</span>
      <span style="color:var(--danger)">+${formatMoney(hp.projectedRemaining)}</span>
    </div>`;
  });

  // Total row
  const trendForGrand = daysPassed > 0 ? (actualSpent / daysPassed) * daysInMonth : 0;
  const grandDiff = totalProjected - trendForGrand;
  html += `<div class="whatif-compare-row whatif-compare-total">
    <span class="font-bold">合计</span>
    <span>${formatMoney(actualSpent)}</span>
    <span>${formatMoney(projectedRemaining)}</span>
    <span class="font-bold">${formatMoney(totalProjected)}</span>
    <span style="color:${Math.abs(grandDiff) < 0.01 ? 'var(--text-muted)' : (grandDiff > 0 ? 'var(--danger)' : 'var(--success)')}">
      ${Math.abs(grandDiff) < 0.01 ? '—' : (grandDiff > 0 ? '+' : '') + formatMoney(grandDiff)}
    </span>
  </div>`;

  html += `</div></div>`;

  // === 明细按钮 ===
  html += `<div style="display:flex;gap:12px;margin-top:8px">
    <button class="btn btn-ghost btn-lg" onclick="runWhatIfSimulation()" style="flex:1">🔄 重新预测</button>
    <button class="btn btn-ghost btn-lg" onclick="clearWhatIfSimulation()" style="color:var(--danger)">🗑️ 清除场景</button>
  </div>`;

  // Draw rings after render
  setTimeout(() => drawWhatIfRings(result), 50);

  return html;
}

// Draw the comparison rings
function drawWhatIfRings(result) {
  const { income, trendTotal, totalProjected, daysPassed, daysInMonth } = result;
  const month = getMonthKey(new Date().toISOString());
  const varSpentTotal = StatsEngine.getVariableSpending(month);
  const varTrendTotal = daysPassed > 0 ? varSpentTotal / daysPassed * daysInMonth : 0;
  const varAdjustment = (totalProjected || 0) - varTrendTotal;
  const adjustedTotal = trendTotal + varAdjustment;

  // Trend budget ring
  const trendCanvas = document.getElementById('wi-ring-trend-wi');
  if (trendCanvas && income > 0) {
    const pct = Math.min(trendTotal / income, 1);
    drawSimpleRing(trendCanvas, pct, '#6366F1', '#e5e7eb');
  }

  // Projected budget ring
  const projCanvas = document.getElementById('wi-ring-proj-wi');
  if (projCanvas && income > 0) {
    const pct = Math.min(adjustedTotal / income, 1);
    drawSimpleRing(projCanvas, pct, '#10B981', '#e5e7eb');
  }

  // Trend savings — no longer drawn as ring, handled by horizontal bar in renderWhatIfResults
}

// Helper to draw a simple ring (named differently to avoid collision with existing drawRing)
function drawSimpleRing(canvas, percent, fillColor, bgColor) {
  const ctx = canvas.getContext('2d');
  const rect = canvas.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  const cssW = rect.width || canvas.width;
  const cssH = rect.height || canvas.height;
  const bw = Math.round(cssW * dpr);
  const bh = Math.round(cssH * dpr);
  if (canvas.width !== bw || canvas.height !== bh) {
    canvas.width = bw;
    canvas.height = bh;
  }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const cx = cssW / 2, cy = cssH / 2;
  const r = Math.min(cx, cy) - 8;
  const lineWidth = 12;

  // Read theme-aware colors from CSS
  const styles = getComputedStyle(document.documentElement);
  const themeBorder = styles.getPropertyValue('--border').trim() || '#e5e7eb';
  const themePrimary = styles.getPropertyValue('--primary').trim() || '#6366F1';
  const themeSuccess = styles.getPropertyValue('--success').trim() || '#10B981';
  const themeText = styles.getPropertyValue('--text-primary').trim() || '#1E293B';

  ctx.clearRect(0, 0, cssW, cssH);
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.strokeStyle = bgColor || themeBorder;
  ctx.lineWidth = lineWidth;
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(cx, cy, r, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.min(percent, 1));
  ctx.strokeStyle = fillColor || (percent > 0.5 ? themePrimary : themeSuccess);
  ctx.lineWidth = lineWidth;
  ctx.lineCap = 'round';
  ctx.stroke();

  ctx.fillStyle = themeText;
  ctx.font = 'bold 14px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText((percent * 100).toFixed(0) + '%', cx, cy);
}

/* ============================================================
   What-If Event Handlers
   ============================================================ */

function toggleWhatIfExpand(rootId) {
  const key = 'wi-expand-' + rootId;
  whatIfExpandStates[key] = !whatIfExpandStates[key];
  renderWhatIf();
}

function toggleWhatIfCompareExpand(catId) {
  const key = 'wi-cmp-' + catId;
  whatIfCompareExpandStates[key] = !whatIfCompareExpandStates[key];
  // Re-render only the results section (params stay intact)
  const month = getMonthKey(new Date().toISOString());
  const isRolling = getStatsRange() === 'rolling30';
  const periodOpts = isRolling ? getPeriodDateRange() : null;
  const savedParams = DataStore.getWhatIfParams();
  const result = savedParams ? SimulationEngine.run(month, savedParams, { period: periodOpts }) : null;
  const rightEl = document.querySelector('#page-whatif .whatif-right');
  if (result && rightEl) {
    rightEl.innerHTML = renderWhatIfResults(result);
  }
}

function whatifModeChange(selectEl) {
  const valInput = selectEl.parentElement.querySelector('.whatif-value-input');
  if (valInput) {
    valInput.style.display = (selectEl.value === 'trend' || selectEl.value === 'zero') ? 'none' : '';
  }

  // Cascade "zero" — disable all subsequent descendant selects in the same root
  if (selectEl.value === 'zero') {
    const root = selectEl.closest('.whatif-cat-root');
    if (root) {
      let foundSelf = false;
      root.querySelectorAll('.whatif-mode-select').forEach(s => {
        if (s === selectEl) { foundSelf = true; return; }
        if (foundSelf) {
          s.value = 'zero';
          s.disabled = true;
          const vi = s.parentElement.querySelector('.whatif-value-input');
          if (vi) vi.style.display = 'none';
        }
      });
    }
  }

  // Auto-save (re-render will set correct disabled states based on adj)
  runWhatIfSimulation();
}

function addWhatIfHypo() {
  const list = document.getElementById('wi-hypo-list');
  const idx = list ? list.children.length : 0;
  const div = document.createElement('div');
  div.className = 'whatif-hypo-row';
  div.dataset.index = idx;
  div.innerHTML = `
    <input type="text" class="input-field wi-hypo-icon" placeholder="图标" style="width:50px">
    <input type="text" class="input-field wi-hypo-name" placeholder="分类名" style="flex:1">
    <input type="number" class="input-field wi-hypo-amount" min="0" step="0.01" placeholder="金额" style="width:100px">
    <select class="input-field wi-hypo-type" style="width:auto">
      <option value="daily">/天</option>
      <option value="total">/月</option>
    </select>
    <button class="btn btn-ghost btn-sm" onclick="removeWhatIfHypo(${idx})" style="color:var(--danger)">✕</button>
  `;
  if (list) {
    list.appendChild(div);
    // Bind change events on the new inputs so they auto-save
    div.querySelectorAll('.wi-hypo-icon, .wi-hypo-name, .wi-hypo-amount, .wi-hypo-type').forEach(inp => {
      inp.addEventListener('change', runWhatIfSimulation);
    });
  }
}

function removeWhatIfHypo(index) {
  const list = document.getElementById('wi-hypo-list');
  if (list && list.children[index]) {
    list.removeChild(list.children[index]);
    // Re-index remaining
    Array.from(list.children).forEach((el, i) => {
      el.dataset.index = i;
      const btn = el.querySelector('button');
      if (btn) btn.onclick = () => removeWhatIfHypo(i);
    });
    runWhatIfSimulation();
  }
}

function collectWhatIfParams() {
  // Category adjustments
  const categoryAdjustments = {};
  document.querySelectorAll('.whatif-mode-select').forEach(sel => {
    if (sel.disabled) return;
    const catId = sel.dataset.cat;
    const mode = sel.value;
    const valInput = sel.parentElement.querySelector('.whatif-value-input');
    const value = valInput ? parseFloat(valInput.value) || null : null;
    if (mode !== 'trend' || value !== null) {
      categoryAdjustments[catId] = { mode, value };
    }
  });

  // Global adjustment
  const globalMode = document.getElementById('wi-global-mode')?.value || '';
  const globalValue = parseFloat(document.getElementById('wi-global-value')?.value) || null;
  const globalAdjustment = globalMode ? { mode: globalMode, value: globalValue } : { mode: null, value: null };

  // Hypothetical categories
  const hypotheticalCategories = [];
  document.querySelectorAll('.whatif-hypo-row').forEach(row => {
    const icon = row.querySelector('.wi-hypo-icon')?.value || '';
    const name = row.querySelector('.wi-hypo-name')?.value || '';
    const amount = parseFloat(row.querySelector('.wi-hypo-amount')?.value) || 0;
    const type = row.querySelector('.wi-hypo-type')?.value || 'daily';
    if (name) {
      hypotheticalCategories.push({ icon, name, amount, type });
    }
  });

  return {
    categoryAdjustments: categoryAdjustments,
    globalAdjustment: globalAdjustment,
    hypotheticalCategories: hypotheticalCategories
  };
}

function runWhatIfSimulation() {
  const params = collectWhatIfParams();
  DataStore.setWhatIfParams(params);
  renderWhatIf();
}

function clearWhatIfSimulation() {
  DataStore.clearWhatIfParams();
  renderWhatIf();
}

function attachWhatIfListeners(month) {
  // Mode selectors: toggle value inputs + auto-save
  document.querySelectorAll('.whatif-mode-select').forEach(sel => {
    sel.addEventListener('change', function() {
      whatifModeChange(this);
    });
  });

  // Value inputs: auto-save on change
  document.querySelectorAll('.whatif-value-input').forEach(inp => {
    inp.addEventListener('change', runWhatIfSimulation);
  });

  // Global adjustment: auto-save on change
  document.getElementById('wi-global-mode')?.addEventListener('change', runWhatIfSimulation);
  document.getElementById('wi-global-value')?.addEventListener('change', runWhatIfSimulation);

  // Hypothetical category inputs (rendered from saved params)
  document.querySelectorAll('.wi-hypo-icon, .wi-hypo-name, .wi-hypo-amount, .wi-hypo-type').forEach(inp => {
    inp.addEventListener('change', runWhatIfSimulation);
  });
}

  // === EXPORTS ===
  window.whatIfExpandStates = whatIfExpandStates;
  window.whatIfCompareExpandStates = whatIfCompareExpandStates;
  window.renderWhatIf = renderWhatIf;
  window.renderWhatIfParams = renderWhatIfParams;
  window.renderWhatIfResults = renderWhatIfResults;
  window.drawWhatIfRings = drawWhatIfRings;
  window.drawSimpleRing = drawSimpleRing;
  window.toggleWhatIfExpand = toggleWhatIfExpand;
  window.toggleWhatIfCompareExpand = toggleWhatIfCompareExpand;
  window.whatifModeChange = whatifModeChange;
  window.addWhatIfHypo = addWhatIfHypo;
  window.removeWhatIfHypo = removeWhatIfHypo;
  window.collectWhatIfParams = collectWhatIfParams;
  window.runWhatIfSimulation = runWhatIfSimulation;
  window.clearWhatIfSimulation = clearWhatIfSimulation;
  window.attachWhatIfListeners = attachWhatIfListeners;
})();
