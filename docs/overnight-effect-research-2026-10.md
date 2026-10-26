# The overnight effect across the US stock market — research, October 2026

**Question.** Buy at the close, sell at the next open. Does it beat realistic trading costs across the
whole US market, consistently, including the last 12 months? Is a 3-month paper trade worth running?

**Short answer: no.** The overnight effect is real *before costs*. Across 2,784 US stocks, the stocks
went up overnight and went nowhere during the day: +8.6% a year from overnight holding against +0.5% from
daytime holding. But the gain is only 2 to 5 basis points (0.02% to 0.05%) a night. A round trip at the
costs below takes 5 to 40 basis points, so every bucket and every rule loses money after costs. None of
50 rule variants made money after costs in the first three years. The only versions that clear costs
need fills that cost almost nothing. They depend on thinly traded small caps and a few very large
overnight jumps, and they fade in the last 12 months. A 3-month paper trade cannot settle the question,
because 63 nights of results carry an error of ±13 to 14 bps a night while the edge being tested is
1 to 7 bps a night.

Data: Nasdaq daily open and close prices, 2021-10-26 to 2026-10-23 (1,254 trading days),
split-adjusted, with cash dividends added back on ex-dates. All figures are equal-weighted across stocks and rebalanced daily.
"NET" means after the per-round-trip costs below. Buy & hold has no daily trading cost.

| Market-cap bucket | Assumed cost per round trip (buy at close + sell at open) |
|---|---|
| $50B+ | 0.05% |
| $10–50B | 0.10% |
| $2–10B | 0.20% |
| $300M–2B | 0.40% |

---

## Tables

### Headline: net overnight return by size, full 5 years vs last 12 months

| Bucket | Overnight gross, CAGR 5y | Overnight NET, CAGR 5y | Overnight NET, last 12m | Buy & hold, last 12m | Gross edge per night (= break-even cost) |
|---|---|---|---|---|---|
| Whole universe | +8.6% | **−39.8%** | **−37.3%** | +19.3% | 3.5 bps |
| $300M–2B | +13.5% | **−58.7%** | **−58.5%** | +33.5% | 5.3 bps |
| $2–10B | +6.8% | **−35.5%** | **−32.8%** | +13.9% | 2.9 bps |
| $10–50B | +5.3% | **−18.1%** | **−11.6%** | +8.5% | 2.3 bps |
| $50B+ | +6.0% | **−6.6%** | **+0.9%** | +15.1% | 2.5 bps |

### T1. Full breakdown — Overnight vs daytime vs hold, equal-weighted, by bucket

| Bucket | Avg names | Cost / round trip | Overnight gross (CAGR 5y) | Overnight NET (CAGR 5y) | Daytime gross (CAGR 5y) | Buy & hold (CAGR 5y) | Gross edge per night = break-even cost | Last 12m: overnight gross | Last 12m: overnight NET | Last 12m: hold |
|---|---|---|---|---|---|---|---|---|---|---|
| All | 2408 | 0.23% | +8.6% | -39.8% | +0.5% | +8.9% | 3.5 bps | +12.7% | -37.3% | +19.3% |
| Cap $0.3-2B | 811 | 0.40% | +13.5% | -58.7% | +2.5% | +16.0% | 5.3 bps | +13.3% | -58.5% | +33.5% |
| Cap $2-10B | 895 | 0.20% | +6.8% | -35.5% | -0.7% | +5.8% | 2.9 bps | +11.0% | -32.8% | +13.9% |
| Cap $10-50B | 485 | 0.10% | +5.3% | -18.1% | -1.2% | +3.8% | 2.3 bps | +13.6% | -11.6% | +8.5% |
| Cap $50B+ | 217 | 0.05% | +6.0% | -6.6% | +1.1% | +7.0% | 2.5 bps | +14.4% | +0.9% | +15.1% |
| Price $5-10 | 192 | 0.35% | +22.7% | -49.0% | +12.3% | +37.1% | 8.5 bps | +25.7% | -48.9% | +68.9% |
| Price $10-20 | 427 | 0.31% | +11.8% | -49.1% | +0.3% | +11.8% | 4.7 bps | +12.5% | -48.7% | +18.9% |
| Price $20-50 | 766 | 0.26% | +7.7% | -44.2% | -0.7% | +6.6% | 3.2 bps | +10.2% | -43.2% | +17.3% |
| Price $50-100 | 495 | 0.19% | +5.5% | -34.5% | +1.0% | +6.3% | 2.4 bps | +11.8% | -31.3% | +16.8% |
| Price $100+ | 528 | 0.13% | +5.3% | -24.5% | -2.3% | +2.8% | 2.3 bps | +12.6% | -18.2% | +10.5% |
| Vol low | 801 | 0.20% | +6.1% | -35.9% | -0.4% | +5.5% | 2.5 bps | +9.0% | -36.1% | +10.6% |
| Vol mid | 801 | 0.23% | +7.1% | -40.3% | +1.9% | +8.8% | 3.0 bps | +10.6% | -37.4% | +18.0% |
| Vol high | 802 | 0.27% | +12.6% | -43.0% | -0.7% | +11.5% | 5.2 bps | +18.3% | -38.7% | +28.5% |

