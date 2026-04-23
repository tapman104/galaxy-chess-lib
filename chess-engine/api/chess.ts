import { Board, Pieces, getType, getColor } from '../core/board.js';
import { GameState } from '../state/gameState.js';
import { getLegalMoves, inCheck } from '../core/legality.js';
import { makeMove, unmakeMove, poofPieces } from '../core/makeMove.js';
import { FLAGS, moveFrom, moveTo, moveFlag, movePromo } from '../core/moveGen.js';
import { computeHash } from '../core/zobrist.js';
import { parseFEN, exportFEN } from '../io/fen.js';
import { moveToSAN, sanToMove } from './san.js';
import { parsePGN, exportPGN } from './pgn.js';
import { InvalidMoveError, InvalidFENError } from './errors.js';
import { resolveVariant, variantId } from '../core/variants.js';
import { 
  ChessOptions, 
  MoveObject, 
  HistoryEntry, 
  UndoData, 
  GameStateSnapshot, 
  MoveInput, 
  Move, 
  Square, 
  PieceType, 
  VariantConfig,
  PositionCountEntry
} from '../types.js';

function cloneMoveObject(move?: MoveObject): MoveObject | undefined {
  if (!move) return undefined;
  return { ...move };
}

function cloneUndo(undo: UndoData): UndoData {
  if (!undo) return undo;
  return {
    captured: undo.captured,
    turn: undo.turn,
    castling: Array.isArray(undo.castling) ? undo.castling.map((c) => ({ ...c })) : [],
    epSquare: undo.epSquare,
    playerStatus: Array.isArray(undo.playerStatus) ? [...undo.playerStatus] : [],
    halfmoveClock: undo.halfmoveClock,
    fullmoveNumber: undo.fullmoveNumber,
    eliminatedAtOnce: Array.isArray(undo.eliminatedAtOnce) ? undo.eliminatedAtOnce.map(e => ({ ...e })) : null,
  };
}

function serializeHistoryEntry(entry: HistoryEntry): any {
  return {
    moveInt: entry.moveInt,
    san: entry.san,
    player: entry.player,
    hash: entry.hash.toString(),
    move: cloneMoveObject(entry.move),
    undo: cloneUndo(entry.undo),
    type: entry.type,
    eliminatedPlayers: entry.eliminatedPlayers ? [...entry.eliminatedPlayers] : undefined,
  };
}

function deserializeHistoryEntry(entry: any): HistoryEntry {
  return {
    moveInt: entry.moveInt || 0,
    san: entry.san || '',
    player: Number.isInteger(entry.player) ? entry.player : 0,
    hash: typeof entry.hash === 'string' ? BigInt(entry.hash) : BigInt(entry.hash || 0),
    move: cloneMoveObject(entry.move),
    undo: cloneUndo(entry.undo),
    type: entry.type,
    eliminatedPlayers: entry.eliminatedPlayers ? [...entry.eliminatedPlayers] : undefined,
  };
}

function serializePositionCounts(positionCounts: Map<bigint, number>): PositionCountEntry[] {
  return Array.from(positionCounts.entries()).map(([hash, count]) => ({
    hash: hash.toString(),
    count,
  }));
}

function deserializePositionCounts(entries: PositionCountEntry[]): Map<bigint, number> {
  const map = new Map<bigint, number>();
  for (const row of entries || []) {
    if (!row || typeof row.hash !== 'string') continue;
    map.set(BigInt(row.hash), Number(row.count) || 0);
  }
  return map;
}

function normalizeTurnToAlive(state: GameState): void {
  if (state.playerStatus.some(Boolean) === false) {
    state.playerStatus.fill(true);
  }

  if (state.playerStatus[state.turn]) return;
  const nextAlive = state.playerStatus.findIndex((alive) => alive);
  state.turn = nextAlive === -1 ? 0 : nextAlive;
}

export class Chess {
  private _board: Board;
  private _state: GameState;
  private _history: HistoryEntry[];
  private _positionCounts: Map<bigint, number>;
  private _headers: Record<string, string>;
  private _meta: any;
  private _createdAt: string;

