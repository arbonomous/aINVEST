import { memo, useEffect, useRef, useState } from 'react';
import { BellPlus, Calculator, Waves } from 'lucide-react';
import type { TickerMeta } from '../data/tickers';
import {
  extractChartGexLevels,
  fetchTickerOptionsFlow,
  type ChartGexLevels,
  type OptionContractFlow,
  type TickerOptionsSummary,
} from '../lib/whaleFlowEngine';

interface OptionsFlowTickerCardProps {
  meta: TickerMeta;
  livePrice: number | null;
  onSelectPriceLevel: (price: number) => void;
  onOptionsLevelsUpdate?: (levels: ChartGexLevels | null) => void;
  onSimulateContract?: (contract: OptionContractFlow) => void;
  onArmAlert?: (params: {
    ticker: string;
    targetPrice: number;
    currentPrice?: number | null;
    label: string;
  }) => void;
}

function fmtUsd(n: number): string {
  const abs = Math.abs(n);
  if (abs >= 1e9) return `$${(abs / 1e9).toFixed(2)}B`;
  if (abs >= 1e6) return `$${(abs / 1e6).toFixed(2)}M`;
  if (abs >= 1e3) return `$${(abs / 1e3).toFixed(1)}K`;
  return `$${abs.toFixed(0)}`;
}

