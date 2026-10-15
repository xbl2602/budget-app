// 「含固定账单」开关：固定账单分类 + 信用卡分期流水 都跟着开关走，图表也真的随开关变化。
// Usage: bash build.sh && node tests/bill-toggle-test.js   (需要 jsdom：npm i --no-save jsdom)
//
// 回归背景：
//  1. 饼图 / 格子图 / 矩形图：固定账单分类存在独立的 billCategories 里，getRootAncestorId 认不出它，
//     汇总到根分类时被悄悄丢掉——勾不勾「含固定账单」图表都一样，永远没有账单。
//  2. 信用卡分期流水记在用户自己选的普通分类下，开关只按「分类是否是固定账单」判断，
//     所以取消勾选时分期依旧算在日常消费里。分期和房租一样是固定的月度支出，应一起被开关控制。
//
// 约定：
//   - 「固定」流水 = 记在固定账单分类下，或带 planId 的信用卡分期流水（StatsEngine.isFixedRecord）；
//   - 日常可花预算要把分期也扣掉（否则取消勾选后，分期既不在已花里、也不在预算里被扣，预算虚高）；
//   - 「已付账单 vs 计划账单」对账只看账单分类，分期不是计划账单的一部分；
//   - 假设分析 / 模拟器没有这个开关、仍把分期当成消费，它们用的预算保持原口径。
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');

