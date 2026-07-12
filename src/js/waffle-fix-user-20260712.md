# User Log: Waffle Chart Improvements

## Fix 1: Grid Overflow Fixed
The waffle chart grid no longer overflows its container. Cell sizes are now properly calculated to account for gaps between cells, ensuring the entire grid fits within the chart area.

## Fix 2: Smooth Hover Animation
Hovering over waffle chart segments is now smooth and polished:
- When you hover over a tag, its cells smoothly enlarge (1.06x) and stay fully opaque
- Other tag cells gently dim to 75% opacity
- Transitions are smooth 150ms animations (ease-out)
- Switching between tags animates smoothly from one state to the next
- Leaving the chart restores everything to normal state
