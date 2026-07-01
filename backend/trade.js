'use strict';

/**
 * trade.js — the strategy loop.
 * -----------------------------------------------------------------------------
 * Wires the pure modules to the execution adapter. Keeps Magic's deliberately
 * simple 4-step scanAndEnter (NOT a 25-gate monster) plus a day-trader
 * reconcileExits (take-profit / stop / max-hold / EOD flatten / stale-cancel).
 *
 * Pure modules do the math; this file does the orchestration and the I/O. It is
 * a factory (createEngine) with injectable adapter/clock so it is testable with
 * a mock adapter and a fixed clock — no network, no real time.
 *
 * Safety inputs (circuit breaker, daily-loss, PDT, market hours) gate entries
 * here. Observational diagnostics are recorded as a side effect and NEVER gate.
 */

const { evaluateSignal } = require('./modules/signals');
const { scoreSetup, rankCandidates } = require('./modules/smart/scoreSetup');
const { marketState, toEtParts } = require('./modules/gates/marketHours');
const { pdtGate } = require('./modules/gates/pdt');
const { microstructureGate } = require('./modules/gates/microstructure');
const { describeBrokerError } = require('./modules/execution/alpacaClient');
const { netPnlBps } = require('./modules/costs/costModel');

const round2 = (x) => Math.round(x * 100) / 100;

/**
 * Pure exit decision. Priority: EOD flatten > stop > take-profit > max-hold.
 * @returns {string|null} exit reason, or null to hold.
 */
function decideExit({ plBps, heldMin, shouldFlatten, config }) {
  if (shouldFlatten) return 'eod_flatten';
  if (plBps != null && plBps <= -config.stopLossBps) return 'stop_loss';
  if (plBps != null && plBps >= config.takeProfitBps) return 'take_profit';
  if (heldMin != null && heldMin >= config.maxHoldMinutes) return 'max_hold';
  return null;
}

/** Per-entry notional: position sizing % of equity, clamped to available cash. */
function sizeNotional(account, config) {
  const byEquity = (account.equity || 0) * config.positionSizingPct;
  const clamped = Math.min(byEquity, account.cash || 0);
  return round2(clamped);
}

