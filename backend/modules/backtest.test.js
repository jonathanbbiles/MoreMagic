'use strict';

const test = require('node:test');
const assert = require('node:assert');
const { backtestSignal, syntheticBars, passesValidation, downsample } = require('./backtest');
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
  }
});

test('passesValidation enforces sample + expectancy floors', () => {
  const c = cfg({ backtestMinSamples: 5, backtestMinExpectancyBps: 5 });
  assert.strictEqual(passesValidation({ sample: 10, expectancyBps: 8 }, c), true);
  assert.strictEqual(passesValidation({ sample: 3, expectancyBps: 100 }, c), false);
  assert.strictEqual(passesValidation({ sample: 50, expectancyBps: -1 }, c), false);
});
