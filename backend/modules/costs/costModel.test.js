'use strict';

const test = require('node:test');
const assert = require('node:assert');
const { perSideFeeBps, roundTripCostBps, netPnlBps, isCrypto } = require('./costModel');

// A minimal typed-config stand-in with the cost fields validateEnv produces.
function cfg(overrides = {}) {
  return {
    assetClass: 'equities',
    takerFeeBpsEquities: 0,
    takerFeeBpsCrypto: 25,
    assumedSlippageBps: 2,
    assumedSpreadBps: 3,
    regFeeBpsSell: 0.5,
    ...overrides,
  };
}

test('equities: commission-free, cost is spread + slippage (+ reg on sell)', () => {
  const c = cfg();
  assert.strictEqual(perSideFeeBps(c), 0);
  const rt = roundTripCostBps({ config: c });
  // fee 0 + slippage 2*2=4 + spread 3 + reg 0.5 = 7.5
  assert.strictEqual(rt.feeBps, 0);
  assert.strictEqual(rt.slippageBps, 4);
  assert.strictEqual(rt.spreadBps, 3);
  assert.strictEqual(rt.regFeeBps, 0.5);
  assert.strictEqual(rt.totalBps, 7.5);
});

test('crypto: taker fee dominates and no reg fee', () => {
  const c = cfg({ assetClass: 'crypto' });
  assert.strictEqual(isCrypto(c), true);
  assert.strictEqual(perSideFeeBps(c), 25);
  const rt = roundTripCostBps({ config: c });
  // fee 2*25=50 + slippage 4 + spread 3 + reg 0 = 57
  assert.strictEqual(rt.feeBps, 50);
  assert.strictEqual(rt.regFeeBps, 0);
  assert.strictEqual(rt.totalBps, 57);
});

test('a real spread overrides the modeled fallback', () => {
  const c = cfg();
  const rt = roundTripCostBps({ config: c, spreadBps: 12 });
  // slippage 4 + spread 12 + reg 0.5 = 16.5
  assert.strictEqual(rt.spreadBps, 12);
  assert.strictEqual(rt.totalBps, 16.5);
});

test('netPnlBps subtracts the round-trip cost from gross', () => {
  const cEq = cfg();
  assert.strictEqual(netPnlBps(120, { config: cEq }), 112.5); // 120 - 7.5
  const cCx = cfg({ assetClass: 'crypto' });
  assert.strictEqual(netPnlBps(120, { config: cCx }), 63); // 120 - 57
  // the crypto round-trip fee alone can flip a "winning" gross edge negative
  assert.strictEqual(netPnlBps(5, { config: cCx }), -52);
});

test('non-finite gross is treated as 0 gross (cost still applies)', () => {
  const c = cfg();
  assert.strictEqual(netPnlBps(NaN, { config: c }), -7.5);
});
