# 记账软件 · 项目结构地图

> 本文件供开发者 / AI Agent 快速理解代码库结构。编辑源文件在 `src/`，编辑后运行 `bash build.sh` 生成可部署的 `index.html`。

---

## 构建说明

```bash
bash build.sh   # 将 src/ 下所有文件拼合为根目录的 index.html
```

- **源文件**: `src/index.html`（HTML 骨架，含 `<!--build:css-->` / `<!--build:js-->` 标记）
- **构建产物**: `index.html`（可直接在浏览器打开，用于 GitHub Pages 部署）
- **CSS 源文件**: `src/css/*.css`（按编号顺序拼接）
- **JS 源文件**: `src/js/*.js`（按编号顺序拼接，每个文件包裹在 IIFE 中，显式 window.* 导出）

---

## 目录结构

```
├── build.sh                    # 构建脚本
├── index.html                  # 构建产物（不手动编辑）
├── src/
│   ├── index.html              # HTML 骨架
│   ├── css/                    # 13 个 CSS 文件
│   └── js/                     # 24 个 JS 文件
├── features/                   # 功能文档
│   └── budget-app-feature-catalog.md  # 完整功能目录
├── logs/                       # 开发日志
├── technical/                  # 技术日志
└── user/                       # 用户变更日志
```

---

## CSS 文件（`src/css/`）

| 文件 | 内容 | 关键类/选择器 |
|------|------|--------------|
| `01-base.css` | CSS 变量、暗色模式、reset、滚动条、工具类 | `:root`, `[data-theme="dark"]`, `.flex`, `.grid-*`, `.text-*` |
| `02-layout.css` | 布局 | `#app`, `.sidebar`, `.main-content`, `.top-header`, `.bottom-nav`, `.page-section` |
| `03-components.css` | 通用组件 | `.card`, `.btn`, `.input-field`, `.modal-overlay`, `.toast`, `.badge`, `.empty-state` |
| `04-animations.css` | 所有动画 | `@keyframes shake`, `slideInLeft`, `pageEnter`, `modalScale`, `toastSlide` 等 |
| `05-records.css` | 流水记录 | `.record-card`, `.compact-*`, `.view-toggle-btn` |
| `06-categories.css` | 分类手风琴 | `.cat-item`, `.cat-header`, `.cat-arrow`, `.cat-budget`, `.cat-breadcrumb` |
| `07-heatmap.css` | 日历热力图 | `.heatmap-grid`, `.heatmap-day`, `.heatmap-legend` |
| `08-budget.css` | 预算进度切换 | `.budget-view-toggle`, `.bvt-slider`, `.budget-bar-fill` |
| `09-whatif.css` | 假设分析 | `.whatif-*`, `.savings-bar-*`, `.whatif-compare-*` |
| `10-bills.css` | 月账单中心 | `.bills-*`, `.picker-bill-item`, `.bill-toggle`, `.percent-base-group` |
| `11-print.css` | 打印样式 | `@media print` |
| `12-responsive.css` | 响应式 + 图表弹窗 | `@media (min-width: 1024px)`, `.chart-expand-*`, `.settings-nav-card` |
| `13-guides.css` | 页面引导 | `.guide-btn`, `.guide-section`, `.guide-feature-grid`, `.guide-tip`, `.guide-mode-toggle` |

---

## JS 文件（`src/js/`）

### 加载顺序 = 编号顺序（IIFE 内局部作用域，通过 window.* 跨文件访问，必须按此顺序）

> 每个文件包裹在 IIFE 中（详见"全局共享状态"）。函数/变量默认是 IIFE 局部，需要被 HTML `onclick` 或其他文件引用的符号通过 `window.*` 显式导出。所有文件通过构建脚本拼接到同一个 `<script>` 中。

---

### 1. `01-constants.js` — 常量和工具函数

