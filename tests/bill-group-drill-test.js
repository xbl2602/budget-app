// 月账单 block in the stats category charts can be drilled into.
// Before: its id (bill-group) is synthetic, DataStore.getChildren() knows nothing
// about it, so a click on the pie / waffle / treemap block only toasted
// "没有子分类，没法再下钻".
// Usage: bash build.sh && node tests/bill-group-drill-test.js
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');

function canvasStub() {
  const noop = () => {};
  return {
    setTransform: noop, scale: noop, translate: noop, rotate: noop,
    clearRect: noop, fillRect: noop, strokeRect: noop, beginPath: noop,
    closePath: noop, moveTo: noop, lineTo: noop, arc: noop, arcTo: noop,
    bezierCurveTo: noop, quadraticCurveTo: noop, fill: noop, stroke: noop,
    clip: noop, fillText: noop, strokeText: noop,
    measureText: t => ({ width: String(t).length * 5 }), save: noop, restore: noop,
    createLinearGradient: () => ({ addColorStop: noop }),
    createRadialGradient: () => ({ addColorStop: noop }),
    createPattern: () => ({}), drawImage: noop,
    getImageData: () => ({ data: new Uint8ClampedArray(4) }), putImageData: noop,
    roundRect: noop, resetTransform: noop, setLineDash: noop, rect: noop,
    ellipse: noop, globalAlpha: 1, globalCompositeOperation: 'source-over',
    lineWidth: 1, lineCap: 'butt', lineJoin: 'miter',
    strokeStyle: '#000', fillStyle: '#000', font: '10px sans-serif',
    textAlign: 'left', textBaseline: 'alphabetic',
  };
}

const dom = new JSDOM(html, {
  runScripts: 'dangerously', pretendToBeVisual: true, url: 'http://localhost/', beforeParse(w) {
    w.CanvasRenderingContext2D = function () {};
    w.CanvasRenderingContext2D.prototype.roundRect = function () { return this; };
    w.HTMLCanvasElement.prototype.getContext = function () { return canvasStub(); };
    w.HTMLCanvasElement.prototype.toDataURL = function () { return 'data:image/png;base64,AAA'; };
  },
});
const { window } = dom;
const lines = [];
let pass = 0, fail = 0;
function assert(name, cond, extra) {
  if (cond) { pass++; lines.push('PASS ' + name); }
  else { fail++; lines.push('FAIL ' + name + (extra ? ' — ' + extra : '')); }
}
new Promise(resolve => { window.addEventListener('load', () => resolve()); setTimeout(resolve, 1000); })
  .then(async () => {
    try { await run(); } catch (e) { fail++; lines.push('FAIL threw — ' + (e && e.stack || e)); }
    lines.push('\n===== RESULT: ' + pass + ' PASS / ' + fail + ' FAIL =====');
    process.stdout.write(lines.join('\n') + '\n');
    process.exit(fail > 0 ? 1 : 0);
  });

const month = new Date().toISOString().slice(0, 7);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const BG = 'bill-group';

