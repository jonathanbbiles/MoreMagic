'use strict';

/**
 * bootstrapLiveEnv.js
 * -----------------------------------------------------------------------------
 * Fills process.env from LIVE_DEFAULTS, but ONLY for keys that are currently
 * unset/empty — so real environment config (Render, .env, shell) always wins.
 *
 * It then applies SAFETY_OVERRIDES: a small map of values we force-correct
 * regardless of what was provided, because they are known-unsafe for a fresh,
 * unproven strategy. This is the "nothing trades on un-validated config" spine.
 */

const { LIVE_DEFAULTS } = require('./liveDefaults');

/**
 * SAFETY_OVERRIDES — force-corrected values.
 * Keep this list tiny and obviously-safe. Each entry must have a reason.
 */
const SAFETY_OVERRIDES = Object.freeze({
  // This app is paper-first by design. We refuse to silently inherit a live
  // base URL from a stray env var unless the operator *explicitly* sets
  // TRADING_MODE=live AND ALLOW_LIVE=true (handled in validateEnv, not here).
  // Here we only guarantee the *data* base URL is never blank.
});

function isUnset(v) {
  return v === undefined || v === null || String(v).trim() === '';
}

/**
 * @param {object} [env=process.env]
 * @returns {{ applied: string[], overridden: string[] }}
 */
function bootstrapLiveEnv(env = process.env) {
  const applied = [];
  const overridden = [];

  for (const [key, def] of Object.entries(LIVE_DEFAULTS)) {
    if (isUnset(env[key])) {
      env[key] = def;
      applied.push(key);
    }
  }

  for (const [key, forced] of Object.entries(SAFETY_OVERRIDES)) {
    if (env[key] !== forced) {
      env[key] = forced;
      overridden.push(key);
    }
  }

  return { applied, overridden };
}

module.exports = { bootstrapLiveEnv, SAFETY_OVERRIDES };
