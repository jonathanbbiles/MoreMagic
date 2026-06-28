'use strict';

/**
 * execution/index.js — adapter selection.
 * -----------------------------------------------------------------------------
 * Picks the execution adapter from the validated config's executionVenue at
 * boot. Every adapter returns identically-shaped Alpaca objects, so signals and
 * the strategy loop never branch on venue. A client may be injected for tests.
 */

const { createAlpacaClient } = require('./alpacaClient');
const { createEquitiesAdapter } = require('./alpacaEquities');
const { createCryptoAdapter } = require('./alpacaCrypto');

function selectAdapter(config, clientOverride) {
  const client = clientOverride || createAlpacaClient(config);
  switch (config.executionVenue) {
    case 'alpaca_crypto':
      return createCryptoAdapter({ client, config });
    case 'alpaca_equities':
      return createEquitiesAdapter({ client, config });
    default:
      throw new Error(`Unsupported EXECUTION_VENUE: ${config.executionVenue}`);
  }
}

module.exports = {
  selectAdapter,
  createAlpacaClient,
  createEquitiesAdapter,
  createCryptoAdapter,
};
