/* ============================================================
   第二批修复的回归网：日期与时区、月初结转、近 30 天模式
   ------------------------------------------------------------
   来源：audit-report/AUDIT-REPORT.md 的 C-01、H-01 到 H-07。

   这些缺陷共同的根子：把 UTC 日期当成本地日期用（toISOString().slice(0,10)），
   或者把 'YYYY-MM-DD' 交给 new Date()（按 UTC 零点解析）。在马来西亚（UTC+8）
   每天 00:00–08:00 会错一天；在美洲（UTC-5）则是晚上错一天。所有旧测试都跑在
   一个固定时区里，所以一直没发现。

   所以本文件会自己再启动三次子进程，分别在
     · 本机时区（你的机器是 UTC+8，所以这里等于马来西亚）
     · TZ=UTC
     · TZ=EST5EDT（UTC-4/-5，带夏令时）
   下各跑一遍；每个时区里又各用"凌晨 02:30"和"晚上 22:30"两个假时钟各跑一遍，
   因为两个方向的错位出现在不同的钟点。

   跑法： bash build.sh && node tests/batch2-dates-test.js
   ============================================================ */
const fs = require('fs'), path = require('path');

/* ------------------------- 父进程：换时区重跑自己 ------------------------- */
if (process.env.BATCH2_CHILD !== '1') {
  const { spawnSync } = require('child_process');
  const zones = [
    { name: '本机时区', env: {} },
    { name: 'TZ=UTC', env: { TZ: 'UTC' } },
    { name: 'TZ=EST5EDT', env: { TZ: 'EST5EDT' } }
  ];
  let pass = 0, fail = 0, crashed = 0;
  zones.forEach(z => {
    const r = spawnSync(process.execPath, [__filename], {
      env: Object.assign({}, process.env, { BATCH2_CHILD: '1' }, z.env), encoding: 'utf8', timeout: 240000
    });
    const out = (r.stdout || '') + (r.stderr || '');
    console.log('\n################ ' + z.name + ' ################');
    console.log(out.replace(/\n===== 结果:.*=====\s*$/, '').trimEnd());
    const m = /===== 结果: (\d+) 通过 \/ (\d+) 失败 =====/.exec(out);
    if (m) { pass += +m[1]; fail += +m[2]; } else { crashed++; console.log('  ❌ 这个时区下测试没有跑完（崩溃或超时）'); }
  });
  console.log('\n===== 结果: ' + pass + ' 通过 / ' + (fail + crashed) + ' 失败 =====');
  process.exit(fail || crashed ? 1 : 0);
}

/* ------------------------- 子进程：真正的测试 ------------------------- */
const { JSDOM } = require('jsdom');
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');

function stub() {
  const n = () => {};
  return { canvas: null, setTransform: n, scale: n, translate: n, rotate: n, clearRect: n, fillRect: n, strokeRect: n,
    beginPath: n, closePath: n, moveTo: n, lineTo: n, arc: n, arcTo: n, bezierCurveTo: n, quadraticCurveTo: n, fill: n,
    stroke: n, clip: n, fillText: n, strokeText: n, measureText: () => ({ width: 10 }), save: n, restore: n,
    createLinearGradient: () => ({ addColorStop: n }), createRadialGradient: () => ({ addColorStop: n }),
    createPattern: () => ({}), drawImage: n, getImageData: () => ({ data: new Uint8ClampedArray(4) }),
    putImageData: n, roundRect: n, resetTransform: n, setLineDash: n, rect: n, lineWidth: 1, fillStyle: '#000',
    strokeStyle: '#000', globalAlpha: 1, font: '10px sans-serif', textAlign: 'left', textBaseline: 'alphabetic',
    lineCap: 'butt', lineJoin: 'miter', shadowBlur: 0, shadowColor: 'transparent' };
}

const RealDate = Date;
let FIXED = new RealDate(2026, 9, 28, 2, 30).getTime();
const setClock = (y, mo, d, h, mi) => { FIXED = new RealDate(y, mo, d, h || 0, mi || 0).getTime(); };