| 符号 | 类型 | 说明 |
|------|------|------|
| `COLORS` | `const Array` | 14 种预设颜色 |
| `escHtml(str)` | `function` | HTML 转义（防 XSS） |
| `DEFAULT_CATEGORIES` | `const Array` | 8 个根分类 + 子分类（默认数据） |
| `uuid()` | `function` | 生成唯一 ID |
| `getMonthKey(dateStr)` | `function` | 从日期提取 `YYYY-MM` |

---

### 2. `02-datastore.js` — 数据层（核心）

| 符号 | 说明 |
|------|------|
| `const DataStore` | 单例对象，封装所有 `localStorage` 操作 |

**DataStore 方法分类：**

**初始化/持久化：**
| 方法 | 说明 |
|------|------|
| `_defaults()` | 返回默认数据结构 |
| `init()` | 从 localStorage 读取，迁移缺失字段 |
| `save()` | 写入 localStorage |

**记录 CRUD：**
| 方法 | 说明 |
|------|------|
| `getRecords()` / `getRecord(id)` | 获取全部/单条 |
| `addRecord(record)` | 添加（前置，自动生成 id/createdAt） |
| `updateRecord(id, updates)` | 更新（自动设 updatedAt） |
| `deleteRecord(id)` | 永久删除（处理 pendingDelete） |
| `softDeleteRecord(id)` | 软删除（5 秒撤销窗口） |
| `undoDelete()` | 撤销软删除 |
| `_finalizeDelete(id)` | 确认永久删除 |
| `getPendingDelete()` | 获取待删除记录 |

**分类 CRUD：**
| 方法 | 说明 |
|------|------|
| `getCategories()` / `getCategory(id)` | 获取全部/单个 |
| `getRootCategories()` | 获取根分类（排序后） |
| `getChildren(parentId)` | 获取直接子分类 |
| `getDescendantIds(id)` | 获取所有后代 ID（递归） |
| `addCategory(cat)` | 添加（自动分配颜色） |
| `updateCategory(id, updates)` | 更新 |
| `deleteCategory(id, options)` | 删除（可 moveChildren 或 deleteChildren） |
| `getNextColor()` | 获取下一个颜色 |

**账单分类 CRUD：**
| 方法 | 说明 |
|------|------|
| `getBillCategories()` / `getBillCategory(id)` | 获取全部/单个 |
| `addBillCategory(cat)` | 添加 |
| `updateBillCategory(id, updates)` | 更新 |
| `deleteBillCategory(id)` | 删除（同时清理 billAmounts） |

**账单金额：**
| 方法 | 说明 |
|------|------|
| `getBillAmounts(month)` | 获取某月账单金额 |
| `setBillAmount(month, billId, amount)` | 设置 |
| `getBillTotal(month)` | 获取账单合计 |

**月收入：**
| 方法 | 说明 |
|------|------|
| `getMonthlyIncome(month)` | 获取月收入 |
| `setMonthlyIncome(month, amount)` | 设置 |

**百分比基准：**
| 方法 | 说明 |
|------|------|
| `getPercentBase()` | `'gross'` 或 `'net'` |
| `setPercentBase(base)` | 设置 |

**最近活跃月份：**
| 方法 | 说明 |
|------|------|
| `getLastActiveMonth()` | 获取 |
| `setLastActiveMonth(month)` | 设置 |

**净可支配：**
| 方法 | 说明 |
|------|------|
| `getNetDisposable(month)` | 月收入 - 账单合计 |

**预算：**
| 方法 | 说明 |
|------|------|
| `getBudgets()` | 全部预算数据 |
| `getBudget(month)` | 获取某月总预算 |
| `setBudget(month, amount)` | 设置 |

**分类预算：**
| 方法 | 说明 |
|------|------|
| `getCategoryBudget(catId, month)` | 获取（返回 `{value, type}`） |
| `setCategoryBudget(catId, month, amount, type)` | 设置（支持 `fixed` / `percent`） |
| `getAllCategoryBudgets()` | 全部 |

