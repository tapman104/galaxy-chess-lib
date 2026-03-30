import { Board, Pieces, getType } from '../core/board.js';
import { GameState } from '../state/gameState.js';
import { getLegalMoves, inCheck } from '../core/legality.js';
import { makeMove, unmakeMove } from '../core/makeMove.js';
import { FLAGS, moveFrom, moveTo, moveFlag, movePromo } from '../core/moveGen.js';
import { computeHash } from '../core/zobrist.js';
import { parseFEN, exportFEN } from '../io/fen.js';
import { moveToSAN, sanToMove } from './san.js';
import { parsePGN, exportPGN } from './pgn.js';
import { InvalidMoveError, InvalidFENError } from './errors.js';

import { STANDARD, FOUR_PLAYER } from '../core/variants.js';

export class Chess {
  constructor(options = {}) {
    const variant = options.variant === '4player' ? FOUR_PLAYER : STANDARD;
    this._board = new Board(variant);
    this._state = new GameState(variant);
    this._history = []; // {moveInt, undo, san, hash}
    this._positionCounts = new Map(); // hash -> count
    this._headers = {};

    if (options.fen) this.load(options.fen);
    else this.reset();
  }

  reset() {
    this._board.setup();
    this._state = new GameState(this._board.variant);
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
        const from = moveFrom(m);
        if (this._board.indexToAlgebraic(from) !== options.square) continue;
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

  turn() { 
    const map = ['w', 'b', 'l', 'g']; // white, blue, black, green (Standard Black is index 2 in our 4P order)
    // Wait, in Standard, white is 0, black is 1.
    if (this._board.variant.name === 'standard') {
        return this._state.turn === 0 ? 'w' : 'b';
    }
    return map[this._state.turn]; 
  }

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
    if (this._board.variant.name !== 'standard') return false; // Default to not draw for 4P simple check

    const w = Array.from(this._board.getPieces(0)); // White
    const b = Array.from(this._board.getPieces(2)); // Black (Standard 2P black is index 2 in our color order)
    const total = w.length + b.length;

    // K vs K
    if (total === 2) return true;

    // K vs K + B or K vs K + N
    if (total === 3) {
      const extra = w.concat(b).find(idx => getType(this._board.getByIndex(idx)) !== Pieces.KING);
      const piece = this._board.getByIndex(extra);
      const type = getType(piece);
      if (type === Pieces.KNIGHT || type === Pieces.BISHOP) return true;
    }

    // K + B vs K + B (same color)
    if (total === 4) {
      if (w.length === 2 && b.length === 2) {
        const wb = w.find(idx => getType(this._board.getByIndex(idx)) === Pieces.BISHOP);
        const bb = b.find(idx => getType(this._board.getByIndex(idx)) === Pieces.BISHOP);
        if (wb && bb) {
          const color1_real = (this._board.file(wb) + this._board.rank(wb)) % 2;
          const color2_real = (this._board.file(bb) + this._board.rank(bb)) % 2;
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
    const from = this._board.algebraicToIndex(input.from);
    const to = this._board.algebraicToIndex(input.to);
    const promo = input.promotion ? this._charToPromo(input.promotion) : 0;

    for (let i = 0; i < legal.count; i++) {
        const m = legal.moves[i];
        if (moveFrom(m) === from && moveTo(m) === to) {
            const mPromo = movePromo(m);
            if (promo && mPromo !== promo) continue;
            // Default to queen if no promo provided but move is a promo
            if (!promo && mPromo === Pieces.QUEEN) return m;
            // If it's a quiet move (mPromo=0), it matches.
            if (!promo && mPromo === 0) return m;
        }
    }
    return 0;
  }

  _makeMoveObject(moveInt, san) {
    const from = moveFrom(moveInt);
    const to = moveTo(moveInt);
    const flag = moveFlag(moveInt);
    const promo = movePromo(moveInt);
    const piece = this._board.getByIndex(from);
    
    let captured = undefined;
    if (flag === FLAGS.CAPTURE || flag === FLAGS.PROMO_CAPTURE) {
      const target = this._board.getByIndex(to);
      captured = this._typeToChar(getType(target));
    } else if (flag === FLAGS.EP_CAPTURE) {
      captured = 'p';
    }
    
    return {
      from: this._board.indexToAlgebraic(from),
      to: this._board.indexToAlgebraic(to),
      piece: this._typeToChar(getType(piece)),
      captured,
      promotion: promo ? this._typeToChar(promo) : undefined,
      flags: this._getFlagChar(flag),
      san: san,
      color: this.turn()
    };
  }

  _typeToChar(type) {
    const map = { [Pieces.PAWN]: 'p', [Pieces.KNIGHT]: 'n', [Pieces.BISHOP]: 'b', [Pieces.ROOK]: 'r', [Pieces.QUEEN]: 'q', [Pieces.KING]: 'k' };
    return map[type] || '';
  }

  _charToPromo(char) {
    const map = { n: Pieces.KNIGHT, b: Pieces.BISHOP, r: Pieces.ROOK, q: Pieces.QUEEN };
    return map[char.toLowerCase()] || 0;
  }

  _getFlagChar(f) {
    if (f === FLAGS.QUIET) return 'n';
    if (f === FLAGS.DOUBLE_PUSH) return 'b';
    if (f === FLAGS.CASTLE_K) return 'k';
    if (f === FLAGS.CASTLE_Q) return 'q';
    if (f === FLAGS.CAPTURE) return 'c';
    if (f === FLAGS.EP_CAPTURE) return 'e';
    if (f === FLAGS.PROMO) return 'p';
    if (f === FLAGS.PROMO_CAPTURE) return 'm';
    return 'n';
  }
}
