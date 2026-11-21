import { memo, useEffect, useRef, useState } from 'react';
import {
  CandlestickSeries,
  ColorType,
  CrosshairMode,
  HistogramSeries,
  LineSeries,
  LineStyle,
  createChart,
  type IChartApi,
  type IPriceLine,
  type ISeriesApi,
  type UTCTimestamp,
} from 'lightweight-charts';
import type { TickerMeta } from '../data/tickers';
import {
  HyperliquidStream,
  computeEma,
  computeLatestRsi,
  computeSessionVwap,
  type HlCandle,
  type HlInterval,
} from '../lib/hyperliquidFeed';
import { THEME_MAP, type ThemeId } from '../lib/themes';
import {
  fetchUniversalCandles,
  type FeedSource,
  type MarketQuote,
} from '../lib/universalFeed';
import type { ChartGexLevels } from '../lib/whaleFlowEngine';

export interface ChartTradePlan {
  ticker: string;
  direction: 'LONG' | 'SHORT' | 'WAIT';
  entryLow: number;
  entryHigh: number;
  target1: number;
  target2: number;
  stopLoss: number;
}

interface RealtimeCandleChartProps {
  meta: TickerMeta;
  prevDayPx: number | null;
  expanded: boolean;
  themeId: ThemeId;
  tradePlan?: ChartTradePlan | null;
  gexLevels?: ChartGexLevels | null;
  onQuoteDiscovered?: (quote: MarketQuote) => void;
  onFallbackToTradingView: () => void;
}

const INTERVALS: HlInterval[] = ['1m', '5m', '15m', '30m', '1h', '4h', '1d'];

interface ReadoutState {
  timeLabel: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  vwap: number | null;
  ema9: number | null;
  ema21: number | null;
  rsi: number | null;
}

