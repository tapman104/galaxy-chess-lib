# 4-Player Chess Menu

## Board Details

- **Size**: 14x14 squares (total 196 indices).
- **Masking**: 3x3 corners are invalid/removed.
- **Total Playable Squares**: 160.
- **Coordinates**: `a1` to `n14` (minus corners like `a1-c3`).

## Piece Details

Each player starts with 16 pieces:

- **Red (Bottom)**: Color Index 0. Starts at Ranks 1-2.
- **Blue (Left)**: Color Index 1. Starts at Files 1-2.
- **Yellow (Top)**: Color Index 2. Starts at Ranks 13-14.
- **Green (Right)**: Color Index 3. Starts at Files 13-14.
- **Piece Types**: 1 King, 1 Queen, 2 Rooks, 2 Bishops, 2 Knights, 8 Pawns.

## Logic Details

- **Turn Order**: Red -> Blue -> Yellow -> Green.
- **Elimination**: A player is eliminated if their King is checkmated or stalemated.
- **Poofing**: When a player is eliminated, all their remaining pieces are immediately removed from the board.
- **Promotion**: Pawns promote when they reach the opposite edge:
  - **Red**: Rank 14.
  - **Blue**: File 14 (`n`).
  - **Yellow**: Rank 1.
  - **Green**: File 1 (`a`).

## Rules

- **Checkmate**: Results in immediate elimination of the player. The surviving players continue.
- **Stalemate**: Also results in immediate elimination.
- **Resignation**: A player may resign at any time, removing their pieces and skipping their turns.
- **Winning**: The last player remaining on the board wins.
- **Draws**:
  - **Insufficient Material**: Handled in 4-player games once only two players remain active (Standard 2-player material checks).
  - **Deadlock**: If no player can deliver checkmate or progress, a draw may occur.
  - **Time/Move Limit**: Default 50-move rule applies across the whole board.
- **King Capture**: If a piece directly captures another player's King, that player is eliminated immediately.
