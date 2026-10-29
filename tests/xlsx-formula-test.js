/* ============================================================
   Excel 导出：每个公式重算一遍，必须等于文件里写好的值
   ------------------------------------------------------------
   来源：audit-report/AUDIT-REPORT.md 的 C-04。
   导出带了 fullCalcOnLoad，Excel 一打开就会把所有公式重算一遍，所以
   "公式算出来的"才是用户看到的。以前的测试只验证公式能转成 A1 写法
   （xlsx-export-test.js X5），不验证它算得对不对，于是：
     - 分类统计的总计漏了子分类行
     - 子分类占比、总计行占比引用了错误的行
     - 预算"状态"引用了"使用率"列，超支也显示"正常"
     - 储蓄"达成率"除以了预算而不是储蓄目标
     - 消费记录页脚把收入也加进合计、数值落在错误的列下
     - 没设预算时页脚是 #DIV/0!，零条记录时页脚引用了自己
   这里用一个小公式求值器（直接算 SpreadsheetML 里的 R1C1 公式，支持
   SUM / AVERAGE / MIN / MAX / COUNT / COUNTIF / SUMIF / SUMPRODUCT / IF 和
   数组运算）逐个重算，再和缓存值比；另外对几个关键数字做"独立期望值"断言，
   免得缓存值和公式一起错。

   跑法： bash build.sh && node tests/xlsx-formula-test.js
   ============================================================ */
const fs = require('fs'), path = require('path');
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
const dom = new JSDOM(html, {
  runScripts: 'dangerously', pretendToBeVisual: true, url: 'http://localhost/',
  beforeParse(w) {
    const s = stub();
    w.HTMLCanvasElement.prototype.getContext = function () { s.canvas = this; return s; };
    w.CanvasRenderingContext2D = function () {};
    w.CanvasRenderingContext2D.prototype.roundRect = function () { return this; };
    w.URL.createObjectURL = () => 'blob:stub'; w.URL.revokeObjectURL = () => {};
    const q = () => {}; w.console = { log: q, warn: q, error: q, info: q, debug: q };
  }
});
const w = dom.window;

let pass = 0, fail = 0;
const ok = (name, cond, extra) => {
  if (cond) { pass++; console.log('  ✅ ' + name); }
  else { fail++; console.log('  ❌ ' + name + (extra !== undefined ? '  <- ' + (typeof extra === 'string' ? extra : JSON.stringify(extra)) : '')); }
};
const section = t => console.log('\n' + t);

/* ---------------- 读 SpreadsheetML ---------------- */
function loadSheets(xml) {
  const doc = new w.DOMParser().parseFromString(xml, 'text/xml');
  const sheets = {};
  Array.from(doc.getElementsByTagName('Worksheet')).forEach(ws => {
    const grid = {}; let r = 0;
    Array.from(ws.getElementsByTagName('Row')).forEach(row => {
      r++; let c = 0;
      Array.from(row.getElementsByTagName('Cell')).forEach(cell => {
        const idx = cell.getAttribute('ss:Index'); c = idx ? parseInt(idx, 10) : c + 1;
        const data = cell.getElementsByTagName('Data')[0];
        const type = data ? data.getAttribute('ss:Type') : null;
        const text = data ? data.textContent : '';
        grid[r + ',' + c] = { f: cell.getAttribute('ss:Formula'), isNum: type === 'Number',
          v: type === 'Number' ? Number(text) : text, style: cell.getAttribute('ss:StyleID') || '' };
      });
    });
    sheets[ws.getAttribute('ss:Name')] = { grid, rows: r };
  });
  return sheets;
}

