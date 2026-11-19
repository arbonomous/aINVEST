import { memo } from 'react';
import { FLAGSHIP_TICKERS } from '../data/tickers';
import type { HlAssetCtx } from '../lib/hyperliquidFeed';

interface RoomSwitcherBarProps {
  activeTicker: string;
  ctxMap: Record<string, HlAssetCtx>;
  onSelectTicker: (ticker: string) => void;
}

function RoomSwitcherBarComponent({
  activeTicker,
  ctxMap,
  onSelectTicker,
}: RoomSwitcherBarProps) {
  const isCustomTicker = !FLAGSHIP_TICKERS.some((t) => t.ticker === activeTicker);

  return (
    <nav
      className="room-switcher-bar"
      aria-label="Flagship Multi-Ticker War Rooms"
    >
      <span className="room-switcher-label mono">WAR ROOMS:</span>

      <div className="room-pills-scroll" role="tablist">
        {FLAGSHIP_TICKERS.map((meta) => {
          const ctx = ctxMap[meta.ticker];
          const price = ctx?.markPx ?? null;
          const baseRef = meta.referencePrice ?? ctx?.prevDayPx ?? null;
          const pct =
            price !== null && baseRef !== null && baseRef > 0
              ? ((price - baseRef) / baseRef) * 100
              : null;
          const isUp = pct !== null && pct >= 0;
          const isActive = activeTicker === meta.ticker;

          return (
            <button
              key={meta.ticker}
              id={`room-pill-${meta.ticker.toLowerCase()}`}
              type="button"
              role="tab"
              aria-selected={isActive}
              className={`room-pill${isActive ? ' active' : ''}`}
              onClick={() => onSelectTicker(meta.ticker)}
            >
              <span className="room-pill-ticker mono">{meta.ticker}</span>
              {price !== null && (
                <span className="room-pill-price mono">${price.toFixed(2)}</span>
              )}
              {pct !== null && (
                <span
                  className={`room-pill-pct mono ${
                    isUp ? 'text-emerald' : 'text-crimson'
                  }`}
                >
                  {isUp ? '+' : ''}
                  {pct.toFixed(1)}%
                </span>
              )}
            </button>
          );
        })}

        {isCustomTicker && (
          <button
            type="button"
            role="tab"
            aria-selected="true"
            className="room-pill active"
            onClick={() => onSelectTicker(activeTicker)}
          >
            <span className="room-pill-ticker mono">{activeTicker}</span>
            {ctxMap[activeTicker]?.markPx && (
              <span className="room-pill-price mono">
                ${ctxMap[activeTicker].markPx.toFixed(2)}
              </span>
            )}
          </button>
        )}
      </div>
    </nav>
  );
}

export const RoomSwitcherBar = memo(RoomSwitcherBarComponent);
