// 金额输入（Touch 'n Go 式：从分开始填）+ 记账页日期的前一天/后一天 + 保存后保留日期。
// Usage: bash build.sh && node tests/money-input-test.js   (需要 jsdom：npm i --no-save jsdom)
//
// 约定：
//   - 数字从小数点后开始填：23642 → 236.42；退格去掉最后一位（236.42 → 23.64）；
//   - 输入框的 value 始终是两位小数的普通十进制串，所以各处原有的 parseFloat(el.value) 照旧可用；
//   - 只改写「真实键入」（带 inputType 的 InputEvent）。脚本里 `el.value = '1200'` 再发一个裸
//     `new Event('input')` 表示「金额就是 1200」，不会被当成按键序列；
//   - 日期栏两侧有「前一天 / 后一天」，保持时间不变、正确跨月跨年；保存后日期不重置。
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');

const FIXED = new Date(2026, 9, 13, 12, 0, 0).getTime();   // 2026-10-13 12:00（本地）
const TODAY_VALUE = '2026-10-13T12:00';

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
    Object.defineProperty(w.HTMLElement.prototype, 'innerText', {
      get() { return this.textContent; }, set(v) { this.textContent = v; }
    });
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
  const DS = w.DataStore;
  const $ = id => w.document.getElementById(id);

  // ---- 模拟真实键入：先发 beforeinput，浏览器把字符插在光标处（或替换选区），再发带 inputType 的 InputEvent ----
  const ev = (type, init) => new w.InputEvent(type, Object.assign({ bubbles: true, cancelable: true }, init));
  // 在 [from, to) 选区处键入 ch（from===to 就是光标）
  const pressAt = (el, ch, from, to) => {
    el.focus();
    el.dispatchEvent(ev('beforeinput', { inputType: 'insertText', data: ch }));
    el.value = el.value.slice(0, from) + ch + el.value.slice(to);
    el.dispatchEvent(ev('input', { inputType: 'insertText', data: ch }));
  };
  // 默认光标在末尾（jsdom 与浏览器里，程序改 value 后光标都在末尾）
  const press = (el, ch) => { el.focus(); pressAt(el, ch, el.value.length, el.value.length); };
  const type = (el, s) => { for (const c of s) press(el, c); };
  const backspaceAt = (el, caret) => {
    el.focus();
    el.dispatchEvent(ev('beforeinput', { inputType: 'deleteContentBackward' }));
    el.value = el.value.slice(0, Math.max(0, caret - 1)) + el.value.slice(caret);
    el.dispatchEvent(ev('input', { inputType: 'deleteContentBackward' }));
  };
  const backspace = el => backspaceAt(el, el.value.length);
  const clear = el => { el.value = ''; };
  const paste = (el, text) => {
    const ev = new w.Event('paste', { bubbles: true, cancelable: true });
    Object.defineProperty(ev, 'clipboardData', { value: { getData: () => text } });
    el.dispatchEvent(ev);
  };

  DS.clearAll();
  w.navigateTo('add');
  const amt = $('addAmount');

  /* ---------- 1. 核心：从小数点开始填 ---------- */
  section('【从分开始填：23642 → 236.42】');
  ok('金额框是 data-money 的文本框，手机弹数字键盘', amt.hasAttribute('data-money') && amt.type === 'text' && amt.getAttribute('inputmode') === 'numeric');
  type(amt, '23642');
  ok('键入 23642 → 236.42（用户要求的例子）', amt.value === '236.42', amt.value);
  ok('value 可直接 parseFloat → 236.42', parseFloat(amt.value) === 236.42);

  clear(amt);
  const steps = [];
  for (const c of '23642') { press(amt, c); steps.push(amt.value); }
  ok('逐位：0.02 → 0.23 → 2.36 → 23.64 → 236.42', JSON.stringify(steps) === JSON.stringify(['0.02', '0.23', '2.36', '23.64', '236.42']), steps);

  const back = [];
  for (let i = 0; i < 5; i++) { backspace(amt); back.push(amt.value); }
  ok('退格逐位去掉末位：23.64 → 2.36 → 0.23 → 0.02 → 空', JSON.stringify(back) === JSON.stringify(['23.64', '2.36', '0.23', '0.02', '']), back);

  clear(amt); type(amt, '23642'); press(amt, '.');
  ok('小数点键被忽略（不需要也不起作用）', amt.value === '236.42', amt.value);
  press(amt, 'a'); press(amt, '-'); press(amt, ' ');
  ok('字母 / 负号 / 空格被忽略（非 signed 字段）', amt.value === '236.42', amt.value);

  clear(amt); type(amt, '0');
  ok('第一位输 0 仍为空（前导零不显示）', amt.value === '', amt.value);
  type(amt, '05');
  ok('0 0 5 → 0.05', amt.value === '0.05', amt.value);

  clear(amt); type(amt, '1000');
  ok('1000 → 10.00（要 1000 元得输 100000）', amt.value === '10.00', amt.value);

  clear(amt); type(amt, '999999999999999');
  ok('位数封顶 11 位 → 999999999.99，多出来的位被丢掉', amt.value === '999999999.99', amt.value);

  amt.value = '236.42'; amt.blur(); amt.focus();
  pressAt(amt, '7', 0, amt.value.length);
  ok('全选后覆盖输入一个 7 → 0.07（重新开始）', amt.value === '0.07', amt.value);
  amt.value = '236.42'; amt.blur(); amt.focus();
  backspaceAt(amt, 0); amt.value = ''; amt.dispatchEvent(ev('input', { inputType: 'deleteContentBackward' }));
  ok('全选后按退格 → 清空', amt.value === '', amt.value);

  section('【光标在中间：键入的数字仍追加在末尾（点进已有值的输入框很常见）】');
  amt.value = '236.42'; amt.blur(); amt.focus();
  pressAt(amt, '9', 2, 2);
  ok('光标在 "23|6.42" 键入 9 → 2364.29（旧实现把 9 插进数字中间得到 2396.42 的错位结果）', amt.value === '2364.29', amt.value);
  amt.value = '236.42'; amt.blur(); amt.focus();
  pressAt(amt, '1', 0, 0);
  ok('光标在最前面键入 1 → 2364.21', amt.value === '2364.21', amt.value);
  amt.value = '236.42'; amt.blur(); amt.focus();
  pressAt(amt, '5', 4, 4);
  ok('光标在小数点后 "236.|42" 键入 5 → 2364.25', amt.value === '2364.25', amt.value);
  amt.value = '236.42'; amt.blur(); amt.focus();
  backspaceAt(amt, 2);
  ok('光标在中间按退格：仍是去掉末位 → 23.64', amt.value === '23.64', amt.value);
  amt.value = '-2'; amt.blur(); amt.focus();     // 非 signed 字段上的负号残留：规整成正数
  ok('非 signed 字段聚焦时负值被规整为正（金额不能为负）：-2 → 2.00', amt.value === '2.00', amt.value);
  amt.value = '236.42'; amt.blur(); amt.focus();
  amt.dispatchEvent(ev('beforeinput', { inputType: 'insertFromDrop' }));
  amt.value = '99'; amt.dispatchEvent(ev('input', { inputType: 'insertFromDrop' }));
  ok('拖放 / 自动填充 / 输入法等其他来源：取屏幕上现有的数字（99 → 0.99）', amt.value === '0.99', amt.value);

  /* ---------- 2. 粘贴 / 程序赋值 ---------- */
  section('【粘贴与程序赋值】');
  clear(amt); paste(amt, '1,234.5');
  ok('粘贴 "1,234.5" 是数字不是按键：1234.50', amt.value === '1234.50', amt.value);
  paste(amt, 'RM 50');
  ok('粘贴 "RM 50" → 50.00（不是 0.50）', amt.value === '50.00', amt.value);
  paste(amt, 'abc');
  ok('粘贴不含数字的文本：不改动', amt.value === '50.00', amt.value);

  amt.value = '1200';
  amt.dispatchEvent(new w.Event('input', { bubbles: true }));
  ok('脚本赋值 + 裸 Event("input") 不被当成按键：仍是 1200（兼容既有代码与测试）', amt.value === '1200', amt.value);

  amt.value = '12.5';
  amt.blur(); amt.focus();
  ok('别处写进来的 12.5 在聚焦时规整成 12.50', amt.value === '12.50', amt.value);
  press(amt, '3');
  ok('接着键入 3 → 125.03（以 12.50 为基础）', amt.value === '125.03', amt.value);

  /* ---------- 3. 记账页真实流程 ---------- */
  section('【记账：输入 23642 → 保存的是 236.42】');
  const food = DS.getExpenseRootCategories().find(c => c.name === '餐饮');
  const lunch = DS.getChildren(food.id).find(c => c.name === '午餐');
  w.navigateTo('add');
  w.selectCategory(lunch.id, 'add');
  type($('addAmount'), '23642');
  w.submitRecord({ preventDefault() {} });
  const saved = DS.getRecords()[0];
  ok('保存的金额是数字 236.42', saved && saved.amount === 236.42, saved && saved.amount);
  ok('保存后金额框清空，备注/分类照旧重置', $('addAmount').value === '' && $('addNote').value === '');

  /* ---------- 4. 日期：前一天 / 后一天 ---------- */
  section('【日期栏两侧：前一天 / 后一天】');
  w.window._addDateTimeChosen = null;
  w.navigateTo('add');
  const dt = $('addDateTime');
  ok('默认是现在', dt.value === TODAY_VALUE, dt.value);
  ok('左右各有一个按钮，且带无障碍名称', $('addDatePrev') && $('addDateNext') && $('addDatePrev').getAttribute('aria-label') && $('addDateNext').getAttribute('aria-label'));
  ok('按钮在输入框两侧（DOM 顺序：前 / 输入 / 后）', $('addDatePrev').nextElementSibling === dt && dt.nextElementSibling === $('addDateNext'));
  $('addDateNext').click();
  ok('点「后一天」→ 10-14，时间不变', dt.value === '2026-10-14T12:00', dt.value);
  $('addDatePrev').click(); $('addDatePrev').click();
  ok('点两次「前一天」→ 10-12', dt.value === '2026-10-12T12:00', dt.value);

  const shift = (from, d) => { dt.value = from; (d > 0 ? $('addDateNext') : $('addDatePrev')).click(); return dt.value; };
  ok('10-31 → 后一天 = 11-01（跨月）', shift('2026-10-31T09:30', 1) === '2026-11-01T09:30');
  ok('12-31 → 后一天 = 次年 01-01（跨年）', shift('2026-12-31T23:59', 1) === '2027-01-01T23:59');
  ok('01-01 → 前一天 = 上年 12-31', shift('2027-01-01T00:00', -1) === '2026-12-31T00:00');
  ok('2027-02-28 → 后一天 = 03-01（平年）', shift('2027-02-28T08:00', 1) === '2027-03-01T08:00');
  ok('2028-02-28 → 后一天 = 02-29（闰年）', shift('2028-02-28T08:00', 1) === '2028-02-29T08:00');
  ok('2028-03-01 → 前一天 = 02-29', shift('2028-03-01T08:00', -1) === '2028-02-29T08:00');
  ok('日期被清空时从「现在」起算', shift('', 1) === '2026-10-14T12:00');

  /* ---------- 5. 保存后保留日期 ---------- */
  section('【保存后不重置日期】');
  w.window._addDateTimeChosen = null;
  w.navigateTo('add');
  $('addDateTime').value = '2026-09-20T08:15';
  $('addDateNext').click(); $('addDatePrev').click();       // 经由按钮选定 09-20
  ok('选定了 09-20 08:15', $('addDateTime').value === '2026-09-20T08:15', $('addDateTime').value);
  w.selectCategory(lunch.id, 'add');
  type($('addAmount'), '500');
  w.submitRecord({ preventDefault() {} });
  const r1 = DS.getRecords()[0];
  ok('记录用的是选定的日期', r1.date === '2026-09-20T08:15', r1.date);
  ok('保存后日期栏仍是 09-20 08:15（不再被重置成现在）', $('addDateTime').value === '2026-09-20T08:15', $('addDateTime').value);
  w.selectCategory(lunch.id, 'add');
  type($('addAmount'), '700');
  w.submitRecord({ preventDefault() {} });
  ok('连续第二笔仍落在同一天', DS.getRecords()[0].date === '2026-09-20T08:15' && DS.getRecords()[0].amount === 7, DS.getRecords()[0]);

  w.navigateTo('records'); w.navigateTo('add');
  ok('切到别的页再回来：用户选定的日期仍在', $('addDateTime').value === '2026-09-20T08:15', $('addDateTime').value);
  ok('日期不是今天时输入框有醒目提示（防止忘了改回来）', $('addDateTime').classList.contains('add-date-offday'));
  $('addDateTime').value = TODAY_VALUE;
  $('addDateTime').dispatchEvent(new w.Event('change', { bubbles: true }));
  ok('改回今天后提示消失', !$('addDateTime').classList.contains('add-date-offday'));

  w.window._addDateTimeChosen = null;
  w.navigateTo('records'); w.navigateTo('add');
  ok('从没动过日期的默认值：下次打开仍跟着当前时间走', $('addDateTime').value === TODAY_VALUE && !$('addDateTime').classList.contains('add-date-offday'));
  w.selectCategory(lunch.id, 'add');
  type($('addAmount'), '100');
  w.submitRecord({ preventDefault() {} });
  ok('没动日期直接保存，保存后日期栏也不被改写', $('addDateTime').value === TODAY_VALUE, $('addDateTime').value);

  /* ---------- 6. 分摊记账路径同样保留日期 ---------- */
  section('【分摊记账保存后同样保留日期】');
  w.window._addDateTimeChosen = null;
  w.navigateTo('add');
  $('addDateTime').value = '2026-09-15T20:00';
  $('addDateNext').click(); $('addDatePrev').click();
  type($('addAmount'), '9000');                         // 90.00
  $('addSplitToggle').checked = true;
  w.toggleAddSplitForm(true);
  w.selectCategory(lunch.id, 'add');
  // 自己 + 一个匿名参与者各付一半（走 collectSplitBill 的真实状态）
  const st = w.window._addSplitState;
  st.selfInvolved = true; st.mode = 'equal';
  DS._data.contacts = [{ id: 'p1', name: '阿明' }];
  w.SplitEngine.renderAddSplitForm();
  const row = (w.window._addSplitState.rows || []).find(r => r.contactId === 'p1');
  if (row) row.included = true;
  w.submitRecord({ preventDefault() {} });
  const bills = DS._data.splitBills || [];
  ok('分摊账单已保存，金额 90', bills.length === 1 && bills[0].amount === 90, bills.map(b => b.amount));
  ok('分摊账单用的是选定的日期 09-15', bills[0] && bills[0].date === '2026-09-15T20:00', bills[0] && bills[0].date);
  ok('保存后日期栏仍是 09-15 20:00', $('addDateTime').value === '2026-09-15T20:00', $('addDateTime').value);

  /* ---------- 7. 其他金额框也都用新方式 ---------- */
  section('【全应用的金额框】');
  // 设置：固定储蓄额是金额，百分比不是
  w.navigateTo('settings');
  ok('设置·固定储蓄额：data-money', $('savingsFixedAmount').hasAttribute('data-money'));
  ok('设置·储蓄百分比：仍是普通数字框', !$('savingsPercent').hasAttribute('data-money') && $('savingsPercent').type === 'number');
  type($('savingsFixedAmount'), '50000');
  ok('在固定储蓄额里输入 50000 → 500.00', $('savingsFixedAmount').value === '500.00', $('savingsFixedAmount').value);

  // 流水页：筛选与编辑
  w.navigateTo('records');
  ok('流水·筛选金额下限/上限：data-money', $('filterAmountMin').hasAttribute('data-money') && $('filterAmountMax').hasAttribute('data-money'));
  type($('filterAmountMin'), '2500');
  ok('筛选下限输入 2500 → 25.00', $('filterAmountMin').value === '25.00', $('filterAmountMin').value);
  const rec = DS.getRecords().find(r => !r.splitBillId);
  w.openEditRecord ? w.openEditRecord(rec.id) : w.editRecord(rec.id);
  ok('编辑记录·金额：data-money，已有值聚焦后规整为两位小数', (() => {
    const e = $('editAmount'); if (!e || !e.hasAttribute('data-money')) return false;
    e.focus(); return /^\d+\.\d{2}$/.test(e.value);
  })(), $('editAmount') && $('editAmount').value);
  w.closeModal();

  // 分类预算：RM 是金额，% 是普通数字；切换时跟着变
  DS.clearAll();
  w.navigateTo('categories');
  w.renderCategories();
  const bInput = w.document.querySelector('.budget-input');
  const bToggle = w.document.querySelector('.budget-toggle');
  ok('分类预算（RM）：data-money', bInput.hasAttribute('data-money') && bInput.type === 'text');
  type(bInput, '30000');
  ok('预算输入 30000 → 300.00', bInput.value === '300.00', bInput.value);
  bToggle.click();                                       // RM → %
  ok('切到 %：变回普通数字框（百分比不是金额）', !bInput.hasAttribute('data-money') && bInput.type === 'number', [bInput.type, bInput.hasAttribute('data-money')]);
  bToggle.click();                                       // % → RM
  ok('切回 RM：又是金额输入', bInput.hasAttribute('data-money') && bInput.type === 'text');

  // 假设分析
  DS.clearAll();
  // a root with no children: its control row is always rendered (a parent's only when expanded)
  const wiLunch = DS.getExpenseRootCategories().find(c => DS.getChildren(c.id).length === 0);
  const setMode = (id, mode, value) => {
    DS.setWhatIfParams({ categoryAdjustments: { [id]: { mode, value } }, globalAdjustment: { mode: null, value: null }, hypotheticalCategories: [] });
    w.renderWhatIf();
    return w.document.querySelector('.whatif-value-input[data-cat="' + id + '"]');
  };
  let v = setMode(wiLunch.id, 'daily', 30);
  ok('假设·设日均值：金额输入（不带符号）', v.hasAttribute('data-money') && v.getAttribute('data-money') === '' && v.type === 'text');
  v = setMode(wiLunch.id, 'total', 100);
  ok('假设·固定剩余总额：金额输入', v.hasAttribute('data-money') && v.type === 'text');
  v = setMode(wiLunch.id, 'percent', -10);
  ok('假设·± %：仍是普通数字框', !v.hasAttribute('data-money') && v.type === 'number');
  v = setMode(wiLunch.id, 'adjust', -2);
  ok('假设·比趋势 ± RM/天：金额输入且允许负号', v.getAttribute('data-money') === 'signed' && v.type === 'text');
  const signBtn = v.parentElement.querySelector('.whatif-sign-btn');
  ok('该行有 ± 按钮（手机数字键盘没有负号）', !!signBtn);
  v.value = ''; type(v, '-'); type(v, '250');
  ok('键入 - 再输 250 → -2.50', v.value === '-2.50', v.value);
  type(v, '-');
  ok('再键入 - 切回正数 → 2.50', v.value === '2.50', v.value);
  // 点 ± 触发 change → 页面自动保存并整页重绘（该页一贯行为），所以每次都从页面重新取元素
  const cur = () => w.document.querySelector('.whatif-value-input[data-cat="' + wiLunch.id + '"]');
  let fired = 0; v.addEventListener('change', () => fired++);
  v.value = '2.50';
  signBtn.click();
  ok('点 ± 触发 change，让该页自动保存', fired === 1, fired);
  ok('保存并回显为负：-2.5', parseFloat(cur().value) === -2.5, cur().value);
  cur().parentElement.querySelector('.whatif-sign-btn').click();
  ok('再点 ± → 回显正的 2.5', parseFloat(cur().value) === 2.5, cur().value);
  v = cur();
  v.value = ''; type(v, '-'); type(v, '200');
  ok('负值照常被读成数字（collect 用 parseFloat）：-200 → -2.00', v.value === '-2.00' && parseFloat(v.value) === -2, v.value);

  DS.setWhatIfParams({ categoryAdjustments: {}, globalAdjustment: { mode: 'amount', value: -5 }, hypotheticalCategories: [{ icon: '🎁', name: '礼物', amount: 120, type: 'total' }] });
  w.renderWhatIf();
  const g = $('wi-global-value');
  ok('假设·全局调整（± RM/天）：金额输入且带 ± 按钮', g.getAttribute('data-money') === 'signed' && !!g.parentElement.querySelector('.whatif-sign-btn'));
  const hypo = w.document.querySelector('.wi-hypo-amount');
  ok('假设·假设分类金额：金额输入', hypo.hasAttribute('data-money') && hypo.type === 'text');
  DS.setWhatIfParams({ categoryAdjustments: {}, globalAdjustment: { mode: 'percent', value: -10 }, hypotheticalCategories: [] });
  w.renderWhatIf();
  ok('假设·全局调整改为 %：普通数字框', !$('wi-global-value').hasAttribute('data-money') && $('wi-global-value').type === 'number');

  /* ---------- 8. 防漏：页面里不该再有「金额」用的 type=number ---------- */
  section('【防漏：剩下的 type="number" 都不是金额】');
  const left = [];
  const re = /<input[^>]*type="number"[^>]*>/g;
  let mm;
  while ((mm = re.exec(html))) left.push(mm[0]);
  // 这些不是金额：每页条数 / 储蓄百分比 / 计划月数 / 延长月数 / 以及「百分比模式」下的几个动态框
  const allowed = [/recordsPageSizeInput/, /savingsPercent/, /planExtendMonths/, /planMonths/, /\$\{budgetInputAttrs\}|class="budget-input"/, /valueAttrs/, /wi-global-value/];
  const stray = left.filter(tag => !allowed.some(a => a.test(tag)));
  ok('没有漏改的金额框（新增金额输入请用 data-money，别再写 type="number"）', stray.length === 0, stray.map(s => s.slice(0, 110)));
  const decimal = (html.match(/<input[^>]*inputmode="decimal"[^>]*>/g) || []).concat(html.match(/'<input[^']*inputmode=\\?"decimal[^']*'/g) || []);
  ok('没有残留的 inputmode="decimal" 金额框（那是旧的「自己输小数点」方式）', decimal.length === 0, decimal.map(s => s.slice(0, 110)));

  console.log('\n===== RESULT: ' + pass + ' PASS / ' + fail + ' FAIL =====');
  process.exit(fail > 0 ? 1 : 0);
}, 700);
