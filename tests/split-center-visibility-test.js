// 追账中心：「按人员」「按账单」只显示还没收齐的；已归档、已还清的不出现。
// Usage: bash build.sh && node tests/split-center-visibility-test.js   (需要 jsdom：npm i --no-save jsdom)
//
// 回归背景：账单归档之后，点进某个人的名字依旧能看到那些已归档账单的记录；
// 已经全部还清的人也一直挂在列表里。追账中心应该只回答「谁还欠我钱」。
//
// 约定：
//   - 「按人员」：只列还欠钱的人；展开后只列他还欠的账单（已归档的一概不列）；
//   - 「按账单」：只列还有人欠钱、且未归档的账单；
//   - 已还清但未归档的账单 + 已归档的账单 → 都在第三个页签「已结清归档」，
//     那里才有 归档 / 删除 / 转记录 / 恢复 的入口，所以不会因为被藏起来而无法操作；
//   - getPendingSummary 不统计已归档账单（与 getSplitUnpaid 一致）。
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');

const FIXED = new Date(2026, 9, 13, 12, 0, 0).getTime();
const MONTH = '2026-10';

function stub() {
  const n = () => {};
  return {
    canvas: null, setTransform: n, scale: n, translate: n, rotate: n, clearRect: n,
    fillRect: n, strokeRect: n, beginPath: n, closePath: n, moveTo: n, lineTo: n,
    arc: n, arcTo: n, bezierCurveTo: n, quadraticCurveTo: n, fill: n, stroke: n,
    clip: n, fillText: n, strokeText: n, measureText: () => ({ width: 10 }),
    save: n, restore: n, drawImage: n, setLineDash: n, resetTransform: n, roundRect: n,
    createLinearGradient: () => ({ addColorStop: n }),
    createRadialGradient: () => ({ addColorStop: n }),
    createPattern: () => ({}),
    getImageData: () => ({ data: new Uint8ClampedArray(4) }), putImageData: n,
    lineWidth: 1, fillStyle: '#000', strokeStyle: '#000', globalAlpha: 1,
    font: '10px sans-serif', textAlign: 'left', textBaseline: 'alphabetic',
    lineCap: 'butt', lineJoin: 'miter', shadowBlur: 0, shadowColor: 'transparent'
  };
}

const dom = new JSDOM(html, {
  runScripts: 'dangerously',
  pretendToBeVisual: true,
  url: 'http://localhost/',
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
    const q = () => {};
    w.console = { log: q, warn: q, error: q, info: q, debug: q };
  }
});
const { window: w } = dom;

let pass = 0, fail = 0;
const ok = (name, cond, extra) => {
  if (cond) { pass++; console.log('PASS ' + name); }
  else { fail++; console.log('FAIL ' + name + (extra !== undefined ? '  <- ' + JSON.stringify(extra) : '')); }
};
const section = t => console.log('\n' + t);

