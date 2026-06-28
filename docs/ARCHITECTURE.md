# Architecture

## Boot

`index.js` → `dotenv` → `bootstrapLiveEnv()` (fill `process.env` from `liveDefaults` only
where unset, then apply `SAFETY_OVERRIDES`) → `validateEnv()` (throws ⇒ process exits, so
nothing runs on bad config) → `selectAdapter()` → `createEngine()` → Express listens and a
timer drives `engine.runOnce()` every `SCAN_INTERVAL_SEC`.

## The loop (`trade.js`)

`runOnce()` does: snapshot (account/positions/orders) → `reconcileExits` → `scanAndEnter`.

**`scanAndEnter` (4 steps):**
1. **Determine signal / brakes** — bail if the market is closed/at cutoff, or the daily-loss
   kill-switch is tripped.
2. **Size + universe** — `notional = clamp(equity × sizing%, cash)`; compute open slots;
   apply the PDT gate; exclude symbols already held or in-flight.
3. **Per-symbol eval** — fetch 1m+5m bars + quote → microstructure gate (spread/freshness) →
   evaluate each active signal (skip if its circuit breaker is tripped) → confidence floor →
   smart score → keep the best signal per symbol.
4. **Smart layer** — rank candidates, enter only the top `MAX_OPEN_POSITIONS - open` via
   market orders sized by `notional`.

**`reconcileExits`** — cancel stale unfilled entries; for each position compute P&L bps and
held minutes and exit on `eod_flatten` > `stop_loss` > `take_profit` > `max_hold`. Closed
trades feed the diagnostics scorecard **and** the circuit breaker's ledger.

## Venue dispatch

`modules/execution/selectAdapter(config)` returns `alpacaEquities` or `alpacaCrypto`. Both
expose `getAccount / getPositions / getOpenOrders / getBars / getLatestQuote / submitOrder /
cancelOrder / closePosition` returning identical normalized shapes (see `normalize.js`), so
signals and the loop never branch on venue. Equities use the stocks data endpoints + `day`
TIF; crypto uses the v1beta3 crypto endpoints + `gtc` TIF.

## Diagnostics vs safety (the iron rule)

`diagnostics/recorder.js` builds the observational `meta` (scorecard, skip histogram, signal
state, equity series, safety mirror, last scan). **No trade decision reads from it.** Safety
gating reads from the gate functions and the circuit breaker's own ledger.

## Testing

`node --test` runs co-located `*.test.js`. Pure modules are unit-tested directly; `trade.js`
is tested with a mock adapter + fixed clock; `index.js` with an ephemeral-port HTTP server.
`smoke` boots the app (no broker, no loop) and checks the endpoints; `preflight` runs an
offline config/safety/file gate.
