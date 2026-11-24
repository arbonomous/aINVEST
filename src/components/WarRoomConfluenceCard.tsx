import { memo, useMemo } from 'react';
import {
  AlertTriangle,
  CalendarClock,
  Camera,
  Layers,
} from 'lucide-react';
import type { TickerMeta } from '../data/tickers';
import {
  computeTickerConfluence,
  type ConfluencePillarId,
} from '../lib/confluenceEngine';
import type { HlAssetCtx } from '../lib/hyperliquidFeed';
import type { InsidersBundle } from '../lib/insidersEngine';
import type { DirectoryEntry } from '../lib/marketCatalog';
import type { NewsArticle } from '../lib/newsFeed';
import { exportConfluenceSnapshotCard } from '../lib/snapshotCard';
import type { MarketQuote } from '../lib/universalFeed';
import type { ChartGexLevels, TickerOptionsSummary } from '../lib/whaleFlowEngine';
import type { ChartTradePlan } from './RealtimeCandleChart';
import { SpotlightSurface } from './ui/SpotlightCard';

interface WarRoomConfluenceCardProps {
  meta: TickerMeta;
  liveQuote: MarketQuote | null;
  hlCtx: HlAssetCtx | null;
  directoryEntry: DirectoryEntry | null;
  insidersBundle: InsidersBundle | null;
  articles: NewsArticle[];
  tradePlan: ChartTradePlan | null;
  gexLevels: ChartGexLevels | null;
  optionsSummary?: TickerOptionsSummary | null;
  onSelectPillar?: (pillarId: ConfluencePillarId) => void;
  onNotify?: (message: string) => void;
}

function WarRoomConfluenceCardComponent({
  meta,
  liveQuote,
  hlCtx,
  directoryEntry,
  insidersBundle,
  articles,
  tradePlan,
  gexLevels,
  optionsSummary = null,
  onSelectPillar,
  onNotify,
}: WarRoomConfluenceCardProps) {
  const report = useMemo(
    () =>
      computeTickerConfluence({
        ticker: meta.ticker,
        name: meta.name,
        hlCtx,
        quote: liveQuote,
        directoryEntry,
        insidersBundle,
        articles,
        tradePlan,
        gexLevels,
        optionsSummary,
      }),
    [
      meta.ticker,
      meta.name,
      hlCtx,
      liveQuote,
      directoryEntry,
      insidersBundle,
      articles,
      tradePlan,
      gexLevels,
      optionsSummary,
    ],
  );

  const spotTone =
    report.bias === 'bull'
      ? 'emerald'
      : report.bias === 'bear'
        ? 'crimson'
        : 'amber';

  const badgeClass =
    report.bias === 'bull'
      ? 'panel-badge--emerald'
      : report.bias === 'bear'
        ? 'panel-badge--crimson'
        : 'panel-badge--amber';

  return (
    <section
      className="terminal-card warroom-confluence-card"
      aria-label={`5-Pillar Cross-Signal Confluence Score for ${meta.ticker}`}
    >
      <div className="panel-header">
        <div className="panel-title-group">
          <Layers size={13} className="text-emerald" aria-hidden="true" />
          <h2 className="panel-title">5-PILLAR CONFLUENCE</h2>
        </div>

        <div className="cf-header-right">
          <span className={`panel-badge mono ${badgeClass}`}>
            {report.score}/100
          </span>
          <button
            type="button"
            className="whale-sim-btn mono"
            onClick={() => {
              void exportConfluenceSnapshotCard(report).then((res) => {
                if (res === 'copied') {
                  onNotify?.(`Copied & saved ${meta.ticker} 5-Pillar Confluence PNG`);
                } else if (res === 'downloaded') {
                  onNotify?.(`Downloaded ${meta.ticker} 5-Pillar Confluence PNG`);
                }
              });
            }}
            title={`Export ${meta.ticker} 5-Pillar Confluence PNG card for X / Discord`}
          >
            <Camera size={10} />
            <span>PNG</span>
          </button>
        </div>
      </div>

      <div className="panel-body cf-warroom-body">
        {/* Executive Verdict Hero */}
        <SpotlightSurface tone={spotTone} className="cf-verdict-spot">
          <div className="cf-verdict-box">
            <div className="cf-verdict-top mono">
              <span
                className={`cf-verdict-title ${
                  report.bias === 'bull'
                    ? 'text-emerald'
                    : report.bias === 'bear'
                      ? 'text-crimson'
                      : 'text-amber'
                }`}
              >
                {report.verdict}
              </span>
              <span className="cf-verdict-align">
                {report.alignedCount}/{Math.max(report.activePillars, 1)} ALIGNED
              </span>
            </div>

            <div className="ai-conviction-bar" aria-label={`Confluence score ${report.score}/100`}>
              <div
                className={`ai-conviction-fill ai-conviction-fill--${report.bias}`}
                style={{ width: `${report.score}%` }}
              />
            </div>

            {report.catalystStatus.warningLabel ? (
              <div
                className={`cf-catalyst-banner cf-catalyst-banner--${
                  report.catalystStatus.warningTone ?? 'amber'
                } mono`}
              >
                <AlertTriangle size={11} aria-hidden="true" />
                <span>{report.catalystStatus.warningLabel}</span>
              </div>
            ) : (
              report.catalystStatus.nextMacro && (
                <div className="cf-catalyst-banner cf-catalyst-banner--calm mono">
                  <CalendarClock size={11} aria-hidden="true" />
                  <span>
                    MACRO: {report.catalystStatus.nextMacro.shortLabel}{' '}
                    {report.catalystStatus.nextMacro.countdownLabel} (
                    {report.catalystStatus.nextMacro.timeEt})
                  </span>
                </div>
              )
            )}
          </div>
        </SpotlightSurface>

        {/* Auditable 5-Pillar Breakdown Rows (Click to jump to proof panel) */}
        <div className="cf-pillars-list">
          {report.pillars.map((p) => (
            <button
              key={p.id}
              type="button"
              className={`cf-pillar-row cf-pillar-row--btn${p.active ? '' : ' cf-pillar-row--idle'}`}
              onClick={() => onSelectPillar?.(p.id)}
              title={`Jump to ${p.label} panel`}
            >
              <div className="cf-pillar-head mono">
                <span
                  className={`cf-pillar-tag cf-mini-pill--${
                    !p.active ? 'idle' : p.direction
                  }`}
                >
                  {p.shortLabel}
                </span>
                <span className="cf-pillar-headline">{p.headline}</span>
                <span className="cf-pillar-score">{p.active ? p.strength : '—'}</span>
              </div>
              <div className="cf-pillar-bar-track" aria-hidden="true">
                <span
                  className={`cf-pillar-bar-fill cf-pillar-bar-fill--${
                    !p.active ? 'idle' : p.direction
                  }`}
                  style={{ width: `${p.active ? p.strength : 10}%` }}
                />
              </div>
              <p className="cf-pillar-evidence">{p.evidence}</p>
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}

export const WarRoomConfluenceCard = memo(WarRoomConfluenceCardComponent);
