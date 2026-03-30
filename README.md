# 4chess

`4chess` is a chess rules library for JavaScript.
It handles move generation, legality, serialization, and game state for standard chess and 4-player chess.

This project is not a chess engine/AI.

## Why 4chess

- Supports both 2-player and 4-player chess.
- Variant-first architecture with versioned variant IDs.
- Board/rules model can support custom layouts and sizes.
- Focused on rules/state, not AI/search.

## Quick Start

```js
import { Chess } from '4chess';

const game = new Chess({ variant: '4player@v1' });
game.move('e4');
console.log(game.turn()); // b
```

Standard chess:

```js
import { Chess } from '4chess';

const game = new Chess({ variant: 'standard@v1' });
game.move('e4');
game.move('e5');
console.log(game.pgn({ format: 'standard' }));
```

## Minimal Examples

Example 1 — Standard:

```js
const chess = new Chess();
chess.move('e4');
```

Example 2 — 4 Player:

```js
const chess = new Chess({ variant: '4player' });
chess.move('e4');
```

Example 3 — JSON restore:

```js
const saved = chess.toJSON();
const restored = new Chess().loadJSON(saved);
```

## Variant IDs

- `standard@v1` (alias: `standard`)
- `4player@v1` (alias: `4player`)

Use versioned IDs in persisted data so future rules upgrades stay backward-compatible.

## 4-Player Board Coordinates

- Board size is `14x14` with `3x3` invalid corner blocks.
- Coordinates are still algebraic (`a1` to `n14`).
- `a1` is bottom-left from Red's perspective.

Player order and pawn directions:

- Red (`R`): starts at bottom, pawns move upward.
- Blue (`B`): starts at left, pawns move rightward.
- Yellow (`Y`): starts at top, pawns move downward.
- Green (`G`): starts at right, pawns move leftward.

## PGN Output Modes

```js
game.pgn({ format: 'standard' }); // 2-player PGN
game.pgn({ format: '4player' });  // grouped + labeled turns, e.g. R:e4 B:c7 ...
game.pgn({ format: 'verbose' });  // debug-oriented output with move details
```

## JSON Save/Load

Core-only snapshot:

```js
const data = game.toJSON();
```

Include optional app metadata:

```js
const data = game.toJSON({ includeMeta: true });
```

Load snapshot:

```js
const game = new Chess();
game.loadJSON(data);
```

`meta` is optional and ignored by engine rules logic.

## API

| Method | Description |
| --- | --- |
| `move(input)` | Make one legal move (`SAN` or `{ from, to, promotion? }`). |
| `moves(opts?)` | List legal moves (SAN or verbose). |
| `board()` | Safe board snapshot (`width`, `height`, `variant`, `cells`) with mask-respecting `null` invalid cells. |
| `board({ raw: true })` | Raw internal snapshot (`squares`, `validSquares`) for engine/debug tooling. |
| `fen()` / `load(fen)` | Export/import FEN. |
| `pgn(opts?)` / `loadPgn(pgn)` | Export/import PGN-like move text. |
| `toJSON(opts?)` / `loadJSON(data)` | Export/import full game snapshot. |
| `history(opts?)` | Move history (SAN or verbose). |
| `undo()` | Undo last move. |

## Exports

```js
import { Chess, variants } from '4chess';
```
