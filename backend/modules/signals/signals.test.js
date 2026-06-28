'use strict';

const test = require('node:test');
const assert = require('node:assert');
const { evaluateMomentumSignal } = require('./momentumSignal');
const { evaluateVwapReversionSignal } = require('./vwapReversionSignal');
const { evaluateSignal, listSignals } = require('./index');

function bars(prices) {
  return prices.map((c, i) => ({ t: i * 60000, o: c, h: c + 0.05, l: c - 0.05, c, v: 1000 + i }));
}
function accelUp(n = 70) {
  const p = [];
  let x = 100;
  for (let i = 0; i < n; i++) {
    x += 0.1 + i * 0.004;
    p.push(+x.toFixed(3));
  }
  return bars(p);
}
function downtrend(n = 70) {
  const p = [];
  let x = 100;
  for (let i = 0; i < n; i++) {
    x -= 0.15;
    p.push(+x.toFixed(3));
  }
  return bars(p);
}
function dipBelowVwap() {
  const p = [];
  let x = 100;
  for (let i = 0; i < 45; i++) p.push(+x.toFixed(3));
  for (let i = 0; i < 7; i++) p.push(+(p[p.length - 1] - 0.06).toFixed(3));
  p.push(+(p[p.length - 1] + 0.05).toFixed(3));
  return bars(p);
}

test('signals registry exposes both signals', () => {
  assert.deepStrictEqual(listSignals().sort(), ['momentum', 'vwap_reversion']);
});

test('declines are structured and never throw on short input', () => {
  for (const fn of [evaluateMomentumSignal, evaluateVwapReversionSignal]) {
    const r = fn({ symbol: 'X', bars1m: bars([1, 2, 3]) });
    assert.strictEqual(r.ok, false);
    assert.strictEqual(typeof r.reason, 'string');
  }
  // also handles missing input entirely
  assert.strictEqual(evaluateMomentumSignal().ok, false);
});

test('momentum fires on a clean uptrend with expected shape', () => {
  const r = evaluateMomentumSignal({
    symbol: 'T',
    bars1m: accelUp(),
    bars5m: accelUp(),
    config: { rsiMin: 0, rsiMax: 100 },
  });
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.side, 'buy');
  assert.ok(r.confidence >= 0 && r.confidence <= 1);
  assert.ok(r.projectedBps > 0);
  assert.ok(Number.isFinite(r.volatilityBps));
});

test('momentum declines on a downtrend', () => {
  const r = evaluateMomentumSignal({ symbol: 'T', bars1m: downtrend(), bars5m: downtrend() });
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.reason, 'trend_not_up');
});

test('vwap reversion fires on a controlled dip', () => {
  const r = evaluateVwapReversionSignal({
    symbol: 'T',
    bars1m: dipBelowVwap(),
    config: { rsiFloor: 5, rsiCeil: 60, minStretchAtr: 0.2, emaSlow: 50 },
  });
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.side, 'buy');
  assert.ok(r.confidence >= 0 && r.confidence <= 1);
});

test('signals are pure — inputs are not mutated', () => {
  const input = accelUp();
  const snapshot = JSON.stringify(input);
  evaluateMomentumSignal({ symbol: 'T', bars1m: input, bars5m: input, config: { rsiMax: 100 } });
  assert.strictEqual(JSON.stringify(input), snapshot);
});

test('evaluateSignal dispatches by name and guards unknown names', () => {
  assert.strictEqual(evaluateSignal('nope', {}).reason, 'unknown_signal:nope');
  const r = evaluateSignal('momentum', { symbol: 'T', bars1m: accelUp(), bars5m: accelUp(), config: { rsiMax: 100 } });
  assert.strictEqual(r.ok, true);
});
