/* ============================================================
   STATISTICS ENGINE
   ============================================================ */
(function() {
'use strict';

const StatsEngine = {
  // ===== The income boundary =====
  // Everything below this line that answers a SPENDING question goes through
  // getRecordsInMonth / getPeriodRecords, and those two deliberately drop income
  // rows. That is why no individual total had to be rewritten when income landed:
  // the two chokepoints were already where every monthly and period-wide figure
  // was assembled. Income is summed separately by getMonthIncome & friends.
  getRecordsInMonth(month) {
    return expenseRecords(DataStore.getRecords().filter(r => getMonthKey(r.date || r.createdAt) === month));
  },
  getIncomeRecordsInMonth(month) {
    return incomeRecords(DataStore.getRecords().filter(r => getMonthKey(r.date || r.createdAt) === month));
  },
  getMonthIncome(month) {
    return this.getIncomeRecordsInMonth(month).reduce((s, r) => s + (r.amount || 0), 0);
  },
  getMonthNet(month) {
    return round2(this.getMonthIncome(month) - this.getMonthTotal(month));
  },
  getIncomeCategoryTotals(month) {
    const result = {};
    this.getIncomeRecordsInMonth(month).forEach(r => {
      result[r.categoryId] = (result[r.categoryId] || 0) + r.amount;
    });
    return result;
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
      ? this.getRecordsInMonth(month).filter(r => !this.isFixedRecord(r))
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
    // are uncollected/collected money, not my spending. Taken off only for the
    // records that are in this sum (splitOthersOf), never the whole month's total.
    return daysPassed ? (records.reduce((s, r) => s + r.amount, 0) - this.splitOthersOf(records)) / daysPassed : 0;
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
    return ((total - this.splitOthersOf(records)) / daysPassed) * daysInMonth;
  },

  // CASH-FLOW projection: "how much will actually have left my wallet by
  // month-end". Same trend as getPredictedTotal, but the one-off large purchases
  // it excludes already really happened, so their actual amount is added back in.
  // Anything that nets against income — savings prediction, budget ring, report,
  // What-If baseline, simulator — needs this version, or a checked "exclude from
  // daily avg" record makes the projected total dip below money already spent
  // and the savings forecast comes out systematically inflated (A-1).
  //
  // Only the everyday part is projected. Everything else is a known amount: large
  // purchases and card instalments are already gone; a bill is a fixed amount,
  // not a daily pace (scaling "rent paid on the 3rd" by days-in-month ÷ days-passed
  // turned RM1000 into RM3100 on the 10th); and a bill that is planned but not yet
  // paid is money that WILL leave this month. All of it is in here, so nothing
  // that nets against income has to subtract unpaid bills a second time.
  getPredictedMonthEndTotal(month) {
    return this.getPredictedBreakdown(month).predicted;
  },

  // Disjoint parts of the cash-flow prediction, always summing to `predicted`.
  // They follow the 含固定账单 switch's own definition of "fixed" (a bill-category
  // record, or a card-instalment record), so switching it off removes exactly
  // bills + billsUnpaid + instalments:
  //   bills       — records in the monthly-bill categories, at face value
  //   billsUnpaid — planned monthly bills not yet paid (planned − paid, never < 0)
  //   instalments — card-instalment records (planId), at face value
  //   large       — 不计日均 records that are neither of the above, at face value
  //   normal      — my share of everyday spending, projected at its daily pace
  // Others' split shares are not mine, and they come off the part their OWN record
  // sits in: a utility bill split with a flatmate is a smaller bill, not smaller
  // lunches. (They used to be taken off the everyday pace whatever the record was,
  // which dragged the daily average down and the forecast with it.)
  _predictParts(records, daysPassed, daysInPeriod, unpaidBills) {
    let bills = 0, inst = 0, large = 0, pace = 0;
    const seen = new Set();
    (records || []).forEach(r => {
      if (!r) return;
      let a = r.amount || 0;
      if (r.splitBillId && !seen.has(r.splitBillId)) {
        seen.add(r.splitBillId);
        a = Math.max(0, a - this._othersShareOfBill(r.splitBillId));
      }
      if (this.isBillCategory(r.categoryId)) bills += a;
      else if (r.planId) inst += a;
      else if (r.excludeFromAvg) large += a;
      else pace += a;
    });
    const trend = daysPassed > 0 ? (pace / daysPassed) * daysInPeriod : 0;
    const b = round2(bills), u = round2(Math.max(0, unpaidBills || 0)), i = round2(inst), l = round2(large);
    const predicted = round2(b + u + i + l + trend);
    return { bills: b, billsUnpaid: u, instalments: i, large: l, normal: round2(predicted - b - u - i - l), predicted: predicted };
  },

  // Planned monthly bills not yet paid — the one definition every page uses.
  getUnpaidPlannedBills(month) {
    return Math.max(0, DataStore.getBillTotal(month) - this.getBillSpendingActual(month));
  },
  getPeriodUnpaidPlannedBills() {
    return Math.max(0, DataStore.getBillTotal(getMonthKey(new Date().toISOString())) - this.getPeriodBillSpending());
  },

  getPredictedBreakdown(month) {
    const parts = String(month || '').split('-');
    const daysInMonth = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10), 0).getDate() || 30;
    const now = new Date();
    const daysPassed = month === getMonthKey(now.toISOString()) ? now.getDate() : daysInMonth;
    return this._predictParts(this.getRecordsInMonth(month), daysPassed, daysInMonth, this.getUnpaidPlannedBills(month));
  },

  // Variable (ex-bills) twin: large (non-bill excludeFromAvg, already happened)
  // + normal (projected daily trend, net of splits) = cash-flow variable total.
  getPredictedBreakdownVariable(month) {
    const records = this.getRecordsInMonth(month).filter(r => r && !this.isFixedRecord(r));
    const large = round2(records.filter(r => r.excludeFromAvg).reduce((s, r) => s + (r.amount || 0), 0));
    const predictedTrend = round2(this.getDailyAverageVariable(month) * (new Date(parseInt(String(month).split('-')[0], 10), parseInt(String(month).split('-')[1], 10), 0).getDate() || 30));
    const predicted = round2(predictedTrend + large);
    let normal = round2(Math.max(0, predicted - large));
    return { bills: 0, billsUnpaid: 0, instalments: 0, large: large, normal: normal, predicted: predicted };
  },

  // Rolling-30-day twins (same split, period window).
  getPeriodPredictedBreakdown() {
    const range = getPeriodDateRange();
    return this._predictParts(this.getPeriodRecords(), range.daysPassed || 0, range.daysInPeriod || 30, this.getPeriodUnpaidPlannedBills());
  },

  getPeriodPredictedBreakdownVariable() {
    const records = this.getPeriodRecords().filter(r => r && !this.isFixedRecord(r));
    const large = round2(records.filter(r => r.excludeFromAvg).reduce((s, r) => s + (r.amount || 0), 0));
    const range = getPeriodDateRange();
    const predictedTrend = round2(this.getPeriodVariablePredictedTrend());
    const predicted = round2(predictedTrend + large);
    return { bills: 0, billsUnpaid: 0, instalments: 0, large: large, normal: round2(Math.max(0, predicted - large)), predicted: predicted };
  },

  // Variable trend for rolling window (non-bill, non-excluded, net of splits).
  getPeriodVariablePredictedTrend() {
    const range = getPeriodDateRange();
    const daysPassed = range.daysPassed || 0;
    const daysInPeriod = range.daysInPeriod || 30;
    if (!(daysPassed > 0)) return 0;
    const recs = this.getPeriodRecords().filter(r => r && !this.isFixedRecord(r) && !r.excludeFromAvg);
    const total = recs.reduce((s, r) => s + (r.amount || 0), 0);
    return round2(Math.max(0, total - this.splitOthersOf(recs)) / daysPassed * daysInPeriod);
  },

  getSavingsPrediction(month) {
    const budget = DataStore.getMonthlyIncome(month) || DataStore.getBudget(month);
    const predicted = this.getPredictedMonthEndTotal(month);
    return budget - predicted;
  },

  // THE savings forecast every page quotes (overview, stats, report, What-If) —
  // two numbers that used to be conflated under the name 预计存 / 预计月末储蓄:
  //   surplus 月底预计剩余 — income − projected month-end spend (which already
  //                     holds the bills still unpaid). Money not spent; may be
  //                     negative (overspend). Includes whatever the purchase
  //                     plans will set aside.
  //   free    预计储蓄 — surplus after the plans have taken their share. What
  //                     counts toward the savings target, and the number the plan
  //                     panel shows. Equal to surplus when there are no plans.
  // unpaidBills is reported for display only — it is already inside the spend.
  getSavingsForecast(month) {
    const unpaidBills = this.getUnpaidPlannedBills(month);
    const surplus = round2(this.getSavingsPrediction(month));
    const net = (typeof PlanMath !== 'undefined')
      ? PlanMath.afterPlans(month, surplus)
      : { reserved: 0, free: surplus };
    return { unpaidBills: unpaidBills, surplus: surplus, planReserved: net.reserved, free: net.free };
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

  // `excludeInstalments`: leave out card-instalment records (the 含固定账单
  // toggle is off), which sit inside ordinary categories.
  //
  // `pool`: the records to break down, when the window is not a calendar month (a
  // custom date range, or the rolling 30 days). Without it the month's records are used.
  getCategoryBreakdownDeep(month, categoryId, excludeInstalments, pool) {
    const cat = DataStore.getCategory(categoryId);
    if (!cat) return null;
    const source = pool || this.getRecordsInMonth(month);
    const records = source.filter(r => r.categoryId === categoryId && !(excludeInstalments && r.planId));
    const children = DataStore.getChildren(categoryId);
    const breakdown = {
      category: cat,
      total: records.reduce((s, r) => s + r.amount, 0),
      count: records.length,
      children: []
    };
    children.forEach(child => {
      const childBreak = this.getCategoryBreakdownDeep(month, child.id, excludeInstalments, source);
      if (childBreak) {
        breakdown.total += childBreak.total;
        breakdown.children.push(childBreak);
      }
    });
    return breakdown;
  },

  getCustomRangeTotals(startDate, endDate) {
    // Whole days: 'to 10-28' means up to the last minute of the 28th (compared by day, so
    // the time zone does not matter). The split-bill part below still takes timestamps.
    const start = parseLocalDay(startDate, false);
    const end = parseLocalDay(endDate, true);
    const inRange = DataStore.getRecords().filter(r => inDayRange(r, startDate, endDate));
    const records = expenseRecords(inRange);
    const incomeRecs = incomeRecords(inRange);
    const daily = {};
    records.forEach(r => {
      const key = recordDayKey(r);
      daily[key] = (daily[key] || 0) + r.amount;
    });
    const incomeDaily = {};
    incomeRecs.forEach(r => {
      const key = recordDayKey(r);
      incomeDaily[key] = (incomeDaily[key] || 0) + r.amount;
    });
    const incomeTotal = incomeRecs.reduce((s, r) => s + (r.amount || 0), 0);
    const total = records.reduce((s, r) => s + r.amount, 0) - this._splitContribBetween(start, end);
    return {
      total,
      incomeTotal,
      net: round2(incomeTotal - total),
      count: records.length,
      splitContrib: this._splitContribBetween(start, end),
      daily: Object.entries(daily).sort((a,b) => a[0].localeCompare(b[0])).map(([day, total]) => ({ day, total })),
      incomeDaily: Object.entries(incomeDaily).sort((a,b) => a[0].localeCompare(b[0])).map(([day, total]) => ({ day, total })),
      categoryTotals: (() => {
        const ct = {};
        records.forEach(r => {
          ct[r.categoryId] = (ct[r.categoryId] || 0) + r.amount;
        });
        return ct;
      })(),
      incomeCategoryTotals: (() => {
        const ct = {};
        incomeRecs.forEach(r => {
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

  // Others' share (paid or not) of ONE split bill — the part of its full-amount
  // record that was never my spending. 0 for a bill someone else paid (there is no
  // record of mine behind it) and for an id that matches no bill.
  _othersShareOfBill(billId) {
    if (!billId || typeof SplitEngine === 'undefined' || !SplitEngine.getSplitBill) return 0;
    const b = SplitEngine.getSplitBill(billId);
    if (!b || b.payer !== 'self') return 0;
    let total = 0;
    (b.participants || []).forEach(p => {
      const amt = parseFloat(p.share) || 0;
      if (amt > 0) total += amt;
    });
    return total;
  },

  // Others' shares of the split bills behind exactly these records — what to take
  // off a sum made from this list. A whole-month figure (getSplitOthers) is the
  // wrong thing to subtract from a SUBSET of the month: with the bill's record in
  // a bill category, or flagged 不计日均, the share came off records that never
  // contained it, so daily averages went too low and could go negative. Counted once
  // per bill, and never more than the record itself.
  splitOthersOf(records) {
    const seen = new Set();
    let total = 0;
    (records || []).forEach(r => {
      if (!r || !r.splitBillId || seen.has(r.splitBillId)) return;
      seen.add(r.splitBillId);
      total += Math.min(this._othersShareOfBill(r.splitBillId), r.amount || 0);
    });
    return total;
  },

  // A record that sets the everyday spending PACE: not a bill, not a card
  // instalment, not flagged 不计日均. Everything else is a known amount (already
  // spent, or fixed) and is added at face value, never extrapolated.
  isPaceRecord(r) {
    return !!r && !r.excludeFromAvg && !this.isFixedRecord(r);
  },

  // Unpaid others' shares only (未收回账目) — shown in the overview total caption
  _splitUnpaidBetween(start, end) {
    let total = 0;
    const bills = (typeof SplitEngine !== 'undefined' && SplitEngine.getSplitBills) ? SplitEngine.getSplitBills() : [];
    bills.forEach(b => {
      if (b.payer !== 'self') return;
      // Archiving means "stop chasing this". The card drops its repayment
      // control on archive, so an outstanding balance left in here could never
      // be cleared again — it hung in 待收回总额 forever. Money already
      // collected still counts (see _splitContribBetween): that is a fact, and
      // netting it out of the month total must not change retroactively.
      // Archiving is reversible via 恢复 if the user does want to chase it.
      if (b.archived) return;
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
    return this._splitContribBetween(parseLocalDay(startDate, false), parseLocalDay(endDate, true));
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
      const key = localDateKey(d);
      const dayTotal = expenseRecords(DataStore.getRecords().filter(r => {
        const rd = recordDayKey(r);
        return rd === key;
      })).reduce((s, r) => s + r.amount, 0);
      result.push({ date: key, total: dayTotal, label: (d.getMonth()+1)+'/'+d.getDate() });
    }
    return result;
  },

  // Check if a category is a bill category
  isBillCategory(categoryId) {
    const billCats = DataStore.getBillCategories();
    return billCats.some(b => b.id === categoryId);
  },

  // What the 含固定账单 toggle calls a "fixed" record: one filed under a
  // fixed-bill category, OR a credit-instalment record (planId — syncPlanRecords
  // is the only writer of that field). An instalment sits in an ordinary
  // category the user picked, so a category test alone can never see it; but it
  // is a fixed monthly obligation exactly like rent, so every place the toggle
  // splits "daily" from "fixed" must go through this, not isBillCategory.
  isFixedRecord(r) {
    return !!r && (!!r.planId || this.isBillCategory(r.categoryId));
  },

  // Spending in fixed-bill CATEGORIES only. This stays category-only on purpose:
  // it is what gets reconciled against the planned bill amounts
  // (unpaid planned bills = planned − this), and an instalment is not part of
  // any planned bill. For the toggle's "fixed" total use getFixedSpendingActual.
  getBillSpendingActual(month) {
    return this.getRecordsInMonth(month)
      .filter(r => this.isBillCategory(r.categoryId))
      .reduce((sum, r) => sum + r.amount, 0);
  },

  // Credit-instalment records that are NOT already in a bill category, so
  // bills + instalments never overlap.
  getInstalmentSpending(month) {
    return this.getRecordsInMonth(month)
      .filter(r => r.planId && !this.isBillCategory(r.categoryId))
      .reduce((sum, r) => sum + r.amount, 0);
  },

  // Bills + instalments: everything the 含固定账单 toggle switches off.
  getFixedSpendingActual(month) {
    return this.getBillSpendingActual(month) + this.getInstalmentSpending(month);
  },

  // Remove credit-instalment amounts from a {categoryId: total} map that was
  // built from `records`. A category total cannot tell an instalment from the
  // user's own spending in the same category, so when the 含固定账单 toggle is
  // off the instalments have to be taken back out record by record.
  withoutInstalments(totals, records) {
    const out = Object.assign({}, totals);
    (records || []).forEach(r => {
      if (r && r.planId) out[r.categoryId] = (out[r.categoryId] || 0) - r.amount;
    });
    Object.keys(out).forEach(id => { if (!(out[id] > 0.004)) delete out[id]; });
    return out;
  },

  // Daily spending: everything that is not a fixed record (see isFixedRecord)
  getVariableSpending(month) {
    return this.getRecordsInMonth(month)
      .filter(r => !this.isFixedRecord(r))
      .reduce((sum, r) => sum + r.amount, 0) - this.getSplitContrib(month);
  },

  // Get daily totals excluding bills
  getDailyTotalsVariable(month) {
    const daily = {};
    this.getRecordsInMonth(month)
      .filter(r => !this.isFixedRecord(r))
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
    const records = this.getRecordsInMonth(month).filter(r => !this.isFixedRecord(r) && !r.excludeFromAvg);
    if (!records.length) return 0;
    const daysInMonth = new Date(parseInt(month.split('-')[0]), parseInt(month.split('-')[1]), 0).getDate();
    const now = new Date();
    const today = now.getDate();
    const currentMonth = getMonthKey(now.toISOString());
    const daysPassed = month === currentMonth ? today : daysInMonth;
    const varTotal = records.reduce((s, r) => s + r.amount, 0);
    // My real share only (others' shares excluded from daily avg) — only the shares
    // of the bills behind THESE records, so a split utility bill (filed under the
    // bill category, not in this list) cannot eat into the lunches.
    return daysPassed ? (varTotal - this.splitOthersOf(records)) / daysPassed : 0;
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
    // Credit instalments are real records, but the daily-spending side
    // (getVariableSpending & friends) no longer counts them — they are fixed
    // obligations, switched by the same 含固定账单 toggle as rent. So they are
    // carved out of the daily budget here instead, from the same records, which
    // keeps (spendable − variable spending) exactly what it was before.
    const planDueCredit = this.getInstalmentSpending(month);
    const spendableBudget = Math.max(0, netDisposable - targetAmount - planDueVirtual - planDueCredit);
    return { income, totalBills, netDisposable, baseAmount, targetAmount, planDueVirtual, planDueCredit, spendableBudget };
  },

  getMonthlyTotals(numMonths = 6) {
    const result = [];
    const now = new Date();
    for (let i = numMonths - 1; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
      const total = this.getMonthTotal(key);
      const income = this.getMonthIncome(key);
      result.push({ month: key, total, income, net: round2(income - total), label: key });
    }
    return result;
  },

  // ===== Period-Aware Methods (Stats Range: month or rolling30) =====
  getPeriodRecords() {
    const { start, end } = getPeriodDateRange();
    return expenseRecords(DataStore.getRecords().filter(r => {
      const d = new Date(r.date || r.createdAt);
      return d >= start && d <= end;
    }));
  },
  getPeriodIncomeRecords() {
    const { start, end } = getPeriodDateRange();
    return incomeRecords(DataStore.getRecords().filter(r => {
      const d = new Date(r.date || r.createdAt);
      return d >= start && d <= end;
    }));
  },
  getPeriodIncome() {
    return this.getPeriodIncomeRecords().reduce((s, r) => s + (r.amount || 0), 0);
  },
  getPeriodNet() {
    return round2(this.getPeriodIncome() - this.getPeriodTotal());
  },
  getPeriodIncomeCategoryTotals() {
    const totals = {};
    this.getPeriodIncomeRecords().forEach(r => {
      totals[r.categoryId] = (totals[r.categoryId] || 0) + r.amount;
    });
    return totals;
  },
  getPeriodTotal() {
    return this.getPeriodRecords().reduce((s, r) => s + r.amount, 0) - this.getPeriodSplitContrib();
  },
  // Rolling-range twin of getDailyAverage — must honour 不计日均 (excludeFromAvg)
  // exactly as that one does, and as getPeriodPredictedTotal below does. It did
  // not: a RM900 one-off flagged 不计日均 inflated the 日均 card by RM900/30 while
  // the projection built from the same data ignored it, so the two contradicted
  // each other and switching the Stats Range changed what the flag meant.
  getPeriodDailyAverage() {
    const { daysPassed } = getPeriodDateRange();
    const records = this.getPeriodRecords().filter(r => !r.excludeFromAvg);
    // Only my real share counts: others' shares (paid or not) are not my spending
    const realSpent = records.reduce((s, r) => s + r.amount, 0) - this.splitOthersOf(records);
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
    const realSpent = records.reduce((s, r) => s + r.amount, 0) - this.splitOthersOf(records);
    const avg = realSpent / daysPassed;
    return Math.round(avg * daysInPeriod * 100) / 100;
  },

  // CASH-FLOW twin of getPredictedMonthEndTotal for the rolling-30-day range —
  // see that function for why the excluded amount has to be added back in for
  // anything netted against income (A-1, A-2).
  getPeriodPredictedMonthEndTotal() {
    return this.getPeriodPredictedBreakdown().predicted;
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
  getPeriodInstalmentSpending() {
    return this.getPeriodRecords()
      .filter(r => r.planId && !this.isBillCategory(r.categoryId))
      .reduce((s, r) => s + r.amount, 0);
  },
  getPeriodFixedSpending() {
    return this.getPeriodBillSpending() + this.getPeriodInstalmentSpending();
  },
  getPeriodVariableSpending() {
    return this.getPeriodTotal() - this.getPeriodFixedSpending();
  },
  getPeriodDailyTotals(options = {}) {
    const daily = {};
    const records = options.excludeBills
      ? this.getPeriodRecords().filter(r => !this.isFixedRecord(r))
      : this.getPeriodRecords();
    records.forEach(r => {
      const dayKey = recordDayKey(r);
      daily[dayKey] = (daily[dayKey] || 0) + r.amount;
    });
    // Net out split repayments per day
    const contribP = this._splitContribByDay(d => localDateKey(d));
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
          //
          // `actual` is the instalment itself, NOT a lookup of the backing
          // record. That is deliberate: syncPlanRecords() creates one record per
          // elapsed instalment and re-creates any the user deletes, so "no
          // record for this month" never means "the bank did not charge me" —
          // it only means the sync has not run yet (it fires 800ms after boot).
          // Reading the ledger here made the overview flash a wrong balance
          // during those 800ms, and made a deleted instalment look like a
          // restored debt right up until the next refresh put it back.
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
      // Months with no income on record are replayed as "assume on schedule"
      // (see the !incomeKnown branch above). That keeps a plan from stalling,
      // but it also means the repayment progress is partly guessed — surface
      // how much of it, so neither the UI nor the Excel export can present a
      //推定 figure as if it were measured.
      st.estimatedMonths = Object.keys(st.byMonth).filter(m => st.byMonth[m] && !st.byMonth[m].incomeKnown).length;
      st.hasEstimates = st.estimatedMonths > 0;
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
    return round2(this.getVirtualDueByPlan(month).reduce((s, x) => s + x.due, 0));
  },

  // The same figure plan by plan: [{ plan, due }] for the active save / borrow
  // plans that owe something in `month`. The category charts list these as
  // their own blocks (they have no record to show up through).
  getVirtualDueByPlan(month) {
    const state = this.computeUpTo(month);
    const out = [];
    Object.keys(state).forEach(id => {
      const st = state[id];
      if (st.plan.mode === 'credit') return;
      if (st.plan.status !== 'active') return;
      const cur = st.byMonth[month];
      if (cur && cur.due > 0) out.push({ plan: st.plan, due: cur.due });
    });
    return out;
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

  // The debt-before-savings waterfall on an arbitrary month-end surplus: earliest
  // deadline first, each save / borrow plan takes min(due, what is left). Card
  // instalments take their due in full but NOT out of the surplus — their record
  // is already inside the projected spend. getForecast and afterPlans both run
  // through here so the plan panel and every savings figure cannot disagree.
  _allocate(month, surplus) {
    let left = Math.max(0, surplus || 0);
    const state = this.computeUpTo(month);
    const active = this._byDeadline(
      DataStore.getPurchasePlans().filter(p => p && p.status === 'active' && state[p.id] && state[p.id].byMonth[month])
    );
    const plans = {};
    let totalDue = 0, totalPay = 0, savePay = 0;
    active.forEach(p => {
      const cur = state[p.id].byMonth[month];
      let pay;
      if (p.mode === 'credit') {
        pay = cur.due;
      } else {
        pay = Math.max(0, Math.min(cur.due, left));
        left -= pay;
        savePay += pay;
      }
      totalDue += cur.due;
      totalPay += pay;
      plans[p.id] = {
        due: round2(cur.due),
        predictedPay: round2(pay),
        shortfall: round2(Math.max(0, cur.due - pay))
      };
    });
    return { plans: plans, totalDue: totalDue, totalPay: totalPay, savePay: savePay, left: left };
  },

  // A month-end surplus (signed: negative = overspent) split into what the
  // plans take and what is genuinely free to count as savings. This is the figure
  // to hold against the savings target: the target is carved out of income
  // separately from the plans (getSpendablePlan), and the waterfall pays debt
  // first, so money a plan swallows cannot also satisfy the target.
  afterPlans(month, surplus) {
    const a = this._allocate(month, surplus);
    return { reserved: round2(a.savePay), free: round2((surplus || 0) - a.savePay) };
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

    // Cash-flow projection: the daily pace is only projected for everyday spending;
    // large purchases, card instalments, paid bills AND bills still unpaid are
    // known amounts and are all inside getPredictedMonthEndTotal — the same shared
    // function every other "predicted month-end spend" consumer uses (A-1), so no
    // unpaid-bills term is subtracted here.
    const predictedSpend = StatsEngine.getPredictedMonthEndTotal(month);
    let surplus = Math.max(0, income - predictedSpend);
    const predictedSurplus = round2(surplus);

    const t = DataStore.getSavingsTarget() || {};
    const percentBase = DataStore.getPercentBase();
    const netDisposable = Math.max(0, income - billPlanned);
    const baseAmount = percentBase === 'net' ? netDisposable : income;
    let targetAmount = 0;
    if (t.type === 'fixed') targetAmount = t.fixedAmount || 0;
    else if (t.type === 'percent') targetAmount = baseAmount * (t.percent || 0) / 100;

    const alloc = this._allocate(month, surplus);
    const predictedSavings = round2(Math.max(0, alloc.left));
    return {
      month: month,
      income: income,
      predictedSpend: predictedSpend,
      predictedSurplus: predictedSurplus,
      plans: alloc.plans,
      totalDue: round2(alloc.totalDue),
      totalPredictedPay: round2(alloc.totalPay),
      // The part of totalPredictedPay that actually comes OUT of the surplus
      // (card instalments are already inside predictedSpend)
      reservedPay: round2(alloc.savePay),
      totalShortfall: round2(Math.max(0, alloc.totalDue - alloc.totalPay)),
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
  // "本月还剩" gives the part of the surplus that is genuinely free.
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
