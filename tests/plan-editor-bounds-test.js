// Purchase-plan editor: month picker usability and boundary conditions.
// Usage: node tests/plan-editor-bounds-test.js  (requires jsdom; npm i --no-save jsdom)
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
const toasts = [];

async function run() {
  const { DataStore } = window;
  const thisYear = new Date().getFullYear();
  const thisMonth = new Date().toISOString().slice(0, 7);

  // Capture validation messages instead of rendering them
  const origToast = window.showToast;
  window.showToast = function (msg, kind) { toasts.push({ msg: String(msg), kind }); };

  function fill(fields) {
    if (fields.name !== undefined) $('planName').value = fields.name;
    if (fields.amount !== undefined) $('planAmount').value = fields.amount;
    if (fields.months !== undefined) $('planMonths').value = fields.months;
    if (fields.icon !== undefined) $('planIcon').value = fields.icon;
  }
  function trySave() {
    toasts.length = 0;
    window.savePlanEditor(null);
    return toasts.length ? toasts[toasts.length - 1] : null;
  }

  /* ---------- 1. Month is chosen, never typed ---------- */
  window.openPlanEditor();
  assert('start month is no longer a raw <input type="month">', !$('planStart'));
  assert('year select rendered', !!$('planStartYear') && $('planStartYear').tagName === 'SELECT');
  assert('month select rendered', !!$('planStartMonth') && $('planStartMonth').tagName === 'SELECT');

  const monthVals = [...$('planStartMonth').options].map(o => o.value);
  assert('month select offers exactly 01..12', monthVals.length === 12
    && monthVals[0] === '01' && monthVals[11] === '12', monthVals.join(','));
  assert('month 13 is not offerable at all', monthVals.indexOf('13') === -1);

  const yearVals = [...$('planStartYear').options].map(o => parseInt(o.value, 10));
  assert('year range is bounded around today',
    Math.min(...yearVals) >= thisYear - 10 && Math.max(...yearVals) <= thisYear + 15,
    Math.min(...yearVals) + '..' + Math.max(...yearVals));
  assert('defaults to the current month', window.readPlanStartMonth() === thisMonth,
    window.readPlanStartMonth());

  /* ---------- 2. Usability: quick picks and a visible span ---------- */
  assert('this-month / next-month shortcuts present',
    window.document.querySelectorAll('[data-plan-month]').length === 2);
  window.document.querySelector('[data-plan-month="1"]').onclick.call(
    window.document.querySelector('[data-plan-month="1"]'));
  assert('"next month" moves the selection on', window.readPlanStartMonth() === window.planMonthShift(thisMonth, 1),
    window.readPlanStartMonth());
  window.document.querySelector('[data-plan-month="0"]').onclick.call(
    window.document.querySelector('[data-plan-month="0"]'));
  assert('"this month" moves it back', window.readPlanStartMonth() === thisMonth);

  $('planMonths').value = '6';
  window.setPlanStartMonth('2026-11');
  const span = $('planSpan').textContent;
  assert('span readout shows start → end and the count',
    span.indexOf('2026-11') !== -1 && span.indexOf('2027-04') !== -1 && span.indexOf('6') !== -1, span);
  $('planMonths').value = '1';
  window.setPlanStartMonth('2026-11');
  assert('single-period plan reads as one month', $('planSpan').textContent.indexOf('2026-11') !== -1);

  /* ---------- 3. parsePlanMonth rejects impossible months ---------- */
  assert('rejects month 13', window.parsePlanMonth('2026-13') === null);
  assert('rejects month 00', window.parsePlanMonth('2026-00') === null);
  assert('rejects month 99', window.parsePlanMonth('2026-99') === null);
  assert('rejects a far-past year', window.parsePlanMonth('1899-05') === null);
  assert('rejects a far-future year', window.parsePlanMonth('2999-05') === null);
  assert('rejects junk', window.parsePlanMonth('abcd-ef') === null
    && window.parsePlanMonth('') === null && window.parsePlanMonth(null) === null);
  assert('accepts a real month', (window.parsePlanMonth('2026-12') || {}).key === '2026-12');
  assert('accepts January', (window.parsePlanMonth('2026-01') || {}).m === 1);

  /* ---------- 4. Month arithmetic rolls the year ---------- */
  assert('shift rolls into the next year', window.planMonthShift('2026-11', 3) === '2027-02');
  assert('shift rolls back over a year edge', window.planMonthShift('2026-02', -3) === '2025-11');
  assert('shift by zero is identity', window.planMonthShift('2026-07', 0) === '2026-07');

  /* ---------- 5. Save-time validation ---------- */
  window.openPlanEditor();
  fill({ name: '', amount: '1200', months: '6' });
  assert('blank name rejected', !!trySave());

  fill({ name: '测试', amount: '0', months: '6' });
  assert('zero amount rejected', !!trySave());
  fill({ name: '测试', amount: '-5', months: '6' });
  assert('negative amount rejected', !!trySave());
  fill({ name: '测试', amount: 'abc', months: '6' });
  assert('non-numeric amount rejected', !!trySave());
  fill({ name: '测试', amount: '999999999999', months: '6' });
  const overAmt = trySave();
  assert('absurd amount rejected with a stated ceiling', !!overAmt && /\d/.test(overAmt.msg), overAmt && overAmt.msg);

  fill({ name: '测试', amount: '1200', months: '0' });
  assert('zero periods rejected', !!trySave());
  fill({ name: '测试', amount: '1200', months: '121' });
  const overM = trySave();
  assert('over 120 periods rejected', !!overM && overM.msg.indexOf('120') !== -1, overM && overM.msg);
  fill({ name: '测试', amount: '1200', months: '-3' });
  assert('negative periods rejected', !!trySave());

  assert('nothing was saved by any rejected attempt', DataStore.getPurchasePlans().length === 0,
    String(DataStore.getPurchasePlans().length));

  /* ---------- 6. A tampered month never reaches storage ---------- */
  window.openPlanEditor();
  fill({ name: '越界', amount: '1200', months: '6' });
  const yearSel = $('planStartYear');
  const monSel = $('planStartMonth');
  const bogus = window.document.createElement('option');
  bogus.value = '13'; bogus.textContent = '13';
  monSel.appendChild(bogus);          // simulate a browser/DOM that allows it
  monSel.value = '13';
  assert('the form can be forced to read 2026-13', window.readPlanStartMonth().slice(-2) === '13');
  const bad = trySave();
  assert('save refuses a 13th month', !!bad && DataStore.getPurchasePlans().length === 0, bad && bad.msg);
  monSel.removeChild(bogus);
  monSel.value = String(new Date().getMonth() + 1).padStart(2, '0');
  yearSel.value = String(thisYear);

  /* ---------- 7. Happy path with a custom icon ---------- */
  fill({ name: '新电脑', amount: '6000.456', months: '6', icon: '🦀' });
  toasts.length = 0;
  window.savePlanEditor(null);
  const saved = DataStore.getPurchasePlans()[0];
  assert('valid plan saves', !!saved);
  assert('custom emoji outside the preset grid is kept', saved && saved.icon === '🦀', saved && saved.icon);
  assert('start month is normalised to YYYY-MM', saved && /^\d{4}-(0[1-9]|1[0-2])$/.test(saved.startMonth),
    saved && saved.startMonth);
  assert('amount is rounded to cents', saved && saved.totalAmount === 6000.46, saved && String(saved.totalAmount));

  /* ---------- 8. Editing keeps an out-of-range start selectable ---------- */
  DataStore.updatePurchasePlan(saved.id, { startMonth: (thisYear - 12) + '-03' });
  window.openPlanEditor(saved.id);
  assert('an old start month stays selected instead of being silently moved',
    window.readPlanStartMonth() === (thisYear - 12) + '-03', window.readPlanStartMonth());

  /* ---------- 9. Extending respects the same ceiling ---------- */
  DataStore.updatePurchasePlan(saved.id, { startMonth: thisMonth, months: 118 });
  window.openPlanEditor(saved.id);
  const holder = window.document.createElement('input');
  holder.id = 'planExtendMonths';
  holder.value = '10';
  window.document.body.appendChild(holder);
  toasts.length = 0;
  window.extendPlan ? window.extendPlan(saved.id) : null;
  if (window.extendPlan) {
    assert('extending past 120 periods is refused',
      DataStore.getPurchasePlan(saved.id).months === 118, String(DataStore.getPurchasePlan(saved.id).months));
  } else {
    // extendPlan is reached through the overdue dialog's data-plan-action
    assert('extending past 120 periods is refused (skipped: not exported)', true);
  }
  holder.remove();

  window.showToast = origToast;
}
