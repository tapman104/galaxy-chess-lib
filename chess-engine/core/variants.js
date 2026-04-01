/**
 * Piece Type Constants (3 bits: 1-6)
 */
export const TYPES = Object.freeze({
  EMPTY:  0,
  PAWN:   1,
  KNIGHT: 2,
  BISHOP: 3,
  ROOK:   4,
  QUEEN:  5,
  KING:   6,
});

/**
 * Color Constants (3 bits)
 * 4-Player Order: Red (Bottom) -> Blue (Left) -> Yellow (Top) -> Green (Right)
 */
export const COLORS = Object.freeze({
  RED:    0, WHITE:  0, // Standard White
  BLUE:   1, 
  YELLOW: 2, BLACK:  2, // Standard Black
  GREEN:  3,
});

/**
 * Variant Configurations
 */
export const STANDARD = Object.freeze({
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

export const FOUR_PLAYER = Object.freeze({
  name: '4player',
  version: 1,
  id: '4player@v1',
  width: 14,
  height: 14,
  numPlayers: 4,
  // Order: 0:Red, 1:Blue, 2:Yellow, 3:Green
  pawnForward: [14, 1, -14, -1], 
  promoRank: [13, 13, 0, 0], // Rank 13 for Red, File 13 for Blue, Rank 0 for Yellow, File 0 for Green
  startRank: [1, 1, 12, 12], // Rank 1 for Red, File 1 for Blue, Rank 12 for Yellow, File 12 for Green
  cornerMask: 3,
  playerLabels: ['Red', 'Blue', 'Yellow', 'Green'],
  turnLabels: ['R', 'B', 'Y', 'G'],
});

/**
 * Castling square config for the 4-player variant (14×14 board).
 * index(f, r) = r * 14 + f
 *
 * For each player: rK/rQ = original rook squares; rKTo/rQTo = rook destinations;
 * kK/kQ = king destinations; emptyK/emptyQ = squares that must be vacant.
 */
export const FOUR_PLAYER_CASTLE = Object.freeze([
  // Color 0: Red — back rank 0, pieces at files 3–10
  { rK:  10, rKTo:   8, kK:   9, rQ:   3, rQTo:   6, kQ:   5, emptyK: [8, 9],         emptyQ: [4, 5, 6]         },
  // Color 1: Blue — back file 0, pieces at ranks 3–10
  { rK: 140, rKTo: 112, kK: 126, rQ:  42, rQTo:  84, kQ:  70, emptyK: [112, 126],      emptyQ: [56, 70, 84]      },
  // Color 2: Yellow — back rank 13, pieces at files 3–10
  { rK: 192, rKTo: 190, kK: 191, rQ: 185, rQTo: 188, kQ: 187, emptyK: [190, 191],      emptyQ: [186, 187, 188]   },
  // Color 3: Green — back file 13, pieces at ranks 3–10
  { rK: 153, rKTo: 125, kK: 139, rQ:  55, rQTo:  97, kQ:  83, emptyK: [125, 139],      emptyQ: [69, 83, 97]      },
]);

const VARIANT_REGISTRY = new Map([
  [STANDARD.id, STANDARD],
  [STANDARD.name, STANDARD],
  [FOUR_PLAYER.id, FOUR_PLAYER],
  [FOUR_PLAYER.name, FOUR_PLAYER],
]);

export const variants = Object.freeze({
  [STANDARD.id]: STANDARD,
  [FOUR_PLAYER.id]: FOUR_PLAYER,
  standard: STANDARD,
  '4player': FOUR_PLAYER,
});

export function variantId(variant) {
  if (variant?.id) return variant.id;
  const name = variant?.name || 'custom';
  const version = Number.isInteger(variant?.version) ? variant.version : 1;
  return `${name}@v${version}`;
}

export function resolveVariant(input = STANDARD) {
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
    return VARIANT_REGISTRY.get(input.id);
  }

  const normalized = {
    ...input,
    version: Number.isInteger(input.version) ? input.version : 1,
  };
  normalized.id = input.id || variantId(normalized);
  return Object.freeze(normalized);
}

export function getPiece(color, type) {
  return (color << 3) | type;
}

export function getColor(piece) {
  return (piece >> 3) & 0x7;
}

export function getType(piece) {
  return piece & 7;
}
