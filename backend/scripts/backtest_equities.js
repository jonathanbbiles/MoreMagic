'use strict';

/**
 * scripts/backtest_equities.js — grade signals on REAL equities 1m bars.
 * -----------------------------------------------------------------------------
 * The equities money-path harness. Runs a basket of liquid names through the
 * app's OWN backtestSignal (signals + scoring + intrabar exits + cost model), so
 * the number it prints is what the live loop would have realized — net of the
 * ~7.5 bps commission-free equities round-trip cost.
 *
 * Two data sources:
 *   --source alpaca  (DEFAULT) real 1m bars via the app's Alpaca adapter.
 *                    Needs paper keys in backend/.env (APCA_API_KEY_ID/SECRET).
 *                    This is the source the LIVE bot uses — run this the moment
 *                    keys land to confirm edge on the broker's own data.
 *   --source yahoo   free, no-auth 1m bars (Yahoo), max ~7 days. Lets us measure
 *                    edge TODAY without credentials. Great for signal R&D.
 *
 * Usage:
 *   node scripts/backtest_equities.js                      # default basket, both signals, yahoo-safe
 *   node scripts/backtest_equities.js --source yahoo --signals momentum,trend_pullback
 *   node scripts/backtest_equities.js --source alpaca --days 7 --signals trend_pullback
 *   node scripts/backtest_equities.js --symbols AAPL,MSFT,NVDA --source yahoo
 */

const { bootstrapLiveEnv } = require('../config/bootstrapLiveEnv');
const { validateEnv } = require('../config/validateEnv');
const { backtestSignal } = require('../modules/backtest');
const { roundTripCostBps } = require('../modules/costs/costModel');

const DEFAULT_BASKET = [
  'AAPL', 'MSFT', 'NVDA', 'AMD', 'TSLA', 'META', 'AMZN', 'GOOGL', 'NFLX', 'AVGO',
  'CRM', 'ORCL', 'ADBE', 'QCOM', 'INTC', 'MU', 'JPM', 'BAC', 'XOM', 'CVX',
  'SPY', 'QQQ', 'IWM', 'DIS', 'BA', 'COIN', 'PLTR', 'SHOP', 'UBER', 'SMCI',
];

function parseArgs(argv) {
  const a = { signals: ['momentum', 'trend_pullback'], source: 'alpaca', days: 7, symbols: null };
  const r = argv.slice(2);
  for (let i = 0; i < r.length; i++) {
    if (r[i] === '--signals') a.signals = r[++i].split(',');
    else if (r[i] === '--source') a.source = r[++i];
    else if (r[i] === '--days') a.days = Number(r[++i]);
    else if (r[i] === '--symbols') a.symbols = r[++i].split(',');
  }
  return a;
}

