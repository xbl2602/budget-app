/* ============================================================
   PURCHASE PLANS (大额分期消费计划)

   Three ways people actually pay for a big-ticket item:
     save   先攒后买     — set money aside for N months, then buy
     borrow 先买后还     — buy now out of savings, then refill the pot for N months
     credit 信用卡分期   — take the item now, the bank gets paid monthly

   All three squeeze the same N months of living budget; they differ only in
   whether the money really leaves your pocket each month. save/borrow are
   virtual (nothing is spent, the money is just reserved), credit generates a
   real record because the bank really is paid.

   The repayment maths lives in PlanMath (04-stats-engine.js) — this file is
   CRUD plus UI. No purchase record is ever generated: a plan's cost is
   expressed entirely through its monthly instalments, so recording the lump
   sum as well would double-count it.
   ============================================================ */
(function() {
'use strict';

const PLAN_MODES = ['save', 'borrow', 'credit'];
const MODE_ICON = { save: '🐖', borrow: '🏦', credit: '💳' };

// Which plans have their per-period ledger expanded in the center modal
const _planExpanded = {};

function round2(n) {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

function currentMonth() {
  return getMonthKey(new Date().toISOString());
}

function modeLabel(mode) {
  return __('plan.mode.' + mode);
}

// save = building a pot ("saved"); borrow/credit = clearing a debt ("repaid")
function paidLabel(mode) {
  return mode === 'save' ? __('plan.saved') : __('plan.repaid');
}

function remainLabel(mode) {
  return mode === 'save' ? __('plan.stillNeeded') : __('plan.stillOwed');
}

// Inline emoji grid — reuses the 88 presets from 16-render-categories.js.
// Deliberately NOT the category picker's modal: swapping modals would wipe the
// half-filled editor form behind it.
function emojiGridHtml() {
  const presets = (typeof EMOJI_GRID !== 'undefined' && Array.isArray(EMOJI_GRID)) ? EMOJI_GRID : [];
  const list = PLAN_MODES.map(m => MODE_ICON[m]).concat(['🎯'], presets);
  const seen = {};
  return list.filter(e => { if (seen[e]) return false; seen[e] = 1; return true; })
    .map(e => '<button type="button" class="plan-emoji" data-emoji="' + escHtml(e) + '">' + e + '</button>')
    .join('');
}

function leafCategoryOptions(selectedId) {
  const cats = DataStore.getCategories() || [];
  const hasChild = new Set();
  cats.forEach(c => { if (c && c.parentId) hasChild.add(c.parentId); });
  return cats
    .filter(c => c && !hasChild.has(c.id))
    .map(c => '<option value="' + escHtml(c.id) + '"' + (c.id === selectedId ? ' selected' : '') + '>' +
      escHtml(typeof getCategoryFullPath === 'function' ? getCategoryFullPath(c.id) : c.name) + '</option>')
    .join('');
}

/* ============================================================
   CREDIT-MODE RECORD SYNC

   Backfills the real instalment records a credit plan owes. Loops from
   startMonth rather than incrementing a counter, so skipping two months (or
   creating a plan that started in the past) still lands every period exactly
   once. Idempotent on planId + planMonth.
   ============================================================ */
function syncPlanRecords() {
  const nowMonth = currentMonth();
  const plans = DataStore.getPurchasePlans().filter(p => p && p.mode === 'credit' && p.status === 'active');
  if (!plans.length) return 0;
  const records = DataStore.getRecords(); // live reference — newly added rows are visible
  let created = 0;

  plans.forEach(p => {
    const sIdx = PlanMath.monthToIndex(p.startMonth);
    const nIdx = PlanMath.monthToIndex(nowMonth);
    if (!isFinite(sIdx) || !isFinite(nIdx)) return;
    const monthly = round2(p.totalAmount / p.months);
    for (let i = 0; i < p.months; i++) {
      const idx = sIdx + i;
      if (idx > nIdx) break;
      const m = PlanMath.indexToMonth(idx);
      if (records.some(r => r && r.planId === p.id && r.planMonth === m)) continue;
      // Final period absorbs the rounding remainder so the sum is exact
      const amt = (i === p.months - 1) ? round2(p.totalAmount - monthly * (p.months - 1)) : monthly;
      DataStore.addRecord({
        amount: amt,
        categoryId: p.categoryId || 'uncategorized',
        date: m + '-01T09:00',
        note: __('plan.recordNote', p.name, i + 1, p.months),
        tags: [],
        excludeFromAvg: true, // a fixed obligation, not daily spending behaviour
        planId: p.id,
        planMonth: m,
        createdAt: new Date().toISOString()
      });
      created++;
    }
  });
  if (created) logEvent('syncPlanRecords', 'created=' + created);
  return created;
}

/* ============================================================
   LIFECYCLE EVENTS (completion / overdue)
   ============================================================ */
function checkPlanEvents() {
  const month = currentMonth();
  const active = DataStore.getPurchasePlans().filter(p => p && p.status === 'active');
  if (!active.length) return;
  const state = PlanMath.computeUpTo(month);

  // One dialog at a time — showModal replaces content, so stacking would hide all but the last
  const done = active.filter(p => state[p.id] && state[p.id].isComplete && !p.notifiedComplete);
  if (done.length) {
    const p = done[0];
    DataStore.updatePurchasePlan(p.id, { notifiedComplete: true, status: 'completed' });
    showPlanCompleteDialog(p);
    return;
  }

  const late = active.filter(p => state[p.id] && state[p.id].isOverdue && !p.overdueAsked);
  if (late.length) showPlanOverdueDialog(late[0].id);
}

function showPlanCompleteDialog(plan) {
  const msgKey = plan.mode === 'save' ? 'plan.doneSave' : 'plan.doneDebt';
  showModal(
    '<div class="modal-title">' + __('plan.doneTitle') + '</div>' +
    '<div style="padding:8px 0 16px">' +
      '<p style="margin-bottom:12px">' + __(msgKey, escHtml(plan.name), formatMoney(plan.totalAmount)) + '</p>' +
      '<div class="flex flex-col gap-8">' +
        '<button class="btn btn-primary" data-plan-action="close">' + __('plan.gotIt') + '</button>' +
      '</div>' +
    '</div>'
  );
  bindPlanEvents();
}

function showPlanOverdueDialog(planId) {
  const plan = DataStore.getPurchasePlan(planId);
  if (!plan) return;
  const st = PlanMath.getState(planId, currentMonth());
  if (!st) return;
  showModal(
    '<div class="modal-title">' + __('plan.overdueTitle') + '</div>' +
    '<div style="padding:8px 0 16px">' +
      '<p style="margin-bottom:12px">' + __('plan.overdueMsg', escHtml(plan.name), formatMoney(st.remaining), escHtml(st.endMonth)) + '</p>' +
      '<div class="input-group">' +
        '<label class="input-label">' + __('plan.extendBy') + '</label>' +
        '<input type="number" class="input-field" id="planExtendMonths" min="1" max="120" value="3">' +
      '</div>' +
      '<div class="flex flex-col gap-8">' +
        '<button class="btn btn-primary" data-plan-action="extend" data-plan-id="' + escHtml(planId) + '">' + __('plan.extendBtn') + '</button>' +
        '<button class="btn btn-outline" data-plan-action="payoff" data-plan-id="' + escHtml(planId) + '">' + __('plan.payoffBtn') + '</button>' +
        '<button class="btn btn-ghost" data-plan-action="abandon" data-plan-id="' + escHtml(planId) + '">' + __('plan.abandonBtn') + '</button>' +
      '</div>' +
    '</div>'
  );
  bindPlanEvents();
}

function extendPlan(planId) {
  const el = document.getElementById('planExtendMonths');
  const add = Math.floor(parseFloat(el ? el.value : '3'));
  if (!isFinite(add) || add < 1) { showToast(__('plan.err.months'), 'error'); return; }
  const plan = DataStore.getPurchasePlan(planId);
  if (!plan) return;
  DataStore.updatePurchasePlan(planId, { months: plan.months + add, overdueAsked: false });
  showToast(__('plan.extended', add));
  closeModal();
  refreshCurrentPage();
}

// Writes a manual override for this month covering the whole outstanding balance
function payoffPlanNow(planId) {
  const m = currentMonth();
  const st = PlanMath.getState(planId, m);
  if (!st) return;
  DataStore.setPlanOverride(planId, m, st.remaining);
  DataStore.updatePurchasePlan(planId, { overdueAsked: false });
  showToast(__('plan.paidOff', formatMoney(st.remaining)));
  closeModal();
  refreshCurrentPage();
}

function abandonPlan(planId) {
  DataStore.updatePurchasePlan(planId, { status: 'cancelled', overdueAsked: true });
  showToast(__('plan.abandoned'));
  closeModal();
  refreshCurrentPage();
}

/* ============================================================
   PLAN CENTER MODAL
   ============================================================ */
/* Two-layer progress bar.
   Solid  = repaid through the end of last month; settled, cannot move.
   Hatch  = what THIS month is forecast to add at the current spending pace.
   The forecast layer can sit short of the solid one's provisional position —
   that is the point: spending the rest of the month eats into it. */
function barHtml(st, month, pct, barColor, forecast) {
  const p = st.plan;
  const total = p.totalAmount || 1;
  const cur = st.byMonth[month];
  const fc = (forecast && forecast.reliable && forecast.plans) ? forecast.plans[p.id] : null;

  if (!fc || !cur || st.isComplete) {
    return '<div class="plan-bar"><div class="plan-bar-fill" style="width:' + pct +
      '%;background:' + barColor + '"></div></div>';
  }
  const settled = Math.max(0, st.paid - cur.actual);       // through last month
  const settledPct = Math.min(100, (settled / total) * 100);
  const forecastPct = Math.min(100 - settledPct, (fc.predictedPay / total) * 100);
  const fcColor = fc.shortfall > 0.005 ? 'var(--warning)' : 'var(--success)';
  return '<div class="plan-bar plan-bar-dual">' +
    '<div class="plan-bar-fill" style="width:' + settledPct + '%;background:' + barColor + '"></div>' +
    '<div class="plan-bar-forecast" style="left:' + settledPct + '%;width:' + forecastPct +
      '%;--fc:' + fcColor + '"></div>' +
  '</div>' +
  '<div class="plan-bar-key">' +
    '<span><i class="k-solid" style="background:' + barColor + '"></i>' + __('plan.keySettled') + '</span>' +
    '<span><i class="k-hatch" style="--fc:' + fcColor + '"></i>' + __('plan.keyForecast') + '</span>' +
  '</div>';
}

function planCardHtml(st, month, forecast) {
  const p = st.plan;
  const pct = Math.round(st.progressPct);
  const barColor = st.isOverdue ? 'var(--danger)' : (st.onTrack ? 'var(--success)' : 'var(--warning)');
  const cur = st.byMonth[month];
  const isCredit = p.mode === 'credit';
  const badge = st.isComplete
    ? '<span class="plan-badge plan-badge-done">' + __('plan.badgeDone') + '</span>'
    : (st.isOverdue
      ? '<span class="plan-badge plan-badge-late">' + __('plan.badgeLate') + '</span>'
      : (st.onTrack ? '' : '<span class="plan-badge plan-badge-behind">' + __('plan.badgeBehind') + '</span>'));

  // --- headline: one big "how far along am I" line ---
  let html = '<div class="plan-card">' +
    '<div class="plan-card-head">' +
      '<span class="plan-card-icon">' + escHtml(p.icon || MODE_ICON[p.mode] || '🎯') + '</span>' +
      '<span class="plan-card-name">' + escHtml(p.name) + '</span>' +
      '<span class="plan-mode-chip">' + escHtml(modeLabel(p.mode)) + '</span>' +
      badge +
    '</div>' +
    '<div class="plan-headline">' +
      '<div><span class="plan-headline-label">' + escHtml(paidLabel(p.mode)) + '</span>' +
        '<span class="plan-headline-num">' + formatMoney(st.paid) + '</span>' +
        '<span class="plan-headline-total"> / ' + formatMoney(p.totalAmount) + '</span></div>' +
      '<div class="plan-headline-pct">' + pct + '%</div>' +
    '</div>' +
    barHtml(st, month, pct, barColor, forecast) +
    '<div class="plan-timeline">' +
      '<span>' + escHtml(p.startMonth) + '</span>' +
      '<span>' + (st.isComplete
        ? __('plan.finishedOn', escHtml(st.completedMonth || st.endMonth))
        : __('plan.remainLine', escHtml(remainLabel(p.mode)), formatMoney(st.remaining), st.periodsLeft + 1)) + '</span>' +
      '<span>' + escHtml(st.endMonth) + '</span>' +
    '</div>';

  // --- this month: the single most useful block, spelled out ---
  if (!st.isComplete && cur) {
    const statusText = cur.short > 0.005
      ? '<span class="plan-stat-warn">' + __('plan.thisMonthShort', formatMoney(cur.short)) + '</span>'
      : '<span class="plan-stat-ok">' + __('plan.thisMonthOk') + '</span>';
    html +=
      '<div class="plan-month-box">' +
        '<div class="plan-month-title">' + __('plan.thisMonth', escHtml(month)) + '</div>' +
        '<div class="plan-stat-row">' +
          '<div class="plan-stat"><span>' + __('plan.shouldPay') + '</span><b>' + formatMoney(cur.due) + '</b></div>' +
          '<div class="plan-stat"><span>' + __('plan.actuallyPaid') + '</span><b>' + formatMoney(cur.actual) + '</b></div>' +
          '<div class="plan-stat"><span>' + __('plan.statusLabel') + '</span><b>' + statusText + '</b></div>' +
        '</div>' +
      '</div>';

    // Forecast: at the current pace, does this month's instalment get met?
    const fc = (forecast && forecast.reliable && forecast.plans) ? forecast.plans[p.id] : null;
    if (fc && !isCredit) {
      html += fc.shortfall > 0.005
        ? '<div class="plan-forecast plan-forecast-bad">' +
            __('plan.forecastShort', formatMoney(fc.predictedPay), formatMoney(fc.due), formatMoney(fc.shortfall)) +
          '</div>'
        : '<div class="plan-forecast plan-forecast-ok">' +
            __('plan.forecastOk', formatMoney(fc.due)) +
          '</div>';
    }

    // Explain why the due amount drifted from the original even split
    const originalPer = p.totalAmount / p.months;
    if (!isCredit && cur.due > originalPer + 0.01) {
      html += '<div class="plan-why">' +
        __('plan.whyHigher', formatMoney(originalPer), formatMoney(cur.due)) + '</div>';
    }
    if (!cur.incomeKnown) {
      html += '<div class="plan-hint">' + __('plan.noIncomeHint') + '</div>';
    }
  }

  // --- per-period ledger (the actual repayment history) ---
  const months = Object.keys(st.byMonth).sort();
  if (months.length) {
    const open = !!_planExpanded[p.id];
    html += '<button class="plan-detail-toggle" data-plan-action="toggle" data-plan-id="' + escHtml(p.id) + '">' +
      __('plan.detailToggle', months.length) + ' ' + (open ? '▴' : '▾') + '</button>';
    if (open) {
      html += '<div class="plan-ledger">' +
        '<div class="plan-ledger-row plan-ledger-head">' +
          '<span>' + __('plan.colPeriod') + '</span>' +
          '<span>' + __('plan.colShould') + '</span>' +
          '<span>' + __('plan.colActual') + '</span>' +
          '<span>' + __('plan.colState') + '</span>' +
        '</div>';
      months.forEach((m, i) => {
        const e = st.byMonth[m];
        const mark = e.short > 0.005
          ? '<span class="plan-stat-warn">−' + formatMoney(e.short) + '</span>'
          : '<span class="plan-stat-ok">✓</span>';
        html += '<div class="plan-ledger-row' + (m === month ? ' plan-ledger-current' : '') + '">' +
          '<span>' + (i + 1) + '/' + p.months + '<i>' + escHtml(m) + '</i></span>' +
          '<span>' + formatMoney(e.due) + '</span>' +
          '<span>' + formatMoney(e.actual) + '</span>' +
          '<span>' + mark + '</span>' +
        '</div>';
      });
      if (!st.isComplete && st.periodsLeft > 0) {
        html += '<div class="plan-ledger-future">' +
          __('plan.futureProjection', st.periodsLeft, formatMoney(st.remaining / st.periodsLeft)) + '</div>';
      }
      html += '</div>';
    }
  }

  html +=
    '<div class="plan-card-actions">' +
      '<button class="btn btn-sm btn-outline" data-plan-action="edit" data-plan-id="' + escHtml(p.id) + '">' + __('plan.edit') + '</button>' +
      '<button class="btn btn-sm btn-ghost" data-plan-action="delete" data-plan-id="' + escHtml(p.id) + '">' + __('plan.delete') + '</button>' +
    '</div>' +
  '</div>';
  return html;
}

/* The "will I make it" panel — the answer to 是否储蓄足够, and if not, how much
   will actually be saved. All of it derives from the projected month-end spend
   rather than what has been spent so far. */
function forecastSummaryHtml(month) {
  const f = PlanMath.getForecast(month);
  if (!f.hasData) {
    return '<div class="plan-forecast-panel"><div class="plan-hint">' + __('plan.forecastNoIncome') + '</div></div>';
  }
  // Too early in the month for the daily pace to mean anything — say so plainly
  // rather than extrapolating a scary verdict from three days of data.
  const verdictClass = !f.reliable ? 'warn' : (f.totalShortfall > 0.005 ? 'bad' : (f.targetMet ? 'ok' : 'warn'));
  const verdict = !f.reliable
    ? __('plan.verdictTooEarly', f.daysPassed)
    : (f.totalShortfall > 0.005
      ? __('plan.verdictPlanShort', formatMoney(f.totalShortfall))
      : (f.targetMet
        ? __('plan.verdictAllGood')
        : __('plan.verdictSavingsShort', formatMoney(f.savingsShortfall))));

  return '<div class="plan-forecast-panel">' +
    '<div class="plan-forecast-title">' + __('plan.forecastTitle', escHtml(month)) + '</div>' +
    '<div class="plan-forecast-grid">' +
      '<div><span>' + __('plan.fcSpend') + '</span><b>' + formatMoney(f.predictedSpend) + '</b></div>' +
      '<div><span>' + __('plan.fcSurplus') + '</span><b>' + formatMoney(f.predictedSurplus) + '</b></div>' +
      '<div><span>' + __('plan.fcRepay') + '</span><b>' + formatMoney(f.totalPredictedPay) +
        (f.totalShortfall > 0.005 ? ' <em class="plan-stat-warn">/ ' + formatMoney(f.totalDue) + '</em>' : '') + '</b></div>' +
      '<div><span>' + __('plan.fcSavings') + '</span><b class="' + (f.targetMet ? 'plan-stat-ok' : 'plan-stat-warn') + '">' +
        formatMoney(f.predictedSavings) +
        (f.targetAmount > 0 ? ' <em>/ ' + formatMoney(f.targetAmount) + '</em>' : '') + '</b></div>' +
    '</div>' +
    '<div class="plan-verdict plan-verdict-' + verdictClass + '">' + verdict + '</div>' +
  '</div>';
}

function openPlanCenter() {
  const month = currentMonth();
  const state = PlanMath.computeUpTo(month);
  const forecast = PlanMath.getForecast(month);
  const all = DataStore.getPurchasePlans();
  const active = all.filter(p => p.status === 'active' && state[p.id]);
  const closed = all.filter(p => p.status !== 'active' && state[p.id]);
  const virtualDue = PlanMath.getVirtualDue(month);
  const creditDue = active
    .filter(p => p.mode === 'credit')
    .reduce((s, p) => s + (state[p.id].byMonth[month] ? state[p.id].byMonth[month].due : 0), 0);

  let body = '';
  if (!all.length) {
    body = '<div class="empty-state"><div class="empty-icon">🎯</div><div class="empty-text">' + __('plan.empty') + '</div></div>';
  } else {
    body += '<div class="plan-summary">' +
      '<div><span class="text-muted text-sm">' + __('plan.monthOccupied') + '</span>' +
      '<div class="text-lg font-bold">' + formatMoney(virtualDue + creditDue) + '</div></div>' +
      (creditDue > 0 ? '<div class="text-xs text-muted">' + __('plan.creditPortion', formatMoney(creditDue)) + '</div>' : '') +
      '</div>';
    body += forecastSummaryHtml(month);
    body += '<div class="plan-legend">' + __('plan.legend') + '</div>';
    body += active.map(p => planCardHtml(state[p.id], month, forecast)).join('');
    if (closed.length) {
      body += '<div class="plan-section-title">' + __('plan.closedSection') + '</div>';
      body += closed.map(p => planCardHtml(state[p.id], month, null)).join('');
    }
  }

  showModal(
    '<div class="modal-title">' + __('plan.centerTitle') + '</div>' +
    '<div class="plan-center-body">' + body + '</div>' +
    '<div class="modal-actions">' +
      '<button class="btn btn-ghost" data-plan-action="close">' + __('plan.close') + '</button>' +
      '<button class="btn btn-primary" data-plan-action="new">' + __('plan.newBtn') + '</button>' +
    '</div>'
  );
  bindPlanEvents();
}

/* ============================================================
   EDITOR
   ============================================================ */
function openPlanEditor(planId) {
  const plan = planId ? DataStore.getPurchasePlan(planId) : null;
  const mode = plan ? plan.mode : 'save';
  const modeBtns = PLAN_MODES.map(md =>
    '<button type="button" class="plan-mode-btn' + (md === mode ? ' active' : '') + '" data-plan-mode="' + md + '">' +
      MODE_ICON[md] + ' ' + escHtml(modeLabel(md)) +
    '</button>').join('');

  showModal(
    '<div class="modal-title">' + (plan ? __('plan.editTitle') : __('plan.newTitle')) + '</div>' +
    '<div class="plan-editor">' +
      '<div class="input-group">' +
        '<label class="input-label">' + __('plan.fieldName') + '</label>' +
        '<input type="text" class="input-field" id="planName" maxlength="40" value="' + escHtml(plan ? plan.name : '') + '">' +
      '</div>' +
      '<div class="input-group">' +
        '<label class="input-label">' + __('plan.fieldIcon') + '</label>' +
        '<div class="plan-icon-row">' +
          '<input type="text" class="input-field plan-icon-input" id="planIcon" maxlength="8" value="' +
            escHtml(plan ? (plan.icon || MODE_ICON[mode]) : MODE_ICON[mode]) + '">' +
          '<button type="button" class="btn btn-sm btn-outline" id="planIconToggle">' + __('plan.pickIcon') + '</button>' +
        '</div>' +
        '<div class="plan-emoji-grid" id="planEmojiGrid" style="display:none">' + emojiGridHtml() + '</div>' +
      '</div>' +
      '<div class="input-group">' +
        '<label class="input-label">' + __('plan.fieldAmount') + '</label>' +
        '<input type="text" inputmode="decimal" class="input-field" id="planAmount" value="' + (plan ? plan.totalAmount : '') + '">' +
      '</div>' +
      '<div class="input-group">' +
        '<label class="input-label">' + __('plan.fieldMode') + '</label>' +
        '<div class="plan-mode-group" id="planModeGroup">' + modeBtns + '</div>' +
        '<div class="plan-mode-desc" id="planModeDesc"></div>' +
      '</div>' +
      '<div class="flex gap-8">' +
        '<div class="input-group" style="flex:1">' +
          '<label class="input-label">' + __('plan.fieldStart') + '</label>' +
          '<input type="month" class="input-field" id="planStart" value="' + escHtml(plan ? plan.startMonth : currentMonth()) + '">' +
        '</div>' +
        '<div class="input-group" style="flex:1">' +
          '<label class="input-label">' + __('plan.fieldMonths') + '</label>' +
          '<input type="number" class="input-field" id="planMonths" min="1" max="120" value="' + (plan ? plan.months : 6) + '">' +
        '</div>' +
      '</div>' +
      '<div class="input-group" id="planCategoryGroup" style="display:none">' +
        '<label class="input-label">' + __('plan.fieldCategory') + '</label>' +
        '<select class="input-field" id="planCategory">' + leafCategoryOptions(plan ? plan.categoryId : null) + '</select>' +
      '</div>' +
      '<div class="input-group">' +
        '<label class="input-label">' + __('plan.fieldNote') + '</label>' +
        '<input type="text" class="input-field" id="planNote" maxlength="100" value="' + escHtml(plan ? (plan.note || '') : '') + '">' +
      '</div>' +
      '<div class="plan-preview" id="planPreview"></div>' +
    '</div>' +
    '<div class="modal-actions">' +
      '<button class="btn btn-ghost" data-plan-action="center">' + __('plan.cancel') + '</button>' +
      '<button class="btn btn-primary" data-plan-action="save" data-plan-id="' + escHtml(planId || '') + '">' + __('plan.save') + '</button>' +
    '</div>'
  );

  const group = document.getElementById('planModeGroup');
  if (group) {
    group.querySelectorAll('[data-plan-mode]').forEach(btn => {
      btn.onclick = function() {
        group.querySelectorAll('[data-plan-mode]').forEach(b => b.classList.remove('active'));
        this.classList.add('active');
        updateEditorMode();
      };
    });
  }
  ['planAmount', 'planMonths'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.oninput = updateEditorPreview;
  });

  // Inline emoji picker
  const iconToggle = document.getElementById('planIconToggle');
  const emojiGrid = document.getElementById('planEmojiGrid');
  if (iconToggle && emojiGrid) {
    iconToggle.onclick = function() {
      emojiGrid.style.display = emojiGrid.style.display === 'none' ? '' : 'none';
    };
    emojiGrid.querySelectorAll('[data-emoji]').forEach(btn => {
      btn.onclick = function() {
        const input = document.getElementById('planIcon');
        if (input) input.value = this.getAttribute('data-emoji');
        emojiGrid.style.display = 'none';
      };
    });
  }

  updateEditorMode();
  bindPlanEvents();
}

function selectedEditorMode() {
  const active = document.querySelector('#planModeGroup .plan-mode-btn.active');
  return active ? active.getAttribute('data-plan-mode') : 'save';
}

function updateEditorMode() {
  const mode = selectedEditorMode();
  const catGroup = document.getElementById('planCategoryGroup');
  if (catGroup) catGroup.style.display = mode === 'credit' ? '' : 'none';
  const desc = document.getElementById('planModeDesc');
  if (desc) desc.innerHTML = __('plan.modeDesc.' + mode);
  // The icon tracks the mode only while it is still one of the mode defaults.
  // Once the user picks their own, switching mode must not overwrite it.
  const iconEl = document.getElementById('planIcon');
  if (iconEl && PLAN_MODES.some(m => MODE_ICON[m] === iconEl.value)) {
    iconEl.value = MODE_ICON[mode];
  }
  updateEditorPreview();
}

function updateEditorPreview() {
  const box = document.getElementById('planPreview');
  if (!box) return;
  const amount = parseFloat((document.getElementById('planAmount') || {}).value);
  const months = Math.floor(parseFloat((document.getElementById('planMonths') || {}).value));
  if (!isFinite(amount) || amount <= 0 || !isFinite(months) || months < 1) { box.innerHTML = ''; return; }
  const mode = selectedEditorMode();
  const per = round2(amount / months);
  let html = '<div class="plan-preview-main">' + __('plan.previewPer', formatMoney(per), months) + '</div>';
  if (mode !== 'credit') {
    html += '<div class="plan-preview-sub">' + __('plan.previewRolling') + '</div>';
  }
  if (mode === 'borrow') {
    html += '<div class="plan-preview-warn">' + __('plan.borrowWarn') + '</div>';
  }
  box.innerHTML = html;
}

function savePlanEditor(planId) {
  const name = (document.getElementById('planName') || {}).value || '';
  const amount = parseFloat((document.getElementById('planAmount') || {}).value);
  const months = Math.floor(parseFloat((document.getElementById('planMonths') || {}).value));
  const startMonth = (document.getElementById('planStart') || {}).value || '';
  const note = (document.getElementById('planNote') || {}).value || '';
  const mode = selectedEditorMode();
  const categoryId = (document.getElementById('planCategory') || {}).value || '';

  if (!name.trim()) { showToast(__('plan.err.name'), 'error'); return; }
  if (!isFinite(amount) || amount <= 0) { showToast(__('plan.err.amount'), 'error'); return; }
  if (!isFinite(months) || months < 1 || months > 120) { showToast(__('plan.err.months'), 'error'); return; }
  if (!/^\d{4}-\d{2}$/.test(startMonth)) { showToast(__('plan.err.start'), 'error'); return; }
  if (mode === 'credit' && !categoryId) { showToast(__('plan.err.category'), 'error'); return; }

  const iconRaw = ((document.getElementById('planIcon') || {}).value || '').trim();
  const payload = {
    name: name.trim(),
    icon: iconRaw ? iconRaw.slice(0, 8) : MODE_ICON[mode],
    totalAmount: round2(amount),
    mode: mode,
    startMonth: startMonth,
    months: months,
    categoryId: mode === 'credit' ? categoryId : '',
    note: note.trim()
  };

  if (planId) {
    const prev = DataStore.getPurchasePlan(planId);
    // Switching away from credit leaves its generated records orphaned — clear them
    if (prev && prev.mode === 'credit' && mode !== 'credit') {
      DataStore._data.records = DataStore.getRecords().filter(r => !r || r.planId !== planId);
    }
    DataStore.updatePurchasePlan(planId, payload);
    showToast(__('plan.updated'));
  } else {
    payload.status = 'active';
    payload.overrides = {};
    DataStore.addPurchasePlan(payload);
    showToast(__('plan.created'));
  }
  syncPlanRecords();
  openPlanCenter();
  refreshCurrentPage();
}

function confirmDeletePlan(planId) {
  const plan = DataStore.getPurchasePlan(planId);
  if (!plan) return;
  const linked = DataStore.getRecords().filter(r => r && r.planId === planId).length;
  showModal(
    '<div class="modal-title">' + __('plan.deleteTitle') + '</div>' +
    '<div style="padding:8px 0 16px">' +
      '<p style="margin-bottom:12px">' + __('plan.deleteMsg', escHtml(plan.name)) + '</p>' +
      (linked ? '<p class="text-sm text-warning">' + __('plan.deleteCascade', linked) + '</p>' : '') +
    '</div>' +
    '<div class="modal-actions">' +
      '<button class="btn btn-ghost" data-plan-action="center">' + __('plan.cancel') + '</button>' +
      '<button class="btn btn-danger" data-plan-action="delete-confirm" data-plan-id="' + escHtml(planId) + '">' + __('plan.delete') + '</button>' +
    '</div>'
  );
  bindPlanEvents();
}

function doDeletePlan(planId) {
  DataStore.deletePurchasePlan(planId);
  showToast(__('plan.deleted'));
  openPlanCenter();
  refreshCurrentPage();
}

/* ============================================================
   EVENT BINDING
   User-supplied names never enter inline onclick — actions travel as data-*
   attributes and are wired up here after each render.
   ============================================================ */
function bindPlanEvents() {
  const root = document.getElementById('modalContent');
  if (!root) return;
  root.querySelectorAll('[data-plan-action]').forEach(el => {
    el.onclick = function() {
      const act = this.getAttribute('data-plan-action');
      const id = this.getAttribute('data-plan-id');
      switch (act) {
        case 'toggle': _planExpanded[id] = !_planExpanded[id]; openPlanCenter(); break;
        case 'new': openPlanEditor(null); break;
        case 'edit': openPlanEditor(id); break;
        case 'save': savePlanEditor(id || null); break;
        case 'delete': confirmDeletePlan(id); break;
        case 'delete-confirm': doDeletePlan(id); break;
        case 'center': openPlanCenter(); break;
        case 'extend': extendPlan(id); break;
        case 'payoff': payoffPlanNow(id); break;
        case 'abandon': abandonPlan(id); break;
        case 'close': closeModal(); refreshCurrentPage(); break;
      }
    };
  });
}

/* ============================================================
   OVERVIEW ENTRY CARD
   ============================================================ */
// Always rendered, like the Bills Center card. An empty state that hides itself
// would leave a first-time user with no way to create their first plan.
function renderPlanOverviewCard(month) {
  const all = DataStore.getPurchasePlans();
  const active = all.filter(p => p && p.status === 'active');
  let due = 0, late = 0, only = null;
  if (active.length) {
    const state = PlanMath.computeUpTo(month);
    active.forEach(p => {
      const st = state[p.id];
      if (!st) return;
      if (st.byMonth[month]) due += st.byMonth[month].due;
      if (st.isOverdue) late++;
      if (active.length === 1) only = st;
    });
  }
  // With a single plan there is room to show its actual progress rather than a count
  const sub = !active.length
    ? __('plan.cardNone')
    : (late
      ? __('plan.cardOverdue', late)
      : (only
        ? __('plan.cardOne', escHtml(only.plan.name), Math.round(only.progressPct), formatMoney(due))
        : __('plan.cardSummary', active.length, formatMoney(due))));

  return '' +
    '<div class="card plan-entry-card" style="border-left:4px solid ' + (late ? 'var(--danger)' : 'var(--primary)') + '" onclick="openPlanCenter()">' +
      '<div class="flex items-center justify-between">' +
        '<div class="flex items-center gap-8">' +
          '<span style="font-size:1.5rem">🎯</span>' +
          '<div>' +
            '<div class="font-bold">' + __('plan.cardTitle') + '</div>' +
            '<div class="text-xs text-muted">' + sub + '</div>' +
          '</div>' +
        '</div>' +
        '<button class="btn btn-sm btn-outline">' + (active.length ? __('plan.cardOpen') : __('plan.cardCreate')) + '</button>' +
      '</div>' +
    '</div>';
}

  // i18n translations
  addI18nEntries({
    'plan.centerTitle': { zh: '🎯 大额计划中心', en: '🎯 Purchase Plans' },
    'plan.newTitle': { zh: '新建大额计划', en: 'New Purchase Plan' },
    'plan.editTitle': { zh: '编辑大额计划', en: 'Edit Purchase Plan' },
    'plan.empty': { zh: '还没有大额计划。攒钱买台电脑？分期换手机？建一个试试。', en: 'No purchase plans yet. Saving for a laptop? Paying off a phone? Create one.' },
    'plan.newBtn': { zh: '+ 新建计划', en: '+ New Plan' },
    'plan.close': { zh: '关闭', en: 'Close' },
    'plan.cancel': { zh: '取消', en: 'Cancel' },
    'plan.save': { zh: '保存', en: 'Save' },
    'plan.edit': { zh: '编辑', en: 'Edit' },
    'plan.delete': { zh: '删除', en: 'Delete' },
    'plan.gotIt': { zh: '知道了', en: 'Got it' },

    'plan.mode.save': { zh: '先攒后买', en: 'Save First' },
    'plan.mode.borrow': { zh: '先买后还', en: 'Buy Now, Refill' },
    'plan.mode.credit': { zh: '信用卡分期', en: 'Card Instalment' },
    'plan.modeDesc.save': { zh: '每月存一笔，攒够了再买。这笔钱只是被预留，不会记成消费。', en: 'Set money aside each month, buy when it is all there. Reserved, not spent — no record is created.' },
    'plan.modeDesc.borrow': { zh: '已经用储蓄买下了，接下来几个月把储蓄补回来。同样只占额度，不记成消费。', en: 'Already bought it out of savings; now refill the pot over the coming months. Reserves budget, creates no record.' },
    'plan.modeDesc.credit': { zh: '东西当场拿走，每月真实还款给银行。会自动生成流水记录，金额固定不滚动。', en: 'Item taken now, real monthly payments to the bank. Generates real records; the amount is fixed and never rolls over.' },

    'plan.fieldName': { zh: '目标物', en: 'Item' },
    'plan.fieldIcon': { zh: '图标', en: 'Icon' },
    'plan.pickIcon': { zh: '选择', en: 'Pick' },
    'plan.fieldAmount': { zh: '总金额 (RM)', en: 'Total Amount (RM)' },
    'plan.fieldMode': { zh: '模式', en: 'Mode' },
    'plan.fieldStart': { zh: '起始月份', en: 'Start Month' },
    'plan.fieldMonths': { zh: '期数', en: 'Periods' },
    'plan.fieldCategory': { zh: '记账分类', en: 'Category' },
    'plan.fieldNote': { zh: '备注', en: 'Note' },

    'plan.previewPer': { zh: '每期约 {0}，共 {1} 期', en: 'About {0} per period, {1} periods' },
    'plan.previewRolling': { zh: '某个月钱不够时，欠下的部分会自动摊到剩余月份，月供随之调高。', en: 'If a month falls short, the gap rolls into the remaining periods and the monthly amount rises.' },
    'plan.borrowWarn': { zh: '⚠️ 如果你已经手动记过这笔购买，建议删掉那条记录，否则会重复计算。', en: '⚠️ If you already logged this purchase by hand, delete that record — otherwise it is counted twice.' },

    'plan.saved': { zh: '已存', en: 'Saved' },
    'plan.repaid': { zh: '已还', en: 'Repaid' },
    'plan.stillNeeded': { zh: '还差', en: 'To go' },
    'plan.stillOwed': { zh: '欠款', en: 'Owed' },
    'plan.periodsLeft': { zh: '剩 {0} 期', en: '{0} periods left' },
    'plan.dueThisMonth': { zh: '本期应付', en: 'Due now' },
    'plan.remainLine': { zh: '{0} {1} · 还剩 {2} 期（含本期）', en: '{0} {1} · {2} periods to go (incl. this one)' },
    'plan.thisMonth': { zh: '本月 {0}', en: 'This month · {0}' },
    'plan.shouldPay': { zh: '应付', en: 'Due' },
    'plan.actuallyPaid': { zh: '实付', en: 'Paid' },
    'plan.statusLabel': { zh: '状态', en: 'Status' },
    'plan.thisMonthOk': { zh: '✅ 已足额', en: '✅ On track' },
    'plan.thisMonthShort': { zh: '⚠️ 差 {0}', en: '⚠️ Short {0}' },
    'plan.whyHigher': { zh: '原定每期 {0}，因前几期没还够，本期已上调到 {1}', en: 'Originally {0} per period; earlier shortfalls raised this one to {1}' },
    'plan.detailToggle': { zh: '📋 每期明细（{0} 期）', en: '📋 Period breakdown ({0})' },
    'plan.colPeriod': { zh: '期数', en: 'Period' },
    'plan.colShould': { zh: '应付', en: 'Due' },
    'plan.colActual': { zh: '实付', en: 'Paid' },
    'plan.colState': { zh: '差额', en: 'Gap' },
    'plan.futureProjection': { zh: '本期之后还有 {0} 期，按目前进度每期约 {1}', en: '{0} period(s) after this one, about {1} each at the current pace' },
    'plan.legend': { zh: '每期应付 = 剩余金额 ÷ 剩余期数。某个月结余不够时，欠的部分会自动摊到后面几期，应付金额随之上调。', en: 'Due = remaining ÷ periods left. If a month comes up short, the gap spreads across later periods and the due amount rises.' },

    'plan.keySettled': { zh: '往期已还', en: 'Settled' },
    'plan.keyForecast': { zh: '本月预计', en: 'Forecast' },
    'plan.forecastTitle': { zh: '📉 按当前消费速度预测（{0} 月末）', en: '📉 Forecast at your current pace (end of {0})' },
    'plan.forecastNoIncome': { zh: '设置本月收入后，这里会按你的消费速度预测月末能还多少、能存多少。', en: 'Set this month\'s income and this panel will project how much you can repay and save at your current pace.' },
    'plan.fcSpend': { zh: '预计月末支出', en: 'Projected spend' },
    'plan.fcSurplus': { zh: '预计结余', en: 'Projected surplus' },
    'plan.fcRepay': { zh: '预计还款', en: 'Projected repayment' },
    'plan.fcSavings': { zh: '预计储蓄', en: 'Projected savings' },
    'plan.verdictTooEarly': { zh: '📅 本月才过 {0} 天，按日均推算还不作数。等几天数据多了再看这里。', en: '📅 Only {0} day(s) into the month — a daily-pace projection is not meaningful yet. Check back in a few days.' },
    'plan.verdictAllGood': { zh: '✅ 照这个花法，月供还得上，储蓄目标也够。', en: '✅ At this pace the instalment is covered and the savings target is met.' },
    'plan.verdictSavingsShort': { zh: '⚠️ 月供还得上，但储蓄目标会差 {0}。想补上就得再省这么多。', en: '⚠️ The instalment is covered, but savings will fall {0} short. Spend that much less to close the gap.' },
    'plan.verdictPlanShort': { zh: '❌ 照这个花法，本月月供会差 {0}，储蓄目标也达不成。欠的部分会自动摊到后面几期，之后月供会更高。', en: '❌ At this pace the instalment falls {0} short and the savings target is missed. The gap rolls into later periods, raising future dues.' },
    'plan.forecastOk': { zh: '📉 按当前消费速度，本月 {0} 还得上', en: '📉 At the current pace this month\'s {0} is covered' },
    'plan.forecastShort': { zh: '📉 按当前消费速度，本月预计只还得起 {0}（应付 {1}，差 {2}）', en: '📉 At the current pace only {0} will be repaid this month (due {1}, short {2})' },
    'plan.finishedOn': { zh: '{0} 完成', en: 'Completed {0}' },
    'plan.monthOccupied': { zh: '本月合计占用', en: 'Reserved this month' },
    'plan.creditPortion': { zh: '其中 {0} 为信用卡分期，已计入流水', en: 'Of which {0} is card instalments, already in records' },
    'plan.closedSection': { zh: '已结束', en: 'Closed' },
    'plan.noIncomeHint': { zh: '该月未设置收入，按计划全额推进', en: 'No income set for this month — assumed on schedule' },

    'plan.badgeDone': { zh: '已完成', en: 'Done' },
    'plan.badgeLate': { zh: '逾期', en: 'Overdue' },
    'plan.badgeBehind': { zh: '本期未足额', en: 'Behind' },

    'plan.cardTitle': { zh: '大额计划', en: 'Purchase Plans' },
    'plan.cardSummary': { zh: '{0} 个进行中 · 本月占用 {1}', en: '{0} active · {1} reserved this month' },
    'plan.cardOne': { zh: '{0} · 已完成 {1}% · 本月应付 {2}', en: '{0} · {1}% done · {2} due this month' },
    'plan.cardOverdue': { zh: '⚠️ {0} 个计划已逾期，需要处理', en: '⚠️ {0} plan(s) overdue — needs attention' },
    'plan.cardNone': { zh: '攒钱买台电脑？分期换手机？点这里建一个', en: 'Saving for a laptop? Paying off a phone? Tap to create one' },
    'plan.cardOpen': { zh: '查看', en: 'Open' },
    'plan.cardCreate': { zh: '新建', en: 'Create' },
    'plan.occupiedRow': { zh: '大额计划占用', en: 'Plans reserved' },
    'plan.freeSavings': { zh: '可自由支配', en: 'Free to use' },

    'plan.doneTitle': { zh: '🎉 计划完成', en: '🎉 Plan Complete' },
    'plan.doneSave': { zh: '「{0}」已经攒够 {1}，可以去买了！', en: 'You have saved the full {1} for "{0}" — go get it!' },
    'plan.doneDebt': { zh: '「{0}」的 {1} 已经还清了。', en: '"{0}" is fully repaid — {1} cleared.' },

    'plan.overdueTitle': { zh: '⏰ 计划已到期但未还清', en: '⏰ Plan Past Due' },
    'plan.overdueMsg': { zh: '「{0}」原定 {2} 结束，但还剩 {1} 没有完成。你想怎么处理？', en: '"{0}" was due to finish in {2} but {1} is still outstanding. What would you like to do?' },
    'plan.extendBy': { zh: '延长期数', en: 'Extend by (periods)' },
    'plan.extendBtn': { zh: '延期继续', en: 'Extend' },
    'plan.payoffBtn': { zh: '本月一次性补齐', en: 'Clear it this month' },
    'plan.abandonBtn': { zh: '放弃这个计划', en: 'Abandon plan' },
    'plan.extended': { zh: '已延长 {0} 期', en: 'Extended by {0} periods' },
    'plan.paidOff': { zh: '已补齐 {0}', en: 'Cleared {0}' },
    'plan.abandoned': { zh: '计划已放弃', en: 'Plan abandoned' },

    'plan.deleteTitle': { zh: '删除计划', en: 'Delete Plan' },
    'plan.deleteMsg': { zh: '确定要删除「{0}」吗？此操作无法撤销。', en: 'Delete "{0}"? This cannot be undone.' },
    'plan.deleteCascade': { zh: '⚠️ 同时会删除该计划自动生成的 {0} 条还款流水。', en: '⚠️ This also deletes {0} auto-generated instalment record(s).' },
    'plan.created': { zh: '计划已创建', en: 'Plan created' },
    'plan.updated': { zh: '计划已更新', en: 'Plan updated' },
    'plan.deleted': { zh: '计划已删除', en: 'Plan deleted' },
    'plan.recordNote': { zh: '{0} 分期 第{1}/{2}期', en: '{0} instalment {1}/{2}' },

    'plan.err.name': { zh: '请填写目标物名称', en: 'Please enter an item name' },
    'plan.err.amount': { zh: '请输入有效的总金额', en: 'Please enter a valid amount' },
    'plan.err.months': { zh: '期数需在 1–120 之间', en: 'Periods must be between 1 and 120' },
    'plan.err.start': { zh: '请选择起始月份', en: 'Please pick a start month' },
    'plan.err.category': { zh: '信用卡分期需要选择记账分类', en: 'Card instalments need a category' }
  });

/* ============================================================
   BOOTSTRAP

   Self-registering rather than called from 22-init.js: build.sh concatenates
   by filename, so 22 executes before this file exists and a direct call there
   would hit an undefined function whenever readyState !== 'loading'.
   ============================================================ */
function planBootstrap() {
  if (window._pinRequired) return; // data still locked; initApp() re-triggers us
  try { syncPlanRecords(); } catch (e) { console.error('[plan] record sync failed', e); }
  // Never stomp a dialog someone else already opened (e.g. the month-rollover reminder)
  const overlay = document.getElementById('modalOverlay');
  if (overlay && overlay.classList.contains('open')) return;
  try { checkPlanEvents(); } catch (e) { console.error('[plan] event check failed', e); }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', function() { setTimeout(planBootstrap, 800); });
} else {
  setTimeout(planBootstrap, 800);
}

  // === EXPORTS ===
  window.planBootstrap = planBootstrap;
  window.openPlanCenter = openPlanCenter;
  window.openPlanEditor = openPlanEditor;
  window.syncPlanRecords = syncPlanRecords;
  window.checkPlanEvents = checkPlanEvents;
  window.renderPlanOverviewCard = renderPlanOverviewCard;
})();
