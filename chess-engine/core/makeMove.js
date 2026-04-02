import { Board, Pieces, getType, getColor, getPiece } from './board.js';
import { FLAGS, moveFrom, moveTo, moveFlag, movePromo } from './moveGen.js';
import { FOUR_PLAYER_CASTLE } from './variants.js';

/**
 * Executes a move on the board and updates game state.
 * Returns UndoData for unmakeMove.
 */
export function makeMove(board, state, move) {
  const from  = moveFrom(move);
  const to    = moveTo(move);
  const flag  = moveFlag(move);
  const promo = movePromo(move);

  const piece    = board.getByIndex(from);
  const type     = getType(piece);
  const color    = getColor(piece);
  let captured = board.getByIndex(to);
  const variant  = board.variant;

  // 1. RECORD UNDO DATA
  const undo = {
    captured: Pieces.EMPTY,
    turn: state.turn,
    castling: state.castling.map(c => ({ ...c })),
    epSquare: state.epSquare,
    playerStatus: [...state.playerStatus],
    halfmoveClock: state.halfmoveClock,
    fullmoveNumber: state.fullmoveNumber,
    eliminatedAtOnce: null, // square indices of pieces removed by elimination
  };

  // 2. UPDATE STATE CLOCKS & EP
  state.epSquare = null;
  if (type === Pieces.PAWN || captured !== Pieces.EMPTY) {
    state.halfmoveClock = 0;
  } else {
    state.halfmoveClock++;
  }

  // 3. PHYSICAL MOVE
  board.removeByIndex(from);

  if (flag === FLAGS.EP_CAPTURE) {
    const forward = variant.pawnForward[color];
    const victimIdx = to - forward;
    captured = board.getByIndex(victimIdx);
    board.removeByIndex(victimIdx);
    board.setByIndex(to, piece);
  } else if (flag >= FLAGS.PROMO) {
    board.setByIndex(to, getPiece(color, promo));
  } else {
    board.setByIndex(to, piece);
  }
  undo.captured = captured;

  // 4. CASTLING: Physical Rook movement
  if (flag === FLAGS.CASTLE_K || flag === FLAGS.CASTLE_Q) {
    handleCastlingPhysical(board, color, flag);
  }

  // 5. UPDATE SPECIAL STATE
  if (flag === FLAGS.DOUBLE_PUSH) {
    const forward = variant.pawnForward[color];
    state.epSquare = from + forward;
  }

  // CASTLING RIGHTS
  updateCastlingRights(state, from, to, variant, color, type);

  // 6. ELIMINATION (Capture King)
  if (captured !== Pieces.EMPTY && getType(captured) === Pieces.KING) {
    const victimColor = getColor(captured);
    state.eliminatePlayer(victimColor);
    undo.eliminatedAtOnce = poofPieces(board, victimColor);
  }

  // 7. NEXT TURN
  state.nextTurn();

  return undo;
}

function handleCastlingPhysical(board, color, flag) {
  if (board.variant.name === 'standard') {
    if (color === 0) { // White
      if (flag === FLAGS.CASTLE_K) { board.removeByIndex(7); board.setByIndex(5, getPiece(0, Pieces.ROOK)); }
      else { board.removeByIndex(0); board.setByIndex(3, getPiece(0, Pieces.ROOK)); }
    } else { // Black (Color 1)
      if (flag === FLAGS.CASTLE_K) { board.removeByIndex(63); board.setByIndex(61, getPiece(1, Pieces.ROOK)); }
      else { board.removeByIndex(56); board.setByIndex(59, getPiece(1, Pieces.ROOK)); }
    }
  } else if (board.variant.name === '4player') {
    const cfg = FOUR_PLAYER_CASTLE[color];
    if (flag === FLAGS.CASTLE_K) {
      board.removeByIndex(cfg.rK);
      board.setByIndex(cfg.rKTo, getPiece(color, Pieces.ROOK));
    } else {
      board.removeByIndex(cfg.rQ);
      board.setByIndex(cfg.rQTo, getPiece(color, Pieces.ROOK));
    }
  }
}