async function fetchYahoo(symbol, days) {
  const range = days <= 7 ? '7d' : '1mo';
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1m&range=${range}`;
  const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
  if (!res.ok) return null;
  const j = await res.json();
  const r = j && j.chart && j.chart.result && j.chart.result[0];
  if (!r || !r.timestamp) return null;
  const q = r.indicators.quote[0];
  const out = [];
  for (let i = 0; i < r.timestamp.length; i++) {
    const o = q.open[i], h = q.high[i], l = q.low[i], c = q.close[i], v = q.volume[i];
    if ([o, h, l, c].some((x) => x == null)) continue;
    out.push({ t: r.timestamp[i] * 1000, o, h, l, c, v: v || 0 });
  }
  return out;
}

async function fetchAlpaca(symbol, adapter, days) {
  const limit = Math.min(days * 390 + 60, 10000); // ~390 1m bars per equities session
  return adapter.getBars(symbol, { timeframe: '1Min', limit });
}

function pct(x, n) { return n ? +(100 * x / n).toFixed(1) : null; }

function aggregate(trades) {
  const n = trades.length;
  const wins = trades.filter((t) => t.pnlBps > 0);
  const grossWin = wins.reduce((s, t) => s + t.pnlBps, 0);
  const grossLoss = Math.abs(trades.filter((t) => t.pnlBps <= 0).reduce((s, t) => s + t.pnlBps, 0));
  const net = trades.reduce((s, t) => s + t.pnlBps, 0);
  const gross = trades.reduce((s, t) => s + (t.grossPnlBps ?? t.pnlBps), 0);
  let peak = 0, cum = 0, dd = 0;
  for (const t of trades) { cum += t.pnlBps; peak = Math.max(peak, cum); dd = Math.min(dd, cum - peak); }
  return {
    trades: n,
    winRate: pct(wins.length, n),
    netExpBps: n ? +(net / n).toFixed(2) : null,
    grossExpBps: n ? +(gross / n).toFixed(2) : null,
    profitFactor: grossLoss > 0 ? +(grossWin / grossLoss).toFixed(2) : (grossWin > 0 ? Infinity : 0),
    totalNetBps: +net.toFixed(1),
    maxDdBps: +dd.toFixed(1),
  };
}

async function main() {
  const args = parseArgs(process.argv);
  const env = { ...process.env, ASSET_CLASS: 'equities', EXECUTION_VENUE: 'alpaca_equities' };
  if (!env.APCA_API_KEY_ID) env.APCA_API_KEY_ID = 'BACKTEST';
  if (!env.APCA_API_SECRET_KEY) env.APCA_API_SECRET_KEY = 'BACKTEST';
  bootstrapLiveEnv(env);
  const config = validateEnv(env);
  const symbols = args.symbols || DEFAULT_BASKET;
  const rtCost = roundTripCostBps({ config, spreadBps: config.assumedSpreadBps }).totalBps;

  let adapter = null;
  if (args.source === 'alpaca') {
    const { selectAdapter } = require('../modules/execution');
    adapter = selectAdapter(config);
  }

  console.log(`\nEquities backtest — source=${args.source}  signals=${args.signals.join(',')}`);
  console.log(`config: MIN_CONFIDENCE=${config.minConfidence} MIN_SCORE=${config.minScore} TP=${config.takeProfitBps} STOP=${config.stopLossBps} maxHold=${config.maxHoldMinutes}m`);
  console.log(`equities round-trip cost: ${rtCost} bps (commission-free; spread+slippage only)\n`);

  const perSignal = {};
  args.signals.forEach((s) => (perSignal[s] = []));
  let okSyms = 0, totalBars = 0;
  const rows = [];

  for (const sym of symbols) {
    let bars = null;
    try {
      bars = args.source === 'alpaca' ? await fetchAlpaca(sym, adapter, args.days) : await fetchYahoo(sym, args.days);
    } catch (e) {
      bars = null;
    }
    if (!bars || bars.length < 200) { rows.push(`${sym.padEnd(7)} — skip (${bars ? bars.length : 0} bars)`); continue; }
    okSyms++; totalBars += bars.length;
    const cells = [sym.padEnd(7), `${String(bars.length).padStart(5)}b`];
    for (const sig of args.signals) {
      const r = backtestSignal(bars, { signalName: sig, config });
      perSignal[sig].push(...r.trades);
      cells.push(`${sig.slice(0, 4)}:${String(r.sample).padStart(3)}t ${r.expectancyBps == null ? '   —' : String(r.expectancyBps).padStart(6)}`);
    }
    rows.push(cells.join('  '));
  }

  console.log(rows.join('\n'));
  console.log(`\n=== ${okSyms} symbols, ${totalBars} real 1m bars, NET of ${rtCost} bps round-trip ===`);
  for (const sig of args.signals) {
    const a = aggregate(perSignal[sig]);
    const enough = a.trades >= config.backtestMinSamples;
    const profitable = (a.netExpBps ?? -1) > 0;
    console.log(`\n[${sig}]`);
    console.log(`  trades          : ${a.trades}${enough ? '' : `  (thin — want >= ${config.backtestMinSamples})`}`);
    console.log(`  win rate        : ${a.winRate}%`);
    console.log(`  NET expectancy  : ${a.netExpBps} bps/trade   (gross ${a.grossExpBps})`);
    console.log(`  profit factor   : ${a.profitFactor}`);
    console.log(`  total NET        : ${a.totalNetBps} bps`);
    console.log(`  max drawdown    : ${a.maxDdBps} bps`);
    console.log(`  VERDICT         : ${profitable ? 'POSITIVE net edge' : 'no net edge'}${enough ? '' : ' [low sample]'}`);
  }
}

main().catch((e) => { console.error('backtest_equities error:', e.message); process.exit(1); });