/* ---------------- 小公式求值器（R1C1） ---------------- */
function makeEvaluator(sheet) {
  const memo = {}, visiting = {};
  const TOK = /\s*(?:(\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)|("(?:[^"]|"")*")|(R(?:\[-?\d+\]|\d+)?C(?:\[-?\d+\]|\d+)?)(?![A-Za-z0-9_(])|([A-Za-z_][A-Za-z0-9_.]*)\(|(<=|>=|<>|[-+*/^&=<>(),:]))/y;
  function tokenize(src) {
    const out = []; TOK.lastIndex = 0; let m;
    while (TOK.lastIndex < src.length && (m = TOK.exec(src))) {
      if (m[1] !== undefined) out.push({ t: 'num', v: Number(m[1]) });
      else if (m[2] !== undefined) out.push({ t: 'str', v: m[2].slice(1, -1).replace(/""/g, '"') });
      else if (m[3] !== undefined) out.push({ t: 'ref', v: m[3] });
      else if (m[4] !== undefined) out.push({ t: 'fn', v: m[4].toUpperCase() });
      else out.push({ t: 'op', v: m[5] });
    }
    if (TOK.lastIndex < src.replace(/\s+$/, '').length) throw new Error('无法解析: ' + src.slice(TOK.lastIndex));
    return out;
  }
  function parse(tokens) {
    let i = 0;
    const peek = () => tokens[i], next = () => tokens[i++];
    const isOp = v => peek() && peek().t === 'op' && peek().v === v;
    function cmp() { let l = concat(); while (peek() && peek().t === 'op' && ['=', '<>', '<', '>', '<=', '>='].includes(peek().v)) { const op = next().v; l = { t: 'bin', op, l, r: concat() }; } return l; }
    function concat() { let l = add(); while (isOp('&')) { next(); l = { t: 'bin', op: '&', l, r: add() }; } return l; }
    function add() { let l = mul(); while (isOp('+') || isOp('-')) { const op = next().v; l = { t: 'bin', op, l, r: mul() }; } return l; }
    function mul() { let l = unary(); while (isOp('*') || isOp('/')) { const op = next().v; l = { t: 'bin', op, l, r: unary() }; } return l; }
    function unary() { if (isOp('-')) { next(); return { t: 'neg', e: unary() }; } if (isOp('+')) { next(); return unary(); } return pow(); }
    function pow() { const l = primary(); if (isOp('^')) { next(); return { t: 'bin', op: '^', l, r: unary() }; } return l; }
    function primary() {
      const tk = next();
      if (!tk) throw new Error('公式意外结束');
      if (tk.t === 'num') return { t: 'num', v: tk.v };
      if (tk.t === 'str') return { t: 'str', v: tk.v };
      if (tk.t === 'ref') { if (isOp(':')) { next(); const b = next(); return { t: 'range', a: tk.v, b: b.v }; } return { t: 'ref', v: tk.v }; }
      if (tk.t === 'fn') { const args = []; if (!isOp(')')) { args.push(cmp()); while (isOp(',')) { next(); args.push(cmp()); } } if (!isOp(')')) throw new Error('缺少 )'); next(); return { t: 'fn', name: tk.v, args }; }
      if (tk.t === 'op' && tk.v === '(') { const e = cmp(); if (!isOp(')')) throw new Error('缺少 )'); next(); return e; }
      throw new Error('意外的记号 ' + JSON.stringify(tk));
    }
    const ast = cmp();
    if (i < tokens.length) throw new Error('公式后面还有多余内容');
    return ast;
  }
  const cellOf = (ref, row, col) => {
    const m = /^R(\[-?\d+\]|\d+)?C(\[-?\d+\]|\d+)?$/.exec(ref);
    const part = (p, cur) => p === undefined ? cur : (p[0] === '[' ? cur + parseInt(p.slice(1, -1), 10) : parseInt(p, 10));
    return { r: part(m[1], row), c: part(m[2], col) };
  };
  const isArr = v => v && typeof v === 'object' && Array.isArray(v.arr);
  const num = v => v === null || v === undefined ? 0 : typeof v === 'boolean' ? (v ? 1 : 0) : typeof v === 'number' ? v : (() => { throw new Error('#VALUE!'); })();
  const flat = vs => vs.reduce((a, v) => a.concat(isArr(v) ? [].concat(...v.arr) : [v]), []);
  const nums = (vs, directToo) => flat(vs).filter(v => typeof v === 'number');
  const lc = v => typeof v === 'string' ? v.toLowerCase() : v;
  const eq = (a, b) => (a === null ? (typeof b === 'string' ? '' : 0) : a) === (b === null ? (typeof a === 'string' ? '' : 0) : b) || lc(a) === lc(b);
  const less = (a, b) => (typeof a === 'string' && typeof b !== 'string') ? false : (typeof a !== 'string' && typeof b === 'string') ? true : (a === null ? 0 : a) < (b === null ? 0 : b);
  function broadcast(a, b, fn) {
    if (!isArr(a) && !isArr(b)) return fn(a, b);
    const A = isArr(a) ? a.arr : null, B = isArr(b) ? b.arr : null;
    const rows = (A || B).length, cols = (A || B)[0].length;
    return { arr: Array.from({ length: rows }, (_, r) => Array.from({ length: cols }, (_, c) => fn(A ? A[r][c] : a, B ? B[r][c] : b))) };
  }
  function evalNode(n, row, col) {
    switch (n.t) {
      case 'num': case 'str': return n.v;
      case 'neg': { const v = evalNode(n.e, row, col); return isArr(v) ? broadcast(v, 0, x => -num(x)) : -num(v); }
      case 'ref': { const p = cellOf(n.v, row, col); return cellValue(p.r, p.c); }
      case 'range': {
        const a = cellOf(n.a, row, col), b = cellOf(n.b, row, col);
        const r1 = Math.min(a.r, b.r), r2 = Math.max(a.r, b.r), c1 = Math.min(a.c, b.c), c2 = Math.max(a.c, b.c);
        return { arr: Array.from({ length: r2 - r1 + 1 }, (_, i) => Array.from({ length: c2 - c1 + 1 }, (_, j) => cellValue(r1 + i, c1 + j))) };
      }
      case 'bin': {
        const l = evalNode(n.l, row, col), r = evalNode(n.r, row, col);
        const f = { '+': (x, y) => num(x) + num(y), '-': (x, y) => num(x) - num(y), '*': (x, y) => num(x) * num(y),
          '/': (x, y) => { if (num(y) === 0) throw new Error('#DIV/0!'); return num(x) / num(y); }, '^': (x, y) => Math.pow(num(x), num(y)),
          '&': (x, y) => String(x === null ? '' : x) + String(y === null ? '' : y),
          '=': eq, '<>': (x, y) => !eq(x, y), '<': less, '>': (x, y) => less(y, x), '<=': (x, y) => less(x, y) || eq(x, y), '>=': (x, y) => less(y, x) || eq(x, y) }[n.op];
        return broadcast(l, r, f);
      }
      case 'fn': return callFn(n, row, col);
    }
  }
  function callFn(n, row, col) {
    const ev = k => evalNode(n.args[k], row, col);
    const all = () => n.args.map((_, k) => ev(k));
    const truthy = v => typeof v === 'boolean' ? v : typeof v === 'number' ? v !== 0 : !!v;
    switch (n.name) {
      case 'IF': return truthy(ev(0)) ? (n.args[1] ? ev(1) : true) : (n.args[2] ? ev(2) : false);
      case 'SUM': return nums(all()).reduce((s, v) => s + v, 0);
      case 'COUNT': return nums(all()).length;
      case 'AVERAGE': { const v = nums(all()); if (!v.length) throw new Error('#DIV/0!'); return v.reduce((s, x) => s + x, 0) / v.length; }
      case 'MAX': { const v = nums(all()); return v.length ? Math.max(...v) : 0; }
      case 'MIN': { const v = nums(all()); return v.length ? Math.min(...v) : 0; }
      case 'SUMPRODUCT': return flat(all()).reduce((s, v) => s + (typeof v === 'number' ? v : typeof v === 'boolean' ? (v ? 1 : 0) : 0), 0);
      case 'COUNTIF': { const rng = flat([ev(0)]), crit = ev(1); return rng.filter(v => eq(v, crit)).length; }
      case 'SUMIF': { const rng = flat([ev(0)]), crit = ev(1), sum = flat([ev(2)]); return rng.reduce((s, v, k) => s + (eq(v, crit) && typeof sum[k] === 'number' ? sum[k] : 0), 0); }
      default: throw new Error('求值器不认识函数 ' + n.name);
    }
  }
  function cellValue(r, c) {
    const k = r + ',' + c, cell = sheet.grid[k];
    if (!cell) return null;
    if (!cell.f) return cell.v;
    if (k in memo) return memo[k];
    if (visiting[k]) throw new Error('#循环引用');
    visiting[k] = true;
    try {
      const v = evalNode(parse(tokenize(cell.f.replace(/^=/, ''))), r, c);
      memo[k] = isArr(v) ? v.arr[0][0] : v;
    } finally { visiting[k] = false; }
    return memo[k];
  }
  return { cell: cellValue };
}

