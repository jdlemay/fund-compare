# Long-Term Fund Compare

A phone-friendly page for comparing ETFs, index mutual funds and TSP funds over 1, 5, 10, 15 and 20 years.
**Historical data only. This is not investment advice.**

## What's in it

- **Funds:** 135 ETFs and index funds from Vanguard, iShares, SPDR, Schwab, Fidelity, T. Rowe Price and others.
  Each shows average yearly return per period, fee, worst calendar year, biggest drop and volatility.
  Tap a fund for a growth chart and its year-by-year returns.
- **TSP:** every TSP fund (G, F, C, S, I, all L funds) next to the outside funds that track the same index.
  Enter your allocation in percent to see how that mix did. "Copy link" shares the mix; nothing is stored online.
- **Calculator:** a starting amount plus a monthly addition, for up to 4 funds, TSP funds or sample mixes.
- **Sample mixes:** textbook stock/bond splits (0–100% stocks) and how each performed.

## How it updates

`.github/workflows/update.yml` runs every weekday evening on GitHub's servers. It runs
`scripts/update-data.mjs`, which downloads price history (dividends reinvested) from Yahoo Finance
and official share prices from tsp.gov, writes `docs/data/*.json`, commits it, and republishes the site.
If a source is down, the site keeps the previous day's data. To refresh by hand: **Actions → Update data and
publish → Run workflow**.

To add or remove a fund, edit `scripts/funds.mjs`.

## Run it locally

```
node scripts/update-data.mjs
node scripts/serve.mjs      # http://localhost:8810
```

Data: Yahoo Finance (unofficial) and tsp.gov. Figures can contain errors. Check a fund's own site before acting.
