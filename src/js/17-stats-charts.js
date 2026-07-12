/* ============================================================
   RENDER: Statistics Page
   ============================================================ */
(function() {
'use strict';
let statsMonth = '';
let statsStartDate = '';
let statsEndDate = '';
let statsDrillStack = []; // stack of parent IDs for drill-down breadcrumb
let showMonthCompare = false;
let waffleDensity = parseInt(localStorage.getItem('budgetWaffleDensity') || '3');
let waffleIncludeUntagged = localStorage.getItem('budgetWaffleIncludeUntagged') !== 'false';
let waffleCells = [];
let waffleTagData = [];
var waffleSelectedMonth = '';
var _hoverAnimId = null;
var _hoverState = { tagIndex: -1, progress: 0, active: false };

function getDrillCategory() {
  return statsDrillStack.length > 0 ? statsDrillStack[statsDrillStack.length - 1] : null;
}

// Update the pie drill bar (back button + breadcrumb) without touching rest of page
function syncPieDrillBar() {
  const pieCard = document.getElementById('pieCard');
  if (!pieCard) return;
  const backArea = pieCard.querySelector('.pie-drill-bar');
  if (!backArea) return;
  const drillCategory = getDrillCategory();
  if (drillCategory) {
    const c = DataStore.getCategory(drillCategory);
    backArea.innerHTML = `
      <button class="btn btn-ghost btn-sm" onclick="resetStatsDrill()">← 返回上级</button>
      <span class="text-sm" style="color:var(--primary);font-weight:600">
        ${c ? '🔍 ' + c.icon + ' ' + c.name : ''} 的子分类
      </span>
    `;
  } else {
    backArea.innerHTML = '';
  }
}

// Update only the chart area after a drill action (no full page re-render)
function updateDrillCharts() {
  console.log('[updateDrillCharts] drillCategory:', getDrillCategory());
  const isCustom = useCustomRange();
  const sD = isCustom ? statsStartDate : null;
  const eD = isCustom ? statsEndDate : null;
  drawPieChart('pieChart', statsMonth, sD, eD);
  drawBarChart('barChart', statsMonth, sD, eD);
  syncPieDrillBar();
}
/* ============================================================
   CALENDAR HEATMAP
   ============================================================ */
function getHeatmapColor(ratio) {
  if (ratio === 0) return null; // no spending
  // Smooth gradient:  Blue → Cyan → Green → Yellow → Orange → Red
  //   ratio 0.0 → Deep Blue (far under budget)
  //   ratio 0.5 → Green (under budget)  
  //   ratio 1.0 → Yellow (at target)
  //   ratio 1.5 → Orange (over budget)
  //   ratio 2.0+ → Deep Red (far over budget)
  const stops = [
    { r: 0.0, color: [0x22, 0x55, 0xCC] },  // vibrant blue
    { r: 0.4, color: [0x22, 0x99, 0x88] },  // teal
    { r: 0.7, color: [0x44, 0xBB, 0x55] },  // green
    { r: 1.0, color: [0xFB, 0xBD, 0x0A] },  // warm yellow
    { r: 1.5, color: [0xF9, 0x73, 0x16] },  // orange
    { r: 2.0, color: [0xDC, 0x26, 0x26] }   // deep red
  ];
  const t = Math.min(ratio, 2.0);
  let lo = stops[0], hi = stops[stops.length - 1];
  for (let i = 0; i < stops.length - 1; i++) {
    if (t >= stops[i].r && t <= stops[i + 1].r) {
      lo = stops[i]; hi = stops[i + 1]; break;
    }
  }
  const span = hi.r - lo.r;
  const frac = span > 0 ? (t - lo.r) / span : 0;
  const r = Math.round(lo.color[0] + (hi.color[0] - lo.color[0]) * frac);
  const g = Math.round(lo.color[1] + (hi.color[1] - lo.color[1]) * frac);
  const b = Math.round(lo.color[2] + (hi.color[2] - lo.color[2]) * frac);
  return '#' + [r,g,b].map(c => c.toString(16).padStart(2,'0')).join('');
}

function getDailySavingsTarget(month) {
  const budget = DataStore.getMonthlyIncome(month) || DataStore.getBudget(month);
  if (!budget) return 0;
  const savingsTarget = DataStore.getSavingsTarget();
  const percentBase = DataStore.getPercentBase();
  const totalBills = DataStore.getBillTotal(month);
  const netDisposable = Math.max(0, budget - totalBills);
  const baseAmount = percentBase === 'net' ? netDisposable : budget;
  const targetAmount = (() => {
    const t = savingsTarget;
    if (t.type === 'fixed') return t.fixedAmount || 0;
    if (t.type === 'percent') return baseAmount * (t.percent || 0) / 100;
    return 0;
  })();
  const spendable = Math.max(0, netDisposable - targetAmount);
  const parts = month.split('-');
  const daysInMonth = new Date(parseInt(parts[0]), parseInt(parts[1]), 0).getDate();
  return daysInMonth > 0 ? spendable / daysInMonth : 0;
}

function renderCalendarHeatmap(month) {
  if (!month) return '<div class="text-sm text-muted">请选择月份查看日历热力图</div>';
  const parts = month.split('-');
  const year = parseInt(parts[0]);
  const mon = parseInt(parts[1]);
  const daysInMonth = new Date(year, mon, 0).getDate();
  const firstDayOfWeek = new Date(year, mon - 1, 1).getDay(); // 0=Sun

  const excludeBills = true;
  const dailyTarget = getDailySavingsTarget(month);
  const dailyTotals = StatsEngine.getDailyTotals(month, { excludeBills });
  const dayMap = {};
  dailyTotals.forEach(d => { dayMap[d.day] = d.total; });

  const now = new Date();
  const today = now.getDate();
  const currentMonth = getMonthKey(now.toISOString());
  const isCurrentMonth = month === currentMonth;

  const weekdays = ['日', '一', '二', '三', '四', '五', '六'];

  let html = '<div class="heatmap-container">';

  // Month display (linked to stats month selector)
  html += `<div class="flex items-center justify-between mb-8">
    <span class="text-sm font-semibold">📅 ${year}年${mon}月 消费热力图</span>
    ${dailyTarget > 0 ? `<span class="text-xs text-muted">日均可支配: ${formatMoney(dailyTarget)}</span>` : '<span class="text-xs text-muted">未设置预算/储蓄目标</span>'}
  </div>`;

  // Legend
  html += '<div class="heatmap-legend">';
  html += '<span class="heatmap-legend-label">少</span>';
  const legendStops = [0, 0.5, 0.9, 1.1, 1.5, 2.0, 3.0];
  legendStops.forEach(r => {
    const color = getHeatmapColor(r);
    if (color) {
      html += `<div class="heatmap-legend-item" style="background:${color}"></div>`;
    }
  });
  html += `<span class="heatmap-legend-label">多</span>`;
  html += '<span class="heatmap-legend-label" style="margin-left:8px">⚫ 无消费</span>';
  html += '</div>';

  // Weekday headers
  html += '<div class="heatmap-grid">';
  weekdays.forEach(wd => {
    html += `<div class="heatmap-weekday">${wd}</div>`;
  });

  // Empty cells before first day
  for (let i = 0; i < firstDayOfWeek; i++) {
    html += '<div></div>';
  }

  // Day cells
  const dateStrMonth = year + '-' + String(mon).padStart(2, '0');
  for (let day = 1; day <= daysInMonth; day++) {
    const spending = dayMap[day] || 0;
    const ratio = dailyTarget > 0 ? spending / dailyTarget : 0;
    const color = getHeatmapColor(ratio);
    const isFuture = isCurrentMonth && day > today;
    const isEmpty = spending === 0;

    const dateStr = dateStrMonth + '-' + String(day).padStart(2, '0');
    const tooltipText = isEmpty ? '无消费' : formatMoney(spending) + ' (比目标 ' + (ratio === 0 ? '0' : (ratio * 100).toFixed(0)) + '%)';

    let cellStyle = '';
    if (isFuture) {
      cellStyle = 'background:#E2E8F0;color:#94A3B8';
    } else if (isEmpty) {
      cellStyle = '';
    } else if (color) {
      cellStyle = `background:${color};color:white;text-shadow:0 1px 2px rgba(0,0,0,0.3)`;
    }

    const classes = 'heatmap-day'
      + (isFuture ? ' future' : '')
      + (isEmpty && !isFuture ? ' empty-day' : '');

    html += `<!-- heatmap-day click -->
      <div class="${classes}" style="${cellStyle}"
      ${!isFuture ? `onclick="showDayRecords('${dateStr}')"` : ''}>
      ${day}
      <div class="heatmap-tooltip">${dateStrMonth.slice(5)}/${String(day).padStart(2,'0')} ${tooltipText}</div>
    </div>`;
  }

  html += '</div>'; // close grid

  // Day records popup area
  html += '<div id="heatmapDayPopup" class="heatmap-day-popup" style="display:none"></div>';

  html += '</div>'; // close container

  return html;
}

function showDayRecords(dateStr) {
  // Determine target: if expanded heatmap is open, use the expand panel; otherwise use the regular popup
  const expandPanel = document.getElementById('expandDayPanel');
  const popup = document.getElementById('heatmapDayPopup');
  
  const isExpand = !!expandPanel;
  const target = isExpand ? expandPanel : popup;
  
  if (!target) return;
  if (!isExpand && popup) popup.style.display = 'block';

  const records = DataStore.getRecords().filter(r => {
    const rd = (r.date || r.createdAt).slice(0, 10);
    return rd === dateStr;
  });
  
  if (!records.length) {
    target.innerHTML = `<div style="font-size:0.9rem;font-weight:600;margin-bottom:12px">📅 ${dateStr}</div>
      <div class="text-sm text-muted">无记录</div>`;
    return;
  }

  const total = records.reduce((s, r) => s + r.amount, 0);
  const catMap = {};
  DataStore.getCategories().forEach(c => catMap[c.id] = c);

  let html = `<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px">
    <div style="font-size:0.9rem;font-weight:600">📅 ${dateStr}</div>
    <div style="font-size:0.85rem;font-weight:600">合计: ${formatMoney(total)}</div>
  </div>`;
  html += `<div style="display:flex;gap:6px;margin-bottom:6px">
    <button class="btn btn-ghost btn-sm" onclick="clearRecordsFilter()" style="font-size:0.65rem;padding:2px 8px">🔄 重置流水筛选</button>
  </div>`;
  
  records.forEach(r => {
    const cat = catMap[r.categoryId] || { name: '未知', icon: '❓', color: '#94A3B8' };
    html += `<div class="record-card compact" data-id="${r.id}" style="cursor:pointer;padding:6px 10px;margin-bottom:3px;border-radius:8px;border:1px solid var(--border);background:var(--card-bg);display:flex;align-items:center;gap:8px;font-size:0.82rem;transition:all 0.15s"
      onclick="openEditRecord('${r.id}')"
      onmouseover="this.style.borderColor='var(--primary)'" onmouseout="this.style.borderColor='var(--border)'">
      <span style="font-size:0.8rem">${cat.icon}</span>
      <span style="flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${cat.name}</span>
      ${r.note ? `<span class="text-xs text-muted" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:100px">📝 ${escHtml(r.note)}</span>` : ''}
      <span style="font-weight:600;white-space:nowrap">${formatMoney(r.amount)}</span>
      <button class="btn btn-ghost btn-sm" style="padding:2px 4px;font-size:0.65rem;opacity:0.5;flex-shrink:0"
        onclick="event.stopPropagation();showRecordRaw('${r.id}')" title="查看原始数据">🔍</button>
      <button class="btn btn-ghost btn-sm" style="padding:2px 6px;font-size:0.7rem;opacity:0.5;flex-shrink:0"
        onclick="event.stopPropagation();deleteRecordConfirm('${r.id}')" title="删除">🗑️</button>
    </div>`;
  });

  target.innerHTML = html;
}

/* ===== CHART EXPAND ===== */
let _expandedChart = null; // 'heatmap' or 'pie'

function expandHeatmap() {
  console.log('[expandHeatmap] opening heatmap modal');
  _expandedChart = 'heatmap';
  const overlay = document.createElement('div');
  overlay.className = 'chart-expand-overlay';
  overlay.id = 'chartExpandOverlay';
  overlay.onclick = function(e) { if (e.target === this) shrinkChart(); };
  overlay.innerHTML = `
    <div class="chart-expand-inner" style="display:flex;flex-direction:column;max-width:900px">
      <button class="chart-expand-close" onclick="shrinkChart()">✕</button>
      <div class="card-title" style="font-size:1.1rem;margin-bottom:12px">📅 消费热力图</div>
      <div style="display:flex;gap:20px;flex-wrap:wrap">
        <div style="flex:0 0 auto;max-width:420px">
          ${renderCalendarHeatmap(statsMonth)}
        </div>
        <div id="expandDayPanel" style="flex:1;min-width:250px;border-left:1px solid var(--border);padding-left:16px">
          <div class="text-sm text-muted" style="padding:20px 0;text-align:center">← 点击左侧日期查看当日记录</div>
        </div>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);
  document.body.style.overflow = 'hidden';
}

function expandPie() {
  console.log('[expandPie] opening pie modal');
  _expandedChart = 'pie';
  const overlay = document.createElement('div');
  overlay.className = 'chart-expand-overlay';
  overlay.id = 'chartExpandOverlay';
  overlay.onclick = function(e) { if (e.target === this) shrinkChart(); };
  overlay.innerHTML = `
    <div class="chart-expand-inner" style="max-width:800px">
      <button class="chart-expand-close" onclick="shrinkChart()">✕</button>
      <div class="card-title" style="font-size:1.1rem;margin-bottom:8px">📊 分类支出分析</div>
      <div style="display:flex;flex-wrap:wrap;gap:16px;align-items:flex-start">
        <div style="flex:1;min-width:300px">
          <canvas id="expandPieChart" style="width:100%;max-width:500px;height:360px;margin:0 auto;display:block"></canvas>
        </div>
        <div style="flex:1;min-width:250px" id="expandPieTable">
          <!-- Category table rendered here after chart draw -->
        </div>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);
  document.body.style.overflow = 'hidden';
  setTimeout(() => {
    const isCustom = useCustomRange();
    drawPieChart('expandPieChart', statsMonth,
      isCustom ? statsStartDate : null,
      isCustom ? statsEndDate : null,
      shrinkChart, 360, true);
    // Render category table
    renderExpandPieTable();
  }, 50);
}

/* ===== EXPANDED PIE CATEGORY TABLE ===== */
function renderExpandPieTable() {
  const container = document.getElementById('expandPieTable');
  if (!container) return;
  
  const drillCategory = getDrillCategory();
  let data;
  if (drillCategory) {
    const breakdown = StatsEngine.getCategoryBreakdownDeep(statsMonth, drillCategory);
    if (breakdown) {
      const childrenData = (breakdown.children || []).map(c => ({ id: c.category.id, total: c.total, cat: c.category }));
      const childrenTotal = childrenData.reduce((s, d) => s + d.total, 0);
      const directTotal = breakdown.total - childrenTotal;
      data = [...childrenData];
      if (directTotal > 0.001) {
        data.push({ id: breakdown.category.id + '-direct', total: directTotal, cat: { name: breakdown.category.name + ' (直接)', icon: '📌', color: breakdown.category.color } });
      }
      data = data.filter(d => d.total > 0).sort((a, b) => b.total - a.total);
    } else {
      data = [];
    }
  } else {
    const excludeBills = !isBillToggleChecked('pieChart');
    data = getChartData(statsMonth, null, null, { excludeBills });
  }
  
  if (!data.length) {
    container.innerHTML = '<div class="text-sm text-muted" style="padding:20px;text-align:center">暂无分类数据</div>';
    return;
  }
  
  const total = data.reduce((s, d) => s + d.total, 0);
  const drillCat = getDrillCategory();
  const parentCat = drillCat ? DataStore.getCategory(drillCat) : null;
  
  let html = '<div style="font-size:0.85rem">';
  
  // Back button + breadcrumb
  if (drillCategory) {
    html += '<div style="display:flex;align-items:center;gap:6px;margin-bottom:8px;flex-wrap:wrap">';
    html += '<button class="btn btn-ghost btn-sm" onclick="resetStatsDrill();drawPieChart(\'expandPieChart\', statsMonth, null, null, null, 360, false);renderExpandPieTable()" title="返回上级" style="padding:2px 8px;font-size:0.75rem">← 返回</button>';
    html += '<span class="text-sm text-secondary">' + (parentCat ? parentCat.icon + ' ' + parentCat.name : '') + ' 的子分类</span>';
    html += '</div>';
  }
  
  // Table header with controls
  html += '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px">';
  html += '<span style="font-weight:600;font-size:0.8rem">分类明细</span>';
  html += '<span class="text-xs text-muted">点击 ▸ 展开子分类 · 点击分类名下钻</span>';
  html += '</div>';
  
  html += '<div style="display:flex;font-weight:600;font-size:0.75rem;color:var(--text-secondary);padding:6px 4px;border-bottom:2px solid var(--border);margin-bottom:4px">';
  html += '<span style="flex:1">分类</span>';
  html += '<span style="width:80px;text-align:right">金额</span>';
  html += '<span style="width:50px;text-align:right">占比</span>';
  html += '</div>';
  
  // Rows with inline expand
  data.forEach(d => {
    const pct = (d.total / total * 100).toFixed(1);
    const color = d.displayColor || d.cat.color;
    const children = DataStore.getChildren(d.id);
    const hasChildren = children && children.length > 0;
    const rowId = 'pie-row-' + d.id.replace(/[^a-zA-Z0-9]/g, '-');
    
    html += '<div style="display:flex;align-items:center;padding:5px 4px;border-bottom:1px solid var(--border);font-size:0.82rem">';
    
    // Expand toggle (if has children)
    if (hasChildren) {
      html += '<span style="cursor:pointer;flex-shrink:0;width:28px;text-align:center;padding:6px 0;font-size:1rem;user-select:none;border-radius:6px" onclick="event.stopPropagation();toggleExpandPieRow(\'' + rowId + '\')" title="展开/收起子分类" onmouseover="this.style.background=\'var(--bg)\'" onmouseout="this.style.background=\'\'">▸</span>';
    } else {
      html += '<span style="flex-shrink:0;width:16px"></span>';
    }
    
    // Clickable category name (drills into pie chart)
    html += '<div style="flex:1;display:flex;align-items:center;gap:4px;min-width:0;cursor:' + (hasChildren ? 'pointer' : 'default') + '"';
    if (hasChildren) {
      html += ' onclick="statsDrillStack.push(\'' + d.id + '\');updateDrillCharts();drawPieChart(\'expandPieChart\', statsMonth, null, null, null, 360, false);renderExpandPieTable()"';
      html += ' onmouseover="this.style.color=\'var(--primary)\'" onmouseout="this.style.color=\'\'"';
    }
    html += '>';
    html += '<span style="width:8px;height:8px;border-radius:50%;background:' + color + ';flex-shrink:0"></span>';
    html += '<span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + d.cat.icon + ' ' + d.cat.name + '</span>';
    html += '</div>';
    
    html += '<span style="width:80px;text-align:right;font-weight:600">' + formatMoney(d.total) + '</span>';
    html += '<span style="width:50px;text-align:right;color:var(--text-muted)">' + pct + '%</span>';
    html += '</div>';
    
    // Expandable children container (hidden by default)
    if (hasChildren) {
      html += '<div id="' + rowId + '" style="display:none">';
      children.forEach(child => {
        const childRecs = DataStore.getRecords().filter(r => r.categoryId === child.id);
        const childTotal = childRecs.reduce((s, r) => s + r.amount, 0);
        if (childTotal <= 0) return;
        const childPct = (childTotal / total * 100).toFixed(1);
        html += '<div style="display:flex;align-items:center;padding:4px 4px 4px 28px;border-bottom:1px dashed var(--border);font-size:0.78rem">';
        html += '<div style="flex:1;display:flex;align-items:center;gap:4px;min-width:0">';
        html += '<span style="width:6px;height:6px;border-radius:50%;background:' + child.color + ';flex-shrink:0"></span>';
        html += '<span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + child.icon + ' ' + child.name + '</span>';
        html += '</div>';
        html += '<span style="width:80px;text-align:right;font-weight:500">' + formatMoney(childTotal) + '</span>';
        html += '<span style="width:50px;text-align:right;color:var(--text-muted)">' + childPct + '%</span>';
        html += '</div>';
      });
      html += '</div>';
    }
  });
  
  // Total row
  html += '<div style="display:flex;align-items:center;padding:6px 4px;margin-top:4px;font-weight:700;border-top:2px solid var(--border)">';
  html += '<span style="flex:1">合计</span>';
  html += '<span style="width:80px;text-align:right">' + formatMoney(total) + '</span>';
  html += '<span style="width:50px;text-align:right;color:var(--text-muted)">100%</span>';
  html += '</div>';
  
  html += '</div>';
  container.innerHTML = html;
}

/* Toggle inline expansion of pie table rows */
function toggleExpandPieRow(rowId) {
  const el = document.getElementById(rowId);
  if (!el) return;
  el.style.display = el.style.display === 'none' ? 'block' : 'none';
}

function shrinkChart() {
  const overlay = document.getElementById('chartExpandOverlay');
  if (overlay) overlay.remove();
  document.body.style.overflow = '';
  _expandedChart = null;
}
/* ===== MONTH-OVER-MONTH COMPARISON ===== */
function toggleMonthCompare() {
  showMonthCompare = !showMonthCompare;
  renderStats();
}

function drawCompareBarChart(canvasId, month) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;
  const tc = getThemeColors();
  const rect = canvas.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  const w = rect.width || 600;
  const h = 230;
  if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
  }

  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  // Calculate previous month
  const parts = month.split('-');
  const prevM = parseInt(parts[1]) - 1;
  const prevMonth = prevM > 0 ? parts[0] + '-' + String(prevM).padStart(2,'0') : (parseInt(parts[0])-1) + '-12';

  const thisData = getChartData(month);
  const prevDataMap = {};
  getChartData(prevMonth).forEach(d => {
    prevDataMap[d.id] = d.total;
  });

  if (!thisData.length) {
    ctx.fillStyle = tc.textMuted;
    ctx.font = '14px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('暂无数据', w/2, h/2);
    return;
  }

  const padding = { top: 20, bottom: 55, left: 60, right: 25 };
  const plotW = w - padding.left - padding.right;
  const plotH = h - padding.top - padding.bottom;
  const maxVal = Math.max(...thisData.map(d => Math.max(d.total, prevDataMap[d.id] || 0)), 0.01);
  const groupW = plotW / thisData.length;
  const barW = Math.min(18, groupW * 0.35);

  // Grid
  ctx.strokeStyle = tc.border;
  ctx.lineWidth = 1;
  for (let i = 0; i <= 4; i++) {
    const y = padding.top + (plotH / 4) * i;
    ctx.beginPath();
    ctx.moveTo(padding.left, y);
    ctx.lineTo(w - padding.right, y);
    ctx.stroke();
    ctx.fillStyle = tc.textMuted;
    ctx.font = '9px sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText(formatMoney(maxVal * (1 - i/4)), padding.left - 5, y + 3);
  }

  // Grouped bars
  thisData.forEach((d, i) => {
    const x = padding.left + i * groupW + (groupW - barW * 2) / 2;
    const prevVal = prevDataMap[d.id] || 0;

    // Previous month bar (green, left)
    const prevH = (prevVal / maxVal) * plotH;
    ctx.fillStyle = '#10B981';
    ctx.beginPath();
    ctx.roundRect(x, padding.top + plotH - prevH, barW, Math.max(prevH, 1), [3, 0, 0, 3]);
    ctx.fill();
    if (prevVal > 0) {
      ctx.fillStyle = '#059669';
      ctx.font = 'bold 8px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(formatMoney(prevVal), x + barW/2, padding.top + plotH - prevH - 3);
    }

    // This month bar (blue, right)
    const thisH = (d.total / maxVal) * plotH;
    ctx.fillStyle = '#6366F1';
    ctx.beginPath();
    ctx.roundRect(x + barW, padding.top + plotH - thisH, barW, Math.max(thisH, 1), [0, 3, 3, 0]);
    ctx.fill();
    ctx.fillStyle = '#4F46E5';
    ctx.font = 'bold 8px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(formatMoney(d.total), x + barW + barW/2, padding.top + plotH - thisH - 3);

    // Category label
    ctx.fillStyle = tc.text;
    ctx.font = '9px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(d.cat.name.length > 4 ? d.cat.name.slice(0,4)+'..' : d.cat.name, x + barW, h - 8);
  });

  // Labels for this/prev month
  ctx.fillStyle = '#6366F1';
  ctx.font = 'bold 9px sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText('🔵 本月', padding.left, 12);
  ctx.fillStyle = '#10B981';
  ctx.fillText('🟢 上月', padding.left + 80, 12);
}
/* ============================================================
   BILL TOGGLE — Include/Exclude Bills from Charts
   ============================================================ */
function renderBillToggle(chartId, checked = true) {
  const stored = localStorage.getItem('chartBillToggle_' + chartId);
  const isChecked = stored !== null ? stored === '1' : checked;
  return `<label class="bill-toggle">
    <input type="checkbox" id="toggle-${chartId}" ${isChecked ? 'checked' : ''}
      onchange="toggleBillFilter('${chartId}')">
    📋 含账单
  </label>`;
}

function toggleBillFilter(chartId) {
  const key = 'chartBillToggle_' + chartId;
  const checked = document.getElementById('toggle-' + chartId).checked;
  localStorage.setItem(key, checked ? '1' : '0');
  if (chartId === 'overviewBudget') {
    if (typeof refreshOverviewBudget === 'function') refreshOverviewBudget();
  } else if (chartId === 'pieChart') {
    if (typeof refreshPieChart === 'function') refreshPieChart();
  } else if (typeof renderStats === 'function') {
    renderStats();
  }
}

function refreshOverviewBudget() {
  const now = new Date();
  const month = getMonthKey(now.toISOString());
  const includeBills = isBillToggleChecked('overviewBudget');
  const monthTotal = includeBills ? StatsEngine.getMonthTotal(month) : StatsEngine.getVariableSpending(month);
  const budget = DataStore.getMonthlyIncome(month) || DataStore.getBudget(month);
  if (!budget) return;

  const totalBills = DataStore.getBillTotal(month);
  const savingsTarget = DataStore.getSavingsTarget();
  const percentBase = DataStore.getPercentBase();
  const netDisposable = Math.max(0, budget - totalBills);
  const baseAmount = percentBase === 'net' ? netDisposable : budget;
  const targetAmount = (() => {
    const t = savingsTarget;
    if (t.type === 'fixed') return t.fixedAmount || 0;
    if (t.type === 'percent') return baseAmount * (t.percent || 0) / 100;
    return 0;
  })();
  const spendableBudget = Math.max(0, netDisposable - targetAmount);
  const budgetPct = includeBills
    ? (budget > 0 ? (monthTotal / budget) * 100 : 0)
    : (spendableBudget > 0 ? (monthTotal / spendableBudget) * 100 : 0);

  // Redraw ring
  const budgetOverspend = budgetPct > 100;
  drawRing('budgetRing', Math.min(budgetPct, 200) / 100, budgetOverspend ? '#EF4444' : '#6366F1',
    (budgetOverspend ? '+' : '') + budgetPct.toFixed(0) + '%', '#EF4444');

  // Update label below ring
  const parent = document.getElementById('budgetRing')?.parentElement;
  if (!parent) return;
  const labelEl = parent.querySelector('.text-sm.text-secondary');
  if (labelEl) {
    labelEl.textContent = budgetPct > 100
      ? '超支 ' + formatMoney(monthTotal - (includeBills ? budget : spendableBudget))
      : formatMoney(monthTotal) + ' / ' + formatMoney(includeBills ? budget : spendableBudget);
    labelEl.style.color = budgetPct > 100 ? 'var(--danger)' : '';
    labelEl.style.fontWeight = budgetPct > 100 ? '600' : '';
  }

  // Update bottom formula text
  const formulaEl = parent.querySelector('.text-xs.text-muted');
  if (formulaEl) {
    formulaEl.remove();
  }
  if (targetAmount > 0 && budget > 0) {
    const newFormula = document.createElement('div');
    newFormula.className = 'text-xs text-muted mt-4';
    newFormula.textContent = `月收入 ${formatMoney(budget)}` + (totalBills > 0 ? ` − 账单 ${formatMoney(totalBills)}` : '') + ` − 储蓄 ${formatMoney(targetAmount)} = 日常可用 ${formatMoney(spendableBudget)}`;
    parent.appendChild(newFormula);
  }
}

function refreshPieChart() {
  const isCustom = useCustomRange();
  const sD = isCustom ? statsStartDate : null;
  const eD = isCustom ? statsEndDate : null;
  drawPieChart('pieChart', statsMonth, sD, eD);
  // Also redraw the expanded chart if it's open
  const expandCanvas = document.getElementById('expandPieChart');
  if (expandCanvas) {
    drawPieChart('expandPieChart', statsMonth, sD, eD, shrinkChart, 360, true);
    renderExpandPieTable();
  }
}

function isBillToggleChecked(chartId) {
  const stored = localStorage.getItem('chartBillToggle_' + chartId);
  return stored !== null ? stored === '1' : true;
}
function renderStats() {
  console.log('[renderStats] rendering for month:', statsMonth, 'custom:', statsStartDate, statsEndDate);
  const el = document.getElementById('page-stats');
  const now = new Date();
  statsMonth = statsMonth || getMonthKey(now.toISOString());
  window.statsMonth = statsMonth;
  const isRolling = getStatsRange() === 'rolling30' && statsMonth === getMonthKey(now.toISOString()) && !useCustomRange();
  const monthTotal = isRolling ? StatsEngine.getPeriodTotal() : StatsEngine.getMonthTotal(statsMonth);
  const dailyAvg = isRolling ? StatsEngine.getPeriodDailyAverage() : StatsEngine.getDailyAverage(statsMonth);
  const predicted = isRolling ? StatsEngine.getPeriodPredictedTotal() : StatsEngine.getPredictedTotal(statsMonth);
  const budget = DataStore.getMonthlyIncome(statsMonth) || DataStore.getBudget(statsMonth);
  const remainingLimit = isRolling ? StatsEngine.getPeriodRemainingDailyLimit() : StatsEngine.getRemainingDailyLimit(statsMonth);

  // Spendable budget for stats page
  const savingsTargetStats = DataStore.getSavingsTarget();
  const percentBaseStats = DataStore.getPercentBase();
  const totalBillsStats = DataStore.getBillTotal(statsMonth);
  const paidBillsStats = isRolling ? StatsEngine.getPeriodBillSpending() : StatsEngine.getBillSpendingActual(statsMonth);
  const unpaidPlannedBillsStats = Math.max(0, totalBillsStats - paidBillsStats);
  const effectiveTotalStats = monthTotal + unpaidPlannedBillsStats;
  const savingsPred = isRolling ? (budget - monthTotal) : (StatsEngine.getSavingsPrediction(statsMonth) - unpaidPlannedBillsStats);
  const netDisposableStats = Math.max(0, budget - totalBillsStats);
  const baseAmountStats = percentBaseStats === 'net' ? netDisposableStats : budget;
  const targetAmountStats = (() => {
    const t = savingsTargetStats;
    if (t.type === 'fixed') return t.fixedAmount || 0;
    if (t.type === 'percent') return baseAmountStats * (t.percent || 0) / 100;
    return 0;
  })();
  const spendableBudgetStats = Math.max(0, netDisposableStats - targetAmountStats);
  const remainingLimitSpendableStats = (() => {
    const daysInMonth = new Date(now.getFullYear(), now.getMonth()+1, 0).getDate();
    const remainingDays = daysInMonth - now.getDate();
    if (remainingDays <= 0) return 0;
    const varSpendingStats = isRolling ? StatsEngine.getPeriodVariableSpending() : StatsEngine.getVariableSpending(statsMonth);
    const remainingAmt = spendableBudgetStats - varSpendingStats;
    return Math.max(0, remainingAmt / remainingDays);
  })();

  const isCustom = useCustomRange();
  const rangeTotal = isCustom ? StatsEngine.getCustomRangeTotals(statsStartDate, statsEndDate) : null;
  const actualSavings = Math.max(0, budget - monthTotal);

  // Compute extra stats
  let records = isCustom
    ? DataStore.getRecords().filter(r => { const d = new Date(r.date || r.createdAt); return d >= new Date(statsStartDate) && d <= new Date(statsEndDate); })
    : (isRolling ? StatsEngine.getPeriodRecords() : StatsEngine.getRecordsInMonth(statsMonth));
  const totalCount = records.length;
  const avgAmount = totalCount > 0 ? (isCustom ? rangeTotal.total : monthTotal) / totalCount : 0;
  const maxRecord = records.reduce((max, r) => (r.amount > (max?.amount || 0) ? r : max), null);
  const maxAmount = maxRecord ? maxRecord.amount : 0;
  const maxCat = maxRecord ? DataStore.getCategory(maxRecord.categoryId) : null;
  const dailyTotals = isCustom ? (rangeTotal ? rangeTotal.daily : []) : (isRolling ? StatsEngine.getPeriodDailyTotals({ excludeBills: false }) : StatsEngine.getDailyTotals(statsMonth));
  const maxDay = dailyTotals.reduce((max, d) => (d.total > (max?.total || 0) ? d : max), null);
  const daysWithTxns = dailyTotals.filter(d => d.total > 0).length;

  // Previous month comparison
  // (prevMonthTotal / prevChange removed)

  el.innerHTML = `
    <!-- Date selector -->
    <div class="card mb-16">
      <div class="flex items-center gap-8" style="flex-wrap:wrap">
        <div class="flex items-center gap-8">
          <label class="text-sm text-secondary">月份</label>
          <input type="month" id="statsMonth" class="input-field" style="width:160px" value="${statsMonth}" onchange="changeStatsMonth(this.value)">
        </div>
        <span class="text-muted">或</span>
        <div class="flex items-center gap-8">
          <label class="text-sm text-secondary">自定义范围</label>
          <input type="date" id="statsDateStart" class="input-field" style="width:130px" value="${statsStartDate}" onchange="changeStatsCustom()">
          <span class="text-muted">至</span>
          <input type="date" id="statsDateEnd" class="input-field" style="width:130px" value="${statsEndDate}" onchange="changeStatsCustom()">
        </div>
        </div>
      </div>



    <!-- Stats cards row 1: Core summary -->
    <div class="grid-4 mb-16">
      <div class="card"><div class="card-title">${isCustom ? '范围总支出' : (isRolling ? '近30天支出' : '本月总支出')}</div><div class="text-xl font-bold" style="color:var(--primary)">${formatMoney(isCustom ? rangeTotal.total : monthTotal)}</div>${!isCustom && (isRolling ? StatsEngine.getPeriodBillSpending() : StatsEngine.getBillSpendingActual(statsMonth)) > 0 ? `<div class="text-xs text-muted mt-4">日常 ${formatMoney(monthTotal - (isRolling ? StatsEngine.getPeriodBillSpending() : StatsEngine.getBillSpendingActual(statsMonth)))} · 账单 ${formatMoney(isRolling ? StatsEngine.getPeriodBillSpending() : StatsEngine.getBillSpendingActual(statsMonth))}</div>` : ''}</div>
      <div class="card"><div class="card-title">${isCustom ? '记录数' : '日均支出'}</div><div class="text-xl font-bold">${isCustom ? rangeTotal.count : formatMoney(dailyAvg)}</div>${!isCustom && (isRolling ? StatsEngine.getPeriodBillSpending() : StatsEngine.getBillSpendingActual(statsMonth)) > 0 ? `<div class="text-xs text-muted mt-4">日常日均 ${formatMoney(isRolling ? StatsEngine.getPeriodDailyAverage() : StatsEngine.getDailyAverageVariable(statsMonth))}</div>` : ''}</div>
      <div class="card"><div class="card-title">${isRolling ? '预测30天总支出' : '预测月总支出'}</div><div class="text-xl font-bold">${formatMoney(predicted)}</div></div>
      <div class="card"><div class="card-title">储蓄预测</div><div class="text-xl font-bold" style="color:${savingsPred >= 0 ? 'var(--success)' : 'var(--danger)'}">${formatMoney(savingsPred)}</div></div>
    </div>

    <!-- Stats cards row 2: Transaction analysis -->
    <div class="grid-4 mb-16">
      <div class="card">
        <div class="card-title">交易笔数</div>
        <div class="text-xl font-bold">${totalCount} 笔</div>
        <div class="text-xs text-muted mt-4">有消费天数: ${daysWithTxns} 天</div>
      </div>
      <div class="card">
        <div class="card-title">平均每笔</div>
        <div class="text-xl font-bold">${formatMoney(avgAmount)}</div>
      </div>
      <div class="card">
        <div class="card-title">单笔最高</div>
        <div class="text-xl font-bold" style="color:var(--danger)">${formatMoney(maxAmount)}</div>
        ${maxCat ? `<div class="text-xs text-muted mt-4">${maxCat.icon} ${maxCat.name}</div>` : ''}
      </div>
      <div class="card">
        <div class="card-title">最高消费日</div>
        <div class="text-xl font-bold">${maxDay ? formatMoney(maxDay.total) : ''}</div>
        ${maxDay ? `<div class="text-xs text-muted mt-4">${isCustom ? maxDay.day : statsMonth.slice(0,7) + '-' + String(maxDay.day).padStart(2,'0')}</div>` : ''}
      </div>
    </div>

      ${!isCustom && remainingLimitSpendableStats > 0 ? `
      <div class="card mb-16" style="border-left:4px solid var(--warning)">
        ⏳ 剩余 ${new Date(parseInt(statsMonth.split('-')[0]), parseInt(statsMonth.split('-')[1]), 0).getDate() - now.getDate()} 天，
        扣除储蓄后日均需控制在 ${formatMoney(remainingLimitSpendableStats)} 以内
      </div>
    ` : ''}

    <!-- Savings prediction card (stats) -->
    ${!isCustom ? `
      <div class="card mb-16">
        <div class="card-title">💵 当月储蓄预估</div>
        <div class="grid-4" style="margin-bottom:8px">
          <div>
            <div class="text-xs text-secondary">月收入</div>
            <div class="text-lg font-bold">${budget ? formatMoney(budget) : '未设置'}</div>
            ${totalBillsStats > 0 ? `<div class="text-xs text-muted" style="margin-top:2px">净收入 ${formatMoney(netDisposableStats)}</div>` : ''}
          </div>
          <div>
            <div class="text-xs text-secondary">当前已存</div>
            <div class="text-lg font-bold" style="color:${actualSavings > 0 ? 'var(--success)' : 'var(--danger)'}">${formatMoney(actualSavings)}</div>
          </div>
          <div>
            <div class="text-xs text-secondary">预计月末储蓄</div>
            <div class="text-lg font-bold" style="color:${savingsPred >= 0 ? 'var(--success)' : 'var(--danger)'}">${formatMoney(savingsPred)}</div>
          </div>
          <div>
            <div class="text-xs text-secondary">收支结余</div>
            <div class="text-lg font-bold" style="color:${(budget - effectiveTotalStats) >= 0 ? 'var(--success)' : 'var(--danger)'}">${formatMoney(budget - effectiveTotalStats)}</div>
          </div>
        </div>
        ${budget > 0 ? `
          ${(() => {
            const daysInMonth = new Date(now.getFullYear(), now.getMonth()+1, 0).getDate();
            const remainingDays = daysInMonth - now.getDate();
            const totalSpentAll = StatsEngine.getMonthTotal(statsMonth);
            const paidBills = StatsEngine.getBillSpendingActual(statsMonth);
            const plannedBillsAmt = DataStore.getBillTotal(statsMonth);
            const unpaidPlannedBills = Math.max(0, plannedBillsAmt - paidBills);
            const remainingTotal = budget - totalSpentAll - unpaidPlannedBills;
            const remainingTotalPerDay = remainingDays > 0 ? Math.max(0, remainingTotal / remainingDays) : 0;
            const varSpending = StatsEngine.getVariableSpending(statsMonth);
            const remainingDaily = spendableBudgetStats - varSpending;
            const remainingDailyPerDay = remainingDays > 0 ? Math.max(0, remainingDaily / remainingDays) : 0;
            return `
            <div style="display:flex;flex-wrap:wrap;gap:8px;margin-top:4px">
            <div style="flex:1;min-width:140px;padding:6px 10px;border-radius:8px;background:var(--card-bg);border:1px solid var(--border)">
              <div class="text-xs text-secondary">剩余总额/天</div>
              <div class="font-bold" style="font-size:1rem;color:${remainingTotalPerDay > 0 ? 'var(--warning)' : 'var(--text-muted)'}">${formatMoney(remainingTotalPerDay)}/天</div>
              <div class="text-xs text-muted" style="margin-top:2px">${formatMoney(remainingTotal)} ÷ ${remainingDays}天</div>
            </div>
            <div style="flex:1;min-width:140px;padding:6px 10px;border-radius:8px;background:var(--card-bg);border:1px solid var(--border)">
              <div class="text-xs text-secondary">日常可用/天（已扣账单+储蓄）</div>
              <div class="font-bold" style="font-size:1rem;color:${remainingDailyPerDay > 0 ? 'var(--primary)' : 'var(--text-muted)'}">${formatMoney(remainingDailyPerDay)}/天</div>
              <div class="text-xs text-muted" style="margin-top:2px">${formatMoney(remainingDaily)} ÷ ${remainingDays}天</div>
            </div>
          </div>`;
          })()}
        ` : ''}
        ${!budget ? '<div class="text-xs text-muted mt-4">💡 在「月账单中心」设定月收入后可查看储蓄预估</div>' : ''}
      </div>
    ` : ''}

    <!-- Calendar Heatmap + Pie Chart (side by side) -->
    <div class="grid-2 mb-16">
      ${!isCustom ? `
      <div class="card" id="heatmapCard">
        <div class="card-title" style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
          <span>📅 消费热力图</span>
          <button class="view-toggle-btn" onclick="expandHeatmap()" title="放大" style="font-size:0.7rem">⛶ 展开</button>
        </div>
        ${renderCalendarHeatmap(statsMonth)}
      </div>
      ` : ''}
      <div class="card" id="pieCard">
        <div class="card-title" style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
          <span>分类支出 (饼图)</span>
          <span class="pie-drill-bar" style="display:inline-flex;align-items:center;gap:6px;flex-wrap:wrap;font-size:0.82rem"></span>
          ${renderBillToggle('pieChart')}
          <button class="view-toggle-btn" onclick="expandPie()" title="放大" style="font-size:0.7rem">⛶ 展开</button>
        </div>
        <canvas id="pieChart" width="400" height="300" style="width:100%;height:250px"></canvas>
        <button class="btn btn-ghost btn-sm mt-8" onclick="downloadChart('pieChart')">📥 下载 PNG</button>
      </div>
    </div>
    <div class="card mb-16">
      <div class="card-title" style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
        <span>每日趋势 (折线图)</span>
      </div>
      <canvas id="lineChart" width="400" height="300" style="width:100%;height:250px"></canvas>
      <button class="btn btn-ghost btn-sm mt-8" onclick="downloadChart('lineChart')">📥 下载 PNG</button>
    </div>

    <div id="budgetProgressContainer">${renderBudgetProgressCard(statsMonth)}</div>

    <!-- Waffle Chart: Tag Distribution -->
    <div class="card mb-16" id="waffleCard">
      <div class="flex items-center justify-between" style="margin-bottom:10px">
        <div class="card-title" style="margin-bottom:0">🏷️ 标签分布</div>
        <div class="flex items-center gap-8">
          <!-- Include untagged toggle -->
          <label class="flex items-center gap-4" style="cursor:pointer;font-size:0.72rem;color:var(--text-secondary)" onclick="toggleWaffleUntagged()">
            <span id="waffleUntaggedCheck" style="width:16px;height:16px;border:2px solid var(--text-muted);border-radius:3px;display:inline-flex;align-items:center;justify-content:center;font-size:0.6rem">${waffleIncludeUntagged ? '✓' : ''}</span>
            含无标签
          </label>
          <!-- Month selector -->
          <select class="input-field" id="waffleMonthSelect" style="width:auto;font-size:0.7rem;padding:2px 6px" onchange="changeWaffleMonth(this.value)">
            <option value="">📅 跟随统计范围</option>
            ${function(){
              var opts = '';
              var now = new Date();
              for (var i = 0; i < 12; i++) {
                var d = new Date(now.getFullYear(), now.getMonth() - i, 1);
                var val = d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0');
                var label = d.getFullYear() + '年' + (d.getMonth()+1) + '月';
                opts += '<option value="' + val + '"' + (waffleSelectedMonth === val ? ' selected' : '') + '>' + label + '</option>';
              }
              return opts;
            }()}
          </select>
          <!-- Density selector -->
          <div class="flex gap-4" style="font-size:0.65rem">
            ${[1,2,3,4,5].map(d => 
              `<span style="padding:2px 6px;border-radius:4px;cursor:pointer;background:${waffleDensity === d ? 'var(--primary)' : 'var(--bg)'};color:${waffleDensity === d ? 'white' : 'var(--text-secondary)'}" 
                onclick="setWaffleDensity(${d})">${'█'.repeat(d)}</span>`
            ).join('')}
          </div>
        </div>
      </div>
      <canvas id="waffleChart" width="400" height="250" style="width:100%;height:220px;cursor:pointer"></canvas>
          <div style="text-align:right;margin-top:4px">
            <button class="btn btn-ghost btn-sm" onclick="exportWafflePNG()" style="font-size:0.65rem">📥 下载 PNG</button>
          </div>
      <div id="waffleLegend" style="margin-top:8px;display:flex;flex-wrap:wrap;gap:6px;font-size:0.72rem"></div>
    </div>

    <!-- Month-over-month comparison chart -->
    ${showMonthCompare && !isCustom ? `
    <div class="card mb-16">
      <div class="card-title" style="display:flex;align-items:center;gap:12px;flex-wrap:wrap">
        <span>📊 月度分类对比 — 本月 vs 上月</span>
        <span class="text-xs text-muted">🔵 本月 &nbsp;|&nbsp; 🟢 上月</span>
      </div>
      <canvas id="compareChart" width="600" height="280" style="width:100%;height:230px"></canvas>
      <button class="btn btn-ghost btn-sm mt-8" onclick="downloadChart('compareChart')">📥 下载 PNG</button>
    </div>
    ` : ''}

    <div class="card mb-16">
      <div class="card-title">月度支出趋势 (近6个月)</div>
      <canvas id="monthlyChart" width="600" height="250" style="width:100%;height:200px"></canvas>
      <button class="btn btn-ghost btn-sm mt-8" onclick="downloadChart('monthlyChart')">📥 下载 PNG</button>
    </div>

    <div class="card mb-16">
      <div class="card-title">月度储蓄趋势 (近6个月)</div>
      <canvas id="savingsChart" width="600" height="250" style="width:100%;height:200px"></canvas>
      <button class="btn btn-ghost btn-sm mt-8" onclick="downloadChart('savingsChart')">📥 下载 PNG</button>
    </div>
  `;

  // Draw charts
  setTimeout(() => {
    const sD = isCustom ? statsStartDate : null;
    const eD = isCustom ? statsEndDate : null;
    drawPieChart('pieChart', statsMonth, sD, eD);
    drawLineChart('lineChart', statsMonth, sD, eD);
    drawMonthlyChart('monthlyChart');
    drawSavingsChart('savingsChart');
    drawWaffleChart('waffleChart', records);
    syncPieDrillBar();
    // Update budget progress card
    const progContainer = document.getElementById('budgetProgressContainer');
    if (progContainer) progContainer.innerHTML = renderBudgetProgressCard(statsMonth);
    // Draw comparison bar chart if toggle is active
    if (showMonthCompare && !isCustom && statsMonth) {
      drawCompareBarChart('compareChart', statsMonth);
    }
  }, 50);
}
function changeStatsMonth(month) {
  statsMonth = month;
  window.statsMonth = month;
  statsStartDate = '';
  window.statsStartDate = '';
  statsEndDate = '';
  window.statsEndDate = '';
  statsDrillStack = [];
  window.statsDrillStack = [];
  renderStats();
}

function changeStatsCustom() {
  statsStartDate = document.getElementById('statsDateStart').value;
  window.statsStartDate = statsStartDate;
  statsEndDate = document.getElementById('statsDateEnd').value;
  window.statsEndDate = statsEndDate;
  if (statsStartDate && statsEndDate) {
    // Validate: if start > end, swap them
    if (statsStartDate > statsEndDate) {
      [statsStartDate, statsEndDate] = [statsEndDate, statsStartDate];
      window.statsStartDate = statsStartDate;
      window.statsEndDate = statsEndDate;
      document.getElementById('statsDateStart').value = statsStartDate;
      document.getElementById('statsDateEnd').value = statsEndDate;
      showToast('日期范围已自动修正', 'warning');
    }
    statsMonth = '';
    window.statsMonth = '';
    statsDrillStack = [];
    window.statsDrillStack = [];
    renderStats();
  }
}

function resetStatsDrill() {
  // Pop one level: go to parent
  if (statsDrillStack.length > 1) {
    statsDrillStack.pop(); // remove current, parent becomes active
  } else {
    statsDrillStack = []; // back to root
    window.statsDrillStack = [];
  }
  updateDrillCharts();
}
/* ============================================================
   CANVAS CHARTS
   ============================================================ */
function useCustomRange() {
  return statsStartDate && statsEndDate && !statsMonth;
}

function getStatsCatTotals() {
  if (useCustomRange()) {
    const range = StatsEngine.getCustomRangeTotals(statsStartDate, statsEndDate);
    return range.categoryTotals || {};
  }
  const isRollingStats = getStatsRange() === 'rolling30' && statsMonth === getMonthKey(new Date().toISOString());
  return isRollingStats ? StatsEngine.getPeriodCategoryTotals() : StatsEngine.getCategoryTotals(statsMonth);
}

function getStatsDailyTotals() {
  if (useCustomRange()) {
    const range = StatsEngine.getCustomRangeTotals(statsStartDate, statsEndDate);
    return range.daily.map(d => ({ day: d.day.slice(8,10), total: d.total }));
  }
  const isRollingStats = getStatsRange() === 'rolling30' && statsMonth === getMonthKey(new Date().toISOString());
  return isRollingStats ? StatsEngine.getPeriodDailyTotals({ excludeBills: false }) : StatsEngine.getDailyTotals(statsMonth);
}

function getChartData(month, startDate, endDate, options = {}) {
  const excludeBills = options.excludeBills || false;
  let catTotals;
  if (startDate && endDate) {
    const range = StatsEngine.getCustomRangeTotals(startDate, endDate);
    catTotals = range.categoryTotals || {};
  } else {
    const isRollingChart = getStatsRange() === 'rolling30' && month === getMonthKey(new Date().toISOString());
    catTotals = month
      ? (isRollingChart ? StatsEngine.getPeriodCategoryTotals() : StatsEngine.getCategoryTotals(month))
      : getStatsCatTotals();
  }

  // Filter out bill categories if excludeBills
  if (excludeBills) {
    const billCatIds = new Set((DataStore.getBillCategories() || []).map(c => c.id));
    Object.keys(catTotals).forEach(id => {
      if (billCatIds.has(id)) delete catTotals[id];
    });
  }

  // Aggregate to root categories
  const rootTotals = {};
  Object.entries(catTotals).forEach(([id, total]) => {
    const rootId = getRootAncestorId(id);
    if (rootId) {
      rootTotals[rootId] = (rootTotals[rootId] || 0) + total;
    }
  });
  return Object.entries(rootTotals)
    .map(([id, total]) => ({ id, total, cat: DataStore.getCategory(id) }))
    .filter(x => x.cat && x.total > 0)
    .sort((a,b) => b.total - a.total);
}

function getChartDataForRange(startDate, endDate) {
  return getChartData(null, startDate, endDate);
}

function getRawChartData(month, startDate, endDate, options = {}) {
  const excludeBills = options.excludeBills || false;
  let catTotals;
  if (startDate && endDate) {
    const range = StatsEngine.getCustomRangeTotals(startDate, endDate);
    catTotals = range.categoryTotals || {};
  } else {
    const isRollingChart = getStatsRange() === 'rolling30' && month === getMonthKey(new Date().toISOString());
    catTotals = month
      ? (isRollingChart ? StatsEngine.getPeriodCategoryTotals() : StatsEngine.getCategoryTotals(month))
      : getStatsCatTotals();
  }
  if (excludeBills) {
    const billCatIds = new Set((DataStore.getBillCategories() || []).map(c => c.id));
    Object.keys(catTotals).forEach(id => {
      if (billCatIds.has(id)) delete catTotals[id];
    });
  }
  return Object.entries(catTotals)
    .map(([id, total]) => ({ id, total, cat: DataStore.getCategory(id) }))
    .filter(x => x.cat)
    .sort((a,b) => b.total - a.total);
}
function drawPieChart(canvasId, month, startDate, endDate, onDrill, height, noAnim) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;
  console.log('[drawPieChart] canvasId:', canvasId, 'month:', month, 'noAnim:', noAnim);
  const tc = getThemeColors();

  // Remove old event listeners before redrawing (clean slate)
  const oldHandlers = canvas._pieHandlers;
  if (oldHandlers) {
    canvas.removeEventListener('mousemove', oldHandlers.mousemove);
    canvas.removeEventListener('mouseleave', oldHandlers.mouseleave);
    canvas.removeEventListener('click', oldHandlers.click);
    delete canvas._pieHandlers;
  }

  // --- Sizing: use CSS for display, only set internal resolution ---
  const rect = canvas.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  const w = rect.width || 400;
  const h = height || 250;
  // Only update internal resolution if size actually changed
  if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
  }
  // Do NOT set canvas.style.width/height — CSS width:100% handles display sizing

  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  let data;
  const drillCategory = getDrillCategory();
  if (drillCategory) {
    const breakdown = StatsEngine.getCategoryBreakdownDeep(month, drillCategory);
    if (breakdown) {
      const childrenData = (breakdown.children || []).map(c => ({ id: c.category.id, total: c.total, cat: c.category }));
      const childrenTotal = childrenData.reduce((s, d) => s + d.total, 0);
      const directTotal = breakdown.total - childrenTotal;
      data = [...childrenData];
      if (directTotal > 0.001) {
        data.push({
          id: breakdown.category.id + '-direct',
          total: directTotal,
          cat: { name: breakdown.category.name + ' (直接)', icon: '📌', color: breakdown.category.color }
        });
      }
      if (data.length === 0) {
        data = [{ id: breakdown.category.id, total: breakdown.total, cat: breakdown.category }];
      }
      data = data.filter(d => d.total > 0);
      data.forEach((d, i) => { d.displayColor = COLORS[i % COLORS.length]; });
    } else {
      data = [];
    }
  } else {
    // For expanded charts, use the same toggle as the original chart
    const toggleId = canvasId === 'expandPieChart' ? 'pieChart' : canvasId;
    const excludeBills = !isBillToggleChecked(toggleId);
    data = getChartData(month, startDate, endDate, { excludeBills });
    data.forEach((d, i) => { d.displayColor = COLORS[i % COLORS.length]; });
  }

  if (!data.length) {
    ctx.fillStyle = tc.textMuted;
    ctx.font = '14px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('暂无数据', w/2, h/2);
    return;
  }

  // --- Geometry ---
  const cx = w * 0.35, cy = h / 2, r = Math.min(w * 0.25, h * 0.38);
  const total = data.reduce((s, d) => s + d.total, 0);

  // Pre-calculate slices
  const slices = [];
  let angleStart = -Math.PI / 2;
  data.forEach(d => {
    const sliceAngle = (d.total / total) * Math.PI * 2;
    slices.push({ ...d, angleStart, sliceAngle });
    angleStart += sliceAngle;
  });

  // --- Hover state (persistent across redraws) ---
  if (canvas._hoverIndex === undefined) canvas._hoverIndex = -1;

  // --- Draw function (no animation, for hover/click redraws) ---
  function drawPieStatic(hoverIdx) {
    if (!ctx || !canvas) return;
    ctx.clearRect(0, 0, w, h);

    // Draw slices with optional hover offset
    slices.forEach((slice, i) => {
      const midAngle = slice.angleStart + slice.sliceAngle / 2;
      const isHover = (i === hoverIdx);
      const offset = isHover ? 8 : 0;
      const offsetX = Math.cos(midAngle) * offset;
      const offsetY = Math.sin(midAngle) * offset;

      ctx.beginPath();
      ctx.moveTo(cx + offsetX, cy + offsetY);
      ctx.arc(cx + offsetX, cy + offsetY, r, slice.angleStart, slice.angleStart + slice.sliceAngle);
      ctx.closePath();
      const color = slice.displayColor || slice.cat.color;
      ctx.fillStyle = isHover ? darkenColor(color, 18) : color;
      ctx.fill();

      if (isHover) {
        // Pop-out shadow
        ctx.save();
        ctx.shadowColor = 'rgba(0,0,0,0.2)';
        ctx.shadowBlur = 12;
        ctx.shadowOffsetX = 3;
        ctx.shadowOffsetY = 3;
        ctx.fillStyle = darkenColor(color, 18);
        ctx.beginPath();
        ctx.moveTo(cx + offsetX, cy + offsetY);
        ctx.arc(cx + offsetX, cy + offsetY, r, slice.angleStart, slice.angleStart + slice.sliceAngle);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
        // White highlight border
        ctx.strokeStyle = (document.documentElement.getAttribute('data-theme') === 'dark') ? 'rgba(255,255,255,0.6)' : 'rgba(255,255,255,0.4)';
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.moveTo(cx + offsetX, cy + offsetY);
        ctx.arc(cx + offsetX, cy + offsetY, r, slice.angleStart, slice.angleStart + slice.sliceAngle);
        ctx.closePath();
        ctx.stroke();
      }
    });

    // --- Labels (pie slice labels in chart area, with background for readability) ---
    const labelMargin = 4;
    // First pass: compute all label positions for overlap detection
    const labelPositions = slices.map(slice => {
      const midAngle = slice.angleStart + slice.sliceAngle / 2;
      const labelR = r * 1.55;
      let lx = cx + Math.cos(midAngle) * labelR;
      let ly = cy + Math.sin(midAngle) * labelR;
      ctx.font = '11px sans-serif';
      const labelText = slice.cat.name + ' ' + (slice.total / total * 100).toFixed(1) + '%';
      const textWidth = ctx.measureText(labelText).width;
      const textHeight = 14;
      const align = midAngle > Math.PI / 2 && midAngle < Math.PI * 1.5 ? 'right' : 'left';
      if (align === 'right') {
        lx = Math.max(textWidth + labelMargin, Math.min(w - labelMargin, lx));
      } else {
        lx = Math.max(labelMargin, Math.min(w - textWidth - labelMargin, lx));
      }
      ly = Math.max(textHeight, Math.min(h - labelMargin, ly));
      return { slice, lx, ly, labelText, textWidth, textHeight, align, midAngle };
    });
    // Second pass: resolve vertical overlap between adjacent labels (same side only)
    for (let pass = 0; pass < 3; pass++) {
      for (let i = 0; i < labelPositions.length; i++) {
        for (let j = i + 1; j < labelPositions.length; j++) {
          const a = labelPositions[i], b = labelPositions[j];
          if (a.align !== b.align) continue; // different sides won't collide
          const minGap = 2;
          const overlap = Math.max(0, minGap - (b.ly - a.ly));
          if (overlap > 0) {
            const shift = overlap / 2;
            a.ly -= shift;
            b.ly += shift;
            // Clamp again
            a.ly = Math.max(a.textHeight, Math.min(h - labelMargin, a.ly));
            b.ly = Math.max(b.textHeight, Math.min(h - labelMargin, b.ly));
          }
        }
      }
    }
    // Third pass: draw labels
    labelPositions.forEach(({ slice, lx, ly, labelText, textWidth, textHeight, align }) => {
      ctx.textAlign = align;
      const textX = align === 'right' ? lx - textWidth : lx;
      // Semi-transparent background for readability (dark mode → dark bg)
      const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
      ctx.fillStyle = isDark ? 'rgba(15,23,42,0.82)' : 'rgba(255,255,255,0.75)';
      ctx.fillRect(textX - 2, ly - textHeight + 2, textWidth + 4, textHeight + 2);
      // Draw text
      const hasChildren = DataStore.getChildren(slice.id).length > 0;
      if (hasChildren) {
        ctx.fillStyle = tc.text;
        ctx.fillText(labelText, lx, ly);
        ctx.strokeStyle = tc.textSecondary;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(textX, ly + 2);
        ctx.lineTo(textX + textWidth, ly + 2);
        ctx.stroke();
      } else {
        ctx.fillStyle = tc.text;
        ctx.fillText(labelText, lx, ly);
      }
    });

    // --- Legend (right side, also clickable) ---
    const legendRects = [];
    let legendY = h * 0.08;
    const budgetMonth = (typeof month === 'string' && month) || null;
    slices.forEach((slice, i) => {
      const color = slice.displayColor || slice.cat.color;
      const colorBoxX = w * 0.7;
      const textX = w * 0.7 + 16;
      ctx.fillStyle = color;
      ctx.fillRect(colorBoxX, legendY, 10, 10);
      ctx.fillStyle = tc.text;
      ctx.font = '11px sans-serif';
      ctx.textAlign = 'left';
      const label = slice.cat.name + ' ' + formatMoney(slice.total);
      const textWidth = ctx.measureText(label).width;
      ctx.fillText(label, textX, legendY + 10);
      // Store legend item bounding box (for click/hover)
      const itemH = 18;
      legendRects.push({
        sliceIndex: i,
        x: colorBoxX,
        y: legendY,
        w: textX + textWidth - colorBoxX,
        h: itemH
      });
      legendY += 20;
    });
    // Store legend rects on canvas for interaction handlers
    canvas._legendRects = legendRects;
  }

  // --- Helper: find which slice (or legend item) is under the mouse ---
  function hitTestSlice(mx, my) {
    // Check pie slices first (angle-based)
    const dx = mx - cx, dy = my - cy;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist <= r) {
      let angle = Math.atan2(dy, dx);
      if (angle < -Math.PI / 2) angle += Math.PI * 2;
      let a = -Math.PI / 2;
      for (let i = 0; i < slices.length; i++) {
        if (angle >= a && angle < a + slices[i].sliceAngle) {
          return { type: 'slice', index: i };
        }
        a += slices[i].sliceAngle;
      }
    }
    // Check legend items
    const rects = canvas._legendRects || [];
    for (const rItem of rects) {
      if (mx >= rItem.x && mx <= rItem.x + rItem.w &&
          my >= rItem.y && my <= rItem.y + rItem.h) {
        return { type: 'legend', index: rItem.sliceIndex };
      }
    }
    return null;
  }

  // --- Hover & click interactions ---
  function setupInteractions() {
    console.log('[setupInteractions] binding events to canvas:', canvasId || canvas?.id);
    // Remove old listeners to prevent duplicates if setupInteractions is called again
    const handlers = canvas._pieHandlers;
    if (handlers) {
      canvas.removeEventListener('mousemove', handlers.mousemove);
      canvas.removeEventListener('mouseleave', handlers.mouseleave);
      canvas.removeEventListener('click', handlers.click);
    }

    let _throttleTimer = null;
    const onMouseMove = (e) => {
      if (!canvas || !canvas.getBoundingClientRect) return;
      if (_throttleTimer) return;
      _throttleTimer = setTimeout(() => { _throttleTimer = null; }, 16); // ~60fps throttle
      const br = canvas.getBoundingClientRect();
      const mx = (e.clientX - br.left);
      const my = (e.clientY - br.top);
      const hit = hitTestSlice(mx, my);
      const targetIdx = hit ? hit.index : -1;
      // Only highlight slices that have children (subcategories)
      let effectiveIdx = -1;
      if (targetIdx >= 0) {
        const d = slices[targetIdx];
        if (d) {
          const children = DataStore.getChildren(d.id);
          if (children && children.length > 0) {
            effectiveIdx = targetIdx;
          }
        }
      }
      if (canvas._hoverIndex !== effectiveIdx) {
        canvas._hoverIndex = effectiveIdx;
        canvas.style.cursor = effectiveIdx >= 0 ? 'pointer' : 'default';
        drawPieStatic(effectiveIdx);
      }
    };

    const onMouseLeave = () => {
      if (!canvas) return;
      if (canvas._hoverIndex !== -1) {
        canvas._hoverIndex = -1;
        canvas.style.cursor = 'default';
        drawPieStatic(-1);
      }
    };

    const onClick = (e) => {
      if (!canvas || !canvas.getBoundingClientRect) return;
      const br = canvas.getBoundingClientRect();
      const mx = (e.clientX - br.left);
      const my = (e.clientY - br.top);
      const hit = hitTestSlice(mx, my);
      console.log('[pieClick] hit:', hit ? 'slice-' + hit.index : 'none');
      if (!hit) return;
      const d = slices[hit.index];
      if (!d) return;
      const children = DataStore.getChildren(d.id);
      if (children && children.length > 0) {
        const curDrill = getDrillCategory();
        if (curDrill !== d.id) {
          statsDrillStack.push(d.id);
        }
        if (canvasId === 'expandPieChart') {
          // In expanded mode: update expanded pie + table, don't close
          drawPieChart('expandPieChart', statsMonth, null, null, null, 360, false);
          if (typeof renderExpandPieTable === 'function') renderExpandPieTable();
        } else {
          updateDrillCharts();
          if (onDrill) onDrill();
        }
      } else if (onDrill) {
        // Leaf or single category in expand mode — just close overlay
        if (canvasId !== 'expandPieChart') {
          onDrill();
        }
      }
    };

    canvas.addEventListener('mousemove', onMouseMove);
    canvas.addEventListener('mouseleave', onMouseLeave);
    canvas.addEventListener('click', onClick);

    // Store references so we can remove them later
    canvas._pieHandlers = { mousemove: onMouseMove, mouseleave: onMouseLeave, click: onClick };
  }

  // --- Animated initial draw ---
  const duration = 600;
  const startTime = performance.now();

  function animatePie(currentTime) {
    if (!ctx || !canvas) return;
    const elapsed = currentTime - startTime;
    const progress = Math.min(elapsed / duration, 1);
    // Dramatic elastic ease-out with noticeable bounce
    const eased = progress === 1 ? 1 : 1 - Math.pow(2, -7 * progress) * Math.cos(progress * Math.PI * 2 * 1.2);
    // Radius grows from 30% to 100% for a "pop-in" effect
    const scaleR = r * (0.3 + 0.7 * Math.min(eased, 1));

    ctx.clearRect(0, 0, w, h);

    slices.forEach(slice => {
      const endAngle = slice.angleStart + slice.sliceAngle * eased;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.arc(cx, cy, scaleR, slice.angleStart, endAngle);
      ctx.closePath();
      ctx.fillStyle = slice.displayColor || slice.cat.color;
      ctx.fill();
    });

    if (progress >= 1) {
      drawPieStatic(canvas._hoverIndex);
      // Only set up interactions after animation completes
      setupInteractions();
    }

    if (progress < 1) {
      requestAnimationFrame(animatePie);
    }
  }

  if (noAnim) {
    // Skip animation for expanded view — draw static immediately and set up interactions
    drawPieStatic(canvas._hoverIndex);
    setupInteractions();
  } else {
    requestAnimationFrame(animatePie);
  }
}
// Helper: lighten a hex color by a percentage
function lightenColor(hex, pct) {
  const num = parseInt(hex.replace('#', ''), 16);
  const r = Math.min(255, (num >> 16) + Math.round(2.55 * pct));
  const g = Math.min(255, ((num >> 8) & 0x00FF) + Math.round(2.55 * pct));
  const b = Math.min(255, (num & 0x0000FF) + Math.round(2.55 * pct));
  return '#' + (r << 16 | g << 8 | b).toString(16).padStart(6, '0');
}

function darkenColor(hex, pct) {
  const num = parseInt(hex.replace('#', ''), 16);
  const r = Math.max(0, (num >> 16) - Math.round(2.55 * pct));
  const g = Math.max(0, ((num >> 8) & 0x00FF) - Math.round(2.55 * pct));
  const b = Math.max(0, (num & 0x0000FF) - Math.round(2.55 * pct));
  return '#' + (r << 16 | g << 8 | b).toString(16).padStart(6, '0');
}
function drawLineChart(canvasId, month, startDate, endDate) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;
  const tc = getThemeColors();
  const rect = canvas.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  const w = rect.width || 400;
  const h = 250;
  if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
  }

  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  const excludeBills = true;
  const isRollingLine = getStatsRange() === 'rolling30' && month === getMonthKey(new Date().toISOString()) && !startDate && !endDate;
  const dailyData = month
    ? (isRollingLine ? StatsEngine.getPeriodDailyTotals({ excludeBills }) : StatsEngine.getDailyTotals(month, { excludeBills }))
    : (startDate && endDate ? getStatsDailyTotals() : getStatsDailyTotals());
  if (!dailyData.length || dailyData.every(d => d.total === 0)) {
    ctx.fillStyle = tc.textMuted;
    ctx.font = '14px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('暂无数据', w/2, h/2);
    return;
  }

  const padding = { top: 20, bottom: 30, left: 50, right: 20 };
  const plotW = w - padding.left - padding.right;
  const plotH = h - padding.top - padding.bottom;
  const maxVal = Math.max(...dailyData.map(d => d.total), 0.01);
  // Compute daily spendable target (budget minus savings target, divided by days)
  let dailyTarget = 0;
  if (month) {
    dailyTarget = getDailySavingsTarget(month);
  }

  // Pre-calculate points
  const points = dailyData.map((d, i) => ({
    x: padding.left + (i / (dailyData.length - 1)) * plotW,
    y: padding.top + plotH - (d.total / maxVal) * plotH,
    total: d.total
  }));

  function drawBackground() {
    // Grid lines
    ctx.strokeStyle = tc.border;
    ctx.lineWidth = 1;
    for (let i = 0; i <= 4; i++) {
      const y = padding.top + (plotH / 4) * i;
      ctx.beginPath();
      ctx.moveTo(padding.left, y);
      ctx.lineTo(w - padding.right, y);
      ctx.stroke();
      ctx.fillStyle = tc.textMuted;
      ctx.font = '10px sans-serif';
      ctx.textAlign = 'right';
      ctx.fillText(formatMoney(maxVal * (1 - i/4)), padding.left - 5, y + 3);
    }

    // Savings target dashed line
    if (dailyTarget > 0 && maxVal > 0) {
      const targetY = padding.top + plotH - (Math.min(dailyTarget, maxVal) / maxVal) * plotH;
      ctx.save();
      ctx.setLineDash([6, 4]);
      ctx.strokeStyle = '#10B981';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(padding.left, targetY);
      ctx.lineTo(w - padding.right, targetY);
      ctx.stroke();
      ctx.setLineDash([]);
      // Label
      ctx.fillStyle = '#10B981';
      ctx.font = '11px sans-serif';
      ctx.textAlign = 'right';
      ctx.fillText('日均可支配 ' + formatMoney(dailyTarget), w - padding.right - 5, targetY - 6);
      ctx.restore();
    }

    // X labels
    const step = Math.max(1, Math.floor(dailyData.length / 10));
    dailyData.forEach((d, i) => {
      if (i % step === 0 || i === dailyData.length - 1) {
        const x = padding.left + (i / (dailyData.length - 1)) * plotW;
        ctx.fillStyle = tc.textMuted;
        ctx.font = '10px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(d.day, x, h - 5);
      }
    });
  }

  function drawLineAndFill(progress) {
    // Clip to horizontal progress
    const clipX = padding.left + plotW * progress;
    ctx.save();
    ctx.beginPath();
    ctx.rect(padding.left, 0, Math.max(0, clipX - padding.left), h);
    ctx.clip();

    // Draw line
    ctx.beginPath();
    points.forEach((p, i) => {
      if (i === 0) ctx.moveTo(p.x, p.y);
      else {
        const prev = points[i-1];
        const cpx = (prev.x + p.x) / 2;
        ctx.bezierCurveTo(cpx, prev.y, cpx, p.y, p.x, p.y);
      }
    });
    ctx.strokeStyle = '#6366F1';
    ctx.lineWidth = 2.5;
    ctx.lineJoin = 'round';
    ctx.stroke();

    // Fill area
    const last = points[points.length-1];
    ctx.lineTo(last.x, padding.top + plotH);
    ctx.lineTo(points[0].x, padding.top + plotH);
    ctx.closePath();
    const grad = ctx.createLinearGradient(0, padding.top, 0, padding.top + plotH);
    grad.addColorStop(0, 'rgba(99,102,241,0.15)');
    grad.addColorStop(1, 'rgba(99,102,241,0)');
    ctx.fillStyle = grad;
    ctx.fill();

    // Dots (only visible points)
    points.forEach((p, i) => {
      const pProgress = i / (points.length - 1);
      if (pProgress > progress) return;
      ctx.beginPath();
      ctx.arc(p.x, p.y, 3.5, 0, Math.PI * 2);
      ctx.fillStyle = '#6366F1';
      ctx.fill();
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 1.5;
      ctx.stroke();
    });

    ctx.restore();
  }

  // Animate
  const duration = 800;
  const startTime = performance.now();

  function animateLine(currentTime) {
    const elapsed = currentTime - startTime;
    const progress = Math.min(elapsed / duration, 1);
    const eased = 1 - Math.pow(1 - progress, 3); // ease-out cubic

    ctx.clearRect(0, 0, w, h);
    drawBackground();
    drawLineAndFill(eased);

    if (progress < 1) {
      requestAnimationFrame(animateLine);
    }
  }

  requestAnimationFrame(animateLine);
}
function drawBarChart(canvasId, month, startDate, endDate) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;
  const tc = getThemeColors();
  const rect = canvas.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  const w = rect.width || 600;
  const h = 250;
  if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
  }
  // CSS width:100% handles display sizing

  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  const data = getChartData(month, startDate, endDate);
  if (!data.length) {
    ctx.fillStyle = tc.textMuted;
    ctx.font = '14px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('暂无数据', w/2, h/2);
    return;
  }

  const padding = { top: 20, bottom: 65, left: 60, right: 20 };
  const plotW = w - padding.left - padding.right;
  const plotH = h - padding.top - padding.bottom;
  const maxVal = Math.max(...data.map(d => d.total), 0.01);
  const barW = Math.min(40, plotW / data.length * 0.6);
  const gap = plotW / data.length;
  const budgetMonth = (typeof month === 'string' && month) || getBudgetMonth();

  // Grid
  ctx.strokeStyle = tc.border;
  ctx.lineWidth = 1;
  for (let i = 0; i <= 4; i++) {
    const y = padding.top + (plotH / 4) * i;
    ctx.beginPath();
    ctx.moveTo(padding.left, y);
    ctx.lineTo(w - padding.right, y);
    ctx.stroke();
    ctx.fillStyle = tc.textMuted;
    ctx.font = '10px sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText(formatMoney(maxVal * (1 - i/4)), padding.left - 5, y + 3);
  }

  // Bars
  data.forEach((d, i) => {
    const barH = (d.total / maxVal) * plotH;
    const x = padding.left + i * gap + (gap - barW) / 2;
    const y = padding.top + plotH - barH;

    ctx.fillStyle = d.cat.color;
    ctx.beginPath();
    ctx.roundRect(x, y, barW, barH, [4, 4, 0, 0]);
    ctx.fill();

    // Label
    ctx.fillStyle = tc.text;
    ctx.font = '10px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(d.cat.name.length > 4 ? d.cat.name.slice(0,4)+'..' : d.cat.name, x + barW/2, h - 22);
    ctx.fillStyle = tc.textSecondary;
    ctx.fillText(formatMoney(d.total), x + barW/2, y - 5);

    // Budget progress bar under label
    if (d.id) {
      const catBudgetObj = DataStore.getCategoryBudget(d.id, budgetMonth);
      const catBudget = catBudgetObj.value;
      if (catBudget > 0) {
        const ratio = d.total / catBudget;
        const progW = Math.min(barW, 60);
        const progX = x + (barW - progW) / 2;
        const progY = h - 14;
        // Background
        ctx.fillStyle = tc.border;
        ctx.fillRect(progX, progY, progW, 4);
        // Fill
        const fillW = Math.min(progW, progW * ratio);
        let barColor;
        if (ratio < 0.8) barColor = '#10B981';
        else if (ratio <= 1.0) barColor = '#F59E0B';
        else barColor = '#EF4444';
        ctx.fillStyle = barColor;
        ctx.fillRect(progX, progY, fillW, 4);
      }
    }
  });

  // Click to drill down
  canvas.onclick = (e) => {
    const rect2 = canvas.getBoundingClientRect();
    const currW = rect2.width;
    const currPlotW = currW - padding.left - padding.right;
    const mx = (e.clientX - rect2.left);
    const idx = Math.floor((mx - padding.left) / (currPlotW / data.length));
    if (idx >= 0 && idx < data.length) {
      const clicked = data[idx];
      const children = DataStore.getChildren(clicked.id);
      if (children && children.length > 0) {
        statsDrillStack.push(clicked.id);
        updateDrillCharts();
      }
      // Leaf: do nothing
    }
  };
}
function drawMonthlyChart(canvasId) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;
  const tc = getThemeColors();
  const rect = canvas.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  const w = rect.width || 600;
  const h = 200;
  if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
  }

  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  const data = StatsEngine.getMonthlyTotals(6);
  if (!data.length || data.every(d => d.total === 0)) {
    ctx.fillStyle = tc.textMuted;
    ctx.font = '14px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('暂无月度数据', w/2, h/2);
    return;
  }

  const padding = { top: 20, bottom: 35, left: 55, right: 15 };
  const plotW = w - padding.left - padding.right;
  const plotH = h - padding.top - padding.bottom;
  const maxVal = Math.max(...data.map(d => d.total), 0.01);

  // Grid
  ctx.strokeStyle = tc.border;
  ctx.lineWidth = 1;
  for (let i = 0; i <= 3; i++) {
    const y = padding.top + (plotH / 3) * i;
    ctx.beginPath();
    ctx.moveTo(padding.left, y);
    ctx.lineTo(w - padding.right, y);
    ctx.stroke();
    ctx.fillStyle = tc.textMuted;
    ctx.font = '9px sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText(formatMoney(maxVal * (1 - i/3)), padding.left - 5, y + 3);
  }

  // Points
  const points = data.map((d, i) => ({
    x: padding.left + (i / (data.length - 1)) * plotW,
    y: padding.top + plotH - (d.total / maxVal) * plotH,
    total: d.total,
    label: d.month.slice(5, 7) + '月'
  }));

  // Fill area
  ctx.beginPath();
  points.forEach((p, i) => i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y));
  const lastP = points[points.length - 1];
  ctx.lineTo(lastP.x, padding.top + plotH);
  ctx.lineTo(points[0].x, padding.top + plotH);
  ctx.closePath();
  const grad = ctx.createLinearGradient(0, padding.top, 0, padding.top + plotH);
  grad.addColorStop(0, 'rgba(99,102,241,0.15)');
  grad.addColorStop(1, 'rgba(99,102,241,0)');
  ctx.fillStyle = grad;
  ctx.fill();

  // Line
  ctx.beginPath();
  points.forEach((p, i) => i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y));
  ctx.strokeStyle = '#6366F1';
  ctx.lineWidth = 2.5;
  ctx.lineJoin = 'round';
  ctx.stroke();

  // Dots + labels
  points.forEach((p, i) => {
    ctx.beginPath();
    ctx.arc(p.x, p.y, 4, 0, Math.PI * 2);
    ctx.fillStyle = '#6366F1';
    ctx.fill();
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 2;
    ctx.stroke();

    // X label
    ctx.fillStyle = tc.text;
    ctx.font = '10px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(p.label, p.x, h - 8);

    // Value above dot
    ctx.fillStyle = tc.textSecondary;
    ctx.font = 'bold 10px sans-serif';
    ctx.fillText(formatMoney(p.total), p.x, p.y - 10);
  });
}
function drawSavingsChart(canvasId) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;
  const tc = getThemeColors();
  const rect = canvas.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  const w = rect.width || 600;
  const h = 200;
  if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
  }

  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  const months = StatsEngine.getMonthlyTotals(6);
  if (!months.length) {
    ctx.fillStyle = tc.textMuted;
    ctx.font = '14px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('暂无数据', w/2, h/2);
    return;
  }

  // Compute savings for each month (budget - spending)
  const savings = months.map(m => {
    const b = DataStore.getBudget(m.month);
    return { ...m, savings: b ? b - m.total : 0 };
  });

  const maxVal = Math.max(...savings.map(s => Math.max(s.savings, 0)), 0.01);
  const minVal = Math.min(...savings.map(s => s.savings), 0);

  const padding = { top: 25, bottom: 35, left: 55, right: 20 };
  const plotW = w - padding.left - padding.right;
  const plotH = h - padding.top - padding.bottom;

  // Zero line
  const zeroY = padding.top + plotH - (0 - minVal) / (maxVal - minVal) * plotH;

  // Grid
  ctx.strokeStyle = tc.border;
  ctx.lineWidth = 1;
  for (let i = 0; i <= 3; i++) {
    const y = padding.top + (plotH / 3) * i;
    ctx.beginPath();
    ctx.moveTo(padding.left, y);
    ctx.lineTo(w - padding.right, y);
    ctx.stroke();
    ctx.fillStyle = tc.textMuted;
    ctx.font = '9px sans-serif';
    ctx.textAlign = 'right';
    const val = maxVal - (maxVal - minVal) * i / 3;
    ctx.fillText(formatMoney(val), padding.left - 5, y + 3);
  }

  // Draw bars
  const barW = Math.min(36, plotW / savings.length * 0.55);
  const gap = plotW / savings.length;

  savings.forEach((s, i) => {
    const x = padding.left + i * gap + (gap - barW) / 2;
    const barH = Math.abs(s.savings) / (maxVal - minVal) * plotH;
    const isPositive = s.savings >= 0;
    const color = isPositive ? '#10B981' : '#EF4444';
    const y = isPositive ? zeroY - barH : zeroY;

    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.roundRect(x, y, barW, Math.max(barH, 2), [4, 4, 0, 0]);
    ctx.fill();

    // Month label
    ctx.fillStyle = tc.text;
    ctx.font = '10px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(s.month.slice(5, 7) + '月', x + barW/2, h - 8);

    // Value label
    ctx.fillStyle = isPositive ? '#10B981' : '#EF4444';
    ctx.font = 'bold 9px sans-serif';
    const labelY = isPositive ? y - 5 : y + barH + 14;
    ctx.fillText(formatMoney(s.savings), x + barW/2, labelY);
  });

  // Zero line
  ctx.strokeStyle = tc.textMuted;
  ctx.lineWidth = 1;
  ctx.setLineDash([4, 4]);
  ctx.beginPath();
  ctx.moveTo(padding.left, zeroY);
  ctx.lineTo(w - padding.right, zeroY);
  ctx.stroke();
  ctx.setLineDash([]);
}
function downloadChart(canvasId) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;
  const link = document.createElement('a');
  link.download = canvasId + '.png';
  link.href = canvas.toDataURL('image/png');
  link.click();
}

/* ============================================================
   WAFFLE CHART — Tag Distribution Visualization
   ============================================================ */
function drawWaffleChart(canvasId, records) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;
  const ctx = canvas.getContext('2d');

  // 1. Get dimensions
  const rect = canvas.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  const w = rect.width;
  const h = 220;
  canvas.width = Math.round(w * dpr);
  canvas.height = Math.round(h * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  // 2. If independent month selected, filter records
  var filteredRecords = records;
  if (waffleSelectedMonth) {
    filteredRecords = records.filter(function(r) {
      return getMonthKey(r.date || r.createdAt) === waffleSelectedMonth && !r._deleted;
    });
  }

  // 3. Aggregate tags
  const tagTotals = {};
  let untaggedTotal = 0;

  filteredRecords.forEach(function(r) {
    if (r.tags && r.tags.length > 0) {
      r.tags.forEach(function(t) {
        tagTotals[t] = (tagTotals[t] || 0) + r.amount;
      });
    } else {
      untaggedTotal += r.amount;
    }
  });

  var tagKeys = Object.keys(tagTotals);
  var customColors = DataStore.getAllTagColors();
  var tagData = tagKeys.map(function(name, idx) {
    return { name: name, amount: tagTotals[name], color: customColors[name] || COLORS[idx % COLORS.length] };
  });
  tagData.sort(function(a, b) { return b.amount - a.amount; });

  if (waffleIncludeUntagged && untaggedTotal > 0) {
    tagData.push({ name: '未标签', amount: untaggedTotal, color: '#999' });
  }

  var totalAmount = tagData.reduce(function(s, d) { return s + d.amount; }, 0);
  if (totalAmount === 0) {
    ctx.fillStyle = 'var(--text-muted)';
    ctx.textAlign = 'center';
    ctx.fillText('暂无标签数据', w / 2, h / 2);
    return;
  }

  // 4. Calculate grid
  var densityMap = { 1: 600, 2: 300, 3: 150, 4: 60, 5: 24 };
  var totalCells = densityMap[waffleDensity] || 200;
  var aspectRatio = w / h;
  var cols = Math.round(Math.sqrt(totalCells * aspectRatio));
  var rows = Math.round(totalCells / cols);
  while (rows * cols < totalCells) cols++;
  var actualCells = rows * cols;

  // 第一遍：估算 cellSize（不含 gap）
  var cellSize = Math.min(w / cols, (h - 30) / rows);
  // 根据估算值计算 gap
  var gap = Math.max(1, Math.min(3, Math.round(cellSize * 0.1)));
  // 第二遍：用 gap 重新计算 cellSize，确保不出界
  cellSize = Math.min(
    (w - (cols - 1) * gap) / cols,
    (h - 30 - (rows - 1) * gap) / rows
  );
  // 安全下限
  cellSize = Math.max(4, Math.floor(cellSize * 10) / 10);
  gap = Math.max(1, Math.min(3, Math.round(cellSize * 0.1)));
  var gridW = cols * cellSize + (cols - 1) * gap;
  var gridH = rows * cellSize + (rows - 1) * gap;
  var offsetX = Math.max(0, (w - gridW) / 2);
  var offsetY = Math.max(0, (h - gridH) / 2);

  // 5. Assign cells to tags
  var cellValue = totalAmount / actualCells;
  var cells = [];
  var remainingCells = actualCells;

  tagData.forEach(function(tag, idx) {
    var tagCells = Math.round(tag.amount / cellValue);
    var assigned = Math.min(tagCells, remainingCells);
    for (var i = 0; i < assigned; i++) {
      cells.push({ tagIndex: idx, color: tag.color });
    }
    remainingCells -= assigned;
  });

  while (cells.length < actualCells) {
    cells.push({ tagIndex: 0, color: tagData[0].color });
  }

  // Order cells by tag grouping
  var orderedCells = [];
  tagData.forEach(function(tag, idx) {
    var count = cells.filter(function(c) { return c.tagIndex === idx; }).length;
    for (var i = 0; i < count; i++) {
      orderedCells.push({ tagIndex: idx, color: tag.color });
    }
  });
  cells = orderedCells;

  // Store for hover
  waffleCells = cells;
  waffleTagData = tagData;

  // 6. Animate
  animateWaffle(ctx, cells, cellSize, gap, offsetX, offsetY, cols, rows, tagData, totalAmount);
}

function drawCell(ctx, x, y, size, color, scale) {
  var s = size * (scale || 1);
  var offset = (size - s) / 2;
  var r = 2;
  ctx.beginPath();
  ctx.roundRect(x + offset, y + offset, s, s, r);
  ctx.fillStyle = color;
  ctx.fill();
}

function animateWaffle(ctx, cells, cellSize, gap, offsetX, offsetY, cols, rows, tagData, totalAmount) {
  var batchSize = Math.max(10, Math.ceil(cells.length / 30));
  var staggerMs = 20;
  var popDuration = 400;
  var totalBatches = Math.ceil(cells.length / batchSize);
  var startTime = performance.now();

  var positions = cells.map(function(cell, i) {
    return {
      col: Math.floor(i / rows),
      row: i % rows,
      tagIndex: cell.tagIndex,
      color: cell.color
    };
  });

  function drawFrame(currentTime) {
    var elapsed = currentTime - startTime;
    ctx.clearRect(0, 0, ctx.canvas.width / (window.devicePixelRatio || 1), 220);

    var allDone = true;
    positions.forEach(function(pos, i) {
      var batchIdx = Math.floor(i / batchSize);
      var batchStart = batchIdx * staggerMs;
      var localTime = elapsed - batchStart;

      var scale;
      if (localTime >= popDuration) {
        scale = 1;
      } else if (localTime > 0) {
        var t = localTime / popDuration;
        scale = t === 1 ? 1 : 1 - Math.pow(2, -7 * t) * Math.cos(t * Math.PI * 2 * 1.2);
        allDone = false;
      } else {
        allDone = false;
        var x = offsetX + pos.col * (cellSize + gap);
        var y = offsetY + pos.row * (cellSize + gap);
        ctx.strokeStyle = 'rgba(128,128,128,0.2)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.roundRect(x, y, cellSize, cellSize, 2);
        ctx.stroke();
        return;
      }

      var x = offsetX + pos.col * (cellSize + gap);
      var y = offsetY + pos.row * (cellSize + gap);
      var s = cellSize * Math.max(0.01, scale);
      var centerOffset = (cellSize - s) / 2;

      ctx.beginPath();
      ctx.roundRect(x + centerOffset, y + centerOffset, s, s, 2);
      ctx.fillStyle = pos.color;
      ctx.fill();
    });

    if (!allDone) {
      requestAnimationFrame(drawFrame);
    } else {
      drawWaffleLegend(tagData, totalAmount);
      bindWaffleHover(ctx.canvas, cells, cellSize, gap, offsetX, offsetY, cols, rows, tagData, totalAmount);
    }
  }

  requestAnimationFrame(drawFrame);
}

function drawWaffleLegend(tagData, totalAmount) {
  var container = document.getElementById('waffleLegend');
  if (!container) return;
  container.innerHTML = tagData.map(function(t) {
    var pct = ((t.amount / totalAmount) * 100).toFixed(1);
    return '<span style="display:inline-flex;align-items:center;gap:4px;padding:2px 6px;background:var(--bg);border-radius:4px;cursor:pointer" onclick="window.setRecordsTagFilter(\'' + escHtml(t.name) + '\');navigateTo(\'records\')">' +
      '<span style="width:10px;height:10px;border-radius:3px;background:' + t.color + ';display:inline-block;cursor:pointer" onclick="event.stopPropagation();openWaffleTagColorPicker(\'' + escHtml(t.name) + '\',\'' + t.color + '\')"></span>' +
      '<span>' + escHtml(t.name) + '</span>' +
      '<span style="color:var(--text-muted)">' + formatMoney(t.amount) + ' \u00B7 ' + pct + '%</span>' +
    '</span>';
  }).join('');
}

function startHoverAnim(canvas, cells, cellSize, gap, offsetX, offsetY, cols, rows, tagData, totalAmount, tooltip, event, targetTagIdx) {
  // Cancel any running animation
  if (_hoverAnimId) {
    cancelAnimationFrame(_hoverAnimId);
    _hoverAnimId = null;
  }

  var startTime = performance.now();
  var duration = 150; // ms
  var startTagIdx = _hoverState.active ? _hoverState.tagIndex : (targetTagIdx === -1 ? -1 : _hoverState.tagIndex);
  var isLeaving = targetTagIdx === -1;

  function animateHover(currentTime) {
    var elapsed = currentTime - startTime;
    var progress = Math.min(elapsed / duration, 1);
    // Ease-out quadratic
    var eased = progress * (2 - progress);

    var ctx = canvas.getContext('2d');
    var dpr = window.devicePixelRatio || 1;
    var w = canvas.width / dpr;
    var h = canvas.height / dpr;
    ctx.clearRect(0, 0, w, h);

    var highlightIdx = isLeaving ? -1 : targetTagIdx;

    cells.forEach(function(cell, i) {
      var row = i % rows;
      var col = Math.floor(i / rows);
      var x = offsetX + col * (cellSize + gap);
      var y = offsetY + row * (cellSize + gap);
      var isHighlighted = cell.tagIndex === highlightIdx;

      // Interpolate scale and alpha
      var targetScale = isHighlighted ? 1.06 : 1.0;
      var targetAlpha = isHighlighted ? 1.0 : 0.75;
      var startScale = _hoverState.active && _hoverState.tagIndex === cell.tagIndex ? 1.06 : 1.0;
      var startAlpha = _hoverState.active && _hoverState.tagIndex === cell.tagIndex ? 1.0 : 1.0;

      var scale = startScale + (targetScale - startScale) * eased;
      var alpha = startAlpha + (targetAlpha - startAlpha) * eased;
      var s = cellSize * scale;
      var cx = x + cellSize / 2;
      var cy = y + cellSize / 2;

      ctx.save();
      ctx.globalAlpha = Math.max(0, Math.min(1, alpha));
      ctx.beginPath();
      ctx.roundRect(cx - s / 2, cy - s / 2, s, s, 2);
      ctx.fillStyle = cell.color;
      ctx.fill();

      if (isHighlighted && progress > 0.5) {
        ctx.strokeStyle = 'rgba(255,255,255,0.5)';
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }
      ctx.restore();
    });

    if (progress < 1) {
      _hoverAnimId = requestAnimationFrame(animateHover);
    } else {
      _hoverAnimId = null;
      _hoverState.active = !isLeaving;
      _hoverState.tagIndex = targetTagIdx;
      _hoverState.progress = 1;
      // Final draw to ensure crisp state
      drawWaffleStatic(canvas, cells, cellSize, gap, offsetX, offsetY, cols, rows, tagData, highlightIdx);
    }
  }

  _hoverAnimId = requestAnimationFrame(animateHover);
}

function bindWaffleHover(canvas, cells, cellSize, gap, offsetX, offsetY, cols, rows, tagData, totalAmount) {
  var tooltip = document.getElementById('waffleTooltip');
  if (!tooltip) {
    tooltip = document.createElement('div');
    tooltip.id = 'waffleTooltip';
    tooltip.style.cssText = 'display:none;position:fixed;background:var(--card-bg);border:1px solid var(--border);border-radius:6px;padding:6px 10px;font-size:0.75rem;pointer-events:none;z-index:1000;box-shadow:var(--shadow-md)';
    document.body.appendChild(tooltip);
  }
  var currentHoverTag = -1;

  canvas.onmousemove = function(e) {
    var rect = canvas.getBoundingClientRect();
    var mx = e.clientX - rect.left;
    var my = e.clientY - rect.top;
    var col = Math.floor((mx - offsetX) / (cellSize + gap));
    var row = Math.floor((my - offsetY) / (cellSize + gap));
    var idx = col * rows + row;

    if (idx >= 0 && idx < cells.length && mx >= offsetX && my >= offsetY) {
      var tagIdx = cells[idx].tagIndex;
      if (tagIdx !== currentHoverTag) {
        currentHoverTag = tagIdx;
        startHoverAnim(canvas, cells, cellSize, gap, offsetX, offsetY, cols, rows, tagData, totalAmount, tooltip, e, tagIdx);
      }
      // Update tooltip position (with boundary check)
      var tag = tagData[tagIdx];
      var pct = ((tag.amount / totalAmount) * 100).toFixed(1);
      tooltip.innerHTML = '<strong>' + escHtml(tag.name) + '</strong> \u00B7 ' + formatMoney(tag.amount) + ' \u00B7 ' + pct + '%';
      tooltip.style.display = 'block';
      var tw = tooltip.offsetWidth || 180;
      var th = tooltip.offsetHeight || 30;
      var tl = e.clientX + 12;
      var tt = e.clientY + 12;
      if (tl + tw > window.innerWidth - 8) tl = e.clientX - tw - 12;
      if (tt + th > window.innerHeight - 8) tt = e.clientY - th - 12;
      tooltip.style.left = tl + 'px';
      tooltip.style.top = tt + 'px';
      canvas._clickTag = tag.name;
      canvas.style.cursor = 'pointer';
    } else {
      if (currentHoverTag !== -1) {
        currentHoverTag = -1;
        startHoverAnim(canvas, cells, cellSize, gap, offsetX, offsetY, cols, rows, tagData, totalAmount, tooltip, e, -1);
      }
      tooltip.style.display = 'none';
      canvas.style.cursor = 'default';
    }
  };

  canvas.onmouseleave = function() {
    currentHoverTag = -1;
    tooltip.style.display = 'none';
    startHoverAnim(canvas, cells, cellSize, gap, offsetX, offsetY, cols, rows, tagData, totalAmount, tooltip, null, -1);
  };

  canvas.onclick = function(e) {
    var tagName = canvas._clickTag;
    if (tagName && typeof window.setRecordsTagFilter === 'function') {
      window.setRecordsTagFilter(tagName);
      navigateTo('records');
    }
  };
}

function drawWaffleStatic(canvas, cells, cellSize, gap, offsetX, offsetY, cols, rows, tagData, highlightIdx) {
  var ctx = canvas.getContext('2d');
  var dpr = window.devicePixelRatio || 1;
  var w = canvas.width / dpr;
  var h = canvas.height / dpr;
  ctx.clearRect(0, 0, w, h);

  cells.forEach(function(cell, i) {
    var row = i % rows;
    var col = Math.floor(i / rows);
    var x = offsetX + col * (cellSize + gap);
    var y = offsetY + row * (cellSize + gap);
    var isHighlighted = highlightIdx !== undefined && cell.tagIndex === highlightIdx;

    // 缩放因子：高亮格放大，其余变暗
    var scale = isHighlighted ? 1.06 : 1.0;
    var alpha = isHighlighted ? 1.0 : 0.75;
    var s = cellSize * scale;
    var cx = x + cellSize / 2;
    var cy = y + cellSize / 2;

    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.beginPath();
    ctx.roundRect(cx - s / 2, cy - s / 2, s, s, 2);
    ctx.fillStyle = cell.color;
    ctx.fill();

    if (isHighlighted) {
      ctx.strokeStyle = 'rgba(255,255,255,0.5)';
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }
    ctx.restore();
  });
}

function setWaffleDensity(level) {
  if (level < 1 || level > 5) return;
  waffleDensity = level;
  localStorage.setItem('budgetWaffleDensity', level);
  renderStats();
}

function toggleWaffleUntagged() {
  waffleIncludeUntagged = !waffleIncludeUntagged;
  localStorage.setItem('budgetWaffleIncludeUntagged', waffleIncludeUntagged);
  renderStats();
}

function openWaffleTagColorPicker(tagName, currentColor) {
  var colors = window.COLORS || ['#6366F1','#10B981','#F59E0B','#EF4444','#8B5CF6','#EC4899','#14B8A6','#F97316','#06B6D4','#84CC16','#A855F7','#E11D48','#0EA5E9','#D97706'];
  var html = '<div class="modal-title">🎨 选择标签颜色 — ' + escHtml(tagName) + '</div>' +
    '<div style="display:grid;grid-template-columns:repeat(7,1fr);gap:8px;padding:8px 0">' +
    colors.map(function(c) {
      return '<span style="display:inline-block;width:32px;height:32px;border-radius:50%;background:' + c + ';cursor:pointer;border:' + (c === currentColor ? '3px solid var(--text-primary)' : '2px solid transparent') + '" onclick="DataStore.setTagColor(\'' + escHtml(tagName) + '\',\'' + c + '\');closeModal();renderStats()"></span>';
    }).join('') +
    '</div>' +
    (DataStore.getTagColor(tagName) ? '<div style="text-align:center;padding-top:4px"><button class="btn btn-ghost btn-sm" onclick="DataStore.resetTagColor(\'' + escHtml(tagName) + '\');closeModal();renderStats()">↩ 恢复默认</button></div>' : '') +
    '<div class="modal-actions"><button class="btn btn-ghost" onclick="closeModal()">取消</button></div>';
  showModal(html);
}

function exportWafflePNG() {
  var canvas = document.getElementById('waffleChart');
  if (!canvas) return;
  var link = document.createElement('a');
  link.download = 'waffle-tags-' + new Date().toISOString().substr(0, 10) + '.png';
  link.href = canvas.toDataURL('image/png');
  link.click();
  showToast('✅ Waffle 已导出为 PNG');
}

function changeWaffleMonth(monthKey) {
  waffleSelectedMonth = monthKey;
  renderStats();
}

  // === EXPORTS ===
  window.statsMonth = statsMonth;
  window.statsStartDate = statsStartDate;
  window.statsEndDate = statsEndDate;
  window.statsDrillStack = statsDrillStack;
  window.showMonthCompare = showMonthCompare;
  window.getDrillCategory = getDrillCategory;
  window.syncPieDrillBar = syncPieDrillBar;
  window.updateDrillCharts = updateDrillCharts;
  window.getHeatmapColor = getHeatmapColor;
  window.getDailySavingsTarget = getDailySavingsTarget;
  window.renderCalendarHeatmap = renderCalendarHeatmap;
  window.showDayRecords = showDayRecords;
  window.expandHeatmap = expandHeatmap;
  window.expandPie = expandPie;
  window.renderExpandPieTable = renderExpandPieTable;
  window.toggleExpandPieRow = toggleExpandPieRow;
  window.shrinkChart = shrinkChart;
  window.toggleMonthCompare = toggleMonthCompare;
  window.drawCompareBarChart = drawCompareBarChart;
  window.renderBillToggle = renderBillToggle;
  window.toggleBillFilter = toggleBillFilter;
  window.isBillToggleChecked = isBillToggleChecked;
  window.refreshPieChart = refreshPieChart;
  window.refreshOverviewBudget = refreshOverviewBudget;
  window.renderStats = renderStats;
  window.changeStatsMonth = changeStatsMonth;
  window.changeStatsCustom = changeStatsCustom;
  window.resetStatsDrill = resetStatsDrill;
  window.useCustomRange = useCustomRange;
  window.getStatsCatTotals = getStatsCatTotals;
  window.getStatsDailyTotals = getStatsDailyTotals;
  window.getChartData = getChartData;
  window.getChartDataForRange = getChartDataForRange;
  window.getRawChartData = getRawChartData;
  window.drawPieChart = drawPieChart;
  window.lightenColor = lightenColor;
  window.darkenColor = darkenColor;
  window.drawLineChart = drawLineChart;
  window.drawBarChart = drawBarChart;
  window.drawMonthlyChart = drawMonthlyChart;
  window.drawSavingsChart = drawSavingsChart;
  window.downloadChart = downloadChart;
  window.setWaffleDensity = setWaffleDensity;
  window.toggleWaffleUntagged = toggleWaffleUntagged;
  window.drawWaffleChart = drawWaffleChart;
  window.openWaffleTagColorPicker = openWaffleTagColorPicker;
  window.exportWafflePNG = exportWafflePNG;
  window.changeWaffleMonth = changeWaffleMonth;
})();