Cap and price buckets are point-in-time (see Method). The Vol buckets are daily terciles of trailing 20-day close-to-close volatility. Last-12-month columns are total returns, not annualized.

### T2. Per year, whole universe: total return in each period (last two rows: last 12 months total, full period CAGR)

| Period | Overnight gross | Overnight NET | Daytime gross | Daytime NET | Buy & hold |
|---|---|---|---|---|---|
| 2021 (from Oct 26) | +3.5% | -6.8% | -4.7% | -14.2% | -1.4% |
| 2022 | -11.2% | -50.7% | -5.7% | -47.6% | -16.5% |
| 2023 | +10.3% | -38.8% | +8.9% | -39.6% | +19.8% |
| 2024 | +24.7% | -30.6% | -7.6% | -48.6% | +14.9% |
| 2025 | +8.2% | -39.9% | +7.1% | -40.5% | +15.7% |
| 2026 YTD | +10.3% | -31.5% | +6.0% | -34.2% | +16.7% |
| Last 12m | +12.7% | -37.3% | +6.0% | -41.1% | +19.3% |
| Full 5y | +8.6% | -39.8% | +0.5% | -44.3% | +8.9% |

### T3. Per year, overnight return by market-cap bucket, gross / NET (total % per period; full period = CAGR)

| Period | Cap $0.3-2B | Cap $2-10B | Cap $10-50B | Cap $50B+ |
|---|---|---|---|---|
| 2021 (from Oct 26) | +3.4% / -14.3% | +3.8% / -5.5% | +3.2% / -1.5% | +3.4% / +1.0% |
| 2022 | -5.1% / -65.3% | -14.3% / -48.2% | -14.2% / -33.3% | -11.9% / -22.3% |
| 2023 | +17.1% / -57.0% | +9.0% / -33.9% | +4.7% / -18.5% | +3.6% / -8.6% |
| 2024 | +32.2% / -51.8% | +23.6% / -25.4% | +17.5% / -8.6% | +19.1% / +5.0% |
| 2025 | +11.9% / -58.9% | +5.8% / -35.8% | +7.0% / -16.7% | +6.4% / -6.1% |
| 2026 YTD | +10.2% / -51.3% | +9.5% / -27.2% | +11.2% / -9.4% | +11.6% / +0.7% |
| Last 12m | +13.3% / -58.5% | +11.0% / -32.8% | +13.6% / -11.6% | +14.4% / +0.9% |
| Full 5y | +13.5% / -58.7% | +6.8% / -35.5% | +5.3% / -18.1% | +6.0% / -6.6% |

### T4. Actionable rules (decided before the close, no look-ahead), whole universe, held overnight only

