import { STANDARD, FOUR_PLAYER, TYPES, COLORS, getColor, getType, getPiece } from './variants.js';

export { TYPES as Pieces, COLORS, getColor, getType, getPiece };

/**
 * Board — Variant-aware state container
 */
export class Board {
  constructor(variant = STANDARD) {
    this.variant = variant;
    this.width = variant.width;
    this.height = variant.height;
    
    // Board storage
    this.squares = new Int8Array(this.width * this.height);
    
    // Mask for valid squares (0 = invalid/corner, 1 = valid)
    this.validSquares = new Uint8Array(this.width * this.height).fill(1);
    if (variant.cornerMask) {
      this._applyCornerMask(variant.cornerMask);
    }

    // Piece lists for each player (Set of indices)
    this.pieceList = Array.from({ length: variant.numPlayers }, () => new Set());
  }

  /** @private */
  _applyCornerMask(maskSize) {
    // Top-left: (0,0) to (2,2) for 3x3
    // Bottom-left: (0, height-mask) to (mask-1, height-1)
    // Actually, chess rank 1 is BOTTOM. Rank 14 is TOP.
    // Index increases: a1 (left-bottom) = 0, a14 (left-top) = (14*13) = 182?
    // Let's use rank 0-13, file 0-13.
    // Red (Bottom): Ranks 0,1. 
    // corners are (0,0) to (mask-1, mask-1), (width-mask, 0) to (width-1, mask-1), etc.
    for (let r = 0; r < this.height; r++) {
      for (let f = 0; f < this.width; f++) {
        const isCorner = 
          (r < maskSize && f < maskSize) || // Lower Left
          (r < maskSize && f >= this.width - maskSize) || // Lower Right
          (r >= this.height - maskSize && f < maskSize) || // Upper Left
          (r >= this.height - maskSize && f >= this.width - maskSize); // Upper Right
        if (isCorner) {
          this.validSquares[r * this.width + f] = 0;
        }
      }
    }
  }

  // ═══════════════════════════════════════════════════════════════════
  // ENGINE LAYER
  // ═══════════════════════════════════════════════════════════════════

  getByIndex(idx) {
    return this.squares[idx];
  }

  setByIndex(idx, piece) {
    const prev = this.squares[idx];
    if (prev !== TYPES.EMPTY) {
      this.pieceList[getColor(prev)].delete(idx);
    }

    this.squares[idx] = piece;
    if (piece !== TYPES.EMPTY) {
      this.pieceList[getColor(piece)].add(idx);
    }
  }

  removeByIndex(idx) {
    this.setByIndex(idx, TYPES.EMPTY);
  }

  isValidSquare(idx) {
    return idx >= 0 && idx < this.squares.length && this.validSquares[idx] === 1;
  }

  getPieces(colorIndex) {
    return this.pieceList[colorIndex];
  }

  hasPiece(idx) {
    return this.squares[idx] !== TYPES.EMPTY;
  }

  isEnemy(idx, myColorIndex) {
    const p = this.squares[idx];
    if (p === TYPES.EMPTY) return false;
    return getColor(p) !== myColorIndex;
  }

  // ═══════════════════════════════════════════════════════════════════
  // COORDINATES
  // ═══════════════════════════════════════════════════════════════════

  file(idx) { return idx % this.width; }
  rank(idx) { return Math.floor(idx / this.width); }

  index(file, rank) {
    return rank * this.width + file;
  }

  // ═══════════════════════════════════════════════════════════════════
  // VALIDATION & CONVERSION
  // ═══════════════════════════════════════════════════════════════════

  /**
   * algebraicToIndex('a1')
   * Standard: 'a1' -> 0, 'h8' -> 63
   * 4-Player: 'a1' -> 0, 'n14' -> 195
   */
  algebraicToIndex(alg) {
    const file = alg.charCodeAt(0) - 97; // 'a'
    const rank = parseInt(alg.slice(1)) - 1;
    const idx = this.index(file, rank);
    if (!this.isValidSquare(idx)) {
      throw new Error(`Invalid algebraic square: ${alg}`);
    }
    return idx;
  }

  indexToAlgebraic(idx) {
    if (!this.isValidSquare(idx)) {
      throw new Error(`Invalid index for variant: ${idx}`);
    }
    const f = this.file(idx);
    const r = this.rank(idx);
    return String.fromCharCode(97 + f) + (r + 1);
  }

  // ═══════════════════════════════════════════════════════════════════
  // STATE OPS
  // ═══════════════════════════════════════════════════════════════════

