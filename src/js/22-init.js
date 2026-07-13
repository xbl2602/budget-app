/* ============================================================
   INITIALIZATION
   ============================================================ */
(function() {
'use strict';
DataStore.init();

// Check if PIN is required
if (window._pinRequired) {
  showPinModal();
} else {
  checkMonthRollover();

  // Apply saved theme
  applyTheme();
}

// Function to re-init app after PIN unlock
function initApp() {
  window._pinRequired = false;
  checkMonthRollover();
  applyTheme();
  handleHash();
  applyI18nToDOM();
}

// Start auto-lock & activity monitoring
if (typeof bindActivityListeners === 'function') bindActivityListeners();
if (typeof startInactivityCheck === 'function') startInactivityCheck();

// Handle hash-based routing
function handleHash() {
  const hash = location.hash.slice(1) || 'overview';
  navigateTo(hash);
}

window.addEventListener('hashchange', handleHash);
window.addEventListener('load', () => {
  handleHash();
  applyI18nToDOM();
  // Re-draw charts on resize
  let resizeTimer;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      if (currentTab === 'overview') renderOverview();
      else if (currentTab === 'stats') { renderStats(); }
    }, 200);
  });
});

// Fix roundRect for older browsers
if (!CanvasRenderingContext2D.prototype.roundRect) {
  CanvasRenderingContext2D.prototype.roundRect = function(x, y, w, h, radii) {
    const r = Array.isArray(radii) ? radii : [radii, radii, radii, radii];
    const [tl, tr, br, bl] = r.map(v => Math.min(v || 0, Math.min(w, h) / 2));
    this.moveTo(x + tl, y);
    this.lineTo(x + w - tr, y);
    this.quadraticCurveTo(x + w, y, x + w, y + tr);
    this.lineTo(x + w, y + h - br);
    this.quadraticCurveTo(x + w, y + h, x + w - br, y + h);
    this.lineTo(x + bl, y + h);
    this.quadraticCurveTo(x, y + h, x, y + h - bl);
    this.lineTo(x, y + tl);
    this.quadraticCurveTo(x, y, x + tl, y);
    this.closePath();
    return this;
  };
  }

  // === EXPORTS ===
  window.handleHash = handleHash;
  window.initApp = initApp;
})();
