import { Board, Pieces } from '../core/board.js';
import { getLegalMoves, inCheck } from '../core/legality.js';
import { makeMove, unmakeMove } from '../core/makeMove.js';
import { FLAGS } from '../core/moveGen.js';
import { InvalidMoveError } from './errors.js';

/**
 * Convert a packed move integer to a SAN string.
 */
export function moveToSAN(board, state, move) {
  const from = move & 0x3F;
  const to = (move >>> 6) & 0x3F;
  const flag = (move >>> 12) & 0x0F;
  const promoType = (move >>> 16) & 0x07;

  const piece = board.getByIndex(from);
  const pType = Board.type(piece);
  
  // 1. Castling
  if (flag === FLAGS.CASTLE_K) return applyCheckMateSuffix(board, state, move, 'O-O');
  if (flag === FLAGS.CASTLE_Q) return applyCheckMateSuffix(board, state, move, 'O-O-O');

  let san = '';

  // 2. Piece Symbol
  if (pType !== Pieces.WHITE_PAWN) {
    san += getPieceChar(pType).toUpperCase();
    san += getDisambiguation(board, state, move);
  }

  // 3. Captures
  const isCapture = flag === FLAGS.CAPTURE || flag === FLAGS.EP_CAPTURE || flag === FLAGS.PROMO_CAPTURE;
  if (isCapture) {
    if (pType === Pieces.WHITE_PAWN) {
      san += Board.indexToAlgebraic(from)[0]; // file
    }
    san += 'x';
  }

  // 4. Destination
  san += Board.indexToAlgebraic(to);

  // 5. Promotion
  if (flag === FLAGS.PROMO || flag === FLAGS.PROMO_CAPTURE) {
    san += '=' + getPieceChar(promoType).toUpperCase();
  }

  return applyCheckMateSuffix(board, state, move, san);
}

/**
 * Parse a SAN string into a coordinate move object {from, to, promotion}.
 */
export function sanToMove(board, state, san) {
  const cleanSan = san.replace(/[+#?!( )]/g, '');
  
  // Handle Castling
  if (cleanSan === 'O-O' || cleanSan === '0-0') return findMoveInLegal(board, state, (m) => ((m >>> 12) & 0x0F) === FLAGS.CASTLE_K, san);
  if (cleanSan === 'O-O-O' || cleanSan === '0-0-0') return findMoveInLegal(board, state, (m) => ((m >>> 12) & 0x0F) === FLAGS.CASTLE_Q, san);

  // Match move from legal moves
  const legal = getLegalMoves(board, state);
  
  // Regex parsing: (Piece?)(Disambiguation?)(x?)(Destination)(=Promotion?)
  // Matches: Nf3, exd5, R1e1, Qh4xe1=Q
  const match = cleanSan.match(/^([KQRBN])?([a-h]|[1-8]|[a-h][1-8])?(x)?([a-h][1-8])(=[QRBN])?$/);
  if (!match) throw new InvalidMoveError(`Invalid move: ${san}`);

  const [_, pChar, disambig, isCap, dest, promo] = match;
  const targetPType = pChar ? charToType(pChar.toLowerCase()) : Pieces.WHITE_PAWN;
  const targetToIdx = Board.algebraicToIndex(dest);
  const targetPromo = promo ? charToType(promo[1].toLowerCase()) : 0;

  for (let i = 0; i < legal.count; i++) {
    const move = legal.moves[i];
    const from = move & 0x3F;
    const to = (move >>> 6) & 0x3F;
    const flag = (move >>> 12) & 0x0F;
    const promoType = (move >>> 16) & 0x07;

    if (to !== targetToIdx) continue;
    if (Board.type(board.getByIndex(from)) !== targetPType) continue;
    if (targetPromo && promoType !== targetPromo) continue;

    // Disambiguation check
    if (disambig) {
      const alg = Board.indexToAlgebraic(from);
      if (disambig.length === 1) {
        if (alg[0] !== disambig && alg[1] !== disambig) continue;
      } else {
        if (alg !== disambig) continue;
      }
    }

    return {
      from: Board.indexToAlgebraic(from),
      to: Board.indexToAlgebraic(to),
      promotion: promoType ? getPieceChar(promoType) : undefined
    };
  }

  throw new InvalidMoveError(`Invalid move: ${san}`);
}

function findMoveInLegal(board, state, predicate, originalSan) {
  const legal = getLegalMoves(board, state);
  for (let i = 0; i < legal.count; i++) {
    if (predicate(legal.moves[i])) {
      const m = legal.moves[i];
      return {
        from: Board.indexToAlgebraic(m & 0x3F),
        to: Board.indexToAlgebraic((m >>> 6) & 0x3F),
        promotion: undefined
      };
    }
  }
  throw new InvalidMoveError(`Invalid move: ${originalSan}`);
}

function getDisambiguation(board, state, move) {
  const from = move & 0x3F;
  const to = (move >>> 6) & 0x3F;
  const piece = board.getByIndex(from);
  const pType = Board.type(piece);

  const legal = getLegalMoves(board, state);
  const candidates = [];

  for (let i = 0; i < legal.count; i++) {
    const m = legal.moves[i];
    const mFrom = m & 0x3F;
    const mTo = (m >>> 6) & 0x3F;
    if (mFrom === from) continue;
    if (mTo === to && Board.type(board.getByIndex(mFrom)) === pType) {
      candidates.push(mFrom);
    }
  }

  if (candidates.length === 0) return '';

  const fromAlg = Board.indexToAlgebraic(from);
  let useFile = false;
  let useRank = false;

  const sameFile = candidates.some(c => Board.indexToAlgebraic(c)[0] === fromAlg[0]);
  const sameRank = candidates.some(c => Board.indexToAlgebraic(c)[1] === fromAlg[1]);

  if (!sameFile) useFile = true;
  else if (!sameRank) useRank = true;
  else {
    useFile = true;
    useRank = true;
  }

  return (useFile ? fromAlg[0] : '') + (useRank ? fromAlg[1] : '');
}

function applyCheckMateSuffix(board, state, move, san) {
  const undo = makeMove(board, state, move);
  const nextLegal = getLegalMoves(board, state);
  const isCheck = inCheck(board, state);
  const suffix = nextLegal.count === 0 ? (isCheck ? '#' : '') : (isCheck ? '+' : '');
  unmakeMove(board, state, move, undo);
  return san + suffix;
}

function getPieceChar(type) {
  if (type === Pieces.WHITE_KNIGHT) return 'n';
  if (type === Pieces.WHITE_BISHOP) return 'b';
  if (type === Pieces.WHITE_ROOK) return 'r';
  if (type === Pieces.WHITE_QUEEN) return 'q';
  if (type === Pieces.WHITE_KING) return 'k';
  return '';
}

function charToType(char) {
  if (char === 'n') return Pieces.WHITE_KNIGHT;
  if (char === 'b') return Pieces.WHITE_BISHOP;
  if (char === 'r') return Pieces.WHITE_ROOK;
  if (char === 'q') return Pieces.WHITE_QUEEN;
  if (char === 'k') return Pieces.WHITE_KING;
  return Pieces.WHITE_PAWN;
}
