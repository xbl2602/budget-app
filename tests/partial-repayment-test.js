// Partial repayment: amount model, allocation strategies, limits, and the
// receive-payment dialog.
// Usage: node tests/partial-repayment-test.js  (requires jsdom; npm i --no-save jsdom)
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
const month = new Date().toISOString().slice(0, 7);

function seed(bills) {
  const { DataStore } = window;
  DataStore.clearAll();
  DataStore.importJSON(JSON.stringify({
    records: [], categories: [{ id: 'catA', name: '餐饮', icon: '🍜', color: '#e74c3c', parentId: null, sortOrder: 0 }],
    budgets: {}, budgetObj: {}, categoryBudgets: {}, monthlyIncome: {},
    billAmounts: {}, savingsTarget: { type: 'fixed', fixedAmount: 0 },
    percentBase: 'gross', whatIfParams: null, allTags: [],
    billCategories: [], contacts: [{ id: 'p1', name: '阿明' }], splitBills: [], _v: 7, _t: 'budget-app',
  }), 'replace');
  DataStore.init();
  DataStore._data.contacts = [{ id: 'p1', name: '阿明' }];
  DataStore._data.splitBills = bills;
  DataStore.save();
}

function mkBill(id, day, amount, share, extra) {
  return Object.assign({
    id, amount, date: month + '-' + day + 'T12:00', note: '', tag: 'B' + id,
    categoryId: 'catA', payer: 'self', selfShare: amount - share, mode: 'equal',
    participants: [Object.assign({ contactId: 'p1', name: '阿明', share, paid: false, unknown: false }, extra || {})],
    createdAt: new Date().toISOString(),
  });
}

