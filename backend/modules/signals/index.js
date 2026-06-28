'use strict';

/**
 * signals/index.js
 * -----------------------------------------------------------------------------
 * Registry of available pure signals + a thin dispatcher. The strategy loop
 * resolves the active signal(s) by name from config; signals never touch the
 * network or clock, so they are trivially unit- and back-testable.
 */

const { evaluateMomentumSignal } = require('./momentumSignal');
const { evaluateVwapReversionSignal } = require('./vwapReversionSignal');

const SIGNALS = Object.freeze({
  momentum: evaluateMomentumSignal,
  vwap_reversion: evaluateVwapReversionSignal,
});

function listSignals() {
  return Object.keys(SIGNALS);
}

/**
 * Evaluate a named signal. Returns the signal's result, or a structured decline
 * if the name is unknown (never throws — keeps the loop branch-free).
 */
function evaluateSignal(name, input) {
  const fn = SIGNALS[name];
  if (!fn) return { ok: false, reason: `unknown_signal:${name}` };
  try {
    const res = fn(input);
    if (!res || typeof res.ok !== 'boolean') return { ok: false, reason: 'malformed_signal_result' };
    return res;
  } catch (e) {
    return { ok: false, reason: `signal_threw:${e.message}` };
  }
}

module.exports = { SIGNALS, listSignals, evaluateSignal };
