import { useEffect, useMemo, useState } from 'react';
import { Sparkles } from 'lucide-react';
import type { TickerMeta } from '../data/tickers';
import { generateAiBrief, type AiMarketBrief } from '../lib/aiBriefEngine';
import {
  fetchHyperliquidCandles,
  type HlAssetCtx,
  type HlCandle,
} from '../lib/hyperliquidFeed';

interface AiIntelligencePanelProps {
  meta: TickerMeta;
  liveCtx: HlAssetCtx | null;
  onSelectPriceLevel: (price: number) => void;
}

type BriefTab = 'overview' | 'levels' | 'positioning' | 'catalyst';

function pad2(n: number): string {
  return String(Math.max(0, Math.floor(n))).padStart(2, '0');
}

export function AiIntelligencePanel({
  meta,
  liveCtx,
  onSelectPriceLevel,
}: AiIntelligencePanelProps) {
  const [tab, setTab] = useState<BriefTab>('overview');
  const [candles15m, setCandles15m] = useState<HlCandle[]>([]);
  const [candles1h, setCandles1h] = useState<HlCandle[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [nowMs, setNowMs] = useState<number>(() => Date.now());

  // Tick 1s countdown only when viewing a ticker with unlock waves (e.g. ANT)
  useEffect(() => {
    if (!meta.unlockWaves?.length) return;
    const id = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [meta.unlockWaves]);

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();

    const load = async (initial: boolean) => {
      if (initial) setLoading(true);
      try {
        const [c15, c60] = await Promise.all([
          fetchHyperliquidCandles(meta.hlCoin, '15m', 120, controller.signal),
          fetchHyperliquidCandles(meta.hlCoin, '1h', 120, controller.signal),
        ]);
        if (!cancelled) {
          setCandles15m(c15);
          setCandles1h(c60);
          setLoading(false);
        }
      } catch {
        if (!cancelled) setLoading(false);
      }
    };

    void load(true);
    const pollId = window.setInterval(() => void load(false), 30_000);

    return () => {
      cancelled = true;
      controller.abort();
      window.clearInterval(pollId);
    };
  }, [meta.hlCoin]);

  const brief: AiMarketBrief | null = useMemo(
    () => generateAiBrief(meta.ticker, candles15m, candles1h, liveCtx),
    [meta.ticker, candles15m, candles1h, liveCtx],
  );

  // Next unlock countdown for ANT S-1 waves
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

  const biasClass =
    brief?.bias === 'bull'
      ? 'panel-badge--emerald'
      : brief?.bias === 'bear'
        ? 'panel-badge--crimson'
        : 'panel-badge--amber';

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
              ? `Pulling live 15m/1h structure, VWAP, momentum, and funding for ${meta.ticker}…`
              : brief?.summaryHeadline ??
                `Insufficient live candles for ${meta.ticker} quantitative synthesis.`}
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

        {/* Interactive Prompt / Drilldown Tabs */}
        <div className="ai-tabs-row" role="tablist" aria-label="AI brief views">
          {(
            [
              ['overview', 'OVERVIEW'],
              ['levels', 'LEVELS'],
              ['positioning', 'FLOW'],
              ['catalyst', 'CATALYST'],
            ] as Array<[BriefTab, string]>
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={tab === id}
              className={`ai-tab-btn mono${tab === id ? ' active' : ''}`}
              onClick={() => setTab(id)}
            >
              {label}
            </button>
          ))}
        </div>

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