async function run() {
  const { DataStore, SplitEngine } = window;
  const S = SplitEngine;

  /* ---------- 1. Amount model + legacy compatibility ---------- */
  assert('legacy paid:true reads as fully repaid', S.partPaid({ share: 50, paid: true }) === 50);
  assert('legacy paid:false reads as nothing repaid', S.partPaid({ share: 50, paid: false }) === 0);
  assert('paidAmount wins over the legacy flag', S.partPaid({ share: 50, paid: false, paidAmount: 20 }) === 20);
  assert('paidAmount is clamped to the share', S.partPaid({ share: 50, paidAmount: 999 }) === 50);
  assert('negative paidAmount clamps to 0', S.partPaid({ share: 50, paidAmount: -5 }) === 0);
  assert('owed nets off the partial', S.partOwed({ share: 50, paidAmount: 20 }) === 30);
  assert('settled is amount-based', S.partSettled({ share: 50, paidAmount: 50 }) === true
    && S.partSettled({ share: 50, paidAmount: 49.99 }) === false);

  const w = S.withPaidAmount({ share: 50, paid: false }, 50);
  assert('withPaidAmount also sets the legacy flag', w.paidAmount === 50 && w.paid === true);
  const w2 = S.withPaidAmount({ share: 50, paid: true }, 10);
  assert('dropping below the share clears the legacy flag', w2.paidAmount === 10 && w2.paid === false);
  assert('withPaidAmount clamps over-payment', S.withPaidAmount({ share: 50 }, 80).paidAmount === 50);

  /* ---------- 2. Aggregates see partials ---------- */
  seed([mkBill('b1', '05', 100, 50, { paidAmount: 20 })]);
  const bill = S.getSplitBill('b1');
  assert('getSplitBillUnpaid nets the partial', S.getSplitBillUnpaid(bill) === 30, String(S.getSplitBillUnpaid(bill)));
  const pend = S.getPendingSummary({ includePaid: true });
  const pc = pend.perContact[0];
  assert('pending total counts only what is still owed', pc.total === 30, String(pc.total));
  assert('pending paidTotal counts what came in', pc.paidTotal === 20, String(pc.paidTotal));
  assert('row is flagged partial', pc.bills[0].partial === true && pc.bills[0].owed === 30);

  /* ---------- 3. Allocation: even split ---------- */
  const rows3 = [
    { billId: 'x1', contactKey: 'p1', remaining: 50, label: 'A' },
    { billId: 'x2', contactKey: 'p1', remaining: 50, label: 'B' },
    { billId: 'x3', contactKey: 'p1', remaining: 50, label: 'C' },
  ];
  const even = S.allocateRepayment(100, rows3, 'even', null);
  assert('even split succeeds', even.ok === true, even.error);
  const evenSum = even.alloc.reduce((s, a) => s + a.amount, 0);
  assert('even split totals exactly the amount (no cent drift)', Math.round(evenSum * 100) === 10000, String(evenSum));
  assert('even split spreads across all three', even.alloc.length === 3,
    JSON.stringify(even.alloc.map(a => a.amount)));
  assert('even split cents land as 33.34/33.33/33.33',
    JSON.stringify(even.alloc.map(a => a.amount).sort((a, b) => b - a)) === '[33.34,33.33,33.33]',
    JSON.stringify(even.alloc.map(a => a.amount)));

  /* ---------- 4. Even split respects each bill's cap ---------- */
  const rowsCap = [
    { billId: 'y1', contactKey: 'p1', remaining: 10, label: 'small' },
    { billId: 'y2', contactKey: 'p1', remaining: 100, label: 'big1' },
    { billId: 'y3', contactKey: 'p1', remaining: 100, label: 'big2' },
  ];
  const capped = S.allocateRepayment(60, rowsCap, 'even', null);
  const byId = {};
  capped.alloc.forEach(a => { byId[a.billId] = a.amount; });
  assert('a filled bill stops at its remaining', byId.y1 === 10, String(byId.y1));
  assert('its leftover is redistributed evenly', byId.y2 === 25 && byId.y3 === 25,
    byId.y2 + '/' + byId.y3);
  assert('capped even split still totals the amount',
    Math.round((byId.y1 + byId.y2 + byId.y3) * 100) === 6000);

  /* ---------- 5. Oldest-first ---------- */
  const fifo = S.allocateRepayment(60, rowsCap, 'ordered', null);
  const fById = {};
  fifo.alloc.forEach(a => { fById[a.billId] = a.amount; });
  assert('oldest-first clears the first bill fully', fById.y1 === 10);
  assert('oldest-first puts the rest on the next bill', fById.y2 === 50 && fById.y3 === undefined,
    JSON.stringify(fById));

  /* ---------- 6. Manual ---------- */
  const man = S.allocateRepayment(0, rowsCap, 'manual', { y1: '5', y2: '20', y3: '' });
  assert('manual allocation succeeds', man.ok === true, man.error);
  assert('manual total is the sum of what was typed', man.allocated === 25, String(man.allocated));
  assert('manual skips blank rows', man.alloc.length === 2);

  /* ---------- 7. Limits ---------- */
  assert('rejects more than the selected bills owe', S.allocateRepayment(300, rowsCap, 'even', null).ok === false);
  assert('rejects zero', S.allocateRepayment(0, rowsCap, 'even', null).ok === false);
  assert('rejects negative', S.allocateRepayment(-5, rowsCap, 'even', null).ok === false);
  assert('rejects an empty selection', S.allocateRepayment(10, [], 'even', null).ok === false);
  assert('manual rejects overshooting one bill',
    S.allocateRepayment(0, rowsCap, 'manual', { y1: '20' }).ok === false);
  assert('manual rejects a negative row',
    S.allocateRepayment(0, rowsCap, 'manual', { y1: '-1' }).ok === false);
  assert('manual rejects all-blank', S.allocateRepayment(0, rowsCap, 'manual', {}).ok === false);
  assert('rejects rows with nothing left to pay',
    S.allocateRepayment(10, [{ billId: 'z', contactKey: 'p1', remaining: 0 }], 'even', null).ok === false);

  /* ---------- 8. applyRepayment writes and re-clamps ---------- */
  seed([mkBill('b1', '05', 100, 50), mkBill('b2', '06', 80, 40)]);
  const applied = S.applyRepayment([
    { billId: 'b1', contactKey: 'p1', amount: 30 },
    { billId: 'b2', contactKey: 'p1', amount: 40 },
  ]);
  assert('applyRepayment reports what it wrote', applied.applied === 70 && applied.touched === 2,
    JSON.stringify(applied));
  assert('partial repayment stored', S.partPaid(S.getSplitBill('b1').participants[0]) === 30);
  assert('full repayment flips the legacy flag', S.getSplitBill('b2').participants[0].paid === true);
  const over = S.applyRepayment([{ billId: 'b1', contactKey: 'p1', amount: 999 }]);
  assert('a stale plan cannot overpay', S.partPaid(S.getSplitBill('b1').participants[0]) === 50
    && over.applied === 20, String(over.applied));

  /* ---------- 9. setSplitPaidAmount limits + undo ---------- */
  seed([mkBill('b1', '05', 100, 50)]);
  assert('rejects above the share', S.setSplitPaidAmount('b1', 'p1', 51).ok === false);
  assert('rejects negative', S.setSplitPaidAmount('b1', 'p1', -1).ok === false);
  assert('rejects an unknown bill', S.setSplitPaidAmount('nope', 'p1', 5).ok === false);
  assert('rejects an unknown person', S.setSplitPaidAmount('b1', 'nobody', 5).ok === false);
  assert('accepts a partial', S.setSplitPaidAmount('b1', 'p1', 20).ok === true
    && S.partPaid(S.getSplitBill('b1').participants[0]) === 20);
  assert('accepts clearing back to zero', S.setSplitPaidAmount('b1', 'p1', 0).ok === true
    && S.partPaid(S.getSplitBill('b1').participants[0]) === 0);

  // Un-settling an archived bill reopens it
  seed([Object.assign(mkBill('b1', '05', 100, 50, { paidAmount: 50, paid: true }), { archived: true })]);
  S.setSplitPaidAmount('b1', 'p1', 10);
  assert('archived bill reopens when it is no longer settled', S.getSplitBill('b1').archived === false);

  /* ---------- 10. Receive dialog ---------- */
  seed([mkBill('b1', '05', 100, 50), mkBill('b2', '06', 80, 40), mkBill('b3', '07', 60, 30)]);
  window.openSplitReceive('p1');
  assert('receive dialog lists every outstanding bill',
    window.document.querySelectorAll('.split-pay-row').length === 3);
  assert('everything starts selected',
    window.document.querySelectorAll('.split-pay-row input[type="checkbox"]:checked').length === 3);
  assert('outstanding total shown', !!$('splitPayAmount'));

  window.splitPaySelectNone();
  assert('select-none clears the selection',
    window.document.querySelectorAll('.split-pay-row input[type="checkbox"]:checked').length === 0);
  window.splitPaySelectInvert();
  assert('invert from empty selects everything',
    window.document.querySelectorAll('.split-pay-row input[type="checkbox"]:checked').length === 3);
  window.toggleSplitPayRow('b2', false);
  window.splitPaySelectInvert();
  const checkedIds = [...window.document.querySelectorAll('.split-pay-row')]
    .filter(r => r.querySelector('input[type="checkbox"]').checked)
    .map(r => r.getAttribute('data-bill'));
  assert('invert flips exactly the deselected one', JSON.stringify(checkedIds) === '["b2"]',
    JSON.stringify(checkedIds));

  window.splitPaySelectAll();
  window.setSplitPayAmountToSelected();
  assert('"= selected total" fills the full outstanding amount',
    parseFloat($('splitPayAmount').value) === 120, $('splitPayAmount').value);

  $('splitPayAmount').value = '60';
  window.updateSplitPayPreview();
  assert('preview builds a plan', Array.isArray(window._payPlan) && window._payPlan.length === 3);
  assert('confirm button enabled for a valid plan', $('splitPayConfirmBtn').disabled === false);

  $('splitPayAmount').value = '500';
  window.updateSplitPayPreview();
  assert('over-payment blocks confirm', $('splitPayConfirmBtn').disabled === true && !window._payPlan);
  assert('over-payment explains the limit', $('splitPayPreview').innerHTML.indexOf('⚠️') !== -1);

  $('splitPayAmount').value = '60';
  window.updateSplitPayPreview();
  window.confirmSplitReceive();
  const after = ['b1', 'b2', 'b3'].map(id => S.partPaid(S.getSplitBill(id).participants[0]));
  assert('confirm writes the allocation', Math.round(after.reduce((a, b) => a + b, 0) * 100) === 6000,
    JSON.stringify(after));
  assert('even split across 50/40/30 caps the smallest', after[2] === 20,
    JSON.stringify(after));

  /* ---------- 11. Stats + export see partials ---------- */
  seed([mkBill('b1', '05', 100, 50, { paidAmount: 20 })]);
  const contrib = window.StatsEngine.getSplitContrib(month);
  assert('stats reimbursement counts the partial', contrib === 20, String(contrib));

  let xml = '';
  const origBlob = window.Blob;
  window.Blob = function (parts) { xml = String(parts && parts[0] || ''); return { size: 0, type: '' }; };
  try { window.exportToExcel(); } catch (e) {}
  window.Blob = origBlob;
  assert('Excel marks the row as partially repaid', xml.indexOf('部分已还') !== -1);
}
