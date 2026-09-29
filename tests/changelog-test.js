/* ============================================================
   版本公告 —— 行为与不变量
   ------------------------------------------------------------
   覆盖 docs/superpowers/specs/ 里的公告设计：
     L1  cmpVersion 数值比较（不是字符串比较）
     L2  首次打开（无已读标记）→ 全部公告都弹
     L3  已读标记指向最新一条 → 不弹
     L4  标记在中间 → pending 正确 + 「错过多次」提示条 + 默认停在最新
     L5  next()/prev() 切换，两端置灰
     L6  只有一条时箭头仍然存在但禁用
     L7  遮罩已开时不抢占，关掉后才出现（重演 107d6e8 那个吞弹窗的 bug）
     L8  设置页手动打开不写已读标记
     L9  注册表不变量：id 唯一 / date 严格降序 / 无空 items / 无超前版本号
     L10 加载期 APP_VERSION 与 Changelog 均可用（验证 29 在 01 之后拼接）

   用法: bash build.sh && node tests/changelog-test.js
   ============================================================ */
const fs = require('fs'), path = require('path');
const { JSDOM } = require('jsdom');
const BASE = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');

const LS_KEY = 'budgetAppLastSeenChangelog';
const A1 = '2026-10-05';   // newest shipped entry
const A2 = '2026-09-30';   // older shipped entry
const X1 = '2099-01-01';   // test-only entry, injected via Changelog.register

let pass = 0, fail = 0;
function ok(cond, label) {
  if (cond) { pass++; console.log('  ok   ' + label); }
  else { fail++; console.log('  FAIL ' + label); }
}
function eq(a, b, label) { ok(a === b, label + '  (got ' + JSON.stringify(a) + ', want ' + JSON.stringify(b) + ')'); }

function canvasStub() {
  const n = () => {};
  return { setTransform:n, scale:n, translate:n, rotate:n, clearRect:n, fillRect:n, strokeRect:n,
    beginPath:n, closePath:n, moveTo:n, lineTo:n, arc:n, arcTo:n, bezierCurveTo:n, quadraticCurveTo:n,
    fill:n, stroke:n, clip:n, fillText:n, strokeText:n, measureText:() => ({ width: 10 }),
    save:n, restore:n, createLinearGradient:()=>({addColorStop:n}), createRadialGradient:()=>({addColorStop:n}),
    createPattern:()=>({}), drawImage:n, getImageData:()=>({data:new Uint8ClampedArray(4)}),
    putImageData:n, roundRect:n, resetTransform:n, lineWidth:1, fillStyle:'#000', strokeStyle:'#000',
    globalAlpha:1, font:'10px sans-serif', textAlign:'left', textBaseline:'alphabetic',
    lineCap:'butt', lineJoin:'miter', shadowBlur:0, shadowColor:'transparent' };
}

/* A body-end script runs after 29-changelog.js (which build.sh injects into
   <head>) but before DOMContentLoaded, so _bootstrap()'s checkAndShow() sees
   whatever it registered. That lets a scenario boot with three entries.
   The injected entry deliberately has NO `title`, which exercises the
   id-as-title fallback. */
function withExtraEntry(html) {
  const script = '<script>if (localStorage.getItem("__clExtra") === "1" && window.Changelog) {' +
    '  Changelog.register({ id: "' + X1 + '", version: window.APP_VERSION, date: "' + X1 + '",' +
    '    items: [{ icon: "🧪", text: "changelog.a1.item1" }] });' +
    '}</script>';
  return html.replace('</body>', script + '</body>');
}

/** Boot a fresh App instance. seed = { localStorageKey: value } */
function boot(seed, useExtra) {
  const html = useExtra ? withExtraEntry(BASE) : BASE;
  const dom = new JSDOM(html, {
    runScripts: 'dangerously', pretendToBeVisual: true, url: 'http://localhost/',
    beforeParse(w) {
      const s = canvasStub();
      w.HTMLCanvasElement.prototype.getContext = function () { this._stub = s; s.canvas = this; return s; };
      w.CanvasRenderingContext2D = function () {};
      w.CanvasRenderingContext2D.prototype.roundRect = function () { return this; };
      w.HTMLCanvasElement.prototype.toDataURL = () => 'data:image/png;base64,AAA';
      w.URL.createObjectURL = () => 'blob:stub';
      w.URL.revokeObjectURL = () => {};
      const q = () => {};
      w.console = { log:q, warn:q, error:q, info:q, debug:q };
      Object.defineProperty(w, 'crypto', { value: require('crypto').webcrypto, configurable: true });
      if (seed) for (const k in seed) w.localStorage.setItem(k, seed[k]);
    }
  });
  return dom;
}

