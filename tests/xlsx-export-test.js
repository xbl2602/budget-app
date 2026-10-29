/* ============================================================
   Excel 导出必须是真正的 .xlsx
   ------------------------------------------------------------
   旧版把 SpreadsheetML 2003 的 XML 直接存成 .xlsx，Excel 会报
   "file format or file extension is not valid" 拒绝打开。
     X1  下载的是 zip（PK 头），不是 XML 文本
     X2  zip 目录完整、CRC 正确、必需部件齐全
     X3  每个部件都是良构 XML
     X4  每个 SpreadsheetML 工作表都有对应的 worksheet，名称合法
     X5  公式已从 R1C1 转成 A1，字符串字面量不被改写
     X6  非法值（NaN、控制字符）不会写进文件
     X7  SpreadsheetML 声明的每个样式都有 xlsx 对应项
     X8  r1c1ToA1 / 列字母的边界

   用法: bash build.sh && node tests/xlsx-export-test.js
         XLSX_OUT=/some/path.xlsx node tests/xlsx-export-test.js   # 另存一份供外部工具校验
   ============================================================ */
const fs = require('fs'), path = require('path'), zlib = require('zlib');
const { JSDOM } = require('jsdom');
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');

let pass = 0, fail = 0;
function ok(cond, label) {
  if (cond) { pass++; console.log('  ok   ' + label); }
  else { fail++; console.log('  FAIL ' + label); }
}

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

const dom = new JSDOM(html, {
  runScripts: 'dangerously', pretendToBeVisual: true, url: 'http://localhost/',
  beforeParse(w) {
    const s = canvasStub();
    w.HTMLCanvasElement.prototype.getContext = function () { s.canvas = this; return s; };
    w.HTMLCanvasElement.prototype.toDataURL = () => 'data:image/png;base64,AAA';
    w.URL.revokeObjectURL = () => {};
  },
});
const w = dom.window;

/** Minimal zip reader — enough to walk a store-only archive and verify CRCs. */
function readZip(buf) {
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  let eocd = -1;
  for (let i = buf.length - 22; i >= 0; i--) if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  if (eocd < 0) throw new Error('no end-of-central-directory');
  const n = dv.getUint16(eocd + 10, true);
  let p = dv.getUint32(eocd + 16, true);
  const files = {};
  for (let i = 0; i < n; i++) {
    if (dv.getUint32(p, true) !== 0x02014b50) throw new Error('bad central header');
    const method = dv.getUint16(p + 10, true), crc = dv.getUint32(p + 16, true);
    const csize = dv.getUint32(p + 20, true), nlen = dv.getUint16(p + 28, true);
    const elen = dv.getUint16(p + 30, true), clen = dv.getUint16(p + 32, true);
    const off = dv.getUint32(p + 42, true);
    const name = Buffer.from(buf.subarray(p + 46, p + 46 + nlen)).toString('utf8');
    if (dv.getUint32(off, true) !== 0x04034b50) throw new Error('bad local header for ' + name);
    const dataStart = off + 30 + dv.getUint16(off + 26, true) + dv.getUint16(off + 28, true);
    const data = buf.subarray(dataStart, dataStart + csize);
    files[name] = { method, crcOk: zlib.crc32(data) === crc, text: Buffer.from(data).toString('utf8') };
    p += 46 + nlen + elen + clen;
  }
  return files;
}

async function exportBytes() {
  let blob = null;
  w.URL.createObjectURL = b => { blob = b; return 'blob:x'; };
  w.HTMLAnchorElement.prototype.click = function () {};
  w.exportToExcel();
  return new Uint8Array(await blob.arrayBuffer());
}

setTimeout(async () => {
  try { await run(); } catch (e) { fail++; console.log('  FAIL threw: ' + (e && e.stack || e)); }
  console.log('\n===== ' + pass + ' pass / ' + fail + ' fail =====');
  process.exit(fail ? 1 : 0);
}, 800);

