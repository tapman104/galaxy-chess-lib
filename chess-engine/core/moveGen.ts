/**
 * moveGen.ts — Pseudo-legal move generation
 *
 * Move encoding (Int32):
 *   bits  0- 7 : from square (0-255)
 *   bits  8-15 : to square   (0-255)
 *   bits 16-19 : flag        (0-15, see FLAGS)
 *   bits 20-22 : promo piece (0-7, only valid when FLAG has PROMO bit set)
 */

import { Board, Pieces, getColor, getType } from './board.js';
import { FOUR_PLAYER_CASTLE } from './variants.js';
import { GameState } from '../state/gameState.js';
import { Move, Square, PieceType } from '../types.js';

// ═══════════════════════════════════════════════════════════════════
// MOVE ENCODING (Dynamic for larger boards)
// ═══════════════════════════════════════════════════════════════════

export const FLAGS = {
  QUIET:         0,   // 0000 — normal move
  DOUBLE_PUSH:   1,   // 0001 — pawn double push
  CASTLE_K:      2,   // 0010 — kingside castle
  CASTLE_Q:      3,   // 0011 — queenside castle
  CAPTURE:       4,   // 0100 — standard capture
  EP_CAPTURE:    5,   // 0101 — en passant capture
  PROMO:         8,   // 1000 — promotion (quiet)
  PROMO_CAPTURE: 12,  // 1100 — promotion + capture
} as const;

export const PROMO = {
  KNIGHT: Pieces.KNIGHT,
  BISHOP: Pieces.BISHOP,
  ROOK:   Pieces.ROOK,
  QUEEN:  Pieces.QUEEN,
} as const;

export function encodeMove(from: Square, to: Square, flag: number = FLAGS.QUIET, promo: number = 0): Move {
  return (from & 0xFF) | ((to & 0xFF) << 8) | ((flag & 0xF) << 16) | ((promo & 0x7) << 20);
}

export function moveFrom(m: Move): Square  { return m & 0xFF; }
export function moveTo(m: Move): Square    { return (m >>> 8) & 0xFF; }
export function moveFlag(m: Move): number  { return (m >>> 16) & 0xF; }
export function movePromo(m: Move): number { return (m >>> 20) & 0x7; }

export function isCapture(m: Move): boolean  { return (moveFlag(m) & FLAGS.CAPTURE) !== 0; }
export function isPromo(m: Move): boolean    { return (moveFlag(m) & FLAGS.PROMO) !== 0; }
export function isCastle(m: Move): boolean   { const f = moveFlag(m); return f === FLAGS.CASTLE_K || f === FLAGS.CASTLE_Q; }
export function isEP(m: Move): boolean       { return moveFlag(m) === FLAGS.EP_CAPTURE; }

// ═══════════════════════════════════════════════════════════════════
// MOVE LIST
// ═══════════════════════════════════════════════════════════════════

const MOVE_LIST_CAPACITY = 1024; // Increased for 4-player wide boards

export class MoveList implements Iterable<Move> {
  public moves: Int32Array;
  public count: number;

  constructor(capacity: number = MOVE_LIST_CAPACITY) {
    this.moves = new Int32Array(capacity);
    this.count = 0;
  }

  public push(move: Move): void { 
    this.moves[this.count++] = move; 
  }

  public clear(): void { 
    this.count = 0; 
  }

  public [Symbol.iterator](): Iterator<Move> {
    let i = 0;
    return {
      next: () => i < this.count
        ? { value: this.moves[i++], done: false }
        : { value: undefined as any, done: true },
    };
  }
}

// ═══════════════════════════════════════════════════════════════════
// TARGET CACHE (Precomputed per board width)
// ═══════════════════════════════════════════════════════════════════

interface TargetData {
  knight: Square[][];
  king: Square[][];
}

const TARGET_CACHE = new Map<string, TargetData>(); // "widthxheight" -> { knight, king }

