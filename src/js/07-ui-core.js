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

function showModal(html) {
  const overlay = document.getElementById('modalOverlay');
  const content = document.getElementById('modalContent');
  content.innerHTML = '';
  // Use insertAdjacentHTML for faster parsing than innerHTML
  content.insertAdjacentHTML('beforeend', html);
  overlay.classList.add('open');
  overlay.onclick = (e) => {
    if (e.target === overlay) closeModal();
  };
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
    `<div class="modal-title" style="font-size:1.1rem">📋 月账单中心 · ${year}年${mon}月</div>` +
    `<div style="max-height:60vh;overflow-y:auto;padding:4px 0" id="${bodyId}"></div>`
  );
  const body = document.getElementById(bodyId);

  // Income
  body.insertAdjacentHTML('beforeend',
    `<div class="card bills-card">` +
      `<div class="card-title" style="font-size:0.75rem">💰 月收入</div>` +
      `<input type="number" class="input-field bills-income-input" id="billIncomeInput" value="${income || ''}" placeholder="输入月收入" min="0" step="0.01" onchange="saveBillIncome(this.value)">` +
    `</div>`
  );

  // Bill list
  let billListHtml = `<div class="card bills-card">` +
    `<div class="bills-card-title">` +
      `<span>📋 账单列表</span>` +
      `<span class="text-sm text-secondary">共 ${billCats.length} 项</span>` +
    `</div>` +
    `<div id="billListContainer">`;
  if (billCats.length === 0) {
    billListHtml += `<div class="text-sm text-muted" style="padding:12px 0;text-align:center">暂无账单分类，请添加</div>`;
  } else {
    billCats.forEach(cat => {
      const amt = amounts[cat.id] || '';
      billListHtml +=
        `<div class="bills-list-item" data-bill-id="${cat.id}">` +
          `<span class="bills-cat-icon" onclick="editBillCategory('${cat.id}')" title="点击编辑">${cat.icon}</span>` +
          `<span style="flex:1;font-weight:500;cursor:pointer" onclick="editBillCategory('${cat.id}')">${cat.name}</span>` +
          `<div style="display:flex;align-items:center;gap:4px">` +
            `<span style="font-size:0.75rem;color:var(--text-muted)">RM</span>` +
            `<input type="number" class="input-field bills-amount-input" value="${amt}" placeholder="0" min="0" step="0.01" onchange="saveBillAmount('${cat.id}', this.value)">` +
          `</div>` +
          `<button class="btn btn-ghost btn-sm bills-delete-btn" onclick="deleteBillCategoryFromCenter('${cat.id}')" title="删除账单">✕</button>` +
        `</div>`;
    });
  }
  billListHtml += `</div>` +
    `<button class="btn btn-sm btn-outline btn-block mt-8" onclick="addNewBillRow()">＋ 添加账单</button>` +
    `</div>`;
  body.insertAdjacentHTML('beforeend', billListHtml);

  // Management buttons
  body.insertAdjacentHTML('beforeend',
    `<div class="flex gap-8 mb-8">` +
      `<button class="btn btn-sm btn-ghost" onclick="openBillCategoryManager()" style="flex:1">📂 管理账单分类</button>` +
    `</div>`
  );

  // Summary
  body.insertAdjacentHTML('beforeend',
    `<div class="card bills-summary">` +
      `<div class="card-title" style="font-size:0.75rem">📊 月度汇总</div>` +
      `<div style="padding:4px 0">` +
        `<div class="flex items-center justify-between" style="padding:4px 0">` +
          `<span class="text-sm">月收入</span>` +
          `<span class="font-bold">${formatMoney(income)}</span>` +
        `</div>` +
        `<div class="flex items-center justify-between" style="padding:4px 0">` +
          `<span class="text-sm">账单合计</span>` +
          `<span class="font-bold" style="color:var(--danger)">${formatMoney(totalBills)}</span>` +
        `</div>` +
        `<div class="bills-summary-divider"></div>` +
        `<div class="flex items-center justify-between" style="padding:4px 0">` +
          `<span class="text-sm font-semibold">每月可支配</span>` +
          `<span class="font-bold bills-total-amount">${formatMoney(netDisp)}</span>` +
        `</div>` +
      `</div>` +
    `</div>`
  );

  // Close button
  content.insertAdjacentHTML('beforeend',
    `<div class="modal-actions">` +
      `<button class="btn btn-primary" onclick="closeBillsCenter()">✅ 完成</button>` +
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
    name: '新账单',
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
  if (!confirm('确认删除此账单分类？')) return;
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
    <div class="modal-title">编辑账单分类</div>
    <div class="input-group">
      <label class="input-label">名称</label>
      <input type="text" id="editBillCatName" class="input-field" value="${cat.name}" placeholder="分类名称">
    </div>
    <div class="input-group">
      <label class="input-label">图标 (Emoji)</label>
      <input type="text" id="editBillCatIcon" class="input-field" value="${cat.icon}" placeholder="📄" style="font-size:1.5rem">
    </div>
    <div class="input-group">
      <label class="input-label">颜色</label>
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
      <button class="btn btn-ghost" onclick="closeModal();openBillsCenter()">取消</button>
      <button class="btn btn-primary" onclick="saveBillCategoryEdit('${id}')">💾 保存</button>
    </div>
  `);
}

function saveBillCategoryEdit(id) {
  const name = document.getElementById('editBillCatName').value.trim();
  const icon = document.getElementById('editBillCatIcon').value.trim();
  const color = document.getElementById('billColorInput').value;
  if (!name) { showToast('请输入名称', 'error'); return; }
  DataStore.updateBillCategory(id, { name, icon: icon || '📄', color });
  closeModal();
  openBillsCenter();
}

function openBillCategoryManager() {
  const billCats = DataStore.getBillCategories();
  let html = `
    <div class="modal-title">📂 管理账单分类</div>
    <div style="max-height:50vh;overflow-y:auto">
      ${billCats.length === 0 ? '<div class="text-sm text-muted" style="padding:12px;text-align:center">暂无账单分类</div>' : ''}
      ${billCats.map(cat => `
        <div class="flex items-center justify-between" style="padding:8px 4px;border-bottom:1px solid var(--border)">
          <div class="flex items-center gap-8" style="cursor:pointer" onclick="closeModal();editBillCategory('${cat.id}')">
            <span style="width:12px;height:12px;border-radius:50%;background:${cat.color};display:inline-block"></span>
            <span style="font-size:1.2rem">${cat.icon}</span>
            <span>${cat.name}</span>
          </div>
          <button class="btn btn-ghost btn-sm" style="color:var(--danger);font-size:0.7rem" onclick="deleteBillCategoryFromCenter('${cat.id}')">删除</button>
        </div>
      `).join('')}
    </div>
    <div class="modal-actions">
      <button class="btn btn-outline" onclick="closeModal();addNewBillRow()">＋ 添加账单分类</button>
      <button class="btn btn-ghost" onclick="closeModal();openBillsCenter()">返回</button>
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
    <div class="modal-title">🔐 应用已锁定</div>
    <div style="padding:12px 0">
      <p class="text-sm text-muted" style="margin-bottom:12px">请输入PIN码解锁应用</p>
      <input type="password" id="pinInput" class="input-field" placeholder="输入PIN码" 
        style="font-size:1.2rem;text-align:center;letter-spacing:4px" 
        autocomplete="off" inputmode="numeric"
        onkeydown="if(event.key==='Enter') submitPin()">
      <div id="pinError" class="text-sm" style="color:var(--danger);display:none;margin-top:8px;text-align:center">PIN码错误，请重试</div>
    </div>
    <div class="modal-actions">
      <button class="btn btn-primary btn-block" onclick="submitPin()">🔓 解锁</button>
    </div>
  `);
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
    <div class="modal-title">🔐 设置PIN锁</div>
    <div style="padding:12px 0">
      <div class="input-group" style="margin-bottom:12px">
        <label class="input-label">设置PIN码 (6位数字)</label>
        <input type="password" id="newPinInput" class="input-field" placeholder="输入6位数字" 
          maxlength="6" inputmode="numeric" autocomplete="off">
      </div>
      <div class="input-group">
        <label class="input-label">确认PIN码</label>
        <input type="password" id="confirmPinInput" class="input-field" placeholder="再次输入" 
          maxlength="6" inputmode="numeric" autocomplete="off">
      </div>
      <div id="setPinError" class="text-sm" style="color:var(--danger);display:none;margin-top:8px"></div>
    </div>
    <div class="modal-actions">
      <button class="btn btn-ghost" onclick="closeModal()">取消</button>
      <button class="btn btn-primary" onclick="saveNewPin()">✅ 确认</button>
    </div>
  `);
}

