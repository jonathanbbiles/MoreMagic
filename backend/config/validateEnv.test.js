'use strict';

const test = require('node:test');
const assert = require('node:assert');
const { bootstrapLiveEnv } = require('./bootstrapLiveEnv');
const { validateEnv } = require('./validateEnv');

// Build a fully-defaulted env with creds, then apply overrides.
function env(overrides = {}) {
  const e = { APCA_API_KEY_ID: 'PKTEST', APCA_API_SECRET_KEY: 'secret' };
  bootstrapLiveEnv(e);
  return { ...e, ...overrides };
}

const LIVE = {
  TRADING_MODE: 'live',
  ALPACA_TRADING_BASE_URL: 'https://api.alpaca.markets',
  ALLOW_LIVE: 'true',
};

test('cost model vars parse into typed numbers', () => {
  const cfg = validateEnv(env());
  assert.strictEqual(cfg.takerFeeBpsEquities, 0);
  assert.ok(cfg.takerFeeBpsCrypto >= 15);
  assert.strictEqual(typeof cfg.assumedSlippageBps, 'number');
  assert.strictEqual(typeof cfg.assumedSpreadBps, 'number');
  assert.strictEqual(typeof cfg.regFeeBpsSell, 'number');
});

test('out-of-range cost var is rejected at boot', () => {
  assert.throws(() => validateEnv(env({ TAKER_FEE_BPS_CRYPTO: '9999' })), /TAKER_FEE_BPS_CRYPTO/);
});

test('live requires REQUIRE_BACKTEST_VALIDATION=true (net-of-cost interlock)', () => {
  // live + ALLOW_LIVE + live URL but validation off -> refuse to boot
  assert.throws(
    () => validateEnv(env({ ...LIVE, REQUIRE_BACKTEST_VALIDATION: 'false' })),
    /REQUIRE_BACKTEST_VALIDATION=true/,
  );
});

test('live boots when the backtest gate is enabled', () => {
  const cfg = validateEnv(env({ ...LIVE, REQUIRE_BACKTEST_VALIDATION: 'true' }));
  assert.strictEqual(cfg.tradingMode, 'live');
  assert.strictEqual(cfg.requireBacktestValidation, true);
  assert.strictEqual(cfg.isPaper, false);
});

test('paper still boots without the backtest gate (interlock is live-only)', () => {
  const cfg = validateEnv(env({ REQUIRE_BACKTEST_VALIDATION: 'false' }));
  assert.strictEqual(cfg.tradingMode, 'paper');
  assert.strictEqual(cfg.requireBacktestValidation, false);
});
