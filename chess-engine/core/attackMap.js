import { Board, Pieces, getType, getColor } from './board.js';

/**
 * Checks if a square is attacked by any piece of the given color index.
 * 
 * @param {Board} board
 * @param {number} sq — Target square index
 * @param {number} attackerColor — Color index (0-3)
 * @returns {boolean}
 */
export function isSquareAttacked(board, sq, attackerColor) {
  const width = board.width;
  
  // 1. KNIGHTS
  const knightDeltas = [[2,1],[2,-1],[-2,1],[-2,-1],[1,2],[1,-2],[-1,2],[-1,-2]];
  for (const [df, dr] of knightDeltas) {
    const f = board.file(sq) + df;
    const r = board.rank(sq) + dr;
    if (f >= 0 && f < width && r >= 0 && r < width) {
      const from = board.index(f, r);
      if (board.isValidSquare(from)) {
        const p = board.getByIndex(from);
        if (getType(p) === Pieces.KNIGHT && getColor(p) === attackerColor) return true;
      }
    }
  }

  // 2. KINGS
  const kingDeltas = [[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]];
  for (const [df, dr] of kingDeltas) {
    const f = board.file(sq) + df;
    const r = board.rank(sq) + dr;
    if (f >= 0 && f < width && r >= 0 && r < width) {
      const from = board.index(f, r);
      if (board.isValidSquare(from)) {
        const p = board.getByIndex(from);
        if (getType(p) === Pieces.KING && getColor(p) === attackerColor) return true;
      }
    }
  }

  // 3. PAWNS
  // A square is attacked by an attacker pawn if a pawn is at a position such that it attacks sq.
  // Attackers move in 'forward' direction. From 'sq', the pawns must be at 'sq - attackDir'.
  const forward = board.variant.pawnForward[attackerColor];
  const attackDirs = [];
  if (Math.abs(forward) === width) { // vertical
    attackDirs.push(forward - 1, forward + 1);
  } else { // horizontal
    attackDirs.push(forward - width, forward + width);
  }

  for (const dir of attackDirs) {
    const from = sq - dir; // Inverted: piece at (sq-dir) attacks sq via (from+dir)
    if (board.isValidSquare(from) && Board_distance(board, from, sq) === 1) {
      const p = board.getByIndex(from);
      if (getType(p) === Pieces.PAWN && getColor(p) === attackerColor) return true;
    }
  }

  // 4. SLIDING PIECES
  const rookDirs   = [1, -1, width, -width];
  const bishopDirs = [width + 1, width - 1, -width + 1, -width - 1];

  if (isRayAttacked(board, sq, rookDirs, Pieces.ROOK, attackerColor)) return true;
  if (isRayAttacked(board, sq, bishopDirs, Pieces.BISHOP, attackerColor)) return true;

  return false;
}

/**
 * Checks if a king of a given color is in check (attacked by ANY enemy).
 */
export function isKingInCheck(board, colorIndex) {
  const kingSq = [...board.getPieces(colorIndex)].find(idx => getType(board.getByIndex(idx)) === Pieces.KING);
  if (kingSq === undefined) return false; // King might have been removed (eliminated)

  for (let c = 0; c < board.variant.numPlayers; c++) {
    if (c === colorIndex) continue;
    // Note: In 4-player, we might want to check if player 'c' is alive. 
    // However, if they aren't alive, they have no pieces, so isSquareAttacked will be false anyway.
    if (isSquareAttacked(board, kingSq, c)) return true;
  }
  return false;
}

function isRayAttacked(board, startSq, dirs, type, attackerColor) {
  for (const dir of dirs) {
    let sq = startSq;
    while (true) {
      const prevIdx = sq;
      sq += dir;
      if (!board.isValidSquare(sq)) break;
      if (Board_distance(board, prevIdx, sq) !== 1) break;

      const p = board.getByIndex(sq);
      if (p !== Pieces.EMPTY) {
        if (getColor(p) === attackerColor) {
          const t = getType(p);
          if (t === type || t === Pieces.QUEEN) return true;
        }
        break; // blocked
      }
    }
  }
  return false;
}

function Board_distance(board, idx1, idx2) {
  const df = Math.abs(board.file(idx1) - board.file(idx2));
  const dr = Math.abs(board.rank(idx1) - board.rank(idx2));
  return Math.max(df, dr);
}

