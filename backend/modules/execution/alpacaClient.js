'use strict';

/**
 * execution/alpacaClient.js
 * -----------------------------------------------------------------------------
 * Thin axios wrapper holding the two Alpaca surfaces (trading + market data)
 * with auth headers and a short timeout so the loop never wedges on the network.
 * The adapters depend on this client but can also be handed a mock for tests.
 */

const axios = require('axios');

function createAlpacaClient(config) {
  const headers = {
    'APCA-API-KEY-ID': config.alpacaKeyId,
    'APCA-API-SECRET-KEY': config.alpacaSecret,
    'Content-Type': 'application/json',
  };
  const trading = axios.create({
    baseURL: config.tradingBaseUrl,
    timeout: config.brokerTimeoutMs,
    headers,
  });
  const data = axios.create({
    baseURL: config.dataBaseUrl,
    timeout: config.brokerTimeoutMs,
    headers,
  });
  return { trading, data, config };
}

/** Normalize an axios error into something safe to log/surface. */
function describeBrokerError(err) {
  if (err && err.response) {
    return {
      ok: false,
      status: err.response.status,
      message: (err.response.data && (err.response.data.message || JSON.stringify(err.response.data))) || err.message,
    };
  }
  return { ok: false, status: null, message: err && err.message ? err.message : String(err) };
}

module.exports = { createAlpacaClient, describeBrokerError };