| Rule | Avg names | Avg cost / round trip | Gross CAGR 5y | NET CAGR 5y | NET max drawdown | NET % positive months | NET Sharpe | Gross edge / night | Last 12m gross | Last 12m NET |
|---|---|---|---|---|---|---|---|---|---|---|
| Universe (all names, EW) | 2408 | 0.23% | +8.6% | -39.8% | -92.0% | 10% | -4.32 | 3.5 bps | +12.7% | -37.3% |
| onmom20 top decile | 241 | 0.25% | +23.4% | -34.7% | -88.1% | 21% | -2.96 | 8.7 bps | +21.6% | -32.2% |
| onmom20 bottom decile | 240 | 0.25% | +1.7% | -45.3% | -95.0% | 10% | -3.91 | 1.1 bps | +11.0% | -40.2% |
| vol20 top decile | 241 | 0.28% | +19.5% | -41.8% | -93.2% | 21% | -2.67 | 7.8 bps | +23.9% | -37.9% |
| vol20 bottom decile | 240 | 0.20% | +6.1% | -35.2% | -88.4% | 0% | -7.46 | 2.4 bps | +9.8% | -35.6% |

Per year, gross / NET (total % per period; full period = CAGR):

| Period | Universe (all names, EW) | onmom20 top decile | onmom20 bottom decile | vol20 top decile | vol20 bottom decile |
|---|---|---|---|---|---|
| 2021 (from Oct 26) | +3.5% / -6.8% | +3.7% / -7.3% | +0.3% / -10.7% | -0.3% / -11.6% | +4.1% / -5.0% |
| 2022 | -11.2% / -50.7% | -4.7% / -50.6% | -24.0% / -58.7% | -26.8% / -62.9% | -0.1% / -43.4% |
| 2023 | +10.3% / -38.8% | +31.2% / -32.4% | +4.4% / -44.2% | +26.7% / -39.7% | +4.9% / -32.7% |
| 2024 | +24.7% / -30.6% | +42.6% / -25.1% | +19.7% / -35.4% | +61.2% / -24.0% | +13.0% / -26.7% |
| 2025 | +8.2% / -39.9% | +34.4% / -27.7% | +3.1% / -44.6% | +37.2% / -33.7% | -0.1% / -37.3% |
| 2026 YTD | +10.3% / -31.5% | +14.4% / -28.4% | +10.9% / -32.8% | +18.6% / -31.9% | +8.9% / -30.5% |
| Last 12m | +12.7% / -37.3% | +21.6% / -32.2% | +11.0% / -40.2% | +23.9% / -37.9% | +9.8% / -35.6% |
| Full 5y | +8.6% / -39.8% | +23.4% / -34.7% | +1.7% / -45.3% | +19.5% / -41.8% | +6.1% / -35.2% |

### T5. Out-of-sample discipline: 50 rule variants ranked on the first 3 years only (NET Sharpe at the stated costs), then the last 2 years untouched

| Rank (in-sample) | Rule | Avg names | In-sample NET CAGR | In-sample NET Sharpe | Out-of-sample gross CAGR | Out-of-sample NET CAGR | OOS NET max DD | Last 12m NET |
|---|---|---|---|---|---|---|---|---|
| 1 | onmom20, cap>=50B, top decile | 22 | -6.3% | -0.41 | +34.6% | +18.6% | -19.8% | +17.6% |
| 2 | onmom20, cap>=50B, top 20 | 20 | -7.0% | -0.47 | +36.5% | +20.4% | -22.6% | +19.8% |
| 3 | vol20, cap>=50B, top 50 | 50 | -9.1% | -0.52 | +26.2% | +11.2% | -23.8% | +14.0% |
| 4 | vol20, cap>=50B, top decile | 22 | -11.7% | -0.53 | +35.7% | +19.7% | -26.5% | +20.4% |
| 5 | vol20, cap>=50B, top 20 | 20 | -11.8% | -0.53 | +39.1% | +22.6% | -26.7% | +22.1% |
| 6 | onmom60, cap>=50B, top 20 | 20 | -8.8% | -0.57 | +21.8% | +7.4% | -22.9% | +1.8% |
| 7 | onmom60, cap>=50B, top decile | 22 | -8.8% | -0.57 | +22.9% | +8.3% | -19.9% | +4.2% |
| 8 | onmom60, cap>=50B, top 50 | 50 | -7.1% | -0.61 | +14.5% | +1.0% | -17.4% | +0.2% |
| 9 | onmom60, cap>=10B, top 20 | 20 | -15.5% | -0.90 | +34.0% | +8.5% | -30.1% | +5.0% |
| 10 | all names, cap>=50B | 217 | -9.2% | -0.92 | +10.6% | -2.5% | -16.2% | +0.9% |

