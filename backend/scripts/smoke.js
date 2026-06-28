'use strict';

/**
 * scripts/smoke.js — boots the app on an ephemeral port (no broker, no loop) and
 * asserts /health + /dashboard return well-formed JSON. Exits non-zero on any
 * problem so it can gate CI/deploys.
 */

const http = require('http');
const { buildContext, createApp } = require('../index');

function get(port, p, headers = {}) {
  return new Promise((resolve, reject) => {
    http
      .get({ host: '127.0.0.1', port, path: p, headers }, (res) => {
        let b = '';
        res.on('data', (d) => (b += d));
        res.on('end', () => {
          try {
            resolve({ status: res.statusCode, json: JSON.parse(b) });
          } catch (e) {
            reject(new Error(`bad JSON from ${p}: ${b.slice(0, 120)}`));
          }
        });
      })
      .on('error', reject);
  });
}

async function main() {
  const env = { ...process.env };
  if (!env.APCA_API_KEY_ID) env.APCA_API_KEY_ID = 'smoke';
  if (!env.APCA_API_SECRET_KEY) env.APCA_API_SECRET_KEY = 'smoke';
  const ctx = buildContext(env);
  const app = createApp(ctx);
  const server = app.listen(0);
  await new Promise((r) => server.once('listening', r));
  const port = server.address().port;
  const fail = (m) => {
    console.error('SMOKE FAIL:', m);
    server.close(() => process.exit(1));
  };
  try {
    const health = await get(port, '/health');
    if (health.status !== 200 || health.json.ok !== true) return fail('/health not ok');
    const dash = await get(port, '/dashboard');
    if (dash.status !== 200) return fail('/dashboard status ' + dash.status);
    for (const k of ['ok', 'ts', 'version', 'account', 'positions', 'meta']) {
      if (!(k in dash.json)) return fail('/dashboard missing ' + k);
    }
    if (!('scorecard' in dash.json.meta)) return fail('meta missing scorecard');
    console.log(`SMOKE OK — /health + /dashboard well-formed (mode=${health.json.mode}, venue=${health.json.venue})`);
    server.close(() => process.exit(0));
  } catch (e) {
    fail(e.message);
  }
}

main();
