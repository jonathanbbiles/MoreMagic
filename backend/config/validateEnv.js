'use strict';

/**
 * validateEnv.js
 * -----------------------------------------------------------------------------
 * Parses process.env into a typed, range-checked config object. Asset/venue
 * aware: always require Alpaca creds; equities-session config only matters for
 * equities; crypto trades 24/7. PAPER is allowed (the opposite of Magic, which
 * rejects paper) — going live requires an explicit, deliberate opt-in.
 *
 * On any problem it throws an Error whose message enumerates every failure, so
 * boot fails loudly and nothing trades on un-validated config.
 */

const PAPER_HOST = 'paper-api.alpaca.markets';
const LIVE_HOST = 'api.alpaca.markets';

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : NaN;
}
function bool(v) {
  return String(v).trim().toLowerCase() === 'true';
}
function list(v) {
  return String(v || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}
function isHHMM(v) {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(String(v || '').trim());
}

function deriveVenue(env) {
  if (env.EXECUTION_VENUE && env.EXECUTION_VENUE.trim()) return env.EXECUTION_VENUE.trim();
  return env.ASSET_CLASS === 'crypto' ? 'alpaca_crypto' : 'alpaca_equities';
}

/**
 * @param {object} [env=process.env]
 * @returns {object} typed config (frozen)
 * @throws {Error} when config is invalid
 */
function validateEnv(env = process.env) {
  const errors = [];
  const cfg = {};

  // ---- Mode + venue ----------------------------------------------------------
  cfg.tradingMode = String(env.TRADING_MODE || '').toLowerCase();
  if (!['paper', 'live'].includes(cfg.tradingMode)) {
    errors.push(`TRADING_MODE must be "paper" or "live" (got "${env.TRADING_MODE}")`);
  }
  cfg.assetClass = String(env.ASSET_CLASS || '').toLowerCase();
  if (!['equities', 'crypto', 'both'].includes(cfg.assetClass)) {
    errors.push(`ASSET_CLASS must be "equities", "crypto", or "both" (got "${env.ASSET_CLASS}")`);
  }
  // "both" runs one engine per class (derived at boot); equities rules apply
  // whenever equities is in play.
  const equitiesInvolved = cfg.assetClass === 'equities' || cfg.assetClass === 'both';
  if (cfg.assetClass === 'both') {
    cfg.executionVenue = 'both';
  } else {
    cfg.executionVenue = deriveVenue(env);
    if (!['alpaca_equities', 'alpaca_crypto'].includes(cfg.executionVenue)) {
      errors.push(`EXECUTION_VENUE unsupported: "${cfg.executionVenue}"`);
    }
  }

  // ---- Alpaca connection (creds always required) -----------------------------
  cfg.alpacaKeyId = String(env.APCA_API_KEY_ID || '').trim();
  cfg.alpacaSecret = String(env.APCA_API_SECRET_KEY || '').trim();
  if (!cfg.alpacaKeyId) errors.push('APCA_API_KEY_ID is required');
  if (!cfg.alpacaSecret) errors.push('APCA_API_SECRET_KEY is required');

  cfg.tradingBaseUrl = String(env.ALPACA_TRADING_BASE_URL || '').trim();
  cfg.dataBaseUrl = String(env.ALPACA_DATA_BASE_URL || '').trim();
  if (!/^https:\/\//.test(cfg.tradingBaseUrl)) {
    errors.push('ALPACA_TRADING_BASE_URL must be an https URL');
  }
  if (!/^https:\/\//.test(cfg.dataBaseUrl)) {
    errors.push('ALPACA_DATA_BASE_URL must be an https URL');
  }

  // Mode <-> base URL consistency. Paper is allowed; live is gated.
  const usingPaperBase = cfg.tradingBaseUrl.includes(PAPER_HOST);
  const usingLiveBase = cfg.tradingBaseUrl.includes(LIVE_HOST) && !usingPaperBase;
  if (cfg.tradingMode === 'paper' && !usingPaperBase) {
    errors.push(`TRADING_MODE=paper requires the paper base URL (${PAPER_HOST}); got "${cfg.tradingBaseUrl}"`);
  }
  if (cfg.tradingMode === 'live') {
    if (!usingLiveBase) {
      errors.push(`TRADING_MODE=live requires the live base URL (${LIVE_HOST})`);
    }
    if (!bool(env.ALLOW_LIVE)) {
      errors.push('TRADING_MODE=live requires ALLOW_LIVE=true (deliberate opt-in)');
    }
  }
  cfg.isPaper = usingPaperBase;

  cfg.brokerTimeoutMs = num(env.BROKER_HTTP_TIMEOUT_MS);
  if (!(cfg.brokerTimeoutMs >= 1000 && cfg.brokerTimeoutMs <= 60000)) {
    errors.push('BROKER_HTTP_TIMEOUT_MS must be 1000..60000');
  }

  // ---- Universe --------------------------------------------------------------
  cfg.equitiesUniverse = list(env.EQUITIES_UNIVERSE);
  cfg.cryptoUniverse = list(env.CRYPTO_UNIVERSE);
  if (cfg.assetClass === 'both') {
    cfg.universe = []; // each derived engine carries its own per-class universe
    if (cfg.equitiesUniverse.length === 0) errors.push('EQUITIES_UNIVERSE is empty (required for ASSET_CLASS=both)');
    if (cfg.cryptoUniverse.length === 0) errors.push('CRYPTO_UNIVERSE is empty (required for ASSET_CLASS=both)');
  } else {
    cfg.universe = cfg.assetClass === 'crypto' ? cfg.cryptoUniverse : cfg.equitiesUniverse;
    if (cfg.universe.length === 0) {
      errors.push(`Universe for ASSET_CLASS=${cfg.assetClass} is empty`);
    }
  }

  // ---- Sizing ----------------------------------------------------------------
  cfg.positionSizingPct = num(env.POSITION_SIZING_PCT);
  if (!(cfg.positionSizingPct > 0 && cfg.positionSizingPct <= 1)) {
    errors.push('POSITION_SIZING_PCT must be in (0, 1]');
  }
  cfg.maxOpenPositions = num(env.MAX_OPEN_POSITIONS);
  if (!(Number.isInteger(cfg.maxOpenPositions) && cfg.maxOpenPositions >= 1 && cfg.maxOpenPositions <= 50)) {
    errors.push('MAX_OPEN_POSITIONS must be an integer 1..50');
  }
  cfg.minNotionalUsd = num(env.MIN_NOTIONAL_USD);
  if (!(cfg.minNotionalUsd >= 1)) errors.push('MIN_NOTIONAL_USD must be >= 1');

  // ---- Entry guardrails ------------------------------------------------------
  cfg.maxSpreadBps = num(env.MAX_SPREAD_BPS);
  if (!(cfg.maxSpreadBps > 0 && cfg.maxSpreadBps <= 500)) errors.push('MAX_SPREAD_BPS must be in (0,500]');
  cfg.maxQuoteAgeMs = num(env.MAX_QUOTE_AGE_MS);
  if (!(cfg.maxQuoteAgeMs >= 250 && cfg.maxQuoteAgeMs <= 60000)) errors.push('MAX_QUOTE_AGE_MS must be 250..60000');
  cfg.minConfidence = num(env.MIN_CONFIDENCE);
  if (!(cfg.minConfidence >= 0 && cfg.minConfidence <= 1)) errors.push('MIN_CONFIDENCE must be 0..1');
  cfg.minScore = num(env.MIN_SCORE);
  if (!(cfg.minScore >= 0 && cfg.minScore <= 1)) errors.push('MIN_SCORE must be 0..1');

  // ---- Signals ---------------------------------------------------------------
  const KNOWN_SIGNALS = ['momentum', 'vwap_reversion'];
  cfg.activeSignals = list(env.ACTIVE_SIGNALS);
  if (cfg.activeSignals.length === 0) errors.push('ACTIVE_SIGNALS must name at least one signal');
  for (const sName of cfg.activeSignals) {
    if (!KNOWN_SIGNALS.includes(sName)) errors.push(`ACTIVE_SIGNALS contains unknown signal: ${sName}`);
  }

  // ---- Exits -----------------------------------------------------------------
  cfg.takeProfitBps = num(env.TAKE_PROFIT_BPS);
  if (!(cfg.takeProfitBps > 0 && cfg.takeProfitBps <= 5000)) errors.push('TAKE_PROFIT_BPS must be in (0,5000]');
  cfg.stopLossBps = num(env.STOP_LOSS_BPS);
  if (!(cfg.stopLossBps > 0 && cfg.stopLossBps <= 5000)) errors.push('STOP_LOSS_BPS must be in (0,5000]');
  cfg.maxHoldMinutes = num(env.MAX_HOLD_MINUTES);
  if (!(cfg.maxHoldMinutes >= 1 && cfg.maxHoldMinutes <= 1440)) errors.push('MAX_HOLD_MINUTES must be 1..1440');
  cfg.staleEntryTimeoutSec = num(env.STALE_ENTRY_TIMEOUT_SEC);
  if (!(cfg.staleEntryTimeoutSec >= 5 && cfg.staleEntryTimeoutSec <= 3600)) errors.push('STALE_ENTRY_TIMEOUT_SEC must be 5..3600');

  // ---- Session controls (equities-only requirements) -------------------------
  cfg.marketOpenEt = String(env.MARKET_OPEN_ET || '').trim();
  cfg.marketCloseEt = String(env.MARKET_CLOSE_ET || '').trim();
  cfg.eodFlattenEt = String(env.EOD_FLATTEN_ET || '').trim();
  cfg.entryCutoffEt = String(env.ENTRY_CUTOFF_ET || '').trim();
  cfg.cryptoSessionBoundaryEt = String(env.CRYPTO_SESSION_BOUNDARY_ET || '').trim();
  if (equitiesInvolved) {
    for (const [k, v] of [
      ['MARKET_OPEN_ET', cfg.marketOpenEt],
      ['MARKET_CLOSE_ET', cfg.marketCloseEt],
      ['EOD_FLATTEN_ET', cfg.eodFlattenEt],
      ['ENTRY_CUTOFF_ET', cfg.entryCutoffEt],
    ]) {
      if (!isHHMM(v)) errors.push(`${k} must be HH:MM 24h (got "${v}")`);
    }
  }
  if (cfg.cryptoSessionBoundaryEt && !isHHMM(cfg.cryptoSessionBoundaryEt)) {
    errors.push(`CRYPTO_SESSION_BOUNDARY_ET must be HH:MM or empty (got "${cfg.cryptoSessionBoundaryEt}")`);
  }

  // ---- PDT (equities only) ---------------------------------------------------
  cfg.pdtEquityFloorUsd = num(env.PDT_EQUITY_FLOOR_USD);
  cfg.pdtMaxDayTrades = num(env.PDT_MAX_DAY_TRADES);
  cfg.pdtEnforce = bool(env.PDT_ENFORCE);
  if (equitiesInvolved) {
    if (!(cfg.pdtEquityFloorUsd >= 0)) errors.push('PDT_EQUITY_FLOOR_USD must be >= 0');
    if (!(Number.isInteger(cfg.pdtMaxDayTrades) && cfg.pdtMaxDayTrades >= 0)) errors.push('PDT_MAX_DAY_TRADES must be a non-negative integer');
  }

  // ---- Daily loss + circuit breaker ------------------------------------------
  cfg.maxDailyLossPct = num(env.MAX_DAILY_LOSS_PCT);
  if (!(cfg.maxDailyLossPct > 0 && cfg.maxDailyLossPct <= 1)) errors.push('MAX_DAILY_LOSS_PCT must be in (0,1]');
  cfg.circuitBreakerEnabled = bool(env.CIRCUIT_BREAKER_ENABLED);
  cfg.cbMinClosedTrades = num(env.CB_MIN_CLOSED_TRADES);
  cfg.cbExpectancyFloorBps = num(env.CB_EXPECTANCY_FLOOR_BPS);
  cfg.cbLookbackTrades = num(env.CB_LOOKBACK_TRADES);
  if (!(Number.isInteger(cfg.cbMinClosedTrades) && cfg.cbMinClosedTrades >= 1)) errors.push('CB_MIN_CLOSED_TRADES must be a positive integer');
  if (!Number.isFinite(cfg.cbExpectancyFloorBps)) errors.push('CB_EXPECTANCY_FLOOR_BPS must be a number');
  if (!(Number.isInteger(cfg.cbLookbackTrades) && cfg.cbLookbackTrades >= 1)) errors.push('CB_LOOKBACK_TRADES must be a positive integer');

  // ---- Backtest gate ---------------------------------------------------------
  cfg.requireBacktestValidation = bool(env.REQUIRE_BACKTEST_VALIDATION);
  cfg.backtestMinExpectancyBps = num(env.BACKTEST_MIN_EXPECTANCY_BPS);
  cfg.backtestMinSamples = num(env.BACKTEST_MIN_SAMPLES);

  // ---- Loop ------------------------------------------------------------------
  cfg.scanIntervalSec = num(env.SCAN_INTERVAL_SEC);
  if (!(cfg.scanIntervalSec >= 5 && cfg.scanIntervalSec <= 3600)) errors.push('SCAN_INTERVAL_SEC must be 5..3600');
  cfg.enableTrading = bool(env.ENABLE_TRADING);
  cfg.port = num(env.PORT);
  if (!(Number.isInteger(cfg.port) && cfg.port >= 1 && cfg.port <= 65535)) errors.push('PORT must be 1..65535');

  // ---- Diagnostics / surface -------------------------------------------------
  cfg.appVersion = String(env.APP_VERSION || '0.0.0');
  cfg.logTailSize = num(env.LOG_TAIL_SIZE);
  if (!(Number.isInteger(cfg.logTailSize) && cfg.logTailSize >= 10 && cfg.logTailSize <= 10000)) errors.push('LOG_TAIL_SIZE must be 10..10000');

  // ---- Auth / CORS -----------------------------------------------------------
  cfg.apiToken = String(env.API_TOKEN || '');
  cfg.dashboardOrigins = list(env.DASHBOARD_ORIGINS);

  if (errors.length) {
    const err = new Error(
      `validateEnv: refusing to boot on ${errors.length} config problem(s):\n  - ` + errors.join('\n  - '),
    );
    err.validationErrors = errors;
    throw err;
  }

  return Object.freeze(cfg);
}

module.exports = { validateEnv, PAPER_HOST, LIVE_HOST };