function getTargets(board: Board): TargetData {
  const width = board.width;
  const height = board.height;
  const cacheKey = `${width}x${height}`;
  if (TARGET_CACHE.has(cacheKey)) return TARGET_CACHE.get(cacheKey)!;

  const knight: Square[][] = new Array(width * height);
  const king: Square[][]   = new Array(width * height);

  const knightDeltas = [[2,1],[2,-1],[-2,1],[-2,-1],[1,2],[1,-2],[-1,2],[-1,-2]];
  const kingDeltas   = [[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]];

  for (let idx = 0; idx < width * height; idx++) {
    const f = idx % width;
    const r = Math.floor(idx / width);
    knight[idx] = [];
    king[idx]   = [];

    if (board.validSquares[idx] === 0) continue;

    for (const [df, dr] of knightDeltas) {
      const nf = f + df, nr = r + dr;
      if (nf >= 0 && nf < width && nr >= 0 && nr < height) {
        knight[idx].push(nr * width + nf);
      }
    }
    for (const [df, dr] of kingDeltas) {
      const nf = f + df, nr = r + dr;
      if (nf >= 0 && nf < width && nr >= 0 && nr < height) {
        king[idx].push(nr * width + nf);
      }
    }
  }

  const result = { knight, king };
  TARGET_CACHE.set(cacheKey, result);
  return result;
}

// ═══════════════════════════════════════════════════════════════════
// MAIN GENERATOR
// ═══════════════════════════════════════════════════════════════════

export function generateMoves(board: Board, state: GameState, list: MoveList): void {
  list.clear();
  const player = state.turn;
  const targets = getTargets(board);

  for (const from of board.getPieces(player)) {
    const piece = board.getByIndex(from);
    const type  = getType(piece);

    switch (type) {
      case PieceType.PAWN:   genPawnMoves(board, state, from, player, list);   break;
      case PieceType.KNIGHT: genKnightMoves(board, from, player, targets.knight, list); break;
      case PieceType.BISHOP: genSlidingMoves(board, from, player, getBishopDirs(board.width), list); break;
      case PieceType.ROOK:   genSlidingMoves(board, from, player, getRookDirs(board.width), list); break;
      case PieceType.QUEEN:  genSlidingMoves(board, from, player, getQueenDirs(board.width), list); break;
      case PieceType.KING:   genKingMoves(board, state, from, player, targets.king, list);   break;
    }
  }
}

function getRookDirs(w: number): number[]   { return [1, -1, w, -w]; }
function getBishopDirs(w: number): number[] { return [w + 1, w - 1, -w + 1, -w - 1]; }
function getQueenDirs(w: number): number[]  { return [1, -1, w, -w, w + 1, w - 1, -w + 1, -w - 1]; }

// ═══════════════════════════════════════════════════════════════════
// PIECE GENERATORS
// ═══════════════════════════════════════════════════════════════════

function genPawnMoves(board: Board, state: GameState, from: Square, color: number, list: MoveList): void {
  const variant = board.variant;
  const forward = variant.pawnForward[color];
  const width = board.width;
  const f = board.file(from);
  const r = board.rank(from);

  // Single push
  const one = from + forward;
  if (board.isValidSquare(one) && !board.hasPiece(one)) {
    const isVertical = Math.abs(forward) === width;
    const currentCoord = isVertical ? r : f;
    const destCoord    = isVertical ? board.rank(one) : board.file(one);
    const promoCoord   = variant.promoRank[color];
    const startCoord   = variant.startRank[color];

    if (destCoord === promoCoord) {
       pushPromos(from, one, FLAGS.PROMO, list);
    } else {
      list.push(encodeMove(from, one, FLAGS.QUIET));
      
      // Double push
      if (currentCoord === startCoord) {
        const two = one + forward;
        if (board.isValidSquare(two) && !board.hasPiece(two)) {
          list.push(encodeMove(from, two, FLAGS.DOUBLE_PUSH));
        }
      }
    }
  }

  // Captures
  const attackDirs: number[] = [];
  if (Math.abs(forward) === width) { // vertical move (Red/Yellow)
    attackDirs.push(forward - 1, forward + 1);
  } else { // horizontal move (Blue/Green)
    attackDirs.push(forward - width, forward + width);
  }

  for (const dir of attackDirs) {
    const to = from + dir;
    if (!board.isValidSquare(to)) continue;
    
    // Pawn wrap guard: Chebyshev distance must be 1
    if (boardDistance(board, from, to) !== 1) continue;

    const isVertical = Math.abs(forward) === width;
    const destCoord  = isVertical ? board.rank(to) : board.file(to);
    const promoCoord = variant.promoRank[color];

    if (board.isEnemy(to, color)) {
      if (destCoord === promoCoord) {
        pushPromos(from, to, FLAGS.PROMO_CAPTURE, list);
      } else {
        list.push(encodeMove(from, to, FLAGS.CAPTURE));
      }
    } else if (state.epSquare === to) {
      list.push(encodeMove(from, to, FLAGS.EP_CAPTURE));
    }
  }
}


