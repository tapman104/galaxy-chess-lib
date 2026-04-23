import { Board, Pieces, getType, getColor, getPiece } from '../core/board.js';
import { GameState } from '../state/gameState.js';
import { STANDARD, FOUR_PLAYER, resolveVariant } from '../core/variants.js';
import { VariantConfig } from '../types.js';

function getPieceChar(piece: number): string {
  const type = getType(piece);
  const color = getColor(piece);
  const chars: Record<number, string> = {
    [Pieces.PAWN]:   'p', [Pieces.KNIGHT]: 'n', [Pieces.BISHOP]: 'b',
    [Pieces.ROOK]:   'r', [Pieces.QUEEN]:  'q', [Pieces.KING]:   'k',
  };
  const char = chars[type] || '?';
  // Red/White=0, Blue=1, Yellow/Black=2, Green=3
  // Standard FEN only supports 2 colors (Upper/Lower). 
  // For simplicity here: 0=Upper, else=Lower. (Temporary, might need better mapping)
  return color === 0 ? char.toUpperCase() : char;
}

function charToPiece(char: string, variant: VariantConfig): number {
  const lower = char.toLowerCase();
  const isUpper = char === char.toUpperCase();
  // Map color based on variant and case
  let color = isUpper ? 0 : 1; 
  if (variant.name === FOUR_PLAYER.name) {
      // In 4P FEN, often colors are explicitly marked or we use different chars.
      // For this implementation, we'll assume a simplified mapping or just 2 colors for now.
  }
  const types: Record<string, number> = {
    p: Pieces.PAWN, n: Pieces.KNIGHT, b: Pieces.BISHOP,
    r: Pieces.ROOK, q: Pieces.QUEEN, k: Pieces.KING,
  };
  return getPiece(color, types[lower]);
}

/**
 * Generate FEN string from current board and game state.
 */
export function exportFEN(board: Board, state: GameState): string {
  const rows: string[] = [];
  for (let r = board.height - 1; r >= 0; r--) {
    let row = '';
    let empty = 0;
    for (let f = 0; f < board.width; f++) {
      const idx = board.index(f, r);
      if (board.validSquares[idx] === 0) {
        if (empty > 0) { row += empty; empty = 0; }
        row += 'X';
        continue;
      }
      const p = board.getByIndex(idx);
      if (p === Pieces.EMPTY) {
        empty++;
      } else {
        if (empty > 0) { row += empty; empty = 0; }
        row += getPieceChar(p);
      }
    }
    if (empty > 0) row += empty;
    rows.push(row);
  }

  const turnChars = ['w', 'b', 'y', 'g'];
  const parts = [
    rows.join('/'),
    turnChars[state.turn] || 'w',
    getCastlingStr(state.castling, board.variant),
    state.epSquare === null ? '-' : board.indexToAlgebraic(state.epSquare),
    state.halfmoveClock,
    state.fullmoveNumber
  ];

  return parts.join(' ');
}

/**
 * Parse a FEN string and return Board and GameState objects.
 */
export function parseFEN(fen: string, variant: VariantConfig | null = STANDARD): { board: Board, state: GameState } {
  const resolvedVariant = resolveVariant(variant || STANDARD);
  const parts = fen.trim().split(/\s+/);
  if (parts.length < 2) throw new Error('Invalid FEN');

  const [pos, turn, castling, ep, halfmove = '0', fullmove = '1'] = parts;

  const board = new Board(resolvedVariant);
  const rows = pos.split('/');
  
  for (let r = 0; r < board.height; r++) {
    const rank = board.height - 1 - r;
    let file = 0;
    const rowStr = rows[r];
    if (!rowStr) continue;

    for (let i = 0; i < rowStr.length; i++) {
      const char = rowStr[i];
      if (char === 'X') {
        file++;
      } else if (/\d/.test(char)) {
        let numStr = char;
        while (i + 1 < rowStr.length && /\d/.test(rowStr[i + 1])) {
          numStr += rowStr[++i];
        }
        file += parseInt(numStr);
      } else {
        const piece = charToPiece(char, resolvedVariant);
        board.setByIndex(board.index(file, rank), piece);
        file++;
      }
    }
  }

  const state = new GameState(resolvedVariant);
  const turnMap: Record<string, number> = { w: 0, b: 1, y: 2, g: 3 };
  state.turn = turnMap[turn] || 0;
  state.castling = Array.from({ length: resolvedVariant.numPlayers }, () => ({
    kingside: false,
    queenside: false,
  }));
  
  // Castling
  if (resolvedVariant.name === STANDARD.name && castling !== '-') {
    for (const char of castling) {
      if (char === 'K') state.castling[0].kingside = true;
      if (char === 'Q') state.castling[0].queenside = true;
      if (char === 'k') state.castling[1].kingside = true;
      if (char === 'q') state.castling[1].queenside = true;
    }
  } else if (resolvedVariant.name === FOUR_PLAYER.name && castling !== '-' && castling.length === 8) {
    for (let i = 0; i < 4; i++) {
      state.castling[i].kingside  = castling[i * 2]     === 'K';
      state.castling[i].queenside = castling[i * 2 + 1] === 'Q';
    }
  }

  state.epSquare = ep === '-' ? null : board.algebraicToIndex(ep);
  state.halfmoveClock = parseInt(halfmove);
  state.fullmoveNumber = parseInt(fullmove);

  return { board, state };
}

function getCastlingStr(castling: { kingside: boolean, queenside: boolean }[], variant: VariantConfig): string {
  if (variant.name === 'standard') {
    let s = '';
    if (castling[0].kingside)  s += 'K';
    if (castling[0].queenside) s += 'Q';
    if (castling[1].kingside)  s += 'k';
    if (castling[1].queenside) s += 'q';
    return s === '' ? '-' : s;
  }
  if (variant.name === '4player') {
    // 8-char encoding: two chars per player — 'K' or '_' then 'Q' or '_'
    const s = castling.map(c => `${c.kingside ? 'K' : '_'}${c.queenside ? 'Q' : '_'}`).join('');
    return s === '________' ? '-' : s;
  }
  return '-';
}
