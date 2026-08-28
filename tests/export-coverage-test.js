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
    // Minimal RTCPeerConnection so createClient() completes and the test can
    // hand over a data channel by hand — this drives the real receiveAndMerge
    // instead of asserting on source text.
    window.__rtcChannels = [];
    window.RTCPeerConnection = function () {
      const self = this;
      this.iceConnectionState = 'connected';
      this.iceGatheringState = 'complete';
      this.localDescription = { sdp: 'stub' };
      this.ondatachannel = null; this.onicecandidate = null;
      this.setRemoteDescription = () => Promise.resolve();
      this.createAnswer = () => Promise.resolve({ type: 'answer', sdp: 'stub' });
      this.setLocalDescription = () => Promise.resolve();
      this.createDataChannel = () => ({ readyState: 'open', send() {}, close() {} });
      this.close = () => {};
      window.__rtcChannels.push({
        fire(payload) {
          if (typeof self.ondatachannel !== 'function') return 'no-handler';
          const ch = { readyState: 'open', send() {}, close() {}, onopen: null, onmessage: null, onerror: null };
          self.ondatachannel({ channel: ch });
          if (ch.onopen) ch.onopen();
          if (typeof ch.onmessage !== 'function') return 'no-onmessage';
          ch.onmessage({ data: payload });
          return 'delivered';
        }
      });
    };
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

// Push a payload through the real LAN-sync receive path.
async function lanSync(payloadJson, mode) {
  let i = document.getElementById('syncOfferInput');
  if (!i) { i = document.createElement('input'); i.id = 'syncOfferInput'; document.body.appendChild(i); }
  i.value = 'stub-offer';
  window.SyncUI.connectAsClient();
  await new Promise(r => setTimeout(r, 120));
  window.__rtcChannels[window.__rtcChannels.length - 1].fire(payloadJson);
  await new Promise(r => setTimeout(r, 20));
  window.confirmSyncMode(mode);
  await new Promise(r => setTimeout(r, 20));
}

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