function updateCastlingRights(state, from, to, variant, color, type) {
  if (variant.name === 'standard') {
    if (type === Pieces.KING) {
      state.castling[color].kingside = false;
      state.castling[color].queenside = false;
    }
    const rookSquares = { 0: [0, 7], 1: [56, 63] };
    for (const cIdxStr in rookSquares) {
      const cIdx = parseInt(cIdxStr);
      const [qRook, kRook] = rookSquares[cIdx];
      if (from === qRook || to === qRook) state.castling[cIdx].queenside = false;
      if (from === kRook || to === kRook) state.castling[cIdx].kingside = false;
    }
  } else if (variant.name === '4player') {
    if (type === Pieces.KING) {
      state.castling[color].kingside = false;
      state.castling[color].queenside = false;
    }
    for (let cIdx = 0; cIdx < FOUR_PLAYER_CASTLE.length; cIdx++) {
      const cfg = FOUR_PLAYER_CASTLE[cIdx];
      if (from === cfg.rQ || to === cfg.rQ) state.castling[cIdx].queenside = false;
      if (from === cfg.rK || to === cfg.rK) state.castling[cIdx].kingside = false;
    }
  }
}

export function poofPieces(board, colorIndex) {
  const pieces = [];
  for (const idx of [...board.getPieces(colorIndex)]) {
    pieces.push({ idx, piece: board.getByIndex(idx) });
    board.removeByIndex(idx);
  }
  return pieces;
}

export function unmakeMove(board, state, move, undo) {
  const from = moveFrom(move);
  const to   = moveTo(move);
  const flag = moveFlag(move);

  // 1. REVERT STATE
  state.playerStatus   = [...undo.playerStatus];
  state.castling       = undo.castling.map(c => ({ ...c }));
  state.epSquare       = undo.epSquare;
  state.halfmoveClock  = undo.halfmoveClock;
  state.fullmoveNumber = undo.fullmoveNumber;
  state.turn           = undo.turn;

  // 2. REVERT ELIMINATION
  if (undo.eliminatedAtOnce) {
    for (const { idx, piece } of undo.eliminatedAtOnce) {
      board.setByIndex(idx, piece);
    }
  }

  // 3. REVERT PIECE MOVE
  const piece = board.getByIndex(to);
  const color = getColor(piece);
  
  board.removeByIndex(to);
  board.setByIndex(from, piece);

  if (flag >= FLAGS.PROMO) {
    board.setByIndex(from, getPiece(color, Pieces.PAWN));
  }

  // 4. REVERT CAPTURE
  if (flag === FLAGS.EP_CAPTURE) {
    const forward = board.variant.pawnForward[color];
    const victimIdx = to - forward;
    board.setByIndex(victimIdx, undo.captured);
  } else if (undo.captured !== Pieces.EMPTY) {
    board.setByIndex(to, undo.captured);
  }

  // 5. REVERT CASTLING
  if (flag === FLAGS.CASTLE_K || flag === FLAGS.CASTLE_Q) {
    revertCastlingPhysical(board, color, flag);
  }
}

function revertCastlingPhysical(board, color, flag) {
  if (board.variant.name === 'standard') {
    if (color === 0) {
      if (flag === FLAGS.CASTLE_K) { board.removeByIndex(5); board.setByIndex(7, getPiece(0, Pieces.ROOK)); }
      else { board.removeByIndex(3); board.setByIndex(0, getPiece(0, Pieces.ROOK)); }
    } else { // Black (Color 1)
      if (flag === FLAGS.CASTLE_K) { board.removeByIndex(61); board.setByIndex(63, getPiece(1, Pieces.ROOK)); }
      else { board.removeByIndex(59); board.setByIndex(56, getPiece(1, Pieces.ROOK)); }
    }
  } else if (board.variant.name === '4player') {
    const cfg = FOUR_PLAYER_CASTLE[color];
    if (flag === FLAGS.CASTLE_K) {
      board.removeByIndex(cfg.rKTo);
      board.setByIndex(cfg.rK, getPiece(color, Pieces.ROOK));
    } else {
      board.removeByIndex(cfg.rQTo);
      board.setByIndex(cfg.rQ, getPiece(color, Pieces.ROOK));
    }
  }
}