  constructor(options: ChessOptions = {}) {
    const variant = resolveVariant(options.variant || 'standard');
    this._board = new Board(variant);
    this._state = new GameState(variant);
    this._history = [];
    this._positionCounts = new Map();
    this._headers = {};
    this._meta = options.meta && typeof options.meta === 'object' ? { ...options.meta } : {};
    this._createdAt = this._meta.createdAt || new Date().toISOString();

    if (options.fen) this.load(options.fen);
    else this.reset();
  }

  /**
   * Resets the game to its initial starting position.
   */
  reset(): void {
    this._board.setup();
    this._state = new GameState(this._board.variant);
    this._history = [];
    this._positionCounts.clear();
    this._updateHash();
  }

  /**
   * Loads a position from a FEN string.
   */
  load(fen: string, options: { variant?: string } = {}): this {
    try {
      const variant = options.variant ? resolveVariant(options.variant) : this._board.variant;
      const { board, state } = parseFEN(fen, variant);
      this._board = board;
      this._state = state;
      this._history = [];
      this._positionCounts.clear();
      this._updateHash();
      return this;
    } catch (e: any) {
      throw new InvalidFENError(e.message);
    }
  }

  /**
   * Gets or sets PGN headers.
   */
  header(key?: string, value?: string): string | Record<string, string> | undefined | this {
    if (key === undefined) return this._headers;
    if (value === undefined) return this._headers[key];
    this._headers[key] = value;
    return this;
  }

  /**
   * Loads the game state from a JSON object.
   */
  loadJSON(data: GameStateSnapshot): this {
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
    normalizeTurnToAlive(state);

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
      if (data.meta.headers && typeof data.meta.headers === 'object') {
        this._headers = { ...data.meta.headers };
      }
    }

