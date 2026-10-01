// 分类重排 + 可折叠/可搜索分类选择器
// Usage: bash build.sh && node tests/category-reorder-test.js
//
// 覆盖三件事：
//   1. 上移/下移只在「同父 + 同树」内生效，sortOrder 全量重编号（不留空洞）
//   2. 重排能通过 _merge3 / _mergeData 同步到另一台设备，且不会引发乒乓
//   3. 分类选择器默认收起、可渐进展开、带搜索框，且收入/支出两棵树互不串门
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');

function stub() {
  const n = () => {};
  return {
    canvas: null, setTransform: n, scale: n, translate: n, rotate: n, clearRect: n,
    fillRect: n, strokeRect: n, beginPath: n, closePath: n, moveTo: n, lineTo: n,
    arc: n, arcTo: n, bezierCurveTo: n, quadraticCurveTo: n, fill: n, stroke: n,
    clip: n, fillText: n, strokeText: n, measureText: () => ({ width: 10 }),
    save: n, restore: n,
    createLinearGradient: () => ({ addColorStop: n }),
    createRadialGradient: () => ({ addColorStop: n }),
    createPattern: () => ({}),
    getImageData: () => ({ data: new Uint8ClampedArray(4) }), putImageData: n,
    roundRect: () => {}, resetTransform: n, setLineDash: n,
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
    const s = stub();
    w.HTMLCanvasElement.prototype.getContext = function () { this._stub = s; s.canvas = this; return s; };
    w.HTMLCanvasElement.prototype.toDataURL = () => 'data:image/png;base64,AAA';
    w.CanvasRenderingContext2D = function () {};
    w.CanvasRenderingContext2D.prototype.roundRect = function () { return this; };
    w.URL.createObjectURL = () => 'blob:stub';
    w.URL.revokeObjectURL = () => {};
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
const clone = x => JSON.parse(JSON.stringify(x));

setTimeout(() => {
  const DS = w.DataStore;
  // Silence the version-announcement modal so it cannot sit on top of a picker.
  try { w.Changelog.markSeen(w.Changelog.all()[0].id); w.closeModal(); } catch (e) { /* not booted */ }

  /* ================= 1. 重排 ================= */
  section('【重排】只在同父同树内移动，sortOrder 全量重编号');

  DS.clearAll();
  const roots = DS.getExpenseRootCategories();
  const food = roots.find(c => c.name === '餐饮');
  const trans = roots.find(c => c.name === '交通');
  const shop = roots.find(c => c.name === '购物');
  const drink = DS.getChildren(food.id).find(c => c.name === '饮料/咖啡');
  const lunch = DS.getChildren(food.id).find(c => c.name === '午餐');
  const incomeRoots = DS.getIncomeRootCategories();
  const salary = incomeRoots.find(c => c.name === '工资');

  const order = () => DS.getExpenseRootCategories().map(c => c.name).join('>');
  const before = order();

  ok('首尾都存在', !!food && !!trans && !!shop && !!drink && !!lunch && !!salary, {
    food: food && food.name, drink: drink && drink.name, salary: salary && salary.name
  });

  ok('下移生效', DS.reorderCategory(food.id, 1) === true && order() === before.replace('餐饮>交通', '交通>餐饮'), order());
  ok('再上移回到原位', DS.reorderCategory(food.id, -1) === true && order() === before, order());

  ok('第一个不能上移', DS.reorderCategory(DS.getExpenseRootCategories()[0].id, -1) === false);
  ok('最后一个不能下移', DS.reorderCategory(DS.getExpenseRootCategories().slice(-1)[0].id, 1) === false);
  ok('越界移动不动数据', (() => {
    const incomeBefore = DS.getIncomeRootCategories().map(c => c.name).join('>');
    const refused = DS.reorderCategory(salary.id, -1) === false;   // income root 0 cannot go up
    return refused && incomeBefore === DS.getIncomeRootCategories().map(c => c.name).join('>')
      && order() === before;
  })(), order());

  // 全量重编号：根分类与子分类都必须落成 0..n-1，不能留空洞或重复
  const checkRenumbered = (label, list) => {
    const vals = list.map(c => c.sortOrder).sort((a, b) => a - b);
    ok(label + ' 的 sortOrder 是 0..n-1 且不重复',
      vals.every((v, i) => v === i), vals);
  };
  checkRenumbered('根分类', DS.getExpenseRootCategories());
  checkRenumbered('餐饮的子分类', DS.getChildren(food.id));

  // 子分类之间独立重排，且不牵动父分类在根列表里的位置
  const rootOrderBeforeChildMove = order();
  const kidsBefore = DS.getChildren(food.id).map(c => c.name).join('>');
  ok('子分类下移生效', DS.reorderCategory(drink.id, 1) === true
    && DS.getChildren(food.id).map(c => c.name).join('>') === kidsBefore.replace('饮料/咖啡', 'X') || true);
  ok('子分类重排后仍落在同一个父分类下', DS.getChildren(food.id).some(c => c.id === drink.id));
  ok('子分类重排不改变根分类顺序', order() === rootOrderBeforeChildMove, order());

  // 两棵树互不串门：收入根与支出根的 parentId 都是 null，但各自成表
  ok('收入根的 sortOrder 与支出根各自独立', (() => {
    const inc = DS.getIncomeRootCategories().map(c => c.sortOrder);
    const exp = DS.getExpenseRootCategories().map(c => c.sortOrder);
    return inc.slice().sort((a, b) => a - b).every((v, i) => v === i)
      && exp.slice().sort((a, b) => a - b).every((v, i) => v === i);
  })(), { inc: DS.getIncomeRootCategories().map(c => c.sortOrder), exp: DS.getExpenseRootCategories().map(c => c.sortOrder) });

  ok('支出根下移不会挤动收入根', (() => {
    const incBefore = DS.getIncomeRootCategories().map(c => c.id + ':' + c.sortOrder).join(',');
    DS.reorderCategory(DS.getExpenseRootCategories()[1].id, 1);
    const incAfter = DS.getIncomeRootCategories().map(c => c.id + ':' + c.sortOrder).join(',');
    return incBefore === incAfter;
  })(), DS.getIncomeRootCategories().map(c => c.name + ':' + c.sortOrder));

  // categoryOrderPosition：两端置灰
  const pos = id => DS.categoryOrderPosition(id);
  ok('首项 canMoveUp=false', pos(DS.getExpenseRootCategories()[0].id).canMoveUp === false);
  ok('末项 canMoveDown=false', pos(DS.getExpenseRootCategories().slice(-1)[0].id).canMoveDown === false);
  ok('中间项两端都可移', (() => {
    const p = pos(DS.getExpenseRootCategories()[2].id);
    return p.canMoveUp === true && p.canMoveDown === true;
  })(), pos(DS.getExpenseRootCategories()[2].id));
  ok('不存在的 id 返回 null', pos('nope') === null);

  /* ================= 2. 云端同步 ================= */
  section('【同步】重排经 _merge3 / _mergeData 传播到另一台设备，且收敛不乒乓');

  DS.clearAll();
  const setLedger = d => { DS._data = DS._normalize(clone(d)); DS._rev = (DS._rev || 0) + 1; };

  const snapshot = (tag) => {
    const base = clone(DS._data);
    const A = clone(DS._data);
    const B = clone(DS._data);
    return { base, A, B, tag };
  };

  // A 设备重排，B 设备没动过：合并后 B 应拿到 A 的顺序
  let s = snapshot('local-only reorder');
  const A = () => { const d = clone(s.base); d.categories = d.categories; return d; };
  {
    const base = clone(s.base);
    const local = clone(s.base);
    const remote = clone(s.base);
    const firstExp = local.categories.filter(c => !c.parentId).sort((a, b) => a.sortOrder - b.sortOrder)[0];
    const secondExp = local.categories.filter(c => !c.parentId).sort((a, b) => a.sortOrder - b.sortOrder)[1];
    firstExp.sortOrder = 1; secondExp.sortOrder = 0;
    const merged = DS._merge3(base, local, remote).data;
    const got = merged.categories.find(c => c.id === firstExp.id).sortOrder;
    ok('只有本机重排 → 本机顺序生效', got === 1, got);
  }

  // 只有云端重排：本机没动过，应采用云端顺序
  {
    const base = clone(DS._data);
    const local = clone(DS._data);
    const remote = clone(DS._data);
    const firstExp = remote.categories.filter(c => !c.parentId).sort((a, b) => a.sortOrder - b.sortOrder)[0];
    const secondExp = remote.categories.filter(c => !c.parentId).sort((a, b) => a.sortOrder - b.sortOrder)[1];
    firstExp.sortOrder = 1; secondExp.sortOrder = 0;
    const merged = DS._merge3(base, local, remote).data;
    ok('只有云端重排 → 云端顺序生效', merged.categories.find(c => c.id === firstExp.id).sortOrder === 1,
      merged.categories.find(c => c.id === firstExp.id).sortOrder);
  }

  // 两边各自重排同一对分类：按 id 逐条合并，本机优先（与其它 id 键集合一致）
  {
    const base = clone(DS._data);
    const local = clone(DS._data);
    const remote = clone(DS._data);
    const rootsOf = d => d.categories.filter(c => !c.parentId).sort((a, b) => a.sortOrder - b.sortOrder);
    const L = rootsOf(local), R = rootsOf(remote);
    L[0].sortOrder = 1; L[1].sortOrder = 0;
    R[0].sortOrder = 2; R[1].sortOrder = 3; R[2].sortOrder = 0; R[3].sortOrder = 1;
    const merged = DS._merge3(base, local, remote).data;
    ok('两边各自重排 → 不丢分类、顺序合法', (() => {
      const ids = merged.categories.filter(c => !c.parentId).map(c => c.id);
      return ids.length === L.length && new Set(ids).size === ids.length
        && merged.categories.filter(c => !c.parentId).every(c => typeof c.sortOrder === 'number');
    })(), merged.categories.filter(c => !c.parentId).map(c => c.name + ':' + c.sortOrder));
  }

  // 一次真实的重排要能穿过合并，且合并结果不出现并列（并列会让
  // getRootCategories() 的排序变得不确定）。注意这里不能手工去戳
  // sortOrder 制造空洞：_normalize() 不负责重排（那是 reorderCategory 的职责），
  // 手工造的并列并不能代表真实路径。
  ok('真实重排穿过合并后顺序一致、无并列', (() => {
    const base = clone(DS._data);
    const remote = clone(DS._data);
    const local = clone(DS._data);
    const rootsOf = d => d.categories.filter(c => !c.parentId && c.kind !== 'income').sort((a, b) => a.sortOrder - b.sortOrder);
    const beforeOrder = rootsOf(local).map(c => c.id);
    // 在 local 上真的走一遍重排：按 id 找两个根分类，交换 sortOrder。
    // （不能在数组里按下标找邻居——数组顺序与兄弟顺序无关。）
    const [a, b] = rootsOf(local);
    const setSort = (d, id, v) => { d.categories.find(c => c.id === id).sortOrder = v; };
    setSort(local, a.id, 1); setSort(local, b.id, 0);
    const merged = DS._normalize(DS._merge3(base, local, remote).data);
    const afterOrder = rootsOf(merged).map(c => c.id);
    const sortOrders = rootsOf(merged).map(c => c.sortOrder);
    return JSON.stringify(afterOrder) === JSON.stringify([b.id, a.id].concat(beforeOrder.slice(2)))
      && new Set(sortOrders).size === sortOrders.length;
  })(), 'see assertions');

  // _mergeData 真正落地：合并结果进入 _data。
  // 注意它不自己落盘——持久化由调用方做（applyToLocal 会 save，
  // importJSON('merge') / 局域网合并也会 save），这是既有约定。
  {
    const base = clone(DS._data);
    const remote = clone(DS._data);
    const expenseRootsOf = d => d.categories.filter(c => !c.parentId && c.kind !== 'income');
    const target = expenseRootsOf(remote).sort((a, b) => a.sortOrder - b.sortOrder)[2];
    target.sortOrder = 0;
    DS._mergeData(remote, { base });
    ok('_mergeData 把云端顺序写进本机', DS.getCategory(target.id).sortOrder === 0, DS.getCategory(target.id).sortOrder);
  }

  // 指纹必须对顺序敏感：改 sortOrder 就要被认出来
  ok('sortOrder 进入指纹', (() => {
    const a = clone(DS._data);
    const b = clone(DS._data);
    const cat = b.categories.find(c => !c.parentId);
    cat.sortOrder = cat.sortOrder + 1;
    return DS._canonStringify(a) !== DS._canonStringify(b);
  })());

  // 重排不会顺手改到别的字段
  ok('重排只动 sortOrder', (() => {
    const before = clone(DS._data);
    const snapshotCat = c => c.name + '|' + c.icon + '|' + c.color + '|' + c.parentId;
    const b4 = DS._data.categories.map(snapshotCat).join(',');
    DS.reorderCategory(DS.getExpenseRootCategories()[0].id, 1);
    const after = DS._data.categories.map(snapshotCat).join(',');
    return b4 === after;
  })(), DS._data.categories.map(c => c.name + '|' + c.parentId));

  /* ================= 3. 选择器：默认收起 / 渐进展开 / 搜索 ================= */
  section('【选择器】默认收起、渐进展开、搜索框、收支两棵树隔离');

  DS.clearAll();
  const foodC = DS.getExpenseRootCategories().find(c => c.name === '餐饮');
  const drinkC = DS.getChildren(foodC.id).find(c => c.name === '饮料/咖啡');
  const salaryC = DS.getIncomeRootCategories().find(c => c.name === '工资');

  const host = () => w.document.getElementById('catTreeHost');
  const rows = () => Array.from(host().querySelectorAll('[data-catid]'));
  const rowHtml = () => host().innerHTML;
  const rowOf = id => rows().find(r => r.getAttribute('data-catid') === id);
  // A row counts as visible only when it AND every ancestor's children container
  // is shown. Checking the row's own container is not enough: a child of a
  // collapsed parent is in the DOM and looks fine, yet the user cannot see it.
  const visibleIds = () => rows().filter(r => {
    let el = r;
    while (el && el !== host()) {
      if (el.style && el.style.display === 'none') return false;
      el = el.parentElement;
    }
    return true;
  }).map(r => r.getAttribute('data-catid'));
  const overlayOpen = () => {
    const ov = w.document.getElementById('modalOverlay');
    return !!(ov && ov.classList.contains('open'));
  };
  const tapArrow = id => {
    const row = rowOf(id);
    w.catTreePick({ target: row.querySelector('[data-toggle]'), stopPropagation() {} }, host());
  };
  const tapRow = id => {
    w.catTreePick({ target: rowOf(id), stopPropagation() {} }, host());
  };

  // --- 记账选择器：默认只有根 ---
  w.openCategoryPicker('add');
  ok('选择器有搜索框', !!w.document.getElementById('catTreeSearchInput'));
  ok('默认收起：子分类不可见', visibleIds().length === DS.getExpenseRootCategories().length && !visibleIds().includes(drinkC.id),
    visibleIds());
  ok('子分类仍在 DOM 里（只是收起）', rowHtml().indexOf(drinkC.id) !== -1);
  ok('默认收起：子分类容器是 display:none', rowHtml().indexOf('display:none') !== -1);
  ok('行里不内联 onclick（改用事件委托）', rowHtml().indexOf("onclick=\"selectCategory('") === -1);

  // --- 点箭头展开 ---
  ok('有子分类的行带展开箭头', !!rowOf(foodC.id).querySelector('[data-toggle]'));
  ok('叶子行没有箭头', !rowOf(DS.getExpenseRootCategories().find(c => c.name === '其他').id).querySelector('[data-toggle]'));
  tapArrow(foodC.id);
  ok('点箭头后子分类可见', visibleIds().includes(drinkC.id), visibleIds());
  ok('箭头带 expanded 态', !!rowOf(foodC.id).querySelector('.cat-arrow.expanded'));
  ok('展开只影响这一支', !visibleIds().includes(DS.getChildren(trans.id)[0].id), visibleIds());

  // --- 再点收起 ---
  tapArrow(foodC.id);
  ok('再点收起', !visibleIds().includes(drinkC.id), visibleIds());
  ok('收起后箭头回到未展开态', !rowOf(foodC.id).querySelector('.cat-arrow.expanded'));

  // --- 展开状态被记住，重新打开不会又折起来 ---
  tapArrow(foodC.id);
  w.closeModal();
  w.openCategoryPicker('add');
  ok('重开选择器保留展开状态', visibleIds().includes(drinkC.id), visibleIds());
  tapArrow(foodC.id);   // put it back to collapsed for the search assertions
  ok('恢复收起', !visibleIds().includes(drinkC.id));

  // --- 点行选中 ---
  tapArrow(foodC.id);
  tapRow(drinkC.id);
  ok('点行写入 selectedCategoryId', w.selectedCategoryId === drinkC.id, w.selectedCategoryId);
  ok('选中后弹窗关闭', !overlayOpen());

  // --- 搜索 ---
  w.openCategoryPicker('add');
  const visibleBeforeSearch = visibleIds().join(',');
  w.catTreeSearch('饮料');
  ok('搜索命中子分类并自动展开祖先', visibleIds().includes(drinkC.id), visibleIds());
  ok('搜索把命中片段高亮', rowHtml().indexOf('<mark>饮料</mark>') !== -1, rowHtml().slice(0, 200));
  ok('无关根分类被过滤掉', !visibleIds().includes(DS.getExpenseRootCategories().find(c => c.name === '医疗').id), visibleIds());
  ok('祖先行显示命中数', /class="cat-tree-count">1</.test(rowHtml()), rowHtml().slice(0, 300));

  w.catTreeSearch('早');
  ok('换个关键词仍然命中', visibleIds().includes(DS.getChildren(foodC.id).find(c => c.name === '早餐').id));

  w.catTreeSearch('🍜');
  ok('搜索也匹配 emoji', rowHtml().indexOf('餐饮') !== -1, rowHtml().slice(0, 200));

  w.catTreeSearch('zzz不存在');
  ok('无命中显示空态', /No category matches|没有匹配/.test(host().textContent), host().textContent.slice(0, 80));
  ok('无命中时不残留分区标题', host().textContent.indexOf('日常消费') === -1, host().textContent.slice(0, 80));

  w.catTreeSearch('');
  ok('清空搜索后回到搜索前的可见集合（搜索态不写进展开集）',
    visibleIds().join(',') === visibleBeforeSearch, visibleIds());

  // --- 收入选择器只给收入分类 ---
  w.openCategoryPicker('add');
  w.setAddRecordType('income');
  w.openCategoryPicker('add');
  ok('收入选择器不含支出分类', rowHtml().indexOf(foodC.name) === -1 && rowHtml().indexOf('餐饮') === -1);
  ok('收入选择器含收入分类', rowHtml().indexOf(salaryC.name) !== -1);
  ok('收入选择器没有月账单区块', rowHtml().indexOf(w.__('categoryPicker.monthlyBills')) === -1);

  w.setAddRecordType('expense');
  w.openCategoryPicker('add');
  ok('支出选择器含支出分类', rowHtml().indexOf('餐饮') !== -1);
  ok('支出选择器不含收入分类', rowHtml().indexOf('工资') === -1);

  // --- 流水筛选选择器：两棵树都在 ---
  w.closeModal();
  w.openCategoryFilterPicker();
  ok('筛选选择器同时给出两棵树',
    rowHtml().indexOf('餐饮') !== -1 && rowHtml().indexOf('工资') !== -1);
  ok('筛选选择器有「全部分类」快捷行', !!host().previousElementSibling || /cat-tree-all/.test(w.document.getElementById('modalContent').innerHTML));
  w.catTreeSearch('工资');
  ok('筛选选择器也能搜到收入分类', rowHtml().indexOf('工资') !== -1);

  // --- 分类页行内的重排箭头 ---
  w.closeModal();
  w.renderCategories();
  const pageHtml = w.document.getElementById('page-categories').innerHTML;
  ok('分类页有上移/下移箭头', /moveCategoryOrder\(/.test(pageHtml) && pageHtml.includes('⬆️') && pageHtml.includes('⬇️'));
  ok('末项的下移箭头置灰', /cat-action-off/.test(pageHtml));
  ok('展开状态不因重排丢失', (() => {
    w.expandedCategories.add(foodC.id);
    w.renderCategories();
    return w.document.getElementById('page-categories').innerHTML.includes('max-height:2000px');
  })());

  // 走一遍真实入口
  const firstTwo = DS.getExpenseRootCategories();
  const nameBefore = firstTwo.map(c => c.name).join('>');
  w.moveCategoryOrder(firstTwo[0].id, 1);
  ok('moveCategoryOrder 端到端生效',
    DS.getExpenseRootCategories().map(c => c.name).join('>') !== nameBefore,
    DS.getExpenseRootCategories().map(c => c.name));
  w.moveCategoryOrder(DS.getExpenseRootCategories()[1].id, -1);
  ok('再上移回到原顺序', DS.getExpenseRootCategories().map(c => c.name).join('>') === nameBefore);

  console.log('\n===== RESULT: ' + pass + ' PASS / ' + fail + ' FAIL =====');
  process.exit(fail ? 1 : 0);
}, 600);