Positive in-sample NET CAGR: 0 of 50 variants.

### T6. Sensitivity: the same grid if fills cost only 0.01% per round trip (auction-only, best case)

| Rank (in-sample) | Rule | Avg names | In-sample CAGR @0.01% | In-sample Sharpe | OOS CAGR @0.01% | OOS max DD | OOS % pos months | Last 12m @0.01% | Gross edge / night (break-even) | Same rule at stated costs, OOS |
|---|---|---|---|---|---|---|---|---|---|---|
| 1 | onmom20, cap<2B, top 20 | 20 | +57.4% | 2.88 | +51.2% | -20.2% | 72% | +29.6% | 19.0 bps | -43.4% |
| 2 | onmom60, cap<2B, top 20 | 20 | +62.1% | 2.86 | +68.5% | -20.7% | 68% | +24.1% | 21.5 bps | -36.9% |
| 3 | onmom20, cap<2B, top 50 | 50 | +40.9% | 2.63 | +43.7% | -17.3% | 72% | +22.2% | 15.4 bps | -46.2% |
| 4 | onmom60, cap<2B, top 50 | 50 | +42.4% | 2.59 | +53.2% | -19.3% | 72% | +22.6% | 16.7 bps | -42.7% |
| 5 | onmom60, all, top 20 | 20 | +61.9% | 2.51 | +83.9% | -17.5% | 76% | +12.0% | 23.3 bps | -4.8% |
| 6 | onmom20, cap<2B, top decile | 82 | +35.7% | 2.46 | +38.8% | -15.6% | 76% | +20.7% | 13.9 bps | -48.1% |
| 7 | onmom60, cap<2B, top decile | 81 | +34.6% | 2.31 | +40.5% | -17.8% | 72% | +18.3% | 13.9 bps | -47.5% |
| 8 | onmom60, all, top 50 | 50 | +37.0% | 2.05 | +55.8% | -18.9% | 76% | +9.1% | 16.3 bps | -17.4% |
| 9 | onmom20, all, top 20 | 20 | +35.9% | 1.69 | +62.9% | -15.4% | 72% | -0.1% | 17.0 bps | -15.9% |
| 10 | onmom20, all, top 50 | 50 | +24.9% | 1.51 | +36.6% | -18.6% | 64% | +7.7% | 11.9 bps | -27.5% |

Per year for the in-sample pick at 0.01% (onmom20, cap<2B, top 20), gross / @0.01% / at stated costs:

| Period | Gross | @0.01% per round trip | At stated costs |
|---|---|---|---|
| 2021 (from Oct 26) | +6.5% | +6.0% | -11.8% |
| 2022 | +35.3% | +31.9% | -50.5% |
| 2023 | +74.4% | +70.1% | -35.8% |
| 2024 | +107.1% | +102.0% | -24.3% |
| 2025 | +45.9% | +42.3% | -46.4% |
| 2026 YTD | +31.8% | +29.1% | -41.8% |
| Last 12m | +32.9% | +29.6% | -51.4% |
| Full 5y | +58.8% | +54.9% | -42.0% |


### T7. Robustness of the best gross edge (small-cap overnight momentum, top 20): what is left once a fund could actually trade it

| Variant (all $300M–2B, top 20 by trailing 20-night overnight return) | In-sample gross CAGR | Out-of-sample gross CAGR | Last 12m gross CAGR | Gross edge / night |
|---|---|---|---|---|
| Baseline (as in T6, rank 1) | +61.4% | +55.0% | +33.0% | 19.5 → 18.3 → 12.0 bps |
| Skip the most recent night in the signal | +51.5% | +53.1% | +20.8% | 17.0 → 17.7 → 8.1 bps |
| + price ≥ $10 | +35.2% | +37.0% | +20.4% | 12.5 → 13.2 → 8.0 bps |
| + 20-day median dollar volume ≥ $5M | +22.6% | +28.7% | +9.2% | 8.7 → 10.8 → 4.2 bps |
| + 20-day median dollar volume ≥ $20M | +14.2% | +31.9% | +14.4% | 6.0 → 11.9 → 6.2 bps |
| **+ price ≥ $10 and dollar volume ≥ $5M (the most tradable version)** | **+20.3%** | **+16.4%** | **+1.6%** | **7.9 → 6.7 → 1.2 bps** |

