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
    return this.getRecordsInMonth(month).reduce((sum, r) => sum + (r.amount || 0), 0);
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
      const day = d.getDate();
      daily[day] = (daily[day] || 0) + r.amount;
    });
    const daysInMonth = new Date(parseInt(month.split('-')[0]), parseInt(month.split('-')[1]), 0).getDate();
    const result = [];
    for (let i = 1; i <= daysInMonth; i++) {
      result.push({ day: i, total: daily[i] || 0 });
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
    return daysPassed ? records.reduce((s, r) => s + r.amount, 0) / daysPassed : 0;
  },

  getPredictedTotal(month) {
    const records = this.getRecordsInMonth(month);
    if (!records.length) return 0;
    const daysInMonth = new Date(parseInt(month.split('-')[0]), parseInt(month.split('-')[1]), 0).getDate();
    const now = new Date();
    const today = now.getDate();
    const currentMonth = getMonthKey(now.toISOString());
    const daysPassed = month === currentMonth ? today : daysInMonth;
    const total = records.reduce((s, r) => s + r.amount, 0);
    return daysPassed ? (total / daysPassed) * daysInMonth : 0;
  },

  getSavingsPrediction(month) {
    const budget = DataStore.getMonthlyIncome(month) || DataStore.getBudget(month);
    const predicted = this.getPredictedTotal(month);
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
      total: records.reduce((s, r) => s + r.amount, 0),
      count: records.length,
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
      .reduce((sum, r) => sum + r.amount, 0);
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
    return daysPassed ? varTotal / daysPassed : 0;
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
  }
};

  // === EXPORTS ===
  window.StatsEngine = StatsEngine;
})();
