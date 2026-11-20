import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CheckCircle2 } from 'lucide-react';
import { AiIntelligencePanel } from './components/AiIntelligencePanel';
import { DailyBreadDesk } from './components/DailyBreadDesk';
import { DailyBreadTickerCard } from './components/DailyBreadTickerCard';
import { ExecutionChartPanel } from './components/ExecutionChartPanel';
import { FloorChatPanel } from './components/FloorChatPanel';
import { LandingPage } from './components/LandingPage';
import { LiveRealtimeRibbon } from './components/LiveRealtimeRibbon';
import {
  MarketExplorerModal,
  type ExplorerTab,
} from './components/MarketExplorerModal';
import { RoomSwitcherBar } from './components/RoomSwitcherBar';
import { ScrollingTickerTape } from './components/ScrollingTickerTape';
import { TechnicalGaugePanel } from './components/TechnicalGaugePanel';
import { TerminalFooter } from './components/TerminalFooter';
import { TerminalHeader, type AppView } from './components/TerminalHeader';
import { ValuationCalculatorPanel } from './components/ValuationCalculatorPanel';
import { resolveTickerMeta } from './data/tickers';
import {
  fetchAllHyperliquidHip3CtxMap,
  type HlAssetCtx,
} from './lib/hyperliquidFeed';
import {
  getCachedDirectorySync,
  loadUsMarketDirectory,
  type DirectoryEntry,
} from './lib/marketCatalog';
import {
  fetchBreakingMarketNews,
  getInitialEditorialNews,
  type NewsArticle,
} from './lib/newsFeed';
import {
  THEME_MAP,
  applyTheme,
  getInitialTheme,
  type ThemeId,
} from './lib/themes';
import {
  directoryEntryToQuote,
  hlCtxToQuote,
  type MarketQuote,
} from './lib/universalFeed';
import {
  loadPinnedTickers,
  loadRecentTickers,
  savePinnedTickers,
  saveRecentTickers,
} from './lib/watchlist';

function getInitialRouteFromUrl(): { view: AppView; ticker: string } {
  try {
    const params = new URLSearchParams(window.location.search);
    const t = params.get('ticker');
    if (t && /^[a-zA-Z0-9._-]{1,16}$/.test(t.trim())) {
      return { view: 'terminal', ticker: t.trim().toUpperCase() };
    }
    if (params.get('view') === 'daily-bread') {
      return { view: 'daily-bread', ticker: 'ANT' };
    }
  } catch {
    // Ignore
  }
  return { view: 'home', ticker: 'ANT' };
}

async function copyTextToClipboard(text: string): Promise<boolean> {
  if (navigator.clipboard && window.isSecureContext) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // Fallback
    }
  }

  try {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.setAttribute('readonly', '');
    textarea.style.position = 'fixed';
    textarea.style.top = '-9999px';
    document.body.appendChild(textarea);
    textarea.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(textarea);
    return ok;
  } catch {
    return false;
  }
}

