import { Chess } from '../chess-engine/api/chess.js';
import { Pieces, getPiece } from '../chess-engine/core/board.js';

async function testStalemate() {
  console.log('--- Stalemate Elimination Test ---');

  const p = (color, type) => getPiece(color, type);
  const idx = (f, r) => r * 14 + f;

  const game = new Chess({ variant: '4player' });
  game.reset();
  game._board.squares.fill(0);
  game._board.pieceList.forEach(s => s.clear());

  const b = game._board;
  // Blue (1) - Trapped at d4 (3,3)
  b.setByIndex(idx(3, 3), p(1, Pieces.KING));
  
  // Red pieces to trap Blue at d4
  // Moves for d4: c4(2,3), e4(4,3), d3(3,2), d5(3,4), c3(2,2), c5(2,4), e3(4,2), e5(4,4)
  // We need to attack all these but NOT d4.
  
  // f-file rook attacks e4, e3, e5
  b.setByIndex(idx(5, 0), p(0, Pieces.ROOK)); // f1: attacks f-file
  b.setByIndex(idx(4, 5), p(0, Pieces.ROOK)); // e6: attacks e4, e3, e5? No, attacks e-file.
  
  // Let's just use a Queen to cover most.
  b.setByIndex(idx(5, 5), p(0, Pieces.QUEEN)); // f6: attacks f-file, rank 6, and diagonals.
  // f6 attacks d4 via diagonal? df=2, dr=2. YES. 
  // So Queen at f6 attacks d4. NO good.
  
  // Let's use Rooks on adjacent files/ranks.
  b.setByIndex(idx(2, 6), p(0, Pieces.ROOK)); // c7: attacks c-file (c4, c3, c5)
  b.setByIndex(idx(4, 6), p(0, Pieces.ROOK)); // e7: attacks e-file (e4, e3, e5)
  b.setByIndex(idx(6, 2), p(0, Pieces.ROOK)); // g3: attacks rank 3 (d3, c3, e3)
  b.setByIndex(idx(6, 4), p(0, Pieces.ROOK)); // g5: attacks rank 5 (d5, c5, e5)
  
  // Now d4 is NOT attacked by any of these (they are on files c, e, and ranks 3, 5).
  // Wait, g3 is rank 3. d4 is rank 4. So g3 doesn't attack d4.
  // g3 attacks (0,2) to (13,2).
  // g5 attacks (0,4) to (13,4).
  // c7 attacks (2,0) to (2,13).
  // e7 attacks (4,0) to (4,13).
  
  // Moves for d4 (3,3):
  // (2,3) c4: attacked by c7
  // (4,3) e4: attacked by e7
  // (3,2) d3: NO ONE ATTACKS d3 yet.
  // (3,4) d5: NO ONE ATTACKS d5 yet.
  
  b.setByIndex(idx(0, 2), p(0, Pieces.ROOK)); // a3: attacks rank 3 (d3)
  b.setByIndex(idx(0, 4), p(0, Pieces.ROOK)); // a5: attacks rank 5 (d5)
  
  // Diagonals: (2,2) c3, (2,4) c5, (4,2) e3, (4,4) e5
  // (2,2) c3: attacked by c7 (file) and a3 (rank)
  // (2,4) c5: attacked by c7 (file) and a5 (rank)
  // (4,2) e3: attacked by e7 (file) and a3 (rank)
  // (4,4) e5: attacked by e7 (file) and a5 (rank)
  
  // So all 8 squares around d4 (3,3) are attacked!
  
  // Other Kings
  b.setByIndex(idx(7, 0), p(0, Pieces.KING));
  b.setByIndex(idx(3, 13), p(2, Pieces.KING));
  b.setByIndex(idx(10, 13), p(3, Pieces.KING));
  
  // A piece for Red to move
  b.setByIndex(idx(7, 1), p(0, Pieces.PAWN));

  // Yellow (2)
  b.setByIndex(idx(3, 13), p(2, Pieces.KING));
  
  // Green (3)
  b.setByIndex(idx(10, 13), p(3, Pieces.KING));

  game._state.turn = 0;

  console.log('Initial setup done.');
  console.log('Blue is at a4 (0,3). Red moves to stalemate Blue...');
  
  // We need to move a piece to create stalemate for Blue.
  // Actually let's just use move() if we can fine a valid move.
  // Let's manually set the board and then trigger a move that leaves it stalemated.
  
  // Red moves Pawn from h2 to h3
  game.move({ from: 'h2', to: 'h3' });
  
  console.log('Player 1 (Blue) alive:', game._state.isPlayerAlive(1));
  console.log('Blue legal moves:', game.moves({ square: 'a4' }));
  console.log('Blue in check:', game.inCheck(1));
  console.log('Blue in stalemate:', game.inStalemate(1));
  console.log('Current turn:', game.turn()); // Should be 'y' (2) because Blue (1) was eliminated

  console.log('Last history eliminatedPlayers:', JSON.stringify(game._history[game._history.length - 1].eliminatedPlayers, null, 2));
  if (!game._state.isPlayerAlive(1) && game.inStalemate(1) && game._state.turn === 2) {
    console.log('✅ Stalemate Elimination Passed');
  } else {
    console.error('❌ Stalemate Elimination Failed');
  }

  console.log('Undoing move...');
  game.undo();
  console.log('Blue alive after undo:', game._state.isPlayerAlive(1));
  console.log('Current turn after undo:', game.turn());

  if (game._state.isPlayerAlive(1) && game._state.turn === 0) {
    console.log('✅ Undo Passed');
  } else {
    console.error('❌ Undo Failed');
  }
}

testStalemate();
