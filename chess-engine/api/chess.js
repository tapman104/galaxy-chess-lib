import { Board, Pieces, getType, getColor } from '../core/board.js';
import { GameState } from '../state/gameState.js';
import { getLegalMoves, inCheck } from '../core/legality.js';
import { makeMove, unmakeMove } from '../core/makeMove.js';
import { FLAGS, moveFrom, moveTo, moveFlag, movePromo } from '../core/moveGen.js';
import { computeHash } from '../core/zobrist.js';
import { parseFEN, exportFEN } from '../io/fen.js';
import { moveToSAN, sanToMove } from './san.js';
import { parsePGN, exportPGN } from './pgn.js';
import { InvalidMoveError, InvalidFENError } from './errors.js';
import { resolveVariant, variantId } from '../core/variants.js';

function cloneMoveObject(move) {
  if (!move) return undefined;
  return { ...move };
}

function cloneUndo(undo) {
  if (!undo) return undefined;
  return {
    captured: undo.captured,
    turn: undo.turn,
    castling: Array.isArray(undo.castling) ? undo.castling.map((c) => ({ ...c })) : [],
    epSquare: undo.epSquare,
    playerStatus: Array.isArray(undo.playerStatus) ? [...undo.playerStatus] : [],
    halfmoveClock: undo.halfmoveClock,
    fullmoveNumber: undo.fullmoveNumber,
    eliminatedAtOnce: Array.isArray(undo.eliminatedAtOnce) ? [...undo.eliminatedAtOnce] : null,
  };
}

function serializeHistoryEntry(entry) {
  return {
    moveInt: entry.moveInt,
    san: entry.san,
    player: entry.player,
    hash: typeof entry.hash === 'bigint' ? entry.hash.toString() : entry.hash,
    move: cloneMoveObject(entry.move),
    undo: cloneUndo(entry.undo),
  };
}

function deserializeHistoryEntry(entry) {
  return {
    moveInt: entry.moveInt || 0,
    san: entry.san || '',
    player: Number.isInteger(entry.player) ? entry.player : 0,
    hash: typeof entry.hash === 'string' ? BigInt(entry.hash) : BigInt(entry.hash || 0),
    move: cloneMoveObject(entry.move),
    undo: cloneUndo(entry.undo),
  };
}

function serializePositionCounts(positionCounts) {
  return Array.from(positionCounts.entries()).map(([hash, count]) => ({
    hash: hash.toString(),
    count,
  }));
}

function deserializePositionCounts(entries) {
  const map = new Map();
  for (const row of entries || []) {
    if (!row || typeof row.hash !== 'string') continue;
    map.set(BigInt(row.hash), Number(row.count) || 0);
  }
  return map;
}