const dom = new JSDOM(html, {
  runScripts: 'dangerously', pretendToBeVisual: true, url: 'http://localhost/',
  beforeParse(w) {
    const Real = w.Date;
    w.Date = class extends Real {
      constructor(...a) { if (a.length === 0) super(FIXED); else super(...a); }
      static now() { return FIXED; }
    };
    const s = stub();
    w.HTMLCanvasElement.prototype.getContext = function () { s.canvas = this; return s; };
    w.HTMLCanvasElement.prototype.toDataURL = () => 'data:image/png;base64,AAA';
    w.CanvasRenderingContext2D = function () {};
    w.CanvasRenderingContext2D.prototype.roundRect = function () { return this; };
    w.URL.createObjectURL = () => 'blob:stub'; w.URL.revokeObjectURL = () => {};
    w.confirm = () => false;
    const q = () => {}; w.console = { log: q, warn: q, error: q, info: q, debug: q };
  }
});
const w = dom.window, LS = w.localStorage, doc = w.document;
const errors = [];
w.addEventListener('error', e => errors.push(String(e.message)));

let pass = 0, fail = 0;
const ok = (name, cond, extra) => {
  if (cond) { pass++; console.log('  ✅ ' + name); }
  else { fail++; console.log('  ❌ ' + name + (extra !== undefined ? '  <- ' + (typeof extra === 'string' ? extra : JSON.stringify(extra)) : '')); }
};
const section = t => console.log('\n' + t);
const pad = n => String(n).padStart(2, '0');
// 测试自己用本地年月日拼日期（和被测代码互不相干）
const ymd = d => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
const text = id => (doc.getElementById(id) ? doc.getElementById(id).textContent.replace(/\s+/g, ' ') : '');

