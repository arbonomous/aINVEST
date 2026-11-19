import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CheckCircle2 } from 'lucide-react';
import { AiIntelligencePanel } from './components/AiIntelligencePanel';
import { ExecutionChartPanel } from './components/ExecutionChartPanel';
import { FloorChatPanel } from './components/FloorChatPanel';
import { LiveRealtimeRibbon } from './components/LiveRealtimeRibbon';
import { RoomSwitcherBar } from './components/RoomSwitcherBar';
import { ScrollingTickerTape } from './components/ScrollingTickerTape';
import { TechnicalGaugePanel } from './components/TechnicalGaugePanel';
import { TerminalFooter } from './components/TerminalFooter';
import { TerminalHeader } from './components/TerminalHeader';
import { ValuationCalculatorPanel } from './components/ValuationCalculatorPanel';
import { resolveTickerMeta } from './data/tickers';
import {
  fetchHyperliquidDexCtxMap,
  type HlAssetCtx,
} from './lib/hyperliquidFeed';
import {
  THEME_MAP,
  applyTheme,
  getInitialTheme,
  type ThemeId,
} from './lib/themes';

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
  const [calcOverrides, setCalcOverrides] = useState<Record<string, string>>({});
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [copied, setCopied] = useState<boolean>(false);
  const toastTimerRef = useRef<number | null>(null);

  const meta = useMemo(() => resolveTickerMeta(activeTicker), [activeTicker]);
  const activeCtx = ctxMap[meta.ticker] ?? null;

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

  // Global 4s live refresh of all Hyperliquid xyz: markets for ticker tape, search & room pills
  useEffect(() => {
    let active = true;
    const controller = new AbortController();

    const poll = async () => {
      try {
        const next = await fetchHyperliquidDexCtxMap('xyz', controller.signal);
        if (active && Object.keys(next).length > 0) {
          setCtxMap((prev) => ({ ...prev, ...next }));
        }
      } catch {
        // Keep last good map
      }
    };

    void poll();
    const id = window.setInterval(() => void poll(), 4000);

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
      const clean = ticker.trim().toUpperCase().replace(/^XYZ:/, '');
      if (!clean || clean === activeTicker) return;
      setActiveTicker(clean);
      showToast(`Switched to ${clean} War Room`);
    },
    [activeTicker, showToast],
  );

  const handleLiveCtxUpdate = useCallback((next: HlAssetCtx) => {
    setCtxMap((prev) => ({ ...prev, [next.ticker]: next }));
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
    activeCtx?.markPx ?? meta.referencePrice ?? 100;
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

  return (
    <div className="war-room-shell">
      {/* Top 0-Delay Scrolling Ticker Tape (Left-to-Right, Pause on Hover, Click to Open Room) */}
      <ScrollingTickerTape
        ctxMap={ctxMap}
        activeTicker={meta.ticker}
        onSelectTicker={handleSelectTicker}
      />

      {/* Compact Institutional Header with ⌘K Search & Slate/Daylight Theme Switcher */}
      <TerminalHeader
        activeTicker={meta.ticker}
        ctxMap={ctxMap}
        onSelectTicker={handleSelectTicker}
        onShareLink={handleShareLink}
        copied={copied}
        themeId={themeId}
        onSelectTheme={handleSelectTheme}
      />

      <main className="terminal-main">
        {/* 1-Click Flagship Multi-Ticker War Room Switcher */}
        <RoomSwitcherBar
          activeTicker={meta.ticker}
          ctxMap={ctxMap}
          onSelectTicker={handleSelectTicker}
        />

        {/* Active Ticker 0-Delay Sub-Second WebSocket Live Price Ribbon */}
        <LiveRealtimeRibbon
          meta={meta}
          initialCtx={activeCtx}
          onLiveCtxUpdate={handleLiveCtxUpdate}
          onSyncLivePrice={handleSelectPriceLevel}
        />

        {/* Main 70/30 Terminal Bento Grid */}
        <div className="workspace-grid">
          <div className="chart-column">
            <ExecutionChartPanel
              meta={meta}
              prevDayPx={activeCtx?.prevDayPx ?? null}
              themeId={themeId}
            />
            <FloorChatPanel
              key={meta.ticker}
              ticker={meta.ticker}
              livePrice={activeCtx?.markPx ?? null}
              onSelectPriceLevel={handleSelectPriceLevel}
            />
          </div>

          <aside
            className="intelligence-column"
            aria-label={`aINVEST AI Intelligence and Quantitative Tools for ${meta.ticker}`}
          >
            {/* Panel A — Real-Time aINVEST AI Signal Brief */}
            <AiIntelligencePanel
              meta={meta}
              liveCtx={activeCtx}
              onSelectPriceLevel={handleSelectPriceLevel}
            />

            {/* Panel B — Dynamic Valuation & Position P&L Calculator */}
            <ValuationCalculatorPanel
              meta={meta}
              livePrice={activeCtx?.markPx ?? null}
              referencePrice={meta.referencePrice ?? activeCtx?.prevDayPx ?? null}
              priceInput={calcPriceInput}
              onPriceInputChange={handleCalcPriceChange}
            />

            {/* Panel C — Live 0-Delay 17-Indicator Technical Consensus Gauge */}
            <TechnicalGaugePanel meta={meta} themeId={themeId} />
          </aside>
        </div>
      </main>

      <TerminalFooter meta={meta} />

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
