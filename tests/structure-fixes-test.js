// Structure fixes: category color inheritance, custom icons, split-bill editor
// completeness (date/note/mode/unknown/self-unknown).
// Usage: node tests/structure-fixes-test.js  (requires jsdom; npm i --no-save jsdom)
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

  const raw = {
    records: [], categories: [
      { id: 'catA', name: '餐饮', icon: '🍜', color: '#e74c3c', parentId: null, sortOrder: 0 },
    ],
    budgets: {}, budgetObj: {}, categoryBudgets: {}, monthlyIncome: {},
    billAmounts: {}, savingsTarget: { type: 'fixed', fixedAmount: 0 },
    percentBase: 'gross', whatIfParams: null, allTags: [],
    billCategories: [], contacts: [], splitBills: [], _v: 7, _t: 'budget-app',
  };
  DataStore.clearAll();
  assert('seed data import', DataStore.importJSON(JSON.stringify(raw), 'replace') === true);
  DataStore.init();

  /* ---------- 1. Child categories inherit the parent color ---------- */
  const child = DataStore.addCategory({ name: '午餐', icon: '🍱', parentId: 'catA', sortOrder: 0 });
  assert('child inherits parent color', child.color === '#e74c3c', 'got ' + child.color);

  const grandchild = DataStore.addCategory({ name: '加班餐', icon: '🍚', parentId: child.id, sortOrder: 0 });
  assert('grandchild inherits down the branch', grandchild.color === '#e74c3c', 'got ' + grandchild.color);

  const newRoot = DataStore.addCategory({ name: '教育', icon: '📚', parentId: null, sortOrder: 1 });
  assert('root category still gets its own palette color', newRoot.color && newRoot.color !== '#e74c3c', 'got ' + newRoot.color);

  const explicit = DataStore.addCategory({ name: '晚餐', icon: '🍽️', parentId: 'catA', color: '#123456' });
  assert('explicit color is not overridden by inheritance', explicit.color === '#123456');

  /* ---------- 2. Icon can be customised when editing, not only when creating ---------- */
  window.changeCategoryIcon(child.id);
  const iconInput = $('customIconInput');
  assert('edit-icon modal offers a custom field', !!iconInput);
  assert('custom field is seeded with the current icon', iconInput && iconInput.value === '🍱', iconInput && iconInput.value);
  if (iconInput) {
    iconInput.value = '🦀';           // an emoji that is NOT in EMOJI_GRID
    window.confirmCustomIcon(child.id);
    assert('arbitrary emoji applied on edit', DataStore.getCategory(child.id).icon === '🦀', DataStore.getCategory(child.id).icon);
  }
  window.closeModal();

  /* ---------- split-bill fixtures ---------- */
  DataStore._data.contacts = [
    { id: 'p1', name: '阿明' },
    { id: 'p2', name: '小美' },
  ];
  const billId = 'bill-1';
  DataStore._data.splitBills = [{
    id: billId,
    amount: 90,
    date: month + '-10T12:30',
    note: '原备注',
    tag: '聚餐',
    categoryId: 'catA',
    payer: 'self',
    selfShare: 30,
    selfUnknown: false,
    mode: 'equal',
    participants: [
      { contactId: 'p1', name: '阿明', share: 30, paid: false, unknown: true },
      { contactId: 'p2', name: '小美', share: 30, paid: false, unknown: false },
    ],
    createdAt: new Date().toISOString(),
  }];
  DataStore._data.records = [{
    id: 'rec-1', amount: 90, categoryId: 'catA', date: month + '-10T12:30',
    note: '原备注', tags: [], splitBillId: billId, createdAt: new Date().toISOString(),
  }];
  DataStore.save();

  /* ---------- 3. The split editor exposes the normal record fields ---------- */
  window.openSplitBillEditor(billId, true);
  assert('editor has a date/time field', !!$('editSplitDateTime'));
  assert('editor date/time is seeded from the bill', $('editSplitDateTime').value === month + '-10T12:30', $('editSplitDateTime').value);
  assert('editor has a note field', !!$('editSplitNote') && $('editSplitNote').value === '原备注');
  assert('editor has an amount field', !!$('editSplitAmount') && $('editSplitAmount').value === '90');
  assert('editor has a category picker', !!$('editSplitCatBtn'));

  /* ---------- 4. Unknown does not swallow the amount box ---------- */
  const rowEls = () => window.document.querySelectorAll('#editSplitPeopleList .split-person-row');
  assert('an amount box is rendered for every person regardless of mode',
    rowEls().length === 2 && [...rowEls()].every(r => !!r.querySelector('.split-person-amount')));

  // Rows are ordered by contact name, so address them by key rather than position
  const rowFor = key => [...rowEls()].find(r => r.querySelector('input[data-edit-unknown="' + key + '"]'));
  const mingRow = rowFor('p1');
  const meiRow = rowFor('p2');
  assert('each person row is addressable by contact key', !!mingRow && !!meiRow);
  const mingUnknown = mingRow.querySelector('input[data-edit-unknown]');
  const mingAmount = mingRow.querySelector('.split-person-amount');
  assert('unknown person reopens with the box disabled', mingUnknown.checked === true && mingAmount.disabled === true);

  mingUnknown.checked = false;
  window.updateEditSplitPreview();
  assert('unchecking unknown re-enables that person\'s amount box', mingAmount.disabled === false);
  assert('unchecking one person does not disable the other',
    meiRow.querySelector('.split-person-amount').disabled === false);

  // Typing an amount promotes the bill to the specified mode instead of being dropped
  mingAmount.value = '50';
  window.onEditSplitAmountTyped(mingAmount);
  const specifiedRadio = window.document.querySelector('input[name="editSplitMode"][value="specified"]');
  assert('typing an amount switches the mode radio to specified', specifiedRadio.checked === true);
  const mingComputed = (window._editSplitComputed || []).find(s => s.id === 'p1');
  assert('the typed amount lands on the person who was typed into',
    mingComputed && mingComputed.share === 50, mingComputed && String(mingComputed.share));
  const meiComputed = (window._editSplitComputed || []).find(s => s.id === 'p2');
  assert('the other person keeps an auto share, not the typed one',
    meiComputed && meiComputed.share !== 50, meiComputed && String(meiComputed.share));

  /* ---------- 5. My own share can be unknown ---------- */
  const selfUnknown = $('editSplitSelfUnknown');
  assert('editor offers "unknown" for my own share', !!selfUnknown);
  selfUnknown.checked = true;
  window.updateEditSplitPreview();
  assert('my amount row hides once my share is unknown', $('editSplitSelfRow').style.display === 'none');
  assert('preview marks my share as unknown', $('editSplitPreview').innerHTML.indexOf('❓') !== -1);

  /* ---------- editor save round-trip ---------- */
  $('editSplitDateTime').value = month + '-14T19:45';
  $('editSplitNote').value = '改过的备注';
  $('editSplitAmount').value = '120';
  $('editSplitTag').value = '聚餐、生日';
  window.updateEditSplitPreview();
  window.saveSplitBillEditor(billId);

  const saved = DataStore._data.splitBills.find(b => b.id === billId);
  assert('date saved onto the bill', saved.date === month + '-14T19:45', saved.date);
  assert('note saved onto the bill', saved.note === '改过的备注', saved.note);
  assert('amount saved onto the bill', saved.amount === 120, String(saved.amount));
  assert('mode round-trips as specified', saved.mode === 'specified', saved.mode);
  assert('selfUnknown persisted', saved.selfUnknown === true);
  assert('per-person unknown flag persisted', saved.participants.find(p => p.contactId === 'p1').unknown === false);

  const rec = DataStore.getRecord('rec-1');
  assert('linked record follows the new date', rec.date === month + '-14T19:45', rec.date);
  assert('linked record follows the new note', rec.note === '改过的备注', rec.note);
  assert('linked record follows the new amount', rec.amount === 120, String(rec.amount));
  assert('linked record tags follow the bill tag', Array.isArray(rec.tags)
    && rec.tags.length === 2 && rec.tags[0] === '聚餐' && rec.tags[1] === '生日', JSON.stringify(rec.tags));
  assert('new tags registered in the tag list',
    DataStore.getAllTags().indexOf('生日') !== -1, JSON.stringify(DataStore.getAllTags()));

  /* ---------- reopening keeps the specified layout ---------- */
  window.closeModal();
  window.openSplitBillEditor(billId, true);
  assert('reopened editor stays in specified mode',
    window.document.querySelector('input[name="editSplitMode"][value="specified"]').checked === true);
  assert('reopened editor keeps my share unknown', $('editSplitSelfUnknown').checked === true);
  assert('reopened amount boxes are still there', rowEls().length === 2 && !!rowEls()[0].querySelector('.split-person-amount'));
  window.closeModal();

  /* ---------- add-page form offers self-unknown too ---------- */
  window.resetAddSplitState();
  assert('add-form state tracks selfUnknown', window._addSplitState.selfUnknown === false);
  window.toggleSplitSelfInvolved(true);
  window.toggleSplitSelfUnknown(true);
  assert('toggling self-unknown updates the state', window._addSplitState.selfUnknown === true);
  window.toggleSplitSelfInvolved(false);
  assert('leaving the split clears self-unknown', window._addSplitState.selfUnknown === false);

  /* ---------- 8. Pie labels stay legible at deep flat expansion ---------- */
  await pieLabelChecks();

    /* ---------- collectSplitBill carries mode + selfUnknown ---------- */
  window.resetAddSplitState();
  window._addSplitState.selfInvolved = true;
  window._addSplitState.selfUnknown = true;
  window._addSplitState.mode = 'specified';
  window._addSplitState.rows = [{ contactId: 'p1', name: '阿明', included: true, amount: '40', unknown: false }];
  const collected = window.SplitEngine.collectSplitBill({ amount: 100, date: month + '-11T10:00', note: '', tags: [], categoryId: 'catA' });
  assert('collectSplitBill succeeds', collected.ok === true, collected.error);
  assert('collectSplitBill keeps the entry mode', collected.ok && collected.bill.mode === 'specified');
  assert('collectSplitBill keeps selfUnknown', collected.ok && collected.bill.selfUnknown === true);
  assert('unknown self still takes the remainder', collected.ok && collected.bill.selfShare === 60, collected.ok && String(collected.bill.selfShare));
}