setTimeout(() => {
  try { w.Changelog.markSeen(w.Changelog.all()[0].id); w.closeModal(); } catch (e) { /* not booted */ }
  const DS = w.DataStore, S = w.SplitEngine;
  const $ = sel => w.document.querySelector(sel);
  const $$ = sel => Array.from(w.document.querySelectorAll(sel));
  const body = () => $('[id^="splitCenterBody_"]');
  const bodyText = () => (body() ? body().textContent : '');
  const cards = () => $$('.split-contact-card').map(c => c.getAttribute('data-contact'));
  const billCards = () => $$('.split-history-row').map(c => c.getAttribute('data-bill-id'));
  const openView = v => { w.setSplitCenterView(v); };

  const part = (id, name, share, paid) => ({ contactId: id, name, share, paid: !!paid, paidAmount: paid ? share : 0, unknown: false });
  function bill(id, tag, parts, extra) {
    return Object.assign({
      id, amount: 100, date: MONTH + '-05T12:00', note: '', tag, categoryId: '', payer: 'self',
      selfShare: 20, mode: 'equal', participants: parts, createdAt: new w.Date().toISOString(), archived: false
    }, extra || {});
  }
  function seed(bills) {
    DS.clearAll();
    DS._data.contacts = [{ id: 'p1', name: '阿明' }, { id: 'p2', name: '小红' }, { id: 'p3', name: '阿强' }];
    DS._data.splitBills = bills;
    DS.save();
    Object.keys(S._expandStates).forEach(k => delete S._expandStates[k]);
    w.closeModal();
  }

  // 阿明 p1：b1(已归档,已还) b2(已还清未归档) b3(进行中,欠 40)
  // 小红 p2：b1(已归档,已还) b3(已还)             → 全部还清
  // 阿强 p3：b2(已还) + b4(「老数据」已归档却还欠 25) → 对追账而言没有任何待收
  const BILLS = () => [
    bill('b1', '归档单', [part('p1', '阿明', 50, true), part('p2', '小红', 50, true)], { archived: true }),
    bill('b2', '已还清单', [part('p1', '阿明', 30, true), part('p3', '阿强', 30, true)]),
    bill('b3', '进行中单', [part('p1', '阿明', 40, false), part('p2', '小红', 40, true)]),
    bill('b4', '老数据归档带欠款', [part('p3', '阿强', 25, false)], { archived: true })
  ];

  /* ---------- 1. 数据层 ---------- */
  section('【getPendingSummary 不统计已归档账单】');
  seed(BILLS());
  const sum = S.getPendingSummary();
  ok('待收总额 = 40（只有 b3 里阿明欠的；b4 归档里的 25 不算）', sum.total === 40, sum.total);
  ok('待收笔数 = 1', sum.count === 1, sum.count);
  ok('只有阿明在待收名单里', sum.perContact.length === 1 && sum.perContact[0].contactId === 'p1', sum.perContact.map(c => c.name));
  const all = S.getPendingSummary({ includePaid: true });
  ok('includePaid 也不含已归档账单的行（b1 / b4）', all.perContact.every(pc => pc.bills.every(r => r.billId !== 'b1' && r.billId !== 'b4')),
    all.perContact.map(pc => pc.name + ':' + pc.bills.map(r => r.billId)));
  ok('与 StatsEngine.getSplitUnpaid 口径一致（都不计归档）', w.StatsEngine.getSplitUnpaid(MONTH) === sum.total,
    [w.StatsEngine.getSplitUnpaid(MONTH), sum.total]);

  /* ---------- 2. 按人员 ---------- */
  section('【按人员：只列还欠钱的人，展开只列他还欠的账单】');
  S._expandStates['contact:p1'] = true;
  w.openSplitCenter(); openView('people');
  ok('只显示阿明一个人', cards().length === 1 && cards()[0] === 'p1', cards());
  ok('全部还清的小红不显示', bodyText().indexOf('小红') === -1);
  ok('对追账没有待收的阿强不显示', bodyText().indexOf('阿强') === -1);
  ok('展开阿明：看得到进行中的账单', bodyText().indexOf('进行中单') !== -1);
  ok('展开阿明：看不到已归档的账单（用户报告的问题）', bodyText().indexOf('归档单') === -1, bodyText().slice(0, 200));
  ok('展开阿明：看不到他早已还清的账单', bodyText().indexOf('已还清单') === -1);
  ok('汇总卡：待收 RM 40.00 · 1 项', bodyText().indexOf(w.formatMoney(40)) !== -1);
  ok('页尾提示：另有 3 笔已还清 / 已归档的账单（b1 b2 b4）', /另有 3 笔/.test(bodyText()), bodyText().slice(-120));

  /* ---------- 3. 按账单 ---------- */
  section('【按账单：只列还有人欠钱、且未归档的账单】');
  openView('bill');
  ok('只显示进行中的 b3', billCards().length === 1 && billCards()[0] === 'b3', billCards());
  ok('已还清的账单不在这里', bodyText().indexOf('已还清单') === -1);
  ok('已归档的账单不在这里', bodyText().indexOf('归档单') === -1 && bodyText().indexOf('老数据归档带欠款') === -1);
  ok('页尾有指向「已结清归档」的提示', /另有 3 笔/.test(bodyText()));

  /* ---------- 4. 已结清归档页签：被藏起来的账单都在这，且操作入口还在 ---------- */
  section('【已结清归档：已还清 + 已归档，入口不丢】');
  openView('archived');
  ok('列出 b2 / b1 / b4 三笔，已还清未归档的排最前', JSON.stringify(billCards()) === JSON.stringify(['b2', 'b1', 'b4']), billCards());
  ok('页签上的数字是 3', /已结清归档\s*\(3\)/.test(bodyText() + $('.split-tabs').textContent), $('.split-tabs').textContent);
  ok('进行中的账单不混进来', billCards().indexOf('b3') === -1);
  const b2Card = $('.split-history-row[data-bill-id="b2"]'), b1Card = $('.split-history-row[data-bill-id="b1"]');
  S._expandStates['bill:b2'] = true; S._expandStates['bill:b1'] = true;
  openView('archived');
  ok('已还清未归档的账单仍有 🗑 删除/归档 入口', $('.split-history-row[data-bill-id="b2"]').innerHTML.indexOf('openSplitBillSettleOptions') !== -1);
  ok('已归档的账单仍有 ↩️ 恢复 入口', $('.split-history-row[data-bill-id="b1"]').innerHTML.indexOf('unarchiveSplitBill') !== -1);

  /* ---------- 5. 归档 / 恢复的闭环 ---------- */
  section('【归档与恢复】');
  w.archiveSplitBill('b2');
  ok('归档后 b2 变为已归档', S.getSplitBill('b2').archived === true);
  ok('归档后页签数字不变（仍是已结清的 3 笔）', /已结清归档\s*\(3\)/.test($('.split-tabs').textContent), $('.split-tabs').textContent);
  ok('没有欠款的账单不能归档的保护仍在：进行中的 b3 归档被拒', (() => { w.archiveSplitBill('b3'); return S.getSplitBill('b3').archived === false; })());
  w.unarchiveSplitBill('b2');
  ok('恢复后 b2 回到「已还清未归档」，仍在已结清页签里', S.getSplitBill('b2').archived === false && billCards().indexOf('b2') !== -1, billCards());
  openView('bill');
  ok('恢复一笔已还清的账单，不会让它回到追账列表（没人欠钱）', billCards().indexOf('b2') === -1, billCards());

  /* ---------- 6. 勾选「已还」后的就地刷新 ---------- */
  section('【勾选已还：卡片就地更新，可撤销，下次渲染才消失】');
  seed(BILLS());
  S._expandStates['contact:p1'] = true;
  w.openSplitCenter(); openView('people');
  w.markSplitPaid('b3', 'p1', true);
  ok('阿明刚还清最后一笔：卡片还在，才能撤销误点', cards().indexOf('p1') !== -1, cards());
  ok('卡片头显示「已全部还清」', $('.split-contact-card[data-contact="p1"]').textContent.indexOf(w.__('split.allSettled')) !== -1);
  ok('刚勾的那一行还在（带 ✅），可以点开撤销', $('.split-contact-card[data-contact="p1"]').textContent.indexOf('进行中单') !== -1);
  ok('汇总卡同步变成 RM 0.00', $('.split-summary-card').textContent.indexOf(w.formatMoney(0)) !== -1, $('.split-summary-card').textContent);
  w.markSplitPaid('b3', 'p1', false);
  ok('撤销后：卡片恢复为欠款状态', $('.split-contact-card[data-contact="p1"]').textContent.indexOf(w.formatMoney(40)) !== -1);
  w.markSplitPaid('b3', 'p1', true);
  openView('people');                                // 下一次渲染
  ok('重新渲染后阿明消失，只剩空状态', cards().length === 0 && bodyText().indexOf(w.__('split.noPending')) !== -1, [cards(), bodyText().slice(0, 80)]);

  /* ---------- 7. 匿名参与者（没存进联系人）也要就地刷新 ---------- */
  section('【匿名参与者：就地刷新按自己的 key 找卡片】');
  seed([
    bill('c1', '匿名账单', [part('', 'Zed', 20, false)]),
    bill('c2', '另一单', [part('p1', '阿明', 15, false)])
  ]);
  S._expandStates['contact:anon:Zed'] = true;
  S._expandStates['contact:p1'] = true;
  w.openSplitCenter(); openView('people');
  ok('匿名的 Zed 与阿明各一张卡', cards().length === 2 && cards().indexOf('anon:Zed') !== -1, cards());
  w.markSplitPaid('c1', 'anon:Zed', true);
  ok('Zed 的卡片被就地刷新为「已全部还清」（旧代码按 contactId 找，匿名人永远找不到）',
    $('.split-contact-card[data-contact="anon:Zed"]').textContent.indexOf(w.__('split.allSettled')) !== -1,
    $('.split-contact-card[data-contact="anon:Zed"]').textContent);
  ok('阿明的卡片没被误改', $('.split-contact-card[data-contact="p1"]').textContent.indexOf(w.formatMoney(15)) !== -1);

  /* ---------- 8. 全部还清 / 没有账单 ---------- */
  section('【空状态】');
  seed([bill('d1', '全还清', [part('p1', '阿明', 30, true)])]);
  w.openSplitCenter(); openView('people');
  ok('全部还清：按人员显示「没有待收款项」', bodyText().indexOf(w.__('split.noPending')) !== -1 && cards().length === 0);
  ok('并提示还清的账单在哪里', /另有 1 笔/.test(bodyText()));
  openView('bill');
  ok('按账单同样为空状态', bodyText().indexOf(w.__('split.noPending')) !== -1 && billCards().length === 0);
  seed([]);
  w.openSplitCenter(); openView('people');
  ok('一笔账单都没有：空状态且没有多余的提示行', bodyText().indexOf(w.__('split.noPending')) !== -1 && !/另有/.test(bodyText()));

  console.log('\n===== RESULT: ' + pass + ' PASS / ' + fail + ' FAIL =====');
  process.exit(fail > 0 ? 1 : 0);
}, 600);
