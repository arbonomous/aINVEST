import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CheckCircle2 } from 'lucide-react';
import { AiIntelligencePanel } from './components/AiIntelligencePanel';
import { ExecutionChartPanel } from './components/ExecutionChartPanel';
import { FloorChatPanel } from './components/FloorChatPanel';
import { LiveRealtimeRibbon } from './components/LiveRealtimeRibbon';
import {
  MarketExplorerModal,
  type ExplorerTab,
} from './components/MarketExplorerModal';
import { RoomSwitcherBar } from './components/RoomSwitcherBar';
import { ScrollingTickerTape } from './components/ScrollingTickerTape';
import { TechnicalGaugePanel } from './components/TechnicalGaugePanel';
import { TerminalFooter } from './components/TerminalFooter';
import { TerminalHeader } from './components/TerminalHeader';
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

function getInitialTickerFromUrl(): string {
  try {
    const params = new URLSearchParams(window.location.search);
    const t = params.get('ticker');
    if (t && /^[a-zA-Z0-9._-]{1,16}$/.test(t.trim())) {
      return t.trim().toUpperCase();
    }
  } catch {
    // Ignore
  }
  return 'ANT';
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
  const [themeId, setThemeId] = useState<ThemeId>(() => getInitialTheme());
  const [activeTicker, setActiveTicker] = useState<string>(() =>
    getInitialTickerFromUrl(),
  );
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

  const meta = useMemo(
    () =>
      resolveTickerMeta(activeTicker, {
        directoryEntry: activeDirEntry,
        hlCtx: activeHlCtx,
        liveQuote: activeLiveQuote,
      }),
    [activeTicker, activeDirEntry, activeHlCtx, activeLiveQuote],
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

  // Keep browser URL & tab title cleanly synced with active War Room
  useEffect(() => {
    document.title = `${meta.ticker} (${meta.name}) — aINVEST Live Terminal`;
    try {
      const url = new URL(window.location.href);
      url.searchParams.set('ticker', meta.ticker);
      window.history.replaceState({}, '', url.toString());
    } catch {
      // Ignore history API restrictions
    }
  }, [meta.ticker, meta.name]);

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

  // Global 5s live refresh across ALL Hyperliquid HIP-3 builder DEXes
  useEffect(() => {
    let active = true;
    const controller = new AbortController();

    const poll = async () => {
      try {
        const next = await fetchAllHyperliquidHip3CtxMap(controller.signal);
        if (active && Object.keys(next).length > 0) {
          setCtxMap((prev) => ({ ...prev, ...next }));
        }
      } catch {
        // Keep last good map
      }
    };

    void poll();
    const id = window.setInterval(() => void poll(), 5000);

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

  const handleSelectTicker = useCallback(
    (ticker: string) => {
      const clean = ticker
        .trim()
        .toUpperCase()
        .replace(/^\$/, '')
        .replace(/^[A-Z0-9_-]+:/, '');
      if (!clean || !/^[A-Z0-9][A-Z0-9._-]{0,11}$/.test(clean)) return;

      if (clean !== activeTicker) {
        setActiveTicker(clean);
        setRecentTickers((prev) => {
          const next = [clean, ...prev.filter((t) => t !== clean)].slice(0, 12);
          saveRecentTickers(next);
          return next;
        });
        showToast(`Switched to ${clean} War Room`);
      }
    },
    [activeTicker, showToast],
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
            ? `Unpinned ${clean} from War Room bar`
            : `Pinned ${clean} to War Room bar`,
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
    setQuoteMap((prev) => ({ ...prev, [next.ticker]: next }));
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
      showToast(`${meta.ticker} War Room link copied`);
    } else {
      showToast('Copy URL from address bar');
    }
  }, [meta.ticker, showToast]);

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
        activeTicker={meta.ticker}
        onSelectTicker={handleSelectTicker}
      />

      {/* Compact Institutional Header with Universal ⌘K Search & All Stocks/IPOs Explorer */}
      <TerminalHeader
        activeTicker={meta.ticker}
        ctxMap={ctxMap}
        directory={directory}
        directoryMap={directoryMap}
        onSelectTicker={handleSelectTicker}
        onOpenExplorer={handleOpenExplorer}
        onShareLink={handleShareLink}
        copied={copied}
        themeId={themeId}
        onSelectTheme={handleSelectTheme}
      />

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
            {/* Panel A — Real-Time aINVEST AI Signal Brief & IPO Tracker */}
            <AiIntelligencePanel
              meta={meta}
              liveQuote={activeQuote}
              onSelectPriceLevel={handleSelectPriceLevel}
            />

            {/* Panel B — Dynamic Valuation & Position P&L Calculator */}
            <ValuationCalculatorPanel
              meta={meta}
              livePrice={activeQuote?.price ?? null}
              referencePrice={meta.referencePrice ?? activeQuote?.prevClose ?? null}
              priceInput={calcPriceInput}
              onPriceInputChange={handleCalcPriceChange}
            />

            {/* Panel C — Universal 17-Indicator Technical Consensus Gauge */}
            <TechnicalGaugePanel meta={meta} themeId={themeId} />
          </aside>
        </div>
      </main>

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
