import { useMemo, useState } from 'react';
import {
  Activity,
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  ExternalLink,
  Flame,
  Globe,
  Newspaper,
  RefreshCw,
  Star,
  TrendingUp,
} from 'lucide-react';
import { CURATED_MAP, FEATURED_IPOS } from '../data/tickers';
import type { DailyBreadCall } from '../lib/dailyBreadEngine';
import type { HlAssetCtx } from '../lib/hyperliquidFeed';
import type { DirectoryEntry } from '../lib/marketCatalog';
import {
  FALLBACK_EDITORIAL_IMAGES,
  formatRelativeAge,
  getInitialEditorialNews,
  getPublisherGroup,
  type NewsArticle,
  type NewsCategory,
} from '../lib/newsFeed';
import type { TrackedTrade } from '../lib/paperTrades';
import { THEME_MAP, type ThemeId } from '../lib/themes';
import type { MarketQuote } from '../lib/universalFeed';
import { DailyBreadDesk } from './DailyBreadDesk';
import type { ExplorerTab } from './MarketExplorerModal';
import { OvernightRadarPanel } from './OvernightRadarPanel';
import { TradingViewEmbed } from './TradingViewEmbed';

const TV_TIMELINE_SCRIPT =
  'https://s3.tradingview.com/external-embedding/embed-widget-timeline.js';

type FeedTab = NewsCategory | 'tv-wire';
type MoverTab = 'active' | 'gainers' | 'losers';

interface LandingPageProps {
  ctxMap: Record<string, HlAssetCtx>;
  quoteMap: Record<string, MarketQuote>;
  directory: DirectoryEntry[];
  directoryMap: Record<string, DirectoryEntry>;
  pinnedTickers: string[];
  themeId: ThemeId;
  articles: NewsArticle[];
  liveNewsCount: number;
  lastNewsUpdated: string;
  refreshingNews: boolean;
  trackedTrades: TrackedTrade[];
  onRefreshNews: () => void;
  onTrackCall: (call: DailyBreadCall) => void;
  onArmAlert: (params: {
    ticker: string;
    targetPrice: number;
    currentPrice?: number | null;
    label: string;
  }) => void;
  onCloseTrade: (id: string, livePrice?: number) => void;
  onRemoveTrade: (id: string) => void;
  onClearClosedTrades: () => void;
  onSelectTicker: (ticker: string) => void;
  onOpenExplorer: (tab?: ExplorerTab) => void;
  onOpenDailyBread: () => void;
  onTogglePin: (ticker: string) => void;
}

interface PulseBenchmark {
  ticker: string;
  fallbackTicker?: string;
  label: string;
  name: string;
  tag: string;
  sparkUp: string;
  sparkDown: string;
}

const PULSE_BENCHMARKS: PulseBenchmark[] = [
  {
    ticker: 'XYZ100',
    fallbackTicker: 'QQQ',
    label: 'NDX 100',
    name: 'Nasdaq 100',
    tag: 'INDEX',
    sparkUp: '2,22 14,18 26,20 38,14 50,15 62,9 74,11 86,5',
    sparkDown: '2,7 14,10 26,8 38,14 50,13 62,19 74,17 86,23',
  },
  {
    ticker: 'SP500',
    fallbackTicker: 'SPY',
    label: 'S&P 500',
    name: 'US Large Cap',
    tag: 'INDEX',
    sparkUp: '2,20 14,19 26,16 38,17 50,12 62,13 74,8 86,6',
    sparkDown: '2,6 14,8 26,11 38,10 50,16 62,15 74,20 86,22',
  },
  {
    ticker: 'ANT',
    label: 'ANT',
    name: 'Anthropic IPO',
    tag: 'IPO',
    sparkUp: '2,23 14,14 26,16 38,9 50,11 62,7 74,9 86,5',
    sparkDown: '2,5 14,9 26,8 38,14 50,16 62,19 74,18 86,23',
  },
  {
    ticker: 'NVDA',
    label: 'NVDA',
    name: 'NVIDIA Corp.',
    tag: 'AI',
    sparkUp: '2,21 14,17 26,19 38,13 50,11 62,14 74,8 86,5',
    sparkDown: '2,6 14,11 26,9 38,15 50,17 62,14 74,21 86,23',
  },
  {
    ticker: 'SPCX',
    label: 'SPCX',
    name: 'SpaceX IPO',
    tag: 'IPO',
    sparkUp: '2,22 14,20 26,15 38,16 50,12 62,10 74,7 86,6',
    sparkDown: '2,7 14,9 26,13 38,12 50,17 62,18 74,21 86,22',
  },
];

