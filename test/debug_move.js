import { Chess } from '../chess-engine/index.js';

function piece(color, type) {
  return (color << 3) | type;
}

function idx(file, rank, width) {
  return rank * width + file;
}

function emptyPayload(variant) {
  const base = new Chess({ variant }).toJSON();
  base.board = new Array(base.board.length).fill(0);
  base.history = [];
  base.positionCounts = [];
  base.enPassant = null;
  base.halfmoveClock = 0;
  base.fullmoveNumber = 1;
  base.castling = base.castling.map(() => ({ kingside: false, queenside: false }));
  base.activePlayers = base.castling.map((_, i) => i);
  return base;
}

const TYPES = { EMPTY: 0, PAWN: 1, KNIGHT: 2, BISHOP: 3, ROOK: 4, QUEEN: 5, KING: 6 };

const payload = emptyPayload('4player@v1');
const w = 14;
payload.turn = 0;

payload.board[idx(4, 0, w)] = piece(0, TYPES.KING);   // e1 red king
payload.board[idx(3, 3, w)] = piece(0, TYPES.ROOK);   // d4 red rook
payload.board[idx(3, 7, w)] = piece(1, TYPES.KING);   // d8 blue king
payload.board[idx(10, 13, w)] = piece(2, TYPES.KING); // k14 yellow king
payload.board[idx(13, 6, w)] = piece(3, TYPES.KING);  // n7 green king

const game = new Chess().loadJSON(payload);
console.log('Turn:', game.turn());
console.log('Board snapshot for d4 neighborhood:');
const board = game.board();
['c5','d5','e5','c4','d4','e4','c3','d3','e3'].forEach((s) => console.log(s, board.cells.find(c=>c && c.square===s)?.piece || null));

console.log('\nLegal moves from d4 (SAN):');
console.log(game.moves({ square: 'd4' }));

console.log('\nLegal moves from d4 (verbose):');
console.log(game.moves({ square: 'd4', verbose: true }));

const raw = game.board({ raw: true });
const d8 = board.cells.find((c) => c && c.square === 'd8');
console.log('\nSquare d8 cell:', d8);
if (raw.squares && raw.validSquares) {
  const idxD8 = raw.squares.findIndex((_, i) => board.cells[i] && board.cells[i].square === 'd8');
  console.log('raw index for d8:', idxD8, 'valid?', raw.validSquares[idxD8]);
  console.log('raw square value (piece int):', raw.squares[idxD8]);
}
