// Public API Layer (The main entry point for users)
export { Chess } from './api/chess.js';
export { InvalidMoveError, InvalidFENError } from './api/errors.js';

// Core Engine Layer (Advanced usage)
export { Board, Pieces } from './core/board.js';
export { GameState } from './state/gameState.js';
export { getLegalMoves, isMoveLegal, findKing, inCheck } from './core/legality.js';
export { makeMove, unmakeMove } from './core/makeMove.js';
export { computeHash } from './core/zobrist.js';

// IO Layer
export { exportFEN, parseFEN } from './io/fen.js';
export { moveToSAN, sanToMove } from './api/san.js';
export { parsePGN, exportPGN } from './api/pgn.js';
