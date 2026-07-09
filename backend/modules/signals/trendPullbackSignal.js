'use strict';

/**
 * trendPullbackSignal.js
 * -----------------------------------------------------------------------------
 * Pure, long-only, HIGHER-TIMEFRAME trend-pullback continuation signal. Built to
 * replace the naive 1m momentum chase (which buys extended tops → ~37% win, no
 * net edge). Conforms to the signal contract:
 *
 *   evaluateTrendPullbackSignal({ symbol, bars1m, bars5m, config }) ->
 *     { ok:true, reason, confidence, projectedBps, volatilityBps, side, ... }
 *   | { ok:false, reason }
 *
 * Thesis (the edge we are testing): in an ESTABLISHED higher-timeframe uptrend
 * (5m EMA20 > EMA50 and EMA20 rising, price above EMA50), a shallow PULLBACK to
 * the 20-EMA that then RESUMES up (1m MACD histogram crosses positive + price
 * reclaims short EMA) continues more often than a fresh breakout does — and you
 * enter near support, not extended, so the reward:risk is materially better.
 * We buy dips in trends, not rips at the top. Every threshold is measured, not
 * assumed; grade it with scripts/backtest_equities.js before trusting it.
 */

const I = require('../indicators');

function clamp01(x) {
  return Math.max(0, Math.min(1, x));
}

function evaluateTrendPullbackSignal({ symbol, bars1m, bars5m, config = {} } = {}) {
  const c = {
    htfEmaFast: 20, // 5m fast EMA (the pullback magnet)
    htfEmaSlow: 50, // 5m trend filter
    slopeLookback: 3, // 5m bars over which EMA20 must be rising
    pullbackLookback: 6, // 5m bars in which a dip to EMA20 must have occurred
    pullbackAtrMult: 0.6, // "near" the EMA20 = within this * ATR
    rsiPeriod: 14,
    rsiMin: 42, // dip must have recovered above this...
    rsiMax: 68, // ...but not be overbought (no chasing)
    ltfEmaFast: 9, // 1m reclaim EMA
    projAtrMult: 1.3, // projected move = this * ATR (bps), the conviction target
    minProjectedBps: 10,
    ...config,
  };

  if (!Array.isArray(bars1m) || bars1m.length < 30) return { ok: false, reason: 'insufficient_1m_bars' };
  if (!Array.isArray(bars5m) || bars5m.length < c.htfEmaSlow + c.slopeLookback + 2) {
    return { ok: false, reason: 'insufficient_5m_bars' };
  }

  const close1 = I.closes(bars1m);
  const close5 = I.closes(bars5m);
  const last = close1[close1.length - 1];
  const last5 = close5[close5.length - 1];
  if (!(last > 0) || !(last5 > 0)) return { ok: false, reason: 'bad_last_price' };

  // --- 1) Established higher-timeframe uptrend (5m) ---------------------------
  const ema20Series = I.emaSeries(close5, c.htfEmaFast);
  const ema50 = I.ema(close5, c.htfEmaSlow);
  if (!ema20Series || ema50 == null) return { ok: false, reason: 'htf_ema_unavailable' };
  const ema20 = ema20Series[ema20Series.length - 1];
  const ema20Prev = ema20Series[ema20Series.length - 1 - c.slopeLookback];
  if (ema20Prev == null) return { ok: false, reason: 'htf_slope_unavailable' };
  if (!(ema20 > ema50)) return { ok: false, reason: 'htf_trend_not_up' };
  if (!(ema20 > ema20Prev)) return { ok: false, reason: 'htf_trend_flat_or_down' };
  if (!(last5 > ema50)) return { ok: false, reason: 'price_below_htf_trend' };

  // --- 2) There WAS a shallow pullback to the 20-EMA recently -----------------
  const atr5 = I.atr(bars5m, 14);
  if (atr5 == null || !(atr5 > 0)) return { ok: false, reason: 'atr_unavailable' };
  const nearBand = c.pullbackAtrMult * atr5;
  let pulledBack = false;
  for (let i = Math.max(0, bars5m.length - c.pullbackLookback); i < bars5m.length; i++) {
    const lo = typeof bars5m[i].l === 'number' ? bars5m[i].l : close5[i];
    const emaAtI = ema20Series[i];
    if (emaAtI != null && lo <= emaAtI + nearBand) {
      pulledBack = true;
      break;
    }
  }
  if (!pulledBack) return { ok: false, reason: 'no_recent_pullback' };

  // --- 3) The pullback is RESUMING up (not still falling) ---------------------
  // Price must be back above the 20-EMA (reclaimed support)...
  if (!(last5 >= ema20)) return { ok: false, reason: 'not_reclaimed_htf_ema' };
  // ...RSI recovered but not overbought (no chasing an extended move)...
  const rsi5 = I.rsi(close5, c.rsiPeriod);
  if (rsi5 == null) return { ok: false, reason: 'rsi_unavailable' };
  if (rsi5 < c.rsiMin) return { ok: false, reason: 'rsi_too_weak' };
  if (rsi5 > c.rsiMax) return { ok: false, reason: 'rsi_overbought' };
  // ...and the 1m momentum has just turned back up (histogram crossed positive).
  const macdNow = I.macd(close1);
  const macdPrev = I.macd(close1.slice(0, -1));
  if (macdNow.hist == null || macdPrev.hist == null) return { ok: false, reason: 'macd_unavailable' };
  if (!(macdNow.hist > 0)) return { ok: false, reason: 'ltf_momentum_not_up' };
  if (!(macdPrev.hist <= 0)) return { ok: false, reason: 'ltf_momentum_not_a_fresh_turn' };
  // Confirm the 1m reclaim of its own short EMA.
  const ltfEma = I.ema(close1, c.ltfEmaFast);
  if (ltfEma == null || !(last >= ltfEma)) return { ok: false, reason: 'below_ltf_ema' };

  // --- 4) Score the setup ----------------------------------------------------
  const volatilityBps = (atr5 / last5) * 10000;
  const slopeBps = ((ema20 - ema20Prev) / ema20Prev) * 10000; // trend strength
  const trendStrength = clamp01(slopeBps / 20); // 20 bps rise over lookback => 1.0
  const rsiRoom = clamp01((c.rsiMax - rsi5) / (c.rsiMax - 50)); // more room below OB => better
  const stackWidth = clamp01(((ema20 - ema50) / ema50) / 0.01); // 1% EMA stack => 1.0
  const macdTurn = clamp01(macdNow.hist / (0.5 * (atr5))); // strength of the turn, ATR-normalized
  const confidence = clamp01(0.35 * trendStrength + 0.25 * rsiRoom + 0.2 * stackWidth + 0.2 * macdTurn);

  // Projected move: conviction target scaled by volatility. Pullback entries sit
  // near support so the runway back up (and beyond) is a multiple of ATR.
  const projectedBps = Math.min(400, Math.max(c.minProjectedBps, c.projAtrMult * volatilityBps));

  return {
    ok: true,
    reason: 'trend_pullback_long',
    signal: 'trend_pullback',
    side: 'buy',
    confidence,
    projectedBps,
    volatilityBps,
    features: { rsi5, ema20, ema50, slopeBps, macdHist: macdNow.hist, macdPrevHist: macdPrev.hist },
  };
}

module.exports = { evaluateTrendPullbackSignal };
