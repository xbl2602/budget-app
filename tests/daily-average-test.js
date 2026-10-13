// 「日均」只有一个定义：已过天数内，我自己的支出（不含他人份额、不含「不计日均」记录）÷ 已过天数。
// Usage: bash build.sh && node tests/daily-average-test.js   (需要 jsdom：npm i --no-save jsdom)
//
// 回归背景：
//  1. 报告页底部「本月至今已消费 X，日均 Y」把 Y 算成 总支出 ÷「有消费记录的天数」，
//     与总览 / 统计 / 假设分析用的 getDailyAverage 是同名不同量：
//     同一份数据总览显示 7.69，报告页显示 250.00。
//  2. 滚动 30 天的 getPeriodDailyAverage 漏了「不计日均」过滤，
//     而月度版本和它自己的趋势孪生 getPeriodPredictedTotal 都过滤。
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');

// 固定「现在」：2026-10-13 → 本月已过 13 天；滚动 30 天窗口已过 30 天
const FIXED = new Date(2026, 9, 13, 12, 0, 0).getTime();
const MONTH = '2026-10';
const DAYS_PASSED = 13;

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
const day = d => MONTH + '-' + String(d).padStart(2, '0') + 'T12:00';

setTimeout(() => {
  try { w.Changelog.markSeen(w.Changelog.all()[0].id); w.closeModal(); } catch (e) { /* not booted */ }
  const DS = w.DataStore, SE = w.StatsEngine;
  ok('时间已固定在 10-13', new w.Date().getDate() === DAYS_PASSED);

  const food = DS.getExpenseRootCategories().find(c => c.name === '餐饮');
  const cat = DS.getChildren(food.id)[0];

  // 100 元正常消费（3 个不同的日子）+ 1 笔 900 的大额，已勾「不计日均」
  function seedBasic() {
    DS.clearAll();
    DS.setMonthlyIncome(MONTH, 5000);
    DS.addRecord({ amount: 40, categoryId: cat.id, date: day(3), note: 'a' });
    DS.addRecord({ amount: 30, categoryId: cat.id, date: day(6), note: 'b' });
    DS.addRecord({ amount: 30, categoryId: cat.id, date: day(9), note: 'c' });
    DS.addRecord({ amount: 900, categoryId: cat.id, date: day(10), note: 'laptop', excludeFromAvg: true });
  }

  /* ---------- 1. 报告页渲染出来的日均 ---------- */
  section('【报告页「日均」= 全应用统一的日均】');
  seedBasic();
  const canonical = SE.getDailyAverage(MONTH);
  ok('统一口径：100 ÷ 已过 13 天 = 7.69（不含 900 的大额）', near(canonical, 100 / DAYS_PASSED), canonical);

  w.reportMonth = '';
  w.renderReport();
  const reportText = w.document.getElementById('page-report').textContent;
  const sentence = (reportText.match(/本月至今已消费[^。]*。/) || [''])[0];
  ok('报告页有「已消费…日均…」这句话', sentence.indexOf('日均') !== -1, sentence);
  ok('句中日均 = 统一口径 ' + w.formatMoney(canonical), sentence.indexOf('日均 ' + w.formatMoney(canonical)) !== -1, sentence);
  const oldWrong = w.formatMoney(1000 / 4);        // 旧算法：总支出 1000 ÷ 有消费的 4 天
  ok('不再是旧算法的 ' + oldWrong + '（总支出 ÷ 有消费的天数）', sentence.indexOf(oldWrong) === -1, sentence);

  ok('有「不计日均」大额时，句尾说明日均不含它（否则 1000÷13≠7.69 又像算错了）',
    /不含 1 笔[^）]*RM 900\.00/.test(sentence + (reportText.match(/（日均不含[^）]*）/) || [''])[0]),
    reportText.match(/（日均不含[^）]*）/));

  // 没有这类记录时不出现多余说明
  DS._data.records = DS._data.records.filter(r => !r.excludeFromAvg);
  DS.save();
  w.renderReport();
  ok('没有「不计日均」记录时不显示该说明', w.document.getElementById('page-report').textContent.indexOf('日均不含') === -1);
  DS.addRecord({ amount: 900, categoryId: cat.id, date: day(10), note: 'laptop', excludeFromAvg: true });

  // 同一天花很多次，不应改变日均：日均只看「已过天数」，与哪几天有记录无关
  DS.addRecord({ amount: 0.5, categoryId: cat.id, date: day(11), note: 'd' });
  const withExtraDay = SE.getDailyAverage(MONTH);
  ok('多一个「有消费的日子」不改变分母', near(withExtraDay, 100.5 / DAYS_PASSED), withExtraDay);

  /* ---------- 2. 滚动 30 天：必须与月度口径同一含义 ---------- */
  section('【滚动 30 天的日均也要尊重「不计日均」】');
  seedBasic();
  w.localStorage.setItem('budgetStatsRange', 'rolling30');
  const period = SE.getPeriodDailyAverage();
  ok('100 ÷ 30 = 3.33（旧代码把 900 也算进去 → 33.33）', near(period, 100 / 30), period);
  ok('与它自己的趋势孪生 getPeriodPredictedTotal ÷ 30 一致', near(period, SE.getPeriodPredictedTotal() / 30),
    [period, SE.getPeriodPredictedTotal() / 30]);

  /* ---------- 3. 月度 vs 滚动：同一份数据，只差分母 ---------- */
  section('【同一份数据下月度与滚动只差分母】');
  // 全部记录都落在「本月 1–13 日」∩「近 30 天」里，窗口内容相同，所以 月度×13 应 = 滚动×30。
  // 加一笔分摊账单：记录按全额入账（120），他人份额 80 不属于我的支出。
  DS.clearAll();
  DS.setMonthlyIncome(MONTH, 5000);
  DS.addRecord({ amount: 40, categoryId: cat.id, date: day(3), note: 'a' });
  DS.addRecord({ amount: 60, categoryId: cat.id, date: day(6), note: 'b' });
  DS.addRecord({ amount: 900, categoryId: cat.id, date: day(10), note: 'laptop', excludeFromAvg: true });
  DS.addRecord({ amount: 120, categoryId: cat.id, date: day(8), note: 'hotpot', splitBillId: 'sb1' });
  DS._data.contacts = [{ id: 'p1', name: '阿明' }, { id: 'p2', name: '小红' }];
  DS._data.splitBills = [{
    id: 'sb1', amount: 120, date: day(8), note: '', tag: 'hotpot', categoryId: cat.id, payer: 'self',
    selfShare: 40, mode: 'equal', createdAt: new w.Date().toISOString(), archived: false,
    participants: [
      { contactId: 'p1', name: '阿明', share: 40, paid: true, paidAmount: 40, unknown: false },
      { contactId: 'p2', name: '小红', share: 40, paid: false, unknown: false }
    ]
  }];
  DS.save();
  w.localStorage.setItem('budgetStatsRange', 'month');
  const monthAvg = SE.getDailyAverage(MONTH);
  w.localStorage.setItem('budgetStatsRange', 'rolling30');
  const rollAvg = SE.getPeriodDailyAverage();
  // 我的支出 = 40 + 60 + 120 − 80（他人份额）= 140；900 不计
  ok('月度：140 ÷ 13', near(monthAvg, 140 / DAYS_PASSED), monthAvg);
  ok('滚动：140 ÷ 30', near(rollAvg, 140 / 30), rollAvg);
  ok('月度 × 13 = 滚动 × 30：两个口径只差分母', near(monthAvg * DAYS_PASSED, rollAvg * 30), [monthAvg * DAYS_PASSED, rollAvg * 30]);

  console.log('\n===== RESULT: ' + pass + ' PASS / ' + fail + ' FAIL =====');
  process.exit(fail > 0 ? 1 : 0);
}, 600);
