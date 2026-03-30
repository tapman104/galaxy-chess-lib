import { Board, Pieces } from '../core/board.js';
import { GameState } from '../state/gameState.js';
import { getLegalMoves, inCheck } from '../core/legality.js';
import { makeMove, unmakeMove } from '../core/makeMove.js';
import { computeHash } from '../core/zobrist.js';
import { parseFEN, exportFEN } from '../io/fen.js';
import { moveToSAN, sanToMove } from './san.js';
import { parsePGN, exportPGN } from './pgn.js';
import { InvalidMoveError, InvalidFENError } from './errors.js';

export class Chess {
  constructor(fen) {
    this._board = new Board();
    this._state = new GameState();
    this._history = []; // {moveInt, undo, san, hash}
    this._positionCounts = new Map(); // hash -> count
    this._headers = {};

    if (fen) this.load(fen);
    else this.reset();
  }

  reset() {
    this._board.setup();
    this._state = new GameState();
    this._history = [];
    this._positionCounts.clear();
    this._updateHash();
  }

  load(fen) {
    try {
      const { board, state } = parseFEN(fen);
      this._board = board;
      this._state = state;
      this._history = [];
      this._positionCounts.clear();
      this._updateHash();
    } catch (e) {
      throw new InvalidFENError(e.message);
    }
  }

  fen() {
    return exportFEN(this._board, this._state);
  }

  clone() {
    const next = new Chess();
    next._board = this._board.clone();
    next._state = this._state.clone();
    next._history = [...this._history];
    next._positionCounts = new Map(this._positionCounts);
    next._headers = { ...this._headers };
    return next;
  }

  // ═══════════════════════════════════════════════════════════════════
  // MOVES
  // ═══════════════════════════════════════════════════════════════════

  moves(options = {}) {
    const legal = getLegalMoves(this._board, this._state);
    const results = [];

    for (let i = 0; i < legal.count; i++) {
      const m = legal.moves[i];
      if (options.square) {
        const from = m & 0x3F;
        if (Board.indexToAlgebraic(from) !== options.square) continue;
      }

      const san = moveToSAN(this._board, this._state, m);
      if (options.verbose) {
        results.push(this._makeMoveObject(m, san));
      } else {
        results.push(san);
      }
    }
    return results;
  }

  move(moveInput) {
    let moveInt = 0;
    let san = '';

    const legal = getLegalMoves(this._board, this._state);

    if (typeof moveInput === 'string') {
      // 1. SAN Parsing
      const coords = sanToMove(this._board, this._state, moveInput);
      moveInt = this._resolvePackedMove(coords, legal);
      san = moveInput; // Use provided SAN if it's already SAN
    } else {
      // 2. Coords Parsing
      moveInt = this._resolvePackedMove(moveInput, legal);
    }

    if (!moveInt) throw new InvalidMoveError(`Invalid move: ${JSON.stringify(moveInput)}`);
    
    // 1. Generate SAN and Move Object BEFORE making the move
    // because they need the current board state (who is at 'from', etc.)
    san = moveToSAN(this._board, this._state, moveInt);
    const moveObj = this._makeMoveObject(moveInt, san);

    const undo = makeMove(this._board, this._state, moveInt);
    const hash = computeHash(this._board, this._state);

    this._history.push({ moveInt, undo, san, hash });
    this._incHash(hash);

    return moveObj;
  }

  undo() {
    const last = this._history.pop();
    if (!last) return null;

    this._decHash(last.hash);
    unmakeMove(this._board, this._state, last.moveInt, last.undo);
    return this._makeMoveObject(last.moveInt, last.san);
  }

  // ═══════════════════════════════════════════════════════════════════
  // STATUS
  // ═══════════════════════════════════════════════════════════════════

  turn() { return this._state.turn === 'white' ? 'w' : 'b'; }

  inCheck() { return inCheck(this._board, this._state); }

  inCheckmate() {
    return this.inCheck() && getLegalMoves(this._board, this._state).count === 0;
  }

  inStalemate() {
    return !this.inCheck() && getLegalMoves(this._board, this._state).count === 0;
  }

  inThreefoldRepetition() {
    const currentHash = computeHash(this._board, this._state);
    return (this._positionCounts.get(currentHash) || 0) >= 3;
  }

  insufficientMaterial() {
    const w = Array.from(this._board.getPieces('white'));
    const b = Array.from(this._board.getPieces('black'));
    const total = w.length + b.length;

    // K vs K
    if (total === 2) return true;

    // K vs K + B or K vs K + N
    if (total === 3) {
      const extra = w.concat(b).find(idx => Board.type(this._board.getByIndex(idx)) !== 6);
      const type = Board.type(this._board.getByIndex(extra));
      if (type === Pieces.WHITE_KNIGHT || type === Pieces.WHITE_BISHOP) return true;
    }

    // K + B vs K + B (same color)
    if (total === 4) {
      if (w.length === 2 && b.length === 2) {
        const wb = w.find(idx => Board.type(this._board.getByIndex(idx)) === Pieces.WHITE_BISHOP);
        const bb = b.find(idx => Board.type(this._board.getByIndex(idx)) === Pieces.WHITE_BISHOP);
        if (wb && bb) {
          const color1 = (wb & 7 + (wb >> 3)) % 2; // Actually (file + rank) % 2
          const color2 = (Board.file(bb) + Board.rank(bb)) % 2;
          const color1_real = ( (wb & 7) + (wb >> 3) ) % 2;
          const color2_real = ( (bb & 7) + (bb >> 3) ) % 2;
          if (color1_real === color2_real) return true;
        }
      }
    }
    return false;
  }

