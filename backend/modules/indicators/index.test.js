'use strict';

const test = require('node:test');
const assert = require('node:assert');
const I = require('./index');

function mkBars(prices) {
  return prices.map((c, i) => ({ t: i * 60000, o: c, h: c + 0.5, l: c - 0.5, c, v: 1000 }));
}

test('sma / ema basic correctness', () => {
  assert.strictEqual(I.sma([2, 4, 6], 3), 4);
  assert.strictEqual(I.sma([1, 2], 5), null);
  assert.ok(Math.abs(I.ema([1, 2, 3, 4, 5], 3) - 4) < 1e-9);
});

test('rsi bounds and monotonic series', () => {
  const up = Array.from({ length: 30 }, (_, i) => i + 1);
  const down = Array.from({ length: 30 }, (_, i) => 30 - i);
  assert.strictEqual(Math.round(I.rsi(up)), 100);
  assert.strictEqual(Math.round(I.rsi(down)), 0);
  assert.strictEqual(I.rsi([1, 2], 14), null);
});

test('vwap weights by volume', () => {
  const bars = [
    { h: 10, l: 10, c: 10, v: 100 },
    { h: 20, l: 20, c: 20, v: 300 },
  ];
  // (10*100 + 20*300) / 400 = 17.5
  assert.strictEqual(I.vwap(bars), 17.5);
  assert.strictEqual(I.vwap([]), null);
});

test('atr positive for ranging bars', () => {
  const bars = mkBars(Array.from({ length: 30 }, (_, i) => 100 + Math.sin(i)));
  assert.ok(I.atr(bars, 14) > 0);
});

test('macd returns finite values for long series', () => {
  const vals = Array.from({ length: 60 }, (_, i) => 100 + Math.sin(i / 3) * 5);
  const m = I.macd(vals);
  assert.ok(Number.isFinite(m.macd) && Number.isFinite(m.signal) && Number.isFinite(m.hist));
});

test('momentumBps sign tracks direction', () => {
  assert.ok(I.momentumBps([100, 101, 102, 103], 3) > 0);
  assert.ok(I.momentumBps([103, 102, 101, 100], 3) < 0);
});
