/**
 * moveGen.js — Pseudo-legal move generation
 *
 * Move encoding (Int32):
 *   bits  0- 7 : from square (0-255)
 *   bits  8-15 : to square   (0-255)
 *   bits 16-19 : flag        (0-15, see FLAGS)
 *   bits 20-22 : promo piece (0-7, only valid when FLAG has PROMO bit set)
 */

import { Board, Pieces, COLORS, getType, getColor } from './board.js';

// ═══════════════════════════════════════════════════════════════════
// MOVE ENCODING (Dynamic for larger boards)
// ═══════════════════════════════════════════════════════════════════

export const FLAGS = Object.freeze({
  QUIET:         0,   // 0000 — normal move
  DOUBLE_PUSH:   1,   // 0001 — pawn double push
  CASTLE_K:      2,   // 0010 — kingside castle
  CASTLE_Q:      3,   // 0011 — queenside castle
  CAPTURE:       4,   // 0100 — standard capture
  EP_CAPTURE:    5,   // 0101 — en passant capture
  PROMO:         8,   // 1000 — promotion (quiet)
  PROMO_CAPTURE: 12,  // 1100 — promotion + capture
});

export const PROMO = Object.freeze({
  KNIGHT: Pieces.KNIGHT,
  BISHOP: Pieces.BISHOP,
  ROOK:   Pieces.ROOK,
  QUEEN:  Pieces.QUEEN,
});

export function encodeMove(from, to, flag = FLAGS.QUIET, promo = 0) {
  return (from & 0xFF) | ((to & 0xFF) << 8) | ((flag & 0xF) << 16) | ((promo & 0x7) << 20);
}

export function moveFrom(m)  { return m & 0xFF; }
export function moveTo(m)    { return (m >>> 8) & 0xFF; }
export function moveFlag(m)  { return (m >>> 16) & 0xF; }
export function movePromo(m) { return (m >>> 20) & 0x7; }

export function isCapture(m)  { return (moveFlag(m) & FLAGS.CAPTURE) !== 0; }
export function isPromo(m)    { return (moveFlag(m) & FLAGS.PROMO) !== 0; }
export function isCastle(m)   { const f = moveFlag(m); return f === FLAGS.CASTLE_K || f === FLAGS.CASTLE_Q; }
export function isEP(m)       { return moveFlag(m) === FLAGS.EP_CAPTURE; }

// ═══════════════════════════════════════════════════════════════════
// MOVE LIST
// ═══════════════════════════════════════════════════════════════════

const MOVE_LIST_CAPACITY = 1024; // Increased for 4-player wide boards

export class MoveList {
  constructor(capacity = MOVE_LIST_CAPACITY) {
    this.moves = new Int32Array(capacity);
    this.count = 0;
  }
  push(move) { this.moves[this.count++] = move; }
  clear() { this.count = 0; }
  [Symbol.iterator]() {
    let i = 0;
    return {
      next: () => i < this.count
        ? { value: this.moves[i++], done: false }
        : { done: true },
    };
  }
}

// ═══════════════════════════════════════════════════════════════════
// TARGET CACHE (Precomputed per board width)
// ═══════════════════════════════════════════════════════════════════

const TARGET_CACHE = new Map(); // width -> { knight, king }

