import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Activity,
  ArrowDownRight,
  ArrowUpRight,
  Calculator,
  Flame,
  Radio,
  RefreshCw,
  Search,
  Star,
  Volume2,
  VolumeX,
  Waves,
} from 'lucide-react';
import type { HlAssetCtx } from '../lib/hyperliquidFeed';
import type { DirectoryEntry } from '../lib/marketCatalog';
import { playAlertChime } from '../lib/priceAlerts';
import type { MarketQuote } from '../lib/universalFeed';
import {
  HyperliquidWhaleTapeStream,
  WHALE_FLOW_LEADERS,
  computeMarketTide,
  fetchRecentHlWhalePrints,
  fetchTickerOptionsFlow,
  scanMarketOptionsFlow,
  type OptionContractFlow,
  type TickerOptionsSummary,
  type WhaleTapePrint,
} from '../lib/whaleFlowEngine';
import {
  appendMarketTideHistory,
  loadTodayMarketTideHistory,
  type MarketTidePoint,
} from '../lib/marketTideHistory';
import { GexProfilePanel } from './GexProfilePanel';
import { MarketTideChart } from './MarketTideChart';

type UoaFilter =
  | 'ALL'
  | 'CALL'
  | 'PUT'
  | 'LOTTO_0_7D'
  | 'LEAPS'
  | 'VOL_OI'
  | 'MEGA';
type DteBucket = 'ALL' | '0_7' | '8_30' | '31_90' | '90_PLUS';
type PremBucket = 0 | 25000 | 100000 | 250000 | 1000000;
type MoneynessFilter = 'ALL' | 'OTM' | 'ATM' | 'ITM';
type TapeMinUsd = 0 | 5000 | 25000 | 100000;
type TapeSideFilter = 'ALL' | 'BUY' | 'SELL';
type ChimeThreshold = 0 | 50000 | 100000 | 250000;

interface WhaleFlowDeskProps {
  ctxMap: Record<string, HlAssetCtx>;
  quoteMap: Record<string, MarketQuote>;
  directoryMap: Record<string, DirectoryEntry>;
  pinnedTickers?: string[];
  onSelectTicker: (ticker: string) => void;
  onSimulateContract?: (contract: OptionContractFlow) => void;
  onNotify?: (message: string) => void;
  onArmAlert?: (params: {
    ticker: string;
    targetPrice: number;
    currentPrice?: number | null;
    label: string;
  }) => void;
}

const TAPE_PRIORITY_TICKERS = [
  'ANT',
  'NVDA',
  'TSLA',
  'SPCX',
  'PLTR',
  'MSFT',
  'META',
  'XYZ100',
  'SP500',
];

const CHIME_STEPS: ChimeThreshold[] = [0, 50000, 100000, 250000];

function fmtUsd(n: number): string {
  const abs = Math.abs(n);
  const sign = n < 0 ? '-' : '';
  if (abs >= 1e9) return `${sign}$${(abs / 1e9).toFixed(2)}B`;
  if (abs >= 1e6) return `${sign}$${(abs / 1e6).toFixed(2)}M`;
  if (abs >= 1e3) return `${sign}$${(abs / 1e3).toFixed(1)}K`;
  return `${sign}$${abs.toFixed(0)}`;
}

function fmtPx(n: number): string {
  return n >= 10 ? `$${n.toFixed(2)}` : `$${n.toFixed(3)}`;
}

function fmtTime(ms: number): string {
  return new Date(ms).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
}