async function saveNewPin() {
  const pin = document.getElementById('newPinInput').value;
  const confirm = document.getElementById('confirmPinInput').value;
  const errEl = document.getElementById('setPinError');
  if (!pin || pin.length < 4) {
    errEl.textContent = 'PIN码至少4位';
    errEl.style.display = 'block';
    return;
  }
  if (pin !== confirm) {
    errEl.textContent = '两次输入不一致';
    errEl.style.display = 'block';
    return;
  }
  await DataStore.setPin(pin);
  closeModal();
  showToast('✅ PIN码设置成功，数据已加密');
  if (typeof renderSettings === 'function') renderSettings();
}

function showChangePinModal() {
  showModal(`
    <div class="modal-title">🔐 修改PIN码</div>
    <div style="padding:12px 0">
      <div class="input-group" style="margin-bottom:8px">
        <label class="input-label">当前PIN码</label>
        <input type="password" id="oldPinInput" class="input-field" placeholder="输入当前PIN" 
          inputmode="numeric" autocomplete="off">
      </div>
      <div class="input-group" style="margin-bottom:8px">
        <label class="input-label">新PIN码 (6位数字)</label>
        <input type="password" id="newPinInput2" class="input-field" placeholder="输入新PIN" 
          inputmode="numeric" autocomplete="off">
      </div>
      <div class="input-group">
        <label class="input-label">确认新PIN码</label>
        <input type="password" id="confirmPinInput2" class="input-field" placeholder="再次输入" 
          inputmode="numeric" autocomplete="off">
      </div>
      <div id="changePinError" class="text-sm" style="color:var(--danger);display:none;margin-top:8px"></div>
    </div>
    <div class="modal-actions">
      <button class="btn btn-ghost" onclick="closeModal()">取消</button>
      <button class="btn btn-primary" onclick="saveChangedPin()">✅ 确认</button>
    </div>
  `);
}

