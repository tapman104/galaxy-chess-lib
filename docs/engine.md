# Engine Integration Guide

Vortex provides an asynchronous engine adapter framework for analyzing positions and finding best moves.

## Architecture

The core `Chess` class remains purely synchronous and rules-focused. Engine logic is handled by external `EngineAdapter` implementations that communicate with engine backends (like Stockfish via Web Workers).

## Installation

The `vortex-chess` library does not bundle the Stockfish engine. You must provide your own Stockfish WASM worker script. 

Common sources:
- `stockfish.js` npm package
- [Stockfish.js GitHub](https://github.com/nmrugg/stockfish.js/)

## Usage Example

```javascript
import { Chess, StockfishAdapter, UnsupportedVariantError } from 'vortex-chess';

// 1. Initialize game and adapter
const game = new Chess();
const engine = new StockfishAdapter({
  workerPath: './stockfish-nnue-16.js',
  timeout: 15000 // Optional: defaults to 10000ms
});

try {
  // 2. Connect (Handshake: uci -> uciok -> isready -> readyok)
  await engine.connect();

  // 3. Get Best Move
  // The adapter snapshots the FEN synchronously before starting the search
  const result = await engine.getBestMove(game, { depth: 15 });

  console.log(`Best Move: ${result.bestMove}`);
  if (result.evaluation !== undefined) {
    console.log(`Evaluation: ${(result.evaluation / 100).toFixed(2)} pawns`);
  } else if (result.mate !== undefined) {
    console.log(`Mate in ${result.mate}`);
  }

} catch (err) {
  if (err instanceof UnsupportedVariantError) {
    console.error("This engine only supports standard chess.");
  } else {
    console.error("Engine error:", err.message);
  }
} finally {
  // 4. Cleanup
  await engine.disconnect();
}
```

## Behavior & Constraints

### 4-Player Variants
Stockfish (and most UCI engines) only supports standard 2-player chess. If you attempt to call `getBestMove` on a game instance using a non-standard variant (e.g., `4player@v1`), the adapter will immediately throw an `UnsupportedVariantError`.

### Lifecycle Management
- **One Adapter, Multiple Positions**: You can reuse a single `StockfishAdapter` instance for multiple `getBestMove` calls as you progress through a game.
- **Sequential Requests**: The adapter only supports one search at a time. If you call `getBestMove` while a search is already pending, it will throw an error.
- **Disconnection**: Always call `disconnect()` when you are finished with the engine to terminate the underlying Web Worker and prevent memory leaks.

### Error Handling
- **Timeouts**: If the engine fails to respond to a handshake or a search request within the configured `timeout`, the promise will reject.
- **Post-Disconnect Guards**: Any calls to `connect()` or `getBestMove()` after calling `disconnect()` will result in an error.

## API Reference

### `BestMoveOptions`
- `depth?: number`: Search depth in half-moves (defaults to 15 if neither depth nor movetime is provided).
- `movetime?: number`: Search time in milliseconds.

### `BestMoveResult`
- `bestMove: string`: SAN move (or `(none)` if no move found).
- `ponder?: string`: Expected continuation SAN move.
- `evaluation?: number`: Score in centipawns.
- `mate?: number`: Mate in N moves.
- `depth?: number`: Actual depth reached.