async function run() {
  const { DataStore } = window;
  // 餐饮 100 (a real category) | 月账单: 房租 recorded 1000, 网费 planned 80 and never recorded
  DataStore.clearAll();
  DataStore.importJSON(JSON.stringify({
    records: [
      { id: 'r1', categoryId: 'catA', amount: 100, date: month + '-03' },
      { id: 'r2', categoryId: 'bRent', amount: 1000, date: month + '-04', note: '十月房租' },
    ],
    categories: [
      { id: 'catA', name: '餐饮', icon: '🍜', color: '#e74c3c', parentId: null, sortOrder: 0 },
      { id: 'catA1', name: '外卖', icon: '🍱', color: '#e67e22', parentId: 'catA', sortOrder: 0 },
    ],
    budgets: {}, budgetObj: {}, categoryBudgets: {}, monthlyIncome: {},
    billAmounts: { [month]: { bRent: 1000, bNet: 80 } },
    savingsTarget: { type: 'fixed', fixedAmount: 0 },
    percentBase: 'gross', whatIfParams: null, allTags: [],
    billCategories: [
      { id: 'bRent', name: '房租', icon: '🏠', color: '#8e44ad' },
      { id: 'bNet', name: '网费', icon: '🌐', color: '#16a085' },
    ],
    contacts: [], splitBills: [], _v: 7, _t: 'budget-app',
  }), 'replace');
  DataStore.init();
  window.localStorage.removeItem('chartBillToggle_pieChart');
  window.changeStatsMonth(month);
  await sleep(150);
  const rows = () => window.buildPieSliceRows(window.statsHierarchyLevel, 'pieChart', null, null);
  const byId = (a, id) => a.find(r => r.id === id);

  /* 1. Starting point: one 月账单 parent block */
  assert('fixture: bill amounts read back', (DataStore.getBillAmounts(month) || {}).bNet == 80);
  assert('root view has the 月账单 block (1000 recorded + 80 planned)',
    byId(rows(), BG) && Math.abs(byId(rows(), BG).total - 1080) < 0.01,
    JSON.stringify(rows().map(r => [r.id, r.total])));

  /* 2. Clicking it drills in (this used to be a dead click) */
  window.onChartBlockClick(BG, '月账单');
  assert('click on 月账单 drills into it', window.getDrillCategory() === BG, String(window.getDrillCategory()));
  const inside = rows();
  assert('inside: the bills are the slices', inside.length === 2 &&
    !!byId(inside, 'bRent') && !!byId(inside, 'bNet'), JSON.stringify(inside.map(r => [r.id, r.total])));
  assert('inside: amounts match what the parent block showed',
    Math.abs(inside.reduce((s, r) => s + r.total, 0) - 1080) < 0.01);
  assert('inside: planned-only bill is counted (80)', Math.abs(byId(inside, 'bNet').total - 80) < 0.01);
  assert('inside: ordinary categories are not mixed in', !byId(inside, 'catA'));
  assert('inside: level does not matter (bills are leaves)',
    [1, 2, 3].every(l => window.buildPieSliceRows(l, 'pieChart', null, null).length === 2));

  /* 3. Everything that shows the rows follows */
  const barHtml = window.document.querySelector('#pieCard .pie-drill-bar').innerHTML;
  assert('drill bar names 月账单 (and offers a way back)',
    barHtml.indexOf('月账单') !== -1 && barHtml.indexOf('resetStatsDrill') !== -1, barHtml);
  const holder = window.document.createElement('div');
  holder.id = 'expandPieTable';
  window.document.body.appendChild(holder);
  window.renderExpandPieTable();
  const tHtml = holder.innerHTML;
  assert('table lists the bills with a records click', tHtml.indexOf('房租') !== -1 && tHtml.indexOf("showCategoryRecords('bRent')") !== -1);
  assert('table breadcrumb names 月账单', tHtml.indexOf('月账单') !== -1);

  window.setStatsCatView('waffle'); await sleep(100);
  const wf = window.buildCategoryWaffleData('catWaffleChart', null, null);
  assert('waffle follows the drill', wf.length === 2 && wf.some(d => d.id === 'bRent'), JSON.stringify(wf.map(d => d.id)));
  window.setStatsCatView('treemap'); await sleep(100);
  const tn = window.buildCategoryTreeNodes(window.statsHierarchyLevel, null, null);
  assert('treemap follows the drill (flat boxes)', tn.length === 2 && tn.every(n => !n.children.length) &&
    tn.some(n => n.id === 'bRent' && Math.abs(n.value - 1000) < 0.01), JSON.stringify(tn.map(n => [n.id, n.value])));
  window.setStatsCatView('pie'); await sleep(100);

  /* 4. A bill's own records open from the table row */
  window.showCategoryRecords('bRent');
  const modalText = window.document.body.textContent;
  assert('bill row opens its records', modalText.indexOf('十月房租') !== -1 || modalText.indexOf('1,000') !== -1 || modalText.indexOf('1000') !== -1);
  window.closeModal();

  /* 5. A bill is a leaf: clicking it explains instead of drilling further */
  window.onChartBlockClick('bRent', '房租');
  assert('bill slice does not drill deeper', window.getDrillCategory() === BG);

  /* 6. Back returns to the root view */
  window.backFromDrill();
  assert('back leaves 月账单', window.getDrillCategory() === null);
  assert('root view is restored', !!byId(rows(), BG) && !!byId(rows(), 'catA'));

  /* 7. Ordinary drilling is untouched */
  window.onChartBlockClick('catA', '餐饮');
  assert('real category with children still drills', window.getDrillCategory() === 'catA');
  window.backFromDrill();

  /* 8. Un-ticking 含固定账单 while inside 月账单 drops back out instead of showing nothing */
  window.onChartBlockClick(BG, '月账单');
  assert('re-entered 月账单', window.getDrillCategory() === BG);
  window.localStorage.setItem('chartBillToggle_pieChart', '0');
  window.refreshPieChart();
  assert('toggle off leaves 月账单', window.getDrillCategory() === null);
  assert('toggle off hides the block', !byId(rows(), BG));
  window.onChartBlockClick(BG, '月账单');
  assert('cannot drill into a block that is hidden', window.getDrillCategory() === null);
  window.localStorage.removeItem('chartBillToggle_pieChart');

  /* 9. No bills in the window: the block is not drillable */
  DataStore.importJSON(JSON.stringify(Object.assign(JSON.parse(DataStore.exportJSON()), { billCategories: [], billAmounts: {} })), 'replace');
  window.changeStatsMonth(month); await sleep(100);
  window.onChartBlockClick(BG, '月账单');
  assert('no bills → nothing to drill into', window.getDrillCategory() === null);
}
