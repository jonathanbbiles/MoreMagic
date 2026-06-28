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
  - `safety/circuitBreaker.js` — realized-expectancy breaker (own ledger, not `meta`).
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

## Changelog

- **0.1.0** — Initial build. Milestones 1–5: skeleton + deploy path, Alpaca paper adapter
  (equities + crypto), momentum + VWAP-reversion signals wired into the loop with
  TP/stop/max-hold/EOD + market-hours + PDT gates, pure backtester + diagnostics surface,
  smart scoring layer + realized-expectancy circuit breaker. Full `node --test` suite green;
  `smoke` + `preflight` pass. Paper is the default; live is a single deliberate config change.