function pushPromos(from: Square, to: Square, flag: number, list: MoveList): void {
  list.push(encodeMove(from, to, flag, PROMO.QUEEN));
  list.push(encodeMove(from, to, flag, PROMO.ROOK));
  list.push(encodeMove(from, to, flag, PROMO.BISHOP));
  list.push(encodeMove(from, to, flag, PROMO.KNIGHT));
}

function genKnightMoves(board: Board, from: Square, color: number, targetTable: Square[][], list: MoveList): void {
  for (const to of targetTable[from]) {
    if (!board.isValidSquare(to)) continue;
    const piece = board.getByIndex(to);
    if (piece === PieceType.EMPTY) {
      list.push(encodeMove(from, to, FLAGS.QUIET));
    } else if (getColor(piece) !== color) {
      list.push(encodeMove(from, to, FLAGS.CAPTURE));
    }
  }
}

function genSlidingMoves(board: Board, from: Square, color: number, dirs: number[], list: MoveList): void {
  for (const dir of dirs) {
    let sq = from;
    while (true) {
      const prevIdx = sq;
      sq += dir;
      if (!board.isValidSquare(sq)) break;

      // Wrap guard
      if (boardDistance(board, prevIdx, sq) !== 1) break;

      const target = board.getByIndex(sq);
      if (target === PieceType.EMPTY) {
        list.push(encodeMove(from, sq, FLAGS.QUIET));
      } else {
        if (getColor(target) !== color) {
          list.push(encodeMove(from, sq, FLAGS.CAPTURE));
        }
        break;
      }
    }
  }
}

function genKingMoves(board: Board, state: GameState, from: Square, color: number, targetTable: Square[][], list: MoveList): void {
  for (const to of targetTable[from]) {
    if (!board.isValidSquare(to)) continue;
    const target = board.getByIndex(to);
    if (target === PieceType.EMPTY) {
      list.push(encodeMove(from, to, FLAGS.QUIET));
    } else if (getColor(target) !== color) {
      list.push(encodeMove(from, to, FLAGS.CAPTURE));
    }
  }

  // Castling
  if (board.variant.name === 'standard') {
    const rights = state.castling[color];
    if (color === 0) { // White
      if (rights.kingside && !board.hasPiece(5) && !board.hasPiece(6)) list.push(encodeMove(from, 6, FLAGS.CASTLE_K));
      if (rights.queenside && !board.hasPiece(3) && !board.hasPiece(2) && !board.hasPiece(1)) list.push(encodeMove(from, 2, FLAGS.CASTLE_Q));
    } else { // Black
      if (rights.kingside && !board.hasPiece(61) && !board.hasPiece(62)) list.push(encodeMove(from, 62, FLAGS.CASTLE_K));
      if (rights.queenside && !board.hasPiece(59) && !board.hasPiece(58) && !board.hasPiece(57)) list.push(encodeMove(from, 58, FLAGS.CASTLE_Q));
    }
  } else if (board.variant.name === '4player') {
    const rights = state.castling[color];
    const cfg = FOUR_PLAYER_CASTLE[color];
    if (rights.kingside  && cfg.emptyK.every(sq => !board.hasPiece(sq))) list.push(encodeMove(from, cfg.kK, FLAGS.CASTLE_K));
    if (rights.queenside && cfg.emptyQ.every(sq => !board.hasPiece(sq))) list.push(encodeMove(from, cfg.kQ, FLAGS.CASTLE_Q));
  }
}

/** Helper for wrap-guarding */
function boardDistance(board: Board, idx1: Square, idx2: Square): number {
  const df = Math.abs(board.file(idx1) - board.file(idx2));
  const dr = Math.abs(board.rank(idx1) - board.rank(idx2));
  return Math.max(df, dr);
}
