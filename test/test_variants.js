import assert from 'node:assert/strict';
import * as V from '../chess-engine/core/variants.ts';

// variantId behavior
assert.equal(V.variantId({ name: 'custom', version: 2 }), 'custom@v2', 'variantId with name+version');
assert.equal(V.variantId({}), 'custom@v1', 'variantId defaults');

// resolveVariant by alias and id
const std = V.resolveVariant('standard');
assert.equal(std.id, 'standard@v1', 'resolveVariant("standard") should return canonical id');
const four = V.resolveVariant('4player');
assert.equal(four.id, '4player@v1', 'resolveVariant("4player") should return canonical id');

// bit-field helpers round-trip
const color = 3;
const type = 5;
const packed = V.getPiece(color, type);
assert.equal(V.getColor(packed), color, 'getColor should recover color');
assert.equal(V.getType(packed), type, 'getType should recover type');

// registerVariant and lookup by name (case-insensitive)
const testVar = {
  name: 'MyTest',
  version: 1,
  id: 'mytest@v1',
  width: 4,
  height: 4,
  numPlayers: 1,
  pawnForward: [1],
  promoRank: [3],
  startRank: [1],
  playerLabels: ['P'],
  turnLabels: ['P'],
};
V.registerVariant(testVar);
const resolved = V.resolveVariant('mytest');
assert.equal(resolved.id, 'mytest@v1', 'registerVariant should allow resolving by name');

console.log('✅ test_variants passed');
