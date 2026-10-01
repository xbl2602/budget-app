/* ============================================================
   CATEGORY PICKER COMPONENT
   ============================================================ */
(function() {
'use strict';

let selectedCategoryId = null;
let _pickerPrev = null; // snapshot of the modal the picker was opened from
let _pickerDisp = null; // category info re-applied to the restored modal's display

function _applyDisplay(el, cat, suffix) {
  if (!el || !cat) return;
  el.innerHTML = '';
  var dot = document.createElement('span');
  dot.style.cssText = 'width:10px;height:10px;border-radius:50%;background:' + cat.color + ';display:inline-block;vertical-align:middle';
  el.appendChild(dot);
  el.appendChild(document.createTextNode(' ' + cat.icon + ' ' + cat.name + (suffix || '')));
  el.style.color = 'var(--text-primary)';
}

function _pickerCapture() {
  const overlay = document.getElementById('modalOverlay');
  const wasOpen = overlay && overlay.classList.contains('open');
  if (wasOpen) {
    const content = document.getElementById('modalContent');
    _pickerPrev = { html: content.innerHTML };
  } else {
    _pickerPrev = null;
  }
}

// Restore the modal the picker replaced (e.g. record edit form) instead of
// destroying it; falls back to a plain close when no modal was open before
function pickerRestore() {
  if (_pickerPrev && _pickerPrev.html !== null) {
    const content = document.getElementById('modalContent');
    const overlay = document.getElementById('modalOverlay');
    if (content) content.innerHTML = _pickerPrev.html;
    if (_pickerDisp) {
      _applyDisplay(document.getElementById('editCategoryDisplay'), _pickerDisp.cat, _pickerDisp.suffix || '');
      _applyDisplay(document.getElementById('addCategoryDisplay'), _pickerDisp.cat, '');
      _pickerDisp = null;
    }
    if (overlay) {
      overlay.classList.add('open');
      document.body.classList.add('modal-open');
    }
    _pickerPrev = null;
    return;
  }
  closeModal();
}

// Which tree to show. An income record must be filed under an income category and
// an expense under an expense one — otherwise the two disagree and the row lands
// in neither set of totals (DataStore._repairRecordTypes would silently drag it
// back later, undoing the user's choice). Callers set the kind before opening;
// it defaults to expense, which is what every picker in the app wants except the
// add/edit form in income mode.
let _pickerKind = 'expense';

function _kindForContext(context) {
  if (context === 'add') return window._addRecordType === 'income' ? 'income' : 'expense';
  if (context === 'edit') return window._editRecordType === 'income' ? 'income' : 'expense';
  // 'split-edit' and anything else always files spending
  return 'expense';
}

function openCategoryPicker(context) {
  _pickerKind = _kindForContext(context);
  const isIncome = _pickerKind === 'income';
  const roots = isIncome ? DataStore.getIncomeRootCategories() : DataStore.getExpenseRootCategories();
  const billCats = isIncome ? [] : DataStore.getBillCategories();
  _pickerCapture();
  const sections = [{
    title: isIncome ? __('categoryPicker.income') : __('categoryPicker.daily'),
    // Read through a getter, not a snapshot: the tree is re-rendered on every
    // search keystroke and a reorder can land while the modal is open.
    getRoots: () => (isIncome ? DataStore.getIncomeRootCategories() : DataStore.getExpenseRootCategories())
  }];
  if (billCats.length) {
    sections.push({
      title: __('categoryPicker.monthlyBills'),
      getRoots: () => (isIncome ? [] : DataStore.getBillCategories()),
      badge: __('categoryPicker.billBadge')
    });
  }
  openCatTreeModal({
    title: __('categoryPicker.title'),
    func: 'selectCategory',
    arg: context,
    sections,
    // Cancel restores the modal the picker replaced (e.g. the record edit form)
    // rather than destroying it — see pickerRestore().
    cancelFunc: 'pickerRestore'
  });
}

// Superseded by the collapsible/searchable tree below, and kept only so the
// existing export keeps working — it still renders every node expanded, which is
// exactly what the new component stops doing.
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

/* ============================================================
   COLLAPSIBLE + SEARCHABLE CATEGORY TREE  (shared by every picker)
   ------------------------------------------------------------
   This used to be three near-identical always-fully-expanded renderers — the
   add/edit picker, the records filter and the batch-recategorise modal. With 40+
   categories a picker that opens as a 40-row wall makes the user scroll past
   nine categories to reach 餐饮, and gives no way to jump straight to one.

   So one component now serves all of them:
     · collapsed by default, expanded one branch at a time, with the same ▶
       affordance and the same .cat-* classes the categories page already uses
     · a search box that matches name or icon, keeps every ancestor of a match
       visible (expanded), and counts the matches on each ancestor row
     · one delegated click handler instead of a per-row onclick string, so no
       category id is ever interpolated into an attribute

   The expansion set is remembered for the session (like the categories page's
   expandedCategories), so re-opening a picker does not fold what you just opened.
   ============================================================ */

const _catTreeOpen = new Set();   // ids the user explicitly expanded
let _catTreeOpts = null;          // what to draw, remembered across re-renders

function _catTreeKindOf(cat) { return cat && cat.kind === 'income' ? 'income' : 'expense'; }

// The whole body of a picker: title, search box, tree host, actions. The host is
// re-rendered on its own so typing in the search box never steals focus.
function openCatTreeModal(opts) {
  _catTreeOpts = opts;
  // _catTreeOpen is deliberately NOT cleared: the categories page keeps
  // expandedCategories for the whole session too, so drilling into 餐饮 › 午餐 to
  // set a budget does not have to be redone on the next record. The first picker
  // of a session opens fully collapsed, which is the behaviour that was asked
  // for — "everything expanded" was the complaint, not "nothing stays expanded".
  showModal(
    '<div class="modal-title">' + opts.title + '</div>' +
    '<div class="cat-tree-search">' +
      '<input type="text" id="catTreeSearchInput" class="input-field" placeholder="' + __('categoryPicker.searchPlaceholder') + '"' +
      ' autocomplete="off" oninput="catTreeSearch(this.value)">' +
    '</div>' +
    (opts.top || '') +
    '<div id="catTreeHost" class="cat-tree" data-func="' + escHtml(opts.func) + '"' +
      ' data-arg="' + escHtml(opts.arg || '') + '"' +
      (opts.swap ? ' data-swap="1"' : '') +
      ' onclick="catTreePick(event, this)"></div>' +
    '<div class="modal-actions">' +
      '<button class="btn btn-ghost" onclick="' + (opts.cancelFunc || 'closeModal') + '()">' + (opts.cancelText || __('categoryPicker.cancel')) + '</button>' +
    '</div>'
  );
  catTreeRender();
}

function catTreeRender() {
  const host = document.getElementById('catTreeHost');
  if (!host || !_catTreeOpts) return;
  const q = (host.getAttribute('data-q') || '').trim().toLowerCase();
  let html = '';
  (_catTreeOpts.sections || []).forEach(section => {
    const roots = typeof section.getRoots === 'function' ? section.getRoots() : (section.roots || []);
    if (!roots.length) return;
    const body = _catTreeSection(roots, q, section);
    // Header only when the section has something to show. Appending it
    // unconditionally left a lone "日常消费" above the empty state whenever a
    // search matched nothing, so "no results" never actually rendered.
    if (!body) return;
    html += '<div class="picker-section-header">' + section.title + '</div>' + body;
  });
  if (!html) {
    html = '<div class="empty-state"><div class="empty-icon">🔍</div><div class="empty-text">' +
      (q ? __('categoryPicker.noMatch', escHtml(q)) : __('categoryPicker.empty')) + '</div></div>';
  }
  if (_catTreeOpts.footer) html += _catTreeOpts.footer;
  host.innerHTML = html;
}

function catTreeSearch(value) {
  const host = document.getElementById('catTreeHost');
  if (!host) return;
  host.setAttribute('data-q', value || '');
  catTreeRender();
}

function _catTreeSection(cats, q, section) {
  const rows = cats.map(cat => {
    const children = DataStore.getChildren(cat.id);
    return _catTreeNode(cat, children, q, section);
  }).filter(Boolean);
  return rows.length ? '<div class="cat-tree-list">' + rows.join('') + '</div>' : '';
}

// One node, or null when neither it nor anything under it survives the filter.
// Recomputed from the store on every keystroke rather than filtered in the DOM:
// a ledger is tens of categories, not thousands, and re-rendering keeps the
// "which ancestors are open" logic in exactly one place.
function _catTreeNode(cat, children, q, section) {
  const kids = [];
  let kidMatches = 0;
  children.forEach(child => {
    const html = _catTreeNode(child, DataStore.getChildren(child.id), q, section);
    if (html) { kids.push(html); kidMatches++; }
  });

  const haystack = (cat.name + ' ' + (cat.icon || '')).toLowerCase();
  const selfMatch = !!q && haystack.indexOf(q) !== -1;
  if (q && !selfMatch && !kids.length) return null;

  // While searching, everything on the path to a match is forced open, otherwise
  // a hit three levels down would be filtered into the tree but stay invisible.
  const forcedOpen = !!q && (selfMatch || kids.length > 0);
  const expanded = forcedOpen || _catTreeOpen.has(cat.id);
  const hasKids = children.length > 0;

  const badge = (section && section.badge) ? '<span class="cat-tree-tag">' + section.badge + '</span>' : '';
  const count = (q && !selfMatch && kidMatches)
    ? '<span class="cat-tree-count">' + kidMatches + '</span>' : '';

  return '<div class="cat-item" data-catid="' + escHtml(cat.id) + '"' +
      (section && section.label ? ' data-label="' + escHtml(cat.icon + ' ' + cat.name) + '"' : '') + '>' +
    '<div class="cat-header">' +
      (hasKids
        ? '<span class="cat-arrow' + (expanded ? ' expanded' : '') + '" data-toggle="1">▶</span>'
        : '<span class="cat-arrow-empty"></span>') +
      '<span class="cat-dot" style="background:' + escHtml(cat.color) + '"></span>' +
      '<span class="cat-icon">' + escHtml(cat.icon) + '</span>' +
      '<span class="cat-name">' + (q ? _catTreeHighlight(cat.name, q) : escHtml(cat.name)) + '</span>' +
      count + badge +
    '</div>' +
    (hasKids
      ? '<div class="cat-children"' + (expanded ? '' : ' style="display:none"') + '>' + kids.join('') + '</div>'
      : '') +
  '</div>';
}

// Bold the matched run so the eye lands on it instead of re-reading the row.
// Operates on already-escaped text, so the query is escaped before splicing.
function _catTreeHighlight(name, q) {
  const safe = escHtml(name);
  const needle = escHtml(q).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return safe.replace(new RegExp('(' + needle + ')', 'ig'), '<mark>$1</mark>');
}

// Delegated: one handler for every row, so no category id is ever interpolated
// into an onclick attribute (the ids pass the SAFE_ID whitelist, but a handler
// that cannot be forged by data is better than one that can).
function catTreePick(event, host) {
  const item = event.target.closest ? event.target.closest('[data-catid]') : null;
  if (!item || !host.contains(item)) return;
  const id = item.getAttribute('data-catid');
  if (event.target.closest && event.target.closest('[data-toggle]')) {
    event.stopPropagation();
    if (_catTreeOpen.has(id)) _catTreeOpen.delete(id); else _catTreeOpen.add(id);
    catTreeRender();
    return;
  }
  const fn = host.getAttribute('data-func');
  if (typeof window[fn] !== 'function') return;
  const arg = host.getAttribute('data-arg') || '';
  const label = item.getAttribute('data-label') || '';
  if (host.getAttribute('data-swap') === '1') window[fn](arg, id);
  else window[fn](id, arg, label);
}

function selectCategory(catId, context) {
  const cat = DataStore.getCategory(catId);
  if (!cat) return;
  if (context === 'split-edit') {
    const billId = window._editingSplitBillId;
    if (billId && typeof SplitEngine !== 'undefined' && SplitEngine.setBillCategory) {
      SplitEngine.setBillCategory(billId, catId);
    }
    const disp = document.getElementById('editCategoryDisplay');
    if (disp) {
      disp.innerHTML = '';
      var dot = document.createElement('span');
      dot.style.cssText = 'width:10px;height:10px;border-radius:50%;background:' + cat.color + ';display:inline-block;vertical-align:middle';
      disp.appendChild(dot);
      disp.appendChild(document.createTextNode(' ' + cat.icon + ' ' + cat.name + ' · ' + (typeof __ === 'function' ? __('split.billLabel') : '分摊账单')));
      disp.style.color = 'var(--text-primary)';
    }
    // Split-bill editor modal category button (26-split-bills.js)
    const splitCatBtn = document.getElementById('editSplitCatBtn');
    if (splitCatBtn) {
      splitCatBtn.innerHTML = '';
      var dot2 = document.createElement('span');
      dot2.style.cssText = 'width:10px;height:10px;border-radius:50%;background:' + cat.color + ';display:inline-block;flex-shrink:0';
      splitCatBtn.appendChild(dot2);
      splitCatBtn.appendChild(document.createTextNode(' ' + cat.icon + ' ' + cat.name));
      splitCatBtn.style.color = 'var(--text-primary)';
    }
    _pickerDisp = { cat, suffix: ' · ' + (typeof __ === 'function' ? __('split.billLabel') : '分摊账单') };
    pickerRestore();
    return;
  }
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
  _pickerDisp = { cat };
  pickerRestore();
}

  // i18n translations
  addI18nEntries({
    'categoryPicker.title': { zh: '选择分类', en: 'Select Category' },
    'categoryPicker.daily': { zh: '日常消费', en: 'Daily Expenses' },
    'categoryPicker.income': { zh: '💰 收入', en: '💰 Income' },
    'categoryPicker.monthlyBills': { zh: '📋 月账单', en: '📋 Monthly Bills' },
    'categoryPicker.billBadge': { zh: '📋 账单', en: '📋 Bill' },
    'categoryPicker.searchPlaceholder': { zh: '搜索分类…', en: 'Search categories…' },
    'categoryPicker.noMatch': { zh: '没有匹配「{0}」的分类', en: 'No category matches "{0}"' },
    'categoryPicker.empty': { zh: '还没有分类', en: 'No categories yet' },
    'categoryPicker.cancel': { zh: '取消', en: 'Cancel' }
  });

  // === EXPORTS ===
  window.selectedCategoryId = selectedCategoryId;
  window.openCategoryPicker = openCategoryPicker;
  window.openCatTreeModal = openCatTreeModal;
  window.catKindOf = _catTreeKindOf;
  window.catTreeRender = catTreeRender;
  window.catTreeSearch = catTreeSearch;
  window.catTreePick = catTreePick;
  window.buildCategoryTreePicker = buildCategoryTreePicker;
  window.selectCategory = selectCategory;
  window.pickerRestore = pickerRestore;
})();

