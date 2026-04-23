import { PieceType, Color, VariantConfig } from '../types.js';

/**
 * Piece Type Constants (3 bits: 1-6)
 */
export const Pieces = Object.freeze({
  EMPTY:  PieceType.EMPTY,
  PAWN:   PieceType.PAWN,
  KNIGHT: PieceType.KNIGHT,
  BISHOP: PieceType.BISHOP,
  ROOK:   PieceType.ROOK,
  QUEEN:  PieceType.QUEEN,
  KING:   PieceType.KING,
} as const);

export const TYPES = Pieces;

/**
 * Color Constants (3 bits)
 * 4-Player Order: Red (Bottom) -> Blue (Left) -> Yellow (Top) -> Green (Right)
 */
export const COLORS = Object.freeze({
  RED:    Color.RED, WHITE:  Color.WHITE, // Standard White
  BLUE:   Color.BLUE, BLACK:  Color.BLACK, // Standard Black
  YELLOW: Color.YELLOW,
  GREEN:  Color.GREEN,
} as const);

// Bit-field constants for piece encoding
export const COLOR_SHIFT = 3;
export const TYPE_MASK = 0x7; // lower 3 bits

/**
 * Variant Configurations
 */
export const STANDARD: VariantConfig = Object.freeze({
  name: 'standard',
  version: 1,
  id: 'standard@v1',
  width: 8,
  height: 8,
  numPlayers: 2,
  pawnForward: [8, -8], 
  promoRank: [7, 0],    
  startRank: [1, 6],    
  playerLabels: ['White', 'Black'],
  turnLabels: ['W', 'B'],
});

export const FOUR_PLAYER: VariantConfig = Object.freeze({
  name: '4player',
  version: 1,
  id: '4player@v1',
  width: 14,
  height: 14,
  numPlayers: 4,
  // Order: 0:Red, 1:Blue, 2:Yellow, 3:Green
  pawnForward: [14, 1, -14, -1], 
  promoRank: [13, 13, 0, 0], 
  startRank: [1, 1, 12, 12], 
  cornerMask: 3,
  playerLabels: ['Red', 'Blue', 'Yellow', 'Green'],
  turnLabels: ['R', 'B', 'Y', 'G'],
});

export interface CastlingConfig {
  rK: number;
  rKTo: number;
  kK: number;
  rQ: number;
  rQTo: number;
  kQ: number;
  emptyK: number[];
  emptyQ: number[];
}

/**
 * Castling square config for the 4-player variant (14×14 board).
 */
/**
 * Castling square config for the 4-player variant (14×14 board).
 *
 * Board linear indexing is `index = rank * width + file` where `file` ranges
 * from 0..(width-1) left-to-right and `rank` ranges from 0..(height-1) bottom-to-top.
 * For the 14×14 4-player board `width === 14`.
 *
 * The `FOUR_PLAYER_CASTLE` entries use linear indices; below we annotate each
 * numeric index with its (file,rank) coordinate to make the layout explicit.
 */
