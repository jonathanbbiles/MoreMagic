'use strict';

/**
 * execution/alpacaEquities.js — US equities adapter.
 * Trading ops are shared; market data uses the stocks endpoints (IEX feed is the
 * free default and works on paper accounts).
 */

const N = require('./normalize');
const { createTradingOps } = require('./alpacaBase');

const TF = { '1m': '1Min', '5m': '5Min', '15m': '15Min', '1h': '1Hour', '1Min': '1Min', '5Min': '5Min' };

function createEquitiesAdapter({ client, config }) {
  const feed = (config && config.equityDataFeed) || 'iex';
  const ops = createTradingOps(client, { timeInForce: 'day' });
  return {
    venue: 'alpaca_equities',
    assetClass: 'equities',
    ...ops,
    async getBars(symbol, { timeframe = '1Min', limit = 100 } = {}) {
      const { data } = await client.data.get(`/v2/stocks/${encodeURIComponent(symbol)}/bars`, {
        params: { timeframe: TF[timeframe] || timeframe, limit, feed, adjustment: 'raw' },
      });
      return N.normalizeBars(data && data.bars);
    },
    async getLatestQuote(symbol) {
      const { data } = await client.data.get(`/v2/stocks/${encodeURIComponent(symbol)}/quotes/latest`, {
        params: { feed },
      });
      return N.normalizeEquityQuote(data);
    },
  };
}

module.exports = { createEquitiesAdapter, EQUITY_TIMEFRAMES: TF };
