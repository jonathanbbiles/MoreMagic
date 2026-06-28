'use strict';

/**
 * modules/backtest.js — pure signal backtester.
 * -----------------------------------------------------------------------------
 * Replays 1-minute bars and grades a signal by simulating entries (at bar close
 * when the signal fires + clears confidence/score) and exits (take-profit /
 * stop / max-hold). No network, no clock — deterministic given bars + config, so
 * it doubles as the "backtest validation before a signal goes live" gate input.
 */

const { evaluateSignal } = require('./signals');
const { scoreSetup } = require('./smart/scoreSetup');

/** Deterministic PRNG (mulberry32) so synthetic series are reproducible. */
function mulberry32(seed) {
  let a = seed >>> 0;
  return function rng() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Generate a synthetic 1m series with drift + noise + intraday waves. */
function syntheticBars(n = 800, { seed = 7, start = 100, driftBps = 1.2, noiseBps = 18 } = {}) {
  const rng = mulberry32(seed);
  const bars = [];
  let price = start;
  for (let i = 0; i < n; i++) {
    const wave = Math.sin(i / 40) * 0.0006; // slow intraday swing
    const shock = (rng() - 0.5) * 2 * (noiseBps / 10000);
    const drift = driftBps / 10000;
    price = Math.max(1, price * (1 + drift + wave + shock));
    const c = +price.toFixed(4);
    const h = +(c * (1 + Math.abs(shock) / 2)).toFixed(4);
    const l = +(c * (1 - Math.abs(shock) / 2)).toFixed(4);
    bars.push({ t: i * 60000, o: c, h, l, c, v: 1000 + Math.floor(rng() * 500) });
  }
  return bars;
}

function downsample(bars, factor) {
  const out = [];
  for (let i = 0; i < bars.length; i += factor) {
    const chunk = bars.slice(i, i + factor);
    if (!chunk.length) break;
    out.push({
      t: chunk[0].t,
      o: chunk[0].o,
      h: Math.max(...chunk.map((b) => b.h)),
      l: Math.min(...chunk.map((b) => b.l)),
      c: chunk[chunk.length - 1].c,
      v: chunk.reduce((s, b) => s + b.v, 0),
    });
  }
  return out;
}

/**
 * Run a single-position backtest of one signal over a 1m series.
 * @returns {{ trades:Array, sample:number, winRate:number|null, expectancyBps:number|null, totalBps:number, maxDrawdownBps:number }}
 */
function backtestSignal(bars1m, { signalName = 'momentum', config, warmup = 60 } = {}) {
  const trades = [];
  let pos = null; // { entryIdx, entryPrice }
  const tp = config.takeProfitBps;
  const sl = config.stopLossBps;
  const maxHoldBars = config.maxHoldMinutes; // 1m bars

  for (let i = warmup; i < bars1m.length; i++) {
    const price = bars1m[i].c;
    if (pos) {
      const plBps = ((price - pos.entryPrice) / pos.entryPrice) * 10000;
      const held = i - pos.entryIdx;
      let reason = null;
      if (plBps <= -sl) reason = 'stop_loss';
      else if (plBps >= tp) reason = 'take_profit';
      else if (held >= maxHoldBars) reason = 'max_hold';
      else if (i === bars1m.length - 1) reason = 'eod_flatten';
      if (reason) {
        trades.push({ entryIdx: pos.entryIdx, exitIdx: i, pnlBps: +plBps.toFixed(2), reason });
        pos = null;
      }
      continue;
    }
    const slice1 = bars1m.slice(0, i + 1);
    const slice5 = downsample(slice1, 5);
    const res = evaluateSignal(signalName, { symbol: 'BT', bars1m: slice1, bars5m: slice5, config });
    if (!res.ok || res.confidence < config.minConfidence) continue;
    const scored = scoreSetup({ signal: res, spreadBps: 0, config });
    if (scored.score < config.minScore) continue;
    pos = { entryIdx: i, entryPrice: price };
  }

  const sample = trades.length;
  const totalBps = trades.reduce((s, t) => s + t.pnlBps, 0);
  const wins = trades.filter((t) => t.pnlBps > 0).length;
  // running drawdown on cumulative bps
  let peak = 0;
  let cum = 0;
  let maxDd = 0;
  for (const t of trades) {
    cum += t.pnlBps;
    peak = Math.max(peak, cum);
    maxDd = Math.min(maxDd, cum - peak);
  }
  return {
    trades,
    sample,
    winRate: sample ? +(wins / sample).toFixed(4) : null,
    expectancyBps: sample ? +(totalBps / sample).toFixed(2) : null,
    totalBps: +totalBps.toFixed(2),
    maxDrawdownBps: +maxDd.toFixed(2),
  };
}

/** The "min-expectancy over enough samples" validation gate. */
function passesValidation(result, config) {
  return result.sample >= config.backtestMinSamples && (result.expectancyBps ?? -Infinity) >= config.backtestMinExpectancyBps;
}

module.exports = { backtestSignal, syntheticBars, downsample, mulberry32, passesValidation };