function getTargets(board) {
  const width = board.width;
  const height = board.height;
  const cacheKey = `${width}x${height}`;
  if (TARGET_CACHE.has(cacheKey)) return TARGET_CACHE.get(cacheKey);

  const knight = new Array(width * height);
  const king   = new Array(width * height);

  const knightDeltas = [[2,1],[2,-1],[-2,1],[-2,-1],[1,2],[1,-2],[-1,2],[-1,-2]];
  const kingDeltas   = [[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]];

  for (let idx = 0; idx < width * height; idx++) {
    const f = idx % width;
    const r = Math.floor(idx / width);
    knight[idx] = [];
    king[idx]   = [];

    for (const [df, dr] of knightDeltas) {
      const nf = f + df, nr = r + dr;
      if (nf >= 0 && nf < width && nr >= 0 && nr < width) {
        knight[idx].push(nr * width + nf);
      }
    }
    for (const [df, dr] of kingDeltas) {
      const nf = f + df, nr = r + dr;
      if (nf >= 0 && nf < width && nr >= 0 && nr < width) {
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

export function generateMoves(board, state, list) {
  list.clear();
  const player = state.turn;
  const targets = getTargets(board);

  for (const from of board.getPieces(player)) {
    const piece = board.getByIndex(from);
    const type  = getType(piece);

    switch (type) {
      case Pieces.PAWN:   genPawnMoves(board, state, from, player, list);   break;
      case Pieces.KNIGHT: genKnightMoves(board, from, player, targets.knight, list); break;
      case Pieces.BISHOP: genSlidingMoves(board, from, player, getBishopDirs(board.width), list); break;
      case Pieces.ROOK:   genSlidingMoves(board, from, player, getRookDirs(board.width), list); break;
      case Pieces.QUEEN:  genSlidingMoves(board, from, player, getQueenDirs(board.width), list); break;
      case Pieces.KING:   genKingMoves(board, state, from, player, targets.king, list);   break;
    }
  }
}

function getRookDirs(w)   { return [1, -1, w, -w]; }
function getBishopDirs(w) { return [w + 1, w - 1, -w + 1, -w - 1]; }
function getQueenDirs(w)  { return [1, -1, w, -w, w + 1, w - 1, -w + 1, -w - 1]; }

// ═══════════════════════════════════════════════════════════════════
// PIECE GENERATORS
// ═══════════════════════════════════════════════════════════════════

function genPawnMoves(board, state, from, color, list) {
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
  const attackDirs = [];
  if (Math.abs(forward) === width) { // vertical move (Red/Yellow)
    attackDirs.push(forward - 1, forward + 1);
  } else { // horizontal move (Blue/Green)
    attackDirs.push(forward - width, forward + width);
  }

  for (const dir of attackDirs) {
    const to = from + dir;
    if (!board.isValidSquare(to)) continue;
    
    // Pawn wrap guard: Chebyshev distance must be 1
    if (Board_distance(board, from, to) !== 1) continue;

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


function pushPromos(from, to, flag, list) {
  list.push(encodeMove(from, to, flag, PROMO.QUEEN));
  list.push(encodeMove(from, to, flag, PROMO.ROOK));
  list.push(encodeMove(from, to, flag, PROMO.BISHOP));
  list.push(encodeMove(from, to, flag, PROMO.KNIGHT));
}

function genKnightMoves(board, from, color, targetTable, list) {
  for (const to of targetTable[from]) {
    if (!board.isValidSquare(to)) continue;
    const piece = board.getByIndex(to);
    if (piece === Pieces.EMPTY) {
      list.push(encodeMove(from, to, FLAGS.QUIET));
    } else if (getColor(piece) !== color) {
      list.push(encodeMove(from, to, FLAGS.CAPTURE));
    }
  }
}

function genSlidingMoves(board, from, color, dirs, list) {
  const width = board.width;
  for (const dir of dirs) {
    let sq = from;
    while (true) {
      const prevIdx = sq;
      sq += dir;
      if (!board.isValidSquare(sq)) break;

      // Wrap guard
      if (Board_distance(board, prevIdx, sq) !== 1) break;

      const target = board.getByIndex(sq);
      if (target === Pieces.EMPTY) {
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

function genKingMoves(board, state, from, color, targetTable, list) {
  for (const to of targetTable[from]) {
    if (!board.isValidSquare(to)) continue;
    const target = board.getByIndex(to);
    if (target === Pieces.EMPTY) {
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
  }
}

/** Helper for wrap-guarding */
function Board_distance(board, idx1, idx2) {
  const df = Math.abs(board.file(idx1) - board.file(idx2));
  const dr = Math.abs(board.rank(idx1) - board.rank(idx2));
  return Math.max(df, dr);
}

