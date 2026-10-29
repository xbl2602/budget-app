/* ============================================================
   计算口径一致性回归网（审计 H-08 ~ H-12）
   ------------------------------------------------------------
   H-08 报告页：已付账单被算了两次（总支出含账单，额度却已经扣过账单），误报"超支"，
        圆环百分比和圆环下面那行字不是同一个比。
   H-09 假设分析：日均基数把"不计日均"的一次性大额、信用卡分期也算进去，
        "取消消费"/"减 10%"得出的月支出比已经花掉的钱还少，甚至是负数。
   H-10 分摊账单：他人份额整笔从"日常"里扣，不管这笔分摊记在账单分类、
        普通分类还是"不计日均"里 → 日常日均被压低，甚至负数。
   H-11 分类预算设成"%"时，报告页 / 总览 Top5 把百分数 30 当成 RM30 去比。
   H-12 总览"本月还剩"（原名"累计已存"）随"含固定账单"开关变化（同一个名字，切一下开关换一个数）。

   跑法： bash build.sh && node tests/calc-consistency-test.js   (需要 jsdom)
   固定"现在"为 2026-10-13（本月第 13 天，剩 18 天，共 31 天）。
   ============================================================ */
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const FIXED = new Date(2026, 9, 13, 12, 0, 0).getTime();
const MONTH = '2026-10';
const TODAY = 13, DAYS_IN = 31, REMAINING = 18;

function stub() {
  const n = () => {};
  return { canvas: null, setTransform: n, scale: n, translate: n, rotate: n, clearRect: n, fillRect: n, strokeRect: n,
    beginPath: n, closePath: n, moveTo: n, lineTo: n, arc: n, arcTo: n, bezierCurveTo: n, quadraticCurveTo: n, fill: n,
    stroke: n, clip: n, fillText: n, strokeText: n, measureText: () => ({ width: 10 }), save: n, restore: n,
    createLinearGradient: () => ({ addColorStop: n }), createRadialGradient: () => ({ addColorStop: n }),
    createPattern: () => ({}), drawImage: n, getImageData: () => ({ data: new Uint8ClampedArray(4) }),
    putImageData: n, roundRect: n, resetTransform: n, setLineDash: n, rect: n, lineWidth: 1, fillStyle: '#000',
    strokeStyle: '#000', globalAlpha: 1, font: '10px sans-serif', textAlign: 'left', textBaseline: 'alphabetic',
    lineCap: 'butt', lineJoin: 'miter', shadowBlur: 0, shadowColor: 'transparent' };
}

const dom = new JSDOM(html, {
  runScripts: 'dangerously', pretendToBeVisual: true, url: 'http://localhost/',
  beforeParse(w) {
    const Real = w.Date;
    w.Date = class extends Real {
      constructor(...a) { if (a.length === 0) super(FIXED); else super(...a); }
      static now() { return FIXED; }
    };
    const s = stub();
    w.HTMLCanvasElement.prototype.getContext = function () { s.canvas = this; return s; };
    w.HTMLCanvasElement.prototype.toDataURL = () => 'data:image/png;base64,AAA';
    w.CanvasRenderingContext2D = function () {};
    w.CanvasRenderingContext2D.prototype.roundRect = function () { return this; };
    const q = () => {}; w.console = { log: q, warn: q, error: q, info: q, debug: q };
  }
});
const w = dom.window, doc = w.document, LS = w.localStorage;

let pass = 0, fail = 0;
const ok = (name, cond, extra) => {
  if (cond) { pass++; console.log('  ✅ ' + name); }
  else { fail++; console.log('  ❌ ' + name + (extra !== undefined ? '  <- ' + (typeof extra === 'string' ? extra : JSON.stringify(extra)) : '')); }
};
const near = (a, b) => Math.abs(a - b) < 0.011;
const section = t => console.log('\n' + t);
const pad = n => String(n).padStart(2, '0');
const day = d => MONTH + '-' + pad(d) + 'T12:00';
const wait = ms => new Promise(r => setTimeout(r, ms));
const norm = s => String(s || '').replace(/\s+/g, ' ').trim();

