/* ============================================================
   EXCEL EXPORT — Generates a real .xlsx-compatible XML Spreadsheet
   with formulas (SUM, AVERAGE, MAX, MIN, IF, etc.) so the user
   can modify values and have them auto-recalculate.
   Sheets are emitted as XML Spreadsheet 2003 (SpreadsheetML), then
   converted by spreadsheetMLToXlsx() into a genuine .xlsx (OOXML in a
   store-only zip) — no library needed.
   ============================================================ */
(function() {
'use strict';

/* ---------- SpreadsheetML → .xlsx (OOXML in a store-only zip) ---------- */

const NS_SS = 'urn:schemas-microsoft-com:office:spreadsheet';
const NS_X  = 'urn:schemas-microsoft-com:office:excel';
const NS_MAIN = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
const NS_REL  = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';

// SpreadsheetML ss:ID → cellXfs index in XLSX_STYLES below. Keep both in step:
// a style missing here silently renders as Default.
const XLSX_STYLE_INDEX = {
  Default: 0, header: 1, headerGreen: 2, money: 3, moneyBold: 4,
  pct: 5, pctBold: 6, total: 7, danger: 8, success: 9, subtotal: 10
};

const XLSX_STYLES = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' +
  '<styleSheet xmlns="' + NS_MAIN + '">' +
  '<fonts count="5">' +
    '<font><sz val="11"/><name val="Calibri"/></font>' +
    '<font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font>' +
    '<font><b/><sz val="11"/><name val="Calibri"/></font>' +
    '<font><b/><sz val="11"/><color rgb="FFEF4444"/><name val="Calibri"/></font>' +
    '<font><b/><sz val="11"/><color rgb="FF10B981"/><name val="Calibri"/></font>' +
  '</fonts>' +
  '<fills count="6">' +
    '<fill><patternFill patternType="none"/></fill>' +
    '<fill><patternFill patternType="gray125"/></fill>' +
    '<fill><patternFill patternType="solid"><fgColor rgb="FF4472C4"/><bgColor indexed="64"/></patternFill></fill>' +
    '<fill><patternFill patternType="solid"><fgColor rgb="FF10B981"/><bgColor indexed="64"/></patternFill></fill>' +
    '<fill><patternFill patternType="solid"><fgColor rgb="FFF0F0F0"/><bgColor indexed="64"/></patternFill></fill>' +
    '<fill><patternFill patternType="solid"><fgColor rgb="FFE8E8E8"/><bgColor indexed="64"/></patternFill></fill>' +
  '</fills>' +
  '<borders count="3">' +
    '<border><left/><right/><top/><bottom/><diagonal/></border>' +
    '<border><left/><right/><top/><bottom style="thin"><color auto="1"/></bottom><diagonal/></border>' +
    '<border><left/><right/><top style="medium"><color auto="1"/></top><bottom/><diagonal/></border>' +
  '</borders>' +
  '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
  // numFmtId 4 = #,##0.00 and 10 = 0.00% are built in
  '<cellXfs count="11">' +
    '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>' +
    '<xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>' +
    '<xf numFmtId="0" fontId="1" fillId="3" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>' +
    '<xf numFmtId="4" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>' +
    '<xf numFmtId="4" fontId="2" fillId="0" borderId="0" xfId="0" applyNumberFormat="1" applyFont="1"/>' +
    '<xf numFmtId="10" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>' +
    '<xf numFmtId="10" fontId="2" fillId="0" borderId="0" xfId="0" applyNumberFormat="1" applyFont="1"/>' +
    '<xf numFmtId="0" fontId="2" fillId="4" borderId="2" xfId="0" applyFont="1" applyFill="1" applyBorder="1"/>' +
    '<xf numFmtId="0" fontId="3" fillId="0" borderId="0" xfId="0" applyFont="1"/>' +
    '<xf numFmtId="0" fontId="4" fillId="0" borderId="0" xfId="0" applyFont="1"/>' +
    '<xf numFmtId="0" fontId="2" fillId="5" borderId="0" xfId="0" applyFont="1" applyFill="1"/>' +
  '</cellXfs>' +
  '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>' +
  '</styleSheet>';

function xmlEsc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
// Control characters are illegal in XML 1.0 and make Excel declare the file corrupt.
function xmlText(s) {
  return xmlEsc(String(s).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/g, ''));
}

function colLetters(n) {
  let s = '';
  while (n > 0) {
    const m = (n - 1) % 26;
    s = String.fromCharCode(65 + m) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

// SpreadsheetML formulas are R1C1 (RC[-1], R2C4:R9C4); xlsx wants A1.
// `row`/`col` are the 1-based position of the cell holding the formula, which
// relative references hang off. String literals ("正常") are left alone.
function r1c1ToA1(formula, row, col) {
  const part = (p, cur) => {
    if (p === undefined) return { n: cur, abs: false };
    if (p.charAt(0) === '[') return { n: cur + parseInt(p.slice(1, -1), 10), abs: false };
    return { n: parseInt(p, 10), abs: true };
  };
  const re = /(^|[^A-Za-z0-9_.])R(\[-?\d+\]|\d+)?C(\[-?\d+\]|\d+)?(?![A-Za-z0-9_(])/g;
  return formula.split(/("(?:[^"]|"")*")/).map((chunk, i) => {
    if (i % 2 === 1) return chunk;
    return chunk.replace(re, (m, pre, rp, cp) => {
      const r = part(rp, row), c = part(cp, col);
      if (r.n < 1 || c.n < 1) return pre + '#REF!';
      return pre + (c.abs ? '$' : '') + colLetters(c.n) + (r.abs ? '$' : '') + r.n;
    });
  }).join('');
}

let _crcTable = null;
function crc32(bytes) {
  if (!_crcTable) {
    _crcTable = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
      _crcTable[n] = c >>> 0;
    }
  }
  let crc = 0xFFFFFFFF;
  for (let i = 0; i < bytes.length; i++) crc = _crcTable[(crc ^ bytes[i]) & 0xFF] ^ (crc >>> 8);
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

// Store-only zip (method 0). The export is a few KB of XML, so compression is
// not worth a dependency.
function zipStore(files) {
  const enc = new TextEncoder();
  const d = new Date();
  const dosTime = (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1);
  const dosDate = ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
  const entries = files.map(f => {
    const name = enc.encode(f.name);
    const data = typeof f.data === 'string' ? enc.encode(f.data) : f.data;
    return { name, data, crc: crc32(data), offset: 0 };
  });
  let size = 22;
  entries.forEach(e => { size += 30 + e.name.length + e.data.length + 46 + e.name.length; });
  const out = new Uint8Array(size);
  const dv = new DataView(out.buffer);
  let p = 0;
  entries.forEach(e => {
    e.offset = p;
    dv.setUint32(p, 0x04034b50, true);
    dv.setUint16(p + 4, 20, true);
    dv.setUint16(p + 6, 0x0800, true);          // bit 11: UTF-8 names
    dv.setUint16(p + 8, 0, true);               // stored
    dv.setUint16(p + 10, dosTime, true);
    dv.setUint16(p + 12, dosDate, true);
    dv.setUint32(p + 14, e.crc, true);
    dv.setUint32(p + 18, e.data.length, true);
    dv.setUint32(p + 22, e.data.length, true);
    dv.setUint16(p + 26, e.name.length, true);
    dv.setUint16(p + 28, 0, true);
    out.set(e.name, p + 30);
    out.set(e.data, p + 30 + e.name.length);
    p += 30 + e.name.length + e.data.length;
  });
  const cdStart = p;
  entries.forEach(e => {
    dv.setUint32(p, 0x02014b50, true);
    dv.setUint16(p + 4, 20, true);
    dv.setUint16(p + 6, 20, true);
    dv.setUint16(p + 8, 0x0800, true);
    dv.setUint16(p + 10, 0, true);
    dv.setUint16(p + 12, dosTime, true);
    dv.setUint16(p + 14, dosDate, true);
    dv.setUint32(p + 16, e.crc, true);
    dv.setUint32(p + 20, e.data.length, true);
    dv.setUint32(p + 24, e.data.length, true);
    dv.setUint16(p + 28, e.name.length, true);
    // extra/comment length, disk number, internal + external attrs stay 0
    dv.setUint32(p + 42, e.offset, true);
    out.set(e.name, p + 46);
    p += 46 + e.name.length;
  });
  dv.setUint32(p, 0x06054b50, true);
  dv.setUint16(p + 8, entries.length, true);
  dv.setUint16(p + 10, entries.length, true);
  dv.setUint32(p + 12, p - cdStart, true);
  dv.setUint32(p + 16, cdStart, true);
  return out;
}

function kids(el, localName) {
  return Array.prototype.filter.call(el.children, c => c.localName === localName);
}

function spreadsheetMLToXlsx(xml) {
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  if (doc.getElementsByTagName('parsererror').length) throw new Error('SpreadsheetML is not well-formed');

  const usedNames = {}, names = [];
  const sheets = kids(doc.documentElement, 'Worksheet').map((ws, si) => {
    let name = (ws.getAttributeNS(NS_SS, 'Name') || '').replace(/[\\\/?*\[\]:]/g, ' ').trim().slice(0, 31) || ('Sheet' + (si + 1));
    while (usedNames[name.toLowerCase()]) name = name.slice(0, 28) + '_' + (si + 1);
    usedNames[name.toLowerCase()] = true;
    names.push(name);

    const table = kids(ws, 'Table')[0];
    let colsXml = '';
    kids(table, 'Column').forEach((c, i) => {
      const w = parseFloat(c.getAttributeNS(NS_SS, 'Width'));
      if (w > 0) colsXml += '<col min="' + (i + 1) + '" max="' + (i + 1) + '" width="' + (Math.round(w / 5.25 * 100) / 100) + '" customWidth="1"/>';
    });

    let rowNo = 0, rowsXml = '';
    kids(table, 'Row').forEach(row => {
      rowNo = parseInt(row.getAttributeNS(NS_SS, 'Index'), 10) || rowNo + 1;
      let colNo = 0, cellsXml = '';
      kids(row, 'Cell').forEach(cell => {
        colNo = parseInt(cell.getAttributeNS(NS_SS, 'Index'), 10) || colNo + 1;
        const ref = colLetters(colNo) + rowNo;
        const styleIdx = XLSX_STYLE_INDEX[cell.getAttributeNS(NS_SS, 'StyleID')] || 0;
        const attrs = ' r="' + ref + '"' + (styleIdx ? ' s="' + styleIdx + '"' : '');
        const data = kids(cell, 'Data')[0];
        const text = data ? data.textContent : '';
        const isNum = data && data.getAttributeNS(NS_SS, 'Type') === 'Number';
        const rawF = cell.getAttributeNS(NS_SS, 'Formula');
        const f = rawF ? '<f>' + xmlText(r1c1ToA1(rawF.replace(/^=/, ''), rowNo, colNo)) + '</f>' : '';
        if (isNum) {
          // NaN / Infinity in <v> is a corrupt-file error in Excel; leave the cell blank instead.
          const num = Number(text);
          cellsXml += '<c' + attrs + '>' + f + (text.trim() !== '' && isFinite(num) ? '<v>' + num + '</v>' : '') + '</c>';
        } else if (f) {
          cellsXml += '<c' + attrs + ' t="str">' + f + '<v>' + xmlText(text) + '</v></c>';
        } else if (text === '') {
          cellsXml += '<c' + attrs + '/>';
        } else {
          cellsXml += '<c' + attrs + ' t="inlineStr"><is><t xml:space="preserve">' + xmlText(text) + '</t></is></c>';
        }
      });
      rowsXml += '<row r="' + rowNo + '">' + cellsXml + '</row>';
    });

    // The only worksheet options the exporter emits: a frozen header row and an autofilter.
    let pane = '';
    const opts = kids(ws, 'WorksheetOptions')[0];
    const split = opts && kids(opts, 'SplitHorizontal')[0];
    if (split && parseInt(split.textContent, 10) > 0) {
      const y = parseInt(split.textContent, 10);
      pane = '<pane ySplit="' + y + '" topLeftCell="A' + (y + 1) + '" activePane="bottomLeft" state="frozen"/>' +
             '<selection pane="bottomLeft" activeCell="A' + (y + 1) + '" sqref="A' + (y + 1) + '"/>';
    }
    const af = kids(ws, 'AutoFilter')[0];
    const afRange = af && af.getAttributeNS(NS_X, 'Range');

    return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' +
      '<worksheet xmlns="' + NS_MAIN + '">' +
      '<sheetViews><sheetView workbookViewId="0"' + (si === 0 ? ' tabSelected="1"' : '') + '>' + pane + '</sheetView></sheetViews>' +
      '<sheetFormatPr defaultRowHeight="15"/>' +
      (colsXml ? '<cols>' + colsXml + '</cols>' : '') +
      '<sheetData>' + rowsXml + '</sheetData>' +
      (afRange ? '<autoFilter ref="' + r1c1ToA1(afRange, 1, 1).replace(/\$/g, '') + '"/>' : '') +
      '</worksheet>';
  });

  const files = [
    { name: '[Content_Types].xml', data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' +
      '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
      '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
      '<Default Extension="xml" ContentType="application/xml"/>' +
      '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
      '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
      sheets.map((_, i) => '<Override PartName="/xl/worksheets/sheet' + (i + 1) + '.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>').join('') +
      '</Types>' },
    { name: '_rels/.rels', data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' +
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      '<Relationship Id="rId1" Type="' + NS_REL + '/officeDocument" Target="xl/workbook.xml"/>' +
      '</Relationships>' },
    { name: 'xl/workbook.xml', data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' +
      '<workbook xmlns="' + NS_MAIN + '" xmlns:r="' + NS_REL + '">' +
      '<bookViews><workbookView/></bookViews>' +
      '<sheets>' + sheets.map((_, i) => '<sheet name="' + xmlEsc(names[i]) + '" sheetId="' + (i + 1) + '" r:id="rId' + (i + 1) + '"/>').join('') + '</sheets>' +
      // cached <v> values for formula cells are placeholders; have Excel recompute everything on open
      '<calcPr calcId="191029" fullCalcOnLoad="1"/>' +
      '</workbook>' },
    { name: 'xl/_rels/workbook.xml.rels', data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' +
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      sheets.map((_, i) => '<Relationship Id="rId' + (i + 1) + '" Type="' + NS_REL + '/worksheet" Target="worksheets/sheet' + (i + 1) + '.xml"/>').join('') +
      '<Relationship Id="rId' + (sheets.length + 1) + '" Type="' + NS_REL + '/styles" Target="styles.xml"/>' +
      '</Relationships>' },
    { name: 'xl/styles.xml', data: XLSX_STYLES }
  ];
  sheets.forEach((s, i) => files.push({ name: 'xl/worksheets/sheet' + (i + 1) + '.xml', data: s }));
  return zipStore(files);
}

function buildSpreadsheetXml() {
  const records = DataStore.getRecords();
  // Sheet 1 lists the whole ledger, but every aggregate below it is a SPENDING
  // question and must not see income. Keeping the two lists apart here is what
  // stops 工资 from inflating 总支出 while still being in the file.
  const expenseRecs = expenseRecords(records);
  const incomeRecs = incomeRecords(records);
  const cats = DataStore.getCategories();
  const catMap = {};
  cats.forEach(c => catMap[c.id] = c);

  // Build a parent-chain map for subcategory detection
  const parentMap = {};
  cats.forEach(c => { if (c.parentId) parentMap[c.id] = c.parentId; });
  function getRootCatId(id) {
    let cur = id;
    const seen = new Set();   // a looped parent chain must not hang the export
    while (parentMap[cur] && !seen.has(cur)) { seen.add(cur); cur = parentMap[cur]; }
    return cur;
  }

  // Helper: escape XML text
  const esc = xmlText;
  // Helper: format a number nicely
  const fmtNum = n => Number(n).toFixed(2);
  // The value a cell actually holds once written (two decimals). Totals, averages and
  // the "value saved next to each formula" are computed from THIS, so a viewer that
  // shows the saved value and Excel (which recalculates on open) agree.
  const cellNum = n => Number(fmtNum(n));
  const sumOf = a => a.reduce((s, v) => s + v, 0);
  const r2 = n => Math.round(n * 100) / 100;
  // Ratios keep six decimals; fmtNum's two turned 37.5% into 38% wherever the saved value is shown.
  const fmtRatio = n => String(Math.round(Number(n) * 1e6) / 1e6);
  // One footer cell: the formula only when there are rows to point at (an empty range such
  // as R2C2:R1C2 reaches back over the formula's own row and Excel reports a circular reference).
  const footCell = (style, formula, value, asText, index) =>
    '    <Cell' + (index ? ' ss:Index="' + index + '"' : '') + ' ss:StyleID="' + style + '"' + (formula ? ' ss:Formula="=' + formula + '"' : '') + '>' +
    (asText ? '<Data ss:Type="String">' + esc(value) + '</Data>' : '<Data ss:Type="Number">' + value + '</Data>') + '</Cell>\n';

  // --- Gather all months with records ---
  const monthSet = new Set();
  records.forEach(r => {
    const m = getMonthKey(r.date || r.createdAt);
    if (m) monthSet.add(m);
  });
  const sortedMonths = [...monthSet].sort();
  const currentMonth = getMonthKey(new Date().toISOString());

  // --- Monthly aggregates (expenses only, plus income alongside) ---
  const monthData = {};
  sortedMonths.forEach(m => {
    const ms = expenseRecs.filter(r => getMonthKey(r.date || r.createdAt) === m);
    const inc = incomeRecs.filter(r => getMonthKey(r.date || r.createdAt) === m);
    const total = ms.reduce((s, r) => s + r.amount, 0);
    const income = inc.reduce((s, r) => s + r.amount, 0);
    const daysInMonth = new Date(parseInt(m.split('-')[0]), parseInt(m.split('-')[1]), 0).getDate();
    const dailyAvg = total / daysInMonth;
    monthData[m] = { records: ms, total, income, net: income - total, dailyAvg, count: ms.length };
  });

  // --- Category aggregates (root-level) ---
  const rootCats = DataStore.getExpenseRootCategories();
  // For each root cat, sum amounts across all time
  const catTotals = {};
  expenseRecs.forEach(r => {
    const rootId = getRootCatId(r.categoryId);
    catTotals[rootId] = (catTotals[rootId] || 0) + r.amount;
  });
  const sortedCats = rootCats.map(c => ({
    id: c.id, name: c.name, icon: c.icon, total: catTotals[c.id] || 0
  })).sort((a, b) => b.total - a.total);

  // --- Get budget & savings ---
  const budgets = DataStore.getBudgets();
  const savingsTarget = DataStore.getSavingsTarget();

  // ========== Build the XML ==========
  let xml = '<?xml version="1.0" encoding="UTF-8"?>\n';
  xml += '<?mso-application progid="Excel.Sheet"?>\n';
  xml += '<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"\n';
  xml += ' xmlns:o="urn:schemas-microsoft-com:office:office"\n';
  xml += ' xmlns:x="urn:schemas-microsoft-com:office:excel"\n';
  xml += ' xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"\n';
  xml += ' xmlns:html="http://www.w3.org/TR/REC-html40">\n';

  // --- Styles ---
  xml += ' <Styles>\n';
  xml += '  <Style ss:ID="Default" ss:Name="Normal"><Font ss:Size="11"/></Style>\n';
  xml += '  <Style ss:ID="header"><Font ss:Bold="1" ss:Color="#FFFFFF" ss:Size="11"/><Interior ss:Color="#4472C4" ss:Pattern="Solid"/><Alignment ss:Horizontal="Center" ss:Vertical="Center"/><Borders><Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1"/></Borders></Style>\n';
  xml += '  <Style ss:ID="headerGreen"><Font ss:Bold="1" ss:Color="#FFFFFF" ss:Size="11"/><Interior ss:Color="#10B981" ss:Pattern="Solid"/><Alignment ss:Horizontal="Center" ss:Vertical="Center"/><Borders><Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1"/></Borders></Style>\n';
  xml += '  <Style ss:ID="money"><NumberFormat ss:Format="#,##0.00"/></Style>\n';
  xml += '  <Style ss:ID="moneyBold"><NumberFormat ss:Format="#,##0.00"/><Font ss:Bold="1"/></Style>\n';
  xml += '  <Style ss:ID="pct"><NumberFormat ss:Format="0.00%"/></Style>\n';
  xml += '  <Style ss:ID="pctBold"><NumberFormat ss:Format="0.00%"/><Font ss:Bold="1"/></Style>\n';
  xml += '  <Style ss:ID="total"><Font ss:Bold="1" ss:Size="11"/><Interior ss:Color="#F0F0F0" ss:Pattern="Solid"/><Borders><Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="2"/></Borders></Style>\n';
  xml += '  <Style ss:ID="danger"><Font ss:Color="#EF4444" ss:Bold="1"/></Style>\n';
  xml += '  <Style ss:ID="success"><Font ss:Color="#10B981" ss:Bold="1"/></Style>\n';
  xml += '  <Style ss:ID="subtotal"><Font ss:Bold="1"/><Interior ss:Color="#E8E8E8" ss:Pattern="Solid"/></Style>\n';
  xml += ' </Styles>\n';

  // ===== SHEET 1: 消费记录 (Records) =====
  // Columns: A=序号, B=类型, C=日期, D=金额, E=分类, F=子分类, G=备注, H=月份,
  //          I=不计日均, J=标签, K=分摊
  // 类型 sits second because it is the one column that reorders how you read every
  // other one, and next to 序号 it is visible without horizontal scrolling.
  const nCols = 11;
  // Prepare records sorted newest first
  const sortedRecords = [...records].sort((a, b) => (b.date || b.createdAt) > (a.date || a.createdAt) ? 1 : -1);
  const dataStartRow = 2; // row 1 = header, data starts row 2
  const dataEndRow = dataStartRow + sortedRecords.length - 1;

  // Split bill lookup for split-marker column (records store full amount; my share lives on the bill)
  const splitBills = (DataStore._data && Array.isArray(DataStore._data.splitBills)) ? DataStore._data.splitBills : [];
  const splitBillMap = {};
  splitBills.forEach(b => { if (b && b.id) splitBillMap[b.id] = b; });

  xml += ' <Worksheet ss:Name="' + __('excel.sheet.records') + '">\n';
  xml += '  <Table>\n';
  xml += '   <Column ss:Width="50"/>\n';   // A: 序号
  xml += '   <Column ss:Width="70"/>\n';   // B: 类型
  xml += '   <Column ss:Width="110"/>\n';  // C: 日期
  xml += '   <Column ss:Width="100"/>\n';  // D: 金额
  xml += '   <Column ss:Width="100"/>\n';  // E: 分类
  xml += '   <Column ss:Width="120"/>\n';  // F: 子分类
  xml += '   <Column ss:Width="200"/>\n';  // G: 备注
  xml += '   <Column ss:Width="80"/>\n';   // H: 月份
  xml += '   <Column ss:Width="60"/>\n';   // I: 不计日均
  xml += '   <Column ss:Width="140"/>\n';  // J: 标签
  xml += '   <Column ss:Width="120"/>\n';  // K: 分摊
  // Header row
  xml += '   <Row>\n';
  [__('excel.header.seq'),__('excel.header.type'),__('excel.header.date'),__('excel.header.amount'),__('excel.header.category'),__('excel.header.subcategory'),__('excel.header.note'),__('excel.header.month'),__('excel.header.excludeFromAvg'),__('excel.header.tags'),__('excel.header.split')].forEach(h => {
    xml += `    <Cell ss:StyleID="header"><Data ss:Type="String">${esc(h)}</Data></Cell>\n`;
  });
  xml += '   </Row>\n';

  // Data rows
  sortedRecords.forEach((r, idx) => {
    const rowNum = dataStartRow + idx;
    const cat = catMap[r.categoryId] || { name: __('excel.label.unknown'), icon: '❓' };
    const rootCat = cat.parentId ? (catMap[getRootCatId(r.categoryId)] || null) : cat;
    const dateVal = r.date || r.createdAt.slice(0,10);
    const monthKey = getMonthKey(dateVal);
    const splitMark = r.splitBillId ? (splitBillMap[r.splitBillId]
      ? '🧾 ' + __('excel.label.splitBill') + ' · ' + __('excel.label.myShare') + ' ' + fmtNum(splitBillMap[r.splitBillId].selfShare || 0)
      : '🧾 ' + __('excel.label.splitBill')) : '';
    const tagsVal = Array.isArray(r.tags) ? r.tags.join('、') : '';
    const isIncome = isIncomeRec(r);
    xml += '   <Row>\n';
    xml += `    <Cell><Data ss:Type="Number">${idx+1}</Data></Cell>\n`;
    xml += `    <Cell${isIncome ? ' ss:StyleID="success"' : ''}><Data ss:Type="String">${esc(isIncome ? __('excel.label.income') : __('excel.label.expense'))}</Data></Cell>\n`;
    xml += `    <Cell><Data ss:Type="String">${esc(dateVal)}</Data></Cell>\n`;
    xml += `    <Cell ss:StyleID="money"><Data ss:Type="Number">${fmtNum(r.amount)}</Data></Cell>\n`;
    // Category: root category name
    xml += `    <Cell><Data ss:Type="String">${esc(rootCat ? rootCat.icon + ' ' + rootCat.name : cat.icon + ' ' + cat.name)}</Data></Cell>\n`;
    // Subcategory: if parent exists, show subcategory, else show parent name
    const subName = cat.parentId ? cat.name : '';
    xml += `    <Cell><Data ss:Type="String">${esc(subName)}</Data></Cell>\n`;
    xml += `    <Cell><Data ss:Type="String">${esc(r.note || '')}</Data></Cell>\n`;
    xml += `    <Cell><Data ss:Type="String">${esc(monthKey)}</Data></Cell>\n`;
    xml += `    <Cell><Data ss:Type="String">${r.excludeFromAvg ? __('excel.label.yes') : ''}</Data></Cell>\n`;
    xml += `    <Cell><Data ss:Type="String">${esc(tagsVal)}</Data></Cell>\n`;
    xml += `    <Cell><Data ss:Type="String">${esc(splitMark)}</Data></Cell>\n`;
    xml += '   </Row>\n';
  });

  // --- Summary footer with formulas (rows after data) ---
  // R1C1 notation: R{row}C{col}
  // Four short rows, each figure under the 金额 column. EXPENSES ONLY: the footer used to
  // SUM / AVERAGE the whole column, so a 3000 salary was added into 合计 and into 平均 —
  // and the cells were written one after another, so the figures ended up under the
  // 日期 / 分类 / 备注 headings instead of under 金额.
  const cAmountCol = 4; // column D = 4
  const rFirst = dataStartRow;
  const rLast = dataEndRow;
  const hasRows = sortedRecords.length > 0;
  const expAmts = sortedRecords.filter(r => !isIncomeRec(r)).map(r => cellNum(r.amount));
  const expCount = expAmts.length;
  const expTotal = r2(sumOf(expAmts));
  const tRng = 'R' + rFirst + 'C2:R' + rLast + 'C2';                       // 类型 column
  const aRng = 'R' + rFirst + 'C' + cAmountCol + ':R' + rLast + 'C' + cAmountCol;   // 金额 column
  const isExp = '&quot;' + esc(__('excel.label.expense')) + '&quot;';
  const sumF = 'SUMIF(' + tRng + ',' + isExp + ',' + aRng + ')';
  const cntF = 'COUNTIF(' + tRng + ',' + isExp + ')';
  const footRow = (label, extra, formula, value) =>
    '   <Row>\n' +
    '    <Cell ss:StyleID="total"><Data ss:Type="String">' + esc(label) + '</Data></Cell>\n' +
    (extra ? '    <Cell ss:StyleID="total"><Data ss:Type="String">' + esc(extra) + '</Data></Cell>\n' : '') +
    footCell('moneyBold', hasRows ? formula : '', fmtNum(value), false, cAmountCol) +
    '   </Row>\n';
  xml += footRow(__('excel.summary.total') + __('excel.summary.expenseOnly'), __('excel.summary.records') + ': ' + expCount, sumF, expTotal);
  xml += footRow(__('excel.summary.average'), '', 'IF(' + cntF + '>0,' + sumF + '/' + cntF + ',0)', expCount ? expTotal / expCount : 0);
  // MAX / MIN limited to expense rows without array-entered formulas: SUMPRODUCT makes Excel
  // evaluate the inner expression row by row; for MIN every non-expense row is pushed out of
  // the way with +1E+15.
  xml += footRow(__('excel.summary.max'), '', 'SUMPRODUCT(MAX((' + tRng + '=' + isExp + ')*' + aRng + '))', expCount ? expAmts.reduce((a, b) => Math.max(a, b), -Infinity) : 0);
  xml += footRow(__('excel.summary.min'), '', 'IF(' + cntF + '>0,SUMPRODUCT(MIN(' + aRng + '+(' + tRng + '&lt;&gt;' + isExp + ')*1E+15)),0)', expCount ? expAmts.reduce((a, b) => Math.min(a, b), Infinity) : 0);

  xml += '  </Table>\n';
  // Auto-filter on header row
  xml += '  <x:AutoFilter x:Range="R1C1:R' + Math.max(1, dataEndRow) + 'C' + nCols + '" xmlns="urn:schemas-microsoft-com:office:excel"/>\n';
  // Freeze header row
  xml += '  <x:WorksheetOptions xmlns="urn:schemas-microsoft-com:office:excel">\n';
  xml += '   <x:FreezePanes/>\n';
  xml += '   <x:FrozenNoSplit/>\n';
  xml += '   <x:SplitHorizontal>1</x:SplitHorizontal>\n';
  xml += '   <x:TopRowBottomPane>1</x:TopRowBottomPane>\n';
  xml += '   <x:ActivePane>2</x:ActivePane>\n';
  xml += '  </x:WorksheetOptions>\n';
  xml += ' </Worksheet>\n';

  // ===== SHEET 2: 分类统计 (Category Breakdown) =====
  // Columns: A=分类, B=总支出, C=占比, D=记录数
  xml += ' <Worksheet ss:Name="' + __('excel.sheet.categoryBreakdown') + '">\n';  xml += '  <Table>\n';
  xml += '   <Column ss:Width="150"/>\n';
  xml += '   <Column ss:Width="100"/>\n';
  xml += '   <Column ss:Width="80"/>\n';
  xml += '   <Column ss:Width="80"/>\n';
  xml += '   <Row>\n';
  [__('excel.header.category'),__('excel.header.totalExpenditure'),__('excel.header.percentage'),__('excel.header.recordCount')].forEach(h => {
    xml += `    <Cell ss:StyleID="headerGreen"><Data ss:Type="String">${esc(h)}</Data></Cell>\n`;
  });
  xml += '   </Row>\n';

  const catStartRow = 2;
  // A root row is followed by one row per sub-category, so the root rows are NOT
  // consecutive. The grand total must add exactly the root rows (the sub-categories are
  // already inside them), which used to be written as one range R2:R<number of roots+1>
  // — it stopped short, in the middle of the first few categories' children.
  const rootRowOf = {};
  let nextCatRow = catStartRow;
  sortedCats.forEach(c => { rootRowOf[c.id] = nextCatRow; nextCatRow += 1 + DataStore.getChildren(c.id).length; });
  const rootRowRefs = col => 'SUM(' + sortedCats.map(c => 'R' + rootRowOf[c.id] + 'C' + col).join(',') + ')';
  const rootCountOf = {};
  sortedCats.forEach(c => { rootCountOf[c.id] = expenseRecs.filter(r => getRootCatId(r.categoryId) === c.id).length; });
  const allCatSum = r2(sumOf(sortedCats.map(c => cellNum(c.total))));
  sortedCats.forEach((c) => {
    const catCount = rootCountOf[c.id];
    // Also include sub-breakdown: children
    const children = DataStore.getChildren(c.id);
    const rootTotal = cellNum(c.total);
    // For the total row of this root cat
    xml += '   <Row>\n';
    xml += `    <Cell><Data ss:Type="String">${esc(c.icon + ' ' + c.name)}</Data></Cell>\n`;
    xml += `    <Cell ss:StyleID="money"><Data ss:Type="Number">${fmtNum(c.total)}</Data></Cell>\n`;
    // Percentage: this amount / the sum of the root rows
    if (allCatSum > 0) {
      const tot = rootRowRefs(2);
      xml += `    <Cell ss:StyleID="pct" ss:Formula="=IF(${tot}&gt;0, RC[-1]/${tot}, 0)"><Data ss:Type="Number">${fmtRatio(rootTotal / allCatSum)}</Data></Cell>\n`;
    } else {
      xml += `    <Cell ss:StyleID="pct"><Data ss:Type="Number">0</Data></Cell>\n`;
    }
    xml += `    <Cell><Data ss:Type="Number">${catCount}</Data></Cell>\n`;
    xml += '   </Row>\n';

    // Subcategories under this root
    if (children.length > 0) {
      children.forEach(child => {
        const childRecs = expenseRecs.filter(r => r.categoryId === child.id);
        const childTotal = childRecs.reduce((s, r) => s + r.amount, 0);
        const childCount = childRecs.length;
        xml += '   <Row>\n';
        xml += `    <Cell><Data ss:Type="String">  ↳ ${esc(child.icon + ' ' + child.name)}</Data></Cell>\n`;
        xml += `    <Cell ss:StyleID="money"><Data ss:Type="Number">${fmtNum(childTotal)}</Data></Cell>\n`;
        // Subcategory % = this subcategory / ITS ROOT's row. The old R[-1]C[-1] meant "the row
        // above", which is the root only for the first child — for the second it was the first
        // child, so 午餐 60 of 餐饮 200 read as 60 / 40 = 150%.
        if (rootTotal > 0) {
          xml += `    <Cell ss:StyleID="pct" ss:Formula="=IF(R${rootRowOf[c.id]}C2&gt;0, RC[-1]/R${rootRowOf[c.id]}C2, 0)"><Data ss:Type="Number">${fmtRatio(cellNum(childTotal) / rootTotal)}</Data></Cell>\n`;
        } else {
          xml += `    <Cell ss:StyleID="pct"><Data ss:Type="Number">0</Data></Cell>\n`;
        }
        xml += `    <Cell><Data ss:Type="Number">${childCount}</Data></Cell>\n`;
        xml += '   </Row>\n';
      });
    }
  });

  // Total row: the root rows only; 100% is simply 100%
  const hasCats = sortedCats.length > 0;
  xml += '   <Row>\n';
  xml += `    <Cell ss:StyleID="total"><Data ss:Type="String">${__('excel.summary.grandTotal')}</Data></Cell>\n`;
  xml += footCell('moneyBold', hasCats ? rootRowRefs(2) : '', fmtNum(allCatSum), false);
  xml += `    <Cell ss:StyleID="pctBold"><Data ss:Type="Number">${allCatSum > 0 ? 1 : 0}</Data></Cell>\n`;
  xml += footCell('total', hasCats ? rootRowRefs(4) : '', sumOf(sortedCats.map(c => rootCountOf[c.id])), false);
  xml += '   </Row>\n';

  xml += '  </Table>\n';
  xml += ' </Worksheet>\n';

  // ===== SHEET 3: 月度统计 (Monthly Summary) =====
  // Columns: A=月份, B=总支出, C=记录数, D=日均支出, E=预算, F=可支配, G=储蓄,
  //          H=预算使用率, I=收入记录, J=结余
  // I and J are appended rather than interleaved so every existing R1C1 relative
  // reference (G's `RC[-5]`, H's `RC[-6]`) keeps pointing where it used to.
  xml += ' <Worksheet ss:Name="' + __('excel.sheet.monthlySummary') + '">\n';
  xml += '  <Table>\n';
  xml += '   <Column ss:Width="90"/>\n';
  xml += '   <Column ss:Width="100"/>\n';
  xml += '   <Column ss:Width="70"/>\n';
  xml += '   <Column ss:Width="100"/>\n';
  xml += '   <Column ss:Width="100"/>\n';
  xml += '   <Column ss:Width="100"/>\n';
  xml += '   <Column ss:Width="100"/>\n';
  xml += '   <Column ss:Width="100"/>\n';
  xml += '   <Column ss:Width="100"/>\n';  // I: 收入记录
  xml += '   <Column ss:Width="100"/>\n';  // J: 结余
  xml += '   <Row>\n';
  [__('excel.header.month'),__('excel.header.totalExpenditure'),__('excel.header.recordCount'),__('excel.header.dailyAvgExpenditure'),__('excel.header.budget'),__('excel.header.spendable'),__('excel.header.savings'),__('excel.header.budgetUsageRate'),__('excel.header.recordedIncome'),__('excel.header.net')].forEach(h => {
    xml += `    <Cell ss:StyleID="header"><Data ss:Type="String">${esc(h)}</Data></Cell>\n`;
  });
  xml += '   </Row>\n';

  const monthStartRow = 2;
  // Sort months descending (newest first)
  const monthsDesc = [...sortedMonths].sort((a, b) => a > b ? -1 : 1);
  // What each column holds, kept as we write so the footer can state the right figure next
  // to its formula (and so a viewer that does not recalculate still shows correct totals).
  const mCol = { total: [], count: [], daily: [], budget: [], spendable: [], savings: [], usage: [], income: [], net: [] };
  monthsDesc.forEach((m, idx) => {
    const rowNum = monthStartRow + idx;
    const md = monthData[m];
    const budget = DataStore.getBudget(m);
    let spendable = budget;
    let savingsAmt = 0;
    // Calculate savings target for this month
    const targetObj = DataStore.getSavingsTarget();
    const targetType = targetObj.type || 'fixed';
    let targetAmount = 0;
    if (targetType === 'fixed') targetAmount += (targetObj.fixedAmount || 0);
    if (targetType === 'percent') targetAmount += budget * ((targetObj.percent || 0) / 100);
    spendable = Math.max(0, budget - targetAmount);
    // Worked out from the cells as written (two decimals), the way the formulas will
    const tC = cellNum(md.total), sC = cellNum(spendable), bC = cellNum(budget);
    savingsAmt = sC > 0 ? r2(sC - tC) : (tC > 0 ? -tC : 0);
    const netC = r2(cellNum(md.income) - tC);

    xml += '   <Row>\n';
    xml += `    <Cell><Data ss:Type="String">${esc(m)}</Data></Cell>\n`;
    xml += `    <Cell ss:StyleID="money"><Data ss:Type="Number">${fmtNum(md.total)}</Data></Cell>\n`;
    xml += `    <Cell><Data ss:Type="Number">${md.count}</Data></Cell>\n`;
    xml += `    <Cell ss:StyleID="money"><Data ss:Type="Number">${fmtNum(md.dailyAvg)}</Data></Cell>\n`;
    xml += `    <Cell ss:StyleID="money"><Data ss:Type="Number">${fmtNum(budget)}</Data></Cell>\n`;
    xml += `    <Cell ss:StyleID="money"><Data ss:Type="Number">${fmtNum(spendable)}</Data></Cell>\n`;
    // Savings formula: F - B (可支配 - 总支出)
    // If 可支配>0: savings = 可支配 - 支出; else: savings = -支出 (or 0)
    xml += `    <Cell ss:StyleID="money" ss:Formula="=IF(RC[-1]>0, RC[-1]-RC[-5], IF(RC[-5]>0, -RC[-5], 0))"><Data ss:Type="Number">${fmtNum(savingsAmt)}</Data></Cell>\n`;
    // Budget usage rate: B / E (总支出 / 预算)
    if (bC > 0) {
      xml += `    <Cell ss:StyleID="pct" ss:Formula="=IF(RC[-3]>0, RC[-6]/RC[-3], 0)"><Data ss:Type="Number">${fmtRatio(tC / bC)}</Data></Cell>\n`;
      mCol.usage.push(tC / bC);
    } else {
      xml += `    <Cell><Data ss:Type="String">${esc(__('excel.summary.noBudget'))}</Data></Cell>\n`;
    }
    xml += `    <Cell ss:StyleID="money"><Data ss:Type="Number">${fmtNum(md.income)}</Data></Cell>\n`;
    // 结余 = 收入记录 − 总支出 (I − B), as a formula so editing a row above updates it
    xml += `    <Cell ss:StyleID="money" ss:Formula="=RC[-1]-RC[-8]"><Data ss:Type="Number">${fmtNum(netC)}</Data></Cell>\n`;
    xml += '   </Row>\n';
    mCol.total.push(tC); mCol.count.push(md.count); mCol.daily.push(cellNum(md.dailyAvg)); mCol.budget.push(bC);
    mCol.spendable.push(sC); mCol.savings.push(savingsAmt); mCol.income.push(cellNum(md.income)); mCol.net.push(netC);
  });

  // Totals row. With no months at all there is nothing to add up, and R2:R1 would point
  // back at the formula's own row, so the cells are plain zeros then.
  const monthEndRow = monthStartRow + monthsDesc.length - 1;
  const hasMonths = monthsDesc.length > 0;
  const mRng = c => 'R' + monthStartRow + 'C' + c + ':R' + monthEndRow + 'C' + c;
  const avgOf = a => a.length ? sumOf(a) / a.length : 0;
  xml += '   <Row>\n';
  xml += `    <Cell ss:StyleID="total"><Data ss:Type="String">${__('excel.summary.totalAvg')}</Data></Cell>\n`;
  xml += footCell('moneyBold', hasMonths ? 'SUM(' + mRng(2) + ')' : '', fmtNum(sumOf(mCol.total)), false);          // total spending
  xml += footCell('total', hasMonths ? 'SUM(' + mRng(3) + ')' : '', sumOf(mCol.count), false);                      // total records
  xml += footCell('moneyBold', hasMonths ? 'AVERAGE(' + mRng(4) + ')' : '', fmtNum(avgOf(mCol.daily)), false);     // average daily average
  xml += footCell('moneyBold', hasMonths ? 'AVERAGE(' + mRng(5) + ')' : '', fmtNum(avgOf(mCol.budget)), false);    // average budget
  xml += footCell('moneyBold', hasMonths ? 'AVERAGE(' + mRng(6) + ')' : '', fmtNum(avgOf(mCol.spendable)), false); // average spendable
  xml += footCell('moneyBold', hasMonths ? 'SUM(' + mRng(7) + ')' : '', fmtNum(sumOf(mCol.savings)), false);       // total savings
  // Average usage rate: months without a budget hold the text 无预算, and AVERAGE of a column
  // of text is #DIV/0! — the very first export of someone who has not set a budget yet.
  xml += mCol.usage.length
    ? footCell('pctBold', 'IF(COUNT(' + mRng(8) + ')&gt;0,AVERAGE(' + mRng(8) + '),&quot;&quot;)', fmtRatio(avgOf(mCol.usage)), false)
    : footCell('pctBold', hasMonths ? 'IF(COUNT(' + mRng(8) + ')&gt;0,AVERAGE(' + mRng(8) + '),&quot;&quot;)' : '', '', true);
  xml += footCell('moneyBold', hasMonths ? 'SUM(' + mRng(9) + ')' : '', fmtNum(sumOf(mCol.income)), false);        // total recorded income
  xml += footCell('moneyBold', hasMonths ? 'SUM(' + mRng(10) + ')' : '', fmtNum(sumOf(mCol.net)), false);          // net across the window
  xml += '   </Row>\n';

  xml += '  </Table>\n';
  xml += ' </Worksheet>\n';

  // ===== SHEET 4: 预算跟踪 (Budget Tracking) =====
  // Detailed per-month: 预算, 储蓄目标, 可支配, 实际支出, 剩余, 超支警告
  xml += ' <Worksheet ss:Name="' + __('excel.sheet.budgetTracking') + '">\n';
  xml += '  <Table>\n';
  xml += '   <Column ss:Width="90"/>\n';
  xml += '   <Column ss:Width="100"/>\n';
  xml += '   <Column ss:Width="100"/>\n';
  xml += '   <Column ss:Width="100"/>\n';
  xml += '   <Column ss:Width="100"/>\n';
  xml += '   <Column ss:Width="100"/>\n';
  xml += '   <Column ss:Width="120"/>\n';
  xml += '   <Column ss:Width="200"/>\n';
  xml += '   <Row>\n';
  [__('excel.header.month'),__('excel.header.budget'),__('excel.header.savingsTarget'),__('excel.header.spendable'),__('excel.header.actualExpenditure'),__('excel.header.remaining'),__('excel.header.usageRate'),__('excel.header.status')].forEach(h => {
    xml += `    <Cell ss:StyleID="header"><Data ss:Type="String">${esc(h)}</Data></Cell>\n`;
  });
  xml += '   </Row>\n';

  const btCol = { budget: [], target: [], spendable: [], actual: [], remaining: [] };
  const btUsage = [];
  monthsDesc.forEach((m, idx) => {
    const rowNum = monthStartRow + idx;
    const md = monthData[m];
    const budget = DataStore.getBudget(m);
    let targetAmount = 0;
    const targetObj = DataStore.getSavingsTarget();
    const targetType = targetObj.type || 'fixed';
    if (targetType === 'fixed') targetAmount += (targetObj.fixedAmount || 0);
    if (targetType === 'percent') targetAmount += budget * ((targetObj.percent || 0) / 100);
    // Figures worked out from the cells as written, the way the formulas will
    const bC = cellNum(budget), tgC = cellNum(targetAmount), eC = cellNum(md.total);
    const spendable = bC > 0 ? Math.max(0, r2(bC - tgC)) : 0;
    const remaining = r2(spendable - eC);
    const status = remaining >= 0 ? __('excel.status.normal') : __('excel.status.overspent');

    xml += '   <Row>\n';
    xml += `    <Cell><Data ss:Type="String">${esc(m)}</Data></Cell>\n`;
    xml += `    <Cell ss:StyleID="money"><Data ss:Type="Number">${fmtNum(budget)}</Data></Cell>\n`;
    xml += `    <Cell ss:StyleID="money"><Data ss:Type="Number">${fmtNum(targetAmount)}</Data></Cell>\n`;
    // 可支配 = 预算 - 储蓄目标 (formula: B-C), never below 0 — a savings target bigger than
    // the budget used to make the formula negative while the saved value said 0
    xml += `    <Cell ss:StyleID="money" ss:Formula="=IF(RC[-2]>0, MAX(0, RC[-2]-RC[-1]), 0)"><Data ss:Type="Number">${fmtNum(spendable)}</Data></Cell>\n`;
    xml += `    <Cell ss:StyleID="money"><Data ss:Type="Number">${fmtNum(md.total)}</Data></Cell>\n`;
    // 剩余 = 可支配 - 实际支出 (formula: D-E)
    xml += `    <Cell ss:StyleID="money" ss:Formula="=RC[-2]-RC[-1]"><Data ss:Type="Number">${fmtNum(remaining)}</Data></Cell>\n`;
    // 使用率 = 实际 / 可支配 (formula: E/D)
    if (spendable > 0) {
      xml += `    <Cell ss:StyleID="pct" ss:Formula="=IF(RC[-3]>0, RC[-2]/RC[-3], 0)"><Data ss:Type="Number">${fmtRatio(eC / spendable)}</Data></Cell>\n`;
      btUsage.push(eC / spendable);
    } else {
      xml += `    <Cell><Data ss:Type="String">N/A</Data></Cell>\n`;
    }
    // 状态 = IF(剩余>=0, "正常", "超支"). 剩余 is column F, i.e. two to the left (RC[-2]);
    // RC[-1] is 使用率, which is never negative, so every month — overspent or not —
    // came out as 正常.
    const statusOk = __('excel.status.normal');
    const statusFail = __('excel.status.overspent');
    xml += `    <Cell ss:StyleID="${remaining >= 0 ? 'success' : 'danger'}" ss:Formula="=IF(RC[-2]>=0, &quot;${esc(statusOk)}&quot;, &quot;${esc(statusFail)}&quot;)"><Data ss:Type="String">${esc(status)}</Data></Cell>\n`;
    xml += '   </Row>\n';
    btCol.budget.push(bC); btCol.target.push(tgC); btCol.spendable.push(spendable); btCol.actual.push(eC); btCol.remaining.push(remaining);
  });

  // Totals
  const btEndRow = monthStartRow + monthsDesc.length - 1;
  const btRng = c => 'R' + monthStartRow + 'C' + c + ':R' + btEndRow + 'C' + c;
  xml += '   <Row>\n';
  xml += `    <Cell ss:StyleID="total"><Data ss:Type="String">${__('excel.summary.total')}</Data></Cell>\n`;
  xml += footCell('moneyBold', hasMonths ? 'SUM(' + btRng(2) + ')' : '', fmtNum(sumOf(btCol.budget)), false);
  xml += footCell('moneyBold', hasMonths ? 'SUM(' + btRng(3) + ')' : '', fmtNum(sumOf(btCol.target)), false);
  xml += footCell('moneyBold', hasMonths ? 'SUM(' + btRng(4) + ')' : '', fmtNum(sumOf(btCol.spendable)), false);
  xml += footCell('moneyBold', hasMonths ? 'SUM(' + btRng(5) + ')' : '', fmtNum(sumOf(btCol.actual)), false);
  xml += footCell('moneyBold', hasMonths ? 'SUM(' + btRng(6) + ')' : '', fmtNum(sumOf(btCol.remaining)), false);
  // Average usage: months with nothing to spend show N/A, and a column of only text is #DIV/0!
  xml += btUsage.length
    ? footCell('pctBold', 'IF(COUNT(' + btRng(7) + ')&gt;0,AVERAGE(' + btRng(7) + '),&quot;&quot;)', fmtRatio(avgOf(btUsage)), false)
    : footCell('pctBold', hasMonths ? 'IF(COUNT(' + btRng(7) + ')&gt;0,AVERAGE(' + btRng(7) + '),&quot;&quot;)' : '', '', true);
  xml += `    <Cell ss:StyleID="total"><Data ss:Type="String"></Data></Cell>\n`;
  xml += '   </Row>\n';

  xml += '  </Table>\n';
  xml += ' </Worksheet>\n';

  // ===== SHEET 5: 储蓄统计 (Savings Stats) =====
  // Monthly savings breakdown
  xml += ' <Worksheet ss:Name="' + __('excel.sheet.savingsStats') + '">\n';
  xml += '  <Table>\n';
  xml += '   <Column ss:Width="90"/>\n';
  xml += '   <Column ss:Width="100"/>\n';
  xml += '   <Column ss:Width="100"/>\n';
  xml += '   <Column ss:Width="100"/>\n';
  xml += '   <Column ss:Width="100"/>\n';
  xml += '   <Column ss:Width="120"/>\n';
  xml += '   <Row>\n';
  [__('excel.header.month'),__('excel.header.budget'),__('excel.header.savingsTarget'),__('excel.header.actualExpenditure'),__('excel.header.actualSavings'),__('excel.header.targetAchievementRate')].forEach(h => {
    xml += `    <Cell ss:StyleID="headerGreen"><Data ss:Type="String">${esc(h)}</Data></Cell>\n`;
  });
  xml += '   </Row>\n';

  const svCol = { budget: [], target: [], actual: [], savings: [] };
  const svRate = [];
  monthsDesc.forEach((m, idx) => {
    const rowNum = monthStartRow + idx;
    const md = monthData[m];
    const budget = DataStore.getBudget(m);
    let targetAmount = 0;
    const targetObj = DataStore.getSavingsTarget();
    const targetType = targetObj.type || 'fixed';
    if (targetType === 'fixed') targetAmount += (targetObj.fixedAmount || 0);
    if (targetType === 'percent') targetAmount += budget * ((targetObj.percent || 0) / 100);
    // Figures worked out from the cells as written, the way the formulas will
    const bC = cellNum(budget), tgC = cellNum(targetAmount), eC = cellNum(md.total);
    const spendable = Math.max(0, r2(bC - tgC));
    const actualSavings = r2(spendable - eC);

    xml += '   <Row>\n';
    xml += `    <Cell><Data ss:Type="String">${esc(m)}</Data></Cell>\n`;
    xml += `    <Cell ss:StyleID="money"><Data ss:Type="Number">${fmtNum(budget)}</Data></Cell>\n`;
    xml += `    <Cell ss:StyleID="money"><Data ss:Type="Number">${fmtNum(targetAmount)}</Data></Cell>\n`;
    xml += `    <Cell ss:StyleID="money"><Data ss:Type="Number">${fmtNum(md.total)}</Data></Cell>\n`;
    // 实际储蓄 = 可支配 - 支出 = max(0, 预算 - 目标) - 支出  → formula: MAX(0, B - C) - D
    // (the max keeps a target bigger than the budget from going negative here while the
    // saved value says otherwise)
    xml += `    <Cell ss:StyleID="money" ss:Formula="=MAX(0, RC[-3]-RC[-2])-RC[-1]"><Data ss:Type="Number">${fmtNum(actualSavings)}</Data></Cell>\n`;
    // 目标达成率 = 实际储蓄 / 储蓄目标, capped at 100%. 储蓄目标 is column C, three to the
    // left (RC[-3]); RC[-4] is the budget, which made 200 saved of a 200 target read as
    // 20% when the budget was 1000.
    if (tgC > 0) {
      const rate = actualSavings > 0 ? Math.min(1, actualSavings / tgC) : 0;
      xml += `    <Cell ss:StyleID="pct" ss:Formula="=IF(RC[-1]>0, MIN(1, MAX(0, RC[-1]/RC[-3])), 0)"><Data ss:Type="Number">${fmtRatio(rate)}</Data></Cell>\n`;
      svRate.push(rate);
    } else {
      xml += `    <Cell><Data ss:Type="String">—</Data></Cell>\n`;
    }
    xml += '   </Row>\n';
    svCol.budget.push(bC); svCol.target.push(tgC); svCol.actual.push(eC); svCol.savings.push(actualSavings);
  });

  // Totals
  const svEndRow = monthStartRow + monthsDesc.length - 1;
  const svRng = c => 'R' + monthStartRow + 'C' + c + ':R' + svEndRow + 'C' + c;
  xml += '   <Row>\n';
  xml += `    <Cell ss:StyleID="total"><Data ss:Type="String">${__('excel.summary.total')}</Data></Cell>\n`;
  xml += footCell('moneyBold', hasMonths ? 'SUM(' + svRng(2) + ')' : '', fmtNum(sumOf(svCol.budget)), false);
  xml += footCell('moneyBold', hasMonths ? 'SUM(' + svRng(3) + ')' : '', fmtNum(sumOf(svCol.target)), false);
  xml += footCell('moneyBold', hasMonths ? 'SUM(' + svRng(4) + ')' : '', fmtNum(sumOf(svCol.actual)), false);
  xml += footCell('moneyBold', hasMonths ? 'SUM(' + svRng(5) + ')' : '', fmtNum(sumOf(svCol.savings)), false);
  xml += svRate.length
    ? footCell('pctBold', 'IF(COUNT(' + svRng(6) + ')&gt;0,AVERAGE(' + svRng(6) + '),&quot;&quot;)', fmtRatio(avgOf(svRate)), false)
    : footCell('pctBold', hasMonths ? 'IF(COUNT(' + svRng(6) + ')&gt;0,AVERAGE(' + svRng(6) + '),&quot;&quot;)' : '', '', true);
  xml += '   </Row>\n';

  xml += '  </Table>\n';
  xml += ' </Worksheet>\n';

  // ===== SHEET 6: 分摊账单 (Split Bills) =====
  // Summary row per bill + one indented row per participant
  // Bill row: A=日期, B=备注, C=分类, D=总额, E=自份额, F=他人待收, G=他人已还, H=状态
  // Participant row: A=↳ 参与人, B=备注(❓), D=份额, H=已还/待收
  xml += ' <Worksheet ss:Name="' + __('excel.sheet.splitBills') + '">\n';
  xml += '  <Table>\n';
  xml += '   <Column ss:Width="90"/>\n';   // A
  xml += '   <Column ss:Width="160"/>\n';  // B
  xml += '   <Column ss:Width="100"/>\n';  // C
  xml += '   <Column ss:Width="90"/>\n';   // D
  xml += '   <Column ss:Width="90"/>\n';   // E
  xml += '   <Column ss:Width="90"/>\n';   // F
  xml += '   <Column ss:Width="90"/>\n';   // G
  xml += '   <Column ss:Width="90"/>\n';   // H
  xml += '   <Row>\n';
  [__('excel.header.date'),__('excel.header.note'),__('excel.header.category'),__('excel.split.label.total'),__('excel.split.label.myShare'),__('excel.split.label.unpaid'),__('excel.split.label.paid'),__('excel.header.status')].forEach(h => {
    xml += `    <Cell ss:StyleID="header"><Data ss:Type="String">${esc(h)}</Data></Cell>\n`;
  });
  xml += '   </Row>\n';

  // Each source file is wrapped in its own try/catch by build.sh, so a throw in
  // 26-split-bills.js leaves SplitEngine undefined and would take the whole
  // Excel export down with it. PlanMath is guarded the same way below.
  const SE = (typeof SplitEngine !== 'undefined') ? SplitEngine : null;
  const sePaid = p => SE ? SE.partPaid(p) : (p && p.paid ? (parseFloat(p.share) || 0) : 0);
  const seShare = p => SE ? SE.partShare(p) : Math.max(0, parseFloat(p && p.share) || 0);
  const seOwed = p => SE ? SE.partOwed(p) : Math.max(0, seShare(p) - sePaid(p));
  const seSettled = p => SE ? SE.partSettled(p) : seOwed(p) <= 0.005;

  const sbStartRow = 2;
  splitBills.forEach((b, bi) => {
    const billRowNum = sbStartRow + bi;
    const selfShare = Math.max(0, parseFloat(b.selfShare) || 0);
    const parts = Array.isArray(b.participants) ? b.participants : [];
    let unpaid = 0, paidTotal = 0, unknownCount = 0;
    parts.forEach(p => {
      // Partial repayments split across both columns
      paidTotal += sePaid(p);
      unpaid += seOwed(p);
      if (p.unknown) unknownCount++;
    });
    const scat = catMap[b.categoryId] || { name: __('excel.label.unknown'), icon: '❓' };
    const total = Math.max(0, parseFloat(b.amount) || 0);
    const status = b.archived ? __('excel.split.status.archived') : __('excel.split.status.active');

    xml += '   <Row>\n';
    xml += `    <Cell><Data ss:Type="String">${esc(String(b.date || '').slice(0, 10))}</Data></Cell>\n`;
    xml += `    <Cell><Data ss:Type="String">${esc(b.note || '')}</Data></Cell>\n`;
    xml += `    <Cell><Data ss:Type="String">${esc(scat.icon + ' ' + scat.name)}</Data></Cell>\n`;
    xml += `    <Cell ss:StyleID="money"><Data ss:Type="Number">${fmtNum(total)}</Data></Cell>\n`;
    xml += `    <Cell ss:StyleID="money"><Data ss:Type="Number">${fmtNum(selfShare)}</Data></Cell>\n`;
    xml += `    <Cell ss:StyleID="money"><Data ss:Type="Number">${fmtNum(unpaid)}</Data></Cell>\n`;
    xml += `    <Cell ss:StyleID="money"><Data ss:Type="Number">${fmtNum(paidTotal)}</Data></Cell>\n`;
    xml += `    <Cell><Data ss:Type="String">${esc(status)}</Data></Cell>\n`;
    xml += '   </Row>\n';

    // My own share can be flagged unknown too — surface it the way participants are
    if (b.selfUnknown) {
      xml += '   <Row>\n';
      xml += `    <Cell><Data ss:Type="String">${esc('  \u21b3 ' + __('excel.split.label.self'))}</Data></Cell>\n`;
      xml += `    <Cell><Data ss:Type="String">${esc(__('excel.split.label.unknownMark'))}</Data></Cell>\n`;
      // ss:Index is what puts these in D and H. Without it SpreadsheetML fills
      // sequentially, so the share landed under the 分类 header and the status
      // string went into the 总额 money column.
      xml += `    <Cell ss:Index="4" ss:StyleID="money"><Data ss:Type="Number">${fmtNum(selfShare)}</Data></Cell>\n`;
      xml += `    <Cell ss:Index="8"><Data ss:Type="String">${esc(__('excel.split.status.paid'))}</Data></Cell>\n`;
      xml += '   </Row>\n';
    }

    if (parts.length > 0) {
      parts.forEach((p, pi) => {
        const pAmt = seShare(p);
        const pPaid = sePaid(p);
        const pStatus = seSettled(p)
          ? __('excel.split.status.paid')
          : (pPaid > 0.005
            ? __('excel.split.status.partial', fmtNum(pPaid), fmtNum(seOwed(p)))
            : (p.unknown ? __('excel.split.status.unknown') : __('excel.split.status.unpaid')));
        xml += '   <Row>\n';
        xml += `    <Cell><Data ss:Type="String">${esc('  ↳ ' + (p.name || __('excel.label.unknown')))}</Data></Cell>\n`;
        xml += `    <Cell><Data ss:Type="String">${p.unknown ? esc(__('excel.split.label.unknownMark')) : ''}</Data></Cell>\n`;
        xml += `    <Cell ss:Index="4" ss:StyleID="money"><Data ss:Type="Number">${fmtNum(pAmt)}</Data></Cell>\n`;
        xml += `    <Cell ss:Index="7" ss:StyleID="money"><Data ss:Type="Number">${fmtNum(pPaid)}</Data></Cell>\n`;
        xml += `    <Cell ss:Index="8"><Data ss:Type="String">${esc(pStatus)}</Data></Cell>\n`;
        xml += '   </Row>\n';
      });
    }
  });

  xml += '  </Table>\n';
  xml += ' </Worksheet>\n';

  // ===== SHEET 7: 大额计划 (Purchase Plans) =====
  // Plan row: A=目标物, B=模式, C=总额, D=已还/已存, E=剩余, F=起始月, G=期数, H=状态
  // Period row: A=↳ YYYY-MM, C=应付, D=实付, E=缺口
  const plans = (DataStore.getPurchasePlans && DataStore.getPurchasePlans()) || [];
  const planNowMonth = getMonthKey(new Date().toISOString());
  const planState = (typeof PlanMath !== 'undefined') ? PlanMath.computeUpTo(planNowMonth) : {};

  xml += ' <Worksheet ss:Name="' + __('excel.sheet.plans') + '">\n';
  xml += '  <Table>\n';
  xml += '   <Column ss:Width="140"/>\n';  // A
  xml += '   <Column ss:Width="100"/>\n';  // B
  xml += '   <Column ss:Width="90"/>\n';   // C
  xml += '   <Column ss:Width="90"/>\n';   // D
  xml += '   <Column ss:Width="90"/>\n';   // E
  xml += '   <Column ss:Width="80"/>\n';   // F
  xml += '   <Column ss:Width="70"/>\n';   // G
  xml += '   <Column ss:Width="90"/>\n';   // H
  xml += '   <Row>\n';
  [__('excel.plan.label.item'),__('excel.plan.label.mode'),__('excel.plan.label.total'),__('excel.plan.label.paid'),__('excel.plan.label.remaining'),__('excel.plan.label.start'),__('excel.plan.label.periods'),__('excel.header.status')].forEach(h => {
    xml += `    <Cell ss:StyleID="header"><Data ss:Type="String">${esc(h)}</Data></Cell>\n`;
  });
  xml += '   </Row>\n';

  plans.forEach(p => {
    const st = planState[p.id];
    const paid = st ? st.paid : 0;
    const remaining = st ? st.remaining : p.totalAmount;
    const status = st && st.isComplete
      ? __('excel.plan.status.done')
      : (st && st.isOverdue ? __('excel.plan.status.overdue') : __('excel.plan.status.' + (p.status || 'active')));

    xml += '   <Row>\n';
    xml += `    <Cell><Data ss:Type="String">${esc((p.icon || '') + ' ' + (p.name || ''))}</Data></Cell>\n`;
    xml += `    <Cell><Data ss:Type="String">${esc(__('plan.mode.' + p.mode))}</Data></Cell>\n`;
    xml += `    <Cell ss:StyleID="money"><Data ss:Type="Number">${fmtNum(p.totalAmount || 0)}</Data></Cell>\n`;
    xml += `    <Cell ss:StyleID="money"><Data ss:Type="Number">${fmtNum(paid)}</Data></Cell>\n`;
    xml += `    <Cell ss:StyleID="money"><Data ss:Type="Number">${fmtNum(remaining)}</Data></Cell>\n`;
    xml += `    <Cell><Data ss:Type="String">${esc(p.startMonth || '')}</Data></Cell>\n`;
    xml += `    <Cell><Data ss:Type="Number">${fmtNum(p.months || 0)}</Data></Cell>\n`;
    xml += `    <Cell><Data ss:Type="String">${esc(st && st.hasEstimates ? status + ' · ' + __('excel.plan.status.hasEstimates', st.estimatedMonths) : status)}</Data></Cell>\n`;
    xml += '   </Row>\n';

    if (st && st.byMonth) {
      Object.keys(st.byMonth).sort().forEach(m => {
        const per = st.byMonth[m];
        xml += '   <Row>\n';
        xml += `    <Cell><Data ss:Type="String">${esc('  ↳ ' + m)}</Data></Cell>\n`;
        // Months with no income on record are replayed optimistically; say so
        // rather than letting a guessed repayment read as a measured one.
        xml += `    <Cell><Data ss:Type="String">${esc(per.incomeKnown ? __('excel.plan.source.measured') : __('excel.plan.source.estimated'))}</Data></Cell>\n`;
        xml += `    <Cell ss:StyleID="money"><Data ss:Type="Number">${fmtNum(per.due)}</Data></Cell>\n`;
        xml += `    <Cell ss:StyleID="money"><Data ss:Type="Number">${fmtNum(per.actual)}</Data></Cell>\n`;
        xml += `    <Cell ss:StyleID="money"><Data ss:Type="Number">${fmtNum(per.short)}</Data></Cell>\n`;
        xml += '   </Row>\n';
      });
    }
  });

  xml += '  </Table>\n';
  xml += ' </Worksheet>\n';

  // ===== SHEET: 收入分类统计 (Income Breakdown) =====
  // Only emitted when the ledger actually holds income rows. A workbook that
  // opens with an empty "Income" tab reads as a bug, not as a zero.
  if (incomeRecs.length > 0) {
    const incomeCats = DataStore.getIncomeRootCategories();
    const incomeCatTotals = {};
    incomeRecs.forEach(r => {
      const rootId = getRootCatId(r.categoryId);
      incomeCatTotals[rootId] = (incomeCatTotals[rootId] || 0) + r.amount;
    });
    const sortedIncomeCats = incomeCats
      .map(c => ({ id: c.id, name: c.name, icon: c.icon, total: incomeCatTotals[c.id] || 0 }))
      .filter(c => c.total > 0)
      .sort((a, b) => b.total - a.total);
    const incomeGrandTotal = r2(sumOf(sortedIncomeCats.map(c => cellNum(c.total))));

    xml += ' <Worksheet ss:Name="' + __('excel.sheet.incomeBreakdown') + '">\n';
    xml += '  <Table>\n';
    xml += '   <Column ss:Width="150"/>\n';
    xml += '   <Column ss:Width="110"/>\n';
    xml += '   <Column ss:Width="80"/>\n';
    xml += '   <Column ss:Width="80"/>\n';
    xml += '   <Row>\n';
    [__('excel.header.category'),__('excel.header.recordedIncome'),__('excel.header.percentage'),__('excel.header.recordCount')].forEach(h => {
      xml += `    <Cell ss:StyleID="headerGreen"><Data ss:Type="String">${esc(h)}</Data></Cell>\n`;
    });
    xml += '   </Row>\n';

    const incStartRow = 2;
    sortedIncomeCats.forEach((c, idx) => {
      const recs = incomeRecs.filter(r => getRootCatId(r.categoryId) === c.id);
      xml += '   <Row>\n';
      xml += `    <Cell><Data ss:Type="String">${esc(c.icon + ' ' + c.name)}</Data></Cell>\n`;
      xml += `    <Cell ss:StyleID="money"><Data ss:Type="Number">${fmtNum(c.total)}</Data></Cell>\n`;
      if (incomeGrandTotal > 0) {
        xml += `    <Cell ss:StyleID="pct" ss:Formula="=IF(SUM(R2C2:R${incStartRow + sortedIncomeCats.length - 1}C2)&gt;0, RC[-1]/SUM(R2C2:R${incStartRow + sortedIncomeCats.length - 1}C2), 0)"><Data ss:Type="Number">${fmtRatio(cellNum(c.total) / incomeGrandTotal)}</Data></Cell>\n`;
      } else {
        xml += `    <Cell ss:StyleID="pct"><Data ss:Type="Number">0</Data></Cell>\n`;
      }
      xml += `    <Cell><Data ss:Type="Number">${recs.length}</Data></Cell>\n`;
      xml += '   </Row>\n';
    });

    // Total row. 100% is just 100%: the old formula divided by "the cell above", which is the
    // last category and not a total (two incomes of 3000 and 1000 gave 400%).
    const incEndRow = incStartRow + sortedIncomeCats.length - 1;
    const hasIncCats = sortedIncomeCats.length > 0;
    xml += '   <Row>\n';
    xml += `    <Cell ss:StyleID="total"><Data ss:Type="String">${__('excel.summary.grandTotal')}</Data></Cell>\n`;
    xml += footCell('moneyBold', hasIncCats ? `SUM(R${incStartRow}C2:R${incEndRow}C2)` : '', fmtNum(incomeGrandTotal), false);
    xml += `    <Cell ss:StyleID="pctBold"><Data ss:Type="Number">${incomeGrandTotal > 0 ? 1 : 0}</Data></Cell>\n`;
    xml += footCell('total', hasIncCats ? `SUM(R${incStartRow}C4:R${incEndRow}C4)` : '', sumOf(sortedIncomeCats.map(c => incomeRecs.filter(r => getRootCatId(r.categoryId) === c.id).length)), false);
    xml += '   </Row>\n';
    xml += '  </Table>\n';
    xml += ' </Worksheet>\n';
  }

  xml += '</Workbook>';
  return xml;
}

function exportToExcel() {
  // Excel sniffs the content, not the extension: SpreadsheetML bytes saved as
  // .xlsx is refused with "file format or extension is not valid". The sheets
  // are still built as SpreadsheetML (easy to emit), then packed into a real
  // OOXML zip here.
  const bytes = spreadsheetMLToXlsx(buildSpreadsheetXml());
  const blob = new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  const now = new Date();
  const ts = now.getFullYear().toString() +
    String(now.getMonth()+1).padStart(2,'0') +
    String(now.getDate()).padStart(2,'0');
  a.download = __('excel.filename.prefix') + '_' + ts + '.xlsx';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

  // === EXPORTS ===
  window.exportToExcel = exportToExcel;
  // Exposed so tests can inspect the sheet content without unzipping the download.
  window.buildExcelSpreadsheetXml = buildSpreadsheetXml;
  window.spreadsheetMLToXlsx = spreadsheetMLToXlsx;

  // === I18N ENTRIES ===
  addI18nEntries({
    'excel.sheet.records': { zh: '消费记录', en: 'Records' },
    'excel.sheet.categoryBreakdown': { zh: '分类统计', en: 'Category Breakdown' },
    'excel.sheet.monthlySummary': { zh: '月度统计', en: 'Monthly Summary' },
    'excel.sheet.budgetTracking': { zh: '预算跟踪', en: 'Budget Tracking' },
    'excel.sheet.savingsStats': { zh: '储蓄统计', en: 'Savings Stats' },
    'excel.sheet.splitBills': { zh: '分摊账单', en: 'Split Bills' },
    'excel.sheet.plans': { zh: '大额计划', en: 'Purchase Plans' },
    'excel.sheet.incomeBreakdown': { zh: '收入分类统计', en: 'Income Breakdown' },
    'excel.header.type': { zh: '类型', en: 'Type' },
    'excel.header.recordedIncome': { zh: '收入记录 (RM)', en: 'Recorded Income (RM)' },
    'excel.header.net': { zh: '结余 (RM)', en: 'Net (RM)' },
    'excel.label.income': { zh: '收入', en: 'Income' },
    'excel.label.expense': { zh: '支出', en: 'Expense' },
    'excel.plan.label.item': { zh: '目标物', en: 'Item' },
    'excel.plan.label.mode': { zh: '模式', en: 'Mode' },
    'excel.plan.label.total': { zh: '总额', en: 'Total' },
    'excel.plan.label.paid': { zh: '已存/已还', en: 'Saved / Repaid' },
    'excel.plan.label.remaining': { zh: '剩余', en: 'Remaining' },
    'excel.plan.label.start': { zh: '起始月', en: 'Start' },
    'excel.plan.label.periods': { zh: '期数', en: 'Periods' },
    'excel.plan.status.active': { zh: '进行中', en: 'Active' },
    'excel.plan.status.completed': { zh: '已完成', en: 'Completed' },
    'excel.plan.status.cancelled': { zh: '已放弃', en: 'Cancelled' },
    'excel.plan.source.measured': { zh: '实测', en: 'Measured' },
    'excel.plan.source.estimated': { zh: '推定', en: 'Estimated' },
    'excel.plan.status.hasEstimates': { zh: '{0} 个月无收入记录，按计划推定', en: '{0} month(s) without income on record, assumed on schedule' },
    'excel.plan.status.done': { zh: '已完成', en: 'Completed' },
    'excel.plan.status.overdue': { zh: '逾期', en: 'Overdue' },
    'excel.header.seq': { zh: '序号', en: '#' },
    'excel.header.date': { zh: '日期', en: 'Date' },
    'excel.header.amount': { zh: '金额 (RM)', en: 'Amount (RM)' },
    'excel.header.category': { zh: '分类', en: 'Category' },
    'excel.header.subcategory': { zh: '子分类', en: 'Subcategory' },
    'excel.header.note': { zh: '备注', en: 'Note' },
    'excel.header.month': { zh: '月份', en: 'Month' },
    'excel.header.excludeFromAvg': { zh: '不计日均', en: 'Excl. Avg' },
    'excel.header.totalExpenditure': { zh: '总支出 (RM)', en: 'Total (RM)' },
    'excel.header.percentage': { zh: '占比', en: '%' },
    'excel.header.recordCount': { zh: '记录数', en: 'Records' },
    'excel.header.dailyAvgExpenditure': { zh: '日均支出 (RM)', en: 'Daily Avg (RM)' },
    'excel.header.budget': { zh: '预算 (RM)', en: 'Budget (RM)' },
    'excel.header.spendable': { zh: '可支配 (RM)', en: 'Spendable (RM)' },
    'excel.header.savings': { zh: '储蓄 (RM)', en: 'Savings (RM)' },
    'excel.header.budgetUsageRate': { zh: '预算使用率', en: 'Usage Rate' },
    'excel.header.savingsTarget': { zh: '储蓄目标 (RM)', en: 'Savings Target (RM)' },
    'excel.header.actualExpenditure': { zh: '实际支出 (RM)', en: 'Actual (RM)' },
    'excel.header.remaining': { zh: '剩余 (RM)', en: 'Remaining (RM)' },
    'excel.header.usageRate': { zh: '使用率', en: 'Usage Rate' },
    'excel.header.status': { zh: '状态', en: 'Status' },
    'excel.header.actualSavings': { zh: '实际储蓄 (RM)', en: 'Actual Savings (RM)' },
    'excel.header.targetAchievementRate': { zh: '目标达成率', en: 'Target Rate' },
    'excel.header.tags': { zh: '标签', en: 'Tags' },
    'excel.header.split': { zh: '分摊', en: 'Split' },
    'excel.label.splitBill': { zh: '分摊账单', en: 'Split bill' },
    'excel.label.myShare': { zh: '自份额', en: 'my share' },
    'excel.split.label.total': { zh: '总额 (RM)', en: 'Total (RM)' },
    'excel.split.label.myShare': { zh: '自份额 (RM)', en: 'My Share (RM)' },
    'excel.split.label.unpaid': { zh: '他人待收 (RM)', en: 'Unpaid (RM)' },
    'excel.split.label.paid': { zh: '他人已还 (RM)', en: 'Paid (RM)' },
    'excel.split.label.unknownMark': { zh: '❓ 金额不明', en: '❓ Unknown amount' },
    'excel.split.label.self': { zh: '我自己', en: 'Me' },
    'excel.split.status.archived': { zh: '已归档', en: 'Archived' },
    'excel.split.status.active': { zh: '进行中', en: 'Active' },
    'excel.split.status.paid': { zh: '✅ 已还', en: '✅ Paid' },
    'excel.split.status.partial': { zh: '🟡 部分已还（已还 {0}，还差 {1}）', en: '🟡 Partial (paid {0}, {1} left)' },
    'excel.split.status.unpaid': { zh: '⏳ 待收', en: '⏳ Unpaid' },
    'excel.split.status.unknown': { zh: '❓ 金额不明（待收）', en: '❓ Unknown (unpaid)' },
    'excel.summary.total': { zh: '合计', en: 'Total' },
    'excel.summary.expenseOnly': { zh: '（只算支出）', en: ' (expenses only)' },
    'excel.summary.totalAvg': { zh: '合计/平均', en: 'Total / Avg' },
    'excel.summary.grandTotal': { zh: '总计', en: 'Grand Total' },
    'excel.summary.records': { zh: '记录数', en: 'Records' },
    'excel.summary.average': { zh: '平均', en: 'Average' },
    'excel.summary.max': { zh: '最高', en: 'Max' },
    'excel.summary.min': { zh: '最低', en: 'Min' },
    'excel.summary.noBudget': { zh: '无预算', en: 'No Budget' },
    'excel.label.unknown': { zh: '未知', en: 'Unknown' },
    'excel.label.yes': { zh: '是', en: 'Yes' },
    'excel.status.normal': { zh: '✅ 正常', en: '✅ Normal' },
    'excel.status.overspent': { zh: '⚠️ 超支', en: '⚠️ Overspent' },
    'excel.filename.prefix': { zh: '记账数据', en: 'BudgetData' }
  });
})();
