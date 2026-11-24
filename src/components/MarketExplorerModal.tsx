import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  Flame,
  Globe,
  Layers,
  Search,
  Sparkles,
  Star,
  X,
  Zap,
} from 'lucide-react';
import { CURATED_MAP, FEATURED_IPOS, FLAGSHIP_TICKERS } from '../data/tickers';
import {
  rankMarketConfluence,
  type ConfluenceReport,
} from '../lib/confluenceEngine';
import type { HlAssetCtx } from '../lib/hyperliquidFeed';
import type { InsidersBundle } from '../lib/insidersEngine';
import type { DirectoryEntry, UsExchange } from '../lib/marketCatalog';
import type { NewsArticle } from '../lib/newsFeed';
import type { MarketQuote } from '../lib/universalFeed';
import type { TickerOptionsSummary } from '../lib/whaleFlowEngine';

export type ExplorerTab = 'confluence' | 'ipos' | 'all' | 'live247' | 'watchlist';

type ScreenerPreset =
  | 'all'
  | 'bull3'
  | 'bear3'
  | 'whale'
  | 'insider'
  | 'squeeze'
  | 'earnings';

const SCREENER_PRESETS: ReadonlyArray<{ id: ScreenerPreset; label: string }> = [
  { id: 'all', label: 'ALL SIGNALS' },
  { id: 'bull3', label: 'BULL CONFLUENCE' },
  { id: 'bear3', label: 'BEAR CONFLUENCE' },
  { id: 'whale', label: 'WHALE FLOW' },
  { id: 'insider', label: 'CONGRESS / CLUSTER' },
  { id: 'squeeze', label: 'SHORT SQUEEZE' },
  { id: 'earnings', label: 'EARNINGS SOON' },
];

interface MarketExplorerModalProps {
  open: boolean;
  initialTab?: ExplorerTab;
  activeTicker: string;
  ctxMap: Record<string, HlAssetCtx>;
  quoteMap?: Record<string, MarketQuote>;
  directory: DirectoryEntry[];
  directoryMap: Record<string, DirectoryEntry>;
  directoryLoading: boolean;
  insidersBundle?: InsidersBundle | null;
  optionsMap?: Record<string, TickerOptionsSummary>;
  articles?: NewsArticle[];
  pinnedTickers: string[];
  onTogglePin: (ticker: string) => void;
  onSelectTicker: (ticker: string) => void;
  onClose: () => void;
}

interface UnifiedRow {
  ticker: string;
  name: string;
  exchange: string;
  sector: string;
  price: number | null;
  pctChange: number | null;
  marketCap: number | null;
  volumeUsd: number;
  isLive247: boolean;
  isIpo: boolean;
  ipoTag?: string;
  ipoStatus?: 'live' | 'upcoming';
  ipoRange?: string;
}

function formatCompactCap(val: number | null): string {
  if (!val || !Number.isFinite(val) || val <= 0) return '—';
  if (val >= 1e12) return `$${(val / 1e12).toFixed(2)}T`;
  if (val >= 1e9) return `$${(val / 1e9).toFixed(1)}B`;
  if (val >= 1e6) return `$${(val / 1e6).toFixed(0)}M`;
  return `$${val.toFixed(0)}`;
}

const VALID_TICKER_RE = /^[A-Z0-9][A-Z0-9._-]{0,11}$/;

const TOP_SECTORS = [
  'ALL',
  'Technology',
  'Finance',
  'Health Care',
  'Consumer Discretionary',
  'Industrials',
  'Energy',
  'Consumer Staples',
  'Utilities',
  'Real Estate',
];

