import { memo, useEffect, useMemo, useState } from 'react';
import type { TickerMeta } from '../data/tickers';
import type { HlInterval } from '../lib/hyperliquidFeed';
import {
  evaluateTechnicals,
  type TechnicalSummary,
} from '../lib/technicalEngine';
import { THEME_MAP, type ThemeId } from '../lib/themes';
import { fetchUniversalCandles } from '../lib/universalFeed';
import { TradingViewEmbed } from './TradingViewEmbed';

type TaInterval = HlInterval;

const TA_TIMEFRAMES: Array<{ id: TaInterval; label: string; tvValue: string }> = [
  { id: '1m', label: '1m', tvValue: '1m' },
  { id: '5m', label: '5m', tvValue: '5m' },
  { id: '15m', label: '15m', tvValue: '15m' },
  { id: '30m', label: '30m', tvValue: '30m' },
  { id: '1h', label: '1h', tvValue: '1h' },
  { id: '4h', label: '4h', tvValue: '4h' },
  { id: '1d', label: '1D', tvValue: '1D' },
];

const TV_TECHNICAL_SCRIPT =
  'https://s3.tradingview.com/external-embedding/embed-widget-technical-analysis.js';

interface TechnicalGaugePanelProps {
  meta: TickerMeta;
  themeId: ThemeId;
}

function shortVerdictCode(verdict: TechnicalSummary['verdict']): {
  code: string;
  tone: 'bull' | 'bear' | 'neutral';
} {
  if (verdict === 'STRONG BUY') return { code: 'SB', tone: 'bull' };
  if (verdict === 'BUY') return { code: 'B', tone: 'bull' };
  if (verdict === 'STRONG SELL') return { code: 'SS', tone: 'bear' };
  if (verdict === 'SELL') return { code: 'S', tone: 'bear' };
  return { code: 'N', tone: 'neutral' };
}