**储蓄目标：**
| 方法 | 说明 |
|------|------|
| `getSavingsTarget()` | 获取 |
| `setSavingsTarget(target)` | 设置 |

**导出/导入：**
| 方法 | 说明 |
|------|------|
| `exportJSON()` | JSON 字符串 |
| `importJSON(jsonStr, mode)` | 导入（replace / merge） |
| `exportCSV()` | CSV 字符串（UTF-8 BOM） |
| `clearAll()` | 重置为默认值 |

**假设分析：**
| 方法 | 说明 |
|------|------|
| `getWhatIfParams()` | 获取 |
| `setWhatIfParams(params)` | 保存 |
| `clearWhatIfParams()` | 清除 |

---

### 3. `03-excel-export.js` — Excel 导出

| 符号 | 说明 |
|------|------|
| `function exportToExcel()` | 生成 XML Spreadsheet 2003（5 个工作表，含 SUMIF/AVERAGE/IF 公式） |

---

### 4. `04-stats-engine.js` — 统计引擎

| 方法 | 说明 |
|------|------|
| `getRecordsInMonth(month)` | 筛选某月记录 |
| `getMonthTotal(month)` | 月总支出 |
| `getCategoryTotals(month)` | `{catId: total}` |
| `getDailyTotals(month, options)` | 日支出数组 `[{day, total}]` |
| `getDailyAverage(month)` | 日均（排除 `excludeFromAvg`） |
| `getPredictedTotal(month)` | 预测月总 |
| `getSavingsPrediction(month)` | 预算 - 预测 |
| `getRemainingDailyLimit(month)` | 剩余日限额 |
| `getCategoryBreakdownDeep(month, catId)` | 递归分类分解 |
| `getCustomRangeTotals(startDate, endDate)` | 自定义范围统计 |
| `getOverspentCategories(month)` | 超支分类（>80%） |
| `getLast7Days()` | 近 7 天 `[{date, total, label}]` |
| `isBillCategory(categoryId)` | 是否是账单分类 |
| `getBillSpendingActual(month)` | 账单分类实际支出 |
| `getVariableSpending(month)` | 非账单支出 |
| `getDailyTotalsVariable(month)` | 排除账单的日支出 |
| `getDailyAverageVariable(month)` | 排除账单的日均 |
| `getDisposableInfo(month)` | 可支配信息汇总 |
| `getMonthlyTotals(numMonths)` | 近 N 月汇总 |

---

### 5. `05-simulation-engine.js` — 假设分析引擎

| 方法 | 说明 |
|------|------|
| `run(month, params)` | 执行模拟，返回 `{projectedTotal, projectedSavings, categoryProjections, ...}` |
| `getCurrentTrend(month)` | 获取当前趋势（无假设） |

---

### 6. `06-router.js` — 路由导航

| 符号 | 说明 |
|------|------|
| `pageTitles` | 页面标题映射 |
| `currentTab` | 当前标签页 |
| `function navigateTo(tab)` | 页面切换（更新 DOM + 触发 render） |

导航事件绑定在 `.nav-item` 和 `.sidebar-item` 的 click 上，通过 `location.hash` 驱动。

---

### 7. `07-ui-core.js` — UI 核心

| 符号 | 说明 |
|------|------|
| `function applyTheme(theme)` | 应用主题 |
| `function toggleTheme()` | 切换暗色/亮色 |
| `function showToast(message, type)` | 显示 Toast 提示（3 秒自动消失） |
| `function showModal(html)` | 显示弹窗 |
| `function closeModal()` | 关闭弹窗 |
| `function openBillsCenter()` | 打开月账单中心弹窗 |
| `function closeBillsCenter()` | 关闭账单中心 + 刷新页面 |
| `function saveBillIncome(amount)` | 保存月收入 |
| `function saveBillAmount(billId, amount)` | 保存账单金额 |
| `function updateBillSummary()` | 刷新账单汇总 |
| `function addNewBillRow()` | 添加新账单分类 |
| `function deleteBillCategoryFromCenter(id)` | 删除账单分类 |
| `function editBillCategory(id)` | 编辑账单分类弹窗 |
| `function saveBillCategoryEdit(id)` | 保存账单分类编辑 |
| `function openBillCategoryManager()` | 打开账单分类管理器 |
| `function formatMoney(amount)` | 格式化金额 → `RM 1,234.56` |
| `function getCategoryFullPath(catId)` | 获取分类全路径 |
| `function getRootAncestorId(catId)` | 获取根分类 ID |
| `function getRootAncestor(catId)` | 获取根分类对象 |