export function MarketExplorerModal({
  open,
  initialTab = 'ipos',
  activeTicker,
  ctxMap,
  quoteMap = {},
  directory,
  directoryMap,
  directoryLoading,
  insidersBundle = null,
  optionsMap = {},
  articles = [],
  pinnedTickers,
  onTogglePin,
  onSelectTicker,
  onClose,
}: MarketExplorerModalProps) {
  const [tab, setTab] = useState<ExplorerTab>(initialTab);
  const [query, setQuery] = useState('');
  const [exchangeFilter, setExchangeFilter] = useState<'ALL' | UsExchange>('ALL');
  const [sectorFilter, setSectorFilter] = useState<string>('ALL');
  const [screenerPreset, setScreenerPreset] = useState<ScreenerPreset>('all');
  const [only247, setOnly247] = useState<boolean>(false);
  const [onlyIpos, setOnlyIpos] = useState<boolean>(false);
  const [visibleLimit, setVisibleLimit] = useState<number>(60);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const id = window.setTimeout(() => inputRef.current?.focus(), 40);
    return () => window.clearTimeout(id);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  const pinnedSet = useMemo(() => new Set(pinnedTickers), [pinnedTickers]);

  // Compute full Multi-Signal Confluence Universe for the Screener tab
  const allConfluenceReports = useMemo<ConfluenceReport[]>(
    () =>
      rankMarketConfluence({
        ctxMap,
        quoteMap,
        directoryMap,
        insidersBundle,
        optionsMap,
        articles,
        limit: 120,
      }),
    [ctxMap, quoteMap, directoryMap, insidersBundle, optionsMap, articles],
  );

  // Build unified index combining Curated Flagship/IPOs + Live 24/7 HL + All 7,290+ US Equities
  const allRows = useMemo<UnifiedRow[]>(() => {
    const byTicker = new Map<string, UnifiedRow>();

    // 1. Add all primary US directory entries (NASDAQ/NYSE/AMEX)
    for (const d of directory) {
      if (d.isDerivativeListing) continue;
      const hl = ctxMap[d.ticker];
      const curated = CURATED_MAP[d.ticker];
      const price = hl?.markPx ?? d.lastSale;
      const baseRef = curated?.referencePrice ?? hl?.prevDayPx ?? null;
      const pct =
        hl && baseRef && baseRef > 0
          ? ((hl.markPx - baseRef) / baseRef) * 100
          : d.pctChange;

      byTicker.set(d.ticker, {
        ticker: d.ticker,
        name: curated?.name ?? d.name,
        exchange: d.exchange,
        sector: d.sector || 'Equities',
        price,
        pctChange: pct,
        marketCap: d.marketCap,
        volumeUsd: hl ? hl.dayNtlVlm : price ? d.volume * price : 0,
        isLive247: Boolean(hl),
        isIpo: Boolean(curated?.isIpo || d.isIpo),
        ipoTag:
          curated?.ipoStatus === 'upcoming'
            ? 'UPCOMING'
            : curated?.ipoDate
              ? curated.ipoDate
              : d.ipoYear && d.isIpo
                ? `${d.ipoYear} IPO`
                : undefined,
        ipoStatus: curated?.ipoStatus ?? (d.isIpo ? 'live' : undefined),
        ipoRange: curated?.ipoRangeLabel,
      });
    }

    // 2. Ensure all Curated Flagship & Featured IPOs are present
    for (const m of [...FLAGSHIP_TICKERS, ...FEATURED_IPOS]) {
      const existing = byTicker.get(m.ticker);
      const hl = ctxMap[m.ticker];
      const dir = directoryMap[m.ticker];
      const price = hl?.markPx ?? dir?.lastSale ?? existing?.price ?? m.referencePrice ?? null;
      const refPx = m.referencePrice ?? hl?.prevDayPx ?? null;
      const pct =
        price !== null && refPx !== null && refPx > 0
          ? ((price - refPx) / refPx) * 100
          : existing?.pctChange ?? null;
      const mcap =
        dir?.marketCap ??
        (price && m.dilutedSharesBillions ? price * m.dilutedSharesBillions * 1e9 : null);

      byTicker.set(m.ticker, {
        ticker: m.ticker,
        name: m.name,
        exchange: m.exchange ?? existing?.exchange ?? 'NASDAQ',
        sector: existing?.sector ?? m.sector,
        price,
        pctChange: pct,
        marketCap: mcap,
        volumeUsd: hl ? hl.dayNtlVlm : existing?.volumeUsd ?? 0,
        isLive247: Boolean(hl),
        isIpo: Boolean(m.isIpo || existing?.isIpo),
        ipoTag:
          m.ipoStatus === 'upcoming'
            ? `UPCOMING • ${m.ipoDate ?? '2026'}`
            : m.ipoDate ?? existing?.ipoTag,
        ipoStatus: m.ipoStatus ?? existing?.ipoStatus,
        ipoRange: m.ipoRangeLabel ?? existing?.ipoRange,
      });
    }

    // 3. Ensure all live Hyperliquid HIP-3 markets are present
    for (const [ticker, ctx] of Object.entries(ctxMap)) {
      if (byTicker.has(ticker)) continue;
      const pct =
        ctx.prevDayPx && ctx.prevDayPx > 0
          ? ((ctx.markPx - ctx.prevDayPx) / ctx.prevDayPx) * 100
          : null;
      byTicker.set(ticker, {
        ticker,
        name:
          ticker === 'XYZ100'
            ? 'Nasdaq 100 Index'
            : ticker === 'SP500'
              ? 'S&P 500 Index'
              : ticker,
        exchange: ctx.coin.split(':')[0].toUpperCase(),
        sector: '24/7 Perp Market',
        price: ctx.markPx,
        pctChange: pct,
        marketCap: null,
        volumeUsd: ctx.dayNtlVlm,
        isLive247: true,
        isIpo: false,
      });
    }

    return Array.from(byTicker.values());
  }, [directory, directoryMap, ctxMap]);

  const counts = useMemo(() => {
    let ipoCount = 0;
    let liveCount = 0;
    for (const r of allRows) {
      if (r.isIpo) ipoCount += 1;
      if (r.isLive247) liveCount += 1;
    }
    return {
      confluence: allConfluenceReports.length,
      all: allRows.length,
      ipos: ipoCount,
      live247: liveCount,
      watchlist: pinnedTickers.length,
    };
  }, [allRows, allConfluenceReports.length, pinnedTickers.length]);

  const cleanQuery = query.trim().toUpperCase().replace(/^\$/, '');

  const filteredConfluence = useMemo(() => {
    return allConfluenceReports.filter((rep) => {
      if (only247 && !rep.isLive247) return false;
      if (onlyIpos && !rep.isIpo) return false;

      if (screenerPreset === 'bull3') {
        if (rep.bias !== 'bull' || rep.alignedCount < 2) return false;
      } else if (screenerPreset === 'bear3') {
        if (rep.bias !== 'bear' || rep.alignedCount < 2) return false;
      } else if (screenerPreset === 'whale') {
        const w = rep.pillars.find((p) => p.id === 'whale');
        if (!w || !w.active) return false;
      } else if (screenerPreset === 'insider') {
        const ins = rep.pillars.find((p) => p.id === 'insider');
        if (
          !ins ||
          !ins.active ||
          (!ins.headline.includes('CONGRESS') &&
            !ins.headline.includes('CLUSTER') &&
            !ins.evidence.includes('Form 4'))
        ) {
          return false;
        }
      } else if (screenerPreset === 'squeeze') {
        const ins = rep.pillars.find((p) => p.id === 'insider');
        const p24 = rep.pillars.find((p) => p.id === 'perp247');
        const hasSqz =
          (ins?.active &&
            (ins.headline.includes('SQUEEZE') || ins.evidence.includes('SQZ'))) ||
          (p24?.active && p24.headline.includes('SQUEEZE'));
        if (!hasSqz) return false;
      } else if (screenerPreset === 'earnings') {
        if (!rep.catalystStatus.earnings || rep.catalystStatus.earnings.daysUntil > 45) {
          return false;
        }
      }

      if (cleanQuery) {
        const matchesMeta =
          rep.ticker.includes(cleanQuery) ||
          rep.name.toUpperCase().includes(cleanQuery) ||
          rep.topEvidence.some((e) => e.toUpperCase().includes(cleanQuery));
        if (!matchesMeta) return false;
      }

      return true;
    });
  }, [allConfluenceReports, screenerPreset, only247, onlyIpos, cleanQuery]);

  const filteredRows = useMemo(() => {
    let list = allRows;

    if (tab === 'ipos') {
      list = list.filter((r) => r.isIpo);
    } else if (tab === 'live247') {
      list = list.filter((r) => r.isLive247);
    } else if (tab === 'watchlist') {
      list = list.filter((r) => pinnedSet.has(r.ticker));
    }

    if (exchangeFilter !== 'ALL' && tab === 'all') {
      list = list.filter((r) => r.exchange === exchangeFilter);
    }
    if (sectorFilter !== 'ALL' && tab === 'all') {
      list = list.filter((r) => r.sector === sectorFilter);
    }

    if (cleanQuery) {
      list = list.filter(
        (r) =>
          r.ticker.includes(cleanQuery) ||
          r.name.toUpperCase().includes(cleanQuery) ||
          r.sector.toUpperCase().includes(cleanQuery) ||
          r.exchange.toUpperCase().includes(cleanQuery),
      );
    }

    const featuredIpoOrder = new Map(FEATURED_IPOS.map((f, i) => [f.ticker, i]));

    return [...list].sort((a, b) => {
      if (cleanQuery) {
        const aExact = a.ticker === cleanQuery ? 1 : 0;
        const bExact = b.ticker === cleanQuery ? 1 : 0;
        if (aExact !== bExact) return bExact - aExact;
        const aStarts = a.ticker.startsWith(cleanQuery) ? 1 : 0;
        const bStarts = b.ticker.startsWith(cleanQuery) ? 1 : 0;
        if (aStarts !== bStarts) return bStarts - aStarts;
      }

      if (tab === 'ipos') {
        const aIdx = featuredIpoOrder.get(a.ticker);
        const bIdx = featuredIpoOrder.get(b.ticker);
        if (aIdx !== undefined && bIdx !== undefined) return aIdx - bIdx;
        if (aIdx !== undefined) return -1;
        if (bIdx !== undefined) return 1;
        return (b.marketCap ?? 0) - (a.marketCap ?? 0) || b.volumeUsd - a.volumeUsd;
      }

      if (tab === 'live247') {
        return b.volumeUsd - a.volumeUsd;
      }

      return (b.marketCap ?? 0) - (a.marketCap ?? 0) || b.volumeUsd - a.volumeUsd;
    });
  }, [allRows, tab, exchangeFilter, sectorFilter, cleanQuery, pinnedSet]);

  const canDirectLaunch =
    VALID_TICKER_RE.test(cleanQuery) &&
    !(tab === 'confluence'
      ? filteredConfluence.some((r) => r.ticker === cleanQuery)
      : filteredRows.some((r) => r.ticker === cleanQuery));

  if (!open) return null;

  const launchTicker = (ticker: string) => {
    onSelectTicker(ticker);
    onClose();
  };

  return (
    <div
      className="explorer-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label="aINVEST Universal Stocks, IPOs & Multi-Signal Confluence Screener"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="explorer-modal">
        <div className="explorer-header">
          <div className="explorer-title-group">
            <Globe size={15} className="text-emerald" aria-hidden="true" />
            <div>
              <h2 className="explorer-title">
                ALL STOCKS, IPOs &amp; CONFLUENCE SCREENER
              </h2>
              <p className="explorer-subtitle mono">
                {directoryLoading && directory.length === 0
                  ? 'Syncing full NASDAQ / NYSE / AMEX directory…'
                  : `${counts.confluence} Multi-Signal Setups • ${counts.all.toLocaleString()} US Stocks & ETFs • ${counts.ipos.toLocaleString()} IPOs • ${counts.live247} 24/7 Live`}
              </p>
            </div>
          </div>

          <button
            type="button"
            className="icon-action-btn"
            onClick={onClose}
            aria-label="Close Market Explorer"
          >
            <X size={14} />
            <span>ESC</span>
          </button>
        </div>

        {/* Search + Direct Any-Ticker Launch */}
        <div className="explorer-search-bar">
          <Search size={14} className="explorer-search-icon" aria-hidden="true" />
          <input
            ref={inputRef}
            type="text"
            className="explorer-search-input mono"
            placeholder="Search any stock, ETF, IPO, or signal (e.g. NVDA, PLTR, CONGRESS, SQUEEZE, SPCX…)"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setVisibleLimit(60);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                if (tab === 'confluence' && filteredConfluence.length > 0) {
                  launchTicker(filteredConfluence[0].ticker);
                } else if (filteredRows.length > 0) {
                  launchTicker(filteredRows[0].ticker);
                } else if (VALID_TICKER_RE.test(cleanQuery)) {
                  launchTicker(cleanQuery);
                }
              }
            }}
          />
          {query && (
            <button
              type="button"
              className="explorer-clear-btn"
              onClick={() => setQuery('')}
              aria-label="Clear search"
            >
              <X size={12} />
            </button>
          )}
        </div>

        {/* Category Tabs */}
        <div className="explorer-tabs-bar" role="tablist" aria-label="Market categories">
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'confluence'}
            className={`explorer-tab mono${tab === 'confluence' ? ' active' : ''}`}
            onClick={() => {
              setTab('confluence');
              setVisibleLimit(60);
            }}
          >
            <Layers size={12} />
            <span>CONFLUENCE SCREENER ({counts.confluence})</span>
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={tab === 'ipos'}
            className={`explorer-tab mono${tab === 'ipos' ? ' active' : ''}`}
            onClick={() => {
              setTab('ipos');
              setVisibleLimit(60);
            }}
          >
            <Flame size={12} />
            <span>IPOs &amp; PIPELINE ({counts.ipos})</span>
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={tab === 'all'}
            className={`explorer-tab mono${tab === 'all' ? ' active' : ''}`}
            onClick={() => {
              setTab('all');
              setVisibleLimit(60);
            }}
          >
            <Globe size={12} />
            <span>ALL STOCKS &amp; ETFs ({counts.all.toLocaleString()})</span>
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={tab === 'live247'}
            className={`explorer-tab mono${tab === 'live247' ? ' active' : ''}`}
            onClick={() => {
              setTab('live247');
              setVisibleLimit(60);
            }}
          >
            <Zap size={12} />
            <span>24/7 LIVE PERPS ({counts.live247})</span>
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={tab === 'watchlist'}
            className={`explorer-tab mono${tab === 'watchlist' ? ' active' : ''}`}
            onClick={() => {
              setTab('watchlist');
              setVisibleLimit(60);
            }}
          >
            <Star size={12} />
            <span>PINNED ({counts.watchlist})</span>
          </button>
        </div>

        {/* Multi-Signal Smart-Money Presets for Confluence Screener */}
        {tab === 'confluence' && (
          <div className="explorer-filters-strip">
            <div className="explorer-filter-group">
              {SCREENER_PRESETS.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  className={`explorer-chip mono${screenerPreset === p.id ? ' active' : ''}`}
                  onClick={() => setScreenerPreset(p.id)}
                >
                  {p.label}
                </button>
              ))}
            </div>

            <div className="explorer-filter-group">
              <button
                type="button"
                className={`explorer-chip mono${only247 ? ' active' : ''}`}
                onClick={() => setOnly247((v) => !v)}
              >
                24/7 PERPS ONLY
              </button>
              <button
                type="button"
                className={`explorer-chip mono${onlyIpos ? ' active' : ''}`}
                onClick={() => setOnlyIpos((v) => !v)}
              >
                IPOs ONLY
              </button>
            </div>
          </div>
        )}

        {/* Exchange & Sector Sub-Filters for All Stocks */}
        {tab === 'all' && (
          <div className="explorer-filters-strip">
            <div className="explorer-filter-group">
              {(['ALL', 'NASDAQ', 'NYSE', 'AMEX'] as const).map((ex) => (
                <button
                  key={ex}
                  type="button"
                  className={`explorer-chip mono${exchangeFilter === ex ? ' active' : ''}`}
                  onClick={() => {
                    setExchangeFilter(ex);
                    setVisibleLimit(60);
                  }}
                >
                  {ex}
                </button>
              ))}
            </div>

            <div className="explorer-filter-group">
              {TOP_SECTORS.map((sec) => (
                <button
                  key={sec}
                  type="button"
                  className={`explorer-chip mono${sectorFilter === sec ? ' active' : ''}`}
                  onClick={() => {
                    setSectorFilter(sec);
                    setVisibleLimit(60);
                  }}
                >
                  {sec === 'ALL' ? 'ALL SECTORS' : sec.toUpperCase()}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Direct Arbitrary Ticker Launch Banner */}
        {canDirectLaunch && (
          <button
            type="button"
            className="explorer-direct-launch"
            onClick={() => launchTicker(cleanQuery)}
          >
            <div className="explorer-direct-left">
              <Sparkles size={14} className="text-emerald" />
              <span>
                Open <strong className="mono">{cleanQuery}</strong> War Room directly
                (live chart, 5-pillar confluence, AI brief, technical gauge &amp; floor chat)
              </span>
            </div>
            <span className="explorer-direct-cta mono">
              OPEN {cleanQuery} <ArrowRight size={12} />
            </span>
          </button>
        )}

        {/* Results Table */}
        <div className="explorer-table-wrap">
          {tab === 'confluence' ? (
            filteredConfluence.length === 0 ? (
              <div className="explorer-empty">
                <p>
                  No tickers match this multi-signal filter right now — switch preset to{' '}
                  <strong>ALL SIGNALS</strong> or clear toggles.
                </p>
              </div>
            ) : (
              <>
                <div className="explorer-cf-header mono">
                  <span>TICKER / TOP EVIDENCE</span>
                  <span>5-PILLAR ALIGNMENT</span>
                  <span className="text-right">SCORE</span>
                  <span className="text-right">PRICE</span>
                  <span className="text-right">PIN</span>
                </div>

                <div className="explorer-rows">
                  {filteredConfluence.map((rep) => {
                    const isActive = rep.ticker === activeTicker;
                    const isPinned = pinnedSet.has(rep.ticker);
                    const isUp = rep.changePct !== null && rep.changePct >= 0;

                    return (
                      <div
                        key={rep.ticker}
                        className={`explorer-cf-row${isActive ? ' active' : ''}`}
                        onClick={() => launchTicker(rep.ticker)}
                        role="button"
                        tabIndex={0}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            launchTicker(rep.ticker);
                          }
                        }}
                      >
                        <div className="explorer-cell-main">
                          <div className="explorer-ticker-line">
                            <span className="explorer-row-ticker mono">{rep.ticker}</span>
                            {rep.isIpo && (
                              <span className="explorer-badge explorer-badge--emerald mono">
                                IPO
                              </span>
                            )}
                            {rep.isLive247 && (
                              <span className="explorer-badge explorer-badge--live mono">
                                24/7
                              </span>
                            )}
                            {rep.catalystStatus.earnings &&
                              rep.catalystStatus.earnings.daysUntil <= 30 && (
                                <span className="explorer-badge explorer-badge--amber mono">
                                  <AlertTriangle size={9} /> ERN{' '}
                                  {rep.catalystStatus.earnings.countdownLabel}
                                </span>
                              )}
                          </div>
                          <span className="explorer-row-name mono">
                            {rep.topEvidence.slice(0, 2).join(' • ') || rep.name}
                          </span>
                        </div>

                        <div className="confluence-pillar-pills mono">
                          {rep.pillars.map((p) => (
                            <span
                              key={p.id}
                              className={`cf-mini-pill cf-mini-pill--${
                                !p.active ? 'idle' : p.direction
                              }`}
                              title={`${p.label}: ${p.headline} — ${p.evidence}`}
                            >
                              {p.shortLabel}
                            </span>
                          ))}
                        </div>

                        <div className="explorer-cf-score mono">
                          <span className="confluence-score-num">{rep.score}</span>
                          <span
                            className={`confluence-align-pill confluence-align-pill--${rep.bias}`}
                          >
                            {rep.alignedCount}/{Math.max(rep.activePillars, 1)}{' '}
                            {rep.bias === 'bull'
                              ? 'BULL'
                              : rep.bias === 'bear'
                                ? 'BEAR'
                                : 'MIX'}
                          </span>
                        </div>

                        <div className="explorer-cf-price mono">
                          <span>
                            {rep.price !== null ? `$${rep.price.toFixed(2)}` : '—'}
                          </span>
                          <span
                            className={
                              rep.changePct === null
                                ? 'text-muted'
                                : isUp
                                  ? 'text-emerald'
                                  : 'text-crimson'
                            }
                          >
                            {rep.changePct !== null
                              ? `${isUp ? '+' : ''}${rep.changePct.toFixed(1)}%`
                              : '—'}
                          </span>
                        </div>

                        <div className="explorer-cell-pin">
                          <button
                            type="button"
                            className={`pin-star-btn${isPinned ? ' pinned' : ''}`}
                            onClick={(e) => {
                              e.stopPropagation();
                              onTogglePin(rep.ticker);
                            }}
                            title={
                              isPinned
                                ? `Unpin ${rep.ticker} from War Room bar`
                                : `Pin ${rep.ticker} to War Room bar`
                            }
                            aria-label={isPinned ? `Unpin ${rep.ticker}` : `Pin ${rep.ticker}`}
                          >
                            <Star size={13} fill={isPinned ? 'currentColor' : 'none'} />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </>
            )
          ) : filteredRows.length === 0 ? (
            <div className="explorer-empty">
              {tab === 'watchlist' ? (
                <p>
                  No pinned rooms yet. Click the <Star size={12} style={{ display: 'inline' }} /> star
                  on any stock or IPO to pin it to your War Room bar.
                </p>
              ) : (
                <p>
                  No directory matches for &ldquo;{query}&rdquo;.
                  {VALID_TICKER_RE.test(cleanQuery)
                    ? ` Press Enter above to launch ${cleanQuery} directly.`
                    : ''}
                </p>
              )}
            </div>
          ) : (
            <>
              <div className="explorer-grid-header mono">
                <span>TICKER / COMPANY</span>
                <span>VENUE / STATUS</span>
                <span className="text-right">PRICE</span>
                <span className="text-right">CHANGE</span>
                <span className="text-right">MKT CAP</span>
                <span className="text-right">PIN</span>
              </div>

              <div className="explorer-rows">
                {filteredRows.slice(0, visibleLimit).map((row) => {
                  const isActive = row.ticker === activeTicker;
                  const isPinned = pinnedSet.has(row.ticker);
                  const isUp = row.pctChange !== null && row.pctChange >= 0;

                  return (
                    <div
                      key={row.ticker}
                      className={`explorer-row${isActive ? ' active' : ''}`}
                      onClick={() => launchTicker(row.ticker)}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          launchTicker(row.ticker);
                        }
                      }}
                    >
                      <div className="explorer-cell-main">
                        <div className="explorer-ticker-line">
                          <span className="explorer-row-ticker mono">{row.ticker}</span>
                          {row.isIpo && (
                            <span
                              className={`explorer-badge mono ${
                                row.ipoStatus === 'upcoming'
                                  ? 'explorer-badge--amber'
                                  : 'explorer-badge--emerald'
                              }`}
                            >
                              {row.ipoStatus === 'upcoming' ? 'UPCOMING IPO' : 'IPO'}
                            </span>
                          )}
                          {row.isLive247 && (
                            <span className="explorer-badge explorer-badge--live mono">
                              24/7
                            </span>
                          )}
                        </div>
                        <span className="explorer-row-name">
                          {row.name}
                          {row.ipoRange ? ` • ${row.ipoRange}` : ''}
                        </span>
                      </div>

                      <div className="explorer-cell-venue mono">
                        <span className="explorer-ex-tag">{row.exchange}</span>
                        <span className="explorer-sector-tag">
                          {row.ipoTag ?? row.sector}
                        </span>
                      </div>

                      <span className="explorer-cell-num mono">
                        {row.price !== null ? `$${row.price.toFixed(2)}` : '—'}
                      </span>

                      <span
                        className={`explorer-cell-num mono ${
                          row.pctChange === null
                            ? ''
                            : isUp
                              ? 'text-emerald'
                              : 'text-crimson'
                        }`}
                      >
                        {row.pctChange !== null
                          ? `${isUp ? '+' : ''}${row.pctChange.toFixed(2)}%`
                          : '—'}
                      </span>

                      <span className="explorer-cell-num mono text-muted">
                        {formatCompactCap(row.marketCap)}
                      </span>

                      <div className="explorer-cell-pin">
                        <button
                          type="button"
                          className={`pin-star-btn${isPinned ? ' pinned' : ''}`}
                          onClick={(e) => {
                            e.stopPropagation();
                            onTogglePin(row.ticker);
                          }}
                          title={
                            isPinned
                              ? `Unpin ${row.ticker} from War Room bar`
                              : `Pin ${row.ticker} to War Room bar`
                          }
                          aria-label={isPinned ? `Unpin ${row.ticker}` : `Pin ${row.ticker}`}
                        >
                          <Star size={13} fill={isPinned ? 'currentColor' : 'none'} />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>

              {filteredRows.length > visibleLimit && (
                <div className="explorer-load-more-wrap">
                  <button
                    type="button"
                    className="explorer-load-more-btn mono"
                    onClick={() => setVisibleLimit((prev) => prev + 80)}
                  >
                    LOAD MORE ({(filteredRows.length - visibleLimit).toLocaleString()} remaining)
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
