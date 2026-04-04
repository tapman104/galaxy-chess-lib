import { Chess } from '../chess-engine/api/chess.js';

const mateGame = new Chess();
console.log('Initial turn:', mateGame.turn());
['f3', 'e5', 'g4', 'Qh4#'].forEach((m) => {
  console.log('Moving:', m);
  mateGame.move(m);
  console.log('Turn now:', mateGame.turn());
});

console.log('In check:', mateGame.inCheck());
console.log('In checkmate:', mateGame.inCheckmate());
console.log('Is game over:', mateGame.isGameOver());
console.log('Legal moves count:', mateGame.moves().length);
