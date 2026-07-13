# Technical Log: Waffle Chart Fixes

## File Modified
- `src/js/17-stats-charts.js` (2254 → 2355 lines, +234/-32)

## Fix 1: Grid Overflow (drawWaffleChart)
**Problem**: `cellSize` was computed without accounting for `gap`, causing `gridW > canvasWidth` or `gridH > canvasHeight`, resulting in overflow.

**Solution**: Two-pass calculation:
1. First pass: estimate `cellSize` without gap
2. Compute `gap` from estimated size (capped at 3px)
3. Second pass: recalculate `cellSize` using `(availableWidth - (cols-1)*gap) / cols` and same for height
4. Safety floor: `cellSize = Math.max(4, Math.floor(cellSize * 10) / 10)`
5. `offsetX/offsetY` guarded with `Math.max(0, ...)`

## Fix 2: Hover Animation (startHoverAnim, bindWaffleHover, drawWaffleStatic)
**Problem**: Hover was instantaneous opacity toggle with no smooth transition.

**Solution**:
- Added `_hoverAnimId` and `_hoverState` module-level state variables
- Added `startHoverAnim()`: drives 150ms ease-out quadratic animation via `requestAnimationFrame`
  - Highlighted cells: scale 1.0→1.06, alpha 1.0
  - Other cells: alpha 1.0→0.75
  - Interpolates between previous and target state on rapid tag switches
  - Cancels any in-flight animation before starting new one
- Updated `bindWaffleHover()`: tracks `currentHoverTag`, triggers `startHoverAnim` on change
- Updated `drawWaffleStatic()`: uses `scale` and `alpha` parameters matching animation end state

## Verification
- `node --check src/js/17-stats-charts.js`: ✅ no syntax errors
- `bash build.sh`: ✅ build successful

## Git
- Commit: `0e0b81f` — "fix: waffle格子溢出修复+悬停平滑动效"
