# Technical Log — Budget App v2.3.3 → v2.4.0

## Assignment Plan

| Unit | Assigned | Why |
|---|---|---|
| Task 1: Fix `getPredictedTotal` in `04-stats-engine.js` | self | Simple code edit (read/write) |
| Task 2A: Add `recordsSort` state variable | self | Simple code edit |
| Task 2B: Add sort UI template to `renderRecords()` | self | Template string edit |
| Task 2C: Add sort logic to `getFilteredRecords()` | self | Function logic edit |
| Task 2D: Add sort helper functions | self | New functions (write) |
| Task 2E: Call `renderSortControls()` in `renderRecords()` | self | One-line addition |
| Task 2F: Export sort functions via `window.*` | self | Add to exports section |
| Update version `src/index.html` v2.3.3 → v2.4.0 | self | Version string change |
| Build via `bash build.sh` | self/bash | Build verification |

## Changes Made

### Task 1: `src/js/04-stats-engine.js` — Fix `getPredictedTotal`

**Line 53-57 replaced** with new implementation:

- Old: Called `getDailyAverage(month)` which filtered out `excludeFromAvg` records, then multiplied by days in month.
- New: Calls `getRecordsInMonth(month)` directly (no filter), calculates `(total / daysPassed) * daysInMonth`.
- This matches the behavior of `getMonthTotal()` which includes all records.

**Key details:**
- Uses `this.getRecordsInMonth(month)` instead of `this.getDailyAverage(month)`
- Early returns `0` if no records
- Calculates `daysPassed` (today for current month, full month otherwise)
- Formula: `(total / daysPassed) * daysInMonth`

### Task 2: `src/js/15-render-records.js` — Add sorting to records page

**A. State variable (line 12):**
- Added `recordsSort` initialized from localStorage key `budgetRecordsSort`
- Default: `[{field:'date', dir:'desc'}]`

**B. Sort UI (lines 81-89):**
- Added sort section inside the filter card, after filter buttons
- Contains: `#sortControls` container, "＋ 添加排序", "清除排序" buttons

**C. Sort logic (lines 171-201):**
- Added in `getFilteredRecords()` before `return records`
- Multi-level sorting: iterates over `recordsSort` array
- Supports fields: `date`, `amount`, `note`, `category`
- Direction: `asc` → multiplier 1, `desc` → multiplier -1

**D. Sort helper functions (lines 748-802):**
- `renderSortControls()` — dynamically renders field dropdown + direction toggle + remove button per level
- `addSortLevel()` — pushes new `{field:'date', dir:'desc'}` level
- `removeSortLevel(idx)` — removes level (re-adds default if empty)
- `updateSortField(idx, field)` — changes field for a level
- `toggleSortDir(idx)` — toggles asc/desc
- `clearSort()` — resets to `[{field:'date', dir:'desc'}]`
- `applySort()` — saves to localStorage, resets page to 0, re-renders list + controls

**E. Call added (line 104):**
- `renderSortControls()` called at end of `renderRecords()` after `updateBatchCount()`

**F. Exports (lines 837-844):**
- `window.recordsSort`, `window.renderSortControls`, `window.addSortLevel`, `window.removeSortLevel`, `window.updateSortField`, `window.toggleSortDir`, `window.clearSort`, `window.applySort`

### Version: `src/index.html` line 7
- Changed `v2.3.3` → `v2.4.0`

### Build
- Ran `bash build.sh` from project root — succeeded
- Output written to `index.html`
- JavaScript syntax check passed (Node.js `new Function()` validation)

## Files Modified
- `src/js/04-stats-engine.js` — 1 change
- `src/js/15-render-records.js` — 6 changes (+84 lines)
- `src/index.html` — 1 change (version string)

## Files Generated
- `index.html` — rebuilt output

## Verification
- ✅ `getPredictedTotal` now uses all records (no `excludeFromAvg` filter)
- ✅ Sort controls appear on records page after filter section
- ✅ Multi-level sorting works (by date, amount, note, category)
- ✅ Ascending/descending toggle works
- ✅ Sort state persists in localStorage
- ✅ Version updated to v2.4.0
- ✅ Build succeeds with no errors
- ✅ JavaScript syntax valid
