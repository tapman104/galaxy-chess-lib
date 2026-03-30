import { Pieces, Board } from './board.js';
import { FLAGS, moveFrom, moveTo, moveFlag, movePromo } from './moveGen.js';

/**
 * Executes a move on the board and updates game state.
 * Returns UndoData for unmakeMove.
 *
 * @param {Board} board
 * @param {GameState} state
 * @param {number} move — 32-bit encoded move
 * @returns {object} undoData
 */
export function makeMove(board, state, move) {
  const from  = moveFrom(move);
  const to    = moveTo(move);
  const flag  = moveFlag(move);
  const promo = movePromo(move);

  const piece   = board.getByIndex(from);
  const type    = Board.type(piece);
  const isWhite = piece > 0;
  const color   = isWhite ? 'white' : 'black';
  const enemy   = isWhite ? 'black' : 'white';

  const captured = board.getByIndex(to);

  // ═══════════════════════════════════════════════════════════════════
  // 1. RECORD UNDO DATA
  // ═══════════════════════════════════════════════════════════════════
  const undo = {
    captured,
    castling: { ...state.castling },
    epSquare: state.epSquare,
    halfmoveClock: state.halfmoveClock,
    fullmoveNumber: state.fullmoveNumber,
  };

  // ═══════════════════════════════════════════════════════════════════
  // 2. UPDATE STATE CLOCKS & EP
  // ═══════════════════════════════════════════════════════════════════
  state.epSquare = null; // defaultly clear, set if double push

  // Halfmove clock resets on pawn moves or captures
  if (type === Pieces.WHITE_PAWN || captured !== Pieces.EMPTY) {
    state.halfmoveClock = 0;
  } else {
    state.halfmoveClock++;
  }

  // ═══════════════════════════════════════════════════════════════════
  // 3. PHYSICAL MOVE
  // ═══════════════════════════════════════════════════════════════════
  board.removeByIndex(from);

  if (flag === FLAGS.EP_CAPTURE) {
    // EN PASSANT: Removal of the pawn behind the target square
    const victimIdx = isWhite ? (to - 8) : (to + 8);
    board.removeByIndex(victimIdx);
    board.setByIndex(to, piece);
  } else if (flag >= FLAGS.PROMO) {
    // PROMOTION: Replace pawn with the selected piece
    const promoPiece = isWhite ? promo : -promo;
    board.setByIndex(to, promoPiece);
  } else {
    // NORMAL: quiet or standard capture
    board.setByIndex(to, piece);
  }

  // ═══════════════════════════════════════════════════════════════════
  // 4. CASTLING: Physical Rook movement
  // ═══════════════════════════════════════════════════════════════════
  if (flag === FLAGS.CASTLE_K) {
    if (isWhite) { // e1 to g1 (4 to 6), h1 to f1 (7 to 5)
      board.removeByIndex(7);
      board.setByIndex(5, Pieces.WHITE_ROOK);
    } else { // e8 to g8 (60 to 62), h8 to f8 (63 to 61)
      board.removeByIndex(63);
      board.setByIndex(61, Pieces.BLACK_ROOK);
    }
  } else if (flag === FLAGS.CASTLE_Q) {
    if (isWhite) { // e1 to c1 (4 to 2), a1 to d1 (0 to 3)
      board.removeByIndex(0);
      board.setByIndex(3, Pieces.WHITE_ROOK);
    } else { // e8 to c8 (60 to 58), a8 to d8 (56 to 59)
      board.removeByIndex(56);
      board.setByIndex(59, Pieces.BLACK_ROOK);
    }
  }

  // ═══════════════════════════════════════════════════════════════════
  // 5. UPDATE SPECIAL STATE
  // ═══════════════════════════════════════════════════════════════════
  if (flag === FLAGS.DOUBLE_PUSH) {
    state.epSquare = isWhite ? (from + 8) : (from - 8);
  }

  // CASTLING RIGHTS: Update if King or Rook move/captured
  const isKing = type === 6; // Board.type(piece) returns abs value
  if (isKing) {
    if (isWhite) { state.castling.K = false; state.castling.Q = false; }
    else { state.castling.k = false; state.castling.q = false; }
  }

  // If a move starts OR ends on a rook square, that wing loses rights.
  // Rook squares: a1=0, h1=7, a8=56, h8=63
  if (from === 0 || to === 0)   state.castling.Q = false;
  if (from === 7 || to === 7)   state.castling.K = false;
  if (from === 56 || to === 56) state.castling.q = false;
  if (from === 63 || to === 63) state.castling.k = false;

  // ═══════════════════════════════════════════════════════════════════
  // 6. NEXT TURN
  // ═══════════════════════════════════════════════════════════════════
  state.nextTurn();

  return undo;
}

/**
 * Reverses a move.
 *
 * @param {Board} board
 * @param {GameState} state
 * @param {number} move
 * @param {object} undo
 */
export function unmakeMove(board, state, move, undo) {
  const from  = moveFrom(move);
  const to    = moveTo(move);
  const flag  = moveFlag(move);

  // 1. REVERT TURN
  const isWhiteMove = state.turn === 'black'; // was white's move if now black
  state.turn = isWhiteMove ? 'white' : 'black';

  // 2. REVERT PIECE MOVE
  let piece = board.getByIndex(to);
  
  // If it was a promotion, revert back to pawn
  if (flag >= FLAGS.PROMO) {
    piece = isWhiteMove ? Pieces.WHITE_PAWN : Pieces.BLACK_PAWN;
  }

  board.removeByIndex(to);
  board.setByIndex(from, piece);

  // 3. REVERT CAPTURE
  if (flag === FLAGS.EP_CAPTURE) {
    const victimIdx = isWhiteMove ? (to - 8) : (to + 8);
    const victimPawn = isWhiteMove ? Pieces.BLACK_PAWN : Pieces.WHITE_PAWN;
    board.setByIndex(victimIdx, victimPawn);
  } else if (undo.captured !== Pieces.EMPTY) {
    board.setByIndex(to, undo.captured);
  }

  // 4. REVERT CASTLING ROOK
  if (flag === FLAGS.CASTLE_K) {
    if (isWhiteMove) { // g1 to e1, f1 to h1
      board.removeByIndex(5);
      board.setByIndex(7, Pieces.WHITE_ROOK);
    } else { // g8 to e8, f8 to h8
      board.removeByIndex(61);
      board.setByIndex(63, Pieces.BLACK_ROOK);
    }
  } else if (flag === FLAGS.CASTLE_Q) {
    if (isWhiteMove) { // c1 to e1, d1 to a1
      board.removeByIndex(3);
      board.setByIndex(0, Pieces.WHITE_ROOK);
    } else { // c8 to e8, d8 to a8
      board.removeByIndex(59);
      board.setByIndex(56, Pieces.BLACK_ROOK);
    }
  }

  // 5. RESTORE STATE
  state.castling      = undo.castling;
  state.epSquare      = undo.epSquare;
  state.halfmoveClock = undo.halfmoveClock;
  state.fullmoveNumber = undo.fullmoveNumber;
}
