'use strict';

/**
 * liveDefaults.js
 * -----------------------------------------------------------------------------
 * Every tunable parameter for the Smart Day Trader, expressed as a STRING default
 * (env vars are strings) with a comment explaining *why* the value is what it is.
 *
 * Rules of the road (mirrors Magic):
 *  - These are defaults only. bootstrapLiveEnv.js writes them into process.env
 *    ONLY when the var is unset, so real env/Render config always wins.
 *  - validateEnv.js parses + range-checks these into typed values at boot.
 *  - liveDefaults.test.js locks the critical ones so they cannot silently drift.
 *  - Nothing here is read directly by trading code — it flows through process.env
 *    and validateEnv so there is a single, audited source of truth.
 */

const LIVE_DEFAULTS = Object.freeze({
  // ---- Identity / mode -------------------------------------------------------
  // Default to PAPER. This deliberately reverses Magic's live-only rule: this is
  // an unproven strategy on a fresh connection, so paper is the safe default.
  TRADING_MODE: 'paper', // 'paper' | 'live'  (live requires explicit opt-in)

  // Asset class selects the execution adapter + which gates apply.
  ASSET_CLASS: 'equities', // 'equities' | 'crypto'
  // Optional explicit venue override; normally derived from ASSET_CLASS.
  EXECUTION_VENUE: '', // '' => derive: equities->alpaca_equities, crypto->alpaca_crypto

  // ---- Alpaca connection -----------------------------------------------------
  // Base URLs. Paper is the default trading base. validateEnv ALLOWS paper here.
  ALPACA_TRADING_BASE_URL: 'https://paper-api.alpaca.markets',
  ALPACA_DATA_BASE_URL: 'https://data.alpaca.markets',
  // Credentials come from the environment only — never defaulted to a real value.
  APCA_API_KEY_ID: '',
  APCA_API_SECRET_KEY: '',
  // Network timeout for broker calls (ms). Short so the loop never wedges.
  BROKER_HTTP_TIMEOUT_MS: '8000',

  // ---- Universe --------------------------------------------------------------
  // Comma-separated symbols to scan. Liquid, high-volume names keep spreads tight.
  // Crypto universe is used instead when ASSET_CLASS=crypto.
  EQUITIES_UNIVERSE: 'SPY,QQQ,AAPL,MSFT,NVDA,AMD,TSLA,META,AMZN,GOOGL',
  CRYPTO_UNIVERSE: 'BTC/USD,ETH/USD,LTC/USD',

  // ---- Sizing ----------------------------------------------------------------
  // Fraction of *available cash* to deploy per position. Day-trading takes fewer,
  // larger positions than a scalper, but we still cap exposure per name.
  POSITION_SIZING_PCT: '0.10', // 10% of buying power per entry, clamped to cash
  MAX_OPEN_POSITIONS: '4', // smart layer keeps only the best few setups
  MIN_NOTIONAL_USD: '25', // skip dust orders below this notional

  // ---- Entry guardrails ------------------------------------------------------
  MAX_SPREAD_BPS: '20', // reject entries when bid/ask spread exceeds this (bps)
  MAX_QUOTE_AGE_MS: '5000', // reject stale quotes older than this
  MIN_CONFIDENCE: '0.55', // signal confidence floor (0..1) before we consider it
  MIN_SCORE: '0.50', // smart-layer composite score floor to actually enter

  // ---- Signals --------------------------------------------------------------
  // Comma-separated active signals evaluated each scan; the best ok+scored wins.
  ACTIVE_SIGNALS: 'momentum', // 'momentum' | 'vwap_reversion' | 'momentum,vwap_reversion'

  // ---- Exit management (day-trader horizon: minutes to hours) -----------------
  TAKE_PROFIT_BPS: '120', // +1.2% target — capture an intraday swing, not a scalp
  STOP_LOSS_BPS: '80', // -0.8% hard stop, sized to the move not to noise
  MAX_HOLD_MINUTES: '180', // force exit after 3h; positions are intraday only
  STALE_ENTRY_TIMEOUT_SEC: '90', // cancel unfilled entry orders after this long

  // ---- Day-trader session controls (equities) --------------------------------
  // Regular US session in ET. EOD flatten closes everything before the bell.
  MARKET_OPEN_ET: '09:30',
  MARKET_CLOSE_ET: '16:00',
  EOD_FLATTEN_ET: '15:55', // start flattening 5 min before close
  ENTRY_CUTOFF_ET: '15:30', // no new entries in the last 30 min
  // Crypto trades 24/7; this is the configurable "session boundary" for EOD logic.
  CRYPTO_SESSION_BOUNDARY_ET: '', // '' => no forced flatten for crypto

  // ---- PDT / day-trade-count awareness (equities) ----------------------------
  // US Pattern Day Trader rule: accounts < $25k are limited to 3 day-trades / 5d.
  PDT_EQUITY_FLOOR_USD: '25000',
  PDT_MAX_DAY_TRADES: '3', // respected only when equity is below the floor
  PDT_ENFORCE: 'true', // block entries that would breach PDT under the floor

  // ---- Safety: per-day loss kill-switch + circuit breaker --------------------
  MAX_DAILY_LOSS_PCT: '0.03', // halt new entries after -3% on the day
  // Realized-expectancy circuit breaker (Magic's most important safety net).
  CIRCUIT_BREAKER_ENABLED: 'true',
  CB_MIN_CLOSED_TRADES: '8', // need this many closed trades before it can trip
  CB_EXPECTANCY_FLOOR_BPS: '-5', // halt a signal whose avg closed trade < -5 bps
  CB_LOOKBACK_TRADES: '20', // window of recent closed trades to evaluate

  // ---- Backtest validation gate ----------------------------------------------
  REQUIRE_BACKTEST_VALIDATION: 'false', // when true, a signal must pass min-expectancy first
  BACKTEST_MIN_EXPECTANCY_BPS: '5',
  BACKTEST_MIN_SAMPLES: '30',

  // ---- Loop / scheduler ------------------------------------------------------
  SCAN_INTERVAL_SEC: '30', // how often the strategy loop runs
  ENABLE_TRADING: 'true', // master switch; false => observe only, never order
  PORT: '3000',

  // ---- Diagnostics / surface -------------------------------------------------
  APP_VERSION: '0.1.0',
  LOG_TAIL_SIZE: '300', // /debug/logs ring buffer length

  // ---- Auth / CORS -----------------------------------------------------------
  API_TOKEN: '', // optional bearer / x-api-key; empty => auth disabled
  // The dashboard is a public read-only surface; auth (when set) is a header
  // token, not a cookie, so CORS is not the gate. Default to any origin so
  // browser viewers (Expo Snack web, etc.) work without a proxy. Narrow this to
  // a comma-separated allowlist to restrict cross-origin browser reads.
  DASHBOARD_ORIGINS: '*',
});

module.exports = { LIVE_DEFAULTS };