---

### 9. `09-category-picker.js` — 分类选择器（复用）

| 符号 | 说明 |
|------|------|
| `selectedCategoryId` | 当前选中分类 ID |
| `function openCategoryPicker(context)` | 打开分类选择弹窗（用于 add/edit） |
| `function buildCategoryTreePicker(cats, depth, context)` | 构建分类树 HTML |
| `function selectCategory(catId, context)` | 选中分类（更新显示 + 关闭弹窗） |

---

### 10. `10-render-overview.js` — 总览页

| 符号 | 说明 |
|------|------|
| `function renderOverview()` | 渲染总览页全部内容 |

---

### 11. `11-theme-colors.js` — Canvas 主题色

| 符号 | 说明 |
|------|------|
| `function getThemeColors()` | 从 CSS 变量读取当前主题色 |

---

### 12. `12-budget-progress.js` — 预算进度卡片

| 符号 | 说明 |
|------|------|
| `budgetProgressSort` | 排序方式（usage / amount / name） |
| `budgetProgressView` | 视图（solid / segmented） |
| `budgetMonitoredIds` | 被监控的分类 ID 列表 |
| `function loadBudgetMonitored()` | 读取监控设置 |
| `function refreshBudgetCards(month)` | 刷新所有预算卡片 |
| `function toggleBudgetView(month)` | 切换 solid/segmented |
| `function showBudgetSelector(month)` | 打开监控分类选择器 |
| `function confirmBudgetSelection(month)` | 确认监控选择 |
| `function renderBudgetProgressCard(month)` | 渲染预算进度卡片 |
| `function renderBudgetProgressCardInner(month)` | 渲染卡片内部 |

---

### 13. `13-canvas-drawing.js` — Canvas 绘图工具

| 符号 | 说明 |
|------|------|
| `function drawRing(canvasId, progress, color, label, overspendColor)` | 环形图（预算/储蓄） |
| `function drawSparkline(canvasId, data)` | 迷你折线图 |

---

### 14. `14-render-add.js` — 记账页

| 符号 | 说明 |
|------|------|
| `function renderAddPage()` | 渲染记账表单 |
| `function submitRecord(e)` | 提交记录（验证 + shake 动画） |

---

### 15. `15-render-records.js` — 流水页

| 符号 | 说明 |
|------|------|
| `recordsFilter` | 筛选条件对象 |
| `recordsPage` | 当前页码 |
| `compactRecordsView` | 紧凑视图开关 |
| `recordsPerPage` | 每页条数 |
| `batchMode` | 批量模式开关 |
| `selectedRecordIds` | 已选记录 ID 集合 |
| `function renderRecords()` | 渲染流水页 |
| `function toggleRecordsView()` | 切换紧凑/卡片视图 |
| `function getFilteredRecords()` | 获取筛选后的记录 |
| `function toggleOverspentFilter()` | 切换超支筛选 |
| `function applyRecordsFilter()` | 应用筛选 |
| `function openCategoryFilterPicker()` | 分类筛选选择器 |
| `function selectCategoryFilter(catId)` | 选择筛选分类 |
| `function clearRecordsFilter()` | 清除所有筛选 |
| `function renderRecordsList()` | 渲染记录列表（分页 + 删除按钮 + 滑动删除） |
| `function toggleBatchMode()` | 切换批量模式 |
| `function toggleRecordSelection(id)` | 切换选定 |
| `function updateBatchCount()` | 更新批量计数 |
| `function batchCancel()` | 取消批量 |
| `function batchDelete()` | 批量删除（确认弹窗） |
| `function confirmBatchDelete()` | 执行批量删除 |
| `function batchChangeCategory()` | 批量修改分类 |
| `function confirmBatchChangeCategory(catId)` | 执行批量修改 |
| `function deleteRecordConfirm(id)` | 单条删除确认弹窗 |
| `function confirmDeleteRecord(id)` | 执行删除（软删除） |
| `function undoDelete(btn)` | 撤销删除 |
| `function openEditRecord(id)` | 编辑记录弹窗 |
| `function submitEditRecord(e, id)` | 提交编辑 |

