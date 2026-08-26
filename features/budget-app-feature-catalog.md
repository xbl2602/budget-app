# Budget App — Comprehensive Feature Catalog

> ## ⚠️ 时效性说明
>
> **本文档是 v2.0.0 时期（2026-07）的快照，描述的是当时单文件 `money-wise-v2.0.0.html`（约 6,759 行、7 个标签页）的形态，已不反映现状。**
> 保留它是作为早期功能的历史记录，**不要拿它当现状依据**。
>
> 自本文档写成后至少新增了：标签系统与方格图、PIN 码 + AES-GCM 加密、局域网同步、
> 分摊收款（含部分还款）、大额分期消费计划、统计页分类层级与格子图、页面引导、数据诊断工具；
> 架构也从单文件改为 `src/` 分模块 + `build.sh` 构建。
>
> **当前文档：** 功能总览见 [README.md](../README.md)，代码结构与函数地图见 [STRUCTURE.md](../STRUCTURE.md)。

---

> **File:** `money-wise-v2.0.0.html`  
> **Size:** 6,759 lines  
> **Language:** Chinese (UI) / English (code)  
> **Currency:** RM (Malaysian Ringgit)  
> **Storage:** localStorage  
> **Pages/Tabs:** 7  

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [Data Layer (DataStore)](#2-data-layer-datastore)
3. [Statistics Engine (StatsEngine)](#3-statistics-engine-statsengine)
4. [Page: Overview](#4-page-overview)
5. [Page: Add Record](#5-page-add-record)
6. [Page: Records (流水)](#6-page-records-流水)
7. [Page: Categories (分类)](#7-page-categories-分类)
8. [Page: Statistics (统计)](#8-page-statistics-统计)
9. [Page: Report (月度报告)](#9-page-report-月度报告)
10. [Page: Settings (设置)](#10-page-settings-设置)
11. [Charting & Visualization](#11-charting--visualization)
12. [Export / Import](#12-export--import)
13. [UI/UX Features](#13-uiux-features)
14. [Notable / Unique Features](#14-notable--unique-features)

---

## 1. Architecture Overview

The entire app is a single self-contained HTML file (~6,759 lines) with no external dependencies:

| Layer | Lines | Description |
|---|---|---|
| CSS Design System | ~1,070 | CSS variables, layout, dark mode, animations, responsive, print styles |
| Default Categories | ~40 lines | 8 root categories with child subcategories, emoji icons, colors |
| DataStore | ~300 lines | localStorage CRUD for records, categories, budgets, savings target |
| StatsEngine | ~160 lines | Aggregation, prediction, filtering logic |
| Excel Export | ~460 lines | XML Spreadsheet 2003 generator with formulas |
| HTML Structure | ~60 lines | 7 page sections + sidebar + bottom nav |
| Render Functions | ~1,350 lines | Per-page renderers (overview, add, records, categories, stats, report, settings) |
| Chart Drawing | ~950 lines | Canvas-based pie, line, bar, ring, sparkline, savings, comparison charts |
| UI Helpers | ~200 lines | Toast, modal, navigation, theme toggle, format helpers |
| Initialization | ~50 lines | Hash routing, resize handling, roundRect polyfill |

### Navigation (7 tabs)

| Tab ID | Chinese Label | Icon | Render Function |
|---|---|---|---|
| `overview` | 总览 | 📊 | `renderOverview()` |
| `add` | 记账 | ✏️/➕ | `renderAddPage()` |
| `records` | 流水 | 📋 | `renderRecords()` |
| `categories` | 分类 | 🏷️ | `renderCategories()` |
| `stats` | 统计 | 📈 | `renderStats()` |
| `report` | 报告 | 📋 | `renderReport()` |
| `settings` | 设置 | ⚙️ | `renderSettings()` |

Responsive: Sidebar (desktop ≥1024px) + bottom tab nav (mobile).

---

## 2. Data Layer (DataStore)

`const DataStore = { ... }` — a singleton object managing all persistent data via `localStorage`.

### Data Schema

```js
{
  records: [
    { id, amount, categoryId, date, note, createdAt, updatedAt }
  ],
  categories: [
    { id, name, icon, color, parentId (null|string), sortOrder }
  ],
  budgets: {
    "2026-07": 3000   // monthly total budget (RM)
  },
  categoryBudgets: {
    "cat-root-1:2026-07": { value: 500, type: "fixed"|"percent" }
  },
  savingsTarget: {
    type: "fixed" | "percent" | "both",
    fixedAmount: 200,
    percent: 10
  },
  colorIndex: 8
}
```

### Key Methods

| Method | Description |
|---|---|
| `init()` | Load from localStorage; migrate missing fields |
| `save()` | Persist to localStorage |
| **Records** | |
| `getRecords()` / `getRecord(id)` | Get all / single |
| `addRecord(record)` | Prepend with UUID |
| `updateRecord(id, updates)` | Patch & set updatedAt |
| `deleteRecord(id)` | Immediate permanent delete |
| `softDeleteRecord(id)` | Remove from list + 5s timer (undo window) |
| `undoDelete()` | Restore pending-delete record |
| **Categories** | |
| `getCategories()` / `getCategory(id)` | Get all / single |
| `getRootCategories()` | Filter `!parentId`, sorted by sortOrder |
| `getChildren(parentId)` | Direct children, sorted |
| `getDescendantIds(id)` | Recursive descendant IDs |
| `addCategory(cat)` | With auto-color assignment |
| `updateCategory(id, updates)` | Patch |
| `deleteCategory(id, options)` | With moveChildren or deleteChildren strategies |
| **Budgets** | |
| `getBudget(month)` / `setBudget(month, amount)` | Total monthly budget |
| `getCategoryBudget(catId, month)` | Returns `{value, type}` |
| `setCategoryBudget(catId, month, amount, type)` | Supports 'fixed' or 'percent' |
| `getAllCategoryBudgets()` | Raw dict |
| **Savings** | |
| `getSavingsTarget()` / `setSavingsTarget(target)` | Config object |
| **Export** | |
| `exportJSON()` / `importJSON(jsonStr, mode)` | Replace or merge |
| `exportCSV()` | UTF-8 BOM CSV |
| `clearAll()` | Reset to defaults |

### ⭐ Notable: Soft Delete with Undo
Records are NOT immediately deleted. `softDeleteRecord(id)` removes the record from the active list but holds it in a `_pendingDelete` buffer for 5 seconds. During that window, `undoDelete()` restores it. If a second delete occurs within the window, the previous pending delete is finalized immediately.

---

## 3. Statistics Engine (StatsEngine)

`const StatsEngine = { ... }` — pure computation, no side effects.

| Method | Description |
|---|---|
| `getRecordsInMonth(month)` | Filter records by month key |
| `getMonthTotal(month)` | Sum of all amounts |
| `getCategoryTotals(month)` | `{ catId: total }` map |
| `getDailyTotals(month)` | Array `[{day, total}]` for all days of month |
| `getDailyAverage(month)` | Month total / days passed |
| `getPredictedTotal(month)` | Daily avg × total days in month |
| `getSavingsPrediction(month)` | Budget − predicted total |
| `getRemainingDailyLimit(month)` | (Budget − spent) / remaining days |
| `getCategoryBreakdownDeep(month, catId)` | Recursive breakdown with children |
| `getCustomRangeTotals(startDate, endDate)` | Full analysis for custom date range |
| `getOverspentCategories(month)` | Categories exceeding 80% of budget |
| `getLast7Days()` | `[{date, total, label}]` |
| `getMonthlyTotals(N)` | Last N months of aggregated totals |

---

## 4. Page: Overview

**Tab:** `overview` | **Function:** `renderOverview()`

### Sections (top to bottom):

| Section | Description |
|---|---|
| **Empty State** | Shown when no records exist — "Welcome" card with dashed border, gradient bg, "Record first entry" CTA |
| **Grid-4 Summary Cards** | **本月总支出** (month total), **预算** (budget, or "未设置"), **日均支出** (daily avg), **预测月总支出** (predicted total) |
| **Budget Progress Ring** | Canvas donut chart showing % of spendable budget consumed. Shows overspend in red. Below: spendable budget equation (budget − savings = disposable) |
| **Savings Target Ring** | Canvas donut chart showing % of savings target achieved. Green if met, amber if in progress, gray if unset |
| **Savings Prediction Card** | Detailed breakdown: current saved, target, predicted end-of-month savings, % goal achieved, budget surplus. Includes two daily limit indicators: gross (no savings deduction) and net (after savings). Smart message: "If you keep current habits..." with positive/negative prediction |
| **Last 7 Days Sparkline** | Small canvas line chart showing daily totals |
| **Top 5 Spending Categories** | Ranked list with numbered badges, emoji, budget status badges (超支/预算内), spends as RM + % |
| **Budget Progress Card** | Reuses the budget progress card component (see Budget Progress section below) |
| **Overspend Warning** | Red-bordered card showing categories that exceed 80% of budget |
| **Quick Actions** | Two buttons: "记一笔" (add) and "查看统计" (stats) |

### ⭐ Notable Features
- Dual daily remaining limits (gross vs. net-of-savings)
- Spendable budget concept: budget − savings = what you can actually spend
- All four metrics (ring, prediction, daily limits, top 5) are interconnected around a single savings target

---

## 5. Page: Add Record

**Tab:** `add` | **Function:** `renderAddPage()`

### Form Fields

| Field | Type | Details |
|---|---|---|
| Amount | Text input | RM prefix, input validation (numbers + 2 decimals only) |
| Category | Button → Modal | Opens tree category picker; selected displays color dot + icon + name |
| Date/Time | `datetime-local` | Defaults to current local time with timezone offset |
| Note | Text input | Max 200 characters, placeholder "e.g., Nasi Lemak" |
| Submit | Button | Validates amount > 0 and category selected; `shakeForm()` animation on error; resets all fields on success |

### ⭐ Notable Features
- Real-time amount formatting (strips non-numeric, limits to 2 decimal places)
- Shake animation on validation failure
- Category picker is a reusable tree modal

---

## 6. Page: Records (流水)

**Tab:** `records` | **Function:** `renderRecords()`

### Search & Filter Bar

| Filter | Type | Details |
|---|---|---|
| Keyword search | Text input | Searches `note` field (case-insensitive) |
| Category filter | Button → Modal | Tree picker with "All categories" option; filters by descendant IDs |
| Date start/end | Date inputs | Filters `date` or `createdAt` |
| Amount min/max | Number inputs | Range filter |
| Overspent only | Toggle button | Shows only records from categories that have exceeded their budget |

### Display Controls

| Control | Details |
|---|---|
| **View toggle** | Compact view (single line) ↔ Card view (full detail) — persisted in localStorage |
| **Batch mode toggle** | Enter/exit multi-select mode |
| **Page size selector** | Configurable 5–200 records per page |
| **Record count** | Shows total filtered count |

### Record List

| Feature | Details |
|---|---|
| Pagination | First, prev, page numbers, next, last buttons |
| Compact view | Single-line: icon + name + note + amount + date |
| Card view | Full card: icon, name (full path), note, amount, date/time, edit button |
| Record selection (batch mode) | Checkbox per record, visual highlight |
| Edit | Opens modal with amount, category, date, note pre-filled |
| Single delete | Modal confirmation → soft delete with 5s undo toast |
| Undo | "Undo" button appears in toast; restores the record |

### Batch Operations Toolbar

Appears at bottom when batch mode is active:

| Operation | Details |
|---|---|
| **Batch delete** | Confirmation modal → soft deletes all selected (each with its own 5s undo) |
| **Batch change category** | Opens tree picker → updates all selected records' categoryId |
| **Cancel** | Clears selection and exits batch mode |

### ⭐ Notable Features
- Soft delete with undo (5-second window)
- Overspent-only filter
- Batch operations (delete + recategorize)
- Configurable page size persisted in localStorage
- Compact/card view toggle persisted in localStorage

---

## 7. Page: Categories (分类)

**Tab:** `categories` | **Function:** `renderCategories()`

### Structure

- Tree view with expand/collapse (▶ toggle)
- Root nodes auto-expanded by default
- Shows total category count

### Per-Category Actions

| Action | Details |
|---|---|
| **Expand/Collapse** | Toggle ▶ icon; state tracked in `expandedCategories` Set |
| **Add child** | ➕ button; prompts for name |
| **Rename** | ✏️ button; modal text input |
| **Change icon** | 🎨 button; grid of emoji icons to pick from |
| **Change color** | 🌈 button; 14 preset color swatches + custom hex input |
| **Move** | 📦 button; tree picker to choose new parent |
| **Merge** | 🔀 button; merge into another category (see below) |
| **Delete** | 🗑️ button; options: move children to parent, delete children, or cancel if has children |

### Per-Category Budget

| Feature | Details |
|---|---|
| Input field | Inline number input directly in the tree row |
| Unit toggle | Click `RM` / `%` to toggle between fixed amount and percentage |
| Percentage budgets | Computed as % of total monthly budget |
| Validation | Child budget sum cannot exceed parent budget — shows warning toast and rejects save |

### Category Merge

| Feature | Details |
|---|---|
| Source category selected | Shows modal with target tree picker |
| All records reassigned | Records of source + descendants moved to target |
| Child handling | Option to move children under target, or delete all children |
| Source deleted | After merge, source category is removed |

### ⭐ Notable Features
- Inline RM/% toggle for budgets
- Parent-child budget validation
- Category merge with child handling options
- Tree-based picker reuse across add, filter, merge, batch, move operations

---

## 8. Page: Statistics (统计)

**Tab:** `stats` | **Function:** `renderStats()`

### Date Selection

| Feature | Details |
|---|---|
| Month selector | `<input type="month">` |
| Custom date range | Two date inputs; auto-swaps if start > end; overrides month selection |
| Custom range analysis | Full stats for arbitrary date periods |

### Summary Cards (Row 1)

| Card | Details |
|---|---|
| Total expense | Month total or custom range total |
| Daily avg | Month daily avg, or record count for custom range |
| Predicted total | Projected end-of-month total |
| Savings prediction | Budget − predicted total; color-coded green/red |

### Transaction Analysis Cards (Row 2)

| Card | Details |
|---|---|
| Transaction count | Total count + days with transactions |
| Average per transaction | Total / count |
| Max single transaction | Highest amount + its category |
| Max spending day | Highest daily total + date |

### Savings Estimation Card (month only)

Shows: budget, current saved, predicted savings, surplus. Dual daily limits (gross/net). Visible only for current month.

### Charts & Visualizations

| Chart | Type | Details |
|---|---|---|
| Calendar Heatmap | HTML grid | Color-coded day cells based on spending ratio vs daily target. Legend, weekday headers, clickable cells → popup with day's records |
| Pie Chart | Canvas | Interactive: hover pop-out, click-to-drill-down. Labels with backgrounds. Legend with budget progress bars per category |
| Line Chart | Canvas | Animated draw (ease-out cubic, 800ms). Daily trend with savings target dashed reference line, gradient fill, dot markers |
| Budget Progress Card | HTML | Same component as overview (solid/segmented toggle, sort, monitor selection) |
| Month-Over-Month Comparison | Canvas | Toggleable grouped bar chart (current month blue, previous month green) |
| Monthly Spending Trend | Canvas | 6-month line chart with dots, labels, gradient fill |
| Monthly Savings Trend | Canvas | 6-month bar chart: green bars for positive savings, red for negative, zero line |

### Interactive Features

| Feature | Details |
|---|---|
| **Pie drill-down** | Click a slice → dive into that category's subcategories. Breadcrumb navigation. Back button |
| **Chart expand** | ⛶ button on heatmap and pie charts → opens modal with larger view |
| **Chart PNG download** | Each chart has "📥 下载 PNG" button |
| **Heatmap day click** | Click any day cell → shows records for that date (inline or in expand panel) |
| **Bar chart drill-down** | Click a bar → drill into subcategories |

### ⭐ Notable Features
- Full interactive pie chart with drill-down, hover pop-out, budget progress in legend
- Calendar heatmap with spending ratio coloring
- Custom date range support
- Dual daily limit display (gross + net-of-savings)
- Month-over-month comparison toggle
- Every chart is downloadable as PNG

---

## 9. Page: Report (月度报告)

**Tab:** `report` | **Function:** `renderReport()`

### Print-Optimized Layout

| Feature | Details |
|---|---|
| Month selector | Input to pick report month |
| Print button | Triggers `window.print()` with print-specific CSS |

### Summary Cards

| Card | Details |
|---|---|
| Budget | Monthly allowance (or "未设置") |
| Total expense | Color-coded green/red vs spendable budget |
| Savings | Positive/negative |
| Savings rate | % of budget saved; green ≥20%, amber >0%, red otherwise |

### Rings & Visuals

| Visual | Details |
|---|---|
| Budget progress ring | Canvas donut chart |
| Savings target ring | Canvas donut chart |
| Daily trend sparkline | Small canvas line chart |

### Category Breakdown Table

| Column | Details |
|---|---|
| Category | Icon + name |
| Budget (RM) | Per-category budget |
| Expense (RM) | Amount spent |
| Ratio | % of total spending |
| Remaining (RM) | Budget − spent, color-coded |
| Status | ✅ 预算内 / ⚠️ 超支 / — |

Includes total row and top-5 spending ranking.

### Savings Prediction Summary

Narrative text block: "Budget is RM X. Savings target is RM Y. Disposable is RM Z. Spent so far is RM A. If current habits continue, predicted end-of-month: surplus/deficit."

### Print CSS

- Hides navigation, buttons, non-report elements
- Report cards get `break-inside: avoid`
- Full-width layout, no shadows

### ⭐ Notable Features
- Print-optimized report page
- Narrative savings prediction in plain language
- Complete category breakdown table with status indicators

---

## 10. Page: Settings (设置)

**Tab:** `settings` | **Function:** `renderSettings()`

### Sections

| Section | Details |
|---|---|
| **Theme Toggle** | Dark/light mode button. Toggles `data-theme` attribute on `<html>`. Persisted via localStorage |
| **Monthly Budget** | Month input + amount input + save button. The cornerstone of all budget/savings calculations |
| **Savings Target** | Type selector: fixed amount, % of budget, or both. Dynamic inputs based on type. Save button |
| **Data Management** | Export JSON, Import JSON (replace or merge), Export Excel, Export CSV, Clear all data |

### Savings Target Configuration

| Mode | Calculation |
|---|---|
| `fixed` | User enters a fixed RM amount to save |
| `percent` | % of monthly budget (e.g., 10% of RM3000 = RM300) |
| `both` | Fixed + percent combined (e.g., RM200 + 10% = RM500) |

Each mode shows only the relevant input fields.

### ⭐ Notable Features
- Three-mode savings target (fixed/percent/both)
- Import with replace vs. merge options
- JSON/CSV/Excel multi-format export
- Clear all data with confirmation

---

## 11. Charting & Visualization

All charts are Canvas-based, drawn with `getContext('2d')`, with DPR-aware sizing and CSS-driven responsive width.

### `drawRing(canvasId, progress, color, label, overspendColor)`
- Donut chart for budget/savings progress
- Animated via requestAnimationFrame (ease-out)
- Text label in center
- Overspend mode (red color, can exceed 100%)

### `drawSparkline(canvasId, data)`
- Mini line chart for daily trends
- Optional trend color (green/red based on direction)
- Compact, no axes

### `drawPieChart(canvasId, month, startDate, endDate, onDrill, height, noAnim)`
- Animated elastic pie chart (spring-like bounce animation using `requestAnimationFrame`)
- Hover pop-out: slice shifts out 8px with shadow + white border
- Click-driven drill-down: click a slice → drill into subcategories
- Labels: text with semi-transparent background, position clamped, overlap detection (multi-pass) avoids label collision
- Legend: color boxes + names + amounts
- Touch support: `touchstart`/`touchend` mapped to mousemove/click
- No-animation mode for expand modal
- `roundRect` polyfill for older browsers

### `drawLineChart(canvasId, month, startDate, endDate)`
- Animated 800ms ease-out cubic draw
- Bezier curve interpolation (smooth curves, not straight segments)
- Gradient fill below the line
- Savings target dashed reference line (green)
- Dot markers at data points
- Grid lines + axis labels

### `drawBarChart(canvasId, month, startDate, endDate)`
- Horizontal category bars with rounded top corners
- Color-coded by category color
- Budget progress micro-bar under each label
- Click → drill-down (pushes to drill stack)

### `drawMonthlyChart(canvasId)`
- 6-month spending trend line chart
- Gradient fill + dot markers + value labels

### `drawSavingsChart(canvasId)`
- 6-month savings trend bar chart
- Green bars (positive savings) / Red bars (negative)
- Zero line, grid, value labels

### `drawCompareBarChart(canvasId, month)`
- Grouped bar chart: current month (blue) vs previous month (green)
- Per-category side-by-side bars
- Value labels on bars

### `downloadChart(canvasId)`
- Converts canvas to PNG data URL
- Triggers download with filename `{canvasId}.png`

---

## 12. Export / Import

### JSON Export/Import
- `exportJSON()`: Downloads `budget-data-{date}.json`
- `importJSON(event)`: File reader → shows modal with "replace" or "merge" choice
  - **Replace**: Overwrites all data
  - **Merge**: Appends records, adds new categories, merges budgets & savings target

### CSV Export
- `exportCSV()`: UTF-8 BOM CSV with columns: ID, Amount, Category, Date, Note, CreatedAt
- Downloads `budget-records-{date}.csv`

### Excel Export (XML Spreadsheet 2003)
- **No ZIP/library required** — generates raw XML SpreadsheetML
- Native open in Excel / LibreOffice / Google Sheets
- **5 sheets:**

| Sheet | Content |
|---|---|
| 1 — 消费记录 | All records with formulas for totals, per-category sums |
| 2 — 分类统计 | Category breakdown with SUMIF formulas |
| 3 — 月度统计 | Per-month summary with formulas: budget, savings target, disposable, actual, remaining, usage rate |
| 4 — 预算跟踪 | Monthly budget tracking with status formulas |
| 5 — 储蓄统计 | Monthly savings breakdown with goal achievement percentage |

- All formulas are live — users can modify values and recalculations happen automatically
- Styled headers, money formatting, UTF-8 encoding

---

## 13. UI/UX Features

### Design System
- CSS custom properties for theming (colors, shadows, radii, transitions)
- Indigo primary palette (#6366F1) with emerald, amber, rose accents
- Consistent card-based layout with `--card-bg`, `--shadow`, `--radius`
- Smooth transitions with cubic-bezier easing

### Dark Mode
- Full dark theme via `[data-theme="dark"]` CSS overrides
- Persisted in localStorage
- Re-renders settings page on toggle to update button text
- All canvas charts read `getThemeColors()` for dynamic text/border colors

### Responsive
- Desktop: Sidebar (220px) + main content
- Tablet (480px+): Larger text, grids adapt
- Mobile: Bottom tab navigation (64px height), safe-area-inset support
- Canvas charts use DPR-aware sizing with CSS `width:100%`

### Animations
- Page transitions: `pageEnter` (0.35s cubic-bezier)
- Sidebar slide-in: `slideInLeft`
- Toast fade + slide: 3s auto-dismiss
- Modal: overlay fade + content slide-in
- Chart expand: `expandFadeIn` + `expandSlideIn`
- Shake form: on validation failure
- Budget progress fade: `bpFadeIn`
- Chart draw animations: ease-out cubic, spring elastic for pie

### Components
| Component | Usage |
|---|---|
| Toast | Success/error/warning notifications, 3s auto-dismiss |
| Modal | Category pickers, confirmations, forms |
| Category Tree Picker | Reusable in 7+ contexts (add, edit, filter, batch, merge, move, icon picker) |
| Budget View Toggle | Slider-style toggle (solid/segmented) |
| Pagination | First/prev/pages/next/last |
| Badge | Success (预算内) / Danger (超支) |
| Card | Consistent container with title |
| Input Group | Label + styled input |
| Button | Primary, outline, ghost, danger, sizes |

---

## 14. Notable / Unique Features

These are the standout capabilities that differentiate this app from typical budget trackers:

| # | Feature | Page | What makes it special |
|---|---|---|---|
| 1 | **Elastic Animated Pie Chart** | Stats | Spring-bounce animation on draw, hover pop-out with shadow, click-drill-down, labels with backgrounds and overlap detection, legend with color boxes and amounts — all in pure Canvas |
| 2 | **Budget Progress Card (Solid / Segmented)** | Overview, Stats, Categories | Toggle between single-color bars and segmented bars showing child-category breakdown visually within each parent bar |
| 3 | **Budget Monitor Selection** | Overview, Stats | Choose which budgeted categories to display (checkbox UI with select all/invert), persisted in localStorage |
| 4 | **Three-Mode Savings Target** | Settings | Fixed amount, % of budget, or both combined — feeds into spendable budget concept |
| 5 | **Spendable Budget Concept** | Overview, Stats, Report | Budget − savings target = disposable income. All metrics (daily limits, progress rings, predictions) use this spendable amount |
| 6 | **Calendar Heatmap** | Stats | Full month grid coloring each day's spending vs. daily target (6-color gradient). Click any day → see that day's records |
| 7 | **Interactive Pie Drill-Down** | Stats | Click a pie slice to drill into subcategories with breadcrumb navigation. Works in both inline and expanded modal views |
| 8 | **Month-Over-Month Comparison** | Stats | Toggle grouped bar chart showing each category this month vs last month |
| 9 | **Soft Delete with Undo** | Records | 5-second grace window to undo any deletion. Only one pending delete at a time |
| 10 | **Compact / Standard Record View** | Records | Toggle persisted in localStorage; compact shows single-line, standard shows full card |
| 11 | **Child Budget Percentage Support** | Categories | Sub-category budgets can be set as % of total monthly budget (not just fixed RM), with parent-child budget validation |
| 12 | **Category Merge** | Categories | Merges source category into target with all records reassigned. Options: move children or delete them |
| 13 | **Excel Export with Live Formulas** | Settings | Real XML Spreadsheet with SUMIF, IF, AVERAGE formulas that auto-recalculate when user edits values. No library needed |
| 14 | **Consistent Category Tree Picker** | Add, Records, Categories | Same tree-based modal used everywhere — add record, edit, filter, batch, merge, move. 7+ reuse contexts |
| 15 | **Custom Date Range Analysis** | Stats | Beyond monthly view — full stats for any date range with totals, counts, daily breakdown |
| 16 | **PNG Chart Download** | Stats | Every chart (pie, line, monthly, savings, comparison) has a download button |
| 17 | **Dark Mode** | Settings | Full dark theme with CSS custom properties, all chart colors adapt |
| 18 | **Responsive Dual Navigation** | Global | Desktop sidebar + mobile bottom tab nav with safe-area support |
| 19 | **Dual Daily Limits** | Overview, Stats | Shows both "gross" (budget-only) and "net" (budget − savings) daily remaining limits |
| 20 | **Overspent Filter** | Records | Filter to show only records belonging to categories that exceeded their budget |
| 21 | **Batch Operations** | Records | Multi-select records for bulk delete or bulk category change |
| 22 | **Printer-Friendly Report** | Report | Print CSS that hides nav/buttons, optimizes layout, preserves `break-inside` |
| 23 | **Savings Prediction Narrative** | Overview, Report | Natural language summary: "If you maintain current habits, you'll save RM X / overspend by RM Y" |
| 24 | **5-Sheet Excel Export** | Settings | 5 interconnected sheets: records, category stats, monthly summary, budget tracking, savings stats — all with live formulas |

---

## Appendix: Complete Function Index

| Function | Location | Purpose |
|---|---|---|
| `escHtml(str)` | 1118 | Sanitize HTML output |
| `uuid()` | 1154 | Generate unique ID |
| `getMonthKey(dateStr)` | 1158 | Extract `YYYY-MM` from date string |
| `DataStore.*` | 1166 | Data persistence layer (30+ methods) |
| `exportToExcel()` | 1465 | Generate XML Spreadsheet |
| `navigateTo(tab)` | 2100 | Tab routing + render |
| `applyTheme(theme)` | 2142 | Dark/light mode |
| `toggleTheme()` | 2147 | Toggle dark mode |
| `showToast(msg, type)` | 2156 | Toast notification |
| `showModal(html)` / `closeModal()` | 2171 | Modal dialog |
| `formatMoney(amount)` | 2185 | Format as `RM 1,234.56` |
| `getCategoryFullPath(catId)` | 2189 | `Icon Name > Parent > Child` |
| `getRootAncestorId(catId)` | 2199 | Top-level ancestor ID |
| `getRootAncestor(catId)` | 2207 | Top-level ancestor object |
| `renderOverview()` | 2218 | Overview page |
| `getThemeColors()` | 2440 | Read CSS vars for canvas |
| `loadBudgetMonitored()` | 2457 | Load monitor preferences |
| `refreshBudgetCards(month)` | 2468 | Refresh budget progress |
| `toggleBudgetView(month)` | 2475 | Solid/segmented toggle |
| `showBudgetSelector(month)` | 2495 | Category monitor picker |
| `confirmBudgetSelection(month)` | 2544 | Save monitor selection |
| `renderBudgetProgressCard(month)` | 2565 | Budget progress card (wrapper) |
| `renderBudgetProgressCardInner(month)` | 2644 | Budget progress card (inner) |
| `drawRing(...)` | 2792 | Donut chart on canvas |
| `drawSparkline(...)` | 2844 | Sparkline chart on canvas |
| `renderAddPage()` | 2906 | Add record page |
| `openCategoryPicker(context)` | 2964 | Open category tree modal |
| `buildCategoryTreePicker(cats, depth, context)` | 2972 | Tree picker HTML |
| `selectCategory(catId, context)` | 2993 | Pick category from tree |
| `submitRecord(e)` | 3011 | Save new record |
| `renderRecords()` | 3070 | Records list page |
| `toggleRecordsView()` | 3151 | Compact/card toggle |
| `getFilteredRecords()` | 3157 | Apply all filters |
| `toggleOverspentFilter()` | 3220 | Toggle overspent filter |
| `applyRecordsFilter()` | 3226 | Apply filter changes |
| `openCategoryFilterPicker()` | 3236 | Category filter modal |
| `clearRecordsFilter()` | 3286 | Clear all filters |
| `renderRecordsList()` | 3291 | Render paginated records |
| `toggleBatchMode()` | 3458 | Enter/exit batch mode |
| `toggleRecordSelection(id)` | 3466 | Select/deselect in batch |
| `batchDelete()` | 3494 | Batch delete confirmation |
| `confirmBatchDelete()` | 3510 | Execute batch delete |
| `batchChangeCategory()` | 3522 | Batch recategorize |
| `confirmBatchChangeCategory(catId)` | 3558 | Execute batch recategorize |
| `deleteRecordConfirm(id)` | 3572 | Single delete confirmation |
| `undoDelete(btn)` | 3614 | Undo soft delete |
| `openEditRecord(id)` | 3639 | Edit record modal |
| `submitEditRecord(e, id)` | 3690 | Save edited record |
| `renderCategories()` | 3715 | Category management page |
| `buildCategoryTreeHTML(cats, depth)` | 3738 | Category tree HTML |
| `saveCategoryBudget(catId, month, value, type)` | 3783 | Save per-category budget |
| `mergeCategory(sourceId)` | 3810 | Start category merge |
| `confirmMergeCategory()` | 3891 | Execute category merge |
| `toggleCategoryChildren(toggleEl)` | 3955 | Expand/collapse tree node |
| `addRootCategory()` | 3972 | Add root category |
| `addChildCategory(parentId)` | 4000 | Add child category |
| `renameCategory(id)` | 4029 | Rename category |
| `changeCategoryIcon(id)` | 4056 | Change icon |
| `changeCategoryColor(id)` | 4076 | Change color |
| `moveCategory(id)` | 4107 | Move category |
| `deleteCategoryConfirm(id)` | 4159 | Delete category |
| `getDrillCategory()` | 4220 | Current drill category |
| `syncPieDrillBar()` | 4225 | Update drill breadcrumb |
| `updateDrillCharts()` | 4245 | Redraw after drill |
| `getHeatmapColor(ratio)` | 4258 | Color for heatmap cell |
| `getDailySavingsTarget(month)` | 4289 | Daily spendable target |
| `renderCalendarHeatmap(month)` | 4306 | Calendar heatmap HTML |
| `showDayRecords(dateStr)` | 4402 | Show day's records popup |
| `expandHeatmap()` | 4453 | Expand heatmap modal |
| `expandPie()` | 4478 | Expand pie chart modal |
| `renderExpandPieTable()` | 4513 | Category table in pie expand |
| `toggleExpandPieRow(rowId)` | 4633 | Toggle subcategory rows |
| `shrinkChart()` | 4639 | Close expand modal |
| `toggleMonthCompare()` | 4647 | Toggle month comparison |
| `drawCompareBarChart(canvasId, month)` | 4652 | Comparison chart |
| `renderStats()` | 4754 | Statistics page |
| `changeStatsMonth(month)` | 4977 | Change stats month |
| `changeStatsCustom()` | 4985 | Update custom range |
| `resetStatsDrill()` | 5002 | Reset pie drill-down |
| `useCustomRange()` | 5015 | Is custom range active? |
| `getChartData(month, startDate, endDate)` | 5035 | Chart data (root aggregated) |
| `getRawChartData(month, startDate, endDate)` | 5061 | Chart data (raw categories) |
| `drawPieChart(...)` | 5075 | Pie chart with drill-down |
| `drawLineChart(...)` | 5482 | Animated line chart |
| `drawBarChart(...)` | 5644 | Bar chart with drill-down |
| `drawMonthlyChart(canvasId)` | 5755 | 6-month trend line |
| `drawSavingsChart(canvasId)` | 5852 | 6-month savings bars |
| `downloadChart(canvasId)` | 5949 | Download canvas as PNG |
| `renderSettings()` | 5961 | Settings page |
| `setSavingsType(type)` | 6037 | Change savings mode |
| `saveBudget()` | 6044 | Save monthly budget |
| `saveSavingsTarget()` | 6051 | Save savings config |
| `exportJSON()` | 6059 | Download JSON |
| `importJSON(event)` | 6073 | Import JSON file |
| `confirmImportJSON(mode)` | 6093 | Execute import |
| `exportCSV()` | 6106 | Download CSV |
| `clearAllData()` | 6118 | Clear confirmation |
| `confirmClearAll()` | 6129 | Execute clear |
| `renderReport()` | 6141 | Report page |
| `changeReportMonth(month)` | 6334 | Change report month |
| `printReport()` | 6339 | Print report |
