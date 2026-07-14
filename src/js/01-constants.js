/* ============================================================
   CONSTANTS & UTILITY FUNCTIONS
   ============================================================ */
(function() {
'use strict';

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
  window.COLORS = COLORS;
  window.DEFAULT_CATEGORIES = DEFAULT_CATEGORIES;
  window.escHtml = escHtml;
  window.uuid = uuid;
  window.getMonthKey = getMonthKey;
  window.getStatsRange = getStatsRange;
  window.getPeriodDateRange = getPeriodDateRange;
})();
