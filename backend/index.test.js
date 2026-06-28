'use strict';

const test = require('node:test');
const assert = require('node:assert');
const http = require('node:http');
const { buildContext, createApp, deriveAssetConfigs, assetFilteredAdapter } = require('./index');

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

test('single asset: ctx has exactly one engine unit', async () => {
  await withApp({}, async (port, ctx) => {
    assert.strictEqual(ctx.units.length, 1);
    assert.strictEqual(ctx.units[0].assetClass, 'equities');
  });
});

test('ASSET_CLASS=both: two engines (equities+crypto) and /dashboard exposes assets[]', async () => {
  await withApp({ ASSET_CLASS: 'both' }, async (port, ctx) => {
    assert.strictEqual(ctx.units.length, 2);
    assert.deepStrictEqual(ctx.units.map((u) => u.assetClass), ['equities', 'crypto']);
    // The two engines must have independent diagnostics + circuit breakers.
    assert.notStrictEqual(ctx.units[0].diagnostics, ctx.units[1].diagnostics);
    assert.notStrictEqual(ctx.units[0].circuitBreaker, ctx.units[1].circuitBreaker);

    const r = await get(port, '/dashboard');
    assert.strictEqual(r.status, 200);
    // Backward-compatible top-level shape is preserved.
    for (const k of ['ok', 'ts', 'version', 'account', 'positions', 'meta']) {
      assert.ok(k in r.json, `missing key ${k}`);
    }
    assert.strictEqual(r.json.assetClass, 'both');
    assert.ok(Array.isArray(r.json.assets));
    assert.strictEqual(r.json.assets.length, 2);
    assert.deepStrictEqual(r.json.assets.map((a) => a.assetClass), ['equities', 'crypto']);
    for (const a of r.json.assets) {
      assert.ok('account' in a && 'positions' in a && 'meta' in a);
      assert.ok(Array.isArray(a.positions));
    }
  });
});

test('assetFilteredAdapter isolates each engine to its own asset class', async () => {
  const all = {
    positions: [
      { symbol: 'AAPL', raw: { asset_class: 'us_equity' } },
      { symbol: 'BTC/USD', raw: { asset_class: 'crypto' } },
      { symbol: 'NOSLASHCRYPTO' }, // no raw => fall back to "/" heuristic (treated equities)
    ],
    orders: [
      { id: '1', symbol: 'MSFT', raw: { asset_class: 'us_equity' } },
      { id: '2', symbol: 'ETH/USD', raw: { asset_class: 'crypto' } },
    ],
  };
  const base = {
    async getPositions() { return all.positions; },
    async getOpenOrders() { return all.orders; },
    async getAccount() { return { equity: 1 }; },
  };

  const eq = assetFilteredAdapter(base, 'equities');
  const cr = assetFilteredAdapter(base, 'crypto');

  assert.deepStrictEqual((await eq.getPositions()).map((p) => p.symbol), ['AAPL', 'NOSLASHCRYPTO']);
  assert.deepStrictEqual((await cr.getPositions()).map((p) => p.symbol), ['BTC/USD']);
  assert.deepStrictEqual((await eq.getOpenOrders()).map((o) => o.symbol), ['MSFT']);
  assert.deepStrictEqual((await cr.getOpenOrders()).map((o) => o.symbol), ['ETH/USD']);
  // Non-filtered ops pass through (same account object).
  assert.deepStrictEqual(await eq.getAccount(), { equity: 1 });
});

test('deriveAssetConfigs: single passes through, both yields per-class configs', () => {
  const single = { assetClass: 'crypto', universe: ['BTC/USD'] };
  assert.deepStrictEqual(deriveAssetConfigs(single), [single]);

  const both = deriveAssetConfigs({
    assetClass: 'both', equitiesUniverse: ['AAPL'], cryptoUniverse: ['BTC/USD'],
  });
  assert.strictEqual(both.length, 2);
  assert.deepStrictEqual(both.map((c) => c.assetClass), ['equities', 'crypto']);
  assert.deepStrictEqual(both[0].universe, ['AAPL']);
  assert.deepStrictEqual(both[1].universe, ['BTC/USD']);
  assert.strictEqual(both[0].executionVenue, 'alpaca_equities');
  assert.strictEqual(both[1].executionVenue, 'alpaca_crypto');
});

test('an unknown ASSET_CLASS refuses to boot', () => {
  assert.throws(
    () => buildContext({ APCA_API_KEY_ID: 'PK', APCA_API_SECRET_KEY: 's', ASSET_CLASS: 'stocks' }),
    /ASSET_CLASS must be "equities", "crypto", or "both"/,
  );
});
