'use strict';

const test = require('node:test');
const assert = require('node:assert');
const { backtestSignal, decideBacktestExit, syntheticBars, passesValidation, downsample } = require('./backtest');
const { bootstrapLiveEnv } = require('../config/bootstrapLiveEnv');
const { validateEnv } = require('../config/validateEnv');

function cfg(overrides = {}) {
  const e = { APCA_API_KEY_ID: 'PK', APCA_API_SECRET_KEY: 's' };
  bootstrapLiveEnv(e);
  return { ...validateEnv(e), minConfidence: 0.4, minScore: 0.3, rsiMin: 0, rsiMax: 100, ...overrides };
}

test('syntheticBars is deterministic for a seed', () => {
  const a = syntheticBars(100, { seed: 5 });
  const b = syntheticBars(100, { seed: 5 });
  assert.strictEqual(a[99].c, b[99].c);
  const c = syntheticBars(100, { seed: 6 });
  assert.notStrictEqual(a[99].c, c[99].c);
});

test('downsample aggregates OHLCV correctly', () => {
  const bars = [
    { t: 0, o: 1, h: 2, l: 0.5, c: 1.5, v: 10 },
    { t: 60000, o: 1.5, h: 3, l: 1, c: 2.5, v: 20 },
  ];
  const d = downsample(bars, 2);
  assert.strictEqual(d.length, 1);
  assert.strictEqual(d[0].h, 3);
  assert.strictEqual(d[0].l, 0.5);
  assert.strictEqual(d[0].c, 2.5);
  assert.strictEqual(d[0].v, 30);
});

test('backtestSignal returns a structured, deterministic scorecard', () => {
  const bars = syntheticBars(800, { seed: 11 });
  const r1 = backtestSignal(bars, { signalName: 'momentum', config: cfg() });
  const r2 = backtestSignal(bars, { signalName: 'momentum', config: cfg() });
  assert.deepStrictEqual(r1, r2); // deterministic
  assert.ok(r1.sample >= 0);
  for (const t of r1.trades) {
    assert.ok(['take_profit', 'stop_loss', 'max_hold', 'eod_flatten'].includes(t.reason));
    assert.ok(t.exitIdx > t.entryIdx);
    // every trade now carries a gross figure and a net (post-cost) figure
    assert.ok(Number.isFinite(t.grossPnlBps));
    assert.ok(t.pnlBps <= t.grossPnlBps + 1e-9, 'net must not exceed gross');
  }
  assert.ok(r1.roundTripCostBps > 0, 'a round-trip cost is reported');
});

test('backtest expectancy is net of costs, and crypto costs bite harder than equities', () => {
  const bars = syntheticBars(1200, { seed: 11 });
  const eq = backtestSignal(bars, { signalName: 'momentum', config: cfg({ assetClass: 'equities' }) });
  const cx = backtestSignal(bars, { signalName: 'momentum', config: cfg({ assetClass: 'crypto' }) });
  if (eq.sample > 0) {
    assert.ok(eq.expectancyBps <= eq.grossExpectancyBps, 'net <= gross expectancy');
  }
  // crypto's round-trip cost (taker fees) must exceed equities' by design
  assert.ok(cx.roundTripCostBps > eq.roundTripCostBps);
});

test('passesValidation enforces sample + expectancy floors', () => {
  const c = cfg({ backtestMinSamples: 5, backtestMinExpectancyBps: 5 });
  assert.strictEqual(passesValidation({ sample: 10, expectancyBps: 8 }, c), true);
  assert.strictEqual(passesValidation({ sample: 3, expectancyBps: 100 }, c), false);
  assert.strictEqual(passesValidation({ sample: 50, expectancyBps: -1 }, c), false);
});


test('decideBacktestExit fills stops/TPs intrabar off the high/low, not the close', () => {
  const c = cfg(); // stopLossBps 80 (-> 99.2), takeProfitBps 120 (-> 101.2) at entry 100
  const base = { entryPrice: 100, heldBars: 1, isLastBar: false, config: c };

  // low pierces the stop even though the bar CLOSES green -> must stop out at the stop
  assert.deepStrictEqual(
    decideBacktestExit({ ...base, bar: { o: 100, h: 100.5, l: 99.0, c: 100.3 } }),
    { reason: 'stop_loss', fill: 100 * (1 - 80 / 10000) },
  );
  // high pierces the take-profit -> fill at the TP level
  assert.deepStrictEqual(
    decideBacktestExit({ ...base, bar: { o: 100, h: 101.5, l: 99.9, c: 100.1 } }),
    { reason: 'take_profit', fill: 100 * (1 + 120 / 10000) },
  );
});

test('decideBacktestExit fills at the OPEN when the bar gaps through a level', () => {
  const c = cfg();
  const base = { entryPrice: 100, heldBars: 1, isLastBar: false, config: c };
  // gap down through the stop: fill at the open (worse than the stop) — realistic
  assert.deepStrictEqual(
    decideBacktestExit({ ...base, bar: { o: 98.5, h: 99, l: 98, c: 98.8 } }),
    { reason: 'stop_loss', fill: 98.5 },
  );
  // gap up through the TP: fill at the open (better than the TP)
  assert.deepStrictEqual(
    decideBacktestExit({ ...base, bar: { o: 102, h: 102.5, l: 101.8, c: 102.2 } }),
    { reason: 'take_profit', fill: 102 },
  );
});

test('decideBacktestExit assumes the stop prints first on a whipsaw bar (conservative)', () => {
  const c = cfg();
  // one bar touches BOTH the stop and the TP -> stop wins
  const ex = decideBacktestExit({ entryPrice: 100, heldBars: 1, isLastBar: false, config: c, bar: { o: 100, h: 101.5, l: 99.0, c: 100 } });
  assert.strictEqual(ex.reason, 'stop_loss');
});

test('decideBacktestExit holds, then max-hold / EOD fill at the close', () => {
  const c = cfg();
  const quiet = { o: 100, h: 100.8, l: 99.5, c: 100.2 }; // touches neither level
  assert.strictEqual(decideBacktestExit({ entryPrice: 100, heldBars: 5, isLastBar: false, config: c, bar: quiet }), null);
  assert.deepStrictEqual(
    decideBacktestExit({ entryPrice: 100, heldBars: c.maxHoldMinutes, isLastBar: false, config: c, bar: quiet }),
    { reason: 'max_hold', fill: 100.2 },
  );
  assert.deepStrictEqual(
    decideBacktestExit({ entryPrice: 100, heldBars: 5, isLastBar: true, config: c, bar: quiet }),
    { reason: 'eod_flatten', fill: 100.2 },
  );
});
