import assert from 'node:assert/strict';
import { Chess, InvalidMoveError } from '../chess-engine/index.js';

const TYPES = Object.freeze({
  EMPTY: 0,
  PAWN: 1,
  KNIGHT: 2,
  BISHOP: 3,
  ROOK: 4,
  QUEEN: 5,
  KING: 6,
});

function piece(color, type) {
  return (color << 3) | type;
}

function idx(file, rank, width) {
  return rank * width + file;
}

function corePosition(chess) {
  const json = chess.toJSON();
  return {
    variant: json.variant,
    board: json.board,
    validSquares: json.validSquares,
    turn: json.turn,
    activePlayers: json.activePlayers,
    castling: json.castling,
    enPassant: json.enPassant,
    halfmoveClock: json.halfmoveClock,
    fullmoveNumber: json.fullmoveNumber,
  };
}

function assertSamePosition(a, b, label) {
  assert.deepStrictEqual(corePosition(a), corePosition(b), label);
}

function assertDeterministicJSONRoundtrip(chess, label) {
  const a = chess.toJSON();
  const b = new Chess().loadJSON(a).toJSON();
  assert.deepStrictEqual(a, b, label);
}

function emptyPayload(variant) {
  const base = new Chess({ variant }).toJSON();
  base.board = new Array(base.board.length).fill(TYPES.EMPTY);
  base.history = [];
  base.positionCounts = [];
  base.enPassant = null;
  base.halfmoveClock = 0;
  base.fullmoveNumber = 1;
  base.castling = base.castling.map(() => ({ kingside: false, queenside: false }));
  base.activePlayers = base.castling.map((_, i) => i);
  return base;
}

function buildPromotionGame() {
  const payload = emptyPayload('standard@v1');
  const w = 8;
  payload.turn = 0;
  payload.board[idx(4, 0, w)] = piece(0, TYPES.KING); // e1
  payload.board[idx(4, 7, w)] = piece(1, TYPES.KING); // e8
  payload.board[idx(0, 6, w)] = piece(0, TYPES.PAWN); // a7

  const game = new Chess().loadJSON(payload);
  const move = game.move({ from: 'a7', to: 'a8', promotion: 'q' });
  assert.equal(move.promotion, 'q', 'Promotion move did not produce queen');
  assert.deepStrictEqual(game.get('a8'), { type: 'q', color: 'w' }, 'Promotion square did not contain white queen');
  return game;
}

function buildEliminationGame() {
  const payload = emptyPayload('4player@v1');
  const w = 14;
  payload.turn = 0;

  payload.board[idx(4, 0, w)] = piece(0, TYPES.KING);   // e1 red king
  payload.board[idx(3, 3, w)] = piece(0, TYPES.ROOK);   // d4 red rook
  payload.board[idx(3, 7, w)] = piece(1, TYPES.KING);   // d8 blue king
  payload.board[idx(10, 13, w)] = piece(2, TYPES.KING); // k14 yellow king
  payload.board[idx(13, 6, w)] = piece(3, TYPES.KING);  // n7 green king

  const game = new Chess().loadJSON(payload);
  game.move({ from: 'd4', to: 'd8' });

  assert.deepStrictEqual(
    game.toJSON().activePlayers,
    [0, 2, 3],
    'Blue player should be eliminated after king capture',
  );
  return game;
}

