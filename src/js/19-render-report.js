/* ============================================================
   RENDER: Report Page
   ============================================================ */
(function() {
'use strict';
let reportMonth = '';

function renderReport() {
  const el = document.getElementById('page-report');
  const now = new Date();
  reportMonth = reportMonth || getMonthKey(now.toISOString());
  const month = reportMonth;

  const monthTotal = StatsEngine.getMonthTotal(month);
  const budget = DataStore.getMonthlyIncome(month) || DataStore.getBudget(month);
  const savingsTarget = DataStore.getSavingsTarget();
  const dailyTotals = StatsEngine.getDailyTotals(month);
  const catTotals = StatsEngine.getCategoryTotals(month);

  // Savings target amount
  const percentBase = DataStore.getPercentBase();
  const totalBills = DataStore.getBillTotal(month);
  const paidBillsRep = StatsEngine.getBillSpendingActual(month);
  const unpaidPlannedBillsRep = Math.max(0, totalBills - paidBillsRep);
  const netDisposable = Math.max(0, budget - totalBills);
  const baseAmount = percentBase === 'net' ? netDisposable : budget;
  const targetAmount = (() => {
    const t = savingsTarget;
    if (t.type === 'fixed') return t.fixedAmount || 0;
    if (t.type === 'percent') return baseAmount * (t.percent || 0) / 100;
    return 0;
  })();
  const spendableBudget = Math.max(0, netDisposable - targetAmount);
  const variableSpending = StatsEngine.getVariableSpending(month);
  const actualSavings = Math.max(0, budget - (monthTotal + unpaidPlannedBillsRep));
  const savingsRate = budget > 0 ? (actualSavings / budget * 100) : 0;
  const predicted = StatsEngine.getPredictedTotal(month);
  const savingsPred = StatsEngine.getSavingsPrediction(month) - unpaidPlannedBillsRep;

  // Aggregate to root categories for table
  const rootTotals = {};
  Object.entries(catTotals).forEach(([id, total]) => {
    const rootId = getRootAncestorId(id);
    if (rootId) rootTotals[rootId] = (rootTotals[rootId] || 0) + total;
  });
  const rootCats = DataStore.getRootCategories();
  const catTableRows = rootCats.map(c => {
    const spent = rootTotals[c.id] || 0;
    const catBudget = DataStore.getCategoryBudget(c.id, month).value || 0;
    const remaining = catBudget > 0 ? catBudget - spent : 0;
    const pct = catBudget > 0 ? (spent / catBudget * 100) : 0;
    const status = catBudget > 0 ? (spent <= catBudget ? '✅ 预算内' : '⚠️ 超支') : '—';
    return { cat: c, spent, catBudget, remaining, pct, status };
  }).sort((a,b) => b.spent - a.spent);

  // TOP 5
  const top5 = [...catTableRows].filter(r => r.spent > 0).slice(0, 5);

  const parts = month.split('-');
  const year = parts[0], mon = parts[1];

  el.innerHTML = `
    <div class="report-container">
      <!-- Header -->
      <div class="card mb-16 report-header-buttons">
        <div class="flex items-center gap-12" style="flex-wrap:wrap">
          <div class="flex items-center gap-8">
            <label class="text-sm text-secondary">选择月份</label>
            <input type="month" id="reportMonthInput" class="input-field" style="width:160px" value="${month}" onchange="changeReportMonth(this.value)">
          </div>
          <button class="btn btn-outline" onclick="printReport()">🖨️ 打印报告</button>
        </div>
      </div>

      <!-- Summary row -->
      <div class="grid-4 mb-16">
        <div class="card" style="text-align:center">
          <div class="card-title">月收入</div>
          <div class="text-xl font-bold" style="color:var(--primary)">${budget ? formatMoney(budget) : '未设置'}</div>
          ${totalBills > 0 ? `<div class="text-xs text-muted">净收入 ${formatMoney(Math.max(0, budget - totalBills))}</div>` : ''}
        </div>
        <div class="card" style="text-align:center">
          <div class="card-title">总支出</div>
          <div class="text-xl font-bold" style="color:${monthTotal <= spendableBudget ? 'var(--success)' : 'var(--danger)'}">${formatMoney(monthTotal)}</div>
          ${(() => {
            const billActual = StatsEngine.getBillSpendingActual(month);
            if (billActual > 0) {
              const varSpend = monthTotal - billActual;
              return `<div class="text-xs text-muted mt-4">日常 ${formatMoney(varSpend)} · 账单 ${formatMoney(billActual)}</div>`;
            }
            return '';
          })()}
        </div>
        <div class="card" style="text-align:center">
          <div class="card-title">储蓄</div>
          <div class="text-xl font-bold" style="color:${actualSavings >= 0 ? 'var(--success)' : 'var(--danger)'}">${formatMoney(actualSavings)}</div>
        </div>
        <div class="card" style="text-align:center">
          <div class="card-title">储蓄率</div>
          <div class="text-xl font-bold" style="color:${savingsRate >= 20 ? 'var(--success)' : (savingsRate > 0 ? 'var(--warning)' : 'var(--danger)')}">${savingsRate.toFixed(1)}%</div>
        </div>
      </div>

      <!-- Budget & Savings rings -->
      <div class="grid-2 mb-16">
        <div class="card" style="text-align:center">
          <div class="card-title">收支进度</div>
          <canvas id="reportBudgetRing" width="160" height="160" style="max-width:160px;margin:8px auto"></canvas>
          <div class="text-sm text-secondary">
            ${budget > 0 ? formatMoney(monthTotal) + ' / ' + formatMoney(budget) : '未设置月收入'}
            ${totalBills > 0 ? `<div class="text-xs text-muted mt-4">净收入 ${formatMoney(netDisposable)} · 日常可用 ${formatMoney(spendableBudget)}</div>` : ''}
          </div>
        </div>
        <div class="card" style="text-align:center">
          <div class="card-title">预计储蓄/储蓄目标</div>
          <canvas id="reportSavingsRing" width="160" height="160" style="max-width:160px;margin:8px auto"></canvas>
          <div class="text-sm text-secondary">
            ${targetAmount > 0 ? formatMoney(savingsPred) + ' / ' + formatMoney(targetAmount) : '未设置目标'}
          </div>
        </div>
      </div>

      <!-- Category breakdown table -->
      <div class="card mb-16">
        <div class="card-title">分类支出明细</div>
        <div style="overflow-x:auto">
          <table style="width:100%;border-collapse:collapse;font-size:0.85rem">
            <thead>
              <tr style="border-bottom:2px solid var(--border);color:var(--text-secondary);font-size:0.78rem">
                <th style="text-align:left;padding:8px 4px">分类</th>
                <th style="text-align:right;padding:8px 4px">预算 (RM)</th>
                <th style="text-align:right;padding:8px 4px">支出 (RM)</th>
                <th style="text-align:right;padding:8px 4px">占比</th>
                <th style="text-align:right;padding:8px 4px">剩余 (RM)</th>
                <th style="text-align:center;padding:8px 4px">状态</th>
              </tr>
            </thead>
            <tbody>
              ${catTableRows.map(r => {
                const bgColor = r.spent > 0 ? (r.catBudget > 0 && r.spent > r.catBudget ? '#FFF5F5' : '') : '';
                return `
                <tr style="border-bottom:1px solid var(--border);background:${bgColor}">
                  <td style="padding:8px 4px">${escHtml(r.cat.icon)} ${escHtml(r.cat.name)}</td>
                  <td style="text-align:right;padding:8px 4px">${r.catBudget > 0 ? formatMoney(r.catBudget) : '—'}</td>
                  <td style="text-align:right;padding:8px 4px;font-weight:600">${r.spent > 0 ? formatMoney(r.spent) : '—'}</td>
                  <td style="text-align:right;padding:8px 4px">${monthTotal > 0 ? (r.spent/monthTotal*100).toFixed(1) + '%' : '—'}</td>
                  <td style="text-align:right;padding:8px 4px;color:${r.catBudget > 0 ? (r.remaining >= 0 ? 'var(--success)' : 'var(--danger)') : 'var(--text-muted)'}">${r.catBudget > 0 ? (r.remaining >= 0 ? formatMoney(r.remaining) : '-' + formatMoney(Math.abs(r.remaining))) : '—'}</td>
                  <td style="text-align:center;padding:8px 4px;font-size:0.78rem">${r.status}</td>
                </tr>`;
              }).join('')}
            </tbody>
            <tfoot>
              <tr style="border-top:2px solid var(--border);font-weight:700">
                <td style="padding:8px 4px">合计</td>
                <td style="text-align:right;padding:8px 4px">${budget > 0 ? formatMoney(budget) : '—'}</td>
                <td style="text-align:right;padding:8px 4px;color:var(--primary)">${formatMoney(monthTotal)}</td>
                <td style="text-align:right;padding:8px 4px">100%</td>
                <td style="text-align:right;padding:8px 4px;color:${budget - monthTotal >= 0 ? 'var(--success)' : 'var(--danger)'}">${formatMoney(budget - monthTotal)}</td>
                <td style="text-align:center;padding:8px 4px">${budget > 0 ? (monthTotal <= budget ? '✅' : '⚠️') : '—'}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      <!-- Daily trend sparkline -->
      <div class="card mb-16">
        <div class="card-title">每日消费趋势 (${year}年${mon}月)</div>
        <canvas id="reportSparkline" width="600" height="160" style="width:100%;height:80px"></canvas>
      </div>

      <!-- TOP 5 spending -->
      <div class="card mb-16">
        <div class="card-title">支出排行 TOP 5</div>
        ${top5.length > 0 ? top5.map((r, i) => `
          <div class="flex items-center justify-between" style="padding:6px 0;border-bottom:1px solid var(--border)">
            <div class="flex items-center gap-8">
              <span style="width:20px;height:20px;border-radius:50%;background:${r.cat.color};display:flex;align-items:center;justify-content:center;font-size:0.65rem;color:white;font-weight:700">${i+1}</span>
              <span>${escHtml(r.cat.icon)}</span>
              <span class="font-semibold">${escHtml(r.cat.name)}</span>
            </div>
            <span class="font-bold" style="color:var(--primary)">${formatMoney(r.spent)}</span>
          </div>
        `).join('') : '<div class="text-sm text-muted">暂无支出</div>'}
      </div>

      <!-- Savings prediction summary -->
      <div class="card mb-16" style="border-left:4px solid ${savingsPred >= 0 ? 'var(--success)' : 'var(--danger)'}">
        <div class="card-title">💰 储蓄预测总结</div>
        <div class="text-sm" style="line-height:1.8">
          ${budget > 0 ? `
            <p>📅 ${year}年${mon}月收入为 <strong>${formatMoney(budget)}</strong>。${totalBills > 0 ? `账单合计 <strong>${formatMoney(totalBills)}</strong>，净收入 <strong>${formatMoney(netDisposable)}</strong>。` : ''}</p>
            ${targetAmount > 0 ? `<p>🎯 储蓄目标 <strong>${formatMoney(targetAmount)}</strong>，日常可用 <strong>${formatMoney(spendableBudget)}</strong>。</p>` : ''}
            <p>📊 本月至今已消费 <strong>${formatMoney(monthTotal)}</strong>，日均 ${dailyTotals.length > 0 ? formatMoney(monthTotal / Math.max(1, dailyTotals.filter(d => d.total > 0).length)) : 0}。</p>
            <p>${savingsPred >= 0
              ? `📈 如果维持当前消费习惯，预计月末可存 <strong style="color:var(--success)">${formatMoney(savingsPred)}</strong>。`
              : `⚠️ 按当前趋势预计超支 <strong style="color:var(--danger)">${formatMoney(Math.abs(savingsPred))}</strong>，建议控制支出。`}
            </p>
          ` : '<p>💡 在「月账单中心」设定月收入，在「设置」设定储蓄目标后可查看完整预测。</p>'}
        </div>
      </div>
    </div>
  `;

  // Draw rings and sparkline
  setTimeout(() => {
    const budgetPct = spendableBudget > 0 ? (monthTotal / spendableBudget) : (budget > 0 ? monthTotal / budget : 0);
    drawRing('reportBudgetRing', Math.min(budgetPct, 1), budgetPct > 1 ? '#EF4444' : '#6366F1',
      (budgetPct * 100).toFixed(0) + '%', '#EF4444');
    const savingsPct = targetAmount > 0 ? Math.min(savingsPred / targetAmount, 1) : 0;
    drawRing('reportSavingsRing', savingsPct, savingsPct >= 1 ? '#10B981' : (savingsPct > 0 ? '#F59E0B' : '#94A3B8'),
      (savingsPct * 100).toFixed(0) + '%');
    drawSparkline('reportSparkline', dailyTotals.map(d => ({ total: d.total, day: d.day })));
  }, 50);
}

function changeReportMonth(month) {
  reportMonth = month;
  renderReport();
}

function printReport() {
  // Navigate to report page first, then print
  navigateTo('report');
  setTimeout(() => { window.print(); }, 100);
}

  // === EXPORTS ===
  window.reportMonth = reportMonth;
  window.renderReport = renderReport;
  window.changeReportMonth = changeReportMonth;
  window.printReport = printReport;
})();
