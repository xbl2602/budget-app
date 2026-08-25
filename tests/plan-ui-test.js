// Purchase-plan UI coverage: entry point, ledger readability, credit record
// generation, XSS escaping, i18n completeness, cascade delete.
// Requires jsdom and a fresh `bash build.sh` (loads the built index.html).
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');

function stub() {
  const noop = () => {};
  return {
    canvas: null, setTransform: noop, scale: noop, translate: noop, rotate: noop,
    clearRect: noop, fillRect: noop, strokeRect: noop, beginPath: noop, closePath: noop,
    moveTo: noop, lineTo: noop, arc: noop, arcTo: noop, bezierCurveTo: noop,
    quadraticCurveTo: noop, fill: noop, stroke: noop, clip: noop, fillText: noop,
    strokeText: noop, measureText: () => ({ width: 10 }), save: noop, restore: noop,
    createLinearGradient: () => ({ addColorStop: noop }),
    createRadialGradient: () => ({ addColorStop: noop }), createPattern: () => ({}),
    drawImage: noop, getImageData: () => ({ data: new Uint8ClampedArray(4) }),
    putImageData: noop, roundRect: noop, resetTransform: noop, lineWidth: 1,
    fillStyle: '#000', strokeStyle: '#000', globalAlpha: 1, font: '10px sans-serif',
    textAlign: 'left', textBaseline: 'alphabetic', lineCap: 'butt', lineJoin: 'miter',
    shadowBlur: 0, shadowColor: 'transparent'
  };
}

const dom = new JSDOM(html, {
  runScripts: 'dangerously', pretendToBeVisual: true, url: 'http://localhost/',
  beforeParse(w) {
    const s = stub();
    w.HTMLCanvasElement.prototype.getContext = function () { s.canvas = this; return s; };
    w.CanvasRenderingContext2D = function () {};
    w.CanvasRenderingContext2D.prototype.roundRect = function () { return this; };
    w.HTMLCanvasElement.prototype.toDataURL = () => 'data:image/png;base64,AAA';
    w.URL.createObjectURL = () => 'blob:stub';
    w.URL.revokeObjectURL = () => {};
  }
});
const { window } = dom;

let pass = 0, fail = 0;
const ok = (n, c, x) => { c ? (pass++, console.log('PASS ' + n)) : (fail++, console.log('FAIL ' + n + (x ? ' — ' + x : ''))); };

