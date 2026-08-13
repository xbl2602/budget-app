# 2026-08-13 — Stats category-spending hierarchy levels

## Problem
The stats page "category spending" view (pie chart + expanded detail table) only
expands one level of subcategories, and the tag (waffle) card has no way to view
category spending. User wants a depth control: flat expansion of all levels vs a
selected depth.

## Decisions (confirmed with user)
1. **Control placement**: on the category-spending card only (pieCard title bar +
   expanded overlay title bar). The waffle/tag card stays tag-only — one card, one
   dimension (readability).
2. **Row organization**: pure flat list — each row is a category's **own direct
   spend** (mutually exclusive; sum = total). Non-leaf categories with direct
   records also get their own row. Zero rows filtered.
3. **Levels**: 3-way segmented control `1层 | 2层 | 全部` (Top | 2 Levels | All),
   persisted to localStorage key `budgetStatsHierarchy` (default 1).
4. **Pie chart also responds**: slice depth follows the level. Labels degrade when
   slices > 12 (icon only; names/amounts live in the right-side legend).

## Behavior
- **1 层 (default, current behavior)**: top-level categories with descendant-summed
  totals; drill branch unchanged (direct children + "直接" row).
- **2 层**: roots + direct children; children rows show their own direct spend.
- **全部**: recursive to all leaves; every row shows its own direct spend.
- Path prefix shown as muted small text (`父 › 子`) in flat rows.
- Drill semantics preserved: clicking a category name still drills into its subtree
  (pie + table sync); breadcrumb/back button unchanged. Level switching does not
  reset drill state; it only re-expands depth.
- Total row always sums rows and shows 100%.

## Files
- `src/js/17-stats-charts.js` — state, control, `buildPieSliceRows()`, table render,
  pie data + label degrade, i18n keys.
- `index.html` — rebuilt via `build.sh`.

## Tests
- jsdom: set level 2/all → `buildPieSliceRows` returns expected rows (direct spend,
  path prefixes, sum = total); level 1 keeps current summary rows.
