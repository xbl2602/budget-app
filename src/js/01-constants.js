/* ============================================================
   CONSTANTS & UTILITY FUNCTIONS
   ============================================================ */
(function() {
'use strict';

// The single source of truth for the app version. Every place that shows a
// version number (settings footer, diagnostics export, <title>) reads this — do
// not hardcode a version string anywhere else.
//
// NOTE: this is display only. It does NOT drive the changelog announcements in
// 29-changelog.js: bumping APP_VERSION alone announces nothing, because the
// changelog is keyed on the entry `id`, not on the version number. See
// docs/superpowers/specs/2026-09-28-changelog-announcement-design.md.
// Do not confuse this with the cloud ledger's monotonic integer `version` in
// 28-cloud-sync.js — that is a different concept in a different IIFE.
const APP_VERSION = '3.6.0';

const COLORS = [
  '#6366F1','#10B981','#F59E0B','#EF4444','#8B5CF6','#EC4899','#14B8A6',
  '#F97316','#06B6D4','#84CC16','#A855F7','#E11D48','#0EA5E9','#D97706'
];

function escHtml(str) {
  var m = { '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;','`':'&#96;' };
  return String(str).replace(/[&<>"'`]/g, function(c) { return m[c]; });
}

const DEFAULT_CATEGORIES = [
  { id: 'cat-root-1', name: '餐饮', icon: '🍜', color: '#6366F1', parentId: null, sortOrder: 0 },
    { id: 'cat-child-1-1', name: '早餐', icon: '🥐', color: '#6366F1', parentId: 'cat-root-1', sortOrder: 0 },
    { id: 'cat-child-1-2', name: '午餐', icon: '🍱', color: '#6366F1', parentId: 'cat-root-1', sortOrder: 1 },
    { id: 'cat-child-1-3', name: '晚餐', icon: '🍽️', color: '#6366F1', parentId: 'cat-root-1', sortOrder: 2 },
    { id: 'cat-child-1-4', name: '饮料/咖啡', icon: '☕', color: '#6366F1', parentId: 'cat-root-1', sortOrder: 3 },
  { id: 'cat-root-2', name: '交通', icon: '🚗', color: '#10B981', parentId: null, sortOrder: 1 },
    { id: 'cat-child-2-1', name: '油费', icon: '⛽', color: '#10B981', parentId: 'cat-root-2', sortOrder: 0 },
    { id: 'cat-child-2-2', name: '停车', icon: '🅿️', color: '#10B981', parentId: 'cat-root-2', sortOrder: 1 },
    { id: 'cat-child-2-3', name: '公交/地铁', icon: '🚇', color: '#10B981', parentId: 'cat-root-2', sortOrder: 2 },
    { id: 'cat-child-2-4', name: '打车', icon: '🚕', color: '#10B981', parentId: 'cat-root-2', sortOrder: 3 },
  { id: 'cat-root-3', name: '购物', icon: '🛒', color: '#F59E0B', parentId: null, sortOrder: 2 },
    { id: 'cat-child-3-1', name: '日用品', icon: '🧴', color: '#F59E0B', parentId: 'cat-root-3', sortOrder: 0 },
    { id: 'cat-child-3-2', name: '服饰', icon: '👕', color: '#F59E0B', parentId: 'cat-root-3', sortOrder: 1 },
    { id: 'cat-child-3-3', name: '电子产品', icon: '📱', color: '#F59E0B', parentId: 'cat-root-3', sortOrder: 2 },
  { id: 'cat-root-4', name: '娱乐', icon: '🎮', color: '#EF4444', parentId: null, sortOrder: 3 },
    { id: 'cat-child-4-1', name: '电影', icon: '🎬', color: '#EF4444', parentId: 'cat-root-4', sortOrder: 0 },
    { id: 'cat-child-4-2', name: '游戏', icon: '🎯', color: '#EF4444', parentId: 'cat-root-4', sortOrder: 1 },
    { id: 'cat-child-4-3', name: '运动', icon: '⚽', color: '#EF4444', parentId: 'cat-root-4', sortOrder: 2 },
  { id: 'cat-root-5', name: '居住', icon: '🏠', color: '#8B5CF6', parentId: null, sortOrder: 4 },
    { id: 'cat-child-5-1', name: '房租', icon: '🏢', color: '#8B5CF6', parentId: 'cat-root-5', sortOrder: 0 },
    { id: 'cat-child-5-2', name: '水电', icon: '💡', color: '#8B5CF6', parentId: 'cat-root-5', sortOrder: 1 },
    { id: 'cat-child-5-3', name: '网络', icon: '📶', color: '#8B5CF6', parentId: 'cat-root-5', sortOrder: 2 },
  { id: 'cat-root-6', name: '医疗', icon: '💊', color: '#EC4899', parentId: null, sortOrder: 5 },
    { id: 'cat-child-6-1', name: '看病', icon: '🏥', color: '#EC4899', parentId: 'cat-root-6', sortOrder: 0 },
    { id: 'cat-child-6-2', name: '药品', icon: '💊', color: '#EC4899', parentId: 'cat-root-6', sortOrder: 1 },
  { id: 'cat-root-7', name: '教育', icon: '📚', color: '#14B8A6', parentId: null, sortOrder: 6 },
    { id: 'cat-child-7-1', name: '书籍', icon: '📖', color: '#14B8A6', parentId: 'cat-root-7', sortOrder: 0 },
    { id: 'cat-child-7-2', name: '课程', icon: '🎓', color: '#14B8A6', parentId: 'cat-root-7', sortOrder: 1 },
  { id: 'cat-root-8', name: '其他', icon: '📦', color: '#F97316', parentId: null, sortOrder: 7 }
];

// Income arrived after the ledger did, so every record written before it has no
// `type` at all. Absence therefore means expense — and it stays that way on
// purpose: `type` is only ever PRESENT when it is 'income'. Writing
// type:'expense' would put a field on every existing row, and worse, would make
// the sanitizer and the writer disagree about the same value, so a normalize
// (which every sync merge and every boot runs) would strip what a save had just
// written and the local fingerprint would never match the pushed base again.
const REC_TYPE = { EXPENSE: 'expense', INCOME: 'income' };

function isIncomeRec(r) { return !!(r && r.type === 'income'); }
function recType(r) { return isIncomeRec(r) ? REC_TYPE.INCOME : REC_TYPE.EXPENSE; }

// The single gate every "how much did I spend" question goes through. Stats used
// to read DataStore.getRecords() directly, which silently meant "spend + income"
// once income existed; routing them through here keeps the old answers correct.
function expenseRecords(list) { return (list || []).filter(r => !isIncomeRec(r)); }
function incomeRecords(list) { return (list || []).filter(r => isIncomeRec(r)); }

// Seeded on upgrade (DataStore._migrateIncomeCategories) rather than only on a
// fresh install — existing stores already have an expense `categories` array, so
// the empty-array backfill in _normalize() would never fire for them.
const DEFAULT_INCOME_CATEGORIES = [
  { id: 'inc-root-1', name: '工资', icon: '💼', color: '#10B981', parentId: null, sortOrder: 0, kind: 'income' },
    { id: 'inc-child-1-1', name: '月薪', icon: '📅', color: '#10B981', parentId: 'inc-root-1', sortOrder: 0, kind: 'income' },
    { id: 'inc-child-1-2', name: '奖金', icon: '🎉', color: '#10B981', parentId: 'inc-root-1', sortOrder: 1, kind: 'income' },
    { id: 'inc-child-1-3', name: '加班/津贴', icon: '⏰', color: '#10B981', parentId: 'inc-root-1', sortOrder: 2, kind: 'income' },
  { id: 'inc-root-2', name: '副业', icon: '🚀', color: '#06B6D4', parentId: null, sortOrder: 1, kind: 'income' },
    { id: 'inc-child-2-1', name: '接单', icon: '🧑‍💻', color: '#06B6D4', parentId: 'inc-root-2', sortOrder: 0, kind: 'income' },
    { id: 'inc-child-2-2', name: '卖闲置', icon: '📦', color: '#06B6D4', parentId: 'inc-root-2', sortOrder: 1, kind: 'income' },
  { id: 'inc-root-3', name: '报销/退款', icon: '🧾', color: '#F59E0B', parentId: null, sortOrder: 2, kind: 'income' },
    { id: 'inc-child-3-1', name: '公司报销', icon: '🏢', color: '#F59E0B', parentId: 'inc-root-3', sortOrder: 0, kind: 'income' },
    { id: 'inc-child-3-2', name: '退款/返现', icon: '↩️', color: '#F59E0B', parentId: 'inc-root-3', sortOrder: 1, kind: 'income' },
  { id: 'inc-root-4', name: '理财收益', icon: '📈', color: '#8B5CF6', parentId: null, sortOrder: 3, kind: 'income' },
    { id: 'inc-child-4-1', name: '利息', icon: '🏦', color: '#8B5CF6', parentId: 'inc-root-4', sortOrder: 0, kind: 'income' },
    { id: 'inc-child-4-2', name: '投资分红', icon: '💹', color: '#8B5CF6', parentId: 'inc-root-4', sortOrder: 1, kind: 'income' },
  { id: 'inc-root-5', name: '其他收入', icon: '🎁', color: '#EC4899', parentId: null, sortOrder: 4, kind: 'income' }
];

function uuid() {
  return Date.now().toString(36) + Math.random().toString(36).substr(2, 6);
}

function getMonthKey(dateStr) {
  const d = new Date(dateStr);
  return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0');
}

function getStatsRange() {
  return localStorage.getItem('budgetStatsRange') || 'month';
}

function getPeriodDateRange() {
  const range = getStatsRange();
  const now = new Date();
  if (range === 'month') {
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    return { 
      start, end, 
      daysInPeriod: end.getDate(), 
      daysPassed: now.getDate(),
      label: __('constants.yearMonth', now.getFullYear(), now.getMonth() + 1),
      key: now.getFullYear() + '-' + String(now.getMonth()+1).padStart(2,'0')
    };
  } else {
    const end = new Date(now);
    const start = new Date(now);
    start.setDate(start.getDate() - 29);
    const diffDays = Math.floor((end - start) / 86400000) + 1;
    return {
      start, end,
      daysInPeriod: 30,
      daysPassed: diffDays,
      label: start.toISOString().substr(5,5) + ' → ' + end.toISOString().substr(5,5),
      key: 'rolling30'
    };
  }
}

  // i18n translations
  addI18nEntries({
    'constants.yearMonth': { zh: '{0}年{1}月', en: '{1}/{0}' }
  });

  // === EXPORTS ===
  window.APP_VERSION = APP_VERSION;
  window.COLORS = COLORS;
  window.DEFAULT_CATEGORIES = DEFAULT_CATEGORIES;
  window.DEFAULT_INCOME_CATEGORIES = DEFAULT_INCOME_CATEGORIES;
  window.REC_TYPE = REC_TYPE;
  window.isIncomeRec = isIncomeRec;
  window.recType = recType;
  window.expenseRecords = expenseRecords;
  window.incomeRecords = incomeRecords;
  window.escHtml = escHtml;
  window.uuid = uuid;
  window.getMonthKey = getMonthKey;
  window.getStatsRange = getStatsRange;
  window.getPeriodDateRange = getPeriodDateRange;
})();
