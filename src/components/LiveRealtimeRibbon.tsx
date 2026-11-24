import { useEffect, useRef, useState } from 'react';
import {
  ArrowDownRight,
  ArrowUpRight,
  Calculator,
  Flame,
  Star,
  Zap,
} from 'lucide-react';
import type { TickerMeta } from '../data/tickers';
import {
  HyperliquidStream,
  type HlAssetCtx,
} from '../lib/hyperliquidFeed';
import type { ThemeId } from '../lib/themes';
import {
  fetchUniversalQuote,
  hlCtxToQuote,
  type MarketQuote,
} from '../lib/universalFeed';
import { AnimatedNumber } from './ui/AnimatedNumber';
import { MarketFlowCanvas } from './ui/MarketFlowCanvas';

interface LiveRealtimeRibbonProps {
  meta: TickerMeta;
  initialHlCtx: HlAssetCtx | null;
  fallbackQuote: MarketQuote | null;
  isPinned: boolean;
  themeId?: ThemeId;
  onTogglePin: () => void;
  onLiveHlUpdate: (ctx: HlAssetCtx) => void;
  onLiveQuoteUpdate: (quote: MarketQuote) => void;
  onSyncLivePrice: (price: number) => void;
}

function formatCompactUsd(val: number): string {
  if (!Number.isFinite(val) || val <= 0) return '—';
  if (val >= 1e12) return `$${(val / 1e12).toFixed(2)}T`;
  if (val >= 1e9) return `$${(val / 1e9).toFixed(2)}B`;
  if (val >= 1e6) return `$${(val / 1e6).toFixed(1)}M`;
  if (val >= 1e3) return `$${(val / 1e3).toFixed(0)}K`;
  return `$${val.toFixed(0)}`;
}

function formatCompactShares(val: number): string {
  if (!Number.isFinite(val) || val <= 0) return '—';
  if (val >= 1e9) return `${(val / 1e9).toFixed(2)}B`;
  if (val >= 1e6) return `${(val / 1e6).toFixed(2)}M`;
  if (val >= 1e3) return `${(val / 1e3).toFixed(1)}K`;
  return `${Math.round(val)}`;
}

function formatMarketCap(billions: number): string {
  if (billions >= 1000) return `$${(billions / 1000).toFixed(2)}T`;
  if (billions >= 1) return `$${billions.toFixed(1)}B`;
  return `$${(billions * 1000).toFixed(0)}M`;
}

