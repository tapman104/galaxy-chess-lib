import { Pieces } from './board.js';

/**
 * zobrist.js — Position hashing for Transposition Table and repetition checks
 * Uses BigUint64Array for 64-bit precision.
 */

// ═══════════════════════════════════════════════════════════════════
// RANDOM BITSTRINGS
// ═══════════════════════════════════════════════════════════════════

// Indices for the random table:
// 0-767    : [Square 0-63] * [Piece 0-11]
// 768      : Turn (White=0, Black=1)
// 769-784  : Castling (4 bits: K,Q,k,q)
// 785-792  : EP Square File (a-h, only if EP is active)

const PIECE_KEYS    = 64 * 12;
const TURN_KEY     = 1;
const CASTLE_KEYS  = 16;
const EP_FILE_KEYS = 8;
const TOTAL_KEYS   = PIECE_KEYS + TURN_KEY + CASTLE_KEYS + EP_FILE_KEYS;

const ZOBRIST_TABLE = new BigUint64Array(TOTAL_KEYS);

// Deterministic seed for PRNG (using mulberry32 or simple LCG)
function seedRandom(seed) {
  return function() {
    seed |= 0; seed = seed + 0x6D2B79F5 | 0;
    let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

const random = seedRandom(0x4C48455353); // 'CHESS'

for (let i = 0; i < TOTAL_KEYS; i++) {
  // Generate two 32-bit randoms to make a 64-bit BigInt
  const low  = BigInt((random() * 0xFFFFFFFF) >>> 0);
  const high = BigInt((random() * 0xFFFFFFFF) >>> 0);
  ZOBRIST_TABLE[i] = (high << 32n) | low;
}

// ═══════════════════════════════════════════════════════════════════
// UTILITIES
// ═══════════════════════════════════════════════════════════════════

function getPieceIndex(piece) {
  // Map Pieces constant (-6 to 6, excluding 0) to 0-11
  if (piece > 0) return piece - 1; // White: 0-5
  return Math.abs(piece) + 5;      // Black: 6-11
}

/**
 * Computes the Zobrist hash for a complete position from scratch.
 * Use incrementally during makeMove/unmakeMove for performance.
 *
 * @param {Board} board
 * @param {GameState} state
 * @returns {bigint}
 */
export function computeHash(board, state) {
  let hash = 0n;

  // 1. Pieces
  for (let i = 0; i < 64; i++) {
    const piece = board.getByIndex(i);
    if (piece !== Pieces.EMPTY) {
      hash ^= ZOBRIST_TABLE[i * 12 + getPieceIndex(piece)];
    }
  }

  // 2. Turn
  if (state.turn === 'black') {
    hash ^= ZOBRIST_TABLE[PIECE_KEYS];
  }

  // 3. Castling
  let castleIdx = 0;
  if (state.castling.K) castleIdx |= 1;
  if (state.castling.Q) castleIdx |= 2;
  if (state.castling.k) castleIdx |= 4;
  if (state.castling.q) castleIdx |= 8;
  hash ^= ZOBRIST_TABLE[PIECE_KEYS + TURN_KEY + castleIdx];

  // 4. En Passant
  if (state.epSquare !== null) {
    const file = state.epSquare & 7;
    hash ^= ZOBRIST_TABLE[PIECE_KEYS + TURN_KEY + CASTLE_KEYS + file];
  }

  return hash;
}

/**
 * Incremental Updates — Toggle bits for a specific property
 */

export function xorPiece(hash, sq, piece) {
  return hash ^ ZOBRIST_TABLE[sq * 12 + getPieceIndex(piece)];
}

export function xorTurn(hash) {
  return hash ^ ZOBRIST_TABLE[PIECE_KEYS];
}

export function xorCastle(hash, castling) {
  let idx = 0;
  if (castling.K) idx |= 1;
  if (castling.Q) idx |= 2;
  if (castling.k) idx |= 4;
  if (castling.q) idx |= 8;
  return hash ^ ZOBRIST_TABLE[PIECE_KEYS + TURN_KEY + idx];
}

export function xorEP(hash, epSquare) {
  if (epSquare === null) return hash;
  const file = epSquare & 7;
  return hash ^ ZOBRIST_TABLE[PIECE_KEYS + TURN_KEY + CASTLE_KEYS + file];
}