---

### 16. `16-render-categories.js` — 分类页

| 符号 | 说明 |
|------|------|
| `expandedCategories` | 已展开的节点 ID 集合 |
| `function renderCategories()` | 渲染分类页 |
| `function getBudgetMonth()` | 获取当前月份 |
| `function buildCategoryTreeHTML(cats, depth)` | 构建分类树 HTML |
| `function saveCategoryBudget(catId, month, value, type)` | 保存分类预算（含父子验证） |
| `function mergeCategory(sourceId)` | 打开合并弹窗 |
| `function confirmMergeCategory()` | 执行合并 |
| `function toggleCatItem(arrowEl)` | 展开/折叠 |
| `function addRootCategory()` / `confirmAddRootCategory()` | 添加根分类 |
| `function addChildCategory(parentId)` / `confirmAddChildCategory(parentId)` | 添加子分类 |
| `function renameCategory(id)` / `confirmRenameCategory(id)` | 重命名 |
| `function changeCategoryIcon(id)` / `confirmChangeIcon(id, icon)` | 改图标 |
| `function changeCategoryColor(id)` / `confirmChangeColor()` / `confirmCustomColor()` | 改颜色 |
| `function moveCategory(id)` / `confirmMoveCategory(id, newParentId)` | 移动（含循环检测） |
| `function deleteCategoryConfirm(id)` / `confirmDeleteCategory(id, mode)` | 删除（含子分类处理） |
| `function buildBreadcrumb(cat)` | 构建面包屑 |
| `function expandAndScrollTo(catId)` | 展开并滚动到 |
| `function editCategory(catId)` / `saveCategoryEdit(catId)` | 编辑分类弹窗 |

**关键数据：**
- `EMOJI_GRID` — 100+ emoji 图标选择网格

---

### 17. `17-stats-charts.js` — 统计页 + 所有图表（最大文件，1877 行）

**状态变量：**
| 符号 | 说明 |
|------|------|
| `statsMonth` | 当前统计月份 |
| `statsStartDate` / `statsEndDate` | 自定义日期范围 |
| `statsDrillStack` | 饼图下钻栈 |
| `showMonthCompare` | 月度对比开关 |
| `_expandedChart` | 展开的图表类型（'heatmap' / 'pie'） |

**统计页面：**
| 函数 | 说明 |
|------|------|
| `renderStats()` | 渲染统计页全部内容 |
| `changeStatsMonth(month)` | 切换月份 |
| `changeStatsCustom()` | 切换自定义范围（自动交换起止日期） |
| `resetStatsDrill()` | 饼图返回上级 |

**图表数据辅助：**
| 函数 | 说明 |
|------|------|
| `useCustomRange()` | 是否使用自定义范围 |
| `getStatsCatTotals()` | 获取分类汇总 |
| `getStatsDailyTotals()` | 获取每日汇总 |
| `getChartData(month, startDate, endDate, options)` | 获取根分类图表数据 |
| `getChartDataForRange(startDate, endDate)` | 范围版 |
| `getRawChartData(month, startDate, endDate, options)` | 获取原始（不聚合）数据 |

