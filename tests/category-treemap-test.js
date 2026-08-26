// Category treemap: squarified layout, nesting by hierarchy level, drill.
// Usage: node tests/category-treemap-test.js  (requires jsdom; npm i --no-save jsdom)
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
function whenReady() {
  return new Promise(resolve => {
    window.addEventListener('load', () => resolve());
    setTimeout(resolve, 1000);
  });
}
whenReady().then(async () => {
  try { await run(); } catch (e) { fail++; lines.push('FAIL threw — ' + (e && e.stack || e)); }
  lines.push('\n===== RESULT: ' + pass + ' PASS / ' + fail + ' FAIL =====');
  process.stdout.write(lines.join('\n') + '\n');
  process.exit(fail > 0 ? 1 : 0);
});

const $ = id => window.document.getElementById(id);
const hidden = el => !!el && el.classList.contains('cat-view-hidden');
const month = new Date().toISOString().slice(0, 7);

async function run() {
  const { DataStore } = window;
  //  餐饮 600 = own 100 + 外卖 500 (own 300 + 夜宵 200)   |   交通 400
  DataStore.clearAll();
  DataStore.importJSON(JSON.stringify({
    records: [
      { id: 'r1', categoryId: 'catA', amount: 100, date: month + '-03' },
      { id: 'r2', categoryId: 'catA1', amount: 300, date: month + '-04' },
      { id: 'r3', categoryId: 'catA1a', amount: 200, date: month + '-05' },
      { id: 'r4', categoryId: 'catB', amount: 400, date: month + '-06' },
    ],
    categories: [
      { id: 'catA', name: '餐饮', icon: '🍜', color: '#e74c3c', parentId: null, sortOrder: 0 },
      { id: 'catA1', name: '外卖', icon: '🍱', color: '#e67e22', parentId: 'catA', sortOrder: 0 },
      { id: 'catA1a', name: '夜宵', icon: '🍢', color: '#f1c40f', parentId: 'catA1', sortOrder: 0 },
      { id: 'catB', name: '交通', icon: '🚌', color: '#3498db', parentId: null, sortOrder: 1 },
    ],
    budgets: {}, budgetObj: {}, categoryBudgets: {}, monthlyIncome: {},
    billAmounts: {}, savingsTarget: { type: 'fixed', fixedAmount: 0 },
    percentBase: 'gross', whatIfParams: null, allTags: [],
    billCategories: [], contacts: [], splitBills: [], _v: 7, _t: 'budget-app',
  }), 'replace');
  DataStore.init();
  window.changeStatsMonth(month);
  await new Promise(r => setTimeout(r, 150));

  /* ---------- 1. Third view in the toggle ---------- */
  const opts = [...window.document.querySelectorAll('#pieCard [data-cat-view]')]
    .map(e => e.getAttribute('data-cat-view'));
  assert('card toggle offers pie / waffle / treemap',
    JSON.stringify(opts) === '["pie","waffle","treemap"]', JSON.stringify(opts));
  assert('treemap canvas exists on the card', !!$('catTreemapChart'));

  window.setStatsCatView('treemap');
  await new Promise(r => setTimeout(r, 120));
  assert('only the treemap is visible',
    !hidden($('catTreemapChart')) && hidden($('pieChart')) && hidden($('catWaffleChart')));
  assert('choice persists', window.localStorage.getItem('budgetStatsCatView') === 'treemap');
  assert('PNG export targets the treemap',
    $('catViewDownloadBtn').getAttribute('onclick').indexOf('catTreemapChart') !== -1);
  assert('waffle density control stays hidden', $('catWaffleDensity').style.display === 'none');

  /* ---------- 2. Nesting follows the hierarchy level ---------- */
  const byId = (arr, id) => arr.find(n => n.id === id);
  const l1 = window.buildCategoryTreeNodes(1, null, null);
  assert('level 1 is flat', l1.length === 2 && l1.every(n => n.children.length === 0),
    JSON.stringify(l1.map(n => [n.name, n.value, n.children.length])));
  assert('level 1 value is the whole subtree', byId(l1, 'catA').value === 600, String(byId(l1, 'catA').value));

  const l2 = window.buildCategoryTreeNodes(2, null, null);
  const a2 = byId(l2, 'catA');
  assert('level 2 nests direct children', a2.children.length === 2,
    JSON.stringify(a2.children.map(c => [c.name, c.value])));
  assert("the parent's own spend gets its own box",
    !!a2.children.find(c => c.id === 'catA-direct' && c.value === 100));
  assert('level 2 child values add up to the parent',
    a2.children.reduce((s, c) => s + c.value, 0) === a2.value);
  assert('a leaf root stays childless', byId(l2, 'catB').children.length === 0);

  const l3 = window.buildCategoryTreeNodes(3, null, null);
  const deep = byId(byId(l3, 'catA').children, 'catA1');
  assert('全部 level keeps nesting', deep && deep.children.length === 2,
    deep ? JSON.stringify(deep.children.map(c => [c.name, c.value])) : 'no catA1');
  assert('grandchild value is right', !!deep.children.find(c => c.id === 'catA1a' && c.value === 200));
  assert('nested values still add up', deep.children.reduce((s, c) => s + c.value, 0) === deep.value);

  /* ---------- 3. Colours stay in the family ---------- */
  const COLORS = window.COLORS;
  assert('roots use the shared palette in spend order',
    l3[0].color === COLORS[0] && l3[1].color === COLORS[1],
    l3.map(n => n.color).join(','));
  const parentC = byId(l3, 'catA').color;
  assert('children are lighter shades of the parent, not new hues',
    deep.color !== parentC && byId(l3, 'catA').children.every(c => c.color !== COLORS[1]),
    parentC + ' -> ' + deep.color);

  /* ---------- 4. Squarified layout maths ---------- */
  const boxes = window.squarify(
    [{ value: 6 }, { value: 6 }, { value: 4 }, { value: 3 }, { value: 2 }, { value: 1 }],
    0, 0, 400, 250);
  assert('every item gets a box', boxes.length === 6, String(boxes.length));
  const laid = boxes.reduce((s, b) => s + b.w * b.h, 0);
  assert('boxes tile the whole rect', Math.abs(laid - 400 * 250) / (400 * 250) < 0.01,
    'covered ' + Math.round(laid) + ' of ' + 400 * 250);
  const unit = (400 * 250) / 22;
  assert('area is proportional to value',
    boxes.every(b => Math.abs(b.w * b.h - b.value * unit) / (b.value * unit) < 0.02),
    JSON.stringify(boxes.map(b => [b.value, Math.round(b.w * b.h / unit * 100) / 100])));
  const worst = Math.max(...boxes.map(b => Math.max(b.w / b.h, b.h / b.w)));
  assert('boxes stay close to square (squarified, not slivers)', worst < 5, 'worst aspect ' + worst.toFixed(2));
  assert('no box escapes the rect',
    boxes.every(b => b.x >= -0.01 && b.y >= -0.01 && b.x + b.w <= 400.01 && b.y + b.h <= 250.01));
  assert('squarify survives an empty list', window.squarify([], 0, 0, 100, 100).length === 0);
  assert('squarify survives a zero-size rect', window.squarify([{ value: 1 }], 0, 0, 0, 100).length === 0);

  /* ---------- 5. Rendered boxes ---------- */
  window.setStatsHierarchyLevel(3);
  window.drawCategoryTreemap('catTreemapChart', null, null, 250);
  const rects = $('catTreemapChart')._treemapRects || [];
  assert('treemap rendered boxes', rects.length >= 6, String(rects.length));
  assert('nested boxes were drawn inside their parents', rects.filter(r => r.depth > 0).length >= 4);
  const rootBoxes = rects.filter(r => r.depth === 0);
  const areaOf = id => rootBoxes.filter(r => r.id === id).reduce((s, r) => s + r.w * r.h, 0);
  const ratio = areaOf('catA') / areaOf('catB');
  assert('root areas follow the 600:400 split', Math.abs(ratio - 1.5) < 0.1, 'got ' + ratio.toFixed(2));
  const child = rects.find(r => r.id === 'catA1');
  const parent = rootBoxes.find(r => r.id === 'catA');
  assert('a child box sits inside its parent box',
    child && parent && child.x >= parent.x - 0.01 && child.y >= parent.y - 0.01
    && child.x + child.w <= parent.x + parent.w + 0.01
    && child.y + child.h <= parent.y + parent.h + 0.01,
    child && parent ? JSON.stringify([child.x, child.y, child.w, child.h, parent.x, parent.y, parent.w, parent.h]) : 'missing');

  /* ---------- 6. Interaction ---------- */
  const cv = $('catTreemapChart');
  while (window.getDrillCategory()) window.resetStatsDrill();
  cv._treemapHit = rootBoxes.find(r => r.id === 'catA');
  cv.onclick();
  await new Promise(r => setTimeout(r, 80));
  assert('clicking a box drills into it', window.getDrillCategory() === 'catA',
    String(window.getDrillCategory()));
  const directBox = (cv._treemapRects || []).find(r => r.leafOnly);
  if (directBox) {
    const before = window.getDrillCategory();
    cv._treemapHit = directBox;
    cv.onclick();
    assert('the "(direct)" box is not drillable', window.getDrillCategory() === before);
  } else {
    assert('the "(direct)" box is not drillable (none present)', true);
  }
  while (window.getDrillCategory()) window.resetStatsDrill();

  /* ---------- 7. Expanded overlay ---------- */
  window.expandPie();
  await new Promise(r => setTimeout(r, 150));
  assert('overlay has a treemap canvas', !!$('expandCatTreemap'));
  assert('overlay opens on the treemap only',
    !hidden($('expandCatTreemap')) && hidden($('expandPieChart')) && hidden($('expandCatWaffle')));
  assert('overlay treemap actually laid out boxes',
    ($('expandCatTreemap')._treemapRects || []).length > 0);
  window.setStatsCatView('waffle');
  assert('toggling in the overlay swaps to the waffle',
    hidden($('expandCatTreemap')) && !hidden($('expandCatWaffle')));
  window.setStatsCatView('treemap');
  window.shrinkChart();

  /* ---------- 8. Empty state ---------- */
  DataStore._data.records = [];
  DataStore.save();
  assert('no spending means no nodes', window.buildCategoryTreeNodes(1, null, null).length === 0);
  let threw = false;
  try { window.drawCategoryTreemap('catTreemapChart', null, null, 250); } catch (e) { threw = true; }
  assert('drawing an empty treemap does not throw', !threw);
  assert('empty treemap clears its hit boxes', ($('catTreemapChart')._treemapRects || []).length === 0);
}
