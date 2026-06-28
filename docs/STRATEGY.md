# Strategy

MoreMagic is a **long-only intraday** day trader. The architecture is fixed; the exact entry
/exit math is intentionally tunable and meant to be backtested and iterated.

## Signals (pure functions)

- **momentum** — enter when the higher-timeframe trend is up (EMA fast > slow on 5m), price
  leads its intraday VWAP, MACD histogram is positive on 1m, and RSI is strong-but-not-blown.
  Confidence blends trend strength, VWAP lead, an RSI sweet-spot, and short-term momentum.
- **vwap_reversion** — buy controlled dips: price stretched ≥ N ATRs below VWAP, RSI oversold
  but curling up, and not in a structural downtrend. Targets the snap back toward VWAP.

Both emit `{ ok, reason, confidence, projectedBps, volatilityBps, side }` and never touch the
network or clock, so they are unit- and back-testable.

## Sizing & selection (the smart layer)

Each scan, candidates that pass the gates are scored by a composite of confidence, projected
move, reward:risk vs the stop, and a spread-cost penalty. Only the best few (up to
`MAX_OPEN_POSITIONS`) are entered, sized by `POSITION_SIZING_PCT` of equity (clamped to cash).

## Exits (day-trader horizon)

Take-profit (`TAKE_PROFIT_BPS`), hard stop (`STOP_LOSS_BPS`), max-hold (`MAX_HOLD_MINUTES`),
and an **end-of-session flatten** so equities are never held overnight. Unfilled entry orders
are cancelled after `STALE_ENTRY_TIMEOUT_SEC`.

## Risk discipline

- Realized-expectancy **circuit breaker** halts a bleeding signal.
- **PDT** awareness caps day-trades for equity accounts under $25k.
- **Daily max-loss** kill-switch halts new entries after a bad day.
- **Market-hours** gate (09:30–16:00 ET, holidays/weekends respected).

## Validating before live

Use `npm run backtest -- <signal>` to grade a signal (synthetic or `--live` bars). The
optional validation gate (`REQUIRE_BACKTEST_VALIDATION`) requires a minimum expectancy over a
minimum sample before a signal is allowed to trade. Promote to live only after the **paper**
closed-trade scorecard is convincingly positive.
