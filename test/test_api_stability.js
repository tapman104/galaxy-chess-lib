import { Chess } from '../chess-engine/api/chess.js';

async function testResignUndo() {
    console.log('--- Resign/Undo Stability Test ---');
    const game = new Chess({ variant: '4player' });
    game.reset();

    // 1. Test Resign and Undo
    console.log('Testing resignation for Red (0)...');
    const turnBefore = game.turnIndex();
    game.resign(0);
    console.log('Red alive:', game._state.isPlayerAlive(0));
    console.log('Turn after Red resign:', game.turnIndex());

    console.log('Undoing resignation...');
    game.undo();
    console.log('Red alive after undo:', game._state.isPlayerAlive(0));
    console.log('Turn after undo:', game.turnIndex());

    if (game._state.isPlayerAlive(0) && game.turnIndex() === turnBefore) {
        console.log('✅ Resign/Undo Passed');
    } else {
        console.error('❌ Resign/Undo Failed');
    }
}

async function testMoveMetadata() {
    console.log('\n--- Move Metadata Test ---');
    const game = new Chess({ variant: 'standard' });
    game.reset();

    const move = game.move('e4');
    console.log('Move object:', JSON.stringify(move, null, 2));
    
    if (move.from === 'e2' && move.to === 'e4' && move.san === 'e4' && move.color === 'w') {
        console.log('✅ Standard Move Metadata Passed');
    } else {
        console.error('❌ Standard Move Metadata Failed');
    }
}

async function runTests() {
    try {
        await testResignUndo();
        await testMoveMetadata();
        console.log('\nAll persistence and stability tests complete.');
    } catch (e) {
        console.error('Test Suite Failed:', e);
    }
}

runTests();
