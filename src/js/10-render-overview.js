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
  const dailyAvg = includeBills
    ? (isRolling ? StatsEngine.getPeriodDailyAverage() : StatsEngine.getDailyAverage(month))
    : (isRolling ? StatsEngine.getPeriodDailyAverage() : StatsEngine.getDailyAverageVariable(month));
  // Cash-flow reading ("预测月总支出" can never sit below what's already been
  // spent) — use the month-end total, not the daily-average trend (A-1/A-3).
  const predictedBreakdown = includeBills
    ? (isRolling ? StatsEngine.getPeriodPredictedBreakdown() : StatsEngine.getPredictedBreakdown(month))
    : (isRolling ? StatsEngine.getPeriodPredictedBreakdownVariable() : StatsEngine.getPredictedBreakdownVariable(month));
  const predicted = (predictedBreakdown && predictedBreakdown.predicted != null) ? predictedBreakdown.predicted : (includeBills
    ? (isRolling ? StatsEngine.getPeriodPredictedMonthEndTotal() : StatsEngine.getPredictedMonthEndTotal(month))
    : (StatsEngine.getDailyAverageVariable(month) * new Date(now.getFullYear(), now.getMonth()+1, 0).getDate()));
  const remainingLimit = isRolling ? StatsEngine.getPeriodRemainingDailyLimit() : StatsEngine.getRemainingDailyLimit(month);
  const last7 = StatsEngine.getLast7Days();
  const overspent = StatsEngine.getOverspentCategories(month);
  const catTotals = isRolling ? StatsEngine.getPeriodCategoryTotals() : StatsEngine.getCategoryTotals(month);
  const splitPending = SplitEngine.getPendingSummary();
  const splitUnpaidTotal = isRolling ? StatsEngine.getPeriodSplitUnpaid() : StatsEngine.getSplitUnpaid(month);

  // Today's and yesterday's spending — expenses only. Income recorded today is
  // money coming in, and folding it into 今日消费 would make a payday look like
  // the most extravagant day of the month.
  const todayKey = localDateKey(now);
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayKey = localDateKey(yesterday);
  const todayTotal = expenseRecords(DataStore.getRecords().filter(r => recordDayKey(r) === todayKey)).reduce((s, r) => s + r.amount, 0);
  const yesterdayTotal = expenseRecords(DataStore.getRecords().filter(r => recordDayKey(r) === yesterdayKey)).reduce((s, r) => s + r.amount, 0);

  // Actual cash flow from the records themselves. Deliberately kept separate from
  // 月收入 (a per-month setting that drives the whole budget chain) — this is what
  // really arrived, not what the user planned. Hidden until an income record
  // exists, so a ledger that has never used the feature sees exactly the page it
  // saw before.
  const recordedIncome = isRolling ? StatsEngine.getPeriodIncome() : StatsEngine.getMonthIncome(month);
  const recordedSpend = monthTotal;
  const recordedNet = Math.round((recordedIncome - recordedSpend) * 100) / 100;

  // Savings / spendable chain — single source of truth in StatsEngine.getSpendablePlan.
  // spendableBudget now also has active instalment plans carved out of it, which is
  // what makes those months actually pinch.
  const sp = StatsEngine.getSpendablePlan(month);
  const totalBills = sp.totalBills;
  const paidBills = StatsEngine.getBillSpendingActual(month);
  const unpaidPlannedBills = Math.max(0, totalBills - paidBills);
  // What has really gone out (bills and instalments included) plus the bills still
  // to pay. 本月还剩 is money in the bank, so it cannot depend on the 含固定账单
  // switch — monthTotal above does, and using it here showed RM1,400 with the
  // switch on and RM2,400 with it off, for the same month.
  const allSpent = isRolling ? StatsEngine.getPeriodTotal() : StatsEngine.getMonthTotal(month);
  const effectiveTotal = allSpent + unpaidPlannedBills;
  // 预计储蓄 = what is left AFTER the purchase plans took their share — the same
  // figure the plan panel shows, and the one the savings target is held against.
  // 预计结余 (before plans) is kept alongside so the gap is explained, not hidden.
  const savingsFc = StatsEngine.getSavingsForecast(month);
  const savingsPred = savingsFc.free;
  const surplusPred = savingsFc.surplus;
  const planReservedPred = savingsFc.planReserved;
  const netDisposable = sp.netDisposable;
  const targetAmount = sp.targetAmount;
  const planDueVirtual = sp.planDueVirtual;
  // Card instalments come off the daily budget too (they are fixed obligations
  // switched by 含固定账单), so the "plans reserved" figure has to include them
  // or the budget arithmetic shown on this page would not add up.
  const planOccupied = planDueVirtual + (sp.planDueCredit || 0);
  const spendableBudget = sp.spendableBudget;
  // What plans really took this month — less than the due amount if money ran short
  const planPaidThisMonth = (typeof PlanMath !== 'undefined') ? PlanMath.getVirtualPaid(month) : 0;
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
  const savingsPct = targetAmount > 0 ? Math.max(0, Math.min(savingsPred / targetAmount, 1)) : 0;

  // Aggregate to root categories for top 5.
  // Fixed-bill categories live in their own list, which getRootAncestorId cannot
  // see — so they used to be silently dropped here even with 含固定账单 ticked.
  const billCatIds = new Set((DataStore.getBillCategories() || []).map(c => c.id));
  // Card instalments sit in an ordinary category the user picked, so removing
  // them for the toggle has to happen per record, not per category.
  const topTotals = includeBills
    ? catTotals
    : StatsEngine.withoutInstalments(catTotals, isRolling ? StatsEngine.getPeriodRecords() : StatsEngine.getRecordsInMonth(month));
  // …and they are ranked as ONE 月账单 block, the same parent the stats charts use
  const BILL_GROUP = 'bill-group';
  const rootCatTotals = {};
  Object.entries(topTotals).forEach(([id, total]) => {
    if (billCatIds.has(id)) {
      if (includeBills) rootCatTotals[BILL_GROUP] = (rootCatTotals[BILL_GROUP] || 0) + total;
      return;
    }
    const rootId = getRootAncestorId(id);
    if (rootId) rootCatTotals[rootId] = (rootCatTotals[rootId] || 0) + total;
  });
  const topCatsSource = rootCatTotals;
  const topCats = Object.entries(topCatsSource)
    .map(([id, total]) => ({ cat: id === BILL_GROUP ? window.getMonthlyBillGroupCat() : DataStore.getCategory(id), total, isBill: id === BILL_GROUP }))
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
          const billActual = isRolling ? StatsEngine.getPeriodFixedSpending() : StatsEngine.getFixedSpendingActual(month);
          // With the switch off monthTotal has no bills in it, so "daily + bills = total" no longer holds
          // (it printed a negative daily figure) — the split line only makes sense with bills included.
          const varSpending = monthTotal - billActual;
          if (includeBills && billActual > 0) {
            return `<div class="text-xs text-muted mt-4" title="${__('overview.dailyBillsHint')}">${__('overview.dailyBillsBreakdown', formatMoney(varSpending), formatMoney(billActual))}</div>`;
          }
          return '';
        })()}
        ${splitUnpaidTotal > 0.01 ? `<div class="text-xs text-muted mt-4" title="${__('overview.realSpendingHint')}">${__('overview.realSpendingNote', formatMoney(monthTotal - splitUnpaidTotal), formatMoney(splitUnpaidTotal))}</div>` : ''}
      </div>
      <div class="card">
        <div class="card-title">${__('overview.monthlyIncome')}</div>
        <div class="text-xl font-bold" style="${totalBills > 0 ? 'font-size:1rem' : ''}">${budget ? formatMoney(budget) : __('overview.notSet')}${totalBills > 0 ? `<span class="text-xs text-muted" style="display:block;font-weight:400">${__('overview.netIncome')} ${formatMoney(netDisposable)}</span>` : ''}</div>
      </div>
      <div class="card">
        <div class="card-title">${__('overview.dailyAvg')}</div>
        <div class="text-xl font-bold">${formatMoney(dailyAvg)}</div>
      </div>
      <div class="card pred-card-switch" id="predictedCard" role="button" tabindex="0"
           title="${__('overview.predSwitchTitle')}"
           onclick="toggleOverviewBills()" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();toggleOverviewBills();}">
        <div class="card-title">${includeBills
          ? (isRolling ? __('overview.predicted.rolling') : __('overview.predicted.monthly'))
          : (isRolling ? __('overview.predicted.rollingDaily') : __('overview.predicted.monthlyDaily'))}</div>
        <div class="text-xl font-bold">${formatMoney(predicted)}</div>
        ${(() => {
          const line = formatPredictedBreakdown(predictedBreakdown);
          return line ? `<div class="text-xs text-muted mt-4" title="${__('overview.predictedHint')}">${line}</div>` : '';
        })()}
        <div class="pred-switch-row">
          <span class="pred-switch-chip ${includeBills ? 'on' : ''}">${includeBills ? '✅ ' + __('overview.predSwitchOn') : '⬜ ' + __('overview.predSwitchOff')}</span>
          <span class="pred-switch-tip">${includeBills ? __('overview.predSwitchTipOn') : __('overview.predSwitchTipOff')}</span>
        </div>
      </div>
    </div>

    <!-- Cash flow actually recorded: income entries vs expenses vs what is left -->
    ${recordedIncome > 0 ? `
    <div class="card mb-16">
      <div class="card-title">${isRolling ? __('overview.flow.title.rolling') : __('overview.flow.title.monthly')}</div>
      <div class="grid-3">
        <div>
          <div class="text-xs text-secondary">${__('overview.flow.income')}</div>
          <div class="text-lg font-bold" style="color:var(--success)">${formatMoney(recordedIncome)}</div>
        </div>
        <div>
          <div class="text-xs text-secondary">${__('overview.flow.expense')}</div>
          <div class="text-lg font-bold" style="color:var(--danger)">${formatMoney(recordedSpend)}</div>
        </div>
        <div>
          <div class="text-xs text-secondary">${__('overview.flow.net')}</div>
          <div class="text-lg font-bold" style="color:${recordedNet >= 0 ? 'var(--success)' : 'var(--danger)'}">${recordedNet >= 0 ? '+' : ''}${formatMoney(recordedNet)}</div>
        </div>
      </div>
      <div class="text-xs text-muted mt-4">${__('overview.flow.note')}</div>
    </div>` : ''}

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

    <!-- Split bills: pending collection banner -->
    ${splitPending.total > 0 ? `
    <div class="card mb-16" style="border-left:4px solid var(--warning);cursor:pointer" onclick="openSplitCenter()">
      <div class="flex items-center justify-between" style="padding:2px 0">
        <div class="flex items-center gap-8">
          <span style="font-size:1.5rem">🧾</span>
          <div>
            <div style="font-weight:600;font-size:0.9rem">${__('split.bannerTitle')}</div>
            <div class="text-xs text-muted" style="margin-top:2px">${__('split.overviewBanner', splitPending.count, formatMoney(splitPending.total))}</div>
          </div>
        </div>
        <span class="text-xs" style="color:var(--primary)">${__('split.bannerHint')} →</span>
      </div>
    </div>
    ` : ''}

    <!-- Split bills: paid-back contributions (reduce spending) — card removed (B):
         repayments are already netted into 本月总支出; the split center tracks detail -->

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

    <!-- Purchase plans — only rendered when at least one plan is active -->
    ${typeof renderPlanOverviewCard === 'function' ? renderPlanOverviewCard(month) : ''}

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
          ${planPaidThisMonth > 0 ? `<div class="text-xs text-muted" style="margin-top:2px">${__('plan.freeSavings')} ${formatMoney(Math.max(0, actualSavings - planPaidThisMonth))}</div>` : ''}
        </div>
        <div style="padding:4px">
          <div class="text-xs text-secondary">${__('overview.monthlyIncome')}</div>
          <div class="text-lg font-bold">${budget ? formatMoney(budget) : __('overview.notSet')}</div>
          ${totalBills > 0 ? `<div class="text-xs text-muted" style="margin-top:2px">${__('overview.netIncome')} ${formatMoney(netDisposable)}</div>` : ''}
        </div>
        <div style="padding:4px">
          <div class="text-xs text-secondary">${__('overview.estimatedMonthEndSavings')}</div>
          <div class="text-lg font-bold" style="color:${budget > 0 ? (savingsPred >= 0 ? 'var(--success)' : 'var(--danger)') : 'var(--text-muted)'}">${budget > 0 ? formatMoney(savingsPred) : '—'}</div>
          ${planReservedPred > 0 && budget > 0 ? `<div class="text-xs text-muted" style="margin-top:2px" title="${__('plan.afterPlansHint')}">${__('plan.afterPlansRow', formatMoney(surplusPred), formatMoney(planReservedPred))}</div>` : ''}
        </div>
        <div style="padding:4px">
          <div class="text-xs text-secondary">${__('overview.targetAchievement')}</div>
          <div class="text-lg font-bold">${targetAmount > 0 ? (savingsPct * 100).toFixed(0) + '%' : '—'}</div>
        </div>
        ${planOccupied > 0 ? `
        <div style="padding:4px">
          <div class="text-xs text-secondary">${__('plan.occupiedRow')}</div>
          <div class="text-lg font-bold" style="color:var(--warning)">${formatMoney(planOccupied)}</div>
        </div>` : ''}
      </div>
      <div class="text-sm text-secondary mb-8">
        ${budget <= 0
          ? __('overview.predictionNeedIncome')
          : (savingsPred >= 0
            ? __('overview.predictionPositive', formatMoney(savingsPred))
            : __('overview.predictionNegative', formatMoney(Math.abs(savingsPred))))}
        ${budget > 0 && planReservedPred > 0 && savingsPred >= 0 ? ' ' + __('plan.predictionPlanNote', formatMoney(planReservedPred)) : ''}
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
            <div style="flex:1;min-width:140px;padding:6px 10px;border-radius:8px;background:var(--card-bg);border:1px solid var(--border)" title="${__('overview.remainingTotalHint')}">
              <div class="text-xs text-secondary">${__('overview.remainingTotalPerDay')}</div>
              <div class="font-bold" style="font-size:1rem;color:${remainingTotalPerDay > 0 ? 'var(--warning)' : 'var(--text-muted)'}">${formatMoney(remainingTotalPerDay)}${__('overview.perDay')}</div>
              <div class="text-xs text-muted" style="margin-top:2px">${__('overview.remainingBreakdown', formatMoney(remainingTotal), remainingDays)}</div>
              <div class="text-xs text-muted" style="margin-top:2px;opacity:0.85">${__('overview.remainingTotalFormula')}</div>
            </div>
            <div style="flex:1;min-width:140px;padding:6px 10px;border-radius:8px;background:var(--card-bg);border:1px solid var(--border)" title="${__('overview.dailySpendableHint')}">
              <div class="text-xs text-secondary">${__('overview.dailySpendablePerDay')}</div>
              <div class="font-bold" style="font-size:1rem;color:${remainingDailyPerDay > 0 ? 'var(--primary)' : 'var(--text-muted)'}">${formatMoney(remainingDailyPerDay)}${__('overview.perDay')}</div>
              <div class="text-xs text-muted" style="margin-top:2px">${__('overview.remainingBreakdown', formatMoney(remainingDaily), remainingDays)}</div>
              <div class="text-xs text-muted" style="margin-top:2px;opacity:0.85">${__('overview.dailySpendableFormula')}</div>
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
        const catBudget = item.cat.id && !item.isBill ? DataStore.getCategoryBudgetAmount(item.cat.id, month) : 0;   // RM, also for a % budget
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
            <span>${escHtml(o.category.icon)} ${escHtml(o.category.name)}</span>
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
// The forecast broken into the pieces that add up to it, e.g. "月账单 X ＋ 信用卡分期 Y ＋ 日常消费预估 Z".
// Only parts that are not zero are shown (a RM0.00 part says nothing, and read like
// something was wrong). With fewer than two parts left the line would just repeat
// the total above it, so it is dropped. 月账单 = paid + still-unpaid planned bills;
// switching 含固定账单 off removes exactly 月账单 and 信用卡分期, so the line shows
// the user what the switch did.
function formatPredictedBreakdown(bd) {
  if (!bd) return '';
  const parts = [];
  const bills = (bd.bills || 0) + (bd.billsUnpaid || 0);
  if (bills > 0.004) parts.push(__('predicted.part.bills', formatMoney(bills)));
  if (bd.instalments > 0.004) parts.push(__('predicted.part.instalments', formatMoney(bd.instalments)));
  if (bd.large > 0.004) parts.push(__('predicted.part.large', formatMoney(bd.large)));
  if (bd.normal > 0.004) parts.push(__('predicted.part.daily', formatMoney(bd.normal)));
  return parts.length >= 2 ? parts.join(' ＋ ') : '';
}

