/**
 * types.ts — Central type definitions for the Vortex Chess Library.
 */

export interface ChessOptions {
  variant?: string;
  fen?: string;
  meta?: any;
}

export enum PieceType {
  EMPTY = 0,
  PAWN = 1,
  KNIGHT = 2,
  BISHOP = 3,
  ROOK = 4,
  QUEEN = 5,
  KING = 6,
}

export enum Color {
  RED = 0,
  WHITE = 0,
  BLUE = 1,
  BLACK = 1,
  YELLOW = 2,
  GREEN = 3,
}

export type Square = number; // 0-63 (std) or 0-195 (4p)
export type AlgebraicSquare = string; // 'a1', 'e4', etc.
export type Move = number; // Encoded 32-bit integer

export interface VariantConfig {
  name: string;
  version: number;
  id: string;
  width: number;
  height: number;
  numPlayers: number;
  pawnForward: number[];
  promoRank: number[];
  startRank: number[];
  cornerMask?: number;
  playerLabels: string[];
  turnLabels: string[];
}

export interface CastlingRights {
  kingside: boolean;
  queenside: boolean;
}

export interface MovePack {
  from: Square;
  to: Square;
  promo: PieceType;
  flag: number;
}

export interface MoveInput {
  from: AlgebraicSquare | Square;
  to: AlgebraicSquare | Square;
  promotion?: string | PieceType;
}

export interface MoveObject {
  from: AlgebraicSquare;
  to: AlgebraicSquare;
  piece: string;
  color: string;
  flags: string;
  san: string;
  captured?: string;
  promotion?: string;
  eliminatedPlayers?: number[];
}

export interface UndoData {
  captured: number;
  turn: number;
  castling: CastlingRights[];
  epSquare: Square | null;
  playerStatus: boolean[];
  halfmoveClock: number;
  fullmoveNumber: number;
  eliminatedAtOnce: { idx: Square; piece: number }[] | null;
}

export interface HistoryEntry {
  moveInt: number;
  undo: UndoData;
  san: string;
  hash: bigint;
  player: number;
  move?: MoveObject;
  eliminatedPlayers?: number[];
  type?: 'resign';
}

export interface PositionCountEntry {
  hash: string;
  count: number;
}

export interface GameStateSnapshot {
  variant: string;
  board: number[];
  validSquares: number[];
  turn: number;
  activePlayers: number[];
  history: any[];
  castling: CastlingRights[];
  enPassant: number | null;
  halfmoveClock: number;
  fullmoveNumber: number;
  positionCounts: PositionCountEntry[];
  meta?: any;
}
