/* ============================================================
   STATISTICS ENGINE
   ============================================================ */
(function() {
'use strict';

const StatsEngine = {
  getRecordsInMonth(month) {
    return DataStore.getRecords().filter(r => getMonthKey(r.date || r.createdAt) === month);
  },

  getMonthTotal(month) {
    return this.getRecordsInMonth(month).reduce((sum, r) => sum + (r.amount || 0), 0) - this.getSplitContrib(month);
  },

  getCategoryTotals(month) {
    const result = {};
    this.getRecordsInMonth(month).forEach(r => {
      result[r.categoryId] = (result[r.categoryId] || 0) + r.amount;
    });
    return result;
  },

  getDailyTotals(month, options = {}) {
    const daily = {};
    const records = options.excludeBills
      ? this.getRecordsInMonth(month).filter(r => !this.isBillCategory(r.categoryId))
      : this.getRecordsInMonth(month);
    records.forEach(r => {
      const d = new Date(r.date || r.createdAt);
      // Fixed: skip records with invalid dates (M4)
      if (isNaN(d.getTime())) return;
      const day = d.getDate();
      daily[day] = (daily[day] || 0) + r.amount;
    });
    const daysInMonth = new Date(parseInt(month.split('-')[0]), parseInt(month.split('-')[1]), 0).getDate();
    const result = [];
    for (let i = 1; i <= daysInMonth; i++) {
      result.push({ day: i, total: daily[i] || 0 });
    }
    // Net out split repayments per day (M14) — always subtract so sum(daily) === monthTotal
    const contrib = this._splitContribByDay(d => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'));
    Object.entries(contrib).forEach(([k, v]) => {
      if (k.indexOf(month) === 0) {
        const day = parseInt(k.slice(8), 10);
        daily[day] = (daily[day] || 0) - v;
      }
    });
    for (let i = 1; i <= daysInMonth; i++) {
      result[i - 1] = { day: i, total: daily[i] || 0 };
    }
    return result;
  },

  getDailyAverage(month) {
    const records = this.getRecordsInMonth(month).filter(r => !r.excludeFromAvg);
    if (!records.length) return 0;
    const daysInMonth = new Date(parseInt(month.split('-')[0]), parseInt(month.split('-')[1]), 0).getDate();
    const now = new Date();
    const today = now.getDate();
    const currentMonth = getMonthKey(now.toISOString());
    const daysPassed = month === currentMonth ? today : daysInMonth;
    // Only my real share counts toward daily avg — others' shares (paid or not)
    // are uncollected/collected money, not my spending
    return daysPassed ? (records.reduce((s, r) => s + r.amount, 0) - this.getSplitOthers(month)) / daysPassed : 0;
  },

  // TREND projection: "at this pace, how much will I spend by month-end". One-off
  // large purchases are excluded, same as getDailyAverage — these two must always
  // agree, or the daily-average card and the projection built from it would
  // contradict each other. This is the right number for habit-tracking (daily
  // average, heatmap, "at this rate"), and the WRONG number for anything that
  // gets subtracted from income — use getPredictedMonthEndTotal for that (A-1).
  getPredictedTotal(month) {
    const records = this.getRecordsInMonth(month).filter(r => !r.excludeFromAvg);
    if (!records.length) return 0;
    const daysInMonth = new Date(parseInt(month.split('-')[0]), parseInt(month.split('-')[1]), 0).getDate();
    const now = new Date();
    const today = now.getDate();
    const currentMonth = getMonthKey(now.toISOString());
    const daysPassed = month === currentMonth ? today : daysInMonth;
    const total = records.reduce((s, r) => s + r.amount, 0);
    // Fixed: guard against daysPassed=0 (first day of month) (M5)
    if (daysPassed <= 0) return 0;
    // Projection based on my real share only (others' shares excluded)
    return ((total - this.getSplitOthers(month)) / daysPassed) * daysInMonth;
  },

  // CASH-FLOW projection: "how much will actually have left my wallet by
  // month-end". Same trend as getPredictedTotal, but the one-off large purchases
  // it excludes already really happened, so their actual amount is added back in.
  // Anything that nets against income — savings prediction, budget ring, report,
  // What-If baseline, simulator — needs this version, or a checked "exclude from
  // daily avg" record makes the projected total dip below money already spent
  // and the savings forecast comes out systematically inflated (A-1).
  getPredictedMonthEndTotal(month) {
    const excludedActual = this.getRecordsInMonth(month)
      .filter(r => r && r.excludeFromAvg)
      .reduce((s, r) => s + (r.amount || 0), 0);
    return round2(this.getPredictedTotal(month) + excludedActual);
  },

  getSavingsPrediction(month) {
    const budget = DataStore.getMonthlyIncome(month) || DataStore.getBudget(month);
    const predicted = this.getPredictedMonthEndTotal(month);
    return budget - predicted;
  },

  getRemainingDailyLimit(month) {
    const budget = DataStore.getMonthlyIncome(month) || DataStore.getBudget(month);
    if (!budget) return 0;
    const spent = this.getMonthTotal(month);
    const remaining = budget - spent;
    const now = new Date();
    const daysInMonth = new Date(parseInt(month.split('-')[0]), parseInt(month.split('-')[1]), 0).getDate();
    const today = now.getDate();
    const currentMonth = getMonthKey(now.toISOString());
    const remainingDays = month === currentMonth ? (daysInMonth - today) : 0;
    if (remainingDays <= 0) return 0;
    return remaining / remainingDays;
  },

  getCategoryBreakdownDeep(month, categoryId) {
    const cat = DataStore.getCategory(categoryId);
    if (!cat) return null;
    const records = this.getRecordsInMonth(month).filter(r => r.categoryId === categoryId);
    const children = DataStore.getChildren(categoryId);
    const breakdown = {
      category: cat,
      total: records.reduce((s, r) => s + r.amount, 0),
      count: records.length,
      children: []
    };
    children.forEach(child => {
      const childBreak = this.getCategoryBreakdownDeep(month, child.id);
      if (childBreak) {
        breakdown.total += childBreak.total;
        breakdown.children.push(childBreak);
      }
    });
    return breakdown;
  },

  getCustomRangeTotals(startDate, endDate) {
    const start = new Date(startDate);
    const end = new Date(endDate);
    const records = DataStore.getRecords().filter(r => {
      const d = new Date(r.date || r.createdAt);
      return d >= start && d <= end;
    });
    const daily = {};
    records.forEach(r => {
      const key = (r.date || r.createdAt).substr(0, 10);
      daily[key] = (daily[key] || 0) + r.amount;
    });
    return {
      total: records.reduce((s, r) => s + r.amount, 0) - this._splitContribBetween(start, end),
      count: records.length,
      splitContrib: this._splitContribBetween(start, end),
      daily: Object.entries(daily).sort((a,b) => a[0].localeCompare(b[0])).map(([day, total]) => ({ day, total })),
      categoryTotals: (() => {
        const ct = {};
        records.forEach(r => {
          ct[r.categoryId] = (ct[r.categoryId] || 0) + r.amount;
        });
        return ct;
      })()
    };
  },

  // ===== Split Contributions (reimbursements reduce spending) =====
  _splitContribBetween(start, end) {
    let total = 0;
    const bills = (typeof SplitEngine !== 'undefined' && SplitEngine.getSplitBills) ? SplitEngine.getSplitBills() : [];
    bills.forEach(b => {
      if (b.payer !== 'self') return;
      const d = new Date(b.date);
      if (isNaN(d.getTime()) || d < start || d > end) return;
      (b.participants || []).forEach(p => {
        // Money actually received — a partial repayment counts for what it is
        const amt = SplitEngine.partPaid(p);
        if (amt > 0) total += amt;
      });
    });
    return total;
  },

  // All others' shares (paid AND unpaid) in range — the part of split records that
  // is NOT my real spending. Daily averages / projections subtract this so they
  // only reflect my own share (未收回账目 excluded, matching user intent).
  _splitOthersBetween(start, end) {
    let total = 0;
    const bills = (typeof SplitEngine !== 'undefined' && SplitEngine.getSplitBills) ? SplitEngine.getSplitBills() : [];
    bills.forEach(b => {
      if (b.payer !== 'self') return;
      const d = new Date(b.date);
      if (isNaN(d.getTime()) || d < start || d > end) return;
      (b.participants || []).forEach(p => {
        const amt = parseFloat(p.share) || 0;
        if (amt > 0) total += amt;
      });
    });
    return total;
  },

  // Unpaid others' shares only (未收回账目) — shown in the overview total caption
  _splitUnpaidBetween(start, end) {
    let total = 0;
    const bills = (typeof SplitEngine !== 'undefined' && SplitEngine.getSplitBills) ? SplitEngine.getSplitBills() : [];
    bills.forEach(b => {
      if (b.payer !== 'self') return;
      const d = new Date(b.date);
      if (isNaN(d.getTime()) || d < start || d > end) return;
      (b.participants || []).forEach(p => {
        const amt = SplitEngine.partOwed(p);   // still outstanding, partials netted off
        if (amt > 0) total += amt;
      });
    });
    return total;
  },

  // Split contributions keyed by day (for daily totals), using the caller's key fn
  _splitContribByDay(keyFn) {
    const map = {};
    const bills = (typeof SplitEngine !== 'undefined' && SplitEngine.getSplitBills) ? SplitEngine.getSplitBills() : [];
    bills.forEach(b => {
      if (b.payer !== 'self') return;
      const d = new Date(b.date);
      if (isNaN(d.getTime())) return;
      let paidSum = 0;
      (b.participants || []).forEach(p => { paidSum += SplitEngine.partPaid(p); });
      if (paidSum <= 0) return;
      const key = keyFn(d);
      map[key] = (map[key] || 0) + paidSum;
    });
    return map;
  },

  getSplitContrib(month) {
    const start = new Date(month + '-01T00:00:00');
    const end = new Date(month + '-01T23:59:59');
    end.setMonth(end.getMonth() + 1);
    end.setDate(0);
    return this._splitContribBetween(start, end);
  },

  getSplitOthers(month) {
    const start = new Date(month + '-01T00:00:00');
    const end = new Date(month + '-01T23:59:59');
    end.setMonth(end.getMonth() + 1);
    end.setDate(0);
    return this._splitOthersBetween(start, end);
  },

  getSplitUnpaid(month) {
    const start = new Date(month + '-01T00:00:00');
    const end = new Date(month + '-01T23:59:59');
    end.setMonth(end.getMonth() + 1);
    end.setDate(0);
    return this._splitUnpaidBetween(start, end);
  },

  getPeriodSplitContrib() {
    const { start, end } = getPeriodDateRange();
    return this._splitContribBetween(start, end);
  },

  getPeriodSplitOthers() {
    const { start, end } = getPeriodDateRange();
    return this._splitOthersBetween(start, end);
  },

  getPeriodSplitUnpaid() {
    const { start, end } = getPeriodDateRange();
    return this._splitUnpaidBetween(start, end);
  },

  getCustomSplitContrib(startDate, endDate) {
    return this._splitContribBetween(new Date(startDate), new Date(endDate));
  },

  getOverspentCategories(month) {
    const catTotals = this.getCategoryTotals(month);
    const budget = DataStore.getMonthlyIncome(month) || DataStore.getBudget(month);
    if (!budget) return [];
    const overspent = [];
    Object.entries(catTotals).forEach(([catId, total]) => {
      const cat = DataStore.getCategory(catId);
      if (cat) {
        const pct = (total / budget) * 100;
        if (pct > 80) {
          overspent.push({ category: cat, total, percent: pct });
        }
      }
    });
    return overspent.sort((a,b) => b.percent - a.percent);
  },

  getLast7Days() {
    const result = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const key = d.toISOString().substr(0, 10);
      const dayTotal = DataStore.getRecords().filter(r => {
        const rd = (r.date || r.createdAt).substr(0, 10);
        return rd === key;
      }).reduce((s, r) => s + r.amount, 0);
      result.push({ date: key, total: dayTotal, label: (d.getMonth()+1)+'/'+d.getDate() });
    }
    return result;
  },

  // Check if a category is a bill category
  isBillCategory(categoryId) {
    const billCats = DataStore.getBillCategories();
    return billCats.some(b => b.id === categoryId);
  },

  // Get spending in bill categories only (for a month)
  getBillSpendingActual(month) {
    return this.getRecordsInMonth(month)
      .filter(r => this.isBillCategory(r.categoryId))
      .reduce((sum, r) => sum + r.amount, 0);
  },

  // Get spending in non-bill categories only
  getVariableSpending(month) {
    return this.getRecordsInMonth(month)
      .filter(r => !this.isBillCategory(r.categoryId))
      .reduce((sum, r) => sum + r.amount, 0) - this.getSplitContrib(month);
  },

  // Get daily totals excluding bills
  getDailyTotalsVariable(month) {
    const daily = {};
    this.getRecordsInMonth(month)
      .filter(r => !this.isBillCategory(r.categoryId))
      .forEach(r => {
        const d = new Date(r.date || r.createdAt);
        const day = d.getDate();
        daily[day] = (daily[day] || 0) + r.amount;
      });
    const daysInMonth = new Date(parseInt(month.split('-')[0]), parseInt(month.split('-')[1]), 0).getDate();
    const result = [];
    for (let i = 1; i <= daysInMonth; i++) {
      result.push({ day: i, total: daily[i] || 0 });
    }
    // Net out split repayments per day
    const contribV = this._splitContribByDay(d => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'));
    Object.entries(contribV).forEach(([k, v]) => {
      if (k.indexOf(month) === 0) {
        const day = parseInt(k.slice(8), 10);
        if (day in daily) daily[day] -= v;
      }
    });
    for (let i = 1; i <= daysInMonth; i++) {
      result[i - 1] = { day: i, total: daily[i] || 0 };
    }
    return result;
  },

  // Get daily average excluding bills
  getDailyAverageVariable(month) {
    const records = this.getRecordsInMonth(month).filter(r => !this.isBillCategory(r.categoryId) && !r.excludeFromAvg);
    if (!records.length) return 0;
    const daysInMonth = new Date(parseInt(month.split('-')[0]), parseInt(month.split('-')[1]), 0).getDate();
    const now = new Date();
    const today = now.getDate();
    const currentMonth = getMonthKey(now.toISOString());
    const daysPassed = month === currentMonth ? today : daysInMonth;
    const varTotal = records.reduce((s, r) => s + r.amount, 0);
    // My real share only (others' shares excluded from daily avg)
    return daysPassed ? (varTotal - this.getSplitOthers(month)) / daysPassed : 0;
  },

  // Get combined disposable info
  getDisposableInfo(month) {
    const income = DataStore.getMonthlyIncome(month);
    const billPlanned = DataStore.getBillTotal(month);
    const billActual = this.getBillSpendingActual(month);
    const variableSpending = this.getVariableSpending(month);
    const netDisposable = Math.max(0, income - billPlanned);
    const daysInMonth = new Date(parseInt(month.split('-')[0]), parseInt(month.split('-')[1]), 0).getDate();
    const now = new Date();
    const today = now.getDate();
    const currentMonth = getMonthKey(now.toISOString());
    const daysPassed = month === currentMonth ? today : daysInMonth;
    const netDailyAvg = daysPassed > 0 ? variableSpending / daysPassed : 0;
    return { income, billPlanned, billActual, variableSpending, netDisposable, netDailyAvg };
  },

  // Single source of truth for the "how much can I actually spend" chain.
  // This arithmetic used to be copy-pasted across six render sites (overview x2,
  // stats x2, report, simulation); every one of them now calls this instead.
  // planDueVirtual is the new term: self-imposed instalments carve their monthly
  // amount out of the spendable budget, which is what makes those months pinch.
  // `opts` lets What-If feed hypothetical income/bills/target through the same
  // chain instead of keeping its own divergent copy.
  getSpendablePlan(month, opts) {
    opts = opts || {};
    const income = opts.income != null ? opts.income : (DataStore.getMonthlyIncome(month) || DataStore.getBudget(month) || 0);
    const totalBills = opts.bills != null ? opts.bills : DataStore.getBillTotal(month);
    const netDisposable = Math.max(0, income - totalBills);
    const percentBase = DataStore.getPercentBase();
    const baseAmount = percentBase === 'net' ? netDisposable : income;
    const t = opts.savingsTarget || DataStore.getSavingsTarget() || {};
    let targetAmount = 0;
    if (t.type === 'fixed') targetAmount = t.fixedAmount || 0;
    else if (t.type === 'percent') targetAmount = baseAmount * (t.percent || 0) / 100;
    const planDueVirtual = (typeof PlanMath !== 'undefined') ? PlanMath.getVirtualDue(month) : 0;
    const spendableBudget = Math.max(0, netDisposable - targetAmount - planDueVirtual);
    return { income, totalBills, netDisposable, baseAmount, targetAmount, planDueVirtual, spendableBudget };
  },

  getMonthlyTotals(numMonths = 6) {
    const result = [];
    const now = new Date();
    for (let i = numMonths - 1; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
      const total = this.getMonthTotal(key);
      result.push({ month: key, total, label: key });
    }
    return result;
  },

  // ===== Period-Aware Methods (Stats Range: month or rolling30) =====
  getPeriodRecords() {
    const { start, end } = getPeriodDateRange();
    return DataStore.getRecords().filter(r => {
      const d = new Date(r.date || r.createdAt);
      return d >= start && d <= end && !r._deleted;
    });
  },
  getPeriodTotal() {
    return this.getPeriodRecords().reduce((s, r) => s + r.amount, 0) - this.getPeriodSplitContrib();
  },
  getPeriodDailyAverage() {
    const { daysPassed } = getPeriodDateRange();
    // Total minus uncollected shares = my real spending only
    const realSpent = this.getPeriodTotal() - this.getPeriodSplitUnpaid();
    return daysPassed > 0 ? realSpent / daysPassed : 0;
  },
  // TREND twin of getPredictedTotal for the rolling-30-day range. Must filter
  // excludeFromAvg the same way the month version does — otherwise switching the
  // Stats Range setting alone changes what "exclude from daily avg" means, and
  // the same data shows two different predicted totals depending on which
  // range happens to be selected (A-2).
  getPeriodPredictedTotal() {
    const { daysPassed, daysInPeriod } = getPeriodDateRange();
    if (daysPassed === 0) return 0;
    const records = this.getPeriodRecords().filter(r => !r.excludeFromAvg);
    const realSpent = records.reduce((s, r) => s + r.amount, 0) - this.getPeriodSplitOthers();
    const avg = realSpent / daysPassed;
    return Math.round(avg * daysInPeriod * 100) / 100;
  },

  // CASH-FLOW twin of getPredictedMonthEndTotal for the rolling-30-day range —
  // see that function for why the excluded amount has to be added back in for
  // anything netted against income (A-1, A-2).
  getPeriodPredictedMonthEndTotal() {
    const excludedActual = this.getPeriodRecords()
      .filter(r => r && r.excludeFromAvg)
      .reduce((s, r) => s + (r.amount || 0), 0);
    return round2(this.getPeriodPredictedTotal() + excludedActual);
  },
  getPeriodCategoryTotals() {
    const records = this.getPeriodRecords();
    const totals = {};
    records.forEach(r => {
      totals[r.categoryId] = (totals[r.categoryId] || 0) + r.amount;
    });
    return totals;
  },
  getPeriodRemainingDailyLimit() {
    const { daysPassed, daysInPeriod } = getPeriodDateRange();
    const income = DataStore.getMonthlyIncome(getMonthKey(new Date().toISOString())) || DataStore.getBudget(getMonthKey(new Date().toISOString()));
    if (!income || income <= 0) return 0;
    const spent = this.getPeriodTotal();
    const remainingDays = daysInPeriod - daysPassed;
    if (remainingDays <= 0) return 0;
    const remainingAmt = income - spent;
    return Math.max(0, remainingAmt / remainingDays);
  },
  getPeriodBillSpending() {
    const records = this.getPeriodRecords();
    const billCatIds = new Set((DataStore.getBillCategories() || []).map(c => c.id));
    return records.filter(r => billCatIds.has(r.categoryId)).reduce((s, r) => s + r.amount, 0);
  },
  getPeriodVariableSpending() {
    return this.getPeriodTotal() - this.getPeriodBillSpending();
  },
  getPeriodDailyTotals(options = {}) {
    const daily = {};
    const records = options.excludeBills
      ? this.getPeriodRecords().filter(r => !this.isBillCategory(r.categoryId))
      : this.getPeriodRecords();
    records.forEach(r => {
      const d = new Date(r.date || r.createdAt);
      const dayKey = d.toISOString().substr(0, 10);
      daily[dayKey] = (daily[dayKey] || 0) + r.amount;
    });
    // Net out split repayments per day
    const contribP = this._splitContribByDay(d => d.toISOString().substr(0, 10));
    Object.entries(contribP).forEach(([k, v]) => {
      if (k in daily) daily[k] -= v;
    });
    return Object.entries(daily).sort((a,b) => a[0].localeCompare(b[0])).map(([day, total]) => ({ day, total }));
  }
};

/* ============================================================
   PURCHASE PLAN MATH (大额分期消费计划)

   Design note: the repayment ledger is NOT stored. How much a plan actually
   repaid in month M is a pure function of that month's income, bills and
   records — all of which are already persisted. We replay the waterfall from
   the earliest startMonth up to the requested month.

   Why derive instead of store:
     - checkMonthRollover() only runs on app open and fires once even if the
       user skipped two months, so a stored counter would drift
     - editing a record from three months ago correctly re-flows every later
       instalment
     - no ledger/reality mismatch is possible

   Only manual interventions (lump catch-up, hand-edited period) are stored,
   in plan.overrides[month].
   ============================================================ */

function round2(n) {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

function monthToIndex(m) {
  const parts = String(m || '').split('-');
  const y = parseInt(parts[0], 10);
  const mo = parseInt(parts[1], 10);
  if (!isFinite(y) || !isFinite(mo)) return NaN;
  return y * 12 + (mo - 1);
}

function indexToMonth(idx) {
  const y = Math.floor(idx / 12);
  const mo = (idx % 12) + 1;
  return y + '-' + String(mo).padStart(2, '0');
}

// Money left over in month M after real spending and still-unpaid planned bills.
// Returns null when the month has no income on record — that is "unknown", not
// "nothing was repaid", and the two must not be conflated or a plan whose owner
// never set an income would stall forever.
function monthSurplus(m) {
  const income = DataStore.getMonthlyIncome(m) || DataStore.getBudget(m) || 0;
  if (income <= 0) return null;
  const monthTotal = StatsEngine.getMonthTotal(m);
  const billPlanned = DataStore.getBillTotal(m);
  const billActual = StatsEngine.getBillSpendingActual(m);
  const unpaidPlannedBills = Math.max(0, billPlanned - billActual);
  return Math.max(0, income - (monthTotal + unpaidPlannedBills));
}

const PlanMath = {
  _cache: null,

  // Replay every plan month-by-month up to `upToMonth`.
  // Memoized against DataStore._rev so repeated renders in one frame are free.
  computeUpTo(upToMonth) {
    const key = upToMonth + '|' + (DataStore._rev || 0);
    if (this._cache && this._cache.key === key) return this._cache.value;
    const value = this._compute(upToMonth);
    this._cache = { key: key, value: value };
    return value;
  },

  _compute(upToMonth) {
    const result = {};
    const plans = DataStore.getPurchasePlans().filter(p => p && p.status !== 'cancelled');
    if (!plans.length) return result;

    let startIdx = Infinity;
    plans.forEach(p => {
      const s = monthToIndex(p.startMonth);
      if (isFinite(s)) startIdx = Math.min(startIdx, s);
      result[p.id] = { plan: p, paid: 0, remaining: p.totalAmount, byMonth: {}, completedMonth: null };
    });

    const endIdx = monthToIndex(upToMonth);
    if (!isFinite(startIdx) || !isFinite(endIdx) || endIdx < startIdx) {
      this._finalize(result, endIdx, upToMonth);
      return result;
    }

    const MAX_MONTHS = 600; // hard bound so corrupt dates can't hang the render
    for (let idx = startIdx; idx <= endIdx && (idx - startIdx) < MAX_MONTHS; idx++) {
      const m = indexToMonth(idx);
      const raw = monthSurplus(m);
      const incomeKnown = raw !== null;
      let surplus = incomeKnown ? raw : 0;

      // Earliest deadline first, so a plan about to expire gets paid before one
      // with months of runway left. Ties break on creation order.
      const active = this._byDeadline(plans.filter(p => {
        const st = result[p.id];
        if (!st || st.remaining <= 0.005) return false;
        const s = monthToIndex(p.startMonth);
        return isFinite(s) && idx >= s;
      }));

      active.forEach(p => {
        const st = result[p.id];
        const elapsed = idx - monthToIndex(p.startMonth);
        const periodsLeft = Math.max(1, p.months - elapsed);
        let due, actual;

        if (p.mode === 'credit') {
          // Bank instalment: the amount is fixed and non-negotiable, and a real
          // record backs it — that record already consumed `surplus` via
          // getMonthTotal, so do NOT deduct it again here.
          due = Math.min(p.totalAmount / p.months, st.remaining);
          actual = due;
        } else {
          // Self-imposed: shortfalls roll into the remaining periods, so the due
          // amount climbs until the debt clears.
          due = st.remaining / periodsLeft;
          const ov = p.overrides ? p.overrides[m] : undefined;
          if (typeof ov === 'number' && isFinite(ov)) {
            actual = Math.max(0, Math.min(ov, st.remaining));
          } else if (!incomeKnown) {
            actual = due; // assume on schedule rather than stalling the plan
          } else {
            actual = Math.max(0, Math.min(due, surplus)); // debt before savings
          }
          surplus -= actual;
        }

        st.paid += actual;
        st.remaining = Math.max(0, p.totalAmount - st.paid);
        st.byMonth[m] = {
          due: round2(due),
          actual: round2(actual),
          short: round2(Math.max(0, due - actual)),
          incomeKnown: incomeKnown
        };
        if (st.remaining <= 0.005 && !st.completedMonth) st.completedMonth = m;
      });
    }

    this._finalize(result, endIdx, upToMonth);
    return result;
  },

  _finalize(result, endIdx, upToMonth) {
    Object.keys(result).forEach(id => {
      const st = result[id];
      const p = st.plan;
      const sIdx = monthToIndex(p.startMonth);
      st.paid = round2(st.paid);
      st.remaining = round2(st.remaining);
      st.endMonth = isFinite(sIdx) ? indexToMonth(sIdx + p.months - 1) : p.startMonth;
      st.isComplete = st.remaining <= 0.005;
      st.isOverdue = !st.isComplete && isFinite(endIdx) && endIdx > monthToIndex(st.endMonth);
      st.periodsLeft = isFinite(sIdx) && isFinite(endIdx)
        ? Math.max(0, p.months - (endIdx - sIdx) - 1)
        : p.months;
      st.progressPct = p.totalAmount > 0 ? Math.min(100, (st.paid / p.totalAmount) * 100) : 0;
      const cur = st.byMonth[upToMonth];
      st.dueThisMonth = cur ? cur.due : 0;
      st.paidThisMonth = cur ? cur.actual : 0;
      st.shortThisMonth = cur ? cur.short : 0;
      st.onTrack = !cur || cur.short <= 0.005;
    });
  },

  // Total that must be carved out of the spendable budget this month.
  // credit-mode plans are excluded: their real record already squeezes the
  // budget through monthTotal, and subtracting twice would double-count.
  getVirtualDue(month) {
    const state = this.computeUpTo(month);
    let sum = 0;
    Object.keys(state).forEach(id => {
      const st = state[id];
      if (st.plan.mode === 'credit') return;
      if (st.plan.status !== 'active') return;
      const cur = st.byMonth[month];
      if (cur) sum += cur.due;
    });
    return round2(sum);
  },

  // Earliest deadline first, ties on creation order — the allocation order used
  // by both the settled waterfall and the forecast, so they never disagree.
  _byDeadline(plans) {
    return plans.slice().sort((a, b) => {
      const ea = monthToIndex(a.startMonth) + a.months;
      const eb = monthToIndex(b.startMonth) + b.months;
      if (ea !== eb) return ea - eb;
      return String(a.createdAt || '').localeCompare(String(b.createdAt || ''));
    });
  },

  /* --------------------------------------------------------
     FORECAST — "at your current pace, how does this month end?"

     The settled waterfall uses money already spent, so early in the month it
     flatters you: surplus looks large simply because the month is young. This
     projects month-end spending from the daily pace instead, then runs the same
     debt-before-savings waterfall on those numbers.
     -------------------------------------------------------- */
  getForecast(month) {
    const now = new Date();
    const isCurrent = month === getMonthKey(now.toISOString());
    // A daily-pace projection is wild in the first few days — RM100 on the 1st
    // extrapolates to RM3100. Don't hand the user a verdict off that little data.
    const daysPassed = isCurrent
      ? now.getDate()
      : new Date(parseInt(month.split('-')[0]), parseInt(month.split('-')[1]), 0).getDate();
    const reliable = daysPassed >= 4;

    const income = DataStore.getMonthlyIncome(month) || DataStore.getBudget(month) || 0;
    const billPlanned = DataStore.getBillTotal(month);
    const billActual = StatsEngine.getBillSpendingActual(month);
    const unpaidPlannedBills = Math.max(0, billPlanned - billActual);

    // Cash-flow projection: getPredictedTotal excludes one-off large purchases
    // (incl. credit-mode instalment records) from the daily-pace trend, but that
    // money really did leave — getPredictedMonthEndTotal adds the committed
    // amounts back in. This used to be reimplemented here; now it's the same
    // shared function every other "predicted month-end spend" consumer uses (A-1).
    const predictedSpend = StatsEngine.getPredictedMonthEndTotal(month);
    let surplus = Math.max(0, income - (predictedSpend + unpaidPlannedBills));
    const predictedSurplus = round2(surplus);

    const t = DataStore.getSavingsTarget() || {};
    const percentBase = DataStore.getPercentBase();
    const netDisposable = Math.max(0, income - billPlanned);
    const baseAmount = percentBase === 'net' ? netDisposable : income;
    let targetAmount = 0;
    if (t.type === 'fixed') targetAmount = t.fixedAmount || 0;
    else if (t.type === 'percent') targetAmount = baseAmount * (t.percent || 0) / 100;

    const state = this.computeUpTo(month);
    const active = this._byDeadline(
      DataStore.getPurchasePlans().filter(p => p && p.status === 'active' && state[p.id] && state[p.id].byMonth[month])
    );

    const plans = {};
    let totalDue = 0, totalPay = 0;
    active.forEach(p => {
      const cur = state[p.id].byMonth[month];
      let pay;
      if (p.mode === 'credit') {
        // Fixed and non-negotiable; its record is already inside predictedSpend
        pay = cur.due;
      } else {
        pay = Math.max(0, Math.min(cur.due, surplus));
        surplus -= pay;
      }
      totalDue += cur.due;
      totalPay += pay;
      plans[p.id] = {
        due: round2(cur.due),
        predictedPay: round2(pay),
        shortfall: round2(Math.max(0, cur.due - pay))
      };
    });

    const predictedSavings = round2(Math.max(0, surplus));
    return {
      month: month,
      income: income,
      predictedSpend: predictedSpend,
      predictedSurplus: predictedSurplus,
      plans: plans,
      totalDue: round2(totalDue),
      totalPredictedPay: round2(totalPay),
      totalShortfall: round2(Math.max(0, totalDue - totalPay)),
      targetAmount: round2(targetAmount),
      predictedSavings: predictedSavings,
      targetMet: predictedSavings >= targetAmount - 0.005,
      savingsShortfall: round2(Math.max(0, targetAmount - predictedSavings)),
      hasData: income > 0,
      daysPassed: daysPassed,
      reliable: reliable
    };
  },

  // What self-imposed plans actually consumed this month (may be less than the
  // due amount when the month came up short). Subtracting this from the app's
  // "累计已存" gives the part of the surplus that is genuinely free.
  getVirtualPaid(month) {
    const state = this.computeUpTo(month);
    let sum = 0;
    Object.keys(state).forEach(id => {
      const st = state[id];
      if (st.plan.mode === 'credit') return;
      if (st.plan.status !== 'active') return;
      const cur = st.byMonth[month];
      if (cur) sum += cur.actual;
    });
    return round2(sum);
  },

  // All plans with something still owed in this month, for UI listing
  getActiveStates(month) {
    const state = this.computeUpTo(month);
    return Object.keys(state)
      .map(id => state[id])
      .filter(st => st.plan.status === 'active');
  },

  getState(planId, month) {
    return this.computeUpTo(month)[planId] || null;
  },

  monthToIndex: monthToIndex,
  indexToMonth: indexToMonth
};

  // === EXPORTS ===
  window.StatsEngine = StatsEngine;
  window.PlanMath = PlanMath;
})();
