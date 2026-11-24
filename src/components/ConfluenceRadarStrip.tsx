import { useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  CalendarClock,
  Layers,
} from 'lucide-react';
import { getNextMacroCatalyst } from '../lib/catalystCalendar';
import {
  rankMarketConfluence,
  type ConfluenceReport,
} from '../lib/confluenceEngine';
import type { HlAssetCtx } from '../lib/hyperliquidFeed';
import type { InsidersBundle } from '../lib/insidersEngine';
import type { DirectoryEntry } from '../lib/marketCatalog';
import type { NewsArticle } from '../lib/newsFeed';
import type { MarketQuote } from '../lib/universalFeed';
import type { TickerOptionsSummary } from '../lib/whaleFlowEngine';
import { AnimatedNumber } from './ui/AnimatedNumber';
import { SegmentedTabs, type SegmentedTabItem } from './ui/SegmentedTabs';
import { SpotlightSurface } from './ui/SpotlightCard';

type RadarFilter = 'all' | 'bull' | 'bear' | 'catalyst';

const RADAR_FILTER_ITEMS: ReadonlyArray<SegmentedTabItem<RadarFilter>> = [
  { id: 'all', label: 'Top Converging' },
  { id: 'bull', label: 'Bullish' },
  { id: 'bear', label: 'Bearish' },
  { id: 'catalyst', label: 'Catalyst & Squeeze' },
];

interface ConfluenceRadarStripProps {
  ctxMap: Record<string, HlAssetCtx>;
  quoteMap: Record<string, MarketQuote>;
  directoryMap: Record<string, DirectoryEntry>;
  insidersBundle: InsidersBundle | null;
  optionsMap: Record<string, TickerOptionsSummary>;
  articles: NewsArticle[];
  onSelectTicker: (ticker: string) => void;
  onOpenScreener?: () => void;
}