The most tradable version at different costs per round trip (CAGR):

| Period | Gross | @0.01% | @0.05% | @0.10% | @0.40% (stated small-cap cost) |
|---|---|---|---|---|---|
| In-sample (3y) | +20.3% | +17.3% | +6.1% | −6.5% | −56.2% |
| Out-of-sample (2y) | +16.4% | +13.5% | +2.6% | −9.5% | −57.6% |
| Last 12 months | +1.6% | −1.0% | −10.5% | −21.1% | −63.0% |

Where the baseline's edge comes from: of 25,080 position-nights, the median overnight return was
**0.0%**, 48% were winners, and dropping the best 1% of nights cuts the average from **19.0 bps to
1.7 bps**. The picks were thinly traded: median price $14 and median dollar volume $4M a day.

---

## Verdict

**No version clears realistic costs consistently, including the last 12 months.**

1. **The effect is real but small.** Almost all of the market's 5-year return came overnight (T2),
   as Cooper, Cliff & Gulen and Lou, Polk & Skouras report. In 2024 the universe made +24.7% overnight
   and −7.6% during the day. But the average stock gains only 2 to 5 bps a night, and that is the
   most you could pay per round trip and still break even. At the stated costs, every size, price and
   volatility bucket loses 6% to 59% a year (T1).
2. **The "actionable" rules have a real gross edge but lose after costs.** Holding the top decile by
   trailing 20-night overnight return makes +23.4% a year gross against +1.7% for the bottom decile,
   so overnight momentum exists, as Lou, Polk & Skouras find. After costs it loses −34.7% a year. The
   top volatility decile likewise makes +19.5% gross and −41.8% net (T4).
3. **The out-of-sample test rejects everything.** Ranked on the first three years at the stated
   costs, **0 of 50 variants made money**. The least-bad variant was the top decile by overnight momentum among
   $50B+ stocks (−6.3% a year in-sample). Untouched, it then made +18.6% a year out-of-sample and
   +17.6% in the last 12 months. That is a recent mega-cap regime that nothing in the first three years
   predicted, not a validated rule (T5).
4. **It only works with near-free fills, and then only in thin small caps.** With costs of 0.01% a round trip
   (filling at exactly the printed closing and opening auction prices), small-cap overnight momentum
   looks spectacular: +57% in-sample and +51% out-of-sample (T6). But the edge is concentrated in
   stocks trading about $4M a day, comes from the best 1% of nights, and falls from 19 to 12 bps a night in the last 12 months. Once
   restricted to names a $10k+ account could trade reliably, it is 7 bps a night and **1.2 bps in the
   last 12 months**. That is negative even at 0.01% costs (T7).
5. **A 3-month paper trade cannot answer the question.** The daily return of a 20-name overnight
   portfolio has a standard deviation of about 100–110 bps. Over 63 nights, the error on the average is
   **±13–14 bps a night**, while the edge being tested is 1–7 bps a night. You would need several years of
   nights to tell it from zero. The one unknown that matters is whether real opening and closing
   auction fills match the printed prices in thin small caps. Alpaca's paper engine simulates fills and
   does not model auction imbalances, slippage or market impact, so it cannot measure that.

**Recommendation: do not run the overnight paper trade as a profit test.** If you ever want to test the
one open question (auction fill quality), it needs a small **live** test that logs each fill against
the official opening and closing prints, not a paper trade. Even if fills turn out perfect, the
backtest above says the tradable version made about nothing in the last 12 months.

For the record, the rule such a fill-quality test would run is:
- Universe: US common stocks from the Nasdaq screener, $300M–2B estimated market cap, price ≥ $10, 20-day
  median dollar volume ≥ $5M, excluding aerospace, defense, space and RKLB.
- Signal: the sum of log overnight returns over the last 20 nights, including today's open. It is known by
  9:30 ET and computed before 3:45 ET.
- Positions: the top 20, equal-weighted, whole shares.
- Orders: a buy with `time_in_force: "cls"` submitted before 3:50 ET, and a sell of the full position
  the next morning with `time_in_force: "opg"` submitted before 9:28 ET. Alpaca rejects `cls` after
  3:50 ET and `opg` after 9:28 ET.
