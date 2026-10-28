import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createCelebrationGate, isPerfectScore } from '../web/scripts/effects.js';
import { formatScore } from '../web/scripts/api.js';

test('only an actual perfect solver score qualifies, never rounded near-perfect values', () => {
  for (const score of [.9999999999, .995, .8, 0, -1, 1.01, NaN, Infinity, '1', null]) {
    assert.equal(isPerfectScore(score), false);
    assert.notEqual(formatScore(score), '100%');
  }
  assert.equal(isPerfectScore(1), true);
  assert.equal(formatScore(1), '100%');
  assert.equal(formatScore(.99999), '99.9%');
  assert.equal(formatScore(.785), '78.5%');
});

test('one burst per calculation, not per alternate selection or rerender', () => {
  const gate = createCelebrationGate();
  assert.equal(gate.take(.99), false);
  assert.equal(gate.take(1), true);
  assert.equal(gate.take(.8), false);
  assert.equal(gate.take(1), false);
  gate.reset();
  assert.equal(gate.take(1), true);
});
