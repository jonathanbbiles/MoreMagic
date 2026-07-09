'use strict';

/**
 * vwapReversionProSignal.js
 * -----------------------------------------------------------------------------
 * A stricter, higher-conviction cousin of vwap_reversion. Measurement on real
 * equities 1m bars showed mean-reversion (not trend-chasing) carries the only
 * positive gross edge in this signal family (~+5 bps/trade) — but not enough to
 * clear the ~7.5 bps equities round-trip. This variant tries to widen that edge
 * by being far more selective about WHICH dip it buys:
 *
 *   - DEEPER dislocation: price must be >= ~1.1 ATR below VWAP (a real spike,
 *     not a shallow wiggle) — deep stretches revert harder.
 *   - REAL reversal confirmation: the last bar must reclaim the PRIOR bar's high
 *     (a genuine turn), not merely close a tick above the prior close.
 *   - NOT a structural downtrend: price near/above the slow EMA and the 20-EMA
 *     not steeply falling — buy dips in up/rangebound tape, never a falling knife.
 *
 * Same signal contract + shape. Long-only. Grade it with backtest_equities.js;
 * it is OFF by default until it demonstrably clears cost with margin.
 */

const I = require('../indicators');

function clamp01(x) {
  return Math.max(0, Math.min(1, x));
}

function evaluateVwapReversionProSignal({ symbol, bars1m, bars5m, config = {} } = {}) {
  const c = {
    rsiPeriod: 14,
    rsiFloor: 22, // avoid the true falling knife below this
    rsiCeil: 44, // oversold band ceiling
    minStretchAtr: 1.1, // DEEPER than base (0.6): only real dislocations
    emaSlow: 50,
    emaTrend: 20,
    trendSlopeLookback: 3,
    ...config,
  };

  if (!Array.isArray(bars1m) || bars1m.length < 40) return { ok: false, reason: 'insufficient_1m_bars' };
  const close1 = I.closes(bars1m);
  const last = close1[close1.length - 1];
  const prevBar = bars1m[bars1m.length - 2];
  if (!(last > 0) || !prevBar) return { ok: false, reason: 'bad_last_price' };

  const vwap = I.vwap(bars1m);
  if (vwap == null) return { ok: false, reason: 'vwap_unavailable' };
  if (!(last < vwap)) return { ok: false, reason: 'not_below_vwap' };

  const atr = I.atr(bars1m, 14);
  if (atr == null || atr <= 0) return { ok: false, reason: 'atr_unavailable' };
  const stretchAtr = (vwap - last) / atr;
  if (stretchAtr < c.minStretchAtr) return { ok: false, reason: 'not_stretched_enough' };

  const rsi = I.rsi(close1, c.rsiPeriod);
  if (rsi == null) return { ok: false, reason: 'rsi_unavailable' };
  if (rsi < c.rsiFloor) return { ok: false, reason: 'rsi_falling_knife' };
  if (rsi > c.rsiCeil) return { ok: false, reason: 'rsi_not_oversold' };

  // Real reversal confirmation: reclaim the PRIOR bar's high (not just its close).
  const prevHigh = typeof prevBar.h === 'number' ? prevBar.h : close1[close1.length - 2];
  const prevClose = close1[close1.length - 2];
  if (!(last > prevClose)) return { ok: false, reason: 'no_upturn_yet' };
  if (!(last >= prevHigh)) return { ok: false, reason: 'no_range_reclaim' };

  // Not a structural downtrend: near/above slow EMA and 20-EMA not steeply down.
  const emaSlow = I.ema(close1, c.emaSlow);
  if (emaSlow != null && last < emaSlow * 0.97) return { ok: false, reason: 'below_trend_band' };
  const ema20Series = I.emaSeries(close1, c.emaTrend);
  if (ema20Series) {
    const e0 = ema20Series[ema20Series.length - 1];
    const eP = ema20Series[ema20Series.length - 1 - c.trendSlopeLookback];
    if (e0 != null && eP != null) {
      const slopeBps = ((e0 - eP) / eP) * 10000;
      if (slopeBps < -15) return { ok: false, reason: 'trend_falling_fast' };
    }
  }

  const volatilityBps = (atr / last) * 10000;

  const stretchScore = clamp01((stretchAtr - c.minStretchAtr) / 1.5);
  const rsiScore = clamp01((c.rsiCeil - rsi) / (c.rsiCeil - c.rsiFloor));
  const reclaimScore = clamp01((last - prevHigh) / prevHigh / 0.001);
  const confidence = clamp01(0.45 * stretchScore + 0.3 * rsiScore + 0.25 * reclaimScore);

  // Target the snap back toward VWAP (the mean), capped.
  const projectedBps = Math.min(400, ((vwap - last) / last) * 10000);

  return {
    ok: true,
    reason: 'vwap_reversion_pro_long',
    signal: 'vwap_reversion_pro',
    side: 'buy',
    confidence,
    projectedBps,
    volatilityBps,
    features: { rsi, vwap, stretchAtr, emaSlow },
  };
}

module.exports = { evaluateVwapReversionProSignal };
