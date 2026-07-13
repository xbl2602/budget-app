/* ============================================================
   EXCEL EXPORT — Generates a real .xlsx-compatible XML Spreadsheet
   with formulas (SUM, AVERAGE, MAX, MIN, IF, etc.) so the user
   can modify values and have them auto-recalculate.
   Format: XML Spreadsheet 2003 (SpreadsheetML) — no ZIP needed,
           opens natively in Excel / LibreOffice / Google Sheets.
   ============================================================ */
(function() {
'use strict';

function exportToExcel() {
  const records = DataStore.getRecords();
  const cats = DataStore.getCategories();
  const catMap = {};
  cats.forEach(c => catMap[c.id] = c);

  // Build a parent-chain map for subcategory detection
  const parentMap = {};
  cats.forEach(c => { if (c.parentId) parentMap[c.id] = c.parentId; });
  function getRootCatId(id) {
    let cur = id;
    while (parentMap[cur]) cur = parentMap[cur];
    return cur;
  }

  // Helper: escape XML text
  const esc = s => String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  // Helper: format a number nicely
  const fmtNum = n => Number(n).toFixed(2);

  // --- Gather all months with records ---
  const monthSet = new Set();
  records.forEach(r => {
    const m = getMonthKey(r.date || r.createdAt);
    if (m) monthSet.add(m);
  });
  const sortedMonths = [...monthSet].sort();
  const currentMonth = getMonthKey(new Date().toISOString());

  // --- Monthly aggregates ---
  const monthData = {};
  sortedMonths.forEach(m => {
    const ms = records.filter(r => getMonthKey(r.date || r.createdAt) === m);
    const total = ms.reduce((s, r) => s + r.amount, 0);
    const daysInMonth = new Date(parseInt(m.split('-')[0]), parseInt(m.split('-')[1]), 0).getDate();
    const dailyAvg = total / daysInMonth;
    monthData[m] = { records: ms, total, dailyAvg, count: ms.length };
  });

  // --- Category aggregates (root-level) ---
  const rootCats = DataStore.getRootCategories();
  // For each root cat, sum amounts across all time
  const catTotals = {};
  records.forEach(r => {
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
  // Columns: A=序号, B=日期, C=金额, D=分类, E=子分类, F=备注, G=月份, H=不计日均
  const nCols = 8;
  // Prepare records sorted newest first
  const sortedRecords = [...records].sort((a, b) => (b.date || b.createdAt) > (a.date || a.createdAt) ? 1 : -1);
  const dataStartRow = 2; // row 1 = header, data starts row 2
  const dataEndRow = dataStartRow + sortedRecords.length - 1;

  xml += ' <Worksheet ss:Name="' + __('excel.sheet.records') + '">\n';
  xml += '  <Table>\n';
  xml += '   <Column ss:Width="50"/>\n';   // A: 序号
  xml += '   <Column ss:Width="110"/>\n';  // B: 日期
  xml += '   <Column ss:Width="100"/>\n';  // C: 金额
  xml += '   <Column ss:Width="100"/>\n';  // D: 分类
  xml += '   <Column ss:Width="120"/>\n';  // E: 子分类
  xml += '   <Column ss:Width="200"/>\n';  // F: 备注
  xml += '   <Column ss:Width="80"/>\n';   // G: 月份
  xml += '   <Column ss:Width="60"/>\n';   // H: 不计日均
  // Header row
  xml += '   <Row>\n';
  [__('excel.header.seq'),__('excel.header.date'),__('excel.header.amount'),__('excel.header.category'),__('excel.header.subcategory'),__('excel.header.note'),__('excel.header.month'),__('excel.header.excludeFromAvg')].forEach(h => {
    xml += `    <Cell ss:StyleID="header"><Data ss:Type="String">${esc(h)}</Data></Cell>\n`;
  });
  xml += '   </Row>\n';

  // Data rows
  sortedRecords.forEach((r, idx) => {
    const rowNum = dataStartRow + idx;
    const cat = catMap[r.categoryId] || { name: __('excel.label.unknown'), icon: '❓' };
    const parentCat = cat.parentId ? (catMap[cat.parentId] || null) : null;
    const rootCat = cat.parentId ? (catMap[getRootCatId(r.categoryId)] || null) : cat;
    const dateVal = r.date || r.createdAt.slice(0,10);
    const monthKey = getMonthKey(dateVal);
    xml += '   <Row>\n';
    xml += `    <Cell><Data ss:Type="Number">${idx+1}</Data></Cell>\n`;
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
    xml += '   </Row>\n';
  });

  // --- Summary footer with formulas (row after data) ---
  const summaryRow = dataEndRow + 1;
  const lastDataRow = dataEndRow; // R1C3 = C1, so data is R2C3 to R{end}C3
  // R1C1 notation: R{row}C{col}
  const cAmountCol = 3; // column C = 3
  const rFirst = dataStartRow;
  const rLast = dataEndRow;

  xml += `   <Row>\n`;
  xml += `    <Cell ss:StyleID="total"><Data ss:Type="String">${__('excel.summary.total')}</Data></Cell>\n`;
  xml += `    <Cell ss:StyleID="total"><Data ss:Type="String">${__('excel.summary.records')}: ${sortedRecords.length}</Data></Cell>\n`;
  // =SUM formula
  xml += `    <Cell ss:StyleID="moneyBold" ss:Formula="=SUM(R${rFirst}C${cAmountCol}:R${rLast}C${cAmountCol})"><Data ss:Type="Number">0</Data></Cell>\n`;
  xml += `    <Cell ss:StyleID="total"><Data ss:Type="String">${__('excel.summary.average')}</Data></Cell>\n`;
  // =AVERAGE formula  
  xml += `    <Cell ss:StyleID="money" ss:Formula="=AVERAGE(R${rFirst}C${cAmountCol}:R${rLast}C${cAmountCol})"><Data ss:Type="Number">0</Data></Cell>\n`;
  xml += `    <Cell ss:StyleID="total"><Data ss:Type="String">${__('excel.summary.max')}: </Data></Cell>\n`;
  // =MAX formula
  xml += `    <Cell ss:StyleID="money" ss:Formula="=MAX(R${rFirst}C${cAmountCol}:R${rLast}C${cAmountCol})"><Data ss:Type="Number">0</Data></Cell>\n`;
  xml += `    <Cell ss:StyleID="total"><Data ss:Type="String">${__('excel.summary.min')}: </Data></Cell>\n`;
  // =MIN formula
  xml += `    <Cell ss:StyleID="money" ss:Formula="=MIN(R${rFirst}C${cAmountCol}:R${rLast}C${cAmountCol})"><Data ss:Type="Number">0</Data></Cell>\n`;
  xml += `   </Row>\n`;

  xml += '  </Table>\n';
  // Auto-filter on header row
  xml += '  <x:AutoFilter x:Range="R1C1:R1C' + nCols + '" xmlns="urn:schemas-microsoft-com:office:excel"/>\n';
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
  xml += ' <Worksheet ss:Name="' + __('excel.sheet.categoryBreakdown') + '">\n';
  xml += '  <Table>\n';
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
  sortedCats.forEach((c, idx) => {
    const rowNum = catStartRow + idx;
    const catRecs = records.filter(r => getRootCatId(r.categoryId) === c.id);
    const catCount = catRecs.length;
    // Also include sub-breakdown: children
    const children = DataStore.getChildren(c.id);
    // For the total row of this root cat
    xml += '   <Row>\n';
    xml += `    <Cell><Data ss:Type="String">${esc(c.icon + ' ' + c.name)}</Data></Cell>\n`;
    xml += `    <Cell ss:StyleID="money"><Data ss:Type="Number">${fmtNum(c.total)}</Data></Cell>\n`;
    // Percentage formula: this amount / total of all categories
    // =IF(SUM(R2C2:R{last}C2)>0, R{row}C2/SUM(R2C2:R{last}C2), 0)
    const allCatSum = sortedCats.reduce((s, cc) => s + cc.total, 0);
    if (allCatSum > 0) {
      xml += `    <Cell ss:StyleID="pct" ss:Formula="=IF(SUM(R2C2:R${catStartRow + rootCats.length - 1}C2)>0, RC[-1]/SUM(R2C2:R${catStartRow + rootCats.length - 1}C2), 0)"><Data ss:Type="Number">${fmtNum(c.total / allCatSum)}</Data></Cell>\n`;
    } else {
      xml += `    <Cell ss:StyleID="pct"><Data ss:Type="Number">0</Data></Cell>\n`;
    }
    xml += `    <Cell><Data ss:Type="Number">${catCount}</Data></Cell>\n`;
    xml += '   </Row>\n';

    // Subcategories under this root
    if (children.length > 0) {
      children.forEach(child => {
        const childRecs = records.filter(r => r.categoryId === child.id);
        const childTotal = childRecs.reduce((s, r) => s + r.amount, 0);
        const childCount = childRecs.length;
        xml += '   <Row>\n';
        xml += `    <Cell><Data ss:Type="String">  ↳ ${esc(child.icon + ' ' + child.name)}</Data></Cell>\n`;
        xml += `    <Cell ss:StyleID="money"><Data ss:Type="Number">${fmtNum(childTotal)}</Data></Cell>\n`;
        // Subcategory % = this subcategory / this root's total
        if (c.total > 0) {
          xml += `    <Cell ss:StyleID="pct" ss:Formula="=IF(R[-1]C[-1]>0, RC[-1]/R[-1]C[-1], 0)"><Data ss:Type="Number">${fmtNum(childTotal / c.total)}</Data></Cell>\n`;
        } else {
          xml += `    <Cell ss:StyleID="pct"><Data ss:Type="Number">0</Data></Cell>\n`;
        }
        xml += `    <Cell><Data ss:Type="Number">${childCount}</Data></Cell>\n`;
        xml += '   </Row>\n';
      });
    }
  });

  // Total row with formulas
  const catEndRow = catStartRow + rootCats.length - 1; // only root cats in total
  const catTotalRow = catStartRow + sortedCats.length + rootCats.reduce((s, c) => s + DataStore.getChildren(c.id).length, 0);
  xml += '   <Row>\n';
  xml += `    <Cell ss:StyleID="total"><Data ss:Type="String">${__('excel.summary.grandTotal')}</Data></Cell>\n`;
  xml += `    <Cell ss:StyleID="moneyBold" ss:Formula="=SUM(R2C2:R${catEndRow}C2)"><Data ss:Type="Number">0</Data></Cell>\n`;
  xml += `    <Cell ss:StyleID="pctBold" ss:Formula="=IF(R[-1]C[-1]>0, RC[-1]/R[-1]C[-1], 0)"><Data ss:Type="Number">1</Data></Cell>\n`;
  xml += `    <Cell ss:StyleID="total" ss:Formula="=SUM(R2C4:R${catEndRow}C4)"><Data ss:Type="Number">0</Data></Cell>\n`;
  xml += '   </Row>\n';

  xml += '  </Table>\n';
  xml += ' </Worksheet>\n';

  // ===== SHEET 3: 月度统计 (Monthly Summary) =====
  // Columns: A=月份, B=总支出, C=记录数, D=日均支出, E=预算, F=可支配, G=储蓄, H=预算使用率
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
  xml += '   <Row>\n';
  [__('excel.header.month'),__('excel.header.totalExpenditure'),__('excel.header.recordCount'),__('excel.header.dailyAvgExpenditure'),__('excel.header.budget'),__('excel.header.spendable'),__('excel.header.savings'),__('excel.header.budgetUsageRate')].forEach(h => {
    xml += `    <Cell ss:StyleID="header"><Data ss:Type="String">${esc(h)}</Data></Cell>\n`;
  });
  xml += '   </Row>\n';

  const monthStartRow = 2;
  // Sort months descending (newest first)
  const monthsDesc = [...sortedMonths].sort((a, b) => a > b ? -1 : 1);
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
    savingsAmt = spendable - md.total;

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
    if (budget > 0) {
      xml += `    <Cell ss:StyleID="pct" ss:Formula="=IF(RC[-3]>0, RC[-6]/RC[-3], 0)"><Data ss:Type="Number">${fmtNum(md.total / budget)}</Data></Cell>\n`;
    } else {
      xml += `    <Cell><Data ss:Type="String">${__('excel.summary.noBudget')}</Data></Cell>\n`;
    }
    xml += '   </Row>\n';
  });

  // Totals row
  const monthEndRow = monthStartRow + monthsDesc.length - 1;
  xml += '   <Row>\n';
  xml += `    <Cell ss:StyleID="total"><Data ss:Type="String">${__('excel.summary.totalAvg')}</Data></Cell>\n`;
  // Total spending across all months
  xml += `    <Cell ss:StyleID="moneyBold" ss:Formula="=SUM(R${monthStartRow}C2:R${monthEndRow}C2)"><Data ss:Type="Number">0</Data></Cell>\n`;
  // Total records
  xml += `    <Cell ss:StyleID="total" ss:Formula="=SUM(R${monthStartRow}C3:R${monthEndRow}C3)"><Data ss:Type="Number">0</Data></Cell>\n`;
  // Average daily average
  xml += `    <Cell ss:StyleID="moneyBold" ss:Formula="=AVERAGE(R${monthStartRow}C4:R${monthEndRow}C4)"><Data ss:Type="Number">0</Data></Cell>\n`;
  // Average budget
  xml += `    <Cell ss:StyleID="moneyBold" ss:Formula="=AVERAGE(R${monthStartRow}C5:R${monthEndRow}C5)"><Data ss:Type="Number">0</Data></Cell>\n`;
  // Average spendable
  xml += `    <Cell ss:StyleID="moneyBold" ss:Formula="=AVERAGE(R${monthStartRow}C6:R${monthEndRow}C6)"><Data ss:Type="Number">0</Data></Cell>\n`;
  // Total savings
  xml += `    <Cell ss:StyleID="moneyBold" ss:Formula="=SUM(R${monthStartRow}C7:R${monthEndRow}C7)"><Data ss:Type="Number">0</Data></Cell>\n`;
  // Average usage rate
  xml += `    <Cell ss:StyleID="pctBold" ss:Formula="=AVERAGE(R${monthStartRow}C8:R${monthEndRow}C8)"><Data ss:Type="Number">0</Data></Cell>\n`;
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

  monthsDesc.forEach((m, idx) => {
    const rowNum = monthStartRow + idx;
    const md = monthData[m];
    const budget = DataStore.getBudget(m);
    let targetAmount = 0;
    const targetObj = DataStore.getSavingsTarget();
    const targetType = targetObj.type || 'fixed';
    if (targetType === 'fixed') targetAmount += (targetObj.fixedAmount || 0);
    if (targetType === 'percent') targetAmount += budget * ((targetObj.percent || 0) / 100);
    const spendable = Math.max(0, budget - targetAmount);
    const remaining = spendable - md.total;
    const usagePct = spendable > 0 ? (md.total / spendable) : 0;
    const status = remaining >= 0 ? __('excel.status.normal') : __('excel.status.overspent');

    xml += '   <Row>\n';
    xml += `    <Cell><Data ss:Type="String">${esc(m)}</Data></Cell>\n`;
    xml += `    <Cell ss:StyleID="money"><Data ss:Type="Number">${fmtNum(budget)}</Data></Cell>\n`;
    xml += `    <Cell ss:StyleID="money"><Data ss:Type="Number">${fmtNum(targetAmount)}</Data></Cell>\n`;
    // 可支配 = 预算 - 储蓄目标 (formula: B-C)
    xml += `    <Cell ss:StyleID="money" ss:Formula="=IF(RC[-2]>0, RC[-2]-RC[-1], 0)"><Data ss:Type="Number">${fmtNum(spendable)}</Data></Cell>\n`;
    xml += `    <Cell ss:StyleID="money"><Data ss:Type="Number">${fmtNum(md.total)}</Data></Cell>\n`;
    // 剩余 = 可支配 - 实际支出 (formula: D-E)
    xml += `    <Cell ss:StyleID="money" ss:Formula="=RC[-2]-RC[-1]"><Data ss:Type="Number">${fmtNum(remaining)}</Data></Cell>\n`;
    // 使用率 = 实际 / 可支配 (formula: E/D)
    if (spendable > 0) {
      xml += `    <Cell ss:StyleID="pct" ss:Formula="=IF(RC[-3]>0, RC[-2]/RC[-3], 0)"><Data ss:Type="Number">${fmtNum(usagePct)}</Data></Cell>\n`;
    } else {
      xml += `    <Cell><Data ss:Type="String">N/A</Data></Cell>\n`;
    }
    // 状态 = IF(剩余>=0, "正常", "超支")
    const fRow = rowNum;
    const statusOk = __('excel.status.normal');
    const statusFail = __('excel.status.overspent');
    xml += `    <Cell ss:StyleID="${remaining >= 0 ? 'success' : 'danger'}" ss:Formula="=IF(RC[-1]>=0, &quot;${esc(statusOk)}&quot;, &quot;${esc(statusFail)}&quot;)"><Data ss:Type="String">${esc(status)}</Data></Cell>\n`;
    xml += '   </Row>\n';
  });

  // Totals
  const btEndRow = monthStartRow + monthsDesc.length - 1;
  xml += '   <Row>\n';
  xml += `    <Cell ss:StyleID="total"><Data ss:Type="String">${__('excel.summary.total')}</Data></Cell>\n`;
  xml += `    <Cell ss:StyleID="moneyBold" ss:Formula="=SUM(R${monthStartRow}C2:R${btEndRow}C2)"><Data ss:Type="Number">0</Data></Cell>\n`;
  xml += `    <Cell ss:StyleID="moneyBold" ss:Formula="=SUM(R${monthStartRow}C3:R${btEndRow}C3)"><Data ss:Type="Number">0</Data></Cell>\n`;
  xml += `    <Cell ss:StyleID="moneyBold" ss:Formula="=SUM(R${monthStartRow}C4:R${btEndRow}C4)"><Data ss:Type="Number">0</Data></Cell>\n`;
  xml += `    <Cell ss:StyleID="moneyBold" ss:Formula="=SUM(R${monthStartRow}C5:R${btEndRow}C5)"><Data ss:Type="Number">0</Data></Cell>\n`;
  xml += `    <Cell ss:StyleID="moneyBold" ss:Formula="=SUM(R${monthStartRow}C6:R${btEndRow}C6)"><Data ss:Type="Number">0</Data></Cell>\n`;
  xml += `    <Cell ss:StyleID="pctBold" ss:Formula="=AVERAGE(R${monthStartRow}C7:R${btEndRow}C7)"><Data ss:Type="Number">0</Data></Cell>\n`;
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

  monthsDesc.forEach((m, idx) => {
    const rowNum = monthStartRow + idx;
    const md = monthData[m];
    const budget = DataStore.getBudget(m);
    let targetAmount = 0;
    const targetObj = DataStore.getSavingsTarget();
    const targetType = targetObj.type || 'fixed';
    if (targetType === 'fixed') targetAmount += (targetObj.fixedAmount || 0);
    if (targetType === 'percent') targetAmount += budget * ((targetObj.percent || 0) / 100);
    const spendable = Math.max(0, budget - targetAmount);
    const actualSavings = spendable - md.total;

    xml += '   <Row>\n';
    xml += `    <Cell><Data ss:Type="String">${esc(m)}</Data></Cell>\n`;
    xml += `    <Cell ss:StyleID="money"><Data ss:Type="Number">${fmtNum(budget)}</Data></Cell>\n`;
    xml += `    <Cell ss:StyleID="money"><Data ss:Type="Number">${fmtNum(targetAmount)}</Data></Cell>\n`;
    xml += `    <Cell ss:StyleID="money"><Data ss:Type="Number">${fmtNum(md.total)}</Data></Cell>\n`;
    // 实际储蓄 = 可支配 - 支出 = (预算 - 目标) - 支出  → formula: B - C - D
    xml += `    <Cell ss:StyleID="money" ss:Formula="=RC[-3]-RC[-2]-RC[-1]"><Data ss:Type="Number">${fmtNum(actualSavings)}</Data></Cell>\n`;
    // 目标达成率 = 实际储蓄 / 储蓄目标, capped at 100%
    if (targetAmount > 0) {
      const rate = Math.min(100, Math.max(0, actualSavings / targetAmount));
      xml += `    <Cell ss:StyleID="pct" ss:Formula="=IF(RC[-1]>0, MIN(1, MAX(0, RC[-1]/RC[-4])), 0)"><Data ss:Type="Number">${fmtNum(rate)}</Data></Cell>\n`;
    } else {
      xml += `    <Cell><Data ss:Type="String">—</Data></Cell>\n`;
    }
    xml += '   </Row>\n';
  });

  // Totals
  const svEndRow = monthStartRow + monthsDesc.length - 1;
  xml += '   <Row>\n';
  xml += `    <Cell ss:StyleID="total"><Data ss:Type="String">${__('excel.summary.total')}</Data></Cell>\n`;
  xml += `    <Cell ss:StyleID="moneyBold" ss:Formula="=SUM(R${monthStartRow}C2:R${svEndRow}C2)"><Data ss:Type="Number">0</Data></Cell>\n`;
  xml += `    <Cell ss:StyleID="moneyBold" ss:Formula="=SUM(R${monthStartRow}C3:R${svEndRow}C3)"><Data ss:Type="Number">0</Data></Cell>\n`;
  xml += `    <Cell ss:StyleID="moneyBold" ss:Formula="=SUM(R${monthStartRow}C4:R${svEndRow}C4)"><Data ss:Type="Number">0</Data></Cell>\n`;
  xml += `    <Cell ss:StyleID="moneyBold" ss:Formula="=SUM(R${monthStartRow}C5:R${svEndRow}C5)"><Data ss:Type="Number">0</Data></Cell>\n`;
  xml += `    <Cell ss:StyleID="pctBold" ss:Formula="=AVERAGE(R${monthStartRow}C6:R${svEndRow}C6)"><Data ss:Type="Number">0</Data></Cell>\n`;
  xml += '   </Row>\n';

  xml += '  </Table>\n';
  xml += ' </Worksheet>\n';

  xml += '</Workbook>';

  // Trigger download as .xlsx (the XML Spreadsheet format — Excel opens it fine)
  const blob = new Blob([xml], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
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

  // === I18N ENTRIES ===
  addI18nEntries({
    'excel.sheet.records': { zh: '消费记录', en: 'Records' },
    'excel.sheet.categoryBreakdown': { zh: '分类统计', en: 'Category Breakdown' },
    'excel.sheet.monthlySummary': { zh: '月度统计', en: 'Monthly Summary' },
    'excel.sheet.budgetTracking': { zh: '预算跟踪', en: 'Budget Tracking' },
    'excel.sheet.savingsStats': { zh: '储蓄统计', en: 'Savings Stats' },
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
    'excel.summary.total': { zh: '合计', en: 'Total' },
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
