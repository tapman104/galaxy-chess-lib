import { Chess } from '../api/chess.js';
import { 
  EngineAdapter, 
  BestMoveOptions, 
  BestMoveResult, 
  UnsupportedVariantError 
} from './EngineAdapter.js';

export interface StockfishConfig {
  /** Path to the Stockfish Worker script. */
  workerPath: string;
  /** Timeout in milliseconds for engine responses (default: 10000ms). */
  timeout?: number;
}

/**
 * Adapter for the Stockfish chess engine running in a Web Worker.
 */
export class StockfishAdapter implements EngineAdapter {
  private _worker: Worker | null = null;
  private _config: StockfishConfig;
  private _isReady = false;
  private _disconnected = false;
  private _activeHandler: ((e: MessageEvent) => void) | null = null;
  private _pendingPromise: { 
    resolve: (val: BestMoveResult) => void; 
    reject: (err: any) => void;
    timer: any;
  } | null = null;

  constructor(config: StockfishConfig) {
    this._config = {
      timeout: 10000,
      ...config
    };
  }

  /**
   * Initializes the Stockfish worker and performs the UCI handshake.
   * Sequence: uci -> uciok -> isready -> readyok.
   */
  async connect(): Promise<void> {
    if (this._disconnected) throw new Error('StockfishAdapter is disconnected');
    if (this._worker) return; // Idempotent: do nothing if already connected

    try {
      this._worker = new Worker(this._config.workerPath);
    } catch (err) {
      throw new Error(`Failed to initialize Stockfish worker: ${err}`);
    }

    // 1. Handshake: uci -> uciok
    await this._sendCommandAndExpect('uci', 'uciok');
    
    // 2. Handshake: isready -> readyok
    await this._sendCommandAndExpect('isready', 'readyok');
    
    this._isReady = true;
  }

  /**
   * Request the best move for the current position.
   */
  async getBestMove(game: Chess, options: BestMoveOptions = {}): Promise<BestMoveResult> {
    this._ensureActive();

    if (game.variant() !== 'standard@v1') {
      throw new UnsupportedVariantError(game.variant());
    }

    if (this._pendingPromise) {
      throw new Error('A search is already in progress.');
    }

    // Snapshot FEN synchronously before any await
    const fen = game.fen();

    return new Promise((resolve, reject) => {
      let lastDepth = 0;
      let lastEval: number | undefined;
      let lastMate: number | undefined;

      const timer = setTimeout(() => {
        this._cleanupPending();
        reject(new Error(`Stockfish bestmove timeout after ${this._config.timeout}ms`));
      }, this._config.timeout);

      this._pendingPromise = { resolve, reject, timer };

      this._activeHandler = (e: MessageEvent) => {
        const msg = e.data;
        if (typeof msg !== 'string') return;

        // Parse info messages for evaluation and depth
        if (msg.startsWith('info')) {
          const depthMatch = msg.match(/depth (\d+)/);
          const cpMatch = msg.match(/score cp (-?\d+)/);
          const mateMatch = msg.match(/score mate (-?\d+)/);
          
          if (depthMatch) lastDepth = parseInt(depthMatch[1]);
          if (cpMatch) {
            lastEval = parseInt(cpMatch[1]);
            lastMate = undefined;
          }
          if (mateMatch) {
            lastMate = parseInt(mateMatch[1]);
            lastEval = undefined;
          }
          return;
        }

        // Parse bestmove result
        if (msg.startsWith('bestmove')) {
          const parts = msg.split(' ');
          const bestmoveUci = parts[1];
          const ponderUci = parts[3];

          // Cleanup must happen before resolution to remove the listener
          this._cleanupPending();

          if (!bestmoveUci || bestmoveUci === '(none)') {
            resolve({ 
              bestMove: '(none)', 
              depth: lastDepth, 
              evaluation: lastEval, 
              mate: lastMate 
            });
            return;
          }

          try {
            const result: BestMoveResult = {
              bestMove: this._uciToSan(game, bestmoveUci),
              depth: lastDepth,
              evaluation: lastEval,
              mate: lastMate,
            };

            if (ponderUci && ponderUci !== '(none)') {
              // To get Ponder SAN, apply bestMove to a clone
              const clone = game.clone();
              try {
                clone.move(result.bestMove);
                result.ponder = this._uciToSan(clone, ponderUci);
              } catch {
                result.ponder = ponderUci;
              }
            }

            resolve(result);
          } catch (err) {
            reject(err);
          }
        }
      };

      this._worker!.addEventListener('message', this._activeHandler);
      this._worker!.postMessage(`position fen ${fen}`);

      let goCmd = 'go';
      if (options.depth) goCmd += ` depth ${options.depth}`;
      else if (options.movetime) goCmd += ` movetime ${options.movetime}`;
      else goCmd += ' depth 15'; // default

      this._worker!.postMessage(goCmd);
    });
  }

  /**
   * Send 'quit' and terminate worker.
   */
  async disconnect(): Promise<void> {
    if (this._disconnected) return;
    
    if (this._worker) {
      this._worker.postMessage('quit');
      this._worker.terminate();
      this._worker = null;
    }
    
    this._cleanupPending();
    this._isReady = false;
    this._disconnected = true;
  }

  private _ensureActive() {
    if (this._disconnected) throw new Error('StockfishAdapter is disconnected');
    if (!this._worker || !this._isReady) throw new Error('Stockfish not connected. Call connect() first.');
  }

  private _cleanupPending() {
    if (this._pendingPromise) {
      clearTimeout(this._pendingPromise.timer);
      this._pendingPromise = null;
    }
    if (this._activeHandler) {
      this._worker?.removeEventListener('message', this._activeHandler);
      this._activeHandler = null;
    }
  }

  private async _sendCommandAndExpect(command: string, expected: string): Promise<void> {
    if (!this._worker) throw new Error('Worker not initialized');

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this._worker?.removeEventListener('message', handler);
        reject(new Error(`Stockfish timeout waiting for ${expected} after ${this._config.timeout}ms`));
      }, this._config.timeout);

      const handler = (e: MessageEvent) => {
        if (typeof e.data === 'string' && e.data.startsWith(expected)) {
          clearTimeout(timer);
          this._worker?.removeEventListener('message', handler);
          resolve();
        }
      };

      this._worker.addEventListener('message', handler);
      this._worker.postMessage(command);
    });
  }

  /**
   * Converts UCI (e.g. "e2e4") to SAN using a game clone.
   * This ensures we use the project's SAN conversion logic without mutating the original game.
   */
  private _uciToSan(game: Chess, uci: string): string {
    if (!uci || uci === '(none)') return '';
    
    const from = uci.slice(0, 2);
    const to = uci.slice(2, 4);
    const promo = uci.length > 4 ? uci[4] : undefined;

    const clone = game.clone();
    try {
      const moveObj = clone.move({ from, to, promotion: promo });
      return moveObj.san;
    } catch {
      return uci; // Fallback
    }
  }
}
