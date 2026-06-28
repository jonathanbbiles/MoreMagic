'use strict';

/**
 * microstructure.js — spread + quote-freshness gate.
 * -----------------------------------------------------------------------------
 * Rejects entries when the bid/ask is too wide or the quote is stale. Pure;
 * `now` is passed in so freshness is deterministic.
 */

/**
 * @param {object} p
 * @param {number} p.bid
 * @param {number} p.ask
 * @param {number} p.quoteTsMs  quote timestamp (epoch ms)
 * @param {number} p.now        current time (epoch ms)
 * @param {object} p.config     validated config (maxSpreadBps, maxQuoteAgeMs)
 * @returns {{ ok:boolean, reason:string, spreadBps:(number|null), ageMs:(number|null), mid:(number|null) }}
 */
function microstructureGate({ bid, ask, quoteTsMs, now, config } = {}) {
  const b = Number(bid);
  const a = Number(ask);
  if (!(b > 0) || !(a > 0)) return { ok: false, reason: 'no_quote', spreadBps: null, ageMs: null, mid: null };
  if (a < b) return { ok: false, reason: 'crossed_quote', spreadBps: null, ageMs: null, mid: null };

  const mid = (a + b) / 2;
  const spreadBps = ((a - b) / mid) * 10000;
  const ageMs = Number.isFinite(quoteTsMs) ? Math.max(0, now - quoteTsMs) : null;

  if (spreadBps > config.maxSpreadBps) {
    return { ok: false, reason: 'spread_too_wide', spreadBps, ageMs, mid };
  }
  if (ageMs != null && ageMs > config.maxQuoteAgeMs) {
    return { ok: false, reason: 'quote_stale', spreadBps, ageMs, mid };
  }
  return { ok: true, reason: 'microstructure_ok', spreadBps, ageMs, mid };
}

module.exports = { microstructureGate };
