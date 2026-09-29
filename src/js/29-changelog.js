/* ============================================================
   CHANGELOG ANNOUNCEMENTS
   ============================================================
   Shows what changed since the user last opened the app, once, on startup
   (or right after the PIN is unlocked).

   WHY THIS IS KEYED ON AN ENTRY ID, NOT ON THE APP VERSION
   --------------------------------------------------------
   APP_VERSION (01-constants.js) is display-only and announcing nothing. If the
   "last seen version" were compared against it, then any release that did not
   bump APP_VERSION could never be announced: the user marks 3.3.0 as seen, a
   new feature lands inside 3.3.0, and 3.3.0 > 3.3.0 is false forever.

   So the read marker is the id of the newest entry the user has seen, and
   "pending" is simply the slice of the registry above it. Adding an
   announcement means inserting one entry — nothing else, and no version bump.

   ADDING AN ANNOUNCEMENT (the whole release ritual)
   --------------------------------------------------
     1. Add an entry at the TOP of CHANGELOG with a fresh `id` (a date works
        well) and the current APP_VERSION.
     2. Add its i18n keys at the bottom of this file (zh + en, both required).
     3. bash build.sh
     4. node tests/changelog-test.js
        It asserts: ids unique, dates strictly descending, no empty items, and
        no entry claiming a version newer than APP_VERSION.
     5. Bump APP_VERSION in 01-constants.js + README only if this really is a
        new release. That step announces nothing on its own.
   ============================================================ */
