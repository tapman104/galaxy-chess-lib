import { STANDARD, FOUR_PLAYER, Pieces, getColor, getType, getPiece } from './variants.js';
import { VariantConfig, Square, AlgebraicSquare, Color, PieceType } from '../types.js';

export { Pieces, getColor, getType, getPiece };

/**
 * Board — Variant-aware state container
 */
export class Board {
  public variant: VariantConfig;
  public width: number;
  public height: number;
  public squares: Int8Array;
  public validSquares: Uint8Array;
  public pieceList: Set<Square>[];

  constructor(variant: VariantConfig = STANDARD) {
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
    this.pieceList = Array.from({ length: variant.numPlayers }, () => new Set<Square>());
  }

  /** @private */
  private _applyCornerMask(maskSize: number): void {
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

  public getByIndex(idx: Square): number {
    return this.squares[idx];
  }

  public setByIndex(idx: Square, piece: number): void {
    const prev = this.squares[idx];
    if (prev !== PieceType.EMPTY) {
      this.pieceList[getColor(prev)].delete(idx);
    }

    this.squares[idx] = piece;
    if (piece !== PieceType.EMPTY) {
      const color = getColor(piece);
      if (this.pieceList[color]) {
        this.pieceList[color].add(idx);
      }
    }
  }

  public removeByIndex(idx: Square): void {
    this.setByIndex(idx, PieceType.EMPTY);
  }

  public isValidSquare(idx: Square): boolean {
    return idx >= 0 && idx < this.squares.length && this.validSquares[idx] === 1;
  }

  public getPieces(colorIndex: number): Set<Square> {
    return this.pieceList[colorIndex];
  }

  public hasPiece(idx: Square): boolean {
    return this.squares[idx] !== PieceType.EMPTY;
  }

  public isEnemy(idx: Square, myColorIndex: number): boolean {
    const p = this.squares[idx];
    if (p === PieceType.EMPTY) return false;
    return getColor(p) !== myColorIndex;
  }

  // ═══════════════════════════════════════════════════════════════════
  // COORDINATES
  // ═══════════════════════════════════════════════════════════════════

  public file(idx: Square): number { return idx % this.width; }
  public rank(idx: Square): number { return Math.floor(idx / this.width); }

  public index(file: number, rank: number): Square {
    return rank * this.width + file;
  }

  // ═══════════════════════════════════════════════════════════════════
  // VALIDATION & CONVERSION
  // ═══════════════════════════════════════════════════════════════════

  public algebraicToIndex(alg: AlgebraicSquare): Square {
    const file = alg.charCodeAt(0) - 97; // 'a'
    const rank = parseInt(alg.slice(1)) - 1;
    const idx = this.index(file, rank);
    if (!this.isValidSquare(idx)) {
      throw new Error(`Invalid algebraic square: ${alg}`);
    }
    return idx;
  }

  public indexToAlgebraic(idx: Square): AlgebraicSquare {
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

  public clone(): Board {
    const copy = new Board(this.variant);
    copy.squares = new Int8Array(this.squares);
    for (let i = 0; i < this.pieceList.length; i++) {
      copy.pieceList[i] = new Set(this.pieceList[i]);
    }
    return copy;
  }

  public clear(): void {
    this.squares.fill(PieceType.EMPTY);
    for (const set of this.pieceList) set.clear();
  }

  public setup(): void {
    this.clear();
    if (this.variant.name === STANDARD.name) {
      this._setupStandard();
    } else if (this.variant.name === FOUR_PLAYER.name) {
      this._setupFourPlayer();
    } else {
      throw new Error(`Unsupported setup variant: ${this.variant.name}`);
    }
  }

  private _setupStandard(): void {
    const pieces = [Pieces.ROOK, Pieces.KNIGHT, Pieces.BISHOP, Pieces.QUEEN, Pieces.KING, Pieces.BISHOP, Pieces.KNIGHT, Pieces.ROOK];
    
    for (let f = 0; f < 8; f++) {
      this.setByIndex(this.index(f, 0), getPiece(Color.WHITE, pieces[f]));
      this.setByIndex(this.index(f, 1), getPiece(Color.WHITE, Pieces.PAWN));
      this.setByIndex(this.index(f, 6), getPiece(Color.BLACK, Pieces.PAWN));
      this.setByIndex(this.index(f, 7), getPiece(Color.BLACK, pieces[f]));
    }
  }

  private _setupFourPlayer(): void {
    const pieces = [Pieces.ROOK, Pieces.KNIGHT, Pieces.BISHOP, Pieces.QUEEN, Pieces.KING, Pieces.BISHOP, Pieces.KNIGHT, Pieces.ROOK];
    
    // RED (Bottom, Color 0): Rows 0, 1. Cols 3-10
    for (let f = 3; f <= 10; f++) {
      this.setByIndex(this.index(f, 0), getPiece(Color.RED, pieces[f - 3]));
      this.setByIndex(this.index(f, 1), getPiece(Color.RED, Pieces.PAWN));
    }
    // BLUE (Left, Color 1): Cols 0, 1. Rows 3-10 (moving Right)
    for (let r = 3; r <= 10; r++) {
      this.setByIndex(this.index(0, r), getPiece(Color.BLUE, pieces[r - 3]));
      this.setByIndex(this.index(1, r), getPiece(Color.BLUE, Pieces.PAWN));
    }
    // YELLOW (Top, Color 2): Rows 13, 12. Cols 3-10 (moving Down)
    for (let f = 3; f <= 10; f++) {
      this.setByIndex(this.index(f, 13), getPiece(Color.YELLOW, pieces[f - 3]));
      this.setByIndex(this.index(f, 12), getPiece(Color.YELLOW, Pieces.PAWN));
    }
    // GREEN (Right, Color 3): Cols 13, 12. Rows 3-10 (moving Left)
    for (let r = 3; r <= 10; r++) {
      this.setByIndex(this.index(13, r), getPiece(Color.GREEN, pieces[r - 3]));
      this.setByIndex(this.index(12, r), getPiece(Color.GREEN, Pieces.PAWN));
    }
  }

  public toString(): string {
    const SYMBOLS: Record<number, string> = {
      [PieceType.PAWN]: 'p', [PieceType.KNIGHT]: 'n', [PieceType.BISHOP]: 'b',
      [PieceType.ROOK]: 'r', [PieceType.QUEEN]: 'q', [PieceType.KING]: 'k',
      [PieceType.EMPTY]: '·',
    };
    
    const rows: string[] = [];
    for (let r = this.height - 1; r >= 0; r--) {
      let row = `${String(r + 1).padStart(2, ' ')} │`;
      for (let f = 0; f < this.width; f++) {
        const idx = this.index(f, r);
        if (this.validSquares[idx] === 0) {
          row += '  ';
          continue;
        }
        const p = this.squares[idx];
        const char = p === PieceType.EMPTY ? '·' : SYMBOLS[getType(p)];
        // Simplified visual: 0=WHITE, 1=BLACK, 2=BLUE, 3=GREEN
        const renderChar = p === PieceType.EMPTY ? '·' : (getColor(p) === 0 ? char.toUpperCase() : char);
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

  public static type(piece: number): number { return getType(piece); }
  public static color(piece: number): number { return getColor(piece); }
  public static isColor(piece: number, colorIndex: number): boolean { return getColor(piece) === colorIndex; }
}
