'use strict';

const test = require('node:test');
const assert = require('node:assert');
const { createEngine, decideExit, sizeNotional } = require('./trade');
const { bootstrapLiveEnv } = require('./config/bootstrapLiveEnv');
const { validateEnv } = require('./config/validateEnv');
const { createRecorder } = require('./modules/diagnostics/recorder');
const { createCircuitBreaker } = require('./modules/safety/circuitBreaker');

const MARKET_OPEN_TS = Date.parse('2025-06-25T18:00:00Z'); // Wed 14:00 ET
const EOD_TS = Date.parse('2025-06-25T19:57:00Z'); // 15:57 ET -> flatten

function baseConfig(overrides = {}) {
  const env = { APCA_API_KEY_ID: 'PK', APCA_API_SECRET_KEY: 's' };
  bootstrapLiveEnv(env);
  const cfg = validateEnv(env);
  return {
    ...cfg,
    universe: ['AAA'],
    enableTrading: true,
    minConfidence: 0.3,
    minScore: 0.2,
    rsiMin: 0,
    rsiMax: 100, // neutralize RSI band so a clean ramp triggers momentum
    ...overrides,
  };
}

function accelUpBars(n = 80) {
  const out = [];
  let x = 100;
  for (let i = 0; i < n; i++) {
    x += 0.1 + i * 0.004;
    out.push({ t: i * 60000, o: x, h: x + 0.05, l: x - 0.05, c: +x.toFixed(3), v: 1000 + i });
  }
  return out;
}

function mockAdapter(overrides = {}) {
  const calls = { submit: [], close: [], cancel: [] };
  const base = {
    venue: 'alpaca_equities',
    calls,
    async getAccount() {
      return { equity: 100000, lastEquity: 100000, cash: 100000, daytradeCount: 0, patternDayTrader: false };
    },
    async getPositions() {
      return [];
    },
    async getOpenOrders() {
      return [];
    },
    async getBars() {
      return accelUpBars();
    },
    async getLatestQuote() {
      return { bid: 100, ask: 100.05, bidSize: 5, askSize: 5, tsMs: MARKET_OPEN_TS - 1000 };
    },
    async submitOrder(p) {
      calls.submit.push(p);
      return { id: 'o1', symbol: p.symbol, side: p.side, type: p.type, status: 'accepted' };
    },
    async closePosition(symbol) {
      calls.close.push(symbol);
      return { id: 'c1', symbol, status: 'accepted' };
    },
    async cancelOrder(id) {
      calls.cancel.push(id);
      return { ok: true, id };
    },
  };
  return { ...base, ...overrides, calls };
}

test('decideExit prioritizes flatten > stop > take-profit > max-hold', () => {
  const cfg = { stopLossBps: 80, takeProfitBps: 120, maxHoldMinutes: 180 };
  assert.strictEqual(decideExit({ plBps: 200, heldMin: 1, shouldFlatten: true, config: cfg }), 'eod_flatten');
  assert.strictEqual(decideExit({ plBps: -90, heldMin: 1, shouldFlatten: false, config: cfg }), 'stop_loss');
  assert.strictEqual(decideExit({ plBps: 130, heldMin: 1, shouldFlatten: false, config: cfg }), 'take_profit');
  assert.strictEqual(decideExit({ plBps: 10, heldMin: 200, shouldFlatten: false, config: cfg }), 'max_hold');
  assert.strictEqual(decideExit({ plBps: 10, heldMin: 1, shouldFlatten: false, config: cfg }), null);
});

test('sizeNotional clamps to available cash', () => {
  assert.strictEqual(sizeNotional({ equity: 100000, cash: 100000 }, { positionSizingPct: 0.1 }), 10000);
  assert.strictEqual(sizeNotional({ equity: 100000, cash: 500 }, { positionSizingPct: 0.1 }), 500);
});