export function LiveRealtimeRibbon({
  meta,
  initialHlCtx,
  fallbackQuote,
  isPinned,
  themeId = 'slate',
  onTogglePin,
  onLiveHlUpdate,
  onLiveQuoteUpdate,
  onSyncLivePrice,
}: LiveRealtimeRibbonProps) {
  const [streamQuote, setStreamQuote] = useState<MarketQuote | null>(null);
  const [wsState, setWsState] = useState<{ key: string; connected: boolean }>({
    key: '',
    connected: false,
  });
  const [flashDir, setFlashDir] = useState<'up' | 'down' | null>(null);
  const prevPxRef = useRef<number | null>(null);
  const flashTimerRef = useRef<number | null>(null);
  const onHlRef = useRef(onLiveHlUpdate);
  const onQuoteRef = useRef(onLiveQuoteUpdate);

  const streamKey = `${meta.ticker}:${meta.hlCoin ?? 'mkt'}`;
  const wsConnected = wsState.key === streamKey && wsState.connected;

  useEffect(() => {
    onHlRef.current = onLiveHlUpdate;
  }, [onLiveHlUpdate]);

  useEffect(() => {
    onQuoteRef.current = onLiveQuoteUpdate;
  }, [onLiveQuoteUpdate]);

  const triggerFlash = (nextPx: number) => {
    const prevPx = prevPxRef.current;
    if (prevPx !== null && Math.abs(nextPx - prevPx) > 0.0001) {
      setFlashDir(nextPx > prevPx ? 'up' : 'down');
      if (flashTimerRef.current !== null) {
        window.clearTimeout(flashTimerRef.current);
      }
      flashTimerRef.current = window.setTimeout(() => setFlashDir(null), 450);
    }
    prevPxRef.current = nextPx;
  };

  useEffect(() => {
    prevPxRef.current = null;
    let lastParentSyncMs = 0;

    // Tier 1: Hyperliquid 0-delay WebSocket when ticker is on a HIP-3 DEX
    if (meta.hlCoin) {
      const stream = new HyperliquidStream(meta.hlCoin, {
        onStatus: (connected) => setWsState({ key: streamKey, connected }),
        onAssetCtx: (next) => {
          triggerFlash(next.markPx);
          const q = hlCtxToQuote(next);
          setStreamQuote(q);
          const now = Date.now();
          if (now - lastParentSyncMs >= 2000) {
            lastParentSyncMs = now;
            onHlRef.current(next);
          }
        },
      });
      stream.connect();

      return () => {
        stream.destroy();
        if (flashTimerRef.current !== null) {
          window.clearTimeout(flashTimerRef.current);
        }
      };
    }

    // Tier 2: Universal Exchange Live Quote polling for ALL NASDAQ/NYSE/AMEX stocks & IPOs
    if (meta.ipoStatus === 'upcoming') {
      return;
    }

    let cancelled = false;
    const controller = new AbortController();

    const pollQuote = async () => {
      try {
        const q = await fetchUniversalQuote(meta.ticker, controller.signal);
        if (!cancelled && q && q.price !== null) {
          triggerFlash(q.price);
          setStreamQuote(q);
          setWsState({ key: streamKey, connected: true });
          onQuoteRef.current(q);
        }
      } catch {
        // Keep last quote or fallback
      }
    };

    void pollQuote();
    const id = window.setInterval(() => void pollQuote(), 12_000);

    return () => {
      cancelled = true;
      controller.abort();
      window.clearInterval(id);
      if (flashTimerRef.current !== null) {
        window.clearTimeout(flashTimerRef.current);
      }
    };
  }, [streamKey, meta.ticker, meta.hlCoin, meta.ipoStatus]);

  const activeQuote: MarketQuote | null =
    streamQuote && streamQuote.ticker === meta.ticker
      ? streamQuote
      : initialHlCtx && initialHlCtx.ticker === meta.ticker
        ? hlCtxToQuote(initialHlCtx)
        : fallbackQuote && fallbackQuote.ticker === meta.ticker
          ? fallbackQuote
          : null;

  const livePrice = activeQuote?.price ?? null;
  const refPrice = meta.referencePrice ?? activeQuote?.prevClose ?? null;
  const diff =
    livePrice !== null && refPrice !== null && refPrice > 0
      ? livePrice - refPrice
      : activeQuote?.change ?? null;
  const pct =
    diff !== null && refPrice !== null && refPrice > 0
      ? (diff / refPrice) * 100
      : activeQuote?.changePct ?? null;
  const impliedCapBillions =
    livePrice !== null && meta.dilutedSharesBillions
      ? livePrice * meta.dilutedSharesBillions
      : null;
  const isUp = diff !== null ? diff >= 0 : pct !== null ? pct >= 0 : true;
  const isHyperliquid = activeQuote?.source === 'hyperliquid' || Boolean(meta.hlCoin);
  const ribbonSentiment =
    pct !== null ? Math.max(-1, Math.min(1, pct / 4)) : isUp ? 0.25 : -0.25;

  const venueStatusText = meta.hlCoin
    ? `${meta.sector} • ${meta.hlCoin} ${wsConnected ? 'WS 24/7' : '24/7'}`
    : meta.ipoStatus === 'upcoming'
      ? `${meta.sector} • ${meta.exchange ?? 'US'} PIPELINE`
      : `${meta.sector} • ${activeQuote?.exchangeLabel ?? meta.exchange ?? 'US MKT'} ${
          activeQuote?.source === 'yahoo'
            ? activeQuote.marketState
            : activeQuote?.source === 'directory'
              ? 'LAST CLOSE'
              : 'SYNC'
        }`;

  return (
    <section
      className="terminal-card live-ribbon live-ribbon--enhanced"
      aria-label={`Live Market Feed for ${meta.name} (${meta.ticker})`}
    >
      <MarketFlowCanvas
        themeId={themeId}
        sentiment={ribbonSentiment}
        className="live-ribbon-canvas"
      />
      <div className="live-ribbon-left">
        <div className="live-ribbon-badge-group">
          <span
            className={`live-zero-badge${meta.isIpo ? ' live-zero-badge--ipo' : ''}`}
          >
            {meta.isIpo ? <Flame size={11} /> : <Zap size={11} />}
            <span>{meta.ticker}</span>
          </span>
          <div className="live-ticker-title-stack">
            <div className="live-company-row">
              <span className="live-company-name">{meta.name}</span>
              {meta.isIpo && (
                <span className="ribbon-ipo-pill mono">
                  {meta.ipoStatus === 'upcoming'
                    ? `UPCOMING IPO • ${meta.ipoDate ?? '2026'}`
                    : `IPO${meta.ipoDate ? ` • ${meta.ipoDate}` : ''}`}
                </span>
              )}
            </div>
            <span className="live-venue-tag mono">{venueStatusText}</span>
          </div>
        </div>

        <div className="live-price-cluster">
          <span
            id="realtime-active-price"
            className={`live-price-figure mono${
              flashDir === 'up'
                ? ' flash-up'
                : flashDir === 'down'
                  ? ' flash-down'
                  : ''
            }`}
          >
            {livePrice !== null ? (
              <AnimatedNumber
                value={livePrice}
                prefix="$"
                decimals={2}
                flashOnTick={false}
              />
            ) : meta.ipoStatus === 'upcoming' ? (
              meta.ipoRangeLabel ?? 'PRE-IPO'
            ) : (
              'Live Chart'
            )}
          </span>

          {pct !== null && (
            <span
              className={`live-ipo-spread mono ${
                isUp ? 'text-emerald' : 'text-crimson'
              }`}
            >
              {isUp ? <ArrowUpRight size={13} /> : <ArrowDownRight size={13} />}
              <span>
                {isUp ? '+' : ''}
                {pct.toFixed(2)}%
                {diff !== null
                  ? ` (${isUp ? '+' : '-'}$${Math.abs(diff).toFixed(2)} vs ${meta.referenceLabel})`
                  : ''}
              </span>
            </span>
          )}
        </div>
      </div>

      <div className="live-ribbon-stats mono">
        {impliedCapBillions !== null && (
          <>
            <div className="ribbon-stat">
              <span className="ribbon-stat-label">MKT CAP</span>
              <span className="ribbon-stat-val">
                {formatMarketCap(impliedCapBillions)}
              </span>
            </div>
            <span className="ribbon-sep" aria-hidden="true" />
          </>
        )}

        {isHyperliquid ? (
          <>
            <div className="ribbon-stat">
              <span className="ribbon-stat-label">24H VOL</span>
              <span className="ribbon-stat-val">
                {activeQuote ? formatCompactUsd(activeQuote.dayNtlVlm) : '—'}
              </span>
            </div>

            <span className="ribbon-sep" aria-hidden="true" />

            <div className="ribbon-stat">
              <span className="ribbon-stat-label">OPEN INT</span>
              <span className="ribbon-stat-val">
                {activeQuote?.openInterest != null
                  ? formatCompactUsd(activeQuote.openInterest)
                  : '—'}
              </span>
            </div>

            <span className="ribbon-sep" aria-hidden="true" />

            <div className="ribbon-stat">
              <span className="ribbon-stat-label">1H FUNDING</span>
              <span
                className={`ribbon-stat-val ${
                  activeQuote?.funding != null && activeQuote.funding < 0
                    ? 'text-crimson'
                    : 'text-emerald'
                }`}
              >
                {activeQuote?.funding != null
                  ? `${activeQuote.funding >= 0 ? '+' : ''}${(activeQuote.funding * 100).toFixed(4)}%`
                  : '—'}
              </span>
            </div>
          </>
        ) : (
          <>
            <div className="ribbon-stat">
              <span className="ribbon-stat-label">SESSION VOL</span>
              <span className="ribbon-stat-val">
                {activeQuote && activeQuote.volume > 0
                  ? formatCompactShares(activeQuote.volume)
                  : '—'}
              </span>
            </div>

            <span className="ribbon-sep" aria-hidden="true" />

            <div className="ribbon-stat">
              <span className="ribbon-stat-label">
                {meta.ipoRangeLabel ? 'IPO TERMS' : 'DAY RANGE'}
              </span>
              <span className="ribbon-stat-val">
                {meta.ipoRangeLabel
                  ? meta.ipoRangeLabel
                  : activeQuote?.dayLow && activeQuote?.dayHigh
                    ? `$${activeQuote.dayLow.toFixed(2)}–$${activeQuote.dayHigh.toFixed(2)}`
                    : activeQuote?.fiftyTwoWeekLow && activeQuote?.fiftyTwoWeekHigh
                      ? `$${activeQuote.fiftyTwoWeekLow.toFixed(0)}–$${activeQuote.fiftyTwoWeekHigh.toFixed(0)} (52W)`
                      : '—'}
              </span>
            </div>

            <span className="ribbon-sep" aria-hidden="true" />

            <div className="ribbon-stat">
              <span className="ribbon-stat-label">EXCHANGE</span>
              <span className="ribbon-stat-val text-emerald">
                {activeQuote?.exchangeLabel ?? meta.exchange ?? 'US MKT'}
              </span>
            </div>
          </>
        )}

        <button
          type="button"
          className={`ribbon-pin-btn${isPinned ? ' pinned' : ''}`}
          onClick={onTogglePin}
          title={
            isPinned
              ? `Unpin ${meta.ticker} from War Room bar`
              : `Pin ${meta.ticker} to War Room bar`
          }
          aria-pressed={isPinned}
        >
          <Star size={12} fill={isPinned ? 'currentColor' : 'none'} />
          <span>{isPinned ? 'Pinned' : 'Pin'}</span>
        </button>

        {livePrice !== null && (
          <button
            id="sync-live-to-calc-btn"
            type="button"
            className="ribbon-sync-btn"
            onClick={() => onSyncLivePrice(livePrice)}
            title={`Load live ${meta.ticker} price into Valuation & P&L Calculator`}
          >
            <Calculator size={12} />
            <span>Use in Calc</span>
          </button>
        )}
      </div>
    </section>
  );
}