(function() {
'use strict';

const LS_KEY = 'budgetAppLastSeenChangelog';
const QUEUE_ID = 'changelog';
const PRIORITY = 9;          // yields to sync conflicts (1), plan due (2), rollover (3)

/* ---------------- registry — NEWEST FIRST ---------------- */
/* Items store i18n KEYS, resolved at render time (same convention as
   25-page-guides.js) so a runtime locale switch is picked up. */
const CHANGELOG = [
  {
    id: '2026-10-05',
    version: '3.3.0',
    date: '2026-10-05',
    title: 'changelog.a1.title',
    items: [
      { icon: '📣', text: 'changelog.a1.item1' },
      { icon: '🔧', text: 'changelog.a1.item2' },
      { icon: '🔧', text: 'changelog.a1.item3' }
    ]
  },
  {
    id: '2026-09-30',
    version: '3.3.0',
    date: '2026-09-30',
    title: 'changelog.a2.title',
    items: [
      { icon: '☁️', text: 'changelog.a2.item1' },
      { icon: '🔒', text: 'changelog.a2.item2' },
      { icon: '🧬', text: 'changelog.a2.item3' },
      { icon: '▤', text: 'changelog.a2.item4' },
      { icon: '🔍', text: 'changelog.a2.item5' }
    ]
  }
];

/* ---------------- storage (defensive: localStorage can throw) ---------------- */
function lsGet(key) {
  try { return localStorage.getItem(key); } catch (e) { return null; }
}
function lsSet(key, val) {
  try { localStorage.setItem(key, val); return true; }
  catch (e) { console.warn('[changelog] could not persist read marker:', e); return false; }
}

/* ---------------- version comparison ---------------- */
/* Numeric, so '3.10.0' > '3.9.0'. A missing or unparseable segment counts as 0,
   which is what makes '3.4' and '3.4.0' compare equal.
   Only used by the test to catch an entry announcing an unreleased version —
   the read marker never looks at versions. */
function cmpVersion(a, b) {
  function parts(v) {
    return String(v == null ? '' : v).split('.').map(function(n) {
      const x = parseInt(n, 10);
      return isFinite(x) ? x : 0;
    });
  }
  const pa = parts(a), pb = parts(b);
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i++) {
    const x = pa[i] || 0, y = pb[i] || 0;
    if (x !== y) return x < y ? -1 : 1;
  }
  return 0;
}

/* ---------------- registry access ---------------- */
function all() { return CHANGELOG.slice(); }

/** Insert keeping `date` strictly descending — the invariant the test checks. */
function insertSorted(list, entry) {
  const at = list.findIndex(function(e) {
    return String(e.date || '') < String(entry.date || '');
  });
  if (at < 0) list.push(entry); else list.splice(at, 0, entry);
  return list;
}

/**
 * Generic registration point: append or replace an announcement by id.
 * Other modules (or a future release file) can call this instead of editing
 * the literal above. Returns true when a new entry was added.
 *
 * `items[].text` is rendered as HTML (same convention as 25-page-guides.js, so
 * entries can use <strong> / <code>). Never register anything that came from
 * outside the repository — pass i18n keys, not user data.
 */
function register(entry) {
  if (!entry || typeof entry !== 'object' || !entry.id) return false;
  const i = CHANGELOG.findIndex(function(e) { return e.id === entry.id; });
  if (i >= 0) { CHANGELOG[i] = entry; return false; }
  insertSorted(CHANGELOG, entry);
  return true;
}

function lastSeenId() { return lsGet(LS_KEY); }

function markSeen(id) {
  if (!id) return false;
  return lsSet(LS_KEY, String(id));
}

/** Entries newer than the read marker, newest first. */
function pending() {
  const seen = lastSeenId();
  // No marker at all -> first run, show everything. Marker not found -> the
  // entry was removed, or this is an older build; showing everything is the
  // safe default and matches "a fresh install sees the changelog too".
  if (!seen) return CHANGELOG.slice();
  const idx = CHANGELOG.findIndex(function(e) { return e.id === seen; });
  if (idx < 0) return CHANGELOG.slice();
  return CHANGELOG.slice(0, idx);
}

function pendingCount() { return pending().length; }

/* ---------------- render ----------------
   Only `title` and `items[].text` are i18n keys. `id`, `version`, `date` and
   `icon` are literal values and must be emitted untouched.

   Do NOT replace this with a generic walk that calls __() on every string:
   __() renders a missing key as '??<key>??', so a blanket resolve turns
   `icon: '📣'` into '??📣??' and `version: '3.3.0'` into '??3.3.0??'. It also
   looks fine in a test that only does indexOf('📣'). */
function renderEntry(entry) {
  const title = entry.title ? __(entry.title) : entry.id;
  const items = (entry.items || []).map(function(it) {
    return '<div class="cl-item">' +
             (it.icon ? '<span class="cl-item-icon">' + escHtml(it.icon) + '</span>' : '') +
             '<span class="cl-item-text">' + __(it.text) + '</span>' +
           '</div>';
  }).join('');
  return '<div class="cl-title">' + escHtml(title) + '</div>' +
         '<div class="cl-meta">' + escHtml('v' + entry.version + ' · ' + (entry.date || '')) + '</div>' +
         items;
}

// "you missed N updates" when they are all one version, "multiple versions"
// otherwise — with APP_VERSION pinned at a single value for a long stretch,
// the naive wording would be wrong most of the time.
function missedBanner(list) {
  if (list.length < 2) return '';
  const versions = list.map(function(e) { return e.version; })
                       .filter(function(v, i, a) { return a.indexOf(v) === i; });
  const text = versions.length > 1
    ? __('changelog.banner.multi')
    : __('changelog.banner.same', list.length, versions[0]);
  return '<div class="cl-banner">📦 ' + escHtml(text) + '</div>';
}

function render() {
  if (!view.list[view.idx]) return '';

  const many = view.list.length > 1;
  const atStart = view.idx <= 0;
  const atEnd = view.idx >= view.list.length - 1;

  // Arrows always render (the user asked for them even with a single entry)
  // and are simply disabled at the ends.
  const prevBtn = '<button class="cl-arrow cl-arrow-prev" onclick="Changelog.prev()"' +
                  (atStart ? ' disabled' : '') + ' aria-label="' + escHtml(__('changelog.prev')) + '">‹</button>';
  const nextBtn = '<button class="cl-arrow cl-arrow-next" onclick="Changelog.next()"' +
                  (atEnd ? ' disabled' : '') + ' aria-label="' + escHtml(__('changelog.next')) + '">›</button>';

  return missedBanner(view.list) +
    '<div class="cl-body">' + prevBtn +
      '<div class="cl-content">' + renderEntry(view.list[view.idx]) +
        (many ? '<div class="cl-counter">' + (view.idx + 1) + ' / ' + view.list.length + '</div>' : '') +
      '</div>' +
    nextBtn + '</div>' +
    '<div class="cl-foot">' +
      '<button class="btn btn-primary btn-block" onclick="Changelog.close()">' +
        escHtml(__('changelog.gotIt')) + '</button>' +
    '</div>';
}

/* ---------------- view state ---------------- */
let view = { list: [], idx: 0, mark: false };
let _checkedThisSession = false;

function repaint() {
  const c = document.getElementById('modalContent');
  if (!c) return;
  const html = render();
  if (!html) return;
  c.innerHTML = '';
  c.insertAdjacentHTML('beforeend', html);
}

function showNow() {
  const html = render();
  if (!html) return;
  // The read marker is written at DISPLAY time, not on close. A close happens
  // inside the same mutation batch that lets ModalQueue put the next modal up,
  // so a "mark on close" hook would race it and silently never fire.
  // Consequence: closing the tab without reading still counts as seen. For a
  // changelog that is the right trade — the alternative is a lost marker.
  if (view.mark && view.list.length) markSeen(view.list[0].id);
  showModal(html, true);
}

function openList(list, mark) {
  if (!list || !list.length) return false;
  view = { list: list, idx: 0, mark: !!mark };
  ModalQueue.request(PRIORITY, QUEUE_ID, showNow);
  return true;
}

/* ---------------- public entry points ---------------- */
/** Startup hook. Returns true if an announcement was raised. */
function checkAndShow() {
  if (_checkedThisSession) return false;
  _checkedThisSession = true;
  const list = pending();
  if (!list.length) return false;
  return openList(list, true);
}

/** Manual "view changelog" from Settings — browses every entry, marks nothing. */
function open() {
  _checkedThisSession = true;   // don't let the startup check race the manual one
  const list = all();
  if (!list.length) { showToast(__('changelog.empty'), 'info'); return false; }
  return openList(list, false);
}

function next() {
  if (view.idx + 1 >= view.list.length) return false;
  view.idx++;
  repaint();
  return true;
}

function prev() {
  if (view.idx <= 0) return false;
  view.idx--;
  repaint();
  return true;
}

function close() {
  view = { list: [], idx: 0, mark: false };
  if (typeof closeModal === 'function') closeModal();
}

  // === EXPORTS ===
  window.Changelog = {
    register: register, all: all, pending: pending, pendingCount: pendingCount,
    lastSeenId: lastSeenId, markSeen: markSeen, cmpVersion: cmpVersion,
    checkAndShow: checkAndShow, open: open,
    next: next, prev: prev, close: close
  };

  // i18n translations
  addI18nEntries({
    'changelog.title': { zh: '版本公告', en: "What's New" },
    'changelog.gotIt': { zh: '知道了', en: 'Got it' },
    'changelog.prev': { zh: '上一个版本', en: 'Previous version' },
    'changelog.next': { zh: '下一个版本', en: 'Next version' },
    'changelog.empty': { zh: '还没有任何版本公告', en: 'No announcements yet' },
    'changelog.settings': { zh: '查看更新日志', en: 'View Changelog' },
    'changelog.settingsHint': { zh: '随时回看历次更新内容', en: 'Browse every past update' },
    'changelog.banner.multi': { zh: '你错过了多个版本！', en: "You've missed several versions!" },
    'changelog.banner.same': { zh: '你错过了 {0} 次更新 · v{1}', en: "You've missed {0} updates · v{1}" },

    'changelog.a1.title': { zh: '版本公告', en: 'Version Announcements' },
    'changelog.a1.item1': {
      zh: '<strong>版本公告功能</strong>：每次打开应用，若检测到你还没看过本版本的更新，就会弹出说明。跳过了多个版本也能用左右箭头翻看；设置页里随时可以回看完整更新日志。',
      en: '<strong>Version announcements</strong> — whenever you open the app and haven\'t seen what changed yet, a summary pops up. Missed several versions? Use the left/right arrows. The full history is always browsable from Settings.'
    },
    'changelog.a1.item2': {
      zh: '<strong>版本号收敛为单一来源</strong>：设置页、诊断报告、页面标题原先各自硬编码一份 <code>v3.3.0</code>，现在统一读 <code>APP_VERSION</code>。',
      en: '<strong>One source of truth for the version</strong> — the settings footer, the diagnostics export and the page title each hardcoded their own <code>v3.3.0</code>. They all read <code>APP_VERSION</code> now.'
    },
    'changelog.a1.item3': {
      zh: '<strong>修页面标题的版本号不显示</strong>：标题里的版本号一直被 i18n 覆盖掉，浏览器标签页实际只显示「记账软件」。',
      en: '<strong>Fixed the version never showing in the page title</strong> — the version in <code>&lt;title&gt;</code> was being overwritten by i18n, so the tab only ever read "Budget Tracker".'
    },

    'changelog.a2.title': { zh: 'v3.3.0 更新内容', en: 'What\'s in v3.3.0' },
    'changelog.a2.item1': {
      zh: '<strong>可选云端同步（端到端加密）</strong>：多设备自动同步，服务端只见密文。支持 PIN 解锁后同步、gzip 压缩、冲突时三方合并。',
      en: '<strong>Optional cloud sync (end-to-end encrypted)</strong> — your ledger syncs across devices and the server only ever holds ciphertext. Works after PIN unlock, gzipped, with a three-way merge on conflict.'
    },
    'changelog.a2.item2': {
      zh: '<strong>修 PIN 锁定期间丢数据</strong>：锁定 / 解锁流程会清空内存数据，期间的新改动此前会丢。',
      en: '<strong>Fixed data loss while PIN-locked</strong> — locking clears the in-memory store, and edits made around that moment were previously dropped.'
    },
    'changelog.a2.item3': {
      zh: '<strong>修数据指纹漏字段</strong>：冲突检测此前漏掉若干字段，两台设备上的改动可能察觉不到。',
      en: '<strong>Fixed gaps in the data fingerprint</strong> — some fields were excluded, so changes made on two devices could go unnoticed.'
    },
    'changelog.a2.item4': {
      zh: '<strong>分类支出矩形图</strong>：面积正比于金额，子分类嵌套在父分类的框里，一眼看出大数字是被哪一支拉高的。',
      en: '<strong>Category treemap</strong> — area is proportional to spend and child boxes nest inside their parent, so it\'s obvious which branch inflated the total.'
    },
    'changelog.a2.item5': {
      zh: '<strong>展开视图修复</strong>：放大到接近全屏，并修掉多张图叠在一起显示、明细表下钻失效、canvas 分辨率导致的整体模糊。',
      en: '<strong>Expanded-view fixes</strong> — now nearly full-screen, and fixed charts stacking on top of each other, the detail table failing to drill down, and overall blurriness from a mismatched canvas resolution.'
    }
  });
})();
