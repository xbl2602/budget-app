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
    const sp = StatsEngine.getSpendablePlan(month, {
      income: params.income,
      bills: params.bills,
      savingsTarget: params.savingsTarget
    });
    const income = sp.income;
    const bills = sp.totalBills;
    const netDisposable = sp.netDisposable;
    const targetAmount = sp.targetAmount;
    const planDueVirtual = sp.planDueVirtual;
    const spendable = sp.spendableBudget;

    // Get actual spending to date (variable categories only)
    const allRecords = expenseRecords((isRolling
      ? DataStore.getRecords()
          .filter(r => {
            const d = new Date(r.date || r.createdAt);
            return d >= periodOpts.start && d <= periodOpts.end && !StatsEngine.isBillCategory(r.categoryId);
          })
      : DataStore.getRecords()
          .filter(r => getMonthKey(r.date || r.createdAt) === month && !StatsEngine.isBillCategory(r.categoryId))));
    // Split bills: records are stored at the full bill amount, but others' shares
    // (paid OR unpaid) are not my spending. Subtract them so the simulation only
    // projects MY real share — consistent with the overview daily avg/prediction.
    const splitOthers = isRolling ? StatsEngine.getPeriodSplitOthers() : StatsEngine.getSplitOthers(month);
    const actualSpent = allRecords.reduce((s, r) => s + r.amount, 0) - splitOthers;
    const categoryTotals = {};
    const categoryDays = {};
    allRecords.forEach(r => {
      // Split records are stored at the full bill amount; only MY share counts in
      // the per-category projection (others' shares are uncollected money)
      let amt = r.amount;
      if (r.splitBillId && typeof SplitEngine !== 'undefined') {
        const bill = SplitEngine.getSplitBill(r.splitBillId);
        if (bill) amt = parseFloat(bill.selfShare) || 0;
      }
      categoryTotals[r.categoryId] = (categoryTotals[r.categoryId] || 0) + amt;
      const d = new Date(r.date || r.createdAt);
      const day = d.getDate();
      if (!categoryDays[r.categoryId]) categoryDays[r.categoryId] = new Set();
      categoryDays[r.categoryId].add(day);
    });

    // Build full category tree with current stats
    const allCats = DataStore.getCategories();
    const catMap = {}; allCats.forEach(c => catMap[c.id] = c);
    const rootCats = DataStore.getExpenseRootCategories();

    // Compute leaf category ids
    const leafCatIds = new Set();
    allCats.forEach(c => {
      // It's a leaf if it has no children
      const hasChildren = allCats.some(x => x.parentId === c.id);
      if (!hasChildren) leafCatIds.add(c.id);
    });

    // Get current daily average per category
    const getCurrentDailyAvg = (catId) => {
      // Fixed: guard against daysPassed=0 (M6)
      if (daysPassed <= 0) return 0;
      return (categoryTotals[catId] || 0) / daysPassed;
    };

    // For each leaf category, compute projected spending
    const categoryProjections = {};
    let totalProjectedRemaining = 0;
    const adjustments = (params.categoryAdjustments) || {};
    const globalAdj = params.globalAdjustment || { mode: null, value: null };

    // An adjustment belongs to the node the user set it on, and the nearest
    // ancestor-or-self that has an entry governs a leaf (an entry on a child —
    // even "keep trend" — overrides its parent's). Handing the parent's entry to
    // every leaf instead applied an absolute value once PER leaf: "餐饮 −RM2/day"
    // over four subcategories saved 4 × RM2/day, and a fixed remaining total of
    // RM100 became RM400. The percent / zero modes were never affected because
    // they scale each leaf and so add up to the same thing either way.
    const adjustmentSourceOf = (catId) => {
      const seen = new Set();
      let c = catMap[catId];
      while (c && !seen.has(c.id)) {
        if (adjustments[c.id]) return c.id;
        seen.add(c.id);
        c = c.parentId ? catMap[c.parentId] : null;
      }
      return null;
    };
    const governed = {};   // adjustment node id -> the leaf ids it governs
    leafCatIds.forEach(id => {
      const src = adjustmentSourceOf(id);
      if (src) (governed[src] = governed[src] || []).push(id);
    });

    // For the absolute modes (daily / total / adjust) the value describes the
    // governed group AS A WHOLE: work out the group's remaining spend once, then
    // hand each leaf its share by current pace (evenly when nothing has been
    // spent yet). The floor at zero applies to the group, not to each leaf.
    const groupTotals = {};
    const groupRemaining = (srcId) => {
      if (groupTotals[srcId] !== undefined) return groupTotals[srcId];
      const adj = adjustments[srcId];
      const v = adj.value || 0;
      const sumAvg = governed[srcId].reduce((s, id) => s + getCurrentDailyAvg(id), 0);
      let total;
      if (adj.mode === 'daily') total = v * remainingDays;
      else if (adj.mode === 'total') total = v;
      else total = (sumAvg + v) * remainingDays;   // 'adjust'
      groupTotals[srcId] = Math.max(0, total);
      return groupTotals[srcId];
    };
    const groupShare = (srcId, catId) => {
      const ids = governed[srcId];
      const sumAvg = ids.reduce((s, id) => s + getCurrentDailyAvg(id), 0);
      return sumAvg > 0 ? getCurrentDailyAvg(catId) / sumAvg : 1 / ids.length;
    };

    // Process leaf categories
    leafCatIds.forEach(catId => {
      const cat = catMap[catId];
      if (!cat) return;
      const rootId = cat.parentId || catId;
      const rootCat = rootId === catId ? cat : catMap[rootId];

      const srcId = adjustmentSourceOf(catId);
      const adj = srcId ? adjustments[srcId] : { mode: 'trend', value: null };

      const currentAvg = getCurrentDailyAvg(catId);
      let projectedRemaining;

      switch (adj.mode) {
        case 'daily':
        case 'total':
        case 'adjust':
          projectedRemaining = groupRemaining(srcId) * groupShare(srcId, catId);
          break;
        case 'percent':
          projectedRemaining = currentAvg * remainingDays * (1 + (adj.value || 0) / 100);
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

    // Split records carry the bill's REAL category (storage refactor B), so they
    // already project under their true category — no pseudo-category handling needed.

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

    // Current trend (for comparison) — use StatsEngine to match Overview exactly.
    // trendSavings nets against income, so it needs the cash-flow total (money
    // already spent on excludeFromAvg records must count), not the daily-average
    // trend total (A-1). trendDailyAvg stays a pure pace reading on purpose.
    const trendTotal = isRolling ? StatsEngine.getPeriodPredictedMonthEndTotal() : StatsEngine.getPredictedMonthEndTotal(month);
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
      overviewPredicted: StatsEngine.getPredictedMonthEndTotal(month),
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
      // Self-imposed instalments reserved out of `spendable`. Deliberately NOT
      // added to totalProjected: for save/borrow the money is retained, not
      // spent, so projectedSavings must keep counting it as saved. credit-mode
      // plans are already in actualSpent via their real records.
      planDueVirtual: planDueVirtual,

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
