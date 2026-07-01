# CLAUDE.md — architecture & decision changelog

Keep this current as the app evolves. It is the fast-path context for any future
Claude/coworker session.

## What this is

MoreMagic is a **paper-first smart day trader** on Alpaca: a Node 22 + Express backend
(the core deliverable), an Expo read-only dashboard, and a zero-dep MCP diagnostics server.
It mirrors the "Magic" scalper's structure but trades intraday swings (minutes–hours,
flat by EOD), driven by pure technical signals + a smart scoring layer.

## Guiding principle

> Pure modules do the math; `trade.js` wires them; nothing trades on un-validated config;
> diagnostics are observational and never gate trades.

## Backend map

- `index.js` — Express app, `/health` `/dashboard` `/debug/logs`, scheduled loop, boot.
- `trade.js` — `createEngine()`: the 4-step `scanAndEnter` + `reconcileExits` + dispatch.
- `auth.js` — optional Bearer / x-api-key middleware (health stays public).
- `config/` — `liveDefaults.js` (tunables + rationale), `bootstrapLiveEnv.js` (fill env +
  SAFETY_OVERRIDES), `validateEnv.js` (typed, range-checked, asset/venue-aware, paper-allowed),
  `liveDefaults.test.js` (locks safety defaults).
- `modules/`
  - `indicators/` — EMA/RSI/MACD/VWAP/ATR (pure).
  - `signals/` — `momentumSignal`, `vwapReversionSignal` to the `evaluateXxxSignal` contract.
  - `gates/` — `marketHours` (session/EOD), `pdt`, `microstructure` (spread+freshness).
  - `smart/scoreSetup.js` — composite score + ranking (the "smart" layer).
  - `costs/costModel.js` — single source of truth for trading friction (fees + spread +
    slippage). Backtester and `trade.js` both net through it, so validation and the live
    breaker see identical costs.
  - `safety/circuitBreaker.js` — realized-expectancy breaker (own ledger, not `meta`);
    fed NET pnl bps.
  - `diagnostics/recorder.js` — observational snapshot for `meta` (never gates).
  - `execution/` — Alpaca client + `alpacaEquities`/`alpacaCrypto` adapters returning
    identical shapes; `selectAdapter()` picks by `EXECUTION_VENUE`.
  - `backtest.js` — pure replay backtester + synthetic bar generator.
  - `logger.js` — ring buffer for `/debug/logs`.
- `scripts/` — `smoke`, `preflight`, `env_audit`, `backtest_strategy`, `reconcile`,
  `install_git_hooks`.

## The signal contract (copy exactly for new signals)

```
evaluateXxxSignal({ symbol, bars1m, bars5m?, config }) ->
  { ok:true, reason, confidence /*0..1*/, projectedBps, volatilityBps, side, ... }
| { ok:false, reason }
```

Pure ⇒ trivially unit- and back-testable. Register in `modules/signals/index.js` and add
the name to `KNOWN_SIGNALS` in `validateEnv.js`.

## Decisions already made (do not re-litigate)

- **Asset class:** both, configurable via `ASSET_CLASS` + an execution-adapter abstraction.
  Alpaca is the primary broker; adapters normalize equities & crypto to one shape.
- **Trading mode:** paper-first. `validateEnv` *allows* paper (the opposite of Magic) and
  gates live behind `ALLOW_LIVE=true` + the live base URL.
- **Loop shape:** the deliberately-simple 4-step `scanAndEnter` (not a 25-gate monster).
- **Exits:** active management in `reconcileExits` (TP / stop / max-hold / EOD flatten /
  stale-entry cancel) — uniform across venues.
- **Diagnostics iron rule:** `meta` is observational; safety gating lives in the breaker +
  gates, which keep their own inputs.
- **Costs are modeled, once:** all trade P&L is netted through `costs/costModel.js`
  (fees + spread + slippage). The backtester nets its expectancy and the circuit-breaker
  ledger records NET bps, so the validation gate and the live safety net can never diverge
  on cost. Equities are commission-free; crypto's ~0.25%/side taker fee is the dominant
  real cost. Follow-up (not yet wired): an exact realized-fee ledger from the Alpaca
  activities feed — plumbing exists (`normalizeActivity`, `sumFeesUsd`), enforcement is TODO.

## Changelog

- **0.1.0** — Initial build. Milestones 1–5: skeleton + deploy path, Alpaca paper adapter
  (equities + crypto), momentum + VWAP-reversion signals wired into the loop with
  TP/stop/max-hold/EOD + market-hours + PDT gates, pure backtester + diagnostics surface,
  smart scoring layer + realized-expectancy circuit breaker. Full `node --test` suite green;
  `smoke` + `preflight` pass. Paper is the default; live is a single deliberate config change.
- **0.2.0** — Trading-cost model. New pure `costs/costModel.js` (fees + spread + slippage,
  venue-aware) nets both the backtester and the circuit-breaker ledger; backtest reports
  gross + net + round-trip cost and gates on NET expectancy; `validateEnv` requires
  `REQUIRE_BACKTEST_VALIDATION=true` in live mode; `normalizeOrder` captures real fill
  data and `normalizeActivity`/`sumFeesUsd` add fee-ledger plumbing. 70 tests green.