// Poll rather than a fixed sleep — a busy machine would otherwise flake.
function waitFor(win, pred, label, ms) {
  const limit = ms || 4000;
  const t0 = Date.now();
  return new Promise((resolve, reject) => {
    (function tick() {
      let v = false;
      try { v = pred(win); } catch (e) { v = false; }
      if (v) return resolve(true);
      if (Date.now() - t0 > limit) return reject(new Error('timeout waiting for ' + label));
      setTimeout(tick, 25);
    })();
  });
}
const sleep = ms => new Promise(r => setTimeout(r, ms));

const MC = w => w.document.getElementById('modalContent');
const overlayOpen = w => w.document.getElementById('modalOverlay').classList.contains('open');
const arrows = w => Array.from(MC(w).querySelectorAll('.cl-arrow'));
const txt = (w, sel) => { const e = MC(w).querySelector(sel); return e ? e.textContent : null; };
// Exact match, not indexOf. indexOf('📣') passes for '??📣??', which is exactly
// how a blanket __() over every string field shipped broken once — see L12.
const noStray = w => MC(w).textContent.indexOf('??') === -1;

(async function main() {
  /* ---------------- L1 + L9 + L10: pure logic, one instance ---------------- */
  console.log('\nL1/L9/L10  version compare + registry invariants + load order');
  {
    const dom = boot({ [LS_KEY]: A1 });
    const w = dom.window, C = w.Changelog;

    ok(typeof w.APP_VERSION === 'string' && w.APP_VERSION === '3.3.0', 'L10 APP_VERSION present and is 3.3.0');
    ok(typeof C === 'object' && C !== null, 'L10 Changelog API present (29 loaded after 01)');
    ok(typeof w.ModalQueue === 'object', 'L10 ModalQueue present');

    eq(C.cmpVersion('3.10.0', '3.9.0'), 1, 'L1 3.10.0 > 3.9.0 (numeric, not lexical)');
    eq(C.cmpVersion('3.9.0', '3.10.0'), -1, 'L1 3.9.0 < 3.10.0');
    eq(C.cmpVersion('3.4', '3.4.0'), 0, 'L1 3.4 == 3.4.0');
    eq(C.cmpVersion('3.4.1', '3.4'), 1, 'L1 3.4.1 > 3.4');
    eq(C.cmpVersion('3.3.0', '3.3.0'), 0, 'L1 equal versions compare 0');
    eq(C.cmpVersion('bogus', '0'), 0, 'L1 unparseable segment counts as 0');

    const all = C.all();
    const ids = all.map(e => e.id);
    eq(new Set(ids).size, ids.length, 'L9 ids are unique');
    let desc = true, empties = 0, ahead = [];
    for (let i = 0; i < all.length; i++) {
      if (i > 0 && !(all[i - 1].date > all[i].date)) desc = false;
      if (!Array.isArray(all[i].items) || all[i].items.length === 0) empties++;
      if (C.cmpVersion(all[i].version, w.APP_VERSION) > 0) ahead.push(all[i].version);
    }
    ok(desc, 'L9 dates are strictly descending');
    eq(empties, 0, 'L9 no entry has an empty items list');
    eq(ahead.join(','), '', 'L9 no entry announces a version newer than APP_VERSION');
    ok(typeof w.document.title === 'string' && w.document.title.indexOf('v' + w.APP_VERSION) > 0,
       'L10 document.title carries the version (the bug data-i18n used to swallow)');
  }

  /* ---------------- L3: already seen the newest -> silent ---------------- */
  console.log('\nL3  read marker at the newest entry -> no popup');
  {
    const dom = boot({ [LS_KEY]: A1 });
    const w = dom.window;
    await sleep(400);
    eq(w.Changelog.pending().length, 0, 'L3 pending() is empty');
    ok(!overlayOpen(w), 'L3 no modal opened on startup');
    ok(MC(w).innerHTML.indexOf('cl-title') === -1, 'L3 no changelog markup rendered');
  }

  /* ---------------- pending() as a pure read of the marker ---------------- */
  console.log('\nL3b  pending() is a pure read of the read marker');
  {
    const dom = boot({ [LS_KEY]: A1 });
    const w = dom.window, C = w.Changelog;
    await sleep(300);
    eq(C.pending().length, 0, 'L3b marker at the newest entry -> nothing pending');
    C.markSeen(A2);
    eq(C.pending().length, 1, 'L3b marker at the older entry -> the newer one is pending');
    eq(C.pending()[0].id, A1, 'L3b the pending entry is the newer one');
    C.markSeen('no-such-id');
    eq(C.pending().length, 2, 'L3b an unknown marker -> everything shows');
    C.markSeen(A1);
    eq(C.pending().length, 0, 'L3b back to the newest -> nothing pending');
  }

  /* ---------------- L2: fresh install -> everything shows ---------------- */
  console.log('\nL2  no read marker (fresh install) -> all entries shown');
  {
    const dom = boot(null);
    const w = dom.window;
    await waitFor(w, x => MC(x).innerHTML.indexOf('cl-title') !== -1, 'changelog on startup');
    ok(overlayOpen(w), 'L2 modal opened on startup');
    ok(MC(w).querySelectorAll('.cl-item').length >= 3, 'L2 the newest entry rendered its items');
    ok(MC(w).querySelector('.cl-banner') !== null, 'L2 both entries pending -> banner shown');
    ok(/1\s*\/\s*2/.test(MC(w).querySelector('.cl-counter').textContent), 'L2 counter reads 1 / 2');
    eq(w.Changelog.lastSeenId(), A1, 'L2 the newest entry is marked seen as soon as it is shown');
  }

  /* ---------------- L4 + L5: two pending, banner, navigation ---------------- */
  console.log('\nL4/L5  marker in the middle -> banner + navigation');
  {
    // marker at the OLDEST shipped entry, plus one injected newer entry
    // => two pending, so the "you missed some" banner and both arrows matter.
    const dom = boot({ [LS_KEY]: A2, __clExtra: '1' }, true);
    const w = dom.window;
    await waitFor(w, x => MC(x).innerHTML.indexOf('cl-title') !== -1, 'changelog on startup');

    ok(MC(w).querySelector('.cl-banner') !== null, 'L4 "you missed some" banner is shown');
    ok(/1\s*\/\s*2/.test(MC(w).querySelector('.cl-counter').textContent), 'L4 counter reads 1 / 2');
    ok(MC(w).innerHTML.indexOf('🧪') !== -1, 'L4 defaults to the newest entry');

    const atStart = () => arrows(w)[0].disabled && !arrows(w)[1].disabled;
    const atEnd = () => !arrows(w)[0].disabled && arrows(w)[1].disabled;
    ok(atStart(), 'L5 starts at the newest: prev disabled, next enabled');

    ok(w.Changelog.next(), 'L5 next() steps forward');
    ok(MC(w).innerHTML.indexOf('🧪') === -1, 'L5 the older entry is now shown');
    ok(atEnd(), 'L5 at the oldest: next disabled, prev enabled');
    ok(w.Changelog.next() === false, 'L5 next() at the end returns false');
    ok(MC(w).innerHTML.indexOf('🧪') === -1, 'L5 a refused next() left the view alone');

    ok(w.Changelog.prev(), 'L5 prev() steps back');
    ok(MC(w).innerHTML.indexOf('🧪') !== -1, 'L5 back on the newest entry');
    ok(atStart(), 'L5 arrows reset to the start state');
    ok(w.Changelog.prev() === false, 'L5 prev() at the start returns false');
  }

  /* ---------------- L6: a single pending entry still shows both arrows ---------------- */
  console.log('\nL6  exactly one pending entry -> arrows present but disabled');
  {
    const dom = boot({ [LS_KEY]: A2 });
    const w = dom.window;
    await waitFor(w, x => MC(x).innerHTML.indexOf('cl-title') !== -1, 'changelog on startup');
    const a = arrows(w);
    eq(a.length, 2, 'L6 both arrows are rendered even with a single entry');
    ok(a[0].disabled && a[1].disabled, 'L6 both arrows are disabled with a single entry');
    ok(MC(w).querySelector('.cl-banner') === null, 'L6 no banner with a single entry');
    ok(MC(w).querySelector('.cl-counter') === null, 'L6 no 1/1 counter with a single entry');
    ok(w.Changelog.next() === false && w.Changelog.prev() === false, 'L6 both navigation calls refuse to move');
  }

  /* ---------------- L7: never preempt a modal the user is looking at ---------------- */
  console.log('\nL7  an open modal is not clobbered (regression for 107d6e8)');
  {
    const dom = boot({ [LS_KEY]: A1 });          // boot silently
    const w = dom.window;
    await sleep(300);
    w.closeModal();
    w.showModal('<div id="sentinel">pre-existing modal</div>', true);
    ok(MC(w).innerHTML.indexOf('sentinel') !== -1, 'L7 the sentinel modal is on screen');

    w.Changelog.open();                          // goes through the same ModalQueue path
    await sleep(300);
    ok(MC(w).innerHTML.indexOf('sentinel') !== -1, 'L7 the changelog did NOT replace the open modal');
    ok(w.ModalQueue.depth() === 1, 'L7 the changelog is queued instead');

    w.closeModal();
    await waitFor(w, x => MC(x).innerHTML.indexOf('cl-title') !== -1, 'changelog after close');
    ok(MC(w).innerHTML.indexOf('sentinel') === -1, 'L7 the changelog appeared once the modal closed');
    eq(w.ModalQueue.depth(), 0, 'L7 the queue drained');
  }

  /* ---------------- L8: manual browse marks nothing ---------------- */
  console.log('\nL8  manual open from Settings does not mark anything read');
  {
    const dom = boot({ [LS_KEY]: A1 });
    const w = dom.window;
    await sleep(300);
    w.closeModal();
    w.Changelog.open();
    await waitFor(w, x => MC(x).innerHTML.indexOf('cl-title') !== -1, 'manual changelog');
    eq(w.Changelog.lastSeenId(), A1, 'L8 the read marker is unchanged by browsing');
    eq(w.Changelog.pending().length, 0, 'L8 pending() still reports nothing after a manual browse');
    ok(arrows(w).length === 2, 'L8 all entries are browsable, not just the pending ones');
  }

  /* ---------------- L11: the month-rollover reminder must not eat it ----------------
     This one bit for real: checkMonthRollover() schedules its dialog 500ms
     after startup, which is exactly when the announcement is on screen. It used
     to call showModal() directly, which replaced the announcement — and since
     the announcement marks itself read at display time, it was never shown
     again. 21-month-rollover.js now goes through ModalQueue too. */
  console.log('\nL11  the month-rollover reminder does not swallow the announcement');
  {
    const ledger = JSON.stringify({
      records: [], categories: [], budgets: {}, categoryBudgets: {},
      savingsTarget: { type: 'fixed', fixedAmount: 0, percent: 0 }, colorIndex: 0,
      billCategories: [{ id: 'b1', name: 'mortgage', icon: 'H', color: '#000', sortOrder: 0 }],
      billAmounts: { '2020-01': { b1: 1000 } }, monthlyIncome: {},
      percentBase: 'net', lastActiveMonth: '2020-01', whatIfParams: null
    });
    // lastActiveMonth is a year old, so checkMonthRollover() copies the bills
    // forward and schedules the reminder at +500ms.
    const dom = boot({ budgetAppData: ledger, [LS_KEY]: A2 });
    const w = dom.window;
    await waitFor(w, x => MC(x).innerHTML.indexOf('cl-title') !== -1, 'announcement on startup');
    await sleep(900);   // past the 500ms reminder
    ok(MC(w).innerHTML.indexOf('cl-title') !== -1, 'L11 the announcement is still on screen at +900ms');
    ok(w.ModalQueue.depth() === 1, 'L11 the rollover reminder is queued behind it');
    w.closeModal();
    await waitFor(w, x => w.ModalQueue.depth() === 0, 'rollover dialog shown');
    ok(MC(w).innerHTML.indexOf('cl-title') === -1, 'L11 the rollover reminder took the slot');
  }

  /* ---------------- L12: literal fields must not go through i18n ----------------
     __() renders a missing key as '??<key>??'. An earlier version resolved every
     string in an entry as if it were a key, so `icon: '📣'` rendered as
     '??📣??' and the meta line as 'v??3.3.0?? · ??2026-10-05??' while the body
     text (real keys) looked fine — and indexOf-based assertions still passed. */
  console.log('\nL12  icon / version / date are literal, not i18n keys');
  {
    const dom = boot({ [LS_KEY]: A2 });   // marker on the older entry -> one is pending
    const w = dom.window;
    await waitFor(w, x => MC(x).innerHTML.indexOf('cl-title') !== -1, 'changelog on startup');
    const entry = w.Changelog.all()[0];
    ok(noStray(w), 'L12 no "??" anywhere in the rendered modal');
    eq(txt(w, '.cl-item-icon'), entry.items[0].icon, 'L12 the icon span is exactly the emoji');
    eq(txt(w, '.cl-meta'), 'v' + entry.version + ' · ' + entry.date, 'L12 the meta line is exactly "v<ver> · <date>"');
    eq(txt(w, '.cl-title'), w.__('changelog.a1.title'), 'L12 the title is the resolved i18n string');
    // body text may legitimately contain HTML (<strong>/<code>) — check it rendered
    ok(MC(w).querySelector('.cl-item-text strong') !== null, 'L12 item text still allows inline markup');

    // A title-less entry falls back to its id — verbatim, not via __().
    const dom2 = boot({ [LS_KEY]: A2, __clExtra: '1' }, true);
    const w2 = dom2.window;
    await waitFor(w2, x => MC(x).innerHTML.indexOf('cl-title') !== -1, 'changelog on startup');
    eq(txt(w2, '.cl-title'), X1, 'L12 a title-less entry falls back to its raw id');
    eq(txt(w2, '.cl-item-icon'), '\u{1F9EA}', 'L12 the injected emoji is untouched');
    ok(noStray(w2), 'L12 no "??" in the title-less entry either');
  }

  console.log('\n' + (fail === 0 ? 'ALL PASS' : 'FAILURES: ' + fail) + '  (' + pass + ' assertions)');
  process.exit(fail === 0 ? 0 : 1);
})().catch(e => { console.error('\nERROR:', e && e.message ? e.message : e); process.exit(1); });
