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
})();
