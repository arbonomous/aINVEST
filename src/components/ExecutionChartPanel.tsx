import { memo, useMemo, useState } from 'react';
import { ExternalLink, Maximize2, Minimize2, Sparkles, Zap } from 'lucide-react';
import type { TickerMeta } from '../data/tickers';
import { formatRelativeAge, type NewsArticle } from '../lib/newsFeed';
import { THEME_MAP, type ThemeId } from '../lib/themes';
import type { MarketQuote } from '../lib/universalFeed';
import {
  RealtimeCandleChart,
  type ChartTradePlan,
} from './RealtimeCandleChart';
import { TradingViewEmbed } from './TradingViewEmbed';

const ADVANCED_CHART_SCRIPT =
  'https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js';

type ChartFeedMode = 'realtime' | 'tradingview';

interface ExecutionChartPanelProps {
  meta: TickerMeta;
  prevDayPx: number | null;
  themeId: ThemeId;
  tradePlan?: ChartTradePlan | null;
  movingNews?: NewsArticle | null;
  onQuoteDiscovered?: (quote: MarketQuote) => void;
}

function ExecutionChartPanelComponent({
  meta,
  prevDayPx,
  themeId,
  tradePlan,
  movingNews,
  onQuoteDiscovered,
}: ExecutionChartPanelProps) {
  const [modeState, setModeState] = useState<{
    ticker: string;
    mode: ChartFeedMode;
  }>({ ticker: meta.ticker, mode: 'realtime' });
  const [expanded, setExpanded] = useState(false);

  const feedMode: ChartFeedMode =
    modeState.ticker === meta.ticker ? modeState.mode : 'realtime';
  const setFeedMode = (mode: ChartFeedMode) =>
    setModeState({ ticker: meta.ticker, mode });

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
  const liveVenueBadge = meta.hlCoin ?? meta.tvSymbol;
  const movingTone =
    movingNews?.sentiment === 'bull'
      ? 'bull'
      : movingNews?.sentiment === 'bear'
        ? 'bear'
        : 'amber';

  return (
    <section
      className="terminal-card"
      aria-label={`${meta.name} (${meta.ticker}) Real-Time Chart`}
    >
      <div className="panel-header">
        <div className="panel-title-group">
          <h2 className="panel-title">LIVE EXECUTION CHART</h2>
          <span className="panel-badge panel-badge--emerald">
            {feedMode === 'realtime' ? liveVenueBadge : meta.tvSymbol}
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
              <span>{meta.hlCoin ? '0-DELAY LIVE' : 'LIVE CANDLES'}</span>
            </button>
            <button
              id="chart-mode-tradingview"
              type="button"
              role="tab"
              aria-selected={feedMode === 'tradingview'}
              className={`feed-mode-btn${feedMode === 'tradingview' ? ' active-tv' : ''}`}
              onClick={() => setFeedMode('tradingview')}
            >
              <span>TRADINGVIEW</span>
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

      {/* Why It's Moving — Live Ticker Catalyst Strip */}
      {movingNews && (
        <div className="why-moving-strip">
          <span className={`why-moving-badge why-moving-badge--${movingTone} mono`}>
            <Sparkles size={10} />
            <span>
              WHY {meta.ticker} IS MOVING
              {movingNews.sentiment === 'bull'
                ? ' • BULLISH'
                : movingNews.sentiment === 'bear'
                  ? ' • BEARISH'
                  : ''}
            </span>
          </span>
          <a
            href={movingNews.url}
            target="_blank"
            rel="noopener noreferrer"
            className="why-moving-headline"
          >
            {movingNews.title}
          </a>
          <span className="why-moving-meta mono">
            {movingNews.source} • {formatRelativeAge(movingNews.publishedAt)}
          </span>
        </div>
      )}

      {feedMode === 'realtime' ? (
        <RealtimeCandleChart
          meta={meta}
          prevDayPx={prevDayPx}
          expanded={expanded}
          themeId={themeId}
          tradePlan={tradePlan}
          onQuoteDiscovered={onQuoteDiscovered}
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
            ? meta.hlCoin
              ? '0-DELAY 24/7 WEBSOCKET • VWAP • EMA 9/21 • AI PLAN'
              : 'LIVE EXCHANGE FEED • VWAP • EMA 9/21 • AI PLAN'
            : 'TRADINGVIEW INTERACTIVE CHART • FULL DRAWING TOOLS'}
        </span>
      </div>
    </section>
  );
}

export const ExecutionChartPanel = memo(ExecutionChartPanelComponent);
