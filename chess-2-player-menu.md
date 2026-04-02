# 2-Player Chess Menu

## Board Details

- **Size**: 8x8 squares (Standard Chess Board)
- **Total Squares**: 64
- **Coordinates**: Algebraic notation from `a1` to `h8`

## Piece Details

Each player starts with 16 pieces:

- **1 King**: The most important piece. Cannot be captured.
- **1 Queen**: Most powerful piece (moves any distance horizontally, vertically, or diagonally).
- **2 Rooks**: Move any distance horizontally or vertical.
- **2 Bishops**: Move any distance diagonally.
- **2 Knights**: Move in an "L" shape (2 squares in one direction, 1 square perpendicular). Can jump over pieces.
- **8 Pawns**: Move forward 1 square (2 squares on first move). Capture diagonally.

## Logic Details

- **Turn Order**: White moves first, followed by Black.
- **En Passant**: A special pawn capture that can occur immediately after a pawn moves two squares from its starting square.
- **Castling**: A move involving the King and either Rook, provided neither has moved and the path is clear.
- **Promotion**: When a pawn reaches the 8th rank (for White) or 1st rank (for Black), it must be promoted to a Queen, Rook, Bishop, or Knight.

## Rules

- **Checkmate**: Occurs when a King is in check and has no legal moves to escape. The player who delivers checkmate wins.
- **Stalemate**: Occurs when a player has no legal moves and their King is NOT in check. The game ends in a draw.
- **Draws**:
  - **Insufficient Material**: Neither player has enough pieces to deliver checkmate (e.g., King vs. King).
  - **50-Move Rule**: 50 consecutive moves without a pawn move or a capture.
  - **Threefold Repetition**: The same board position occurs three times.
- **Resignation**: A player may choose to resign at any time, resulting in a win for the opponent.
- **Winning**: Achieved via checkmate or opponent resignation.
