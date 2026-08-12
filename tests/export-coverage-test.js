// Export coverage verification — E1..E6 fixes
// Node: can directly reference source files because they attach to global/window? Not here —
// so load index.html via jsdom like other test suites.
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');

function makeCanvasStub() {
  const noop = () => {};
  return {
    canvas: null,
    setTransform: noop, scale: noop, translate: noop, rotate: noop, clearRect: noop,
    fillRect: noop, strokeRect: noop, beginPath: noop, closePath: noop,
    moveTo: noop, lineTo: noop, arc: noop, arcTo: noop, bezierCurveTo: noop,
    quadraticCurveTo: noop, fill: noop, stroke: noop, clip: noop,
    fillText: noop, strokeText: noop, measureText: () => ({ width: 10 }),
    save: noop, restore: noop, createLinearGradient: () => ({ addColorStop: noop }),
    createRadialGradient: () => ({ addColorStop: noop }),
    createPattern: () => ({}),
    drawImage: noop, getImageData: () => ({ data: new Uint8ClampedArray(4) }),
    putImageData: noop, roundRect: noop, resetTransform: noop,
    lineWidth: 1, fillStyle: '#000', strokeStyle: '#000', globalAlpha: 1,
    font: '10px sans-serif', textAlign: 'left', textBaseline: 'alphabetic',
    lineCap: 'butt', lineJoin: 'miter', shadowBlur: 0, shadowColor: 'transparent'
  };
}

const dom = new JSDOM(html, {
  runScripts: 'dangerously',
  pretendToBeVisual: true,
  url: 'http://localhost/',
  beforeParse(window) {
    const stub = makeCanvasStub();
    window.HTMLCanvasElement.prototype.getContext = function () {
      this._stub = stub;
      stub.canvas = this;
      return stub;
    };
    window.CanvasRenderingContext2D = function () {};
    window.CanvasRenderingContext2D.prototype.roundRect = function () { return this; };
    window.HTMLCanvasElement.prototype.toDataURL = function () { return 'data:image/png;base64,AAA'; };
    window.URL.createObjectURL = (blob) => 'blob:stub';
    window.URL.revokeObjectURL = () => {};
  },
});
const { window } = dom;
const { document } = window;

// Wait for DOMContentLoaded bootstrap (DataStore.init) before assertions
function whenReady() {
  return new Promise(resolve => {
    if (window._readyFired) return resolve();
    window.addEventListener('load', () => resolve());
    setTimeout(resolve, 800);
  });
}

let pass = 0, fail = 0;
function assert(name, cond, extra) {
  if (cond) { pass++; console.log('PASS ' + name); }
  else { fail++; console.log('FAIL ' + name + (extra ? ' — ' + extra : '')); }
}

whenReady().then(async () => {
  await run();
  console.log('\n===== RESULT: ' + pass + ' PASS / ' + fail + ' FAIL =====');
  process.exit(fail > 0 ? 1 : 0);
});

