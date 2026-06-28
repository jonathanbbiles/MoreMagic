'use strict';

/**
 * vwapReversionSignal.js
 * -----------------------------------------------------------------------------
 * Pure, long-only intraday mean-reversion signal. Buys controlled dips: price
 * stretched below VWAP by a meaningful (ATR-scaled) amount, RSI oversold but
 * curling back up, while the broader trend is not outright broken.
 *
 * Same contract + shape as momentumSignal so the loop never branches on which
 * signal produced the decision.
 */

const I = require('../indicators');

function clamp01(x) {
  return Math.max(0, Math.min(1, x));
}

function evaluateVwapReversionSignal({ symbol, bars1m, bars5m, config = {} } = {}) {
  const c = {
    rsiPeriod: 14,
    rsiFloor: 25,
    rsiCeil: 45, // oversold-ish band
    minStretchAtr: 0.6, // require price >= this many ATRs below VWAP
    emaSlow: 50, // longer-term context; reversion only if not in freefall
    ...config,
  };

  if (!Array.isArray(bars1m) || bars1m.length < 30) {
    return { ok: false, reason: 'insufficient_1m_bars' };
  }
  const close1 = I.closes(bars1m);
  const last = close1[close1.length - 1];
  if (!(last > 0)) return { ok: false, reason: 'bad_last_price' };

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

  // Reversion confirmation: last close above the prior close (curling up).
  const prev = close1[close1.length - 2];
  if (!(last >= prev)) return { ok: false, reason: 'no_upturn_yet' };

  // Don't catch a structural downtrend: keep price within a band of slow EMA.
  const emaSlow = I.ema(close1, c.emaSlow);
  if (emaSlow != null && last < emaSlow * 0.97) {
    return { ok: false, reason: 'below_trend_band' };
  }

  const volatilityBps = (atr / last) * 10000;

  const stretchScore = clamp01((stretchAtr - c.minStretchAtr) / 1.5);
  const rsiScore = clamp01((c.rsiCeil - rsi) / (c.rsiCeil - c.rsiFloor));
  const upturnScore = clamp01((last - prev) / prev / 0.002);
  const confidence = clamp01(0.45 * stretchScore + 0.35 * rsiScore + 0.2 * upturnScore);

  // Target the snap back toward VWAP, capped.
  const projectedBps = Math.min(400, ((vwap - last) / last) * 10000);

  return {
    ok: true,
    reason: 'vwap_reversion_long',
    signal: 'vwap_reversion',
    side: 'buy',
    confidence,
    projectedBps,
    volatilityBps,
    features: { rsi, vwap, stretchAtr, emaSlow },
  };
}

module.exports = { evaluateVwapReversionSignal };
