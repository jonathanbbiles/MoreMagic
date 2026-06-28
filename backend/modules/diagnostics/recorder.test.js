'use strict';

const test = require('node:test');
const assert = require('node:assert');
const { createRecorder } = require('./recorder');

test('recorder builds an observational scorecard + skip histogram', () => {
  const d = createRecorder();
  d.recordSkip('below_vwap');
  d.recordSkip('below_vwap');
  d.recordSkip('spread_too_wide');
  d.recordClosedTrade({ signal: 'momentum', symbol: 'AAPL', pnlBps: 12, pnlUsd: 3 });
  d.recordClosedTrade({ signal: 'momentum', symbol: 'MSFT', pnlBps: -8, pnlUsd: -2 });
  d.recordEquity(100000);
  const m = d.getMeta();
  assert.strictEqual(m.scorecard.closedTrades, 2);
  assert.strictEqual(m.scorecard.winRate, 0.5);
  assert.strictEqual(m.skipReasons.below_vwap, 2);
  assert.strictEqual(m.equityOverTime.length, 1);
});

test('equity series is bounded (ring buffer)', () => {
  const d = createRecorder({ equityMax: 10 });
  for (let i = 0; i < 50; i++) d.recordEquity(1000 + i);
  assert.ok(d.getMeta().equityOverTime.length <= 10);
});
