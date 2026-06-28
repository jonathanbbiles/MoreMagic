'use strict';

const test = require('node:test');
const assert = require('node:assert');
const { marketState } = require('./marketHours');
const { pdtGate } = require('./pdt');
const { microstructureGate } = require('./microstructure');

const eqCfg = {
  assetClass: 'equities',
  marketOpenEt: '09:30',
  marketCloseEt: '16:00',
  eodFlattenEt: '15:55',
  entryCutoffEt: '15:30',
  pdtEnforce: true,
  pdtEquityFloorUsd: 25000,
  pdtMaxDayTrades: 3,
  maxSpreadBps: 20,
  maxQuoteAgeMs: 5000,
};

test('marketState: equities session windows', () => {
  // Wed 2025-06-25 14:00 ET
  assert.strictEqual(marketState(Date.parse('2025-06-25T18:00:00Z'), eqCfg).canEnter, true);
  // pre-market
  assert.strictEqual(marketState(Date.parse('2025-06-25T12:00:00Z'), eqCfg).open, false);
  // eod flatten window 15:57 ET
  const eod = marketState(Date.parse('2025-06-25T19:57:00Z'), eqCfg);
  assert.strictEqual(eod.shouldFlatten, true);
  assert.strictEqual(eod.canEnter, false);
  // weekend + holiday
  assert.strictEqual(marketState(Date.parse('2025-06-28T18:00:00Z'), eqCfg).reason, 'weekend');
  assert.strictEqual(marketState(Date.parse('2025-07-04T18:00:00Z'), eqCfg).reason, 'holiday');
});

test('marketState: crypto is always open', () => {
  const s = marketState(Date.parse('2025-06-28T03:00:00Z'), { assetClass: 'crypto', cryptoSessionBoundaryEt: '' });
  assert.strictEqual(s.open, true);
  assert.strictEqual(s.canEnter, true);
});

test('pdtGate: blocks 4th day-trade under the floor, allows above', () => {
  assert.strictEqual(pdtGate({ equity: 10000, daytradeCount: 3, config: eqCfg }).allowed, false);
  assert.strictEqual(pdtGate({ equity: 10000, daytradeCount: 2, config: eqCfg }).allowed, true);
  assert.strictEqual(pdtGate({ equity: 50000, daytradeCount: 9, config: eqCfg }).allowed, true);
  assert.strictEqual(pdtGate({ equity: 1, daytradeCount: 9, config: { assetClass: 'crypto' } }).allowed, true);
});

test('microstructureGate: spread + freshness', () => {
  assert.strictEqual(microstructureGate({ bid: 100, ask: 100.05, quoteTsMs: 1000, now: 2000, config: eqCfg }).ok, true);
  assert.strictEqual(microstructureGate({ bid: 100, ask: 101, quoteTsMs: 1000, now: 2000, config: eqCfg }).reason, 'spread_too_wide');
  assert.strictEqual(microstructureGate({ bid: 100, ask: 100.01, quoteTsMs: 1000, now: 9000, config: eqCfg }).reason, 'quote_stale');
  assert.strictEqual(microstructureGate({ bid: 0, ask: 0, now: 1, config: eqCfg }).reason, 'no_quote');
});
