import { Board, Pieces, getType } from './board.js';
import { MoveList, generateMoves, isCastle, moveTo } from './moveGen.js';
import { makeMove, unmakeMove } from './makeMove.js';
import { isSquareAttacked, isKingInCheck } from './attackMap.js';
import { GameState } from '../state/gameState.js';
import { Square, PieceType, Move } from '../types.js';

/**
 * Filter all pseudo-legal moves for the current side to move.
 */
export function getLegalMoves(board: Board, state: GameState): MoveList {
  const pseudoList = new MoveList();
  generateMoves(board, state, pseudoList);

  const legalList = new MoveList();
  for (let i = 0; i < pseudoList.count; i++) {
    const move = pseudoList.moves[i];
    if (isMoveLegal(board, state, move)) {
      legalList.push(move);
    }
  }
  return legalList;
}

/**
 * Validates if a pseudo-legal move is fully legal (doesn't leave king in check).
 * Also handles specific castling legality (cannot castle through check).
 */
export function isMoveLegal(board: Board, state: GameState, move: Move): boolean {
  const color = state.turn;

  // 0. In standard 2-player chess capturing the king is treated as illegal
  // (mate detection occurs instead). For multi-player variants we allow
  // king captures so players can be eliminated by direct capture.
  const targetPiece = board.getByIndex(moveTo(move));
  if (targetPiece !== PieceType.EMPTY && getType(targetPiece) === PieceType.KING && board.variant.numPlayers === 2) {
    return false;
  }

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
export function findKing(board: Board, colorIndex: number): Square | -1 {
  for (const idx of Array.from(board.getPieces(colorIndex))) {
    const p = board.getByIndex(idx);
    if (getType(p) === PieceType.KING) return idx;
  }
  return -1;
}

/**
 * Helper: Check if a specific side is in check.
 * Defaults to current side to move if colorIndex is omitted.
 */
export function inCheck(board: Board, state: GameState, colorIndex: number = state.turn): boolean {
  return isKingInCheck(board, colorIndex);
}
