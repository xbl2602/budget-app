/* ============================================================
   第一批修复的回归网：卡死 / 数据被悄悄改坏 / 外部数据被当代码执行
   ------------------------------------------------------------
   来源：audit-report/AUDIT-REPORT.md 的 C-02、C-03、H-18、H-21 到 H-27、H-29。

   原则（RULES #19）：每条断言先在没修的代码上跑过、确认会 FAIL，再修。
   驱动的是真实的界面函数（mergeCategory / confirmDeleteCategory /
   confirmDeleteRecord / importJSON / navigateTo …），不是复制品。

   跑法： bash build.sh && node tests/batch1-fixes-test.js
   ============================================================ */
const fs = require('fs'), path = require('path'), vm = require('vm');
const { JSDOM } = require('jsdom');
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');

function stub() {
  const n = () => {};
  return { canvas: null, setTransform: n, scale: n, translate: n, rotate: n, clearRect: n, fillRect: n, strokeRect: n,
    beginPath: n, closePath: n, moveTo: n, lineTo: n, arc: n, arcTo: n, bezierCurveTo: n, quadraticCurveTo: n, fill: n,
    stroke: n, clip: n, fillText: n, strokeText: n, measureText: () => ({ width: 10 }), save: n, restore: n,
    createLinearGradient: () => ({ addColorStop: n }), createRadialGradient: () => ({ addColorStop: n }),
    createPattern: () => ({}), drawImage: n, getImageData: () => ({ data: new Uint8ClampedArray(4) }),
    putImageData: n, roundRect: n, resetTransform: n, setLineDash: n, rect: n, lineWidth: 1, fillStyle: '#000', strokeStyle: '#000',
    globalAlpha: 1, font: '10px sans-serif', textAlign: 'left', textBaseline: 'alphabetic', lineCap: 'butt',
    lineJoin: 'miter', shadowBlur: 0, shadowColor: 'transparent' };
}

const dom = new JSDOM(html, {
  runScripts: 'dangerously', pretendToBeVisual: true, url: 'http://localhost/',
  beforeParse(w) {
    const s = stub();
    w.HTMLCanvasElement.prototype.getContext = function () { s.canvas = this; return s; };
    w.HTMLCanvasElement.prototype.toDataURL = () => 'data:image/png;base64,AAA';
    w.CanvasRenderingContext2D = function () {};
    w.CanvasRenderingContext2D.prototype.roundRect = function () { return this; };
    w.URL.createObjectURL = () => 'blob:stub'; w.URL.revokeObjectURL = () => {};
    w.confirm = () => false;            // 删除类按钮在测试里一律"点取消"
    const q = () => {}; w.console = { log: q, warn: q, error: q, info: q, debug: q };
  }
});
const w = dom.window, LS = w.localStorage;
const ctx = dom.getInternalVMContext();
const errors = [];
w.addEventListener('error', e => errors.push(String(e.message)));

let pass = 0, fail = 0;
const ok = (name, cond, extra) => {
  if (cond) { pass++; console.log('  ✅ ' + name); }
  else { fail++; console.log('  ❌ ' + name + (extra !== undefined ? '  <- ' + (typeof extra === 'string' ? extra : JSON.stringify(extra)) : '')); }
};
const section = t => console.log('\n' + t);
// 在 jsdom 的上下文里带超时地跑一段代码：死循环会抛超时错误，而不是把整个测试卡住
const timed = (code, ms) => {
  try { return { ok: true, value: vm.runInContext(code, ctx, { timeout: ms || 1500 }) }; }
  catch (e) { return { ok: false, err: String(e.message).slice(0, 80) }; }
};

