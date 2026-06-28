'use strict';

/**
 * scripts/reconcile.js — operational helper. Connects with the configured creds
 * and prints account, open positions, and open orders so you can eyeball that
 * the broker's view matches expectations. Requires network + valid creds.
 */

const { buildContext } = require('../index');

async function main() {
  const ctx = buildContext();
  const { adapter, config } = ctx;
  console.log(`reconcile: mode=${config.tradingMode} venue=${config.executionVenue} paper=${config.isPaper}`);
  try {
    const [account, positions, orders] = await Promise.all([
      adapter.getAccount(),
      adapter.getPositions(),
      adapter.getOpenOrders(),
    ]);
    console.log('account:', JSON.stringify({ equity: account.equity, cash: account.cash, daytradeCount: account.daytradeCount }, null, 2));
    console.log(`positions (${positions.length}):`);
    positions.forEach((p) => console.log(`  ${p.symbol} qty=${p.qty} uPL=${p.unrealizedPl}`));
    console.log(`open orders (${orders.length}):`);
    orders.forEach((o) => console.log(`  ${o.symbol} ${o.side} ${o.type} ${o.status}`));
  } catch (e) {
    console.error('reconcile failed (broker unreachable or bad creds):', e.message);
    process.exit(1);
  }
}
main();
