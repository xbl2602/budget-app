// Hierarchy levels test for stats category spending
// Usage: node tests/hierarchy-test.js  (requires jsdom; npm i --no-save jsdom)
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');

function canvasStub() {
  const noop = () => {};
  return {
    setTransform: noop, scale: noop, translate: noop, rotate: noop,
    clearRect: noop, fillRect: noop, strokeRect: noop, beginPath: noop,
    closePath: noop, moveTo: noop, lineTo: noop, arc: noop, arcTo: noop,
    bezierCurveTo: noop, quadraticCurveTo: noop, fill: noop, stroke: noop,
    clip: noop, fillText: noop, strokeText: noop,
    measureText: () => ({ width: 10 }), save: noop, restore: noop,
    createLinearGradient: () => ({ addColorStop: noop }),
    createRadialGradient: () => ({ addColorStop: noop }),
    createPattern: () => ({}), drawImage: noop,
    getImageData: () => ({ data: new Uint8ClampedArray(4) }), putImageData: noop,
    roundRect: noop, resetTransform: noop, setLineDash: noop, rect: noop,
    ellipse: noop, setLineCap: noop, setLineJoin: noop, globalAlpha: 1,
    globalCompositeOperation: 'source-over', lineWidth: 1, lineCap: 'butt', lineJoin: 'miter',
    strokeStyle: '#000', fillStyle: '#000', font: '10px sans-serif', textAlign: 'left', textBaseline: 'alphabetic',
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
let pass = 0, fail = 0;
function assert(name, cond, extra) {
  if (cond) { pass++; console.log('PASS ' + name); }
  else { fail++; console.log('FAIL ' + name + (extra ? ' — ' + extra : '')); }
}

function whenReady() {
  return new Promise(resolve => {
    window.addEventListener('load', () => resolve());
    setTimeout(resolve, 1000);
  });
}

whenReady().then(async () => {
  await run();
  console.log('\n===== RESULT: ' + pass + ' PASS / ' + fail + ' FAIL =====');
  process.exit(fail > 0 ? 1 : 0);
});

async function run() {
  const { DataStore } = window;
  const month = new Date().toISOString().slice(0, 7);

  // Category tree: 餐饮(catA) > 外卖(catA1) > 夜宵(catA1a); 交通(catB) leaf
  const categories = [
    { id: 'catA', name: '餐饮', icon: '🍜', color: '#e74c3c', parentId: null },
    { id: 'catA1', name: '外卖', icon: '🍱', color: '#e67e22', parentId: 'catA' },
    { id: 'catA1a', name: '夜宵', icon: '🍢', color: '#f1c40f', parentId: 'catA1' },
    { id: 'catB', name: '交通', icon: '🚌', color: '#3498db', parentId: null },
  ];
  const records = [
    { id: 'r1', categoryId: 'catA', amount: 10, date: month + '-05' },
    { id: 'r2', categoryId: 'catA1', amount: 40, date: month + '-06' },
    { id: 'r3', categoryId: 'catA1a', amount: 30, date: month + '-07' },
    { id: 'r4', categoryId: 'catB', amount: 30, date: month + '-08' },
  ];

  const raw = {
    records, categories,
    budgets: {}, budgetObj: {}, categoryBudgets: {}, monthlyIncome: {},
    billAmounts: {}, savingsTarget: { type: 'fixed', fixedAmount: 0 },
    percentBase: 'gross', whatIfParams: null, allTags: [],
    billCategories: [], contacts: [], splitBills: [], _v: 7, _t: 'budget-app',
  };
  DataStore.clearAll();
  const ok = DataStore.importJSON(JSON.stringify(raw), 'replace');
  assert('seed data import', ok === true);

  DataStore.init();
  window.changeStatsMonth(month);
  DataStore._data.contacts = [];
  assert('DataStore ready', !!DataStore._data && DataStore._data.records.length === 4);

  const { buildPieSliceRows } = window;
  assert('buildPieSliceRows exported', typeof buildPieSliceRows === 'function');
  if (typeof buildPieSliceRows !== 'function') return;

  // Level 1: top-level summary rows
  const l1 = buildPieSliceRows(1, 'pieChart', null, null);
  const sortedL1 = l1.slice().sort((a, b) => b.total - a.total);
  assert('L1 has 2 rows', l1.length === 2, 'got ' + l1.length);
  assert('L1 top row 餐饮 = 80 (descendant sum)', sortedL1[0].total === 80, 'got ' + sortedL1[0].total);
  assert('L1 交通 = 30', sortedL1[1].total === 30);

  // Level 2: + direct children with own direct spend
  const l2 = buildPieSliceRows(2, 'pieChart', null, null);
  const sum2 = l2.reduce((s, d) => s + d.total, 0);
  assert('L2 rows = 3 (餐饮10, 外卖40, 交通30)', l2.length === 3, 'got ' + l2.length);
  assert('L2 sum = 80 (depth 2, excludes 夜宵)', sum2 === 80, 'got ' + sum2);
  const a1 = l2.find(d => d.id === 'catA1');
  assert('L2 外卖 shows own direct 40', a1 && a1.total === 40);
  assert('L2 外卖 path prefix present', a1 && Array.isArray(a1.path) && a1.path.join('') === '餐饮外卖', a1 && a1.path.join('|'));

  // Level 3: all leaves, mutually exclusive, sum = 110 = total spend
  const l3 = buildPieSliceRows(3, 'pieChart', null, null);
  const sum3 = l3.reduce((s, d) => s + d.total, 0);
  assert('L3 rows = 4 (餐饮直10, 外卖40, 夜宵30, 交通30)', l3.length === 4, 'got ' + l3.length);
  assert('L3 sum = 110 = total spend (100%)', sum3 === 110, 'got ' + sum3);
  const a1a = l3.find(d => d.id === 'catA1a');
  assert('L3 夜宵 shows own direct 30', a1a && a1a.total === 30);
  assert('L3 夜宵 path = 餐饮 › 外卖', a1a && a1a.path.join('') === '餐饮外卖夜宵', a1a && a1a.path.join('|'));

  // Control exists after renderStats
  window.renderStats();
  const toggle = window.document.querySelectorAll('[data-hier-level]');
  assert('hierarchy control rendered (3 segments)', toggle.length === 3, 'got ' + toggle.length);

  // On-page detail table (格子) inside pieCard
  const detailTable = window.document.getElementById('pieDetailTable');
  assert('on-page detail table present in pieCard', !!detailTable && !!window.document.getElementById('pieCard').contains(detailTable));
  await new Promise(r => setTimeout(r, 120));
  // Collapsed by default so the pie card does not stretch past its chart
  assert('on-page table collapsed by default', detailTable.style.display === 'none' && detailTable.innerHTML === '');
  assert('on-page table toggle button present', !!window.document.getElementById('pieDetailToggleBtn'));
  window.togglePieDetailTable();
  assert('on-page table opens on toggle', detailTable.style.display === 'block');
  const dtHtml = detailTable.innerHTML;
  assert('on-page table shows 1-layer rows', dtHtml.indexOf('餐饮') !== -1 && dtHtml.indexOf('交通') !== -1 && dtHtml.indexOf('外卖') === -1);
  assert('on-page table no expander ▸', dtHtml.indexOf('toggleExpandPieRow') === -1);

  // Flat all-level expansion reflected in on-page table at level 3
  window.setStatsHierarchyLevel(3);
  await new Promise(r => setTimeout(r, 60));
  const dtHtml3 = detailTable.innerHTML;
  assert('on-page table flat: 夜宵 row present', dtHtml3.indexOf('夜宵') !== -1);
  assert('on-page table flat: path prefix ›', dtHtml3.indexOf(' › ') !== -1);
  window.setStatsHierarchyLevel(1);
  await new Promise(r => setTimeout(r, 60));
  assert('on-page table back to 1 layer: no 夜宵 row', detailTable.innerHTML.indexOf('夜宵') === -1);

  // setStatsHierarchyLevel persists + redraws without drill reset
  window.setStatsHierarchyLevel(3);
  assert('localStorage persisted', window.localStorage.getItem('budgetStatsHierarchy') === '3');
  assert('window.statsHierarchyLevel = 3', window.statsHierarchyLevel === 3);

  // Expanded overlay renders flat table with path prefix
  window.expandPie();
  await new Promise(r => setTimeout(r, 120));
  const table = window.document.getElementById('expandPieTable');
  assert('expanded table present', !!table);
  if (table) {
    const t = table.innerHTML;
    assert('flat rows rendered', t.indexOf('外卖') !== -1 && t.indexOf('夜宵') !== -1);
    assert('path prefix shown with ›', t.indexOf(' › ') !== -1);
    assert('no expander ▸ in flat mode', t.indexOf('toggleExpandPieRow') === -1);
  }
  window.shrinkChart();

  // Drill still works on flat rows at level 3
  window.statsDrillStack = [];
  window.getDrillCategory = window.getDrillCategory || (() => null);
  window.setStatsHierarchyLevel(1);
  assert('reset to level 1 keeps totals', (() => {
    const l1b = buildPieSliceRows(1, 'pieChart', null, null);
    return l1b.reduce((s, d) => s + d.total, 0) === 110;
  })());
}