**饼图（弹性动画）：**
| 函数 | 说明 |
|------|------|
| `drawPieChart(canvasId, month, startDate, endDate, onDrill, height, noAnim)` | 弹性动画饼图 + hover 弹出 + 点击下钻 + 重叠检测标签 + 图例 |

**折线图：**
| 函数 | 说明 |
|------|------|
| `drawLineChart(canvasId, month, startDate, endDate)` | 动画折线图（800ms ease-out） |

**柱状图：**
| 函数 | 说明 |
|------|------|
| `drawBarChart(canvasId, month, startDate, endDate)` | 柱状图 + 预算进度条 + 点击下钻 |

**月趋势图（6 个月）：**
| 函数 | 说明 |
|------|------|
| `drawMonthlyChart(canvasId)` | 月度支出趋势折线 |

**储蓄趋势图（6 个月）：**
| 函数 | 说明 |
|------|------|
| `drawSavingsChart(canvasId)` | 月度储蓄柱状图（绿/红） |

**月度对比图：**
| 函数 | 说明 |
|------|------|
| `drawCompareBarChart(canvasId, month)` | 本月 vs 上月分组柱状图 |

**工具函数：**
| 函数 | 说明 |
|------|------|
| `lightenColor(hex, pct)` | 颜色变亮 |
| `darkenColor(hex, pct)` | 颜色变暗 |
| `downloadChart(canvasId)` | 下载图表为 PNG |

**日历热力图：**
| 函数 | 说明 |
|------|------|
| `getHeatmapColor(ratio)` | 6 色梯度（蓝→青→绿→黄→橙→红） |
| `getDailySavingsTarget(month)` | 日均可支配预算 |
| `renderCalendarHeatmap(month)` | 渲染热力图 HTML |
| `showDayRecords(dateStr)` | 点击日期显示当日记录 |

**图表展开弹窗：**
| 函数 | 说明 |
|------|------|
| `expandHeatmap()` | 展开热力图 |
| `expandPie()` | 展开饼图 |
| `renderExpandPieTable()` | 渲染展开饼图的分类表格 |
| `toggleExpandPieRow(rowId)` | 展开/折叠表格子分类 |
| `shrinkChart()` | 关闭展开弹窗 |

**账单切换（包含/排除）：**
| 函数 | 说明 |
|------|------|
| `renderBillToggle(chartId, checked)` | 渲染账单切换 checkbox |
| `toggleBillFilter(chartId)` | 切换账单过滤 |
| `isBillToggleChecked(chartId)` | 获取账单切换状态 |
| `refreshPieChart()` | 刷新饼图 |

---

### 18. `18-render-settings.js` — 设置页

| 符号 | 说明 |
|------|------|
| `function renderSettings()` | 渲染设置页（主题、储蓄目标、数据管理） |
| `function setSavingsType(type)` | 切换储蓄类型 |
| `function saveBudget()` | 保存月预算 |
| `function saveSavingsTarget()` | 保存储蓄目标 |
| `function setPercentBase(base)` | 切换百分比基准 |
| `function exportJSON()` | 导出 JSON |
| `function importJSON(event)` | 导入 JSON 文件 |
| `function confirmImportJSON(mode)` | 确认导入（replace / merge） |
| `function exportCSV()` | 导出 CSV |
| `function clearAllData()` | 清除数据（确认弹窗） |
| `function confirmClearAll()` | 执行清除 |

---

### 19. `19-render-report.js` — 月度报告页

| 符号 | 说明 |
|------|------|
| `reportMonth` | 报告月份 |
| `function renderReport()` | 渲染打印优化的月度报告（环形图 + 分类表 + 预测总结） |
| `function changeReportMonth(month)` | 切换月份 |
| `function printReport()` | 触发打印 |

---

### 20. `20-what-if.js` — 假设分析页