- Log per name per night: the fill price vs the official close or open print, and the quoted spread at
  submission.

---

## Method

1. **Universe.** I downloaded the Nasdaq stock screener (6,938 rows, 2026-10-26) and kept common stocks
   with last price ≥ $5 and market cap ≥ $300M. Removed: warrants, rights, units, preferreds,
   notes and bonds, closed-end funds and trusts, ADRs (their home market trades overnight), SPACs
   ("Acquisition Corp") and LP units. That left **2,882**. After the exclusions below, **2,794**. Of
   those, **2,784** had at least 30 days of history (10 very recent listings dropped: ACCV ADRX CTY ETRA IAM
   LYCA OIG RZAI TRXB VYLR). On a typical day about 2,400 names were eligible, because later IPOs enter
   when they list.
2. **Exclusions** (Rocket Lab employee and no-military rule): all of Nasdaq's industries
   *Aerospace*, *Military/Government/Technical* and *Ordnance And Accessories* (53 names), plus 35 named
   defense, space and ammunition companies classified elsewhere.
   - *Aerospace:* AIR ASR AVAV AVEX BA BETA CAAP EMBJ HEI HON HONA PAC RTX SARO TATT TXT.
   - *Military/Government/Technical:* AADX ACM ARXS ATRO CDNL DCO ESLT FER FLR FLY GVA J KBR KRMN KTOS
     LEGO LMT LOAR MG MWH ORN PKE RDW **RKLB** ROAD STN STRL TDG TTEK VOYG VSEC WLDN YSS.
   - *Ordnance:* AXON NPK RGR SWBI.
   - *Manual:* ASTS BAH BKSY BWXT CACI CW DRS ECHO GD GE GILT GSAT HII HWM HXL IRDM LDOS LHX LUNR MDA
     MRCY NOC OLN ONDS PL PLTR PSN SAIC SPCX SPIR TDY UMAC VSAT VVX WWD.
   - Nasdaq's industry tags also catch some construction and engineering firms (ACM, J, FLR, ROAD,
     STRL, GVA, TTEK) and airport operators (ASR, PAC, CAAP). I excluded them anyway rather than
     second-guess the tags.
