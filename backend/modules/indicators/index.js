'use strict';

/**
 * indicators/index.js
 * -----------------------------------------------------------------------------
 * Pure technical-indicator math. No network, no clock, no side effects.
 * A "bar" is { t, o, h, l, c, v } (epoch ms or ISO for t). Functions accept
 * either an array of bars or an array of numbers where noted.
 */

function closes(bars) {
  return bars.map((b) => (typeof b === 'number' ? b : b.c));
}

/** Simple moving average of the last `period` values. Returns null if too few. */
function sma(values, period) {
  if (!Array.isArray(values) || values.length < period || period <= 0) return null;
  let sum = 0;
  for (let i = values.length - period; i < values.length; i++) sum += values[i];
  return sum / period;
}

/** Full EMA series (same length as input; seeded with SMA). */
function emaSeries(values, period) {
  if (!Array.isArray(values) || values.length === 0 || period <= 0) return [];
  const k = 2 / (period + 1);
  const out = new Array(values.length).fill(null);
  // seed with SMA of first `period`
  if (values.length < period) return out;
  let seed = 0;
  for (let i = 0; i < period; i++) seed += values[i];
  seed /= period;
  out[period - 1] = seed;
  for (let i = period; i < values.length; i++) {
    out[i] = values[i] * k + out[i - 1] * (1 - k);
  }
  return out;
}

/** Latest EMA value (or null). */
function ema(values, period) {
  const s = emaSeries(values, period);
  for (let i = s.length - 1; i >= 0; i--) if (s[i] != null) return s[i];
  return null;
}

/** Wilder's RSI of close prices. Returns 0..100 or null. */
function rsi(values, period = 14) {
  if (!Array.isArray(values) || values.length <= period) return null;
  let gain = 0;
  let loss = 0;
  for (let i = 1; i <= period; i++) {
    const d = values[i] - values[i - 1];
    if (d >= 0) gain += d;
    else loss -= d;
  }
  gain /= period;
  loss /= period;
  for (let i = period + 1; i < values.length; i++) {
    const d = values[i] - values[i - 1];
    gain = (gain * (period - 1) + Math.max(d, 0)) / period;
    loss = (loss * (period - 1) + Math.max(-d, 0)) / period;
  }
  if (loss === 0) return 100;
  const rs = gain / loss;
  return 100 - 100 / (1 + rs);
}

/** MACD. Returns { macd, signal, hist } using EMA(fast)-EMA(slow), EMA(signal). */
function macd(values, fast = 12, slow = 26, signalPeriod = 9) {
  if (!Array.isArray(values) || values.length < slow + signalPeriod) {
    return { macd: null, signal: null, hist: null };
  }
  const emaFast = emaSeries(values, fast);
  const emaSlow = emaSeries(values, slow);
  const macdLine = values.map((_, i) =>
    emaFast[i] != null && emaSlow[i] != null ? emaFast[i] - emaSlow[i] : null,
  );
  const compact = macdLine.filter((v) => v != null);
  const sigSeries = emaSeries(compact, signalPeriod);
  const macdVal = compact[compact.length - 1];
  const signalVal = sigSeries[sigSeries.length - 1];
  return {
    macd: macdVal ?? null,
    signal: signalVal ?? null,
    hist: macdVal != null && signalVal != null ? macdVal - signalVal : null,
  };
}

/** Session VWAP over the provided bars (typical price * volume). */
function vwap(bars) {
  if (!Array.isArray(bars) || bars.length === 0) return null;
  let pv = 0;
  let vol = 0;
  for (const b of bars) {
    const typical = (b.h + b.l + b.c) / 3;
    const v = b.v || 0;
    pv += typical * v;
    vol += v;
  }
  if (vol === 0) return null;
  return pv / vol;
}

/** Average True Range (Wilder). Returns absolute price units or null. */
function atr(bars, period = 14) {
  if (!Array.isArray(bars) || bars.length <= period) return null;
  const trs = [];
  for (let i = 1; i < bars.length; i++) {
    const h = bars[i].h;
    const l = bars[i].l;
    const pc = bars[i - 1].c;
    trs.push(Math.max(h - l, Math.abs(h - pc), Math.abs(l - pc)));
  }
  let a = 0;
  for (let i = 0; i < period; i++) a += trs[i];
  a /= period;
  for (let i = period; i < trs.length; i++) a = (a * (period - 1) + trs[i]) / period;
  return a;
}

/** Percent return (in bps) of last close vs `lookback` bars ago. */
function momentumBps(values, lookback) {
  if (!Array.isArray(values) || values.length <= lookback) return null;
  const prev = values[values.length - 1 - lookback];
  const last = values[values.length - 1];
  if (!prev) return null;
  return ((last - prev) / prev) * 10000;
}

module.exports = { closes, sma, ema, emaSeries, rsi, macd, vwap, atr, momentumBps };
