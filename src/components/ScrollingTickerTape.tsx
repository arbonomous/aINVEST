import { memo } from 'react';
import { FLAGSHIP_TICKERS } from '../data/tickers';
import type { HlAssetCtx } from '../lib/hyperliquidFeed';

interface ScrollingTickerTapeProps {
  ctxMap: Record<string, HlAssetCtx>;
  activeTicker: string;
  onSelectTicker: (ticker: string) => void;
}

const TAPE_LIST = [
  ...FLAGSHIP_TICKERS.map((t) => ({
    ticker: t.ticker,
    label: t.ticker,
    name: t.name,
    refPrice: t.referencePrice,
  })),
  { ticker: 'XYZ100', label: 'NDX100', name: 'Nasdaq 100', refPrice: null },
];

function ScrollingTickerTapeComponent({
  ctxMap,
  activeTicker,
  onSelectTicker,
}: ScrollingTickerTapeProps) {
  const renderGroup = (copyIndex: number) => (
    <div
      className="ticker-marquee-group"
      aria-hidden={copyIndex > 0 ? 'true' : undefined}
    >
      {TAPE_LIST.map((item) => {
        const ctx = ctxMap[item.ticker];
        const price = ctx?.markPx ?? null;
        const baseRef = item.refPrice ?? ctx?.prevDayPx ?? null;
        const diff =
          price !== null && baseRef !== null && baseRef > 0
            ? price - baseRef
            : null;
        const pct =
          diff !== null && baseRef !== null && baseRef > 0
            ? (diff / baseRef) * 100
            : null;
        const isUp = diff !== null && diff >= 0;
        const isSelected = activeTicker === item.ticker;

        return (
          <button
            key={`${copyIndex}-${item.ticker}`}
            type="button"
            tabIndex={copyIndex > 0 ? -1 : 0}
            className={`tape-pill${isSelected ? ' tape-pill--active' : ''}`}
            onClick={() => onSelectTicker(item.ticker)}
            title={`Open ${item.name} (${item.label}) War Room — hover pauses tape`}
          >
            <span className="tape-ticker mono">{item.label}</span>
            <span className="tape-name">{item.name}</span>
            <span className="tape-price mono">
              {price !== null ? `$${price.toFixed(2)}` : '—'}
            </span>
            {pct !== null && (
              <span
                className={`tape-change mono ${
                  isUp ? 'text-emerald' : 'text-crimson'
                }`}
              >
                {isUp ? '+' : ''}
                {pct.toFixed(2)}%
              </span>
            )}
          </button>
        );
      })}
    </div>
  );

  return (
    <div
      className="ticker-tape-bar"
      role="region"
      aria-label="Live Scrolling Stock Ticker Tape — hover to pause, click to open War Room"
    >
      <div className="ticker-marquee-track">
        {renderGroup(0)}
        {renderGroup(1)}
      </div>
    </div>
  );
}

export const ScrollingTickerTape = memo(ScrollingTickerTapeComponent);
