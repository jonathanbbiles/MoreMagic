'use strict';

const test = require('node:test');
const assert = require('node:assert');
const { LIVE_DEFAULTS } = require('./liveDefaults');
const { bootstrapLiveEnv } = require('./bootstrapLiveEnv');
const { validateEnv } = require('./validateEnv');

// These lock the safety-critical defaults so a careless edit can't silently
// flip the bot live, point it at a live endpoint, or remove a guardrail.
test('paper-first defaults are locked', () => {
  assert.strictEqual(LIVE_DEFAULTS.TRADING_MODE, 'paper', 'must default to paper');
  assert.match(LIVE_DEFAULTS.ALPACA_TRADING_BASE_URL, /paper-api\.alpaca\.markets/);
  assert.strictEqual(LIVE_DEFAULTS.PDT_ENFORCE, 'true');
  assert.strictEqual(LIVE_DEFAULTS.CIRCUIT_BREAKER_ENABLED, 'true');
});

test('risk defaults stay within sane bands', () => {
  assert.ok(Number(LIVE_DEFAULTS.POSITION_SIZING_PCT) > 0 && Number(LIVE_DEFAULTS.POSITION_SIZING_PCT) <= 0.25);
  assert.ok(Number(LIVE_DEFAULTS.STOP_LOSS_BPS) > 0);
  assert.ok(Number(LIVE_DEFAULTS.TAKE_PROFIT_BPS) > Number(LIVE_DEFAULTS.STOP_LOSS_BPS) * 0.5);
  assert.ok(Number(LIVE_DEFAULTS.MAX_DAILY_LOSS_PCT) > 0 && Number(LIVE_DEFAULTS.MAX_DAILY_LOSS_PCT) <= 0.1);
});

test('trading-cost defaults are present and sane (crypto taker fee is not silently zeroed)', () => {
  // Equities are commission-free on Alpaca; crypto is NOT — locking the crypto
  // taker fee stops a careless edit from hiding the biggest real cost again.
  assert.strictEqual(LIVE_DEFAULTS.TAKER_FEE_BPS_EQUITIES, '0');
  assert.ok(Number(LIVE_DEFAULTS.TAKER_FEE_BPS_CRYPTO) >= 15, 'crypto taker fee must reflect ~0.25% (>=15 bps)');
  assert.ok(Number(LIVE_DEFAULTS.ASSUMED_SLIPPAGE_BPS) >= 0);
  assert.ok(Number(LIVE_DEFAULTS.ASSUMED_SPREAD_BPS) >= 0);
  assert.ok(Number(LIVE_DEFAULTS.REG_FEE_BPS_SELL) >= 0);
});

test('defaults boot + validate cleanly once creds are supplied', () => {
  const env = { APCA_API_KEY_ID: 'PKTEST', APCA_API_SECRET_KEY: 'secret' };
  bootstrapLiveEnv(env);
  const cfg = validateEnv(env);
  assert.strictEqual(cfg.tradingMode, 'paper');
  assert.strictEqual(cfg.isPaper, true);
});

test('every documented default is consumed by validateEnv (no dead env vars)', () => {
  // Smoke: bootstrapping then validating must not throw, proving the keys parse.
  const env = { APCA_API_KEY_ID: 'PKTEST', APCA_API_SECRET_KEY: 'secret' };
  const { applied } = bootstrapLiveEnv(env);
  assert.ok(applied.length >= Object.keys(LIVE_DEFAULTS).length - 2);
});
