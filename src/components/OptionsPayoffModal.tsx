import { memo, useEffect, useMemo, useState } from 'react';
import { Calculator, Camera, Check, Copy, Layers, X } from 'lucide-react';
import {
  STRATEGY_PRESETS,
  buildMultiLegPayoffHeatmap,
  buildStrategyLegs,
  type OptionLeg,
  type StrategyPresetId,
} from '../lib/optionsPricing';
import { exportOptionsPayoffSnapshotCard } from '../lib/snapshotCard';
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
  const [preset, setPreset] = useState<StrategyPresetId>('SINGLE');
  const [legs, setLegs] = useState<OptionLeg[]>(() =>
    buildStrategyLegs(contract, 'SINGLE'),
  );
  const [contracts, setContracts] = useState<number>(1);
  const [ivShiftPct, setIvShiftPct] = useState<number>(0);
  const [displayUnit, setDisplayUnit] = useState<'usd' | 'roi'>('usd');
  const [copiedCard, setCopiedCard] = useState(false);
  const [savingPng, setSavingPng] = useState(false);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  const handleSelectPreset = (nextPreset: StrategyPresetId) => {
    setPreset(nextPreset);
    setLegs(buildStrategyLegs(contract, nextPreset));
  };

  const handleUpdateLeg = (
    id: string,
    patch: Partial<Pick<OptionLeg, 'side' | 'strike' | 'entryPrice'>>,
  ) => {
    setLegs((prev) =>
      prev.map((l) => (l.id === id ? { ...l, ...patch } : l)),
    );
  };

  const heatmap = useMemo(
    () =>
      buildMultiLegPayoffHeatmap({
        legs,
        spot: contract.spotPrice,
        dte: contract.dte,
        contracts,
        ivShiftPct,
      }),
    [legs, contract.spotPrice, contract.dte, contracts, ivShiftPct],
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

  const strategyLabel =
    STRATEGY_PRESETS.find((p) => p.id === preset)?.label ?? 'Options Strategy';

  const legsSummary = useMemo(
    () =>
      legs
        .map(
          (l) =>
            `${l.side === 'LONG' ? '+' : '-'}${l.ratio} $${l.strike}${
              l.type === 'CALL' ? 'C' : 'P'
            } @ $${l.entryPrice.toFixed(2)}`,
        )
        .join('  |  '),
    [legs],
  );

  const handleCopyCard = async () => {
    const beStr =
      heatmap.breakevens.length > 0
        ? heatmap.breakevens.map((b) => `$${b.toFixed(2)}`).join(' / ')
        : '—';
    const text = [
      `🐋 aINVEST ${strategyLabel.toUpperCase()} — ${contract.ticker} (${contract.expiration.slice(5)} • ${contract.dte}DTE)`,
      `Legs (${contracts}×): ${legsSummary}`,
      `${heatmap.isNetCredit ? 'Net Credit' : 'Net Debit'}: $${Math.abs(heatmap.netCostUsd).toLocaleString('en-US')} | Breakeven: ${beStr} | POP: ${heatmap.popPct}%`,
      `Max Profit: ${heatmap.maxProfitLabel} | Max Loss: ${heatmap.maxLossLabel}`,
      `Greeks (IV ${heatmap.effectiveIvPct}%): Δ ${heatmap.greeks.delta.toFixed(2)} | Γ ${heatmap.greeks.gamma.toFixed(4)} | Θ ${heatmap.greeks.thetaDaily.toFixed(2)}/d | ν ${heatmap.greeks.vegaPer1Pct.toFixed(2)}`,
    ].join('\n');

    try {
      await navigator.clipboard.writeText(text);
      setCopiedCard(true);
      onCopySuccess?.(`Copied ${contract.ticker} ${strategyLabel} trade card`);
      window.setTimeout(() => setCopiedCard(false), 1800);
    } catch {
      onCopySuccess?.('Clipboard blocked — copy details manually');
    }
  };

  const handleExportPng = async () => {
    if (savingPng) return;
    setSavingPng(true);
    try {
      const res = await exportOptionsPayoffSnapshotCard({
        ticker: contract.ticker,
        strategyLabel: `${strategyLabel.toUpperCase()} (${contract.expiration.slice(5)})`,
        legsSummary,
        spot: contract.spotPrice,
        heatmap,
      });
      if (res === 'copied') {
        onCopySuccess?.(`Copied & saved ${contract.ticker} PNG card`);
      } else if (res === 'downloaded') {
        onCopySuccess?.(`Downloaded ${contract.ticker} PNG card`);
      } else {
        onCopySuccess?.('Could not generate PNG snapshot');
      }
    } finally {
      setSavingPng(false);
    }
  };

  return (
    <div
      className="explorer-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label={`Multi-Leg Options P&L Simulator for ${contract.ticker}`}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="payoff-modal-card">
        <div className="panel-header payoff-modal-head">
          <div className="panel-title-group">
            <Calculator size={14} className="text-emerald" aria-hidden="true" />
            <h2 className="panel-title">
              {contract.ticker} — OPTIONS STRATEGY &amp; P&amp;L SIMULATOR
            </h2>
            <span className="whale-cp-badge whale-cp-badge--bull mono">
              {contract.expiration.slice(5)} • {contract.dte}DTE
            </span>
          </div>

          <div className="payoff-head-actions">
            <button
              type="button"
              className="dispatch-refresh-btn mono"
              onClick={() => void handleExportPng()}
              disabled={savingPng}
              title="Download / copy shareable PNG snapshot card for X or Discord"
            >
              <Camera size={11} />
              <span>{savingPng ? 'RENDERING…' : 'PNG CARD'}</span>
            </button>
            <button
              type="button"
              className="dispatch-refresh-btn mono"
              onClick={() => void handleCopyCard()}
            >
              {copiedCard ? <Check size={11} /> : <Copy size={11} />}
              <span>{copiedCard ? 'COPIED' : 'COPY TEXT'}</span>
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
          {/* Multi-Leg Strategy Preset Strip */}
          <div className="payoff-strategy-bar mono" role="tablist" aria-label="Options strategy preset">
            <span className="payoff-strat-lbl">
              <Layers size={11} className="text-emerald" />
              <span>STRATEGY:</span>
            </span>
            {STRATEGY_PRESETS.map((p) => (
              <button
                key={p.id}
                type="button"
                role="tab"
                aria-selected={preset === p.id}
                className={`whale-mini-tab${preset === p.id ? ' active' : ''}`}
                onClick={() => handleSelectPreset(p.id)}
              >
                {p.label}
              </button>
            ))}
          </div>

          {/* Interactive Leg Editor */}
          <div className="payoff-legs-grid mono">
            {legs.map((leg) => (
              <div key={leg.id} className="payoff-leg-chip">
                <button
                  type="button"
                  className={`payoff-leg-side ${
                    leg.side === 'LONG' ? 'payoff-leg-side--buy' : 'payoff-leg-side--sell'
                  }`}
                  onClick={() =>
                    handleUpdateLeg(leg.id, {
                      side: leg.side === 'LONG' ? 'SHORT' : 'LONG',
                    })
                  }
                  title="Click to toggle BUY / SELL"
                >
                  {leg.side === 'LONG' ? 'BUY' : 'SELL'}
                </button>
                <span
                  className={`whale-cp-badge ${
                    leg.type === 'CALL'
                      ? 'whale-cp-badge--bull'
                      : 'whale-cp-badge--bear'
                  }`}
                >
                  {leg.type}
                </span>
                <label className="payoff-leg-field">
                  <span>K $</span>
                  <input
                    type="number"
                    step="0.5"
                    min="0.5"
                    className="payoff-leg-input mono"
                    value={leg.strike}
                    onChange={(e) => {
                      const v = Number.parseFloat(e.target.value);
                      if (Number.isFinite(v) && v > 0) {
                        handleUpdateLeg(leg.id, { strike: v });
                      }
                    }}
                    aria-label={`${leg.type} strike`}
                  />
                </label>
                <label className="payoff-leg-field">
                  <span>@ $</span>
                  <input
                    type="number"
                    step="0.05"
                    min="0.01"
                    className="payoff-leg-input mono"
                    value={leg.entryPrice}
                    onChange={(e) => {
                      const v = Number.parseFloat(e.target.value);
                      if (Number.isFinite(v) && v > 0) {
                        handleUpdateLeg(leg.id, { entryPrice: v });
                      }
                    }}
                    aria-label={`${leg.type} premium`}
                  />
                </label>
              </div>
            ))}
          </div>

          {/* Interactive Controls Row */}
          <div className="payoff-controls-bar mono">
            <div className="payoff-ctrl-group">
              <span className="payoff-ctrl-lbl">SPREAD QTY</span>
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
                {heatmap.isNetCredit ? 'NET CREDIT' : 'NET DEBIT'}
              </span>
              <strong className={heatmap.isNetCredit ? 'text-emerald' : ''}>
                $
                {Math.abs(heatmap.netCostUsd).toLocaleString('en-US', {
                  maximumFractionDigits: 0,
                })}
              </strong>
            </div>
            <div className="payoff-kpi-tile">
              <span className="gex-level-k">BREAKEVEN(S)</span>
              <strong className="text-amber">
                {heatmap.breakevens.length > 0
                  ? heatmap.breakevens.map((b) => `$${b.toFixed(2)}`).join(' / ')
                  : '—'}
              </strong>
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
              <span className="gex-level-k">NET GREEKS (Δ · Γ · Θ · ν)</span>
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
                          title={`Net strategy mark $${cell.optionPrice.toFixed(2)} | P&L ${fmtSignedUsd(cell.pnlUsd)} (${cell.roiPct}%)`}
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
            Black-Scholes multi-leg model (r = 4.5%). Secondary wing legs default to theoretical fair value and can be edited inline above.
          </div>
        </div>
      </div>
    </div>
  );
}

export const OptionsPayoffModal = memo(OptionsPayoffModalComponent);
