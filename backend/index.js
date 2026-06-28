'use strict';

/**
 * index.js — Express app + boot + scheduled strategy loop + /dashboard.
 * -----------------------------------------------------------------------------
 * Boots only on validated config (validateEnv throws => process exits). Wires the
 * adapter + engine, exposes the observational dashboard, and runs the strategy
 * loop on a timer with market-hours awareness. Structured so tests/smoke can
 * mount the app (createApp) without opening a socket or touching the broker.
 */

require('dotenv').config();
const path = require('path');
const express = require('express');
const cors = require('cors');

const { bootstrapLiveEnv } = require('./config/bootstrapLiveEnv');
const { validateEnv } = require('./config/validateEnv');
const { selectAdapter } = require('./modules/execution');
const { createEngine } = require('./trade');
const { createAuthMiddleware } = require('./auth');
const { createLogBuffer } = require('./modules/logger');
const { createRecorder } = require('./modules/diagnostics/recorder');
const { createCircuitBreaker } = require('./modules/safety/circuitBreaker');

/**
 * Expand the validated config into one per-asset config per running engine.
 * Single asset => [config] (unchanged). ASSET_CLASS=both => an equities config
 * and a crypto config, each a self-contained single-asset config the engine,
 * adapter, and gates already understand.
 */
function deriveAssetConfigs(config) {
  if (config.assetClass !== 'both') return [config];
  return [
    Object.freeze({ ...config, assetClass: 'equities', executionVenue: 'alpaca_equities', universe: config.equitiesUniverse }),
    Object.freeze({ ...config, assetClass: 'crypto', executionVenue: 'alpaca_crypto', universe: config.cryptoUniverse }),
  ];
}

/**
 * In "both" mode the two engines share ONE Alpaca account, and Alpaca's
 * positions/orders endpoints return the whole account. Without this filter each
 * engine would adopt and manage the OTHER asset's positions (e.g. the equities
 * engine EOD-flattening crypto). Restrict each engine's view to its own asset
 * class via raw.asset_class, falling back to the "/" in crypto symbols.
 */
function assetFilteredAdapter(adapter, assetClass) {
  const wantCrypto = assetClass === 'crypto';
  const isCrypto = (x) => {
    const ac = x && x.raw && x.raw.asset_class;
    if (ac) return String(ac).includes('crypto');
    return typeof (x && x.symbol) === 'string' && x.symbol.includes('/');
  };
  const keep = (x) => isCrypto(x) === wantCrypto;
  return {
    ...adapter,
    async getPositions(...a) { return (await adapter.getPositions(...a)).filter(keep); },
    async getOpenOrders(...a) { return (await adapter.getOpenOrders(...a)).filter(keep); },
  };
}

/** Build the full runtime context from the environment (no I/O beyond validate). */
function buildContext(env = process.env) {
  bootstrapLiveEnv(env);
  const config = validateEnv(env); // throws on bad config -> boot fails loudly
  const logBuffer = createLogBuffer(config.logTailSize);
  const log = (msg, level) => {
    const e = logBuffer.log(msg, level);
    // eslint-disable-next-line no-console
    console.log(`[${new Date(e.ts).toISOString()}] ${msg}`);
  };

  const assetConfigs = deriveAssetConfigs(config);
  const multi = assetConfigs.length > 1;
  const units = assetConfigs.map((ac) => {
    let adapter = selectAdapter(ac);
    if (multi) adapter = assetFilteredAdapter(adapter, ac.assetClass);
    const diagnostics = createRecorder();
    const circuitBreaker = createCircuitBreaker();
    const logger = multi ? (m, l) => log(`[${ac.assetClass}] ${m}`, l) : log;
    const engine = createEngine({ adapter, config: ac, diagnostics, circuitBreaker, logger });
    return { assetClass: ac.assetClass, venue: ac.executionVenue, config: ac, adapter, engine, diagnostics, circuitBreaker };
  });

  const primary = units[0];
  // Top-level fields mirror the primary engine so single-asset clients (the
  // tests, the Expo app) keep working unchanged.
  return {
    config,
    units,
    logBuffer,
    log,
    adapter: primary.adapter,
    engine: primary.engine,
    diagnostics: primary.diagnostics,
    circuitBreaker: primary.circuitBreaker,
  };
}

