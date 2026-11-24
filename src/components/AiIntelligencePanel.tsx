import { useEffect, useMemo, useState } from 'react';
import { Flame, Sparkles } from 'lucide-react';
import type { TickerMeta } from '../data/tickers';
import { generateAiBrief, type AiMarketBrief } from '../lib/aiBriefEngine';
import type { HlCandle } from '../lib/hyperliquidFeed';
import { fetchUniversalCandles, type MarketQuote } from '../lib/universalFeed';
import { SegmentedTabs, type SegmentedTabItem } from './ui/SegmentedTabs';
import { SpotlightSurface } from './ui/SpotlightCard';

interface AiIntelligencePanelProps {
  meta: TickerMeta;
  liveQuote: MarketQuote | null;
  onSelectPriceLevel: (price: number) => void;
}

type BriefTab = 'overview' | 'levels' | 'positioning' | 'catalyst';

function pad2(n: number): string {
  return String(Math.max(0, Math.floor(n))).padStart(2, '0');
}

export function AiIntelligencePanel({
  meta,
  liveQuote,
  onSelectPriceLevel,
}: AiIntelligencePanelProps) {
  const [tab, setTab] = useState<BriefTab>('overview');
  const [candleState, setCandleState] = useState<{
    reqKey: string;
    c15: HlCandle[];
    c60: HlCandle[];
  } | null>(null);
  const [nowMs, setNowMs] = useState<number>(() => Date.now());

  const reqKey = `${meta.ticker}:${meta.hlCoin ?? 'mkt'}`;

  // Tick 1s countdown only when viewing a ticker with unlock waves (e.g. ANT)
  useEffect(() => {
    if (!meta.unlockWaves?.length) return;
    const id = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [meta.unlockWaves]);

  useEffect(() => {
    if (meta.ipoStatus === 'upcoming') return;

    let cancelled = false;
    const controller = new AbortController();

    const load = async () => {
      try {
        const [r15, r60] = await Promise.all([
          fetchUniversalCandles(meta.ticker, meta.hlCoin, '15m', 120, controller.signal),
          fetchUniversalCandles(meta.ticker, meta.hlCoin, '1h', 120, controller.signal),
        ]);
        if (!cancelled) {
          setCandleState({ reqKey, c15: r15.candles, c60: r60.candles });
        }
      } catch {
        if (!cancelled) {
          setCandleState({ reqKey, c15: [], c60: [] });
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
  }, [reqKey, meta.ticker, meta.hlCoin, meta.ipoStatus]);

  const isCurrent = candleState?.reqKey === reqKey;
  const loading = meta.ipoStatus !== 'upcoming' && !isCurrent;

  const brief: AiMarketBrief | null = useMemo(() => {
    const c15 = isCurrent ? candleState.c15 : [];
    const c60 = isCurrent ? candleState.c60 : [];
    return generateAiBrief(meta, c15, c60, liveQuote);
  }, [meta, isCurrent, candleState, liveQuote]);

  // Next unlock countdown for IPOs with staggered S-1 unlock waves
  const unlockInfo = useMemo(() => {
    if (!meta.unlockWaves?.length) return null;
    const next = meta.unlockWaves.find(
      (w) => w.id !== 'wave-1' && Date.parse(w.unlockIso) > nowMs,
    );
    if (!next) return null;
    const diff = Math.max(0, Date.parse(next.unlockIso) - nowMs);
    const totalSec = Math.floor(diff / 1000);
    return {
      wave: next,
      days: pad2(Math.floor(totalSec / 86400)),
      hours: pad2(Math.floor((totalSec % 86400) / 3600)),
      mins: pad2(Math.floor((totalSec % 3600) / 60)),
      secs: pad2(totalSec % 60),
    };
  }, [meta.unlockWaves, nowMs]);

  const tabItems = useMemo<ReadonlyArray<SegmentedTabItem<BriefTab>>>(
    () => [
      { id: 'overview', label: 'OVERVIEW' },
      { id: 'levels', label: 'LEVELS' },
      { id: 'positioning', label: 'FLOW' },
      { id: 'catalyst', label: meta.isIpo ? 'IPO / S-1' : 'CATALYST' },
    ],
    [meta.isIpo],
  );

  const biasClass =
    brief?.bias === 'bull'
      ? 'panel-badge--emerald'
      : brief?.bias === 'bear'
        ? 'panel-badge--crimson'
        : 'panel-badge--amber';

  const spotTone =
    brief?.bias === 'bull'
      ? 'emerald'
      : brief?.bias === 'bear'
        ? 'crimson'
        : 'amber';

  return (
    <section
      className="terminal-card"
      aria-label={`aINVEST AI Market Intelligence for ${meta.ticker}`}
    >
      <div className="panel-header">
        <div className="panel-title-group">
          <Sparkles size={13} className="text-emerald" aria-hidden="true" />
          <h2 className="panel-title">aINVEST AI BRIEF</h2>
        </div>
        <span className={`panel-badge ${biasClass}`}>
          {brief ? `${brief.conviction}% CONVICTION` : 'ANALYZING'}
        </span>
      </div>

      <div className="panel-body">
        {/* Regime Summary Card */}
        <SpotlightSurface tone={spotTone} className="ai-regime-spot-wrap">
          <div className="ai-regime-box">
            <div className="ai-regime-top">
              <span className="ai-regime-label mono">
                {brief ? brief.regime : `SYNTHESIZING ${meta.ticker}…`}
              </span>
              {brief && (
                <span
                  className={`ai-bias-pill mono ${
                    brief.bias === 'bull'
                      ? 'text-emerald'
                      : brief.bias === 'bear'
                        ? 'text-crimson'
                        : 'text-amber'
                  }`}
                >
                  {brief.bias === 'bull'
                    ? 'BULLISH'
                    : brief.bias === 'bear'
                      ? 'BEARISH'
                      : 'NEUTRAL'}
                </span>
              )}
            </div>

            <p className="ai-headline">
              {loading && !brief
                ? `Pulling live 15m/1h structure, VWAP, momentum, and flow for ${meta.ticker}…`
                : brief?.summaryHeadline ??
                  `Loading quantitative structure for ${meta.ticker}.`}
            </p>

            {brief && (
              <div className="ai-conviction-bar" aria-label={`AI conviction ${brief.conviction}%`}>
                <div
                  className={`ai-conviction-fill ai-conviction-fill--${brief.bias}`}
                  style={{ width: `${brief.conviction}%` }}
                />
              </div>
            )}
          </div>
        </SpotlightSurface>

        {/* Interactive Prompt / Drilldown Tabs */}
        <SegmentedTabs
          items={tabItems}
          value={tab}
          onChange={setTab}
          ariaLabel="AI brief views"
          size="sm"
          className="ai-seg-tabs"
        />

        {/* Tab Body */}
        {tab === 'overview' && brief && (
          <ul className="ai-bullet-list">
            {brief.overviewBullets.map((b, i) => (
              <li key={i}>{b}</li>
            ))}
          </ul>
        )}

        {tab === 'levels' && brief && (
          <div className="ai-levels-grid">
            {brief.levels.map((lvl) => (
              <button
                key={lvl.label}
                type="button"
                className="ai-level-card"
                onClick={() => onSelectPriceLevel(lvl.price)}
                title={`Load $${lvl.price.toFixed(2)} into Valuation & P&L Calculator`}
              >
                <span className="ai-level-label mono">{lvl.label}</span>
                <span
                  className={`ai-level-price mono ${
                    lvl.tone === 'bull'
                      ? 'text-emerald'
                      : lvl.tone === 'bear'
                        ? 'text-crimson'
                        : 'text-amber'
                  }`}
                >
                  ${lvl.price.toFixed(2)}
                </span>
                <span className="ai-level-note">{lvl.note}</span>
              </button>
            ))}
          </div>
        )}

        {tab === 'positioning' && brief && (
          <ul className="ai-bullet-list">
            {brief.positioningBullets.map((b, i) => (
              <li key={i}>{b}</li>
            ))}
          </ul>
        )}

        {tab === 'catalyst' && (
          <div className="ai-catalyst-block">
            {meta.isIpo && (
              <div className="ipo-deal-strip mono">
                <div className="ipo-deal-head">
                  <span className="ipo-deal-tag">
                    <Flame size={11} />
                    <span>
                      {meta.ipoStatus === 'upcoming' ? 'UPCOMING IPO' : 'RECENT IPO'}
                    </span>
                  </span>
                  <span>{meta.exchange ?? 'US MKT'}</span>
                </div>
                <div className="ipo-deal-meta-row">
                  {meta.ipoDate && <span>DATE: {meta.ipoDate}</span>}
                  {meta.ipoRangeLabel && <span>TERMS: {meta.ipoRangeLabel}</span>}
                  {meta.ipoRaisedLabel && <span>{meta.ipoRaisedLabel}</span>}
                </div>
              </div>
            )}

            {unlockInfo && (
              <div className="mini-countdown-box">
                <div className="countdown-target-row">
                  <span className="countdown-target-label">
                    NEXT CLIFF: {unlockInfo.wave.dateLabel.toUpperCase()}
                  </span>
                  <span className="countdown-target-shares">
                    +{unlockInfo.wave.sharesMillions}M SH
                  </span>
                </div>
                <div className="countdown-grid">
                  <div className="countdown-cell">
                    <span className="countdown-num">{unlockInfo.days}</span>
                    <span className="countdown-unit">D</span>
                  </div>
                  <div className="countdown-cell">
                    <span className="countdown-num">{unlockInfo.hours}</span>
                    <span className="countdown-unit">H</span>
                  </div>
                  <div className="countdown-cell">
                    <span className="countdown-num">{unlockInfo.mins}</span>
                    <span className="countdown-unit">M</span>
                  </div>
                  <div className="countdown-cell">
                    <span className="countdown-num">{unlockInfo.secs}</span>
                    <span className="countdown-unit">S</span>
                  </div>
                </div>
              </div>
            )}

            <ul className="ai-bullet-list">
              {meta.catalystNotes.map((note, i) => (
                <li key={i}>{note}</li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </section>
  );
}
