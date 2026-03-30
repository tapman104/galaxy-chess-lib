import { Pieces, Board } from '../core/board.js';
import { GameState } from '../state/gameState.js';

const PIECE_TO_CHAR = {
  [Pieces.WHITE_PAWN]:   'P', [Pieces.WHITE_KNIGHT]: 'N', [Pieces.WHITE_BISHOP]: 'B',
  [Pieces.WHITE_ROOK]:   'R', [Pieces.WHITE_QUEEN]:  'Q', [Pieces.WHITE_KING]:   'K',
  [Pieces.BLACK_PAWN]:   'p', [Pieces.BLACK_KNIGHT]: 'n', [Pieces.BLACK_BISHOP]: 'b',
  [Pieces.BLACK_ROOK]:   'r', [Pieces.BLACK_QUEEN]:  'q', [Pieces.BLACK_KING]:   'k',
};

const CHAR_TO_PIECE = Object.fromEntries(
  Object.entries(PIECE_TO_CHAR).map(([k, v]) => [v, parseInt(k)])
);

/**
 * Generate FEN string from current board and game state.
 *
 * @param {Board} board
 * @param {GameState} state
 * @returns {string}
 */
export function exportFEN(board, state) {
  const rows = [];
  for (let r = 7; r >= 0; r--) {
    let row = '';
    let empty = 0;
    for (let f = 0; f < 8; f++) {
      const p = board.getByIndex(f + (r << 3));
      if (p === Pieces.EMPTY) {
        empty++;
      } else {
        if (empty > 0) { row += empty; empty = 0; }
        row += PIECE_TO_CHAR[p];
      }
    }
    if (empty > 0) row += empty;
    rows.push(row);
  }

  const parts = [
    rows.join('/'),
    state.turn === 'white' ? 'w' : 'b',
    getCastlingStr(state.castling),
    state.epSquare === null ? '-' : Board.indexToAlgebraic(state.epSquare),
    state.halfmoveClock,
    state.fullmoveNumber
  ];

  return parts.join(' ');
}

/**
 * Parse a FEN string and return Board and GameState objects.
 *
 * @param {string} fen
 * @returns {{ board: Board, state: GameState }}
 */
export function parseFEN(fen) {
  const parts = fen.trim().split(/\s+/);
  if (parts.length < 4) throw new Error('Invalid FEN: insufficient parts');

  const [pos, turn, castling, ep, halfmove = '0', fullmove = '1'] = parts;

  // 1. Board Position
  const board = new Board();
  const rows = pos.split('/');
  if (rows.length !== 8) throw new Error('Invalid FEN pos: must have 8 rows');

  for (let r = 0; r < 8; r++) {
    const rank = 7 - r;
    let file = 0;
    for (const char of rows[r]) {
      if (/\d/.test(char)) {
        file += parseInt(char);
      } else {
        const piece = CHAR_TO_PIECE[char];
        if (!piece) throw new Error(`Invalid FEN piece: ${char}`);
        board.setByIndex(file + (rank << 3), piece);
        file++;
      }
    }
  }

  // 2. Game State
  const state = new GameState();
  state.turn = turn === 'w' ? 'white' : 'black';

  state.castling = {
    K: castling.includes('K'),
    Q: castling.includes('Q'),
    k: castling.includes('k'),
    q: castling.includes('q'),
  };

  state.epSquare = ep === '-' ? null : Board.algebraicToIndex(ep);
  state.halfmoveClock = parseInt(halfmove);
  state.fullmoveNumber = parseInt(fullmove);

  return { board, state };
}

function getCastlingStr(c) {
  let s = '';
  if (c.K) s += 'K';
  if (c.Q) s += 'Q';
  if (c.k) s += 'k';
  if (c.q) s += 'q';
  return s === '' ? '-' : s;
}
