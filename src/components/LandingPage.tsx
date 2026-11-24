import { useMemo, useState } from 'react';
import {
  Activity,
  ArrowRight,
  ExternalLink,
  Flame,
  Globe,
  Newspaper,
  RefreshCw,
  Star,
  TrendingUp,
  Zap,
} from 'lucide-react';
import { CURATED_MAP, FEATURED_IPOS } from '../data/tickers';
import type { HlAssetCtx } from '../lib/hyperliquidFeed';
import type { DirectoryEntry } from '../lib/marketCatalog';
import {
  EDITORIAL_IMAGE_POOL,
  formatRelativeAge,
  getArticleFallbackImage,
  getInitialEditorialNews,
  getPublisherGroup,
  type NewsArticle,
  type NewsCategory,
} from '../lib/newsFeed';
import { THEME_MAP, type ThemeId } from '../lib/themes';
import type { MarketQuote } from '../lib/universalFeed';
import type { ExplorerTab } from './MarketExplorerModal';
import { OvernightRadarPanel } from './OvernightRadarPanel';
import { TradingViewEmbed } from './TradingViewEmbed';
import { AnimatedNumber } from './ui/AnimatedNumber';
import { MarketFlowCanvas } from './ui/MarketFlowCanvas';
import { SegmentedTabs, type SegmentedTabItem } from './ui/SegmentedTabs';
import { SpotlightSurface } from './ui/SpotlightCard';

const TV_TIMELINE_SCRIPT =
  'https://s3.tradingview.com/external-embedding/embed-widget-timeline.js';

