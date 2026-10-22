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
    id: '2026-10-22',
    version: '3.6.8',
    date: '2026-10-22',
    title: 'changelog.a10.title',
    items: [
      { icon: '📢', text: 'changelog.a10.item1' }
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
      { icon: '🔮', text: 'changelog.a7.item4' },
      { icon: '📊', text: 'changelog.a7.item5' }
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

    'changelog.a10.title': { zh: '更新测试', en: 'Update test' },
    'changelog.a10.item1': {
      zh: '更新的时候看情况我就会这样发公告！当然也不是每一次就会发就是了',
      en: 'When I ship an update, I may post an announcement like this, depending on the situation! Of course, not every update will have one.'
    },

    'changelog.a9.title': { zh: 'v3.6.7 点分类图：下钻和看明细不再打架', en: 'What\'s in v3.6.7: drilling down and viewing records no longer collide' },
    'changelog.a9.item1': {
      zh: '<strong>点图上的色块 = 下钻；看明细 = 点表格里的那一行</strong>：以前点饼图 / 格子图 / 矩形图的色块，会同时弹出明细和下钻，两件事挤在一次点击里。现在色块只管下钻；想看某个分类的流水，展开「分类明细」，点对应的那一行。点到没有子分类的块（比如叶子分类、「月账单」）会弹一条提示，不再没反应。',
      en: '<strong>Click a chart block to drill down; click a table row to see its records</strong> - before, clicking a block on the pie / waffle / treemap did both at once, squeezing two actions into one click. Now a block only drills down; to see a category\'s records, open “Category details” and click its row. A block with nothing to drill into (a leaf category, “Monthly bills”) now shows a hint instead of doing nothing.'
    },

    'changelog.a8.title': { zh: 'v3.6.3 「含固定账单」开关终于管用了', en: 'What\'s in v3.6.3: the “Include fixed bills” switch now actually works' },
    'changelog.a8.item1': {
      zh: '<strong>「含固定账单」勾不勾，图表现在真的会变</strong>：以前统计页的饼图 / 格子图 / 矩形图，不管勾不勾，房租水电这些固定账单<strong>从来没出现过</strong>。现在勾选时每个账单是图里单独的一块（点一下能看该账单的流水），取消勾选就去掉；总览的「支出前五分类」同理。',
      en: '<strong>Ticking “Include fixed bills” now really changes the charts</strong> - before, the pie / waffle / treemap on Stats <strong>never showed</strong> fixed bills like rent and utilities, ticked or not. Now each bill is its own block while the box is ticked (tap it to see that bill\'s records) and disappears when unticked; the Overview top-5 categories follow the same rule.'
    },
    'changelog.a8.item2': {
      zh: '<strong>信用卡分期跟着这个开关走</strong>：分期的每月还款和房租一样是固定支出，取消勾选「含固定账单」时，它不再算进日常消费、日均、预测和图表，日常可花预算也会先把它扣掉。「剩余日常」的数字和以前一致；报告页、假设分析没有这个开关，口径不变。',
      en: '<strong>Card instalments follow the switch</strong> - a monthly instalment is a fixed expense just like rent, so with “Include fixed bills” unticked it is left out of daily spending, the daily average, the forecast and the charts, and the daily budget has it taken out first. “Remaining daily” is unchanged; the Report and What-If pages have no such switch and are unchanged.'
    },

    'changelog.a7.title': { zh: 'v3.6.2 记账更顺手 + 几处数字改对了', en: 'What\'s in v3.6.2: smoother entry, a few numbers corrected' },
    'changelog.a7.item1': {
      zh: '<strong>记账日期可以一键换天</strong>：日期栏左右两侧多了 ‹ › 按钮，按一下就切到前一天 / 后一天；记完一笔后<strong>日期不再被重置</strong>，连着补记同一天的账不用每笔重新选日期。',
      en: '<strong>Step the date with one tap</strong> - the date field now has ‹ and › buttons on either side to jump to the previous or next day. The date is <strong>no longer reset after saving</strong>, so you can log several entries for the same day without re-picking it.'
    },
    'changelog.a7.item2': {
      zh: '<strong>金额从「分」开始填</strong>（类似 Touch \'n Go）：只按数字键，输入 23642 就是 RM 236.42，不用再找小数点，按退格删掉最后一位。记账、预算、假设分析、分摊、购物计划等<strong>全应用的金额框</strong>都是这样；可正可负的框旁边多了 ± 按钮。',
      en: '<strong>Amounts fill in from the cents</strong> (like Touch \'n Go) - just press digits: typing 23642 gives RM 236.42, no decimal point needed, and Backspace removes the last digit. <strong>Every amount field in the app</strong> works this way (add record, budgets, what-if, split bills, purchase plans…); fields that can be negative get a ± button.'
    },
    'changelog.a7.item3': {
      zh: '<strong>追账中心只列还没收齐的</strong>：已归档的账单不再出现在「按人」里，已经还清的人也不再显示，「按账单」同理。已结清 / 已归档的账单集中放在第三个标签里，恢复和删除入口都还在。',
      en: '<strong>The split center lists only what is still owed</strong> - archived bills no longer show up under "By person", people who have fully repaid are hidden, and "By bill" works the same way. Settled and archived bills live in the third tab, where restore and delete are still available.'
    },
    'changelog.a7.item4': {
      zh: '<strong>修正假设分析的重复计算</strong>：对父分类设置调整（比如餐饮每天少花 RM 2）时，旧版把这个调整给每个子分类各算了一遍，省下的钱被成倍放大。现在整组只算一次，再按各子分类过往的花销比例分摊。',
      en: '<strong>What-if no longer double-counts</strong> - an adjustment on a parent category (say, spend RM 2 less per day on Food) used to be applied once to every subcategory, multiplying the savings. It is now applied once to the whole group and split by each subcategory\'s past spending.'
    },
    'changelog.a7.item5': {
      zh: '<strong>「日均」数字统一了</strong>：报告页底部那句「本月至今已消费…日均…」以前是用总支出除以「有消费的天数」，和总览对不上；现在全应用都是「已过天数内我自己的支出 ÷ 已过天数」。滚动 30 天的日均也不再把勾了「不计日均」的大额算进去。',
      en: '<strong>One definition of daily average</strong> - the sentence at the bottom of the report page ("spent so far this month… average per day…") used to divide by the number of days that had spending, so it disagreed with the overview. Everywhere now uses "my own spending so far ÷ days elapsed", and the rolling 30-day average also leaves out records marked "exclude from daily average".'
    },

    'changelog.a6.title': { zh: 'v3.6.1 手机上的分类页不再挤字', en: 'What\'s in v3.6.1: the categories page fits on a phone' },
    'changelog.a6.item1': {
      zh: '<strong>手机上的分类页重新排版</strong>：以前分类名会被 ⬆️ ⬇️ ➕ ⚙️ 和预算框挤得一个字都看不到。现在每个分类占两行——上面是图标和完整的名字（太长最多折成两行），下面是预算框和操作按钮；子分类的缩进也收窄了，嵌套再深名字也不会被挤没；操作图标的点击区放大，更好按。电脑端不变。',
      en: '<strong>Categories page re-laid out for phones</strong> - category names used to be squeezed to nothing by the ⬆️ ⬇️ ➕ ⚙️ icons and the budget box. Each category is now two lines: the icon and the full name on top (long names wrap to two lines), the budget box and actions below. Nesting indent is narrower so a name survives however deep it sits, and the action icons are bigger to tap. Desktop is unchanged.'
    },

    'changelog.a5.title': { zh: 'v3.6.0 口径说清楚 + 预测有明细 + 点图看记录', en: 'What\'s in v3.6.0: clearer labels, forecast breakdown, tap-to-inspect charts' },
    'changelog.a5.item1': {
      zh: '<strong>以前云里雾里的几个词改名了</strong>：「含账单」→「含固定账单」；「收支结余」拆成「预算结余」（月收入设定 − 已花 − 未付账单）和「实际结余」（流水收入 − 流水支出）；「剩余总额/天」→「剩余可花/天（未扣储蓄目标）」，旁边那格是「日常可花/天（已扣账单+储蓄）」，公式都写进小字和悬停说明。本月总支出下方注明「其中日常净支出 ＋ 账单流水」「你的实际承担 ＋ 待收回 ＝ 上方合计」。',
      en: '<strong>Confusing labels renamed</strong> - "Include bills" is now "Incl. fixed bills"; "Balance" is split into "Budget balance" (income setting − spent − unpaid bills) and "Net (recorded)" (ledger income − ledger spending); the two per-day boxes now read "Left to spend/day (pre-savings)" and "Daily spendable/day (ex-bills & savings)" with their formulas in the fine print and tooltips. The monthly total notes its daily/bill split and your-share vs to-collect breakdown.'
    },
    'changelog.a5.item2': {
      zh: '<strong>预测月总支出下方有了明细</strong>：账单趋势 ＋ 大额已发生（不计入日均） ＋ 日常趋势，三项加起来正好等于预测数，不用再猜预测是怎么算出来的。',
      en: '<strong>The forecast total shows its math</strong> - under the predicted monthly total: bill trend + large one-offs already spent (excluded from the daily average) + daily trend. The three parts always add up to the predicted number.'
    },
    'changelog.a5.item3': {
      zh: '<strong>分类三张图支持点色块看记录</strong>：饼图 / 格子图 / 矩形图点任意色块，就弹该领域在本月的全部消费记录，还能一键跳到流水页看；原来的下钻不受影响。',
      en: '<strong>Tap any chart block to inspect records</strong> - pie, waffle and treemap blocks now pop up every record of that category this month, with a jump to the ledger. Drilling into subcategories still works as before.'
    },
    'changelog.a5.item4': {
      zh: '<strong>假设分析分清收入和支出</strong>：参数面板只列支出分类——收入按设定锁定、固定账单另计，不再混在一起；结果页用徽标区分流入 / 流出，并写明「储蓄 = 收入 − 总支出 − 未付账单」。',
      en: '<strong>What-if separates income from spending</strong> - the parameters list expense categories only: income is locked to its setting and fixed bills are counted separately. Results badge inflows vs outflows and state the formula "savings = income − spending − unpaid bills".'
    },

    'changelog.a4.title': { zh: 'v3.5.0 分类可排序 + 选分类不再刷屏', en: 'What\'s in v3.5.0: sorting and a picker you can search' },
    'changelog.a4.item1': {
      zh: '<strong>分类顺序可以自己排了</strong>:分类页每一行左边多了 ⬆️ / ⬇️,子分类和根分类都能排,首尾会自动置灰。顺序存在分类本身上,云端同步会一起带走——另一台设备拉下来就是你排好的顺序。',
      en: '<strong>Reorder categories</strong> - every row on the categories page now has ⬆️ / ⬇️, for roots and subcategories alike, greyed out at the ends of the list. The order lives on the category itself, so cloud sync carries it: the other device pulls it already in the order you set.'
    },
    'changelog.a4.item2': {
      zh: '<strong>选分类不再一次铺满</strong>:记账、编辑、流水筛选、批量改分类这几个弹窗原本默认把整棵树展开,分类一多就得一路划到底。现在默认收起、点箭头逐层展开,还加了搜索框——输入分类名或 emoji,命中的结果会自动展开到看得见的位置,祖先行上还会标出有几个命中。',
      en: '<strong>Pickers that do not flood you</strong> - the add, edit, records-filter and batch-recategorise pickers used to open with the whole tree expanded, so with any depth you scrolled to the bottom just to reach 餐饮. They now start collapsed, open one branch at a time, and have a search box: type a name or an emoji and the matches are expanded into view, with each ancestor row showing how many hits it contains.'
    },

    'changelog.a3.title': { zh: 'v3.4.0 新增：收入记账', en: 'What\'s in v3.4.0: income' },
    'changelog.a3.item1': {
      zh: '<strong>可以记收入了</strong>:新增记录页顶部有「支出 / 收入」切换,收入默认带工资、副业、报销/退款、理财收益、其他收入五棵分类树。流水里收入显示为绿色带 + 号。',
      en: '<strong>Income entries</strong> - the new-record page has an expense / income switch, with five ready-made income categories (salary, side work, reimbursements, returns, investments). Income rows show green with a leading + in the ledger.'
    },
    'changelog.a3.item2': {
      zh: '<strong>收入有自己的分类树</strong>:分类页分成「支出分类」和「收入分类」两块,收入分类右侧显示本月实际到账金额而不是预算框 —— 工资没有「超支」这回事。',
      en: '<strong>Income has its own tree</strong> - the categories page is split into expenses and income. Income rows show what actually arrived this month instead of a budget box, because there is no such thing as overspending your salary.'
    },
    'changelog.a3.item3': {
      zh: '<strong>收支结余</strong>:总览、统计、报表多了「收入 / 支出 / 结余」,近半年趋势图多了一条绿色收入线,Excel 与 CSV 导出也带上了类型和收入列。',
      en: '<strong>Net cash flow</strong> - the overview, stats and report gained income / spending / net, the six-month trend chart gained a green income line, and the Excel and CSV exports carry a type column and income totals.'
    },

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
