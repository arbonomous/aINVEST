import { useMemo, useState } from 'react';
import {
  ArrowDownRight,
  ArrowUpRight,
  Flame,
  MoonStar,
  Radio,
  Zap,
} from 'lucide-react';
import { CURATED_MAP } from '../data/tickers';
import type { HlAssetCtx } from '../lib/hyperliquidFeed';
import type { DirectoryEntry } from '../lib/marketCatalog';
import type { MarketQuote } from '../lib/universalFeed';
import { AnimatedNumber } from './ui/AnimatedNumber';
import { SegmentedTabs, type SegmentedTabItem } from './ui/SegmentedTabs';
import { SpotlightSurface } from './ui/SpotlightCard';

type RadarTab = 'gaps' | 'squeeze' | 'liquid';

const RADAR_TABS: ReadonlyArray<SegmentedTabItem<RadarTab>> = [
  { id: 'gaps', label: 'Implied Gaps' },
  { id: 'squeeze', label: 'Funding Squeeze' },
  { id: 'liquid', label: '24/7 Volume' },
];

interface OvernightRadarPanelProps {
  ctxMap: Record<string, HlAssetCtx>;
  quoteMap: Record<string, MarketQuote>;
  directoryMap: Record<string, DirectoryEntry>;
  variant?: 'rail' | 'wide';
  onSelectTicker: (ticker: string) => void;
}

interface RadarRow {
  ticker: string;
  name: string;
  markPx: number;
  refClose: number;
  gapPct: number;
  fundingApr: number;
  volUsd: number;
  oiUsd: number;
  squeezeTag: 'SHORT SQUEEZE' | 'LONG CROWDED' | null;
}

