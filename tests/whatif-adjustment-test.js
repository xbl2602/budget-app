// 假设分析：给「父分类」设的调整，是对整个分类生效，不是对它下面每个叶子各生效一次。
// Usage: bash build.sh && node tests/whatif-adjustment-test.js   (需要 jsdom：npm i --no-save jsdom)
//
// 回归背景：餐饮有 4 个子分类，用户在「餐饮（整体）」上设「比趋势 −RM2/天」，
// 引擎把这条设置交给每个叶子各算一次，结果省了 4 × RM2/天（剩 18 天 → 144，
// 而不是 36）。「设日均值」「固定剩余总额」同理被放大；「± %」和「取消消费」
// 本来就是按比例的，不受影响。
//
// 约定（与 25-page-guides 的用户指南一致）：
//   ±RM/天、设日均值、固定剩余总额 —— 值描述的是「这个分类整体」；
//   子分类上单独设置的优先于父分类（包括显式的「保持趋势」）；
//   0 的下限作用于整体，而不是每个叶子。
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');

// 固定「现在」：2026-10-13，本月第 13 天，剩 18 天。否则月底最后一天剩 0 天，
// 所有断言都会空转成「省 0 元」。
const FIXED = new Date(2026, 9, 13, 12, 0, 0).getTime();
const MONTH = '2026-10';
const TODAY = 13, REMAINING = 18;

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
  const DS = w.DataStore, SE = w.SimulationEngine;

  ok('时间已固定在 10-13（否则下面的断言都在空转）', new w.Date().getDate() === TODAY);

  function fresh() {
    DS.clearAll();
    const food = DS.getExpenseRootCategories().find(c => c.name === '餐饮');
    const kids = DS.getChildren(food.id);          // 早餐 午餐 晚餐 饮料/咖啡
    return { food, kids, by: n => kids.find(k => k.name === n) };
  }
  // 每个叶子每天花 perDay，从 1 号到今天
  function spend(cat, perDay) {
    for (let d = 1; d <= TODAY; d++) DS.addRecord({ amount: perDay, categoryId: cat.id, date: day(d), note: 'x' });
  }
  const run = adj => SE.run(MONTH, { categoryAdjustments: adj || {} });

  /* ---------- 1. 用户报告的场景 ---------- */
  section('【餐饮（整体）−RM2/天，剩 18 天】');
  let { food, kids, by } = fresh();
  kids.forEach(k => spend(k, 10));                 // 4 个叶子，各日均 10，餐饮合计日均 40
  const base = run();
  ok('剩余天数是 18', base.remainingDays === REMAINING, base.remainingDays);
  ok('不调整时，剩余 = 4 × 10 × 18 = 720', near(base.projectedRemaining, 720), base.projectedRemaining);

  const rootCut = run({ [food.id]: { mode: 'adjust', value: -2 } });
  const rootSaved = base.totalProjected - rootCut.totalProjected;
  ok('父分类 −2/天 省 2×18 = 36（旧代码是 144）', near(rootSaved, 36), rootSaved);
  const leafCut = run({ [by('早餐').id]: { mode: 'adjust', value: -2 } });
  ok('只在一个叶子上设 −2/天，同样省 36（单叶子行为不变）', near(base.totalProjected - leafCut.totalProjected, 36), base.totalProjected - leafCut.totalProjected);
  ok('父分类与单叶子的节省一致 —— 设在哪一层都是「这个分类每天少 2 块」', near(rootSaved, base.totalProjected - leafCut.totalProjected));

  /* ---------- 2. 另外两个绝对值模式 ---------- */
  section('【设日均值 / 固定剩余总额：值是整个分类的】');
  const rootDaily = run({ [food.id]: { mode: 'daily', value: 30 } });
  ok('「设日均值 30」→ 剩余 30×18 = 540（旧代码 2160，比不调整还多 3 倍）', near(rootDaily.projectedRemaining, 540), rootDaily.projectedRemaining);
  ok('日均从 40 降到 30 是「省钱」而不是「多花」', rootDaily.totalProjected < base.totalProjected);
  const rootTotal = run({ [food.id]: { mode: 'total', value: 100 } });
  ok('「固定剩余总额 100」→ 整个分类一共 100（旧代码 400）', near(rootTotal.projectedRemaining, 100), rootTotal.projectedRemaining);
  const perLeaf = Object.values(rootDaily.categoryProjections).filter(p => p.rootId === food.id).map(p => p.projectedRemaining);
  ok('整体的值按各叶子当前日均占比分摊（这里各叶子相同 → 各 135）', perLeaf.length === 4 && perLeaf.every(v => near(v, 135)), perLeaf);

  /* ---------- 3. 本来就对的模式不能被改坏 ---------- */
  section('【± % / 取消消费 不变】');
  const pct = run({ [food.id]: { mode: 'percent', value: -10 } });
  ok('「−10%」省 720 的 10% = 72', near(base.totalProjected - pct.totalProjected, 72), base.totalProjected - pct.totalProjected);
  const zero = run({ [food.id]: { mode: 'zero', value: null } });
  ok('「取消消费」→ 剩余 0', near(zero.projectedRemaining, 0), zero.projectedRemaining);

  /* ---------- 4. 子分类优先于父分类 ---------- */
  section('【子分类单独设置优先】');
  const lunch = by('午餐');
  const childZero = run({ [food.id]: { mode: 'adjust', value: -2 }, [lunch.id]: { mode: 'zero', value: null } });
  // 午餐 清零；其余 3 个叶子（合计日均 30）整体 −2/天 → (30−2)×18 = 504
  ok('午餐单独「取消消费」，其余三个整体 −2/天 → 504', near(childZero.projectedRemaining, 504), childZero.projectedRemaining);
  const childTrend = run({ [food.id]: { mode: 'daily', value: 30 }, [lunch.id]: { mode: 'trend', value: null } });
  // 午餐 显式保持趋势（10×18 = 180）；其余三个整体日均 30 → 540；合计 720
  ok('午餐显式「保持趋势」不受父分类约束：180 + 540 = 720', near(childTrend.projectedRemaining, 720), childTrend.projectedRemaining);

  /* ---------- 5. 0 的下限作用于整体 ---------- */
  section('【0 的下限】');
  const hugeCut = run({ [food.id]: { mode: 'adjust', value: -100 } });
  ok('砍得比花得还多：剩余 0，不为负', near(hugeCut.projectedRemaining, 0), hugeCut.projectedRemaining);
  ok('最多省下整个分类本来要花的 720', near(base.totalProjected - hugeCut.totalProjected, 720), base.totalProjected - hugeCut.totalProjected);
  ok('每个叶子都不为负', Object.values(hugeCut.categoryProjections).every(p => p.projectedRemaining >= 0));

  /* ---------- 6. 分摊按当前节奏；没历史就平分 ---------- */
  section('【分摊方式】');
  ({ food, kids, by } = fresh());
  spend(by('早餐'), 5);
  spend(by('午餐'), 15);                           // 晚餐、饮料没花过
  const uneven = run({ [food.id]: { mode: 'daily', value: 10 } });
  ok('整体日均 10 → 剩余 180', near(uneven.projectedRemaining, 180), uneven.projectedRemaining);
  ok('早餐:午餐 = 5:15 → 45 : 135', near(uneven.categoryProjections[by('早餐').id].projectedRemaining, 45)
    && near(uneven.categoryProjections[by('午餐').id].projectedRemaining, 135),
    [uneven.categoryProjections[by('早餐').id].projectedRemaining, uneven.categoryProjections[by('午餐').id].projectedRemaining]);
  ok('没花过钱的叶子仍是 0', near(uneven.categoryProjections[by('晚餐').id].projectedRemaining, 0));

  ({ food, kids, by } = fresh());                  // 一分钱没花
  const none = run({ [food.id]: { mode: 'adjust', value: 2 } });
  ok('零历史、整体 +2/天 → 36', near(none.projectedRemaining, 36), none.projectedRemaining);
  ok('零历史时平分给 4 个叶子（各 9）', Object.values(none.categoryProjections).filter(p => p.rootId === food.id).every(p => near(p.projectedRemaining, 9)));

  /* ---------- 7. 三层分类：祖父的设置要传到孙子 ---------- */
  section('【三层分类】');
  ({ food, kids, by } = fresh());
  const dine = DS.addCategory({ name: '堂食', icon: '🍽', parentId: by('午餐').id });
  const take = DS.addCategory({ name: '外卖', icon: '🛵', parentId: by('午餐').id });
  [by('早餐'), by('晚餐'), by('饮料/咖啡'), dine, take].forEach(k => spend(k, 10));   // 午餐 已成为非叶子
  const base3 = run();
  const deep = run({ [food.id]: { mode: 'adjust', value: -2 } });
  ok('根上设 −2/天，午餐下的孙子也算在内（整体仍只省 36）', near(base3.totalProjected - deep.totalProjected, 36), base3.totalProjected - deep.totalProjected);
  ok('旧代码只看直接父级，孙子根本拿不到祖父的设置', deep.categoryProjections[dine.id].projectedRemaining < base3.categoryProjections[dine.id].projectedRemaining
    || deep.categoryProjections[take.id].projectedRemaining < base3.categoryProjections[take.id].projectedRemaining);

  console.log('\n===== RESULT: ' + pass + ' PASS / ' + fail + ' FAIL =====');
  process.exit(fail > 0 ? 1 : 0);
}, 600);
