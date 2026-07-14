/* ============================================================
   CANVAS DRAWING HELPERS
   ============================================================ */
(function() {
'use strict';
function drawRing(canvasId, progress, color, label, overspendColor) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return; // Fixed: guard against null canvas (m7)
  const ctx = canvas.getContext('2d');
  if (!ctx) return; // Fixed: guard against missing canvas context (m7)
  const tc = getThemeColors();
  const rect = canvas.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  const cssSize = rect.width || 160;
  const bufferSize = Math.round(cssSize * dpr);
  if (canvas.width !== bufferSize || canvas.height !== bufferSize) {
    canvas.width = bufferSize;
    canvas.height = bufferSize;
  }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const cx = cssSize / 2, cy = cssSize / 2, r = cssSize * 0.38, lineW = cssSize * 0.1;

  ctx.clearRect(0, 0, cssSize, cssSize);
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.strokeStyle = tc.border;
  ctx.lineWidth = lineW;
  ctx.lineCap = 'round';
  ctx.stroke();

  const startAngle = -Math.PI / 2;
  const normalProgress = Math.min(progress, 1);

  // Normal progress (up to 100%)
  if (normalProgress > 0) {
    const endAngle = startAngle + Math.PI * 2 * normalProgress;
    ctx.beginPath();
    ctx.arc(cx, cy, r, startAngle, endAngle);
    ctx.strokeStyle = color;
    ctx.lineWidth = lineW;
    ctx.lineCap = 'round';
    ctx.stroke();
  }

  // Overspend portion (beyond 100%) in red
  if (progress > 1) {
    const overshoot = Math.min(progress - 1, 1);
    const overStart = startAngle + Math.PI * 2 * normalProgress;
    const overEnd = overStart + Math.PI * 2 * overshoot;
    ctx.beginPath();
    ctx.arc(cx, cy, r, overStart, overEnd);
    ctx.strokeStyle = overspendColor || '#EF4444';
    ctx.lineWidth = lineW;
    ctx.lineCap = 'round';
    ctx.stroke();
  }

  // Label
  ctx.fillStyle = progress > 1 ? (overspendColor || '#EF4444') : color;
  ctx.font = `bold ${cssSize * 0.16}px -apple-system, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, cx, cy);
}

function drawSparkline(canvasId, data) {
  const canvas = document.getElementById(canvasId);
  if (!canvas || !data.length) return;
  const tc = getThemeColors();
  const rect = canvas.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  const w = rect.width || 600;
  const ch = 80;
  if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(ch * dpr)) {
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(ch * dpr);
  }

  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const cw = w, chartH = ch;

  const maxVal = Math.max(...data.map(d => d.total), 0.01);
  const minVal = 0;
  const padding = { top: 8, bottom: 8, left: 8, right: 8 };
  const plotW = cw - padding.left - padding.right;
  const plotH = chartH - padding.top - padding.bottom;

  // Draw line
  ctx.beginPath();
  data.forEach((d, i) => {
    const x = padding.left + (i / (data.length - 1)) * plotW;
    const y = padding.top + plotH - ((d.total - minVal) / (maxVal - minVal)) * plotH;
    i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
  });
  ctx.strokeStyle = '#6366F1';
  ctx.lineWidth = 2;
  ctx.lineJoin = 'round';
  ctx.stroke();

  // Fill area
  const lastIdx = data.length - 1;
  const lastX = padding.left + (lastIdx / (data.length - 1)) * plotW;
  const lastY = padding.top + plotH - ((data[lastIdx].total - minVal) / (maxVal - minVal)) * plotH;
  ctx.lineTo(lastX, padding.top + plotH);
  ctx.lineTo(padding.left, padding.top + plotH);
  ctx.closePath();
  const grad = ctx.createLinearGradient(0, padding.top, 0, padding.top + plotH);
  grad.addColorStop(0, 'rgba(99,102,241,0.2)');
  grad.addColorStop(1, 'rgba(99,102,241,0)');
  ctx.fillStyle = grad;
  ctx.fill();

  // Dots
  data.forEach((d, i) => {
    const x = padding.left + (i / (data.length - 1)) * plotW;
    const y = padding.top + plotH - ((d.total - minVal) / (maxVal - minVal)) * plotH;
    ctx.beginPath();
    ctx.arc(x, y, 3, 0, Math.PI * 2);
    ctx.fillStyle = '#6366F1';
    ctx.fill();
  });
}

  // === EXPORTS ===
  window.drawRing = drawRing;
  window.drawSparkline = drawSparkline;
})();