export function App() {
  const initialRoute = useMemo(() => getInitialRouteFromUrl(), []);
  const [themeId, setThemeId] = useState<ThemeId>(() => getInitialTheme());
  const [activeView, setActiveView] = useState<AppView>(initialRoute.view);
  const [activeTicker, setActiveTicker] = useState<string>(initialRoute.ticker);
  const [ctxMap, setCtxMap] = useState<Record<string, HlAssetCtx>>({});
  const [quoteMap, setQuoteMap] = useState<Record<string, MarketQuote>>({});
  const [directory, setDirectory] = useState<DirectoryEntry[]>(() =>
    getCachedDirectorySync(),
  );
  const [directoryLoading, setDirectoryLoading] = useState<boolean>(
    () => getCachedDirectorySync().length === 0,
  );
  const [pinnedTickers, setPinnedTickers] = useState<string[]>(() =>
    loadPinnedTickers(),
  );
  const [recentTickers, setRecentTickers] = useState<string[]>(() =>
    loadRecentTickers(),
  );
  const [explorerOpen, setExplorerOpen] = useState<boolean>(false);
  const [explorerTab, setExplorerTab] = useState<ExplorerTab>('ipos');
  const [calcOverrides, setCalcOverrides] = useState<Record<string, string>>({});
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [copied, setCopied] = useState<boolean>(false);
  const toastTimerRef = useRef<number | null>(null);

  // Shared live breaking market news feed (used by Landing Page + Daily Bread AI catalyst engine)
  const [articles, setArticles] = useState<NewsArticle[]>(() =>
    getInitialEditorialNews(),
  );
  const [liveNewsCount, setLiveNewsCount] = useState<number>(0);
  const [lastNewsUpdated, setLastNewsUpdated] = useState<string>('Just now');
  const [refreshingNews, setRefreshingNews] = useState<boolean>(false);

  const directoryMap = useMemo<Record<string, DirectoryEntry>>(() => {
    const map: Record<string, DirectoryEntry> = {};
    for (const d of directory) {
      map[d.ticker] = d;
    }
    return map;
  }, [directory]);

  const activeHlCtx = ctxMap[activeTicker] ?? null;
  const activeDirEntry = directoryMap[activeTicker] ?? null;
  const activeLiveQuote = quoteMap[activeTicker] ?? null;

  // Extract ONLY stable primitive metadata so live price ticks NEVER recreate `meta` or tear down charts
  const activeHlCoin = activeHlCtx?.coin ?? null;
  const activeQuoteExchange = activeLiveQuote?.resolvedExchange;
  const activeQuoteName = activeLiveQuote?.longName;

  const meta = useMemo(
    () =>
      resolveTickerMeta(activeTicker, {
        directoryEntry: activeDirEntry,
        hlCoin: activeHlCoin,
        resolvedExchange: activeQuoteExchange,
        longName: activeQuoteName,
      }),
    [activeTicker, activeDirEntry, activeHlCoin, activeQuoteExchange, activeQuoteName],
  );

  const activeQuote: MarketQuote | null = useMemo(() => {
    if (activeHlCtx) return hlCtxToQuote(activeHlCtx);
    if (activeLiveQuote) return activeLiveQuote;
    if (activeDirEntry) return directoryEntryToQuote(activeDirEntry);
    return null;
  }, [activeHlCtx, activeLiveQuote, activeDirEntry]);

  useEffect(() => {
    applyTheme(themeId);
  }, [themeId]);

  // Keep browser URL & tab title cleanly synced with active view / War Room
  useEffect(() => {
    if (activeView === 'home') {
      document.title = 'aINVEST — Live Stock Market News, IPOs & AI Terminal';
      try {
        const url = new URL(window.location.href);
        let changed = false;
        if (url.searchParams.has('ticker')) {
          url.searchParams.delete('ticker');
          changed = true;
        }
        if (url.searchParams.has('view')) {
          url.searchParams.delete('view');
          changed = true;
        }
        if (changed) {
          window.history.replaceState({}, '', url.toString());
        }
      } catch {
        // Ignore history API restrictions
      }
      return;
    }

    if (activeView === 'daily-bread') {
      document.title = 'Daily Bread — AI Day-Trade Calls | aINVEST';
      try {
        const url = new URL(window.location.href);
        let changed = false;
        if (url.searchParams.has('ticker')) {
          url.searchParams.delete('ticker');
          changed = true;
        }
        if (url.searchParams.get('view') !== 'daily-bread') {
          url.searchParams.set('view', 'daily-bread');
          changed = true;
        }
        if (changed) {
          window.history.replaceState({}, '', url.toString());
        }
      } catch {
        // Ignore history API restrictions
      }
      return;
    }

    document.title = `${meta.ticker} (${meta.name}) — aINVEST Live Terminal`;
    try {
      const url = new URL(window.location.href);
      let changed = false;
      if (url.searchParams.has('view')) {
        url.searchParams.delete('view');
        changed = true;
      }
      if (url.searchParams.get('ticker') !== meta.ticker) {
        url.searchParams.set('ticker', meta.ticker);
        changed = true;
      }
      if (changed) {
        window.history.replaceState({}, '', url.toString());
      }
    } catch {
      // Ignore history API restrictions
    }
  }, [activeView, meta.ticker, meta.name]);

  // Load & refresh live breaking stock market news every 3 minutes
  useEffect(() => {
    let active = true;
    const controller = new AbortController();

    const poll = async () => {
      try {
        const res = await fetchBreakingMarketNews(false, controller.signal);
        if (!active || controller.signal.aborted) return;
        setArticles(res.articles);
        setLiveNewsCount(res.liveCount);
        setLastNewsUpdated(
          new Date().toLocaleTimeString([], {
            hour: '2-digit',
            minute: '2-digit',
            hour12: false,
          }),
        );
      } catch {
        // Retain existing articles
      }
    };

    void poll();
    const id = window.setInterval(() => void poll(), 180_000);
    return () => {
      active = false;
      controller.abort();
      window.clearInterval(id);
    };
  }, []);

  const handleRefreshNews = useCallback(async () => {
    setRefreshingNews(true);
    try {
      const res = await fetchBreakingMarketNews(true);
      setArticles(res.articles);
      setLiveNewsCount(res.liveCount);
      setLastNewsUpdated(
        new Date().toLocaleTimeString([], {
          hour: '2-digit',
          minute: '2-digit',
          hour12: false,
        }),
      );
    } catch {
      // Retain existing articles
    } finally {
      setRefreshingNews(false);
    }
  }, []);

  // Load full NASDAQ + NYSE + AMEX US equities & IPO directory (cached 12h)
  useEffect(() => {
    let active = true;
    const controller = new AbortController();

    void loadUsMarketDirectory(controller.signal)
      .then((list) => {
        if (active && list.length > 0) {
          setDirectory(list);
        }
      })
      .finally(() => {
        if (active) setDirectoryLoading(false);
      });

    return () => {
      active = false;
      controller.abort();
    };
  }, []);

  // Global live refresh across ALL Hyperliquid HIP-3 builder DEXes (skips no-op updates)
  useEffect(() => {
    let active = true;
    const controller = new AbortController();

    const poll = async () => {
      try {
        const next = await fetchAllHyperliquidHip3CtxMap(controller.signal);
        if (!active || Object.keys(next).length === 0) return;
        setCtxMap((prev) => {
          let changed = false;
          for (const [k, v] of Object.entries(next)) {
            const old = prev[k];
            if (
              !old ||
              old.markPx !== v.markPx ||
              old.prevDayPx !== v.prevDayPx ||
              old.coin !== v.coin
            ) {
              changed = true;
              break;
            }
          }
          return changed ? { ...prev, ...next } : prev;
        });
      } catch {
        // Keep last good map
      }
    };

    void poll();
    const id = window.setInterval(() => void poll(), 8000);

    return () => {
      active = false;
      controller.abort();
      window.clearInterval(id);
    };
  }, []);

  const showToast = useCallback((message: string) => {
    setToastMessage(message);
    if (toastTimerRef.current !== null) {
      window.clearTimeout(toastTimerRef.current);
    }
    toastTimerRef.current = window.setTimeout(() => {
      setToastMessage(null);
      setCopied(false);
    }, 2600);
  }, []);

  useEffect(() => {
    return () => {
      if (toastTimerRef.current !== null) {
        window.clearTimeout(toastTimerRef.current);
      }
    };
  }, []);

  const handleSelectView = useCallback((view: AppView) => {
    setActiveView(view);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  const handleSelectTicker = useCallback(
    (ticker: string) => {
      const clean = ticker
        .trim()
        .toUpperCase()
        .replace(/^\$/, '')
        .replace(/^[A-Z0-9_-]+:/, '');
      if (!clean || !/^[A-Z0-9][A-Z0-9._-]{0,11}$/.test(clean)) return;

      const switchingFromHome = activeView !== 'terminal';
      setActiveView('terminal');

      if (clean !== activeTicker) {
        setActiveTicker(clean);
        setRecentTickers((prev) => {
          const next = [clean, ...prev.filter((t) => t !== clean)].slice(0, 12);
          saveRecentTickers(next);
          return next;
        });
        showToast(`Opened ${clean} War Room`);
      } else if (switchingFromHome) {
        showToast(`Opened ${clean} War Room`);
      }

      if (switchingFromHome) {
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }
    },
    [activeTicker, activeView, showToast],
  );

  const handleTogglePin = useCallback(
    (ticker: string) => {
      const clean = ticker.trim().toUpperCase();
      setPinnedTickers((prev) => {
        const exists = prev.includes(clean);
        const next = exists
          ? prev.filter((t) => t !== clean)
          : [clean, ...prev].slice(0, 24);
        savePinnedTickers(next);
        showToast(
          exists
            ? `Unpinned ${clean} from Watchlist`
            : `Pinned ${clean} to Watchlist`,
        );
        return next;
      });
    },
    [showToast],
  );

  const handleOpenExplorer = useCallback((tab: ExplorerTab = 'ipos') => {
    setExplorerTab(tab);
    setExplorerOpen(true);
  }, []);

  const handleLiveHlUpdate = useCallback((next: HlAssetCtx) => {
    setCtxMap((prev) => ({ ...prev, [next.ticker]: next }));
  }, []);

  const handleLiveQuoteUpdate = useCallback((next: MarketQuote) => {
    setQuoteMap((prev) => {
      const old = prev[next.ticker];
      if (
        old &&
        old.price === next.price &&
        old.change === next.change &&
        old.volume === next.volume &&
        old.marketState === next.marketState &&
        old.resolvedExchange === next.resolvedExchange
      ) {
        return prev;
      }
      return { ...prev, [next.ticker]: next };
    });
  }, []);

  const handleSelectTheme = useCallback(
    (next: ThemeId) => {
      setThemeId(next);
      showToast(`Theme: ${THEME_MAP[next].label}`);
    },
    [showToast],
  );

  const handleShareLink = useCallback(async () => {
    const url = window.location.href;
    const ok = await copyTextToClipboard(url);
    if (ok) {
      setCopied(true);
      showToast(
        activeView === 'home'
          ? 'aINVEST Markets link copied'
          : activeView === 'daily-bread'
            ? 'Daily Bread AI Desk link copied'
            : `${meta.ticker} War Room link copied`,
      );
    } else {
      showToast('Copy URL from address bar');
    }
  }, [activeView, meta.ticker, showToast]);

  const defaultCalcPrice =
    activeQuote?.price ?? meta.referencePrice ?? 100;
  const calcPriceInput =
    calcOverrides[meta.ticker] ?? defaultCalcPrice.toFixed(2);

  const handleCalcPriceChange = useCallback(
    (value: string) => {
      setCalcOverrides((prev) => ({ ...prev, [meta.ticker]: value }));
    },
    [meta.ticker],
  );

  const handleSelectPriceLevel = useCallback(
    (price: number) => {
      setCalcOverrides((prev) => ({ ...prev, [meta.ticker]: price.toFixed(2) }));
      showToast(`Loaded $${price.toFixed(2)} into ${meta.ticker} Calculator`);
    },
    [meta.ticker, showToast],
  );

  const isPinned = pinnedTickers.includes(meta.ticker);

  return (
    <div className="war-room-shell">
      {/* Top Scrolling Ticker Tape (Flagship Stocks + Hot 2025-2026 IPOs + Indices) */}
      <ScrollingTickerTape
        ctxMap={ctxMap}
        quoteMap={quoteMap}
        directoryMap={directoryMap}
        activeTicker={activeView === 'terminal' ? meta.ticker : ''}
        onSelectTicker={handleSelectTicker}
      />

      {/* Institutional Header with Markets/Daily Bread/Terminal Nav, Universal ⌘K Search & Explorer */}
      <TerminalHeader
        activeView={activeView}
        activeTicker={meta.ticker}
        ctxMap={ctxMap}
        directory={directory}
        directoryMap={directoryMap}
        onSelectView={handleSelectView}
        onSelectTicker={handleSelectTicker}
        onOpenExplorer={handleOpenExplorer}
        onShareLink={handleShareLink}
        copied={copied}
        themeId={themeId}
        onSelectTheme={handleSelectTheme}
      />

      {activeView === 'home' ? (
        <LandingPage
          ctxMap={ctxMap}
          quoteMap={quoteMap}
          directory={directory}
          directoryMap={directoryMap}
          pinnedTickers={pinnedTickers}
          themeId={themeId}
          articles={articles}
          liveNewsCount={liveNewsCount}
          lastNewsUpdated={lastNewsUpdated}
          refreshingNews={refreshingNews}
          onRefreshNews={() => void handleRefreshNews()}
          onSelectTicker={handleSelectTicker}
          onOpenExplorer={handleOpenExplorer}
          onOpenDailyBread={() => handleSelectView('daily-bread')}
          onTogglePin={handleTogglePin}
        />
      ) : activeView === 'daily-bread' ? (
        <main className="landing-main daily-bread-page-main">
          <DailyBreadDesk
            ctxMap={ctxMap}
            quoteMap={quoteMap}
            directoryMap={directoryMap}
            breakingNews={articles}
            onSelectTicker={handleSelectTicker}
          />
        </main>
      ) : (
        <main className="terminal-main">
          {/* 1-Click War Room Switcher (Flagship + IPOs + User Pinned + Recent + Explorer Triggers) */}
          <RoomSwitcherBar
            activeTicker={meta.ticker}
            ctxMap={ctxMap}
            quoteMap={quoteMap}
            directoryMap={directoryMap}
            pinnedTickers={pinnedTickers}
            recentTickers={recentTickers}
            onSelectTicker={handleSelectTicker}
            onOpenExplorer={handleOpenExplorer}
          />

          {/* Active Stock / IPO Universal Live Price Ribbon */}
          <LiveRealtimeRibbon
            meta={meta}
            initialHlCtx={activeHlCtx}
            fallbackQuote={activeQuote}
            isPinned={isPinned}
            onTogglePin={() => handleTogglePin(meta.ticker)}
            onLiveHlUpdate={handleLiveHlUpdate}
            onLiveQuoteUpdate={handleLiveQuoteUpdate}
            onSyncLivePrice={handleSelectPriceLevel}
          />

          {/* Main 70/30 Terminal Bento Grid */}
          <div className="workspace-grid">
            <div className="chart-column">
              <ExecutionChartPanel
                meta={meta}
                prevDayPx={activeQuote?.prevClose ?? null}
                themeId={themeId}
                onQuoteDiscovered={handleLiveQuoteUpdate}
              />
              <FloorChatPanel
                key={meta.ticker}
                ticker={meta.ticker}
                livePrice={activeQuote?.price ?? null}
                onSelectPriceLevel={handleSelectPriceLevel}
              />
            </div>

            <aside
              className="intelligence-column"
              aria-label={`aINVEST AI Intelligence and Quantitative Tools for ${meta.ticker}`}
            >
              {/* Panel A — Daily Bread Live AI Day-Trade Call */}
              <DailyBreadTickerCard
                meta={meta}
                liveQuote={activeQuote}
                breakingNews={articles}
                onSelectPriceLevel={handleSelectPriceLevel}
              />

              {/* Panel B — Universal 7-Timeframe Technical Consensus Gauge */}
              <TechnicalGaugePanel meta={meta} themeId={themeId} />

              {/* Panel C — Real-Time aINVEST AI Signal Brief & IPO Tracker */}
              <AiIntelligencePanel
                meta={meta}
                liveQuote={activeQuote}
                onSelectPriceLevel={handleSelectPriceLevel}
              />

              {/* Panel D — Dynamic Valuation & Position P&L Calculator */}
              <ValuationCalculatorPanel
                meta={meta}
                livePrice={activeQuote?.price ?? null}
                referencePrice={meta.referencePrice ?? activeQuote?.prevClose ?? null}
                priceInput={calcPriceInput}
                onPriceInputChange={handleCalcPriceChange}
              />
            </aside>
          </div>
        </main>
      )}

      <TerminalFooter meta={meta} />

      {/* Universal All Stocks & IPOs Explorer Modal */}
      {explorerOpen && (
        <MarketExplorerModal
          open={explorerOpen}
          initialTab={explorerTab}
          activeTicker={meta.ticker}
          ctxMap={ctxMap}
          directory={directory}
          directoryMap={directoryMap}
          directoryLoading={directoryLoading}
          pinnedTickers={pinnedTickers}
          onTogglePin={handleTogglePin}
          onSelectTicker={handleSelectTicker}
          onClose={() => setExplorerOpen(false)}
        />
      )}

      {toastMessage && (
        <div className="toast-container" role="status" aria-live="polite">
          <div className="toast-pill">
            <CheckCircle2 size={14} color={THEME_MAP[themeId].bull} />
            <span>{toastMessage}</span>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
