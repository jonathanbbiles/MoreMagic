'use strict';

/**
 * execution/alpacaBase.js
 * -----------------------------------------------------------------------------
 * Trading-API operations shared by both Alpaca adapters (the trading API is one
 * unified surface for equities and crypto). Market-data differs per venue and is
 * supplied by each adapter. Pure-ish: all I/O goes through the injected client.
 */

const N = require('./normalize');

function buildOrderBody({ symbol, side, type = 'market', qty, notional, limitPrice, timeInForce }) {
  const body = { symbol, side, type, time_in_force: timeInForce };
  if (qty != null) body.qty = String(qty);
  else if (notional != null) body.notional = String(notional);
  if (type === 'limit' && limitPrice != null) body.limit_price = String(limitPrice);
  return body;
}

function createTradingOps(client, { timeInForce }) {
  return {
    async getAccount() {
      const { data } = await client.trading.get('/v2/account');
      return N.normalizeAccount(data);
    },
    async getPositions() {
      const { data } = await client.trading.get('/v2/positions');
      return (Array.isArray(data) ? data : []).map(N.normalizePosition);
    },
    async getOpenOrders() {
      const { data } = await client.trading.get('/v2/orders', { params: { status: 'open', limit: 100 } });
      return (Array.isArray(data) ? data : []).map(N.normalizeOrder);
    },
    async submitOrder(params) {
      const body = buildOrderBody({ timeInForce, ...params });
      const { data } = await client.trading.post('/v2/orders', body);
      return N.normalizeOrder(data);
    },
    async cancelOrder(id) {
      await client.trading.delete(`/v2/orders/${encodeURIComponent(id)}`);
      return { ok: true, id };
    },
    async closePosition(symbol) {
      const { data } = await client.trading.delete(`/v2/positions/${encodeURIComponent(symbol)}`);
      return N.normalizeOrder(data || {});
    },
  };
}

module.exports = { buildOrderBody, createTradingOps };
