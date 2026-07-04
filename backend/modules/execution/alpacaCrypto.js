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
    // Discover the full tradable crypto universe from Alpaca's trading API.
    // Returns the sorted list of active, tradable USD-quoted symbols (e.g.
    // "BTC/USD"). Non-USD legs (USDT/USDC/BTC-quoted) are dropped so every
    // symbol prices against the account's cash currency. trade.js consults this
    // (behind a TTL cache) only when CRYPTO_UNIVERSE_MODE=all.
    async listAssets() {
      const { data } = await client.trading.get('/v2/assets', {
        params: { asset_class: 'crypto', status: 'active' },
      });
      const arr = Array.isArray(data) ? data : [];
      const seen = new Set();
      for (const a of arr) {
        if (!a || a.tradable === false) continue;
        const sym = typeof a.symbol === 'string' ? a.symbol.trim() : '';
        if (sym.endsWith('/USD')) seen.add(sym);
      }
      return Array.from(seen).sort();
    },
  };
}

module.exports = { createCryptoAdapter };
