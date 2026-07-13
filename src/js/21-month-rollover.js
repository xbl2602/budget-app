/* ============================================================
   MONTH ROLLOVER DETECTION
   ============================================================ */
(function() {
'use strict';
function checkMonthRollover() {
  const now = new Date();
  const currentMonth = getMonthKey(now.toISOString());
  const lastMonth = DataStore.getLastActiveMonth();

  if (!lastMonth) {
    DataStore.setLastActiveMonth(currentMonth);
    return;
  }

  if (lastMonth !== currentMonth) {
    const lastAmounts = DataStore.getBillAmounts(lastMonth);
    const currentAmounts = DataStore.getBillAmounts(currentMonth);

    if (Object.keys(currentAmounts).length === 0 && Object.keys(lastAmounts).length > 0) {
      Object.entries(lastAmounts).forEach(([billId, amount]) => {
        DataStore.setBillAmount(currentMonth, billId, amount);
      });

      const lastIncome = DataStore.getMonthlyIncome(lastMonth);
      if (lastIncome > 0 && DataStore.getMonthlyIncome(currentMonth) === 0) {
        DataStore.setMonthlyIncome(currentMonth, lastIncome);
      }

      DataStore.save();
      setTimeout(() => showBillRolloverReminder(lastMonth, currentMonth), 500);
    }

    DataStore.setLastActiveMonth(currentMonth);
  }
}

function showBillRolloverReminder(lastMonth, currentMonth) {
  const lastAmounts = DataStore.getBillAmounts(currentMonth);
  const total = Object.values(lastAmounts).reduce((s, v) => s + (parseFloat(v) || 0), 0);
  const year = currentMonth.split('-')[0];
  const mon = currentMonth.split('-')[1];
  showModal(`
    <div class="modal-title">' + __('rollover.title') + '</div>
    <div style="padding:8px 0 16px">
      <p style="margin-bottom:12px">${__('rollover.message', formatMoney(total))}</p>
      <div class="flex flex-col gap-8">
        <button class="btn btn-primary" onclick="closeModal();openBillsCenter()">' + __('rollover.adjustBtn') + '</button>
        <button class="btn btn-ghost" onclick="closeModal();if(currentTab==='overview')renderOverview();else if(currentTab==='stats')renderStats();">' + __('rollover.keepBtn') + '</button>
      </div>
    </div>
  `);
}

  // i18n translations
  addI18nEntries({
    'rollover.title': { zh: '📋 新月份已开始', en: '📋 New Month Started' },
    'rollover.message': { zh: '已沿用上月账单设置 {0}', en: 'Carried over last month\'s bills: {0}' },
    'rollover.adjustBtn': { zh: '🔧 查看并调整', en: '🔧 Review & Adjust' },
    'rollover.keepBtn': { zh: '✅ 保持不变', en: '✅ Keep as Is' }
  });

  // === EXPORTS ===
  window.checkMonthRollover = checkMonthRollover;
  window.showBillRolloverReminder = showBillRolloverReminder;
})();
