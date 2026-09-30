const test = require('node:test');
const assert = require('node:assert/strict');
const { computeScore } = require('../lib/score');

test('plain oats score high and CLEAN', () => {
  const r = computeScore({ nutriscore: 'a', nova: 1, additivesCount: 0, nutri: { sugars: 1, satFat: 1.2, salt: 0 } });
  assert.ok(r.score >= 90);
  assert.equal(r.verdict, 'CLEAN');
});

test('ultra-processed high-sugar product is AVOID', () => {
  const r = computeScore({ nutriscore: 'e', nova: 4, additivesCount: 2, nutri: { sugars: 56, satFat: 10.6, salt: 0.1 } });
  assert.ok(r.score < 25);
  assert.equal(r.verdict, 'AVOID');
});

test('different bad products no longer collapse to the same score', () => {
  const soda = computeScore({ nutriscore: 'e', nova: 4, additivesCount: 3, nutri: { sugars: 10.6 } });
  const spread = computeScore({ nutriscore: 'e', nova: 4, additivesCount: 0, nutri: { sugars: 56, satFat: 10.6 } });
  assert.notEqual(soda.score, spread.score);
});

test('scoring is deterministic', () => {
  const input = { nutriscore: 'c', nova: 3, additivesCount: 1, nutri: { sugars: 5, salt: 1 } };
  assert.deepEqual(computeScore(input), computeScore(input));
});

test('no data returns a neutral low-confidence score', () => {
  const r = computeScore({});
  assert.equal(r.score, 50);
  assert.equal(r.confidence, 'low');
});

test('score is clamped to 0-100', () => {
  const r = computeScore({ nutriscore: 'e', nova: 4, additivesCount: 20, nutri: { sugars: 999, satFat: 99, salt: 99 } });
  assert.ok(r.score >= 0 && r.score <= 100);
});

test('ingredients without nutri data still get a baseline-based score', () => {
  const r = computeScore({ hasIngredients: true, nova: 4 });
  assert.equal(r.score, 43);
  assert.equal(r.confidence, 'medium');
});

test('garbage input does not throw', () => {
  assert.doesNotThrow(() => computeScore({ nutriscore: 5, nova: 'x', additivesCount: 'abc', nutri: { sugars: 'NaN' } }));
});