export class Chess {
  constructor(options = {}) {
    const variant = resolveVariant(options.variant || 'standard');
    this._board = new Board(variant);
    this._state = new GameState(variant);
    this._history = []; // {moveInt, undo, san, hash, player, move}
    this._positionCounts = new Map(); // hash -> count
    this._headers = {};
    this._meta = options.meta && typeof options.meta === 'object' ? { ...options.meta } : {};
    this._createdAt = this._meta.createdAt || new Date().toISOString();

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

  load(fen, options = {}) {
    try {
      const variant = options.variant ? resolveVariant(options.variant) : this._board.variant;
      const { board, state } = parseFEN(fen, variant);
      this._board = board;
      this._state = state;
      this._history = [];
      this._positionCounts.clear();
      this._updateHash();
      return this;
    } catch (e) {
      throw new InvalidFENError(e.message);
    }
  }

  loadJSON(data) {
    if (!data || typeof data !== 'object') {
      throw new InvalidFENError('Invalid JSON payload');
    }

    const variant = resolveVariant(data.variant || 'standard');
    const board = new Board(variant);
    if (!Array.isArray(data.board) || data.board.length !== board.squares.length) {
      throw new InvalidFENError(`Invalid board array for variant ${variantId(variant)}`);
    }

    board.squares = Int8Array.from(data.board);
    if (Array.isArray(data.validSquares) && data.validSquares.length === board.validSquares.length) {
      board.validSquares = Uint8Array.from(data.validSquares.map((v) => (v ? 1 : 0)));
    }

    board.pieceList = Array.from({ length: variant.numPlayers }, () => new Set());
    for (let idx = 0; idx < board.squares.length; idx++) {
      if (board.validSquares[idx] === 0) continue;
      const piece = board.getByIndex(idx);
      if (piece === Pieces.EMPTY) continue;
      const color = getColor(piece);
      if (color >= 0 && color < variant.numPlayers) {
        board.pieceList[color].add(idx);
      }
    }

    const state = new GameState(variant);
    state.turn = Number.isInteger(data.turn) ? data.turn : 0;
    state.playerStatus = new Array(variant.numPlayers).fill(false);
    if (Array.isArray(data.activePlayers)) {
      for (const playerIndex of data.activePlayers) {
        if (Number.isInteger(playerIndex) && playerIndex >= 0 && playerIndex < variant.numPlayers) {
          state.playerStatus[playerIndex] = true;
        }
      }
    } else {
      state.playerStatus.fill(true);
    }

    state.castling = Array.from({ length: variant.numPlayers }, (_, playerIndex) => {
      const row = data.castling?.[playerIndex];
      return {
        kingside: !!row?.kingside,
        queenside: !!row?.queenside,
      };
    });

    state.epSquare = Number.isInteger(data.enPassant) ? data.enPassant : null;
    state.halfmoveClock = Number(data.halfmoveClock || 0);
    state.fullmoveNumber = Number(data.fullmoveNumber || 1);

    this._board = board;
    this._state = state;
    this._history = Array.isArray(data.history) ? data.history.map(deserializeHistoryEntry) : [];

    if (Array.isArray(data.positionCounts)) {
      this._positionCounts = deserializePositionCounts(data.positionCounts);
    } else {
      this._positionCounts = new Map();
      this._updateHash();
      for (const entry of this._history) {
        this._incHash(entry.hash);
      }
    }

    if (data.meta && typeof data.meta === 'object') {
      this._meta = { ...data.meta };
      if (data.meta.createdAt) this._createdAt = data.meta.createdAt;
    }

    return this;
  }

  toJSON(options = {}) {
    const payload = {
      variant: variantId(this._board.variant),
      board: Array.from(this._board.squares),
      validSquares: Array.from(this._board.validSquares),
      turn: this._state.turn,
      activePlayers: this._state.playerStatus
        .map((alive, index) => (alive ? index : null))
        .filter((value) => value !== null),
      history: this._history.map(serializeHistoryEntry),
      castling: this._state.castling.map((c) => ({
        kingside: !!c.kingside,
        queenside: !!c.queenside,
      })),
      enPassant: this._state.epSquare,
      halfmoveClock: this._state.halfmoveClock,
      fullmoveNumber: this._state.fullmoveNumber,
      positionCounts: serializePositionCounts(this._positionCounts),
    };

    if (options.includeMeta) {
      payload.meta = this._buildMeta();
    }

    return payload;
  }

  fen() {
    return exportFEN(this._board, this._state);
  }

  clone() {
    const next = new Chess({ variant: this._board.variant });
    next._board = this._board.clone();
    next._state = this._state.clone();
    next._history = this._history.map((entry) => deserializeHistoryEntry(serializeHistoryEntry(entry)));
    next._positionCounts = new Map(this._positionCounts);
    next._headers = { ...this._headers };
    next._meta = { ...this._meta };
    next._createdAt = this._createdAt;
    return next;
  }

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
        results.push(this._makeMoveObject(m, san, this._state.turn));
      } else {
        results.push(san);
      }
    }
    return results;
  }

  move(moveInput) {
    let moveInt = 0;
    const legal = getLegalMoves(this._board, this._state);

    if (typeof moveInput === 'string') {
      const coords = sanToMove(this._board, this._state, moveInput);
      moveInt = this._resolvePackedMove(coords, legal);
    } else {
      moveInt = this._resolvePackedMove(moveInput, legal);
    }

    if (!moveInt) throw new InvalidMoveError(`Invalid move: ${JSON.stringify(moveInput)}`);

    const player = this._state.turn;
    const san = moveToSAN(this._board, this._state, moveInt);
    const moveObj = this._makeMoveObject(moveInt, san, player);

    const undo = makeMove(this._board, this._state, moveInt);
    const hash = computeHash(this._board, this._state);

    this._history.push({ moveInt, undo, san, hash, player, move: cloneMoveObject(moveObj) });
    this._incHash(hash);

    return moveObj;
  }

  undo() {
    const last = this._history.pop();
    if (!last) return null;

    this._decHash(last.hash);
    unmakeMove(this._board, this._state, last.moveInt, last.undo);
    if (last.move) return cloneMoveObject(last.move);
    return this._makeMoveObject(last.moveInt, last.san, last.player);
  }

  turn() {
    if (this._board.variant.name === 'standard') {
      return this._state.turn === 0 ? 'w' : 'b';
    }
    const map = ['r', 'b', 'y', 'g'];
    return map[this._state.turn] || `p${this._state.turn}`;
  }

  inCheck() {
    return inCheck(this._board, this._state);
  }

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
    if (this._board.variant.name !== 'standard') return false;

    const w = Array.from(this._board.getPieces(0));
    const b = Array.from(this._board.getPieces(1));
    const total = w.length + b.length;

    if (total === 2) return true;

    if (total === 3) {
      const extra = w.concat(b).find((idx) => getType(this._board.getByIndex(idx)) !== Pieces.KING);
      const piece = this._board.getByIndex(extra);
      const type = getType(piece);
      if (type === Pieces.KNIGHT || type === Pieces.BISHOP) return true;
    }

    if (total === 4) {
      if (w.length === 2 && b.length === 2) {
        const wb = w.find((idx) => getType(this._board.getByIndex(idx)) === Pieces.BISHOP);
        const bb = b.find((idx) => getType(this._board.getByIndex(idx)) === Pieces.BISHOP);
        if (wb && bb) {
          const color1 = (this._board.file(wb) + this._board.rank(wb)) % 2;
          const color2 = (this._board.file(bb) + this._board.rank(bb)) % 2;
          if (color1 === color2) return true;
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

  get(square) {
    let index;
    try {
      index = this._board.algebraicToIndex(square);
    } catch {
      return null;
    }
    const piece = this._board.getByIndex(index);
    if (!piece) return null;
    const typeChar = this._typeToChar(Board.type(piece));
    return { type: typeChar, color: this._colorToChar(getColor(piece)) };
  }

  history(options = {}) {
    if (options.verbose) {
      return this._history.map((h) => cloneMoveObject(h.move) || this._makeMoveObject(h.moveInt, h.san, h.player));
    }
    if (options.withPlayers) {
      return this._history.map((h) => ({ san: h.san, player: h.player }));
    }
    return this._history.map((h) => h.san);
  }

  ascii() {
    return this._board.toString();
  }

  board(options = {}) {
    const variant = variantId(this._board.variant);
    if (options.raw === true) {
      return {
        width: this._board.width,
        height: this._board.height,
        squares: Array.from(this._board.squares),
        validSquares: Array.from(this._board.validSquares),
        variant,
      };
    }

    const cells = new Array(this._board.squares.length);
    for (let idx = 0; idx < this._board.squares.length; idx++) {
      if (this._board.validSquares[idx] === 0) {
        cells[idx] = null;
        continue;
      }

      const piece = this._board.getByIndex(idx);
      cells[idx] = {
        square: this._board.indexToAlgebraic(idx),
        piece: piece === Pieces.EMPTY
          ? null
          : {
              type: this._typeToChar(getType(piece)),
              color: this._colorToChar(getColor(piece)),
            },
      };
    }

    return {
      width: this._board.width,
      height: this._board.height,
      variant,
      cells,
    };
  }

  pgn(options = {}) {
    const historyObjs = this._history.map((h) => ({ san: h.san, player: h.player, move: h.move }));
    const headers = { Variant: variantId(this._board.variant), ...this._headers };
    return exportPGN(historyObjs, headers, {
      ...options,
      variant: this._board.variant,
      numPlayers: this._board.variant.numPlayers,
      turnLabels: this._board.variant.turnLabels,
    });
  }

  loadPgn(pgn, options = {}) {
    const { headers, moves } = parsePGN(pgn, options);

    const targetVariant = options.variant
      ? resolveVariant(options.variant)
      : (headers.Variant ? resolveVariant(headers.Variant) : this._board.variant);

    if (variantId(targetVariant) !== variantId(this._board.variant)) {
      this._board = new Board(targetVariant);
      this._state = new GameState(targetVariant);
    }

    this.reset();
    this._headers = headers;
    for (const move of moves) {
      this.move(move);
    }

    return this;
  }

  _buildMeta() {
    return {
      createdAt: this._createdAt,
      players: this._board.variant.playerLabels || [],
      headers: { ...this._headers },
      ...this._meta,
    };
  }

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
    else if (count > 1) this._positionCounts.set(hash, count - 1);
  }

  _resolvePackedMove(input, legal) {
    if (!input || typeof input !== 'object') return 0;

    let from;
    let to;
    try {
      from = this._board.algebraicToIndex(input.from);
      to = this._board.algebraicToIndex(input.to);
    } catch {
      return 0;
    }
    const promo = input.promotion ? this._charToPromo(input.promotion) : 0;

    for (let i = 0; i < legal.count; i++) {
      const m = legal.moves[i];
      if (moveFrom(m) !== from || moveTo(m) !== to) continue;

      const mPromo = movePromo(m);
      if (promo && mPromo !== promo) continue;
      if (!promo && (mPromo === Pieces.QUEEN || mPromo === 0)) return m;
      if (promo && mPromo === promo) return m;
    }
    return 0;
  }

  _makeMoveObject(moveInt, san, playerIndex = this._state.turn) {
    const from = moveFrom(moveInt);
    const to = moveTo(moveInt);
    const flag = moveFlag(moveInt);
    const promo = movePromo(moveInt);
    const piece = this._board.getByIndex(from);

    let captured;
    if (flag === FLAGS.CAPTURE || flag === FLAGS.PROMO_CAPTURE) {
      const target = this._board.getByIndex(to);
      captured = target !== Pieces.EMPTY ? this._typeToChar(getType(target)) : undefined;
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
      san,
      color: this._turnCharFor(playerIndex),
    };
  }

  _typeToChar(type) {
    const map = {
      [Pieces.PAWN]: 'p',
      [Pieces.KNIGHT]: 'n',
      [Pieces.BISHOP]: 'b',
      [Pieces.ROOK]: 'r',
      [Pieces.QUEEN]: 'q',
      [Pieces.KING]: 'k',
    };
    return map[type] || '';
  }

  _colorToChar(color) {
    if (this._board.variant.name === 'standard') {
      return color === 0 ? 'w' : 'b';
    }
    const map = ['r', 'b', 'y', 'g'];
    return map[color] || `p${color}`;
  }

  _turnCharFor(playerIndex) {
    return this._colorToChar(playerIndex);
  }

  _charToPromo(char) {
    const map = {
      n: Pieces.KNIGHT,
      b: Pieces.BISHOP,
      r: Pieces.ROOK,
      q: Pieces.QUEEN,
    };
    return map[char.toLowerCase()] || 0;
  }

  _getFlagChar(flag) {
    if (flag === FLAGS.QUIET) return 'n';
    if (flag === FLAGS.DOUBLE_PUSH) return 'b';
    if (flag === FLAGS.CASTLE_K) return 'k';
    if (flag === FLAGS.CASTLE_Q) return 'q';
    if (flag === FLAGS.CAPTURE) return 'c';
    if (flag === FLAGS.EP_CAPTURE) return 'e';
    if (flag === FLAGS.PROMO) return 'p';
    if (flag === FLAGS.PROMO_CAPTURE) return 'm';
    return 'n';
  }
}