/** Create the Express app for a given context. Does not listen. */
function createApp(ctx) {
  const { config, units, logBuffer } = ctx;
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json());
  // The dashboard is a public, read-only observability surface (already curl-able
  // by anyone) and auth — when enabled — is a bearer/x-api-key token, not a
  // cookie, so CORS is not the access control. Allow any origin unless
  // DASHBOARD_ORIGINS is explicitly narrowed to a non-wildcard allowlist; this
  // lets browser viewers (Expo Snack web, etc.) read it without a proxy.
  const allowAllOrigins = config.dashboardOrigins.length === 0 || config.dashboardOrigins.includes('*');
  app.use(
    cors({
      origin(origin, cb) {
        if (!origin || allowAllOrigins || config.dashboardOrigins.includes(origin)) return cb(null, true);
        return cb(null, false);
      },
    }),
  );

  const auth = createAuthMiddleware(config);

  // Public liveness — never requires a token.
  app.get('/health', (req, res) => {
    res.json({
      ok: true,
      ts: Date.now(),
      version: config.appVersion,
      mode: config.tradingMode,
      assetClass: config.assetClass,
      venue: config.executionVenue,
      paper: config.isPaper,
    });
  });

  // Observational dashboard snapshot (every figure is a real field; missing => null).
  // `assets[]` carries one entry per running engine; the top-level fields mirror
  // the primary (first) asset so single-asset clients keep their existing shape.
  app.get('/dashboard', auth, (req, res) => {
    const assets = units.map((u) => {
      const view = u.engine.getView();
      return {
        assetClass: u.config.assetClass,
        venue: u.config.executionVenue,
        brokerOk: view.brokerOk,
        lastLoopTs: view.tsMs,
        account: view.account, // null when the broker is unreachable
        positions: view.positions || [],
        meta: u.diagnostics.getMeta(),
      };
    });
    const primary = assets[0];
    res.json({
      ok: true,
      ts: Date.now(),
      version: config.appVersion,
      mode: config.tradingMode,
      assetClass: config.assetClass,
      venue: config.executionVenue,
      paper: config.isPaper,
      enabled: config.enableTrading,
      brokerOk: primary.brokerOk,
      lastLoopTs: primary.lastLoopTs,
      account: primary.account, // null when the broker is unreachable
      positions: primary.positions,
      meta: primary.meta,
      assets,
    });
  });

  app.get('/debug/logs', auth, (req, res) => {
    const n = Math.min(Number(req.query.n) || 100, config.logTailSize);
    res.json({ ok: true, ts: Date.now(), logs: logBuffer.tail(n) });
  });

  // Same-origin web dashboard: a dependency-free HTML page that polls /dashboard.
  // Served from the backend's own origin so there is no CORS and no Expo runtime
  // (sidesteps the Snack/Expo-web IndexedDB + bundler issues entirely).
  app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

  app.use((req, res) => res.status(404).json({ ok: false, error: 'not_found' }));
  return app;
}

/** Boot the server: validate, listen, and start the scheduled loop. */
function start() {
  let ctx;
  try {
    ctx = buildContext();
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('\nBOOT ABORTED:\n' + err.message + '\n');
    process.exit(1);
    return;
  }
  const { config, units, log } = ctx;
  const app = createApp(ctx);
  const multi = units.length > 1;

  const server = app.listen(config.port, () => {
    log(
      `MoreMagic backend up on :${config.port} | mode=${config.tradingMode} asset=${config.assetClass} venue=${config.executionVenue} paper=${config.isPaper} engines=${units.length}`,
    );
  });

  // Scheduled strategy loop with a concurrency guard. Runs every engine each
  // tick (one engine for a single asset class, two for ASSET_CLASS=both).
  let ticking = false;
  const tick = async () => {
    if (ticking) return;
    ticking = true;
    try {
      await Promise.all(
        units.map(async (u) => {
          const tag = multi ? `[${u.assetClass}] ` : '';
          try {
            const r = await u.engine.runOnce();
            if (!r.ok) log(`${tag}loop: degraded (${r.error})`, 'warn');
          } catch (e) {
            log(`${tag}loop: unhandled ${e.message}`, 'error');
          }
        }),
      );
    } finally {
      ticking = false;
    }
  };
  const timer = setInterval(tick, config.scanIntervalSec * 1000);
  tick(); // run one immediately

  const shutdown = (sig) => {
    log(`received ${sig}, shutting down`, 'warn');
    clearInterval(timer);
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 3000).unref();
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

  return { app, server, ctx, timer };
}

if (require.main === module) start();

module.exports = { buildContext, createApp, start, deriveAssetConfigs, assetFilteredAdapter };
