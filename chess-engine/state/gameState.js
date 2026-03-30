import { STANDARD } from '../core/variants.js';

/**
 * GameState — Tracks non-piece board state
 * turn (player index), castling rights, en passant square, move clocks
 */
export class GameState {
  constructor(variant = STANDARD) {
    this.variant = variant;
    this.turn = 0; // Player index (0 to numPlayers-1)
    
    // Alive status for each player
    this.playerStatus = new Array(variant.numPlayers).fill(true);

    // Castling rights: Map of playerIndex -> { kingside: boolean, queenside: boolean }
    this.castling = Array.from({ length: variant.numPlayers }, () => ({
      kingside: true,
      queenside: true,
    }));

    this.epSquare = null;      // square index for EP capture, or null
    this.halfmoveClock = 0;   // for 50-move rule
    this.fullmoveNumber = 1;  // incremented after a full round of turns
  }

  /**
   * Rotate turn to the next alive player
   */
  nextTurn() {
    const startTurn = this.turn;
    do {
      this.turn = (this.turn + 1) % this.variant.numPlayers;
      if (this.turn === 0) {
        this.fullmoveNumber++;
      }
    } while (!this.playerStatus[this.turn] && this.turn !== startTurn);
  }

  /**
   * Eliminate a player and mark them as dead
   */
  eliminatePlayer(playerIndex) {
    this.playerStatus[playerIndex] = false;
  }

  isPlayerAlive(playerIndex) {
    return this.playerStatus[playerIndex];
  }

  clone() {
    const copy = new GameState(this.variant);
    copy.turn = this.turn;
    copy.playerStatus = [...this.playerStatus];
    copy.castling = this.castling.map(c => ({ ...c }));
    copy.epSquare = this.epSquare;
    copy.halfmoveClock = this.halfmoveClock;
    copy.fullmoveNumber = this.fullmoveNumber;
    return copy;
  }
}

