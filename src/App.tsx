import {
  Suspense,
  lazy,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { CheckCircle2 } from 'lucide-react';
import { AiIntelligencePanel } from './components/AiIntelligencePanel';
import { DailyBreadTickerCard } from './components/DailyBreadTickerCard';
import { FloorChatPanel } from './components/FloorChatPanel';
import { InsiderSqueezeTickerCard } from './components/InsiderSqueezeTickerCard';
import { LiveRealtimeRibbon } from './components/LiveRealtimeRibbon';
import type { ExplorerTab } from './components/MarketExplorerModal';
import { OptionsFlowTickerCard } from './components/OptionsFlowTickerCard';
import type { ChartTradePlan } from './components/RealtimeCandleChart';
import { RoomSwitcherBar } from './components/RoomSwitcherBar';
import { ScrollingTickerTape } from './components/ScrollingTickerTape';
import { TechnicalGaugePanel } from './components/TechnicalGaugePanel';
import { TerminalFooter } from './components/TerminalFooter';
import { TerminalHeader, type AppView } from './components/TerminalHeader';
import { ValuationCalculatorPanel } from './components/ValuationCalculatorPanel';
import { WarRoomConfluenceCard } from './components/WarRoomConfluenceCard';
import { resolveTickerMeta } from './data/tickers';

const LandingPage = lazy(() =>
  import('./components/LandingPage').then((m) => ({ default: m.LandingPage })),
);
const WhaleFlowDesk = lazy(() =>
  import('./components/WhaleFlowDesk').then((m) => ({ default: m.WhaleFlowDesk })),
);
const InsidersDesk = lazy(() =>
  import('./components/InsidersDesk').then((m) => ({ default: m.InsidersDesk })),
);
const DailyBreadDesk = lazy(() =>
  import('./components/DailyBreadDesk').then((m) => ({ default: m.DailyBreadDesk })),
);
const OvernightRadarPanel = lazy(() =>
  import('./components/OvernightRadarPanel').then((m) => ({
    default: m.OvernightRadarPanel,
  })),
);
const ExecutionChartPanel = lazy(() =>
  import('./components/ExecutionChartPanel').then((m) => ({
    default: m.ExecutionChartPanel,
  })),
);
const MarketExplorerModal = lazy(() =>
  import('./components/MarketExplorerModal').then((m) => ({
    default: m.MarketExplorerModal,
  })),
);
const AlertsDrawer = lazy(() =>
  import('./components/AlertsDrawer').then((m) => ({ default: m.AlertsDrawer })),
);
const OptionsPayoffModal = lazy(() =>
  import('./components/OptionsPayoffModal').then((m) => ({
    default: m.OptionsPayoffModal,
  })),
);
import {
  scanMarketOptionsFlow,
  WHALE_FLOW_LEADERS,
  type ChartGexLevels,
  type OptionContractFlow,
  type TickerOptionsSummary,
} from './lib/whaleFlowEngine';
import { fetchConfluenceOptionsMap } from './lib/confluenceOptionsFeed';
import type { DailyBreadCall } from './lib/dailyBreadEngine';
import {
  fetchAllHyperliquidHip3CtxMap,
  type HlAssetCtx,
} from './lib/hyperliquidFeed';
import {
  fetchInsidersBundle,
  type InsidersBundle,
} from './lib/insidersEngine';
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
  createTrackedTradeFromCall,
  loadTrackedTrades,
  reconcileTradesWithPrices,
  saveTrackedTrades,
  type TrackedTrade,
} from './lib/paperTrades';
import {
  createPriceAlert,
  evaluateAlertsWithPrices,
  loadAlertSoundEnabled,
  loadPriceAlerts,
  playAlertChime,
  saveAlertSoundEnabled,
  savePriceAlerts,
  sendBrowserAlertNotification,
  type PriceAlert,
} from './lib/priceAlerts';
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
    const v = params.get('view');
    if (v === 'daily-bread') {
      return { view: 'daily-bread', ticker: 'ANT' };
    }
    if (v === 'whale-flow') {
      return { view: 'whale-flow', ticker: 'ANT' };
    }
    if (v === 'insiders') {
      return { view: 'insiders', ticker: 'ANT' };
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
  const [trackedTrades, setTrackedTrades] = useState<TrackedTrade[]>(() =>
    loadTrackedTrades(),
  );
  const [activeTradePlan, setActiveTradePlan] = useState<ChartTradePlan | null>(
    null,
  );
  const [activeGexLevels, setActiveGexLevels] = useState<ChartGexLevels | null>(
    null,
  );
  const [simContract, setSimContract] = useState<OptionContractFlow | null>(
    null,
  );
  const [insidersSearch, setInsidersSearch] = useState<string>('');
  const [insidersBundle, setInsidersBundle] = useState<InsidersBundle | null>(
    null,
  );
  const [optionsMap, setOptionsMap] = useState<
    Record<string, TickerOptionsSummary>
  >({});
  const [priceAlerts, setPriceAlerts] = useState<PriceAlert[]>(() =>
    loadPriceAlerts(),
  );
  const [alertSoundEnabled, setAlertSoundEnabled] = useState<boolean>(() =>
    loadAlertSoundEnabled(),
  );
  const [alertsDrawerOpen, setAlertsDrawerOpen] = useState<boolean>(false);
  const alertSoundRef = useRef<boolean>(alertSoundEnabled);
  const processAlertHitsRef = useRef<(priceMap: Record<string, number>) => void>(
    () => {},
  );

  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    void fetchInsidersBundle(false, controller.signal).then((data) => {
      if (active && !controller.signal.aborted) {
        setInsidersBundle(data);
      }
    });
    void fetchConfluenceOptionsMap(controller.signal).then((map) => {
      if (!active || controller.signal.aborted) return;
      if (Object.keys(map).length > 0) {
        setOptionsMap((prev) => ({ ...map, ...prev }));
      }
      if (Object.keys(map).length < 6) {
        void scanMarketOptionsFlow(
          WHALE_FLOW_LEADERS,
          false,
          controller.signal,
        ).then(({ summaries }) => {
          if (!active || controller.signal.aborted || summaries.length === 0) {
            return;
          }
          setOptionsMap((prev) => {
            const next = { ...prev };
            for (const s of summaries) {
              next[s.ticker.toUpperCase()] = s;
            }
            return next;
          });
        });
      }
    });
    return () => {
      active = false;
      controller.abort();
    };
  }, []);

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

    if (activeView === 'whale-flow') {
      document.title = 'Whale Flow — Unusual Options & 24/7 Tape | aINVEST';
      try {
        const url = new URL(window.location.href);
        let changed = false;
        if (url.searchParams.has('ticker')) {
          url.searchParams.delete('ticker');
          changed = true;
        }
        if (url.searchParams.get('view') !== 'whale-flow') {
          url.searchParams.set('view', 'whale-flow');
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

    if (activeView === 'insiders') {
      document.title = 'Insiders & Short Squeeze — Congress & Form 4 | aINVEST';
      try {
        const url = new URL(window.location.href);
        let changed = false;
        if (url.searchParams.has('ticker')) {
          url.searchParams.delete('ticker');
          changed = true;
        }
        if (url.searchParams.get('view') !== 'insiders') {
          url.searchParams.set('view', 'insiders');
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

        const pxMap: Record<string, number> = {};
        for (const [k, v] of Object.entries(next)) {
          if (v.markPx > 0) pxMap[k] = v.markPx;
        }
        setTrackedTrades((prev) => {
          const { trades, changed } = reconcileTradesWithPrices(prev, pxMap);
          if (changed) saveTrackedTrades(trades);
          return changed ? trades : prev;
        });
        processAlertHitsRef.current(pxMap);
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

  const priceAlertsRef = useRef<PriceAlert[]>(priceAlerts);

  useEffect(() => {
    priceAlertsRef.current = priceAlerts;
  }, [priceAlerts]);

  const processAlertHits = useCallback(
    (priceMap: Record<string, number>) => {
      const res = evaluateAlertsWithPrices(priceAlertsRef.current, priceMap);
      if (res.newlyTriggered.length === 0) return;

      priceAlertsRef.current = res.alerts;
      savePriceAlerts(res.alerts);
      setPriceAlerts(res.alerts);

      if (alertSoundRef.current) {
        playAlertChime();
      }
      for (const hit of res.newlyTriggered) {
        sendBrowserAlertNotification(hit);
      }
      const first = res.newlyTriggered[0];
      const hitPx = first.triggeredPrice ?? first.targetPrice;
      showToast(
        `ALERT HIT: ${first.ticker} @ $${hitPx.toFixed(2)} (${first.label})`,
      );
    },
    [showToast],
  );

  useEffect(() => {
    alertSoundRef.current = alertSoundEnabled;
  }, [alertSoundEnabled]);

  useEffect(() => {
    processAlertHitsRef.current = processAlertHits;
  }, [processAlertHits]);

  const handleArmAlert = useCallback(
    (params: {
      ticker: string;
      targetPrice: number;
      currentPrice?: number | null;
      label?: string;
    }) => {
      const created = createPriceAlert(params);
      if (!created) return;
      setPriceAlerts((prev) => {
        const duplicate = prev.some(
          (a) =>
            a.status === 'ACTIVE' &&
            a.ticker === created.ticker &&
            a.condition === created.condition &&
            Math.abs(a.targetPrice - created.targetPrice) < 0.005,
        );
        if (duplicate) return prev;
        const next = [created, ...prev].slice(0, 50);
        priceAlertsRef.current = next;
        savePriceAlerts(next);
        return next;
      });
      showToast(
        `Alert armed: ${created.ticker} ${created.condition === 'ABOVE' ? '▲' : '▼'} $${created.targetPrice.toFixed(2)} (${created.label})`,
      );
    },
    [showToast],
  );

  const handleDeleteAlert = useCallback((id: string) => {
    setPriceAlerts((prev) => {
      const next = prev.filter((a) => a.id !== id);
      priceAlertsRef.current = next;
      savePriceAlerts(next);
      return next;
    });
  }, []);

  const handleClearTriggeredAlerts = useCallback(() => {
    setPriceAlerts((prev) => {
      const next = prev.filter((a) => a.status === 'ACTIVE');
      priceAlertsRef.current = next;
      savePriceAlerts(next);
      return next;
    });
    showToast('Cleared triggered alerts');
  }, [showToast]);

  const handleToggleAlertSound = useCallback((enabled: boolean) => {
    setAlertSoundEnabled(enabled);
    saveAlertSoundEnabled(enabled);
  }, []);

  useEffect(() => {
    return () => {
      if (toastTimerRef.current !== null) {
        window.clearTimeout(toastTimerRef.current);
      }
    };
  }, []);

  const handleSelectView = useCallback((view: AppView) => {
    if (view === 'insiders') setInsidersSearch('');
    setActiveView(view);
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
  }, []);

  const handleOpenInsidersForTicker = useCallback((ticker: string) => {
    setInsidersSearch(ticker.trim().toUpperCase());
    setActiveView('insiders');
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
  }, []);

  const handleSelectTicker = useCallback(
    (ticker: string) => {
      const clean = ticker
        .trim()
        .toUpperCase()
        .replace(/^\$/, '')
        .replace(/^[A-Z0-9_-]+:/, '');
      if (!clean || !/^[A-Z0-9][A-Z0-9._-]{0,11}$/.test(clean)) return;

      const switchingFromOtherView = activeView !== 'terminal';
      setActiveView('terminal');

      if (clean !== activeTicker) {
        setActiveTicker(clean);
        setRecentTickers((prev) => {
          const next = [clean, ...prev.filter((t) => t !== clean)].slice(0, 12);
          saveRecentTickers(next);
          return next;
        });
        showToast(`Opened ${clean} War Room`);
      } else if (switchingFromOtherView) {
        showToast(`Opened ${clean} War Room`);
      }

      if (switchingFromOtherView) {
        window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
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

  const handleOptionsSummaryUpdate = useCallback(
    (summary: TickerOptionsSummary) => {
      setOptionsMap((prev) => ({
        ...prev,
        [summary.ticker.toUpperCase()]: summary,
      }));
    },
    [],
  );

  const handleLiveHlUpdate = useCallback((next: HlAssetCtx) => {
    setCtxMap((prev) => ({ ...prev, [next.ticker]: next }));
    if (next.markPx > 0) {
      setTrackedTrades((prev) => {
        const { trades, changed } = reconcileTradesWithPrices(prev, {
          [next.ticker]: next.markPx,
        });
        if (changed) saveTrackedTrades(trades);
        return changed ? trades : prev;
      });
      processAlertHitsRef.current({ [next.ticker]: next.markPx });
    }
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
    const livePx = next.price;
    if (livePx !== null && livePx > 0) {
      setTrackedTrades((prev) => {
        const { trades, changed } = reconcileTradesWithPrices(prev, {
          [next.ticker]: livePx,
        });
        if (changed) saveTrackedTrades(trades);
        return changed ? trades : prev;
      });
      processAlertHitsRef.current({ [next.ticker]: livePx });
    }
  }, []);

  const handleTrackCall = useCallback(
    (call: DailyBreadCall) => {
      const created = createTrackedTradeFromCall(call);
      if (!created) return;
      setTrackedTrades((prev) => {
        const duplicate = prev.some(
          (t) =>
            t.ticker === created.ticker &&
            t.direction === created.direction &&
            (t.status === 'OPEN' || t.status === 'TP1_HIT'),
        );
        if (duplicate) return prev;
        const next = [created, ...prev].slice(0, 40);
        saveTrackedTrades(next);
        return next;
      });
      showToast(
        `Tracking ${created.direction} ${created.ticker} @ $${created.entryPrice.toFixed(2)} in Scorecard`,
      );
    },
    [showToast],
  );

  const handleCloseTrade = useCallback(
    (id: string, livePrice?: number) => {
      setTrackedTrades((prev) => {
        const next = prev.map((t) =>
          t.id === id
            ? {
                ...t,
                status: 'CLOSED' as const,
                exitPrice: livePrice && livePrice > 0 ? livePrice : t.entryPrice,
                closedAt: Date.now(),
              }
            : t,
        );
        saveTrackedTrades(next);
        return next;
      });
      showToast('Closed tracked setup in Scorecard');
    },
    [showToast],
  );

  const handleRemoveTrade = useCallback((id: string) => {
    setTrackedTrades((prev) => {
      const next = prev.filter((t) => t.id !== id);
      saveTrackedTrades(next);
      return next;
    });
  }, []);

  const handleClearClosedTrades = useCallback(() => {
    setTrackedTrades((prev) => {
      const next = prev.filter((t) => t.status === 'OPEN' || t.status === 'TP1_HIT');
      saveTrackedTrades(next);
      return next;
    });
    showToast('Cleared closed scorecard trades');
  }, [showToast]);

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
          : activeView === 'whale-flow'
            ? 'Whale Flow Terminal link copied'
            : activeView === 'insiders'
              ? 'Insiders & Short Squeeze link copied'
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

  const activeMovingNews = useMemo(
    () => articles.find((a) => a.tickers.includes(meta.ticker)) ?? null,
    [articles, meta.ticker],
  );

  const isActiveCallTracked = useMemo(() => {
    if (!activeTradePlan || activeTradePlan.ticker !== meta.ticker) return false;
    return trackedTrades.some(
      (t) =>
        t.ticker === meta.ticker &&
        t.direction === activeTradePlan.direction &&
        (t.status === 'OPEN' || t.status === 'TP1_HIT'),
    );
  }, [trackedTrades, activeTradePlan, meta.ticker]);

  const { activeAlertsCount, triggeredAlertsCount } = useMemo(() => {
    let active = 0;
    let triggered = 0;
    for (const a of priceAlerts) {
      if (a.status === 'ACTIVE') active += 1;
      else triggered += 1;
    }
    return { activeAlertsCount: active, triggeredAlertsCount: triggered };
  }, [priceAlerts]);

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

      {/* Institutional Header with Markets/Whale Flow/Daily Bread/Terminal Nav, Universal ⌘K Search, Alerts & Explorer */}
      <TerminalHeader
        activeView={activeView}
        activeTicker={meta.ticker}
        ctxMap={ctxMap}
        directory={directory}
        directoryMap={directoryMap}
        activeAlertsCount={activeAlertsCount}
        triggeredAlertsCount={triggeredAlertsCount}
        onSelectView={handleSelectView}
        onSelectTicker={handleSelectTicker}
        onOpenExplorer={handleOpenExplorer}
        onOpenAlerts={() => setAlertsDrawerOpen(true)}
        onShareLink={handleShareLink}
        copied={copied}
        themeId={themeId}
        onSelectTheme={handleSelectTheme}
      />

      <Suspense
        fallback={
          <div className="route-loading-fallback mono">
            Loading aINVEST desk…
          </div>
        }
      >
        {activeView === 'home' ? (
          <LandingPage
            ctxMap={ctxMap}
            quoteMap={quoteMap}
            directory={directory}
            directoryMap={directoryMap}
            insidersBundle={insidersBundle}
            optionsMap={optionsMap}
            pinnedTickers={pinnedTickers}
            themeId={themeId}
            articles={articles}
            liveNewsCount={liveNewsCount}
            lastNewsUpdated={lastNewsUpdated}
            refreshingNews={refreshingNews}
            trackedTrades={trackedTrades}
            onRefreshNews={() => void handleRefreshNews()}
            onTrackCall={handleTrackCall}
            onArmAlert={handleArmAlert}
            onCloseTrade={handleCloseTrade}
            onRemoveTrade={handleRemoveTrade}
            onClearClosedTrades={handleClearClosedTrades}
            onSelectTicker={handleSelectTicker}
            onOpenExplorer={handleOpenExplorer}
            onOpenDailyBread={() => handleSelectView('daily-bread')}
            onTogglePin={handleTogglePin}
            onNotify={showToast}
          />
        ) : activeView === 'whale-flow' ? (
          <main className="landing-main daily-bread-page-main">
            <WhaleFlowDesk
              ctxMap={ctxMap}
              quoteMap={quoteMap}
              directoryMap={directoryMap}
              pinnedTickers={pinnedTickers}
              themeId={themeId}
              onSelectTicker={handleSelectTicker}
              onSimulateContract={setSimContract}
              onNotify={showToast}
              onArmAlert={handleArmAlert}
            />
          </main>
        ) : activeView === 'insiders' ? (
          <main className="landing-main daily-bread-page-main">
            <InsidersDesk
              key={insidersSearch || 'all'}
              pinnedTickers={pinnedTickers}
              initialSearch={insidersSearch}
              themeId={themeId}
              onSelectTicker={handleSelectTicker}
              onNotify={showToast}
            />
          </main>
        ) : activeView === 'daily-bread' ? (
          <main className="landing-main daily-bread-page-main">
            <OvernightRadarPanel
              variant="wide"
              ctxMap={ctxMap}
              quoteMap={quoteMap}
              directoryMap={directoryMap}
              onSelectTicker={handleSelectTicker}
            />
            <DailyBreadDesk
              ctxMap={ctxMap}
              quoteMap={quoteMap}
              directoryMap={directoryMap}
              breakingNews={articles}
              trackedTrades={trackedTrades}
              pinnedTickers={pinnedTickers}
              themeId={themeId}
              onTrackCall={handleTrackCall}
              onArmAlert={handleArmAlert}
              onCloseTrade={handleCloseTrade}
              onRemoveTrade={handleRemoveTrade}
              onClearClosedTrades={handleClearClosedTrades}
              onSelectTicker={handleSelectTicker}
              onNotify={showToast}
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
              themeId={themeId}
              onTogglePin={() => handleTogglePin(meta.ticker)}
              onLiveHlUpdate={handleLiveHlUpdate}
              onLiveQuoteUpdate={handleLiveQuoteUpdate}
              onSyncLivePrice={handleSelectPriceLevel}
            />

            {/* Main 70/30 Terminal Bento Grid */}
            <div className="workspace-grid">
              <div className="chart-column">
                <Suspense
                  fallback={
                    <div className="terminal-card route-loading-fallback mono">
                      Loading live candlestick chart…
                    </div>
                  }
                >
                  <ExecutionChartPanel
                    meta={meta}
                    prevDayPx={activeQuote?.prevClose ?? null}
                    themeId={themeId}
                    tradePlan={activeTradePlan}
                    gexLevels={activeGexLevels}
                    movingNews={activeMovingNews}
                    onQuoteDiscovered={handleLiveQuoteUpdate}
                  />
                </Suspense>
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
                {/* Panel 0 — Unified 5-Pillar Cross-Signal Confluence Score + Catalyst Radar */}
                <WarRoomConfluenceCard
                  meta={meta}
                  liveQuote={activeQuote}
                  hlCtx={activeHlCtx}
                  directoryEntry={activeDirEntry}
                  insidersBundle={insidersBundle}
                  optionsSummary={optionsMap[meta.ticker] ?? null}
                  articles={articles}
                  tradePlan={activeTradePlan}
                  gexLevels={activeGexLevels}
                  onNotify={showToast}
                />

                {/* Panel A — Daily Bread Live AI Day-Trade Call */}
                <DailyBreadTickerCard
                  meta={meta}
                  liveQuote={activeQuote}
                  breakingNews={articles}
                  isTracked={isActiveCallTracked}
                  onTrackCall={handleTrackCall}
                  onArmAlert={handleArmAlert}
                  onPlanUpdate={setActiveTradePlan}
                  onSelectPriceLevel={handleSelectPriceLevel}
                  onNotify={showToast}
                />

                {/* Panel B — Unusual Options Flow, GEX Walls & Max Pain */}
                <OptionsFlowTickerCard
                  meta={meta}
                  livePrice={activeQuote?.price ?? null}
                  onSelectPriceLevel={handleSelectPriceLevel}
                  onOptionsLevelsUpdate={setActiveGexLevels}
                  onOptionsSummaryUpdate={handleOptionsSummaryUpdate}
                  onSimulateContract={setSimContract}
                  onArmAlert={handleArmAlert}
                />

                {/* Panel C — Congress, SEC Form 4 Cluster Buys & FINRA Short Squeeze */}
                <InsiderSqueezeTickerCard
                  meta={meta}
                  onOpenInsidersForTicker={handleOpenInsidersForTicker}
                />

                {/* Panel C — Universal 7-Timeframe Confluence & Technical Consensus Gauge */}
                <TechnicalGaugePanel meta={meta} themeId={themeId} />

                {/* Panel D — Real-Time aINVEST AI Signal Brief & IPO Tracker */}
                <AiIntelligencePanel
                  meta={meta}
                  liveQuote={activeQuote}
                  onSelectPriceLevel={handleSelectPriceLevel}
                />

                {/* Panel E — Dynamic Valuation & Position P&L Calculator */}
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
      </Suspense>

      <TerminalFooter meta={meta} />

      <Suspense fallback={null}>
        {/* Universal All Stocks & IPOs Explorer Modal */}
        {explorerOpen && (
          <MarketExplorerModal
            open={explorerOpen}
            initialTab={explorerTab}
            activeTicker={meta.ticker}
            ctxMap={ctxMap}
            quoteMap={quoteMap}
            directory={directory}
            directoryMap={directoryMap}
            directoryLoading={directoryLoading}
            insidersBundle={insidersBundle}
            optionsMap={optionsMap}
            articles={articles}
            pinnedTickers={pinnedTickers}
            onTogglePin={handleTogglePin}
            onSelectTicker={handleSelectTicker}
            onClose={() => setExplorerOpen(false)}
          />
        )}

        {/* Free Live Price Alerts Manager Modal */}
        {alertsDrawerOpen && (
          <AlertsDrawer
            open={alertsDrawerOpen}
            defaultTicker={meta.ticker}
            ctxMap={ctxMap}
            quoteMap={quoteMap}
            directoryMap={directoryMap}
            alerts={priceAlerts}
            soundEnabled={alertSoundEnabled}
            onToggleSound={handleToggleAlertSound}
            onAddAlert={handleArmAlert}
            onDeleteAlert={handleDeleteAlert}
            onClearTriggered={handleClearTriggeredAlerts}
            onSelectTicker={handleSelectTicker}
            onClose={() => setAlertsDrawerOpen(false)}
          />
        )}

        {/* 1-Click Multi-Leg Options Strategy & P&L Heatmap Simulator Modal */}
        {simContract && (
          <OptionsPayoffModal
            key={simContract.id}
            contract={simContract}
            onClose={() => setSimContract(null)}
            onCopySuccess={showToast}
          />
        )}
      </Suspense>

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