type FeedTab = NewsCategory | 'watchlist' | 'tv-wire';
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
  onRefreshNews: () => void;
  onSelectTicker: (ticker: string) => void;
  onOpenExplorer: (tab?: ExplorerTab) => void;
  onOpenDailyBread: () => void;
  onTogglePin: (ticker: string) => void;
}

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
  onRefreshNews,
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
    const usedFallbacks = new Set<string>();

    const attachDistinctFallback = (story: NewsArticle): NewsArticle => {
      if (story.imageUrl) return story;
      const preferred = getArticleFallbackImage(story);
      const chosen = !usedFallbacks.has(preferred)
        ? preferred
        : EDITORIAL_IMAGE_POOL.find((img) => !usedFallbacks.has(img)) ?? preferred;
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
    if (feedTab === 'watchlist') {
      if (pinnedSet.size === 0) return [];
      return articles.filter((a) => a.tickers.some((t) => pinnedSet.has(t)));
    }
    return articles.filter((a) => a.category === feedTab);
  }, [feedTab, streamStories, articles, pinnedSet]);

  const streamWithImages = useMemo(() => {
    const out: Array<{
      item: NewsArticle;
      resolvedImg: string;
      fallbackImg: string;
    }> = [];
    const recentImgs: string[] = [];
    for (const item of filteredStream.slice(0, 18)) {
      const fallbackImg = getArticleFallbackImage(item, recentImgs.slice(-4));
      const resolvedImg = item.imageUrl || fallbackImg;
      recentImgs.push(resolvedImg);
      out.push({ item, resolvedImg, fallbackImg });
    }
    return out;
  }, [filteredStream]);

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

  // Compute live market breadth & regime telemetry to drive the hero status & WebGL flow tint
  const marketBreadth = useMemo(() => {
    let advancers = 0;
    let decliners = 0;
    const seen = new Set<string>();

    for (const d of directory) {
      if (d.isDerivativeListing || !d.lastSale || d.lastSale < 2) continue;
      if ((d.marketCap ?? 0) < 2e9 && !ctxMap[d.ticker]) continue;
      const hl = ctxMap[d.ticker];
      const pct =
        hl?.prevDayPx && hl.prevDayPx > 0
          ? ((hl.markPx - hl.prevDayPx) / hl.prevDayPx) * 100
          : d.pctChange;
      if (pct === null || !Number.isFinite(pct) || Math.abs(pct) > 120) continue;
      seen.add(d.ticker);
      if (pct >= 0) advancers += 1;
      else decliners += 1;
    }

    for (const [ticker, ctx] of Object.entries(ctxMap)) {
      if (seen.has(ticker)) continue;
      const refPx = CURATED_MAP[ticker]?.referencePrice ?? ctx.prevDayPx;
      if (!refPx || refPx <= 0) continue;
      const pct = ((ctx.markPx - refPx) / refPx) * 100;
      if (pct >= 0) advancers += 1;
      else decliners += 1;
    }

    const total = advancers + decliners;
    const advPct = total > 0 ? Math.round((advancers / total) * 100) : 54;
    const sentiment = total > 0 ? (advancers - decliners) / total : 0.15;
    const regime =
      advPct >= 58 ? 'RISK-ON' : advPct <= 42 ? 'RISK-OFF' : 'BALANCED';
    const live247Count = Object.keys(ctxMap).length;

    return {
      advancers,
      decliners,
      advPct,
      sentiment,
      regime,
      live247Count,
      trackedCount: directory.length > 0 ? directory.length : 7290,
    };
  }, [directory, ctxMap]);

  const feedTabItems = useMemo<ReadonlyArray<SegmentedTabItem<FeedTab>>>(
    () => [
      { id: 'all', label: 'Top Stories' },
      { id: 'stocks', label: 'Stocks' },
      { id: 'ipos', label: 'IPOs' },
      { id: 'ai-tech', label: 'Tech & AI' },
      { id: 'macro', label: 'Macro & Fed' },
      { id: 'watchlist', label: `★ Watchlist (${pinnedTickers.length})` },
      { id: 'tv-wire', label: 'Live Wire' },
    ],
    [pinnedTickers.length],
  );

  const moverTabItems = useMemo<ReadonlyArray<SegmentedTabItem<MoverTab>>>(
    () => [
      { id: 'active', label: 'Active' },
      { id: 'gainers', label: 'Gainers' },
      { id: 'losers', label: 'Losers' },
    ],
    [],
  );

  const maxMoverAbsPct = useMemo(() => {
    let maxVal = 2.5;
    for (const m of marketMovers) {
      const a = Math.abs(m.pct);
      if (a > maxVal) maxVal = a;
    }
    return maxVal;
  }, [marketMovers]);

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
    <main className="landing-main" aria-label="aINVEST News Front Page and Live Stock Market Wire">
      {/* 1. News Command Hero with Procedural WebGL Flow Backdrop + Docked Breaking Wire */}
      <section className="markets-command-hero" aria-label="News overview and terminal launch">
        <MarketFlowCanvas
          themeId={themeId}
          sentiment={marketBreadth.sentiment}
        />

        <div className="markets-command-inner">
          <div className="markets-command-copy">
            <div className="markets-command-kicker mono">
              <span>UNIVERSAL MARKET TERMINAL</span>
              <span className="editorial-dot" aria-hidden="true">•</span>
              <span
                className={
                  marketBreadth.regime === 'RISK-ON'
                    ? 'text-emerald'
                    : marketBreadth.regime === 'RISK-OFF'
                      ? 'text-crimson'
                      : 'text-amber'
                }
              >
                {marketBreadth.regime} REGIME
              </span>
            </div>

            <h1 className="markets-command-title">
              Every US stock &amp; IPO. One live war room.
            </h1>

            <p className="markets-command-sub">
              Real-time candlesticks, quantitative AI briefs, 17-indicator consensus,
              options flow, and open floor chat across{' '}
              <strong>{marketBreadth.trackedCount.toLocaleString()}+</strong>{' '}
              NASDAQ, NYSE, AMEX &amp; 24/7 markets.
            </p>

            <div className="markets-command-actions">
              <button
                type="button"
                id="landing-open-terminal-btn"
                className="command-btn-primary mono"
                onClick={() => onSelectTicker(heroStory.tickers[0] || 'ANT')}
              >
                <Activity size={13} />
                <span>OPEN LIVE TERMINAL</span>
                <ArrowRight size={13} />
              </button>

              <button
                type="button"
                id="landing-browse-markets-btn"
                className="command-btn-secondary mono"
                onClick={() => onOpenExplorer('all')}
              >
                <Globe size={13} />
                <span>
                  BROWSE{' '}
                  <span className="command-btn-count">
                    {marketBreadth.trackedCount.toLocaleString()}+{' '}
                  </span>
                  MARKETS
                </span>
              </button>

              <button
                type="button"
                id="landing-daily-bread-btn"
                className="command-btn-ghost mono"
                onClick={onOpenDailyBread}
              >
                <Zap size={13} />
                <span>DAILY BREAD AI</span>
              </button>
            </div>
          </div>

          <div className="markets-command-telemetry" aria-label="Live market breadth telemetry">
            <div className="telemetry-breadth-card">
              <div className="telemetry-breadth-top mono">
                <span className="telemetry-label">MARKET BREADTH</span>
                <span
                  className={
                    marketBreadth.advPct >= 50 ? 'text-emerald' : 'text-crimson'
                  }
                >
                  {marketBreadth.advPct}% ADVANCING
                </span>
              </div>
              <div className="telemetry-breadth-bar" role="presentation">
                <span
                  className="telemetry-breadth-fill"
                  style={{ width: `${marketBreadth.advPct}%` }}
                />
              </div>
              <div className="telemetry-breadth-counts mono">
                <span className="text-emerald">
                  ▲ {marketBreadth.advancers.toLocaleString()} Up
                </span>
                <span className="text-crimson">
                  ▼ {marketBreadth.decliners.toLocaleString()} Down
                </span>
              </div>
            </div>

            <div className="telemetry-stat-grid mono">
              <button
                type="button"
                className="telemetry-stat-cell"
                onClick={() => onOpenExplorer('live247')}
              >
                <span className="telemetry-stat-k">24/7 PERPS</span>
                <span className="telemetry-stat-v text-emerald">
                  {marketBreadth.live247Count > 0
                    ? marketBreadth.live247Count
                    : 'LIVE'}
                </span>
              </button>
              <button
                type="button"
                className="telemetry-stat-cell"
                onClick={() => onOpenExplorer('ipos')}
              >
                <span className="telemetry-stat-k">2026 IPOs</span>
                <span className="telemetry-stat-v text-amber">
                  {FEATURED_IPOS.length}
                </span>
              </button>
              <button
                type="button"
                className="telemetry-stat-cell"
                onClick={onRefreshNews}
              >
                <span className="telemetry-stat-k">LIVE WIRE</span>
                <span className="telemetry-stat-v">
                  {liveNewsCount > 0 ? liveNewsCount : articles.length}
                </span>
              </button>
            </div>
          </div>
        </div>

        {/* Docked Breaking News Dispatch Strip */}
        <div className="breaking-dispatch-bar breaking-dispatch-bar--docked" aria-label="Breaking market alert">
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
        </div>
      </section>

      {/* 3. Main 2-Column Editorial Newsroom + Sticky Live Market Rail */}
      <div className="landing-editorial-grid">
        {/* LEFT COLUMN: Editorial Lead Story + Feature Duo + Live Breaking Stream */}
        <div className="landing-news-column">
          {/* Lead Hero Editorial Story */}
          <SpotlightSurface tone="neutral" className="editorial-hero-shell">
            <article className="editorial-hero-card">
              <a
                href={heroStory.url}
                target="_blank"
                rel="noopener noreferrer"
                className="editorial-hero-media"
              >
                <img
                  src={heroStory.imageUrl || getArticleFallbackImage(heroStory)}
                  alt={heroStory.title}
                  className="editorial-hero-img"
                  referrerPolicy="no-referrer"
                  onError={(e) => {
                    const img = e.currentTarget;
                    if (!img.dataset.fallbackApplied) {
                      img.dataset.fallbackApplied = '1';
                      img.src = getArticleFallbackImage(heroStory);
                    }
                  }}
                />
                <span className="editorial-hero-scrim" aria-hidden="true" />
                <span className="editorial-media-kicker mono">
                  {heroStory.isLiveFetched ? 'LIVE' : 'TOP STORY'} •{' '}
                  {heroStory.source.toUpperCase()}
                </span>
              </a>

              <div className="editorial-hero-body">
                <div className="editorial-hero-top">
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

                  <h2 className="editorial-hero-headline">
                    <a
                      href={heroStory.url}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      {heroStory.title}
                    </a>
                  </h2>

                  <p className="editorial-hero-deck">{heroStory.summary}</p>
                </div>

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
          </SpotlightSurface>

          {/* 2-Up Secondary Editorial Feature Cards */}
          <div className="editorial-feature-duo">
            {featurePair.map((story, idx) => (
              <SpotlightSurface
                key={story.id}
                tone="neutral"
                className="editorial-feature-shell"
              >
                <article className="editorial-feature-card">
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

                    <h3 className="editorial-feature-headline">
                      <a
                        href={story.url}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        {story.title}
                      </a>
                    </h3>

                    <p className="editorial-feature-summary">{story.summary}</p>

                    {story.tickers.length > 0 && (
                      <div className="news-tickers-row editorial-feature-tickers">
                        {story.tickers.slice(0, 3).map((t) => renderTickerChip(t))}
                      </div>
                    )}
                  </div>
                </article>
              </SpotlightSurface>
            ))}
          </div>

          {/* Breaking News Feed Section with Smooth Sliding Category Tabs */}
          <section className="news-stream-panel" aria-label="Latest breaking stock market news">
            <div className="news-stream-header">
              <div className="panel-title-group">
                <Newspaper size={14} className="text-emerald" aria-hidden="true" />
                <h2 className="panel-title">LATEST MARKET NEWS</h2>
                <span className="panel-badge panel-badge--emerald">
                  {liveNewsCount > 0 ? `${liveNewsCount} LIVE WIRE` : 'MARKET DESK'}
                </span>
              </div>

              <SegmentedTabs
                items={feedTabItems}
                value={feedTab}
                onChange={setFeedTab}
                ariaLabel="Filter news by topic"
                className="news-seg-tabs"
              />
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
                {streamWithImages.length === 0 ? (
                  <div className="news-stream-empty mono">
                    No stories in this category yet — switch to Top Stories or Live Wire.
                  </div>
                ) : (
                  streamWithImages.map(({ item, resolvedImg, fallbackImg }) => (
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

                      <a
                        href={item.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="news-stream-thumb-wrap"
                      >
                        <img
                          src={resolvedImg}
                          alt={item.title}
                          className="news-stream-thumb"
                          loading="lazy"
                          referrerPolicy="no-referrer"
                          onError={(e) => {
                            const img = e.currentTarget;
                            if (!img.dataset.fallbackApplied) {
                              img.dataset.fallbackApplied = '1';
                              img.src = fallbackImg;
                            }
                          }}
                        />
                      </a>
                    </article>
                  ))
                )}
              </div>
            )}
          </section>
        </div>

        {/* RIGHT COLUMN: Sticky High-Signal Live Market Rail */}
        <aside className="landing-market-rail" aria-label="Watchlist, live market movers, trending tickers and IPO radar">
          {/* Pinned Watchlist Card (Top of Rail) */}
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
                <p>Pin any stock or IPO for 1-click access across News &amp; Terminal.</p>
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
                      <AnimatedNumber
                        value={price}
                        prefix="$"
                        decimals={2}
                        className="rail-quote-price"
                      />
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
              <SegmentedTabs
                items={moverTabItems}
                value={moverTab}
                onChange={setMoverTab}
                ariaLabel="Mover category"
                size="sm"
              />
            </div>

            <div className="rail-quote-list">
              {marketMovers.length === 0 ? (
                <div className="rail-empty mono">Syncing live US market movers…</div>
              ) : (
                marketMovers.map((m) => {
                  const isUp = m.pct >= 0;
                  const barPct = Math.max(
                    8,
                    Math.min(100, Math.round((Math.abs(m.pct) / maxMoverAbsPct) * 100)),
                  );
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
                        <span className="rail-mover-bar" aria-hidden="true">
                          <span
                            className={`rail-mover-bar-fill ${
                              isUp ? 'rail-mover-bar-fill--up' : 'rail-mover-bar-fill--down'
                            }`}
                            style={{ width: `${barPct}%` }}
                          />
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

        </aside>
      </div>
    </main>
  );
}
