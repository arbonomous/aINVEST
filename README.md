# aINVEST — AI-Powered Live Market Terminal for All Stocks & IPOs

Real-time multi-ticker financial terminal giving users **identical live War Rooms across all 7,290+ US stocks, ETFs, recent & upcoming IPOs (NASDAQ, NYSE, AMEX), and 24/7 Hyperliquid HIP-3 markets** — plus direct launch for any custom ticker symbol.

## Key Features

- **Markets & Breaking Stock News Front Page**: Yahoo-Finance-style editorial landing page with live breaking stock news (aggregating CNBC Markets/Tech & Yahoo Finance RSS feeds + TradingView Live Wire), auto-extracted clickable stock quote pills on every story, 5-benchmark Market Pulse sparklines, Trending Tickers, live Market Movers (Active / Gainers / Losers), IPO Spotlight, and persistent Watchlist.
- **Universal Market & IPO Coverage**: Search and open **any** US stock, ETF, recent 2025–2026 IPO (`ANT`, `SPCX`, `SKHY`, `CBRS`, `CRWV`, `BSP`, `CRCL`, `CHYM`, `VVVV`, `WWB`, `RZRA`), upcoming IPO (`NSCL`), or 24/7 Hyperliquid HIP-3 market across all discovered builder DEXes — or type any custom symbol directly.
- **All Stocks & IPOs Explorer + Pinned Watchlist**: Browse & filter thousands of listings by IPO status, Exchange (`NASDAQ` / `NYSE` / `AMEX`), Sector, or 24/7 Live Perps, and pin (`★`) any stock or IPO to your persistent War Room switcher bar.
- **Unified Live Streaming Charts**: Native `lightweight-charts` v5 candlesticks (`1m`, `5m`, `15m`, `1h`) with `VWAP`, `EMA 9/21`, `RSI(14)`, volume histogram, IPO/Prev-Close reference lines, 0-delay Hyperliquid WebSocket streaming for 24/7 markets, live intraday exchange feeds for all stocks/IPOs, and automatic TradingView fallback.
- **aINVEST Quantitative AI Brief & IPO Tracker**: Live multi-timeframe regime classification, conviction score (`0–100`), VWAP/EMA structure, Hyperliquid funding/OI or exchange volume/52W flow reads, clickable breakout/support levels, and IPO deal terms / staggered S-1 lock-up countdowns.
- **Universal 17-Indicator Technical Consensus Gauge**: Real-time Moving Averages + Oscillators speedometer across `15m` and `1h` intervals for every stock & IPO, with seamless TradingView Technical Analysis fallback.
- **Valuation & P&L Calculator + Isolated Floor Chat**: Auto-computed implied market cap across all US equities & IPOs, position P&L simulator, and zero-login per-ticker Nostr chat rooms & Bull/Bear sentiment polls (`?ticker=SPCX`).
- **Slate & Daylight Themes**: Bright-edged charcoal dark mode and crisp warm-paper light mode synced across UI, charts, and gauges.

## Development

```bash
npm install
npm run dev
```

## Production Build

```bash
npm run build
```
