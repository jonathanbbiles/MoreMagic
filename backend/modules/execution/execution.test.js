'use strict';

const test = require('node:test');
const assert = require('node:assert');
const { selectAdapter } = require('./index');
const { buildOrderBody } = require('./alpacaBase');

// Minimal mock of the alpaca client: records calls and returns fixtures.
function mockClient(responses = {}) {
  const calls = [];
  const handler = (surface) => ({
    async get(url, opts) {
      calls.push({ surface, method: 'get', url, opts });
      const key = `GET ${url}`;
      return { data: responses[key] !== undefined ? responses[key] : (responses.__getDefault || {}) };
    },
    async post(url, body) {
      calls.push({ surface, method: 'post', url, body });
      return { data: responses[`POST ${url}`] || { id: 'o1', symbol: body.symbol, side: body.side, type: body.type, qty: body.qty, status: 'accepted', submitted_at: '2025-06-25T18:00:00Z' } };
    },
    async delete(url) {
      calls.push({ surface, method: 'delete', url });
      return { data: responses[`DELETE ${url}`] || {} };
    },
  });
  return { trading: handler('trading'), data: handler('data'), calls };
}

const eqConfig = { executionVenue: 'alpaca_equities' };
const cxConfig = { executionVenue: 'alpaca_crypto' };

test('buildOrderBody omits notional when qty present', () => {
  const b = buildOrderBody({ symbol: 'AAPL', side: 'buy', qty: 5, notional: 999, timeInForce: 'day' });
  assert.strictEqual(b.qty, '5');
  assert.strictEqual(b.notional, undefined);
});

test('equities adapter: account + bars + quote + submit', async () => {
  const client = mockClient({
    'GET /v2/account': { equity: '100000', cash: '50000', buying_power: '200000', daytrade_count: 1, status: 'ACTIVE' },
    'GET /v2/stocks/AAPL/bars': { bars: [{ t: '2025-06-25T18:00:00Z', o: 1, h: 2, l: 0.5, c: 1.5, v: 1000 }] },
    'GET /v2/stocks/AAPL/quotes/latest': { quote: { bp: 100, ap: 100.05, t: '2025-06-25T18:00:00Z' } },
  });
  const a = selectAdapter(eqConfig, client);
  assert.strictEqual(a.venue, 'alpaca_equities');
  const acct = await a.getAccount();
  assert.strictEqual(acct.equity, 100000);
  assert.strictEqual(acct.daytradeCount, 1);
  const bars = await a.getBars('AAPL', { timeframe: '1m', limit: 10 });
  assert.strictEqual(bars.length, 1);
  assert.strictEqual(bars[0].c, 1.5);
  const q = await a.getLatestQuote('AAPL');
  assert.strictEqual(q.ask, 100.05);
  const order = await a.submitOrder({ symbol: 'AAPL', side: 'buy', qty: 10 });
  assert.strictEqual(order.symbol, 'AAPL');
  // equities default tif is 'day'
  const post = client.calls.find((c) => c.method === 'post');
  assert.strictEqual(post.body.time_in_force, 'day');
});

test('crypto adapter: bars keyed by symbol + gtc tif', async () => {
  const client = mockClient({
    'GET /v1beta3/crypto/us/bars': { bars: { 'BTC/USD': [{ t: '2025-06-25T18:00:00Z', o: 1, h: 2, l: 0.5, c: 1.7, v: 5 }] } },
    'GET /v1beta3/crypto/us/latest/quotes': { quotes: { 'BTC/USD': { bp: 60000, ap: 60010, t: '2025-06-25T18:00:00Z' } } },
  });
  const a = selectAdapter(cxConfig, client);
  assert.strictEqual(a.venue, 'alpaca_crypto');
  const bars = await a.getBars('BTC/USD', { timeframe: '1m' });
  assert.strictEqual(bars[0].c, 1.7);
  const q = await a.getLatestQuote('BTC/USD');
  assert.strictEqual(q.bid, 60000);
  await a.submitOrder({ symbol: 'BTC/USD', side: 'buy', notional: 100 });
  const post = client.calls.find((c) => c.method === 'post');
  assert.strictEqual(post.body.time_in_force, 'gtc');
  assert.strictEqual(post.body.notional, '100');
});

test('selectAdapter rejects unknown venue', () => {
  assert.throws(() => selectAdapter({ executionVenue: 'nasdaq_direct' }, mockClient()), /Unsupported EXECUTION_VENUE/);
});
