'use strict';

/**
 * diagnostics/recorder.js
 * -----------------------------------------------------------------------------
 * Purely OBSERVATIONAL diagnostics surface. Modules record via side effects;
 * index.js getters assemble the snapshot for GET /dashboard's `meta`.
 *
 * IRON RULE: no live trade decision ever reads from this snapshot. It exists to
 * be *looked at*, never to gate a trade. (Safety gating lives in circuitBreaker
 * and the gates/ modules, which keep their own inputs.)
 */

function ring(arr, max) {
  while (arr.length > max) arr.shift();
  return arr;
}

function createRecorder({ equityMax = 500, tradesMax = 200 } = {}) {
  const state = {
    startedAt: Date.now(),
    skipHistogram: Object.create(null),
    closedTrades: [], // { tsMs, signal, symbol, pnlBps, pnlUsd }
    signalState: Object.create(null), // name -> { ok, reason, confidence, tsMs }
    equitySeries: [], // { tsMs, equity }
    lastScan: null, // { tsMs, evaluated, candidates, entered, skipped }
    safety: { brakeActive: false, reasons: [] },
    regime: null,
  };

  return {
    recordSkip(reason) {
      const r = String(reason || 'unknown');
      state.skipHistogram[r] = (state.skipHistogram[r] || 0) + 1;
    },
    recordSignalState(name, result) {
      state.signalState[name] = {
        ok: !!result.ok,
        reason: result.reason,
        confidence: result.confidence ?? null,
        tsMs: Date.now(),
      };
    },
    recordClosedTrade(t) {
      state.closedTrades.push({ tsMs: t.tsMs ?? Date.now(), ...t });
      ring(state.closedTrades, tradesMax);
    },
    recordEquity(equity) {
      if (Number.isFinite(equity)) {
        state.equitySeries.push({ tsMs: Date.now(), equity });
        ring(state.equitySeries, equityMax);
      }
    },
    recordScan(summary) {
      state.lastScan = { tsMs: Date.now(), ...summary };
    },
    setSafety(brakeActive, reasons = []) {
      state.safety = { brakeActive: !!brakeActive, reasons };
    },
    setRegime(regime) {
      state.regime = regime;
    },
    /** Assemble the observational snapshot for the dashboard `meta` field. */
    getMeta() {
      const trades = state.closedTrades;
      const n = trades.length;
      const wins = trades.filter((t) => Number(t.pnlBps) > 0).length;
      const totalBps = trades.reduce((s, t) => s + (Number(t.pnlBps) || 0), 0);
      const totalUsd = trades.reduce((s, t) => s + (Number(t.pnlUsd) || 0), 0);
      return {
        uptimeSec: Math.round((Date.now() - state.startedAt) / 1000),
        scorecard: {
          closedTrades: n,
          winRate: n ? +(wins / n).toFixed(4) : null,
          avgPnlBps: n ? +(totalBps / n).toFixed(2) : null,
          totalPnlBps: +totalBps.toFixed(2),
          totalPnlUsd: +totalUsd.toFixed(2),
        },
        skipReasons: { ...state.skipHistogram },
        signals: { ...state.signalState },
        equityOverTime: state.equitySeries.slice(-120),
        lastScan: state.lastScan,
        safety: state.safety,
        regime: state.regime,
      };
    },
    _state: state, // for tests
  };
}

// Process-wide singleton used by the running app.
const diagnostics = createRecorder();

module.exports = { createRecorder, diagnostics };
