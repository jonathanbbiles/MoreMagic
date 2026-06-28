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
const { diagnostics } = require('./modules/diagnostics/recorder');
const { circuitBreaker } = require('./modules/safety/circuitBreaker');

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
  const adapter = selectAdapter(config);
  const engine = createEngine({ adapter, config, diagnostics, circuitBreaker, logger: log });
  return { config, adapter, engine, diagnostics, circuitBreaker, logBuffer, log };
}

/** Create the Express app for a given context. Does not listen. */
function createApp(ctx) {
  const { config, engine, logBuffer } = ctx;
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json());
  app.use(
    cors({
      origin(origin, cb) {
        // Allow no-origin (curl/health checks) and configured dashboard origins.
        if (!origin || config.dashboardOrigins.includes(origin)) return cb(null, true);
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
  app.get('/dashboard', auth, (req, res) => {
    const view = engine.getView();
    res.json({
      ok: true,
      ts: Date.now(),
      version: config.appVersion,
      mode: config.tradingMode,
      assetClass: config.assetClass,
      venue: config.executionVenue,
      paper: config.isPaper,
      enabled: config.enableTrading,
      brokerOk: view.brokerOk,
      lastLoopTs: view.tsMs,
      account: view.account, // null when the broker is unreachable
      positions: view.positions || [],
      meta: diagnostics.getMeta(),
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
  const { config, engine, log } = ctx;
  const app = createApp(ctx);

  const server = app.listen(config.port, () => {
    log(
      `MoreMagic backend up on :${config.port} | mode=${config.tradingMode} asset=${config.assetClass} venue=${config.executionVenue} paper=${config.isPaper}`,
    );
  });

  // Scheduled strategy loop with a concurrency guard.
  let ticking = false;
  const tick = async () => {
    if (ticking) return;
    ticking = true;
    try {
      const r = await engine.runOnce();
      if (!r.ok) log(`loop: degraded (${r.error})`, 'warn');
    } catch (e) {
      log(`loop: unhandled ${e.message}`, 'error');
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

module.exports = { buildContext, createApp, start };