setTimeout(async () => {
  try { w.Changelog.markSeen(w.Changelog.all()[0].id); w.closeModal(); } catch (e) { /* not booted */ }
  const DS = w.DataStore, SE = w.StatsEngine, SIM = w.SimulationEngine;

  ok('时间已固定在 10-13（否则下面的断言都在空转）', new w.Date().getDate() === TODAY);

  // 把圆环的参数截下来：圆环是画在 canvas 上的，jsdom 里看不到，只能拦 drawRing 本身
  const rings = {};
  w.drawRing = (id, progress, color, label) => { rings[id] = { progress, color, label }; };

  const food = DS.getExpenseRootCategories().find(c => c.name === '餐饮');
  const lunch = DS.getChildren(food.id).find(c => c.name === '午餐');
  const elec = DS.getChildren(DS.getExpenseRootCategories().find(c => c.name === '购物').id).find(c => c.name === '电子产品');

  function fresh() {
    DS.clearAll();
    ['budgetStatsRange', 'chartBillToggle_overviewBudget', 'chartBillToggle_pieChart'].forEach(k => LS.removeItem(k));
    Object.keys(rings).forEach(k => delete rings[k]);
  }
  // 收入 5000；房租账单计划 1000 且已付 1000；储蓄目标 500；另外花 other 元
  function seedReport(other, o) {
    o = o || {};
    fresh();
    if (o.income !== 0) DS.setMonthlyIncome(MONTH, 5000);
    DS.setSavingsTarget({ type: 'fixed', fixedAmount: 500, percent: 0 });
    DS.addBillCategory({ name: '房租', icon: '🏠' });
    const rent = DS.getBillCategories()[0];
    DS.setBillAmount(MONTH, rent.id, 1000);
    DS.addRecord({ amount: 1000, categoryId: rent.id, date: day(1), note: 'rent' });
    if (other > 0) DS.addRecord({ amount: other, categoryId: lunch.id, date: day(5), note: 'x' });
    return rent;
  }
  const setToggle = on => LS.setItem('chartBillToggle_overviewBudget', on ? '1' : '0');
  const pctNum = label => parseFloat(String(label).replace(/[^\d.\-]/g, ''));
  const moneyNum = s => parseFloat(String(s).replace(/[^\d.\-]/g, ''));
  const findByText = (sel, t) => [...doc.querySelectorAll(sel)].find(e => norm(e.textContent) === t);

  async function renderReportNow() { w.renderReport(); await wait(120); }
  async function renderOverviewNow() { w.renderOverview(); await wait(120); }
  // 报告页"总支出"那张卡：颜色在 style 里，是不是红的就看有没有 var(--danger)
  const totalCard = () => {
    const title = findByText('#page-report .card-title', w.__('report.totalExpenditure'));
    return title ? title.nextElementSibling : null;
  };

  /* ================= H-08 报告页重复计算账单 ================= */
  section('【H-08】报告页：总支出 3600 / 收入 5000，不该因为"额度 3500"变红');
  seedReport(2600);
  ok('前提：日常可花额度 = 5000 − 1000 − 500 = 3500', near(SE.getSpendablePlan(MONTH).spendableBudget, 3500), SE.getSpendablePlan(MONTH).spendableBudget);
  ok('前提：本月总支出 = 3600（含已付房租 1000）', near(SE.getMonthTotal(MONTH), 3600), SE.getMonthTotal(MONTH));
  await renderReportNow();
  const repRing = rings.reportBudgetRing || {};
  ok('圆环百分比 = 3600 ÷ 5000 = 72%（旧代码用 3600 ÷ 3500 = 103%）', pctNum(repRing.label) === 72, repRing.label);
  ok('圆环不是红色', repRing.color !== '#EF4444', repRing.color);
  ok('圆环下面那行字写的就是 RM 3,600.00 / RM 5,000.00', norm(doc.getElementById('page-report').textContent).includes('RM 3,600.00 / RM 5,000.00'));
  const tc = totalCard();
  ok('"总支出"那张卡存在', !!tc);
  ok('"总支出"没有变红', tc && !/var\(--danger\)/.test(tc.getAttribute('style') || ''), tc && tc.getAttribute('style'));
  await renderOverviewNow();
  ok('总览同样数据的圆环 = 72%，报告页和它一致', pctNum((rings.budgetRing || {}).label) === pctNum(repRing.label), [(rings.budgetRing || {}).label, repRing.label]);

  section('【H-08】真的超支时仍然要标红（防止修过头）');
  seedReport(4500);   // 总支出 5500 > 收入 5000
  await renderReportNow();
  const over = rings.reportBudgetRing || {};
  ok('圆环 = 110%', pctNum(over.label) === 110, over.label);
  ok('圆环是红色', over.color === '#EF4444', over.color);
  const tc2 = totalCard();
  ok('"总支出"标红', tc2 && /var\(--danger\)/.test(tc2.getAttribute('style') || ''), tc2 && tc2.getAttribute('style'));

  section('【H-08】没设月收入：没有可比的东西，不该一律标红');
  seedReport(300, { income: 0 });
  await renderReportNow();
  const tc3 = totalCard();
  ok('没有收入时"总支出"不标红', tc3 && !/var\(--danger\)/.test(tc3.getAttribute('style') || ''), tc3 && tc3.getAttribute('style'));

  /* ================= H-09 假设分析的日均基数 ================= */
  section('【H-09】假设分析：一次性大额（不计日均）不进日均基数');
  // 午餐每天 50（1~13 号共 650），另有一笔 2000 的大额标"不计日均"。已花 2650，趋势月支出 = 2000 + 650÷13×31 = 3550
  function seedWhatIf(extra) {
    fresh();
    DS.setMonthlyIncome(MONTH, 5000);
    for (let d = 1; d <= TODAY; d++) DS.addRecord({ amount: 50, categoryId: lunch.id, date: day(d), note: 'lunch' });
    if (extra) extra();
  }
  const bigOneOff = () => DS.addRecord({ amount: 2000, categoryId: lunch.id, date: day(3), note: 'laptop', excludeFromAvg: true });
  const whatIfNums = () => {
    const card = doc.querySelector('#page-whatif .whatif-summary-card');
    const text = card ? card.textContent : '';
    const m = [...text.matchAll(/−RM\s(-?[\d,]+\.\d\d)/g)].map(x => moneyNum(x[1]));
    return { trend: m[0], adjusted: m[1], text: norm(text) };
  };
  const renderWhatIfNow = params => { DS.setWhatIfParams(params); w.renderWhatIf(); return whatIfNums(); };

  seedWhatIf(bigOneOff);
  ok('前提：趋势月支出 = 2000 + 50×31 = 3550', near(SE.getPredictedMonthEndTotal(MONTH), 3550), SE.getPredictedMonthEndTotal(MONTH));
  let r = SIM.run(MONTH, { categoryAdjustments: {} });
  const lp = r.categoryProjections[lunch.id];
  ok('午餐的"当前日均" = 650 ÷ 13 = 50（旧代码把 2000 也算进去 → 203.85）', near(lp.currentDailyAvg, 50), lp.currentDailyAvg);
  ok('午餐的"本月已花"仍是真实的 2650（日均不含它，但已花要含）', near(lp.currentTotal, 2650), lp.currentTotal);
  ok('不做任何调整时，模拟的月支出 = 趋势月支出 3550', near(r.totalProjected, 3550), [r.totalProjected, r.trendTotal]);
  let n = renderWhatIfNow({ categoryAdjustments: {} });
  ok('页面：不做调整，调整后 = 趋势 = 3550，并写"无变化"', near(n.trend, 3550) && near(n.adjusted, 3550) && n.text.includes(w.__('whatif.noChange')), n);
  n = renderWhatIfNow({ categoryAdjustments: { [lunch.id]: { mode: 'zero', value: null } } });
  ok('页面：午餐"取消消费" → 月支出 = 已经花掉的 2650（旧代码得出 −119 之类的负数）', near(n.adjusted, 2650), n);
  n = renderWhatIfNow({ categoryAdjustments: { [lunch.id]: { mode: 'percent', value: -10 } } });
  ok('页面：午餐 −10% → 3550 − 50×18×10% = 3460', near(n.adjusted, 3460), n);

  section('【H-09】信用卡分期不进日均基数，也不会被往后"推算"');
  seedWhatIf(() => DS.addRecord({ amount: 600, categoryId: elec.id, date: day(1), note: 'inst', planId: 'p1', planMonth: MONTH, excludeFromAvg: true }));
  r = SIM.run(MONTH, { categoryAdjustments: {} });
  const ep = r.categoryProjections[elec.id];
  ok('分期所在分类的日均 = 0（旧代码 600 ÷ 13 = 46.15）', near(ep.currentDailyAvg, 0), ep.currentDailyAvg);
  ok('分期所在分类往后不再推算花费', near(ep.projectedRemaining, 0), ep.projectedRemaining);
  ok('分期仍算"已花"：本月已花 = 600', near(ep.currentTotal, 600), ep.currentTotal);
  ok('不做调整时模拟月支出 = 趋势 = 600 + 1550 = 2150', near(r.totalProjected, 2150) && near(r.totalProjected, r.trendTotal), [r.totalProjected, r.trendTotal]);

  /* ================= H-10 分摊账单的他人份额 ================= */
  section('【H-10】水电账单（记在账单分类里）与室友分摊：他人份额不该从"午餐"里扣');
  function addSplit(id, amount, selfShare, others, rec) {
    DS.addRecord(Object.assign({ amount, date: day(5), note: 'split', splitBillId: id }, rec));
    DS._data.contacts = [{ id: 'p1', name: '阿明' }, { id: 'p2', name: '小红' }];
    DS._data.splitBills = (DS._data.splitBills || []).concat([{
      id, amount, date: day(5), note: '', tag: id, categoryId: rec.categoryId, payer: 'self', selfShare, mode: 'equal',
      createdAt: new w.Date().toISOString(), archived: false,
      participants: others.map((s, i) => ({ contactId: 'p' + (i + 1), name: 'P' + (i + 1), share: s, paid: false, unknown: false }))
    }]);
    DS.save();
  }
  function seedSplitBill(lunchPerDay) {
    fresh();
    DS.setMonthlyIncome(MONTH, 5000);
    DS.addBillCategory({ name: '水电', icon: '💡' });
    const util = DS.getBillCategories()[0];
    for (let d = 1; d <= TODAY; d++) DS.addRecord({ amount: lunchPerDay, categoryId: lunch.id, date: day(d), note: 'lunch' });
    addSplit('sb1', 300, 100, [100, 100], { categoryId: util.id });    // 水电 300，他人 200，我 100
    return util;
  }
  seedSplitBill(30);
  ok('日常日均（不含账单）= 30（旧代码把他人的 200 从午餐里扣掉 → 14.6）', near(SE.getDailyAverageVariable(MONTH), 30), SE.getDailyAverageVariable(MONTH));
  let bd = SE.getPredictedBreakdown(MONTH);
  ok('预测拆分：账单只算我的那份 100（他人的 200 不是我的支出）', near(bd.bills, 100), bd);
  ok('预测拆分：日常预测 = 390 ÷ 13 × 31 = 930', near(bd.normal, 930), bd);
  ok('预测月总支出 = 100 + 930 = 1030（旧代码 300 + 453 = 753，偏低）', near(bd.predicted, 1030), bd.predicted);
  ok('含账单的日均 = (390 + 300 − 200) ÷ 13，和以前一致（没被改坏）', near(SE.getDailyAverage(MONTH), 490 / 13), SE.getDailyAverage(MONTH));
  ok('"只看日常"的预测里，不含他人份额的任何影响', near(SE.getPredictedBreakdownVariable(MONTH).predicted, 930), SE.getPredictedBreakdownVariable(MONTH));
  LS.setItem('budgetStatsRange', 'rolling30');
  const range = w.getPeriodDateRange();
  ok('近 30 天：日常预测 = 390 ÷ 已过天数 × 周期天数（和按月一致的算法）',
    near(SE.getPeriodVariablePredictedTrend(), 390 / range.daysPassed * range.daysInPeriod), [SE.getPeriodVariablePredictedTrend(), range]);
  ok('近 30 天：含账单日均 = (390 + 300 − 200) ÷ 已过天数', near(SE.getPeriodDailyAverage(), 490 / range.daysPassed), SE.getPeriodDailyAverage());
  LS.removeItem('budgetStatsRange');

  section('【H-10】午餐每天只花 5 元时，日均不能是负数');
  seedSplitBill(5);
  ok('日常日均 = 5（旧代码 (65 − 200) ÷ 13 = −10.4）', near(SE.getDailyAverageVariable(MONTH), 5), SE.getDailyAverageVariable(MONTH));

  section('【H-10】一笔标了"不计日均"的分摊大额：他人份额也不该从别的记录里扣');
  fresh();
  DS.setMonthlyIncome(MONTH, 5000);
  for (let d = 1; d <= TODAY; d++) DS.addRecord({ amount: 30, categoryId: lunch.id, date: day(d), note: 'lunch' });
  addSplit('sb2', 600, 200, [200, 200], { categoryId: elec.id, excludeFromAvg: true });
  ok('日均 = 30（旧代码 (390 − 400) ÷ 13 为负数）', near(SE.getDailyAverage(MONTH), 30), SE.getDailyAverage(MONTH));
  bd = SE.getPredictedBreakdown(MONTH);
  ok('大额那一块只算我的 200', near(bd.large, 200), bd);
  ok('预测月总支出 = 200 + 930 = 1130', near(bd.predicted, 1130), bd.predicted);

  section('【H-10】假设分析的"已花"也只扣这笔分摊自己的他人份额');
  seedSplitBill(30);
  r = SIM.run(MONTH, { categoryAdjustments: {} });
  ok('假设分析：已花（不含账单分类）= 午餐 390，不被水电的他人份额扣减', near(r.actualSpent, 390), r.actualSpent);
  ok('不做调整时模拟月支出 = 390 ÷ 13 × 31 = 930', near(r.totalProjected, 930), r.totalProjected);

  /* ================= H-11 百分比分类预算 ================= */
  section('【H-11】分类预算设成收入的 30%：5000 × 30% = 1500');
  function seedPct(spent, type, value) {
    fresh();
    DS.setMonthlyIncome(MONTH, 5000);
    DS.setCategoryBudget(food.id, MONTH, value, type);
    DS.addRecord({ amount: spent, categoryId: lunch.id, date: day(5), note: 'x' });
  }
  const reportRow = () => [...doc.querySelectorAll('#page-report tbody tr')].find(tr => norm(tr.cells[0] && tr.cells[0].textContent).includes('餐饮'));
  const top5Row = () => {
    const card = [...doc.querySelectorAll('#page-overview .card')].find(c => norm((c.querySelector('.card-title') || {}).textContent) === w.__('overview.top5'));
    return card ? [...card.querySelectorAll('.flex.items-center.justify-between')].find(x => norm(x.textContent).includes('餐饮')) : null;
  };
  seedPct(800, 'percent', 30);
  ok('换算函数：30% × 5000 = 1500', typeof DS.getCategoryBudgetAmount === 'function' && near(DS.getCategoryBudgetAmount(food.id, MONTH), 1500),
    typeof DS.getCategoryBudgetAmount === 'function' ? DS.getCategoryBudgetAmount(food.id, MONTH) : '函数不存在');
  await renderReportNow();
  let row = reportRow();
  ok('报告页：餐饮预算显示 RM 1,500.00（旧代码显示 RM 30.00）', row && norm(row.cells[1].textContent) === 'RM 1,500.00', row && norm(row.cells[1].textContent));
  ok('报告页：花 800 ≤ 1500，状态是"预算内"（旧代码"超支"）', row && norm(row.cells[5].textContent) === w.__('report.withinBudget'), row && norm(row.cells[5].textContent));
  ok('报告页：剩余 = 700', row && near(moneyNum(row.cells[4].textContent), 700), row && norm(row.cells[4].textContent));
  await renderOverviewNow();
  let t5 = top5Row();
  ok('总览 Top5：餐饮是"预算内"（旧代码"超支"）', t5 && norm(t5.textContent).includes(w.__('overview.withinBudget')) && !norm(t5.textContent).includes(w.__('overview.overspentLabel')), t5 && norm(t5.textContent));

  seedPct(1600, 'percent', 30);
  await renderReportNow(); row = reportRow();
  ok('真的超过 1500 时，报告页仍写"超支"', row && norm(row.cells[5].textContent) === w.__('report.overspent'), row && norm(row.cells[5].textContent));
  await renderOverviewNow(); t5 = top5Row();
  ok('真的超过 1500 时，总览 Top5 仍写"超支"', t5 && norm(t5.textContent).includes(w.__('overview.overspentLabel')), t5 && norm(t5.textContent));

  seedPct(800, 'fixed', 1000);
  await renderReportNow(); row = reportRow();
  ok('固定金额预算不受影响：RM 1,000.00、预算内', row && norm(row.cells[1].textContent) === 'RM 1,000.00' && norm(row.cells[5].textContent) === w.__('report.withinBudget'), row && norm(row.cells[1].textContent));

  fresh();
  DS.setCategoryBudget(food.id, MONTH, 30, 'percent');   // 没设月收入
  ok('没设月收入时，百分比预算算不出金额 → 0（不是 30）', typeof DS.getCategoryBudgetAmount === 'function' && DS.getCategoryBudgetAmount(food.id, MONTH) === 0,
    typeof DS.getCategoryBudgetAmount === 'function' ? DS.getCategoryBudgetAmount(food.id, MONTH) : '函数不存在');

  section('【H-11】设置子分类预算时的"不能超过父分类"检查，也要先换成 RM 再比');
  const budgetOf = id => DS.getCategoryBudget(id, MONTH);
  fresh(); DS.setMonthlyIncome(MONTH, 5000);
  DS.setCategoryBudget(food.id, MONTH, 1000, 'fixed');
  w.saveCategoryBudget(lunch.id, MONTH, 30, 'percent');      // 30% = 1500 > 父分类 1000
  ok('父分类 RM1000，子分类设 30%（=1500）→ 拒绝（旧代码把 30 当 RM30，放行）', budgetOf(lunch.id).value === 0, budgetOf(lunch.id));
  w.saveCategoryBudget(lunch.id, MONTH, 10, 'percent');      // 10% = 500
  ok('子分类设 10%（=500）→ 通过', budgetOf(lunch.id).value === 10 && budgetOf(lunch.id).type === 'percent', budgetOf(lunch.id));
  fresh(); DS.setMonthlyIncome(MONTH, 5000);
  DS.setCategoryBudget(food.id, MONTH, 30, 'percent');        // 父 30% = 1500
  w.saveCategoryBudget(lunch.id, MONTH, 200, 'fixed');
  ok('父分类 30%（=1500），子分类设 RM200 → 通过（旧代码拿 200 去比 30，错拒）', budgetOf(lunch.id).value === 200, budgetOf(lunch.id));
  const brk = DS.getChildren(food.id).find(c => c.name === '早餐');
  w.saveCategoryBudget(brk.id, MONTH, 1400, 'fixed');          // 200 + 1400 = 1600 > 1500
  ok('已有 200，再加 1400 超过父分类 1500 → 拒绝', budgetOf(brk.id).value === 0, budgetOf(brk.id));

  /* ================= H-12 本月还剩与开关 ================= */
  section('【H-12】总览"本月还剩"不随"含固定账单"开关变化');
  ok('总览和统计页的这一格都叫「本月还剩」，不再叫「累计已存」', w.__('overview.currentSaved') === '本月还剩' && w.__('stats.currentSavings') === '本月还剩', [w.__('overview.currentSaved'), w.__('stats.currentSavings')]);
  const savedCard = () => {
    const label = findByText('#page-overview .text-xs.text-secondary', w.__('overview.currentSaved'));
    return label ? norm(label.nextElementSibling.textContent) : null;
  };
  seedReport(2600);                  // 收入 5000，账单 1000 已付，日常 2600
  setToggle(true);  await renderOverviewNow(); const on = savedCard();
  setToggle(false); await renderOverviewNow(); const off = savedCard();
  ok('开关打开：本月还剩 = 5000 − 3600 = RM 1,400.00', on === 'RM 1,400.00', on);
  ok('开关关闭：本月还剩仍是 RM 1,400.00（旧代码 RM 2,400.00）', off === 'RM 1,400.00', off);
  LS.setItem('budgetStatsRange', 'rolling30');
  setToggle(true);  await renderOverviewNow(); const onR = savedCard();
  setToggle(false); await renderOverviewNow(); const offR = savedCard();
  ok('近 30 天模式：开关打开 / 关闭，本月还剩相同', onR !== null && onR === offR, [onR, offR]);
  LS.removeItem('budgetStatsRange');
  // 还有没付的计划账单：未付的也要先预留，开关关着也一样
  fresh();
  DS.setMonthlyIncome(MONTH, 5000);
  DS.addBillCategory({ name: '房租', icon: '🏠' });
  const rent2 = DS.getBillCategories()[0];
  DS.setBillAmount(MONTH, rent2.id, 1000);                    // 计划 1000，一分没付
  DS.addRecord({ amount: 2600, categoryId: lunch.id, date: day(5), note: 'x' });
  setToggle(true);  await renderOverviewNow(); const on2 = savedCard();
  setToggle(false); await renderOverviewNow(); const off2 = savedCard();
  ok('账单还没付：本月还剩 = 5000 − 2600 − 未付 1000 = RM 1,400.00，开关两种状态相同', on2 === 'RM 1,400.00' && off2 === on2, [on2, off2]);

  console.log('\n===== 结果: ' + pass + ' 通过 / ' + fail + ' 失败 =====');
  process.exit(fail > 0 ? 1 : 0);
}, 600);
