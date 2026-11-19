import { memo, useEffect, useMemo, useState } from 'react';
import type { TickerMeta } from '../data/tickers';
import {
  evaluateTechnicals,
  type TechnicalSummary,
} from '../lib/technicalEngine';
import { THEME_MAP, type ThemeId } from '../lib/themes';
import { fetchUniversalCandles } from '../lib/universalFeed';
import { TradingViewEmbed } from './TradingViewEmbed';

type TaInterval = '15m' | '1h';

const TV_TECHNICAL_SCRIPT =
  'https://s3.tradingview.com/external-embedding/embed-widget-technical-analysis.js';

interface TechnicalGaugePanelProps {
  meta: TickerMeta;
  themeId: ThemeId;
}

function TechnicalGaugePanelComponent({
  meta,
  themeId,
}: TechnicalGaugePanelProps) {
  const [interval, setInterval] = useState<TaInterval>('15m');
  const [resultState, setResultState] = useState<{
    reqKey: string;
    summary: TechnicalSummary | null;
    useTvFallback: boolean;
  } | null>(null);

  const palette = THEME_MAP[themeId];
  const reqKey = `${meta.ticker}:${meta.hlCoin ?? 'mkt'}:${interval}`;

  useEffect(() => {
    if (meta.ipoStatus === 'upcoming') return;

    let cancelled = false;
    const controller = new AbortController();

    const load = async () => {
      try {
        const res = await fetchUniversalCandles(
          meta.ticker,
          meta.hlCoin,
          interval,
          160,
          controller.signal,
        );
        if (!cancelled) {
          const evaluated = evaluateTechnicals(res.candles);
          setResultState({
            reqKey,
            summary: evaluated,
            useTvFallback: !evaluated,
          });
        }
      } catch {
        if (!cancelled) {
          setResultState({
            reqKey,
            summary: null,
            useTvFallback: true,
          });
        }
      }
    };

    void load();
    const pollId = window.setInterval(() => void load(), 30_000);

    return () => {
      cancelled = true;
      controller.abort();
      window.clearInterval(pollId);
    };
  }, [reqKey, meta.ticker, meta.hlCoin, meta.ipoStatus, interval]);

  const isCurrent = resultState?.reqKey === reqKey;
  const summary = isCurrent ? resultState.summary : null;
  const useTvFallback = isCurrent ? resultState.useTvFallback : false;
  const loading = meta.ipoStatus !== 'upcoming' && !isCurrent;

  const tvGaugeConfig = useMemo(
    () =>
      JSON.stringify({
        interval,
        width: '100%',
        isTransparent: true,
        height: 360,
        symbol: meta.tvSymbol,
        showIntervalTabs: false,
        displayMode: 'single',
        locale: 'en',
        colorTheme: palette.tvTheme,
      }),
    [interval, meta.tvSymbol, palette.tvTheme],
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

        <div className="interval-tabs" role="tablist" aria-label="Technical gauge timeframe">
          <button
            id="ta-interval-15m"
            type="button"
            role="tab"
            aria-selected={interval === '15m'}
            className={`interval-tab${interval === '15m' ? ' active' : ''}`}
            onClick={() => setInterval('15m')}
          >
            15m
          </button>
          <button
            id="ta-interval-1h"
            type="button"
            role="tab"
            aria-selected={interval === '1h'}
            className={`interval-tab${interval === '1h' ? ' active' : ''}`}
            onClick={() => setInterval('1h')}
          >
            1h
          </button>
        </div>
      </div>

      <div className="ta-live-body">
        {loading && !summary && !useTvFallback ? (
          <div className="ta-loading-state mono">
            Computing {interval} oscillators &amp; MAs for {meta.ticker}…
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