| 符号 | 说明 |
|------|------|
| `whatIfExpandStates` | 分类展开状态 |
| `whatIfCompareExpandStates` | 对比表展开状态 |
| `function renderWhatIf()` | 渲染假设分析页 |
| `function renderWhatIfParams(month, savedParams)` | 渲染参数面板（分类调整、全局调整、假设分类） |
| `function renderWhatIfResults(result)` | 渲染结果面板（对比摘要、储蓄对比、分类明细） |
| `function drawWhatIfRings(result)` | 绘制比较环形图 |
| `function drawSimpleRing(canvas, percent, fillColor, bgColor)` | 简易环形图 |
| `function toggleWhatIfExpand(rootId)` | 展开/折叠分类 |
| `function toggleWhatIfCompareExpand(catId)` | 展开/折叠对比表行 |
| `function whatifModeChange(selectEl)` | 调整模式变更（联动禁用子项） |
| `function addWhatIfHypo()` | 添加假设分类 |
| `function removeWhatIfHypo(index)` | 删除假设分类 |
| `function collectWhatIfParams()` | 收集所有参数 |
| `function runWhatIfSimulation()` | 执行模拟 + 渲染结果 |
| `function clearWhatIfSimulation()` | 清除场景 |
| `function attachWhatIfListeners(month)` | 绑定事件监听 |

---

### 21. `21-month-rollover.js` — 月初结转

| 函数 | 说明 |
|------|------|
| `checkMonthRollover()` | 检测月份切换，自动沿用上月账单设置 |
| `showBillRolloverReminder(lastMonth, currentMonth)` | 显示月初提醒弹窗 |

---

### 22. `22-init.js` — 初始化

| 代码 | 说明 |
|------|------|
| `DataStore.init()` | 初始化数据 |
| `checkMonthRollover()` | 检测月份切换 |
| `applyTheme()` | 应用主题 |
| `function handleHash()` | 哈希路由处理 |
| `window.addEventListener('hashchange', handleHash)` | 监听哈希变化 |
| `window.addEventListener('load', ...)` | 加载时路由 + resize 重绘 |
| `CanvasRenderingContext2D.prototype.roundRect` | roundRect 兼容性 polyfill |

---

### 23. `23-lan-sync.js` — 局域网同步（WebRTC P2P）

IIFE 自执行，暴露 `window.SyncUI` 和 `window.LANSync`。

| 符号 | 说明 |
|------|------|
| `window.LANSync.open()` | 打开同步菜单（从设置页调用） |
| `window.SyncUI.showMenu()` | 显示菜单 |
| `window.SyncUI.startHost()` | 发送数据 |
| `window.SyncUI.startClient()` | 接收数据 |
| `window.confirmSyncMode(mode)` | 确认同步方式 |
| `compressStr(str)` / `decompressStr(b64)` | SDP 压缩/解压 |
| `createHost(callbacks)` | 创建发送端 RTCPeerConnection |
| `createClient(offerB64, callbacks)` | 创建接收端 RTCPeerConnection |

---

### 24. `24-diagnostics.js` — 数据诊断工具

| 符号 | 说明 |
|------|------|
| `DIAG.logOperation(code, details)` | 记录操作日志 |
| `DIAG.compareWithStorage()` | 对比内存与 localStorage 数据一致性 |
| `DIAG.getStorageInfo()` | 获取存储用量信息 |
| `DIAG.exportDiagnosticReport()` | 导出诊断报告文本 |
| `DIAG.showRecordRaw(id)` | 显示记录的原始 JSON 数据 |
| `DIAG.getDiagnosticLog()` | 获取操作日志 |
| `DIAG.exportDiagnosticLog()` | 导出操作日志文件 |

---

### 25. `25-page-guides.js` — 页面引导系统

| 符号 | 说明 |
|------|------|
| `PAGE_GUIDES` | 8 个页面的引导内容（含 simple/detailed 双模式） |
| `function showPageGuide(pageKey)` | 打开指定页面的引导弹窗（默认简洁模式） |
| `function toggleGuideMode()` | 切换简洁/详尽模式 |

