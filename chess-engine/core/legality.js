import { Board, Pieces, getType, getColor } from './board.js';
import { MoveList, generateMoves, isCastle, moveTo } from './moveGen.js';
import { makeMove, unmakeMove } from './makeMove.js';
import { isSquareAttacked, isKingInCheck } from './attackMap.js';

/**
 * Filter all pseudo-legal moves for the current side to move.
 */
export function getLegalMoves(board, state, playerIndex = state.turn) {
  const pseudoList = new MoveList();
  generateMoves(board, state, pseudoList, playerIndex);

  const legalList = new MoveList();
  for (let i = 0; i < pseudoList.count; i++) {
    const move = pseudoList.moves[i];
    if (isMoveLegal(board, state, move, playerIndex)) {
      legalList.push(move);
    }
  }
  return legalList;
}

/**
 * Validates if a pseudo-legal move is fully legal (doesn't leave king in check).
 * Also handles specific castling legality (cannot castle through check).
 */
export function isMoveLegal(board, state, move, playerIndex = state.turn) {
  const color = playerIndex;

  // 1. CASTLING SPECIAL CHECK
  if (isCastle(move)) {
    const kingIdx = findKing(board, color);
    if (kingIdx === -1) return false;

    // Cannot castle if currently in check from ANY enemy
    if (isKingInCheck(board, color)) return false;

    // Cannot castle if pass-through square is attacked
    const to = moveTo(move);
    const step = board.rank(to) === board.rank(kingIdx)
      ? (board.file(to) > board.file(kingIdx) ? 1 : -1)
      : (board.rank(to) > board.rank(kingIdx) ? board.width : -board.width);
    
    // Check square between King and Target
    const mid = kingIdx + step;
    for (let c = 0; c < board.variant.numPlayers; c++) {
      if (c === color) continue;
      if (isSquareAttacked(board, mid, c)) return false;
      // Also check target square (though makeMove check covers this, standard convention includes it)
      if (isSquareAttacked(board, to, c)) return false;
    }
  }

  // 2. MAKE/UNMAKE CHECK
  const undo = makeMove(board, state, move);
  
  // After makeMove, state.turn has moved to the next player.
  // We need to check if the player who JUST moved is in check.
  const inCheckAfter = isKingInCheck(board, color);
  
  unmakeMove(board, state, move, undo);

  return !inCheckAfter;
}

/**
 * Helper: Find the king's square for a given color.
 */
export function findKing(board, colorIndex) {
  for (const idx of board.getPieces(colorIndex)) {
    const p = board.getByIndex(idx);
    if (getType(p) === Pieces.KING) return idx;
  }
  return -1;
}

/**
 * Helper: Check if current side is in check.
 */
export function inCheck(board, state, playerIndex = state.turn) {
  return isKingInCheck(board, playerIndex);
}

