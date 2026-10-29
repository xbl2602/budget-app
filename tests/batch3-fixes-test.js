/* ============================================================
   第三批修复的回归网：分期 / 借款计划、分摊账单、合并导入、流水页与统计页的操作
   ------------------------------------------------------------
   来源：audit-report/AUDIT-REPORT.md 的 H-13 到 H-17、H-28、H-30 到 H-33。

   H-13 "一次性补齐"补得不够（少了本月已自动还的那一份）
   H-14 编辑信用卡分期计划后，已经记好的每期流水不跟着变
   H-15 分期计划的记账分类下拉里有收入类
   H-16 记账页分摊：切回"人均均分"后，之前在"指定金额"里填的数还在生效
   H-17 分摊编辑器改总额后，已结清的人被记成"已还了新的份额"
   H-28 合并导入把同月的账单项整个换成导入文件那份，本机多出来的项丢了
   H-30 统计页"在流水页查看"不起作用
   H-31 编辑流水时选新分类，已改的金额 / 备注被还原
   H-32 自定义日期范围 / 近 30 天下，改层级后图是空的，点色块下钻也是空的
   H-33 流水页卡片视图：批量选择会弹出编辑框；轻点一下卡片会滑出删除条

   原则（RULES #19）：每条断言先在没修的代码上跑过、确认会 FAIL，再修。
   驱动的是真实的界面函数，不是复制品。

   跑法： bash build.sh && node tests/batch3-fixes-test.js   (需要 jsdom)
   固定"现在"为 2026-10-13 12:00。
   ============================================================ */
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const FIXED = new Date(2026, 9, 13, 12, 0, 0).getTime();
const MONTH = '2026-10';

const drawn = [];   // 画布上写过的文字：图是不是空的，就看有没有写"暂无数据"
function stub() {
  const n = () => {};
  return { canvas: null, setTransform: n, scale: n, translate: n, rotate: n, clearRect: n, fillRect: n, strokeRect: n,
    beginPath: n, closePath: n, moveTo: n, lineTo: n, arc: n, arcTo: n, bezierCurveTo: n, quadraticCurveTo: n, fill: n,
    stroke: n, clip: n, fillText: (t) => { drawn.push(String(t)); }, strokeText: n, measureText: () => ({ width: 10 }), save: n, restore: n,
    createLinearGradient: () => ({ addColorStop: n }), createRadialGradient: () => ({ addColorStop: n }),
    createPattern: () => ({}), drawImage: n, getImageData: () => ({ data: new Uint8ClampedArray(4) }),
    putImageData: n, roundRect: n, resetTransform: n, setLineDash: n, rect: n, lineWidth: 1, fillStyle: '#000',
    strokeStyle: '#000', globalAlpha: 1, font: '10px sans-serif', textAlign: 'left', textBaseline: 'alphabetic',
    lineCap: 'butt', lineJoin: 'miter', shadowBlur: 0, shadowColor: 'transparent' };
}

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
const w = dom.window, doc = w.document, LS = w.localStorage;
const pageErrors = [];
w.addEventListener('error', e => pageErrors.push(String(e.message)));

let pass = 0, fail = 0;
const ok = (name, cond, extra) => {
  if (cond) { pass++; console.log('  ✅ ' + name); }
  else { fail++; console.log('  ❌ ' + name + (extra !== undefined ? '  <- ' + (typeof extra === 'string' ? extra : JSON.stringify(extra)) : '')); }
};
const near = (a, b) => Math.abs(a - b) < 0.011;
const section = t => console.log('\n' + t);
const pad = n => String(n).padStart(2, '0');
const day = d => MONTH + '-' + pad(d) + 'T12:00';
const wait = ms => new Promise(r => setTimeout(r, ms));
const norm = s => String(s || '').replace(/\s+/g, ' ').trim();
const $ = id => doc.getElementById(id);