test('runOnce enters a momentum setup during market hours', async () => {
  const adapter = mockAdapter();
  const diagnostics = createRecorder();
  const circuitBreaker = createCircuitBreaker();
  const engine = createEngine({ adapter, config: baseConfig(), diagnostics, circuitBreaker, now: () => MARKET_OPEN_TS });
  const r = await engine.runOnce();
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.entries.entered, 1);
  assert.strictEqual(adapter.calls.submit.length, 1);
  assert.strictEqual(adapter.calls.submit[0].symbol, 'AAA');
  assert.strictEqual(adapter.calls.submit[0].side, 'buy');
  assert.ok(adapter.calls.submit[0].notional > 0);
});

test('runOnce does not enter outside market hours', async () => {
  const adapter = mockAdapter();
  const engine = createEngine({
    adapter,
    config: baseConfig(),
    diagnostics: createRecorder(),
    circuitBreaker: createCircuitBreaker(),
    now: () => Date.parse('2025-06-25T08:00:00Z'), // 04:00 ET, closed
  });
  const r = await engine.runOnce();
  assert.strictEqual(r.entries.entered, 0);
  assert.strictEqual(adapter.calls.submit.length, 0);
});

test('reconcileExits takes profit and records the closed trade', async () => {
  const adapter = mockAdapter({
    async getPositions() {
      return [{ symbol: 'AAA', qty: 10, avgEntryPrice: 100, currentPrice: 102, unrealizedPlpc: 0.02, unrealizedPl: 20 }];
    },
  });
  const diagnostics = createRecorder();
  const circuitBreaker = createCircuitBreaker();
  const engine = createEngine({ adapter, config: baseConfig(), diagnostics, circuitBreaker, now: () => MARKET_OPEN_TS });
  const r = await engine.runOnce();
  assert.strictEqual(r.exits.exits, 1);
  assert.deepStrictEqual(adapter.calls.close, ['AAA']);
  assert.strictEqual(diagnostics.getMeta().scorecard.closedTrades, 1);
  // +200 bps trade should be healthy for the breaker
  assert.strictEqual(circuitBreaker.isHalted('momentum', baseConfig()).expectancyBps, 200);
});

test('reconcileExits flattens everything at EOD', async () => {
  const adapter = mockAdapter({
    async getPositions() {
      return [{ symbol: 'AAA', qty: 10, avgEntryPrice: 100, currentPrice: 100.1, unrealizedPlpc: 0.001, unrealizedPl: 1 }];
    },
  });
  const engine = createEngine({
    adapter,
    config: baseConfig(),
    diagnostics: createRecorder(),
    circuitBreaker: createCircuitBreaker(),
    now: () => EOD_TS,
  });
  const r = await engine.runOnce();
  assert.strictEqual(r.exits.flatten, true);
  assert.deepStrictEqual(adapter.calls.close, ['AAA']);
  assert.strictEqual(r.exits.closed[0].reason, 'eod_flatten');
});

test('runOnce degrades gracefully when the broker is unreachable', async () => {
  const adapter = mockAdapter({
    async getAccount() {
      throw new Error('ECONNREFUSED');
    },
  });
  const diagnostics = createRecorder();
  const engine = createEngine({ adapter, config: baseConfig(), diagnostics, circuitBreaker: createCircuitBreaker(), now: () => MARKET_OPEN_TS });
  const r = await engine.runOnce();
  assert.strictEqual(r.ok, false);
  assert.match(r.error, /ECONNREFUSED/);
  assert.strictEqual(diagnostics.getMeta().safety.brakeActive, true);
});

test('circuit breaker halts new entries for a bleeding signal', async () => {
  const adapter = mockAdapter();
  const circuitBreaker = createCircuitBreaker();
  const cfg = baseConfig();
  for (let i = 0; i < cfg.cbMinClosedTrades + 2; i++) circuitBreaker.record({ signal: 'momentum', pnlBps: -50 });
  const engine = createEngine({ adapter, config: cfg, diagnostics: createRecorder(), circuitBreaker, now: () => MARKET_OPEN_TS });
  const r = await engine.runOnce();
  assert.strictEqual(r.entries.entered, 0);
  assert.strictEqual(adapter.calls.submit.length, 0);
});
