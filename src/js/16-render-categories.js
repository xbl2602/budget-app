/* ============================================================
   RENDER: Categories Page
   ============================================================ */
(function() {
'use strict';
// Track expanded category nodes
let expandedCategories = new Set();

function renderCategories() {
  const el = document.getElementById('page-categories');
  const roots = DataStore.getRootCategories();

  el.innerHTML = `
    <div class="mb-16">
      <button class="btn btn-primary btn-lg btn-block" onclick="addRootCategory()">${__('categories.addRoot')}</button>
    </div>
    <p class="text-sm text-secondary mb-8" style="line-height:1.5">
      ${__('categories.headerInfo', DataStore.getCategories().length)}
      <span class="text-xs text-muted" style="cursor:pointer" onclick="document.querySelectorAll('.cat-item').forEach(function(e){expandedCategories.add(e.dataset.id);});renderCategories()">${__('categories.expandAll')}</span>
      · 
      <span class="text-xs text-muted" style="cursor:pointer" onclick="expandedCategories.clear();renderCategories()">${__('categories.collapseAll')}</span>
    </p>
    <div id="categoryTree">${buildCategoryTreeHTML(roots, 0)}</div>
  `;
}

function getBudgetMonth() {
  const now = new Date();
  return getMonthKey(now.toISOString());
}

function buildCategoryTreeHTML(cats, depth) {
  let html = '';
  const currentMonth = getBudgetMonth();
  cats.forEach(cat => {
    const children = DataStore.getChildren(cat.id);
    const hasChildren = children.length > 0;
    const expanded = expandedCategories.has(cat.id);
    const catBudget = DataStore.getCategoryBudget(cat.id, currentMonth);
    const budgetVal = catBudget.value || '';
    const budgetType = catBudget.type || 'fixed';
    
    html += `<div class="cat-item" data-id="${cat.id}">`;
    
    // === HEADER (always visible) ===
    html += `<div class="cat-header">`;
    if (hasChildren) {
      html += `<span class="cat-arrow${expanded ? ' expanded' : ''}" onclick="event.stopPropagation();toggleCatItem(this)" title="${__('categories.toggle')}">▶</span>`;
    } else {
      html += `<span class="cat-arrow-empty"></span>`;
    }
    html += `<span class="cat-dot" style="background:${cat.color}"></span>`;
    html += `<span class="cat-icon">${escHtml(cat.icon)}</span>`;
    html += `<span class="cat-name">${escHtml(cat.name)}</span>`;
    // Action icons (visible on every row)
    html += `<span class="cat-action-icons">`;
    html += `<span class="cat-action-icon" onclick="event.stopPropagation();addChildCategory('${cat.id}')" title="${__('categories.addChild')}">➕</span>`;
    html += `<span class="cat-action-icon" onclick="event.stopPropagation();editCategory('${cat.id}')" title="${__('categories.edit')}">⚙️</span>`;
    html += `</span>`;
    // Budget input group
    html += `<div class="cat-budget">`;
    html += `<input type="number" class="budget-input" value="${budgetVal}" placeholder="0" onchange="saveCategoryBudget('${cat.id}','${currentMonth}',this.value,'${budgetType}')" min="0" step="0.01">`;
    html += `<button class="budget-toggle" onclick="var inp=this.parentElement.querySelector('.budget-input');var nxt=this.innerText==='RM'?'%':'RM';this.innerText=nxt;saveCategoryBudget('${cat.id}','${currentMonth}',inp.value,nxt==='%'?'percent':'fixed')">${budgetType === 'percent' ? '%' : 'RM'}</button>`;
    html += `<span class="budget-unit">${__('categories.perMonth')}</span>`;
    html += `</div>`;
    html += `</div>`; // end header

    // === BODY (collapsible) ===
    html += `<div class="cat-body" style="max-height:${expanded ? '2000px' : '0'}">`;
    html += `<div class="cat-body-inner">`;

    // Breadcrumb for deep nesting (depth >= 4)
    if (depth >= 4) {
      html += buildBreadcrumb(cat);
    }

    // Children (recursive)
    if (hasChildren) {
      html += `<div class="cat-children">${buildCategoryTreeHTML(children, depth + 1)}</div>`;
    }
    
    html += `</div>`; // end cat-body-inner
    html += `</div>`; // end cat-body
    html += `</div>`; // end cat-item
  });
  return html;
}

function saveCategoryBudget(catId, month, value, type) {
  const amount = parseFloat(value) || 0;
  const budgetType = type || 'fixed';
  
  // Validate: child budget cannot exceed parent's budget (m9)
  const cat = DataStore.getCategory(catId);
  if (cat && cat.parentId && amount > 0) {
    const parentBudget = DataStore.getCategoryBudget(cat.parentId, month).value || 0;
    // Recursively sum all descendant budgets (not just direct children) (m9)
    var descendantBudgetSum = 0;
    (function sumDescendantBudgets(parentId) {
      var children = DataStore.getChildren(parentId);
      children.forEach(function(child) {
        if (child.id === catId) return; // exclude current
        var cb = DataStore.getCategoryBudget(child.id, month).value || 0;
        descendantBudgetSum += cb;
        sumDescendantBudgets(child.id); // recurse into grandchildren
      });
    })(cat.parentId);
    if (descendantBudgetSum + amount > parentBudget) {
      showToast(__('categories.budgetExceedParent', formatMoney(descendantBudgetSum + amount), formatMoney(parentBudget)), 'error');
      return;
    }
  }
  
  DataStore.setCategoryBudget(catId, month, amount, budgetType);
  showToast(amount > 0 ? __('categories.budgetSaved') : __('categories.budgetCleared'));
}

/* ===== CATEGORY MERGE ===== */
function mergeCategory(sourceId) {
  const sourceCat = DataStore.getCategory(sourceId);
  if (!sourceCat) return;
  _mergeSourceId = sourceId;
  _mergeTargetId = null;
  const children = DataStore.getChildren(sourceId);
  const descendants = DataStore.getDescendantIds(sourceId);
  const allCats = DataStore.getCategories().filter(c => !descendants.includes(c.id) && c.id !== sourceId);

  let html = `
    <div class="modal-title">${__('categories.merge.title')}</div>
    <p class="text-sm text-secondary mb-8">
      ${__('categories.merge.text', sourceCat.icon, escHtml(sourceCat.name))}
    </p>
    <div class="input-group">
      <label class="input-label">${__('categories.merge.selectTarget')}</label>
      <div style="max-height:30vh;overflow-y:auto;border:1px solid var(--border);border-radius:var(--radius-sm);padding:4px">`;
  html += buildMergeTargetTree(allCats.filter(c => !c.parentId), 0, sourceId, descendants);
  html += `</div></div>`;

  // If source has children, ask what to do with them
  if (children.length > 0) {
    html += `
      <div class="input-group">
        <label class="input-label">${__('categories.merge.handleChildren', children.length)}</label>
        <div class="flex flex-col gap-4" style="padding:4px 0">
          <label style="display:flex;align-items:center;gap:8px;cursor:pointer;padding:6px 8px;border-radius:var(--radius-sm);background:var(--bg)">
            <input type="radio" name="mergeChildren" value="move" checked>
            <span class="text-sm">${__('categories.merge.moveChildren')}</span>
          </label>
          <label style="display:flex;align-items:center;gap:8px;cursor:pointer;padding:6px 8px;border-radius:var(--radius-sm);background:var(--bg)">
            <input type="radio" name="mergeChildren" value="delete">
            <span class="text-sm" style="color:var(--danger)">${__('categories.merge.deleteChildren')}</span>
          </label>
        </div>
      </div>`;
  }

  html += `
    <div class="modal-actions">
      <button class="btn btn-ghost" onclick="closeModal()">${__('categories.cancel')}</button>
      <button class="btn btn-primary" onclick="confirmMergeCategory()" id="mergeConfirmBtn" disabled>${__('categories.merge.selectFirst')}</button>
    </div>`;
  showModal(html);
}

function buildMergeTargetTree(cats, depth, sourceId, excludeIds) {
  let html = '';
  cats.forEach(cat => {
    if (excludeIds && excludeIds.includes(cat.id)) return;
    if (cat.id === sourceId) return;
    const children = DataStore.getChildren(cat.id);
    const indent = depth * 20;
    html += `
      <div style="padding:6px 10px;cursor:pointer;border-radius:var(--radius-sm);transition:var(--transition-fast);display:flex;align-items:center;gap:6px;margin-left:${indent}px"
           onmouseover="this.style.background='var(--bg)'" onmouseout="this.style.background=''"
           onclick="selectMergeTarget('${cat.id}','${escHtml(cat.icon)} ${escHtml(cat.name)}')">
        <span style="width:10px;height:10px;border-radius:50%;background:${cat.color};display:inline-block"></span>
        <span>${escHtml(cat.icon)}</span>
        <span class="text-sm">${escHtml(cat.name)}</span>
      </div>`;
    if (children.length) {
      html += buildMergeTargetTree(children, depth + 1, sourceId, excludeIds);
    }
  });
  return html;
}

let _mergeSourceId = null;
let _mergeTargetId = null;

function selectMergeTarget(catId, displayName) {
  _mergeTargetId = catId;
  const btn = document.getElementById('mergeConfirmBtn');
  if (btn) {
    btn.disabled = false;
    btn.textContent = __('categories.merge.mergeInto', displayName);
  }
}

function confirmMergeCategory() {
  const sourceId = _mergeSourceId;
  const targetId = _mergeTargetId;
  if (!sourceId || !targetId) {
    showToast(__('categories.merge.selectTargetFirst'), 'error');
    return;
  }
  if (sourceId === targetId) {
    showToast(__('categories.merge.cannotSelf'), 'error');
    return;
  }

  // Determine children handling
  const children = DataStore.getChildren(sourceId);
  let handleChildren = 'move';
  const childrenRadios = document.querySelectorAll('input[name="mergeChildren"]');
  if (childrenRadios.length > 0) {
    childrenRadios.forEach(r => { if (r.checked) handleChildren = r.value; });
  }

  const sourceCat = DataStore.getCategory(sourceId);
  const targetCat = DataStore.getCategory(targetId);
  if (!sourceCat || !targetCat) { showToast(__('categories.notFound'), 'error'); return; }

  // Get all descendant IDs of source (including source)
  const descIds = DataStore.getDescendantIds(sourceId);

  // Update all records belonging to source or its descendants
  const records = DataStore.getRecords();
  let updatedCount = 0;
  records.forEach(r => {
    if (descIds.includes(r.categoryId)) {
      r.categoryId = targetId;
      r.updatedAt = new Date().toISOString();
      updatedCount++;
    }
  });

  // Handle children categories
  if (handleChildren === 'move') {
    children.forEach(child => {
      child.parentId = targetId;
    });
  } else if (handleChildren === 'delete') {
    // Delete all children (and recursively their children)
    const deleteRecursive = (id) => {
      const grandChildren = DataStore.getChildren(id);
      grandChildren.forEach(gc => deleteRecursive(gc.id));
      DataStore._data.categories = DataStore._data.categories.filter(c => c.id !== id);
    };
    children.forEach(child => deleteRecursive(child.id));
  }

  // Delete the source category itself
  DataStore._data.categories = DataStore._data.categories.filter(c => c.id !== sourceId);
  DataStore.save();

  closeModal();
  _mergeSourceId = null;
  _mergeTargetId = null;
  showToast(__('categories.merge.complete', updatedCount));
  renderCategories();
}

function toggleCatItem(arrowEl) {
  const item = arrowEl.closest('.cat-item');
  if (!item) return;
  const body = item.querySelector('.cat-body');
  const catId = item.dataset.id;
  if (!body || !catId) return;
  const isExpanded = expandedCategories.has(catId);
  
  if (isExpanded) {
    // Collapse: lock current height instantly, then animate to 0
    body.style.transition = 'none';
    body.style.maxHeight = body.scrollHeight + 'px';
    expandedCategories.delete(catId);
    arrowEl.classList.remove('expanded');
    requestAnimationFrame(() => {
      body.style.transition = '';
      body.style.maxHeight = '0';
    });
  } else {
    // Expand
    expandedCategories.add(catId);
    arrowEl.classList.add('expanded');
    requestAnimationFrame(() => {
      const h = body.scrollHeight;
      body.style.maxHeight = h + 'px';
      // After animation, free constraint so nested expansions work
      setTimeout(() => {
        if (expandedCategories.has(catId)) {
          body.style.maxHeight = 'none';
        }
      }, 400);
    });
  }
}

function addRootCategory() {
  showModal(`
    <div class="modal-title">${__('categories.addRootModal.title')}</div>
    <div class="input-group">
      <label class="input-label">${__('categories.name')}</label>
      <input type="text" id="newCatName" class="input-field" placeholder="${__('categories.namePlaceholder')}">
    </div>
    <div class="input-group">
      <label class="input-label">${__('categories.icon')}</label>
      <input type="text" id="newCatIcon" class="input-field" value="📁" placeholder="${__('categories.iconPlaceholder')}">
    </div>
    <div class="modal-actions">
      <button class="btn btn-ghost" onclick="closeModal()">${__('categories.cancel')}</button>
      <button class="btn btn-primary" onclick="confirmAddRootCategory()">${__('categories.add')}</button>
    </div>
  `);
}

function confirmAddRootCategory() {
  const name = document.getElementById('newCatName').value.trim();
  const icon = document.getElementById('newCatIcon').value.trim();
  if (!name) { showToast(__('categories.nameRequired'), 'error'); return; }
  DataStore.addCategory({ name, icon: icon || '📁', parentId: null, sortOrder: DataStore.getRootCategories().length });
  closeModal();
  showToast(__('categories.added'));
  renderCategories();
}

function addChildCategory(parentId) {
  showModal(`
    <div class="modal-title">${__('categories.addChildModal.title')}</div>
    <div class="input-group">
      <label class="input-label">${__('categories.name')}</label>
      <input type="text" id="newChildName" class="input-field" placeholder="${__('categories.childNamePlaceholder')}">
    </div>
    <div class="input-group">
      <label class="input-label">${__('categories.icon')}</label>
      <input type="text" id="newChildIcon" class="input-field" value="📁" placeholder="${__('categories.iconPlaceholder')}">
    </div>
    <div class="modal-actions">
      <button class="btn btn-ghost" onclick="closeModal()">${__('categories.cancel')}</button>
      <button class="btn btn-primary" onclick="confirmAddChildCategory('${parentId}')">${__('categories.add')}</button>
    </div>
  `);
}

function confirmAddChildCategory(parentId) {
  const name = document.getElementById('newChildName').value.trim();
  const icon = document.getElementById('newChildIcon').value.trim();
  if (!name) { showToast(__('categories.nameRequired'), 'error'); return; }
  const children = DataStore.getChildren(parentId);
  DataStore.addCategory({ name, icon: icon || '📁', parentId, sortOrder: children.length });
  closeModal();
  showToast(__('categories.childAdded'));
  renderCategories();
}

function renameCategory(id) {
  const cat = DataStore.getCategory(id);
  if (!cat) return;
  showModal(`
    <div class="modal-title">${__('categories.rename.title')}</div>
    <div class="input-group">
      <label class="input-label">${__('categories.name')}</label>
      <input type="text" id="renameInput" class="input-field" value="${escHtml(cat.name)}">
    </div>
    <div class="modal-actions">
      <button class="btn btn-ghost" onclick="closeModal()">${__('categories.cancel')}</button>
      <button class="btn btn-primary" onclick="confirmRenameCategory('${id}')">${__('categories.save')}</button>
    </div>
  `);
}

function confirmRenameCategory(id) {
  const name = document.getElementById('renameInput').value.trim();
  if (!name) { showToast(__('categories.nameRequired'), 'error'); return; }
  DataStore.updateCategory(id, { name });
  closeModal();
  showToast(__('categories.renamed'));
  renderCategories();
}

const EMOJI_GRID = ['🍜','🥐','🍱','🍽️','☕','🚗','⛽','🅿️','🚇','🚕','🛒','🧴','👕','📱','🎮','🎬','🎯','⚽','🏠','🏢','💡','📶','💊','🏥','📚','📖','🎓','📦','🍕','🍔','🍟','🌮','🥗','🍣','🍤','🥟','🍦','🍰','🥤','🧋','🍵','🏪','💈','✈️','🎒','👟','🧢','💄','👜','⌚','🎧','📷','💻','🖥️','🖨️','🎨','🔧','🔨','🧰','🎁','💎','🔑','🧸','🎈','🌸','🌻','🔥','⭐','🌈','☀️','🌙','💧','❄️','🍀','🎵','🎶','🎉','🎊','🕹️','📌','📍','✉️','📝','🗂️','🔒','🔓','🔔','🚀','🛸','⚡','💫'];

function changeCategoryIcon(id) {
  const cat = DataStore.getCategory(id);
  if (!cat) return;
  let html = `<div class="modal-title">${__('categories.iconPicker.title', escHtml(cat.name))}</div><div style="display:grid;grid-template-columns:repeat(6,1fr);gap:4px;max-height:50vh;overflow-y:auto">`;
  EMOJI_GRID.forEach(emoji => {
    html += `<div style="font-size:1.5rem;padding:8px;text-align:center;cursor:pointer;border-radius:var(--radius-sm);transition:var(--transition-fast)" 
                  onmouseover="this.style.background='var(--bg)'" onmouseout="this.style.background=''"
                  onclick="confirmChangeIcon('${id}','${emoji}')">${emoji}</div>`;
  });
  html += '</div><div class="modal-actions"><button class="btn btn-ghost" onclick="closeModal()">' + __('categories.cancel') + '</button></div>';
  showModal(html);
}

function confirmChangeIcon(id, icon) {
  DataStore.updateCategory(id, { icon });
  closeModal();
  showToast(__('categories.iconUpdated'));
  renderCategories();
}

function changeCategoryColor(id) {
  const cat = DataStore.getCategory(id);
  if (!cat) return;
  let html = `<div class="modal-title">${__('categories.colorPicker.title', escHtml(cat.name))}</div><div style="display:grid;grid-template-columns:repeat(7,1fr);gap:8px;margin-bottom:12px">`;
  COLORS.forEach(c => {
    const isSelected = c === cat.color;
    html += `<div style="width:36px;height:36px;border-radius:50%;background:${c};cursor:pointer;border:${isSelected ? '3px solid #000' : '2px solid transparent'};transition:var(--transition-fast)"
                  onclick="confirmChangeColor('${id}','${c}')"></div>`;
  });
  html += '</div>';
  html += `<div class="input-group"><label class="input-label">${__('categories.colorPicker.custom')}</label><input type="text" id="customColorInput" class="input-field" placeholder="${__('categories.colorPicker.placeholder')}" value="${cat.color}"></div>`;
  html += `<div class="modal-actions"><button class="btn btn-ghost" onclick="closeModal()">${__('categories.cancel')}</button><button class="btn btn-primary" onclick="confirmCustomColor('${id}')">${__('categories.colorPicker.apply')}</button></div>`;
  showModal(html);
}

function confirmChangeColor(id, color) {
  DataStore.updateCategory(id, { color });
  closeModal();
  showToast(__('categories.colorUpdated'));
  renderCategories();
}

function confirmCustomColor(id) {
  const color = document.getElementById('customColorInput').value.trim();
  if (!/^#[0-9a-fA-F]{6}$/.test(color)) { showToast(__('categories.colorPicker.invalidHex'), 'error'); return; }
  DataStore.updateCategory(id, { color });
  closeModal();
  showToast(__('categories.colorUpdated'));
  renderCategories();
}

function moveCategory(id) {
  const cat = DataStore.getCategory(id);
  if (!cat) return;
  const cats = DataStore.getRootCategories();
  const descendants = DataStore.getDescendantIds(id);

  let html = `<div class="modal-title">${__('categories.move.title', escHtml(cat.icon), escHtml(cat.name))}</div>
    <p class="text-sm text-secondary mb-8">${__('categories.move.text')}</p>
    <div style="max-height:50vh;overflow-y:auto">`;
  html += buildMoveTree(cats, 0, descendants, id);
  html += '</div>';
  html += `<div class="modal-actions">
    <button class="btn btn-ghost" onclick="closeModal()">${__('categories.cancel')}</button>
    <button class="btn btn-ghost" onclick="confirmMoveCategory('${id}','')">${__('categories.move.toRoot')}</button>
  </div>`;
  showModal(html);
}

function buildMoveTree(cats, depth, excludeIds, movingId) {
  let html = '';
  cats.forEach(cat => {
    if (excludeIds.includes(cat.id)) return;
    const children = DataStore.getChildren(cat.id);
    const indent = depth * 20;
    html += `
      <div style="padding:8px 12px;cursor:pointer;border-radius:var(--radius-sm);transition:var(--transition-fast);display:flex;align-items:center;gap:8px;margin-left:${indent}px"
           onmouseover="this.style.background='var(--bg)'" onmouseout="this.style.background=''"
           onclick="confirmMoveCategory('${movingId}','${cat.id}')">
        <span style="width:10px;height:10px;border-radius:50%;background:${cat.color};display:inline-block"></span>
        <span>${escHtml(cat.icon)}</span>
        <span>${escHtml(cat.name)}</span>
      </div>
    `;
    if (children.length) {
      html += buildMoveTree(children, depth + 1, excludeIds, movingId);
    }
  });
  return html;
}

function confirmMoveCategory(id, newParentId) {
  // Prevent circular reference
  if (newParentId && DataStore.getDescendantIds(id).includes(newParentId)) {
    showToast(__('categories.move.circularRef'), 'error');
    return;
  }
  DataStore.updateCategory(id, { parentId: newParentId || null });
  closeModal();
  showToast(__('categories.moved'));
  renderCategories();
}

function deleteCategoryConfirm(id) {
  const cat = DataStore.getCategory(id);
  if (!cat) return;
  const children = DataStore.getChildren(id);

  if (children.length) {
    showModal(`
      <div class="modal-title">${__('categories.delete.title')}</div>
      <p style="color:var(--text-secondary);margin-bottom:12px">${__('categories.delete.hasChildren', escHtml(cat.icon), escHtml(cat.name), children.length)}</p>
      <div class="flex flex-col gap-8 mb-16">
        <button class="btn btn-outline btn-block" onclick="confirmDeleteCategory('${id}','deleteChildren')">${__('categories.delete.deleteChildren')}</button>
        <button class="btn btn-outline btn-block" onclick="showMoveBeforeDelete('${id}')">${__('categories.delete.moveToParent')}</button>
      </div>
      <div class="modal-actions"><button class="btn btn-ghost" onclick="closeModal()">${__('categories.cancel')}</button></div>
    `);
  } else {
    showModal(`
      <div class="modal-title">${__('categories.delete.confirmTitle')}</div>
      <p style="color:var(--text-secondary);margin-bottom:16px">${__('categories.delete.confirmText', escHtml(cat.icon), escHtml(cat.name))}</p>
      <div class="modal-actions">
        <button class="btn btn-ghost" onclick="closeModal()">${__('categories.cancel')}</button>
        <button class="btn btn-danger" onclick="confirmDeleteCategory('${id}','delete')">${__('categories.delete')}</button>
      </div>
    `);
  }
}

function showMoveBeforeDelete(id) {
  const cat = DataStore.getCategory(id);
  const parentId = cat.parentId;
  showModal(`
    <div class="modal-title">${__('categories.delete.moveTitle')}</div>
    <p class="text-sm text-secondary mb-8">${__('categories.delete.willMoveTo', parentId ? DataStore.getCategory(parentId).icon + ' ' + DataStore.getCategory(parentId).name : __('categories.rootLevel'))}</p>
    <div class="modal-actions">
      <button class="btn btn-ghost" onclick="deleteCategoryConfirm('${id}')">${__('categories.back')}</button>
      <button class="btn btn-danger" onclick="confirmDeleteCategory('${id}','moveToParent')">${__('categories.delete.confirm')}</button>
    </div>
  `);
}

function confirmDeleteCategory(id, mode) {
  if (mode === 'delete' || mode === 'deleteChildren') {
    DataStore.deleteCategory(id, { deleteChildren: true });
  } else if (mode === 'moveToParent') {
    const cat = DataStore.getCategory(id);
    DataStore.deleteCategory(id, { moveToParent: cat.parentId });
  }
  closeModal();
  showToast(__('categories.deleted'));
  renderCategories();
}

function buildBreadcrumb(cat) {
  // Walk up the parent chain to collect ancestors
  const ancestors = [];
  let current = cat;
  let guard = 0;
  while (current && current.parentId && guard < 20) {
    current = DataStore.getCategory(current.parentId);
    if (current) ancestors.unshift(current);
    guard++;
  }
  
  let html = '<div class="cat-breadcrumb">';
  
  if (ancestors.length <= 2) {
    // Show all ancestors
    ancestors.forEach(a => {
      html += `<span class="crumb-item" onclick="expandAndScrollTo('${a.id}')">${escHtml(a.icon)} ${escHtml(a.name)}</span>`;
      html += '<span class="crumb-sep">/</span>';
    });
  } else {
    // First ancestor
    html += `<span class="crumb-item" onclick="expandAndScrollTo('${ancestors[0].id}')">${escHtml(ancestors[0].icon)} ${escHtml(ancestors[0].name)}</span>`;
    html += '<span class="crumb-sep">/</span>';
    // Ellipsis for hidden levels
    html += '<span class="crumb-item" style="cursor:default;color:var(--text-muted)">⋯</span>';
    html += '<span class="crumb-sep">/</span>';
    // Last ancestor (the direct parent)
    html += `<span class="crumb-item" onclick="expandAndScrollTo('${ancestors[ancestors.length - 1].id}')">${escHtml(ancestors[ancestors.length - 1].icon)} ${escHtml(ancestors[ancestors.length - 1].name)}</span>`;
    html += '<span class="crumb-sep">/</span>';
  }

  // Current category
  html += `<span class="crumb-current">${escHtml(cat.icon)} ${escHtml(cat.name)}</span>`;
  html += '</div>';

  return html;
}

function expandAndScrollTo(catId) {
  // Expand all ancestors so this category becomes visible
  const cat = DataStore.getCategory(catId);
  if (!cat) return;
  
  // Walk up and expand each ancestor
  let current = cat;
  let guard = 0;
  while (current && current.parentId && guard < 30) {
    const parent = DataStore.getCategory(current.parentId);
    if (parent) {
      expandedCategories.add(parent.id);
      current = parent;
    } else break;
    guard++;
  }
  
  // Re-render the tree
  renderCategories();
  
  // Scroll to the target element (after DOM update)
  setTimeout(() => {
    const el = document.querySelector(`.cat-item[data-id="${catId}"]`);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, 50);
}

function editCategory(catId) {
  const cat = DataStore.getCategory(catId);
  if (!cat) return;
  
  const breadcrumbHtml = buildBreadcrumb(cat);
  
  let html = `<div class="modal-title">${__('categories.edit.title')}</div>`;
  html += breadcrumbHtml;
  
  // Name
  html += `<div class="input-group">
    <label class="input-label">${__('categories.name')}</label>
    <input type="text" id="editCatName" class="input-field" value="${escHtml(cat.name)}">
  </div>`;
  
  // Icon — opens existing changeCategoryIcon modal
  html += `<div class="input-group">
    <label class="input-label">${__('categories.iconLabel')}</label>
    <div style="display:flex;align-items:center;gap:8px;padding:4px 0">
      <span style="font-size:1.5rem">${escHtml(cat.icon)}</span>
      <button class="btn btn-outline btn-sm" onclick="closeModal();setTimeout(function(){changeCategoryIcon('${catId}')},100)">${__('categories.edit.changeIcon')}</button>
    </div>
  </div>`;
  
  // Color — opens existing changeCategoryColor modal
  html += `<div class="input-group">
    <label class="input-label">${__('categories.colorLabel')}</label>
    <div style="display:flex;align-items:center;gap:8px;padding:4px 0">
      <span style="width:22px;height:22px;border-radius:50%;background:${cat.color};display:inline-block;border:1px solid var(--border)"></span>
      <button class="btn btn-outline btn-sm" onclick="closeModal();setTimeout(function(){changeCategoryColor('${catId}')},100)">${__('categories.edit.changeColor')}</button>
    </div>
  </div>`;
  
  // Operations
  html += `<div style="border-top:1px solid var(--border);padding-top:12px;margin-top:12px">
    <div style="display:flex;gap:8px;flex-wrap:wrap">
      <button class="btn btn-outline btn-sm" onclick="closeModal();moveCategory('${catId}')">${__('categories.edit.move')}</button>
      <button class="btn btn-outline btn-sm" onclick="closeModal();mergeCategory('${catId}')">${__('categories.edit.merge')}</button>
      <button class="btn btn-danger btn-sm" onclick="closeModal();deleteCategoryConfirm('${catId}')">${__('categories.edit.delete')}</button>
    </div>
  </div>`;
  
  // Actions
  html += `<div class="modal-actions">
    <button class="btn btn-ghost" onclick="closeModal()">${__('categories.cancel')}</button>
    <button class="btn btn-primary" onclick="saveCategoryEdit('${catId}')">${__('categories.save')}</button>
  </div>`;
  
  showModal(html);
}

function saveCategoryEdit(catId) {
  const name = document.getElementById('editCatName').value.trim();
  if (name) DataStore.updateCategory(catId, { name });
  closeModal();
  showToast(__('categories.renamed'));
  renderCategories();
}

  // === EXPORTS ===
  window.expandedCategories = expandedCategories;
  window.renderCategories = renderCategories;
  window.getBudgetMonth = getBudgetMonth;
  window.buildCategoryTreeHTML = buildCategoryTreeHTML;
  window.saveCategoryBudget = saveCategoryBudget;
  window.mergeCategory = mergeCategory;
  window.buildMergeTargetTree = buildMergeTargetTree;
  window.selectMergeTarget = selectMergeTarget;
  window.confirmMergeCategory = confirmMergeCategory;
  window.toggleCatItem = toggleCatItem;
  window.addRootCategory = addRootCategory;
  window.confirmAddRootCategory = confirmAddRootCategory;
  window.addChildCategory = addChildCategory;
  window.confirmAddChildCategory = confirmAddChildCategory;
  window.renameCategory = renameCategory;
  window.confirmRenameCategory = confirmRenameCategory;
  window.EMOJI_GRID = EMOJI_GRID;
  window.changeCategoryIcon = changeCategoryIcon;
  window.confirmChangeIcon = confirmChangeIcon;
  window.changeCategoryColor = changeCategoryColor;
  window.confirmChangeColor = confirmChangeColor;
  window.confirmCustomColor = confirmCustomColor;
  window.moveCategory = moveCategory;
  window.buildMoveTree = buildMoveTree;
  window.confirmMoveCategory = confirmMoveCategory;
  window.deleteCategoryConfirm = deleteCategoryConfirm;
  window.showMoveBeforeDelete = showMoveBeforeDelete;
  window.confirmDeleteCategory = confirmDeleteCategory;
  window.buildBreadcrumb = buildBreadcrumb;
  window.expandAndScrollTo = expandAndScrollTo;
  window.editCategory = editCategory;
  window.saveCategoryEdit = saveCategoryEdit;

  // === I18N ENTRIES ===
  addI18nEntries({
    'categories.addRoot': { zh: '➕ 添加根分类', en: '➕ Add root category' },
    'categories.headerInfo': { zh: '{0} 个分类 · 点击 ▶ 展开查看子分类 · 预算输入框始终可见 · ', en: '{0} categories · Click ▶ to expand subcategories · Budget inputs always visible · ' },
    'categories.expandAll': { zh: '展开全部', en: 'Expand all' },
    'categories.collapseAll': { zh: '折叠全部', en: 'Collapse all' },
    'categories.toggle': { zh: '展开/折叠', en: 'Expand/Collapse' },
    'categories.addChild': { zh: '添加子分类', en: 'Add subcategory' },
    'categories.edit': { zh: '编辑分类', en: 'Edit category' },
    'categories.perMonth': { zh: '/月', en: '/month' },
    'categories.budgetExceedParent': { zh: '⚠️ 子项预算总和 ({0}) 超过了父级预算 ({1})，未保存', en: '⚠️ Sub-budget total ({0}) exceeds parent budget ({1}), not saved' },
    'categories.budgetSaved': { zh: '✅ 预算已保存', en: '✅ Budget saved' },
    'categories.budgetCleared': { zh: 'ℹ️ 预算已清除', en: 'ℹ️ Budget cleared' },
    'categories.merge.title': { zh: '合并分类', en: 'Merge category' },
    'categories.merge.text': { zh: '将 <strong>{0} {1}</strong> 合并到其他分类。<br>所有记录将重新归类到目标分类。', en: 'Merge <strong>{0} {1}</strong> into another category.<br>All records will be re-assigned to the target category.' },
    'categories.merge.selectTarget': { zh: '选择目标分类', en: 'Select target category' },
    'categories.merge.handleChildren': { zh: '处理子分类 ({0} 个)', en: 'Handle subcategories ({0})' },
    'categories.merge.moveChildren': { zh: '将子分类移至目标分类下', en: 'Move subcategories under target' },
    'categories.merge.deleteChildren': { zh: '删除所有子分类', en: 'Delete all subcategories' },
    'categories.cancel': { zh: '取消', en: 'Cancel' },
    'categories.merge.selectFirst': { zh: '请先选择目标分类', en: 'Please select a target category first' },
    'categories.merge.mergeInto': { zh: '合并到 {0}', en: 'Merge into {0}' },
    'categories.merge.selectTargetFirst': { zh: '请选择目标分类', en: 'Please select a target category' },
    'categories.merge.cannotSelf': { zh: '不能合并到自身', en: 'Cannot merge into itself' },
    'categories.notFound': { zh: '分类不存在', en: 'Category not found' },
    'categories.merge.complete': { zh: '✅ 合并完成，已更新 {0} 条记录', en: '✅ Merge complete, updated {0} records' },
    'categories.addRootModal.title': { zh: '添加根分类', en: 'Add root category' },
    'categories.name': { zh: '名称', en: 'Name' },
    'categories.namePlaceholder': { zh: '分类名称', en: 'Category name' },
    'categories.icon': { zh: '图标 (Emoji)', en: 'Icon (Emoji)' },
    'categories.iconPlaceholder': { zh: '输入 emoji', en: 'Enter emoji' },
    'categories.add': { zh: '添加', en: 'Add' },
    'categories.nameRequired': { zh: '请输入分类名称', en: 'Please enter a category name' },
    'categories.added': { zh: '✅ 分类已添加', en: '✅ Category added' },
    'categories.addChildModal.title': { zh: '添加子分类', en: 'Add subcategory' },
    'categories.childNamePlaceholder': { zh: '子分类名称', en: 'Subcategory name' },
    'categories.childAdded': { zh: '✅ 子分类已添加', en: '✅ Subcategory added' },
    'categories.rename.title': { zh: '重命名', en: 'Rename' },
    'categories.save': { zh: '保存', en: 'Save' },
    'categories.renamed': { zh: '✅ 名称已更新', en: '✅ Name updated' },
    'categories.iconPicker.title': { zh: '选择图标 — {0}', en: 'Select icon — {0}' },
    'categories.iconUpdated': { zh: '✅ 图标已更新', en: '✅ Icon updated' },
    'categories.colorPicker.title': { zh: '选择颜色 — {0}', en: 'Select color — {0}' },
    'categories.colorPicker.custom': { zh: '自定义颜色 (HEX)', en: 'Custom color (HEX)' },
    'categories.colorPicker.placeholder': { zh: '#RRGGBB', en: '#RRGGBB' },
    'categories.colorPicker.apply': { zh: '应用', en: 'Apply' },
    'categories.colorUpdated': { zh: '✅ 颜色已更新', en: '✅ Color updated' },
    'categories.colorPicker.invalidHex': { zh: '请输入有效HEX颜色', en: 'Please enter a valid HEX color' },
    'categories.move.title': { zh: '移动分类 — {0} {1}', en: 'Move category — {0} {1}' },
    'categories.move.text': { zh: '选择目标父分类（留空则移至根级别）', en: 'Select target parent (leave empty to move to root level)' },
    'categories.move.toRoot': { zh: '移至根级别', en: 'Move to root level' },
    'categories.move.circularRef': { zh: '不能将分类移到自己或子分类下', en: 'Cannot move category under itself or its descendants' },
    'categories.moved': { zh: '✅ 分类已移动', en: '✅ Category moved' },
    'categories.delete.title': { zh: '删除分类', en: 'Delete category' },
    'categories.delete.hasChildren': { zh: '分类 "{0} {1}" 有 {2} 个子分类，如何处理？', en: 'Category "{0} {1}" has {2} subcategories. How to proceed?' },
    'categories.delete.deleteChildren': { zh: '🗑️ 同时删除所有子分类', en: '🗑️ Delete all subcategories too' },
    'categories.delete.moveToParent': { zh: '📦 将子分类移至上级', en: '📦 Move subcategories to parent' },
    'categories.delete.confirmTitle': { zh: '确认删除', en: 'Confirm delete' },
    'categories.delete.confirmText': { zh: '确定要删除分类 "{0} {1}" 吗？', en: 'Are you sure you want to delete category "{0} {1}"?' },
    'categories.delete': { zh: '删除', en: 'Delete' },
    'categories.delete.moveTitle': { zh: '移动子分类', en: 'Move subcategories' },
    'categories.delete.willMoveTo': { zh: '子分类将被移至：{0}', en: 'Subcategories will be moved to: {0}' },
    'categories.rootLevel': { zh: '根级别', en: 'Root level' },
    'categories.back': { zh: '返回', en: 'Back' },
    'categories.delete.confirm': { zh: '确认删除', en: 'Confirm delete' },
    'categories.deleted': { zh: '✅ 分类已删除', en: '✅ Category deleted' },
    'categories.edit.title': { zh: '编辑分类', en: 'Edit category' },
    'categories.iconLabel': { zh: '图标', en: 'Icon' },
    'categories.edit.changeIcon': { zh: '🎨 更改图标', en: '🎨 Change icon' },
    'categories.colorLabel': { zh: '颜色', en: 'Color' },
    'categories.edit.changeColor': { zh: '🌈 更改颜色', en: '🌈 Change color' },
    'categories.edit.move': { zh: '📦 移动到…', en: '📦 Move to…' },
    'categories.edit.merge': { zh: '🔀 合并到…', en: '🔀 Merge to…' },
    'categories.edit.delete': { zh: '🗑️ 删除', en: '🗑️ Delete' }
  });
})();