// The forecast card is a switch for 含固定账单 — the same switch as the one on the
// budget-progress card (one setting, one place it is stored), so flipping it here
// also moves 本月总支出 and the budget ring. Re-render everything: the old
// checkbox only redrew the ring and left the cards above showing the old state.
function toggleOverviewBills() {
  try { localStorage.setItem('chartBillToggle_overviewBudget', isBillToggleChecked('overviewBudget') ? '0' : '1'); } catch (e) { /* storage blocked: nothing to remember */ }
  renderOverview();
}

function refreshOverviewBudget() {
  const now = new Date();
  const month = getMonthKey(now.toISOString());
  const includeBills = isBillToggleChecked('overviewBudget');
  const monthTotal = includeBills ? StatsEngine.getMonthTotal(month) : StatsEngine.getVariableSpending(month);
  const budget = DataStore.getMonthlyIncome(month) || DataStore.getBudget(month);
  if (!budget) return;

  const sp = StatsEngine.getSpendablePlan(month);
  const totalBills = sp.totalBills;
  const targetAmount = sp.targetAmount;
  const netDisposable = sp.netDisposable;
  const spendableBudget = sp.spendableBudget;
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
  window.toggleOverviewBills = toggleOverviewBills;
  window.formatPredictedBreakdown = formatPredictedBreakdown;

  // === I18N ENTRIES ===
  addI18nEntries({
    'overview.welcome': { zh: '欢迎使用记账软件', en: 'Welcome!' },
    'overview.emptyHint': { zh: '还没有任何记录，点击下方按钮开始记账吧！', en: 'No records yet, click below to start!' },
    'overview.firstRecord': { zh: '✏️ 记第一笔账', en: '✏️ Add First Record' },
    'overview.title.rolling': { zh: '近30天支出', en: 'Last 30 Days' },
    'overview.title.monthly': { zh: '本月总支出', en: 'Monthly Spending' },
    'overview.dailyBillsHint': { zh: '本月总支出 = 日常净支出 + 账单流水；日常净支出已扣掉他人已还款', en: 'Total = daily net + bill records; daily net already deducts repayments received' },
    'overview.realSpendingHint': { zh: '本月总支出含你替他人垫付、待收回的钱；你的实际承担 + 待收回 = 上方合计', en: 'Total includes money you fronted for others; your share + to-collect = total above' },
    'overview.dailyBillsBreakdown': { zh: '其中日常净支出 {0} ＋ 账单流水 {1}', en: 'o/w daily net {0} + bills {1}' },
    'overview.realSpendingNote': { zh: '你的实际承担 {0} ＋ 待收回 {1} ＝ 上方合计（已收回已扣除）', en: 'Your share {0} + to-collect {1} = total above (repaid deducted)' },
    'overview.monthlyIncome': { zh: '月收入', en: 'Monthly Income' },
    'overview.flow.title.monthly': { zh: '💵 本月实际收支', en: '💵 Cash Flow This Month' },
    'overview.flow.title.rolling': { zh: '💵 近30天实际收支', en: '💵 Cash Flow (Last 30 Days)' },
    'overview.flow.income': { zh: '收入记录', en: 'Recorded Income' },
    'overview.flow.expense': { zh: '支出记录', en: 'Recorded Spending' },
    'overview.flow.net': { zh: '实际结余', en: 'Net (recorded)' },
    'overview.flow.note': { zh: '按流水收入 − 流水支出统计，与上方「月收入」设定值无关', en: 'Recorded income minus recorded spending; independent of the Monthly Income setting above' },
    'overview.notSet': { zh: '未设置', en: 'Not Set' },
    'overview.netIncome': { zh: '净收入', en: 'Net Income' },
    'overview.dailyAvg': { zh: '日均支出', en: 'Daily Avg' },
    'overview.predicted.rolling': { zh: '预测30天总支出', en: 'Predicted 30-Day Total' },
    'overview.predictedHint': { zh: '预测 = 月账单（已付的，加上还没付的计划金额）＋ 信用卡分期 ＋ 已经花掉的大额消费 ＋ 按目前每天花的钱估算到月底的日常消费。点卡片可以切换「含 / 不含固定账单」，不含时只剩后两项。', en: 'Forecast = monthly bills (paid, plus the planned amount not yet paid) + card instalments + big purchases already made + everyday spending estimated to month-end at your current daily pace. Tap the card to include or exclude fixed bills; without them only the last two remain.' },
    'overview.predicted.monthly': { zh: '预测月总支出', en: 'Predicted Monthly Total' },
    'overview.predicted.monthlyDaily': { zh: '预测月日常支出', en: 'Predicted Monthly Daily Spend' },
    'predicted.part.bills': { zh: '月账单 {0}', en: 'Monthly bills {0}' },
    'predicted.part.instalments': { zh: '信用卡分期 {0}', en: 'Card instalments {0}' },
    'predicted.part.large': { zh: '大额消费 {0}', en: 'Big purchases {0}' },
    'predicted.part.daily': { zh: '日常消费预估 {0}', en: 'Everyday estimate {0}' },
    'overview.predSwitchOn': { zh: '含固定账单', en: 'Fixed bills included' },
    'overview.predSwitchOff': { zh: '不含固定账单', en: 'Fixed bills excluded' },
    'overview.predSwitchTipOn': { zh: '点一下改成不含', en: 'Tap to exclude' },
    'overview.predSwitchTipOff': { zh: '点一下改成包含', en: 'Tap to include' },
    'overview.predSwitchTitle': { zh: '点击切换：要不要把房租、水电等固定账单算进来。这是总览共用的开关，「本月总支出」和「预算进度」也会一起变', en: 'Tap to switch whether fixed bills like rent and utilities are counted. This is one shared switch on the overview: “This month’s spending” and “Budget progress” change with it' },
    'overview.predicted.rollingDaily': { zh: '预测30天日常支出', en: 'Predicted 30-Day Daily Spend' },
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
    'overview.targetAchieved': { zh: '✅ 预计可达成目标', en: '✅ On track to meet target' },
    'overview.estimatedSave': { zh: '预计储蓄', en: 'Est. savings' },
    'overview.savingsPrediction': { zh: '💵 储蓄预测', en: '💵 Savings Forecast' },
    'overview.currentSaved': { zh: '本月还剩', en: 'Left This Month' },
    'overview.estimatedMonthEndSavings': { zh: '预计月末储蓄', en: 'Est. Month-End Savings' },
    'overview.targetAchievement': { zh: '目标达成', en: 'Target Progress' },
    'overview.predictionPositive': { zh: '📈 如果维持当前消费习惯，本月末预计可存 {0}', en: '📈 At this rate, est. to save {0} by month end' },
    'overview.predictionNegative': { zh: '⚠️ 预计超支 {0}，请注意控制支出', en: '⚠️ Est. overspend {0}, please control spending' },
    'overview.predictionNeedIncome': { zh: '先设置本月收入，才能预测月末大概能存多少', en: 'Set this month\'s income first to see how much you may save by month end' },
    'overview.remainingTotalPerDay': { zh: '剩余可花/天（未扣储蓄目标）', en: 'Left to spend / day (pre-savings)' },
    'overview.dailySpendablePerDay': { zh: '日常可花/天（已扣账单+储蓄）', en: 'Daily spendable / day (ex-bills & savings)' },
    'overview.perDay': { zh: '/天', en: '/day' },
    'overview.remainingBreakdown': { zh: '{0} ÷ {1}天', en: '{0} ÷ {1}d' },
    'overview.remainingTotalHint': { zh: '月收入 − 已花 − 未付账单，再除以剩余天数；未扣除储蓄目标', en: '(Income − spent − unpaid bills) ÷ days left; savings target not deducted' },
    'overview.remainingTotalFormula': { zh: '（月收入−已花−未付账单）÷剩余天数', en: '(income−spent−unpaid) ÷ days left' },
    'overview.dailySpendableHint': { zh: '日常可用额度 − 日常已花，再除以剩余天数；已扣账单、储蓄目标与大额预留', en: '(Spendable − daily spent) ÷ days left; bills, savings & plan reserves deducted' },
    'overview.dailySpendableFormula': { zh: '（日常可用−日常已花）÷剩余天数', en: '(spendable−daily spent) ÷ days left' },
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
