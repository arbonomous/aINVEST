import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowRight,
  Crosshair,
  Flame,
  RefreshCw,
  Search,
  ShieldAlert,
  Sparkles,
  TrendingDown,
  TrendingUp,
} from 'lucide-react';
import { resolveTickerMeta } from '../data/tickers';
import {
  generateDailyBreadCall,
  type BreadDirection,
  type DailyBreadCall,
} from '../lib/dailyBreadEngine';
import type { HlAssetCtx } from '../lib/hyperliquidFeed';
import type { DirectoryEntry } from '../lib/marketCatalog';
import type { NewsArticle } from '../lib/newsFeed';
import {
  directoryEntryToQuote,
  fetchUniversalCandles,
  hlCtxToQuote,
  type MarketQuote,
} from '../lib/universalFeed';

type BasketId = 'leaders' | 'ipos' | 'megacap';
type DirectionFilter = 'ALL' | BreadDirection | 'TOP';

const BASKETS: Record<BasketId, { label: string; tickers: string[] }> = {
  leaders: {
    label: 'AI & High Beta',
    tickers: ['ANT', 'NVDA', 'TSLA', 'PLTR', 'MSFT', 'META'],
  },
  ipos: {
    label: '2026 IPOs',
    tickers: ['ANT', 'SPCX', 'SKHY', 'CBRS', 'CRWV', 'CRCL'],
  },
  megacap: {
    label: 'Mega Cap & ETFs',
    tickers: ['AAPL', 'GOOGL', 'AMZN', 'AMD', 'XYZ100', 'SP500'],
  },
};

interface DailyBreadDeskProps {
  ctxMap: Record<string, HlAssetCtx>;
  quoteMap: Record<string, MarketQuote>;
  directoryMap: Record<string, DirectoryEntry>;
  breakingNews: NewsArticle[];
  compact?: boolean;
  onSelectTicker: (ticker: string) => void;
  onOpenFullDesk?: () => void;
}

function fmtPx(n: number): string {
  return n >= 10 ? `$${n.toFixed(2)}` : `$${n.toFixed(3)}`;
}

