'use strict';

/**
 * momentumSignal.js
 * -----------------------------------------------------------------------------
 * Pure, long-only intraday momentum signal. No network, no clock, no side
 * effects. Conforms to the signal contract:
 *
 *   evaluateMomentumSignal({ symbol, bars1m, bars5m, config }) ->
 *     { ok:true, reason, confidence /*0..1*\/, projectedBps, volatilityBps, ... }
 *   | { ok:false, reason }
 *
 * Thesis: enter when the higher-timeframe trend is up (EMA fast > slow on 5m),
 * price is leading its VWAP, short-term momentum (MACD histogram) is positive,
 * and RSI is strong-but-not-blown-off. Confidence blends those into 0..1.
 */

const I = require('../indicators');

function clamp01(x) {
  return Math.max(0, Math.min(1, x));
}

function evaluateMomentumSignal({ symbol, bars1m, bars5m, config = {} } = {}) {
  const c = {
    emaFast: 9,
    emaSlow: 21,
    rsiPeriod: 14,
    rsiMin: 50,
    rsiMax: 75,
    momentumLookback: 5, // bars on 1m
    minMomentumBps: 8,
    ...config,
  };

  if (!Array.isArray(bars1m) || bars1m.length < 30) {
    return { ok: false, reason: 'insufficient_1m_bars' };
  }
  const five = Array.isArray(bars5m) && bars5m.length >= c.emaSlow + 2 ? bars5m : null;

  const close1 = I.closes(bars1m);
  const last = close1[close1.length - 1];
  if (!(last > 0)) return { ok: false, reason: 'bad_last_price' };

  // Trend: prefer 5m EMA stack, fall back to 1m if 5m is short.
  const trendCloses = five ? I.closes(five) : close1;
  const emaFast = I.ema(trendCloses, c.emaFast);
  const emaSlow = I.ema(trendCloses, c.emaSlow);
  if (emaFast == null || emaSlow == null) return { ok: false, reason: 'ema_unavailable' };
  if (!(emaFast > emaSlow)) return { ok: false, reason: 'trend_not_up' };

  // VWAP leadership on the intraday (1m) series.
  const vwap = I.vwap(bars1m);
  if (vwap == null) return { ok: false, reason: 'vwap_unavailable' };
  if (!(last >= vwap)) return { ok: false, reason: 'below_vwap' };

  // Momentum: MACD histogram positive on 1m.
  const m = I.macd(close1);
  if (m.hist == null) return { ok: false, reason: 'macd_unavailable' };
  if (!(m.hist > 0)) return { ok: false, reason: 'macd_not_positive' };

  // RSI band.
  const rsi = I.rsi(close1, c.rsiPeriod);
  if (rsi == null) return { ok: false, reason: 'rsi_unavailable' };
  if (rsi < c.rsiMin) return { ok: false, reason: 'rsi_too_weak' };
  if (rsi > c.rsiMax) return { ok: false, reason: 'rsi_overbought' };

  // Short-term realized momentum.
  const momBps = I.momentumBps(close1, c.momentumLookback);
  if (momBps == null || momBps < c.minMomentumBps) return { ok: false, reason: 'momentum_too_low' };

  // Volatility (ATR in bps of price) for sizing/exit context.
  const atr = I.atr(bars1m, 14);
  const volatilityBps = atr != null ? (atr / last) * 10000 : null;

  // ---- Confidence blend (0..1) ----------------------------------------------
  const trendStrength = clamp01((emaFast - emaSlow) / emaSlow / 0.01); // 1% spread => 1.0
  const vwapLead = clamp01((last - vwap) / vwap / 0.005); // 0.5% over vwap => 1.0
  const rsiCenter = clamp01(1 - Math.abs(rsi - 62) / 25); // peak around RSI 62
  const momScore = clamp01(momBps / 50); // 50 bps over lookback => 1.0
  const confidence = clamp01(0.3 * trendStrength + 0.2 * vwapLead + 0.2 * rsiCenter + 0.3 * momScore);

  // Projected move: blend recent momentum and a fraction of ATR, capped.
  const atrBps = volatilityBps || 0;
  const projectedBps = Math.min(400, Math.max(momBps, 0.5 * atrBps));

  return {
    ok: true,
    reason: 'momentum_long',
    signal: 'momentum',
    side: 'buy',
    confidence,
    projectedBps,
    volatilityBps,
    features: { rsi, macdHist: m.hist, vwap, emaFast, emaSlow, momBps },
  };
}

module.exports = { evaluateMomentumSignal };
