import { memo, useMemo, useState } from 'react';
import { Activity, BellPlus, Layers, ShieldAlert, TrendingUp } from 'lucide-react';
import type { TickerOptionsSummary } from '../lib/whaleFlowEngine';

type ProfileMode = 'gex' | 'oi' | 'iv';

interface GexProfilePanelProps {
  summaries: TickerOptionsSummary[];
  selectedTicker?: string;
  onSelectProfileTicker?: (ticker: string) => void;
  onOpenTerminal?: (ticker: string) => void;
  onArmAlert?: (params: {
    ticker: string;
    targetPrice: number;
    currentPrice?: number | null;
    label: string;
  }) => void;
}

function fmtUsdSigned(n: number): string {
  const sign = n > 0 ? '+' : n < 0 ? '-' : '';
  const abs = Math.abs(n);
  if (abs >= 1e9) return `${sign}$${(abs / 1e9).toFixed(2)}B`;
  if (abs >= 1e6) return `${sign}$${(abs / 1e6).toFixed(2)}M`;
  if (abs >= 1e3) return `${sign}$${(abs / 1e3).toFixed(1)}K`;
  return `${sign}$${abs.toFixed(0)}`;
}

function fmtCompact(n: number): string {
  const abs = Math.abs(n);
  if (abs >= 1e6) return `${(abs / 1e6).toFixed(1)}M`;
  if (abs >= 1e3) return `${(abs / 1e3).toFixed(1)}K`;
  return `${Math.round(abs)}`;
}