try {
  console.log('--- Publish Gate Verification ---');

  console.log('1) Basic standard move flow...');
  const chess = new Chess();
  chess.move('e4');
  chess.move('e5');
  chess.move('Nf3');
  assert.ok(
    chess.fen().includes('rnbqkbnr/pppp1ppp/8/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R b KQkq -'),
    'FEN mismatch after opening sequence',
  );

  console.log('2) Variant alias resolution...');
  const aliasGame = new Chess({ variant: '4player' });
  const aliasVariant = aliasGame.toJSON().variant;
  assert.equal(aliasVariant, '4player@v1', '4player alias must resolve to 4player@v1');
  assert.equal(aliasGame.variant(), '4player@v1', 'variant() should return canonical variant id');

  console.log('3) board() snapshot behavior...');
  const board4 = new Chess({ variant: '4player' }).board();
  assert.equal(board4.variant, '4player@v1', 'Board snapshot must expose normalized variant id');
  assert.equal(board4.cells.length, 196, '4-player board must have 196 cells');
  assert.equal(board4.cells[0], null, 'Masked corner cells must be null');
  assert.ok(
    board4.cells.some((cell) => cell && cell.piece),
    'Board snapshot should include piece objects on occupied cells',
  );

  const rawBoard4 = new Chess({ variant: '4player' }).board({ raw: true });
  assert.equal(rawBoard4.validSquares[0], 0, 'Raw board should expose corner mask');

  console.log('4) PGN header utilities + deterministic ordering...');
  const headerGame = new Chess();
  headerGame.header('White', 'Alpha').header('Black', 'Beta').header('Event', 'Header Test');
  assert.equal(headerGame.headers().Event, 'Header Test', 'header()/headers() mismatch');

  const headerLines = headerGame.pgn().split('\n').filter((line) => line.startsWith('['));
  assert.ok(headerLines[0].startsWith('[Event "Header Test"]'), 'PGN headers should start with Event');
  assert.ok(headerLines[1].startsWith('[Site "'), 'PGN headers should keep stable ordering (Site second)');
  assert.ok(headerLines.some((line) => line.startsWith('[Variant "standard@v1"]')), 'PGN should include Variant header');

  const restoredHeaderGame = new Chess().loadJSON(headerGame.toJSON({ includeMeta: true }));
  assert.equal(
    restoredHeaderGame.headers().Event,
    'Header Test',
    'Headers should be restored from meta during loadJSON',
  );
  restoredHeaderGame.clearHeaders();
  assert.deepStrictEqual(restoredHeaderGame.headers(), {}, 'clearHeaders() should remove all headers');

  console.log('5) Error handling clarity...');
  assert.throws(
    () => new Chess({ variant: '5player' }),
    /Invalid variant: 5player/,
    'Invalid variant error message mismatch',
  );

  const invalidMoveGame = new Chess();
  assert.throws(
    () => invalidMoveGame.move('e9'),
    (err) => err instanceof InvalidMoveError && /Invalid move: e9/.test(err.message),
    'Invalid move error message mismatch',
  );

  console.log('6) Deterministic JSON roundtrip...');
  const four = new Chess({ variant: '4player' });
  ['e4', 'c7', 'e11', 'l7'].forEach((m) => four.move(m));
  assertDeterministicJSONRoundtrip(four, '4-player JSON roundtrip should be deterministic');

  const promotion = buildPromotionGame();
  assertDeterministicJSONRoundtrip(promotion, 'Promotion JSON roundtrip should be deterministic');

  const elimination = buildEliminationGame();
  assertDeterministicJSONRoundtrip(elimination, 'Elimination JSON roundtrip should be deterministic');

  const turnPayload = new Chess().toJSON();
  turnPayload.activePlayers = [0];
  turnPayload.turn = 1;
  const normalizedTurnGame = new Chess().loadJSON(turnPayload);
  assert.equal(normalizedTurnGame.turn(), 'w', 'Dead-turn loadJSON state should normalize to next alive player');

  console.log('7) PGN roundtrip (4-player)...');
  const pgn4 = four.pgn({ format: '4player' });
  const clone4 = new Chess({ variant: '4player' }).loadPgn(pgn4);
  assertSamePosition(four, clone4, '4-player PGN roundtrip must preserve position');

  console.log('8) Legacy checks (repetition/checkmate)...');
  const repsGame = new Chess();
  ['Nf3', 'Nf6', 'Ng1', 'Ng8', 'Nf3', 'Nf6', 'Ng1', 'Ng8', 'Nf3', 'Nf6', 'Ng1', 'Ng8']
    .forEach((m) => repsGame.move(m));
  assert.equal(repsGame.inThreefoldRepetition(), true, 'Threefold repetition detection failed');

  const mateGame = new Chess();
  ['f3', 'e5', 'g4', 'Qh4#'].forEach((m) => mateGame.move(m));
  assert.equal(mateGame.inCheckmate(), true, 'Failed to detect Fool\'s Mate');
  assert.equal(mateGame.isGameOver(), true, 'Game-over status mismatch after checkmate');

  console.log('\n✅ All publish-gate checks passed.');
} catch (err) {
  console.error('❌ Verification FAILED');
  console.error(err.stack || err.message);
  process.exit(1);
}
