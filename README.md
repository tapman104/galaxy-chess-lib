# 4chess

`4chess` is a chess rules library for JavaScript.
It handles move generation, legality, serialization, and game state for standard chess and 4-player chess.

This project is not a chess engine/AI.

Quick example:

```js
import { Chess } from '4chess';

const game = new Chess();
game.move('e4');
```

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

### `new Chess(options?)`

| Option | Type | Default | Description |
|---|---|---|---|
| `variant` | `string \| object` | `'standard'` | `'standard'`, `'4player'`, or versioned ID |
| `fen` | `string` | — | Load a FEN position on construction |
| `meta` | `object` | — | Arbitrary app metadata stored alongside the game |

```js
const game = new Chess();
const game = new Chess({ variant: '4player' });
const game = new Chess({ fen: 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1' });
```

---

### Making moves

#### `move(input)` → `MoveObject`

Plays one legal move. Throws `InvalidMoveError` on illegal or unrecognized input.

```js
game.move('e4');                                  // SAN string
game.move({ from: 'e2', to: 'e4' });              // coordinate object
game.move({ from: 'e7', to: 'e8', promotion: 'q' }); // with promotion
```

**`MoveObject`** returned:

| Field | Type | Description |
|---|---|---|
| `from` | `string` | Source square, e.g. `'e2'` |
| `to` | `string` | Destination square, e.g. `'e4'` |
| `piece` | `string` | Piece type moved: `'p' 'n' 'b' 'r' 'q' 'k'` |
| `captured` | `string \| undefined` | Captured piece type, or `undefined` |
| `promotion` | `string \| undefined` | Promoted piece type, or `undefined` |
| `flags` | `string` | `'n'` quiet, `'b'` double-push, `'c'` capture, `'e'` en-passant, `'k'`/`'q'` castle, `'p'` promo, `'m'` promo-capture |
| `san` | `string` | SAN notation of the move |
| `color` | `string` | Player color: `'w'` `'b'` (standard) or `'r'` `'b'` `'y'` `'g'` (4-player) |

#### `undo()` → `MoveObject | null`

Undoes the last move and returns its move object. Returns `null` if history is empty.

```js
const undone = game.undo();
```

#### `moves(options?)` → `string[] | MoveObject[]`

Returns all legal moves for the current player.

| Option | Type | Description |
|---|---|---|
| `square` | `string` | Filter to moves from a specific square, e.g. `'e2'` |
| `verbose` | `boolean` | Return `MoveObject[]` instead of SAN strings |

```js
game.moves();                        // ['e4', 'd4', 'Nf3', ...]
game.moves({ square: 'e2' });        // ['e3', 'e4']
game.moves({ verbose: true });       // [{ from, to, piece, ... }, ...]
```

---

### Game state

#### `turn()` → `string`

Current player to move. Returns `'w'` / `'b'` for standard, or `'r'` / `'b'` / `'y'` / `'g'` for 4-player.

#### `get(square)` → `{ type, color } | null`

Returns the piece on a square, or `null` if empty or invalid.

```js
game.get('e1'); // { type: 'k', color: 'w' }
game.get('e4'); // null
```

#### `inCheck()` → `boolean`

Whether the current player's king is in check.

#### `inCheckmate()` → `boolean`

Whether the current player is in checkmate.

#### `inStalemate()` → `boolean`

Whether the current player is in stalemate.

#### `inDraw()` → `boolean`

`true` if any draw condition applies: stalemate, insufficient material, threefold repetition, or 50-move rule (halfmove clock ≥ 100).

#### `inThreefoldRepetition()` → `boolean`

Whether the current position has occurred three or more times.

#### `insufficientMaterial()` → `boolean`

Whether neither side can deliver checkmate. In 4-player, evaluated only when exactly two players remain.

#### `isGameOver()` → `boolean`

`true` if the game is over by checkmate or any draw condition.

#### `variant()` → `string`

Returns the canonical variant ID, e.g. `'standard@v1'` or `'4player@v1'`.

---

### Board inspection

#### `board(options?)` → `BoardSnapshot`

Returns a safe snapshot of the board.

```js
game.board();
// {
//   width: 8, height: 8, variant: 'standard@v1',
//   cells: [
//     { square: 'a1', piece: { type: 'r', color: 'w' } },
//     { square: 'a2', piece: null },
//     ...
//   ]
// }
```

`cells[i]` is `null` for corner squares on the 4-player board (the 3×3 masked blocks).

| Option | Type | Description |
|---|---|---|
| `raw` | `boolean` | Return internal `{ squares, validSquares, width, height, variant }` instead |

#### `ascii()` → `string`

Returns a text board diagram for debugging.

```js
console.log(game.ascii());
```

---

### History

