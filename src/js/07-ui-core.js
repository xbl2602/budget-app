/* ============================================================
   UI HELPERS
   ============================================================ */
(function() {
'use strict';

/* ===== DARK MODE ===== */
function applyTheme(theme) {
  if (!theme) theme = localStorage.getItem('budgetTheme') || 'light';
  document.documentElement.setAttribute('data-theme', theme);
}

function toggleTheme() {
  const current = document.documentElement.getAttribute('data-theme') || 'light';
  const next = current === 'dark' ? 'light' : 'dark';
  applyTheme(next);
  localStorage.setItem('budgetTheme', next);
  // Re-render settings if on settings page to update button text
  if (currentTab === 'settings') renderSettings();
}

function showToast(message, type = 'success') {
  const container = document.getElementById('toastContainer');
  const toast = document.createElement('div');
  toast.className = 'toast ' + type;
  const icons = { success: '✅', error: '❌', warning: '⚠️' };
  toast.innerHTML = `<span>${icons[type] || 'ℹ️'}</span> ${message}`;
  container.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(-10px)';
    toast.style.transition = 'all 0.3s ease';
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

function showModal(html, dismissable = true) {
  const overlay = document.getElementById('modalOverlay');
  const content = document.getElementById('modalContent');
  content.innerHTML = '';
  // Use insertAdjacentHTML for faster parsing than innerHTML
  content.insertAdjacentHTML('beforeend', html);
  overlay.classList.add('open');
  if (dismissable) {
    overlay.onclick = (e) => {
      if (e.target === overlay) closeModal();
    };
  } else {
    overlay.onclick = null;
  }
}



function closeModal() {
  document.getElementById('modalOverlay').classList.remove('open');
}

/* ============================================================
   BILLS CENTER MODAL
   ============================================================ */
function openBillsCenter() {
  const now = new Date();
  const month = getMonthKey(now.toISOString());
  const year = month.split('-')[0];
  const mon = month.split('-')[1];
  const income = DataStore.getMonthlyIncome(month);
  const billCats = DataStore.getBillCategories();
  const amounts = DataStore.getBillAmounts(month);
  const totalBills = Object.values(amounts).reduce((s, v) => s + (parseFloat(v) || 0), 0);
  const netDisp = Math.max(0, income - totalBills);

  const overlay = document.getElementById('modalOverlay');
  const content = document.getElementById('modalContent');
  overlay.onclick = (e) => { if (e.target === overlay) closeModal(); };

  // Build content first, then show overlay — prevents empty flash
  const bodyId = 'billsCenterBody_' + Date.now();

  // Title + scrollable wrapper
  content.innerHTML = '';
  content.insertAdjacentHTML('beforeend',
    `<div class="modal-title" style="font-size:1.1rem">📋 ${__('ui.bills.modalTitle', year, mon)}</div>` +
    `<div style="max-height:60vh;overflow-y:auto;padding:4px 0" id="${bodyId}"></div>`
  );
  const body = document.getElementById(bodyId);

  // Income
  body.insertAdjacentHTML('beforeend',
    `<div class="card bills-card">` +
      `<div class="card-title" style="font-size:0.75rem">💰 ${__('ui.bills.incomeTitle')}</div>` +
      `<input type="number" class="input-field bills-income-input" id="billIncomeInput" value="${income || ''}" placeholder="${__('ui.bills.incomePlaceholder')}" min="0" step="0.01" onchange="saveBillIncome(this.value)">` +
    `</div>`
  );

  // Bill list
  let billListHtml = `<div class="card bills-card">` +
    `<div class="bills-card-title">` +
      `<span>📋 ${__('ui.bills.billListTitle')}</span>` +
      `<span class="text-sm text-secondary">${__('ui.bills.itemCount', billCats.length)}</span>` +
    `</div>` +
    `<div id="billListContainer">`;
  if (billCats.length === 0) {
    billListHtml += `<div class="text-sm text-muted" style="padding:12px 0;text-align:center">${__('ui.bills.emptyState')}</div>`;
  } else {
    billCats.forEach(cat => {
      const amt = amounts[cat.id] || '';
      billListHtml +=
        `<div class="bills-list-item" data-bill-id="${cat.id}">` +
          `<span class="bills-cat-icon" onclick="editBillCategory('${cat.id}')" title="${__('ui.bills.editHint')}">${cat.icon}</span>` +
          `<span style="flex:1;font-weight:500;cursor:pointer" onclick="editBillCategory('${cat.id}')">${cat.name}</span>` +
          `<div style="display:flex;align-items:center;gap:4px">` +
            `<span style="font-size:0.75rem;color:var(--text-muted)">RM</span>` +
            `<input type="number" class="input-field bills-amount-input" value="${amt}" placeholder="0" min="0" step="0.01" onchange="saveBillAmount('${cat.id}', this.value)">` +
          `</div>` +
          `<button class="btn btn-ghost btn-sm bills-delete-btn" onclick="deleteBillCategoryFromCenter('${cat.id}')" title="${__('ui.bills.deleteTitle')}">✕</button>` +
        `</div>`;
    });
  }
  billListHtml += `</div>` +
    `<button class="btn btn-sm btn-outline btn-block mt-8" onclick="addNewBillRow()">${__('ui.bills.addBill')}</button>` +
    `</div>`;
  body.insertAdjacentHTML('beforeend', billListHtml);

  // Management buttons
  body.insertAdjacentHTML('beforeend',
    `<div class="flex gap-8 mb-8">` +
      `<button class="btn btn-sm btn-ghost" onclick="openBillCategoryManager()" style="flex:1">📂 ${__('ui.bills.manageCategories')}</button>` +
    `</div>`
  );

  // Summary
  body.insertAdjacentHTML('beforeend',
    `<div class="card bills-summary">` +
      `<div class="card-title" style="font-size:0.75rem">📊 ${__('ui.bills.summaryTitle')}</div>` +
      `<div style="padding:4px 0">` +
        `<div class="flex items-center justify-between" style="padding:4px 0">` +
          `<span class="text-sm">${__('ui.bills.incomeLabel')}</span>` +
          `<span class="font-bold">${formatMoney(income)}</span>` +
        `</div>` +
        `<div class="flex items-center justify-between" style="padding:4px 0">` +
          `<span class="text-sm">${__('ui.bills.totalBillsLabel')}</span>` +
          `<span class="font-bold" style="color:var(--danger)">${formatMoney(totalBills)}</span>` +
        `</div>` +
        `<div class="bills-summary-divider"></div>` +
        `<div class="flex items-center justify-between" style="padding:4px 0">` +
          `<span class="text-sm font-semibold">${__('ui.bills.disposableLabel')}</span>` +
          `<span class="font-bold bills-total-amount">${formatMoney(netDisp)}</span>` +
        `</div>` +
      `</div>` +
    `</div>`
  );

  // Close button
  content.insertAdjacentHTML('beforeend',
    `<div class="modal-actions">` +
      `<button class="btn btn-primary" onclick="closeBillsCenter()">✅ ${__('ui.bills.doneButton')}</button>` +
    `</div>`
  );

  // Show overlay AFTER content is ready
  overlay.classList.add('open');
}

function closeBillsCenter() {
  closeModal();
  // Re-render current page to reflect changes
  if (currentTab === 'overview') renderOverview();
  else if (currentTab === 'stats') renderStats();
  else if (currentTab === 'report') renderReport();
}

function saveBillIncome(amount) {
  const month = getMonthKey(new Date().toISOString());
  DataStore.setMonthlyIncome(month, parseFloat(amount) || 0);
  // Update summary
  updateBillSummary();
}

function saveBillAmount(billId, amount) {
  const month = getMonthKey(new Date().toISOString());
  DataStore.setBillAmount(month, billId, parseFloat(amount) || 0);
  updateBillSummary();
}

function updateBillSummary() {
  // Recalculate summary - the modal is still open, update DOM
  const month = getMonthKey(new Date().toISOString());
  const income = DataStore.getMonthlyIncome(month);
  const amounts = DataStore.getBillAmounts(month);
  const totalBills = Object.values(amounts).reduce((s, v) => s + (parseFloat(v) || 0), 0);
  const netDisp = Math.max(0, income - totalBills);
  // Find summary elements (they exist in the modal)
  // For simplicity, we update inline by re-rendering affected part only
  // For full refresh, user can close and reopen
}

function addNewBillRow() {
  // Add a new bill category inline
  const month = getMonthKey(new Date().toISOString());
  const cat = DataStore.addBillCategory({
    name: __('ui.bills.defaultBillName'),
    icon: '📄',
    color: COLORS[(DataStore._data.billCategories.length) % COLORS.length],
    sortOrder: DataStore.getBillCategories().length
  });
  // Add empty amount
  DataStore.setBillAmount(month, cat.id, 0);
  // Re-render bills center
  openBillsCenter();
}

function deleteBillCategoryFromCenter(id) {
  if (!confirm(__('ui.bills.confirmDelete'))) return;
  // Clean up amounts
  const month = getMonthKey(new Date().toISOString());
  if (DataStore._data.billAmounts && DataStore._data.billAmounts[month]) {
    delete DataStore._data.billAmounts[month][id];
  }
  DataStore.deleteBillCategory(id);
  openBillsCenter();
}

function editBillCategory(id) {
  const cat = DataStore.getBillCategory(id);
  if (!cat) return;
  const colors = COLORS;
  showModal(`
    <div class="modal-title">${__('ui.bills.editTitle')}</div>
    <div class="input-group">
      <label class="input-label">${__('ui.bills.nameLabel')}</label>
      <input type="text" id="editBillCatName" class="input-field" value="${cat.name}" placeholder="${__('ui.bills.namePlaceholder')}">
    </div>
    <div class="input-group">
      <label class="input-label">${__('ui.bills.iconLabel')}</label>
      <input type="text" id="editBillCatIcon" class="input-field" value="${cat.icon}" placeholder="📄" style="font-size:1.5rem">
    </div>
    <div class="input-group">
      <label class="input-label">${__('ui.bills.colorLabel')}</label>
      <div class="flex gap-6" style="flex-wrap:wrap">
        ${colors.map(c => `
          <span style="display:inline-block;width:28px;height:28px;border-radius:50%;background:${c};cursor:pointer;border:${cat.color === c ? '3px solid var(--text-primary)' : '2px solid transparent'}"
            onclick="document.getElementById('billColorInput').value='${c}';document.querySelectorAll('.color-swatch').forEach(el=>el.style.border='2px solid transparent');this.style.border='3px solid var(--text-primary)'"
            class="color-swatch"></span>
        `).join('')}
      </div>
      <input type="hidden" id="billColorInput" value="${cat.color}">
    </div>
    <div class="modal-actions">
      <button class="btn btn-ghost" onclick="closeModal();openBillsCenter()">${__('ui.bills.cancelButton')}</button>
      <button class="btn btn-primary" onclick="saveBillCategoryEdit('${id}')">💾 ${__('ui.bills.saveButton')}</button>
    </div>
  `);
}

function saveBillCategoryEdit(id) {
  const name = document.getElementById('editBillCatName').value.trim();
  const icon = document.getElementById('editBillCatIcon').value.trim();
  const color = document.getElementById('billColorInput').value;
  if (!name) { showToast(__('ui.bills.nameRequired'), 'error'); return; }
  DataStore.updateBillCategory(id, { name, icon: icon || '📄', color });
  closeModal();
  openBillsCenter();
}

function openBillCategoryManager() {
  const billCats = DataStore.getBillCategories();
  let html = `
    <div class="modal-title">📂 ${__('ui.bills.managerTitle')}</div>
    <div style="max-height:50vh;overflow-y:auto">
      ${billCats.length === 0 ? `<div class="text-sm text-muted" style="padding:12px;text-align:center">${__('ui.bills.managerEmpty')}</div>` : ''}
      ${billCats.map(cat => `
        <div class="flex items-center justify-between" style="padding:8px 4px;border-bottom:1px solid var(--border)">
          <div class="flex items-center gap-8" style="cursor:pointer" onclick="closeModal();editBillCategory('${cat.id}')">
            <span style="width:12px;height:12px;border-radius:50%;background:${cat.color};display:inline-block"></span>
            <span style="font-size:1.2rem">${cat.icon}</span>
            <span>${cat.name}</span>
          </div>
          <button class="btn btn-ghost btn-sm" style="color:var(--danger);font-size:0.7rem" onclick="deleteBillCategoryFromCenter('${cat.id}')">${__('ui.bills.deleteButton')}</button>
        </div>
      `).join('')}
    </div>
    <div class="modal-actions">
      <button class="btn btn-outline" onclick="closeModal();addNewBillRow()">${__('ui.bills.addCategory')}</button>
      <button class="btn btn-ghost" onclick="closeModal();openBillsCenter()">${__('ui.bills.backButton')}</button>
    </div>
  `;
  showModal(html);
}

function formatMoney(amount) {
  return 'RM ' + Number(amount).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

function getCategoryFullPath(catId) {
  const parts = [];
  let cat = DataStore.getCategory(catId);
  while (cat) {
    parts.unshift(cat.icon + ' ' + cat.name);
    cat = cat.parentId ? DataStore.getCategory(cat.parentId) : null;
  }
  return parts.join(' > ');
}

function getRootAncestorId(catId) {
  let cat = DataStore.getCategory(catId);
  while (cat && cat.parentId) {
    cat = DataStore.getCategory(cat.parentId);
  }
  return cat ? cat.id : null;
}

function getRootAncestor(catId) {
  let cat = DataStore.getCategory(catId);
  while (cat && cat.parentId) {
    cat = DataStore.getCategory(cat.parentId);
  }
  return cat;
}

function refreshCurrentPage() {
  const tab = window.currentTab || 'overview';
  if (tab === 'overview') { if (typeof renderOverview === 'function') renderOverview(); }
  else if (tab === 'add') { if (typeof renderAddPage === 'function') renderAddPage(); }
  else if (tab === 'records') { if (typeof renderRecords === 'function') renderRecords(); }
  else if (tab === 'categories') { if (typeof renderCategories === 'function') renderCategories(); }
  else if (tab === 'stats') { if (typeof renderStats === 'function') renderStats(); }
  else if (tab === 'report') { if (typeof renderReport === 'function') renderReport(); }
  else if (tab === 'whatif') { if (typeof renderWhatIf === 'function') renderWhatIf(); }
  else if (tab === 'settings') { if (typeof renderSettings === 'function') renderSettings(); }
}

// ===== PIN PROTECTION UI =====
function showPinModal() {
  showModal(`
    <div class="modal-title">🔐 ${__('ui.pin.lockedTitle')}</div>
    <div style="padding:12px 0">
      <p class="text-sm text-muted" style="margin-bottom:12px">${__('ui.pin.unlockInstruction')}</p>
      <input type="password" id="pinInput" class="input-field" placeholder="${__('ui.pin.enterPinPlaceholder')}" 
        style="font-size:1.2rem;text-align:center;letter-spacing:4px" 
        autocomplete="off" inputmode="numeric"
        onkeydown="if(event.key==='Enter') submitPin()">
      <div id="pinError" class="text-sm" style="color:var(--danger);display:none;margin-top:8px;text-align:center">${__('ui.pin.wrongPin')}</div>
    </div>
    <div class="modal-actions">
      <button class="btn btn-primary btn-block" onclick="submitPin()">🔓 ${__('ui.pin.unlockButton')}</button>
    </div>
  `, false);  // <-- non-dismissable
  // Focus the input after modal is shown
  setTimeout(() => {
    const inp = document.getElementById('pinInput');
    if (inp) inp.focus();
  }, 100);
}

async function submitPin() {
  const pin = document.getElementById('pinInput').value;
  if (!pin) return;
  const btn = document.querySelector('#modalContent .btn-primary');
  if (btn) btn.disabled = true;
  const valid = await DataStore.verifyPin(pin);
  if (valid) {
    const unlocked = await DataStore.unlockData(pin);
    if (unlocked) {
      closeModal();
      window._pinRequired = false;
      resetActivityTimer(); // 解锁后重置空闲计时
      // Re-init the app
      initApp();
    } else {
      document.getElementById('pinError').style.display = 'block';
      if (btn) btn.disabled = false;
    }
  } else {
    document.getElementById('pinError').style.display = 'block';
    if (btn) btn.disabled = false;
  }
}

function showSetPinModal() {
  showModal(`
    <div class="modal-title">🔐 ${__('ui.pin.setPinTitle')}</div>
    <div style="padding:12px 0">
      <div class="input-group" style="margin-bottom:12px">
        <label class="input-label">${__('ui.pin.setPinLabel')}</label>
        <input type="password" id="newPinInput" class="input-field" placeholder="${__('ui.pin.digitPlaceholder')}" 
          maxlength="6" inputmode="numeric" autocomplete="off">
      </div>
      <div class="input-group">
        <label class="input-label">${__('ui.pin.confirmPinLabel')}</label>
        <input type="password" id="confirmPinInput" class="input-field" placeholder="${__('ui.pin.reEnterPlaceholder')}" 
          maxlength="6" inputmode="numeric" autocomplete="off">
      </div>
      <div id="setPinError" class="text-sm" style="color:var(--danger);display:none;margin-top:8px"></div>
    </div>
    <div class="modal-actions">
      <button class="btn btn-ghost" onclick="closeModal()">${__('ui.pin.cancelButton')}</button>
      <button class="btn btn-primary" onclick="saveNewPin()">✅ ${__('ui.pin.confirmButton')}</button>
    </div>
  `);
}

async function saveNewPin() {
  const pin = document.getElementById('newPinInput').value;
  const confirm = document.getElementById('confirmPinInput').value;
  const errEl = document.getElementById('setPinError');
  if (!pin || pin.length < 4) {
    errEl.textContent = __('ui.pin.pinTooShort');
    errEl.style.display = 'block';
    return;
  }
  if (pin !== confirm) {
    errEl.textContent = __('ui.pin.pinMismatch');
    errEl.style.display = 'block';
    return;
  }
  await DataStore.setPin(pin);
  closeModal();
  showToast('✅ ' + __('ui.pin.setSuccess'));
  startInactivityCheck();
  bindActivityListeners();
  if (typeof renderSettings === 'function') renderSettings();
}

function showChangePinModal() {
  showModal(`
    <div class="modal-title">🔐 ${__('ui.pin.changePinTitle')}</div>
    <div style="padding:12px 0">
      <div class="input-group" style="margin-bottom:8px">
        <label class="input-label">${__('ui.pin.currentPinLabel')}</label>
        <input type="password" id="oldPinInput" class="input-field" placeholder="${__('ui.pin.enterCurrentPlaceholder')}" 
          inputmode="numeric" autocomplete="off">
      </div>
      <div class="input-group" style="margin-bottom:8px">
        <label class="input-label">${__('ui.pin.newPinLabel')}</label>
        <input type="password" id="newPinInput2" class="input-field" placeholder="${__('ui.pin.enterNewPlaceholder')}" 
          inputmode="numeric" autocomplete="off">
      </div>
      <div class="input-group">
        <label class="input-label">${__('ui.pin.confirmNewPinLabel')}</label>
        <input type="password" id="confirmPinInput2" class="input-field" placeholder="${__('ui.pin.reEnterPlaceholder')}" 
          inputmode="numeric" autocomplete="off">
      </div>
      <div id="changePinError" class="text-sm" style="color:var(--danger);display:none;margin-top:8px"></div>
    </div>
    <div class="modal-actions">
      <button class="btn btn-ghost" onclick="closeModal()">${__('ui.pin.cancelButton')}</button>
      <button class="btn btn-primary" onclick="saveChangedPin()">✅ ${__('ui.pin.confirmButton')}</button>
    </div>
  `);
}

async function saveChangedPin() {
  const old = document.getElementById('oldPinInput').value;
  const pin = document.getElementById('newPinInput2').value;
  const confirm = document.getElementById('confirmPinInput2').value;
  const errEl = document.getElementById('changePinError');
  if (!old) { errEl.textContent = __('ui.pin.enterCurrentPinError'); errEl.style.display = 'block'; return; }
  if (!pin || pin.length < 4) { errEl.textContent = __('ui.pin.newPinTooShort'); errEl.style.display = 'block'; return; }
  if (pin !== confirm) { errEl.textContent = __('ui.pin.pinMismatch'); errEl.style.display = 'block'; return; }
  const ok = await DataStore.changePin(old, pin);
  if (!ok) { errEl.textContent = __('ui.pin.currentPinWrong'); errEl.style.display = 'block'; return; }
  closeModal();
  showToast('✅ ' + __('ui.pin.changeSuccess'));
  if (typeof renderSettings === 'function') renderSettings();
}

function showClearPinModal() {
  showModal(`
    <div class="modal-title">🔓 ${__('ui.pin.clearPinTitle')}</div>
    <div style="padding:12px 0">
      <p class="text-sm text-muted" style="margin-bottom:12px">${__('ui.pin.clearWarning')}</p>
      <div class="input-group">
        <label class="input-label">${__('ui.pin.confirmClearLabel')}</label>
        <input type="password" id="clearPinInput" class="input-field" placeholder="${__('ui.pin.enterPinPlaceholder')}" 
          inputmode="numeric" autocomplete="off">
      </div>
      <div id="clearPinError" class="text-sm" style="color:var(--danger);display:none;margin-top:8px"></div>
    </div>
    <div class="modal-actions">
      <button class="btn btn-ghost" onclick="closeModal()">${__('ui.pin.cancelButton')}</button>
      <button class="btn btn-danger" onclick="confirmClearPin()">🔓 ${__('ui.pin.clearButton')}</button>
    </div>
  `);
}

async function confirmClearPin() {
  const pin = document.getElementById('clearPinInput').value;
  const errEl = document.getElementById('clearPinError');
  if (!pin) { errEl.textContent = __('ui.pin.enterPinError'); errEl.style.display = 'block'; return; }
  const ok = await DataStore.clearPin(pin);
  if (!ok) { errEl.textContent = __('ui.pin.pinError'); errEl.style.display = 'block'; return; }
  closeModal();
  showToast('✅ ' + __('ui.pin.clearSuccess'));
  stopInactivityCheck();
  if (typeof renderSettings === 'function') renderSettings();
}

// ===== TAG PICKER =====
function openTagPicker(selectedTags, callback) {
  const allTags = DataStore.getAllTags();
  const selected = new Set(selectedTags || []);
  
  let html = `
    <div class="modal-title">🏷️ ${__('ui.tag.selectTitle')}</div>
    <div style="padding:8px 0">
      <input type="text" id="tagSearchInput" class="input-field" placeholder="${__('ui.tag.searchPlaceholder')}" 
        style="margin-bottom:8px" oninput="filterTagList()" autocomplete="off">
      <div id="tagListContainer" style="max-height:40vh;overflow-y:auto">`;
  
  if (allTags.length === 0) {
    html += `<div class="text-sm text-muted" style="padding:12px;text-align:center">${__('ui.tag.emptyState')}</div>`;
  } else {
    allTags.forEach(tag => {
      const stats = DataStore.getTagStats(tag);
      html += `
        <div class="flex items-center gap-8" style="padding:6px 4px;cursor:pointer;border-radius:6px;hover:background:var(--bg)"
          onclick="toggleTagPick('${escHtml(tag)}')" id="tag-item-${escHtml(tag)}" data-tag="${escHtml(tag)}">
          <span id="tag-check-${escHtml(tag)}" style="width:20px;text-align:center">
            ${selected.has(tag) ? '✅' : '⬜'}
          </span>
          <span style="flex:1">${escHtml(tag)}</span>
          <span class="text-xs text-muted">${stats.count}${__('ui.tag.countSuffix')} · ${formatMoney(stats.total)}</span>
        </div>`;
    });
  }
  
  html += `</div>
      <div id="createTagSection" style="display:none;margin-top:8px">
        <div class="flex items-center gap-8">
          <span>${__('ui.tag.createLabelPrefix')}</span><span id="newTagNameDisplay" style="font-weight:700"></span><span>${__('ui.tag.createLabelSuffix')}</span>
          <button class="btn btn-primary btn-sm" onclick="createAndSelectTag()">${__('ui.tag.createButton')}</button>
        </div>
      </div>
    </div>
    <div class="modal-actions">
      <button class="btn btn-ghost" onclick="closeModal()">${__('ui.tag.cancelButton')}</button>
      <button class="btn btn-primary" onclick="confirmTagPick()">✅ ${__('ui.tag.doneButton', selected.size)}</button>
    </div>`;
  
  // Store callback
  window._tagPickerCallback = callback;
  window._tagPickerSelected = selected;
  
  showModal(html);
  
  // Bind search
  setTimeout(() => {
    const searchInput = document.getElementById('tagSearchInput');
    if (searchInput) searchInput.focus();
  }, 100);
}

function filterTagList() {
  const query = (document.getElementById('tagSearchInput').value || '').toLowerCase().trim();
  const container = document.getElementById('tagListContainer');
  if (!container) return;
  
  const items = container.querySelectorAll('[data-tag]');
  let hasVisible = false;
  items.forEach(item => {
    const tag = item.getAttribute('data-tag').toLowerCase();
    if (tag.includes(query)) {
      item.style.display = 'flex';
      hasVisible = true;
    } else {
      item.style.display = 'none';
    }
  });
  
  // Show create section if no match and query not empty
  const createSection = document.getElementById('createTagSection');
  const nameDisplay = document.getElementById('newTagNameDisplay');
  if (query && !hasVisible) {
    // Check if it's actually a new tag
    const allTags = DataStore.getAllTags();
    if (!allTags.includes(query)) {
      createSection.style.display = 'block';
      if (nameDisplay) nameDisplay.textContent = query;
      window._pendingNewTag = query;
    } else {
      createSection.style.display = 'none';
    }
  } else {
    createSection.style.display = 'none';
    window._pendingNewTag = null;
  }
}

function toggleTagPick(tag) {
  const selected = window._tagPickerSelected;
  if (!selected) return;
  if (selected.has(tag)) {
    selected.delete(tag);
    const check = document.getElementById('tag-check-' + tag);
    if (check) check.textContent = '⬜';
  } else {
    selected.add(tag);
    const check = document.getElementById('tag-check-' + tag);
    if (check) check.textContent = '✅';
  }
  // Update button text
  const btn = document.querySelector('#modalContent .btn-primary');
  if (btn) btn.textContent = `✅ ${__('ui.tag.doneButton', selected.size)}`;
}

function createAndSelectTag() {
  const tag = window._pendingNewTag;
  if (!tag) return;
  DataStore.addTagUsage(tag);
  window._tagPickerSelected.add(tag);
  // Refresh picker
  const cb = window._tagPickerCallback;
  const sel = window._tagPickerSelected;
  closeModal();
  openTagPicker([...sel], cb);
}

function confirmTagPick() {
  const selected = window._tagPickerSelected;
  const callback = window._tagPickerCallback;
  closeModal();
  if (callback && selected) {
    callback([...selected]);
  }
  window._tagPickerSelected = null;
  window._tagPickerCallback = null;
  window._pendingNewTag = null;
}

// ===== AUTO-LOCK (Inactivity Timer) =====
let _lastActivity = Date.now();
let _inactivityInterval = null;
let _autoLockTimeout = parseInt(localStorage.getItem('budgetAutoLockTimeout') || '5'); // minutes, default 5

function resetActivityTimer() {
  if (window._pinRequired) return;
  _lastActivity = Date.now();
}

function getAutoLockTimeout() {
  return _autoLockTimeout;
}

function setAutoLockTimeout(minutes) {
  _autoLockTimeout = minutes;
  localStorage.setItem('budgetAutoLockTimeout', minutes);
  restartInactivityCheck();
}

function restartInactivityCheck() {
  stopInactivityCheck();
  startInactivityCheck();
}

function startInactivityCheck() {
  if (_inactivityInterval) clearInterval(_inactivityInterval);
  if (_autoLockTimeout <= 0) return; // 0 = never lock

  _inactivityInterval = setInterval(() => {
    if (window._pinRequired) return;
    const hasPinHash = localStorage.getItem('budgetAppPinHash');
    if (!hasPinHash) return; // no PIN set

    const elapsed = (Date.now() - _lastActivity) / 60000;
    if (elapsed >= _autoLockTimeout) {
      lockApp();
    }
  }, 10000); // check every 10s
}

function stopInactivityCheck() {
  if (_inactivityInterval) {
    clearInterval(_inactivityInterval);
    _inactivityInterval = null;
  }
}

function lockApp() {
  if (window._pinRequired) return;
  const hasPinHash = localStorage.getItem('budgetAppPinHash');
  if (!hasPinHash) return;

  // Save current state then clear plaintext
  if (DataStore._data) DataStore.save();
  localStorage.removeItem('budgetAppData');

  window._pinRequired = true;
  showPinModal();
}

function bindActivityListeners() {
  const events = ['mousedown', 'keydown', 'touchstart', 'scroll', 'mousemove'];
  events.forEach(evt => {
    document.addEventListener(evt, resetActivityTimer, { passive: true });
  });
}

  // === I18N ENTRIES ===
  window.addI18nEntries({
    // Bills Center
    'ui.bills.modalTitle': { zh: '月账单中心 · {0}年{1}月', en: 'Monthly Bills Center · {0}/{1}' },
    'ui.bills.incomeTitle': { zh: '月收入', en: 'Monthly Income' },
    'ui.bills.incomePlaceholder': { zh: '输入月收入', en: 'Enter monthly income' },
    'ui.bills.billListTitle': { zh: '账单列表', en: 'Bill List' },
    'ui.bills.itemCount': { zh: '共 {0} 项', en: '{0} item(s)' },
    'ui.bills.emptyState': { zh: '暂无账单分类，请添加', en: 'No categories yet. Add one.' },
    'ui.bills.deleteTitle': { zh: '删除账单', en: 'Delete bill' },
    'ui.bills.addBill': { zh: '＋ 添加账单', en: '＋ Add Bill' },
    'ui.bills.manageCategories': { zh: '管理账单分类', en: 'Manage Categories' },
    'ui.bills.summaryTitle': { zh: '月度汇总', en: 'Monthly Summary' },
    'ui.bills.incomeLabel': { zh: '月收入', en: 'Income' },
    'ui.bills.totalBillsLabel': { zh: '账单合计', en: 'Total Bills' },
    'ui.bills.disposableLabel': { zh: '每月可支配', en: 'Monthly Disposable' },
    'ui.bills.doneButton': { zh: '完成', en: 'Done' },
    'ui.bills.defaultBillName': { zh: '新账单', en: 'New Bill' },
    'ui.bills.confirmDelete': { zh: '确认删除此账单分类？', en: 'Are you sure you want to delete this category?' },
    'ui.bills.editTitle': { zh: '编辑账单分类', en: 'Edit Category' },
    'ui.bills.nameLabel': { zh: '名称', en: 'Name' },
    'ui.bills.namePlaceholder': { zh: '分类名称', en: 'Category name' },
    'ui.bills.iconLabel': { zh: '图标 (Emoji)', en: 'Icon (Emoji)' },
    'ui.bills.colorLabel': { zh: '颜色', en: 'Color' },
    'ui.bills.cancelButton': { zh: '取消', en: 'Cancel' },
    'ui.bills.saveButton': { zh: '保存', en: 'Save' },
    'ui.bills.nameRequired': { zh: '请输入名称', en: 'Please enter a name' },
    'ui.bills.managerTitle': { zh: '管理账单分类', en: 'Manage Categories' },
    'ui.bills.managerEmpty': { zh: '暂无账单分类', en: 'No categories yet' },
    'ui.bills.deleteButton': { zh: '删除', en: 'Delete' },
    'ui.bills.addCategory': { zh: '＋ 添加账单分类', en: '＋ Add Category' },
    'ui.bills.backButton': { zh: '返回', en: 'Back' },
    'ui.bills.editHint': { zh: '点击编辑', en: 'Click to edit' },
    // PIN
    'ui.pin.lockedTitle': { zh: '应用已锁定', en: 'App Locked' },
    'ui.pin.unlockInstruction': { zh: '请输入PIN码解锁应用', en: 'Enter PIN to unlock the app' },
    'ui.pin.enterPinPlaceholder': { zh: '输入PIN码', en: 'Enter PIN' },
    'ui.pin.wrongPin': { zh: 'PIN码错误，请重试', en: 'Wrong PIN, please try again' },
    'ui.pin.unlockButton': { zh: '解锁', en: 'Unlock' },
    'ui.pin.setPinTitle': { zh: '设置PIN锁', en: 'Set PIN Lock' },
    'ui.pin.setPinLabel': { zh: '设置PIN码 (6位数字)', en: 'Set PIN (6 digits)' },
    'ui.pin.digitPlaceholder': { zh: '输入6位数字', en: 'Enter 6 digits' },
    'ui.pin.confirmPinLabel': { zh: '确认PIN码', en: 'Confirm PIN' },
    'ui.pin.reEnterPlaceholder': { zh: '再次输入', en: 'Enter again' },
    'ui.pin.cancelButton': { zh: '取消', en: 'Cancel' },
    'ui.pin.confirmButton': { zh: '确认', en: 'Confirm' },
    'ui.pin.pinTooShort': { zh: 'PIN码至少4位', en: 'PIN must be at least 4 digits' },
    'ui.pin.pinMismatch': { zh: '两次输入不一致', en: 'PINs do not match' },
    'ui.pin.setSuccess': { zh: 'PIN码设置成功，数据已加密', en: 'PIN set successfully, data encrypted' },
    'ui.pin.changePinTitle': { zh: '修改PIN码', en: 'Change PIN' },
    'ui.pin.currentPinLabel': { zh: '当前PIN码', en: 'Current PIN' },
    'ui.pin.enterCurrentPlaceholder': { zh: '输入当前PIN', en: 'Enter current PIN' },
    'ui.pin.newPinLabel': { zh: '新PIN码 (6位数字)', en: 'New PIN (6 digits)' },
    'ui.pin.enterNewPlaceholder': { zh: '输入新PIN', en: 'Enter new PIN' },
    'ui.pin.confirmNewPinLabel': { zh: '确认新PIN码', en: 'Confirm New PIN' },
    'ui.pin.enterCurrentPinError': { zh: '请输入当前PIN码', en: 'Please enter current PIN' },
    'ui.pin.newPinTooShort': { zh: '新PIN码至少4位', en: 'New PIN must be at least 4 digits' },
    'ui.pin.currentPinWrong': { zh: '当前PIN码错误', en: 'Current PIN is incorrect' },
    'ui.pin.changeSuccess': { zh: 'PIN码已修改', en: 'PIN changed successfully' },
    'ui.pin.clearPinTitle': { zh: '关闭PIN锁', en: 'Disable PIN Lock' },
    'ui.pin.clearWarning': { zh: '关闭后数据将恢复为明文存储', en: 'Data will be stored in plain text after disabling' },
    'ui.pin.confirmClearLabel': { zh: '输入当前PIN码确认', en: 'Enter current PIN to confirm' },
    'ui.pin.clearButton': { zh: '关闭', en: 'Disable' },
    'ui.pin.enterPinError': { zh: '请输入PIN码', en: 'Please enter PIN' },
    'ui.pin.pinError': { zh: 'PIN码错误', en: 'Wrong PIN' },
    'ui.pin.clearSuccess': { zh: 'PIN锁已关闭，数据已解密', en: 'PIN lock disabled, data decrypted' },
    // Tag Picker
    'ui.tag.selectTitle': { zh: '选择标签', en: 'Select Tags' },
    'ui.tag.searchPlaceholder': { zh: '搜索或创建标签...', en: 'Search or create tag...' },
    'ui.tag.emptyState': { zh: '暂无标签，在上方输入新标签名称创建', en: 'No tags yet. Type above to create one.' },
    'ui.tag.countSuffix': { zh: '次', en: 'x' },
    'ui.tag.createLabelPrefix': { zh: '创建标签: "', en: 'Create tag: "' },
    'ui.tag.createLabelSuffix': { zh: '"', en: '"' },
    'ui.tag.createButton': { zh: '创建', en: 'Create' },
    'ui.tag.cancelButton': { zh: '取消', en: 'Cancel' },
    'ui.tag.doneButton': { zh: '完成 (已选 {0})', en: 'Done ({0} selected)' },
  });

  // === EXPORTS ===
  window.applyTheme = applyTheme;
  window.toggleTheme = toggleTheme;
  window.showToast = showToast;
  window.showModal = showModal;
  window.closeModal = closeModal;
  window.openBillsCenter = openBillsCenter;
  window.closeBillsCenter = closeBillsCenter;
  window.saveBillIncome = saveBillIncome;
  window.saveBillAmount = saveBillAmount;
  window.updateBillSummary = updateBillSummary;
  window.addNewBillRow = addNewBillRow;
  window.deleteBillCategoryFromCenter = deleteBillCategoryFromCenter;
  window.editBillCategory = editBillCategory;
  window.saveBillCategoryEdit = saveBillCategoryEdit;
  window.openBillCategoryManager = openBillCategoryManager;
  window.formatMoney = formatMoney;
  window.getCategoryFullPath = getCategoryFullPath;
  window.getRootAncestorId = getRootAncestorId;
  window.getRootAncestor = getRootAncestor;
  window.refreshCurrentPage = refreshCurrentPage;
  // PIN Protection UI exports
  window.showPinModal = showPinModal;
  window.submitPin = submitPin;
  window.showSetPinModal = showSetPinModal;
  window.saveNewPin = saveNewPin;
  window.showChangePinModal = showChangePinModal;
  window.saveChangedPin = saveChangedPin;
  window.showClearPinModal = showClearPinModal;
  window.confirmClearPin = confirmClearPin;
  // Auto-lock exports
  window.getAutoLockTimeout = getAutoLockTimeout;
  window.setAutoLockTimeout = setAutoLockTimeout;
  window.lockApp = lockApp;
  window.startInactivityCheck = startInactivityCheck;
  window.stopInactivityCheck = stopInactivityCheck;
  window.bindActivityListeners = bindActivityListeners;
  // Tag picker exports
  window.openTagPicker = openTagPicker;
  window.filterTagList = filterTagList;
  window.toggleTagPick = toggleTagPick;
  window.createAndSelectTag = createAndSelectTag;
  window.confirmTagPick = confirmTagPick;
})();
