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
  - `gates/costEdge.js` — cost-aware entry gate: projected move must beat modeled round-trip cost.
  - `smart/scoreSetup.js` — composite score + ranking (the "smart" layer).
  - `costs/costModel.js` — single source of truth for trading friction (fees + spread +
    slippage). Backtester and `trade.js` both net through it, so validation and the live
    breaker see identical costs.
  - `safety/circuitBreaker.js` — realized-expectancy breaker (own ledger, not `meta`);
    fed NET pnl bps.
  - `diagnostics/recorder.js` — observational snapshot for `meta` (never gates).
  - `execution/` — Alpaca client + `alpacaEquities`/`alpacaCrypto` adapters returning
    identical shapes; `selectAdapter()` picks by `EXECUTION_VENUE`. The crypto adapter's
    `listAssets()` discovers the full tradable USD-pair universe from `/v2/assets`.
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
- **0.3.0** — Backtester realism: intrabar exit fills. New pure `decideBacktestExit`
  (exported, unit-tested) fills stops/TPs off each bar's high/low — with gap-through-open
  handling and conservative stop-first priority on whipsaw bars — instead of only checking
  the close. This stops the backtest from "escaping" a stop that was pierced mid-bar. Pairs
  with the 0.2.0 cost model so backtest expectancy is honest on both price *and* cost.
- **0.3.2** — Entry-guardrail loosening (paper crypto experiment). With the whole-market
  scan live, ~26 of ~36 crypto candidates/scan were rejected on `spread_too_wide` alone
  (alt books are wider than the 3 blue-chips). Defaults loosened to admit more entries:
  `MAX_SPREAD_BPS` 20→45, `MAX_QUOTE_AGE_MS` 5000→8000, `MIN_CONFIDENCE` 0.55→0.45,
  `MIN_SCORE` 0.50→0.40, and `ACTIVE_SIGNALS` momentum→`momentum,vwap_reversion` (adds
  dip entries). These are global (both engines) and trade selectivity for volume at the
  cost of worse execution — the cost model still nets fees+spread into the scorecard and
  the realized-expectancy circuit breaker (`CB_EXPECTANCY_FLOOR_BPS=-5`) still auto-halts a
  bleeding signal, so the experiment can't silently drain the account. Revert by setting the
  five vars back (20 / 8000→5000 / 0.55 / 0.50 / `momentum`) in env or restoring the defaults.
- **0.3.1** — Whole-market crypto scan. `alpacaCrypto.listAssets()` discovers every active,
  tradable USD-quoted pair from Alpaca's `/v2/assets` feed. New `CRYPTO_UNIVERSE_MODE`
  (default `all`) makes the crypto scan cover the whole market instead of the 3-symbol
  `CRYPTO_UNIVERSE`; `trade.js` resolves the universe per loop behind a
  `CRYPTO_UNIVERSE_REFRESH_SEC` TTL cache and falls back to `CRYPTO_UNIVERSE` (or the last
  good cache) if discovery is empty/unreachable — discovery errors never halt the loop.
  A wider universe widens opportunity, not exposure: the smart layer still enters only
  `MAX_OPEN_POSITIONS` and every gate/breaker is unchanged per symbol. Universe size is
  surfaced observationally at `meta.universe`. `configured` mode restores the old behaviour.
- **0.4.0** — Cost-aware entry gate. New pure, exported `gates/costEdge.js` pushes the
  cost model into the LIVE entry decision (previously costs only shaped the backtest and
  the breaker ledger, never the live gate). A setup's `projectedBps` must beat its modeled
  round-trip cost — using the REAL quoted spread — by `MIN_NET_EDGE_BPS` (default 5) or it
  is skipped as `below_cost_hurdle`. Directly counters the 0.3.2 floor-loosening + whole-
  market crypto + ~50 bps crypto taker fees, which otherwise let the loop enter setups that
  were net-negative before they started.
- **0.5.0** — Reliability fixes (from live paper diagnostics: positions running past
  stops, one symbol stacked ~3x, and a free-tier instance that kept sleeping). (1) EXITS:
  reconcileExits now cancels stale open orders of ANY side (a stuck exit SELL reserves the
  position's qty → `qty_available:0` → the next close errors and the loser runs past its
  stop), and on a close error it cancels that symbol's open orders to free the qty for a
  clean retry next loop. (2) DE-DUP: an entry is skipped when the symbol is already in
  `positionMeta` — set the instant an order is submitted — so a fast-filling crypto order
  can't be re-entered before its position is visible (the ~3x stacking). (3) KEEP-ALIVE:
  optional `KEEPALIVE_URL` self-ping (`KEEPALIVE_SEC`) keeps a free-tier web service awake
  so the loop actually runs 24/7 and the in-memory breaker/scorecard stop resetting — a
  paid always-on host or external cron is the durable fix.
- **0.6.0** — EQUITIES PIVOT (money path) + signal research, driven by real-data
  backtesting. Verdict from measurement, not opinion: **crypto market-order scalping is
  mathematically dead** — on 137k real Alpaca crypto 1m bars the signals' gross edge is
  ~+7 bps/trade but the round-trip taker cost is ~57 bps, so net ≈ −50 bps/trade (PF ~0.3);
  the 0.4.0 cost-edge gate blocks ~80% of fires but survivors are still net-negative
  (it filters on volatility, not realized edge). So: (1) **equities is now primary** —
  `ASSET_CLASS` default already `equities`, `CRYPTO_UNIVERSE_MODE` default reverted `all`→
  `configured` (don't scan the dead crypto market). (2) **Signal findings on 78k real
  equities 1m bars (Yahoo, free/no-auth):** momentum (trend-chasing) has ~ZERO gross edge
  at every exit horizon — a coin flip that only pays the cost (net −6 bps); mean-REVERSION
  is the only family with positive gross edge. New `vwap_reversion_pro` (deeper ≥1.1-ATR
  dislocation + a real prior-bar-high reclaim) lifts win rate 43%→~50% and nets **+8.6
  bps/trade on one basket** — BUT out-of-sample on a different basket it was only +0.9, so
  the edge is **promising, directionally right, NOT yet proven durable** (7-day sample).
  `ACTIVE_SIGNALS` default → `vwap_reversion_pro,vwap_reversion` (reversion-first; momentum
  retired from the default but still available). New signals `trend_pullback` (measured
  WORSE, kept as an off-by-default template) and `vwap_reversion_pro` are registered +
  unit-tested. (3) **New harness `scripts/backtest_equities.js`** grades signals on real
  equities 1m bars via `--source yahoo` (free, no keys, ~7d) or `--source alpaca` (the live
  broker feed, needs paper keys, 30-60d). Run the `alpaca` source once paper keys land to
  confirm/deny the reversion edge out-of-sample before trusting it. 91 tests green.
  NOTE: crypto data endpoints (`/v1beta3/crypto/us/...`) are PUBLIC (no auth), which is how
  the crypto edge was measured with zero credentials; equities data needs keys.
