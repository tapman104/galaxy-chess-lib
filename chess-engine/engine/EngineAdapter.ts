import { Chess } from '../api/chess.js';

/**
 * Options for a best move request.
 */
export interface BestMoveOptions {
  /** Search depth in half-moves. */
  depth?: number;
  /** Search time in milliseconds. */
  movetime?: number;
}

/**
 * Result of an engine search.
 */
export interface BestMoveResult {
  /** The best move found, in SAN format. */
  bestMove: string;
  /** The predicted continuation move (ponder) in SAN format. */
  ponder?: string;
  /** Evaluation in centipawns. */
  evaluation?: number;
  /** Evaluation as mate in N moves. */
  mate?: number;
  /** Depth reached during search. */
  depth?: number;
}

/**
 * Error thrown when an engine is used with an incompatible chess variant.
 */
export class UnsupportedVariantError extends Error {
  constructor(variant: string) {
    super(`Engine does not support variant: ${variant}`);
    this.name = 'UnsupportedVariantError';
  }
}

/**
 * Base interface for chess engine adapters.
 */
export interface EngineAdapter {
  /** Initialize the engine and perform handshake. */
  connect(): Promise<void>;
  /** Request the best move for the current position of the given game. */
  getBestMove(game: Chess, options?: BestMoveOptions): Promise<BestMoveResult>;
  /** Shut down the engine and release resources. */
  disconnect(): Promise<void>;
}
