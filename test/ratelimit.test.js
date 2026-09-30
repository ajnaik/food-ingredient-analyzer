const test = require('node:test');
const assert = require('node:assert/strict');
const { memHit, clientIp } = require('../lib/ratelimit');

test('allows up to max, then blocks', () => {
  const s = new Map();
  for (let i = 0; i < 3; i++) assert.equal(memHit(s, 'a', 0, 60, 3).allowed, true);
  const r = memHit(s, 'a', 0, 60, 3);
  assert.equal(r.allowed, false);
  assert.equal(r.retryAfter, 60);
});

test('limits are per key', () => {
  const s = new Map();
  memHit(s, 'a', 0, 60, 1); memHit(s, 'a', 0, 60, 1);
  assert.equal(memHit(s, 'b', 0, 60, 1).allowed, true);
});

test('window resets after it expires', () => {
  const s = new Map();
  memHit(s, 'a', 0, 60, 1); memHit(s, 'a', 0, 60, 1);
  assert.equal(memHit(s, 'a', 61000, 60, 1).allowed, true);
});

test('client ip comes from x-forwarded-for first hop', () => {
  assert.equal(clientIp({ headers: { 'x-forwarded-for': '1.2.3.4, 10.0.0.1' } }), '1.2.3.4');
});