const FIXED = new Date(2026, 9, 13, 12, 0, 0).getTime();
const MONTH = '2026-10';

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
    const s = stub();
    w.HTMLCanvasElement.prototype.getContext = function () { s.canvas = this; return s; };
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
  const DS = w.DataStore, SE = w.StatsEngine;
  const food = DS.getChildren(DS.getExpenseRootCategories().find(c => c.name === '餐饮').id)[0];
  const elec = DS.getChildren(DS.getExpenseRootCategories().find(c => c.name === '购物').id).find(c => c.name === '电子产品');

  // 月收入 5000；房租账单 1000（计划 1000 + 已付 1000）；日常餐饮 100；
  // 一笔 600 的信用卡分期，记在「购物 > 电子产品」下，带 planId
  function seed() {
    DS.clearAll();
    DS.setMonthlyIncome(MONTH, 5000);
    DS.addBillCategory({ name: '房租', icon: '🏠' });
    const rent = DS.getBillCategories()[0];
    DS.setBillAmount(MONTH, rent.id, 1000);
    DS.addRecord({ amount: 1000, categoryId: rent.id, date: MONTH + '-01T09:00', note: 'rent' });
    DS.addRecord({ amount: 100, categoryId: food.id, date: MONTH + '-05T12:00', note: 'food' });
    DS.addRecord({ amount: 600, categoryId: elec.id, date: MONTH + '-01T09:00', note: 'inst', planId: 'p1', planMonth: MONTH, excludeFromAvg: true });
    return rent;
  }
  const setToggle = on => {
    w.localStorage.setItem('chartBillToggle_pieChart', on ? '1' : '0');
    w.localStorage.setItem('chartBillToggle_overviewBudget', on ? '1' : '0');
  };
  const sum = rows => rows.reduce((s, r) => s + r.total, 0);
  const names = rows => rows.map(r => r.cat.name);
  const overviewText = () => { w.renderOverview(); return w.document.getElementById('page-overview').textContent.replace(/\s+/g, ' '); };

  ok('时间已固定在 10-13', new w.Date().getDate() === 13);
  const rent = seed();
  w.renderStats(); // 让 statsMonth 落在当前月

  /* ---------- 1. 引擎：什么算「固定」 ---------- */
  section('【引擎】固定 = 账单分类 或 信用卡分期');
  const recs = SE.getRecordsInMonth(MONTH);
  const rentRec = recs.find(r => r.note === 'rent'), foodRec = recs.find(r => r.note === 'food'), instRec = recs.find(r => r.note === 'inst');
  ok('房租流水是固定', SE.isFixedRecord(rentRec));
  ok('分期流水是固定（虽然记在普通分类下）', SE.isFixedRecord(instRec) && !SE.isBillCategory(instRec.categoryId));
  ok('日常餐饮不是固定', !SE.isFixedRecord(foodRec));
  ok('日常支出 = 100（不含房租、不含分期）', near(SE.getVariableSpending(MONTH), 100), SE.getVariableSpending(MONTH));
  ok('固定支出 = 1600（房租 1000 + 分期 600）', near(SE.getFixedSpendingActual(MONTH), 1600), SE.getFixedSpendingActual(MONTH));
  ok('月总额 = 日常 + 固定', near(SE.getMonthTotal(MONTH), SE.getVariableSpending(MONTH) + SE.getFixedSpendingActual(MONTH)));
  ok('「已付账单」仍只算账单分类 = 1000（分期不是计划账单的一部分）', near(SE.getBillSpendingActual(MONTH), 1000), SE.getBillSpendingActual(MONTH));
  ok('分期单独 = 600', near(SE.getInstalmentSpending(MONTH), 600), SE.getInstalmentSpending(MONTH));

  // 分期流水被改记到账单分类下：只算一次，不重复
  instRec.categoryId = rent.id;
  ok('分期记到账单分类里：固定仍是 1600，不重复', near(SE.getFixedSpendingActual(MONTH), 1600) && near(SE.getInstalmentSpending(MONTH), 0),
    [SE.getFixedSpendingActual(MONTH), SE.getInstalmentSpending(MONTH)]);
  instRec.categoryId = elec.id;

  /* ---------- 2. 日常可花预算要把分期也扣掉 ---------- */
  section('【预算】分期从日常可花里扣');
  const sp = SE.getSpendablePlan(MONTH);
  ok('日常可花 = 5000 − 账单计划 1000 − 分期 600 = 3400', near(sp.spendableBudget, 3400), sp.spendableBudget);
  ok('planDueCredit = 600', near(sp.planDueCredit, 600), sp.planDueCredit);
  ok('planDueVirtual 不变（分期不是虚拟占用）', sp.planDueVirtual === 0, sp.planDueVirtual);
  ok('剩余日常 = 3400 − 100 = 3300，与改动前（4000 − 100 − 600）一致', near(sp.spendableBudget - SE.getVariableSpending(MONTH), 3300));

  /* ---------- 3. 图表：开关真的改变结果 ---------- */
  section('【饼图 / 格子图 / 矩形图】勾选 = 含账单和分期；取消 = 只看日常');
  setToggle(true);
  let rows = w.buildPieSliceRows(1, 'pieChart', null, null);
  ok('勾选：饼图含 房租、购物（分期）、餐饮', ['房租', '购物', '餐饮'].every(n => names(rows).indexOf(n) !== -1), names(rows));
  ok('勾选：饼图合计 = 月总额 1700', near(sum(rows), 1700), sum(rows));
  let tree = w.buildCategoryTreeNodes(1, null, null);
  ok('勾选：矩形/格子图含 房租', tree.some(n => n.name === '房租'), tree.map(n => n.name));
  ok('勾选：矩形/格子图合计 = 1700', near(tree.reduce((s, n) => s + n.value, 0), 1700));

  setToggle(false);
  rows = w.buildPieSliceRows(1, 'pieChart', null, null);
  ok('取消：饼图只剩 餐饮 100', near(sum(rows), 100) && names(rows).join() === '餐饮', [names(rows), sum(rows)]);
  tree = w.buildCategoryTreeNodes(1, null, null);
  ok('取消：矩形/格子图只剩 餐饮 100', tree.length === 1 && tree[0].name === '餐饮' && near(tree[0].value, 100), tree.map(n => n.name + ':' + n.value));
  rows = w.buildPieSliceRows(3, 'pieChart', null, null);
  ok('取消 + 展开到末级：分期所在的「电子产品」也不出现', names(rows).indexOf('电子产品') === -1 && near(sum(rows), 100), [names(rows), sum(rows)]);
  setToggle(true);
  rows = w.buildPieSliceRows(3, 'pieChart', null, null);
  ok('勾选 + 展开到末级：「电子产品」= 600、「房租」= 1000', near((rows.find(r => r.cat.name === '电子产品') || {}).total, 600) && near((rows.find(r => r.cat.name === '房租') || {}).total, 1000), rows.map(r => r.cat.name + ':' + r.total));

  /* ---------- 4. 总览 ---------- */
  section('【总览】预算环 / 前五分类');
  setToggle(true);
  let t = overviewText();
  ok('勾选：预算环 RM 1,700.00 / RM 5,000.00', t.indexOf('RM 1,700.00 / RM 5,000.00') !== -1);
  ok('勾选：前五分类里有「房租」', t.indexOf('房租') !== -1);
  setToggle(false);
  t = overviewText();
  ok('取消：预算环 RM 100.00 / RM 3,400.00（日常 / 扣掉账单和分期后的日常预算）', t.indexOf('RM 100.00 / RM 3,400.00') !== -1);
  ok('取消：前五分类里没有「房租」', t.indexOf('房租') === -1);
  ok('取消：前五分类里没有分期所在的「购物」', !/购物[^。]{0,40}RM 600\.00/.test(t));

  /* ---------- 5. 假设分析 / 模拟器保持原口径 ---------- */
  section('【模拟器】没有开关，仍把分期当消费，预算不重复扣');
  const sim = w.SimulationEngine.run(MONTH, { categoryAdjustments: {}, globalAdjustment: { mode: null, value: null } });
  ok('模拟器的日常可花 = 5000 − 1000 = 4000（分期在它的「已花」里，预算里不再扣）', sim && near(sim.spendable, 4000), sim && sim.spendable);

  console.log('\n===== RESULT: ' + pass + ' PASS / ' + fail + ' FAIL =====');
  process.exit(fail > 0 ? 1 : 0);
}, 600);
