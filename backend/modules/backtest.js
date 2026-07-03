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
const { netPnlBps, roundTripCostBps } = require('./costs/costModel');

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
 * Pure intrabar exit decision. Priority: gap-through-the-open > stop (assumed to
 * print first within a bar — conservative) > take-profit > max-hold > EOD. Returns
 * the exit reason AND the realized fill price, or null to keep holding. Using the
 * bar high/low (not just the close) stops the backtester from optimistically
 * "escaping" a stop that was pierced mid-bar.
 * @returns {{ reason:string, fill:number }|null}
 */
function decideBacktestExit({ bar, entryPrice, heldBars, isLastBar, config }) {
  const stopPrice = entryPrice * (1 - config.stopLossBps / 10000);
  const tpPrice = entryPrice * (1 + config.takeProfitBps / 10000);
  // Gap: the bar OPENS beyond a level — you cannot fill better than the open.
  if (bar.o <= stopPrice) return { reason: 'stop_loss', fill: bar.o };
  if (bar.o >= tpPrice) return { reason: 'take_profit', fill: bar.o };
  // Intrabar touch: assume the adverse (stop) prints first — conservative.
  if (bar.l <= stopPrice) return { reason: 'stop_loss', fill: stopPrice };
  if (bar.h >= tpPrice) return { reason: 'take_profit', fill: tpPrice };
  if (heldBars >= config.maxHoldMinutes) return { reason: 'max_hold', fill: bar.c };
  if (isLastBar) return { reason: 'eod_flatten', fill: bar.c };
  return null;
}

/**
 * Run a single-position backtest of one signal over a 1m series.
 * @returns {{ trades:Array, sample:number, winRate:number|null, expectancyBps:number|null, totalBps:number, maxDrawdownBps:number }}
 */
function backtestSignal(bars1m, { signalName = 'momentum', config, warmup = 60 } = {}) {
  const trades = [];
  let pos = null; // { entryIdx, entryPrice }

  for (let i = warmup; i < bars1m.length; i++) {
    const price = bars1m[i].c;
    if (pos) {
      // Intrabar fill: honor the bar's high/low (and a gap on the open), not just
      // the close, so a pierced stop exits at the stop — not optimistically at the
      // close. Costs are then applied to that realized fill.
      const bar = bars1m[i];
      const ex = decideBacktestExit({
        bar,
        entryPrice: pos.entryPrice,
        heldBars: i - pos.entryIdx,
        isLastBar: i === bars1m.length - 1,
        config,
      });
      if (ex) {
        const grossBps = ((ex.fill - pos.entryPrice) / pos.entryPrice) * 10000;
        const net = netPnlBps(grossBps, { config, spreadBps: config.assumedSpreadBps });
        trades.push({ entryIdx: pos.entryIdx, exitIdx: i, grossPnlBps: +grossBps.toFixed(2), pnlBps: +net.toFixed(2), reason: ex.reason });
        pos = null;
      }
      continue;
    }
    const slice1 = bars1m.slice(0, i + 1);
    const slice5 = downsample(slice1, 5);
    const res = evaluateSignal(signalName, { symbol: 'BT', bars1m: slice1, bars5m: slice5, config });
    if (!res.ok || res.confidence < config.minConfidence) continue;
    // Feed a modeled spread (not 0) so the score sees the same headwind live does.
    const scored = scoreSetup({ signal: res, spreadBps: config.assumedSpreadBps ?? 0, config });
    if (scored.score < config.minScore) continue;
    pos = { entryIdx: i, entryPrice: price };
  }

  const sample = trades.length;
  // All aggregate stats are NET of costs (t.pnlBps is net); gross is kept for transparency.
  const totalBps = trades.reduce((s, t) => s + t.pnlBps, 0);
  const grossTotalBps = trades.reduce((s, t) => s + (t.grossPnlBps ?? t.pnlBps), 0);
  const wins = trades.filter((t) => t.pnlBps > 0).length;
  // running drawdown on cumulative NET bps
  let peak = 0;
  let cum = 0;
  let maxDd = 0;
  for (const t of trades) {
    cum += t.pnlBps;
    peak = Math.max(peak, cum);
    maxDd = Math.min(maxDd, cum - peak);
  }
  const roundTripCost = roundTripCostBps({ config, spreadBps: config.assumedSpreadBps });
  return {
    trades,
    sample,
    winRate: sample ? +(wins / sample).toFixed(4) : null,
    expectancyBps: sample ? +(totalBps / sample).toFixed(2) : null, // NET expectancy (gates on this)
    grossExpectancyBps: sample ? +(grossTotalBps / sample).toFixed(2) : null,
    totalBps: +totalBps.toFixed(2), // NET
    grossTotalBps: +grossTotalBps.toFixed(2),
    roundTripCostBps: roundTripCost.totalBps,
    maxDrawdownBps: +maxDd.toFixed(2),
  };
}

/** The "min NET expectancy over enough samples" validation gate. */
function passesValidation(result, config) {
  return result.sample >= config.backtestMinSamples && (result.expectancyBps ?? -Infinity) >= config.backtestMinExpectancyBps;
}

module.exports = { backtestSignal, decideBacktestExit, syntheticBars, downsample, mulberry32, passesValidation };
