/* ============================================================
   SIMULATION ENGINE — What-If projection calculations
   ============================================================ */
(function() {
'use strict';

const SimulationEngine = {
  /**
   * Run a what-if simulation for a given month.
   * @param {string} month - 'YYYY-MM'
   * @param {object} params - user's what-if assumptions
   * @returns {object} projection result with comparison to current trend
   */
  run(month, params, opts) {
    if (!params) return null;
    const now = new Date();
    const periodOpts = (opts && opts.period) || null;
    const isRolling = periodOpts && periodOpts.key === 'rolling30';
    const isCurrentMonth = month === getMonthKey(now.toISOString());
    const today = now.getDate();
    const daysInMonth = isRolling
      ? periodOpts.daysInPeriod
      : new Date(parseInt(month.split('-')[0]), parseInt(month.split('-')[1]), 0).getDate();
    const daysPassed = isRolling ? periodOpts.daysPassed : (isCurrentMonth ? today : daysInMonth);
    const remainingDays = Math.max(0, daysInMonth - daysPassed);

    // Override params with actuals if not specified
    const income = params.income != null ? params.income : (DataStore.getMonthlyIncome(month) || DataStore.getBudget(month) || 0);
    const bills = params.bills != null ? params.bills : DataStore.getBillTotal(month);
    const netDisposable = Math.max(0, income - bills);
    const savingsTarget = params.savingsTarget || DataStore.getSavingsTarget();
    const percentBase = DataStore.getPercentBase();
    const baseAmount = percentBase === 'net' ? netDisposable : income;
    let targetAmount = 0;
    if (savingsTarget.type === 'fixed') targetAmount = savingsTarget.fixedAmount || 0;
    else if (savingsTarget.type === 'percent') targetAmount = (savingsTarget.percent || 0) / 100 * baseAmount;
    const spendable = Math.max(0, netDisposable - targetAmount);

    // Get actual spending to date (variable categories only)
    const allRecords = isRolling
      ? DataStore.getRecords()
          .filter(r => {
            const d = new Date(r.date || r.createdAt);
            return d >= periodOpts.start && d <= periodOpts.end && !StatsEngine.isBillCategory(r.categoryId);
          })
      : DataStore.getRecords()
          .filter(r => getMonthKey(r.date || r.createdAt) === month && !StatsEngine.isBillCategory(r.categoryId));
    const actualSpent = allRecords.reduce((s, r) => s + r.amount, 0);
    const categoryTotals = {};
    const categoryDays = {};
    allRecords.forEach(r => {
      categoryTotals[r.categoryId] = (categoryTotals[r.categoryId] || 0) + r.amount;
      const d = new Date(r.date || r.createdAt);
      const day = d.getDate();
      if (!categoryDays[r.categoryId]) categoryDays[r.categoryId] = new Set();
      categoryDays[r.categoryId].add(day);
    });

    // Build full category tree with current stats
    const allCats = DataStore.getCategories();
    const catMap = {}; allCats.forEach(c => catMap[c.id] = c);
    const rootCats = DataStore.getRootCategories();

    // Compute leaf category ids
    const leafCatIds = new Set();
    allCats.forEach(c => {
      // It's a leaf if it has no children
      const hasChildren = allCats.some(x => x.parentId === c.id);
      if (!hasChildren) leafCatIds.add(c.id);
    });

    // Get current daily average per category
    const getCurrentDailyAvg = (catId) => {
      return daysPassed > 0 ? (categoryTotals[catId] || 0) / daysPassed : 0;
    };

    // For each leaf category, compute projected spending
    const categoryProjections = {};
    let totalProjectedRemaining = 0;
    const adjustments = (params.categoryAdjustments) || {};
    const globalAdj = params.globalAdjustment || { mode: null, value: null };

    // First pass: get root-level settings for inheritance
    const rootSettings = {};
    Object.entries(adjustments).forEach(([catId, adj]) => {
      const cat = catMap[catId];
      if (cat && !cat.parentId) {
        rootSettings[catId] = adj;
      }
    });

    // Process leaf categories
    leafCatIds.forEach(catId => {
      const cat = catMap[catId];
      if (!cat) return;
      const rootId = cat.parentId || catId;
      const rootCat = rootId === catId ? cat : catMap[rootId];

      // Determine effective adjustment: direct first, then inherit from root
      let adj = adjustments[catId];
      if (!adj) adj = adjustments[rootId] || null;
      if (!adj) adj = { mode: 'trend', value: null };

      const currentAvg = getCurrentDailyAvg(catId);
      let projectedRemaining;

      switch (adj.mode) {
        case 'daily':
          projectedRemaining = adj.value * remainingDays;
          break;
        case 'total':
          projectedRemaining = adj.value || 0;
          break;
        case 'percent':
          projectedRemaining = currentAvg * remainingDays * (1 + (adj.value || 0) / 100);
          break;
        case 'adjust':
          projectedRemaining = (currentAvg + (adj.value || 0)) * remainingDays;
          break;
        case 'zero':
          projectedRemaining = 0;
          break;
        case 'trend':
        default:
          projectedRemaining = currentAvg * remainingDays;
          break;
      }

      // Apply global adjustment if the category doesn't have a specific non-trend override
      if (globalAdj.mode && adj.mode === 'trend') {
        if (globalAdj.mode === 'percent') {
          projectedRemaining = projectedRemaining * (1 + (globalAdj.value || 0) / 100);
        } else if (globalAdj.mode === 'amount') {
          projectedRemaining = projectedRemaining + (globalAdj.value || 0) * remainingDays;
        }
      }

      projectedRemaining = Math.max(0, projectedRemaining);
      totalProjectedRemaining += projectedRemaining;

      categoryProjections[catId] = {
        category: cat,
        rootId: rootId,
        rootName: rootCat ? rootCat.name : cat.name,
        currentTotal: categoryTotals[catId] || 0,
        currentDailyAvg: currentAvg,
        mode: adj.mode,
        value: adj.value,
        projectedRemaining: projectedRemaining,
        projectedTotal: (categoryTotals[catId] || 0) + projectedRemaining
      };
    });

    // Add hypothetical categories
    const hypotheticals = (params.hypotheticalCategories) || [];
    let hypotheticalTotal = 0;
    const hypotheticalProjections = [];
    hypotheticals.forEach(h => {
      const daily = h.type === 'daily' ? (h.amount || 0) : ((h.amount || 0) / remainingDays);
      const hypRemaining = h.type === 'daily' ? (h.amount || 0) * remainingDays : (h.amount || 0);
      hypotheticalTotal += hypRemaining;
      hypotheticalProjections.push({
        name: h.name,
        icon: h.icon || '❓',
        daily: daily,
        projectedRemaining: hypRemaining
      });
    });
    totalProjectedRemaining += hypotheticalTotal;

    // Account for spending on non-leaf categories (e.g., records on root categories directly)
    const leafTotalCurrent = Object.values(categoryProjections).reduce((s, p) => s + p.currentTotal, 0);
    const unaccounted = Math.max(0, actualSpent - leafTotalCurrent);
    if (unaccounted > 0.01) {
      const unaccountedProjection = (unaccounted / Math.max(1, daysPassed)) * remainingDays;
      totalProjectedRemaining += unaccountedProjection;
    }

    // Aggregate to root level
    const rootProjections = {};
    rootCats.forEach(rc => {
      const children = Object.values(categoryProjections).filter(p => p.rootId === rc.id);
      const currentTotal = children.reduce((s, p) => s + p.currentTotal, 0);
      const projectedRemaining = children.reduce((s, p) => s + p.projectedRemaining, 0);
      rootProjections[rc.id] = {
        category: rc,
        currentTotal: currentTotal,
        projectedRemaining: projectedRemaining,
        projectedTotal: currentTotal + projectedRemaining,
        children: children
      };
    });

    // Global result
    const totalProjected = actualSpent + totalProjectedRemaining;
    const projectedSavings = netDisposable - totalProjected;
    const projectedDailyAvg = totalProjected / daysInMonth;
    const savingsAttained = projectedSavings >= targetAmount;

    // Current trend (for comparison) — use StatsEngine to match Overview exactly
    const trendTotal = isRolling ? StatsEngine.getPeriodPredictedTotal() : StatsEngine.getPredictedTotal(month);
    const trendDailyAvg = isRolling ? StatsEngine.getPeriodDailyAverage() : StatsEngine.getDailyAverage(month);
    const unpaidBills = Math.max(0, DataStore.getBillTotal(month) - (isRolling ? StatsEngine.getPeriodBillSpending() : StatsEngine.getBillSpendingActual(month)));
    const trendSavings = isRolling ? (income - trendTotal - unpaidBills) : (StatsEngine.getSavingsPrediction(month) - unpaidBills);

    console.log('[SimEngine] result:', {
      month,
      income, bills, actualSpent, totalProjectedRemaining, totalProjected,
      trendTotal, trendDailyAvg, trendSavings,
      daysPassed, remainingDays, daysInMonth,
      netDisposable, targetAmount, spendable,
      actualBills: StatsEngine.getBillSpendingActual(month),
      overviewPredicted: StatsEngine.getPredictedTotal(month),
      simTotalPlusBills: totalProjected + StatsEngine.getBillSpendingActual(month)
    });

    return {
      // Parameters used
      params: params,
      income: income,
      bills: bills,
      netDisposable: netDisposable,
      targetAmount: targetAmount,
      spendable: spendable,

      // Actuals
      daysPassed: daysPassed,
      remainingDays: remainingDays,
      daysInMonth: daysInMonth,
      actualSpent: actualSpent,

      // Projection
      totalProjected: totalProjected,
      projectedRemaining: totalProjectedRemaining,
      projectedDailyAvg: projectedDailyAvg,
      projectedSavings: projectedSavings,
      savingsAttained: savingsAttained,
      hypotheticalTotal: hypotheticalTotal,

      // Current trend (comparison)
      trendTotal: trendTotal,
      trendDailyAvg: trendDailyAvg,
      trendSavings: trendSavings,

      // Per-root-category breakdown
      rootProjections: rootProjections,

      // Hypothetical categories
      hypotheticalProjections: hypotheticalProjections,

      // Leaf projections for detail
      categoryProjections: categoryProjections
    };
  },

  /**
   * Get the current trend projection (no what-if changes).
   */
  getCurrentTrend(month) {
    return this.run(month, {});
  }
};

  // === EXPORTS ===
  window.SimulationEngine = SimulationEngine;
})();
