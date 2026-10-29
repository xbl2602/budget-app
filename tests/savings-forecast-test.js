// 储蓄 / 预测数字的口径：同名的数字在各页必须是同一个量，且说的是它真正的意思。
// Usage: bash build.sh && node tests/savings-forecast-test.js   (需要 jsdom：npm i --no-save jsdom)
//
// 回归背景（用户报告）：总览储蓄目标环写「预计存 RM98」，大额计划中心的「预计储蓄」却是 0。
//   根因不是措辞——是两个不同的量共用了一个名字：
//     预计结余 = 月收入 − 预计月末支出（已含还没付的月账单；还没扣大额计划）
//     预计储蓄 = 预计结余 − 存 / 还类大额计划预计拿走的部分（先还债，余下的才算储蓄）
//   储蓄目标在 getSpendablePlan 里与大额计划是各自独立扣掉的预留，结算瀑布又是还债优先，
//   所以目标只能拿「预计储蓄」去比；总览 / 统计 / 报告 / 假设分析原来拿的是「预计结余」，
//   计划把结余吃光了目标环还显示 98。
//
// 同时覆盖：
//   1. 预测月总支出里的账单不再按「已过天数」外推（第 3 天付的 RM1000 房租，第 13 天被算成 RM2400+）；
//      月账单里设了金额、还没付的部分也要算进来；信用卡分期单独一项——点「含固定账单」开关恰好增减这两类（用户报告：点开关只有大额数字在变，月账单没算）；
//   2. 统计页「当前已存」要像总览 / 报告一样扣掉未付账单（596e6ca 的决定）；
//   3. 统计 / 报告的储蓄预测在「近 30 天」模式下也是当月口径，不是「收入 − 近 30 天已花」；
//   4. 措辞：预测卡取消「含固定账单」后改称「日常」；目标环不再在预测阶段说「已达成」。
//
// 固定时钟：2026-10-13（本月第 13 天 / 共 31 天）。
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');

const FIXED = new Date(2026, 9, 13, 12, 0, 0).getTime();
const MONTH = '2026-10';
const PAST = '2026-09';

function stub() {
  const n = () => {};
  return {
    canvas: null, setTransform: n, scale: n, translate: n, rotate: n, clearRect: n,
    fillRect: n, strokeRect: n, beginPath: n, closePath: n, moveTo: n, lineTo: n,
    arc: n, arcTo: n, bezierCurveTo: n, quadraticCurveTo: n, fill: n, stroke: n,
    clip: n, fillText: n, strokeText: n, measureText: () => ({ width: 10 }),
    save: n, restore: n, drawImage: n, setLineDash: n, resetTransform: n, roundRect: n,
    createLinearGradient: () => ({ addColorStop: n }),
    createRadialGradient: () => ({ addColorStop: n }),
    createPattern: () => ({}),
    getImageData: () => ({ data: new Uint8ClampedArray(4) }), putImageData: n,
    lineWidth: 1, fillStyle: '#000', strokeStyle: '#000', globalAlpha: 1,
    font: '10px sans-serif', textAlign: 'left', textBaseline: 'alphabetic',
    lineCap: 'butt', lineJoin: 'miter', shadowBlur: 0, shadowColor: 'transparent'
  };
}

const dom = new JSDOM(html, {
  runScripts: 'dangerously',
  pretendToBeVisual: true,
  url: 'http://localhost/',
  beforeParse(w) {
    const Real = w.Date;
    w.Date = class extends Real {
      constructor(...a) { if (a.length === 0) super(FIXED); else super(...a); }
      static now() { return FIXED; }
    };
    w.HTMLCanvasElement.prototype.getContext = function () {
      if (!this._rec) { const c = stub(); c.canvas = this; this._rec = c; }
      return this._rec;
    };
    w.HTMLCanvasElement.prototype.toDataURL = () => 'data:image/png;base64,AAA';
    w.CanvasRenderingContext2D = function () {};
    w.CanvasRenderingContext2D.prototype.roundRect = function () { return this; };
    const q = () => {};
    w.console = { log: q, warn: q, error: q, info: q, debug: q };
  }
});
const { window: w } = dom;