setTimeout(async () => {
  try { w.Changelog.markSeen(w.Changelog.all()[0].id); w.closeModal(); } catch (e) { /* not booted */ }
  const DS = w.DataStore, PM = w.PlanMath, SE = w.SplitEngine;
  ok('时间已固定在 10-13（否则下面的断言都在空转）', new w.Date().getDate() === 13);

  const food = DS.getExpenseRootCategories().find(c => c.name === '餐饮');
  const lunch = DS.getChildren(food.id).find(c => c.name === '午餐');
  const shopping = DS.getExpenseRootCategories().find(c => c.name === '购物');
  const elec = DS.getChildren(shopping.id).find(c => c.name === '电子产品');
  const incomeLeaves = DS.getCategories().filter(c => c.kind === 'income' && !DS.getCategories().some(x => x.parentId === c.id));

  function fresh() {
    DS.clearAll();
    ['budgetStatsRange', 'chartBillToggle_overviewBudget', 'chartBillToggle_pieChart', 'budgetCompactView'].forEach(k => LS.removeItem(k));
    w.closeModal();
  }
  const planRecs = id => DS.getRecords().filter(r => r && r.planId === id);
  const sumOf = list => list.reduce((s, r) => s + r.amount, 0);

  /* ================= H-13 一次性补齐 ================= */
  section('【H-13】逾期弹窗里的"一次性补齐"：点完剩余应当是 0');
  fresh();
  ['2026-06', '2026-07', '2026-08', '2026-09', '2026-10'].forEach(m => DS.setMonthlyIncome(m, 500));
  DS._data.purchasePlans = [{ id: 'A', name: '借款', icon: '💸', totalAmount: 3000, mode: 'borrow', startMonth: '2026-06', months: 3,
    categoryId: '', status: 'active', overrides: {}, note: '', createdAt: '2026-06-01T00:00:00' }];
  DS.save();
  const before = PM.getState('A', MONTH);
  ok('起点：每月只能还 500，到 10 月已逾期，还剩 500', near(before.remaining, 500) && before.isOverdue, [before.remaining, before.isOverdue]);
  w.checkPlanEvents();
  await wait(80);
  const payBtn = doc.querySelector('[data-plan-action="payoff"]');
  ok('逾期弹窗弹出来了，里面有"一次性补齐"', !!payBtn);
  if (payBtn) payBtn.click();
  await wait(50);
  const after = PM.getState('A', MONTH);
  ok('点完"一次性补齐"，剩余是 0（旧代码仍是 500）', near(after.remaining, 0), after.remaining);
  ok('点完之后计划算作已完成', after.isComplete === true);
  ok('这个月记下的补齐额 = 补齐前还欠的 1000，而不是 500', near((DS.getPurchasePlan('A').overrides || {})[MONTH], 1000), (DS.getPurchasePlan('A').overrides || {})[MONTH]);

  // 这个月本来就有一笔手动记的还款：补齐要补到全部还清，不是再多补一点
  fresh();
  ['2026-06', '2026-07', '2026-08', '2026-09', '2026-10'].forEach(m => DS.setMonthlyIncome(m, 500));
  DS._data.purchasePlans = [{ id: 'A2', name: '借款', icon: '💸', totalAmount: 3000, mode: 'borrow', startMonth: '2026-06', months: 3,
    categoryId: '', status: 'active', overrides: { [MONTH]: 200 }, note: '', createdAt: '2026-06-01T00:00:00' }];
  DS.save();
  w.checkPlanEvents(); await wait(80);
  const payBtn2 = doc.querySelector('[data-plan-action="payoff"]');
  if (payBtn2) payBtn2.click();
  await wait(50);
  ok('本月已手动记过 200 的情况下，补齐后剩余也是 0', near(PM.getState('A2', MONTH).remaining, 0), PM.getState('A2', MONTH).remaining);

  /* ================= H-14 编辑信用卡分期后流水不更新 ================= */
  section('【H-14】编辑信用卡分期计划：已记的每期流水跟着变');
  fresh();
  DS.addPurchasePlan({ id: 'C', name: '手机', icon: '📱', totalAmount: 1200, mode: 'credit', startMonth: '2026-07', months: 12,
    categoryId: lunch.id, status: 'active', overrides: {}, note: '' });
  w.syncPlanRecords();
  ok('起点：7、8、9、10 月各记了一笔 100', planRecs('C').length === 4 && planRecs('C').every(r => near(r.amount, 100)), planRecs('C').map(r => r.amount));

  const editPlan = (id, set) => {
    w.openPlanEditor(id);
    if (set.amount !== undefined) $('planAmount').value = String(set.amount);
    if (set.months !== undefined) $('planMonths').value = String(set.months);
    if (set.start !== undefined) w.setPlanStartMonth(set.start);
    if (set.name !== undefined) $('planName').value = set.name;
    if (set.note !== undefined) $('planNote').value = set.note;
    if (set.cat !== undefined) $('planCategory').value = set.cat;
    w.savePlanEditor(id);
  };
  editPlan('C', { amount: 2400, months: 6 });
  let rs = planRecs('C');
  ok('改成 2400 元 6 期后，每笔是 400（旧代码还是 100）', rs.length === 4 && rs.every(r => near(r.amount, 400)), rs.map(r => r.amount));
  ok('备注里写的是"第x/6期"，不再是"/12期"', rs.every(r => r.note.indexOf('/6') !== -1 && r.note.indexOf('/12') === -1), rs.map(r => r.note));
  ok('流水合计和计划的进度对得上（4 期 × 400 = 1600）', near(sumOf(rs), 1600) && near(PM.getState('C', MONTH).paid, sumOf(rs)), [sumOf(rs), PM.getState('C', MONTH).paid]);

  const idsBefore = planRecs('C').map(r => r.id).sort().join(',');
  editPlan('C', { note: '只改了备注' });
  ok('只改备注这种与流水无关的字段，不动已有流水', planRecs('C').map(r => r.id).sort().join(',') === idsBefore);

  editPlan('C', { start: '2026-09' });
  rs = planRecs('C');
  ok('起始月后移到 9 月：只剩 9、10 月两笔，7、8 月的不再留成孤儿', rs.length === 2 && rs.map(r => r.planMonth).sort().join() === '2026-09,2026-10', rs.map(r => r.planMonth));
  ok('这两笔是 400 / 400', rs.every(r => near(r.amount, 400)));

  editPlan('C', { cat: elec.id });
  ok('改记账分类后，旧流水也跟着换分类', planRecs('C').length === 2 && planRecs('C').every(r => r.categoryId === elec.id), planRecs('C').map(r => r.categoryId));

  editPlan('C', { name: '新手机' });
  ok('改计划名字后，旧流水备注里的名字也换了', planRecs('C').every(r => r.note.indexOf('新手机') !== -1 && r.note.indexOf('手机 分期') !== -1), planRecs('C').map(r => r.note));

  /* ================= H-15 分类下拉里的收入类 ================= */
  section('【H-15】分期计划的记账分类下拉里不该有收入类');
  fresh();
  w.openPlanEditor(null);
  const optVals = Array.from($('planCategory').options).map(o => o.value);
  ok('下拉有选项可选', optVals.length > 5, optVals.length);
  ok('收入类分类一个都不在下拉里（旧代码有 ' + incomeLeaves.length + ' 个）', incomeLeaves.length > 0 && optVals.every(v => !DS.isIncomeCategory(v)), optVals.filter(v => DS.isIncomeCategory(v)).length);
  ok('支出类的叶子分类还在（午餐）', optVals.indexOf(lunch.id) !== -1);

  // 手动把收入类塞进下拉（等于有人改了页面）：保存时也要拒绝
  const sel = $('planCategory');
  const injected = doc.createElement('option'); injected.value = incomeLeaves[0].id; injected.textContent = 'x'; sel.appendChild(injected);
  sel.value = incomeLeaves[0].id;
  $('planName').value = '塞进去的'; $('planAmount').value = '600'; $('planMonths').value = '6';
  doc.querySelector('#planModeGroup [data-plan-mode="credit"]').click();
  w.savePlanEditor(null);
  ok('选了收入类就保存：被拒绝，没有新计划', DS.getPurchasePlans().length === 0, DS.getPurchasePlans().length);
  ok('也没有生成任何记录', DS.getRecords().length === 0, DS.getRecords().length);

  // 以前保存过的分期计划用的是收入类：打开编辑时不能悄悄换成第一项
  fresh();
  DS.addPurchasePlan({ id: 'L', name: '旧计划', icon: '📱', totalAmount: 600, mode: 'credit', startMonth: '2026-10', months: 6,
    categoryId: incomeLeaves[0].id, status: 'active', overrides: {}, note: '' });
  w.openPlanEditor('L');
  ok('旧计划打开编辑：分类框是空的，等你重新选，而不是悄悄变成列表第一项', $('planCategory').value === '', $('planCategory').value);
  $('planAmount').value = '999';
  w.savePlanEditor('L');
  ok('不重新选分类就保存：被拒绝，计划金额没变', near(DS.getPurchasePlan('L').totalAmount, 600), DS.getPurchasePlan('L').totalAmount);
  w.openPlanEditor('L');
  $('planAmount').value = '999';
  $('planCategory').value = lunch.id;
  w.savePlanEditor('L');
  ok('重新选了午餐再保存：成功', near(DS.getPurchasePlan('L').totalAmount, 999) && DS.getPurchasePlan('L').categoryId === lunch.id, DS.getPurchasePlan('L'));

  /* ================= H-16 记账页分摊切回均分 ================= */
  section('【H-16】记账页分摊：切回「人均均分」后，隐藏的金额不再生效');
  fresh();
  DS._data.contacts = [{ id: 'ca', name: 'A' }, { id: 'cb', name: 'B' }];
  DS.save();
  w.navigateTo('add');
  await wait(60);
  w.resetAddSplitState();
  let st = w._addSplitState;
  st.enabled = true; st.selfInvolved = true; st.selfAmount = '20';
  st.rows.forEach(r => { r.included = true; });
  st.rows.find(r => r.contactId === 'ca').amount = '70';
  st.mode = 'specified';
  const args = { amount: 100, date: day(5), note: '', tags: [], categoryId: lunch.id };
  const spec = SE.collectSplitBill(args);
  ok('对照：指定金额模式下，自己 20 / A 70 / B 10', spec.ok && near(spec.bill.selfShare, 20)
    && near(spec.participants.find(p => p.contactId === 'ca').share, 70) && near(spec.participants.find(p => p.contactId === 'cb').share, 10),
    spec.ok ? [spec.bill.selfShare, spec.participants.map(p => p.share)] : spec.error);

  st.mode = 'equal';   // 用户又切回了"人均均分"，输入框消失，但填过的数还留在状态里
  const eq = SE.collectSplitBill(args);
  const eqShares = eq.ok ? [eq.bill.selfShare].concat(eq.participants.map(p => p.share)) : [];
  ok('切回均分后保存：三个人都是 33.33 / 33.34（旧代码是 20 / 70 / 10）',
    eq.ok && eqShares.length === 3 && eqShares.every(x => x >= 33.33 - 0.001 && x <= 33.34 + 0.001) && near(eqShares.reduce((a, b) => a + b, 0), 100), eqShares);
  ok('保存下来的模式是"均分"', eq.ok && eq.bill.mode === 'equal');

  // 预览那一行也要一样（不然屏幕上看着是 33.33，存下去是 70）
  $('addAmount').value = '100';
  w.toggleAddSplitForm(true);
  w._addSplitState.selfInvolved = true; w._addSplitState.selfAmount = '20';
  w._addSplitState.rows.forEach(r => { r.included = true; });
  w._addSplitState.rows.find(r => r.contactId === 'ca').amount = '70';
  w.setSplitMode('specified'); w.setSplitMode('equal');
  w.previewSplitShares();
  const prevTxt = norm(($('splitSharePreview') || {}).textContent);
  ok('均分模式下的预览里没有 70.00 / 20.00', prevTxt !== '' && prevTxt.indexOf('70.00') === -1 && prevTxt.indexOf('20.00') === -1, prevTxt);
  ok('预览里是 33.33', prevTxt.indexOf('33.3') !== -1, prevTxt);

  /* ================= H-17 编辑器改总额后已结清的人 ================= */
  section('【H-17】分摊编辑器改总额：已结清的人只算已还的那一份');
  function mkBill(id, total, aPaid) {
    const a = SE.withPaidAmount({ contactId: 'ca', name: 'A', share: total / 2, unknown: false }, aPaid);
    const b = SE.withPaidAmount({ contactId: 'cb', name: 'B', share: total / 2, unknown: false }, 0);
    DS._data.splitBills.unshift({ id, amount: total, date: day(5), note: 'dinner', tag: '', categoryId: lunch.id, payer: 'self',
      selfShare: 0, selfUnknown: false, mode: 'equal', participants: [a, b], createdAt: '2026-10-05T00:00:00.000Z' });
    DS._data.records.unshift({ id: 'rec-' + id, amount: total, categoryId: lunch.id, date: day(5), note: 'dinner', tags: [], splitBillId: id, createdAt: '2026-10-05T00:00:00.000Z' });
    DS.save();
  }
  const partOf = (billId, key) => SE.getSplitBill(billId).participants.find(p => p.contactId === key);
  fresh();
  DS._data.contacts = [{ id: 'ca', name: 'A' }, { id: 'cb', name: 'B' }]; DS.save();
  mkBill('h17', 100, 50);   // A 已还清自己的 50，B 一分没还
  w.openSplitBillEditor('h17');
  $('editSplitAmount').value = '120';
  w.updateEditSplitPreview();
  w.saveSplitBillEditor('h17');
  let pa = partOf('h17', 'ca'), pb = partOf('h17', 'cb');
  ok('总额改成 120 后，A、B 的份额各 60', near(pa.share, 60) && near(pb.share, 60), [pa.share, pb.share]);
  ok('A 还是只还了 50（旧代码被记成已还 60）', near(SE.partPaid(pa), 50), SE.partPaid(pa));
  ok('A 还欠 10', near(SE.partOwed(pa), 10), SE.partOwed(pa));
  ok('B 仍然是没还', near(SE.partPaid(pb), 0));

  // 和流水页那条路径对一下：同样的账单、同样改成 120，欠款要一样
  fresh();
  DS._data.contacts = [{ id: 'ca', name: 'A' }, { id: 'cb', name: 'B' }]; DS.save();
  mkBill('h17b', 100, 50);
  SE.applyRecordEditToBill('h17b', { amount: 120 });
  ok('流水页那条路径：A 欠 10', near(SE.partOwed(partOf('h17b', 'ca')), 10), SE.partOwed(partOf('h17b', 'ca')));

  // 明确动了勾选框：勾上 = 按新份额算已还清；取消勾 = 退回没还
  fresh();
  DS._data.contacts = [{ id: 'ca', name: 'A' }, { id: 'cb', name: 'B' }]; DS.save();
  mkBill('h17c', 100, 50);
  w.openSplitBillEditor('h17c');
  doc.querySelector('#editPaidCheckboxes [data-paid-contact="cb"]').checked = true;    // 新勾上 B
  doc.querySelector('#editPaidCheckboxes [data-paid-contact="ca"]').checked = false;   // 取消 A
  w.saveSplitBillEditor('h17c');
  ok('新勾上 B：B 记为已还清自己的 50', near(SE.partPaid(partOf('h17c', 'cb')), 50) && SE.partSettled(partOf('h17c', 'cb')), SE.partPaid(partOf('h17c', 'cb')));
  ok('取消勾 A：A 退回没还', near(SE.partPaid(partOf('h17c', 'ca')), 0), SE.partPaid(partOf('h17c', 'ca')));

  // 总额改小：已还的比新份额还多，按新份额封顶
  fresh();
  DS._data.contacts = [{ id: 'ca', name: 'A' }, { id: 'cb', name: 'B' }]; DS.save();
  mkBill('h17d', 100, 50);
  w.openSplitBillEditor('h17d');
  $('editSplitAmount').value = '80';
  w.updateEditSplitPreview();
  w.saveSplitBillEditor('h17d');
  ok('总额改成 80：A 份额 40，已还封顶 40，算已还清', near(partOf('h17d', 'ca').share, 40) && near(SE.partPaid(partOf('h17d', 'ca')), 40) && SE.partSettled(partOf('h17d', 'ca')),
    [partOf('h17d', 'ca').share, SE.partPaid(partOf('h17d', 'ca'))]);

  /* ================= H-28 合并导入 ================= */
  section('【H-28】合并导入：本机多出来的账单项不再丢');
  fresh();
  DS.addBillCategory({ name: '房租', icon: '🏠' });
  DS.addBillCategory({ name: '水电', icon: '💡' });
  const [rentCat, waterCat] = DS.getBillCategories();
  DS.setBillAmount(MONTH, rentCat.id, 1000);
  DS.setBillAmount(MONTH, waterCat.id, 80);
  DS.setMonthlyIncome(MONTH, 5000);
  const backup = JSON.parse(DS.exportJSON());
  backup.billAmounts = { [MONTH]: { [rentCat.id]: 1100 }, '2026-11': { [rentCat.id]: 1100 } };
  backup.monthlyIncome = { '2026-11': 5200 };
  const merged = DS.importJSON(JSON.stringify(backup), 'merge');
  ok('合并导入成功', merged !== false, merged);
  const ba = DS.getBillAmounts(MONTH) || {};
  ok('本机的水电 80 还在（旧代码整月被换成了只有房租）', near(parseFloat(ba[waterCat.id]), 80), ba);
  ok('导入文件里同一项的新值生效：房租 1100（既有设计，没改）', near(parseFloat(ba[rentCat.id]), 1100), ba);
  ok('导入文件里本机没有的月份加进来了', near(parseFloat((DS.getBillAmounts('2026-11') || {})[rentCat.id]), 1100));
  ok('本机已有的月收入不被一份没带它的文件清掉', near(DS.getMonthlyIncome(MONTH), 5000) && near(DS.getMonthlyIncome('2026-11'), 5200), [DS.getMonthlyIncome(MONTH), DS.getMonthlyIncome('2026-11')]);

  // 局域网同步走的是同一个合并函数
  DS.setBillAmount(MONTH, waterCat.id, 80);
  DS._mergeData({ billAmounts: { [MONTH]: { [rentCat.id]: 1200 } } });
  ok('局域网同步那条路径：水电 80 还在，房租 1200', near(parseFloat((DS.getBillAmounts(MONTH) || {})[waterCat.id]), 80) && near(parseFloat((DS.getBillAmounts(MONTH) || {})[rentCat.id]), 1200), DS.getBillAmounts(MONTH));

  /* ================= H-30 在流水页查看 ================= */
  section('【H-30】统计页的"在流水页查看"：流水页只剩这个分类');
  fresh();
  for (let i = 1; i <= 3; i++) DS.addRecord({ amount: 10 + i, categoryId: lunch.id, date: day(i), note: 'l' + i, tags: [] });
  for (let i = 1; i <= 2; i++) DS.addRecord({ amount: 100 + i, categoryId: elec.id, date: day(i), note: 'e' + i, tags: [] });
  DS.addRecord({ amount: 9, categoryId: lunch.id, date: '2026-09-20T12:00', note: 'sept', tags: [] });
  w.navigateTo('stats'); await wait(150);
  w.jumpToCategoryRecords(lunch.id);
  await wait(100);
  const countTxt = norm(($('recordsCount') || {}).textContent);
  ok('跳转后流水页的筛选分类是午餐', w.recordsFilter.categoryId === lunch.id, w.recordsFilter.categoryId);
  ok('流水页只剩本月的 3 条午餐（旧代码显示全部 6 条）', countTxt === norm(w.__('records.count', 3)), countTxt);
  const listTxt = norm(($('recordsList') || {}).textContent);
  ok('列表里没有电子产品的记录', listTxt.indexOf('e1') === -1 && listTxt.indexOf('e2') === -1 && listTxt.indexOf('l1') !== -1, listTxt.slice(0, 120));
  ok('筛选框里也显示这个分类', norm(($('filterCategoryDisplay') || {}).textContent).indexOf('午餐') !== -1, norm(($('filterCategoryDisplay') || {}).textContent));

  // 清除筛选之后再点另一个分类，仍然管用（对象不能被换掉两次）
  w.clearRecordsFilter();
  ok('点"清除"后筛选是空的', !w.recordsFilter.categoryId);
  w.navigateTo('stats'); await wait(100);
  w.jumpToCategoryRecords(elec.id);
  await wait(100);
  ok('再从统计页跳一次：只剩电子产品的 2 条', norm(($('recordsCount') || {}).textContent) === norm(w.__('records.count', 2)), norm(($('recordsCount') || {}).textContent));

  // 多于一页时要从第一页看起
  fresh();
  for (let i = 0; i < 25; i++) DS.addRecord({ amount: 5, categoryId: lunch.id, date: day(1 + (i % 12)), note: 'p' + i, tags: [] });
  w.recordsPage = 1;   // 假装用户之前翻到了第二页
  w.navigateTo('stats'); await wait(100);
  w.jumpToCategoryRecords(lunch.id);
  await wait(100);
  ok('该分类有 25 条（超过一页）：跳过去停在第一页', w.recordsPage === 0, w.recordsPage);

  /* ================= H-31 选分类时输入内容被还原 ================= */
  section('【H-31】编辑流水时选新分类，已改的金额 / 备注 / 勾选不丢');
  fresh();
  const rec1 = DS.addRecord({ amount: 12, categoryId: lunch.id, date: day(5), note: 'old', tags: [] });
  w.openEditRecord(rec1.id);
  $('editAmount').value = '88.5';
  $('editNote').value = '我改过的备注';
  $('editExcludeAvg').checked = true;
  w.openCategoryPicker('edit');
  w.selectCategory(elec.id, 'edit');
  ok('回到编辑框后金额还是 88.5（旧代码被还原成 12）', $('editAmount') && $('editAmount').value === '88.5', $('editAmount') && $('editAmount').value);
  ok('备注还是改过的', $('editNote') && $('editNote').value === '我改过的备注', $('editNote') && $('editNote').value);
  ok('"不计入日均"的勾还在', $('editExcludeAvg') && $('editExcludeAvg').checked === true);
  ok('分类显示已经换成电子产品', $('editCategoryDisplay') && $('editCategoryDisplay').textContent.indexOf('电子产品') !== -1, $('editCategoryDisplay') && $('editCategoryDisplay').textContent);
  $('editForm').dispatchEvent(new w.Event('submit', { cancelable: true, bubbles: true }));
  const saved = DS.getRecord(rec1.id);
  ok('保存后：金额 88.5、备注是新的、分类是电子产品', saved && near(saved.amount, 88.5) && saved.note === '我改过的备注' && saved.categoryId === elec.id, saved);

  // 取消选择（点取消）也要回到改过的状态
  fresh();
  const rec2 = DS.addRecord({ amount: 20, categoryId: lunch.id, date: day(5), note: 'x', tags: [] });
  w.openEditRecord(rec2.id);
  $('editAmount').value = '77';
  w.openCategoryPicker('edit');
  w.pickerRestore();
  ok('打开分类框又取消：金额还是 77', $('editAmount') && $('editAmount').value === '77', $('editAmount') && $('editAmount').value);

  /* ================= H-32 自定义范围 / 近 30 天 下的下钻与层级 ================= */
  section('【H-32】自定义日期范围：改层级、下钻，图和表还是同一批数');
  fresh();
  DS.addRecord({ amount: 10, categoryId: lunch.id, date: day(3), note: '', tags: [] });
  DS.addRecord({ amount: 20, categoryId: lunch.id, date: day(5), note: '', tags: [] });
  DS.addRecord({ amount: 40, categoryId: elec.id, date: day(6), note: '', tags: [] });
  DS.addRecord({ amount: 500, categoryId: lunch.id, date: '2026-09-01T12:00', note: 'outside', tags: [] });   // 范围外
  w.navigateTo('stats'); await wait(150);
  $('statsDateStart').value = MONTH + '-01';
  $('statsDateEnd').value = MONTH + '-10';
  w.changeStatsCustom();
  await wait(200);
  ok('起点：已经是自定义范围（月份为空）', w.statsMonth === '' && w.useCustomRange());

  w.setStatsHierarchyLevel(2);
  await wait(60);
  drawn.length = 0;
  w.setStatsHierarchyLevel(2);
  await wait(60);
  ok('自定义范围下改层级：饼图不是"暂无数据"（旧代码是）', drawn.indexOf(w.__('stats.noData')) === -1, drawn.slice(0, 5));
  const lvl2 = w.buildPieSliceRows(2, 'pieChart', w.statsStartDate, w.statsEndDate);
  ok('第 2 层的合计是范围内的 70，不含范围外那笔 500', near(lvl2.reduce((s, d) => s + d.total, 0), 70), lvl2.map(d => d.total));
  w.setStatsHierarchyLevel(1);
  await wait(60);

  w.drillIntoCategory(food.id);
  await wait(60);
  const drilled = w.buildPieSliceRows(1, 'pieChart', w.statsStartDate, w.statsEndDate);
  ok('自定义范围下点餐饮下钻：能看到子分类（旧代码是空的）', drilled.length > 0, drilled.length);
  const lunchRow = drilled.find(d => d.cat && d.cat.id === lunch.id);
  ok('午餐一行是 30（10 + 20），不含范围外那笔', lunchRow && near(lunchRow.total, 30), drilled.map(d => [d.cat && d.cat.name, d.total]));
  drawn.length = 0;
  w.drawPieChart('pieChart', w.statsMonth, w.statsStartDate, w.statsEndDate);
  ok('下钻后饼图不是"暂无数据"', drawn.indexOf(w.__('stats.noData')) === -1, drawn.slice(0, 5));
  const tbl = doc.getElementById('pieDetailTable');
  if (tbl) {
    if (tbl.style.display === 'none') w.togglePieDetailTable();
    await wait(80);
    ok('明细表和图一致：显示午餐 30.00', norm(doc.getElementById('pieDetailTable').textContent).indexOf('30.00') !== -1, norm(doc.getElementById('pieDetailTable').textContent).slice(0, 160));
  }
  w.backFromDrill();

  // 月份视图是对照：同一批数据，下钻结果不变
  w.changeStatsMonth(MONTH);
  await wait(150);
  w.drillIntoCategory(food.id);
  const drillM = w.buildPieSliceRows(1, 'pieChart', null, null);
  const lunchM = drillM.find(d => d.cat && d.cat.id === lunch.id);
  ok('对照：按月份下钻，午餐 = 10 + 20 + 500（整个月）', lunchM && near(lunchM.total, 30), drillM.map(d => [d.cat && d.cat.name, d.total]));
  w.backFromDrill();

  // 近 30 天：下钻要和第 1 层同一个窗口（9-14 到 10-13），不是日历月
  fresh();
  LS.setItem('budgetStatsRange', 'rolling30');
  DS.addRecord({ amount: 10, categoryId: lunch.id, date: '2026-09-20T12:00', note: '', tags: [] });
  DS.addRecord({ amount: 20, categoryId: lunch.id, date: day(5), note: '', tags: [] });
  w.changeStatsMonth(MONTH);
  await wait(150);
  const roots = w.getChartData(MONTH, null, null);
  const foodRoot = roots.find(d => d.id === food.id);
  ok('近 30 天：第 1 层餐饮 = 30（9-20 那笔也算）', foodRoot && near(foodRoot.total, 30), roots.map(d => [d.cat.name, d.total]));
  w.drillIntoCategory(food.id);
  const drillR = w.buildPieSliceRows(1, 'pieChart', null, null);
  const lunchR = drillR.find(d => d.cat && d.cat.id === lunch.id);
  ok('近 30 天下钻：午餐 = 30，和第 1 层的数对得上（旧代码只有 20）', lunchR && near(lunchR.total, 30), drillR.map(d => [d.cat && d.cat.name, d.total]));
  w.backFromDrill();
  LS.removeItem('budgetStatsRange');

  /* ================= H-33 卡片视图：批量选择 / 轻点误滑 ================= */
  section('【H-33】流水页卡片视图：批量选择只选中；轻点不滑出删除条');
  fresh();
  LS.setItem('budgetCompactView', 'false');
  const r1 = DS.addRecord({ amount: 11, categoryId: lunch.id, date: day(5), note: 'one', tags: [] });
  DS.addRecord({ amount: 22, categoryId: lunch.id, date: day(6), note: 'two', tags: [] });
  w.navigateTo('records'); await wait(100);
  const cardOf = id => doc.querySelector('.record-card[data-id="' + id + '"]');
  const modalOpen = () => { const o = $('modalOverlay'); return !!(o && o.classList.contains('open')); };
  ok('起点：是卡片视图，不是紧凑视图', !!cardOf(r1.id) && !cardOf(r1.id).classList.contains('compact'));

  // 手指轻点：没有任何移动，也不该滑
  const touch = (el, type, x, y) => {
    const ev = new w.Event(type, { bubbles: true, cancelable: true });
    ev.touches = type === 'touchend' ? [] : [{ clientX: x, clientY: y }];
    ev.changedTouches = [{ clientX: x, clientY: y }];
    el.dispatchEvent(ev);
  };
  let c = cardOf(r1.id);
  touch(c, 'touchstart', 300, 100);
  touch(c, 'touchend', 300, 100);
  ok('轻点一下：卡片不动（旧代码滑出 80px）', c.style.transform === '', c.style.transform);
  touch(c, 'touchstart', 300, 100);
  touch(c, 'touchmove', 200, 104);
  touch(c, 'touchend', 200, 104);
  ok('真的向左滑 100px：卡片滑出删除条', c.style.transform === 'translateX(-80px)', c.style.transform);
  // 回位
  touch(c, 'touchstart', 100, 100);
  touch(c, 'touchmove', 160, 100);
  touch(c, 'touchend', 160, 100);
  touch(c, 'touchstart', 300, 100);
  touch(c, 'touchmove', 296, 260);    // 主要是上下滑（在滚动页面）
  touch(c, 'touchend', 296, 260);
  ok('上下滚动页面时带一点点左右偏移：不算滑动删除', cardOf(r1.id).style.transform === '', cardOf(r1.id).style.transform);

  // 批量模式
  w.toggleBatchMode(); await wait(60);
  c = cardOf(r1.id);
  ok('进入批量模式后：卡片上有选择框', !!c.querySelector('.batch-checkbox'));
  c.click();
  await wait(60);
  ok('批量模式下点卡片：只选中，不弹出编辑框（旧代码会弹）', !modalOpen());
  c = cardOf(r1.id);
  ok('这一条被选中了', c.querySelector('.batch-checkbox') && c.querySelector('.batch-checkbox').checked === true);
  const errBefore = pageErrors.length;
  touch(c, 'touchstart', 300, 100);
  touch(c, 'touchmove', 200, 100);
  touch(c, 'touchend', 200, 100);
  ok('批量模式下手指划过卡片：不报错（旧代码找不到删除条而抛错）', pageErrors.length === errBefore, pageErrors.slice(errBefore));
  w.toggleBatchMode(); await wait(60);

  // 不在批量模式时，点卡片只打开一次编辑框
  c = cardOf(r1.id);
  c.click();
  await wait(40);
  ok('普通模式点卡片：打开编辑框', modalOpen());
  w.closeModal();

  console.log('\n===== 结果: ' + pass + ' 通过 / ' + fail + ' 失败 =====');
  process.exit(fail > 0 ? 1 : 0);
}, 1200);
