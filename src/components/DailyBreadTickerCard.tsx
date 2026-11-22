import { memo, useEffect, useMemo, useRef, useState } from 'react';
import {
  BellPlus,
  BookmarkCheck,
  BookmarkPlus,
  Camera,
  Crosshair,
  Flame,
  ShieldAlert,
  TrendingDown,
  TrendingUp,
} from 'lucide-react';
import type { TickerMeta } from '../data/tickers';
import {
  generateDailyBreadCall,
  type DailyBreadCall,
} from '../lib/dailyBreadEngine';
import type { HlCandle } from '../lib/hyperliquidFeed';
import type { NewsArticle } from '../lib/newsFeed';
import { exportDailyBreadSnapshotCard } from '../lib/snapshotCard';
import { fetchUniversalCandles, type MarketQuote } from '../lib/universalFeed';
import type { ChartTradePlan } from './RealtimeCandleChart';

interface DailyBreadTickerCardProps {
  meta: TickerMeta;
  liveQuote: MarketQuote | null;
  breakingNews: NewsArticle[];
  isTracked?: boolean;
  onTrackCall?: (call: DailyBreadCall) => void;
  onArmAlert?: (params: {
    ticker: string;
    targetPrice: number;
    currentPrice?: number | null;
    label: string;
  }) => void;
  onPlanUpdate?: (plan: ChartTradePlan | null) => void;
  onSelectPriceLevel: (price: number) => void;
  onNotify?: (message: string) => void;
}

function fmtPx(n: number): string {
  return n >= 10 ? `$${n.toFixed(2)}` : `$${n.toFixed(3)}`;
}

