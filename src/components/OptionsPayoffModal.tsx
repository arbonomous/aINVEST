import { memo, useEffect, useMemo, useState } from 'react';
import { Calculator, Check, Copy, X } from 'lucide-react';
import { buildPayoffHeatmap } from '../lib/optionsPricing';
import type { OptionContractFlow } from '../lib/whaleFlowEngine';

interface OptionsPayoffModalProps {
  contract: OptionContractFlow;
  onClose: () => void;
  onCopySuccess?: (message: string) => void;
}

function fmtSignedUsd(n: number): string {
  const sign = n > 0 ? '+' : n < 0 ? '-' : '';
  const abs = Math.abs(n);
  if (abs >= 1e6) return `${sign}$${(abs / 1e6).toFixed(2)}M`;
  if (abs >= 1e4) return `${sign}$${(abs / 1e3).toFixed(1)}K`;
  return `${sign}$${abs.toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
}

function OptionsPayoffModalComponent({
  contract,
  onClose,
  onCopySuccess,
}: OptionsPayoffModalProps) {
  const defaultEntry =
    contract.ask > 0
      ? contract.ask
      : contract.mark > 0
        ? contract.mark
        : Math.max(0.1, contract.bid);

  const [side, setSide] = useState<'LONG' | 'SHORT'>('LONG');
  const [contracts, setContracts] = useState<number>(1);
  const [entryInput, setEntryInput] = useState<string>(defaultEntry.toFixed(2));
  const [ivShiftPct, setIvShiftPct] = useState<number>(0);
  const [displayUnit, setDisplayUnit] = useState<'usd' | 'roi'>('usd');
  const [copiedCard, setCopiedCard] = useState(false);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  const parsedEntry = useMemo(() => {
    const n = Number.parseFloat(entryInput);
    return Number.isFinite(n) && n > 0 ? n : defaultEntry;
  }, [entryInput, defaultEntry]);

  const baseIvPct = contract.iv && contract.iv > 0 ? contract.iv : 48;

  const heatmap = useMemo(
    () =>
      buildPayoffHeatmap({
        type: contract.type,
        side,
        spot: contract.spotPrice,
        strike: contract.strike,
        entryPrice: parsedEntry,
        dte: contract.dte,
        ivPct: baseIvPct,
        contracts,
        ivShiftPct,
      }),
    [contract, side, parsedEntry, baseIvPct, contracts, ivShiftPct],
  );

  const maxAbsPnl = useMemo(() => {
    let m = 1;
    for (const r of heatmap.rows) {
      for (const c of r.cells) {
        m = Math.max(m, Math.abs(c.pnlUsd));
      }
    }
    return m;
  }, [heatmap.rows]);

  const handleCopyCard = async () => {
    const text = [
      `🐋 aINVEST OPTIONS FLOW SIM — ${contract.ticker} ${contract.contract}`,
      `Side: ${side === 'LONG' ? 'BUY' : 'SELL'} ${contracts}x @ $${parsedEntry.toFixed(2)} ($${heatmap.costBasisUsd.toLocaleString('en-US', { maximumFractionDigits: 0 })})`,
      `Spot: $${contract.spotPrice.toFixed(2)} | Breakeven: $${heatmap.breakeven.toFixed(2)} | POP: ${heatmap.popPct}%`,
      `IV: ${heatmap.effectiveIvPct}% | Δ ${heatmap.greeks.delta.toFixed(2)} | Γ ${heatmap.greeks.gamma.toFixed(4)} | Θ ${heatmap.greeks.thetaDaily.toFixed(2)}/d | ν ${heatmap.greeks.vegaPer1Pct.toFixed(2)}`,
      `Unusual Tape: Vol ${contract.volume.toLocaleString()} vs OI ${contract.openInterest.toLocaleString()} (${contract.volOiRatio.toFixed(1)}x)`,
    ].join('\n');

    try {
      await navigator.clipboard.writeText(text);
      setCopiedCard(true);
      onCopySuccess?.(`Copied ${contract.ticker} ${contract.contract} trade card`);
      window.setTimeout(() => setCopiedCard(false), 1800);
    } catch {
      onCopySuccess?.('Clipboard blocked — copy details manually');
    }
  };

  return (
    <div
      className="explorer-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label={`Options P&L Simulator for ${contract.ticker} ${contract.contract}`}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="payoff-modal-card">
        <div className="panel-header payoff-modal-head">
          <div className="panel-title-group">
            <Calculator size={14} className="text-emerald" aria-hidden="true" />
            <h2 className="panel-title">
              {contract.ticker} {contract.contract} — OPTIONS P&amp;L SIMULATOR
            </h2>
            <span
              className={`whale-cp-badge mono ${
                contract.type === 'CALL'
                  ? 'whale-cp-badge--bull'
                  : 'whale-cp-badge--bear'
              }`}
            >
              {contract.dte}DTE • {contract.moneyness}
            </span>
          </div>

          <div className="payoff-head-actions">
            <button
              type="button"
              className="dispatch-refresh-btn mono"
              onClick={() => void handleCopyCard()}
            >
              {copiedCard ? <Check size={11} /> : <Copy size={11} />}
              <span>{copiedCard ? 'COPIED' : 'COPY CARD'}</span>
            </button>
            <button
              type="button"
              className="payoff-close-btn"
              onClick={onClose}
              aria-label="Close options simulator"
            >
              <X size={14} />
            </button>
          </div>
        </div>

        <div className="payoff-modal-body">
          {/* Interactive Controls Row */}
          <div className="payoff-controls-bar mono">
            <div className="payoff-ctrl-group">
              <span className="payoff-ctrl-lbl">SIDE</span>
              <div className="whale-side-pills">
                <button
                  type="button"
                  className={`whale-mini-tab${side === 'LONG' ? ' active' : ''}`}
                  onClick={() => {
                    setSide('LONG');
                    if (contract.ask > 0) setEntryInput(contract.ask.toFixed(2));
                  }}
                >
                  BUY
                </button>
                <button
                  type="button"
                  className={`whale-mini-tab${side === 'SHORT' ? ' active' : ''}`}
                  onClick={() => {
                    setSide('SHORT');
                    if (contract.bid > 0) setEntryInput(contract.bid.toFixed(2));
                  }}
                >
                  SELL
                </button>
              </div>
            </div>

            <div className="payoff-ctrl-group">
              <span className="payoff-ctrl-lbl">QTY</span>
              <div className="whale-side-pills">
                {[1, 5, 10, 25].map((q) => (
                  <button
                    key={q}
                    type="button"
                    className={`whale-mini-tab${contracts === q ? ' active' : ''}`}
                    onClick={() => setContracts(q)}
                  >
                    {q}×
                  </button>
                ))}
              </div>
            </div>

            <div className="payoff-ctrl-group">
              <label htmlFor="payoff-entry-input" className="payoff-ctrl-lbl">
                PREMIUM ($)
              </label>
              <input
                id="payoff-entry-input"
                type="number"
                step="0.05"
                min="0.01"
                className="payoff-num-input mono"
                value={entryInput}
                onChange={(e) => setEntryInput(e.target.value)}
              />
            </div>

            <div className="payoff-ctrl-group payoff-ctrl-group--slider">
              <label htmlFor="payoff-iv-slider" className="payoff-ctrl-lbl">
                IV SHOCK ({ivShiftPct >= 0 ? `+${ivShiftPct}%` : `${ivShiftPct}%`} →{' '}
                {heatmap.effectiveIvPct}%)
              </label>
              <input
                id="payoff-iv-slider"
                type="range"
                min={-40}
                max={60}
                step={5}
                value={ivShiftPct}
                onChange={(e) => setIvShiftPct(Number(e.target.value))}
                className="payoff-slider"
              />
            </div>

            <div className="payoff-ctrl-group">
              <span className="payoff-ctrl-lbl">CELLS</span>
              <div className="whale-side-pills">
                <button
                  type="button"
                  className={`whale-mini-tab${displayUnit === 'usd' ? ' active' : ''}`}
                  onClick={() => setDisplayUnit('usd')}
                >
                  $ P&amp;L
                </button>
                <button
                  type="button"
                  className={`whale-mini-tab${displayUnit === 'roi' ? ' active' : ''}`}
                  onClick={() => setDisplayUnit('roi')}
                >
                  % ROI
                </button>
              </div>
            </div>
          </div>

          {/* Risk & Live Greeks Strip */}
          <div className="payoff-kpi-grid mono">
            <div className="payoff-kpi-tile">
              <span className="gex-level-k">
                {side === 'LONG' ? 'DEBIT COST' : 'CREDIT REC'}
              </span>
              <strong>
                $
                {heatmap.costBasisUsd.toLocaleString('en-US', {
                  maximumFractionDigits: 0,
                })}
              </strong>
            </div>
            <div className="payoff-kpi-tile">
              <span className="gex-level-k">BREAKEVEN</span>
              <strong className="text-amber">${heatmap.breakeven.toFixed(2)}</strong>
            </div>
            <div className="payoff-kpi-tile">
              <span className="gex-level-k">PROB OF PROFIT</span>
              <strong
                className={heatmap.popPct >= 50 ? 'text-emerald' : 'text-crimson'}
              >
                {heatmap.popPct}%
              </strong>
            </div>
            <div className="payoff-kpi-tile">
              <span className="gex-level-k">MAX PROFIT</span>
              <strong className="text-emerald">{heatmap.maxProfitLabel}</strong>
            </div>
            <div className="payoff-kpi-tile">
              <span className="gex-level-k">MAX LOSS</span>
              <strong className="text-crimson">{heatmap.maxLossLabel}</strong>
            </div>
            <div className="payoff-kpi-tile">
              <span className="gex-level-k">GREEKS (Δ · Γ · Θ · ν)</span>
              <strong className="payoff-greeks-line">
                Δ{heatmap.greeks.delta.toFixed(2)} · Γ
                {heatmap.greeks.gamma.toFixed(3)} · Θ
                {heatmap.greeks.thetaDaily.toFixed(2)} · ν
                {heatmap.greeks.vegaPer1Pct.toFixed(2)}
              </strong>
            </div>
          </div>

          {/* Color-Coded Price x Date P&L Heatmap */}
          <div className="payoff-table-scroll">
            <table className="payoff-heatmap-table mono">
              <thead>
                <tr>
                  <th>{contract.ticker} PRICE</th>
                  <th>MOVE</th>
                  {heatmap.dateLabels.map((lbl) => (
                    <th key={lbl}>{lbl}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {heatmap.rows.map((row) => (
                  <tr
                    key={row.price}
                    className={
                      row.isSpotRow
                        ? 'payoff-row-spot'
                        : row.isStrikeRow
                          ? 'payoff-row-strike'
                          : ''
                    }
                  >
                    <td className="payoff-price-cell">
                      <strong>${row.price.toFixed(2)}</strong>
                      {row.isSpotRow && <span className="gex-tag gex-tag--spot">SPOT</span>}
                      {row.isStrikeRow && !row.isSpotRow && (
                        <span className="gex-tag gex-tag--violet">K</span>
                      )}
                    </td>
                    <td
                      className={
                        row.pctMove > 0
                          ? 'text-emerald'
                          : row.pctMove < 0
                            ? 'text-crimson'
                            : 'text-muted'
                      }
                    >
                      {row.pctMove >= 0 ? `+${row.pctMove}%` : `${row.pctMove}%`}
                    </td>
                    {row.cells.map((cell, ci) => {
                      const intensity = Math.min(
                        0.48,
                        Math.max(0.06, (Math.abs(cell.pnlUsd) / maxAbsPnl) * 0.45),
                      );
                      const bg =
                        cell.pnlUsd > 0
                          ? `rgba(16, 185, 129, ${intensity.toFixed(2)})`
                          : cell.pnlUsd < 0
                            ? `rgba(244, 63, 94, ${intensity.toFixed(2)})`
                            : 'transparent';
                      return (
                        <td
                          key={`${row.price}-${ci}`}
                          className={`payoff-heat-cell ${
                            cell.pnlUsd > 0
                              ? 'text-emerald'
                              : cell.pnlUsd < 0
                                ? 'text-crimson'
                                : 'text-muted'
                          }`}
                          style={{ backgroundColor: bg }}
                          title={`Est option price $${cell.optionPrice.toFixed(2)} | P&L ${fmtSignedUsd(cell.pnlUsd)} (${cell.roiPct}%)`}
                        >
                          {displayUnit === 'usd'
                            ? fmtSignedUsd(cell.pnlUsd)
                            : `${cell.roiPct >= 0 ? '+' : ''}${cell.roiPct}%`}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="daily-bread-disclaimer mono">
            Black-Scholes theoretical model ({contract.bid > 0 ? `Bid $${contract.bid.toFixed(2)} / Ask $${contract.ask.toFixed(2)}` : `Mark $${contract.mark.toFixed(2)}`}, r = 4.5%). Real fills depend on spreads, dividends, and volatility skew.
          </div>
        </div>
      </div>
    </div>
  );
}

export const OptionsPayoffModal = memo(OptionsPayoffModalComponent);