let pass = 0, fail = 0;
const ok = (name, cond, extra) => {
  if (cond) { pass++; console.log('PASS ' + name); }
  else { fail++; console.log('FAIL ' + name + (extra !== undefined ? '  <- ' + JSON.stringify(extra) : '')); }
};
const near = (a, b) => Math.abs(a - b) < 0.011;
const section = t => console.log('\n' + t);

setTimeout(() => {
  try { w.Changelog.markSeen(w.Changelog.all()[0].id); w.closeModal(); } catch (e) { /* not booted */ }
  const DS = w.DataStore, SE = w.StatsEngine, PM = w.PlanMath;
  const food = DS.getChildren(DS.getExpenseRootCategories().find(c => c.name === '餐饮').id)[0];
  const money = w.formatMoney;
  const text = id => w.document.getElementById(id).textContent.replace(/\s+/g, ' ');
  const overview = () => { w.renderOverview(); return text('page-overview'); };
  const setBills = on => w.localStorage.setItem('chartBillToggle_overviewBudget', on ? '1' : '0');

  // 月收入 / 目标 / 一笔日常餐饮；plans: [{id, mode, total, months}]
  function seed(o) {
    o = o || {};
    DS.clearAll();
    w.localStorage.removeItem('budgetStatsRange');
    setBills(true);
    DS.setMonthlyIncome(MONTH, o.income != null ? o.income : 1000);
    DS.setSavingsTarget({ type: 'fixed', fixedAmount: o.target != null ? o.target : 200, percent: 0 });
    if (o.food) DS.addRecord({ amount: o.food, categoryId: food.id, date: MONTH + '-05T12:00', note: 'food' });
    (o.plans || []).forEach(p => DS.addPurchasePlan({
      id: p.id, name: p.id, icon: '🎯', totalAmount: p.total, mode: p.mode,
      startMonth: MONTH, months: p.months, categoryId: p.mode === 'credit' ? food.id : '', note: ''
    }));
  }

  ok('时间已固定在 10-13', new w.Date().getDate() === 13 && new w.Date().getMonth() === 9);

  /* ---------- 1. 用户报告的场景：结余 98，计划要 100 → 计划吃光，预计储蓄 0 ---------- */
  section('【报告场景】预计结余 ≈ 98，大额计划要 100：预计储蓄 = 0，各页一致');
  // 378 ÷ 13 天 × 31 天 = 901.38 → 结余 98.62 < 计划本月应还 100
  seed({ food: 378, plans: [{ id: 'B1', mode: 'borrow', total: 600, months: 6 }] });
  let fc = SE.getSavingsForecast(MONTH);
  ok('预计结余 = 1000 − 901.38 = 98.62', near(fc.surplus, 98.62), fc);
  ok('计划预计拿走 98.62（有多少拿多少，不超过结余）', near(fc.planReserved, 98.62), fc);
  ok('预计储蓄 = 0', near(fc.free, 0), fc);
  const panel = PM.getForecast(MONTH);
  ok('大额计划中心的预计储蓄 = 0', near(panel.predictedSavings, 0), panel.predictedSavings);
  ok('★ 总览 / 统计 / 报告用的预计储蓄 === 大额计划中心的预计储蓄', near(fc.free, panel.predictedSavings), [fc.free, panel.predictedSavings]);
  ok('计划中心的预计结余 === getSavingsForecast.surplus（同一个量）', near(panel.predictedSurplus, fc.surplus), [panel.predictedSurplus, fc.surplus]);
  ok('getForecast.reservedPay = 98.62', near(panel.reservedPay, 98.62), panel.reservedPay);

  let t = overview();
  ok('★ 总览目标环写「预计储蓄 RM 0.00 / RM 200.00」，不再是 98.62', t.indexOf('预计储蓄 ' + money(0) + ' / ' + money(200)) !== -1, t.slice(t.indexOf('储蓄目标'), t.indexOf('储蓄目标') + 40));
  ok('总览不再出现「预计存 RM 98.62」', t.indexOf('预计存') === -1 && t.indexOf('预计储蓄 ' + money(98.62)) === -1);
  ok('预计月末储蓄格 = RM 0.00，下面解释：预计结余 98.62 − 计划存/还 98.62',
    t.indexOf('月底预计剩余 ' + money(98.62) + '，其中 ' + money(98.62) + ' 要留给大额计划') !== -1, t.slice(t.indexOf('预计月末储蓄'), t.indexOf('预计月末储蓄') + 120));
  ok('目标达成 0%', /目标达成 0%/.test(t), t.slice(t.indexOf('目标达成'), t.indexOf('目标达成') + 20));

  w.renderStats();
  t = text('page-stats');
  const statsCard = t.slice(t.indexOf('当月储蓄预估'));
  ok('统计页预计月末储蓄 = RM 0.00，同样解释计划拿走的部分', /预计月末储蓄 RM 0\.00/.test(statsCard) && statsCard.indexOf('月底预计剩余 ' + money(98.62)) !== -1, statsCard.slice(0, 160));
  w.renderReport();
  t = text('page-report');
  ok('报告页目标环 RM 0.00 / RM 200.00', t.indexOf(money(0) + ' / ' + money(200)) !== -1);
  ok('报告页文案：预计月末可存 RM 0.00，另有 RM 98.62 要留给大额计划（解释钱去哪了）',
    t.indexOf('预计月末可存 ' + money(0)) !== -1 && t.indexOf('另有 ' + money(98.62) + ' 要留给大额计划') !== -1);

  const noAdj = { categoryAdjustments: {}, hypotheticalCategories: [], globalAdjustment: { mode: null, value: null } };
  const sim = w.SimulationEngine.run(MONTH, noAdj);
  ok('假设分析的趋势储蓄也在计划之后 = 0', sim && near(sim.trendSavings, 0), sim && sim.trendSavings);
  DS.setWhatIfParams(noAdj);
  w.renderWhatIf();
  t = text('page-whatif');
  ok('假设分析公式写明「− 大额计划要存 / 还的钱」', t.indexOf('− 大额计划要存 / 还的钱') !== -1);
  ok('假设分析不再说计划预留「不影响上面的储蓄预测」', t.indexOf('不影响上面的储蓄预测') === -1 && t.indexOf('本月要存 / 还') !== -1);
  ok('假设分析：趋势 / 假设两列「可储蓄」都是 +RM 0.00（计划吃光结余），不是 98.62',
    t.split('可储蓄 +' + money(0)).length === 3 && t.indexOf(money(98.62)) === -1, t.slice(t.indexOf('可储蓄') - 10, t.indexOf('可储蓄') + 40));
  // 把餐饮剩余支出砍到 0：假设情景的结余 = 1000 − 378 = 622，计划拿 100，可储蓄 522 —— 假设列要用它自己的结余重算瀑布
  DS.setWhatIfParams({ categoryAdjustments: { [food.id]: { mode: 'zero', value: 0 } }, hypotheticalCategories: [], globalAdjustment: { mode: null, value: null } });
  w.renderWhatIf();
  t = text('page-whatif');
  ok('假设分析：假设情景按自己的结余重算 → 可储蓄 +RM 522.00（总结余 622 − 计划 100），不是 622', t.indexOf('可储蓄 +' + money(522)) !== -1 && t.indexOf('可储蓄 +' + money(622)) === -1,
    t.slice(t.indexOf('可储蓄') - 10, t.indexOf('可储蓄') + 120));
  DS.setWhatIfParams(noAdj);

  /* ---------- 2. 没有计划：两个量相等，什么都不变 ---------- */
  section('【无计划】预计储蓄 = 预计结余，没有多余的小字');
  seed({ food: 378 });
  fc = SE.getSavingsForecast(MONTH);
  ok('无计划：free === surplus === 98.62', near(fc.free, 98.62) && near(fc.surplus, 98.62) && fc.planReserved === 0, fc);
  t = overview();
  ok('无计划：目标环 预计储蓄 RM 98.62 / RM 200.00', t.indexOf('预计储蓄 ' + money(98.62) + ' / ' + money(200)) !== -1);
  ok('无计划：不出现「月底预计剩余 … 要留给大额计划」解释', t.indexOf('要留给大额计划') === -1);
  DS.setWhatIfParams(noAdj);
  w.renderWhatIf();
  t = text('page-whatif');
  ok('无计划：假设分析仍用原公式', t.indexOf('储蓄 = 收入 − 总支出（已包含还没付的账单）') !== -1 && t.indexOf('大额计划要存 / 还的钱') === -1);

  /* ---------- 3. 结余够付计划：计划拿它的应还，剩下的是储蓄 ---------- */
  section('【结余够】3000 收入，花 300 → 结余 2284.62，计划拿 100，预计储蓄 2184.62');
  seed({ income: 3000, food: 300, plans: [{ id: 'B1', mode: 'borrow', total: 600, months: 6 }] });
  fc = SE.getSavingsForecast(MONTH);
  ok('结余 2284.62 / 计划 100 / 储蓄 2184.62', near(fc.surplus, 2284.62) && near(fc.planReserved, 100) && near(fc.free, 2184.62), fc);
  ok('与计划中心一致', near(PM.getForecast(MONTH).predictedSavings, fc.free));
  t = overview();
  ok('总览：目标环 预计储蓄 ≥ 目标 → 「预计可达成目标」（不是「已达成」）', t.indexOf('预计可达成目标') !== -1 && t.indexOf('已达成目标') === -1);
  w.renderReport();
  ok('报告页：有储蓄时附注「另有 RM 100.00 要留给大额计划」', text('page-report').indexOf('另有 ' + money(100) + ' 要留给大额计划') !== -1);

  /* ---------- 4. 超支：计划拿不到钱，储蓄为负，如实显示 ---------- */
  section('【超支】结余为负：计划拿 0，预计储蓄 = 负的结余');
  seed({ income: 500, food: 378, plans: [{ id: 'B1', mode: 'borrow', total: 600, months: 6 }] });
  fc = SE.getSavingsForecast(MONTH);
  ok('结余 −401.38 / 计划 0 / 储蓄 −401.38', near(fc.surplus, -401.38) && fc.planReserved === 0 && near(fc.free, -401.38), fc);
  t = overview();
  ok('总览：预计超支 401.38', t.indexOf('预计超支 ' + money(401.38)) !== -1);
  ok('总览：目标达成不会是负百分比', /目标达成 0%/.test(t) && !/目标达成 -/.test(t));

  /* ---------- 5. 信用卡分期：已在支出里，不从结余里再扣 ---------- */
  section('【信用卡分期】已在预计支出里，不算「存 / 还」的预留');
  seed({ income: 1000, food: 130, plans: [{ id: 'C1', mode: 'credit', total: 1200, months: 12 }] });
  DS.addRecord({ amount: 100, categoryId: food.id, date: MONTH + '-01T09:00', note: 'inst', planId: 'C1', planMonth: MONTH, excludeFromAvg: true });
  fc = SE.getSavingsForecast(MONTH);
  // 130 ÷ 13 × 31 = 310 日常 + 100 分期（原样） = 410
  ok('预计月末支出 = 310 日常 + 100 分期 = 410', near(SE.getPredictedMonthEndTotal(MONTH), 410), SE.getPredictedMonthEndTotal(MONTH));
  ok('信用卡分期：计划预留 0，预计储蓄 = 预计结余 = 590', fc.planReserved === 0 && near(fc.surplus, 590) && near(fc.free, 590), fc);
  const pc = PM.getForecast(MONTH);
  ok('计划中心：预计还款含分期 100，但 reservedPay = 0', near(pc.totalPredictedPay, 100) && pc.reservedPay === 0, [pc.totalPredictedPay, pc.reservedPay]);

  /* ---------- 6. 多个计划：截止日早的先拿（还债优先） ---------- */
  section('【多个计划】瀑布：结束月早的先拿');
  seed({ food: 378, plans: [
    { id: 'LATE', mode: 'borrow', total: 600, months: 6 },
    { id: 'EARLY', mode: 'save', total: 200, months: 2 }
  ] });
  fc = SE.getSavingsForecast(MONTH);
  const pw = PM.getForecast(MONTH);
  ok('两个计划各应 100，结余 98.62：EARLY 拿 98.62，LATE 拿 0', near(pw.plans.EARLY.predictedPay, 98.62) && near(pw.plans.LATE.predictedPay, 0), pw.plans);
  ok('预留合计 98.62，预计储蓄 0', near(fc.planReserved, 98.62) && near(fc.free, 0), fc);

  /* ---------- 7. 预测月总支出：账单（含还没付的）和分期按实际金额，只有日常外推 ---------- */
  section('【预测】账单（含还没付的）和分期按实际金额，只有日常按日均外推');
  DS.clearAll();
  w.localStorage.removeItem('budgetStatsRange');
  setBills(true);
  DS.setMonthlyIncome(MONTH, 3000);
  DS.setSavingsTarget({ type: 'fixed', fixedAmount: 200, percent: 0 });
  DS.addBillCategory({ name: '房租', icon: '🏠' });
  const rent = DS.getBillCategories()[0];
  DS.setBillAmount(MONTH, rent.id, 1500);                                   // 计划 1500，只付了 1000
  DS.addRecord({ amount: 1000, categoryId: rent.id, date: MONTH + '-03T09:00', note: 'rent' });
  DS.addRecord({ amount: 130, categoryId: food.id, date: MONTH + '-05T12:00', note: 'food' });
  let bd = SE.getPredictedBreakdown(MONTH);
  ok('已付账单 1000 + 没付的计划 500 原样，日常 130÷13×31 = 310，合计 1810（旧算法：已付账单被放大，得 2694.62，没付的 500 还不在里面）', near(bd.bills, 1000) && near(bd.billsUnpaid, 500) && near(bd.normal, 310) && near(bd.predicted, 1810), bd);
  ok('各部分之和 === 预测数', near(bd.bills + bd.billsUnpaid + bd.instalments + bd.large + bd.normal, bd.predicted), bd);
  ok('getPredictedMonthEndTotal 与明细同源', near(SE.getPredictedMonthEndTotal(MONTH), bd.predicted));
  const bv = SE.getPredictedBreakdownVariable(MONTH);
  ok('去账单口径 = 日常 310；含账单口径多出来的 1500 = 已付 1000 + 没付的 500 —— 开关到底管了什么，一目了然', near(bv.predicted, 310) && near(bd.predicted - bv.predicted, 1500), [bv, bd]);
  fc = SE.getSavingsForecast(MONTH);
  ok('结余 = 3000 − 1810 = 1190（没付的账单已在预测里，不再额外扣一次）', near(fc.unpaidBills, 500) && near(fc.surplus, 1190), fc);
  ok('计划中心的月底预计总花费 = 同一个 1810', near(PM.getForecast(MONTH).predictedSpend, 1810));
  // 过去的月份：已过天数 = 整月，日常不再放大
  DS.setMonthlyIncome(PAST, 3000);
  DS.addRecord({ amount: 1000, categoryId: rent.id, date: PAST + '-03T09:00', note: 'rent9' });
  DS.addRecord({ amount: 300, categoryId: food.id, date: PAST + '-20T12:00', note: 'food9' });
  ok('过去的月份：1000 + 300 = 1300', near(SE.getPredictedMonthEndTotal(PAST), 1300), SE.getPredictedMonthEndTotal(PAST));
  // 信用卡分期（带 planId）单独一项，不混进「大额」，也不混进账单
  DS.addRecord({ amount: 100, categoryId: food.id, date: MONTH + '-01T09:00', note: 'inst', planId: 'X', planMonth: MONTH, excludeFromAvg: true });
  bd = SE.getPredictedBreakdown(MONTH);
  ok('分期单独一项：instalments = 100，large = 0，bills 仍是 1000', near(bd.instalments, 100) && near(bd.large, 0) && near(bd.bills, 1000) && near(bd.predicted, 1910), bd);
  // 滚动 30 天的孪生用同一套拆法
  w.localStorage.setItem('budgetStatsRange', 'rolling30');
  const pbd = SE.getPeriodPredictedBreakdown();
  ok('近 30 天：各部分之和 === 预测数，已付账单不被外推', near(pbd.bills + pbd.billsUnpaid + pbd.instalments + pbd.large + pbd.normal, pbd.predicted) && near(pbd.bills, 1000) && near(pbd.billsUnpaid, 500), pbd);
  ok('近 30 天：getPeriodPredictedMonthEndTotal 与明细同源', near(SE.getPeriodPredictedMonthEndTotal(), pbd.predicted));
  w.localStorage.removeItem('budgetStatsRange');

  /* ---------- 8. 统计页：当前已存扣未付账单；近 30 天下储蓄预测仍是当月口径 ---------- */
  section('【统计页】本月还剩扣未付账单；近 30 天下储蓄预测不变成「收入 − 近 30 天已花」');
  DS.clearAll();
  setBills(true);
  DS.setMonthlyIncome(MONTH, 3000);
  DS.setSavingsTarget({ type: 'fixed', fixedAmount: 200, percent: 0 });
  DS.addBillCategory({ name: '房租', icon: '🏠' });
  const rent2 = DS.getBillCategories()[0];
  DS.setBillAmount(MONTH, rent2.id, 1500);
  DS.addRecord({ amount: 1000, categoryId: rent2.id, date: MONTH + '-03T09:00', note: 'rent' });
  DS.addRecord({ amount: 130, categoryId: food.id, date: MONTH + '-05T12:00', note: 'food' });
  w.renderStats();
  t = text('page-stats');
  let card = t.slice(t.indexOf('当月储蓄预估'));
  // 3000 − 已花 1130 − 未付账单 500 = 1370（旧：3000 − 1130 = 1870，与总览 / 报告不一致）
  ok('统计页 本月还剩 = 3000 − 1130 − 500 = 1370，与总览、报告同一口径', card.indexOf('本月还剩 ' + money(1370)) !== -1, card.slice(0, 160));
  ok('统计页不再叫「当前已存」「累计已存」', t.indexOf('当前已存') === -1 && t.indexOf('累计已存') === -1);
  t = overview();
  ok('总览 本月还剩 同为 1370', t.indexOf('本月还剩 ' + money(1370)) !== -1, t.slice(t.indexOf('本月还剩'), t.indexOf('本月还剩') + 40));
  ok('总览不再叫「累计已存」', t.indexOf('累计已存') === -1);
  w.renderReport();
  ok('报告页 本月还剩 同为 1370（已存 / 储蓄率那格）', text('page-report').indexOf(money(1370)) !== -1);

  const expectFree = SE.getSavingsForecast(MONTH).free;
  w.localStorage.setItem('budgetStatsRange', 'rolling30');
  w.renderStats();
  card = text('page-stats');
  card = card.slice(card.indexOf('当月储蓄预估'));
  ok('近 30 天模式：统计页预计月末储蓄 = 当月预测 ' + money(expectFree), card.indexOf('预计月末储蓄 ' + money(expectFree)) !== -1, card.slice(0, 200));
  w.renderReport();
  ok('近 30 天模式：报告页目标环仍是当月口径', text('page-report').indexOf(money(expectFree) + ' / ' + money(200)) !== -1);
  w.localStorage.removeItem('budgetStatsRange');

  /* ---------- 9. 措辞 ---------- */
  section('【措辞】标题跟着开关走；计划面板写明含固定账单并列出公式');
  setBills(true);
  t = overview();
  ok('勾选「含固定账单」：卡片叫「预测月总支出」', t.indexOf('预测月总支出') !== -1 && t.indexOf('预测月日常支出') === -1);
  ok('明细只列不为 0 的部分：「月账单 … ＋ 日常消费预估 …」（月账单 = 已付 1000 + 没付的 500），没有「大额消费」「信用卡分期」（它们是 0）',
    /月账单 RM 1,500\.00 ＋ 日常消费预估 RM 310\.00/.test(t) && t.indexOf('大额消费') === -1 && t.indexOf('信用卡分期 RM') === -1, t.slice(t.indexOf('月账单 RM') - 5, t.indexOf('月账单 RM') + 70));
  ok('任何位置都不再出现数额为 0 的部分（如「月账单 RM 0.00」）', !/(月账单|信用卡分期|大额消费|日常消费预估) RM 0\.00/.test(t));
  setBills(false);
  t = overview();
  ok('取消勾选：卡片改叫「预测月日常支出」（不再名不副实）', t.indexOf('预测月日常支出') !== -1 && t.indexOf('预测月总支出') === -1);
  ok('取消勾选：明细只剩日常消费预估一项 = 总数，这一行就不再重复显示', t.indexOf('日常消费预估') === -1 && t.indexOf('月账单 RM') === -1);
  setBills(true);

  /* ---------- 10. 点预测卡片 = 切换「含固定账单」；当前状态写在卡片上 ---------- */
  section('【预测卡片】整张卡片是开关，状态和引导写在卡片上');
  // 0 的部分不显示：没有记过账单、没有大额 → 只有一项，这行说明就不显示
  seed({ food: 130 });
  t = overview();
  ok('没有账单、没有大额：不显示「日常消费预估 …」这行（和上面的总数一模一样，没意义）', t.indexOf('日常消费预估') === -1 && t.indexOf('月账单 RM') === -1);
  // 有大额、没记账单：只显示两项，没有「月账单 RM 0.00」
  seed({ food: 130 });
  DS.addRecord({ amount: 400, categoryId: food.id, date: MONTH + '-02T09:00', note: 'big', excludeFromAvg: true });
  t = overview();
  ok('有大额、没有账单：写「大额消费 … ＋ 日常消费预估 …」，没有「月账单 RM 0.00」', /大额消费 RM 400\.00 ＋ 日常消费预估 RM 310\.00/.test(t) && t.indexOf('月账单 RM') === -1, t.slice(t.indexOf('大额消费') - 5, t.indexOf('大额消费') + 60));
  w.renderStats();
  ok('统计页的预测卡同样不显示 0 的部分', !/(月账单|信用卡分期|大额消费|日常消费预估) RM 0\.00/.test(text('page-stats')));

  seed({ food: 130 });
  DS.addBillCategory({ name: '房租', icon: '🏠' });
  const rent3 = DS.getBillCategories()[0];
  DS.setBillAmount(MONTH, rent3.id, 1000);
  DS.addRecord({ amount: 1000, categoryId: rent3.id, date: MONTH + '-03T09:00', note: 'rent' });
  setBills(true);
  w.renderOverview();
  const predCard = () => w.document.getElementById('predictedCard');
  const cardText = () => predCard().textContent.replace(/\s+/g, ' ');
  ok('预测卡片是个按钮（可点、可用键盘）', !!predCard() && predCard().getAttribute('role') === 'button' && predCard().getAttribute('tabindex') === '0' && /toggleOverviewBills/.test(predCard().getAttribute('onclick')));
  ok('含固定账单时：卡片上写着「✅ 含固定账单」和「点一下改成不含」', cardText().indexOf('✅ 含固定账单') !== -1 && cardText().indexOf('点一下改成不含') !== -1, cardText());
  ok('悬停说明：讲清这是总览共用的开关，本月总支出和预算进度会一起变', predCard().getAttribute('title').indexOf('本月总支出') !== -1 && predCard().getAttribute('title').indexOf('预算进度') !== -1);
  ok('含固定账单：预测 = 1310（月账单 1000 + 日常 310）', cardText().indexOf(money(1310)) !== -1, cardText());

  predCard().click();
  ok('点一下：记住了「不含」', w.localStorage.getItem('chartBillToggle_overviewBudget') === '0');
  ok('点一下：卡片改成「⬜ 不含固定账单」「点一下改成包含」，标题和数字跟着变（只剩日常 310）',
    cardText().indexOf('⬜ 不含固定账单') !== -1 && cardText().indexOf('点一下改成包含') !== -1 && cardText().indexOf('预测月日常支出') !== -1 && cardText().indexOf(money(310)) !== -1 && cardText().indexOf(money(1310)) === -1, cardText());
  ok('点一下：同一个开关带动了预算进度卡片上的勾选框', w.document.getElementById('toggle-overviewBudget').checked === false);
  ok('点一下：本月总支出卡片也一起变（不含固定账单 = 只剩日常 130）', /本月总支出.{0,20}RM 130.00/.test(text('page-overview')) && text('page-overview').slice(0, text('page-overview').indexOf('日均支出')).indexOf('RM -') === -1, text('page-overview').slice(0, 160));
  predCard().click();
  ok('再点一下：回到「✅ 含固定账单」，数字回到 1310', cardText().indexOf('✅ 含固定账单') !== -1 && cardText().indexOf(money(1310)) !== -1 && w.document.getElementById('toggle-overviewBudget').checked === true, cardText());
  // 键盘：Enter 也能切换
  predCard().dispatchEvent(new w.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  ok('键盘 Enter 也能切换', w.localStorage.getItem('chartBillToggle_overviewBudget') === '0');
  // 预算进度卡片上的勾选框也要把整个总览（包括上面的卡片）刷新，不能只重画圆环
  w.document.getElementById('toggle-overviewBudget').checked = true;
  w.toggleBillFilter('overviewBudget');
  ok('勾选框改成含固定账单后，上面的预测卡片也同步更新', cardText().indexOf('✅ 含固定账单') !== -1 && cardText().indexOf(money(1310)) !== -1, cardText());
  setBills(true);

  /* ---------- 11. 用户报告：点开关只有「大额消费」在变，月账单没算 ---------- */
  section('【开关管什么】月账单（含还没付的）和信用卡分期各自一项，开关一关恰好少掉这两项');
  seed({ income: 5000, food: 130 });
  DS.addBillCategory({ name: '房租', icon: '🏠' });
  const rent4 = DS.getBillCategories()[0];
  DS.setBillAmount(MONTH, rent4.id, 1200);             // 月账单设了 1200，一笔都还没付 / 没记
  DS.addRecord({ amount: 600, categoryId: food.id, date: MONTH + '-01T09:00', note: 'inst', planId: 'P9', planMonth: MONTH, excludeFromAvg: true }); // 信用卡分期
  DS.addRecord({ amount: 400, categoryId: food.id, date: MONTH + '-02T09:00', note: 'big', excludeFromAvg: true });                                  // 真正的大额
  setBills(true);
  t = overview();
  ok('含固定账单：明细 = 月账单 1200（一笔没付也算）＋ 信用卡分期 600 ＋ 大额消费 400 ＋ 日常消费预估 310',
    /月账单 RM 1,200\.00 ＋ 信用卡分期 RM 600\.00 ＋ 大额消费 RM 400\.00 ＋ 日常消费预估 RM 310\.00/.test(t), t.slice(t.indexOf('月账单 RM') - 5, t.indexOf('月账单 RM') + 120));
  ok('含固定账单：预测 = 1200 + 600 + 400 + 310 = 2510', text('predictedCard').indexOf(money(2510)) !== -1, text('predictedCard'));
  setBills(false);
  t = overview();
  ok('不含固定账单：只剩 大额消费 400 ＋ 日常消费预估 310 = 710（月账单、信用卡分期整项消失，大额消费不变）',
    /大额消费 RM 400\.00 ＋ 日常消费预估 RM 310\.00/.test(t) && t.indexOf('月账单 RM') === -1 && t.indexOf('信用卡分期 RM') === -1 && text('predictedCard').indexOf(money(710)) !== -1, text('predictedCard'));
  ok('储蓄预测与卡片同一口径：5000 − 2510 = 2490（没付的月账单只扣这一次）', near(SE.getSavingsForecast(MONTH).surplus, 2490), SE.getSavingsForecast(MONTH));
  setBills(true);

  seed({ food: 378, plans: [{ id: 'B1', mode: 'borrow', total: 600, months: 6 }] });
  w.openPlanCenter();
  const modal = w.document.getElementById('modalContent').textContent.replace(/\s+/g, ' ');
  ok('计划面板：「月底预计总花费（含固定账单）」', modal.indexOf('月底预计总花费（含固定账单）') !== -1);
  ok('计划面板：公式说明里讲清结余 / 还款 / 储蓄的关系', modal.indexOf('月底预计剩余 = 月收入 − 月底预计总花费（已包含还没付的月账单）') !== -1 && modal.indexOf('预计储蓄 = 月底预计剩余 − 要存 / 要还的计划拿走的钱') !== -1);

  console.log('\n===== RESULT: ' + pass + ' PASS / ' + fail + ' FAIL =====');
  process.exit(fail ? 1 : 0);
}, 1500);
