# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Tetris implemented in vanilla JavaScript (no build tools, no dependencies, no package.json). Three files: `index.html` (DOM/canvas structure), `style.css` (dark/retro theme), `game.js` (all game logic, ~300 lines).

## Running

No install/build step. Either open `index.html` directly in a browser, or serve it statically:

```bash
python3 -m http.server 8000
npx serve .
```

There is no test suite, linter, or bundler configured.

## Architecture (`game.js`)

Single global-state module, no classes, no modules — everything lives in module-level `let` variables (`board`, `current`, `next`, `score`, etc.) mutated by top-level functions.

- **Board model**: `ROWS × COLS` matrix; each cell is `0` (empty) or a color index `1–7` identifying the locked piece.
- **Pieces**: `PIECES` are square matrices. Rotation (`rotateCW`) is a transpose + row-reverse, not a lookup table of rotation states — so all 4 orientations are derived at runtime, not precomputed.
- **Collision** (`collide`): bounds + board-overlap check, reused for movement, rotation, ghost projection, and spawn validity.
- **Wall kicks** (`tryRotate`): after rotating, tries offsets `[0, -1, 1, -2, 2]` in order and keeps the first that doesn't collide. This is a simplified kick table, not the official SRS kick data.
- **Game loop** (`loop`): driven by `requestAnimationFrame`, accumulates elapsed time in `dropAccum` and advances the piece one row once `dropInterval` is exceeded. Pausing works by cancelling the rAF handle (`cancelAnimationFrame`) rather than a state flag alone.
- **Line clears** (`clearLines`): scans bottom-up, splices full rows and unshifts empty ones; re-checks the same row index after a splice (`r++`) since rows shift down.
- **Scoring/leveling**: `LINE_SCORES = [0,100,300,500,800]` multiplied by `level`; hard drop = 2 pts/cell dropped, soft drop = 1 pt/row. Level increases every 10 lines; `dropInterval = max(100, 1000 - (level-1)*90)`.
- **Ghost piece**: `ghostY()` projects the current piece straight down via `collide` and is redrawn every frame at `globalAlpha = 0.2`.

Tunable constants live at the top of `game.js` (`COLS`, `ROWS`, `BLOCK`, `COLORS`, `LINE_SCORES`, `dropInterval`). If `COLS`/`ROWS`/`BLOCK` change, the `<canvas id="board">` `width`/`height` in `index.html` must be updated to match (`COLS × BLOCK`, `ROWS × BLOCK`).