function fmtCompactUsd(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return '—';
  if (n >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `$${(n / 1e3).toFixed(0)}K`;
  return `$${n.toFixed(0)}`;
}

export function OvernightRadarPanel({
  ctxMap,
  quoteMap,
  directoryMap,
  variant = 'rail',
  onSelectTicker,
}: OvernightRadarPanelProps) {
  const [tab, setTab] = useState<RadarTab>('gaps');

  const { rows, totalVol24h, squeezeCount } = useMemo(() => {
    const list: RadarRow[] = [];
    let volSum = 0;
    let sqCount = 0;

    for (const [ticker, ctx] of Object.entries(ctxMap)) {
      if (!Number.isFinite(ctx.markPx) || ctx.markPx <= 0) continue;
      const volUsd = Number.isFinite(ctx.dayNtlVlm) ? ctx.dayNtlVlm : 0;
      volSum += volUsd;
      // Filter ultra-thin dust markets so radar stays actionable
      if (volUsd < 25_000 && !CURATED_MAP[ticker]) continue;

      const refClose =
        ctx.prevDayPx && ctx.prevDayPx > 0
          ? ctx.prevDayPx
          : quoteMap[ticker]?.prevClose ??
            directoryMap[ticker]?.lastSale ??
            ctx.markPx;
      const gapPct =
        refClose > 0 ? ((ctx.markPx - refClose) / refClose) * 100 : 0;
      const fundingApr = Number.isFinite(ctx.funding)
        ? ctx.funding * 24 * 365 * 100
        : 0;
      const oiUsd =
        Number.isFinite(ctx.openInterest) && ctx.openInterest > 0
          ? ctx.openInterest * ctx.markPx
          : 0;

      const squeezeTag: RadarRow['squeezeTag'] =
        fundingApr <= -10
          ? 'SHORT SQUEEZE'
          : fundingApr >= 18
            ? 'LONG CROWDED'
            : null;
      if (squeezeTag) sqCount += 1;

      list.push({
        ticker,
        name:
          CURATED_MAP[ticker]?.name ??
          directoryMap[ticker]?.name ??
          quoteMap[ticker]?.longName ??
          ticker,
        markPx: ctx.markPx,
        refClose,
        gapPct,
        fundingApr,
        volUsd,
        oiUsd,
        squeezeTag,
      });
    }

    return { rows: list, totalVol24h: volSum, squeezeCount: sqCount };
  }, [ctxMap, quoteMap, directoryMap]);

  const displayedRows = useMemo(() => {
    const limit = variant === 'wide' ? 8 : 6;
    if (tab === 'gaps') {
      return [...rows]
        .sort((a, b) => Math.abs(b.gapPct) - Math.abs(a.gapPct))
        .slice(0, limit);
    }
    if (tab === 'squeeze') {
      return [...rows]
        .sort((a, b) => Math.abs(b.fundingApr) - Math.abs(a.fundingApr))
        .slice(0, limit);
    }
    return [...rows].sort((a, b) => b.volUsd - a.volUsd).slice(0, limit);
  }, [rows, tab, variant]);

  return (
    <section
      className={`overnight-radar-panel overnight-radar-panel--${variant}`}
      aria-label="24/7 Overnight Gap and Funding-Squeeze Radar"
    >
      <div className="overnight-radar-head">
        <div className="overnight-radar-title-group">
          <MoonStar size={13} className="text-amber" aria-hidden="true" />
          <h2 className="panel-title">24/7 GAP &amp; SQUEEZE RADAR</h2>
          <span className="overnight-live-chip mono">
            <Radio size={9} />
            <span>
              {totalVol24h > 0
                ? `${fmtCompactUsd(totalVol24h)} 24H`
                : 'LIVE 24/7'}
            </span>
          </span>
          {squeezeCount > 0 && (
            <span className="overnight-sq-count mono">
              <Flame size={9} />
              <span>{squeezeCount} SQUEEZE</span>
            </span>
          )}
        </div>

        <SegmentedTabs
          items={RADAR_TABS}
          value={tab}
          onChange={setTab}
          ariaLabel="Overnight radar sort"
          size="sm"
          className="overnight-seg-tabs"
        />
      </div>

      {displayedRows.length === 0 ? (
        <div className="overnight-empty mono">
          <Zap size={12} className="text-amber" />
          <span>Syncing live 24/7 Hyperliquid HIP-3 overnight orderbooks…</span>
        </div>
      ) : (
        <div
          className={`overnight-radar-grid overnight-radar-grid--${variant} mono`}
        >
          {displayedRows.map((row) => {
            const isUp = row.gapPct >= 0;
            const fundingNegative = row.fundingApr < 0;
            return (
              <SpotlightSurface
                key={row.ticker}
                tone={isUp ? 'emerald' : 'crimson'}
                className="overnight-row-wrap"
              >
                <button
                  type="button"
                  className="overnight-row-card"
                  onClick={() => onSelectTicker(row.ticker)}
                >
                  <div className="overnight-row-top">
                    <div className="overnight-id">
                      <span className="overnight-sym">{row.ticker}</span>
                      <span className="overnight-name">{row.name}</span>
                    </div>
                    <AnimatedNumber
                      value={row.markPx}
                      prefix="$"
                      decimals={row.markPx >= 10 ? 2 : 3}
                      className="overnight-px"
                    />
                  </div>

                  <div className="overnight-row-bottom">
                    <span
                      className={`overnight-gap-pill ${
                        isUp ? 'text-emerald' : 'text-crimson'
                      }`}
                    >
                      {isUp ? (
                        <ArrowUpRight size={11} />
                      ) : (
                        <ArrowDownRight size={11} />
                      )}
                      <span>
                        {isUp ? '+' : ''}
                        {row.gapPct.toFixed(2)}%
                      </span>
                    </span>

                    <span
                      className={`overnight-funding-val ${
                        row.fundingApr <= -10
                          ? 'text-emerald'
                          : row.fundingApr >= 18
                            ? 'text-crimson'
                            : 'text-muted'
                      }`}
                      title="Annualized 24/7 perp funding rate (negative = shorts paying longs)"
                    >
                      {fundingNegative ? '' : '+'}
                      {row.fundingApr.toFixed(0)}% APR
                    </span>

                    <span className="overnight-vol">
                      {tab === 'squeeze' && row.oiUsd > 0
                        ? `OI ${fmtCompactUsd(row.oiUsd)}`
                        : `VOL ${fmtCompactUsd(row.volUsd)}`}
                    </span>

                    {row.squeezeTag && (
                      <span
                        className={`overnight-sq-badge ${
                          row.squeezeTag === 'SHORT SQUEEZE'
                            ? 'overnight-sq-badge--bull'
                            : 'overnight-sq-badge--bear'
                        }`}
                      >
                        {row.squeezeTag === 'SHORT SQUEEZE' ? 'SQUEEZE' : 'CROWDED'}
                      </span>
                    )}
                  </div>
                </button>
              </SpotlightSurface>
            );
          })}
        </div>
      )}
    </section>
  );
}