async function run() {
  const { DataStore } = window;

// --- Ensure DataStore loaded ---
assert('DataStore loaded', typeof DataStore === 'object' && typeof DataStore.importJSON === 'function');

// ========== Build a fixture with all data types ==========
const base = DataStore.exportJSON();
const raw = JSON.parse(base);

// Attach split payload: contacts + splitBills + tags + categoryBudgets + whatIfParams + allTags
raw.contacts = [{ id: 'c1', name: 'Alice' }, { id: 'c2', name: 'Bob' }];
raw.splitBills = [{
  id: 'sb1', amount: 300, date: '2026-08-01', categoryId: 'cat-food',
  selfShare: 200, mode: 'equal', note: '火锅', archived: false,
  participants: [{ contactId: 'c1', name: 'Alice', share: 100, paid: false, unknown: false }]
}];
raw.categoryBudgets = { 'cat-food:2026-08': { value: 500, type: 'fixed' } };
raw.whatIfParams = { scenario: 'test' };
raw.allTags = ['聚餐'];
raw.records.push({
  id: 'r1', amount: 300, categoryId: 'cat-food', date: '2026-08-01',
  note: '火锅', tags: ['聚餐'], splitBillId: 'sb1',
  createdAt: '2026-08-01T10:00:00', updatedAt: '2026-08-01T10:00:00'
});
// Need a real category id — find first root category id
const catId = DataStore.getCategories()[0].id;
raw.records[raw.records.length - 1].categoryId = catId;
raw.splitBills[0].categoryId = catId;
raw.categoryBudgets = { [catId + ':2026-08']: { value: 500, type: 'fixed' } };

// ========== E1+E2: importJSON merge preserves all fixtures ==========
DataStore.clearAll();
DataStore.importJSON(JSON.stringify(raw), 'replace');
// baseline established
DataStore.importJSON(JSON.stringify(raw), 'merge');

assert('E1 merge: categoryBudgets merged', DataStore.getAllCategoryBudgets()[catId + ':2026-08'] &&
  DataStore.getAllCategoryBudgets()[catId + ':2026-08'].value === 500);
assert('E2 merge: whatIfParams merged', DataStore.getWhatIfParams() &&
  DataStore.getWhatIfParams().scenario === 'test');
assert('E2 merge: allTags merged', Array.isArray(DataStore._data.allTags) &&
  DataStore._data.allTags.includes('聚餐'));
assert('E1 merge: splitBills merged', Array.isArray(DataStore._data.splitBills) &&
  DataStore._data.splitBills.some(b => b.id === 'sb1'));
assert('E1 merge: contacts merged', Array.isArray(DataStore._data.contacts) &&
  DataStore._data.contacts.some(c => c.id === 'c1'));

// ========== E3: LAN sync merge preserves contacts + splitBills ==========
assert('E3 hook present', typeof window.mergeIntoDataStore === 'function' || typeof window.SyncUI === 'object');
// mergeIntoDataStore isn't exported; simulate via receiveAndMerge path if available
if (typeof window.receiveAndMerge === 'function') {
  DataStore.clearAll();
  DataStore.importJSON(JSON.stringify({ records: [], categories: DataStore.getCategories(), budgets: {}, categoryBudgets: {}, savingsTarget: { type: 'fixed', fixedAmount: 0, percent: 0 }, monthlyIncome: {}, billAmounts: {}, billCategories: [], percentBase: 'gross' }), 'replace');
  const inc = JSON.parse(DataStore.exportJSON());
  inc.contacts = [{ id: 'c9', name: 'Carol' }];
  inc.splitBills = [{ id: 'sb9', amount: 50, date: '2026-08-02', categoryId: catId, selfShare: 0, mode: 'equal', archived: false, participants: [] }];
  window.receiveAndMerge(JSON.stringify(inc), 'merge');
  assert('E3 merge: contacts preserved', DataStore._data.contacts.some(c => c.id === 'c9'));
  assert('E3 merge: splitBills preserved', DataStore._data.splitBills.some(b => b.id === 'sb9'));
} else {
  // Fallback: read source to verify code presence
  const lan = fs.readFileSync(path.join(__dirname, '..', 'src', 'js', '23-lan-sync.js'), 'utf8');
  assert('E3 replace: contacts in source', /DataStore\._data\.contacts = data\.contacts/.test(lan));
  assert('E3 replace: splitBills in source', /DataStore\._data\.splitBills = data\.splitBills/.test(lan));
  assert('E3 merge: contacts in mergeIntoDataStore', /incoming\.contacts && Array\.isArray\(incoming\.contacts\)/.test(lan));
  assert('E3 merge: splitBills in mergeIntoDataStore', /incoming\.splitBills && Array\.isArray\(incoming\.splitBills\)/.test(lan));
}

// ========== E4: Excel covers split bills ==========
DataStore.clearAll();
DataStore.importJSON(JSON.stringify(raw), 'replace');
const xmlBlob = null;
let excelXml = '';
// exportToExcel triggers a download — capture Blob by stubbing createObjectURL etc.
const origCreate = window.URL.createObjectURL;
const origAppend = document.body.appendChild;
const origClick = window.HTMLAnchorElement ? null : null;
let captured = null;
window.URL.createObjectURL = (blob) => { captured = blob; return 'blob:test'; };
window.URL.revokeObjectURL = () => {};
window.HTMLAnchorElement.prototype.click = function () { capturedAnchor = this; };
let capturedAnchor = null;
try {
  window.exportToExcel();
  excelXml = await captured.text();
} catch (e) {
  console.log('excel capture error: ' + e.message);
}
window.URL.createObjectURL = origCreate;

assert('E4 excel XML generated', excelXml.length > 0);
assert('E4 excel sheet6 分摊账单 present', excelXml.indexOf('分摊账单') !== -1 || excelXml.indexOf('Split Bills') !== -1);
assert('E4 excel sheet6 bill row data', excelXml.indexOf('火锅') !== -1);
assert('E4 excel participant row', excelXml.indexOf('↳') !== -1);
assert('E4 excel header tags col', excelXml.indexOf('标签') !== -1 || excelXml.indexOf('Tags') !== -1);
assert('E4 excel split marker in records sheet', excelXml.indexOf('自份额') !== -1 || excelXml.indexOf('my share') !== -1);

// ========== E5: CSV covers tags + split ==========
DataStore.clearAll();
DataStore.importJSON(JSON.stringify(raw), 'replace');
const csv = DataStore.exportCSV();
const lines = csv.split('\n');
assert('E5 csv header has Tags', lines[0].indexOf('标签') !== -1 || lines[0].indexOf('Tags') !== -1);
const rLine = lines.find(l => l.indexOf('r1') !== -1);
assert('E5 csv record has tags value', rLine && rLine.indexOf('聚餐') !== -1);
assert('E5 csv record has split mark', rLine && rLine.indexOf('🧾') !== -1);

// ========== E6: getDataHash fingerprint covers split detail ==========
DataStore.clearAll();
DataStore.importJSON(JSON.stringify(raw), 'replace');
const h1 = DataStore.getDataHash();
// Flip an unknown flag on a participant -> hash must change
DataStore._data.splitBills[0].participants[0].paid = true;
DataStore.save();
const h2 = DataStore.getDataHash();
assert('E6 hash changes when split paid state flips', h1 !== h2);
DataStore._data.splitBills[0].participants[0].paid = false;
DataStore.save();
const h3 = DataStore.getDataHash();
assert('E6 hash restores to original', h1 === h3);
// Tags change -> hash changes
DataStore._data.records[0].tags = ['其他'];
DataStore.save();
const h4 = DataStore.getDataHash();
assert('E6 hash changes when tags change', h1 !== h4);
DataStore._data.records[0].tags = ['聚餐'];
DataStore.save();

// ========== Regression: existing suite basics still OK ==========
assert('regression: importJSON replace still works', (() => {
  DataStore.clearAll();
  const ok = DataStore.importJSON(JSON.stringify(raw), 'replace');
  return ok && DataStore._data.records.length === 1;
})());
}