// ========== E3: LAN sync preserves contacts + splitBills ==========
// Was asserting on the SOURCE TEXT of 23-lan-sync.js, which proved nothing about
// behaviour and broke the moment the whitelist was replaced by _normalize().
// Now it drives the real receive path.
assert('E3 hook present', typeof window.SyncUI === 'object' && typeof window.confirmSyncMode === 'function');
{
  const seed = JSON.parse(JSON.stringify(raw));
  seed.contacts = [{ id: 'c9', name: 'Carol' }];
  seed.splitBills = [{ id: 'sb9', payer: 'self', amount: 50, date: '2026-08-02', categoryId: catId, selfShare: 0, mode: 'equal', archived: false, participants: [] }];

  DataStore.clearAll();
  await lanSync(JSON.stringify(seed), 'replace');
  assert('E3 replace: records survive', DataStore._data.records.length === seed.records.length,
    'got ' + DataStore._data.records.length + ' of ' + seed.records.length);
  assert('E3 replace: contacts preserved', DataStore._data.contacts.some(c => c.id === 'c9'));
  assert('E3 replace: splitBills preserved', DataStore._data.splitBills.some(b => b.id === 'sb9'));
  assert('E3 replace: allTags preserved', Array.isArray(DataStore._data.allTags) && DataStore._data.allTags.includes('聚餐'));

  DataStore.clearAll();
  DataStore.importJSON(JSON.stringify(raw), 'replace');
  await lanSync(JSON.stringify(seed), 'merge');
  assert('E3 merge: contacts preserved', DataStore._data.contacts.some(c => c.id === 'c9'));
  assert('E3 merge: splitBills preserved', DataStore._data.splitBills.some(b => b.id === 'sb9'));
  assert('E3 merge: local records not duplicated', DataStore._data.records.length === raw.records.length,
    'got ' + DataStore._data.records.length + ' expected ' + raw.records.length);
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

// ========== E7: purchase plans — waterfall maths, export, sync, hash ==========
// Uses months in the past so nothing depends on "today"; monthSurplus is a pure
// function of stored income/bills/records, with no daysPassed term.
const planFixture = JSON.parse(DataStore.exportJSON());
planFixture.monthlyIncome = { '2026-01': 800, '2026-02': 800 };
planFixture.savingsTarget = { type: 'fixed', fixedAmount: 100, percent: 0 };
planFixture.billAmounts = {};
planFixture.billCategories = [];
planFixture.purchasePlans = [{
  id: 'pp1', name: 'MacBook', icon: '🏦', totalAmount: 600, mode: 'borrow',
  startMonth: '2026-01', months: 6, categoryId: '', status: 'active',
  overrides: {}, note: '', createdAt: '2026-01-01T00:00:00'
}];
planFixture.records = [{
  id: 'x1', amount: 500, categoryId: catId, date: '2026-01-05T10:00',
  note: '', tags: [], createdAt: '2026-01-05T10:00:00'
}];
DataStore.clearAll();
DataStore.importJSON(JSON.stringify(planFixture), 'replace');

assert('E7 PlanMath exported', typeof window.PlanMath === 'object');

// 收入800 − 消费500 = 结余300；月供 600/6 = 100 全额还上
const st1 = window.PlanMath.getState('pp1', '2026-01');
assert('E7 due is total/periods', st1 && Math.abs(st1.byMonth['2026-01'].due - 100) < 0.01,
  st1 ? 'got ' + st1.byMonth['2026-01'].due : 'no state');
assert('E7 full repayment when surplus covers it', st1 && Math.abs(st1.byMonth['2026-01'].actual - 100) < 0.01,
  st1 ? 'got ' + st1.byMonth['2026-01'].actual : 'no state');

// 消费720 → 结余80，只还得起80，欠20 → 下期 (600−80)/5 = 104
DataStore._data.records[0].amount = 720;
DataStore.save();
const st2 = window.PlanMath.getState('pp1', '2026-02');
assert('E7 partial repayment when surplus is short', st2 && Math.abs(st2.byMonth['2026-01'].actual - 80) < 0.01,
  st2 ? 'got ' + st2.byMonth['2026-01'].actual : 'no state');
assert('E7 shortfall recorded', st2 && Math.abs(st2.byMonth['2026-01'].short - 20) < 0.01,
  st2 ? 'got ' + st2.byMonth['2026-01'].short : 'no state');
assert('E7 shortfall rolls into remaining periods', st2 && Math.abs(st2.byMonth['2026-02'].due - 104) < 0.01,
  st2 ? 'got ' + st2.byMonth['2026-02'].due : 'no state');

// 可支配预算被月供占用：800 − 0账单 − 100储蓄目标 − 104月供 = 596
const sp = window.StatsEngine.getSpendablePlan('2026-02');
assert('E7 spendable budget reserves the instalment', Math.abs(sp.spendableBudget - 596) < 0.01,
  'got ' + sp.spendableBudget);
assert('E7 planDueVirtual surfaced', Math.abs(sp.planDueVirtual - 104) < 0.01, 'got ' + sp.planDueVirtual);

// credit mode must NOT be deducted twice — its real record already squeezes the budget
DataStore._data.purchasePlans[0].mode = 'credit';
DataStore.save();
assert('E7 credit mode excluded from virtual due',
  window.StatsEngine.getSpendablePlan('2026-02').planDueVirtual === 0);
DataStore._data.purchasePlans[0].mode = 'borrow';
DataStore.save();

// hash must react to plan edits, otherwise two devices show a matching fingerprint
const ph1 = DataStore.getDataHash();
DataStore._data.purchasePlans[0].overrides['2026-02'] = 200;
DataStore.save();
assert('E7 hash changes when an override is added', ph1 !== DataStore.getDataHash());
delete DataStore._data.purchasePlans[0].overrides['2026-02'];
DataStore.save();
assert('E7 hash restores when override removed', ph1 === DataStore.getDataHash());

// merge import must carry plans across
DataStore.importJSON(JSON.stringify(planFixture), 'merge');
assert('E7 merge: purchasePlans preserved', Array.isArray(DataStore._data.purchasePlans) &&
  DataStore._data.purchasePlans.some(p => p.id === 'pp1'));

// LAN sync coverage — behavioural, not source-text matching
{
  const planPayload = JSON.parse(DataStore.exportJSON());
  DataStore.clearAll();
  await lanSync(JSON.stringify(planPayload), 'replace');
  assert('E7 sync replace: purchasePlans preserved',
    (DataStore._data.purchasePlans || []).some(p => p.id === 'pp1'));
  assert('E7 sync replace: plan overrides preserved',
    (DataStore._data.purchasePlans || []).some(p => p.id === 'pp1' && p.overrides && typeof p.overrides === 'object'));

  DataStore.clearAll();
  await lanSync(JSON.stringify(planPayload), 'merge');
  assert('E7 sync merge: purchasePlans preserved',
    (DataStore._data.purchasePlans || []).some(p => p.id === 'pp1'));
}

// Excel sheet 7
{
  let planXml = '';
  let cap = null;
  const oc = window.URL.createObjectURL;
  window.URL.createObjectURL = (blob) => { cap = blob; return 'blob:test'; };
  try {
    window.exportToExcel();
    planXml = await cap.text();
  } catch (e) {
    console.log('excel plan capture error: ' + e.message);
  }
  window.URL.createObjectURL = oc;
  assert('E7 excel sheet7 大额计划 present',
    planXml.indexOf('大额计划') !== -1 || planXml.indexOf('Purchase Plans') !== -1);
  assert('E7 excel plan row present', planXml.indexOf('MacBook') !== -1);
  assert('E7 excel period child rows present', planXml.indexOf('↳ 2026-01') !== -1);
}

// ========== E8: predicted-total trend vs month-end split (A-1/A-2/A-3) ==========
// getPredictedTotal is a TREND reading (habit pace, filters excludeFromAvg) and
// must stay that way for daily-average-style consumers. Anything netted against
// income needs getPredictedMonthEndTotal (trend + the excluded actual added back
// in), or a checked "exclude from daily avg" record makes the savings forecast
// come out systematically inflated. These assertions execute the real functions
// against real data — no source-text matching — so a regression that removes the
// filter, the add-back, or the shared getForecast call will actually fail here.
{
  const nowD = new Date();
  const curMonth = nowD.getFullYear() + '-' + String(nowD.getMonth() + 1).padStart(2, '0');
  const todayStr = nowD.toISOString().slice(0, 16); // 'YYYY-MM-DDTHH:MM', local-parsed like other fixtures

  const predFixture = JSON.parse(DataStore.exportJSON());
  predFixture.monthlyIncome = { [curMonth]: 3000 };
  predFixture.billAmounts = {};
  predFixture.billCategories = [];
  predFixture.savingsTarget = { type: 'fixed', fixedAmount: 500, percent: 0 };
  predFixture.splitBills = [];
  predFixture.contacts = [];
  predFixture.purchasePlans = [];
  predFixture.records = [
    { id: 'pt1', amount: 300, categoryId: catId, date: todayStr, note: '', tags: [], createdAt: todayStr }
  ];
  DataStore.clearAll();
  DataStore.importJSON(JSON.stringify(predFixture), 'replace');

  const trendNoExcl = window.StatsEngine.getPredictedTotal(curMonth);
  const monthEndNoExcl = window.StatsEngine.getPredictedMonthEndTotal(curMonth);
  assert('E8 predictedMonthEnd matches the trend when nothing is excluded',
    Math.abs(monthEndNoExcl - trendNoExcl) < 0.01,
    'trend=' + trendNoExcl + ' monthEnd=' + monthEndNoExcl);

  // Add a 1200 one-off large purchase flagged "exclude from daily avg"
  predFixture.records.push({
    id: 'pt2', amount: 1200, categoryId: catId, date: todayStr, note: '', tags: [],
    excludeFromAvg: true, createdAt: todayStr
  });
  DataStore.clearAll();
  DataStore.importJSON(JSON.stringify(predFixture), 'replace');

  const trendWithExcl = window.StatsEngine.getPredictedTotal(curMonth);
  const monthEndWithExcl = window.StatsEngine.getPredictedMonthEndTotal(curMonth);
  const actualSpent = window.StatsEngine.getMonthTotal(curMonth); // 1500
  const savingsWithExcl = window.StatsEngine.getSavingsPrediction(curMonth);

  assert('E8 (A-1) trend projection still excludes the excludeFromAvg record',
    Math.abs(trendWithExcl - trendNoExcl) < 0.01,
    'trendNoExcl=' + trendNoExcl + ' trendWithExcl=' + trendWithExcl);
  assert('E8 (A-1) month-end total adds the excluded actual (1200) back on top of the trend',
    Math.abs(monthEndWithExcl - (trendWithExcl + 1200)) < 0.01,
    'monthEnd=' + monthEndWithExcl + ' expected=' + (trendWithExcl + 1200));
  assert('E8 (A-1) month-end total can never sit below money already spent this month',
    monthEndWithExcl >= actualSpent - 0.01,
    'monthEnd=' + monthEndWithExcl + ' actualSpent=' + actualSpent);
  assert('E8 (A-1) savings prediction is no longer inflated by the excluded purchase (gap == 1200)',
    Math.abs(((3000 - trendWithExcl) - savingsWithExcl) - 1200) < 0.01,
    'naive trend-only savings vs real getSavingsPrediction gap = ' + ((3000 - trendWithExcl) - savingsWithExcl));

  // ---- A-2: the rolling-30-day twin must apply the same filter / add-back ----
  const prevStatsRange = window.localStorage.getItem('budgetStatsRange');
  window.localStorage.setItem('budgetStatsRange', 'rolling30');

  const periodTrend = window.StatsEngine.getPeriodPredictedTotal();
  const periodMonthEnd = window.StatsEngine.getPeriodPredictedMonthEndTotal();

  assert('E8 (A-2) rolling-period trend excludes the excludeFromAvg record too',
    Math.abs(periodTrend - 300) < 0.01, 'got ' + periodTrend);
  assert('E8 (A-2) rolling-period month-end adds the excluded actual back in',
    Math.abs(periodMonthEnd - 1500) < 0.01, 'got ' + periodMonthEnd);
  assert('E8 (A-2) month mode and rolling-30 mode treat excludeFromAvg identically',
    Math.abs((periodMonthEnd - periodTrend) - (monthEndWithExcl - trendWithExcl)) < 0.01,
    'period gap=' + (periodMonthEnd - periodTrend) + ' month gap=' + (monthEndWithExcl - trendWithExcl));

  if (prevStatsRange === null) window.localStorage.removeItem('budgetStatsRange');
  else window.localStorage.setItem('budgetStatsRange', prevStatsRange);

  // ---- A-3: overview and plan-center must read the same shared function ----
  const forecastSpend = window.PlanMath.getForecast(curMonth).predictedSpend;
  assert('E8 (A-3) PlanMath.getForecast reuses the shared month-end total (no duplicate formula)',
    Math.abs(forecastSpend - monthEndWithExcl) < 0.01,
    'forecast=' + forecastSpend + ' shared=' + monthEndWithExcl);
}

// ========== Regression: existing suite basics still OK ==========
assert('regression: importJSON replace still works', (() => {
  DataStore.clearAll();
  const ok = DataStore.importJSON(JSON.stringify(raw), 'replace');
  return ok && DataStore._data.records.length === 1;
})());
}