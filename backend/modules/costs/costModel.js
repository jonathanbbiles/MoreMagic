'use strict';

/**
 * costs/costModel.js — the single, audited source of truth for trading friction.
 * -----------------------------------------------------------------------------
 * Pure: given the venue/config and (optionally) a real spread, it returns the
 * per-round-trip cost of a trade in basis points. Both the backtester (to net
 * its expectancy) and trade.js (to net the circuit-breaker ledger) route through
 * this one module, so the validation gate and the live safety net see the SAME
 * costs. That is the whole point — costs must never be visible in one place and
 * hidden in the other.
 *
 * What a round trip pays (all in bps of notional):
 *   - fees      : taker fee per side x2. Alpaca equities are commission-free
 *                 (0 bps); crypto is a taker fee (~25 bps). Market orders are
 *                 always the taker.
 *   - spread    : a market BUY lifts the ask, a market SELL hits the bid, so the
 *                 round trip pays ~one full quoted spread. Use the real spread
 *                 when we have it; fall back to a modeled default otherwise.
 *   - slippage  : adverse fill beyond the quote (market impact/latency), per
 *                 side x2. A modeled assumption — real fills are never the mid.
 *   - reg fees  : SEC + FINRA TAF + CAT, charged on SELLS only, equities only.
 *                 Tiny (<1 bp) but real; crypto has none.
 *
 * Nothing here reads env directly; it takes the typed config from validateEnv,
 * so there is one parsed, range-checked source of truth.
 */

function n(v, d = 0) {
  const x = Number(v);
  return Number.isFinite(x) ? x : d;
}

/** True when this config trades crypto (fees differ sharply from equities). */
function isCrypto(config) {
  return String(config && config.assetClass).toLowerCase() === 'crypto';
}

/** Taker fee per side (bps). Market orders are always taker. */
function perSideFeeBps(config) {
  return isCrypto(config) ? n(config.takerFeeBpsCrypto) : n(config.takerFeeBpsEquities);
}

/**
 * Round-trip trading cost for one entry+exit, in bps.
 * @param {object} p
 * @param {object} p.config typed config (needs assetClass + cost fields)
 * @param {number|null} [p.spreadBps] real quoted spread if known; else modeled
 * @returns {{ feeBps:number, spreadBps:number, slippageBps:number, regFeeBps:number, totalBps:number }}
 */
function roundTripCostBps({ config, spreadBps = null } = {}) {
  const feeBps = 2 * perSideFeeBps(config);
  const slippageBps = 2 * n(config.assumedSlippageBps);
  const spread = spreadBps != null && Number.isFinite(spreadBps) ? spreadBps : n(config.assumedSpreadBps);
  // Buy at ask + sell at bid ≈ one full spread across the round trip.
  const spreadCostBps = Math.max(0, spread);
  // Regulatory fees apply to the sell leg, equities only.
  const regFeeBps = isCrypto(config) ? 0 : n(config.regFeeBpsSell);

  const totalBps = feeBps + slippageBps + spreadCostBps + regFeeBps;
  return {
    feeBps: +feeBps.toFixed(3),
    spreadBps: +spreadCostBps.toFixed(3),
    slippageBps: +slippageBps.toFixed(3),
    regFeeBps: +regFeeBps.toFixed(3),
    totalBps: +totalBps.toFixed(3),
  };
}

/**
 * Net a gross P&L (bps) by subtracting modeled round-trip cost.
 * @param {number} grossBps
 * @param {object} opts { config, spreadBps? }
 * @returns {number} net bps
 */
function netPnlBps(grossBps, { config, spreadBps = null } = {}) {
  const { totalBps } = roundTripCostBps({ config, spreadBps });
  return +((n(grossBps) - totalBps)).toFixed(3);
}

module.exports = { perSideFeeBps, roundTripCostBps, netPnlBps, isCrypto };