export function WhaleFlowDesk({
  ctxMap,
  quoteMap,
  directoryMap,
  pinnedTickers = [],
  onSelectTicker,
  onSimulateContract,
  onNotify,
  onArmAlert,
}: WhaleFlowDeskProps) {
  const [uoaFilter, setUoaFilter] = useState<UoaFilter>('ALL');
  const [dteBucket, setDteBucket] = useState<DteBucket>('ALL');
  const [minPrem, setMinPrem] = useState<PremBucket>(0);
  const [moneynessFilter, setMoneynessFilter] = useState<MoneynessFilter>('ALL');
  const [watchlistOnly, setWatchlistOnly] = useState<boolean>(false);
  const [gexTicker, setGexTicker] = useState<string>('');
  const [customInput, setCustomInput] = useState<string>('');
  const [scanningCustom, setScanningCustom] = useState<boolean>(false);
  const [customSummary, setCustomSummary] = useState<TickerOptionsSummary | null>(
    null,
  );
  const [flowState, setFlowState] = useState<{
    summaries: TickerOptionsSummary[];
    hotContracts: OptionContractFlow[];
    scannedAt: string;
  } | null>(null);
  const [refreshingFlow, setRefreshingFlow] = useState<boolean>(false);
  const [tideHistory, setTideHistory] = useState<MarketTidePoint[]>(() =>
    loadTodayMarketTideHistory(),
  );

  // Live 24/7 Hyperliquid Whale Print Tape + Live Chime Ping
  const [tapePrints, setTapePrints] = useState<WhaleTapePrint[]>([]);
  const [tapeWsLive, setTapeWsLive] = useState<boolean>(false);
  const [tapeMinUsd, setTapeMinUsd] = useState<TapeMinUsd>(0);
  const [tapeSide, setTapeSide] = useState<TapeSideFilter>('ALL');
  const [chimeThreshold, setChimeThreshold] = useState<ChimeThreshold>(0);
  const [lastWhalePing, setLastWhalePing] = useState<WhaleTapePrint | null>(null);
  const chimeThresholdRef = useRef<ChimeThreshold>(0);
  const lastChimeMsRef = useRef<number>(0);

  const pinnedSet = useMemo(() => new Set(pinnedTickers), [pinnedTickers]);

  const spySpotPx = useMemo(
    () =>
      quoteMap.SPY?.price ??
      directoryMap.SPY?.lastSale ??
      flowState?.summaries.find((s) => s.ticker === 'SPY')?.spotPrice ??
      null,
    [quoteMap, directoryMap, flowState],
  );
  const spySpotRef = useRef<number | null>(spySpotPx);

  useEffect(() => {
    spySpotRef.current = spySpotPx;
  }, [spySpotPx]);

  useEffect(() => {
    chimeThresholdRef.current = chimeThreshold;
  }, [chimeThreshold]);

  const watchedCoinsKey = useMemo(() => {
    const coins: string[] = [];
    for (const sym of TAPE_PRIORITY_TICKERS) {
      const c = ctxMap[sym]?.coin;
      if (c) coins.push(c);
    }
    if (coins.length === 0) {
      const top = Object.values(ctxMap)
        .sort((a, b) => b.dayNtlVlm - a.dayNtlVlm)
        .slice(0, 6)
        .map((x) => x.coin);
      return top.join(',');
    }
    return coins.slice(0, 8).join(',');
  }, [ctxMap]);

  // Initial & periodic CBOE Unusual Options Activity scan
  useEffect(() => {
    let active = true;
    const controller = new AbortController();

    const poll = async () => {
      const res = await scanMarketOptionsFlow(
        WHALE_FLOW_LEADERS,
        false,
        controller.signal,
      );
      if (!active || controller.signal.aborted) return;
      const callPrem = res.summaries.reduce((acc, s) => acc + s.callPremiumUsd, 0);
      const putPrem = res.summaries.reduce((acc, s) => acc + s.putPremiumUsd, 0);
      const spyFromChain =
        res.summaries.find((s) => s.ticker === 'SPY')?.spotPrice ?? spySpotRef.current;
      setTideHistory((prev) =>
        appendMarketTideHistory(prev, callPrem, putPrem, spyFromChain),
      );
      setFlowState({
        summaries: res.summaries,
        hotContracts: res.hotContracts,
        scannedAt: new Date().toLocaleTimeString([], {
          hour: '2-digit',
          minute: '2-digit',
          hour12: false,
        }),
      });
    };

    void poll();
    const id = window.setInterval(() => void poll(), 120_000);
    return () => {
      active = false;
      controller.abort();
      window.clearInterval(id);
    };
  }, []);

  // Live 24/7 Hyperliquid Whale Tape REST bootstrap + WebSocket firehose
  useEffect(() => {
    const coins = watchedCoinsKey ? watchedCoinsKey.split(',') : [];
    if (coins.length === 0) return;

    let active = true;
    const controller = new AbortController();

    void fetchRecentHlWhalePrints(coins, controller.signal).then((initial) => {
      if (!active || initial.length === 0) return;
      setTapePrints((prev) => {
        const seen = new Set<string>();
        const merged: WhaleTapePrint[] = [];
        for (const p of [...prev, ...initial]) {
          if (seen.has(p.id)) continue;
          seen.add(p.id);
          merged.push(p);
        }
        return merged.sort((a, b) => b.time - a.time).slice(0, 120);
      });
    });

    const stream = new HyperliquidWhaleTapeStream(
      coins,
      (incoming) => {
        if (!active) return;

        // Fire Whale Sound Chime when live print crosses user threshold
        const minChime = chimeThresholdRef.current;
        if (minChime > 0) {
          const biggest = incoming
            .filter((p) => p.notionalUsd >= minChime)
            .sort((a, b) => b.notionalUsd - a.notionalUsd)[0];
          if (biggest) {
            setLastWhalePing(biggest);
            const now = Date.now();
            if (now - lastChimeMsRef.current >= 4000) {
              lastChimeMsRef.current = now;
              playAlertChime();
            }
          }
        }

        setTapePrints((prev) => {
          const seen = new Set<string>();
          const merged: WhaleTapePrint[] = [];
          for (const p of [...incoming, ...prev]) {
            if (seen.has(p.id)) continue;
            seen.add(p.id);
            merged.push(p);
          }
          return merged.sort((a, b) => b.time - a.time).slice(0, 120);
        });
      },
      (live) => {
        if (active) setTapeWsLive(live);
      },
    );
    stream.connect();

    return () => {
      active = false;
      controller.abort();
      stream.destroy();
    };
  }, [watchedCoinsKey]);

  const handleManualRefresh = useCallback(async () => {
    setRefreshingFlow(true);
    try {
      const res = await scanMarketOptionsFlow(WHALE_FLOW_LEADERS, true);
      const callPrem = res.summaries.reduce((acc, s) => acc + s.callPremiumUsd, 0);
      const putPrem = res.summaries.reduce((acc, s) => acc + s.putPremiumUsd, 0);
      const spyFromChain =
        res.summaries.find((s) => s.ticker === 'SPY')?.spotPrice ?? spySpotRef.current;
      setTideHistory((prev) =>
        appendMarketTideHistory(prev, callPrem, putPrem, spyFromChain),
      );
      setFlowState({
        summaries: res.summaries,
        hotContracts: res.hotContracts,
        scannedAt: new Date().toLocaleTimeString([], {
          hour: '2-digit',
          minute: '2-digit',
          hour12: false,
        }),
      });
    } finally {
      setRefreshingFlow(false);
    }
  }, []);

  const handleScanCustomTicker = async (e: React.FormEvent) => {
    e.preventDefault();
    const clean = customInput.trim().toUpperCase().replace(/^\$/, '');
    if (!clean || !/^[A-Z0-9][A-Z0-9._-]{0,10}$/.test(clean) || scanningCustom) {
      return;
    }
    setScanningCustom(true);
    try {
      const res = await fetchTickerOptionsFlow(clean, null, true);
      if (res) {
        setCustomSummary(res);
        setGexTicker(res.ticker);
        setCustomInput('');
      }
    } finally {
      setScanningCustom(false);
    }
  };

  const handleCycleChime = () => {
    const idx = CHIME_STEPS.indexOf(chimeThreshold);
    const next = CHIME_STEPS[(idx + 1) % CHIME_STEPS.length];
    setChimeThreshold(next);
    if (next > 0) {
      playAlertChime();
    }
  };

  const hasGranularFilters =
    uoaFilter !== 'ALL' ||
    dteBucket !== 'ALL' ||
    minPrem !== 0 ||
    moneynessFilter !== 'ALL' ||
    watchlistOnly;

  const handleResetFilters = () => {
    setUoaFilter('ALL');
    setDteBucket('ALL');
    setMinPrem(0);
    setMoneynessFilter('ALL');
    setWatchlistOnly(false);
  };

  const allSummaries = useMemo(() => {
    const base = flowState?.summaries ?? [];
    if (!customSummary) return base;
    return [
      customSummary,
      ...base.filter((s) => s.ticker !== customSummary.ticker),
    ];
  }, [flowState, customSummary]);

  const marketTide = useMemo(
    () => computeMarketTide(allSummaries, ctxMap, quoteMap, directoryMap),
    [allSummaries, ctxMap, quoteMap, directoryMap],
  );

  const filteredContracts = useMemo(() => {
    const base = flowState?.hotContracts ?? [];
    const combined = customSummary
      ? [
          ...customSummary.unusualContracts.slice(0, 12),
          ...base.filter((c) => c.ticker !== customSummary.ticker),
        ]
      : base;

    return combined.filter((c) => {
      if (watchlistOnly && pinnedSet.size > 0 && !pinnedSet.has(c.ticker)) {
        return false;
      }
      if (uoaFilter === 'CALL' && c.type !== 'CALL') return false;
      if (uoaFilter === 'PUT' && c.type !== 'PUT') return false;
      if (uoaFilter === 'LOTTO_0_7D' && c.dte > 7) return false;
      if (uoaFilter === 'LEAPS' && c.dte < 90) return false;
      if (uoaFilter === 'VOL_OI' && c.volOiRatio < 1.5) return false;
      if (uoaFilter === 'MEGA' && c.estPremiumUsd < 250_000) return false;

      if (dteBucket === '0_7' && c.dte > 7) return false;
      if (dteBucket === '8_30' && (c.dte < 8 || c.dte > 30)) return false;
      if (dteBucket === '31_90' && (c.dte < 31 || c.dte > 90)) return false;
      if (dteBucket === '90_PLUS' && c.dte <= 90) return false;

      if (minPrem > 0 && c.estPremiumUsd < minPrem) return false;
      if (moneynessFilter !== 'ALL' && c.moneyness !== moneynessFilter) {
        return false;
      }
      return true;
    });
  }, [
    flowState,
    customSummary,
    uoaFilter,
    dteBucket,
    minPrem,
    moneynessFilter,
    watchlistOnly,
    pinnedSet,
  ]);

  const filteredTape = useMemo(
    () =>
      tapePrints
        .filter((p) => p.notionalUsd >= tapeMinUsd)
        .filter((p) => tapeSide === 'ALL' || p.side === tapeSide)
        .filter((p) => !watchlistOnly || pinnedSet.size === 0 || pinnedSet.has(p.ticker))
        .slice(0, 45),
    [tapePrints, tapeMinUsd, tapeSide, watchlistOnly, pinnedSet],
  );

  const { tapeBuyUsd, tapeSellUsd } = useMemo(() => {
    let buy = 0;
    let sell = 0;
    for (const p of filteredTape) {
      if (p.side === 'BUY') buy += p.notionalUsd;
      else sell += p.notionalUsd;
    }
    return { tapeBuyUsd: buy, tapeSellUsd: sell };
  }, [filteredTape]);

  const totalTidePrem = marketTide.callPremiumUsd + marketTide.putPremiumUsd;
  const callPremPct =
    totalTidePrem > 0
      ? Math.round((marketTide.callPremiumUsd / totalTidePrem) * 100)
      : 50;
  const totalTapeUsd = tapeBuyUsd + tapeSellUsd;
  const tapeBuyPct =
    totalTapeUsd > 0 ? Math.round((tapeBuyUsd / totalTapeUsd) * 100) : 50;

  const tideTone =
    marketTide.score >= 15
      ? 'bull'
      : marketTide.score <= -15
        ? 'bear'
        : 'amber';

  return (
    <div className="whale-flow-shell">
      {/* 1. Market Tide & 6-Sector Smart-Money Heatmap */}
      <section className="whale-card" aria-label="Market Tide and Sector Flow Heatmap">
        <div className="whale-hero-head">
          <div className="whale-title-block">
            <div className="daily-bread-eyebrow-row">
              <span className="whale-badge mono">
                <Waves size={11} />
                <span>WHALE FLOW</span>
              </span>
              <span className="daily-bread-subtag mono">
                UNUSUAL OPTIONS • DEALER GEX WALLS • 24/7 WHALE TAPE
              </span>
              {flowState && (
                <span className="daily-bread-sync mono">
                  SYNCED {flowState.scannedAt}
                </span>
              )}
            </div>
            <h1 className="daily-bread-hero-title">
              Smart-Money Options Flow, Dealer GEX &amp; 24/7 Whale Tape
            </h1>
          </div>

          <div className="whale-tide-readout mono">
            <span className={`whale-tide-pill whale-tide-pill--${tideTone}`}>
              {marketTide.verdict} ({marketTide.score >= 0 ? '+' : ''}
              {marketTide.score})
            </span>
            <button
              type="button"
              className="dispatch-refresh-btn mono"
              onClick={() => void handleManualRefresh()}
              disabled={refreshingFlow}
            >
              <RefreshCw size={11} className={refreshingFlow ? 'spin-icon' : ''} />
              <span>RESCAN FLOW</span>
            </button>
          </div>
        </div>

        {/* Market Tide Premium Bar + Breadth */}
        <div className="whale-tide-strip mono">
          <div className="whale-tide-metrics">
            <span className="text-emerald">
              CALL PREM {fmtUsd(marketTide.callPremiumUsd)} ({callPremPct}%)
            </span>
            <span
              className={
                marketTide.netPremiumUsd >= 0 ? 'text-emerald' : 'text-crimson'
              }
            >
              NET FLOW {marketTide.netPremiumUsd >= 0 ? '+' : ''}
              {fmtUsd(marketTide.netPremiumUsd)}
            </span>
            <span className="text-crimson">
              PUT PREM {fmtUsd(marketTide.putPremiumUsd)} ({100 - callPremPct}%)
            </span>
            <span className="text-muted">
              BREADTH {marketTide.advancers} UP / {marketTide.decliners} DOWN
            </span>
          </div>

          <div className="whale-split-bar" aria-label="Call vs Put premium split">
            <div
              className="whale-split-bull"
              style={{ width: `${callPremPct}%` }}
            />
            <div
              className="whale-split-bear"
              style={{ width: `${100 - callPremPct}%` }}
            />
          </div>
        </div>

        {/* Intraday Market Tide Dual-Line Timeline (Call Prem vs Put Prem + SPY) */}
        <MarketTideChart
          points={tideHistory}
          liveCallPrem={marketTide.callPremiumUsd}
          livePutPrem={marketTide.putPremiumUsd}
          liveSpyPx={spySpotPx}
          latestLabel={flowState?.scannedAt}
        />

        {/* 6-Sector Flow Heatmap */}
        <div className="whale-sector-grid">
          {marketTide.sectors.map((sec) => {
            const up = sec.avgPct >= 0;
            const strong = Math.abs(sec.avgPct) >= 1.5;
            return (
              <div
                key={sec.sector}
                className={`whale-sector-tile whale-sector-tile--${
                  up ? (strong ? 'strong-bull' : 'bull') : strong ? 'strong-bear' : 'bear'
                }`}
              >
                <div className="whale-sector-top mono">
                  <span className="whale-sector-name">{sec.sector}</span>
                  <span className={up ? 'text-emerald' : 'text-crimson'}>
                    {up ? '+' : ''}
                    {sec.avgPct.toFixed(2)}%
                  </span>
                </div>
                <div className="whale-sector-tickers mono">
                  {sec.leaders.map((l) => (
                    <button
                      key={l.ticker}
                      type="button"
                      className="whale-sector-chip"
                      onClick={() => onSelectTicker(l.ticker)}
                    >
                      <span>{l.ticker}</span>
                      <span className={l.pct >= 0 ? 'text-emerald' : 'text-crimson'}>
                        {l.pct >= 0 ? '+' : ''}
                        {l.pct.toFixed(1)}%
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* 2. Dealer Gamma Exposure (GEX) Strike Profile, Walls & IV Term Structure */}
      <GexProfilePanel
        summaries={allSummaries}
        selectedTicker={gexTicker || undefined}
        onSelectProfileTicker={setGexTicker}
        onOpenTerminal={onSelectTicker}
        onNotify={onNotify}
        onArmAlert={onArmAlert}
      />

      {/* 3. Split Command Grid: Pro Options Flow Screener (Left) + Live 24/7 Whale Tape (Right) */}
      <div className="whale-split-grid">
        {/* LEFT: Pro Unusual Options Activity (UOA) Screener */}
        <section className="whale-card" aria-label="Unusual Options Activity Hot Chains">
          <div className="panel-header">
            <div className="panel-title-group">
              <Flame size={13} className="text-amber" aria-hidden="true" />
              <h2 className="panel-title">UNUSUAL OPTIONS FLOW (UOA)</h2>
              <span className="panel-badge panel-badge--emerald mono">
                {filteredContracts.length} HOT CHAINS
              </span>
            </div>

            <form
              className="whale-scan-form"
              onSubmit={(e) => void handleScanCustomTicker(e)}
            >
              <Search size={11} className="bread-custom-icon" aria-hidden="true" />
              <input
                type="text"
                className="whale-scan-input mono"
                placeholder="Scan stock options (e.g. COIN, JPM)"
                value={customInput}
                onChange={(e) => setCustomInput(e.target.value)}
                aria-label="Scan options chain for any US stock"
              />
              <button
                type="submit"
                className="bread-custom-btn mono"
                disabled={scanningCustom || !customInput.trim()}
              >
                {scanningCustom ? 'SCANNING…' : 'SCAN'}
              </button>
            </form>
          </div>

          {/* Pro Presets + Granular DTE / Min Prem / Moneyness Bar */}
          <div className="whale-uoa-toolbar">
            <div className="bread-filter-group" role="tablist" aria-label="Filter options flow presets">
              {(
                [
                  ['ALL', 'All Flow'],
                  ['CALL', 'Calls'],
                  ['PUT', 'Puts'],
                  ['LOTTO_0_7D', '0-7D Lotto'],
                  ['LEAPS', 'Whale LEAPS'],
                  ['VOL_OI', 'Vol > 1.5× OI'],
                  ['MEGA', 'Mega $250K+'],
                ] as Array<[UoaFilter, string]>
              ).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  role="tab"
                  aria-selected={uoaFilter === id}
                  className={`news-cat-tab mono${uoaFilter === id ? ' active' : ''}`}
                  onClick={() => setUoaFilter(id)}
                >
                  {label}
                </button>
              ))}
            </div>

            {/* Granular Screener Filters */}
            <div className="whale-pro-filters mono">
              <button
                type="button"
                className={`watchlist-filter-pill mono${watchlistOnly ? ' active' : ''}`}
                disabled={pinnedTickers.length === 0}
                onClick={() => setWatchlistOnly((v) => !v)}
                title={
                  pinnedTickers.length > 0
                    ? `Filter options & 24/7 tape to your ${pinnedTickers.length} pinned tickers`
                    : 'Pin tickers in any War Room or Explorer to enable Watchlist filter'
                }
              >
                <Star size={10} />
                <span>WATCHLIST ({pinnedTickers.length})</span>
              </button>

              <label className="whale-select-wrap">
                <span className="whale-mp-k">DTE</span>
                <select
                  className="whale-select mono"
                  value={dteBucket}
                  onChange={(e) => setDteBucket(e.target.value as DteBucket)}
                  aria-label="Filter by Days to Expiration"
                >
                  <option value="ALL">All DTE</option>
                  <option value="0_7">0–7D</option>
                  <option value="8_30">8–30D</option>
                  <option value="31_90">31–90D</option>
                  <option value="90_PLUS">90D+ LEAPS</option>
                </select>
              </label>

              <label className="whale-select-wrap">
                <span className="whale-mp-k">PREM</span>
                <select
                  className="whale-select mono"
                  value={minPrem}
                  onChange={(e) => setMinPrem(Number(e.target.value) as PremBucket)}
                  aria-label="Filter by minimum premium"
                >
                  <option value={0}>Any $</option>
                  <option value={25000}>$25K+</option>
                  <option value={100000}>$100K+</option>
                  <option value={250000}>$250K+</option>
                  <option value={1000000}>$1M+</option>
                </select>
              </label>

              <label className="whale-select-wrap">
                <span className="whale-mp-k">STRIKE</span>
                <select
                  className="whale-select mono"
                  value={moneynessFilter}
                  onChange={(e) =>
                    setMoneynessFilter(e.target.value as MoneynessFilter)
                  }
                  aria-label="Filter by moneyness"
                >
                  <option value="ALL">All</option>
                  <option value="OTM">OTM</option>
                  <option value="ATM">ATM</option>
                  <option value="ITM">ITM</option>
                </select>
              </label>

              {hasGranularFilters && (
                <button
                  type="button"
                  className="whale-reset-btn mono"
                  onClick={handleResetFilters}
                >
                  RESET
                </button>
              )}
            </div>

            {allSummaries.length > 0 && (
              <div className="whale-maxpain-ribbon mono">
                <span className="whale-mp-k">MAX PAIN:</span>
                {allSummaries.slice(0, 5).map((s) => (
                  <button
                    key={s.ticker}
                    type="button"
                    className="whale-mp-chip"
                    onClick={() => onSelectTicker(s.ticker)}
                    title={`${s.ticker} P/C Ratio: ${s.putCallVolRatio} | ${s.netGammaRegime}`}
                  >
                    <strong>{s.ticker}</strong>{' '}
                    <span>{s.maxPainStrike ? `$${s.maxPainStrike}` : '—'}</span>
                    <span
                      className={
                        s.flowBias === 'BULLISH'
                          ? 'text-emerald'
                          : s.flowBias === 'BEARISH'
                            ? 'text-crimson'
                            : 'text-muted'
                      }
                    >
                      {s.putCallVolRatio} P/C
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Contracts Table */}
          {!flowState ? (
            <div className="daily-bread-loading mono">
              <Activity size={14} className="text-emerald" />
              <span>
                Scanning live CBOE options chains across SPY, QQQ, NVDA, TSLA, AAPL,
                MSFT, META, AMZN, AMD &amp; PLTR…
              </span>
            </div>
          ) : filteredContracts.length === 0 ? (
            <div className="daily-bread-loading mono">
              <span>
                No unusual contracts match these filters right now — reset filters or scan
                another ticker.
              </span>
            </div>
          ) : (
            <div className="whale-table-scroll">
              <table className="whale-table mono">
                <thead>
                  <tr>
                    <th>TICKER</th>
                    <th>CONTRACT</th>
                    <th>PREMIUM</th>
                    <th>VOL / OI</th>
                    <th>IV / Δ</th>
                    <th>SIGNALS</th>
                    <th>P&amp;L</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredContracts.slice(0, 26).map((c) => {
                    const isCall = c.type === 'CALL';
                    return (
                      <tr key={c.id} className="whale-row">
                        <td>
                          <button
                            type="button"
                            className="whale-sym-btn"
                            onClick={() => onSelectTicker(c.ticker)}
                          >
                            {c.ticker}
                          </button>
                          <div className="whale-spot-sub">
                            Spot {fmtPx(c.spotPrice)}
                          </div>
                        </td>
                        <td>
                          <span
                            className={`whale-cp-badge ${
                              isCall ? 'whale-cp-badge--bull' : 'whale-cp-badge--bear'
                            }`}
                          >
                            {c.contract}
                          </span>
                          <div className="whale-spot-sub">
                            {c.dte}d • {c.moneyness} • {fmtPx(c.mark)}
                          </div>
                        </td>
                        <td>
                          <strong
                            className={
                              c.estPremiumUsd >= 250_000
                                ? 'text-amber'
                                : isCall
                                  ? 'text-emerald'
                                  : 'text-crimson'
                            }
                          >
                            {fmtUsd(c.estPremiumUsd)}
                          </strong>
                        </td>
                        <td>
                          <div>
                            <strong>{c.volume.toLocaleString()}</strong> /{' '}
                            {c.openInterest.toLocaleString()}
                          </div>
                          <div
                            className={`whale-spot-sub ${
                              c.volOiRatio >= 2 ? 'text-amber' : ''
                            }`}
                          >
                            {c.volOiRatio.toFixed(1)}× Vol/OI
                          </div>
                        </td>
                        <td>
                          <div>{c.iv !== null ? `${c.iv}%` : '—'}</div>
                          <div className="whale-spot-sub">
                            Δ {c.delta !== null ? c.delta.toFixed(2) : '—'}
                          </div>
                        </td>
                        <td>
                          <div className="whale-tags-cell">
                            {c.tags.slice(0, 2).map((tag) => (
                              <span
                                key={tag}
                                className={`whale-sig-tag ${
                                  tag === 'MEGA' || tag === 'VOL>OI'
                                    ? 'whale-sig-tag--amber'
                                    : isCall
                                      ? 'whale-sig-tag--bull'
                                      : 'whale-sig-tag--bear'
                                }`}
                              >
                                {tag}
                              </span>
                            ))}
                          </div>
                        </td>
                        <td>
                          {onSimulateContract && (
                            <button
                              type="button"
                              className="whale-sim-btn"
                              onClick={() => onSimulateContract(c)}
                              title={`Open Black-Scholes P&L Heatmap for ${c.ticker} ${c.contract}`}
                            >
                              <Calculator size={10} />
                              <span>SIM</span>
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* RIGHT: Live 24/7 Hyperliquid Whale Print Tape */}
        <section className="whale-card" aria-label="Live 24/7 Whale Trade Tape">
          <div className="panel-header">
            <div className="panel-title-group">
              <Radio
                size={13}
                className={tapeWsLive ? 'text-emerald' : 'text-muted'}
                aria-hidden="true"
              />
              <h2 className="panel-title">LIVE 24/7 WHALE TAPE</h2>
              <span
                className={`panel-badge mono ${
                  tapeWsLive ? 'panel-badge--emerald' : ''
                }`}
              >
                {tapeWsLive ? 'STREAMING' : 'SYNCING'}
              </span>
            </div>

            <div className="whale-tape-filters mono">
              <button
                type="button"
                className={`whale-chime-btn${chimeThreshold > 0 ? ' active' : ''}`}
                onClick={handleCycleChime}
                title="Toggle live Web Audio chime for large whale tape fills"
              >
                {chimeThreshold > 0 ? <Volume2 size={11} /> : <VolumeX size={11} />}
                <span>
                  {chimeThreshold > 0
                    ? `CHIME $${chimeThreshold / 1000}K+`
                    : 'CHIME OFF'}
                </span>
              </button>
              {([0, 5000, 25000, 100000] as TapeMinUsd[]).map((minVal) => (
                <button
                  key={minVal}
                  type="button"
                  className={`overnight-tab-btn${tapeMinUsd === minVal ? ' active' : ''}`}
                  onClick={() => setTapeMinUsd(minVal)}
                >
                  {minVal === 0 ? 'All' : `$${minVal / 1000}K+`}
                </button>
              ))}
            </div>
          </div>

          {lastWhalePing && chimeThreshold > 0 && (
            <button
              type="button"
              className="whale-ping-banner mono"
              onClick={() => onSelectTicker(lastWhalePing.ticker)}
            >
              <Volume2 size={11} className="text-amber" />
              <span>
                WHALE PING: {lastWhalePing.side} {lastWhalePing.ticker}{' '}
                <strong>{fmtUsd(lastWhalePing.notionalUsd)}</strong> @{' '}
                {fmtPx(lastWhalePing.price)}
              </span>
            </button>
          )}

          {/* Live Buy vs Sell Notional Tape Delta Bar */}
          <div className="whale-tape-delta mono">
            <div className="whale-tape-delta-top">
              <span className="text-emerald">
                BUYS {fmtUsd(tapeBuyUsd)} ({tapeBuyPct}%)
              </span>
              <div className="whale-side-pills">
                {(['ALL', 'BUY', 'SELL'] as TapeSideFilter[]).map((s) => (
                  <button
                    key={s}
                    type="button"
                    className={`whale-mini-tab${tapeSide === s ? ' active' : ''}`}
                    onClick={() => setTapeSide(s)}
                  >
                    {s}
                  </button>
                ))}
              </div>
              <span className="text-crimson">
                SELLS {fmtUsd(tapeSellUsd)} ({100 - tapeBuyPct}%)
              </span>
            </div>
            <div className="whale-split-bar">
              <div
                className="whale-split-bull"
                style={{ width: `${tapeBuyPct}%` }}
              />
              <div
                className="whale-split-bear"
                style={{ width: `${100 - tapeBuyPct}%` }}
              />
            </div>
          </div>

          <div className="whale-tape-list mono">
            {filteredTape.length === 0 ? (
              <div className="daily-bread-loading">
                <span>
                  Listening for live 24/7 whale fills
                  {tapeMinUsd > 0 ? ` ≥ ${fmtUsd(tapeMinUsd)}` : ''}…
                </span>
              </div>
            ) : (
              filteredTape.map((p) => {
                const isBuy = p.side === 'BUY';
                return (
                  <button
                    key={p.id}
                    type="button"
                    className={`whale-tape-row whale-tape-row--${
                      isBuy ? 'bull' : 'bear'
                    }${p.tier === 'MEGA' || p.tier === 'WHALE' ? ' whale-tape-row--big' : ''}`}
                    onClick={() => onSelectTicker(p.ticker)}
                  >
                    <div className="whale-tape-left">
                      <span className="whale-tape-time">{fmtTime(p.time)}</span>
                      <span
                        className={`whale-side-badge ${
                          isBuy ? 'text-emerald' : 'text-crimson'
                        }`}
                      >
                        {isBuy ? (
                          <ArrowUpRight size={11} />
                        ) : (
                          <ArrowDownRight size={11} />
                        )}
                        {p.side}
                      </span>
                      <strong className="whale-tape-sym">{p.ticker}</strong>
                      <span className="whale-tape-px">@ {fmtPx(p.price)}</span>
                    </div>

                    <div className="whale-tape-right">
                      {p.isTwap && <span className="whale-twap-tag">TWAP</span>}
                      {(p.tier === 'MEGA' || p.tier === 'WHALE') && (
                        <span className="whale-tier-tag">{p.tier}</span>
                      )}
                      {p.walletTag && (
                        <span className="whale-wallet-tag">{p.walletTag}</span>
                      )}
                      <strong
                        className={`whale-tape-usd ${
                          isBuy ? 'text-emerald' : 'text-crimson'
                        }`}
                      >
                        {fmtUsd(p.notionalUsd)}
                      </strong>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </section>
      </div>

      <div className="daily-bread-disclaimer mono">
        WHALE FLOW aggregates live CBOE options chains (15m delayed per exchange rules) and
        real-time 24/7 Hyperliquid HIP-3 equity prints for informational flow analysis only —
        not financial advice.
      </div>
    </div>
  );
}