export function ConfluenceRadarStrip({
  ctxMap,
  quoteMap,
  directoryMap,
  insidersBundle,
  optionsMap,
  articles,
  onSelectTicker,
  onOpenScreener,
}: ConfluenceRadarStripProps) {
  const [filter, setFilter] = useState<RadarFilter>('all');

  const nextMacro = useMemo(() => getNextMacroCatalyst(), []);

  const ranked = useMemo<ConfluenceReport[]>(
    () =>
      rankMarketConfluence({
        ctxMap,
        quoteMap,
        directoryMap,
        insidersBundle,
        optionsMap,
        articles,
        limit: 24,
      }),
    [ctxMap, quoteMap, directoryMap, insidersBundle, optionsMap, articles],
  );

  const visibleReports = useMemo(() => {
    let pool = ranked;
    if (filter === 'bull') {
      pool = ranked.filter((r) => r.bias === 'bull');
    } else if (filter === 'bear') {
      pool = ranked.filter((r) => r.bias === 'bear');
    } else if (filter === 'catalyst') {
      pool = ranked.filter(
        (r) =>
          Boolean(r.catalystStatus.earnings && r.catalystStatus.earnings.daysUntil <= 21) ||
          r.pillars.some(
            (p) =>
              p.id === 'insider' &&
              p.active &&
              (p.headline.includes('CLUSTER') ||
                p.headline.includes('CONGRESS') ||
                p.headline.includes('SQUEEZE')),
          ),
      );
    }
    return pool.slice(0, 6);
  }, [ranked, filter]);

  if (ranked.length === 0) return null;

  return (
    <section
      className="confluence-radar-section"
      aria-label="5-Pillar Cross-Signal Confluence Radar"
    >
      <div className="confluence-radar-header">
        <div className="confluence-radar-title-wrap">
          <div className="panel-title-group">
            <Layers size={14} className="text-emerald" aria-hidden="true" />
            <h2 className="panel-title">5-PILLAR CONFLUENCE RADAR</h2>
            <span className="panel-badge panel-badge--emerald mono">
              TECH • WHALE • INSIDER • 24/7 • CATALYST
            </span>
          </div>

          {nextMacro && (
            <span
              className={`macro-countdown-pill mono${
                nextMacro.daysUntil <= 2 ? ' macro-countdown-pill--hot' : ''
              }`}
              title={`${nextMacro.title} — ${nextMacro.note}`}
            >
              <CalendarClock size={11} aria-hidden="true" />
              <span>
                NEXT MACRO: <strong>{nextMacro.shortLabel}</strong>{' '}
                {nextMacro.countdownLabel} ({nextMacro.timeEt})
              </span>
            </span>
          )}
        </div>

        <div className="confluence-header-controls">
          <SegmentedTabs
            items={RADAR_FILTER_ITEMS}
            value={filter}
            onChange={setFilter}
            ariaLabel="Filter confluence radar"
            size="sm"
            className="confluence-seg-tabs"
          />
          {onOpenScreener && (
            <button
              type="button"
              className="cf-screener-cta mono"
              onClick={onOpenScreener}
              title="Open Multi-Signal Confluence Screener across all stocks & IPOs"
            >
              <span>SCREENER</span>
              <ArrowRight size={11} />
            </button>
          )}
        </div>
      </div>

      {visibleReports.length === 0 ? (
        <div className="confluence-empty mono">
          No tickers match this confluence slice right now — switch back to Top Converging.
        </div>
      ) : (
        <div className="confluence-radar-grid">
          {visibleReports.map((rep) => {
            const spotTone =
              rep.bias === 'bull'
                ? 'emerald'
                : rep.bias === 'bear'
                  ? 'crimson'
                  : 'amber';
            const isUp = rep.changePct !== null && rep.changePct >= 0;

            return (
              <SpotlightSurface
                key={rep.ticker}
                tone={spotTone}
                className="confluence-card-shell"
              >
                <button
                  type="button"
                  className={`confluence-card confluence-card--${rep.bias}`}
                  onClick={() => onSelectTicker(rep.ticker)}
                >
                  <div className="confluence-card-top">
                    <div className="confluence-card-id">
                      <span className="confluence-ticker mono">{rep.ticker}</span>
                      {rep.isIpo && <span className="room-pill-ipo mono">IPO</span>}
                      {rep.isLive247 && (
                        <span className="confluence-247-tag mono">24/7</span>
                      )}
                    </div>

                    <div className="confluence-score-group mono">
                      <span
                        className={`confluence-align-pill confluence-align-pill--${rep.bias}`}
                      >
                        {rep.alignedCount}/{Math.max(rep.activePillars, 1)}{' '}
                        {rep.bias === 'bull'
                          ? 'BULL'
                          : rep.bias === 'bear'
                            ? 'BEAR'
                            : 'MIXED'}
                      </span>
                      <span className="confluence-score-num">{rep.score}</span>
                    </div>
                  </div>

                  <div className="confluence-sub-row">
                    <span className="confluence-company">{rep.name}</span>
                    <div className="confluence-px-group mono">
                      <AnimatedNumber
                        value={rep.price}
                        prefix="$"
                        decimals={2}
                        className="confluence-px"
                      />
                      {rep.changePct !== null && (
                        <span className={isUp ? 'text-emerald' : 'text-crimson'}>
                          {isUp ? '+' : ''}
                          {rep.changePct.toFixed(1)}%
                        </span>
                      )}
                    </div>
                  </div>

                  {/* 5-Pillar Mini Diagnostic Strip */}
                  <div className="confluence-pillar-pills mono" aria-label="Signal pillars">
                    {rep.pillars.map((p) => (
                      <span
                        key={p.id}
                        className={`cf-mini-pill cf-mini-pill--${
                          !p.active ? 'idle' : p.direction
                        }`}
                        title={`${p.label}: ${p.headline} — ${p.evidence}`}
                      >
                        {p.shortLabel}
                      </span>
                    ))}
                  </div>

                  {/* Top Auditable Evidence Lines */}
                  <ul className="confluence-evidence-list mono">
                    {rep.topEvidence.slice(0, 2).map((line, i) => (
                      <li key={i}>{line}</li>
                    ))}
                  </ul>

                  {/* Earnings / Macro Warning or Open War Room Cue */}
                  <div className="confluence-card-foot mono">
                    {rep.catalystStatus.warningLabel ? (
                      <span
                        className={`cf-warn-chip cf-warn-chip--${
                          rep.catalystStatus.warningTone ?? 'amber'
                        }`}
                      >
                        <AlertTriangle size={10} aria-hidden="true" />
                        <span>{rep.catalystStatus.warningLabel}</span>
                      </span>
                    ) : (
                      <span className="cf-open-hint">
                        <span>OPEN WAR ROOM</span>
                        <ArrowRight size={11} />
                      </span>
                    )}
                  </div>
                </button>
              </SpotlightSurface>
            );
          })}
        </div>
      )}
    </section>
  );
}