function createEngine({ adapter, config, diagnostics, circuitBreaker, now = () => Date.now(), logger = () => {} }) {
  const positionMeta = new Map(); // symbol -> { entryTsMs, signal, entryPrice }
  let dayStamp = null;
  let dayStartEquity = null;
  let lastView = { account: null, positions: [], openOrders: [], brokerOk: false, tsMs: null };

  function updateDailyAnchor(ts, account) {
    const d = toEtParts(ts).dateStr;
    if (dayStamp !== d) {
      dayStamp = d;
      dayStartEquity = account.lastEquity != null ? account.lastEquity : account.equity;
    }
  }
  function dailyLossExceeded(account) {
    if (!(dayStartEquity > 0)) return false;
    return (account.equity - dayStartEquity) / dayStartEquity <= -config.maxDailyLossPct;
  }
  function computeSafetyState(account) {
    const reasons = [];
    if (dailyLossExceeded(account)) reasons.push('daily_loss_killswitch');
    for (const s of config.activeSignals) {
      if (circuitBreaker.isHalted(s, config).halted) reasons.push(`circuit_breaker:${s}`);
    }
    return { active: reasons.length > 0, reasons };
  }

  function recordClose(p, meta, plBps, reason) {
    // plBps is the pre-fee mark (Alpaca unrealized_plpc). Net it through the
    // shared cost model so the circuit breaker's realized-expectancy ledger and
    // the scorecard reflect fees + spread + slippage — not an optimistic mark.
    const grossBps = plBps;
    const netBps = grossBps != null ? netPnlBps(grossBps, { config, spreadBps: config.assumedSpreadBps }) : null;
    const trade = { signal: meta.signal, symbol: p.symbol, pnlBps: netBps, grossPnlBps: grossBps, pnlUsd: p.unrealizedPl, reason, tsMs: now() };
    diagnostics.recordClosedTrade(trade);
    if (netBps != null) circuitBreaker.record({ signal: meta.signal, pnlBps: netBps, tsMs: now() });
  }

  async function reconcileExits({ ts, ms, positions, openOrders }) {
    const summary = { exits: 0, flatten: !!ms.shouldFlatten, staleCancelled: 0, closed: [], closedSymbols: [] };

    // Cancel stale unfilled BUY entry orders.
    for (const o of openOrders || []) {
      if (o.side === 'buy' && o.submittedAtMs && ts - o.submittedAtMs > config.staleEntryTimeoutSec * 1000) {
        try {
          await adapter.cancelOrder(o.id);
          summary.staleCancelled++;
        } catch (e) {
          diagnostics.recordSkip('cancel_order_error');
        }
      }
    }

    for (const p of positions || []) {
      if (!p.qty) continue;
      let meta = positionMeta.get(p.symbol);
      if (!meta) {
        meta = { entryTsMs: ts, signal: config.activeSignals[0], entryPrice: p.avgEntryPrice };
        positionMeta.set(p.symbol, meta); // adopt a pre-existing position
      }
      const plpc =
        p.unrealizedPlpc != null
          ? p.unrealizedPlpc
          : p.currentPrice && p.avgEntryPrice
            ? (p.currentPrice - p.avgEntryPrice) / p.avgEntryPrice
            : null;
      const plBps = plpc != null ? plpc * 10000 : null;
      const heldMin = (ts - meta.entryTsMs) / 60000;
      const reason = decideExit({ plBps, heldMin, shouldFlatten: ms.shouldFlatten, config });
      if (!reason) continue;

      if (!config.enableTrading) {
        summary.closed.push({ symbol: p.symbol, reason, pnlBps: plBps != null ? +plBps.toFixed(1) : null, simulated: true });
        continue;
      }
      try {
        await adapter.closePosition(p.symbol);
        recordClose(p, meta, plBps, reason);
        positionMeta.delete(p.symbol);
        summary.exits++;
        summary.closedSymbols.push(p.symbol);
        summary.closed.push({ symbol: p.symbol, reason, pnlBps: plBps != null ? +plBps.toFixed(1) : null });
        logger(`EXIT ${p.symbol} ${reason} pnl=${plBps != null ? plBps.toFixed(1) + 'bps' : 'n/a'}`);
      } catch (e) {
        diagnostics.recordSkip('exit_order_error');
      }
    }
    return summary;
  }

  async function scanAndEnter({ ts, ms, account, positions, openOrders, closedSymbols = [] }) {
    const summary = { evaluated: 0, candidates: 0, entered: 0, skipped: {}, orders: [] };
    const skip = (reason) => {
      summary.skipped[reason] = (summary.skipped[reason] || 0) + 1;
      diagnostics.recordSkip(reason);
    };

    // --- 1) Determine signal context + the safety brakes we keep ---------------
    if (!ms.canEnter) {
      skip(`no_entry:${ms.reason}`);
      return summary;
    }
    if (dailyLossExceeded(account)) {
      skip('daily_loss_killswitch');
      return summary;
    }

    // --- 2) Size + build the universe -----------------------------------------
    const held = new Set((positions || []).map((p) => p.symbol));
    closedSymbols.forEach((s) => held.add(s));
    const inFlight = new Set((openOrders || []).map((o) => o.symbol));
    const openSlots = config.maxOpenPositions - (positions || []).length;
    if (openSlots <= 0) {
      skip('max_positions_reached');
      return summary;
    }
    const pdt = pdtGate({ equity: account.equity, daytradeCount: account.daytradeCount, config });
    if (!pdt.allowed) {
      skip(`pdt:${pdt.reason}`);
      return summary;
    }
    const notional = sizeNotional(account, config);
    if (!(notional >= config.minNotionalUsd)) {
      skip('insufficient_buying_power');
      return summary;
    }

    // --- 3) Per-symbol entry evaluation ---------------------------------------
    const candidates = [];
    for (const symbol of config.universe) {
      if (held.has(symbol) || inFlight.has(symbol)) {
        skip('already_in_book');
        continue;
      }
      summary.evaluated++;
      let bars1m;
      let bars5m;
      let quote;
      try {
        bars1m = await adapter.getBars(symbol, { timeframe: '1Min', limit: 120 });
        bars5m = await adapter.getBars(symbol, { timeframe: '5Min', limit: 120 });
        quote = await adapter.getLatestQuote(symbol);
      } catch (e) {
        skip('data_error');
        continue;
      }
      const micro = microstructureGate({ bid: quote.bid, ask: quote.ask, quoteTsMs: quote.tsMs, now: ts, config });
      if (!micro.ok) {
        skip(micro.reason);
        continue;
      }
      let best = null;
      for (const sName of config.activeSignals) {
        if (circuitBreaker.isHalted(sName, config).halted) {
          skip(`circuit_breaker:${sName}`);
          continue;
        }
        const res = evaluateSignal(sName, { symbol, bars1m, bars5m, config });
        diagnostics.recordSignalState(sName, res);
        if (!res.ok) {
          skip(res.reason);
          continue;
        }
        if (res.confidence < config.minConfidence) {
          skip('below_min_confidence');
          continue;
        }
        const scored = scoreSetup({ signal: res, spreadBps: micro.spreadBps || 0, config });
        if (scored.score < config.minScore) {
          skip('below_min_score');
          continue;
        }
        if (!best || scored.score > best.score) {
          best = { symbol, signal: sName, score: scored.score, rewardRisk: scored.rewardRisk, mid: micro.mid, confidence: res.confidence };
        }
      }
      if (best) candidates.push(best);
    }
    summary.candidates = candidates.length;

    // --- smart layer: rank, then enter only the best few ----------------------
    const chosen = rankCandidates(candidates, openSlots);
    for (const c of chosen) {
      if (!config.enableTrading) {
        skip('trading_disabled');
        continue;
      }
      try {
        const order = await adapter.submitOrder({ symbol: c.symbol, side: 'buy', type: 'market', notional });
        positionMeta.set(c.symbol, { entryTsMs: ts, signal: c.signal, entryPrice: c.mid });
        summary.entered++;
        summary.orders.push({ symbol: c.symbol, id: order.id, signal: c.signal, score: +c.score.toFixed(3), notional });
        logger(`ENTER ${c.symbol} via ${c.signal} score=${c.score.toFixed(2)} notional=$${notional}`);
      } catch (e) {
        skip('entry_order_error');
      }
    }
    return summary;
  }

  /** One full pass of the loop: snapshot -> manage exits -> look for entries. */
  async function runOnce() {
    const ts = now();
    const ms = marketState(ts, config);
    let account;
    let positions;
    let openOrders;
    try {
      account = await adapter.getAccount();
      positions = await adapter.getPositions();
      openOrders = await adapter.getOpenOrders();
    } catch (e) {
      const info = describeBrokerError(e);
      diagnostics.recordSkip('broker_error');
      diagnostics.setSafety(true, ['broker_unreachable']);
      lastView = { account: null, positions: [], openOrders: [], brokerOk: false, tsMs: ts };
      diagnostics.recordScan({ ok: false, error: info.message, marketReason: ms.reason });
      return { ok: false, error: info.message, marketState: ms };
    }

    updateDailyAnchor(ts, account);
    diagnostics.recordEquity(account.equity);
    lastView = { account, positions, openOrders, brokerOk: true, tsMs: ts };

    const exits = await reconcileExits({ ts, ms, positions, openOrders });
    const entries = await scanAndEnter({ ts, ms, account, positions, openOrders, closedSymbols: exits.closedSymbols });

    const safety = computeSafetyState(account);
    diagnostics.setSafety(safety.active, safety.reasons);
    diagnostics.recordScan({
      ok: true,
      marketReason: ms.reason,
      canEnter: ms.canEnter,
      shouldFlatten: ms.shouldFlatten,
      evaluated: entries.evaluated,
      candidates: entries.candidates,
      entered: entries.entered,
      exits: exits.exits,
      staleCancelled: exits.staleCancelled,
    });
    return { ok: true, marketState: ms, exits, entries, safety };
  }

  return {
    runOnce,
    scanAndEnter,
    reconcileExits,
    getView: () => lastView,
    _positionMeta: positionMeta, // exposed for tests/diagnostics
  };
}

module.exports = { createEngine, decideExit, sizeNotional, round2 };
