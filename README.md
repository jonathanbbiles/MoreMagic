# MoreMagic — Smart Day Trader

A **paper-first**, intraday day-trading bot for US equities (and crypto, configurable)
on **Alpaca**. It mirrors the proven structure of the "Magic" crypto scalper but with a
different brain: fewer, higher-quality positions held minutes-to-hours, **flat by end of
day**, driven by technical signals and a "smart" scoring layer that ranks and sizes setups.

> Trading mode defaults to **paper**. Promoting to live is a single, deliberate config
> change — and only after the strategy validates on paper.

## Repo layout

```
MoreMagic/
├── backend/      # Node 22 + Express trading engine (the core deliverable)
├── Frontend/     # Expo / React Native read-only dashboard
├── mcp/          # Zero-dep MCP diagnostics server (+ .mcp.json at root)
├── docs/         # Strategy + architecture docs
├── .git-hooks/   # pre-commit hook blocking committed secrets
├── .mcp.json     # registers the MCP server
├── CLAUDE.md     # architecture + decision changelog
└── README.md
```

## Quick start (backend)

```bash
cd backend
cp .env.example .env          # fill in your Alpaca PAPER keys
npm install                   # also installs the git pre-commit secret hook
npm test                      # unit + integration tests (node --test)
npm run smoke                 # boots the app, checks /health + /dashboard
npm run preflight             # offline pre-deploy gate (config + safety + files)
npm start                     # runs the server + strategy loop on :3000
```

Backtest a signal on synthetic (offline) or live bars:

```bash
npm run backtest -- momentum --bars 1000 --seed 11
node scripts/backtest_strategy.js vwap_reversion --live --symbol AAPL
```

## Quick start (dashboard)

```bash
cd Frontend
npm install
EXPO_PUBLIC_BACKEND_URL=http://localhost:3000 npx expo start
```

The dashboard is **read-only**: status banner, equity + P&L, engine + safety-brake tiles,
positions, and diagnostics. Every figure is a real `/dashboard` field; missing values
render `—`, never a fake `0`.

## Endpoints

| Route          | Auth | Returns |
|----------------|------|---------|
| `GET /health`  | public | liveness + mode/asset/venue |
| `GET /dashboard` | optional token | `{ ok, ts, version, account, positions, meta }` |
| `GET /debug/logs?n=` | optional token | recent log tail |

`meta` is **observational only** — no live trade decision ever reads from it.

## Key configuration

All tunables live in `backend/config/liveDefaults.js` (each with a rationale comment) and
are validated/range-checked by `backend/config/validateEnv.js`. Override any of them via
the environment. The most important:

| Variable | Default | Meaning |
|----------|---------|---------|
| `TRADING_MODE` | `paper` | `paper` or `live` (live needs `ALLOW_LIVE=true` + live URL) |
| `ASSET_CLASS` | `equities` | `equities` or `crypto` (selects the adapter + gates) |
| `ACTIVE_SIGNALS` | `momentum` | `momentum`, `vwap_reversion`, or a comma list |
| `POSITION_SIZING_PCT` | `0.10` | fraction of equity per entry, clamped to cash |
| `MAX_OPEN_POSITIONS` | `4` | the smart layer keeps only the best few setups |
| `TAKE_PROFIT_BPS` / `STOP_LOSS_BPS` | `120` / `80` | exit targets (basis points) |
| `MAX_HOLD_MINUTES` | `180` | intraday max hold before forced exit |
| `EOD_FLATTEN_ET` / `ENTRY_CUTOFF_ET` | `15:55` / `15:30` | session controls (equities) |
| `MAX_DAILY_LOSS_PCT` | `0.03` | per-day loss kill-switch |
| `SCAN_INTERVAL_SEC` | `30` | how often the loop runs |
| `API_TOKEN` | _(empty)_ | optional Bearer / x-api-key for the dashboard |

Alpaca credentials are **required** and never defaulted: `APCA_API_KEY_ID`,
`APCA_API_SECRET_KEY`. See `backend/.env.example`.

## Safety guardrails

- **Realized-expectancy circuit breaker** — halts new entries for a signal whose recent
  closed trades bleed below an expectancy floor (its own ledger, not `meta`).
- **Per-day max-loss kill-switch**, **market-hours gate**, **EOD flatten**, **PDT
  day-trade counter** (equities under $25k), **spread + quote-freshness gates**.
- **Backtest validation gate** — optional min-expectancy-over-samples bar before a signal
  is allowed to trade.
- **Config can't drift** — `liveDefaults.test.js` locks safety defaults; `npm run env:audit`
  proves every documented env var is read in code.
- **No secrets in git** — `.git-hooks/pre-commit` blocks broker keys / tokens / `.env` files.

## Deploy (Render)

The backend ships as a container: `backend/Dockerfile` on `node:22-alpine` with `tini` as
PID 1, a non-root user, `npm ci --omit=dev`, port `3000`, entrypoint `node index.js`. Point
Render at `backend/Dockerfile` and set the env vars (start from `.env.production.example`).
No `render.yaml` needed.

## Paper → live

1. Run on **paper** until the closed-trade scorecard is convincingly positive.
2. Then, deliberately: `TRADING_MODE=live`, `ALLOW_LIVE=true`,
   `ALPACA_TRADING_BASE_URL=https://api.alpaca.markets`, and live keys.
`validateEnv` refuses live unless all of those line up.

See [`docs/STRATEGY.md`](docs/STRATEGY.md) and [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).
