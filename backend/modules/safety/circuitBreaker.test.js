'use strict';

const test = require('node:test');
const assert = require('node:assert');
const { computeExpectancy, evaluateBreaker, createCircuitBreaker } = require('./circuitBreaker');

const cfg = { circuitBreakerEnabled: true, cbMinClosedTrades: 5, cbExpectancyFloorBps: -5, cbLookbackTrades: 10 };

test('computeExpectancy averages the lookback window', () => {
  const trades = [{ pnlBps: 10 }, { pnlBps: -30 }, { pnlBps: 20 }];
  assert.strictEqual(computeExpectancy(trades, 10).expectancyBps, 0);
  assert.strictEqual(computeExpectancy([], 10).sample, 0);
});

test('breaker holds until min sample, then trips on bleed', () => {
  const few = [{ pnlBps: -50 }, { pnlBps: -50 }];
  assert.strictEqual(evaluateBreaker(few, cfg).reason, 'insufficient_sample');
  const bleeding = Array.from({ length: 6 }, () => ({ pnlBps: -20 }));
  assert.strictEqual(evaluateBreaker(bleeding, cfg).halted, true);
  const healthy = Array.from({ length: 6 }, () => ({ pnlBps: 15 }));
  assert.strictEqual(evaluateBreaker(healthy, cfg).halted, false);
});

test('disabled breaker never halts', () => {
  const bleeding = Array.from({ length: 20 }, () => ({ pnlBps: -100 }));
  assert.strictEqual(evaluateBreaker(bleeding, { ...cfg, circuitBreakerEnabled: false }).halted, false);
});

test('stateful breaker tracks per-signal ledgers', () => {
  const cb = createCircuitBreaker();
  for (let i = 0; i < 6; i++) cb.record({ signal: 'momentum', pnlBps: -20 });
  for (let i = 0; i < 6; i++) cb.record({ signal: 'vwap_reversion', pnlBps: 30 });
  assert.strictEqual(cb.isHalted('momentum', cfg).halted, true);
  assert.strictEqual(cb.isHalted('vwap_reversion', cfg).halted, false);
});