function GexProfilePanelComponent({
  summaries,
  selectedTicker,
  onSelectProfileTicker,
  onOpenTerminal,
  onArmAlert,
}: GexProfilePanelProps) {
  const [mode, setMode] = useState<ProfileMode>('gex');

  const activeSummary = useMemo(() => {
    if (summaries.length === 0) return null;
    if (selectedTicker) {
      const match = summaries.find((s) => s.ticker === selectedTicker);
      if (match) return match;
    }
    return (
      summaries.find((s) => s.gexProfile.length > 0) ?? summaries[0] ?? null
    );
  }, [summaries, selectedTicker]);

  const maxAbsValue = useMemo(() => {
    if (!activeSummary || activeSummary.gexProfile.length === 0) return 1;
    let maxV = 1;
    for (const row of activeSummary.gexProfile) {
      if (mode === 'gex') {
        maxV = Math.max(maxV, Math.abs(row.callGex), Math.abs(row.putGex));
      } else {
        maxV = Math.max(maxV, row.callOi, row.putOi);
      }
    }
    return maxV;
  }, [activeSummary, mode]);

  const spotClosestStrike = useMemo(() => {
    if (!activeSummary || activeSummary.gexProfile.length === 0) return null;
    return activeSummary.gexProfile.reduce((best, cur) =>
      Math.abs(cur.strike - activeSummary.spotPrice) <
      Math.abs(best.strike - activeSummary.spotPrice)
        ? cur
        : best,
    ).strike;
  }, [activeSummary]);

  const termStructureStatus = useMemo(() => {
    const pts = activeSummary?.ivTermStructure ?? [];
    if (pts.length < 2) return null;
    const front = pts[0].atmIv;
    const back = pts[pts.length - 1].atmIv;
    const diff = Number((front - back).toFixed(1));
    if (diff >= 3) {
      return { label: `BACKWARDATION (+${diff}% FRONT IV)`, tone: 'crimson' as const };
    }
    if (diff <= -3) {
      return { label: `CONTANGO (${diff}% NORMAL)`, tone: 'emerald' as const };
    }
    return { label: `FLAT TERM (${diff >= 0 ? '+' : ''}${diff}%)`, tone: 'amber' as const };
  }, [activeSummary]);

  const skewLabel = useMemo(() => {
    const skew = activeSummary?.ivSkewPct;
    if (skew === null || skew === undefined) return { text: '—', tone: '' };
    if (skew >= 4) return { text: `+${skew}% PUT SKEW`, tone: 'text-crimson' };
    if (skew <= -3) return { text: `${skew}% CALL FOMO`, tone: 'text-emerald' };
    return { text: `${skew >= 0 ? '+' : ''}${skew}% BALANCED`, tone: 'text-amber' };
  }, [activeSummary]);

  return (
    <section
      className="whale-card"
      aria-label="Dealer Gamma Exposure (GEX) Strike Profile and IV Term Structure"
    >
      <div className="panel-header gex-panel-head">
        <div className="panel-title-group">
          <Layers size={13} className="text-emerald" aria-hidden="true" />
          <h2 className="panel-title">DEALER GEX PROFILE &amp; GAMMA WALLS</h2>
          {activeSummary && (
            <span
              className={`panel-badge mono ${
                activeSummary.netGammaRegime === 'PIN (+GEX)'
                  ? 'panel-badge--emerald'
                  : activeSummary.netGammaRegime === 'VOLATILE (-GEX)'
                    ? 'panel-badge--crimson'
                    : 'panel-badge--amber'
              }`}
            >
              {activeSummary.netGammaRegime} • {fmtUsdSigned(activeSummary.netGexUsd)} / 1%
            </span>
          )}
        </div>

        <div className="gex-mode-tabs mono" role="tablist" aria-label="Profile chart mode">
          {(
            [
              ['gex', 'NET GEX ($)'],
              ['oi', 'OPEN INT'],
              ['iv', 'IV TERM'],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={mode === id}
              className={`whale-mini-tab${mode === id ? ' active' : ''}`}
              onClick={() => setMode(id)}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Ticker selector pills */}
      {summaries.length > 0 && (
        <div className="gex-ticker-ribbon mono">
          <span className="whale-mp-k">CHAIN:</span>
          {summaries.slice(0, 10).map((s) => {
            const active = activeSummary?.ticker === s.ticker;
            return (
              <button
                key={s.ticker}
                type="button"
                className={`gex-ticker-pill${active ? ' active' : ''}`}
                onClick={() => onSelectProfileTicker?.(s.ticker)}
              >
                <strong>{s.ticker}</strong>
                <span className="text-muted">${s.spotPrice.toFixed(2)}</span>
              </button>
            );
          })}
          {activeSummary && onOpenTerminal && (
            <button
              type="button"
              className="gex-open-chart-btn"
              onClick={() => onOpenTerminal(activeSummary.ticker)}
              title={`Open ${activeSummary.ticker} chart with GEX Walls overlay`}
            >
              <TrendingUp size={11} />
              <span>PLOT ON {activeSummary.ticker} CHART</span>
            </button>
          )}
        </div>
      )}

      {!activeSummary || activeSummary.gexProfile.length === 0 ? (
        <div className="ta-loading-state mono">
          Dealer Gamma Exposure (GEX), Call/Put Walls, Zero-Gamma Flip, and IV Term Structure populate automatically once live CBOE chains sync.
        </div>
      ) : (
        <div className="gex-body">
          {/* Key Dealer Positioning Levels Strip */}
          <div className="gex-levels-strip mono">
            <div className="gex-level-tile">
              <div className="gex-level-top">
                <span className="gex-level-k">CALL WALL (RES)</span>
                {activeSummary.callWall && onArmAlert && (
                  <button
                    type="button"
                    className="gex-bell-mini"
                    onClick={() =>
                      onArmAlert({
                        ticker: activeSummary.ticker,
                        targetPrice: activeSummary.callWall!,
                        currentPrice: activeSummary.spotPrice,
                        label: 'GEX Call Wall',
                      })
                    }
                    title={`Arm alert at Call Wall $${activeSummary.callWall}`}
                    aria-label={`Arm Call Wall alert for ${activeSummary.ticker}`}
                  >
                    <BellPlus size={10} />
                  </button>
                )}
              </div>
              <strong className="gex-level-v text-emerald">
                {activeSummary.callWall ? `$${activeSummary.callWall}` : '—'}
              </strong>
            </div>

            <div className="gex-level-tile">
              <div className="gex-level-top">
                <span className="gex-level-k">PUT WALL (SUP)</span>
                {activeSummary.putWall && onArmAlert && (
                  <button
                    type="button"
                    className="gex-bell-mini"
                    onClick={() =>
                      onArmAlert({
                        ticker: activeSummary.ticker,
                        targetPrice: activeSummary.putWall!,
                        currentPrice: activeSummary.spotPrice,
                        label: 'GEX Put Wall',
                      })
                    }
                    title={`Arm alert at Put Wall $${activeSummary.putWall}`}
                    aria-label={`Arm Put Wall alert for ${activeSummary.ticker}`}
                  >
                    <BellPlus size={10} />
                  </button>
                )}
              </div>
              <strong className="gex-level-v text-crimson">
                {activeSummary.putWall ? `$${activeSummary.putWall}` : '—'}
              </strong>
            </div>

            <div className="gex-level-tile">
              <div className="gex-level-top">
                <span className="gex-level-k">ZERO-GAMMA FLIP</span>
                {activeSummary.gammaFlip && onArmAlert && (
                  <button
                    type="button"
                    className="gex-bell-mini"
                    onClick={() =>
                      onArmAlert({
                        ticker: activeSummary.ticker,
                        targetPrice: activeSummary.gammaFlip!,
                        currentPrice: activeSummary.spotPrice,
                        label: 'Zero-Gamma Flip',
                      })
                    }
                    title={`Arm alert at Gamma Flip $${activeSummary.gammaFlip}`}
                    aria-label={`Arm Gamma Flip alert for ${activeSummary.ticker}`}
                  >
                    <BellPlus size={10} />
                  </button>
                )}
              </div>
              <strong className="gex-level-v text-amber">
                {activeSummary.gammaFlip ? `$${activeSummary.gammaFlip}` : '—'}
              </strong>
            </div>

            <div className="gex-level-tile">
              <span className="gex-level-k">
                MAX PAIN ({activeSummary.maxPainExpiration?.slice(5) ?? 'NEAR'})
              </span>
              <strong className="gex-level-v gex-violet">
                {activeSummary.maxPainStrike ? `$${activeSummary.maxPainStrike}` : '—'}
              </strong>
            </div>

            <div className="gex-level-tile">
              <span className="gex-level-k">
                ±1σ MOVE ({activeSummary.expectedMoveExp?.slice(5) ?? 'WKLY'})
              </span>
              <strong className="gex-level-v gex-cyan">
                {activeSummary.expectedMoveUsd !== null &&
                activeSummary.expectedMovePct !== null
                  ? `±$${activeSummary.expectedMoveUsd.toFixed(2)} (±${activeSummary.expectedMovePct}%)`
                  : '—'}
              </strong>
            </div>

            <div className="gex-level-tile">
              <span className="gex-level-k">25Δ / 5% IV SKEW</span>
              <strong className={`gex-level-v ${skewLabel.tone}`}>
                {skewLabel.text}
              </strong>
            </div>
          </div>

          {mode !== 'iv' ? (
            <div className="gex-ladder-wrap mono">
              <div className="gex-ladder-legend">
                <span className="text-crimson">
                  ◄ {mode === 'gex' ? 'PUT GEX (DEALER SHORT VOL)' : 'PUT OPEN INTEREST'}
                </span>
                <span className="text-muted">
                  SPOT ${activeSummary.spotPrice.toFixed(2)}
                </span>
                <span className="text-emerald">
                  {mode === 'gex' ? 'CALL GEX (DEALER PINNING)' : 'CALL OPEN INTEREST'} ►
                </span>
              </div>

              <div className="gex-ladder-rows">
                {activeSummary.gexProfile.map((row) => {
                  const leftVal = mode === 'gex' ? Math.abs(row.putGex) : row.putOi;
                  const rightVal = mode === 'gex' ? Math.abs(row.callGex) : row.callOi;
                  const leftPct = Math.min(100, (leftVal / maxAbsValue) * 100);
                  const rightPct = Math.min(100, (rightVal / maxAbsValue) * 100);

                  const isSpot = row.strike === spotClosestStrike;
                  const isCallWall = row.strike === activeSummary.callWall;
                  const isPutWall = row.strike === activeSummary.putWall;
                  const isMaxPain = row.strike === activeSummary.maxPainStrike;

                  return (
                    <div
                      key={row.strike}
                      className={`gex-row${isSpot ? ' gex-row--spot' : ''}`}
                    >
                      <div className="gex-strike-col">
                        <span className="gex-strike-num">${row.strike}</span>
                        <span className="gex-strike-tags">
                          {isSpot && <span className="gex-tag gex-tag--spot">SPOT</span>}
                          {isCallWall && <span className="gex-tag gex-tag--bull">C-WALL</span>}
                          {isPutWall && <span className="gex-tag gex-tag--bear">P-WALL</span>}
                          {isMaxPain && <span className="gex-tag gex-tag--violet">MP</span>}
                        </span>
                      </div>

                      <div className="gex-bar-left">
                        <span className="gex-val-lbl text-crimson">
                          {leftVal > 0
                            ? mode === 'gex'
                              ? fmtUsdSigned(-leftVal)
                              : fmtCompact(leftVal)
                            : ''}
                        </span>
                        <div className="gex-track gex-track--left">
                          <div
                            className="gex-fill gex-fill--put"
                            style={{ width: `${leftPct}%` }}
                          />
                        </div>
                      </div>

                      <div className="gex-axis-center" />

                      <div className="gex-bar-right">
                        <div className="gex-track gex-track--right">
                          <div
                            className="gex-fill gex-fill--call"
                            style={{ width: `${rightPct}%` }}
                          />
                        </div>
                        <span className="gex-val-lbl text-emerald">
                          {rightVal > 0
                            ? mode === 'gex'
                              ? fmtUsdSigned(rightVal)
                              : fmtCompact(rightVal)
                            : ''}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            <div className="gex-iv-term-wrap mono">
              <div className="gex-iv-term-head">
                <span className="gex-iv-title">
                  <Activity size={12} className="text-emerald" />
                  <span>ATM IMPLIED VOLATILITY TERM STRUCTURE</span>
                </span>
                {termStructureStatus && (
                  <span
                    className={`panel-badge panel-badge--${termStructureStatus.tone}`}
                  >
                    {termStructureStatus.label}
                  </span>
                )}
              </div>

              {activeSummary.ivTermStructure.length === 0 ? (
                <div className="ta-loading-state">
                  No multi-expiry implied volatility quotes returned for {activeSummary.ticker}.
                </div>
              ) : (
                <div className="gex-iv-bars">
                  {activeSummary.ivTermStructure.map((pt) => {
                    const maxIv = Math.max(
                      1,
                      ...activeSummary.ivTermStructure.map((p) => p.atmIv),
                    );
                    const pct = Math.max(12, Math.round((pt.atmIv / maxIv) * 100));
                    return (
                      <div key={pt.expiration} className="gex-iv-col">
                        <span className="gex-iv-val">{pt.atmIv.toFixed(1)}%</span>
                        <div className="gex-iv-col-track">
                          <div
                            className="gex-iv-col-fill"
                            style={{ height: `${pct}%` }}
                          />
                        </div>
                        <span className="gex-iv-exp">{pt.expiration.slice(5)}</span>
                        <span className="gex-iv-dte text-muted">{pt.dte}D</span>
                      </div>
                    );
                  })}
                </div>
              )}

              <div className="gex-iv-note">
                <ShieldAlert size={11} className="text-amber" />
                <span>
                  Backwardation (front-month IV higher than back-month) signals near-term catalyst or earnings event risk priced into options.
                </span>
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

export const GexProfilePanel = memo(GexProfilePanelComponent);