setTimeout(() => {
  const { DataStore, PlanMath, StatsEngine } = window;
  const catId = DataStore.getCategories()[0].id;
  const now = new Date();
  const thisMonth = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0');

  // ---- seed: one plan of each mode ----
  DataStore.clearAll();
  const f = JSON.parse(DataStore.exportJSON());
  f.monthlyIncome = {}; f.monthlyIncome[thisMonth] = 3000;
  f.savingsTarget = { type: 'fixed', fixedAmount: 300, percent: 0 };
  f.records = [];
  f.purchasePlans = [
    { id: 'A', name: '笔记本 <img src=x>', icon: '🐖', totalAmount: 3000, mode: 'save',
      startMonth: thisMonth, months: 6, categoryId: '', status: 'active', overrides: {},
      note: '', createdAt: '2026-08-01T00:00:00' },
    { id: 'B', name: '手机', icon: '🏦', totalAmount: 1200, mode: 'borrow',
      startMonth: thisMonth, months: 4, categoryId: '', status: 'active', overrides: {},
      note: '', createdAt: '2026-08-01T00:00:00' },
    { id: 'C', name: '相机', icon: '💳', totalAmount: 2400, mode: 'credit',
      startMonth: thisMonth, months: 12, categoryId: catId, status: 'active', overrides: {},
      note: '', createdAt: '2026-08-01T00:00:00' }
  ];
  DataStore.importJSON(JSON.stringify(f), 'replace');

  // ---- entry point must exist BEFORE any plan is created ----
  {
    const empty = JSON.parse(DataStore.exportJSON());
    empty.purchasePlans = [];
    DataStore.importJSON(JSON.stringify(empty), 'replace');
    const c0 = window.renderPlanOverviewCard(thisMonth);
    ok('entry card shows with zero plans', c0.length > 0);
    ok('entry card invites creation', c0.indexOf('点这里建一个') !== -1 || c0.indexOf('Tap to create') !== -1);
    window.renderOverview();
    const ov0 = window.document.getElementById('page-overview').innerHTML;
    ok('overview shows entry with zero plans', ov0.indexOf('大额计划') !== -1);
    DataStore.importJSON(JSON.stringify(f), 'replace');
  }

  // ---- credit-mode record generation ----
  const created = window.syncPlanRecords();
  ok('credit plan generated a record', created === 1, 'created=' + created);
  const rec = DataStore.getRecords().find(r => r.planId === 'C');
  ok('generated record amount = total/months', rec && Math.abs(rec.amount - 200) < 0.01, rec ? rec.amount : 'none');
  ok('generated record flagged excludeFromAvg', rec && rec.excludeFromAvg === true);
  ok('generated record carries planMonth', rec && rec.planMonth === thisMonth);

  // idempotency
  const again = window.syncPlanRecords();
  ok('sync is idempotent', again === 0, 'created=' + again);

  // ---- overview card ----
  const card = window.renderPlanOverviewCard(thisMonth);
  ok('overview card rendered', card.length > 0);
  ok('overview card escapes user HTML', card.indexOf('<img src=x>') === -1);

  // ---- plan center modal ----
  window.openPlanCenter();
  const modal = window.document.getElementById('modalContent').innerHTML;
  ok('plan center rendered', modal.indexOf('大额计划中心') !== -1);
  ok('center lists all three plans', modal.indexOf('手机') !== -1 && modal.indexOf('相机') !== -1);
  ok('center escapes user HTML', modal.indexOf('<img src=x>') === -1);

  // ---- per-period ledger: the repayment history must be reachable from the UI ----
  {
    window.openPlanCenter();
    const before = window.document.getElementById('modalContent').innerHTML;
    ok('ledger collapsed by default', before.indexOf('plan-ledger-row') === -1);
    const toggle = window.document.querySelector('[data-plan-action="toggle"]');
    ok('ledger toggle present', !!toggle);
    if (toggle) {
      toggle.onclick();
      const after = window.document.getElementById('modalContent').innerHTML;
      ok('ledger expands on toggle', after.indexOf('plan-ledger-row') !== -1);
      ok('ledger has due column', after.indexOf('应付') !== -1 || after.indexOf('Due') !== -1);
      ok('ledger has actual column', after.indexOf('实付') !== -1 || after.indexOf('Paid') !== -1);
      ok('current month row highlighted', after.indexOf('plan-ledger-current') !== -1);
      toggle.onclick && window.document.querySelector('[data-plan-action="toggle"]').onclick();
    }
  }

  // ---- this-month block spells out due vs paid ----
  {
    window.openPlanCenter();
    const h = window.document.getElementById('modalContent').innerHTML;
    ok('this-month block present', h.indexOf('plan-month-box') !== -1);
    ok('legend explains the rolling model', h.indexOf('plan-legend') !== -1);
  }

  // ---- editor ----
  window.openPlanEditor('B');
  const ed = window.document.getElementById('modalContent').innerHTML;
  ok('editor rendered', ed.indexOf('planAmount') !== -1);
  ok('editor preselects mode', ed.indexOf('data-plan-mode="borrow"') !== -1);

  // ---- forecast: projects month-end from the daily pace, not spend-to-date ----
  {
    const day = now.getDate();
    const dim = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    const g = JSON.parse(DataStore.exportJSON());
    g.monthlyIncome = {}; g.monthlyIncome[thisMonth] = 1000;
    g.savingsTarget = { type: 'fixed', fixedAmount: 100, percent: 0 };
    g.billAmounts = {}; g.billCategories = [];
    g.purchasePlans = [{ id:'F', name:'预测测试', icon:'🏦', totalAmount: 600, mode:'borrow',
      startMonth: thisMonth, months: 6, categoryId:'', status:'active', overrides:{}, note:'',
      createdAt: thisMonth + '-01T00:00:00' }];
    // Spend so the projected month-end total blows past income
    const spend = Math.round((1000 / dim) * day) + 200;
    g.records = [{ id:'fr', amount: spend, categoryId: catId, date: thisMonth + '-01T10:00',
      note:'', tags:[], createdAt: thisMonth + '-01T10:00:00' }];
    DataStore.importJSON(JSON.stringify(g), 'replace');

    const fcast = window.PlanMath.getForecast(thisMonth);
    ok('forecast has data', fcast.hasData === true);
    ok('forecast projects beyond spend-to-date', fcast.predictedSpend > spend,
      'predicted=' + fcast.predictedSpend + ' spent=' + spend);
    ok('forecast reports reliability flag', typeof fcast.reliable === 'boolean');
    ok('forecast exposes savings verdict', typeof fcast.targetMet === 'boolean');
    ok('forecast reports savings shortfall when short',
      fcast.targetMet || fcast.savingsShortfall > 0);

    // settled view is more optimistic than the forecast mid-month
    const settled = window.PlanMath.getState('F', thisMonth).byMonth[thisMonth];
    ok('forecast is not more optimistic than settled',
      fcast.plans['F'].predictedPay <= settled.actual + 0.01,
      'fc=' + fcast.plans['F'].predictedPay + ' settled=' + settled.actual);

    // the panel must render and, when unreliable, say so instead of a verdict
    window.openPlanCenter();
    const h = window.document.getElementById('modalContent').innerHTML;
    ok('forecast panel rendered', h.indexOf('plan-forecast-panel') !== -1);
    ok('forecast verdict rendered', h.indexOf('plan-verdict') !== -1);
    if (day >= 4) {
      ok('dual-layer bar rendered when reliable', h.indexOf('plan-bar-forecast') !== -1);
      ok('bar legend rendered', h.indexOf('plan-bar-key') !== -1);
    } else {
      ok('no forecast layer before day 4', h.indexOf('plan-bar-forecast') === -1);
      ok('too-early notice shown', h.indexOf('还不作数') !== -1 || h.indexOf('not meaningful') !== -1);
    }
    DataStore.importJSON(JSON.stringify(f), 'replace'); // restore the shared seed
  }

  // ---- icon picker ----
  {
    window.openPlanEditor(null);
    const doc = window.document;
    const input = doc.getElementById('planIcon');
    const grid = doc.getElementById('planEmojiGrid');
    ok('icon field present', !!input);
    ok('icon grid present', !!grid);
    ok('icon grid hidden by default', grid && grid.style.display === 'none');
    ok('icon grid reuses category presets', grid && grid.querySelectorAll('[data-emoji]').length > 80);

    doc.getElementById('planIconToggle').onclick();
    ok('icon grid opens', grid.style.display !== 'none');

    // pick a non-default emoji
    const target = Array.from(grid.querySelectorAll('[data-emoji]'))
      .find(b => b.getAttribute('data-emoji') === '💻');
    ok('preset 💻 available', !!target);
    target.onclick();
    ok('picking sets the field', input.value === '💻');
    ok('grid closes after pick', grid.style.display === 'none');

    // switching mode must NOT overwrite a custom icon
    doc.querySelector('[data-plan-mode="credit"]').onclick();
    ok('custom icon survives mode switch', input.value === '💻', 'got ' + input.value);

    // but an untouched default icon should still follow the mode
    input.value = '💳';
    doc.querySelector('[data-plan-mode="save"]').onclick();
    ok('default icon follows mode', input.value === '🐖', 'got ' + input.value);

    // save and confirm it persists
    input.value = '💻';
    doc.getElementById('planName').value = '新电脑';
    doc.getElementById('planAmount').value = '2400';
    doc.getElementById('planMonths').value = '8';
    window.setPlanStartMonth(thisMonth);   // year+month selects, not <input type="month">
    doc.querySelector('[data-plan-action="save"]').onclick(); // real button, real binding
    const saved = DataStore.getPurchasePlans().find(p => p.name === '新电脑');
    ok('custom icon persisted', saved && saved.icon === '💻', saved ? saved.icon : 'not saved');

    // and shows up on the card
    window.openPlanCenter();
    ok('custom icon rendered on card',
      window.document.getElementById('modalContent').innerHTML.indexOf('💻') !== -1);
    DataStore.deletePurchasePlan(saved.id);
  }

  // ---- i18n completeness across every plan surface ----
  const surfaces = [card, modal, ed];
  window.openPlanCenter();
  surfaces.push(window.document.getElementById('modalContent').innerHTML);
  const missing = [];
  surfaces.forEach(s => { const m = s.match(/\?\?[\w.]+\?\?/g); if (m) missing.push(...m); });
  ok('no missing i18n keys', missing.length === 0, missing.join(', '));

  // ---- overview page renders end to end with plans present ----
  let renderErr = null;
  try { window.renderOverview(); } catch (e) { renderErr = e.message; }
  ok('overview renders with plans', renderErr === null, renderErr);
  const ov = window.document.getElementById('page-overview').innerHTML;
  ok('overview shows plan entry card', ov.indexOf('大额计划') !== -1);

  // ---- report + what-if render ----
  let rErr = null; try { window.renderReport(); } catch (e) { rErr = e.message; }
  ok('report renders with plans', rErr === null, rErr);
  let wErr = null; try { window.renderWhatIf(); } catch (e) { wErr = e.message; }
  ok('what-if renders with plans', wErr === null, wErr);
  let sErr = null; try { window.renderStats(); } catch (e) { sErr = e.message; }
  ok('stats renders with plans', sErr === null, sErr);

  // ---- deleting a plan cascades its records ----
  const before = DataStore.getRecords().length;
  DataStore.deletePurchasePlan('C');
  ok('delete cascades credit records', DataStore.getRecords().length === before - 1);

  // ---- repairData tolerates plans ----
  let repErr = null; try { window.repairData(); } catch (e) { repErr = e.message; }
  ok('repairData runs with plans', repErr === null, repErr);

  console.log('\n===== SMOKE: ' + pass + ' PASS / ' + fail + ' FAIL =====');
  process.exit(fail > 0 ? 1 : 0);
}, 1500);
