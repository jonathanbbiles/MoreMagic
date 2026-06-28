'use strict';

const test = require('node:test');
const assert = require('node:assert');
const http = require('node:http');
const { buildContext, createApp } = require('./index');

function get(port, path, headers = {}) {
  return new Promise((resolve, reject) => {
    const req = http.get({ host: '127.0.0.1', port, path, headers }, (res) => {
      let body = '';
      res.on('data', (d) => (body += d));
      res.on('end', () => resolve({ status: res.statusCode, json: safeJson(body) }));
    });
    req.on('error', reject);
  });
}
function safeJson(s) {
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}
async function withApp(env, fn) {
  const ctx = buildContext({ APCA_API_KEY_ID: 'PK', APCA_API_SECRET_KEY: 's', ...env });
  const app = createApp(ctx);
  const server = app.listen(0);
  await new Promise((r) => server.once('listening', r));
  try {
    return await fn(server.address().port, ctx);
  } finally {
    server.close();
  }
}

test('GET /health is public and well-formed', async () => {
  await withApp({}, async (port) => {
    const r = await get(port, '/health');
    assert.strictEqual(r.status, 200);
    assert.strictEqual(r.json.ok, true);
    assert.strictEqual(r.json.mode, 'paper');
    assert.strictEqual(r.json.paper, true);
    assert.ok(['equities', 'crypto'].includes(r.json.assetClass));
  });
});

test('GET /dashboard returns {ok,ts,version,account,positions,meta}; account null offline', async () => {
  await withApp({}, async (port) => {
    const r = await get(port, '/dashboard');
    assert.strictEqual(r.status, 200);
    for (const k of ['ok', 'ts', 'version', 'account', 'positions', 'meta']) {
      assert.ok(k in r.json, `missing key ${k}`);
    }
    assert.strictEqual(r.json.account, null); // broker not yet polled => null, not a fake 0
    assert.ok(Array.isArray(r.json.positions));
    assert.ok(r.json.meta && typeof r.json.meta === 'object');
    assert.ok('scorecard' in r.json.meta && 'skipReasons' in r.json.meta);
  });
});

test('GET unknown route 404s as JSON', async () => {
  await withApp({}, async (port) => {
    const r = await get(port, '/nope');
    assert.strictEqual(r.status, 404);
    assert.strictEqual(r.json.ok, false);
  });
});

test('auth: protected routes require the token when API_TOKEN is set', async () => {
  await withApp({ API_TOKEN: 'sekret' }, async (port) => {
    assert.strictEqual((await get(port, '/dashboard')).status, 401);
    assert.strictEqual((await get(port, '/health')).status, 200); // health stays public
    const ok = await get(port, '/dashboard', { Authorization: 'Bearer sekret' });
    assert.strictEqual(ok.status, 200);
    const ok2 = await get(port, '/dashboard', { 'x-api-key': 'sekret' });
    assert.strictEqual(ok2.status, 200);
  });
});