async function run() {
  const DS = w.DataStore;
  const raw = JSON.parse(DS.exportJSON());
  const expCat = DS.getExpenseRootCategories()[0].id;
  const incCat = DS.getIncomeRootCategories()[0].id;
  const mk = (id, amount, cat, date, note, extra) => Object.assign(
    { id, amount, categoryId: cat, date, note, tags: [], createdAt: date + 'T10:00:00', updatedAt: date + 'T10:00:00' }, extra || {});
  raw.records = [
    mk('r1', 12.5, expCat, '2026-09-03', 'a & b <c> "d" 😀'),
    mk('r2', 99, expCat, '2026-10-01', 'ctrl\u0001char\u000bhere'),
    mk('r3', 5000, incCat, '2026-10-02', '工资'),
    mk('r4', 40, expCat, '2026-10-05', '', { splitBillId: 'sb1', tags: ['聚餐', 'x'] }),
  ];
  raw.splitBills = [{ id: 'sb1', amount: 40, date: '2026-10-05', categoryId: expCat, selfShare: 20, mode: 'equal',
    note: '火锅', archived: false, participants: [{ name: 'Alice', share: 20, paid: false, unknown: false }] }];
  DS.clearAll();
  DS.importJSON(JSON.stringify(raw), 'replace');

  console.log('X1 下载内容是 zip');
  const bytes = await exportBytes();
  ok(bytes[0] === 0x50 && bytes[1] === 0x4B, 'starts with PK');
  ok(bytes[0] !== 0x3C, 'not raw XML text');

  console.log('X2 zip 完整');
  const z = readZip(bytes);
  const names = Object.keys(z);
  ['[Content_Types].xml', '_rels/.rels', 'xl/workbook.xml', 'xl/_rels/workbook.xml.rels', 'xl/styles.xml', 'xl/worksheets/sheet1.xml']
    .forEach(n => ok(names.includes(n), 'has ' + n));
  ok(names.every(n => z[n].crcOk), 'all CRCs match');
  ok(names.every(n => z[n].method === 0), 'all stored');

  console.log('X3 部件良构');
  const parser = new w.DOMParser();
  names.forEach(n => {
    const d = parser.parseFromString(z[n].text, 'application/xml');
    ok(!d.getElementsByTagName('parsererror').length, 'well-formed ' + n);
  });

  console.log('X4 工作表齐全');
  const sml = w.buildExcelSpreadsheetXml();
  const smlSheets = (sml.match(/<Worksheet /g) || []).length;
  const sheetParts = names.filter(n => /^xl\/worksheets\/sheet\d+\.xml$/.test(n));
  ok(smlSheets >= 7 && sheetParts.length === smlSheets, 'sheet count ' + sheetParts.length + ' == ' + smlSheets);
  const wbDoc = parser.parseFromString(z['xl/workbook.xml'].text, 'application/xml');
  const sheetNames = [...wbDoc.getElementsByTagName('sheet')].map(s => s.getAttribute('name'));
  ok(sheetNames.length === smlSheets, 'workbook lists every sheet');
  ok(sheetNames.every(s => s.length > 0 && s.length <= 31 && !/[\\\/?*\[\]:]/.test(s)), 'sheet names legal: ' + sheetNames.join(' | '));
  ok(new Set(sheetNames.map(s => s.toLowerCase())).size === sheetNames.length, 'sheet names unique');

  console.log('X5 公式转换');
  const all = sheetParts.map(n => z[n].text).join('\n');
  const formulas = [...all.matchAll(/<f>([^<]*)<\/f>/g)].map(m => m[1].replace(/&gt;/g, '>').replace(/&lt;/g, '<').replace(/&quot;/g, '"').replace(/&amp;/g, '&'));
  ok(formulas.length > 10, 'has formulas (' + formulas.length + ')');
  // R1C1 leftovers: RC[..], R[..]C, or R<digits>C<digits> outside quotes
  const stripStr = f => f.replace(/"(?:[^"]|"")*"/g, '""');
  ok(formulas.every(f => !/(^|[^A-Za-z])R(\[-?\d+\]|\d+)?C(\[-?\d+\]|\d+)?(?![A-Za-z(])/.test(stripStr(f))), 'no R1C1 left');
  ok(formulas.every(f => !f.includes('#REF!')), 'no #REF!');
  ok(formulas.every(f => !f.startsWith('=')), 'no leading = in <f>');
  const s1 = z['xl/worksheets/sheet1.xml'].text;
  // 合计 only adds the expense rows (type column B = 支出) — the footer used to SUM the whole 金额
  // column, so income was added in. Still checks the R1C1 -> A1 step: absolute ranges, and the
  // string criterion left intact.
  ok(/<f>SUMIF\(\$B\$2:\$B\$5,&quot;支出&quot;,\$D\$2:\$D\$5\)<\/f>/.test(s1), 'sheet1 footer SUMIF -> $B$2:$B$5 = 支出 over $D$2:$D$5');
  ok(formulas.some(f => /"[^"]*正常[^"]*"/.test(f)), 'string literal in status formula kept intact');
  ok(w.spreadsheetMLToXlsx && /autoFilter ref="A1:K5"/.test(s1), 'autofilter covers data rows A1:K5');
  ok(/<pane ySplit="1"[^>]*state="frozen"/.test(s1), 'header row frozen');

  console.log('X6 非法值');
  ok(!/<v>(NaN|Infinity|-Infinity)<\/v>/.test(all), 'no NaN/Infinity values');
  ok(!/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/.test(all), 'no control characters');
  ok(s1.includes('a &amp; b &lt;c&gt; &quot;d&quot; 😀'), 'special chars + emoji escaped, preserved');
  // NaN through the converter directly
  const nanXml = '<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">' +
    '<Worksheet ss:Name="t"><Table><Row><Cell><Data ss:Type="Number">NaN</Data></Cell></Row></Table></Worksheet></Workbook>';
  const nz = readZip(w.spreadsheetMLToXlsx(nanXml));
  ok(!/NaN/.test(nz['xl/worksheets/sheet1.xml'].text), 'NaN number cell written blank');

  console.log('X7 样式映射');
  const declared = [...sml.matchAll(/<Style ss:ID="([^"]+)"/g)].map(m => m[1]);
  const stylesDoc = parser.parseFromString(z['xl/styles.xml'].text, 'application/xml');
  const xfCount = stylesDoc.getElementsByTagName('cellXfs')[0].children.length;
  ok(declared.length === xfCount, 'cellXfs count ' + xfCount + ' == declared styles ' + declared.length);
  const used = new Set([...sml.matchAll(/ss:StyleID="([^"]+)"/g)].map(m => m[1]));
  const usedIdx = new Set([...all.matchAll(/ s="(\d+)"/g)].map(m => +m[1]));
  ok(usedIdx.size >= used.size, 'every used style has a distinct xf index (' + [...used].join(',') + ')');

  console.log('X8 边界');
  // the converter is internal; exercise it through a one-cell workbook
  const f1 = (r1c1, row, col) => {
    const xml = '<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">' +
      '<Worksheet ss:Name="t"><Table><Row ss:Index="' + row + '"><Cell ss:Index="' + col + '" ss:Formula="' + r1c1 + '"><Data ss:Type="Number">0</Data></Cell></Row></Table></Worksheet></Workbook>';
    const m = readZip(w.spreadsheetMLToXlsx(xml))['xl/worksheets/sheet1.xml'].text.match(/<f>([^<]*)<\/f>/);
    return m && m[1];
  };
  ok(f1('=RC[-1]', 5, 3) === 'B5', 'RC[-1] @C5 -> B5');
  ok(f1('=R[-1]C[-1]', 5, 3) === 'B4', 'R[-1]C[-1] @C5 -> B4');
  ok(f1('=SUM(R2C27:R9C27)', 1, 1) === 'SUM($AA$2:$AA$9)', 'column 27 -> AA');
  ok(f1('=RC[-5]', 2, 3) === '#REF!', 'off-sheet reference -> #REF!');
  ok(f1('=IF(RC[-1]>0, &quot;R2C2&quot;, 0)', 4, 2) === 'IF(A4&gt;0, &quot;R2C2&quot;, 0)', 'text inside quotes untouched');

  if (process.env.XLSX_OUT) { fs.writeFileSync(process.env.XLSX_OUT, bytes); console.log('  wrote ' + process.env.XLSX_OUT); }
}
