import { memo, useEffect, useRef, useState } from 'react';
import { BellPlus, Waves } from 'lucide-react';
import type { TickerMeta } from '../data/tickers';
import {
  fetchTickerOptionsFlow,
  type TickerOptionsSummary,
} from '../lib/whaleFlowEngine';

interface OptionsFlowTickerCardProps {
  meta: TickerMeta;
  livePrice: number | null;
  onSelectPriceLevel: (price: number) => void;
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
  onArmAlert,
}: OptionsFlowTickerCardProps) {
  const [state, setState] = useState<{
    ticker: string;
    summary: TickerOptionsSummary | null;
    done: boolean;
  } | null>(null);
  const livePriceRef = useRef<number | null>(livePrice);

  useEffect(() => {
    livePriceRef.current = livePrice;
  }, [livePrice]);

  useEffect(() => {
    if (meta.ipoStatus === 'upcoming') return;

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
      aria-label={`Unusual Options Flow and Max Pain for ${meta.ticker}`}
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
            Scanning CBOE options chain &amp; Max Pain for {meta.ticker}…
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

            {/* Key Metrics Strip: Max Pain + Gamma Regime + Call/Put Volume */}
            <div className="whale-term-metrics mono">
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
                <span className="bread-lvl-label">GAMMA REGIME</span>
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

            {/* Top 4 Unusual Contracts */}
            {summary.unusualContracts.length > 0 && (
              <div className="whale-term-contracts mono">
                <div className="whale-term-subhead">TOP UNUSUAL CONTRACTS</div>
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
                        {c.volOiRatio.toFixed(1)}× V/OI
                      </span>
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