setTimeout(async () => {
  const DS = w.DataStore, SE = w.StatsEngine, doc = w.document;
  try { w.Changelog.markSeen(w.Changelog.all()[0].id); w.closeModal(); } catch (e) {}
  const curMonth = w.getMonthKey(new w.Date().toISOString());
  const EXP = 'cat-child-1-1';
  const rec = (id, amount, extra) => Object.assign({ id, amount, categoryId: EXP, date: curMonth + '-10T12:00', note: '', tags: [], createdAt: curMonth + '-10T12:00:00.000Z' }, extra || {});
  const fresh = () => { DS.clearAll(); LS.removeItem('budgetAppDataCorrupt'); w.closeModal(); };
  const ledger = () => JSON.parse(DS.exportJSON());
  // 每个分类顺着 parentId 往上走，必须在有限步内走到头
  const acyclic = cats => {
    const byId = {}; cats.forEach(c => { byId[c.id] = c; });
    return cats.every(c => { let cur = c, n = 0; while (cur && cur.parentId && n++ < 200) cur = byId[cur.parentId]; return n < 200; });
  };

  /* ---------------- C-02 分类成环 ---------------- */
  section('【C-02】合并分类时不许选自己的子孙；成环数据不许卡死');
  fresh();
  const S = DS.addCategory({ name: 'S', icon: '📁', parentId: 'cat-root-1' });
  const D = DS.addCategory({ name: 'D', icon: '📂', parentId: S.id });
  w.mergeCategory(S.id);
  w.selectMergeTarget(D.id, 'D');
  w.confirmMergeCategory();
  ok('合并到自己的子孙被拒绝：D 的父级仍是 S', DS.getCategory(D.id) && DS.getCategory(D.id).parentId === S.id, DS.getCategory(D.id) && DS.getCategory(D.id).parentId);
  ok('被拒之后 S 还在', !!DS.getCategory(S.id));
  ok('D 没有变成自己的父级', !(DS.getCategory(D.id) && DS.getCategory(D.id).parentId === D.id));
  ok('getRootAncestorId(D) 能返回', timed('getRootAncestorId(' + JSON.stringify(D.id) + ')').ok);
  w.closeModal();

  fresh();
  DS._data.categories.push(
    { id: 'cyc-a', name: 'A', icon: 'x', color: '#6366F1', parentId: 'cyc-b', sortOrder: 90 },
    { id: 'cyc-b', name: 'B', icon: 'x', color: '#6366F1', parentId: 'cyc-a', sortOrder: 91 },
    { id: 'cyc-self', name: 'Self', icon: 'x', color: '#6366F1', parentId: 'cyc-self', sortOrder: 92 });
  ok('getRootAncestorId 在成环数据上也会结束', timed("getRootAncestorId('cyc-a')").ok);
  ok('getRootAncestor 在自指数据上也会结束', timed("getRootAncestor('cyc-self')").ok);
  ok('getCategoryFullPath 在成环数据上也会结束', timed("getCategoryFullPath('cyc-a')").ok);
  ok('getDescendantIds 在成环数据上也会结束', timed("DataStore.getDescendantIds('cyc-a')").ok);

  fresh();
  const cyc = ledger();
  cyc.categories.push(
    { id: 'cyc-a', name: 'A', icon: 'x', color: '#6366F1', parentId: 'cyc-b', sortOrder: 90 },
    { id: 'cyc-b', name: 'B', icon: 'x', color: '#6366F1', parentId: 'cyc-a', sortOrder: 91 },
    { id: 'cyc-self', name: 'Self', icon: 'x', color: '#6366F1', parentId: 'cyc-self', sortOrder: 92 });
  ok('导入带环的分类：导入本身成功', DS.importJSON(JSON.stringify(cyc), 'replace') === true);
  ok('导入之后每个分类都能走到根', acyclic(DS.getCategories()));
  ok('环里的分类都还在（只断开，不删）', ['cyc-a', 'cyc-b', 'cyc-self'].every(id => !!DS.getCategory(id)));

  fresh();
  const bl = ledger();
  const mk = (pX, pY) => { const l = JSON.parse(JSON.stringify(bl));
    l.categories.push({ id: 'mx', name: 'X', icon: 'x', color: '#6366F1', parentId: pX, sortOrder: 90 },
                      { id: 'my', name: 'Y', icon: 'x', color: '#6366F1', parentId: pY, sortOrder: 91 }); return l; };
  const merged = DS._merge3(mk(null, null), mk('my', null), mk(null, 'mx')).data;
  ok('两台设备各把 X、Y 挪进对方名下：合并结果没有环', acyclic(merged.categories));
  const merged2 = DS._merge3(mk(null, null), mk(null, 'mx'), mk('my', null)).data;
  ok('对调本机 / 云端，合并结果也没有环，且与上一种完全一致',
    acyclic(merged2.categories) && JSON.stringify(merged.categories.map(c => [c.id, c.parentId]).sort()) === JSON.stringify(merged2.categories.map(c => [c.id, c.parentId]).sort()));

  /* ---------------- C-03 / H-18 数据里的文字不许变成代码 ---------------- */
  section('【C-03 / H-18】外部数据里的文字：不许变成页面元素，不许执行，撇号不许弄坏按钮');
  fresh();
  const EVIL = "y');window.__pwn=1;//", APOS = "Mom's";
  const hl = ledger();
  hl.categories.push({ id: 'hostile-cat', name: '<b id="pwn_cat">c</b>', icon: '📁', color: '#6366F1', parentId: null, sortOrder: 99 });
  hl.records = [
    rec('hr1', 5, { categoryId: 'hostile-cat', note: '<img id="pwn_note" src=x>', tags: [APOS, EVIL] }),
    rec('hr2', 3, { note: 'plain', tags: [APOS] })
  ];
  hl.allTags = [APOS, EVIL];
  hl.splitBills = [{ id: 'hb1', amount: 100, date: curMonth + '-10T12:00', note: '', tag: 't', categoryId: EXP, payer: 'self',
    selfShare: 20, mode: 'equal', createdAt: curMonth + '-10T12:00:00.000Z', archived: false,
    participants: [
      { contactId: "c1');window.__pwn=2;//", name: "Al');window.__pwn=3;//", share: 40, paid: false, paidAmount: 0, unknown: false },
      { name: "D'Souza", share: 20, paid: false, paidAmount: 0, unknown: false },
      { name: '<i id="pwn_part">p</i>', share: 20, paid: false, paidAmount: 0, unknown: false }] }];
  // 其余几类带名字的东西：月账单分类、联系人、大额计划、分摊账单的备注和标签
  hl.billCategories = (hl.billCategories || []).concat([{ id: 'hostile-bill', name: '<u id="pwn_bill">b</u>', icon: '📌', color: '#6366F1' }]);
  hl.contacts = [{ id: 'hc1', name: '<u id="pwn_contact">c</u>' }];
  hl.purchasePlans = [{ id: 'hp1', name: '<u id="pwn_plan">p</u>', icon: '🎯', totalAmount: 1000, mode: 'save', startMonth: curMonth,
    months: 4, categoryId: '', status: 'active', overrides: {}, note: '<u id="pwn_pnote">n</u>', createdAt: curMonth + '-01T00:00:00' }];
  hl.splitBills[0].note = '<u id="pwn_bnote">n</u>';
  hl.splitBills[0].tag = '<u id="pwn_btag">t</u>';
  hl.whatIfParams = { categoryAdjustments: {}, globalAdjustment: { mode: 'amount', value: '"><i id="pwn_wi1">' },
    hypotheticalCategories: [{ icon: '"><i id="pwn_wi2">', name: '"><i id="pwn_wi3">', amount: '"><i id="pwn_wi4">', type: 'daily' }] };
  ok('导入含恶意文字的账本', DS.importJSON(JSON.stringify(hl), 'replace') === true);
  ok('参与人的 contactId 里的代码被清掉（变成匿名参与人）',
    (DS.getSplitBills ? DS.getSplitBills() : DS._data.splitBills)[0].participants.every(p => !p.contactId || /^[A-Za-z0-9_.:\-]{1,100}$/.test(p.contactId)));

  const handlers = () => Array.from(doc.querySelectorAll('[onclick],[onchange],[oninput]'));
  const scan = (label, cb) => {
    try { cb && cb(); } catch (e) { ok(label + '：能正常打开', false, String(e.message).slice(0, 80)); return; }
    const injected = Array.from(doc.querySelectorAll('[id^="pwn_"]')).map(e => e.id);
    ok(label + '：没有出现攻击者的元素', injected.length === 0, injected);
    const bad = [];
    handlers().forEach(el => ['onclick', 'onchange', 'oninput'].forEach(a => {
      const v = el.getAttribute(a); if (!v) return;
      try { new w.Function(v); } catch (e) { bad.push(a + ': ' + v.slice(0, 70)); }
    }));
    ok(label + '：每个按钮的脚本都合法（含撇号的名字不弄坏它）', bad.length === 0, bad.slice(0, 3));
    handlers().filter(el => /__pwn/.test(el.getAttribute('onclick') || '')).forEach(el => { try { el.click(); } catch (e) {} });
    ok(label + '：点完带攻击者名字的按钮后，没有任何代码被执行', w.__pwn === undefined, w.__pwn);
  };
  scan('设置页', () => w.navigateTo('settings'));
  scan('流水页', () => w.navigateTo('records'));
  scan('分类页', () => w.navigateTo('categories'));
  scan('假设分析页', () => w.navigateTo('whatif'));
  scan('总览页', () => w.navigateTo('overview'));
  scan('统计页', () => w.navigateTo('stats'));
  scan('月度报告页', () => w.navigateTo('report'));
  scan('追账中心', () => w.openSplitCenter());
  w.closeModal();
  scan('分摊账单编辑器', () => w.openSplitBillEditor('hb1', true));
  w.closeModal();
  scan('大额计划中心', () => w.openPlanCenter());
  w.closeModal();
  scan('月账单中心', () => w.openBillsCenter());
  w.closeModal();
  scan('流水原始数据弹窗', () => w.showRecordRaw('hr1'));
  w.closeModal();
  scan('编辑流水弹窗', () => w.openEditRecord('hr1'));
  w.closeModal();
  scan('选标签弹窗', () => w.openTagPicker([], () => {}));
  w.closeModal();
  // 记账页的"已选标签"小方块
  // renderAddPage() starts the form from scratch, so the tags go in afterwards
  scan('记账页（已选含撇号标签）', () => { w.navigateTo('add'); w._addRecordTags = [APOS, EVIL]; w.renderAddTagsDisplay ? w.renderAddTagsDisplay() : null; });
  const chip = Array.from(doc.querySelectorAll('[onclick*="removeAddTag"]'))[0];
  ok('记账页里有 ✕ 按钮可点', !!chip);
  // scan() 已经点过带攻击者字符串的那个 ✕（它删掉了那个标签、没有执行任何代码），剩下的就是 Mom's
  ok('攻击者字符串那个标签被当成普通文字删掉了', (w._addRecordTags || []).indexOf(EVIL) === -1, w._addRecordTags);
  if (chip) { chip.click(); ok('点 ✕ 真的能删掉含撇号的标签（Mom\'s）', (w._addRecordTags || []).indexOf(APOS) === -1, w._addRecordTags); }
  w.navigateTo('overview');

  /* ---------------- H-22 本地账本损坏 ---------------- */
  section('【H-22】本地账本 JSON 损坏：不许被空账本悄悄覆盖');
  fresh();
  const BAD = '{"records":[{"id":"x1","amount":5';
  LS.setItem('budgetAppData', BAD);
  w._dataLoadError = false;
  DS.init();
  ok('原始内容被另存了一份', LS.getItem('budgetAppDataCorrupt') === BAD, (LS.getItem('budgetAppDataCorrupt') || '').slice(0, 40));
  ok('没有立刻用空账本把它覆盖掉', LS.getItem('budgetAppData') === BAD, (LS.getItem('budgetAppData') || '').slice(0, 40));
  ok('界面能知道出了问题（window._dataLoadError）', w._dataLoadError === true);
  ok('当前是一个可用的空账本', Array.isArray(DS.getRecords()) && DS.getRecords().length === 0);
  // 再坏一次，不许把第一份备份冲掉
  LS.setItem('budgetAppData', '{"again"'); DS.init();
  ok('第二次损坏不会覆盖第一份备份', LS.getItem('budgetAppDataCorrupt') === BAD);
  fresh();

  /* ---------------- H-23 / H-24 导入 ---------------- */
  section('【H-23】替换导入：畸形文件不许清空账本');
  fresh();
  DS.addRecord(rec('keep1', 11)); DS.addRecord(rec('keep2', 22));
  const cats0 = ledger().categories;
  ok('records / categories 不是数组 → 返回 false', DS.importJSON('{"records":{},"categories":{}}', 'replace') === false);
  ok('……账本原封不动', DS.getRecords().length === 2, DS.getRecords().length);
  ok('合并模式同样拒绝', DS.importJSON('{"records":{},"categories":{}}', 'merge') === false && DS.getRecords().length === 2);
  ok('文件里的记录全部不合格 → 中止，不清库',
    DS.importJSON(JSON.stringify({ records: [{ id: 'bad id!', amount: 1 }], categories: cats0 }), 'replace') === false && DS.getRecords().length === 2, DS.getRecords().length);
  ok('真的是空备份（records: []）仍然可以替换', DS.importJSON(JSON.stringify({ records: [], categories: cats0 }), 'replace') === true && DS.getRecords().length === 0);

  section('【H-24】导入的记录：金额、日期不合格不许混进来');
  fresh();
  const dirty = ledger();
  dirty.records = [
    rec('g1', 10),
    rec('s1', '12.5'),                                   // 数字写成了字符串：能认出来就转成数字
    rec('n1', null),                                     // 没有金额：丢
    rec('t1', 'abc'),                                    // 不是数字：丢
    Object.assign(rec('d1', 5), { date: undefined, createdAt: undefined })   // 没有任何日期：丢
  ];
  ok('导入含不合格记录的账本成功', DS.importJSON(JSON.stringify(dirty), 'replace') === true);
  const ids = DS.getRecords().map(r => r.id).sort();
  ok('只留下 g1、s1', JSON.stringify(ids) === JSON.stringify(['g1', 's1']), ids);
  ok('所有金额都是有限的数字', DS.getRecords().every(r => typeof r.amount === 'number' && isFinite(r.amount)));
  ok('字符串 "12.5" 被转成了 12.5', (DS.getRecord('s1') || {}).amount === 12.5, (DS.getRecord('s1') || {}).amount);
  ok('导出 CSV 不再抛错', timed('DataStore.exportCSV().length').ok);
  ok('当月总支出是有限的数字', isFinite(SE.getMonthTotal(curMonth)), SE.getMonthTotal(curMonth));
  ok('界面能拿到"跳过了几条"', DS.lastImportDropped === 3, DS.lastImportDropped);

  /* ---------------- H-26 月收入 ---------------- */
  section('【H-26】月收入：用户设的 0 不许被预算改回去');
  fresh();
  DS.setBudget(curMonth, 500);
  DS.setMonthlyIncome(curMonth, 0);
  DS.reload();
  ok('设成 0 的月收入，重新加载后还是 0', DS.getMonthlyIncome(curMonth) === 0, DS.getMonthlyIncome(curMonth));
  delete DS._data.monthlyIncome[curMonth]; DS.save(); DS.reload();
  ok('完全没设过月收入、只有预算：仍然沿用预算（老用户的迁移没丢）', DS.getMonthlyIncome(curMonth) === 500, DS.getMonthlyIncome(curMonth));

  /* ---------------- H-27 删除根分类 ---------------- */
  section('【H-27】删除有子分类的根分类并把子分类提到顶层');
  fresh();
  const kids = DS.getChildren('cat-root-1').map(c => c.id);
  ok('前提：默认的 餐饮 下面有子分类', kids.length > 0);
  w.confirmDeleteCategory('cat-root-1', 'moveToParent');
  ok('根分类真的被删掉了', !DS.getCategory('cat-root-1'));
  ok('子分类都还在，而且成了顶层分类', kids.every(id => DS.getCategory(id) && !DS.getCategory(id).parentId));
  const lastToast = doc.querySelector('#toastContainer .toast:last-child');
  ok('提示不是错误提示', lastToast && !/error/.test(lastToast.className), lastToast && lastToast.className);
  fresh();
  ok('数据层：moveToParent 为 null 表示"提到顶层"，返回 true', DS.deleteCategory('cat-root-1', { moveToParent: null }) === true);

  /* ---------------- H-29 撤销删除 ---------------- */
  section('【H-29】5 秒内连续删两条：撤销只能撤回它自己那一条');
  fresh();
  // addRecord() 会重新生成编号，这里要固定的编号，所以直接放进账本
  DS._data.records.push(rec('ua', 31), rec('ub', 32)); DS.save();
  doc.getElementById('toastContainer').innerHTML = '';
  w.confirmDeleteRecord('ua');
  w.confirmDeleteRecord('ub');
  const toasts = Array.from(doc.querySelectorAll('#toastContainer .toast'));
  ok('一共弹出两条"已删除"提示', toasts.length === 2, toasts.length);
  ok('第一条提示上的"撤销"按钮已经失效（那条记录已经定稿）', toasts[0] && !toasts[0].querySelector('button'));
  ok('数据层：撤销 ua 失败，且不会误恢复 ub', DS.undoDelete('ua') === false && !DS.getRecord('ub'));
  const btnB = toasts[1] && toasts[1].querySelector('button');
  if (btnB) btnB.click();
  ok('点第二条提示的"撤销"，恢复的是 ub', !!DS.getRecord('ub') && !DS.getRecord('ua'), DS.getRecords().map(r => r.id));
  ok('不带编号的老调用方式（undoDelete()）仍然可用', (function () { w.confirmDeleteRecord('ub'); return DS.undoDelete() === true && !!DS.getRecord('ub'); })());

  /* ---------------- H-25 多标签页 ---------------- */
  section('【H-25】另一个标签页写入了数据：这边要跟上，不能后写覆盖');
  fresh();
  DS.addRecord(rec('x1', 1, { note: 'mine' }));      // addRecord() makes its own id, so match by note
  const other = JSON.parse(LS.getItem('budgetAppData'));
  other.records.push(rec('from-tab-b', 7, { note: 'from tab B' }));
  LS.setItem('budgetAppData', JSON.stringify(other));
  w.dispatchEvent(new w.StorageEvent('storage', { key: 'budgetAppData', newValue: LS.getItem('budgetAppData'), storageArea: LS }));
  ok('收到另一个标签页的存储事件后，这边也有那条记录', !!DS.getRecord('from-tab-b'), DS.getRecords().map(r => r.id));
  DS.addRecord(rec('x2', 2, { note: 'after' }));
  const savedNotes = JSON.parse(LS.getItem('budgetAppData')).records.map(r => r.note).sort();
  ok('接着在这边记一笔，存下来的账本里两边的记录都在', ['after', 'from tab B', 'mine'].every(n => savedNotes.indexOf(n) !== -1), savedNotes);
  const before = DS.getRecords().length;
  w.dispatchEvent(new w.StorageEvent('storage', { key: 'someOtherKey', newValue: 'x', storageArea: LS }));
  w.dispatchEvent(new w.StorageEvent('storage', { key: 'budgetAppData', newValue: null, storageArea: LS }));
  ok('别的键、或者"被删除"的事件不会让这边重载或清空', DS.getRecords().length === before, DS.getRecords().length);

  /* ---------------- H-21 云端返回的 version ---------------- */
  section('【H-21】云端返回的 version 必须是整数，不许把别的东西带进页面');
  const rpc = w.CloudSync && w.CloudSync._t && w.CloudSync._t.rpc;
  ok('测试钩子 CloudSync._t.rpc 存在', typeof rpc === 'function');
  if (typeof rpc === 'function') {
    const reply = body => { w.fetch = async () => ({ ok: true, status: 200, json: async () => body, text: async () => '' }); };
    const attempt = async body => { reply(body); try { return { out: await rpc('ledger_push', {}) }; } catch (e) { return { err: e }; } };
    let r = await attempt({ status: 'ok', version: '<img id="pwn_ver" src=x>' });
    ok('version 是一段 HTML → 被拒绝', !!r.err, r.out);
    r = await attempt({ status: 'ok', version: 1.5 });
    ok('version 是小数 → 被拒绝', !!r.err);
    r = await attempt({ status: 'ok', version: -3 });
    ok('version 是负数 → 被拒绝', !!r.err);
    r = await attempt({ status: 'ok', versions: [{ version: 2, at: 'x' }, { version: '<b>', at: 'y' }] });
    ok('历史列表里夹着一个非整数的 version → 被拒绝', !!r.err);
    r = await attempt({ status: 'ok', version: 7 });
    ok('正常的整数 version 照常通过', !r.err && r.out && r.out.version === 7, r.err && r.err.code);
    r = await attempt({ status: 'none' });
    ok('没有 version 字段的回复（例如 none）照常通过', !r.err && r.out && r.out.status === 'none');
  }

  /* ---------------- H-22 端到端：真的"打开页面"，本地账本是坏的 ---------------- */
  section('【H-22 端到端】打开页面时本地账本已损坏：弹窗说明，原文不被覆盖');
  const BAD2 = '{"records":[{"id":"a","amount":5,"categoryId":';
  const dom2 = new JSDOM(html, {
    runScripts: 'dangerously', pretendToBeVisual: true, url: 'http://localhost/',
    beforeParse(w2) {
      const s2 = stub();
      w2.HTMLCanvasElement.prototype.getContext = function () { s2.canvas = this; return s2; };
      w2.CanvasRenderingContext2D = function () {};
      w2.CanvasRenderingContext2D.prototype.roundRect = function () { return this; };
      w2.localStorage.setItem('budgetAppData', BAD2);
      const q = () => {}; w2.console = { log: q, warn: q, error: q, info: q, debug: q };
    }
  });
  await new Promise(r => setTimeout(r, 1500));
  const w2 = dom2.window, ov = w2.document.getElementById('modalOverlay');
  ok('弹出了"账本读取失败"', !!(ov && ov.classList.contains('open') && /账本读取失败/.test(ov.textContent)), ov && ov.textContent.slice(0, 40));
  ok('说明里讲了数据没有丢（"没有被删除"）', !!(ov && /没有被删除/.test(ov.textContent)));
  ok('损坏的原文仍在原处，没有被空账本覆盖', w2.localStorage.getItem('budgetAppData') === BAD2);
  ok('另外已经另存了一份', w2.localStorage.getItem('budgetAppDataCorrupt') === BAD2);
  w2.close();

  console.log('\n页面脚本错误: ' + JSON.stringify(errors.slice(0, 3)));
  console.log('\n===== 结果: ' + pass + ' 通过 / ' + fail + ' 失败 =====');
  process.exit(fail ? 1 : 0);
}, 1500);
