import { useEffect, useRef, useState } from 'react';
import { ArrowDownRight, ArrowUpRight, Calculator, Zap } from 'lucide-react';
import type { TickerMeta } from '../data/tickers';
import {
  HyperliquidStream,
  type HlAssetCtx,
} from '../lib/hyperliquidFeed';

interface LiveRealtimeRibbonProps {
  meta: TickerMeta;
  initialCtx: HlAssetCtx | null;
  onLiveCtxUpdate: (ctx: HlAssetCtx) => void;
  onSyncLivePrice: (price: number) => void;
}

function formatCompactUsd(val: number): string {
  if (!Number.isFinite(val) || val <= 0) return '—';
  if (val >= 1e9) return `$${(val / 1e9).toFixed(2)}B`;
  if (val >= 1e6) return `$${(val / 1e6).toFixed(1)}M`;
  if (val >= 1e3) return `$${(val / 1e3).toFixed(0)}K`;
  return `$${val.toFixed(0)}`;
}

function formatMarketCap(billions: number): string {
  if (billions >= 1000) return `$${(billions / 1000).toFixed(2)}T`;
  return `$${billions.toFixed(1)}B`;
}

export function LiveRealtimeRibbon({
  meta,
  initialCtx,
  onLiveCtxUpdate,
  onSyncLivePrice,
}: LiveRealtimeRibbonProps) {
  const [liveCtx, setLiveCtx] = useState<HlAssetCtx | null>(initialCtx);
  const [wsConnected, setWsConnected] = useState(false);
  const [flashDir, setFlashDir] = useState<'up' | 'down' | null>(null);
  const prevPxRef = useRef<number | null>(null);
  const flashTimerRef = useRef<number | null>(null);
  const onUpdateRef = useRef(onLiveCtxUpdate);

  useEffect(() => {
    onUpdateRef.current = onLiveCtxUpdate;
  }, [onLiveCtxUpdate]);

  useEffect(() => {
    prevPxRef.current = null;
    const stream = new HyperliquidStream(meta.hlCoin, {
      onStatus: setWsConnected,
      onAssetCtx: (next) => {
        const prevPx = prevPxRef.current;
        if (prevPx !== null && Math.abs(next.markPx - prevPx) > 0.0001) {
          setFlashDir(next.markPx > prevPx ? 'up' : 'down');
          if (flashTimerRef.current !== null) {
            window.clearTimeout(flashTimerRef.current);
          }
          flashTimerRef.current = window.setTimeout(() => setFlashDir(null), 450);
        }
        prevPxRef.current = next.markPx;
        setLiveCtx(next);
        onUpdateRef.current(next);
      },
    });
    stream.connect();

    return () => {
      stream.destroy();
      if (flashTimerRef.current !== null) {
        window.clearTimeout(flashTimerRef.current);
      }
    };
  }, [meta.hlCoin]);

  const ctx =
    liveCtx && liveCtx.coin === meta.hlCoin ? liveCtx : initialCtx;
  const livePrice = ctx?.markPx ?? null;
  const refPrice = meta.referencePrice ?? ctx?.prevDayPx ?? null;
  const diff =
    livePrice !== null && refPrice !== null && refPrice > 0
      ? livePrice - refPrice
      : null;
  const pct =
    diff !== null && refPrice !== null && refPrice > 0
      ? (diff / refPrice) * 100
      : null;
  const impliedCapBillions =
    livePrice !== null && meta.dilutedSharesBillions
      ? livePrice * meta.dilutedSharesBillions
      : null;
  const isUp = diff !== null && diff >= 0;

  return (
    <section
      className="terminal-card live-ribbon"
      aria-label={`Zero-Delay Real-Time Feed for ${meta.name} (${meta.ticker})`}
    >
      <div className="live-ribbon-left">
        <div className="live-ribbon-badge-group">
          <span className="live-zero-badge">
            <Zap size={11} />
            <span>{meta.ticker}</span>
          </span>
          <div className="live-ticker-title-stack">
            <span className="live-company-name">{meta.name}</span>
            <span className="live-venue-tag mono">
              {meta.sector} • {meta.hlCoin} {wsConnected ? 'WS' : 'REST'}
            </span>
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
            {livePrice !== null ? `$${livePrice.toFixed(2)}` : 'Syncing…'}
          </span>

          {pct !== null && diff !== null && (
            <span
              className={`live-ipo-spread mono ${
                isUp ? 'text-emerald' : 'text-crimson'
              }`}
            >
              {isUp ? <ArrowUpRight size={13} /> : <ArrowDownRight size={13} />}
              <span>
                {isUp ? '+' : ''}
                {pct.toFixed(2)}% ({isUp ? '+' : '-'}${Math.abs(diff).toFixed(2)}{' '}
                vs {meta.referenceLabel})
              </span>
            </span>
          )}
        </div>
      </div>

      <div className="live-ribbon-stats mono">
        {impliedCapBillions !== null && (
          <>
            <div className="ribbon-stat">
              <span className="ribbon-stat-label">LIVE MKT CAP</span>
              <span className="ribbon-stat-val">
                {formatMarketCap(impliedCapBillions)}
              </span>
            </div>
            <span className="ribbon-sep" aria-hidden="true" />
          </>
        )}

        <div className="ribbon-stat">
          <span className="ribbon-stat-label">24H VOL</span>
          <span className="ribbon-stat-val">
            {ctx ? formatCompactUsd(ctx.dayNtlVlm) : '—'}
          </span>
        </div>

        <span className="ribbon-sep" aria-hidden="true" />

        <div className="ribbon-stat">
          <span className="ribbon-stat-label">OPEN INT</span>
          <span className="ribbon-stat-val">
            {ctx ? formatCompactUsd(ctx.openInterest) : '—'}
          </span>
        </div>

        <span className="ribbon-sep" aria-hidden="true" />

        <div className="ribbon-stat">
          <span className="ribbon-stat-label">1H FUNDING</span>
          <span
            className={`ribbon-stat-val ${
              ctx && ctx.funding < 0 ? 'text-crimson' : 'text-emerald'
            }`}
          >
            {ctx
              ? `${ctx.funding >= 0 ? '+' : ''}${(ctx.funding * 100).toFixed(4)}%`
              : '—'}
          </span>
        </div>

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
