import { Board, Pieces, getColor, getType } from './board.js';
import { STANDARD, variantId } from './variants.js';
import { GameState } from '../state/gameState.js';
import { VariantConfig, Square, PieceType } from '../types.js';

/**
 * zobrist.ts — Variant-aware position hashing for repetition and TT usage.
 */

interface ZobristTable {
  keys: BigUint64Array;
  offsets: {
    piece: number;
    turn: number;
    castling: number;
    ep: number;
    variant: number;
  };
  squareCount: number;
  piecesPerSquare: number;
  signature: string;
}

const TABLE_CACHE = new Map<string, ZobristTable>();

function seedFromString(value: string): number {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function makeRng(seed: number): () => bigint {
  let state = seed >>> 0;
  return function next64(): bigint {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    const low = BigInt(state);
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    const high = BigInt(state);
    return (high << 32n) | low;
  };
}

function variantSignature(variant: VariantConfig): string {
  return `${variantId(variant)}|${variant.width}x${variant.height}|players=${variant.numPlayers}`;
}

function getTable(variant: VariantConfig): ZobristTable {
  const signature = variantSignature(variant);
  if (TABLE_CACHE.has(signature)) {
    return TABLE_CACHE.get(signature)!;
  }

  const squareCount = variant.width * variant.height;
  const piecesPerSquare = variant.numPlayers * 6;
  const pieceKeys = squareCount * piecesPerSquare;
  const turnKeys = variant.numPlayers;
  const castlingKeys = variant.numPlayers * 2; // kingside + queenside per player
  const epKeys = squareCount; // EP target square
  const variantKeys = 1; // ensures variant identity is always part of hash

  const offsets = {
    piece: 0,
    turn: pieceKeys,
    castling: pieceKeys + turnKeys,
    ep: pieceKeys + turnKeys + castlingKeys,
    variant: pieceKeys + turnKeys + castlingKeys + epKeys,
  };

  const total = pieceKeys + turnKeys + castlingKeys + epKeys + variantKeys;
  const keys = new BigUint64Array(total);
  const next64 = makeRng(seedFromString(signature));

  for (let i = 0; i < total; i++) {
    keys[i] = next64();
  }

  const table: ZobristTable = { keys, offsets, squareCount, piecesPerSquare, signature };
  TABLE_CACHE.set(signature, table);
  return table;
}

function getPieceIndex(piece: number, numPlayers: number): number {
  if (piece === PieceType.EMPTY) return -1;

  const type = getType(piece);
  const color = getColor(piece);
  if (type < PieceType.PAWN || type > PieceType.KING) return -1;
  if (color < 0 || color >= numPlayers) return -1;

  return color * 6 + (type - 1);
}

/**
 * Computes a full Zobrist hash for the current position.
 *
 * Hash components:
 * - variant identity + dimensions + player count
 * - pieces on valid squares
 * - active turn (per player index)
 * - castling rights (per player, both sides)
 * - en-passant target square
 */
export function computeHash(board: Board, state: GameState): bigint {
  const table = getTable(board.variant);
  const { keys, offsets, piecesPerSquare } = table;
  let hash = 0n;

  // Variant identity
  hash ^= keys[offsets.variant];

  // Pieces
  for (let sq = 0; sq < board.squares.length; sq++) {
    if (board.validSquares[sq] === 0) continue;
    const piece = board.getByIndex(sq);
    const pieceIndex = getPieceIndex(piece, board.variant.numPlayers);
    if (pieceIndex === -1) continue;
    hash ^= keys[offsets.piece + (sq * piecesPerSquare) + pieceIndex];
  }

  // Turn
  if (typeof state.turn === 'number' && state.turn >= 0 && state.turn < board.variant.numPlayers) {
    hash ^= keys[offsets.turn + state.turn];
  }

  // Castling rights (per player)
  for (let p = 0; p < board.variant.numPlayers; p++) {
    const rights = state.castling?.[p];
    if (!rights) continue;
    if (rights.kingside) hash ^= keys[offsets.castling + (p * 2)];
    if (rights.queenside) hash ^= keys[offsets.castling + (p * 2) + 1];
  }

  // En passant target
  if (typeof state.epSquare === 'number' && board.isValidSquare(state.epSquare)) {
    hash ^= keys[offsets.ep + state.epSquare];
  }

  return hash;
}

function resolveVariantForXor(context: any): VariantConfig {
  if (context?.variant) return context.variant;
  if (context?.width && context?.height && context?.numPlayers) return context;
  return STANDARD;
}

export function xorPiece(hash: bigint, sq: Square, piece: number, context: any = STANDARD): bigint {
  const variant = resolveVariantForXor(context);
  const table = getTable(variant);
  const pieceIndex = getPieceIndex(piece, variant.numPlayers);
  if (pieceIndex === -1) return hash;
  return hash ^ table.keys[table.offsets.piece + (sq * table.piecesPerSquare) + pieceIndex];
}

export function xorTurn(hash: bigint, turn: number, context: any = STANDARD): bigint {
  const variant = resolveVariantForXor(context);
  if (typeof turn !== 'number' || turn < 0 || turn >= variant.numPlayers) return hash;
  const table = getTable(variant);
  return hash ^ table.keys[table.offsets.turn + turn];
}

export function xorCastle(hash: bigint, playerIndex: number, side: 'kingside' | 'queenside', context: any = STANDARD): bigint {
  const variant = resolveVariantForXor(context);
  if (typeof playerIndex !== 'number' || playerIndex < 0 || playerIndex >= variant.numPlayers) return hash;
  const sideOffset = side === 'queenside' ? 1 : 0;
  const table = getTable(variant);
  return hash ^ table.keys[table.offsets.castling + (playerIndex * 2) + sideOffset];
}

export function xorEP(hash: bigint, epSquare: Square | null, context: any = STANDARD): bigint {
  const variant = resolveVariantForXor(context);
  if (typeof epSquare !== 'number' || epSquare < 0 || epSquare >= (variant.width * variant.height)) return hash;
  const table = getTable(variant);
  return hash ^ table.keys[table.offsets.ep + epSquare];
}
