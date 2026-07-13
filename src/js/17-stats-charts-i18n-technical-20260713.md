# Technical Log — 17-stats-charts.js i18n Translation

**Date:** 2026-07-13
**Task:** Restore + i18n-translate `src/js/17-stats-charts.js`
**File:** `/home/xbl2602/budget app/src/js/17-stats-charts.js`

## Summary

The file was accidentally truncated to 275 lines in a previous i18n pass. Restored from git (2433 lines) and all Chinese UI text was replaced with `__('key')` calls.

## Operations Performed

1. **Git restore:** `git checkout HEAD -- src/js/17-stats-charts.js` — restored full 2433-line file
2. **i18n replacement:** All Chinese UI strings replaced with `__('stats.xxx.xxx')` calls across ~25 functions
3. **i18n dictionary added:** 103 translation entries added in `addI18nEntries({...})` block before `// === EXPORTS ===`
4. **Validation:** `node --check` passes with no errors

## Statistics

| Metric | Value |
|--------|-------|
| Original lines | 2433 |
| Final lines | 2540 |
| Net added | +107 lines |
| `__('key')` calls | 129 |
| Unique i18n keys defined | 103 |
| Functions translated | ~25 |

## Functions Modified

- `syncPieDrillBar()` — drill navigation text
- `renderCalendarHeatmap()` — all labels, legend, tooltips, weekdays
- `showDayRecords()` — popup records text
- `expandHeatmap()` — modal title, hint text
- `expandPie()` — modal title
- `renderExpandPieTable()` — table headers, drill hints, back button
- `drawCompareBarChart()` — labels, no-data text
- `renderBillToggle()` — checkbox label
- `refreshOverviewBudget()` — overspent/income/bills text
- `renderStats()` — ALL card titles, buttons, labels, savings section, heatmap/pie/waffle headers
- `changeStatsCustom()` — toast message
- `drawPieChart()` — no-data text, direct-label
- `drawLineChart()` — no-data text, daily budget label
- `drawBarChart()` — no-data text
- `drawMonthlyChart()` — no-monthly-data text, month labels
- `drawSavingsChart()` — no-data text, month labels
- `drawWaffleChart()` — untagged label, no-data text
- `openWaffleTagColorPicker()` — modal title, buttons
- `exportWafflePNG()` — toast message

## Preserved

- All `window.*` exports (42 exports)
- `renderBillToggle` function — intact
- `isBillToggleChecked` function — intact
- Emojis in UI text — retained outside `__()` calls
- Functional code logic — unchanged
- Chinese code comments — preserved
- Parameter interpolation via `{0}`, `{1}` placeholders

## Key Naming Convention

All keys use `stats.xxx.xxx` prefix:
- `stats.heatmap.*` — heatmap-specific
- `stats.pieChart.*` — pie chart-specific
- `stats.waffle.*` — waffle chart-specific
- `stats.billToggle.*` — bill toggle
- `stats.monthCompare.*` — month-over-month comparison
- `stats.lineChart.*` — line chart labels
- `stats.*` — general stats page strings

## Validation

```
$ node --check src/js/17-stats-charts.js
✅ SYNTAX OK
```
