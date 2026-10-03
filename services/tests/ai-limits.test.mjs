import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createAiLimiter } from '../ai-limits.mjs';

test('AI rolling minute/hour limits and recovery', () => {
  let time = 0;
  const limiter = createAiLimiter({now: () => time});
  for (let i = 0; i < 10; i++) {
    if (i && i % 3 === 0) time += 60000;
    assert.equal(limiter.take('connection-ip').allowed, true);
  }
  assert.equal(limiter.take('connection-ip').allowed, false);
  time = 3600000;
  assert.equal(limiter.take('connection-ip').allowed, true);
});
test('AI global quota and concurrency cannot be bypassed with different IPs', () => {
  const limiter = createAiLimiter({now: () => 0});
  for (let i = 0; i < 60; i++) assert.equal(limiter.take('ip-' + i).allowed, true);
  assert.equal(limiter.take('different-ip').allowed, false);
  assert.equal(limiter.enter(), true);
  assert.equal(limiter.enter(), true);
  assert.equal(limiter.enter(), false);
  limiter.leave();
  assert.equal(limiter.enter(), true);
});