async function saveChangedPin() {
  const old = document.getElementById('oldPinInput').value;
  const pin = document.getElementById('newPinInput2').value;
  const confirm = document.getElementById('confirmPinInput2').value;
  const errEl = document.getElementById('changePinError');
  if (!old) { errEl.textContent = '请输入当前PIN码'; errEl.style.display = 'block'; return; }
  if (!pin || pin.length < 4) { errEl.textContent = '新PIN码至少4位'; errEl.style.display = 'block'; return; }
  if (pin !== confirm) { errEl.textContent = '两次输入不一致'; errEl.style.display = 'block'; return; }
  const ok = await DataStore.changePin(old, pin);
  if (!ok) { errEl.textContent = '当前PIN码错误'; errEl.style.display = 'block'; return; }
  closeModal();
  showToast('✅ PIN码已修改');
  if (typeof renderSettings === 'function') renderSettings();
}

function showClearPinModal() {
  showModal(`
    <div class="modal-title">🔓 关闭PIN锁</div>
    <div style="padding:12px 0">
      <p class="text-sm text-muted" style="margin-bottom:12px">关闭后数据将恢复为明文存储</p>
      <div class="input-group">
        <label class="input-label">输入当前PIN码确认</label>
        <input type="password" id="clearPinInput" class="input-field" placeholder="输入PIN码" 
          inputmode="numeric" autocomplete="off">
      </div>
      <div id="clearPinError" class="text-sm" style="color:var(--danger);display:none;margin-top:8px"></div>
    </div>
    <div class="modal-actions">
      <button class="btn btn-ghost" onclick="closeModal()">取消</button>
      <button class="btn btn-danger" onclick="confirmClearPin()">🔓 关闭</button>
    </div>
  `);
}

async function confirmClearPin() {
  const pin = document.getElementById('clearPinInput').value;
  const errEl = document.getElementById('clearPinError');
  if (!pin) { errEl.textContent = '请输入PIN码'; errEl.style.display = 'block'; return; }
  const ok = await DataStore.clearPin(pin);
  if (!ok) { errEl.textContent = 'PIN码错误'; errEl.style.display = 'block'; return; }
  closeModal();
  showToast('✅ PIN锁已关闭，数据已解密');
  if (typeof renderSettings === 'function') renderSettings();
}

// ===== TAG PICKER =====
function openTagPicker(selectedTags, callback) {
  const allTags = DataStore.getAllTags();
  const selected = new Set(selectedTags || []);
  
  let html = `
    <div class="modal-title">🏷️ 选择标签</div>
    <div style="padding:8px 0">
      <input type="text" id="tagSearchInput" class="input-field" placeholder="搜索或创建标签..." 
        style="margin-bottom:8px" oninput="filterTagList()" autocomplete="off">
      <div id="tagListContainer" style="max-height:40vh;overflow-y:auto">`;
  
  if (allTags.length === 0) {
    html += `<div class="text-sm text-muted" style="padding:12px;text-align:center">暂无标签，在上方输入新标签名称创建</div>`;
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
          <span class="text-xs text-muted">${stats.count}次 · ${formatMoney(stats.total)}</span>
        </div>`;
    });
  }
  
  html += `</div>
      <div id="createTagSection" style="display:none;margin-top:8px">
        <div class="flex items-center gap-8">
          <span>创建标签: "</span><span id="newTagNameDisplay" style="font-weight:700"></span><span>"</span>
          <button class="btn btn-primary btn-sm" onclick="createAndSelectTag()">创建</button>
        </div>
      </div>
    </div>
    <div class="modal-actions">
      <button class="btn btn-ghost" onclick="closeModal()">取消</button>
      <button class="btn btn-primary" onclick="confirmTagPick()">✅ 完成 (已选 ${selected.size})</button>
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
  if (btn) btn.textContent = `✅ 完成 (已选 ${selected.size})`;
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
  // Tag picker exports
  window.openTagPicker = openTagPicker;
  window.filterTagList = filterTagList;
  window.toggleTagPick = toggleTagPick;
  window.createAndSelectTag = createAndSelectTag;
  window.confirmTagPick = confirmTagPick;
})();