3. **Prices.** Nasdaq `api/quote/<T>/historical` returned 5 years of daily open, high, low and close for
   all 2,794 tickers, with no failures. Requests ran with 5 concurrent workers and retries with backoff,
   so no sampling was needed. Prices are split-adjusted (checked on NVDA's June 2024 10:1 split). They
   are not dividend-adjusted, so cash dividends from `api/quote/<T>/dividends` (9,623 ex-dates) are added
   to the ex-date's overnight return: buying at the prior close entitles you to the dividend.
4. **Returns.** Overnight = (open_t + dividend_t) / close_{t−1} − 1. Daytime = close_t / open_t − 1.
   Hold = close-to-close including dividends. Single-stock moves are clipped to [−60%, +100%] per leg
   (210 of about 1.1M stock-day legs) to blunt bad prints.
5. **Buckets, point-in-time.** The market cap for a past date is estimated as today's cap × (that day's
   close ÷ today's close), assuming constant shares. A night's bucket, price, volatility and cost are
   taken from data through the close two sessions before the morning the position is sold, i.e. known
   before the buy. Each day a stock must also have price ≥ $5 and estimated cap ≥ $300M to count.
6. **Actionable rules.** These are decided on day *d* before the 3:50 ET closing-auction cutoff, and
   held from close *d* to open *d+1*.
   - `onmom20` / `onmom60`: the sum of log overnight returns over the last 20 or 60 nights, through
     the open of day *d*.
   - `vol20`: the standard deviation of 20 daily close-to-close returns through close *d−1*.
   - Positions: the top or bottom decile each day, or the top 20 or 50 names, equal-weighted.
7. **Costs.** Each night is one round trip, charged at the bucket cost of each name held. "Gross edge
   per night" is the average nightly gross return, which equals the break-even cost per round trip.
8. **Out-of-sample discipline.** There are 50 variants: 3 signals × 5 universes (all, ≥$2B, ≥$10B,
   ≥$50B, <$2B) × 3 sizes (decile, top 50, top 20), plus 5 plain universes. All were ranked by NET
   Sharpe on **2021-10-26 → 2024-10-25** only. Results for **2024-10-28 → 2026-10-23** are reported
   untouched. The selection was repeated with 0.01% costs as a best-case sensitivity check. The last 12
   months are **2025-10-24 → 2026-10-23**.
9. **Metrics.** CAGR uses 252 nights a year. Max drawdown is measured on the compounded net equity
   curve. "% positive months" counts calendar months with a positive compounded return. Sharpe is
   annualized from daily returns, with zero risk-free rate.

## Assumptions

- **Costs** are the requested bucket costs (0.05/0.10/0.20/0.40% per round trip). They stand for the
  spread, impact and auction slippage of a small account. Explicit costs at Alpaca are about 0.003%
  (no commission; SEC and FINRA sell fees). A fill at exactly the official auction price costs no
  spread, which is why the 0.01% best case is shown. Whether thin small caps really fill at the
  printed open and close is the open question.
- Every name is assumed to fill in full at the printed open and close, whatever the size.
- No borrowing, no leverage, no interest on idle cash.
- No taxes. Every gain would be short-term.

## Caveats (read these before trusting any positive number)

- **Survivorship bias.** The universe is *today's* listed stocks with price ≥ $5 and cap ≥ $300M.
  Companies that were delisted, acquired or collapsed below those levels in the past five years are
  missing. That inflates small-cap and low-price results most, and early years more than recent ones;
  note the $5–10 price bucket's +37% a year buy & hold. It also biases the momentum and volatility
  rules upward, because hyped small caps that later crashed are missing, often after dilutive
  offerings announced after the close, which are overnight losses. The last 12 months are the least
  affected, and that is where the edge is weakest.
- **Price quality.** It is not verified that Nasdaq's "open" equals the official opening-auction price
  for NYSE-listed names; it may be the first trade. In thin stocks the first print can sit at the ask,
  and that is exactly where the small-cap edge lives.
- **Market cap** for past dates assumes constant shares outstanding (buybacks and issuance ignored).
- **Multiple testing.** 50 variants plus a cost sensitivity were tried. The best in-sample number of
  any search like this is biased upward, which is why only the untouched out-of-sample result counts.
- **Daily-rebalanced equal weighting** of small caps gains from bid-ask bounce. That is another reason
  the gross small-cap figures are an upper bound.
- **The window** covers one bear year (2022), one mega-cap rally (2023–2026) and no crash like March 2020.

## Sources

- Lou, D., Polk, C., Skouras, S. (2019). "A tug of war: Overnight versus intraday expected returns."
  *Journal of Financial Economics* 134(1), 192–213. Momentum profits accrue overnight, and stocks with
  high past overnight returns keep earning them (the persistence the `onmom` rules try to use).
- Cooper, M. J., Cliff, M. T., Gulen, H. (2008). "Return differences between trading and non-trading
  hours: Like night and day." Working paper, SSRN 1004081. Most US equity returns accrue overnight.
- Kelly, M. A., Clark, S. P. (2011). "Returns in trading versus non-trading hours: The difference is day
  and night." *Journal of Asset Management* 12, 132–145.
- Berkman, H., Koch, P. D., Tuttle, L., Zhang, Y. J. (2012). "Paying attention: Overnight returns and
  the hidden cost of buying at the open." *Journal of Financial and Quantitative Analysis* 47(4),
  715–741. Attention-driven buying at the open lifts opening prices, which then reverse during the day.
  This is why the edge clusters in high-attention, thinly traded names.
- Alpaca Trading API documentation, orders: `time_in_force` `opg` (opening auction only, rejected
  9:28–19:00 ET) and `cls` (closing auction only, rejected 15:50–19:00 ET), and the notes on paper
  trading's simulated fills.
- Data: Nasdaq screener `api.nasdaq.com/api/screener/stocks` (2026-10-26), `api/quote/<T>/historical`
  and `api/quote/<T>/dividends`.
- Prior single-name work in this session: RKLB over 5 years compounded +2,040% overnight-only against
  −76% daytime-only and +404% buy & hold, before costs; RKLB is excluded here.