/* Draw the pie with a recording 2D context so label/legend geometry can be
   asserted numerically: at level 3 the flat expansion produces many slices, and
   the old layout stacked their labels on top of each other. */
async function pieLabelChecks() {
  const { DataStore } = window;
  const month = new Date().toISOString().slice(0, 7);

  const cats = [{ id: 'proot', name: '总支出', icon: '💰', color: '#111111', parentId: null, sortOrder: 0 }];
  const recs = [];
  // 28 near-equal slices: every one clears the "too thin to label" cut, so the
  // label layout has to genuinely space 14 of them down each side of the chart.
  for (let i = 0; i < 28; i++) {
    cats.push({ id: 'pc' + i, name: '子分类' + i, icon: '🔸', color: '#222222', parentId: 'proot', sortOrder: i });
    recs.push({ id: 'pr' + i, categoryId: 'pc' + i, amount: 100, date: month + '-0' + ((i % 9) + 1) });
  }
  DataStore.clearAll();
  DataStore.importJSON(JSON.stringify({
    records: recs, categories: cats,
    budgets: {}, budgetObj: {}, categoryBudgets: {}, monthlyIncome: {},
    billAmounts: {}, savingsTarget: { type: 'fixed', fixedAmount: 0 },
    percentBase: 'gross', whatIfParams: null, allTags: [],
    billCategories: [], contacts: [], splitBills: [], _v: 7, _t: 'budget-app',
  }), 'replace');
  DataStore.init();
  window.changeStatsMonth(month);
  window.resetStatsDrill && window.resetStatsDrill();

  const W = 400, H = 250;
  const texts = [];
  const recorder = () => {
    const noop = () => {};
    const ctx = {
      setTransform: noop, scale: noop, translate: noop, rotate: noop,
      clearRect: noop, fillRect: noop, strokeRect: noop, beginPath: noop,
      closePath: noop, moveTo: noop, lineTo: noop, arc: noop, arcTo: noop,
      bezierCurveTo: noop, quadraticCurveTo: noop, fill: noop, stroke: noop,
      clip: noop, strokeText: noop, save: noop, restore: noop,
      createLinearGradient: () => ({ addColorStop: noop }),
      createRadialGradient: () => ({ addColorStop: noop }),
      createPattern: () => ({}), drawImage: noop,
      getImageData: () => ({ data: new Uint8ClampedArray(4) }), putImageData: noop,
      roundRect: noop, resetTransform: noop, setLineDash: noop, rect: noop,
      ellipse: noop, globalAlpha: 1, globalCompositeOperation: 'source-over',
      lineWidth: 1, lineCap: 'butt', lineJoin: 'miter',
      strokeStyle: '#000', fillStyle: '#000', font: '11px sans-serif',
      textAlign: 'left', textBaseline: 'alphabetic',
      measureText: t => ({ width: String(t).length * 6 }),   // ~11px sans-serif
      fillText(t, x, y) { texts.push({ t: String(t), x, y, align: ctx.textAlign }); },
    };
    return ctx;
  };

  const origGetContext = window.HTMLCanvasElement.prototype.getContext;
  const origRect = window.HTMLCanvasElement.prototype.getBoundingClientRect;
  window.HTMLCanvasElement.prototype.getContext = recorder;
  window.HTMLCanvasElement.prototype.getBoundingClientRect = function () {
    return { width: W, height: H, top: 0, left: 0, right: W, bottom: H, x: 0, y: 0 };
  };
  try {
    window.setStatsHierarchyLevel(3);
    texts.length = 0;
    window.drawPieChart('pieChart', month, null, null, null, H, true);
  } finally {
    window.HTMLCanvasElement.prototype.getContext = origGetContext;
    window.HTMLCanvasElement.prototype.getBoundingClientRect = origRect;
  }

  assert('pie drew something at level 3', texts.length > 0, 'texts=' + texts.length);

  const legendX = W * 0.68;
  // Slice labels are the ones drawn left of the legend column; legend entries start at 0.7W
  const sliceLabels = texts.filter(t => t.x < legendX + 1);
  const legendTexts = texts.filter(t => t.x >= W * 0.7 - 1);

  assert('some slice labels drawn', sliceLabels.length > 0, String(sliceLabels.length));
  assert('legend entries drawn', legendTexts.length > 0, String(legendTexts.length));

  // Labels must not run under the legend column
  const overRun = sliceLabels.filter(t => {
    const wdt = t.t.length * 6;
    const rightEdge = t.align === 'right' ? t.x : t.x + wdt;
    return rightEdge > legendX + 1;
  });
  assert('no slice label runs under the legend', overRun.length === 0,
    overRun.length + ' e.g. ' + (overRun[0] && overRun[0].t));

  // Vertical spacing: no two labels on the same side may sit on top of each other
  let worstGap = Infinity, worstPair = '';
  ['left', 'right'].forEach(side => {
    const group = sliceLabels.filter(t => t.align === side).sort((a, b) => a.y - b.y);
    for (let i = 1; i < group.length; i++) {
      const gap = group[i].y - group[i - 1].y;
      if (gap < worstGap) { worstGap = gap; worstPair = group[i - 1].t + ' / ' + group[i].t; }
    }
  });
  assert('labels on the same side never overlap (>= 14px apart)',
    worstGap === Infinity || worstGap >= 14, 'worst gap ' + worstGap + ' between ' + worstPair);

  // Everything stays inside the canvas box
  const outside = texts.filter(t => t.y < 0 || t.y > H + 1 || t.x < 0 || t.x > W + 1);
  assert('nothing is drawn outside the canvas', outside.length === 0,
    outside.length + ' e.g. y=' + (outside[0] && outside[0].y));

  assert('legend is capped to what fits vertically', legendTexts.length <= Math.ceil(H / 20),
    legendTexts.length + ' entries');

  // A handful of slices must still get full, readable name labels — the compact
  // icon-only form is only for the crowded case above.
  window.setStatsHierarchyLevel(1);
  window.HTMLCanvasElement.prototype.getContext = recorder;
  window.HTMLCanvasElement.prototype.getBoundingClientRect = function () {
    return { width: W, height: H, top: 0, left: 0, right: W, bottom: H, x: 0, y: 0 };
  };
  try {
    texts.length = 0;
    window.drawPieChart('pieChart', month, null, null, null, H, true);
  } finally {
    window.HTMLCanvasElement.prototype.getContext = origGetContext;
    window.HTMLCanvasElement.prototype.getBoundingClientRect = origRect;
  }
  const l1Labels = texts.filter(t => t.x < legendX + 1);
  assert('few slices get full name labels', l1Labels.some(t => t.t.indexOf('总支出') !== -1),
    JSON.stringify(l1Labels.map(t => t.t)));
}
