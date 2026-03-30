import { Pieces, Board } from './board.js';
import { MoveList, generateMoves, isCastle } from './moveGen.js';
import { makeMove, unmakeMove } from './makeMove.js';
import { isSquareAttacked } from './attackMap.js';

/**
 * Filter all pseudo-legal moves for the current side to move.
 *
 * @param {Board} board
 * @param {GameState} state
 * @returns {MoveList}
 */
export function getLegalMoves(board, state) {
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
export function isMoveLegal(board, state, move) {
  const color = state.turn;
  const enemy = color === 'white' ? 'black' : 'white';

  // 1. CASTLING SPECIAL CHECK
  // moveGen already checked if squares are empty. 
  // Legality must check if from, pass-through, and to squares are attacked.
  if (isCastle(move)) {
    const kingIdx = color === 'white' ? 4 : 60;
    // Cannot castle if currently in check
    if (isSquareAttacked(board, kingIdx, enemy)) return false;

    // Cannot castle if pass-through square is attacked
    const to = (move >>> 6) & 0x3F;
    const kingsideTo = color === 'white' ? 6 : 62;
    const queensideTo = color === 'white' ? 2 : 58;

    if (to === kingsideTo) { // Kingside
      if (isSquareAttacked(board, kingIdx + 1, enemy)) return false;
    } else if (to === queensideTo) { // Queenside
      if (isSquareAttacked(board, kingIdx - 1, enemy)) return false;
    }
  }

  // 2. MAKE/UNMAKE CHECK
  const undo = makeMove(board, state, move);
  const kingIdx = findKing(board, color);
  
  // After makeMove, turn has flipped, so 'color' is no longer state.turn.
  const inCheck = isSquareAttacked(board, kingIdx, enemy);
  
  unmakeMove(board, state, move, undo);

  return !inCheck;
}

/**
 * Helper: Find the king's square for a given color.
 */
export function findKing(board, color) {
  const kingType = Pieces.WHITE_KING; // type is absolute 6
  for (const idx of board.getPieces(color)) {
    if (Board.type(board.getByIndex(idx)) === kingType) return idx;
  }
  return -1;
}

/**
 * Helper: Check if current side is in check.
 */
export function inCheck(board, state) {
  const kingIdx = findKing(board, state.turn);
  const enemy = state.turn === 'white' ? 'black' : 'white';
  return isSquareAttacked(board, kingIdx, enemy);
}
