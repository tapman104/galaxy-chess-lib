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
  width: 8,
  height: 8,
  numPlayers: 2,
  pawnForward: [8, -8], 
  promoRank: [7, 0],    
  startRank: [1, 6],    
});

export const FOUR_PLAYER = Object.freeze({
  name: '4player',
  width: 14,
  height: 14,
  numPlayers: 4,
  // Order: 0:Red, 1:Blue, 2:Yellow, 3:Green
  pawnForward: [14, 1, -14, -1], 
  promoRank: [13, 13, 0, 0], // Rank 13 for Red, File 13 for Blue, Rank 0 for Yellow, File 0 for Green
  startRank: [1, 1, 12, 12], // Rank 1 for Red, File 1 for Blue, Rank 12 for Yellow, File 12 for Green
  cornerMask: 3,
});

export function getPiece(color, type) {
  return (color << 3) | type;
}

export function getColor(piece) {
  return (piece >> 3) & 0x7;
}

export function getType(piece) {
  return piece & 7;
}