#### `history(options?)` → `string[] | MoveObject[]`

Returns the move history.

| Option | Type | Description |
|---|---|---|
| `verbose` | `boolean` | Return `MoveObject[]` instead of SAN strings |
| `withPlayers` | `boolean` | Return `{ san, player }[]` — `player` is the player index (0–3) |

```js
game.history();                    // ['e4', 'e5', 'Nf3', ...]
game.history({ verbose: true });   // [{ from, to, piece, ... }, ...]
game.history({ withPlayers: true });// [{ san: 'e4', player: 0 }, ...]
```

---

### Serialization

#### `fen()` → `string`

Exports the current position as a FEN string. 4-player FEN uses an 8-char castling field (`KQKQKQKQ`, `_` for absent rights).

#### `load(fen, options?)` → `this`

Loads a FEN string, resetting history.

```js
game.load('rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1');
```

#### `pgn(options?)` → `string`

Exports the game as PGN.

| Option | Type | Description |
|---|---|---|
| `format` | `string` | `'standard'` (default for 2-player), `'4player'` (labeled turns: `R:e4 B:c5 ...`), `'verbose'` |
| `includeHeaders` | `boolean` | Include PGN header block (default `true`) |

```js
game.pgn();
game.pgn({ format: '4player' });
game.pgn({ format: 'verbose' });
```

#### `loadPgn(pgn, options?)` → `this`

Parses and replays a PGN string. Resets the board first.

#### `toJSON(options?)` → `object`

Exports a full game snapshot (board, state, history, position counts).

| Option | Type | Description |
|---|---|---|
| `includeMeta` | `boolean` | Include `meta` object with headers and creation timestamp |

```js
const data = game.toJSON();
const data = game.toJSON({ includeMeta: true });
```

#### `loadJSON(data)` → `this`

Restores a game from a `toJSON()` snapshot. The snapshot must include the `variant` field.

```js
const saved = game.toJSON();
const restored = new Chess().loadJSON(saved);
```

---

### PGN Headers

#### `header(key, value)` → `this`

Sets a PGN header key/value pair. Returns `this` for chaining.

#### `headers()` → `object`

Returns all current PGN headers as a plain object.

#### `clearHeaders()` → `this`

Removes all PGN headers.

```js
game.header('White', 'Alice').header('Black', 'Bob');
game.headers(); // { White: 'Alice', Black: 'Bob' }
game.clearHeaders();
```

---

### Cloning

#### `clone()` → `Chess`

Returns a deep copy of the game — same position, board, history, and position counts. Mutations to the clone do not affect the original.

```js
const copy = game.clone();
copy.move('Nf3'); // original is unchanged
```

---

### Errors

```js
import { InvalidMoveError, InvalidFENError } from '4chess';
```

| Class | Thrown by | When |
|---|---|---|
| `InvalidMoveError` | `move()` | Move is illegal or unrecognized |
| `InvalidFENError` | `load()`, `loadJSON()` | FEN/JSON is malformed |

```js
try {
  game.move('Ke9');
} catch (e) {
  if (e instanceof InvalidMoveError) console.error('Bad move:', e.message);
}
```

---

### Named exports

```js
import {
  Chess,
  InvalidMoveError, InvalidFENError,
  variants, STANDARD, FOUR_PLAYER, resolveVariant, variantId,
  // Advanced / engine-level:
  Board, Pieces, GameState,
  getLegalMoves, isMoveLegal, findKing, inCheck,
  makeMove, unmakeMove,
  computeHash,
  exportFEN, parseFEN,
  moveToSAN, sanToMove,
  parsePGN, exportPGN,
} from '4chess';
```

| Export | Description |
|---|---|
| `Chess` | Main game class |
| `InvalidMoveError` | Error for illegal moves |
| `InvalidFENError` | Error for bad FEN/JSON |
| `variants` | Object map of all built-in variants |
| `STANDARD` | Standard variant config object |
| `FOUR_PLAYER` | 4-player variant config object |
| `resolveVariant(input)` | Normalize a variant string/object to a config |
| `variantId(variant)` | Get canonical ID string from a variant config |
| `Board` | Low-level board class (advanced) |
| `Pieces` | Piece type constants: `EMPTY PAWN KNIGHT BISHOP ROOK QUEEN KING` |
| `GameState` | Low-level game state class (advanced) |
| `getLegalMoves(board, state)` | Returns a `MoveList` of legal moves |
| `makeMove / unmakeMove` | Low-level move execution / undo |
| `computeHash(board, state)` | Zobrist hash as `BigInt` |
| `exportFEN / parseFEN` | FEN serialization |
| `moveToSAN / sanToMove` | SAN conversion |
| `parsePGN / exportPGN` | PGN serialization |

