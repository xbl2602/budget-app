/* ============================================================
   合并分类：选了目标之后，确认按钮要一直看得出"合并到谁"、且点得动
   ------------------------------------------------------------
   旧毛病（用户反馈"合并分类的按钮失效了？"，浏览器里也复现）：
   M1 选好目标后按钮只写"合并到"，没写合并到谁——选没选上看不出来
   M2 选好目标后，再点一下别的分类的展开箭头，按钮变回灰色的
      "请先选择目标分类"，可内部还记着刚才的目标——看起来就是按钮坏了
   M3 选好目标后在搜索框里输入文字，同样变灰

   驱动的是真实界面：editCategory → 点"合并到…" → 点分类行 / 箭头 / 搜索框 →
   点确认按钮。先在没修的代码上跑过，确认 M1–M3 会 FAIL。

   跑法： bash build.sh && node tests/merge-category-test.js   (需要 jsdom)
   ============================================================ */
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const noop = () => {};
const ctx = new Proxy({}, {
  get: (t, k) => (k === 'measureText' ? () => ({ width: 10 })
    : (k === 'createLinearGradient' || k === 'createRadialGradient') ? () => ({ addColorStop: noop })
    : (k in t ? t[k] : noop)),
  set: (t, k, v) => { t[k] = v; return true; }
});
const dom = new JSDOM(html, {
  runScripts: 'dangerously', pretendToBeVisual: true, url: 'http://localhost/',
  beforeParse(w) {
    w.HTMLCanvasElement.prototype.getContext = () => ctx;
    w.URL.createObjectURL = () => 'blob:stub'; w.URL.revokeObjectURL = noop;
    w.confirm = () => false;
    const q = () => {}; w.console = { log: q, warn: q, error: q, info: q, debug: q };
  }
});
const w = dom.window, doc = w.document;
const pageErrors = [];
w.addEventListener('error', e => pageErrors.push(String(e.message)));

let pass = 0, fail = 0;
const ok = (name, cond, extra) => {
  if (cond) { pass++; console.log('  ✅ ' + name); }
  else { fail++; console.log('  ❌ ' + name + (extra !== undefined ? '  <- ' + (typeof extra === 'string' ? extra : JSON.stringify(extra)) : '')); }
};
const section = t => console.log('\n' + t);
const $ = id => doc.getElementById(id);
const click = el => el.dispatchEvent(new w.MouseEvent('click', { bubbles: true, cancelable: true }));

setTimeout(() => {
  try { w.Changelog.markSeen(w.Changelog.all()[0].id); } catch (e) { /* not booted */ }
  w.closeModal();
  const DS = w.DataStore;
  const food = DS.getExpenseRootCategories().find(c => c.name === '餐饮');
  const kids = DS.getChildren(food.id);
  const lunch = kids.find(c => c.name === '午餐');
  const shopping = DS.getExpenseRootCategories().find(c => c.name === '购物');
  const transport = DS.getExpenseRootCategories().find(c => c.name === '交通');
  const full = c => c.icon + ' ' + c.name;

  const btn = () => $('mergeConfirmBtn');
  const row = id => doc.querySelector('#catTreeHost [data-catid="' + id + '"] .cat-header');
  const arrow = () => doc.querySelector('#catTreeHost [data-toggle]');
  const search = text => { const i = $('catTreeSearchInput'); i.value = text; i.dispatchEvent(new w.Event('input', { bubbles: true })); };
  function openMerge(sourceId) {
    w.closeModal();
    w.editCategory(sourceId);
    const b = Array.from(doc.querySelectorAll('#modalContent button')).find(x => /合并|Merge/.test(x.textContent));
    click(b);
  }

  ok('测试数据在：午餐、购物、交通都找得到', !!(lunch && shopping && transport));

  section('M1 选好目标后，按钮上写着合并到谁');
  openMerge(lunch.id);
  ok('还没选时按钮是灰的', btn().disabled === true);
  click(row(shopping.id));
  ok('选了之后按钮可点', btn().disabled === false);
  ok('按钮上写着「购物」', btn().textContent.indexOf(full(shopping)) !== -1, btn().textContent);

  section('M1b 改选别的，按钮跟着换');
  click(row(transport.id));
  ok('按钮上换成「交通」', btn().textContent.indexOf(full(transport)) !== -1 && btn().textContent.indexOf('购物') === -1, btn().textContent);

  section('M2 选好后点别的分类的展开箭头，按钮不能变回灰色');
  click(arrow());
  ok('按钮还是可点的', btn().disabled === false, { disabled: btn().disabled, text: btn().textContent });
  ok('按钮上还写着「交通」', btn().textContent.indexOf(full(transport)) !== -1, btn().textContent);

  section('M3 选好后在搜索框输入文字，按钮不能变回灰色');
  search('购');
  ok('按钮还是可点的', btn().disabled === false, { disabled: btn().disabled, text: btn().textContent });
  ok('按钮上还写着「交通」', btn().textContent.indexOf(full(transport)) !== -1, btn().textContent);

  section('M4 重新打开合并框，不会带着上一次选的目标');
  openMerge(lunch.id);
  ok('重新打开时按钮是灰的、没有旧目标', btn().disabled === true && btn().textContent.indexOf('交通') === -1, { disabled: btn().disabled, text: btn().textContent });

  section('M5 点确认：记录改归到目标，原分类被删（原有行为不变）');
  DS.addRecord({ type: 'expense', amount: 12.5, categoryId: lunch.id, date: '2026-10-13T12:00', note: 'merge probe' });
  openMerge(lunch.id);
  click(row(shopping.id));
  const before = DS.getCategories().length;
  click(btn());
  ok('原分类不见了', !DS.getCategory(lunch.id));
  ok('分类少了一个', DS.getCategories().length === before - 1);
  const moved = DS.getRecords().find(r => r.note === 'merge probe');
  ok('那条记录改归到「购物」', !!moved && moved.categoryId === shopping.id);
  ok('弹窗关了', !$('modalOverlay').classList.contains('open'));

  section('M6 合并到自己名下更深一层的分类仍然被拒绝（上个版本修的，别退回去）');
  const mid = kids.find(c => c.name === '早餐');
  const deep = DS.addCategory ? DS.addCategory({ name: '深一层', icon: '🍳', color: '#123456', parentId: mid.id, kind: 'expense' }) : null;
  const deepId = deep && (deep.id || deep);
  if (deepId && DS.getCategory(deepId)) {
    openMerge(mid.id);
    // 源分类自己的子树在根层被藏起来，但挂在别的根下面的情形可以直接调函数
    w.selectMergeTarget(deepId, '', 'x');
    ok('选自己的子分类：按钮是灰的', btn().disabled === true, { disabled: btn().disabled, text: btn().textContent });
    const n0 = DS.getCategories().length;
    w.confirmMergeCategory();
    ok('强行确认也不会合并', DS.getCategories().length === n0 && !!DS.getCategory(mid.id));
  } else {
    ok('（addCategory 不可用，跳过 M6）', true);
  }

  ok('过程中页面没有报错', pageErrors.length === 0, pageErrors);
  console.log('\n结果: ' + pass + ' 通过 / ' + fail + ' 失败');
  process.exit(fail ? 1 : 0);
}, 600);
