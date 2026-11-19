# aINVEST — AI-Powered Live Market Terminal

Real-time 0-delay multi-ticker financial terminal featuring **24/7 War Rooms** for `ANT`, `NVDA`, `TSLA`, `PLTR`, `MSFT`, `META`, `GOOGL`, `AMZN`, `AAPL`, and 100+ live Hyperliquid HIP-3 equities & macro indices.

## Key Features

- **0-Delay 24/7 Live Data & Streaming Charts**: Sub-second WebSocket prices and `lightweight-charts` v5 candlesticks (`1m`, `5m`, `15m`, `1h`) with VWAP, EMA 9/21, RSI(14), volume histogram, and 1-click TradingView fallback.
- **aINVEST Quantitative AI Brief**: Live multi-timeframe market regime classification, conviction score (`0–100`), VWAP/EMA structure analysis, Hyperliquid funding & OI positioning reads, clickable AI breakout/support levels, and catalyst trackers (including Anthropic's staggered S-1 lock-up countdown).
- **Instant Multi-Ticker Search (`⌘K`) & Shareable URLs**: Switch between 100+ live markets via `⌘K` search, the 1-click flagship War Room bar, or the left-to-right hover-pausing scrolling ticker tape — every room has a direct shareable URL (`?ticker=NVDA`).
- **Live 17-Indicator Technical Consensus Gauge**: Real-time Moving Averages + Oscillators speedometer across `15m` and `1h` intervals.
- **Per-Ticker Isolated Floor Chat & Bull/Bear Sentiment Poll**: Zero-login real-time trader rooms powered by public Nostr relays with customizable `@handles`, 1-click signals, and clickable `$price` tags synced to the Valuation & P&L calculator.
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