const TRENDING_SYMBOLS = [
  'ANT',
  'NVDA',
  'TSLA',
  'SPCX',
  'PLTR',
  'GOOGL',
  'AMZN',
  'MSFT',
];

const IPO_SPOTLIGHT_SYMBOLS = ['ANT', 'SPCX', 'SKHY', 'CBRS', 'CRWV', 'CRCL', 'NSCL'];

function resolveLivePrice(
  ticker: string,
  ctxMap: Record<string, HlAssetCtx>,
  quoteMap: Record<string, MarketQuote>,
  directoryMap: Record<string, DirectoryEntry>,
): { price: number | null; pct: number | null } {
  const hl = ctxMap[ticker];
  const liveQ = quoteMap[ticker];
  const dir = directoryMap[ticker];
  const curated = CURATED_MAP[ticker];

  const price = hl?.markPx ?? liveQ?.price ?? dir?.lastSale ?? null;
  const baseRef = curated?.referencePrice ?? hl?.prevDayPx ?? liveQ?.prevClose ?? null;
  const pct =
    price !== null && baseRef !== null && baseRef > 0
      ? ((price - baseRef) / baseRef) * 100
      : liveQ?.changePct ?? dir?.pctChange ?? null;

  return { price, pct };
}

export function LandingPage({
  ctxMap,
  quoteMap,
  directory,
  directoryMap,
  pinnedTickers,
  themeId,
  articles,
  liveNewsCount,
  lastNewsUpdated,
  refreshingNews,
  trackedTrades,
  onRefreshNews,
  onTrackCall,
  onArmAlert,
  onCloseTrade,
  onRemoveTrade,
  onClearClosedTrades,
  onSelectTicker,
  onOpenExplorer,
  onOpenDailyBread,
  onTogglePin,
}: LandingPageProps) {
  const [feedTab, setFeedTab] = useState<FeedTab>('all');
  const [moverTab, setMoverTab] = useState<MoverTab>('active');

  const palette = THEME_MAP[themeId];
  const pinnedSet = useMemo(() => new Set(pinnedTickers), [pinnedTickers]);

  // Promote freshest live breaking news into Hero + 2 Feature slots with strict publisher diversity
  const { heroStory, featurePair, streamStories, breakingLead } = useMemo(() => {
    const editorialFallback = getInitialEditorialNews();
    const livePool = articles.filter((a) => a.isLiveFetched);
    const fallbackPool = [
      './news/hero-ipo-floor.jpg',
      './news/story-ai-compute.jpg',
      './news/story-wallstreet-macro.jpg',
    ];
    const usedFallbacks = new Set<string>();

    const attachDistinctFallback = (story: NewsArticle): NewsArticle => {
      if (story.imageUrl) return story;
      const preferred = FALLBACK_EDITORIAL_IMAGES[story.category];
      const chosen = !usedFallbacks.has(preferred)
        ? preferred
        : fallbackPool.find((img) => !usedFallbacks.has(img)) ?? preferred;
      usedFallbacks.add(chosen);
      return { ...story, imageUrl: chosen };
    };

    const pickDiverseTop3 = (pool: NewsArticle[]): NewsArticle[] => {
      const score = (a: NewsArticle) =>
        (a.tickers.length > 0 ? 32 : 0) +
        (a.imageUrl ? 22 : 0) +
        (a.isBreaking ? 18 : 0) +
        (a.sentiment && a.sentiment !== 'neutral' ? 6 : 0);

      const ranked = [...pool].sort((a, b) => {
        const diff = score(b) - score(a);
        if (diff !== 0) return diff;
        return b.publishedAt - a.publishedAt;
      });

      const picked: NewsArticle[] = [];
      const usedPublishers = new Set<string>();

      // Pass 1: At most 1 story per publisher group (CNBC, Yahoo Finance, MarketWatch, Investing.com)
      for (const story of ranked) {
        if (picked.length >= 3) break;
        const pub = getPublisherGroup(story.source);
        if (usedPublishers.has(pub)) continue;
        usedPublishers.add(pub);
        picked.push(story);
      }

      // Pass 2: Fill remaining slots only if fewer than 3 distinct outlets returned live items
      if (picked.length < 3) {
        const pickedIds = new Set(picked.map((p) => p.id));
        for (const story of ranked) {
          if (picked.length >= 3) break;
          if (pickedIds.has(story.id)) continue;
          pickedIds.add(story.id);
          picked.push(story);
        }
      }

      return picked.slice(0, 3).map(attachDistinctFallback);
    };

    let selectedTop: NewsArticle[];
    if (livePool.length >= 3) {
      selectedTop = pickDiverseTop3(livePool);
    } else if (livePool.length > 0) {
      selectedTop = pickDiverseTop3([...livePool, ...editorialFallback]);
    } else {
      selectedTop = editorialFallback.slice(0, 3);
    }

    const [hero, feat1, feat2] = selectedTop;
    const topIds = new Set(selectedTop.map((s) => s.id));
    const rest = articles.filter((a) => !topIds.has(a.id));

    const breaking =
      livePool[0] ??
      articles.find((a) => a.isBreaking) ??
      hero;

    return {
      heroStory: hero,
      featurePair: [feat1, feat2],
      streamStories: rest,
      breakingLead: breaking,
    };
  }, [articles]);

  const filteredStream = useMemo(() => {
    if (feedTab === 'all' || feedTab === 'tv-wire') return streamStories;
    return articles.filter((a) => a.category === feedTab);
  }, [feedTab, streamStories, articles]);

  // Compute live Market Movers (Most Active, Top Gainers, Top Losers) from 7,290-stock directory + Hyperliquid
  const marketMovers = useMemo(() => {
    interface MoverRow {
      ticker: string;
      name: string;
      price: number;
      pct: number;
      volumeUsd: number;
      isIpo: boolean;
    }

    const candidates: MoverRow[] = [];
    const seen = new Set<string>();

    // Prioritize liquid US primary stocks (market cap >= $5B or live on HL)
    for (const d of directory) {
      if (d.isDerivativeListing || !d.lastSale || d.lastSale < 2) continue;
      if ((d.marketCap ?? 0) < 5e9 && !ctxMap[d.ticker]) continue;
      const hl = ctxMap[d.ticker];
      const price = hl?.markPx ?? d.lastSale;
      const pct =
        hl?.prevDayPx && hl.prevDayPx > 0
          ? ((hl.markPx - hl.prevDayPx) / hl.prevDayPx) * 100
          : d.pctChange;
      if (pct === null || !Number.isFinite(pct) || Math.abs(pct) > 120) continue;

      seen.add(d.ticker);
      candidates.push({
        ticker: d.ticker,
        name: CURATED_MAP[d.ticker]?.name ?? d.name,
        price,
        pct,
        volumeUsd: hl ? hl.dayNtlVlm : d.volume * price,
        isIpo: d.isIpo,
      });
    }

    // Add live Hyperliquid equities not yet in directory (e.g. ANT on Day 1)
    for (const [ticker, ctx] of Object.entries(ctxMap)) {
      if (seen.has(ticker) || ticker === 'XYZ100' || ticker === 'SP500') continue;
      const curated = CURATED_MAP[ticker];
      const refPx = curated?.referencePrice ?? ctx.prevDayPx;
      const pct = refPx && refPx > 0 ? ((ctx.markPx - refPx) / refPx) * 100 : 0;
      candidates.push({
        ticker,
        name: curated?.name ?? ticker,
        price: ctx.markPx,
        pct,
        volumeUsd: ctx.dayNtlVlm,
        isIpo: Boolean(curated?.isIpo),
      });
    }

    if (moverTab === 'gainers') {
      return [...candidates]
        .filter((c) => c.pct > 0)
        .sort((a, b) => b.pct - a.pct)
        .slice(0, 7);
    }
    if (moverTab === 'losers') {
      return [...candidates]
        .filter((c) => c.pct < 0)
        .sort((a, b) => a.pct - b.pct)
        .slice(0, 7);
    }
    return [...candidates].sort((a, b) => b.volumeUsd - a.volumeUsd).slice(0, 7);
  }, [directory, ctxMap, moverTab]);

  const tvTimelineConfig = useMemo(
    () =>
      JSON.stringify({
        feedMode: 'market',
        market: 'stock',
        isTransparent: true,
        displayMode: 'regular',
        width: '100%',
        height: 620,
        colorTheme: palette.tvTheme,
        locale: 'en',
      }),
    [palette.tvTheme],
  );

  const renderTickerChip = (ticker: string) => {
    const { price, pct } = resolveLivePrice(ticker, ctxMap, quoteMap, directoryMap);
    const isUp = pct !== null && pct >= 0;
    return (
      <button
        key={ticker}
        type="button"
        className="news-ticker-chip mono"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          onSelectTicker(ticker);
        }}
        title={`Open ${ticker} Live War Room Terminal`}
      >
        <span className="news-ticker-sym">{ticker}</span>
        {price !== null && (
          <span className="news-ticker-px">${price.toFixed(2)}</span>
        )}
        {pct !== null && (
          <span className={isUp ? 'text-emerald' : 'text-crimson'}>
            {isUp ? '+' : ''}
            {pct.toFixed(1)}%
          </span>
        )}
      </button>
    );
  };

  return (
    <main className="landing-main" aria-label="aINVEST Markets Front Page and Breaking Stock News">
      {/* 1. Breaking News Dispatch Bar */}
      <section className="breaking-dispatch-bar" aria-label="Breaking market alert">
        <div className="breaking-dispatch-left">
          <span className="breaking-label mono">BREAKING</span>
          <a
            href={breakingLead.url}
            target="_blank"
            rel="noopener noreferrer"
            className="breaking-headline-link"
          >
            {breakingLead.title}
          </a>
        </div>

        <div className="breaking-dispatch-right">
          {breakingLead.tickers.slice(0, 2).map((t) => renderTickerChip(t))}
          <button
            type="button"
            className="dispatch-refresh-btn mono"
            onClick={onRefreshNews}
            disabled={refreshingNews}
            title="Refresh breaking stock news wire"
          >
            <RefreshCw size={11} className={refreshingNews ? 'spin-icon' : ''} />
            <span>
              {liveNewsCount > 0 ? `LIVE (${lastNewsUpdated})` : lastNewsUpdated}
            </span>
          </button>
        </div>
      </section>

      {/* 2. Live Market Pulse Benchmark Strip (Yahoo Finance Index Bar style) */}
      <section className="market-pulse-strip" aria-label="Live market benchmarks">
        {PULSE_BENCHMARKS.map((bm) => {
          const primary = resolveLivePrice(bm.ticker, ctxMap, quoteMap, directoryMap);
          const resolved =
            primary.price !== null || !bm.fallbackTicker
              ? { ticker: bm.ticker, ...primary }
              : {
                  ticker: bm.fallbackTicker,
                  ...resolveLivePrice(
                    bm.fallbackTicker,
                    ctxMap,
                    quoteMap,
                    directoryMap,
                  ),
                };
          const isUp = resolved.pct !== null ? resolved.pct >= 0 : true;
          const strokeColor = isUp ? palette.bull : palette.bear;

          return (
            <button
              key={bm.ticker}
              type="button"
              className="pulse-card"
              onClick={() => onSelectTicker(resolved.ticker)}
            >
              <div className="pulse-card-top">
                <div className="pulse-card-id">
                  <span className="pulse-card-label mono">{bm.label}</span>
                  <span className="pulse-card-tag mono">{bm.tag}</span>
                </div>
                <svg
                  viewBox="0 0 88 28"
                  className="pulse-sparkline"
                  aria-hidden="true"
                >
                  <polyline
                    fill="none"
                    stroke={strokeColor}
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    points={isUp ? bm.sparkUp : bm.sparkDown}
                  />
                </svg>
              </div>

              <div className="pulse-card-name">{bm.name}</div>

              <div className="pulse-card-bottom mono">
                <span className="pulse-card-price">
                  {resolved.price !== null ? `$${resolved.price.toFixed(2)}` : 'Live →'}
                </span>
                {resolved.pct !== null && (
                  <span
                    className={`pulse-card-pct ${
                      isUp ? 'text-emerald' : 'text-crimson'
                    }`}
                  >
                    {isUp ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />}
                    {isUp ? '+' : ''}
                    {resolved.pct.toFixed(2)}%
                  </span>
                )}
              </div>
            </button>
          );
        })}
      </section>

      {/* 3. Main 2-Column Editorial Newsroom + Sticky Live Market Rail */}
      <div className="landing-editorial-grid">
        {/* LEFT COLUMN: Editorial Lead Story + Feature Duo + Live Breaking Stream */}
        <div className="landing-news-column">
          {/* Lead Hero Editorial Story */}
          <article className="editorial-hero-card">
            <a
              href={heroStory.url}
              target="_blank"
              rel="noopener noreferrer"
              className="editorial-hero-media"
            >
              <img
                src={heroStory.imageUrl || './news/hero-ipo-floor.jpg'}
                alt={heroStory.title}
                className="editorial-hero-img"
                referrerPolicy="no-referrer"
                onError={(e) => {
                  const img = e.currentTarget;
                  if (!img.dataset.fallbackApplied) {
                    img.dataset.fallbackApplied = '1';
                    img.src = FALLBACK_EDITORIAL_IMAGES[heroStory.category];
                  }
                }}
              />
              <span className="editorial-media-kicker mono">
                {heroStory.isLiveFetched ? 'LIVE' : 'TOP STORY'} •{' '}
                {heroStory.source.toUpperCase()}
              </span>
            </a>

            <div className="editorial-hero-body">
              <div className="editorial-meta-row mono">
                <span className="editorial-source">{heroStory.source}</span>
                <span className="editorial-dot" aria-hidden="true">
                  •
                </span>
                <span>{formatRelativeAge(heroStory.publishedAt)}</span>
                {heroStory.isLiveFetched && (
                  <span className="news-live-tag">LIVE WIRE</span>
                )}
                {heroStory.sentiment && heroStory.sentiment !== 'neutral' && (
                  <span className={`news-sent-tag news-sent-tag--${heroStory.sentiment}`}>
                    {heroStory.sentiment === 'bull' ? 'BULLISH' : 'BEARISH'}
                  </span>
                )}
              </div>

              <h1 className="editorial-hero-headline">
                <a
                  href={heroStory.url}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {heroStory.title}
                </a>
              </h1>

              <p className="editorial-hero-deck">{heroStory.summary}</p>

              <div className="editorial-hero-footer">
                {heroStory.tickers.length > 0 && (
                  <div className="news-tickers-row">
                    {heroStory.tickers.map((t) => renderTickerChip(t))}
                  </div>
                )}

                <div className="editorial-hero-actions">
                  <button
                    type="button"
                    className="hero-warroom-cta mono"
                    onClick={() => onSelectTicker(heroStory.tickers[0] || 'ANT')}
                  >
                    <span>OPEN {heroStory.tickers[0] || 'ANT'} TERMINAL</span>
                    <ArrowRight size={13} />
                  </button>
                  <a
                    href={heroStory.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="hero-read-link mono"
                  >
                    <span>READ</span>
                    <ExternalLink size={11} />
                  </a>
                </div>
              </div>
            </div>
          </article>

          {/* 2-Up Secondary Editorial Feature Cards */}
          <div className="editorial-feature-duo">
            {featurePair.map((story, idx) => (
              <article key={story.id} className="editorial-feature-card">
                <a
                  href={story.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="editorial-feature-media"
                >
                  <img
                    src={
                      story.imageUrl ||
                      (idx === 0
                        ? './news/story-ai-compute.jpg'
                        : './news/story-wallstreet-macro.jpg')
                    }
                    alt={story.title}
                    className="editorial-feature-img"
                    referrerPolicy="no-referrer"
                    onError={(e) => {
                      const img = e.currentTarget;
                      if (!img.dataset.fallbackApplied) {
                        img.dataset.fallbackApplied = '1';
                        img.src =
                          idx === 0
                            ? './news/story-ai-compute.jpg'
                            : './news/story-wallstreet-macro.jpg';
                      }
                    }}
                  />
                </a>

                <div className="editorial-feature-body">
                  <div className="editorial-meta-row mono">
                    <span className="editorial-source">{story.source}</span>
                    <span className="editorial-dot" aria-hidden="true">
                      •
                    </span>
                    <span>{formatRelativeAge(story.publishedAt)}</span>
                    {story.isLiveFetched && (
                      <span className="news-live-tag">LIVE</span>
                    )}
                    {story.sentiment && story.sentiment !== 'neutral' && (
                      <span className={`news-sent-tag news-sent-tag--${story.sentiment}`}>
                        {story.sentiment === 'bull' ? 'BULLISH' : 'BEARISH'}
                      </span>
                    )}
                  </div>

                  <h2 className="editorial-feature-headline">
                    <a
                      href={story.url}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      {story.title}
                    </a>
                  </h2>

                  <p className="editorial-feature-summary">{story.summary}</p>

                  {story.tickers.length > 0 && (
                    <div className="news-tickers-row">
                      {story.tickers.slice(0, 3).map((t) => renderTickerChip(t))}
                    </div>
                  )}
                </div>
              </article>
            ))}
          </div>

          {/* Breaking News Feed Section with Yahoo-Style Category Tabs */}
          <section className="news-stream-panel" aria-label="Latest breaking stock market news">
            <div className="news-stream-header">
              <div className="panel-title-group">
                <Newspaper size={14} className="text-emerald" aria-hidden="true" />
                <h2 className="panel-title">LATEST MARKET NEWS</h2>
                <span className="panel-badge panel-badge--emerald">
                  {liveNewsCount > 0 ? `${liveNewsCount} LIVE WIRE` : 'MARKET DESK'}
                </span>
              </div>

              <div className="news-tabs-row" role="tablist" aria-label="Filter news by topic">
                {(
                  [
                    ['all', 'Top Stories'],
                    ['stocks', 'Stocks'],
                    ['ipos', 'IPOs'],
                    ['ai-tech', 'Tech & AI'],
                    ['macro', 'Macro & Fed'],
                    ['tv-wire', 'Live Wire'],
                  ] as Array<[FeedTab, string]>
                ).map(([id, label]) => (
                  <button
                    key={id}
                    type="button"
                    role="tab"
                    aria-selected={feedTab === id}
                    className={`news-cat-tab mono${feedTab === id ? ' active' : ''}`}
                    onClick={() => setFeedTab(id)}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {feedTab === 'tv-wire' ? (
              <div className="news-tv-wire-frame">
                <TradingViewEmbed
                  scriptSrc={TV_TIMELINE_SCRIPT}
                  configJson={tvTimelineConfig}
                  fillHeight
                  ariaLabel="TradingView Live Stock Market News Timeline"
                />
              </div>
            ) : (
              <div className="news-stream-list">
                {filteredStream.length === 0 ? (
                  <div className="news-stream-empty mono">
                    No stories in this category yet — switch to Top Stories or Live Wire.
                  </div>
                ) : (
                  filteredStream.slice(0, 18).map((item) => (
                    <article key={item.id} className="news-stream-item">
                      <div className="news-stream-content">
                        <div className="editorial-meta-row mono">
                          <span className="editorial-source">{item.source}</span>
                          <span className="editorial-dot" aria-hidden="true">
                            •
                          </span>
                          <span>{formatRelativeAge(item.publishedAt)}</span>
                          {item.isLiveFetched && (
                            <span className="news-live-tag">LIVE</span>
                          )}
                          {item.category === 'ipos' && (
                            <span className="news-ipo-tag">IPO</span>
                          )}
                          {item.sentiment && item.sentiment !== 'neutral' && (
                            <span className={`news-sent-tag news-sent-tag--${item.sentiment}`}>
                              {item.sentiment === 'bull' ? 'BULLISH' : 'BEARISH'}
                            </span>
                          )}
                        </div>

                        <h3 className="news-stream-title">
                          <a
                            href={item.url}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            {item.title}
                          </a>
                        </h3>

                        <p className="news-stream-summary">{item.summary}</p>

                        {item.tickers.length > 0 && (
                          <div className="news-tickers-row">
                            {item.tickers.map((t) => renderTickerChip(t))}
                          </div>
                        )}
                      </div>

                      {item.imageUrl && (
                        <a
                          href={item.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="news-stream-thumb-wrap"
                        >
                          <img
                            src={item.imageUrl}
                            alt=""
                            className="news-stream-thumb"
                            loading="lazy"
                            referrerPolicy="no-referrer"
                            onError={(e) => {
                              const parent = e.currentTarget.parentElement;
                              if (parent) parent.style.display = 'none';
                            }}
                          />
                        </a>
                      )}
                    </article>
                  ))
                )}
              </div>
            )}
          </section>
        </div>

        {/* RIGHT COLUMN: Sticky Yahoo-Finance-Style Market Data Rail */}
        <aside className="landing-market-rail" aria-label="Live market movers, trending tickers and IPO radar">
          {/* Quick Terminal & Explorer Launch Card */}
          <section className="rail-card rail-launch-card">
            <div className="rail-launch-head">
              <span className="rail-launch-eyebrow mono">UNIVERSAL LIVE TERMINAL</span>
              <h2 className="rail-launch-title">
                Every US stock &amp; IPO. One live war room.
              </h2>
              <p className="rail-launch-sub">
                Open real-time charts, quantitative AI briefs, 17-indicator consensus,
                P&amp;L calculators, and live trader chat across{' '}
                <strong>
                  {directory.length > 0
                    ? `${directory.length.toLocaleString()}+`
                    : '7,290+'}
                </strong>{' '}
                NASDAQ, NYSE, AMEX &amp; 24/7 markets.
              </p>
            </div>
            <div className="rail-launch-actions">
              <button
                type="button"
                className="rail-primary-btn mono"
                onClick={() => onSelectTicker('ANT')}
              >
                <Activity size={13} />
                <span>OPEN LIVE TERMINAL</span>
              </button>
              <button
                type="button"
                className="rail-secondary-btn mono"
                onClick={() => onOpenExplorer('all')}
              >
                <Globe size={13} />
                <span>BROWSE ALL</span>
              </button>
            </div>
          </section>

          {/* Trending Tickers */}
          <section className="rail-card" aria-label="Trending stock tickers">
            <div className="rail-card-header">
              <div className="panel-title-group">
                <TrendingUp size={13} className="text-emerald" aria-hidden="true" />
                <h2 className="panel-title">TRENDING TICKERS</h2>
              </div>
              <button
                type="button"
                className="rail-header-link mono"
                onClick={() => onOpenExplorer('live247')}
              >
                24/7 LIVE →
              </button>
            </div>

            <div className="rail-quote-list">
              {TRENDING_SYMBOLS.map((sym) => {
                const { price, pct } = resolveLivePrice(
                  sym,
                  ctxMap,
                  quoteMap,
                  directoryMap,
                );
                const curated = CURATED_MAP[sym];
                const dir = directoryMap[sym];
                const isUp = pct !== null && pct >= 0;

                return (
                  <button
                    key={sym}
                    type="button"
                    className="rail-quote-row"
                    onClick={() => onSelectTicker(sym)}
                  >
                    <div className="rail-quote-left">
                      <div className="rail-quote-sym-line">
                        <span className="rail-quote-sym mono">{sym}</span>
                        {curated?.isIpo && (
                          <span className="room-pill-ipo mono">IPO</span>
                        )}
                      </div>
                      <span className="rail-quote-name">
                        {curated?.name ?? dir?.name ?? sym}
                      </span>
                    </div>

                    <div className="rail-quote-right mono">
                      <span className="rail-quote-price">
                        {price !== null ? `$${price.toFixed(2)}` : '—'}
                      </span>
                      <span
                        className={`rail-quote-pct ${
                          pct === null ? '' : isUp ? 'text-emerald' : 'text-crimson'
                        }`}
                      >
                        {pct !== null ? `${isUp ? '+' : ''}${pct.toFixed(2)}%` : '—'}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          </section>

          {/* Market Movers: Most Active / Top Gainers / Top Losers */}
          <section className="rail-card" aria-label="Market movers">
            <div className="rail-card-header">
              <h2 className="panel-title">MARKET MOVERS</h2>
              <div className="interval-tabs" role="tablist" aria-label="Mover category">
                {(
                  [
                    ['active', 'Active'],
                    ['gainers', 'Gainers'],
                    ['losers', 'Losers'],
                  ] as Array<[MoverTab, string]>
                ).map(([id, label]) => (
                  <button
                    key={id}
                    type="button"
                    role="tab"
                    aria-selected={moverTab === id}
                    className={`interval-tab${moverTab === id ? ' active' : ''}`}
                    onClick={() => setMoverTab(id)}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            <div className="rail-quote-list">
              {marketMovers.length === 0 ? (
                <div className="rail-empty mono">Syncing live US market movers…</div>
              ) : (
                marketMovers.map((m) => {
                  const isUp = m.pct >= 0;
                  return (
                    <button
                      key={m.ticker}
                      type="button"
                      className="rail-quote-row"
                      onClick={() => onSelectTicker(m.ticker)}
                    >
                      <div className="rail-quote-left">
                        <div className="rail-quote-sym-line">
                          <span className="rail-quote-sym mono">{m.ticker}</span>
                          {m.isIpo && <span className="room-pill-ipo mono">IPO</span>}
                        </div>
                        <span className="rail-quote-name">{m.name}</span>
                      </div>

                      <div className="rail-quote-right mono">
                        <span className="rail-quote-price">${m.price.toFixed(2)}</span>
                        <span
                          className={`rail-quote-pct ${
                            isUp ? 'text-emerald' : 'text-crimson'
                          }`}
                        >
                          {isUp ? '+' : ''}
                          {m.pct.toFixed(2)}%
                        </span>
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </section>

          {/* 24/7 Overnight Gap & Funding-Squeeze Radar (Hyperliquid HIP-3 Edge) */}
          <OvernightRadarPanel
            variant="rail"
            ctxMap={ctxMap}
            quoteMap={quoteMap}
            directoryMap={directoryMap}
            onSelectTicker={onSelectTicker}
          />

          {/* IPO Spotlight & 2026 Debuts */}
          <section className="rail-card" aria-label="2026 IPO Spotlight">
            <div className="rail-card-header">
              <div className="panel-title-group">
                <Flame size={13} className="text-amber" aria-hidden="true" />
                <h2 className="panel-title">IPO SPOTLIGHT</h2>
              </div>
              <button
                type="button"
                className="rail-header-link mono"
                onClick={() => onOpenExplorer('ipos')}
              >
                ALL IPOs →
              </button>
            </div>

            <div className="rail-quote-list">
              {IPO_SPOTLIGHT_SYMBOLS.map((sym) => {
                const ipoMeta =
                  FEATURED_IPOS.find((f) => f.ticker === sym) ?? CURATED_MAP[sym];
                const { price, pct } = resolveLivePrice(
                  sym,
                  ctxMap,
                  quoteMap,
                  directoryMap,
                );
                const isUp = pct !== null && pct >= 0;

                return (
                  <button
                    key={sym}
                    type="button"
                    className="rail-quote-row"
                    onClick={() => onSelectTicker(sym)}
                  >
                    <div className="rail-quote-left">
                      <div className="rail-quote-sym-line">
                        <span className="rail-quote-sym mono">{sym}</span>
                        <span className="rail-ipo-date mono">
                          {ipoMeta?.ipoStatus === 'upcoming'
                            ? 'UPCOMING'
                            : ipoMeta?.ipoDate ?? '2026'}
                        </span>
                      </div>
                      <span className="rail-quote-name">
                        {ipoMeta?.name ?? sym}
                        {ipoMeta?.ipoRaisedLabel ? ` • ${ipoMeta.ipoRaisedLabel}` : ''}
                      </span>
                    </div>

                    <div className="rail-quote-right mono">
                      <span className="rail-quote-price">
                        {price !== null
                          ? `$${price.toFixed(2)}`
                          : ipoMeta?.ipoRangeLabel ?? 'S-1'}
                      </span>
                      {pct !== null && (
                        <span
                          className={`rail-quote-pct ${
                            isUp ? 'text-emerald' : 'text-crimson'
                          }`}
                        >
                          {isUp ? '+' : ''}
                          {pct.toFixed(1)}%
                        </span>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          </section>

          {/* Pinned Watchlist Card */}
          <section className="rail-card" aria-label="Pinned Watchlist">
            <div className="rail-card-header">
              <div className="panel-title-group">
                <Star size={13} className="text-amber" aria-hidden="true" />
                <h2 className="panel-title">YOUR WATCHLIST</h2>
              </div>
              <button
                type="button"
                className="rail-header-link mono"
                onClick={() => onOpenExplorer('watchlist')}
              >
                MANAGE →
              </button>
            </div>

            {pinnedTickers.length === 0 ? (
              <div className="rail-watchlist-empty">
                <p>Pin any stock or IPO for 1-click access across Markets &amp; Terminal.</p>
                <div className="rail-quick-pins">
                  {['ANT', 'SPCX', 'NVDA', 'JPM', 'DIS'].map((sym) => (
                    <button
                      key={sym}
                      type="button"
                      className="rail-quick-pin-btn mono"
                      onClick={() => onTogglePin(sym)}
                    >
                      + {sym}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div className="rail-quote-list">
                {pinnedTickers.slice(0, 8).map((sym) => {
                  const { price, pct } = resolveLivePrice(
                    sym,
                    ctxMap,
                    quoteMap,
                    directoryMap,
                  );
                  const isUp = pct !== null && pct >= 0;
                  return (
                    <div
                      key={sym}
                      className="rail-quote-row"
                      role="button"
                      tabIndex={0}
                      onClick={() => onSelectTicker(sym)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          onSelectTicker(sym);
                        }
                      }}
                    >
                      <div className="rail-quote-left">
                        <span className="rail-quote-sym mono">{sym}</span>
                        <span className="rail-quote-name">
                          {CURATED_MAP[sym]?.name ?? directoryMap[sym]?.name ?? sym}
                        </span>
                      </div>
                      <div className="rail-quote-right mono">
                        <span className="rail-quote-price">
                          {price !== null ? `$${price.toFixed(2)}` : '—'}
                        </span>
                        <span
                          className={`rail-quote-pct ${
                            pct === null ? '' : isUp ? 'text-emerald' : 'text-crimson'
                          }`}
                        >
                          {pct !== null ? `${isUp ? '+' : ''}${pct.toFixed(2)}%` : '—'}
                        </span>
                      </div>
                      <button
                        type="button"
                        className={`pin-star-btn${pinnedSet.has(sym) ? ' pinned' : ''}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          onTogglePin(sym);
                        }}
                        title={`Unpin ${sym}`}
                        aria-label={`Unpin ${sym}`}
                      >
                        <Star size={12} fill="currentColor" />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        </aside>
      </div>

      {/* Daily Bread — Live AI Day-Trade Call Desk (Full-Width Bottom Preview below Media Articles) */}
      <DailyBreadDesk
        compact
        ctxMap={ctxMap}
        quoteMap={quoteMap}
        directoryMap={directoryMap}
        breakingNews={articles}
        trackedTrades={trackedTrades}
        onTrackCall={onTrackCall}
        onArmAlert={onArmAlert}
        onCloseTrade={onCloseTrade}
        onRemoveTrade={onRemoveTrade}
        onClearClosedTrades={onClearClosedTrades}
        onSelectTicker={onSelectTicker}
        onOpenFullDesk={onOpenDailyBread}
      />
    </main>
  );
}