export function DailyBreadDesk({
  ctxMap,
  quoteMap,
  directoryMap,
  breakingNews,
  compact = false,
  onSelectTicker,
  onOpenFullDesk,
}: DailyBreadDeskProps) {
  const [basket, setBasket] = useState<BasketId>('leaders');
  const [dirFilter, setDirFilter] = useState<DirectionFilter>('ALL');
  const [customTickerInput, setCustomTickerInput] = useState<string>('');
  const [customCalls, setCustomCalls] = useState<DailyBreadCall[]>([]);
  const [scanningCustom, setScanningCustom] = useState<boolean>(false);
  const [scanState, setScanState] = useState<{
    basket: BasketId;
    calls: DailyBreadCall[];
    scannedAt: string;
  } | null>(null);
  const [manualRefreshing, setManualRefreshing] = useState<boolean>(false);

  const ctxRef = useRef(ctxMap);
  const quoteRef = useRef(quoteMap);
  const dirRef = useRef(directoryMap);
  const newsRef = useRef(breakingNews);

  useEffect(() => {
    ctxRef.current = ctxMap;
  }, [ctxMap]);
  useEffect(() => {
    quoteRef.current = quoteMap;
  }, [quoteMap]);
  useEffect(() => {
    dirRef.current = directoryMap;
  }, [directoryMap]);
  useEffect(() => {
    newsRef.current = breakingNews;
  }, [breakingNews]);

  const scanTicker = useCallback(
    async (rawTicker: string, signal?: AbortSignal): Promise<DailyBreadCall | null> => {
      const ticker = rawTicker.trim().toUpperCase().replace(/^\$/, '');
      if (!ticker) return null;
      const hlCtx = ctxRef.current[ticker] ?? null;
      const dirEntry = dirRef.current[ticker] ?? null;
      const liveQ = quoteRef.current[ticker] ?? null;
      const meta = resolveTickerMeta(ticker, {
        directoryEntry: dirEntry,
        hlCoin: hlCtx?.coin ?? null,
        resolvedExchange: liveQ?.resolvedExchange,
        longName: liveQ?.longName,
      });

      const [r15, r60, r5] = await Promise.all([
        fetchUniversalCandles(meta.ticker, meta.hlCoin, '15m', 120, signal),
        fetchUniversalCandles(meta.ticker, meta.hlCoin, '1h', 120, signal),
        fetchUniversalCandles(meta.ticker, meta.hlCoin, '5m', 80, signal),
      ]);

      const quote: MarketQuote | null = hlCtx
        ? hlCtxToQuote(hlCtx)
        : r15.quote ?? r5.quote ?? liveQ ?? (dirEntry ? directoryEntryToQuote(dirEntry) : null);

      return generateDailyBreadCall(
        meta,
        r15.candles,
        r60.candles,
        r5.candles,
        quote,
        newsRef.current,
      );
    },
    [],
  );

  const fetchBasketCalls = useCallback(
    async (
      targetBasket: BasketId,
      signal?: AbortSignal,
    ): Promise<DailyBreadCall[] | null> => {
      const tickers = BASKETS[targetBasket].tickers;
      const settled = await Promise.allSettled(
        tickers.map((t) => scanTicker(t, signal)),
      );
      if (signal?.aborted) return null;

      const calls: DailyBreadCall[] = [];
      for (const r of settled) {
        if (r.status === 'fulfilled' && r.value) {
          calls.push(r.value);
        }
      }
      // Sort actionable LONG/SHORT high-confidence setups first
      calls.sort((a, b) => {
        const actA = a.direction === 'WAIT' ? 0 : 1;
        const actB = b.direction === 'WAIT' ? 0 : 1;
        if (actA !== actB) return actB - actA;
        return b.confidence - a.confidence;
      });
      return calls;
    },
    [scanTicker],
  );

  useEffect(() => {
    let active = true;
    const controller = new AbortController();

    const poll = async () => {
      const calls = await fetchBasketCalls(basket, controller.signal);
      if (!active || !calls) return;
      setScanState({
        basket,
        calls,
        scannedAt: new Date().toLocaleTimeString([], {
          hour: '2-digit',
          minute: '2-digit',
          hour12: false,
        }),
      });
    };

    void poll();
    const id = window.setInterval(() => void poll(), 60_000);
    return () => {
      active = false;
      controller.abort();
      window.clearInterval(id);
    };
  }, [basket, fetchBasketCalls]);

  const handleManualRescan = async () => {
    setManualRefreshing(true);
    try {
      const calls = await fetchBasketCalls(basket);
      if (calls) {
        setScanState({
          basket,
          calls,
          scannedAt: new Date().toLocaleTimeString([], {
            hour: '2-digit',
            minute: '2-digit',
            hour12: false,
          }),
        });
      }
    } finally {
      setManualRefreshing(false);
    }
  };

  const handleScanCustom = async (e: React.FormEvent) => {
    e.preventDefault();
    const clean = customTickerInput.trim().toUpperCase().replace(/^\$/, '');
    if (!clean || !/^[A-Z0-9][A-Z0-9._-]{0,11}$/.test(clean) || scanningCustom) return;
    setScanningCustom(true);
    try {
      const call = await scanTicker(clean);
      if (call) {
        setCustomCalls((prev) => [
          call,
          ...prev.filter((c) => c.ticker !== call.ticker),
        ].slice(0, 4));
        setCustomTickerInput('');
      }
    } finally {
      setScanningCustom(false);
    }
  };

  const isLoadingBasket = scanState?.basket !== basket;

  const combinedCalls = useMemo(() => {
    const basketCalls = scanState?.basket === basket ? scanState.calls : [];
    const seen = new Set<string>();
    const merged: DailyBreadCall[] = [];
    for (const c of [...customCalls, ...basketCalls]) {
      if (seen.has(c.ticker)) continue;
      seen.add(c.ticker);
      merged.push(c);
    }

    const filtered = merged.filter((c) => {
      if (dirFilter === 'ALL') return true;
      if (dirFilter === 'TOP') return c.direction !== 'WAIT' && c.confidence >= 70;
      return c.direction === dirFilter;
    });

    return compact ? filtered.slice(0, 4) : filtered;
  }, [scanState, basket, customCalls, dirFilter, compact]);

  const summaryCounts = useMemo(() => {
    const list = scanState?.basket === basket ? scanState.calls : [];
    let longs = 0;
    let shorts = 0;
    let waits = 0;
    for (const c of list) {
      if (c.direction === 'LONG') longs += 1;
      else if (c.direction === 'SHORT') shorts += 1;
      else waits += 1;
    }
    return { longs, shorts, waits };
  }, [scanState, basket]);

  return (
    <section
      className={`daily-bread-section${compact ? ' daily-bread-section--compact' : ''}`}
      aria-label="Daily Bread AI Day-Trade Calls"
    >
      <div className="daily-bread-header">
        <div className="daily-bread-title-block">
          <div className="daily-bread-eyebrow-row">
            <span className="daily-bread-badge mono">
              <Flame size={11} />
              <span>DAILY BREAD</span>
            </span>
            <span className="daily-bread-subtag mono">
              AI MULTI-TF CHART &amp; INDICATOR CALLS
            </span>
            {scanState && (
              <span className="daily-bread-sync mono">
                SCANNED {scanState.scannedAt} • {summaryCounts.longs}L /{' '}
                {summaryCounts.shorts}S / {summaryCounts.waits}W
              </span>
            )}
          </div>
          {!compact && (
            <h1 className="daily-bread-hero-title">
              Daily Bread — Live AI Day-Trade Setups
            </h1>
          )}
          <p className="daily-bread-desc">
            Real-time chart reads combining 5m/15m/1h EMA structure, Session VWAP,
            RSI(14), MACD, Bollinger Bands, ATR risk sizing, and breaking news catalysts.
          </p>
        </div>

        <div className="daily-bread-header-actions">
          <button
            type="button"
            className="dispatch-refresh-btn mono"
            onClick={() => void handleManualRescan()}
            disabled={manualRefreshing || isLoadingBasket}
            title="Rescan live chart indicators now"
          >
            <RefreshCw
              size={11}
              className={manualRefreshing || isLoadingBasket ? 'spin-icon' : ''}
            />
            <span>RESCAN</span>
          </button>

          {compact && onOpenFullDesk && (
            <button
              type="button"
              className="bread-open-desk-btn mono"
              onClick={onOpenFullDesk}
            >
              <span>FULL DAILY BREAD</span>
              <ArrowRight size={12} />
            </button>
          )}
        </div>
      </div>

      {/* Controls Bar: Basket Tabs + Direction Filters + Instant Any-Ticker AI Scan */}
      <div className="daily-bread-toolbar">
        <div className="bread-tabs-group" role="tablist" aria-label="Scanner basket">
          {(Object.entries(BASKETS) as Array<[BasketId, { label: string }]>).map(
            ([id, info]) => (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={basket === id}
                className={`bread-basket-tab mono${basket === id ? ' active' : ''}`}
                onClick={() => setBasket(id)}
              >
                {info.label}
              </button>
            ),
          )}
        </div>

        <div className="bread-filter-group" role="tablist" aria-label="Filter calls by direction">
          {(
            [
              ['ALL', 'All'],
              ['LONG', 'Longs'],
              ['SHORT', 'Shorts'],
              ['TOP', 'High Conv.'],
            ] as Array<[DirectionFilter, string]>
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={dirFilter === id}
              className={`news-cat-tab mono${dirFilter === id ? ' active' : ''}`}
              onClick={() => setDirFilter(id)}
            >
              {label}
            </button>
          ))}
        </div>

        {!compact && (
          <form className="bread-custom-scan-form" onSubmit={(e) => void handleScanCustom(e)}>
            <Search size={12} className="bread-custom-icon" aria-hidden="true" />
            <input
              type="text"
              className="bread-custom-input mono"
              placeholder="Scan any stock/IPO (e.g. JPM, DIS, SPCX)"
              value={customTickerInput}
              onChange={(e) => setCustomTickerInput(e.target.value)}
              aria-label="Scan any stock or IPO for a Daily Bread AI call"
            />
            <button
              type="submit"
              className="bread-custom-btn mono"
              disabled={scanningCustom || !customTickerInput.trim()}
            >
              {scanningCustom ? 'READING…' : 'AI READ'}
            </button>
          </form>
        )}
      </div>

      {/* Calls Grid */}
      {isLoadingBasket && combinedCalls.length === 0 ? (
        <div className="daily-bread-loading mono">
          <Sparkles size={14} className="text-emerald" />
          <span>
            AI reading live 5m / 15m / 1h candles, VWAP, EMA, RSI &amp; MACD across{' '}
            {BASKETS[basket].tickers.join(', ')}…
          </span>
        </div>
      ) : combinedCalls.length === 0 ? (
        <div className="daily-bread-loading mono">
          <span>
            No setups match this filter right now — switch to &ldquo;All&rdquo; or rescan
            another basket.
          </span>
        </div>
      ) : (
        <div className={`daily-bread-grid${compact ? ' daily-bread-grid--compact' : ''}`}>
          {combinedCalls.map((call) => {
            const isLong = call.direction === 'LONG';
            const isShort = call.direction === 'SHORT';
            const dirTone = isLong ? 'bull' : isShort ? 'bear' : 'amber';
            const pxUp = call.changePct !== null && call.changePct >= 0;

            return (
              <article
                key={call.ticker}
                className={`bread-call-card bread-call-card--${dirTone}`}
              >
                <div className="bread-card-top">
                  <div className="bread-card-identity">
                    <span className={`bread-dir-pill bread-dir-pill--${dirTone} mono`}>
                      {isLong ? (
                        <TrendingUp size={11} />
                      ) : isShort ? (
                        <TrendingDown size={11} />
                      ) : (
                        <Crosshair size={11} />
                      )}
                      <span>{call.direction}</span>
                    </span>
                    <button
                      type="button"
                      className="bread-ticker-btn mono"
                      onClick={() => onSelectTicker(call.ticker)}
                    >
                      {call.ticker}
                    </button>
                    <span className="bread-company-name">{call.name}</span>
                  </div>

                  <div className="bread-card-score mono">
                    <span className={`bread-grade-pill bread-grade-pill--${dirTone}`}>
                      {call.grade}
                    </span>
                    <span className="bread-conf-pct">{call.confidence}%</span>
                  </div>
                </div>

                <div className="bread-setup-row mono">
                  <span className="bread-setup-name">{call.setupName}</span>
                  <div className="bread-live-px-cluster">
                    <span className="bread-live-px">{fmtPx(call.livePrice)}</span>
                    {call.changePct !== null && (
                      <span className={pxUp ? 'text-emerald' : 'text-crimson'}>
                        {pxUp ? '+' : ''}
                        {call.changePct.toFixed(2)}%
                      </span>
                    )}
                  </div>
                </div>

                {/* 4-Level Trade Execution Grid */}
                <div className="bread-levels-strip mono">
                  <div className="bread-level-cell">
                    <span className="bread-lvl-label">
                      {call.direction === 'WAIT' ? 'VWAP PIVOT' : 'ENTRY ZONE'}
                    </span>
                    <span className="bread-lvl-val">
                      {fmtPx(call.entryLow)}–{fmtPx(call.entryHigh)}
                    </span>
                  </div>

                  <div className="bread-level-cell">
                    <span className="bread-lvl-label">
                      {call.direction === 'WAIT' ? 'BREAKOUT' : 'TARGET 1'}
                    </span>
                    <span className="bread-lvl-val text-emerald">
                      {fmtPx(call.target1)}
                    </span>
                  </div>

                  <div className="bread-level-cell">
                    <span className="bread-lvl-label">
                      {call.direction === 'WAIT' ? 'EXT TARGET' : 'TARGET 2'}
                    </span>
                    <span className="bread-lvl-val text-emerald">
                      {fmtPx(call.target2)}
                    </span>
                  </div>

                  <div className="bread-level-cell">
                    <span className="bread-lvl-label">
                      {call.direction === 'WAIT' ? 'BREAKDOWN' : 'STOP LOSS'}
                    </span>
                    <span className="bread-lvl-val text-crimson">
                      {fmtPx(call.stopLoss)}
                    </span>
                  </div>
                </div>

                {/* Live Indicator Chips */}
                <div className="bread-indicators-row mono">
                  {call.indicators.map((ind) => (
                    <span
                      key={ind.label}
                      className={`bread-ind-chip bread-ind-chip--${ind.tone}`}
                    >
                      <span className="bread-ind-k">{ind.label}</span>
                      <span className="bread-ind-v">{ind.value}</span>
                    </span>
                  ))}
                  {call.direction !== 'WAIT' && (
                    <span className="bread-rr-chip">1 : {call.riskReward} R/R</span>
                  )}
                </div>

                <p className="bread-thesis">{call.thesis}</p>

                {call.catalystHeadline && (
                  <div className="bread-catalyst-note">
                    <span className="bread-catalyst-tag mono">NEWS CATALYST</span>
                    <span>{call.catalystHeadline}</span>
                  </div>
                )}

                <div className="bread-card-footer">
                  <span className="bread-invalidation">
                    <ShieldAlert size={11} />
                    <span>{call.invalidationNote}</span>
                  </span>

                  <button
                    type="button"
                    className="bread-launch-btn mono"
                    onClick={() => onSelectTicker(call.ticker)}
                  >
                    <span>CHART</span>
                    <ArrowRight size={11} />
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      )}

      <div className="daily-bread-disclaimer mono">
        DAILY BREAD synthesizes live chart indicators (VWAP, EMA 9/21/50, RSI, MACD, ATR)
        for informational day-trade monitoring only — not personalized financial advice.
      </div>
    </section>
  );
}
