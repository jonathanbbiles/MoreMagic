'use strict';

/**
 * execution/alpacaCrypto.js — crypto adapter (24/7).
 * Trading ops are shared; market data uses the crypto v1beta3 endpoints, which
 * key bars/quotes by symbol (e.g. "BTC/USD"). Orders use GTC time-in-force.
 */

const N = require('./normalize');
const { createTradingOps } = require('./alpacaBase');

const TF = { '1m': '1Min', '5m': '5Min', '15m': '15Min', '1h': '1Hour', '1Min': '1Min', '5Min': '5Min' };

function createCryptoAdapter({ client, config }) {
  const ops = createTradingOps(client, { timeInForce: 'gtc' });
  return {
    venue: 'alpaca_crypto',
    assetClass: 'crypto',
    ...ops,
    async getBars(symbol, { timeframe = '1Min', limit = 100 } = {}) {
      const { data } = await client.data.get('/v1beta3/crypto/us/bars', {
        params: { symbols: symbol, timeframe: TF[timeframe] || timeframe, limit },
      });
      const bySymbol = (data && data.bars && data.bars[symbol]) || [];
      return N.normalizeBars(bySymbol);
    },
    async getLatestQuote(symbol) {
      const { data } = await client.data.get('/v1beta3/crypto/us/latest/quotes', {
        params: { symbols: symbol },
      });
      return N.normalizeCryptoQuote(data, symbol);
    },
  };
}

module.exports = { createCryptoAdapter };
