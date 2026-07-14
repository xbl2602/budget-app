/* ============================================================
   CATEGORY PICKER COMPONENT
   ============================================================ */
(function() {
'use strict';

let selectedCategoryId = null;

function openCategoryPicker(context) {
  const cats = DataStore.getRootCategories();
  const billCats = DataStore.getBillCategories();
  let html = '<div class="modal-title">' + __('categoryPicker.title') + '</div><div style="max-height:50vh;overflow-y:auto">';

  // Regular categories section
  html += '<div class="text-sm font-semibold" style="padding:6px 4px;color:var(--text-secondary)">' + __('categoryPicker.daily') + '</div>';
  html += buildCategoryTreePicker(cats, 0, context);

  // Bill categories section
  if (billCats.length > 0) {
    html += '<div class="picker-section-header">' + __('categoryPicker.monthlyBills') + '</div>';
    billCats.forEach(cat => {
      html += `
        <div class="picker-bill-item"
             onclick="selectCategory('${cat.id}','${context}')">
          <span style="width:10px;height:10px;border-radius:50%;background:${cat.color};display:inline-block"></span>
          <span>${escHtml(cat.icon)}</span>
          <span>${escHtml(cat.name)}</span>
          <span class="picker-bill-badge">' + __('categoryPicker.billBadge') + '</span>
        </div>
      `;
    });
  }

  html += '</div><div class="modal-actions"><button class="btn btn-ghost" onclick="closeModal()">' + __('categoryPicker.cancel') + '</button></div>';
  showModal(html);
}

function buildCategoryTreePicker(cats, depth, context) {
  let html = '';
  cats.forEach(cat => {
    const children = DataStore.getChildren(cat.id);
    const indent = depth * 20;
    html += `
      <div style="padding:8px 12px;cursor:pointer;border-radius:var(--radius-sm);transition:var(--transition-fast);display:flex;align-items:center;gap:8px;margin-left:${indent}px"
           onmouseover="this.style.background='var(--bg)'" onmouseout="this.style.background=''"
           onclick="selectCategory('${cat.id}','${context}')">
        <span style="width:10px;height:10px;border-radius:50%;background:${cat.color};display:inline-block"></span>
        <span>${escHtml(cat.icon)}</span>
        <span>${escHtml(cat.name)}</span>
      </div>
    `;
    if (children.length) {
      html += buildCategoryTreePicker(children, depth + 1, context);
    }
  });
  return html;
}

function selectCategory(catId, context) {
  const cat = DataStore.getCategory(catId);
  if (!cat) return;
  selectedCategoryId = catId;
  window.selectedCategoryId = catId;
  const displayAdd = document.getElementById('addCategoryDisplay');
  const displayEdit = document.getElementById('editCategoryDisplay');
  // Use DOM API to avoid XSS via innerHTML (m5)
  const setDisplay = function(el) {
    if (!el) return;
    el.innerHTML = '';
    var dot = document.createElement('span');
    dot.style.cssText = 'width:10px;height:10px;border-radius:50%;background:' + cat.color + ';display:inline-block;vertical-align:middle';
    el.appendChild(dot);
    el.appendChild(document.createTextNode(' ' + cat.icon + ' ' + cat.name));
    el.style.color = 'var(--text-primary)';
  };
  setDisplay(displayAdd);
  setDisplay(displayEdit);
  closeModal();
}

  // i18n translations
  addI18nEntries({
    'categoryPicker.title': { zh: '选择分类', en: 'Select Category' },
    'categoryPicker.daily': { zh: '日常消费', en: 'Daily Expenses' },
    'categoryPicker.monthlyBills': { zh: '📋 月账单', en: '📋 Monthly Bills' },
    'categoryPicker.billBadge': { zh: '📋 账单', en: '📋 Bill' },
    'categoryPicker.cancel': { zh: '取消', en: 'Cancel' }
  });

  // === EXPORTS ===
  window.selectedCategoryId = selectedCategoryId;
  window.openCategoryPicker = openCategoryPicker;
  window.buildCategoryTreePicker = buildCategoryTreePicker;
  window.selectCategory = selectCategory;
})();

