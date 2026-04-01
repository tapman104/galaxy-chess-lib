import { Board, Pieces, getType } from '../core/board.js';
import { getLegalMoves, inCheck } from '../core/legality.js';
import { makeMove, unmakeMove } from '../core/makeMove.js';
import { FLAGS, moveFrom, moveTo, moveFlag, movePromo } from '../core/moveGen.js';
import { InvalidMoveError } from './errors.js';

/**
 * Convert a packed move integer to a SAN string.
 */
export function moveToSAN(board, state, move) {
  const from = moveFrom(move);
  const to = moveTo(move);
  const flag = moveFlag(move);
  const promoType = movePromo(move);

  const piece = board.getByIndex(from);
  const pType = getType(piece);
  
  // 1. Castling
  if (flag === FLAGS.CASTLE_K) return applyCheckMateSuffix(board, state, move, 'O-O');
  if (flag === FLAGS.CASTLE_Q) return applyCheckMateSuffix(board, state, move, 'O-O-O');

  let san = '';

  // 2. Piece Symbol
  if (pType !== Pieces.PAWN) {
    san += getPieceChar(pType).toUpperCase();
    san += getDisambiguation(board, state, move);
  }

  // 3. Captures
  const isCapture = flag === FLAGS.CAPTURE || flag === FLAGS.EP_CAPTURE || flag === FLAGS.PROMO_CAPTURE;
  if (isCapture) {
    if (pType === Pieces.PAWN) {
      san += board.indexToAlgebraic(from)[0]; // file
    }
    san += 'x';
  }

  // 4. Destination
  san += board.indexToAlgebraic(to);

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
  if (cleanSan === 'O-O' || cleanSan === '0-0') return findMoveInLegal(board, state, (m) => moveFlag(m) === FLAGS.CASTLE_K, san);
  if (cleanSan === 'O-O-O' || cleanSan === '0-0-0') return findMoveInLegal(board, state, (m) => moveFlag(m) === FLAGS.CASTLE_Q, san);

  // Match move from legal moves
  const legal = getLegalMoves(board, state);
  
  // Dynamic Regex parsing based on board size
  const filesRange = board.width > 8 ? 'a-n' : 'a-h';
  const ranksRange = board.height > 8 ? '(?:1[0-4]|[1-9])' : '[1-8]';
  const fileRegex = `[${filesRange}]`;
  const squareRegex = `${fileRegex}${ranksRange}`;

  const pattern = new RegExp(`^([KQRBN])?(${squareRegex}|${fileRegex}|${ranksRange})?(x)?(${squareRegex})(=[QRBN])?$`);
  const match = cleanSan.match(pattern);
  
  if (!match) throw new InvalidMoveError(`Invalid move: ${san}`);

  const [_, pChar, disambig, isCap, dest, promo] = match;

  const targetPType = pChar ? charToType(pChar.toLowerCase()) : Pieces.PAWN;
  const targetToIdx = board.algebraicToIndex(dest);
  const targetPromo = promo ? charToType(promo[1].toLowerCase()) : 0;

  for (let i = 0; i < legal.count; i++) {
    const move = legal.moves[i];
    const from = moveFrom(move);
    const to = moveTo(move);
    const mPType = getType(board.getByIndex(from));
    const mPromo = movePromo(move);

    if (to !== targetToIdx) continue;
    if (mPType !== targetPType) continue;
    if (targetPromo && mPromo !== targetPromo) continue;

    // Disambiguation check
    if (disambig) {
      const alg = board.indexToAlgebraic(from);
      const algFile = alg[0];
      const algRank = alg.slice(1);
      if (alg !== disambig && disambig !== algFile && disambig !== algRank) {
        continue;
      }
    }

    return {
      from: board.indexToAlgebraic(from),
      to: board.indexToAlgebraic(to),
      promotion: mPromo ? getPieceChar(mPromo) : undefined
    };
  }

  throw new InvalidMoveError(`Invalid move: ${san}`);
}

function findMoveInLegal(board, state, predicate, originalSan) {
  const legal = getLegalMoves(board, state);
  for (let i = 0; i < legal.count; i++) {
    const m = legal.moves[i];
    if (predicate(m)) {
      return {
        from: board.indexToAlgebraic(moveFrom(m)),
        to: board.indexToAlgebraic(moveTo(m)),
        promotion: undefined
      };
    }
  }
  throw new InvalidMoveError(`Invalid move: ${originalSan}`);
}

function getDisambiguation(board, state, move) {
  const from = moveFrom(move);
  const to = moveTo(move);
  const piece = board.getByIndex(from);
  const pType = getType(piece);

  const legal = getLegalMoves(board, state);
  const candidates = [];

  for (let i = 0; i < legal.count; i++) {
    const m = legal.moves[i];
    const mFrom = moveFrom(m);
    const mTo = moveTo(m);
    if (mFrom === from) continue;
    if (mTo === to && getType(board.getByIndex(mFrom)) === pType) {
      candidates.push(mFrom);
    }
  }

  if (candidates.length === 0) return '';

  const fromAlg = board.indexToAlgebraic(from);
  const fromFile = board.file(from);
  const fromRank = board.rank(from);
  let useFile = false;
  let useRank = false;

  const sameFile = candidates.some(c => board.file(c) === fromFile);
  const sameRank = candidates.some(c => board.rank(c) === fromRank);

  if (!sameFile) useFile = true;
  else if (!sameRank) useRank = true;
  else {
    useFile = true;
    useRank = true;
  }

  const f = fromAlg[0];
  const r = fromAlg.slice(1);
  return (useFile ? f : '') + (useRank ? r : '');
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
  if (type === Pieces.KNIGHT) return 'n';
  if (type === Pieces.BISHOP) return 'b';
  if (type === Pieces.ROOK) return 'r';
  if (type === Pieces.QUEEN) return 'q';
  if (type === Pieces.KING) return 'k';
  return '';
}

function charToType(char) {
  if (char === 'n') return Pieces.KNIGHT;
  if (char === 'b') return Pieces.BISHOP;
  if (char === 'r') return Pieces.ROOK;
  if (char === 'q') return Pieces.QUEEN;
  if (char === 'k') return Pieces.KING;
  return Pieces.PAWN;
}

