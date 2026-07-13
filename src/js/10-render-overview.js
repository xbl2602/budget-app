/* ============================================================
   RENDER: Overview
   ============================================================ */
(function() {
'use strict';

function renderOverview() {
  logEvent('renderOverview', 'start');
  const el = document.getElementById('page-overview');
  const now = new Date();
  const month = getMonthKey(now.toISOString());
  const statsRange = getStatsRange();
  const isRolling = statsRange === 'rolling30';
  const periodRange = getPeriodDateRange();
  const includeBills = isBillToggleChecked('overviewBudget');
  const monthTotal = includeBills
    ? (isRolling ? StatsEngine.getPeriodTotal() : StatsEngine.getMonthTotal(month))
    : (isRolling ? StatsEngine.getPeriodVariableSpending() : StatsEngine.getVariableSpending(month));
  const budget = DataStore.getMonthlyIncome(month) || DataStore.getBudget(month);
  const savingsTarget = DataStore.getSavingsTarget();
  const dailyAvg = includeBills
    ? (isRolling ? StatsEngine.getPeriodDailyAverage() : StatsEngine.getDailyAverage(month))
    : (isRolling ? StatsEngine.getPeriodDailyAverage() : StatsEngine.getDailyAverageVariable(month));
  const predicted = includeBills
    ? (isRolling ? StatsEngine.getPeriodPredictedTotal() : StatsEngine.getPredictedTotal(month))
    : (isRolling ? StatsEngine.getPeriodPredictedTotal() : (StatsEngine.getDailyAverageVariable(month) * new Date(now.getFullYear(), now.getMonth()+1, 0).getDate()));
  const remainingLimit = isRolling ? StatsEngine.getPeriodRemainingDailyLimit() : StatsEngine.getRemainingDailyLimit(month);
  const last7 = StatsEngine.getLast7Days();
  const overspent = StatsEngine.getOverspentCategories(month);
  const catTotals = isRolling ? StatsEngine.getPeriodCategoryTotals() : StatsEngine.getCategoryTotals(month);

  // Today's and yesterday's spending
  const todayKey = now.toISOString().substr(0, 10);
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayKey = yesterday.toISOString().substr(0, 10);
  const todayTotal = DataStore.getRecords().filter(r => (r.date || r.createdAt).substr(0, 10) === todayKey).reduce((s, r) => s + r.amount, 0);
  const yesterdayTotal = DataStore.getRecords().filter(r => (r.date || r.createdAt).substr(0, 10) === yesterdayKey).reduce((s, r) => s + r.amount, 0);

  // Compute savings target monetary value
  const percentBase = DataStore.getPercentBase();
  const totalBills = DataStore.getBillTotal(month);
  const paidBills = StatsEngine.getBillSpendingActual(month);
  const unpaidPlannedBills = Math.max(0, totalBills - paidBills);
  const effectiveTotal = monthTotal + unpaidPlannedBills;
  const savingsPred = StatsEngine.getSavingsPrediction(month) - unpaidPlannedBills;
  const netDisposable = Math.max(0, budget - totalBills);
  const baseAmount = percentBase === 'net' ? netDisposable : budget;
  const targetAmount = (() => {
    const t = savingsTarget;
    if (t.type === 'fixed') return t.fixedAmount || 0;
    if (t.type === 'percent') return baseAmount * (t.percent || 0) / 100;
    return 0;
  })();

  // Daily spendable = net income (after bills) minus savings
  const spendableBudget = Math.max(0, netDisposable - targetAmount);
  const budgetPct = includeBills
    ? (budget > 0 ? (monthTotal / budget) * 100 : 0)
    : (spendableBudget > 0 ? (monthTotal / spendableBudget) * 100 : 0);

  // Remaining daily limits (dynamic: account for what's already spent)
  // monthTotal already changes with includeBills toggle
  const remainingLimitSpendable = (() => {
    const baseBudget = includeBills ? budget : spendableBudget;
    if (!baseBudget || baseBudget <= 0) return 0;
    const daysInMonth = new Date(now.getFullYear(), now.getMonth()+1, 0).getDate();
    const remainingDays = daysInMonth - now.getDate();
    if (remainingDays <= 0) return 0;
    const remainingAmt = baseBudget - monthTotal;
    return Math.max(0, remainingAmt / remainingDays);
  })();

  // Savings progress: how close to savings target based on predicted savings
  const actualSavings = Math.max(0, budget - effectiveTotal);
  const savingsPct = targetAmount > 0 ? Math.min(savingsPred / targetAmount, 1) : 0;

  // Aggregate to root categories for top 5
  const rootCatTotals = {};
  Object.entries(catTotals).forEach(([id, total]) => {
    const rootId = getRootAncestorId(id);
    if (rootId) rootCatTotals[rootId] = (rootCatTotals[rootId] || 0) + total;
  });
  // Filter out bill categories when toggle is off
  const billCatIds = new Set((DataStore.getBillCategories() || []).map(c => c.id));
  let topCatsSource = Object.keys(rootCatTotals).length > 0 ? rootCatTotals : catTotals;
  if (!includeBills) {
    const filtered = {};
    Object.entries(topCatsSource).forEach(([id, total]) => {
      if (!billCatIds.has(id)) filtered[id] = total;
    });
    topCatsSource = filtered;
  }
  const topCats = Object.entries(topCatsSource)
    .map(([id, total]) => ({ cat: DataStore.getCategory(id), total }))
    .filter(x => x.cat)
    .sort((a,b) => b.total - a.total)
    .slice(0, 5);

  const overspendWarning = overspent.length > 0;
  const hasRecords = DataStore.getRecords().length > 0;

  el.innerHTML = `
    ${!hasRecords ? `
      <div class="card mb-16" style="text-align:center;padding:40px 16px;border:2px dashed var(--border);background:linear-gradient(135deg,#F8FAFC,#EEF2FF)">
        <div style="font-size:4rem;margin-bottom:12px">💰</div>
        <h2 style="font-size:1.3rem;font-weight:700;margin-bottom:8px">${__('overview.welcome')}</h2>
        <p style="color:var(--text-secondary);margin-bottom:20px">${__('overview.emptyHint')}</p>
        <button class="btn btn-primary btn-lg" onclick="navigateTo('add')">${__('overview.firstRecord')}</button>
      </div>
    ` : ''}
    <div class="grid-4 mb-16">
      <div class="card">
        <div class="card-title" style="display:flex;align-items:center;gap:6px;flex-wrap:wrap">
          <span>${isRolling ? __('overview.title.rolling') : __('overview.title.monthly')}</span>
          <span class="text-xs text-muted" style="font-weight:400">${periodRange.label}</span>
        </div>
        <div class="text-xl font-bold" style="color:var(--primary)">${formatMoney(monthTotal)}</div>
        ${(() => {
          const billActual = isRolling ? StatsEngine.getPeriodBillSpending() : StatsEngine.getBillSpendingActual(month);
          const varSpending = monthTotal - billActual;
          if (billActual > 0) {
            return `<div class="text-xs text-muted mt-4">${__('overview.dailyBillsBreakdown', formatMoney(varSpending), formatMoney(billActual))}</div>`;
          }
          return '';
        })()}
      </div>
      <div class="card">
        <div class="card-title">${__('overview.monthlyIncome')}</div>
        <div class="text-xl font-bold" style="${totalBills > 0 ? 'font-size:1rem' : ''}">${budget ? formatMoney(budget) : __('overview.notSet')}${totalBills > 0 ? `<span class="text-xs text-muted" style="display:block;font-weight:400">${__('overview.netIncome')} ${formatMoney(netDisposable)}</span>` : ''}</div>
      </div>
      <div class="card">
        <div class="card-title">${__('overview.dailyAvg')}</div>
        <div class="text-xl font-bold">${formatMoney(dailyAvg)}</div>
      </div>
      <div class="card">
        <div class="card-title">${isRolling ? __('overview.predicted.rolling') : __('overview.predicted.monthly')}</div>
        <div class="text-xl font-bold">${formatMoney(predicted)}</div>
      </div>
    </div>

    <!-- Daily spending row -->
    <div class="grid-2 mb-16">
      <div class="card">
        <div class="card-title">${__('overview.yesterdaySpending', yesterdayKey)}</div>
        <div class="text-xl font-bold" style="color:var(--text-secondary)">${yesterdayTotal > 0 ? formatMoney(yesterdayTotal) : '—'}</div>
      </div>
      <div class="card">
        <div class="card-title">${__('overview.todaySpending', todayKey)}</div>
        <div class="text-xl font-bold" style="color:${todayTotal > 0 ? 'var(--warning)' : 'var(--text-muted)'}">${todayTotal > 0 ? formatMoney(todayTotal) : __('overview.none')}</div>
      </div>
    </div>

    <!-- Bills center — prominent entry -->
    <div class="card mb-16" style="border-left:4px solid var(--primary);background:linear-gradient(135deg,var(--card-bg),rgba(99,102,241,0.04));cursor:pointer" onclick="openBillsCenter()">
      <div class="flex items-center justify-between" style="padding:2px 0">
        <div class="flex items-center gap-8">
          <span style="font-size:1.5rem">📋</span>
          <div>
            <div style="font-weight:600;font-size:0.9rem">${__('overview.billsCenter')}</div>
            <div class="text-xs text-muted" style="margin-top:2px">
              ${(() => {
                const inc = DataStore.getMonthlyIncome(month);
                const bt = DataStore.getBillTotal(month);
                if (inc > 0) return __('overview.billsCenterSummary', formatMoney(inc), formatMoney(bt), formatMoney(Math.max(0, inc - bt)));
                if (bt > 0) return __('overview.billsCenterNoIncome', formatMoney(bt));
                return __('overview.setIncomeAndBills');
              })()}
            </div>
          </div>
        </div>
        <span class="btn btn-sm btn-primary" style="font-size:0.75rem">${__('overview.manage')}</span>
      </div>
    </div>

    <div class="grid-2 mb-16">
      <!-- Budget progress ring -->
      <div class="card" style="text-align:center">
        <div class="card-title" style="display:flex;align-items:center;gap:8px;justify-content:center">
          <span>${__('overview.budgetProgress')}</span>
          ${renderBillToggle('overviewBudget')}
        </div>
        <canvas id="budgetRing" width="160" height="160" style="max-width:160px;margin:8px auto"></canvas>
        <div class="text-sm text-secondary" style="${budgetPct > 100 ? 'color:var(--danger);font-weight:600' : ''}">
          ${budget ? (budgetPct > 100 ? __('overview.overspentAmount', formatMoney(monthTotal - (includeBills ? budget : spendableBudget))) : formatMoney(monthTotal) + ' / ' + formatMoney(includeBills ? budget : spendableBudget)) : '—'}
        </div>
        ${targetAmount > 0 && budget > 0 ? `<div class="text-xs text-muted mt-4">${__('overview.monthlyIncome')} ${formatMoney(budget)}${totalBills > 0 ? ' − ' + __('overview.billsLabel') + ' ' + formatMoney(totalBills) : ''} − ${__('overview.savingsLabel')} ${formatMoney(targetAmount)} = ${__('overview.dailySpendable')} ${formatMoney(spendableBudget)}</div>` : ''}
      </div>

      <!-- Savings progress -->
      <div class="card" style="text-align:center">
        <div class="card-title">${__('overview.savingsTarget')}</div>
        <canvas id="savingsRing" width="160" height="160" style="max-width:160px;margin:8px auto"></canvas>
        <div class="text-sm text-secondary">
          ${targetAmount > 0 ? (savingsPct >= 1 ? __('overview.targetAchieved') : __('overview.estimatedSave') + ' ' + formatMoney(savingsPred) + ' / ' + formatMoney(targetAmount)) : __('overview.notSet')}
        </div>
      </div>
    </div>

    <!-- Savings prediction card -->
    <div class="card mb-16">
      <div class="card-title">${__('overview.savingsPrediction')}</div>
      <div class="grid-5" style="margin-bottom:8px;gap:4px">
        <div style="padding:4px">
          <div class="text-xs text-secondary">${__('overview.currentSaved')}</div>
          <div class="text-lg font-bold" style="color:${actualSavings > 0 ? 'var(--success)' : 'var(--danger)'}">${formatMoney(actualSavings)}</div>
        </div>
        <div style="padding:4px">
          <div class="text-xs text-secondary">${__('overview.monthlyIncome')}</div>
          <div class="text-lg font-bold">${budget ? formatMoney(budget) : __('overview.notSet')}</div>
          ${totalBills > 0 ? `<div class="text-xs text-muted" style="margin-top:2px">${__('overview.netIncome')} ${formatMoney(netDisposable)}</div>` : ''}
        </div>
        <div style="padding:4px">
          <div class="text-xs text-secondary">${__('overview.estimatedMonthEndSavings')}</div>
          <div class="text-lg font-bold" style="color:${savingsPred >= 0 ? 'var(--success)' : 'var(--danger)'}">${formatMoney(savingsPred)}</div>
        </div>
        <div style="padding:4px">
          <div class="text-xs text-secondary">${__('overview.targetAchievement')}</div>
          <div class="text-lg font-bold">${targetAmount > 0 ? Math.min(100, (savingsPred/targetAmount)*100).toFixed(0) + '%' : '—'}</div>
        </div>
      </div>
      <div class="text-sm text-secondary mb-8">
        ${savingsPred >= 0
          ? __('overview.predictionPositive', formatMoney(savingsPred))
          : __('overview.predictionNegative', formatMoney(Math.abs(savingsPred)))}
      </div>
      ${budget > 0 ? `
        ${(() => {
          const daysInMonth = new Date(now.getFullYear(), now.getMonth()+1, 0).getDate();
          const remainingDays = daysInMonth - now.getDate();
          // Box 1: remaining total per day — accounts for actual spending + unpaid planned bills
          const totalSpentAll = StatsEngine.getMonthTotal(month);
          const paidBills = StatsEngine.getBillSpendingActual(month);
          const plannedBillsAmt = DataStore.getBillTotal(month);
          const unpaidPlannedBills = Math.max(0, plannedBillsAmt - paidBills);
          const remainingTotal = budget - totalSpentAll - unpaidPlannedBills;
          const remainingTotalPerDay = remainingDays > 0 ? Math.max(0, remainingTotal / remainingDays) : 0;
          // Box 2: remaining daily budget per day (spendableBudget - variableSpending) / remainingDays
          const varSpending = StatsEngine.getVariableSpending(month);
          const remainingDaily = spendableBudget - varSpending;
          const remainingDailyPerDay = remainingDays > 0 ? Math.max(0, remainingDaily / remainingDays) : 0;
          return `
          <div style="display:flex;flex-wrap:wrap;gap:8px;margin-top:4px">
            <div style="flex:1;min-width:140px;padding:6px 10px;border-radius:8px;background:var(--card-bg);border:1px solid var(--border)">
              <div class="text-xs text-secondary">${__('overview.remainingTotalPerDay')}</div>
              <div class="font-bold" style="font-size:1rem;color:${remainingTotalPerDay > 0 ? 'var(--warning)' : 'var(--text-muted)'}">${formatMoney(remainingTotalPerDay)}${__('overview.perDay')}</div>
              <div class="text-xs text-muted" style="margin-top:2px">${__('overview.remainingBreakdown', formatMoney(remainingTotal), remainingDays)}</div>
            </div>
            <div style="flex:1;min-width:140px;padding:6px 10px;border-radius:8px;background:var(--card-bg);border:1px solid var(--border)">
              <div class="text-xs text-secondary">${__('overview.dailySpendablePerDay')}</div>
              <div class="font-bold" style="font-size:1rem;color:${remainingDailyPerDay > 0 ? 'var(--primary)' : 'var(--text-muted)'}">${formatMoney(remainingDailyPerDay)}${__('overview.perDay')}</div>
              <div class="text-xs text-muted" style="margin-top:2px">${__('overview.remainingBreakdown', formatMoney(remainingDaily), remainingDays)}</div>
            </div>
          </div>`;
        })()}
      ` : ''}
      ${!budget ? '<div class="text-xs text-muted mt-4" style="line-height:1.4">' + __('overview.setupHint') + '</div>' : ''}
    </div>

    <!-- Sparkline: Last 7 days -->
    <div class="card mb-16">
      <div class="card-title">${__('overview.last7Days')}</div>
      <canvas id="sparklineChart" width="600" height="160" style="width:100%;height:80px"></canvas>
    </div>

    <!-- Top spending categories -->
    <div class="card mb-16">
      <div class="card-title">${__('overview.top5')}</div>
      ${topCats.length ? topCats.map((item, i) => {
        const catBudget = item.cat.id ? (DataStore.getCategoryBudget(item.cat.id, month).value || 0) : 0;
        const exceeded = catBudget > 0 && item.total > catBudget;
        return `
        <div class="flex items-center justify-between" style="padding:8px 0;border-bottom:1px solid var(--border)">
          <div class="flex items-center gap-8">
            <span style="width:20px;height:20px;border-radius:50%;background:${item.cat.color};display:flex;align-items:center;justify-content:center;font-size:0.7rem;color:white;font-weight:700">${i+1}</span>
            <span style="font-size:1.2rem">${escHtml(item.cat.icon)}</span>
            <span>${escHtml(item.cat.name)}</span>
            ${exceeded ? '<span class="badge badge-danger" style="font-size:0.65rem">' + __('overview.overspentLabel') + '</span>' : (catBudget > 0 ? '<span class="badge badge-success" style="font-size:0.65rem">' + __('overview.withinBudget') + '</span>' : '')}
          </div>
          <div class="flex items-center gap-8">
            <span class="font-bold">${formatMoney(item.total)}</span>
            <span class="text-sm text-muted">${monthTotal > 0 ? (item.total/monthTotal*100).toFixed(1)+'%' : ''}</span>
    </div>
  </div>`;
      }).join('') : '<div class="empty-state"><div class="empty-icon">📭</div><div class="empty-text">' + __('overview.noExpenseRecords') + '</div></div>'}
    </div>

    <!-- Budget progress -->
    ${(() => {
      const m = getMonthKey(now.toISOString());
      const pc = renderBudgetProgressCard(m);
      if (pc && pc.includes('暂未设置')) return '';
      return pc.replace('id="budgetProgressInner"', 'id="overviewProgressInner"');
    })()}

    <!-- Overspend warning -->
    ${overspendWarning ? `
      <div class="card mb-16 warning-slide" style="border-left:4px solid var(--danger);background:#FFF5F5">
        <div class="card-title" style="color:var(--danger)">${__('overview.overspendWarning')}</div>
        ${overspent.map(o => `
          <div class="flex items-center justify-between" style="padding:4px 0">
            <span>${o.category.icon} ${o.category.name}</span>
            <span style="color:var(--danger);font-weight:600">${formatMoney(o.total)} (${o.percent.toFixed(0)}%)</span>
          </div>
        `).join('')}
      </div>
    ` : ''}

    <!-- Quick actions -->
    <div class="flex gap-12 mb-16" style="flex-wrap:wrap">
      <button class="btn btn-primary btn-lg flex-1" onclick="navigateTo('add')">${__('overview.addRecord')}</button>
      <button class="btn btn-outline btn-lg flex-1" onclick="navigateTo('stats')">${__('overview.viewStats')}</button>
      <button class="btn btn-outline btn-lg" style="flex:0 0 auto" onclick="openBillsCenter()">${__('overview.monthlyBills')}</button>
    </div>
  `;

  // Draw rings and sparkline after DOM update
  setTimeout(() => {
    const budgetOverspend = budgetPct > 100;
    drawRing('budgetRing', Math.min(budgetPct, 200) / 100, budgetOverspend ? '#EF4444' : '#6366F1',
      (budgetOverspend ? '+' : '') + budgetPct.toFixed(0) + '%', '#EF4444');
    const savingsDone = savingsPct >= 1;
    drawRing('savingsRing', savingsPct, savingsDone ? '#10B981' : (savingsPct > 0 ? '#F59E0B' : '#94A3B8'),
      (savingsPct * 100).toFixed(0) + '%');
    drawSparkline('sparklineChart', last7);
  }, 50);
}
function refreshOverviewBudget() {
  const now = new Date();
  const month = getMonthKey(now.toISOString());
  const includeBills = isBillToggleChecked('overviewBudget');
  const monthTotal = includeBills ? StatsEngine.getMonthTotal(month) : StatsEngine.getVariableSpending(month);
  const budget = DataStore.getMonthlyIncome(month) || DataStore.getBudget(month);
  if (!budget) return;

  const totalBills = DataStore.getBillTotal(month);
  const savingsTarget = DataStore.getSavingsTarget();
  const percentBase = DataStore.getPercentBase();
  const netDisposable = Math.max(0, budget - totalBills);
  const baseAmount = percentBase === 'net' ? netDisposable : budget;
  const targetAmount = (() => {
    const t = savingsTarget;
    if (t.type === 'fixed') return t.fixedAmount || 0;
    if (t.type === 'percent') return baseAmount * (t.percent || 0) / 100;
    return 0;
  })();
  const spendableBudget = Math.max(0, netDisposable - targetAmount);
  const budgetPct = includeBills
    ? (budget > 0 ? (monthTotal / budget) * 100 : 0)
    : (spendableBudget > 0 ? (monthTotal / spendableBudget) * 100 : 0);

  // Redraw ring
  const budgetOverspend = budgetPct > 100;
  drawRing('budgetRing', Math.min(budgetPct, 200) / 100, budgetOverspend ? '#EF4444' : '#6366F1',
    (budgetOverspend ? '+' : '') + budgetPct.toFixed(0) + '%', '#EF4444');

  // Update label below ring
  const parent = document.getElementById('budgetRing')?.parentElement;
  if (!parent) return;
  const labelEl = parent.querySelector('.text-sm.text-secondary');
  if (labelEl) {
    labelEl.textContent = budgetPct > 100
      ? __('overview.overspentAmount', formatMoney(monthTotal - (includeBills ? budget : spendableBudget)))
      : formatMoney(monthTotal) + ' / ' + formatMoney(includeBills ? budget : spendableBudget);
    labelEl.style.color = budgetPct > 100 ? 'var(--danger)' : '';
    labelEl.style.fontWeight = budgetPct > 100 ? '600' : '';
  }

  // Update bottom formula text
  const formulaEl = parent.querySelector('.text-xs.text-muted');
  if (formulaEl) {
    formulaEl.remove();
  }
  if (targetAmount > 0 && budget > 0) {
    const newFormula = document.createElement('div');
    newFormula.className = 'text-xs text-muted mt-4';
    newFormula.textContent = __('overview.monthlyIncome') + ' ' + formatMoney(budget) + (totalBills > 0 ? ' − ' + __('overview.billsLabel') + ' ' + formatMoney(totalBills) : '') + ' − ' + __('overview.savingsLabel') + ' ' + formatMoney(targetAmount) + ' = ' + __('overview.dailySpendable') + ' ' + formatMoney(spendableBudget);
    parent.appendChild(newFormula);
  }
}

  // === EXPORTS ===
  window.renderOverview = renderOverview;
  window.refreshOverviewBudget = refreshOverviewBudget;

  // === I18N ENTRIES ===
  addI18nEntries({
    'overview.welcome': { zh: '欢迎使用记账软件', en: 'Welcome!' },
    'overview.emptyHint': { zh: '还没有任何记录，点击下方按钮开始记账吧！', en: 'No records yet, click below to start!' },
    'overview.firstRecord': { zh: '✏️ 记第一笔账', en: '✏️ Add First Record' },
    'overview.title.rolling': { zh: '近30天支出', en: 'Last 30 Days' },
    'overview.title.monthly': { zh: '本月总支出', en: 'Monthly Spending' },
    'overview.dailyBillsBreakdown': { zh: '日常 {0} · 账单 {1}', en: 'Daily {0} · Bills {1}' },
    'overview.monthlyIncome': { zh: '月收入', en: 'Monthly Income' },
    'overview.notSet': { zh: '未设置', en: 'Not Set' },
    'overview.netIncome': { zh: '净收入', en: 'Net Income' },
    'overview.dailyAvg': { zh: '日均支出', en: 'Daily Avg' },
    'overview.predicted.rolling': { zh: '预测30天总支出', en: 'Predicted 30-Day Total' },
    'overview.predicted.monthly': { zh: '预测月总支出', en: 'Predicted Monthly Total' },
    'overview.yesterdaySpending': { zh: '昨日消费 ({0})', en: 'Yesterday ({0})' },
    'overview.todaySpending': { zh: '今日消费 ({0})', en: 'Today ({0})' },
    'overview.none': { zh: '暂无', en: 'None' },
    'overview.billsCenter': { zh: '月账单中心', en: 'Bills Center' },
    'overview.billsCenterSummary': { zh: '月收入 {0} · 账单 {1} · 可支配 {2}', en: 'Income {0} · Bills {1} · Spendable {2}' },
    'overview.billsCenterNoIncome': { zh: '本月账单 {0} · 点击设置月收入', en: 'Bills {0} · Click to set income' },
    'overview.setIncomeAndBills': { zh: '设置月收入和账单分类', en: 'Set income & bill categories' },
    'overview.manage': { zh: '管理 →', en: 'Manage →' },
    'overview.budgetProgress': { zh: '预算进度', en: 'Budget Progress' },
    'overview.overspentAmount': { zh: '超支 {0}', en: 'Overspent {0}' },
    'overview.billsLabel': { zh: '账单', en: 'Bills' },
    'overview.savingsLabel': { zh: '储蓄', en: 'Savings' },
    'overview.dailySpendable': { zh: '日常可用', en: 'Spendable' },
    'overview.savingsTarget': { zh: '储蓄目标', en: 'Savings Target' },
    'overview.targetAchieved': { zh: '✅ 已达成目标', en: '✅ Target Met' },
    'overview.estimatedSave': { zh: '预计存', en: 'Est. save' },
    'overview.savingsPrediction': { zh: '💵 储蓄预测', en: '💵 Savings Forecast' },
    'overview.currentSaved': { zh: '当前已存', en: 'Currently Saved' },
    'overview.estimatedMonthEndSavings': { zh: '预计月末储蓄', en: 'Est. Month-End Savings' },
    'overview.targetAchievement': { zh: '目标达成', en: 'Target Progress' },
    'overview.predictionPositive': { zh: '📈 如果维持当前消费习惯，本月末预计可存 {0}', en: '📈 At this rate, est. to save {0} by month end' },
    'overview.predictionNegative': { zh: '⚠️ 预计超支 {0}，请注意控制支出', en: '⚠️ Est. overspend {0}, please control spending' },
    'overview.remainingTotalPerDay': { zh: '剩余总额/天', en: 'Remaining Total / Day' },
    'overview.dailySpendablePerDay': { zh: '日常可用/天（已扣账单+储蓄）', en: 'Daily Spendable / Day' },
    'overview.perDay': { zh: '/天', en: '/day' },
    'overview.remainingBreakdown': { zh: '{0} ÷ {1}天', en: '{0} ÷ {1}d' },
    'overview.setupHint': { zh: '💡 在「月账单中心」设定月收入，在「设置」设定储蓄目标后可查看完整预测', en: '💡 Set income in Bills Center & savings target in Settings' },
    'overview.last7Days': { zh: '近7天趋势', en: 'Last 7 Days' },
    'overview.top5': { zh: '支出排行 TOP 5', en: 'Top 5 Categories' },
    'overview.overspentLabel': { zh: '超支', en: 'Overspent' },
    'overview.withinBudget': { zh: '预算内', en: 'Within Budget' },
    'overview.noExpenseRecords': { zh: '暂无支出记录', en: 'No expenses yet' },
    'overview.overspendWarning': { zh: '⚠️ 超支警告', en: '⚠️ Overspend Warning' },
    'overview.addRecord': { zh: '✏️ 记一笔', en: '✏️ Add Record' },
    'overview.viewStats': { zh: '📈 查看统计', en: '📈 View Stats' },
    'overview.monthlyBills': { zh: '📋 月账单', en: '📋 Bills' }
  });
})();
