# aINVEST — AI-Powered Live Market Terminal for All Stocks & IPOs

Real-time multi-ticker financial terminal giving users **identical live War Rooms across all 7,290+ US stocks, ETFs, recent & upcoming IPOs (NASDAQ, NYSE, AMEX), and 24/7 Hyperliquid HIP-3 markets** — plus direct launch for any custom ticker symbol.

## Key Features

- **5-Pillar Cross-Signal Confluence Engine** (aINVEST's core idea): scores every ticker across `TECH` + `WHALE` (options flow / dealer GEX) + `INSIDER` (Congress, SEC Form 4 clusters, FINRA short squeeze) + `24/7` (Hyperliquid perps) + `CATALYST` (earnings & macro countdowns, implied moves) and shows the evidence behind each pillar. Lives at the top of every War Room, with a **Confluence Screener** (smart-money presets) in the Explorer modal and 1-click PNG export.
- **News Front Page**: Yahoo-Finance-style editorial landing page with live breaking stock news (CNBC Markets/Tech & Yahoo Finance RSS + TradingView Live Wire), auto-extracted clickable stock quote pills, 5-benchmark Market Pulse sparklines, Trending Tickers, live Market Movers (Active / Gainers / Losers), IPO Spotlight, and persistent Watchlist.
- **Universal Market & IPO Coverage**: Search and open **any** US stock, ETF, recent 2025–2026 IPO (`ANT`, `SPCX`, `SKHY`, `CBRS`, `CRWV`, `BSP`, `CRCL`, `CHYM`, `VVVV`, `WWB`, `RZRA`), upcoming IPO (`NSCL`), or 24/7 Hyperliquid HIP-3 market across all discovered builder DEXes — or type any custom symbol directly.
- **All Stocks & IPOs Explorer + Pinned Watchlist**: Browse & filter thousands of listings by IPO status, Exchange (`NASDAQ` / `NYSE` / `AMEX`), Sector, or 24/7 Live Perps, and pin (`★`) any stock or IPO to your persistent War Room switcher bar.
- **Daily Bread — AI Day-Trade Calls**: Dedicated AI day-trade call desk (`DAILY BREAD` tab, compact preview on Markets front page, and single-ticker card in every War Room) combining live `5m / 15m / 1h` candles, Session VWAP, EMA 9/21/50, RSI(14), MACD, Bollinger Bands, ATR risk sizing, volume surges, and breaking news catalysts into structured `LONG` / `SHORT` / `WAIT` setups with Entry Zone, TP1, TP2, Stop Loss, R:R ratio, and instant any-ticker AI scan.
- **Unified Live Streaming Charts**: Native `lightweight-charts` v5 candlesticks (`1m`, `5m`, `15m`, `30m`, `1h`, `4h`, `1D`) with `VWAP`, `EMA 9/21`, `RSI(14)`, volume histogram, IPO/Prev-Close reference lines, 0-delay Hyperliquid WebSocket streaming for 24/7 markets, live intraday exchange feeds for all stocks/IPOs, and automatic TradingView fallback.
- **aINVEST Quantitative AI Brief & IPO Tracker**: Live multi-timeframe regime classification, conviction score (`0–100`), VWAP/EMA structure, Hyperliquid funding/OI or exchange volume/52W flow reads, clickable breakout/support levels, and IPO deal terms / staggered S-1 lock-up countdowns.
- **Universal 7-Timeframe Technical Consensus Gauge**: Real-time 17-indicator Moving Averages + Oscillators speedometer across `1m`, `5m`, `15m`, `30m`, `1h`, `4h`, and `1D` intervals for every stock & IPO, with seamless TradingView Technical Analysis fallback.
- **Valuation & P&L Calculator + Isolated Floor Chat**: Auto-computed implied market cap across all US equities & IPOs, position P&L simulator, and zero-login per-ticker Nostr chat rooms & Bull/Bear sentiment polls (`?ticker=SPCX`).
- **Slate & Daylight Themes**: Bright-edged charcoal dark mode and crisp warm-paper light mode synced across UI, charts, and gauges, fully responsive across desktop and mobile phones.

## Development

```bash
npm install
npm run dev
```

## Production Build

```bash
npm run build
```

## Testing

```bash
npm run lint   # oxlint
npm test       # vitest: pricing, alerts, catalysts, CBOE parsing, confluence engine
```

Lint and unit tests run in CI before every GitHub Pages deploy.

## Data Sources & Known Limits

aINVEST is a zero-backend static app (GitHub Pages + GitHub Actions snapshots + live browser feeds).
Several free public feeds (Yahoo, CBOE delayed options, RSS) are fetched from the browser through
free CORS relays, so individual pillars can be temporarily unavailable or delayed. GitHub Actions
runners are currently blocked by CBOE (HTTP 403), so options/GEX data is fetched live in the browser.
Signals are rules-based (technical indicators, flow thresholds, news keywords) and are for
informational purposes only — not investment advice.
