import { memo, useMemo } from 'react';
import { Flame, Plus, Star } from 'lucide-react';
import { CURATED_MAP, FLAGSHIP_TICKERS } from '../data/tickers';
import type { HlAssetCtx } from '../lib/hyperliquidFeed';
import type { DirectoryEntry } from '../lib/marketCatalog';
import type { MarketQuote } from '../lib/universalFeed';
import type { ExplorerTab } from './MarketExplorerModal';

interface RoomSwitcherBarProps {
  activeTicker: string;
  ctxMap: Record<string, HlAssetCtx>;
  quoteMap: Record<string, MarketQuote>;
  directoryMap: Record<string, DirectoryEntry>;
  pinnedTickers: string[];
  recentTickers: string[];
  onSelectTicker: (ticker: string) => void;
  onOpenExplorer: (tab?: ExplorerTab) => void;
}

function RoomSwitcherBarComponent({
  activeTicker,
  ctxMap,
  quoteMap,
  directoryMap,
  pinnedTickers,
  recentTickers,
  onSelectTicker,
  onOpenExplorer,
}: RoomSwitcherBarProps) {
  const pinnedSet = useMemo(() => new Set(pinnedTickers), [pinnedTickers]);

  const displayedTickers = useMemo(() => {
    const ordered: string[] = [];
    const seen = new Set<string>();

    const push = (t: string) => {
      if (!t || seen.has(t)) return;
      seen.add(t);
      ordered.push(t);
    };

    // 1. Flagship War Rooms (including ANT & SPCX IPOs + Mag7/PLTR)
    for (const f of FLAGSHIP_TICKERS) push(f.ticker);
    // 2. User-pinned custom stocks & IPOs
    for (const p of pinnedTickers) push(p);
    // 3. Active ticker (if not already shown)
    push(activeTicker);
    // 4. Up to 3 recent custom rooms for instant 1-click return
    let recentAdded = 0;
    for (const r of recentTickers) {
      if (!seen.has(r) && recentAdded < 3) {
        push(r);
        recentAdded += 1;
      }
    }

    return ordered;
  }, [pinnedTickers, recentTickers, activeTicker]);

  return (
    <nav
      className="room-switcher-bar"
      aria-label="Multi-Ticker Stocks and IPO War Rooms"
    >
      <span className="room-switcher-label mono">WAR ROOMS:</span>

      <div className="room-pills-scroll" role="tablist">
        {displayedTickers.map((ticker) => {
          const curated = CURATED_MAP[ticker];
          const hl = ctxMap[ticker];
          const liveQ = quoteMap[ticker];
          const dir = directoryMap[ticker];

          const price = hl?.markPx ?? liveQ?.price ?? dir?.lastSale ?? null;
          const baseRef =
            curated?.referencePrice ??
            hl?.prevDayPx ??
            liveQ?.prevClose ??
            null;
          const pct =
            price !== null && baseRef !== null && baseRef > 0
              ? ((price - baseRef) / baseRef) * 100
              : liveQ?.changePct ?? dir?.pctChange ?? null;
          const isUp = pct !== null && pct >= 0;
          const isActive = activeTicker === ticker;
          const isIpo = Boolean(curated?.isIpo || dir?.isIpo);
          const isPinned = pinnedSet.has(ticker);

          return (
            <button
              key={ticker}
              id={`room-pill-${ticker.toLowerCase().replace(/[^a-z0-9]/g, '-')}`}
              type="button"
              role="tab"
              aria-selected={isActive}
              className={`room-pill${isActive ? ' active' : ''}`}
              onClick={() => onSelectTicker(ticker)}
            >
              {isPinned && (
                <Star
                  size={10}
                  className="room-pill-star"
                  fill="currentColor"
                  aria-hidden="true"
                />
              )}
              <span className="room-pill-ticker mono">{ticker}</span>
              {isIpo && <span className="room-pill-ipo mono">IPO</span>}
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
      </div>

      <div className="room-switcher-actions">
        <button
          type="button"
          className="room-action-pill room-action-pill--ipo mono"
          onClick={() => onOpenExplorer('ipos')}
          title="Browse all recent & upcoming IPOs"
        >
          <Flame size={11} />
          <span>IPOs</span>
        </button>

        <button
          type="button"
          className="room-action-pill mono"
          onClick={() => onOpenExplorer('all')}
          title="Open any US stock, ETF, or IPO War Room"
        >
          <Plus size={11} />
          <span>ANY TICKER</span>
        </button>
      </div>
    </nav>
  );
}

export const RoomSwitcherBar = memo(RoomSwitcherBarComponent);
