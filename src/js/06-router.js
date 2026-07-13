/* ============================================================
   ROUTER
   ============================================================ */
(function() {
'use strict';

  // i18n translations — MUST register before pageTitles uses them
  addI18nEntries({
    'router.pageOverview': { zh: '总览', en: 'Overview' },
    'router.pageAdd': { zh: '记账', en: 'Add Record' },
    'router.pageRecords': { zh: '流水', en: 'Records' },
    'router.pageCategories': { zh: '分类', en: 'Categories' },
    'router.pageStats': { zh: '统计', en: 'Statistics' },
    'router.pageReport': { zh: '月度报告', en: 'Monthly Report' },
    'router.pageWhatif': { zh: '假设分析', en: 'What-If Analysis' },
    'router.pageSettings': { zh: '设置', en: 'Settings' }
  });

const pageTitles = {
  overview: __('router.pageOverview'),
  add: __('router.pageAdd'),
  records: __('router.pageRecords'),
  categories: __('router.pageCategories'),
  stats: __('router.pageStats'),
  report: __('router.pageReport'),
  whatif: __('router.pageWhatif'),
  settings: __('router.pageSettings')
};

let currentTab = 'overview';

function navigateTo(tab) {
  if (tab === currentTab && tab !== 'add') {
    // Force re-render if page is empty (e.g., on initial load)
    const pageEl = document.getElementById('page-' + tab);
    if (pageEl && pageEl.innerHTML.trim()) return;
  }
  const prevTab = currentTab;
  currentTab = tab;
  window.currentTab = tab;

  // Update page sections
  document.querySelectorAll('.page-section').forEach(el => el.classList.remove('active'));
  const pageEl = document.getElementById('page-' + tab);
  if (pageEl) pageEl.classList.add('active');

  // Update nav items
  document.querySelectorAll('.nav-item, .sidebar-item').forEach(el => {
    el.classList.toggle('active', el.dataset.tab === tab);
  });

  // Update title
  document.getElementById('pageTitle').textContent = pageTitles[tab] || tab;

  // Trigger render
  if (tab === 'overview') renderOverview();
  else if (tab === 'add') renderAddPage();
  else if (tab === 'records') renderRecords();
  else if (tab === 'categories') renderCategories();
  else if (tab === 'stats') renderStats();
  else if (tab === 'report') renderReport();
  else if (tab === 'whatif') renderWhatIf();
  else if (tab === 'settings') renderSettings();

  applyI18nToDOM();
}

// Navigation event listeners
document.querySelectorAll('.nav-item, .sidebar-item').forEach(el => {
  el.addEventListener('click', () => {
    const tab = el.dataset.tab;
    if (tab) {
      location.hash = '#' + tab;
    }
  });
});

  // === EXPORTS ===
  window.pageTitles = pageTitles;
  window.currentTab = currentTab;
  window.navigateTo = navigateTo;
})();