  clone() {
    const copy = new Board(this.variant);
    copy.squares = new Int8Array(this.squares);
    for (let i = 0; i < this.pieceList.length; i++) {
      copy.pieceList[i] = new Set(this.pieceList[i]);
    }
    return copy;
  }

  clear() {
    this.squares.fill(TYPES.EMPTY);
    for (const set of this.pieceList) set.clear();
  }

  setup() {
    this.clear();
    if (this.variant === STANDARD) {
      this._setupStandard();
    } else if (this.variant === FOUR_PLAYER) {
      this._setupFourPlayer();
    }
  }

  _setupStandard() {
    const pieces = [TYPES.ROOK, TYPES.KNIGHT, TYPES.BISHOP, TYPES.QUEEN, TYPES.KING, TYPES.BISHOP, TYPES.KNIGHT, TYPES.ROOK];
    
    for (let f = 0; f < 8; f++) {
      this.setByIndex(this.index(f, 0), (0 << 3) | pieces[f]);
      this.setByIndex(this.index(f, 1), (0 << 3) | TYPES.PAWN);
      this.setByIndex(this.index(f, 6), (1 << 3) | TYPES.PAWN);
      this.setByIndex(this.index(f, 7), (1 << 3) | pieces[f]);
    }
  }


  _setupFourPlayer() {
    const pieces = [TYPES.ROOK, TYPES.KNIGHT, TYPES.BISHOP, TYPES.QUEEN, TYPES.KING, TYPES.BISHOP, TYPES.KNIGHT, TYPES.ROOK];
    
    // RED (Bottom, Color 0): Rows 0, 1. Cols 3-10
    for (let f = 3; f <= 10; f++) {
      this.setByIndex(this.index(f, 0), (0 << 3) | pieces[f - 3]);
      this.setByIndex(this.index(f, 1), (0 << 3) | TYPES.PAWN);
    }
    // BLUE (Left, Color 1): Cols 0, 1. Rows 3-10 (moving Right)
    for (let r = 3; r <= 10; r++) {
      this.setByIndex(this.index(0, r), (1 << 3) | pieces[r - 3]);
      this.setByIndex(this.index(1, r), (1 << 3) | TYPES.PAWN);
    }
    // YELLOW (Top, Color 2): Rows 13, 12. Cols 3-10 (moving Down)
    for (let f = 3; f <= 10; f++) {
      this.setByIndex(this.index(f, 13), (2 << 3) | pieces[f - 3]);
      this.setByIndex(this.index(f, 12), (2 << 3) | TYPES.PAWN);
    }
    // GREEN (Right, Color 3): Cols 13, 12. Rows 3-10 (moving Left)
    for (let r = 3; r <= 10; r++) {
      this.setByIndex(this.index(13, r), (3 << 3) | pieces[r - 3]);
      this.setByIndex(this.index(12, r), (3 << 3) | TYPES.PAWN);
    }
  }


  // ═══════════════════════════════════════════════════════════════════
  // DEBUGGING
  // ═══════════════════════════════════════════════════════════════════

  toString() {
    const SYMBOLS = {
      [TYPES.PAWN]: 'p', [TYPES.KNIGHT]: 'n', [TYPES.BISHOP]: 'b',
      [TYPES.ROOK]: 'r', [TYPES.QUEEN]: 'q', [TYPES.KING]: 'k',
      [TYPES.EMPTY]: '·',
    };
    
    const rows = [];
    for (let r = this.height - 1; r >= 0; r--) {
      let row = `${String(r + 1).padStart(2, ' ')} │`;
      for (let f = 0; f < this.width; f++) {
        const idx = this.index(f, r);
        if (this.validSquares[idx] === 0) {
          row += '  ';
          continue;
        }
        const p = this.squares[idx];
        const char = p === TYPES.EMPTY ? '·' : SYMBOLS[getType(p)];
        const colorPrefix = p === TYPES.EMPTY ? '' : getColor(p);
        // Simplified visual: color as background or prefix? Let's just use CASE.
        // 0=WHITE, 1=BLACK, 2=BLUE, 3=GREEN
        const renderChar = p === TYPES.EMPTY ? '·' : (getColor(p) === 0 ? char.toUpperCase() : char);
        row += ` ${renderChar}`;
      }
      rows.push(row);
    }
    
    let footer = '     ';
    for (let f = 0; f < this.width; f++) {
      footer += String.fromCharCode(97 + f) + ' ';
    }

    return [
      footer,
      '   ' + '──'.repeat(this.width),
      ...rows,
      '   ' + '──'.repeat(this.width),
    ].join('\n');
  }

  static type(piece) { return getType(piece); }
  static color(piece) { return getColor(piece); }
  static isColor(piece, colorIndex) { return getColor(piece) === colorIndex; }
}

