import { memo } from 'react';
import { CURATED_MAP, FLAGSHIP_TICKERS } from '../data/tickers';
import type { HlAssetCtx } from '../lib/hyperliquidFeed';
import type { DirectoryEntry } from '../lib/marketCatalog';
import type { MarketQuote } from '../lib/universalFeed';

interface ScrollingTickerTapeProps {
  ctxMap: Record<string, HlAssetCtx>;
  quoteMap: Record<string, MarketQuote>;
  directoryMap: Record<string, DirectoryEntry>;
  activeTicker: string;
  onSelectTicker: (ticker: string) => void;
}

const TAPE_LIST = [
  ...FLAGSHIP_TICKERS.map((t) => ({
    ticker: t.ticker,
    label: t.ticker,
    name: t.name,
    refPrice: t.referencePrice,
    isIpo: Boolean(t.isIpo),
  })),
  { ticker: 'SKHY', label: 'SKHY', name: 'SK hynix', refPrice: null, isIpo: true },
  { ticker: 'CBRS', label: 'CBRS', name: 'Cerebras', refPrice: null, isIpo: true },
  { ticker: 'CRWV', label: 'CRWV', name: 'CoreWeave', refPrice: 40, isIpo: true },
  { ticker: 'XYZ100', label: 'NDX100', name: 'Nasdaq 100', refPrice: null, isIpo: false },
];

function ScrollingTickerTapeComponent({
  ctxMap,
  quoteMap,
  directoryMap,
  activeTicker,
  onSelectTicker,
}: ScrollingTickerTapeProps) {
  const renderGroup = (copyIndex: number) => (
    <div
      className="ticker-marquee-group"
      aria-hidden={copyIndex > 0 ? 'true' : undefined}
    >
      {TAPE_LIST.map((item) => {
        const hl = ctxMap[item.ticker];
        const liveQ = quoteMap[item.ticker];
        const dir = directoryMap[item.ticker];
        const curated = CURATED_MAP[item.ticker];

        const price = hl?.markPx ?? liveQ?.price ?? dir?.lastSale ?? null;
        const baseRef =
          item.refPrice ??
          curated?.referencePrice ??
          hl?.prevDayPx ??
          liveQ?.prevClose ??
          null;
        const diff =
          price !== null && baseRef !== null && baseRef > 0
            ? price - baseRef
            : null;
        const pct =
          diff !== null && baseRef !== null && baseRef > 0
            ? (diff / baseRef) * 100
            : liveQ?.changePct ?? dir?.pctChange ?? null;
        const isUp = pct !== null && pct >= 0;
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
            {item.isIpo && <span className="tape-ipo-dot mono">IPO</span>}
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
      aria-label="Live Scrolling Stock and IPO Ticker Tape — hover to pause, click to open War Room"
    >
      <div className="ticker-marquee-track">
        {renderGroup(0)}
        {renderGroup(1)}
      </div>
    </div>
  );
}

export const ScrollingTickerTape = memo(ScrollingTickerTapeComponent);
