/* ============================================================
   RENDER: Report Page
   ============================================================ */
(function() {
'use strict';
let reportMonth = '';

function renderReport() {
  const el = document.getElementById('page-report');
  const now = new Date();
  const isRolling = getStatsRange() === 'rolling30';
  if (!reportMonth) {
    if (isRolling) {
      const { start, end, label } = getPeriodDateRange();
      reportMonth = label; // Use label as pseudo month identifier
    } else {
      reportMonth = getMonthKey(now.toISOString());
    }
  }
  const month = reportMonth;
  const periodRange = isRolling ? getPeriodDateRange() : null;

  const monthTotal = isRolling ? StatsEngine.getPeriodTotal() : StatsEngine.getMonthTotal(month);
  const budget = DataStore.getMonthlyIncome(month) || DataStore.getBudget(month);
  const savingsTarget = DataStore.getSavingsTarget();
  const dailyTotals = isRolling ? StatsEngine.getPeriodDailyTotals({ excludeBills: false }) : StatsEngine.getDailyTotals(month);
  const catTotals = isRolling ? StatsEngine.getPeriodCategoryTotals() : StatsEngine.getCategoryTotals(month);

  // Savings target amount
  const percentBase = DataStore.getPercentBase();
  const totalBills = DataStore.getBillTotal(month);
  const paidBillsRep = isRolling ? StatsEngine.getPeriodBillSpending() : StatsEngine.getBillSpendingActual(month);
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
  const variableSpending = isRolling ? StatsEngine.getPeriodVariableSpending() : StatsEngine.getVariableSpending(month);
  const actualSavings = Math.max(0, budget - (monthTotal + unpaidPlannedBillsRep));
  const savingsRate = budget > 0 ? (actualSavings / budget * 100) : 0;
  const predicted = isRolling ? StatsEngine.getPeriodPredictedTotal() : StatsEngine.getPredictedTotal(month);
  const savingsPred = isRolling ? (budget - monthTotal) : (StatsEngine.getSavingsPrediction(month) - unpaidPlannedBillsRep);

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
    const status = catBudget > 0 ? (spent <= catBudget ? __('report.withinBudget') : __('report.overspent')) : __('report.dash');
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
          <label class="text-sm text-secondary">${isRolling ? __('report.selectPeriod') : __('report.selectMonth')}</label>
          <input type="month" id="reportMonthInput" class="input-field" style="width:160px" value="${isRolling ? month : month}" onchange="changeReportMonth(this.value)">
          </div>
          <button class="btn btn-outline" onclick="printReport()">${__('report.printReport')}</button>
        </div>
      </div>

      <!-- Summary row -->
      <div class="grid-4 mb-16">
        <div class="card" style="text-align:center">
          <div class="card-title">${__('report.monthlyIncome')}</div>
          <div class="text-xl font-bold" style="color:var(--primary)">${budget ? formatMoney(budget) : __('report.notSet')}</div>
          ${totalBills > 0 ? `<div class="text-xs text-muted">${__('report.netIncome')} ${formatMoney(Math.max(0, budget - totalBills))}</div>` : ''}
        </div>
        <div class="card" style="text-align:center">
          <div class="card-title">${__('report.totalExpenditure')}</div>
          <div class="text-xl font-bold" style="color:${monthTotal <= spendableBudget ? 'var(--success)' : 'var(--danger)'}">${formatMoney(monthTotal)}</div>
          ${(() => {
            const billActual = StatsEngine.getBillSpendingActual(month);
            if (billActual > 0) {
              const varSpend = monthTotal - billActual;
              return `<div class="text-xs text-muted mt-4">${__('report.daily')} ${formatMoney(varSpend)} · ${__('report.bills')} ${formatMoney(billActual)}</div>`;
            }
            return '';
          })()}
        </div>
        <div class="card" style="text-align:center">
          <div class="card-title">${__('report.savings')}</div>
          <div class="text-xl font-bold" style="color:${actualSavings >= 0 ? 'var(--success)' : 'var(--danger)'}">${formatMoney(actualSavings)}</div>
        </div>
        <div class="card" style="text-align:center">
          <div class="card-title">${__('report.savingsRate')}</div>
          <div class="text-xl font-bold" style="color:${savingsRate >= 20 ? 'var(--success)' : (savingsRate > 0 ? 'var(--warning)' : 'var(--danger)')}">${savingsRate.toFixed(1)}%</div>
        </div>
      </div>

      <!-- Budget & Savings rings -->
      <div class="grid-2 mb-16">
        <div class="card" style="text-align:center">
          <div class="card-title">${__('report.incomeExpenseProgress')}</div>
          <canvas id="reportBudgetRing" width="160" height="160" style="max-width:160px;margin:8px auto"></canvas>
          <div class="text-sm text-secondary">
            ${budget > 0 ? formatMoney(monthTotal) + ' / ' + formatMoney(budget) : __('report.notSetIncome')}
            ${totalBills > 0 ? `<div class="text-xs text-muted mt-4">${__('report.netIncome')} ${formatMoney(netDisposable)} · ${__('report.dailySpendable')} ${formatMoney(spendableBudget)}</div>` : ''}
          </div>
        </div>
        <div class="card" style="text-align:center">
          <div class="card-title">${__('report.savingsProgressTitle')}</div>
          <canvas id="reportSavingsRing" width="160" height="160" style="max-width:160px;margin:8px auto"></canvas>
          <div class="text-sm text-secondary">
            ${targetAmount > 0 ? formatMoney(savingsPred) + ' / ' + formatMoney(targetAmount) : __('report.notSetTarget')}
          </div>
        </div>
      </div>

      <!-- Category breakdown table -->
      <div class="card mb-16">
        <div class="card-title">${__('report.categoryBreakdown')}</div>
        <div style="overflow-x:auto">
          <table style="width:100%;border-collapse:collapse;font-size:0.85rem">
            <thead>
              <tr style="border-bottom:2px solid var(--border);color:var(--text-secondary);font-size:0.78rem">
                <th style="text-align:left;padding:8px 4px">${__('report.category')}</th>
                <th style="text-align:right;padding:8px 4px">${__('report.budget')}</th>
                <th style="text-align:right;padding:8px 4px">${__('report.expense')}</th>
                <th style="text-align:right;padding:8px 4px">${__('report.percentage')}</th>
                <th style="text-align:right;padding:8px 4px">${__('report.remaining')}</th>
                <th style="text-align:center;padding:8px 4px">${__('report.status')}</th>
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
                <td style="padding:8px 4px">${__('report.total')}</td>
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
        <div class="card-title">${isRolling ? __('report.dailyTrend') + ' (' + periodRange.label + ')' : __('report.dailyTrend') + ' (' + __('report.yearMonth', year, mon) + ')'}</div>
        <canvas id="reportSparkline" width="600" height="160" style="width:100%;height:80px"></canvas>
      </div>

      <!-- TOP 5 spending -->
      <div class="card mb-16">
        <div class="card-title">${__('report.top5')}</div>
        ${top5.length > 0 ? top5.map((r, i) => `
          <div class="flex items-center justify-between" style="padding:6px 0;border-bottom:1px solid var(--border)">
            <div class="flex items-center gap-8">
              <span style="width:20px;height:20px;border-radius:50%;background:${r.cat.color};display:flex;align-items:center;justify-content:center;font-size:0.65rem;color:white;font-weight:700">${i+1}</span>
              <span>${escHtml(r.cat.icon)}</span>
              <span class="font-semibold">${escHtml(r.cat.name)}</span>
            </div>
            <span class="font-bold" style="color:var(--primary)">${formatMoney(r.spent)}</span>
          </div>
        `).join('') : '<div class="text-sm text-muted">' + __('report.noExpenses') + '</div>'}
      </div>

      <!-- Savings prediction summary -->
      <div class="card mb-16" style="border-left:4px solid ${savingsPred >= 0 ? 'var(--success)' : 'var(--danger)'}">
        <div class="card-title">${__('report.savingsSummary')}</div>
        <div class="text-sm" style="line-height:1.8">
          ${budget > 0 ? `
            <p>${__('report.predictionIncome', year, mon, formatMoney(budget))}${totalBills > 0 ? ' ' + __('report.predictionBillsDetail', formatMoney(totalBills), formatMoney(netDisposable)) : ''}</p>
            ${targetAmount > 0 ? `<p>${__('report.predictionSavingsTarget', formatMoney(targetAmount), formatMoney(spendableBudget))}</p>` : ''}
            <p>${__('report.predictionSpentSoFar', formatMoney(monthTotal), dailyTotals.length > 0 ? formatMoney(monthTotal / Math.max(1, dailyTotals.filter(d => d.total > 0).length)) : 0)}</p>
            <p>${savingsPred >= 0
              ? __('report.predictionPositive', formatMoney(savingsPred))
              : __('report.predictionNegative', formatMoney(Math.abs(savingsPred)))}
            </p>
          ` : '<p>' + __('report.predictionSetupHint') + '</p>'}
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

  // === I18N ENTRIES ===
  addI18nEntries({
    'report.selectPeriod': { zh: '统计周期', en: 'Period' },
    'report.selectMonth': { zh: '选择月份', en: 'Select Month' },
    'report.printReport': { zh: '🖨️ 打印报告', en: '🖨️ Print Report' },
    'report.monthlyIncome': { zh: '月收入', en: 'Monthly Income' },
    'report.notSet': { zh: '未设置', en: 'Not Set' },
    'report.netIncome': { zh: '净收入', en: 'Net Income' },
    'report.totalExpenditure': { zh: '总支出', en: 'Total Spending' },
    'report.daily': { zh: '日常', en: 'Daily' },
    'report.bills': { zh: '账单', en: 'Bills' },
    'report.savings': { zh: '储蓄', en: 'Savings' },
    'report.savingsRate': { zh: '储蓄率', en: 'Savings Rate' },
    'report.incomeExpenseProgress': { zh: '收支进度', en: 'Income vs Expenses' },
    'report.notSetIncome': { zh: '未设置月收入', en: 'No income set' },
    'report.dailySpendable': { zh: '日常可用', en: 'Spendable' },
    'report.savingsProgressTitle': { zh: '预计储蓄/储蓄目标', en: 'Savings / Target' },
    'report.notSetTarget': { zh: '未设置目标', en: 'No target set' },
    'report.categoryBreakdown': { zh: '分类支出明细', en: 'Category Breakdown' },
    'report.category': { zh: '分类', en: 'Category' },
    'report.budget': { zh: '预算 (RM)', en: 'Budget (RM)' },
    'report.expense': { zh: '支出 (RM)', en: 'Expense (RM)' },
    'report.percentage': { zh: '占比', en: '%' },
    'report.remaining': { zh: '剩余 (RM)', en: 'Remaining (RM)' },
    'report.status': { zh: '状态', en: 'Status' },
    'report.withinBudget': { zh: '✅ 预算内', en: '✅ Within Budget' },
    'report.overspent': { zh: '⚠️ 超支', en: '⚠️ Overspent' },
    'report.dash': { zh: '—', en: '—' },
    'report.total': { zh: '合计', en: 'Total' },
    'report.dailyTrend': { zh: '每日消费趋势', en: 'Daily Trend' },
    'report.yearMonth': { zh: '{0}年{1}月', en: '{0}/{1}' },
    'report.top5': { zh: '支出排行 TOP 5', en: 'Top 5 Categories' },
    'report.noExpenses': { zh: '暂无支出', en: 'No expenses' },
    'report.savingsSummary': { zh: '💰 储蓄预测总结', en: '💰 Savings Summary' },
    'report.predictionIncome': { zh: '📅 {0}年{1}月收入为 <strong>{2}</strong>。', en: '📅 Income for {0}/{1} is <strong>{2}</strong>.' },
    'report.predictionBillsDetail': { zh: '账单合计 <strong>{0}</strong>，净收入 <strong>{1}</strong>。', en: 'Bills <strong>{0}</strong>, net income <strong>{1}</strong>.' },
    'report.predictionSavingsTarget': { zh: '🎯 储蓄目标 <strong>{0}</strong>，日常可用 <strong>{1}</strong>。', en: '🎯 Savings target <strong>{0}</strong>, spendable <strong>{1}</strong>.' },
    'report.predictionSpentSoFar': { zh: '📊 本月至今已消费 <strong>{0}</strong>，日均 {1}。', en: '📊 Spent so far <strong>{0}</strong>, daily avg {1}.' },
    'report.predictionPositive': { zh: '📈 如果维持当前消费习惯，预计月末可存 <strong style="color:var(--success)">{0}</strong>。', en: '📈 At this rate, est. to save <strong style="color:var(--success)">{0}</strong> by month end.' },
    'report.predictionNegative': { zh: '⚠️ 按当前趋势预计超支 <strong style="color:var(--danger)">{0}</strong>，建议控制支出。', en: '⚠️ On track to overspend <strong style="color:var(--danger)">{0}</strong>, consider cutting back.' },
    'report.predictionSetupHint': { zh: '💡 在「月账单中心」设定月收入，在「设置」设定储蓄目标后可查看完整预测。', en: '💡 Set income in Bills Center & savings target in Settings for full forecast.' }
  });
})();
