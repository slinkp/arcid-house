# Grid-based Layout & Navigation

## Decision: CSS Grid for layout and navigation

Replacing the bounding-box-based `buildFocusGraph()` with CSS Grid placement. Grid position data (row/column numbers) serves as the source of truth for both layout and navigation neighbor-finding.

## Why not separate grids per player area

Three separate grids (shared top + two player halves) would require custom stitching logic to navigate between them — the same kind of bounding-box problem we're trying to eliminate. One grid with application-level constraints is cleaner.

## Layout structure

```css
#running-app {
  display: grid;
  grid-template-columns: 1fr 1fr;   /* left = P1, right = P2 */
  grid-template-rows: auto 1fr;
  width: 100%;
  height: 100%;
  gap: 2px;
}

#global-controls {
  grid-column: 1 / -1;  /* spans full width, accessible by either player */
}
```

Player 1's drum grid is 10 rows × 17 columns (1 label column + 16 step columns):

```css
#drum-grid {
  display: grid;
  grid-template-columns: auto repeat(16, 1fr);
  grid-template-rows: repeat(10, 1fr);
  gap: 2px;
}
```

The `auto` first column sizes to fit track labels ("BD", "SN", etc.). CSS Grid auto-places 17 items per row in document order — no explicit placement needed on individual step elements.

## Navigation: finding neighbors by grid position

```javascript
function getGridPosition(widget) {
  const style = getComputedStyle(widget);
  const colStart = parseInt(style.gridColumnStart);
  const colEnd = style.gridColumnEnd === 'auto'
    ? colStart + 1
    : parseInt(style.gridColumnEnd);
  const rowStart = parseInt(style.gridRowStart);
  const rowEnd = style.gridRowEnd === 'auto'
    ? rowStart + 1
    : parseInt(style.gridRowEnd);
  return {
    rowStart, rowEnd, rowCenter: (rowStart + rowEnd) / 2,
    colStart, colEnd, colCenter: (colStart + colEnd) / 2,
  };
}

function rowsOverlap(a, b) {
  return a.rowStart < b.rowEnd && b.rowStart < a.rowEnd;
}

function findNeighbor(current, direction, widgets) {
  const pos = getGridPosition(current);
  const candidates = widgets
    .filter(w => w !== current)
    .map(w => ({ widget: w, pos: getGridPosition(w) }));

  if (direction === 'left') {
    return candidates
      .filter(c => rowsOverlap(c.pos, pos) && c.pos.colEnd <= pos.colStart)
      .sort((a, b) => b.pos.colEnd - a.pos.colEnd)
      [0]?.widget ?? null;
  }
  if (direction === 'right') {
    return candidates
      .filter(c => rowsOverlap(c.pos, pos) && c.pos.colStart >= pos.colEnd)
      .sort((a, b) => a.pos.colStart - b.pos.colStart)
      [0]?.widget ?? null;
  }
  if (direction === 'up') {
    return candidates
      .filter(c => c.pos.rowEnd <= pos.rowStart)
      .sort((a, b) => {
        if (a.pos.rowEnd !== b.pos.rowEnd) return b.pos.rowEnd - a.pos.rowEnd;
        return Math.abs(a.pos.colCenter - pos.colCenter)
             - Math.abs(b.pos.colCenter - pos.colCenter);
      })
      [0]?.widget ?? null;
  }
  if (direction === 'down') {
    return candidates
      .filter(c => c.pos.rowStart >= pos.rowEnd)
      .sort((a, b) => {
        if (a.pos.rowStart !== b.pos.rowStart) return a.pos.rowStart - b.pos.rowStart;
        return Math.abs(a.pos.colCenter - pos.colCenter)
             - Math.abs(b.pos.colCenter - pos.colCenter);
      })
      [0]?.widget ?? null;
  }
  return null;
}
```

**Left/Right**: same row band (`rowsOverlap`), pick nearest edge.  
**Up/Down**: strictly beyond current widget's row edge, tiebreak by `colCenter` distance.  
Works correctly for widgets spanning multiple rows or columns.

Performance: fine at any foreseeable scale (320 widgets max → sub-millisecond sort).

## Two-player focus

- Two tracked widgets: `focusedWidgetForPlayer = { 1: null, 2: null }`
- Navigation filtered by player area: P1 restricted to `colStart <= 8`, P2 to `colStart > 8`, global controls row accessible to both
- Custom focus classes instead of `element.focus()` / `element.blur()` (browser focus is stolen by the framework and can't represent two simultaneous cursors):

```javascript
function setPlayerFocus(player, widget) {
  focusedWidgetForPlayer[player]?.classList.remove(`p${player}-focus`);
  focusedWidgetForPlayer[player] = widget;
  widget.classList.add(`p${player}-focus`);
}
```

```css
.p1-focus { outline: 1px solid #00e5ff !important; }
.p2-focus { outline: 1px solid #ff2b2b !important; }
```

## Cross-area navigation (global controls ↔ player area)

Since `#global-controls` and `#drum-grid` are separate CSS grids, `getComputedStyle` positions are not comparable between them. Handle the boundary explicitly: pressing "up" from row 1 of the player area jumps to global controls; pressing "down" from global controls jumps to row 1 of the player area at the nearest column. Two lines of special-case logic at a fixed structural boundary.

## `.hidden` specificity bug

`#running-app { display: grid }` (specificity `1,0,0`) overrides `.hidden { display: none }` (specificity `0,1,0`), so toggling `.hidden` on elements with ID-based display rules has no effect. Fix:

```css
.hidden {
  display: none !important;
}
```

`!important` is appropriate here — utility override classes are one of its canonical uses.