/* ---------------- 夹具 ---------------- */
setTimeout(() => {
  const DS = w.DataStore;
  try { w.Changelog.markSeen(w.Changelog.all()[0].id); w.closeModal(); } catch (e) {}
  const roots = DS.getExpenseRootCategories();
  const R1 = roots[0], R2 = roots[1];
  const kids1 = DS.getChildren(R1.id);
  const inc = DS.getIncomeRootCategories()[0];
  const E = (id, cat, amt, date, extra) => Object.assign({ id, categoryId: cat, amount: amt, date, note: '', tags: [], createdAt: date + ':00.000Z' }, extra || {});
  const seedRecords = recs => { DS._data.records = recs; DS.save(); };
  const xml = () => w.buildExcelSpreadsheetXml();
  const sheetNames = () => Object.keys(loadSheets(xml()));

  // 重算每个公式并和缓存值比
  function recalcAll(label) {
    let sheets;
    try { sheets = loadSheets(xml()); } catch (e) { ok(label + '：能生成并读取工作簿', false, e.message); return null; }
    let formulas = 0; const bad = [];
    Object.entries(sheets).forEach(([name, sh]) => {
      const ev = makeEvaluator(sh);
      Object.entries(sh.grid).forEach(([k, cell]) => {
        if (!cell.f) return;
        formulas++;
        const [r, c] = k.split(',').map(Number);
        let got; try { got = ev.cell(r, c); } catch (e) { got = 'ERR ' + e.message; }
        const want = cell.v, tol = /pct/.test(cell.style) ? 2e-6 : 0.0051;
        const same = (typeof got === 'number' && cell.isNum) ? Math.abs(got - want) <= tol : String(got === null ? '' : got) === String(want);
        if (!same) bad.push(name + ' R' + r + 'C' + c + '  ' + cell.f + '  重算=' + got + '  文件里写的=' + want);
      });
    });
    ok(label + '：全部 ' + formulas + ' 个公式重算后与文件里写的值一致', bad.length === 0, bad.slice(0, 5));
    return sheets;
  }
  const S = (sheets, name) => sheets[name];
  const val = (sheets, name, r, c, evCache = {}) => {
    const sh = sheets[name]; const key = name; if (!evCache[key]) evCache[key] = makeEvaluator(sh);
    try { return evCache[key].cell(r, c); } catch (e) { return 'ERR ' + e.message; }
  };

  /* ===== 场景 1：默认分类（有子分类）+ 两个月 + 收入 ===== */
  section('【场景 1】默认分类（根分类带子分类）、两个月、有收入记录、有预算和储蓄目标');
  DS.clearAll();
  DS.setBudget('2026-09', 1000); DS.setBudget('2026-10', 300);
  DS.setSavingsTarget({ type: 'fixed', fixedAmount: 200, percent: 0 });
  seedRecords([
    E('e1', R1.id, 500, '2026-09-05T10:00'),
    E('e2', kids1[0].id, 40, '2026-09-06T08:00'),
    E('e3', kids1[1].id, 60, '2026-09-07T12:00'),
    E('e4', R2.id, 100, '2026-10-02T09:00'),
    E('e5', R2.id, 250, '2026-10-03T09:00'),
    E('i1', inc.id, 3000, '2026-09-01T09:00', { type: 'income' })
  ]);
  const sheets1 = recalcAll('场景 1');
  if (sheets1) {
    const cache = {};
    const n = {};   // 工作表名 → 名字，按出现顺序
    const names = Object.keys(sheets1);
    const [sRec, sCat, sMon, sBud, sSav] = names;
    // 记录页脚：只算支出
    const rec = sheets1[sRec]; const lastDataRow = 7;   // 表头 + 6 条记录
    const footer = [];
    for (let r = lastDataRow + 1; r <= rec.rows; r++) footer.push(r);
    const dVals = footer.map(r => val(sheets1, sRec, r, 4, cache));
    const expSum = 500 + 40 + 60 + 100 + 250, expAvg = expSum / 5;
    ok('消费记录页脚：金额列(D)下面依次是 合计 / 平均 / 最高 / 最低（只算支出，不含 3000 的收入）',
      dVals.length === 4 && Math.abs(dVals[0] - expSum) < 0.01 && Math.abs(dVals[1] - expAvg) < 0.01 && dVals[2] === 500 && dVals[3] === 40, dVals);
    // 分类统计
    const cat = sheets1[sCat];
    const grandRow = cat.rows;
    ok('分类统计：总计 = 全部支出', Math.abs(val(sheets1, sCat, grandRow, 2, cache) - expSum) < 0.01, val(sheets1, sCat, grandRow, 2, cache));
    ok('分类统计：总计行的占比是 100%', Math.abs(val(sheets1, sCat, grandRow, 3, cache) - 1) < 1e-9, val(sheets1, sCat, grandRow, 3, cache));
    ok('分类统计：总计行的记录数 = 5', val(sheets1, sCat, grandRow, 4, cache) === 5, val(sheets1, sCat, grandRow, 4, cache));
    // 找到"早餐/午餐"子分类行（以 ↳ 开头），它们的占比 = 自己 / 所属根分类
    const childRows = [];
    for (let r = 2; r < grandRow; r++) { const a = cat.grid[r + ',1']; if (a && /↳/.test(a.v)) childRows.push(r); }
    ok('分类统计：能找到两个子分类行', childRows.length >= 2, childRows);
    const rootRow1 = 2;   // 餐饮 金额最大，排第一：500 + 40 + 60 = 600
    const rootTotal = val(sheets1, sCat, rootRow1, 2, cache);
    ok('分类统计：餐饮根分类 = 600', Math.abs(rootTotal - 600) < 0.01, rootTotal);
    childRows.slice(0, 2).forEach(r => {
      const own = val(sheets1, sCat, r, 2, cache), pct = val(sheets1, sCat, r, 3, cache);
      ok('分类统计：子分类 ' + own + ' 的占比 = ' + own + ' / 600', Math.abs(pct - own / 600) < 1e-6, pct);
    });
    ok('分类统计：餐饮的占比 = 600 / 总计', Math.abs(val(sheets1, sCat, rootRow1, 3, cache) - 600 / expSum) < 1e-6, val(sheets1, sCat, rootRow1, 3, cache));
    // 预算跟踪：2026-10 预算 300、目标 200 → 可支配 100，支出 350 → 超支
    const bud = sheets1[sBud];
    let octRow = null; for (let r = 2; r < bud.rows; r++) if (bud.grid[r + ',1'] && bud.grid[r + ',1'].v === '2026-10') octRow = r;
    ok('预算跟踪：2026-10 超支时"状态"显示超支', octRow && /超支|Over/i.test(String(val(sheets1, sBud, octRow, 8, cache))), octRow && val(sheets1, sBud, octRow, 8, cache));
    let sepRow = null; for (let r = 2; r < bud.rows; r++) if (bud.grid[r + ',1'] && bud.grid[r + ',1'].v === '2026-09') sepRow = r;
    ok('预算跟踪：2026-09 没超支时"状态"显示正常', sepRow && /正常|Normal|OK/i.test(String(val(sheets1, sBud, sepRow, 8, cache))), sepRow && val(sheets1, sBud, sepRow, 8, cache));
    // 储蓄：2026-09 预算 1000 目标 200 支出 600 → 实际储蓄 200，达成率 100%
    const sav = sheets1[sSav];
    let sRow = null; for (let r = 2; r < sav.rows; r++) if (sav.grid[r + ',1'] && sav.grid[r + ',1'].v === '2026-09') sRow = r;
    ok('储蓄统计：2026-09 实际储蓄 = 200', sRow && Math.abs(val(sheets1, sSav, sRow, 5, cache) - 200) < 0.01, sRow && val(sheets1, sSav, sRow, 5, cache));
    ok('储蓄统计：2026-09 达成率 = 实际储蓄 / 储蓄目标 = 100%', sRow && Math.abs(val(sheets1, sSav, sRow, 6, cache) - 1) < 1e-6, sRow && val(sheets1, sSav, sRow, 6, cache));
    // 收入分类统计（有收入记录才有这一页）
    const incName = names.find(nm => /收入|Income/.test(nm) && nm !== sMon);
    if (incName) {
      const isheet = sheets1[incName];
      ok('收入分类统计：总计行占比 = 100%', Math.abs(val(sheets1, incName, isheet.rows, 3, cache) - 1) < 1e-9, val(sheets1, incName, isheet.rows, 3, cache));
    }
  }

  /* ===== 场景 2：储蓄目标比预算还大 ===== */
  section('【场景 2】储蓄目标（1500）大于预算（1000）：可支配取 0，不出现负数');
  DS.setSavingsTarget({ type: 'fixed', fixedAmount: 1500, percent: 0 });
  recalcAll('场景 2');

  /* ===== 场景 3：没设预算、没设储蓄目标 ===== */
  section('【场景 3】没设预算、没设储蓄目标（新用户的第一次导出）：页脚不许是 #DIV/0!');
  DS.setSavingsTarget({ type: 'fixed', fixedAmount: 0, percent: 0 });
  DS._data.budgets = {}; DS.save();
  const sheets3 = recalcAll('场景 3');
  if (sheets3) {
    const errs = [];
    Object.entries(sheets3).forEach(([name, sh]) => { const ev = makeEvaluator(sh);
      Object.entries(sh.grid).forEach(([k, cell]) => { if (!cell.f) return; const [r, c] = k.split(',').map(Number); try { ev.cell(r, c); } catch (e) { errs.push(name + ' R' + r + 'C' + c + ' ' + e.message); } }); });
    ok('没有任何公式算出错误', errs.length === 0, errs.slice(0, 4));
  }

  /* ===== 场景 4：空账本 ===== */
  section('【场景 4】空账本直接导出：页脚公式不许引用自己（循环引用）或报错');
  DS.clearAll();
  const sheets4 = recalcAll('场景 4');
  if (sheets4) {
    const bad = [];
    Object.entries(sheets4).forEach(([name, sh]) => { const ev = makeEvaluator(sh);
      Object.entries(sh.grid).forEach(([k, cell]) => { if (!cell.f) return; const [r, c] = k.split(',').map(Number); try { ev.cell(r, c); } catch (e) { bad.push(name + ' R' + r + 'C' + c + ' ' + e.message); } }); });
    ok('空账本：没有公式出错或循环引用', bad.length === 0, bad.slice(0, 4));
  }

  /* ===== 场景 5：只有收入记录 ===== */
  section('【场景 5】只有收入记录');
  seedRecords([E('i2', inc.id, 1200, '2026-09-01T09:00', { type: 'income' })]);
  recalcAll('场景 5');

  console.log('\n===== 结果: ' + pass + ' 通过 / ' + fail + ' 失败 =====');
  process.exit(fail ? 1 : 0);
}, 1500);
