import { memo, useMemo, useState } from 'react';
import { ExternalLink, Maximize2, Minimize2, Zap } from 'lucide-react';
import type { TickerMeta } from '../data/tickers';
import { THEME_MAP, type ThemeId } from '../lib/themes';
import { RealtimeCandleChart } from './RealtimeCandleChart';
import { TradingViewEmbed } from './TradingViewEmbed';

const ADVANCED_CHART_SCRIPT =
  'https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js';

type ChartFeedMode = 'realtime' | 'tradingview';

interface ExecutionChartPanelProps {
  meta: TickerMeta;
  prevDayPx: number | null;
  themeId: ThemeId;
}

function ExecutionChartPanelComponent({
  meta,
  prevDayPx,
  themeId,
}: ExecutionChartPanelProps) {
  const [feedMode, setFeedMode] = useState<ChartFeedMode>('realtime');
  const [expanded, setExpanded] = useState(false);

  const palette = THEME_MAP[themeId];

  const configJson = useMemo(
    () =>
      JSON.stringify({
        autosize: true,
        symbol: meta.tvSymbol,
        interval: '5',
        timezone: 'America/New_York',
        theme: palette.tvTheme,
        style: '1',
        locale: 'en',
        backgroundColor: palette.chartBg,
        gridColor: palette.chartGrid,
        hide_top_toolbar: false,
        hide_side_toolbar: false,
        allow_symbol_change: true,
        hide_volume: false,
        calendar: false,
        withdateranges: true,
        studies: [
          'VWAP@tv-basicstudies',
          'MAExp@tv-basicstudies',
          'MASimple@tv-basicstudies',
          'RSI@tv-basicstudies',
        ],
        support_host: 'https://www.tradingview.com',
      }),
    [meta.tvSymbol, palette.tvTheme, palette.chartBg, palette.chartGrid],
  );

  const externalChartUrl = `https://www.tradingview.com/chart/?symbol=${encodeURIComponent(meta.tvSymbol)}`;

  return (
    <section
      className="terminal-card"
      aria-label={`${meta.name} (${meta.ticker}) Real-Time Chart`}
    >
      <div className="panel-header">
        <div className="panel-title-group">
          <h2 className="panel-title">LIVE EXECUTION CHART</h2>
          <span className="panel-badge panel-badge--emerald">
            {feedMode === 'realtime' ? meta.hlCoin : meta.tvSymbol}
          </span>

          <div
            className="feed-mode-toggle"
            role="tablist"
            aria-label="Chart feed mode"
          >
            <button
              id="chart-mode-realtime"
              type="button"
              role="tab"
              aria-selected={feedMode === 'realtime'}
              className={`feed-mode-btn${feedMode === 'realtime' ? ' active-rt' : ''}`}
              onClick={() => setFeedMode('realtime')}
            >
              <Zap size={10} />
              <span>0-DELAY LIVE</span>
            </button>
            <button
              id="chart-mode-tradingview"
              type="button"
              role="tab"
              aria-selected={feedMode === 'tradingview'}
              className={`feed-mode-btn${feedMode === 'tradingview' ? ' active-tv' : ''}`}
              onClick={() => setFeedMode('tradingview')}
            >
              <span>TRADINGVIEW (15M)</span>
            </button>
          </div>
        </div>

        <div className="chart-toolbar-right">
          <button
            id="chart-height-toggle"
            type="button"
            className="icon-action-btn"
            onClick={() => setExpanded((prev) => !prev)}
            title={expanded ? 'Restore standard height' : 'Expand chart height'}
          >
            {expanded ? <Minimize2 size={12} /> : <Maximize2 size={12} />}
            <span>{expanded ? 'Standard' : 'Expand'}</span>
          </button>

          <a
            id="chart-open-tv-link"
            href={externalChartUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="icon-action-btn"
            title={`Open ${meta.tvSymbol} full-screen on TradingView`}
          >
            <ExternalLink size={12} />
          </a>
        </div>
      </div>

      {feedMode === 'realtime' ? (
        <RealtimeCandleChart
          meta={meta}
          prevDayPx={prevDayPx}
          expanded={expanded}
          themeId={themeId}
          onFallbackToTradingView={() => setFeedMode('tradingview')}
        />
      ) : (
        <div
          className={`chart-widget-frame${expanded ? ' chart-widget-frame--expanded' : ''}`}
        >
          <TradingViewEmbed
            scriptSrc={ADVANCED_CHART_SCRIPT}
            configJson={configJson}
            fillHeight
            ariaLabel={`TradingView Chart for ${meta.tvSymbol}`}
          />
        </div>
      )}

      <div className="chart-footnote-bar">
        <span>{meta.catalystHeadline}</span>
        <span>
          {feedMode === 'realtime'
            ? '0-DELAY 24/7 WEBSOCKET • VWAP • EMA 9/21 • RSI • VOL'
            : 'TRADINGVIEW CBOE ONE (15M DELAY) • DRAWING TOOLS'}
        </span>
      </div>
    </section>
  );
}

export const ExecutionChartPanel = memo(ExecutionChartPanelComponent);
