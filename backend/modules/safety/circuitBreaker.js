'use strict';

/**
 * safety/circuitBreaker.js — realized-expectancy circuit breaker.
 * -----------------------------------------------------------------------------
 * Magic's single most important safety net, ported early. Halts NEW entries for
 * a signal when its recent closed trades bleed below an expectancy floor.
 *
 * It keeps its OWN ledger of closed trades (a safety input), separate from the
 * observational diagnostics `meta`. Trade decisions call isHalted() which reads
 * this ledger — never the dashboard snapshot. This preserves the iron rule that
 * `meta` is observational only.
 */

/** Pure core: average pnl (bps) over the last `lookback` trades. */
function computeExpectancy(trades, lookback) {
  const recent = trades.slice(-lookback);
  const n = recent.length;
  if (n === 0) return { sample: 0, expectancyBps: 0 };
  const sum = recent.reduce((s, t) => s + (Number(t.pnlBps) || 0), 0);
  return { sample: n, expectancyBps: sum / n };
}

/** Pure decision given a trade ledger for one signal + config. */
function evaluateBreaker(trades, config) {
  const { sample, expectancyBps } = computeExpectancy(trades, config.cbLookbackTrades);
  if (!config.circuitBreakerEnabled) {
    return { halted: false, reason: 'breaker_disabled', expectancyBps, sample };
  }
  if (sample < config.cbMinClosedTrades) {
    return { halted: false, reason: 'insufficient_sample', expectancyBps, sample };
  }
  if (expectancyBps < config.cbExpectancyFloorBps) {
    return { halted: true, reason: 'expectancy_below_floor', expectancyBps, sample };
  }
  return { halted: false, reason: 'healthy', expectancyBps, sample };
}

function createCircuitBreaker() {
  const ledger = new Map(); // signal -> [{ tsMs, pnlBps }]

  return {
    record({ signal, pnlBps, tsMs = Date.now() }) {
      if (!signal) return;
      if (!ledger.has(signal)) ledger.set(signal, []);
      const arr = ledger.get(signal);
      arr.push({ tsMs, pnlBps: Number(pnlBps) || 0 });
      while (arr.length > 500) arr.shift();
    },
    isHalted(signal, config) {
      return evaluateBreaker(ledger.get(signal) || [], config);
    },
    snapshot(config) {
      const out = {};
      for (const [signal, trades] of ledger.entries()) {
        out[signal] = evaluateBreaker(trades, config);
      }
      return out;
    },
    reset() {
      ledger.clear();
    },
  };
}

const circuitBreaker = createCircuitBreaker();

module.exports = { computeExpectancy, evaluateBreaker, createCircuitBreaker, circuitBreaker };
