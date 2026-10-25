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

   WRITING AN ANNOUNCEMENT (read this before adding one)
   -----------------------------------------------------
   The reader is an ordinary person who has never kept a budget before. If a
   sentence only makes sense to someone who already knows what a term means,
   the announcement has failed. So:
     - One entry = at most 3-4 items; one item = one or two short sentences.
     - Say what the user can now DO, or what was wrong and is now right.
       Not how it works inside, not which module changed.
     - No jargon: 下钻 / 口径 / 流水 / 外推 / 叶子分类 / 同步冲突 / 加密算法 ...
       Use 展开下一层 / 算法 / 记录 / 估算 / 没有下一层 ... instead. If a
       label the user sees is itself a hard word, explain it in the same
       sentence ("固定账单 = 每月固定要付的房租、水电等").
     - Give one tiny example when a number is involved.
     - Skip anything only a developer would care about (version plumbing,
       refactors, test fixes) - it does not belong in front of users.
     - The title does not repeat the version; the line under it shows it.

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
    id: '2026-10-25',
    version: '3.7.0',
    date: '2026-10-25',
    title: 'changelog.a10.title',
    items: [
      { icon: '👆', text: 'changelog.a10.item1' },
      { icon: '🧾', text: 'changelog.a10.item2' },
      { icon: '🎯', text: 'changelog.a10.item3' },
      { icon: '📝', text: 'changelog.a10.item4' }
    ]
  },
  {
    id: '2026-10-21',
    version: '3.6.7',
    date: '2026-10-21',
    title: 'changelog.a9.title',
    items: [
      { icon: '👆', text: 'changelog.a9.item1' }
    ]
  },
  {
    id: '2026-10-15',
    version: '3.6.3',
    date: '2026-10-15',
    title: 'changelog.a8.title',
    items: [
      { icon: '📊', text: 'changelog.a8.item1' },
      { icon: '💳', text: 'changelog.a8.item2' }
    ]
  },
  {
    id: '2026-10-14',
    version: '3.6.2',
    date: '2026-10-14',
    title: 'changelog.a7.title',
    items: [
      { icon: '📅', text: 'changelog.a7.item1' },
      { icon: '💰', text: 'changelog.a7.item2' },
      { icon: '🤝', text: 'changelog.a7.item3' },
      { icon: '🔮', text: 'changelog.a7.item4' }
    ]
  },
  {
    id: '2026-10-13',
    version: '3.6.1',
    date: '2026-10-13',
    title: 'changelog.a6.title',
    items: [
      { icon: '📱', text: 'changelog.a6.item1' }
    ]
  },
  {
    id: '2026-10-08',
    version: '3.6.0',
    date: '2026-10-08',
    title: 'changelog.a5.title',
    items: [
      { icon: '📝', text: 'changelog.a5.item1' },
      { icon: '📊', text: 'changelog.a5.item2' },
      { icon: '👆', text: 'changelog.a5.item3' },
      { icon: '🔮', text: 'changelog.a5.item4' }
    ]
  },
  {
    id: '2026-10-07',
    version: '3.5.0',
    date: '2026-10-07',
    title: 'changelog.a4.title',
    items: [
      { icon: '↕️', text: 'changelog.a4.item1' },
      { icon: '🔍', text: 'changelog.a4.item2' }
    ]
  },
  {
    id: '2026-10-06',
    version: '3.4.0',
    date: '2026-10-06',
    title: 'changelog.a3.title',
    items: [
      { icon: '💰', text: 'changelog.a3.item1' },
      { icon: '🗂️', text: 'changelog.a3.item2' },
      { icon: '📊', text: 'changelog.a3.item3' }
    ]
  },
  {
    id: '2026-10-05',
    version: '3.3.0',
    date: '2026-10-05',
    title: 'changelog.a1.title',
    items: [
      { icon: '📣', text: 'changelog.a1.item1' }
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

    'changelog.a10.title': { zh: 'v3.7.0 预测更准了，总览的数字对得上了', en: 'v3.7.0: better forecasts, and the overview numbers add up' },
    'changelog.a10.item1': {
      zh: '<strong>点「预测月总支出」那张卡片，就能切换算不算固定账单</strong>（房租、水电这类）。卡片上会写着现在是哪种状态，以及点一下会变成什么。',
      en: '<strong>Tap the “Predicted monthly total” card to switch fixed bills (rent, utilities…) on or off</strong>. The card shows which state it is in now, and what a tap will do.'
    },
    'changelog.a10.item2': {
      zh: '<strong>预测现在会把月账单算进来</strong>：包括你设了金额、但还没付的那部分。信用卡分期也单独列出来，点开关时是哪几项在变，一眼就能看明白。已经付掉的房租也不会再被越估越多。',
      en: '<strong>The forecast now counts your monthly bills</strong>, including the amounts you set but have not paid yet. Card instalments get their own line, so you can see exactly what changes when you flip the switch. Rent you have already paid is no longer inflated.'
    },
    'changelog.a10.item3': {
      zh: '<strong>各个页面的「预计储蓄」现在是同一个数</strong>：大额计划先拿走它那份，剩下的才算你能存下的钱。以前总览写 98，大额计划里却是 0，现在不会了。',
      en: '<strong>“Projected savings” is now the same number on every page</strong>: your purchase plans take their share first, and what is left is what you can save. The overview used to say 98 while the plans page said 0 — no more.'
    },
    'changelog.a10.item4': {
      zh: '<strong>几处小改进</strong>：数额是 0 的部分不再显示；统计页的「当前已存」改叫「累计已存」；预计还能达成目标时，不再写成「已达成」。',
      en: '<strong>A few small fixes</strong>: parts that are zero are no longer shown; “Saved so far” on the stats page is now “Cumulative Saved”; a target you are only on track for is no longer called “met”.'
    },

    'changelog.a9.title': { zh: '点图表的方式调整了', en: 'Tapping a chart works differently' },
    'changelog.a9.item1': {
      zh: '<strong>点图上的色块 = 展开下一层；想看具体的记录，点下面表格里的那一行。</strong>点到没有下一层的色块会提示你，不会没反应。',
      en: '<strong>Tap a block in the chart to open the next level; to see the actual records, tap its row in the table below.</strong> A block with nothing below it now tells you so instead of doing nothing.'
    },

    'changelog.a8.title': { zh: '「含固定账单」开关现在真的有用了', en: 'The “Include fixed bills” switch now works' },
    'changelog.a8.item1': {
      zh: '<strong>勾选「含固定账单」，每月固定要付的房租、水电等就会出现在统计图里</strong>，取消勾选就消失。点一下还能看到这笔账单的记录。',
      en: '<strong>Tick “Include fixed bills” and your monthly rent, utilities and the like show up in the charts</strong>; untick and they go away. Tap one to see its records.'
    },
    'changelog.a8.item2': {
      zh: '<strong>信用卡分期也跟着这个开关走</strong>：和房租一样算固定支出，取消勾选就不算进日常花销。',
      en: '<strong>Card instalments follow the switch too</strong> - they count as fixed spending like rent, so unticking leaves them out of everyday spending.'
    },

    'changelog.a7.title': { zh: '记账更顺手，几处数字改对了', en: 'Smoother entry, a few numbers fixed' },
    'changelog.a7.item1': {
      zh: '<strong>记账日期可以一键换天</strong>：日期两边多了 ‹ › 按钮。记完一笔后日期不会被重置，连着补记同一天很方便。',
      en: '<strong>Change the date in one tap</strong> - the date has ‹ › buttons on each side, and it is no longer reset after saving, so adding several entries for one day is quick.'
    },
    'changelog.a7.item2': {
      zh: '<strong>输入金额更简单</strong>：只按数字键，输入 23642 就是 236.42，不用再找小数点。',
      en: '<strong>Typing amounts is simpler</strong> - just press digits: 23642 becomes 236.42, no decimal point needed.'
    },
    'changelog.a7.item3': {
      zh: '<strong>分摊账单只显示还没收回的钱</strong>：已还清的人和已归档的账单，收进了单独的标签页。',
      en: '<strong>Split bills only show what is still owed to you</strong> - people who have paid you back and archived bills moved to their own tab.'
    },
    'changelog.a7.item4': {
      zh: '<strong>改对了两处算错的数字</strong>：「假设分析」里调整一个大类时，省下的钱不再被重复计算；「日均」在所有页面算法一致了。',
      en: '<strong>Two wrong numbers fixed</strong> - in What-If, adjusting a main category no longer counts the savings several times, and the daily average is now worked out the same way on every page.'
    },

    'changelog.a6.title': { zh: '手机上的分类页不再挤字', en: 'The categories page fits on a phone' },
    'changelog.a6.item1': {
      zh: '<strong>手机上能看到完整的分类名字了</strong>：每个分类分成两行，名字在上，按钮在下。电脑上没有变化。',
      en: '<strong>Full category names on a phone</strong> - each category now takes two lines, name on top and buttons below. Nothing changes on a computer.'
    },

    'changelog.a5.title': { zh: '难懂的词改直白了，图表可以点', en: 'Plainer wording, tappable charts' },
    'changelog.a5.item1': {
      zh: '<strong>难懂的词改成了更直白的说法</strong>，旁边还用小字写明了是怎么算出来的。',
      en: '<strong>Hard-to-read terms now use plainer words</strong>, with a short note beside each saying how it is worked out.'
    },
    'changelog.a5.item2': {
      zh: '<strong>预测的本月支出能看到明细</strong>：由哪几部分加起来的，一目了然。',
      en: '<strong>The forecast of this month’s spending shows what it is made of</strong>, so you can see where the number comes from.'
    },
    'changelog.a5.item3': {
      zh: '<strong>点图上的色块，可以看这个分类本月的所有记录</strong>，还能一键跳到记录页。',
      en: '<strong>Tap a block in the chart to see this category’s records for the month</strong>, with a shortcut to the records page.'
    },
    'changelog.a5.item4': {
      zh: '<strong>「假设分析」把收入和支出分开了</strong>：只能调整支出，结果页会写明储蓄是怎么算出来的。',
      en: '<strong>What-If keeps income and spending apart</strong> - you can only adjust spending, and the result page explains how savings are worked out.'
    },

    'changelog.a4.title': { zh: '分类可以自己排序，选分类更方便', en: 'Sort your categories, pick them more easily' },
    'changelog.a4.item1': {
      zh: '<strong>分类的顺序可以自己排</strong>：每个分类旁边有 ⬆️ ⬇️ 按钮，换设备同步后顺序也一样。',
      en: '<strong>Put your categories in the order you like</strong> - each one has ⬆️ ⬇️ buttons, and the order follows you to other devices.'
    },
    'changelog.a4.item2': {
      zh: '<strong>选分类不再一长串</strong>：默认收起，点开才展开，还能直接搜名字。',
      en: '<strong>Picking a category is no longer a long list</strong> - groups start folded, open when tapped, and you can search by name.'
    },

    'changelog.a3.title': { zh: '新增：可以记收入了', en: 'New: you can record income' },
    'changelog.a3.item1': {
      zh: '<strong>可以记收入了</strong>：记账页顶部切换「支出 / 收入」，已备好工资、副业、报销等分类。',
      en: '<strong>You can record income</strong> - switch between spending and income at the top of the add page; salary, side work, refunds and more are ready to use.'
    },
    'changelog.a3.item2': {
      zh: '<strong>收入有自己的分类</strong>：分类页分成「支出」和「收入」两块。',
      en: '<strong>Income has its own categories</strong> - the categories page is split into spending and income.'
    },
    'changelog.a3.item3': {
      zh: '<strong>能看到赚了多少、还剩多少</strong>：总览、统计、报告里多了收入和「收入 − 支出」，Excel 导出也带上了。',
      en: '<strong>See what came in and what is left</strong> - the overview, stats and report now show income and income minus spending, and the Excel export includes them.'
    },

    'changelog.a1.title': { zh: '新增「版本公告」', en: 'New: “What’s new” notes' },
    'changelog.a1.item1': {
      zh: '<strong>应用更新后，打开时会弹出这样的说明</strong>。错过了好几次更新，可以用左右箭头翻看；设置页里随时能回看。',
      en: '<strong>After an update, a note like this appears when you open the app.</strong> Missed a few? Use the arrows to flip through; Settings keeps the full history.'
    },

    'changelog.a2.title': { zh: '新增云端同步，修复两个数据问题', en: 'Cloud sync, plus two data fixes' },
    'changelog.a2.item1': {
      zh: '<strong>可以在多台设备之间自动同步了</strong>（可选）：数据加密后再上传，服务器看不到你的内容。',
      en: '<strong>Your data can sync between devices automatically</strong> (optional) - it is encrypted before upload, so the server cannot read it.'
    },
    'changelog.a2.item2': {
      zh: '<strong>修复：设置了 PIN 锁后，新记的账可能丢失</strong>。',
      en: '<strong>Fixed: new entries could be lost when a PIN lock was on.</strong>'
    },
    'changelog.a2.item3': {
      zh: '<strong>修复：两台设备同时改数据时，有些改动可能被漏掉</strong>。',
      en: '<strong>Fixed: when two devices changed data at once, some changes could be missed.</strong>'
    },
    'changelog.a2.item4': {
      zh: '<strong>新增「矩形图」</strong>：方块越大花得越多，一眼看出钱主要花在哪。',
      en: '<strong>New “treemap” chart</strong> - the bigger the box, the more you spent, so you can see where the money goes.'
    },
    'changelog.a2.item5': {
      zh: '<strong>放大查看图表时不再重叠、不再模糊</strong>。',
      en: '<strong>Enlarged charts no longer overlap or look blurry.</strong>'
    }
  });
})();
