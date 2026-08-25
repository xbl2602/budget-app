// Category waffle: the pie/waffle view toggle on the category-spending card.
// Usage: node tests/category-waffle-test.js  (requires jsdom; npm i --no-save jsdom)
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
  try { await run(); } catch (e) { fail++; console.log('FAIL threw — ' + (e && e.stack || e)); }
  console.log('\n===== RESULT: ' + pass + ' PASS / ' + fail + ' FAIL =====');
  process.exit(fail > 0 ? 1 : 0);
});

const $ = id => window.document.getElementById(id);

async function run() {
  const { DataStore } = window;
  const month = new Date().toISOString().slice(0, 7);

  DataStore.clearAll();
  DataStore.importJSON(JSON.stringify({
    records: [
      { id: 'r1', categoryId: 'catA', amount: 60, date: month + '-05' },
      { id: 'r2', categoryId: 'catA1', amount: 30, date: month + '-06' },
      { id: 'r3', categoryId: 'catB', amount: 10, date: month + '-07', tags: ['旅行'] },
    ],
    categories: [
      { id: 'catA', name: '餐饮', icon: '🍜', color: '#e74c3c', parentId: null, sortOrder: 0 },
      { id: 'catA1', name: '外卖', icon: '🍱', color: '#e67e22', parentId: 'catA', sortOrder: 0 },
      { id: 'catB', name: '交通', icon: '🚌', color: '#3498db', parentId: null, sortOrder: 1 },
    ],
    budgets: {}, budgetObj: {}, categoryBudgets: {}, monthlyIncome: {},
    billAmounts: {}, savingsTarget: { type: 'fixed', fixedAmount: 0 },
    percentBase: 'gross', whatIfParams: null, allTags: ['旅行'],
    billCategories: [], contacts: [], splitBills: [], _v: 7, _t: 'budget-app',
  }), 'replace');
  DataStore.init();
  window.changeStatsMonth(month);
  await new Promise(r => setTimeout(r, 120));

  /* ---------- 1. The toggle exists and defaults to the pie ---------- */
  assert('view toggle rendered on the category card',
    window.document.querySelectorAll('#pieCard [data-cat-view]').length === 2);
  assert('both canvases live in the same card',
    !!$('pieChart') && !!$('catWaffleChart')
    && $('pieCard').contains($('pieChart')) && $('pieCard').contains($('catWaffleChart')));
  assert('pie is the default view',
    $('pieChart').style.display !== 'none' && $('catWaffleChart').style.display === 'none');

  /* ---------- 2. Switching swaps the canvas, not the layout ---------- */
  const cardBefore = $('pieCard').getBoundingClientRect().width;
  window.setStatsCatView('waffle');
  assert('waffle shows, pie hides',
    $('catWaffleChart').style.display !== 'none' && $('pieChart').style.display === 'none');
  assert('the card itself is untouched (no layout reflow)',
    $('pieCard').getBoundingClientRect().width === cardBefore);
  assert('choice persists to localStorage', window.localStorage.getItem('budgetStatsCatView') === 'waffle');
  assert('density control appears only in waffle mode', $('catWaffleDensity').style.display !== 'none');
  assert('PNG export retargets to the waffle',
    $('catViewDownloadBtn').getAttribute('onclick').indexOf('catWaffleChart') !== -1);

  window.setStatsCatView('pie');
  assert('switching back restores the pie',
    $('pieChart').style.display !== 'none' && $('catWaffleChart').style.display === 'none');
  assert('density control hides again', $('catWaffleDensity').style.display === 'none');
  window.setStatsCatView('waffle');

  /* ---------- 3. It reads the same rows the pie does ---------- */
  window.setStatsHierarchyLevel(1);
  const l1 = window.buildCategoryWaffleData('catWaffleChart', null, null);
  assert('level 1 rolls children into their parent', l1.length === 2, JSON.stringify(l1.map(d => d.amount)));
  assert('level 1 餐饮 = 60 own + 30 child', l1[0].amount === 90, String(l1[0].amount));
  assert('level 1 交通 = 10', l1[1].amount === 10);
  assert('name carries the icon', l1[0].name.indexOf('🍜') === 0, l1[0].name);

  window.setStatsHierarchyLevel(3);
  const l3 = window.buildCategoryWaffleData('catWaffleChart', null, null);
  assert('全部 level flattens to own-spend rows', l3.length === 3, String(l3.length));
  assert('flat rows sum to the same total',
    l3.reduce((s, d) => s + d.amount, 0) === 100, String(l3.reduce((s, d) => s + d.amount, 0)));

  /* ---------- 4. Colours line up with the pie ---------- */
  const COLORS = window.COLORS;
  assert('waffle uses the pie palette in the same order',
    l3.every((d, i) => d.color === COLORS[i % COLORS.length]),
    JSON.stringify(l3.map(d => d.color)));

  /* ---------- 5. Zero-spend categories are dropped ---------- */
  DataStore.addCategory({ name: '空分类', icon: '📭', parentId: null, sortOrder: 9 });
  const withEmpty = window.buildCategoryWaffleData('catWaffleChart', null, null);
  assert('a category with no spending gets no blocks',
    withEmpty.every(d => d.name.indexOf('空分类') === -1), JSON.stringify(withEmpty.map(d => d.name)));

  /* ---------- 6. Clicking a block drills, like clicking a slice ---------- */
  window.setStatsHierarchyLevel(1);
  window.drawCategoryWaffle('catWaffleChart', null, null, 250);
  const opts = $('catWaffleChart')._waffleOpts;
  assert('the canvas carries a click handler', !!opts && typeof opts.onItem === 'function');
  // Observe drill state through the exported reader, not the internal array
  while (window.getDrillCategory()) window.resetStatsDrill();
  opts.onItem({ id: 'catA', name: '🍜 餐饮', amount: 90 });
  assert('clicking a parent drills into it', window.getDrillCategory() === 'catA',
    String(window.getDrillCategory()));
  opts.onItem({ id: 'catB', name: '🚌 交通', amount: 10 });
  assert('clicking a leaf does not drill further', window.getDrillCategory() === 'catA',
    String(window.getDrillCategory()));
  while (window.getDrillCategory()) window.resetStatsDrill();
  assert('drill resets back to root', window.getDrillCategory() === null);

  /* ---------- 7. Density is independent from the tag card ---------- */
  const tagDensityBefore = window.localStorage.getItem('budgetWaffleDensity');
  window.setCatWaffleDensity(5);
  assert('category density persists under its own key',
    window.localStorage.getItem('budgetCatWaffleDensity') === '5');
  assert('the tag card density is untouched',
    window.localStorage.getItem('budgetWaffleDensity') === tagDensityBefore,
    window.localStorage.getItem('budgetWaffleDensity'));
  window.setCatWaffleDensity(3);

  /* ---------- 8. The expanded overlay honours the view ---------- */
  window.expandPie();
  await new Promise(r => setTimeout(r, 120));
  assert('overlay has both canvases', !!$('expandCatWaffle') && !!$('expandPieChart'));
  assert('overlay opens on the waffle', $('expandCatWaffle').style.display === 'block'
    && $('expandPieChart').style.display === 'none');
  assert('overlay carries its own view toggle',
    window.document.querySelectorAll('#chartExpandOverlay [data-cat-view]').length === 2);
  window.setStatsCatView('pie');
  assert('toggling inside the overlay swaps its canvases too',
    $('expandPieChart').style.display === 'block' && $('expandCatWaffle').style.display === 'none');
  window.shrinkChart();
  window.setStatsCatView('waffle');

  /* ---------- 9. Empty state ---------- */
  DataStore._data.records = [];
  DataStore.save();
  const none = window.buildCategoryWaffleData('catWaffleChart', null, null);
  assert('no spending means no blocks', none.length === 0, JSON.stringify(none));
  let threw = false;
  try { window.drawCategoryWaffle('catWaffleChart', null, null, 250); } catch (e) { threw = true; }
  assert('drawing an empty waffle does not throw', !threw);

  /* ---------- 10. The tag waffle still works (regression) ---------- */
  DataStore._data.records = [{ id: 'r9', categoryId: 'catB', amount: 40, date: month + '-09', tags: ['旅行'] }];
  DataStore.save();
  window.renderStats();
  await new Promise(r => setTimeout(r, 1400));   // legend paints after the ~1s pop-in
  assert('tag waffle canvas still rendered', !!$('waffleChart'));
  const tagOpts = $('waffleChart')._waffleOpts;
  assert('tag waffle still targets its own legend', !!tagOpts && tagOpts.legendId === 'waffleLegend');
  assert('tag waffle still has a colour-picker handler', !!tagOpts && typeof tagOpts.onSwatch === 'function');
  assert('tag legend still lists the tag',
    ($('waffleLegend').textContent || '').indexOf('旅行') !== -1, $('waffleLegend').textContent);
  assert('category waffle exposes no swatch handler (its colours track the pie)',
    !$('catWaffleChart')._waffleOpts.onSwatch);
}
