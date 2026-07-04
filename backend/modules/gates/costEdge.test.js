'use strict';

const test = require('node:test');
const assert = require('node:assert');
const { costEdgeGate } = require('./costEdge');

// Minimal typed-config stand-in with the cost fields validateEnv produces.
function cfg(overrides = {}) {
  return {
    assetClass: 'equities',
    takerFeeBpsEquities: 0,
    takerFeeBpsCrypto: 25,
    assumedSlippageBps: 2,
    assumedSpreadBps: 3,
    regFeeBpsSell: 0.5,
    minNetEdgeBps: 5,
    ...overrides,
  };
}

test('passes when the projected move clears cost + the required net edge', () => {
  // equities round-trip cost at spread 3 = fee 0 + slip 4 + spread 3 + reg 0.5 = 7.5
  const r = costEdgeGate({ projectedBps: 40, spreadBps: 3, config: cfg() });
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.costBps, 7.5);
  assert.strictEqual(r.netEdgeBps, 32.5);
});

test('rejects a setup that projects less than its round-trip cost', () => {
  const r = costEdgeGate({ projectedBps: 6, spreadBps: 3, config: cfg() });
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.reason, 'below_cost_hurdle');
  assert.ok(r.netEdgeBps < r.requiredBps);
});

test('crypto taker fees make the hurdle much higher', () => {
  const c = cfg({ assetClass: 'crypto' }); // round-trip ~ 50 fee + 4 slip + spread
  // a 40 bps projected crypto move is NET-negative after ~57 bps cost -> rejected
  assert.strictEqual(costEdgeGate({ projectedBps: 40, spreadBps: 3, config: c }).ok, false);
  // a big 120 bps move clears it
  assert.strictEqual(costEdgeGate({ projectedBps: 120, spreadBps: 3, config: c }).ok, true);
});

test('uses the REAL quoted spread — a wide book raises the hurdle', () => {
  const c = cfg({ minNetEdgeBps: 0 });
  // tight book: cost 7.5, projected 30 -> ok
  assert.strictEqual(costEdgeGate({ projectedBps: 30, spreadBps: 3, config: c }).ok, true);
  // wide book (40 bps spread): cost 44.5, projected 30 -> rejected
  assert.strictEqual(costEdgeGate({ projectedBps: 30, spreadBps: 40, config: c }).ok, false);
});

test('missing spread falls back to the modeled assumedSpreadBps', () => {
  const r = costEdgeGate({ projectedBps: 20, config: cfg() }); // spread defaults to 3
  assert.strictEqual(r.costBps, 7.5);
  assert.strictEqual(r.ok, true);
});