export const FOUR_PLAYER_CASTLE: readonly CastlingConfig[] = Object.freeze([
  // Color 0: Red
  // indices -> (file,rank) with width=14:
  // rK:10 -> (10,0), rKTo:8 -> (8,0), kK:9 -> (9,0)
  // rQ:3 -> (3,0), rQTo:6 -> (6,0), kQ:5 -> (5,0)
  // emptyK: [8,9] -> (8,0),(9,0)
  // emptyQ: [4,5,6] -> (4,0),(5,0),(6,0)
  { rK:  10, rKTo:   8, kK:   9, rQ:   3, rQTo:   6, kQ:   5, emptyK: [8, 9],         emptyQ: [4, 5, 6]         },
  // Color 1: Blue
  // rK:140 -> (0,10), rKTo:112 -> (0,8), kK:126 -> (0,9)
  // rQ:42 -> (0,3), rQTo:84 -> (0,6), kQ:70 -> (0,5)
  // emptyK: [112,126] -> (0,8),(0,9)
  // emptyQ: [56,70,84] -> (0,4),(0,5),(0,6)
  { rK: 140, rKTo: 112, kK: 126, rQ:  42, rQTo:  84, kQ:  70, emptyK: [112, 126],      emptyQ: [56, 70, 84]      },
  // Color 2: Yellow
  // rK:192 -> (10,13), rKTo:190 -> (8,13), kK:191 -> (9,13)
  // rQ:185 -> (3,13), rQTo:188 -> (6,13), kQ:187 -> (5,13)
  // emptyK: [190,191] -> (8,13),(9,13)
  // emptyQ: [186,187,188] -> (4,13),(5,13),(6,13)
  { rK: 192, rKTo: 190, kK: 191, rQ: 185, rQTo: 188, kQ: 187, emptyK: [190, 191],      emptyQ: [186, 187, 188]   },
  // Color 3: Green
  // rK:153 -> (13,10), rKTo:125 -> (13,8), kK:139 -> (13,9)
  // rQ:55 -> (13,3), rQTo:97 -> (13,6), kQ:83 -> (13,5)
  // emptyK: [125,139] -> (13,8),(13,9)
  // emptyQ: [69,83,97] -> (13,4),(13,5),(13,6)
  { rK: 153, rKTo: 125, kK: 139, rQ:  55, rQTo:  97, kQ:  83, emptyK: [125, 139],      emptyQ: [69, 83, 97]      },
]);

// Variant registry and helpers
const VARIANT_REGISTRY = new Map<string, VariantConfig>();

/**
 * Register a variant into the registry using normalized keys.
 * Keys registered: `id` (if present) and `name` (lowercased/trimmed).
 */
export function registerVariant(v: VariantConfig): void {
  const idKey = v.id || variantId(v);
  const nameKey = (v.name || '').toString().trim().toLowerCase();
  VARIANT_REGISTRY.set(idKey, v);
  if (nameKey) VARIANT_REGISTRY.set(nameKey, v);
}

// register built-in variants
registerVariant(STANDARD);
registerVariant(FOUR_PLAYER);

// Build a frozen lookup object from the registry for convenience
const _variantsObj: Record<string, VariantConfig> = {};
for (const [k, v] of VARIANT_REGISTRY) _variantsObj[k] = v;
export const variants = Object.freeze(_variantsObj as Record<string, VariantConfig>);

export function variantId(variant: Partial<VariantConfig>): string {
  if (variant?.id) return variant.id;
  const name = variant?.name || 'custom';
  const version = typeof variant?.version === 'number' ? variant.version : 1;
  return `${name}@v${version}`;
}

export function resolveVariant(input: string | Partial<VariantConfig> = STANDARD): VariantConfig {
  if (!input) return STANDARD;

  if (typeof input === 'string') {
    const key = input.trim().toLowerCase();
    const resolved = VARIANT_REGISTRY.get(key);
    if (resolved) return resolved;
    throw new Error(`Invalid variant: ${input}`);
  }

  if (typeof input !== 'object') {
    throw new Error(`Invalid variant: ${String(input)}`);
  }

  if (input.id && VARIANT_REGISTRY.has(input.id)) {
    return VARIANT_REGISTRY.get(input.id)!;
  }

  const normalized = {
    ...input,
    version: typeof input.version === 'number' ? input.version : 1,
  } as VariantConfig;
  normalized.id = input.id || variantId(normalized);
  return Object.freeze(normalized);
}

export function getPiece(color: Color | number, type: PieceType | number): number {
  /** Encodes a piece as (color << COLOR_SHIFT) | type */
  return (color << COLOR_SHIFT) | type;
}

export function getColor(piece: number): number {
  return (piece >> COLOR_SHIFT) & TYPE_MASK;
}

export function getType(piece: number): number {
  return piece & TYPE_MASK;
}
