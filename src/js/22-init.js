/* ============================================================
   INITIALIZATION
   ============================================================ */
(function() {
'use strict';

// Fixed: wrap init in function with DOMContentLoaded guard (M10)
function _bootstrap() {
  console.log('[INIT] _bootstrap start | DataStore.init()');
  DataStore.init();
  console.log('[INIT] _bootstrap DataStore.init done | _pinRequired:', !!window._pinRequired);

  // Check if PIN is required
  if (window._pinRequired) {
    console.log('[INIT] PIN required -> showPinModal');
    showPinModal();
  } else {
    checkMonthRollover();
    applyTheme();
  }
  console.log('[INIT] _bootstrap complete');
}

// Guard: wait for DOM to be ready before initializing (M10)
console.log('[INIT] readyState:', document.readyState);
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', function() { console.log('[INIT] DOMContentLoaded -> _bootstrap'); _bootstrap(); });
} else {
  _bootstrap();
}

// Function to re-init app after PIN unlock (name kept for external callers)
function initApp() {
  console.log('[INIT] initApp() called');
  window._pinRequired = false;
  checkMonthRollover();
  applyTheme();
  handleHash();
  applyI18nToDOM();
  console.log('[INIT] initApp() complete');
}

// Start auto-lock & activity monitoring
if (typeof bindActivityListeners === 'function') { console.log('[INIT] bindActivityListeners() called'); bindActivityListeners(); }
if (typeof startInactivityCheck === 'function') { console.log('[INIT] startInactivityCheck() called'); startInactivityCheck(); }

// Handle hash-based routing
function handleHash() {
  const hash = location.hash.slice(1) || 'overview';
  console.log('[INIT] handleHash | location.hash:', location.hash, '| parsed hash:', hash, '| currentTab:', window.currentTab);
  navigateTo(hash);
}

console.log('[INIT] registering hashchange + load listeners');
window.addEventListener('hashchange', function() { console.log('[INIT] hashchange fired | hash:', location.hash); handleHash(); });
window.addEventListener('load', () => {
  console.log('[INIT] load event fired');
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