function formatCandleTime(unixSec: number): string {
  return new Date(unixSec * 1000).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

function RealtimeCandleChartComponent({
  meta,
  prevDayPx,
  expanded,
  themeId,
  tradePlan,
  gexLevels,
  onQuoteDiscovered,
  onFallbackToTradingView,
}: RealtimeCandleChartProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const candlesRef = useRef<HlCandle[]>([]);
  const [interval, setInterval] = useState<HlInterval>('5m');
  const [showVwap, setShowVwap] = useState(true);
  const [showEma, setShowEma] = useState(true);
  const [showAiPlan, setShowAiPlan] = useState(true);
  const [showGexWalls, setShowGexWalls] = useState(true);
  const [feedSource, setFeedSource] = useState<FeedSource>('none');
  const [wsLive, setWsLive] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [readout, setReadout] = useState<ReadoutState | null>(null);

  const chartRef = useRef<IChartApi | null>(null);
  const candleSeriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const volumeSeriesRef = useRef<ISeriesApi<'Histogram'> | null>(null);
  const vwapSeriesRef = useRef<ISeriesApi<'Line'> | null>(null);
  const ema9SeriesRef = useRef<ISeriesApi<'Line'> | null>(null);
  const ema21SeriesRef = useRef<ISeriesApi<'Line'> | null>(null);
  const aiPriceLinesRef = useRef<IPriceLine[]>([]);
  const gexPriceLinesRef = useRef<IPriceLine[]>([]);
  const showVwapRef = useRef(showVwap);
  const showEmaRef = useRef(showEma);
  const paletteRef = useRef(THEME_MAP[themeId]);
  const prevDayPxRef = useRef(prevDayPx);
  const metaRef = useRef(meta);
  const onQuoteRef = useRef(onQuoteDiscovered);
  const onFallbackRef = useRef(onFallbackToTradingView);

  useEffect(() => {
    metaRef.current = meta;
  }, [meta]);

  useEffect(() => {
    prevDayPxRef.current = prevDayPx;
  }, [prevDayPx]);

  useEffect(() => {
    onQuoteRef.current = onQuoteDiscovered;
  }, [onQuoteDiscovered]);

  useEffect(() => {
    onFallbackRef.current = onFallbackToTradingView;
  }, [onFallbackToTradingView]);

  useEffect(() => {
    showVwapRef.current = showVwap;
    vwapSeriesRef.current?.applyOptions({ visible: showVwap });
  }, [showVwap]);

  useEffect(() => {
    showEmaRef.current = showEma;
    ema9SeriesRef.current?.applyOptions({ visible: showEma });
    ema21SeriesRef.current?.applyOptions({ visible: showEma });
  }, [showEma]);

  // Live theme swap without dropping stream
  useEffect(() => {
    const p = THEME_MAP[themeId];
    paletteRef.current = p;

    chartRef.current?.applyOptions({
      layout: {
        background: { type: ColorType.Solid, color: p.chartBg },
        textColor: p.chartText,
      },
      grid: {
        vertLines: { color: p.chartGrid },
        horzLines: { color: p.chartGrid },
      },
      crosshair: {
        vertLine: { color: p.crosshair, labelBackgroundColor: p.crosshairLabel },
        horzLine: { color: p.crosshair, labelBackgroundColor: p.crosshairLabel },
      },
      rightPriceScale: { borderColor: p.border },
      timeScale: { borderColor: p.border },
    });

    candleSeriesRef.current?.applyOptions({
      upColor: p.bull,
      downColor: p.bear,
      wickUpColor: p.bull,
      wickDownColor: p.bear,
    });
    vwapSeriesRef.current?.applyOptions({ color: p.amber });
    ema9SeriesRef.current?.applyOptions({ color: p.ema9 });
    ema21SeriesRef.current?.applyOptions({ color: p.ema21 });

    if (volumeSeriesRef.current && candlesRef.current.length > 0) {
      volumeSeriesRef.current.setData(
        candlesRef.current.map((c) => ({
          time: c.time as UTCTimestamp,
          value: c.volume,
          color: c.close >= c.open ? p.volUp : p.volDown,
        })),
      );
    }
  }, [themeId]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const p = paletteRef.current;
    setLoading(true);
    setLoadError(null);
    setWsLive(false);
    setFeedSource('none');
    candlesRef.current = [];

    const chart: IChartApi = createChart(el, {
      layout: {
        background: { type: ColorType.Solid, color: p.chartBg },
        textColor: p.chartText,
        fontFamily: "'JetBrains Mono', ui-monospace, monospace",
        fontSize: 11,
      },
      grid: {
        vertLines: { color: p.chartGrid },
        horzLines: { color: p.chartGrid },
      },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: {
          color: p.crosshair,
          labelBackgroundColor: p.crosshairLabel,
        },
        horzLine: {
          color: p.crosshair,
          labelBackgroundColor: p.crosshairLabel,
        },
      },
      rightPriceScale: {
        borderColor: p.border,
        scaleMargins: { top: 0.08, bottom: 0.22 },
      },
      timeScale: {
        borderColor: p.border,
        timeVisible: true,
        secondsVisible: false,
      },
      width: el.clientWidth,
      height: el.clientHeight,
    });
    chartRef.current = chart;

    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor: p.bull,
      downColor: p.bear,
      borderVisible: false,
      wickUpColor: p.bull,
      wickDownColor: p.bear,
    });
    candleSeriesRef.current = candleSeries;

    const volumeSeries = chart.addSeries(HistogramSeries, {
      priceFormat: { type: 'volume' },
      priceScaleId: '',
    });
    volumeSeries.priceScale().applyOptions({
      scaleMargins: { top: 0.82, bottom: 0 },
    });
    volumeSeriesRef.current = volumeSeries;

    const vwapSeries = chart.addSeries(LineSeries, {
      color: p.amber,
      lineWidth: 2,
      priceLineVisible: false,
      lastValueVisible: false,
      visible: showVwapRef.current,
    });
    vwapSeriesRef.current = vwapSeries;

    const ema9Series = chart.addSeries(LineSeries, {
      color: p.ema9,
      lineWidth: 2,
      priceLineVisible: false,
      lastValueVisible: false,
      visible: showEmaRef.current,
    });
    ema9SeriesRef.current = ema9Series;

    const ema21Series = chart.addSeries(LineSeries, {
      color: p.ema21,
      lineWidth: 2,
      priceLineVisible: false,
      lastValueVisible: false,
      visible: showEmaRef.current,
    });
    ema21SeriesRef.current = ema21Series;

    // Reference price lines (IPO / S-1 lines or prev day close)
    const activeMeta = metaRef.current;
    if (activeMeta.referenceLines && activeMeta.referenceLines.length > 0) {
      for (const line of activeMeta.referenceLines) {
        candleSeries.createPriceLine({
          price: line.price,
          color: line.tone === 'bull' ? p.bull : line.tone === 'bear' ? p.bear : p.amber,
          lineWidth: 2,
          lineStyle: line.tone === 'bull' ? LineStyle.Dashed : LineStyle.Dotted,
          axisLabelVisible: true,
          title: line.title,
        });
      }
    } else if (prevDayPxRef.current && prevDayPxRef.current > 0) {
      candleSeries.createPriceLine({
        price: prevDayPxRef.current,
        color: p.amber,
        lineWidth: 2,
        lineStyle: LineStyle.Dashed,
        axisLabelVisible: true,
        title: 'PREV CLOSE',
      });
    }

    const updateReadoutFromCandles = (list: HlCandle[], targetTime?: number) => {
      if (list.length === 0) return;
      const idx =
        targetTime !== undefined
          ? list.findIndex((c) => c.time === targetTime)
          : list.length - 1;
      const resolvedIdx = idx >= 0 ? idx : list.length - 1;
      const c = list[resolvedIdx];
      const vwapArr = computeSessionVwap(list);
      const ema9Arr = computeEma(list, 9);
      const ema21Arr = computeEma(list, 21);
      const rsi = computeLatestRsi(list.slice(0, resolvedIdx + 1), 14);

      setReadout({
        timeLabel: formatCandleTime(c.time),
        open: c.open,
        high: c.high,
        low: c.low,
        close: c.close,
        volume: c.volume,
        vwap: vwapArr[resolvedIdx]?.value ?? null,
        ema9: ema9Arr[resolvedIdx]?.value ?? null,
        ema21: ema21Arr[resolvedIdx]?.value ?? null,
        rsi,
      });
    };

    const syncAllSeries = (list: HlCandle[], fit = false) => {
      const activeP = paletteRef.current;
      candleSeries.setData(
        list.map((c) => ({
          time: c.time as UTCTimestamp,
          open: c.open,
          high: c.high,
          low: c.low,
          close: c.close,
        })),
      );
      volumeSeries.setData(
        list.map((c) => ({
          time: c.time as UTCTimestamp,
          value: c.volume,
          color: c.close >= c.open ? activeP.volUp : activeP.volDown,
        })),
      );
      vwapSeries.setData(
        computeSessionVwap(list).map((pt) => ({
          time: pt.time as UTCTimestamp,
          value: pt.value,
        })),
      );
      ema9Series.setData(
        computeEma(list, 9).map((pt) => ({
          time: pt.time as UTCTimestamp,
          value: pt.value,
        })),
      );
      ema21Series.setData(
        computeEma(list, 21).map((pt) => ({
          time: pt.time as UTCTimestamp,
          value: pt.value,
        })),
      );

      if (fit) {
        chart.timeScale().fitContent();
      }
      updateReadoutFromCandles(list);
    };

    chart.subscribeCrosshairMove((param) => {
      const list = candlesRef.current;
      if (!param.time || typeof param.time !== 'number') {
        updateReadoutFromCandles(list);
      } else {
        updateReadoutFromCandles(list, param.time);
      }
    });

    const controller = new AbortController();
    let stream: HyperliquidStream | null = null;
    let pollTimer: number | null = null;

    void fetchUniversalCandles(meta.ticker, meta.hlCoin, interval, 220, controller.signal)
      .then((res) => {
        if (controller.signal.aborted) return;
        if (res.quote) {
          onQuoteRef.current?.(res.quote);
        }

        if (res.candles.length === 0) {
          setLoading(false);
          if (meta.ipoStatus === 'upcoming') {
            setLoadError(
              `${activeMeta.name} (${meta.ticker}) is an upcoming IPO (${activeMeta.ipoDate ?? 'Pipeline'}). Live candles start on Day 1 first print.`,
            );
          } else {
            // Seamlessly switch to TradingView chart so the user never sees a dead error state
            setLoadError(`Switching ${meta.ticker} to TradingView interactive chart…`);
            onFallbackRef.current();
          }
          return;
        }

        candlesRef.current = res.candles;
        setFeedSource(res.source);
        syncAllSeries(res.candles, true);
        setLoading(false);

        if (res.source === 'hyperliquid' && meta.hlCoin) {
          stream = new HyperliquidStream(
            meta.hlCoin,
            {
              onStatus: setWsLive,
              onCandle: (incoming) => {
                const list = candlesRef.current;
                if (list.length === 0) return;
                const last = list[list.length - 1];
                let next: HlCandle[];
                if (incoming.time === last.time) {
                  next = [...list.slice(0, -1), incoming];
                } else if (incoming.time > last.time) {
                  next = [...list, incoming].slice(-300);
                } else {
                  return;
                }
                candlesRef.current = next;

                const activeP = paletteRef.current;
                candleSeries.update({
                  time: incoming.time as UTCTimestamp,
                  open: incoming.open,
                  high: incoming.high,
                  low: incoming.low,
                  close: incoming.close,
                });
                volumeSeries.update({
                  time: incoming.time as UTCTimestamp,
                  value: incoming.volume,
                  color:
                    incoming.close >= incoming.open ? activeP.volUp : activeP.volDown,
                });
                const vwapArr = computeSessionVwap(next);
                const ema9Arr = computeEma(next, 9);
                const ema21Arr = computeEma(next, 21);
                const lastVwap = vwapArr[vwapArr.length - 1];
                const lastEma9 = ema9Arr[ema9Arr.length - 1];
                const lastEma21 = ema21Arr[ema21Arr.length - 1];
                if (lastVwap) {
                  vwapSeries.update({
                    time: lastVwap.time as UTCTimestamp,
                    value: lastVwap.value,
                  });
                }
                if (lastEma9) {
                  ema9Series.update({
                    time: lastEma9.time as UTCTimestamp,
                    value: lastEma9.value,
                  });
                }
                if (lastEma21) {
                  ema21Series.update({
                    time: lastEma21.time as UTCTimestamp,
                    value: lastEma21.value,
                  });
                }
                updateReadoutFromCandles(next);
              },
            },
            interval,
          );
          stream.connect();
        } else {
          // Universal Exchange Equity / IPO live 15s refresh
          setWsLive(true);
          pollTimer = window.setInterval(() => {
            void fetchUniversalCandles(
              meta.ticker,
              null,
              interval,
              220,
              controller.signal,
            ).then((fresh) => {
              if (controller.signal.aborted) return;
              if (fresh.quote) onQuoteRef.current?.(fresh.quote);
              if (fresh.candles.length > 0) {
                candlesRef.current = fresh.candles;
                syncAllSeries(fresh.candles, false);
              }
            });
          }, 15_000);
        }
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setLoading(false);
          setLoadError(`Live candle feed temporarily unavailable for ${meta.ticker}.`);
          if (meta.ipoStatus !== 'upcoming') {
            onFallbackRef.current();
          }
        }
      });

    const resizeObs = new ResizeObserver(() => {
      if (containerRef.current) {
        chart.applyOptions({
          width: containerRef.current.clientWidth,
          height: containerRef.current.clientHeight,
        });
      }
    });
    resizeObs.observe(el);

    return () => {
      controller.abort();
      stream?.destroy();
      if (pollTimer !== null) window.clearInterval(pollTimer);
      resizeObs.disconnect();
      chartRef.current = null;
      candleSeriesRef.current = null;
      volumeSeriesRef.current = null;
      vwapSeriesRef.current = null;
      ema9SeriesRef.current = null;
      ema21SeriesRef.current = null;
      aiPriceLinesRef.current = [];
      gexPriceLinesRef.current = [];
      chart.remove();
    };
  }, [meta.ticker, meta.hlCoin, meta.ipoStatus, interval]);

  // Overlay Daily Bread AI Trade Plan (Entry, TP1, TP2, Stop Loss) without remounting chart
  const activePlan =
    tradePlan && tradePlan.ticker === meta.ticker ? tradePlan : null;
  const planSig = activePlan
    ? `${activePlan.ticker}:${activePlan.direction}:${activePlan.entryLow}:${activePlan.entryHigh}:${activePlan.target1}:${activePlan.target2}:${activePlan.stopLoss}`
    : '';

  useEffect(() => {
    const series = candleSeriesRef.current;
    if (!series) return;

    for (const line of aiPriceLinesRef.current) {
      try {
        series.removePriceLine(line);
      } catch {
        // Ignore stale line
      }
    }
    aiPriceLinesRef.current = [];

    if (!showAiPlan || !activePlan || loading) return;

    const p = THEME_MAP[themeId];
    const entryMid = Number(((activePlan.entryLow + activePlan.entryHigh) / 2).toFixed(3));
    const isWait = activePlan.direction === 'WAIT';

    const specs: Array<{
      price: number;
      color: string;
      lineStyle: LineStyle;
      title: string;
    }> = [
      {
        price: entryMid,
        color: p.amber,
        lineStyle: LineStyle.Dotted,
        title: isWait ? 'AI PIVOT' : `AI ${activePlan.direction} ENTRY`,
      },
      {
        price: activePlan.target1,
        color: p.bull,
        lineStyle: LineStyle.Dashed,
        title: isWait ? 'AI BREAKOUT' : 'AI TP1',
      },
      {
        price: activePlan.target2,
        color: p.bull,
        lineStyle: LineStyle.SparseDotted,
        title: isWait ? 'AI EXT' : 'AI TP2',
      },
      {
        price: activePlan.stopLoss,
        color: p.bear,
        lineStyle: LineStyle.Dashed,
        title: isWait ? 'AI BREAKDOWN' : 'AI STOP',
      },
    ];

    aiPriceLinesRef.current = specs
      .filter((s) => Number.isFinite(s.price) && s.price > 0)
      .map((s) =>
        series.createPriceLine({
          price: s.price,
          color: s.color,
          lineWidth: 1,
          lineStyle: s.lineStyle,
          axisLabelVisible: true,
          title: s.title,
        }),
      );
  }, [showAiPlan, planSig, activePlan, themeId, loading]);

  // Overlay Dealer GEX Walls (Call Wall, Put Wall, Gamma Flip, Max Pain, ±1σ Expected Move)
  const activeGex =
    gexLevels && gexLevels.ticker === meta.ticker ? gexLevels : null;
  const gexSig = activeGex
    ? `${activeGex.ticker}:${activeGex.callWall}:${activeGex.putWall}:${activeGex.gammaFlip}:${activeGex.maxPain}:${activeGex.expectedHigh}:${activeGex.expectedLow}`
    : '';

  useEffect(() => {
    const series = candleSeriesRef.current;
    if (!series) return;

    for (const line of gexPriceLinesRef.current) {
      try {
        series.removePriceLine(line);
      } catch {
        // Ignore stale line
      }
    }
    gexPriceLinesRef.current = [];

    if (!showGexWalls || !activeGex || loading) return;

    const p = THEME_MAP[themeId];
    const specs: Array<{
      price: number | null;
      color: string;
      lineStyle: LineStyle;
      title: string;
    }> = [
      {
        price: activeGex.callWall,
        color: p.bull,
        lineStyle: LineStyle.LargeDashed,
        title: 'GEX CALL WALL',
      },
      {
        price: activeGex.putWall,
        color: p.bear,
        lineStyle: LineStyle.LargeDashed,
        title: 'GEX PUT WALL',
      },
      {
        price: activeGex.gammaFlip,
        color: p.amber,
        lineStyle: LineStyle.SparseDotted,
        title: 'GAMMA FLIP',
      },
      {
        price: activeGex.maxPain,
        color: '#a78bfa',
        lineStyle: LineStyle.Dotted,
        title: 'MAX PAIN',
      },
      {
        price: activeGex.expectedHigh,
        color: '#38bdf8',
        lineStyle: LineStyle.SparseDotted,
        title: '+1σ MOVE',
      },
      {
        price: activeGex.expectedLow,
        color: '#38bdf8',
        lineStyle: LineStyle.SparseDotted,
        title: '-1σ MOVE',
      },
    ];

    gexPriceLinesRef.current = specs
      .filter((s): s is { price: number; color: string; lineStyle: LineStyle; title: string } =>
        s.price !== null && Number.isFinite(s.price) && s.price > 0,
      )
      .map((s) =>
        series.createPriceLine({
          price: s.price,
          color: s.color,
          lineWidth: 1,
          lineStyle: s.lineStyle,
          axisLabelVisible: true,
          title: s.title,
        }),
      );
  }, [showGexWalls, gexSig, activeGex, themeId, loading]);

  const isUp = readout ? readout.close >= readout.open : true;

  return (
    <div className="rt-chart-shell">
      <div className="rt-chart-subbar">
        <div className="rt-controls-group">
          <div className="interval-tabs" role="tablist" aria-label="Candle interval">
            {INTERVALS.map((iv) => (
              <button
                key={iv}
                type="button"
                role="tab"
                aria-selected={interval === iv}
                className={`interval-tab${interval === iv ? ' active' : ''}`}
                onClick={() => setInterval(iv)}
              >
                {iv}
              </button>
            ))}
          </div>

          <button
            type="button"
            className={`rt-overlay-pill${showVwap ? ' rt-overlay-pill--amber' : ''}`}
            onClick={() => setShowVwap((v) => !v)}
          >
            VWAP
          </button>
          <button
            type="button"
            className={`rt-overlay-pill${showEma ? ' rt-overlay-pill--emerald' : ''}`}
            onClick={() => setShowEma((v) => !v)}
          >
            EMA 9/21
          </button>
          {activePlan && (
            <button
              type="button"
              className={`rt-overlay-pill${
                showAiPlan
                  ? activePlan.direction === 'SHORT'
                    ? ' rt-overlay-pill--crimson'
                    : activePlan.direction === 'LONG'
                      ? ' rt-overlay-pill--emerald'
                      : ' rt-overlay-pill--amber'
                  : ''
              }`}
              onClick={() => setShowAiPlan((v) => !v)}
              title="Toggle Daily Bread AI Entry / TP1 / TP2 / Stop levels on chart"
            >
              AI PLAN
            </button>
          )}
          {activeGex && (
            <button
              type="button"
              className={`rt-overlay-pill${showGexWalls ? ' rt-overlay-pill--violet' : ''}`}
              onClick={() => setShowGexWalls((v) => !v)}
              title="Toggle Dealer Call Wall, Put Wall, Gamma Flip, Max Pain & ±1σ Expected Move"
            >
              GEX WALLS
            </button>
          )}

          <span className={`rt-ws-pill mono${wsLive ? ' rt-ws-pill--live' : ''}`}>
            {wsLive
              ? feedSource === 'hyperliquid'
                ? '● 0-DELAY WS'
                : '● LIVE EXCHANGE'
              : '○ SYNCING'}
          </span>
        </div>

        {readout && (
          <div className="rt-ohlc-strip mono">
            <span className="rt-ohlc-time">{readout.timeLabel}</span>
            <span>
              O <strong>{readout.open.toFixed(2)}</strong>
            </span>
            <span>
              H <strong className="text-emerald">{readout.high.toFixed(2)}</strong>
            </span>
            <span>
              L <strong className="text-crimson">{readout.low.toFixed(2)}</strong>
            </span>
            <span>
              C{' '}
              <strong className={isUp ? 'text-emerald' : 'text-crimson'}>
                {readout.close.toFixed(2)}
              </strong>
            </span>
            {readout.vwap !== null && (
              <span className="text-amber">VWAP {readout.vwap.toFixed(2)}</span>
            )}
            {readout.rsi !== null && (
              <span className="rt-rsi-val">RSI {readout.rsi.toFixed(1)}</span>
            )}
          </div>
        )}
      </div>

      <div
        className={`rt-canvas-frame${expanded ? ' rt-canvas-frame--expanded' : ''}`}
      >
        <div ref={containerRef} className="rt-canvas-host" />

        {loading && (
          <div className="rt-overlay-state mono">
            Loading live {meta.hlCoin ?? `${meta.exchange ?? 'US'}:${meta.ticker}`} candles…
          </div>
        )}

        {!loading && loadError && (
          <div className="rt-overlay-state mono">
            <span>{loadError}</span>
            <button
              type="button"
              className="ipo-notice-peer-btn mono"
              onClick={onFallbackToTradingView}
            >
              Open TradingView Chart
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export const RealtimeCandleChart = memo(RealtimeCandleChartComponent);
