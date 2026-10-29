/* ============================================================
   INITIALIZATION
   ============================================================ */
(function() {
'use strict';

// Registered first: _bootstrap() below can run straight away and reads these.
addI18nEntries({
  'init.loadError.title': { zh: '账本读取失败', en: 'Couldn\'t read your ledger' },
  'init.loadError.text': { zh: '这台设备上保存的账本读不出来，所以现在看到的是一本空账本。你原来的数据没有被删除，已经原样另存了一份。请先不要继续记账，联系应用作者帮你找回。', en: 'The ledger saved on this device can\'t be read, so you are seeing an empty one. Your old data has not been deleted — an untouched copy was set aside. Please don\'t add new entries yet, and contact the app\'s author to get it back.' },
  'init.loadError.ok': { zh: '知道了', en: 'OK' }
});

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
    // The stored ledger could not be read (see DataStore.init). Say so before the
    // user starts adding entries to what looks like a fresh, empty ledger.
    if (window._dataLoadError) {
      ModalQueue.request(1, 'data-load-error', function() {
        showModal(`
          <div class="modal-title">${__('init.loadError.title')}</div>
          <p style="margin:8px 0 16px">${__('init.loadError.text')}</p>
          <div class="modal-actions"><button class="btn btn-primary" onclick="closeModal()">${__('init.loadError.ok')}</button></div>
        `);
      });
    }
    // Changelog: queued, so it yields to the rollover reminder above.
    if (typeof Changelog !== 'undefined') Changelog.checkAndShow();
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
  // Changelog runs here rather than in _bootstrap() when a PIN is set, so it
  // never raises itself before the ledger has been unlocked.
  if (typeof Changelog !== 'undefined') Changelog.checkAndShow();
  // Purchase plans wait for unlock before syncing records / raising due dialogs
  if (typeof planBootstrap === 'function') setTimeout(planBootstrap, 800);
  console.log('[INIT] initApp() complete');
}

// Another tab or window just saved the ledger. Every save() writes the WHOLE ledger
// from this tab's memory, so without this the tab that saves second silently erases
// what the first one wrote. Reload instead; a locked tab (no plaintext in storage,
// PIN screen up) leaves it alone, and the add page keeps its half-typed form.
window.addEventListener('storage', function(e) {
  if (e.key !== 'budgetAppData' || e.newValue == null) return;
  if (window._pinRequired) return;
  if (!DataStore.reload()) return;
  if (window.currentTab !== 'add') { try { refreshCurrentPage(); } catch (err) { /* keep going */ } }
});

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
