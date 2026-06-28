'use strict';

/**
 * pdt.js — Pattern Day Trader awareness (equities only).
 * -----------------------------------------------------------------------------
 * US rule: accounts under $25k equity are limited to 3 day-trades per rolling
 * 5 business days. Alpaca surfaces `daytrade_count` and `equity` on the account;
 * we pre-check here so the loop can skip an entry that would breach the limit
 * (rather than letting the broker reject it). Pure function — no I/O.
 */

/**
 * @param {object} p
 * @param {number} p.equity         account equity in USD
 * @param {number} p.daytradeCount  day trades used in the rolling 5-day window
 * @param {object} p.config         validated config (pdt* fields, assetClass)
 * @returns {{ allowed:boolean, reason:string, remaining:(number|null) }}
 */
function pdtGate({ equity, daytradeCount, config } = {}) {
  if (!config || config.assetClass !== 'equities') {
    return { allowed: true, reason: 'pdt_na_non_equities', remaining: null };
  }
  if (!config.pdtEnforce) {
    return { allowed: true, reason: 'pdt_enforcement_disabled', remaining: null };
  }
  const eq = Number(equity);
  if (Number.isFinite(eq) && eq >= config.pdtEquityFloorUsd) {
    return { allowed: true, reason: 'above_pdt_floor', remaining: null };
  }
  const used = Number(daytradeCount) || 0;
  const remaining = Math.max(0, config.pdtMaxDayTrades - used);
  if (remaining <= 0) {
    return { allowed: false, reason: 'pdt_limit_reached', remaining: 0 };
  }
  return { allowed: true, reason: 'pdt_ok', remaining };
}

module.exports = { pdtGate };