setTimeout(() => {
  const DS = w.DataStore, SE = w.StatsEngine;
  try { w.Changelog.markSeen(w.Changelog.all()[0].id); w.closeModal(); } catch (e) {}
  const offsetNow = new RealDate(2026, 9, 28, 12, 0).getTimezoneOffset();
  console.log('  （这个子进程的时区偏移：UTC' + (offsetNow === 0 ? '±0' : (offsetNow < 0 ? '+' : '-') + Math.abs(offsetNow / 60)) + '）');

  const EXP = 'cat-child-1-1';
  const rec = (id, amount, date, extra) => Object.assign({ id, amount, categoryId: EXP, date, note: '', tags: [], createdAt: date + ':00.000Z' }, extra || {});
  const seed = recs => { DS._data.records = recs; DS.save(); };
  const fresh = () => {
    DS.clearAll(); LS.removeItem('budgetStatsRange'); LS.removeItem('budgetAppDataCorrupt');
    try { w.clearRecordsFilter(); } catch (e) {}
    w.closeModal();
  };
  // navigateTo() does nothing when you are already on that tab and it has content, so a
  // page rendered under an earlier fake clock would be reused. Hop away first.
  const go = tab => {
    if (w.currentTab === tab && tab !== 'add') w.navigateTo(tab === 'categories' ? 'settings' : 'categories');
    w.navigateTo(tab);
  };
  const render = (label, fn) => { try { fn(); return true; } catch (e) { ok(label + '：能正常打开', false, String(e.message).slice(0, 90)); return false; } };

  /* ================= 每个钟点各跑一遍：日期键 ================= */
  [{ h: 2, mi: 30, before: '01:15' }, { h: 22, mi: 30, before: '21:15' }].forEach(T => {
    const clockName = '本地时间 ' + pad(T.h) + ':' + pad(T.mi);
    setClock(2026, 9, 28, T.h, T.mi);
    const today = new RealDate(FIXED), yest = new RealDate(FIXED); yest.setDate(yest.getDate() - 1);
    const todayStr = ymd(today), yestStr = ymd(yest);

    section('【H-01】' + clockName + '：今日 / 昨日 / 近 7 天 / 近 30 天 按"本地日期"算');
    fresh();
    seed([rec('t1', 12, todayStr + 'T' + T.before), rec('y1', 7, yestStr + 'T15:00')]);
    const l7 = SE.getLast7Days();
    ok('近 7 天：最后一项是今天（' + todayStr + '）且金额 12', l7[6].date === todayStr && l7[6].total === 12, l7[6]);
    ok('近 7 天：倒数第二项是昨天（' + yestStr + '）且金额 7', l7[5].date === yestStr && l7[5].total === 7, l7[5]);
    ok('近 7 天：七天的日期各不相同', new Set(l7.map(d => d.date)).size === 7, l7.map(d => d.date));
    if (render('总览页', () => go('overview'))) {
      const ov = text('page-overview');
      ok('总览"今日消费"写的是本地今天（' + todayStr + '）', ov.indexOf('今日消费 (' + todayStr + ')') !== -1, (/今日消费 \([^)]*\)/.exec(ov) || [])[0]);
      ok('总览"昨日消费"写的是本地昨天（' + yestStr + '）', ov.indexOf('昨日消费 (' + yestStr + ')') !== -1, (/昨日消费 \([^)]*\)/.exec(ov) || [])[0]);
      const t = ov.slice(ov.indexOf('今日消费 (') , ov.indexOf('今日消费 (') + 90);
      ok('总览"今日消费"的金额是今天那一笔 12', /RM\s?12\.00/.test(t), t);
    }
    LS.setItem('budgetStatsRange', 'rolling30');
    const per = SE.getPeriodDailyTotals();
    const todayRow = per.find(d => d.day === todayStr), yestRow = per.find(d => d.day === yestStr);
    ok('近 30 天日合计：今天（' + todayStr + '）= 12', todayRow && todayRow.total === 12, per);
    ok('近 30 天日合计：昨天（' + yestStr + '）= 7', yestRow && yestRow.total === 7, per);
    const label = w.getPeriodDateRange().label;
    ok('近 30 天标签的结束日是今天（' + todayStr.slice(5) + '）', label.indexOf('→ ' + todayStr.slice(5)) !== -1, label);
    fresh();

    section('【H-02】' + clockName + '：日期框被清空再保存，记到"现在"这一刻（本地时间）');
    if (render('记账页', () => go('add'))) {
      const nowLocal = ymd(today) + 'T' + pad(T.h) + ':' + pad(T.mi);
      doc.getElementById('addAmount').value = '12.00';
      w.selectCategory(EXP, 'add');
      doc.getElementById('addDateTime').value = '';
      try { w.submitRecord({ preventDefault() {} }); } catch (e) { ok('提交记账', false, e.message); }
      const saved = DS.getRecords()[0];
      ok('保存下来的记录日期是本地现在（' + nowLocal + '）', saved && saved.date === nowLocal, saved && saved.date);
    }
    fresh();
  });

  /* ================= C-01 自定义日期范围 ================= */
  section('【C-01】自定义日期范围：起止两天都要算满整天');
  setClock(2026, 9, 30, 12, 0);
  fresh();
  seed([
    rec('c0', 10, '2026-09-30T23:59'),      // 起始日前一天 → 不算
    rec('c1', 10, '2026-10-01T00:30'),
    rec('c2', 10, '2026-10-15T12:00'),
    rec('c3', 10, '2026-10-28T07:59'),
    rec('c4', 10, '2026-10-28T08:01'),
    rec('c5', 10, '2026-10-28T20:00'),
    rec('c6', 10, '2026-10-28T23:59'),
    rec('c7', 10, '2026-10-29T00:01')       // 结束日后一天 → 不算
  ]);
  const cr = SE.getCustomRangeTotals('2026-10-01', '2026-10-28');
  ok('2026-10-01 到 2026-10-28：6 笔，共 60', cr.count === 6 && cr.total === 60, { count: cr.count, total: cr.total });
  ok('只选一天（10-28）：4 笔，共 40', (function () { const r = SE.getCustomRangeTotals('2026-10-28', '2026-10-28'); return r.count === 4 && r.total === 40; })());
  ok('每日明细按本地日期归到 10-28 那一天（4 笔 = 40）', (cr.daily.find(d => d.day === '2026-10-28') || {}).total === 40, cr.daily);
  // 分摊：最后一天晚上的一笔分摊，别人已经还了 60
  DS._data.records.push(rec('sp1', 100, '2026-10-28T20:00', { splitBillId: 'sb1' }));
  DS._data.splitBills = [{ id: 'sb1', amount: 100, date: '2026-10-28T20:00', note: '', tag: '', categoryId: EXP, payer: 'self', selfShare: 40, mode: 'equal',
    createdAt: '2026-10-28T20:00:00.000Z', archived: false, participants: [{ contactId: 'p1', name: 'A', share: 60, paid: true, paidAmount: 60, unknown: false }] }];
  DS.save();
  ok('分摊回款：最后一天晚上那笔的已收回 60 要算进来', SE.getCustomSplitContrib('2026-10-28', '2026-10-28') === 60, SE.getCustomSplitContrib('2026-10-28', '2026-10-28'));
  const cr2 = SE.getCustomRangeTotals('2026-10-01', '2026-10-28');
  ok('自定义范围总额 = 60 + 100 - 60 = 100（扣掉别人已还的）', cr2.total === 100, cr2.total);
  if (typeof w.getHierarchyRecords === 'function') {
    ok('统计页的"层级明细"同样按整天算（7 笔）', w.getHierarchyRecords('', '2026-10-01', '2026-10-28').length === 7, w.getHierarchyRecords('', '2026-10-01', '2026-10-28').length);
  }
  fresh();

  /* ================= H-03 月初结转 + 无收入不下"超支"结论 ================= */
  section('【H-03】每月 1 号：只设了月收入、没设账单，收入也要沿用');
  setClock(2026, 10, 1, 10, 0);
  fresh();
  DS.setMonthlyIncome('2026-10', 3000); DS.setLastActiveMonth('2026-10');
  w.checkMonthRollover();
  ok('没设账单：11 月收入沿用上月的 3000', DS.getMonthlyIncome('2026-11') === 3000, DS.getMonthlyIncome('2026-11'));
  fresh();
  DS.setMonthlyIncome('2026-10', 3000); DS.setBillAmount('2026-10', 'b1', 500); DS.setLastActiveMonth('2026-10');
  w.checkMonthRollover();
  ok('设了账单：收入和账单都沿用（老行为不变）', DS.getMonthlyIncome('2026-11') === 3000 && DS.getBillAmounts('2026-11').b1 === 500);
  fresh();
  DS.setMonthlyIncome('2026-10', 3000); DS.setMonthlyIncome('2026-11', 2500); DS.setLastActiveMonth('2026-10');
  w.checkMonthRollover();
  ok('本月已经设过收入（2500）：不覆盖', DS.getMonthlyIncome('2026-11') === 2500, DS.getMonthlyIncome('2026-11'));
  fresh();
  DS.setLastActiveMonth('2026-10');
  w.checkMonthRollover();
  ok('上月本来就没收入：本月也不凭空多出收入', DS.getMonthlyIncome('2026-11') === 0);

  section('【H-03】没设月收入时，总览不能用红字说"预计超支"');
  setClock(2026, 9, 28, 12, 0);
  fresh();
  seed([rec('n1', 30, '2026-10-02T12:00')]);
  if (render('总览页', () => go('overview'))) {
    const ov = text('page-overview');
    ok('页面上没有"预计超支"', ov.indexOf('预计超支') === -1, (/预计超支[^。]{0,20}/.exec(ov) || [])[0]);
    ok('改为提示先设置本月收入', ov.indexOf('先设置本月收入') !== -1);
  }
  fresh();

  /* ================= H-04 统计页剩余天数 ================= */
  section('【H-04】统计页"剩余 N 天"只在看当前月时出现');
  setClock(2026, 9, 28, 12, 0);
  fresh();
  DS.setMonthlyIncome('2026-10', 5000); DS.setMonthlyIncome('2026-09', 5000);
  seed([rec('s1', 100, '2026-10-05T12:00'), rec('s2', 100, '2026-09-05T12:00')]);
  if (render('统计页', () => { go('stats'); w.changeStatsMonth('2026-10'); })) {
    ok('看当前月：显示"剩余 3 天"（10 月还剩 31-28 天）', text('page-stats').indexOf('剩余 3 天') !== -1, (/剩余 \d+ 天/.exec(text('page-stats')) || [])[0]);
  }
  if (render('统计页（上个月）', () => w.changeStatsMonth('2026-09'))) {
    ok('看上个月：不再显示"剩余 N 天"', !/剩余 \d+ 天/.test(text('page-stats')), (/剩余 \d+ 天/.exec(text('page-stats')) || [])[0]);
  }
  fresh();

  /* ================= H-05 报告页 ================= */
  section('【H-05】近 30 天模式下打开报告页，再切回按月：月份和数字都要对');
  setClock(2026, 9, 28, 12, 0);
  fresh();
  DS.setMonthlyIncome('2026-10', 5000);
  seed([rec('r1', 100, '2026-10-05T12:00')]);
  LS.setItem('budgetStatsRange', 'rolling30');
  if (render('报告页（近 30 天）', () => go('report'))) {
    const rp = text('page-report');
    ok('近 30 天模式：报告页读到的是本月收入 5,000（不是"未设置月收入"）', rp.indexOf('5,000.00') !== -1 && rp.indexOf('未设置月收入') === -1, rp.indexOf('未设置月收入') !== -1 ? '显示了"未设置月收入"' : '没找到 5,000.00');
  }
  LS.setItem('budgetStatsRange', 'month');
  if (render('报告页（切回按月）', () => go('report'))) {
    const inp = doc.getElementById('reportMonthInput');
    ok('切回按月：月份框是合法的 2026-10', inp && inp.value === '2026-10', inp && inp.value);
    ok('切回按月：报告页读到本月收入 5,000', text('page-report').indexOf('5,000.00') !== -1);
  }
  fresh();

  /* ================= H-06 假设分析 ================= */
  section('【H-06】近 30 天模式下，假设分析仍按"本月剩下的天数"算，并告诉用户');
  setClock(2026, 9, 28, 12, 0);
  fresh();
  DS.setMonthlyIncome('2026-10', 5000);
  seed([rec('w1', 100, '2026-10-05T12:00')]);
  LS.setItem('budgetStatsRange', 'rolling30');
  if (render('假设分析页', () => go('whatif'))) {
    const wi = text('page-whatif');
    ok('页面写的是"剩余 3 天"（本月还剩 3 天），不是"剩余 0 天"', wi.indexOf('剩余 3 天') !== -1, (/剩余 \d+ 天/.exec(wi) || [])[0]);
    ok('页面说明了"假设分析只按本月算"', wi.indexOf('只按本月') !== -1);
  }
  fresh();

  /* ================= H-07 流水页近 30 天筛选 ================= */
  section('【H-07】流水页的近 30 天日期范围：每次进来都按今天重算，切回按月要清掉');
  [{ h: 2, mi: 30 }, { h: 22, mi: 30 }].forEach(T => {
    setClock(2026, 9, 28, T.h, T.mi);
    const clockName = '本地时间 ' + pad(T.h) + ':' + pad(T.mi);
    fresh();
    LS.setItem('budgetStatsRange', 'rolling30');
    const today = new RealDate(FIXED), start = new RealDate(FIXED); start.setDate(start.getDate() - 29);
    if (render('流水页', () => go('records'))) {
      ok(clockName + '：结束日 = 今天（' + ymd(today) + '）', doc.getElementById('filterDateEnd').value === ymd(today), doc.getElementById('filterDateEnd').value);
      ok(clockName + '：开始日 = 29 天前（' + ymd(start) + '）', doc.getElementById('filterDateStart').value === ymd(start), doc.getElementById('filterDateStart').value);
    }
    // 页面开着过了一天
    FIXED += 24 * 3600 * 1000;
    const tomorrow = new RealDate(FIXED);
    render('流水页（过了一天）', () => go('records'));
    ok(clockName + '：过了一天再回到流水页，结束日跟着变成新的今天（' + ymd(tomorrow) + '）', doc.getElementById('filterDateEnd').value === ymd(tomorrow), doc.getElementById('filterDateEnd').value);
    // 用户自己选了范围：不能被改回去
    doc.getElementById('filterDateStart').value = '2026-10-05';
    doc.getElementById('filterDateEnd').value = '2026-10-10';
    w.applyRecordsFilter();
    FIXED += 24 * 3600 * 1000;
    render('流水页（用户选了范围）', () => go('records'));
    ok(clockName + '：用户自己选的范围（10-05 到 10-10）不会被自动范围冲掉',
      doc.getElementById('filterDateStart').value === '2026-10-05' && doc.getElementById('filterDateEnd').value === '2026-10-10',
      [doc.getElementById('filterDateStart').value, doc.getElementById('filterDateEnd').value]);
    // 切回按月：自动填的范围要清掉
    fresh();
    setClock(2026, 9, 28, T.h, T.mi);
    LS.setItem('budgetStatsRange', 'rolling30');
    render('流水页', () => go('records'));
    LS.setItem('budgetStatsRange', 'month');
    render('流水页（按月）', () => go('records'));
    ok(clockName + '：切回按月后，自动填的日期范围被清掉了',
      doc.getElementById('filterDateStart').value === '' && doc.getElementById('filterDateEnd').value === '',
      [doc.getElementById('filterDateStart').value, doc.getElementById('filterDateEnd').value]);
    fresh();
  });

  console.log('\n页面脚本错误: ' + JSON.stringify(errors.slice(0, 3)));
  console.log('\n===== 结果: ' + pass + ' 通过 / ' + fail + ' 失败 =====');
  process.exit(fail ? 1 : 0);
}, 1500);
