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
  type ISeriesApi,
  type UTCTimestamp,
} from 'lightweight-charts';
import type { TickerMeta } from '../data/tickers';
import {
  HyperliquidStream,
  computeEma,
  computeLatestRsi,
  computeSessionVwap,
  fetchHyperliquidCandles,
  type HlCandle,
  type HlInterval,
} from '../lib/hyperliquidFeed';
import { THEME_MAP, type ThemeId } from '../lib/themes';

interface RealtimeCandleChartProps {
  meta: TickerMeta;
  prevDayPx: number | null;
  expanded: boolean;
  themeId: ThemeId;
  onFallbackToTradingView: () => void;
}

const INTERVALS: HlInterval[] = ['1m', '5m', '15m', '1h'];

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
  onFallbackToTradingView,
}: RealtimeCandleChartProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const candlesRef = useRef<HlCandle[]>([]);
  const [interval, setInterval] = useState<HlInterval>('5m');
  const [showVwap, setShowVwap] = useState(true);
  const [showEma, setShowEma] = useState(true);
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
  const showVwapRef = useRef(showVwap);
  const showEmaRef = useRef(showEma);
  const paletteRef = useRef(THEME_MAP[themeId]);
  const prevDayPxRef = useRef(prevDayPx);

  useEffect(() => {
    prevDayPxRef.current = prevDayPx;
  }, [prevDayPx]);

  useEffect(() => {
    showVwapRef.current = showVwap;
    vwapSeriesRef.current?.applyOptions({ visible: showVwap });
  }, [showVwap]);

  useEffect(() => {
    showEmaRef.current = showEma;
    ema9SeriesRef.current?.applyOptions({ visible: showEma });
    ema21SeriesRef.current?.applyOptions({ visible: showEma });
  }, [showEma]);

  // Live theme swap without dropping WebSocket stream
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

    // Reference price lines (custom S-1/IPO lines for ANT, or prev day close for other stocks)
    if (meta.referenceLines && meta.referenceLines.length > 0) {
      for (const line of meta.referenceLines) {
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

    void fetchHyperliquidCandles(meta.hlCoin, interval, 220, controller.signal)
      .then((initial) => {
        if (controller.signal.aborted) return;
        if (initial.length === 0) {
          setLoadError(`No live candles returned for ${meta.hlCoin}.`);
          setLoading(false);
          return;
        }
        candlesRef.current = initial;
        syncAllSeries(initial, true);
        setLoading(false);

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
                color: incoming.close >= incoming.open ? activeP.volUp : activeP.volDown,
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
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setLoadError('Live Hyperliquid feed unavailable on this network.');
          setLoading(false);
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
      resizeObs.disconnect();
      chartRef.current = null;
      candleSeriesRef.current = null;
      volumeSeriesRef.current = null;
      vwapSeriesRef.current = null;
      ema9SeriesRef.current = null;
      ema21SeriesRef.current = null;
      chart.remove();
    };
  }, [meta, interval]);

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

          <span className={`rt-ws-pill mono${wsLive ? ' rt-ws-pill--live' : ''}`}>
            {wsLive ? '● STREAMING' : '○ SYNCING'}
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
            Streaming 0-delay {meta.hlCoin} candles…
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
              Switch to TradingView Chart
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export const RealtimeCandleChart = memo(RealtimeCandleChartComponent);