function DailyBreadTickerCardComponent({
  meta,
  liveQuote,
  breakingNews,
  isTracked = false,
  onTrackCall,
  onArmAlert,
  onPlanUpdate,
  onSelectPriceLevel,
  onNotify,
}: DailyBreadTickerCardProps) {
  const [dataState, setDataState] = useState<{
    reqKey: string;
    c5: HlCandle[];
    c15: HlCandle[];
    c60: HlCandle[];
  } | null>(null);
  const lastPlanSigRef = useRef<string>('');
  const onPlanUpdateRef = useRef(onPlanUpdate);

  useEffect(() => {
    onPlanUpdateRef.current = onPlanUpdate;
  }, [onPlanUpdate]);

  const reqKey = `${meta.ticker}:${meta.hlCoin ?? 'mkt'}`;

  useEffect(() => {
    if (meta.ipoStatus === 'upcoming') return;

    let cancelled = false;
    const controller = new AbortController();

    const load = async () => {
      try {
        const [r15, r60, r5] = await Promise.all([
          fetchUniversalCandles(meta.ticker, meta.hlCoin, '15m', 120, controller.signal),
          fetchUniversalCandles(meta.ticker, meta.hlCoin, '1h', 120, controller.signal),
          fetchUniversalCandles(meta.ticker, meta.hlCoin, '5m', 80, controller.signal),
        ]);
        if (!cancelled) {
          setDataState({
            reqKey,
            c5: r5.candles,
            c15: r15.candles,
            c60: r60.candles,
          });
        }
      } catch {
        if (!cancelled) {
          setDataState({ reqKey, c5: [], c15: [], c60: [] });
        }
      }
    };

    void load();
    const id = window.setInterval(() => void load(), 30_000);
    return () => {
      cancelled = true;
      controller.abort();
      window.clearInterval(id);
    };
  }, [reqKey, meta.ticker, meta.hlCoin, meta.ipoStatus]);

  const isCurrent = dataState?.reqKey === reqKey;
  const loading = meta.ipoStatus !== 'upcoming' && !isCurrent;

  const call: DailyBreadCall | null = useMemo(() => {
    if (!isCurrent) return null;
    return generateDailyBreadCall(
      meta,
      dataState.c15,
      dataState.c60,
      dataState.c5,
      liveQuote,
      breakingNews,
    );
  }, [isCurrent, dataState, meta, liveQuote, breakingNews]);

  useEffect(() => {
    const sig = call
      ? `${call.ticker}:${call.direction}:${call.entryLow}:${call.entryHigh}:${call.target1}:${call.target2}:${call.stopLoss}`
      : `none:${meta.ticker}`;
    if (sig === lastPlanSigRef.current) return;
    lastPlanSigRef.current = sig;
    if (!call) {
      onPlanUpdateRef.current?.(null);
      return;
    }
    onPlanUpdateRef.current?.({
      ticker: call.ticker,
      direction: call.direction,
      entryLow: call.entryLow,
      entryHigh: call.entryHigh,
      target1: call.target1,
      target2: call.target2,
      stopLoss: call.stopLoss,
    });
  }, [call, meta.ticker]);

  const dirTone =
    call?.direction === 'LONG'
      ? 'bull'
      : call?.direction === 'SHORT'
        ? 'bear'
        : 'amber';

  return (
    <section
      className="terminal-card daily-bread-terminal-card"
      aria-label={`Daily Bread AI Day-Trade Call for ${meta.ticker}`}
    >
      <div className="panel-header">
        <div className="panel-title-group">
          <Flame size={13} className="text-amber" aria-hidden="true" />
          <h2 className="panel-title">DAILY BREAD // AI CALL</h2>
        </div>
        {call ? (
          <span
            className={`panel-badge ${
              dirTone === 'bull'
                ? 'panel-badge--emerald'
                : dirTone === 'bear'
                  ? 'panel-badge--crimson'
                  : 'panel-badge--amber'
            }`}
          >
            {call.direction} • {call.grade} ({call.confidence}%)
          </span>
        ) : (
          <span className="panel-badge">{meta.ticker}</span>
        )}
      </div>

      <div className="panel-body">
        {loading ? (
          <div className="ta-loading-state mono">
            Reading 5m / 15m / 1h indicators for {meta.ticker} day-trade plan…
          </div>
        ) : !call ? (
          <div className="ta-loading-state mono">
            {meta.ipoStatus === 'upcoming'
              ? `Daily Bread AI calls activate automatically once ${meta.ticker} begins trading.`
              : `Waiting for intraday candles to build ${meta.ticker} day-trade plan.`}
          </div>
        ) : (
          <>
            <div className="bread-term-banner">
              <span className={`bread-dir-pill bread-dir-pill--${dirTone} mono`}>
                {call.direction === 'LONG' ? (
                  <TrendingUp size={11} />
                ) : call.direction === 'SHORT' ? (
                  <TrendingDown size={11} />
                ) : (
                  <Crosshair size={11} />
                )}
                <span>{call.direction}</span>
              </span>
              <span className="bread-setup-name mono">{call.setupName}</span>
              {call.direction !== 'WAIT' && (
                <span className="bread-rr-chip mono">1 : {call.riskReward} R/R</span>
              )}
              {call.direction !== 'WAIT' && onTrackCall && (
                <button
                  type="button"
                  className={`bread-track-btn mono${isTracked ? ' tracked' : ''}`}
                  onClick={() => onTrackCall(call)}
                  disabled={isTracked}
                  title={
                    isTracked
                      ? 'Already tracked in Daily Bread Scorecard'
                      : 'Track this call in your live Daily Bread Scorecard'
                  }
                >
                  {isTracked ? <BookmarkCheck size={11} /> : <BookmarkPlus size={11} />}
                  <span>{isTracked ? 'TRACKED' : 'TRACK CALL'}</span>
                </button>
              )}
              <button
                type="button"
                className="whale-sim-btn mono"
                onClick={() => {
                  void exportDailyBreadSnapshotCard(call).then((res) => {
                    if (res === 'copied') {
                      onNotify?.(`Copied & saved ${call.ticker} AI Call PNG card`);
                    } else if (res === 'downloaded') {
                      onNotify?.(`Downloaded ${call.ticker} AI Call PNG card`);
                    }
                  });
                }}
                title={`Export ${call.ticker} AI Day-Trade Call PNG card`}
              >
                <Camera size={10} />
                <span>PNG</span>
              </button>
            </div>

            <p className="bread-thesis">{call.thesis}</p>

            {/* Clickable Levels -> Load into Calculator or 1-Click Arm Price Alert */}
            <div className="bread-term-levels-grid mono">
              {(
                [
                  {
                    key: 'entry',
                    label: call.direction === 'WAIT' ? 'VWAP PIVOT' : 'ENTRY ZONE',
                    display: `${fmtPx(call.entryLow)}–${fmtPx(call.entryHigh)}`,
                    price: Number(((call.entryLow + call.entryHigh) / 2).toFixed(3)),
                    calcPrice: call.entryLow,
                    toneClass: '',
                    alertLabel: call.direction === 'WAIT' ? 'AI VWAP Pivot' : `AI ${call.direction} Entry`,
                  },
                  {
                    key: 'tp1',
                    label: call.direction === 'WAIT' ? 'BREAKOUT' : 'TARGET 1',
                    display: fmtPx(call.target1),
                    price: call.target1,
                    calcPrice: call.target1,
                    toneClass: ' text-emerald',
                    alertLabel: call.direction === 'WAIT' ? 'AI Breakout' : 'AI Target 1',
                  },
                  {
                    key: 'tp2',
                    label: call.direction === 'WAIT' ? 'EXT TARGET' : 'TARGET 2',
                    display: fmtPx(call.target2),
                    price: call.target2,
                    calcPrice: call.target2,
                    toneClass: ' text-emerald',
                    alertLabel: call.direction === 'WAIT' ? 'AI Ext Target' : 'AI Target 2',
                  },
                  {
                    key: 'stop',
                    label: call.direction === 'WAIT' ? 'BREAKDOWN' : 'STOP LOSS',
                    display: fmtPx(call.stopLoss),
                    price: call.stopLoss,
                    calcPrice: call.stopLoss,
                    toneClass: ' text-crimson',
                    alertLabel: call.direction === 'WAIT' ? 'AI Breakdown' : 'AI Stop Loss',
                  },
                ] as const
              ).map((lvl) => (
                <div key={lvl.key} className="bread-term-lvl-cell">
                  <button
                    type="button"
                    className="bread-term-lvl-btn"
                    onClick={() => onSelectPriceLevel(lvl.calcPrice)}
                    title={`Load ${lvl.label} into P&L Calculator`}
                  >
                    <span className="bread-lvl-label">{lvl.label}</span>
                    <span className={`bread-lvl-val${lvl.toneClass}`}>
                      {lvl.display}
                    </span>
                  </button>
                  {onArmAlert && (
                    <button
                      type="button"
                      className="bread-lvl-bell-btn"
                      onClick={() =>
                        onArmAlert({
                          ticker: meta.ticker,
                          targetPrice: lvl.price,
                          currentPrice: liveQuote?.price ?? call.livePrice,
                          label: lvl.alertLabel,
                        })
                      }
                      title={`Arm free live alert at ${fmtPx(lvl.price)} (${lvl.alertLabel})`}
                      aria-label={`Arm price alert for ${meta.ticker} at ${fmtPx(lvl.price)}`}
                    >
                      <BellPlus size={11} />
                    </button>
                  )}
                </div>
              ))}
            </div>

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
            </div>

            {call.catalystHeadline && (
              <div className="bread-catalyst-note">
                <span className="bread-catalyst-tag mono">NEWS</span>
                <span>{call.catalystHeadline}</span>
              </div>
            )}

            <div className="bread-invalidation">
              <ShieldAlert size={11} />
              <span>{call.invalidationNote}</span>
            </div>
          </>
        )}
      </div>
    </section>
  );
}

export const DailyBreadTickerCard = memo(DailyBreadTickerCardComponent);
