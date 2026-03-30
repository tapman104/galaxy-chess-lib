import { Chess, InvalidMoveError } from './chess-engine/index.js';

try {
  console.log('--- Public API Verification ---');
  const chess = new Chess();

  // 1. Basic moves
  console.log('Testing basic moves (e4, e5, Nf3)...');
  chess.move('e4');
  chess.move('e5');
  chess.move('Nf3');
  console.log(`Current FEN: ${chess.fen()}`);
  if (!chess.fen().includes('rnbqkbnr/pppp1ppp/8/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R b KQkq -')) {
    throw new Error('FEN mismatch after moves');
  }

  // 2. Disambiguation
  console.log('Testing disambiguation (Nbd2)...');
  chess.reset();
  chess.move('e4');
  chess.move('e5');
  chess.move('Nf3');
  chess.move('Nc6');
  chess.move('d3');
  chess.move('Nf6');
  const move = chess.move('Nbd2'); 
  console.log(`Move: ${move.san} from ${move.from} to ${move.to}`);
  if (move.san !== 'Nbd2' || move.from !== 'b1') {
    throw new Error(`Disambiguation failed: expected Nbd2 from b1, got ${move.san} from ${move.from}`);
  }

  // 3. Threefold Repetition
  console.log('Testing Threefold Repetition...');
  chess.reset();
  // 1. Nf3 Nf6 2. Ng1 Ng8 (Pos 1)
  // 3. Nf3 Nf6 4. Ng1 Ng8 (Pos 2)
  // 5. Nf3 Nf6 6. Ng1 Ng8 (Pos 3)
  const reps = ['Nf3', 'Nf6', 'Ng1', 'Ng8'];
  for (let i = 0; i < 2; i++) {
    reps.forEach(m => chess.move(m));
  }
  console.log(`Repetition count (after 2 cycles): ${chess.inThreefoldRepetition()}`);
  reps.forEach(m => chess.move(m));
  console.log(`Repetition count (after 3 cycles): ${chess.inThreefoldRepetition()}`);
  if (!chess.inThreefoldRepetition()) throw new Error('Failed to detect Threefold Repetition');

  // 4. PGN Export
  console.log('Testing PGN Export...');
  chess.reset();
  chess.move('e4');
  chess.move('e5');
  const pgn = chess.pgn();
  console.log('PGN Output:');
  console.log(pgn);
  if (!pgn.includes('1. e4 e5')) throw new Error('PGN export failed');

  // 5. Checkmate Detection
  console.log('Testing Checkmate (Fool\'s Mate)...');
  chess.reset();
  ['f3', 'e5', 'g4', 'Qh4#'].forEach(m => chess.move(m));
  console.log(`In Checkmate: ${chess.inCheckmate()}`);
  console.log(`Is Game Over: ${chess.isGameOver()}`);
  if (!chess.inCheckmate()) throw new Error('Failed to detect Fool\'s Mate');

  // 6. 4-Player Verification
  console.log('\n--- 4-Player Verification ---');
  const chess4 = new Chess({ variant: '4player' });
  console.log(`Board Size: ${chess4._board.width}x${chess4._board.height}`);
  if (chess4._board.width !== 14) throw new Error('4-player board width should be 14');

  console.log('Testing 4-player rotation (White, Blue, Black, Green)...');
  const moves4 = ['e4', 'c7', 'e11', 'l7']; // Valid pawn moves for Red, Blue, Yellow, Green
  // Note: Coordinates for 4P need to be valid. 
  // e4 is white pawn. 
  // Blue (Player 1) is on the right. 
  // Black (Player 2) is on top. 
  // Green (Player 3) is on the left.
  
  moves4.forEach(m => {
    console.log(`Side ${chess4.turn()} moving ${m}...`);
    chess4.move(m);
  });

  console.log(`Final turn should be back to White (w). Current: ${chess4.turn()}`);
  if (chess4.turn() !== 'w') throw new Error('4-player rotation failed');

  console.log('\n✅ Public API & 4-Player Verification PASSED!');
} catch (err) {
  console.error('❌ Verification FAILED');
  console.error(err.stack || err.message);
  process.exit(1);
}