function OptionsFlowTickerCardComponent({
  meta,
  livePrice,
  onSelectPriceLevel,
  onOptionsLevelsUpdate,
  onSimulateContract,
  onArmAlert,
}: OptionsFlowTickerCardProps) {
  const [state, setState] = useState<{
    ticker: string;
    summary: TickerOptionsSummary | null;
    done: boolean;
  } | null>(null);
  const livePriceRef = useRef<number | null>(livePrice);
  const onLevelsRef = useRef(onOptionsLevelsUpdate);

  useEffect(() => {
    livePriceRef.current = livePrice;
  }, [livePrice]);

  useEffect(() => {
    onLevelsRef.current = onOptionsLevelsUpdate;
  }, [onOptionsLevelsUpdate]);

  useEffect(() => {
    if (meta.ipoStatus === 'upcoming') {
      onLevelsRef.current?.(null);
      return;
    }

    let active = true;
    const controller = new AbortController();

    const load = async () => {
      const res = await fetchTickerOptionsFlow(
        meta.ticker,
        livePriceRef.current,
        false,
        controller.signal,
      );
      if (!active || controller.signal.aborted) return;
      setState({ ticker: meta.ticker, summary: res, done: true });
      onLevelsRef.current?.(extractChartGexLevels(res));
    };

    void load();
    return () => {
      active = false;
      controller.abort();
    };
  }, [meta.ticker, meta.ipoStatus]);

  const isCurrent = state?.ticker === meta.ticker && state.done;
  const summary = isCurrent ? state.summary : null;
  const loading = meta.ipoStatus !== 'upcoming' && !isCurrent;

  const totalPrem = summary
    ? summary.callPremiumUsd + summary.putPremiumUsd
    : 0;
  const callPct =
    totalPrem > 0 && summary
      ? Math.round((summary.callPremiumUsd / totalPrem) * 100)
      : 50;

  return (
    <section
      className="terminal-card"
      aria-label={`Unusual Options Flow, GEX Walls and Max Pain for ${meta.ticker}`}
    >
      <div className="panel-header">
        <div className="panel-title-group">
          <Waves size={13} className="text-emerald" aria-hidden="true" />
          <h2 className="panel-title">OPTIONS FLOW // WHALE</h2>
        </div>
        {summary ? (
          <span
            className={`panel-badge mono ${
              summary.flowBias === 'BULLISH'
                ? 'panel-badge--emerald'
                : summary.flowBias === 'BEARISH'
                  ? 'panel-badge--crimson'
                  : 'panel-badge--amber'
            }`}
          >
            {summary.flowBias} • {summary.putCallVolRatio} P/C
          </span>
        ) : (
          <span className="panel-badge mono">{meta.ticker}</span>
        )}
      </div>

      <div className="panel-body whale-term-body">
        {loading ? (
          <div className="ta-loading-state mono">
            Scanning CBOE options chain, GEX Walls &amp; Max Pain for {meta.ticker}…
          </div>
        ) : !summary ? (
          <div className="ta-loading-state mono">
            {meta.ipoStatus === 'upcoming'
              ? `Options chain activates after ${meta.ticker} lists and qualifies for CBOE options.`
              : `No active listed US options chain found for ${meta.ticker} yet (new IPO or OTC/non-optionable).`}
          </div>
        ) : (
          <>
            {/* Call vs Put Premium Split */}
            <div className="whale-term-split mono">
              <div className="whale-term-split-row">
                <span className="text-emerald">
                  CALLS {fmtUsd(summary.callPremiumUsd)} ({callPct}%)
                </span>
                <span className="text-crimson">
                  PUTS {fmtUsd(summary.putPremiumUsd)} ({100 - callPct}%)
                </span>
              </div>
              <div className="whale-split-bar">
                <div
                  className="whale-split-bull"
                  style={{ width: `${callPct}%` }}
                />
                <div
                  className="whale-split-bear"
                  style={{ width: `${100 - callPct}%` }}
                />
              </div>
            </div>

            {/* Dealer GEX Walls & Expected Move Grid */}
            <div className="whale-term-metrics mono">
              <div className="bread-term-lvl-cell">
                <button
                  type="button"
                  className="bread-term-lvl-btn"
                  disabled={!summary.callWall}
                  onClick={() => {
                    if (summary.callWall) onSelectPriceLevel(summary.callWall);
                  }}
                  title="Dealer Call Wall (resistance) — click to load into Calculator"
                >
                  <span className="bread-lvl-label">CALL WALL</span>
                  <span className="bread-lvl-val text-emerald">
                    {summary.callWall ? `$${summary.callWall}` : '—'}
                  </span>
                </button>
                {summary.callWall && onArmAlert && (
                  <button
                    type="button"
                    className="bread-lvl-bell-btn"
                    onClick={() =>
                      onArmAlert({
                        ticker: meta.ticker,
                        targetPrice: summary.callWall!,
                        currentPrice: livePrice ?? summary.spotPrice,
                        label: 'GEX Call Wall',
                      })
                    }
                    title={`Arm alert at Call Wall $${summary.callWall}`}
                    aria-label={`Arm Call Wall alert for ${meta.ticker}`}
                  >
                    <BellPlus size={11} />
                  </button>
                )}
              </div>

              <div className="bread-term-lvl-cell">
                <button
                  type="button"
                  className="bread-term-lvl-btn"
                  disabled={!summary.putWall}
                  onClick={() => {
                    if (summary.putWall) onSelectPriceLevel(summary.putWall);
                  }}
                  title="Dealer Put Wall (support) — click to load into Calculator"
                >
                  <span className="bread-lvl-label">PUT WALL</span>
                  <span className="bread-lvl-val text-crimson">
                    {summary.putWall ? `$${summary.putWall}` : '—'}
                  </span>
                </button>
                {summary.putWall && onArmAlert && (
                  <button
                    type="button"
                    className="bread-lvl-bell-btn"
                    onClick={() =>
                      onArmAlert({
                        ticker: meta.ticker,
                        targetPrice: summary.putWall!,
                        currentPrice: livePrice ?? summary.spotPrice,
                        label: 'GEX Put Wall',
                      })
                    }
                    title={`Arm alert at Put Wall $${summary.putWall}`}
                    aria-label={`Arm Put Wall alert for ${meta.ticker}`}
                  >
                    <BellPlus size={11} />
                  </button>
                )}
              </div>

              <div className="bread-term-lvl-cell">
                <button
                  type="button"
                  className="bread-term-lvl-btn"
                  disabled={!summary.maxPainStrike}
                  onClick={() => {
                    if (summary.maxPainStrike) {
                      onSelectPriceLevel(summary.maxPainStrike);
                    }
                  }}
                  title="Click to load Max Pain strike into P&L Calculator"
                >
                  <span className="bread-lvl-label">
                    MAX PAIN ({summary.maxPainExpiration?.slice(5) ?? 'NEAR'})
                  </span>
                  <span className="bread-lvl-val text-amber">
                    {summary.maxPainStrike ? `$${summary.maxPainStrike}` : '—'}
                  </span>
                </button>
                {summary.maxPainStrike && onArmAlert && (
                  <button
                    type="button"
                    className="bread-lvl-bell-btn"
                    onClick={() =>
                      onArmAlert({
                        ticker: meta.ticker,
                        targetPrice: summary.maxPainStrike!,
                        currentPrice: livePrice ?? summary.spotPrice,
                        label: `Max Pain (${summary.maxPainExpiration?.slice(5) ?? 'Near'})`,
                      })
                    }
                    title={`Arm alert at Max Pain $${summary.maxPainStrike}`}
                    aria-label={`Arm Max Pain alert for ${meta.ticker}`}
                  >
                    <BellPlus size={11} />
                  </button>
                )}
              </div>

              <div className="whale-term-stat-box">
                <span className="bread-lvl-label">
                  {summary.gammaFlip ? `FLIP $${summary.gammaFlip}` : 'GAMMA REGIME'}
                </span>
                <span
                  className={`bread-lvl-val ${
                    summary.netGammaRegime === 'PIN (+GEX)'
                      ? 'text-emerald'
                      : summary.netGammaRegime === 'VOLATILE (-GEX)'
                        ? 'text-crimson'
                        : ''
                  }`}
                >
                  {summary.netGammaRegime}
                </span>
              </div>
            </div>

            {summary.expectedMoveUsd !== null && summary.expectedMovePct !== null && (
              <div className="whale-term-em-strip mono">
                <span className="text-muted">
                  ±1σ EXP MOVE ({summary.expectedMoveExp?.slice(5) ?? 'WKLY'})
                </span>
                <strong className="gex-cyan">
                  ±${summary.expectedMoveUsd.toFixed(2)} (±{summary.expectedMovePct}%)
                </strong>
              </div>
            )}

            {/* Top 4 Unusual Contracts — click SIM to launch Black-Scholes P&L Heatmap */}
            {summary.unusualContracts.length > 0 && (
              <div className="whale-term-contracts mono">
                <div className="whale-term-subhead">
                  <span>TOP UNUSUAL CONTRACTS</span>
                  <span className="text-muted">CLICK SIM FOR P&amp;L</span>
                </div>
                {summary.unusualContracts.slice(0, 4).map((c) => {
                  const isCall = c.type === 'CALL';
                  return (
                    <div key={c.id} className="whale-term-contract-row">
                      <span
                        className={`whale-cp-badge ${
                          isCall ? 'whale-cp-badge--bull' : 'whale-cp-badge--bear'
                        }`}
                      >
                        {c.contract}
                      </span>
                      <span className="whale-term-prem">
                        {fmtUsd(c.estPremiumUsd)}
                      </span>
                      <span
                        className={
                          c.volOiRatio >= 2 ? 'text-amber' : 'text-muted'
                        }
                      >
                        {c.volOiRatio.toFixed(1)}×
                      </span>
                      {onSimulateContract && (
                        <button
                          type="button"
                          className="whale-sim-btn"
                          onClick={() => onSimulateContract(c)}
                          title={`Simulate P&L heatmap for ${c.ticker} ${c.contract}`}
                        >
                          <Calculator size={10} />
                          <span>SIM</span>
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}
      </div>
    </section>
  );
}

export const OptionsFlowTickerCard = memo(OptionsFlowTickerCardComponent);