    return this;
  }

  toJSON(options: { includeMeta?: boolean } = {}): GameStateSnapshot {
    const payload: GameStateSnapshot = {
      variant: variantId(this._board.variant),
      board: Array.from(this._board.squares),
      validSquares: Array.from(this._board.validSquares),
      turn: this._state.turn,
      activePlayers: this._state.playerStatus
        .map((alive, index) => (alive ? index : null))
        .filter((value): value is number => value !== null),
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

  /**
   * Returns the FEN string for the current position.
   */
  fen(): string {
    return exportFEN(this._board, this._state);
  }

  variant(): string {
    return variantId(this._board.variant);
  }

  clone(): Chess {
    const next = new Chess({ variant: this._board.variant.name });
    next._board = this._board.clone();
    next._state = this._state.clone();
    next._history = this._history.map((entry) => deserializeHistoryEntry(serializeHistoryEntry(entry)));
    next._positionCounts = new Map(this._positionCounts);
    next._headers = { ...this._headers };
    next._meta = { ...this._meta };
    next._createdAt = this._createdAt;
    return next;
  }

  /**
   * Returns a list of legal moves from the current position.
   */
  moves(options: { square?: string, verbose?: boolean } = {}): string[] | MoveObject[] {
    const legal = getLegalMoves(this._board, this._state);
    const results: any[] = [];

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

  /**
   * Makes a move on the board.
   */
  move(moveInput: string | MoveInput): MoveObject {
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

    const capturedColor = (undo.captured !== Pieces.EMPTY && getType(undo.captured) === Pieces.KING)
      ? getColor(undo.captured)
      : -1;

    let eliminatedPlayers: number[] = [];

    if (this._board.variant.numPlayers > 2) {
      if (capturedColor !== -1 && this._state.playerStatus[capturedColor]) {
        this._state.eliminatePlayer(capturedColor);
        const poofed = poofPieces(this._board, capturedColor);
        if (!Array.isArray(undo.eliminatedAtOnce)) undo.eliminatedAtOnce = [];
        undo.eliminatedAtOnce.push(...poofed);
        eliminatedPlayers.push(capturedColor);
        if (this._state.turn === capturedColor) this._state.nextTurn();
      }
      const chained = this._processCheckmateEliminations(undo);
      eliminatedPlayers.push(...chained);
    }

    const hash = computeHash(this._board, this._state);
    if (eliminatedPlayers.length > 0) {
      moveObj.eliminatedPlayers = eliminatedPlayers;
    }

    this._history.push({ 
      moveInt, 
      undo, 
      san, 
      hash, 
      player, 
      move: cloneMoveObject(moveObj),
      eliminatedPlayers: eliminatedPlayers.length > 0 ? eliminatedPlayers : undefined
    });
    this._incHash(hash);

    return moveObj;
  }

  /**
   * Undoes the last move.
   */
  undo(): MoveObject | { type: 'resign', player: number, color: string } | null {
    const last = this._history.pop();
    if (!last) return null;

    if (last.type === 'resign') {
      this._decHash(last.hash);
      this._state.playerStatus[last.player] = true;
      if (last.undo && last.undo.eliminatedAtOnce) {
        for (const { idx, piece } of last.undo.eliminatedAtOnce) {
          this._board.setByIndex(idx, piece);
        }
      }
      this._state.turn = last.undo.turn;
      return { type: 'resign', player: last.player, color: this._colorToChar(last.player) };
    }

    this._decHash(last.hash);
    unmakeMove(this._board, this._state, last.moveInt, last.undo);
    if (last.move) return cloneMoveObject(last.move) as MoveObject;
    return this._makeMoveObject(last.moveInt, last.san, last.player);
  }

  /**
   * Resign as a player.
   */
  resign(player: number | string): boolean {
    const playerIndex = this._resolvePlayer(player);
    if (playerIndex < 0 || playerIndex >= this._board.variant.numPlayers) {
      return false;
    }
    if (!this._state.playerStatus[playerIndex]) return false;

    const playerBefore = this._state.turn;
    const poofed = poofPieces(this._board, playerIndex);
    this._state.eliminatePlayer(playerIndex);

    if (this._state.turn === playerIndex) {
      this._state.nextTurn();
    }

    const hash = computeHash(this._board, this._state);
    this._history.push({
      type: 'resign',
      player: playerIndex,
      san: 'resign',
      hash,
      undo: {
        turn: playerBefore,
        eliminatedAtOnce: poofed,
        captured: Pieces.EMPTY,
        castling: this._state.castling.map(c => ({ ...c })),
        epSquare: this._state.epSquare,
        playerStatus: [...this._state.playerStatus],
        halfmoveClock: this._state.halfmoveClock,
        fullmoveNumber: this._state.fullmoveNumber
      } as UndoData,
      moveInt: 0
    });

    this._incHash(hash);
    return true;
  }

  turn(): string {
    if (this._board.variant.name === 'standard') {
      return this._state.turn === 0 ? 'w' : 'b';
    }
    const map = ['r', 'b', 'y', 'g'];
    return map[this._state.turn] || `p${this._state.turn}`;
  }

  turnIndex(): number {
    return this._state.turn;
  }

  isAlive(player: number | string): boolean {
    const colorIndex = this._resolvePlayer(player);
    return !!this._state.playerStatus[colorIndex];
  }

  inCheck(player?: number | string): boolean {
    const colorIndex = this._resolvePlayer(player);
    if (!this._state.playerStatus[colorIndex]) return false;
    return inCheck(this._board, this._state, colorIndex);
  }

  inCheckmate(player?: number | string): boolean {
    const colorIndex = this._resolvePlayer(player);
    if (!this._state.playerStatus[colorIndex]) return false;
    const tempState = this._state.clone();
    tempState.turn = colorIndex;
    return inCheck(this._board, tempState, colorIndex) && getLegalMoves(this._board, tempState).count === 0;
  }

  inStalemate(player?: number | string): boolean {
    const colorIndex = this._resolvePlayer(player);
    if (!this._state.playerStatus[colorIndex]) return false;
    const tempState = this._state.clone();
    tempState.turn = colorIndex;
    return !inCheck(this._board, tempState, colorIndex) && getLegalMoves(this._board, tempState).count === 0;
  }

  inThreefoldRepetition(): boolean {
    const currentHash = computeHash(this._board, this._state);
    return (this._positionCounts.get(currentHash) || 0) >= 3;
  }

  insufficientMaterial(): boolean {
    if (this._board.variant.name === 'standard') {
      const w = Array.from(this._board.getPieces(0));
      const b = Array.from(this._board.getPieces(1));
      const total = w.length + b.length;

      if (total === 2) return true;

      if (total === 3) {
        const allIndices = [...w, ...b];
        const extra = allIndices.find((idx) => getType(this._board.getByIndex(idx)) !== Pieces.KING);
        if (extra !== undefined) {
          const piece = this._board.getByIndex(extra);
          const type = getType(piece);
          if (type === Pieces.KNIGHT || type === Pieces.BISHOP) return true;
        }
      }

      if (total === 4) {
        if (w.length === 2 && b.length === 2) {
          const wb = w.find((idx) => getType(this._board.getByIndex(idx)) === Pieces.BISHOP);
          const bb = b.find((idx) => getType(this._board.getByIndex(idx)) === Pieces.BISHOP);
          if (wb !== undefined && bb !== undefined) {
            const color1 = (this._board.file(wb) + this._board.rank(wb)) % 2;
            const color2 = (this._board.file(bb) + this._board.rank(bb)) % 2;
            if (color1 === color2) return true;
          }
        }
      }
      return false;
    }

    if (this._board.variant.name === '4player') {
      const alive = this._state.playerStatus
        .map((a, i) => (a ? i : -1))
        .filter((i) => i !== -1);
      if (alive.length !== 2) return false;

      const [p0, p1] = alive;
      const pieces0 = Array.from(this._board.getPieces(p0));
      const pieces1 = Array.from(this._board.getPieces(p1));
      const total = pieces0.length + pieces1.length;

      if (total === 2) return true;

      if (total === 3) {
        const allIndices = [...pieces0, ...pieces1];
        const extra = allIndices.find(
          (idx) => getType(this._board.getByIndex(idx)) !== Pieces.KING,
        );
        if (extra !== undefined) {
          const t = getType(this._board.getByIndex(extra));
          if (t === Pieces.KNIGHT || t === Pieces.BISHOP) return true;
        }
      }

      if (total === 4 && pieces0.length === 2 && pieces1.length === 2) {
        const wb = pieces0.find((idx) => getType(this._board.getByIndex(idx)) === Pieces.BISHOP);
        const bb = pieces1.find((idx) => getType(this._board.getByIndex(idx)) === Pieces.BISHOP);
        if (wb !== undefined && bb !== undefined) {
          const c1 = (this._board.file(wb) + this._board.rank(wb)) % 2;
          const c2 = (this._board.file(bb) + this._board.rank(bb)) % 2;
          if (c1 === c2) return true;
        }
      }
      return false;
    }

    return false;
  }

  inDraw(): boolean {
    return (
      this._state.halfmoveClock >= 100 ||
      this.inStalemate() ||
      this.insufficientMaterial() ||
      this.inThreefoldRepetition()
    );
  }

  isGameOver(): boolean {
    if (this._board.variant.numPlayers > 2) {
      const alive = this._state.playerStatus.filter(Boolean).length;
      return alive <= 1;
    }
    return this.inCheckmate() || this.inDraw();
  }

  winner(): number | null {
    const aliveIndices = this._state.playerStatus
      .map((a, i) => (a ? i : -1))
      .filter((i) => i !== -1);
    return aliveIndices.length === 1 ? aliveIndices[0] : null;
  }

  get(square: string): { type: string, color: string } | null {
    let index: Square;
    try {
      index = this._board.algebraicToIndex(square);
    } catch {
      return null;
    }
    const piece = this._board.getByIndex(index);
    if (piece === Pieces.EMPTY) return null;
    return { 
      type: this._typeToChar(getType(piece)), 
      color: this._colorToChar(getColor(piece)) 
    };
  }

  history(options: { verbose?: boolean, withPlayers?: boolean } = {}): string[] | MoveObject[] | { san: string, player: number }[] {
    if (options.verbose) {
      return this._history.map((h) => cloneMoveObject(h.move) || this._makeMoveObject(h.moveInt, h.san, h.player));
    }
    if (options.withPlayers) {
      return this._history.map((h) => ({ san: h.san, player: h.player }));
    }
    return this._history.map((h) => h.san);
  }

  ascii(): string {
    return this._board.toString();
  }

  headers(): Record<string, string> {
    return { ...this._headers };
  }

  clearHeaders(): this {
    this._headers = {};
    return this;
  }

  board(options: { raw?: boolean } = {}): any {
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

  pgn(options: any = {}): string {
    const historyObjs = this._history.map((h) => ({ san: h.san, player: h.player, move: h.move }));
    const headers = { Variant: variantId(this._board.variant), ...this._headers };
    return exportPGN(historyObjs, headers, {
      ...options,
      variant: this._board.variant,
      numPlayers: this._board.variant.numPlayers,
      turnLabels: this._board.variant.turnLabels,
    });
  }

  loadPgn(pgn: string, options: any = {}): this {
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

  private _processCheckmateEliminations(undo: UndoData): number[] {
    if (!Array.isArray(undo.eliminatedAtOnce)) {
      undo.eliminatedAtOnce = [];
    }

    const eliminated: number[] = [];
    const numPlayers = this._board.variant.numPlayers;
    for (let i = 0; i < numPlayers - 1; i++) {
      const alive = this._state.playerStatus.filter(Boolean).length;
      if (alive <= 1) break;

      const legal = getLegalMoves(this._board, this._state);
      if (legal.count > 0) break;

      const victim = this._state.turn;
      eliminated.push(victim);
      this._state.eliminatePlayer(victim);
      const poofed = poofPieces(this._board, victim);
      undo.eliminatedAtOnce.push(...poofed);

      this._state.nextTurn();
    }
    return eliminated;
  }

  private _buildMeta(): any {
    return {
      createdAt: this._createdAt,
      players: this._board.variant.playerLabels || [],
      headers: { ...this._headers },
      ...this._meta,
    };
  }

  private _updateHash(): void {
    const hash = computeHash(this._board, this._state);
    this._positionCounts.set(hash, 1);
  }

  private _incHash(hash: bigint): void {
    this._positionCounts.set(hash, (this._positionCounts.get(hash) || 0) + 1);
  }

  private _decHash(hash: bigint): void {
    const count = this._positionCounts.get(hash);
    if (count === 1) this._positionCounts.delete(hash);
    else if (count && count > 1) this._positionCounts.set(hash, count - 1);
  }

  private _resolvePackedMove(input: MoveInput | any, legal: { moves: Int32Array, count: number }): number {
    if (!input || typeof input !== 'object') return 0;

    let from: Square;
    let to: Square;
    try {
      from = typeof input.from === 'string' ? this._board.algebraicToIndex(input.from) : input.from;
      to = typeof input.to === 'string' ? this._board.algebraicToIndex(input.to) : input.to;
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

  private _makeMoveObject(moveInt: number, san: string, playerIndex: number = this._state.turn): MoveObject {
    const from = moveFrom(moveInt);
    const to = moveTo(moveInt);
    const flag = moveFlag(moveInt);
    const promo = movePromo(moveInt);
    const piece = this._board.getByIndex(from);

    let captured: string | undefined;
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

  private _typeToChar(type: number): string {
    const map: Record<number, string> = {
      [Pieces.PAWN]: 'p',
      [Pieces.KNIGHT]: 'n',
      [Pieces.BISHOP]: 'b',
      [Pieces.ROOK]: 'r',
      [Pieces.QUEEN]: 'q',
      [Pieces.KING]: 'k',
    };
    return map[type] || '';
  }

  private _colorToChar(color: number): string {
    if (this._board.variant.name === 'standard') {
      return color === 0 ? 'w' : 'b';
    }
    const map = ['r', 'b', 'y', 'g'];
    return map[color] || `p${color}`;
  }

  private _turnCharFor(playerIndex: number): string {
    return this._colorToChar(playerIndex);
  }

  private _charToPromo(char: string | PieceType): number {
    if (typeof char === 'number') return char;
    const map: Record<string, number> = {
      n: Pieces.KNIGHT,
      b: Pieces.BISHOP,
      r: Pieces.ROOK,
      q: Pieces.QUEEN,
    };
    return map[char.toLowerCase()] || 0;
  }

  private _getFlagChar(flag: number): string {
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

  private _resolvePlayer(player?: number | string): number {
    if (player === undefined || player === null) return this._state.turn;
    if (typeof player === 'number') {
      if (player < 0 || player >= this._board.variant.numPlayers) return this._state.turn;
      return player;
    }
    
    const p = String(player).toLowerCase().trim();
    if (this._board.variant.name === 'standard') {
      if (p === 'w' || p === 'white') return 0;
      if (p === 'b' || p === 'black') return 1;
    } else if (this._board.variant.name === '4player') {
      const map: Record<string, number> = { r: 0, red: 0, b: 1, blue: 1, y: 2, yellow: 2, g: 3, green: 3 };
      if (map[p] !== undefined) return map[p];
      if (p.startsWith('p')) {
        const idx = parseInt(p.substring(1));
        if (Number.isInteger(idx) && idx >= 0 && idx < 4) return idx;
      }
    }
    return this._state.turn;
  }
}