function TechnicalGaugePanelComponent({
  meta,
  themeId,
}: TechnicalGaugePanelProps) {
  const [interval, setInterval] = useState<TaInterval>('15m');
  const [matrixState, setMatrixState] = useState<{
    tickerKey: string;
    summaries: Partial<Record<TaInterval, TechnicalSummary | null>>;
    loaded: Partial<Record<TaInterval, boolean>>;
  } | null>(null);

  const palette = THEME_MAP[themeId];
  const tickerKey = `${meta.ticker}:${meta.hlCoin ?? 'mkt'}`;

  useEffect(() => {
    if (meta.ipoStatus === 'upcoming') return;

    let cancelled = false;
    const controller = new AbortController();

    const loadAllTimeframes = async () => {
      const settled = await Promise.allSettled(
        TA_TIMEFRAMES.map(async (tf) => {
          const res = await fetchUniversalCandles(
            meta.ticker,
            meta.hlCoin,
            tf.id,
            160,
            controller.signal,
          );
          return { id: tf.id, summary: evaluateTechnicals(res.candles) };
        }),
      );
      if (cancelled) return;

      const summaries: Partial<Record<TaInterval, TechnicalSummary | null>> = {};
      const loaded: Partial<Record<TaInterval, boolean>> = {};
      for (let i = 0; i < TA_TIMEFRAMES.length; i++) {
        const tfId = TA_TIMEFRAMES[i].id;
        loaded[tfId] = true;
        const r = settled[i];
        summaries[tfId] = r.status === 'fulfilled' ? r.value.summary : null;
      }

      setMatrixState({
        tickerKey,
        summaries,
        loaded,
      });
    };

    void loadAllTimeframes();
    const pollId = window.setInterval(() => void loadAllTimeframes(), 45_000);

    return () => {
      cancelled = true;
      controller.abort();
      window.clearInterval(pollId);
    };
  }, [tickerKey, meta.ticker, meta.hlCoin, meta.ipoStatus]);

  const isCurrentTicker = matrixState?.tickerKey === tickerKey;
  const activeLoaded = isCurrentTicker && Boolean(matrixState.loaded[interval]);
  const summary = isCurrentTicker ? (matrixState.summaries[interval] ?? null) : null;
  const useTvFallback = activeLoaded && !summary;
  const loading = meta.ipoStatus !== 'upcoming' && !activeLoaded;

  const confluence = useMemo(() => {
    if (!isCurrentTicker) return null;
    let bull = 0;
    let bear = 0;
    let neutral = 0;
    let ready = 0;
    for (const tf of TA_TIMEFRAMES) {
      const s = matrixState.summaries[tf.id];
      if (!s) continue;
      ready += 1;
      if (s.verdict === 'STRONG BUY' || s.verdict === 'BUY') bull += 1;
      else if (s.verdict === 'STRONG SELL' || s.verdict === 'SELL') bear += 1;
      else neutral += 1;
    }
    if (ready < 3) return null;

    const alignedBull = bull >= Math.ceil(ready * 0.7);
    const alignedBear = bear >= Math.ceil(ready * 0.7);
    const tone: 'bull' | 'bear' | 'amber' = alignedBull
      ? 'bull'
      : alignedBear
        ? 'bear'
        : 'amber';
    const headline = alignedBull
      ? `ALL-TF ALIGNED BULL (${bull}/${ready})`
      : alignedBear
        ? `ALL-TF ALIGNED BEAR (${bear}/${ready})`
        : `MULTI-TF MIXED (${bull}B / ${neutral}N / ${bear}S)`;

    return { bull, bear, neutral, ready, tone, headline, aligned: alignedBull || alignedBear };
  }, [isCurrentTicker, matrixState]);

  const activeTfMeta =
    TA_TIMEFRAMES.find((tf) => tf.id === interval) ?? TA_TIMEFRAMES[2];

  const tvGaugeConfig = useMemo(
    () =>
      JSON.stringify({
        interval: activeTfMeta.tvValue,
        width: '100%',
        isTransparent: true,
        height: 360,
        symbol: meta.tvSymbol,
        showIntervalTabs: false,
        displayMode: 'single',
        locale: 'en',
        colorTheme: palette.tvTheme,
      }),
    [activeTfMeta.tvValue, meta.tvSymbol, palette.tvTheme],
  );

  const needleDeg = summary
    ? Math.max(-72, Math.min(72, summary.score * 78))
    : 0;
  const verdictColor = !summary
    ? palette.muted
    : summary.verdict === 'STRONG BUY' || summary.verdict === 'BUY'
      ? palette.bull
      : summary.verdict === 'STRONG SELL' || summary.verdict === 'SELL'
        ? palette.bear
        : palette.muted;

  return (
    <section
      className="terminal-card"
      aria-label={`Live Technical Consensus Gauge for ${meta.ticker}`}
    >
      <div className="panel-header">
        <div className="panel-title-group">
          <h2 className="panel-title">TECHNICAL CONSENSUS</h2>
          <span className="panel-badge panel-badge--emerald">{meta.ticker}</span>
        </div>
        <span className="panel-badge mono">{activeTfMeta.label}</span>
      </div>

      {/* Multi-Timeframe Confluence Selector Bar (1m -> 1D with live signal dots) */}
      <div
        className="ta-timeframes-bar"
        role="tablist"
        aria-label="Technical consensus timeframes"
      >
        {TA_TIMEFRAMES.map((tf) => {
          const tfSummary = isCurrentTicker ? matrixState.summaries[tf.id] : null;
          const badge = tfSummary ? shortVerdictCode(tfSummary.verdict) : null;
          return (
            <button
              key={tf.id}
              id={`ta-interval-${tf.id}`}
              type="button"
              role="tab"
              aria-selected={interval === tf.id}
              className={`ta-tf-btn mono${interval === tf.id ? ' active' : ''}`}
              onClick={() => setInterval(tf.id)}
              title={
                tfSummary
                  ? `${tf.label}: ${tfSummary.verdict} (${tfSummary.buyCount}B / ${tfSummary.neutralCount}N / ${tfSummary.sellCount}S)`
                  : `Switch to ${tf.label}`
              }
            >
              <span className="ta-tf-lbl">{tf.label}</span>
              <span
                className={`ta-tf-sig${badge ? ` ta-tf-sig--${badge.tone}` : ''}`}
              >
                {badge ? badge.code : '·'}
              </span>
            </button>
          );
        })}
      </div>

      {/* 7-Timeframe Confluence Strip */}
      {confluence && (
        <div
          className={`ta-confluence-bar ta-confluence-bar--${confluence.tone} mono`}
          aria-label={`7-timeframe alignment: ${confluence.headline}`}
        >
          <span className="ta-confluence-label">{confluence.headline}</span>
          {confluence.aligned && (
            <span className="ta-confluence-tag">HIGH CONVICTION</span>
          )}
        </div>
      )}

      <div className="ta-live-body">
        {loading && !summary && !useTvFallback ? (
          <div className="ta-loading-state mono">
            Scanning all 7 timeframes (1m → 1D) for {meta.ticker}…
          </div>
        ) : meta.ipoStatus === 'upcoming' ? (
          <div className="ta-loading-state mono">
            Pre-IPO Pipeline ({meta.ipoDate ?? 'Upcoming'}) — technical consensus activates
            automatically once {meta.ticker} begins trading.
          </div>
        ) : useTvFallback && !summary ? (
          <div className="ta-tv-fallback-wrap">
            <TradingViewEmbed
              scriptSrc={TV_TECHNICAL_SCRIPT}
              configJson={tvGaugeConfig}
              fillHeight
              ariaLabel={`TradingView Technical Analysis for ${meta.tvSymbol}`}
            />
          </div>
        ) : !summary ? (
          <div className="ta-loading-state mono">
            Waiting for enough {interval} candles for {meta.ticker}.
          </div>
        ) : (
          <>
            <div className="ta-gauge-box">
              <svg
                viewBox="0 0 260 144"
                className="ta-gauge-svg"
                role="img"
                aria-label={`Technical consensus: ${summary.verdict}`}
              >
                <path
                  d="M 24 126 A 106 106 0 0 1 65 42"
                  fill="none"
                  stroke={palette.bear}
                  strokeWidth="9.5"
                  opacity="0.82"
                />
                <path
                  d="M 69 39 A 106 106 0 0 1 112 22"
                  fill="none"
                  stroke={palette.bear}
                  strokeWidth="9.5"
                  opacity="0.42"
                />
                <path
                  d="M 116 21 A 106 106 0 0 1 144 21"
                  fill="none"
                  stroke={palette.muted}
                  strokeWidth="9.5"
                  opacity="0.52"
                />
                <path
                  d="M 148 22 A 106 106 0 0 1 191 39"
                  fill="none"
                  stroke={palette.bull}
                  strokeWidth="9.5"
                  opacity="0.48"
                />
                <path
                  d="M 195 42 A 106 106 0 0 1 236 126"
                  fill="none"
                  stroke={palette.bull}
                  strokeWidth="9.5"
                  opacity="0.86"
                />

                <text
                  x="14"
                  y="140"
                  fill={palette.bear}
                  fontSize="8.5"
                  fontFamily="JetBrains Mono, monospace"
                  fontWeight="700"
                >
                  STRONG SELL
                </text>
                <text
                  x="130"
                  y="12"
                  fill={palette.muted}
                  fontSize="8.5"
                  fontFamily="JetBrains Mono, monospace"
                  textAnchor="middle"
                >
                  NEUTRAL
                </text>
                <text
                  x="246"
                  y="140"
                  fill={palette.bull}
                  fontSize="8.5"
                  fontFamily="JetBrains Mono, monospace"
                  fontWeight="700"
                  textAnchor="end"
                >
                  STRONG BUY
                </text>

                <g
                  transform={`rotate(${needleDeg.toFixed(1)} 130 126)`}
                  style={{ transition: 'transform 380ms cubic-bezier(0.22, 1, 0.36, 1)' }}
                >
                  <line
                    x1="130"
                    y1="126"
                    x2="130"
                    y2="34"
                    stroke={palette.needle}
                    strokeWidth="2.5"
                    strokeLinecap="round"
                  />
                  <circle
                    cx="130"
                    cy="126"
                    r="5.5"
                    fill={verdictColor}
                    stroke={palette.chartBg}
                    strokeWidth="2"
                  />
                </g>
              </svg>

              <div className="ta-verdict mono" style={{ color: verdictColor }}>
                {summary.verdict}
              </div>

              <div className="ta-summary-counts mono">
                <div className="ta-count-cell">
                  <span className="ta-count-label">SELL</span>
                  <span className="ta-count-num text-crimson">{summary.sellCount}</span>
                </div>
                <div className="ta-count-cell">
                  <span className="ta-count-label">NEUTRAL</span>
                  <span className="ta-count-num">{summary.neutralCount}</span>
                </div>
                <div className="ta-count-cell">
                  <span className="ta-count-label">BUY</span>
                  <span className="ta-count-num text-emerald">{summary.buyCount}</span>
                </div>
              </div>
            </div>

            <div className="ta-groups-row mono">
              <div className="ta-group-card">
                <span className="ta-group-title">OSCILLATORS</span>
                <span className="ta-group-tally">
                  <span className="text-crimson">{summary.oscCounts.sell}S</span>
                  {' / '}
                  <span>{summary.oscCounts.neutral}N</span>
                  {' / '}
                  <span className="text-emerald">{summary.oscCounts.buy}B</span>
                </span>
              </div>
              <div className="ta-group-card">
                <span className="ta-group-title">MOVING AVGS</span>
                <span className="ta-group-tally">
                  <span className="text-crimson">{summary.maCounts.sell}S</span>
                  {' / '}
                  <span>{summary.maCounts.neutral}N</span>
                  {' / '}
                  <span className="text-emerald">{summary.maCounts.buy}B</span>
                </span>
              </div>
            </div>

            <div className="ta-highlights-grid mono">
              {summary.highlights.map((ind) => (
                <div key={ind.name} className="ta-ind-pill">
                  <span className="ta-ind-name">{ind.name}</span>
                  <span
                    className={`ta-ind-val ${
                      ind.signal === 'buy'
                        ? 'text-emerald'
                        : ind.signal === 'sell'
                          ? 'text-crimson'
                          : ''
                    }`}
                  >
                    {ind.valueLabel}
                  </span>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </section>
  );
}

export const TechnicalGaugePanel = memo(TechnicalGaugePanelComponent);
