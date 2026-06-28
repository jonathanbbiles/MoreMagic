'use strict';

/**
 * execution/normalize.js
 * -----------------------------------------------------------------------------
 * Pure transforms from raw Alpaca JSON into the canonical shapes the strategy
 * loop consumes. Keeping these pure means every adapter returns identical shapes
 * and the loop never branches on venue — and we can unit-test them with fixtures
 * even when the broker is unreachable.
 */

function toMs(t) {
  if (t == null) return null;
  if (typeof t === 'number') return t;
  const ms = Date.parse(t);
  return Number.isFinite(ms) ? ms : null;
}
function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function normalizeBar(b) {
  return { t: toMs(b.t), o: num(b.o), h: num(b.h), l: num(b.l), c: num(b.c), v: num(b.v) };
}
function normalizeBars(arr) {
  return (Array.isArray(arr) ? arr : []).map(normalizeBar).filter((b) => b.c != null);
}

function normalizeAccount(a = {}) {
  return {
    equity: num(a.equity),
    lastEquity: num(a.last_equity),
    cash: num(a.cash),
    buyingPower: num(a.buying_power),
    daytradeCount: num(a.daytrade_count) ?? 0,
    patternDayTrader: !!a.pattern_day_trader,
    status: a.status ?? null,
    currency: a.currency ?? 'USD',
    raw: a,
  };
}

function normalizePosition(p = {}) {
  return {
    symbol: p.symbol,
    qty: num(p.qty),
    side: p.side ?? (num(p.qty) >= 0 ? 'long' : 'short'),
    avgEntryPrice: num(p.avg_entry_price),
    currentPrice: num(p.current_price),
    marketValue: num(p.market_value),
    costBasis: num(p.cost_basis),
    unrealizedPl: num(p.unrealized_pl),
    unrealizedPlpc: num(p.unrealized_plpc),
    raw: p,
  };
}

function normalizeOrder(o = {}) {
  return {
    id: o.id,
    clientOrderId: o.client_order_id ?? null,
    symbol: o.symbol,
    side: o.side,
    type: o.type,
    qty: num(o.qty),
    notional: num(o.notional),
    filledQty: num(o.filled_qty),
    limitPrice: num(o.limit_price),
    status: o.status,
    submittedAtMs: toMs(o.submitted_at) ?? toMs(o.created_at),
    raw: o,
  };
}

/** Equities latest quote: { quote: { bp, ap, bs, as, t } }. */
function normalizeEquityQuote(payload = {}) {
  const q = payload.quote || {};
  return { bid: num(q.bp), ask: num(q.ap), bidSize: num(q.bs), askSize: num(q.as), tsMs: toMs(q.t) };
}

/** Crypto latest quote: { quotes: { "BTC/USD": { bp, ap, bs, as, t } } }. */
function normalizeCryptoQuote(payload = {}, symbol) {
  const q = (payload.quotes && payload.quotes[symbol]) || {};
  return { bid: num(q.bp), ask: num(q.ap), bidSize: num(q.bs), askSize: num(q.as), tsMs: toMs(q.t) };
}

module.exports = {
  toMs,
  normalizeBar,
  normalizeBars,
  normalizeAccount,
  normalizePosition,
  normalizeOrder,
  normalizeEquityQuote,
  normalizeCryptoQuote,
};
