'use strict';

/**
 * scripts/backtest_strategy.js — grade a signal by replaying bars.
 *
 * Usage:
 *   node scripts/backtest_strategy.js [signal] [--seed N] [--bars N] [--symbol SYM]
 *   node scripts/backtest_strategy.js momentum --bars 1200 --seed 11
 *   node scripts/backtest_strategy.js vwap_reversion --live --symbol AAPL
 *
 * Default uses a deterministic synthetic series (works offline). With --live it
 * pulls real 1m bars from Alpaca for --symbol (needs creds + network).
 */

const { bootstrapLiveEnv } = require('../config/bootstrapLiveEnv');
const { validateEnv } = require('../config/validateEnv');
const { backtestSignal, syntheticBars, passesValidation } = require('../modules/backtest');

function parseArgs(argv) {
  const args = { signal: 'momentum', seed: 7, bars: 800, symbol: null, live: false };
  const rest = argv.slice(2);
  if (rest[0] && !rest[0].startsWith('--')) args.signal = rest.shift();
  for (let i = 0; i < rest.length; i++) {
    const a = rest[i];
    if (a === '--seed') args.seed = Number(rest[++i]);
    else if (a === '--bars') args.bars = Number(rest[++i]);
    else if (a === '--symbol') args.symbol = rest[++i];
    else if (a === '--live') args.live = true;
  }
  return args;
}

async function loadBars(args, config) {
  if (!args.live) return syntheticBars(args.bars, { seed: args.seed });
  const { selectAdapter } = require('../modules/execution');
  const adapter = selectAdapter(config);
  const symbol = args.symbol || config.universe[0];
  console.log(`fetching ${args.bars} live 1m bars for ${symbol}...`);
  return adapter.getBars(symbol, { timeframe: '1Min', limit: Math.min(args.bars, 1000) });
}

async function main() {
  const args = parseArgs(process.argv);
  const env = { ...process.env };
  if (!env.APCA_API_KEY_ID) env.APCA_API_KEY_ID = 'BACKTEST';
  if (!env.APCA_API_SECRET_KEY) env.APCA_API_SECRET_KEY = 'BACKTEST';
  bootstrapLiveEnv(env);
  const config = validateEnv(env);

  const bars = await loadBars(args, config);
  if (!bars || bars.length < 80) {
    console.error(`not enough bars (${bars ? bars.length : 0}) to backtest`);
    process.exit(1);
  }
  const result = backtestSignal(bars, { signalName: args.signal, config });
  console.log(`\nBacktest: signal=${args.signal} bars=${bars.length} ${args.live ? '(live)' : `(synthetic seed=${args.seed})`}`);
  console.log('  trades        :', result.sample);
  console.log('  win rate      :', result.winRate != null ? (result.winRate * 100).toFixed(1) + '%' : '—');
  console.log('  expectancy    :', result.expectancyBps != null ? result.expectancyBps + ' bps/trade' : '—');
  console.log('  total         :', result.totalBps + ' bps');
  console.log('  max drawdown  :', result.maxDrawdownBps + ' bps');
  const pass = passesValidation(result, config);
  console.log(
    `  validation    : ${pass ? 'PASS' : 'FAIL'} (need >= ${config.backtestMinSamples} trades & >= ${config.backtestMinExpectancyBps} bps expectancy)`,
  );
}

main().catch((e) => {
  console.error('backtest error:', e.message);
  process.exit(1);
});