---

## 数据流

```
用户操作
    ↓
Page Render Function (renderOverview / renderRecords / ...)
    ↓  reads
DataStore / StatsEngine / SimulationEngine
    ↓  writes
localStorage ←→ DataStore
    ↓
Canvas Drawing Functions / DOM innerHTML
```

## 全局共享状态

经过 IIFE 重构后，大部分状态变量不再是全局的。只有被 HTML `onclick` 或其他文件引用的符号才通过 `window.*` 显式导出，其余锁在 IIFE 内部。修改时注意在对应文件的 `// === EXPORTS ===` 区域增减导出项。

| 变量 | 定义位置 | 用途 |
|------|---------|------|
| `DataStore` | `02-datastore.js` | 数据层单例 |
| `StatsEngine` | `04-stats-engine.js` | 统计计算 |
| `SimulationEngine` | `05-simulation-engine.js` | 假设分析模拟 |
| `currentTab` | `06-router.js` | 当前页面标签 |
| `selectedCategoryId` | `09-category-picker.js` | 分类选择器选中项 |
| `recordsFilter`, `recordsPage`, `batchMode`, etc. | `15-render-records.js` | 流水页状态 |
| `expandedCategories` | `16-render-categories.js` | 分类展开集合 |
| `statsMonth`, `statsDrillStack`, `showMonthCompare` | `17-stats-charts.js` | 统计页状态 |
| `budgetProgressSort`, `budgetProgressView`, `budgetMonitoredIds` | `12-budget-progress.js` | 预算进度状态 |
| `whatIfExpandStates`, `whatIfCompareExpandStates` | `20-what-if.js` | 假设分析展开状态 |
| `reportMonth` | `19-render-report.js` | 报告月份 |
| `_expandedChart` | `17-stats-charts.js` | 图表展开弹窗状态 |
| `_guidePageKey`, `_guideShowDetailed` | `25-page-guides.js` | 引导弹窗状态 |
| `DIAG` | `24-diagnostics.js` | 诊断工具单例 |

---

## localStorage Schema

```json
{
  "records": [{ "id", "amount", "categoryId", "date", "note", "createdAt", "updatedAt", "excludeFromAvg" }],
  "categories": [{ "id", "name", "icon", "color", "parentId", "sortOrder" }],
  "budgets": { "YYYY-MM": amount },
  "categoryBudgets": { "catId:YYYY-MM": { "value": number, "type": "fixed"|"percent" } },
  "savingsTarget": { "type": "fixed"|"percent", "fixedAmount": number, "percent": number },
  "colorIndex": number,
  "billCategories": [{ "id", "name", "icon", "color", "sortOrder" }],
  "billAmounts": { "YYYY-MM": { "billId": amount } },
  "monthlyIncome": { "YYYY-MM": amount },
  "percentBase": "gross"|"net",
  "lastActiveMonth": "YYYY-MM",
  "whatIfParams": { "categoryAdjustments": {}, "globalAdjustment": {}, "hypotheticalCategories": [] }
}
```

---

## 修改指南

### 添加新功能
1. 确定属于哪个功能域，在对应的 JS 文件中添加函数
2. 如果需要新样式，在对应的 CSS 文件中添加
3. 运行 `bash build.sh` 测试

### 修改现有功能
1. 在 `src/js/` 的对应文件中找到函数
2. 修改后运行 `bash build.sh` 测试

### 添加新页面
1. 在 `src/index.html` 中增加 `<section class="page-section" id="page-xxx">`
2. 在 `src/js/` 中创建渲染函数（如 `function renderXxx()`）
3. 在 `06-router.js` 的 `navigateTo()` 和 `pageTitles` 中注册
4. 在 `src/index.html` 的侧边栏和底部导航中添加 tab 项
5. 运行 `bash build.sh`