  inDraw() {
    return (
      this._state.halfmoveClock >= 100 ||
      this.inStalemate() ||
      this.insufficientMaterial() ||
      this.inThreefoldRepetition()
    );
  }

  isGameOver() {
    return this.inCheckmate() || this.inDraw();
  }

  // ═══════════════════════════════════════════════════════════════════
  // IO
  // ═══════════════════════════════════════════════════════════════════

  get(square) {
    const piece = this._board.get(square);
    if (!piece) return null;
    const typeChar = this._typeToChar(Board.type(piece));
    return { type: typeChar, color: piece > 0 ? 'w' : 'b' };
  }

  history(options = {}) {
    if (options.verbose) {
      // Reconstruct historical states? No, we just have SAN. 
      // But we can track move objects in history directly.
      return this._history.map(h => this._makeMoveObject(h.moveInt, h.san));
    }
    return this._history.map(h => h.san);
  }

  ascii() { return this._board.toString(); }

  pgn(options = {}) {
    const historyObjs = this._history.map(h => ({ san: h.san, color: '?' }));
    return exportPGN(historyObjs, this._headers);
  }

  loadPgn(pgn) {
    const { headers, moves } = parsePGN(pgn);
    this.reset();
    this._headers = headers;
    for (const m of moves) {
      this.move(m);
    }
  }

  // ═══════════════════════════════════════════════════════════════════
  // HELPERS
  // ═══════════════════════════════════════════════════════════════════

  _updateHash() {
    const hash = computeHash(this._board, this._state);
    this._positionCounts.set(hash, 1);
  }

  _incHash(hash) {
    this._positionCounts.set(hash, (this._positionCounts.get(hash) || 0) + 1);
  }

  _decHash(hash) {
    const count = this._positionCounts.get(hash);
    if (count === 1) this._positionCounts.delete(hash);
    else this._positionCounts.set(hash, count - 1);
  }

  _resolvePackedMove(input, legal) {
    const from = Board.algebraicToIndex(input.from);
    const to = Board.algebraicToIndex(input.to);
    const promo = input.promotion ? this._charToPromo(input.promotion) : 0;

    for (let i = 0; i < legal.count; i++) {
        const m = legal.moves[i];
        if ((m & 0x3F) === from && ((m >>> 6) & 0x3F) === to) {
            // Check promotion
            const mPromo = (m >>> 16) & 0x07;
            if (promo && mPromo !== promo) continue;
            // If move requires promo but none given, default to Queen if it's a legal Queen promo
            if (!promo && (mPromo === Pieces.WHITE_QUEEN)) return m;
            return m;
        }
    }
    return 0;
  }

  _makeMoveObject(moveInt, san) {
    const from = moveInt & 0x3F;
    const to = (moveInt >>> 6) & 0x3F;
    const flag = (moveInt >>> 12) & 0x0F;
    const promo = (moveInt >>> 16) & 0x07;
    const piece = this._board.getByIndex(from);
    
    let captured = undefined;
    if (flag === 4 || flag === 12) { // CAPTURE or PROMO_CAPTURE
      const target = this._board.getByIndex(to);
      captured = this._typeToChar(Board.type(target));
    } else if (flag === 5) { // EP
      captured = 'p';
    }
    
    return {
      from: Board.indexToAlgebraic(from),
      to: Board.indexToAlgebraic(to),
      piece: this._typeToChar(Board.type(piece)),
      captured,
      promotion: promo ? this._typeToChar(promo) : undefined,
      flags: this._getFlagChar(flag),
      san: san,
      color: piece > 0 ? 'w' : 'b'
    };
  }

  _typeToChar(type) {
    const map = { [Pieces.WHITE_PAWN]: 'p', [Pieces.WHITE_KNIGHT]: 'n', [Pieces.WHITE_BISHOP]: 'b', [Pieces.WHITE_ROOK]: 'r', [Pieces.WHITE_QUEEN]: 'q', [Pieces.WHITE_KING]: 'k' };
    return map[type] || '';
  }

  _charToPromo(char) {
    const map = { n: Pieces.WHITE_KNIGHT, b: Pieces.WHITE_BISHOP, r: Pieces.WHITE_ROOK, q: Pieces.WHITE_QUEEN };
    return map[char.toLowerCase()] || 0;
  }

  _getFlagChar(f) {
    // matches chess.js flag convention: 
    // n=normal, b=big pawn, k=k-castle, q=q-castle, c=capture, e=ep, p=promo, m=promo-capture
    if (f === 0) return 'n'; // QUIET
    if (f === 1) return 'b'; // DOUBLE_PUSH
    if (f === 2) return 'k'; // CASTLE_K
    if (f === 3) return 'q'; // CASTLE_Q
    if (f === 4) return 'c'; // CAPTURE
    if (f === 5) return 'e'; // EP_CAPTURE
    if (f === 8) return 'p'; // PROMO
    if (f === 12) return 'm'; // PROMO_CAPTURE
    return 'n';
  }
}
