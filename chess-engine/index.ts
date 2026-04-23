/**
 * Vortex Chess Library — Main Entry Point
 */

export { Chess } from './api/chess.js';
export { Board, Pieces, getType, getColor, getPiece } from './core/board.js';
export { GameState } from './state/gameState.js';
export { 
  InvalidMoveError, 
  InvalidFENError 
} from './api/errors.js';

export * from './types.js';
export { STANDARD, FOUR_PLAYER } from './core/variants.js';
