import { Chess } from '../chess-engine/api/chess.js';
import { Pieces, getPiece } from '../chess-engine/core/board.js';

async function runTests() {
  console.log('--- Final Elimination Verification ---');

  const p = (color, type) => getPiece(color, type);
  const idx = (f, r) => r * 14 + f;

  // TEST 1: Simple Checkmate + Undo
  console.log('\nTest 1: Simple Checkmate');
  const game = new Chess({ variant: '4player' });
  game.reset();
  game._board.squares.fill(0);
  game._board.pieceList.forEach(s => s.clear());

  const b = game._board;
  // Red (0)
  b.setByIndex(idx(7, 0), p(0, Pieces.KING));
  b.setByIndex(idx(7, 2), p(0, Pieces.ROOK)); // Move (7,2)->(7,3)
  b.setByIndex(idx(7, 4), p(0, Pieces.ROOK)); // rank 5
  b.setByIndex(idx(1, 0), p(0, Pieces.ROOK)); // file B

  // Blue (1) - Trapped at a4 (0,3)
  b.setByIndex(idx(0, 3), p(1, Pieces.KING));
  b.setByIndex(idx(0, 4), p(1, Pieces.PAWN)); // Block (0,4)

  // Others
  b.setByIndex(idx(3, 13), p(2, Pieces.KING));
  b.setByIndex(idx(10, 13), p(3, Pieces.KING));

  game._state.turn = 0;

  try {
    console.log('Red moving h3-h4 (Checkmates Blue)...');
    game.move({ from: 'h3', to: 'h4' });
    
    console.log('Player 1 (Blue) alive:', game._state.isPlayerAlive(1)); 
    console.log('Current turn index:', game._state.turn);

    if (!game._state.isPlayerAlive(1) && game._state.turn === 2) {
      console.log('✅ Elimination Passed');
    } else {
      console.error('❌ Elimination Failed');
    }

    console.log('Undoing move...');
    game.undo();
    
    const blueAlive = game._state.isPlayerAlive(1);
    const blueKingAtA4 = game._board.getByIndex(idx(0, 3)) === p(1, Pieces.KING);
    const turnRestored = game._state.turn === 0;

    console.log('Blue alive after undo:', blueAlive);
    console.log('Blue king restored at a4:', blueKingAtA4);
    console.log('Turn restored to 0:', turnRestored);

    if (blueAlive && blueKingAtA4 && turnRestored) {
      console.log('✅ Undo Passed');
    } else {
      console.error('❌ Undo Failed');
    }
  } catch (e) {
    console.error('Test Error:', e);
  }

  console.log('\n--- Verification Completed ---');
}

runTests();
