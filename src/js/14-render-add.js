/* ============================================================
   RENDER: Add Record Page
   ============================================================ */
(function() {
'use strict';
function renderAddPage() {
  selectedCategoryId = null;
  const el = document.getElementById('page-add');
  el.innerHTML = `
    <div class="card">
      <div class="card-title mb-16">${__('addRecord.title')}</div>
      <form id="addForm" onsubmit="submitRecord(event)">
        <div class="input-group">
          <label class="input-label">${__('addRecord.amountLabel')}</label>
          <div style="position:relative">
            <span style="position:absolute;left:14px;top:50%;transform:translateY(-50%);font-weight:700;color:var(--primary);font-size:1.1rem">RM</span>
            <input type="text" id="addAmount" class="input-field" placeholder="0.00" style="padding-left:44px;font-size:1.2rem;font-weight:700" inputmode="decimal" autocomplete="off">
          </div>
        </div>

        <div class="input-group">
          <label class="input-label">${__('addRecord.categoryLabel')}</label>
          <button type="button" class="input-field" id="addCategoryBtn" style="text-align:left;cursor:pointer" onclick="openCategoryPicker('add')">
            <span id="addCategoryDisplay" style="color:var(--text-muted)">${__('addRecord.selectCategory')}</span>
          </button>
        </div>

        <div class="input-group">
          <label class="input-label">${__('addRecord.dateLabel')}</label>
          <input type="datetime-local" id="addDateTime" class="input-field">
        </div>

        <div class="input-group">
          <label class="input-label">${__('addRecord.noteLabel')}</label>
          <input type="text" id="addNote" class="input-field" placeholder="${__('addRecord.notePlaceholder')}" maxlength="200">
        </div>

        <!-- Tags -->
        <div class="input-group" style="margin-bottom:8px">
          <label class="input-label">${__('addRecord.tagsLabel')} <span class="text-xs text-muted">${__('addRecord.tagsHint')}</span></label>
          <div id="addTagsDisplay" style="display:flex;flex-wrap:wrap;gap:4px;min-height:32px;padding:4px 0">
            <!-- Selected tags will appear here -->
          </div>
          <button type="button" class="btn btn-sm btn-outline" onclick="openTagPickerForAdd()">${__('addRecord.addTag')}</button>
        </div>

        <div class="input-group">
          <label style="display:flex;align-items:center;gap:8px;cursor:pointer;padding:4px 0">
            <input type="checkbox" id="addExcludeAvg" style="width:18px;height:18px;cursor:pointer">
            <span class="text-sm text-secondary">${__('addRecord.excludeLabel')}</span>
          </label>
        </div>

        <button type="submit" class="btn btn-primary btn-lg btn-block" id="submitBtn" style="font-size:1.05rem">
          ${__('addRecord.saveBtn')}
        </button>
      </form>
    </div>
  `;

  // Set default date/time
  const now = new Date();
  const offset = now.getTimezoneOffset();
  const local = new Date(now.getTime() - offset * 60000);
  document.getElementById('addDateTime').value = local.toISOString().slice(0, 16);

  // Amount input formatting
  const amountInput = document.getElementById('addAmount');
  amountInput.addEventListener('input', function() {
    let val = this.value.replace(/[^0-9.]/g, '');
    const parts = val.split('.');
    if (parts.length > 2) val = parts[0] + '.' + parts.slice(1).join('');
    if (parts[1] && parts[1].length > 2) val = parts[0] + '.' + parts[1].slice(0, 2);
    this.value = val;
  });
}
function submitRecord(e) {
  e.preventDefault();
  const amountEl = document.getElementById('addAmount');
  const amount = parseFloat(amountEl.value);
  const categoryId = selectedCategoryId;
  const date = document.getElementById('addDateTime').value;
  const note = document.getElementById('addNote').value.trim();
  const form = document.getElementById('addForm');

  function shakeForm() {
    form.classList.add('shake');
    setTimeout(() => form.classList.remove('shake'), 500);
  }

  // Fixed: validate amount is a finite number (M8)
  if (!isFinite(amount) || amount < 0) {
    showToast(__('addRecord.invalidAmount'), 'error');
    amountEl.focus();
    shakeForm();
    return;
  }
  if (!amount || amount <= 0) {
    showToast(__('addRecord.invalidAmount'), 'error');
    amountEl.focus();
    shakeForm();
    return;
  }
  if (!categoryId) {
    showToast(__('addRecord.noCategory'), 'error');
    shakeForm();
    return;
  }

  const tags = window._addRecordTags || [];
  const record = {
    amount,
    categoryId,
    date: date || new Date().toISOString().slice(0, 16),
    note,
    tags,
    excludeFromAvg: document.getElementById('addExcludeAvg').checked,
    createdAt: new Date().toISOString()
  };

  DataStore.addRecord(record);
  // Track tag usage
  tags.forEach(t => DataStore.addTagUsage(t));
  showToast(__('addRecord.saved'));

  // Reset form
  amountEl.value = '';
  selectedCategoryId = null;
  document.getElementById('addCategoryDisplay').textContent = __('addRecord.selectCategory');
  document.getElementById('addCategoryDisplay').style.color = 'var(--text-muted)';
  document.getElementById('addNote').value = '';
  window._addRecordTags = [];
  renderAddTagsDisplay();
  const now = new Date();
  const offset = now.getTimezoneOffset();
  const local = new Date(now.getTime() - offset * 60000);
  document.getElementById('addDateTime').value = local.toISOString().slice(0, 16);
}

// Tag picker for add page
function openTagPickerForAdd() {
  const current = window._addRecordTags || [];
  openTagPicker(current, function(selected) {
    window._addRecordTags = selected;
    renderAddTagsDisplay();
  });
}

function renderAddTagsDisplay() {
  const container = document.getElementById('addTagsDisplay');
  if (!container) return;
  const tags = window._addRecordTags || [];
  if (tags.length === 0) {
    container.innerHTML = '<span class="text-xs text-muted">' + __('addRecord.noTags') + '</span>';
  } else {
    container.innerHTML = tags.map(t => 
      `<span style="display:inline-flex;align-items:center;gap:4px;padding:2px 8px;background:var(--primary);color:white;border-radius:12px;font-size:0.75rem">
        ${escHtml(t)}
        <span style="cursor:pointer;opacity:0.7" onclick="removeAddTag('${escHtml(t)}')">✕</span>
      </span>`
    ).join('');
  }
}

function removeAddTag(tag) {
  const tags = window._addRecordTags || [];
  window._addRecordTags = tags.filter(t => t !== tag);
  renderAddTagsDisplay();
}

  // i18n translations
  addI18nEntries({
    'addRecord.title': { zh: '新增记录', en: 'New Record' },
    'addRecord.amountLabel': { zh: '金额 (RM)', en: 'Amount (RM)' },
    'addRecord.categoryLabel': { zh: '分类', en: 'Category' },
    'addRecord.selectCategory': { zh: '请选择分类', en: 'Please select a category' },
    'addRecord.dateLabel': { zh: '日期时间', en: 'Date & Time' },
    'addRecord.noteLabel': { zh: '备注', en: 'Note' },
    'addRecord.notePlaceholder': { zh: '例如：Nasi Lemak', en: 'e.g. Nasi Lemak' },
    'addRecord.tagsLabel': { zh: '🏷️ 标签', en: '🏷️ Tags' },
    'addRecord.tagsHint': { zh: '(可多选，场景标记)', en: '(multi-select, scene tags)' },
    'addRecord.addTag': { zh: '＋ 添加标签', en: '＋ Add Tag' },
    'addRecord.excludeLabel': { zh: '📌 不计日均（一次性大额消费）', en: '📌 Exclude from daily avg (one-time large expense)' },
    'addRecord.saveBtn': { zh: '✅ 保存记录', en: '✅ Save Record' },
    'addRecord.invalidAmount': { zh: '请输入有效金额', en: 'Please enter a valid amount' },
    'addRecord.noCategory': { zh: '请选择分类', en: 'Please select a category' },
    'addRecord.saved': { zh: '✅ 记录已保存', en: '✅ Record saved' },
    'addRecord.noTags': { zh: '还未添加标签', en: 'No tags added yet' }
  });

  // === EXPORTS ===
  window.renderAddPage = renderAddPage;
  window.submitRecord = submitRecord;
  window.openTagPickerForAdd = openTagPickerForAdd;
  window.renderAddTagsDisplay = renderAddTagsDisplay;
  window.removeAddTag = removeAddTag;
})();

