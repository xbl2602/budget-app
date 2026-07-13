## Change Log
- **File:** `src/js/17-stats-charts.js`
- **Change:** Replaced tag filter UI with Waffle Chart visualization card
- **Reason:** Feature 3 tag filter was text-based; user requested more intuitive visual representation of tag distribution
- **Risk:** Low — removed deprecated code and added self-contained new feature

### Changes Made

#### Removed
1. **Line 11:** `let statsTagFilter = [];` — replaced with waffle state variables
2. **Lines 698-701:** Tag filter logic — `if (statsTagFilter && ...)` filter on records
3. **Lines 732-745:** Tag filter card HTML — entire card with tag display and picker button
4. **Lines 1980-1982:** Old exports — `window.statsTagFilter`, `window.openTagPickerForStats`, `window.removeStatsTagFilter`
5. **Lines 1984-1997:** Old functions — `openTagPickerForStats()`, `removeStatsTagFilter()`

#### Added
1. **Variables (lines 11-14):** `waffleDensity` (persisted), `waffleIncludeUntagged` (persisted), `waffleCells`, `waffleTagData`
2. **Waffle chart card HTML (lines 882-904):** Card with "标签分布" title, untagged toggle, 5-level density selector, canvas, legend container, tooltip
3. **`drawWaffleChart()` (line ~940):** Main rendering function — aggregates tags, computes grid, assigns cells, triggers animation
4. **`drawCell()`:** Renders a single rounded cell at given position with scale
5. **`animateWaffle()`:** Scale Pop animation with elastic easing (same easing as pie chart: `1 - 2^(-7t) * cos(t * 2π * 1.2)`), staggered batches
6. **`drawWaffleLegend()`:** Generates color-coded legend with percentages
7. **`bindWaffleHover()`:** Mouse hover interaction — tooltip display, highlight cells of same tag, pointer cursor
8. **`drawWaffleStatic()`:** Static canvas draw (used for hover highlights, dims non-highlighted cells)
9. **`setWaffleDensity(level)`:** Density setter (1-5, persisted to localStorage)
10. **`toggleWaffleUntagged()`:** Toggle for including untagged records (persisted)
11. **Exports (lines 2253-2255):** `window.setWaffleDensity`, `window.toggleWaffleUntagged`, `window.drawWaffleChart`
12. **Draw call (line 915):** `drawWaffleChart('waffleChart', records)` inside renderStats setTimeout

### Verification
- `node --check src/js/17-stats-charts.js` — ✅ PASS (exit 0, no output)
- `bash build.sh` — ✅ PASS (exit 0, index.html generated)
- Line count: 2256 (increased from 1987 due to waffle functions)
- All `statsTagFilter` references removed — confirmed via grep
- Waffle functions properly enclosed in IIFE

### Design Notes
- Canvas uses Retina-aware rendering (`devicePixelRatio` + `setTransform`)
- Colors from project's `COLORS` array (defined in `01-constants.js`)
- `roundRect()` used throughout — project has polyfill in `22-init.js`
- `escHtml()` used for user content in tooltip and legend
- Elastic easing matches existing pie chart animation
- Density values: 1→500 cells, 2→300, 3→200, 4→100, 5→50
- Hover highlights all cells of same tag with full opacity (others dimmed to 0.85)
