/**
 * bench/perft.js — Move-generation performance benchmark
 *
 * Measures how many positions per second the engine can visit from the
 * standard starting position using a simple perft (performance test) walk.
 *
 * Usage:
 *   node bench/perft.js [depth]   (default depth: 4)
 */

import { Chess } from '../chess-engine/index.js';

const DEPTH = parseInt(process.argv[2] ?? '4', 10);

function perft(chess, depth) {
  if (depth === 0) return 1;
  let nodes = 0;
  const moves = chess.moves({ verbose: true });
  for (const move of moves) {
    chess.move(move);
    nodes += perft(chess, depth - 1);
    chess.undo();
  }
  return nodes;
}

console.log(`Perft standard — depth ${DEPTH}`);
const chess = new Chess();
const start = performance.now();
const nodes = perft(chess, DEPTH);
const elapsed = (performance.now() - start) / 1000;
const nps = Math.round(nodes / elapsed).toLocaleString();

console.log(`  nodes : ${nodes.toLocaleString()}`);
console.log(`  time  : ${elapsed.toFixed(3)}s`);
console.log(`  nps   : ${nps}`);
