import { useMemo, useState } from 'react';
import type { TickerMeta } from '../data/tickers';

interface ValuationCalculatorPanelProps {
  meta: TickerMeta;
  livePrice: number | null;
  referencePrice: number | null;
  priceInput: string;
  onPriceInputChange: (value: string) => void;
}

function formatValuation(billions: number): { headline: string; exact: string } {
  if (!Number.isFinite(billions) || billions <= 0) {
    return { headline: '$0.0B', exact: 'Enter share price' };
  }
  if (billions >= 1000) {
    return {
      headline: `$${(billions / 1000).toFixed(2)}T`,
      exact: `$${billions.toLocaleString('en-US', { maximumFractionDigits: 1 })}B exact`,
    };
  }
  return {
    headline: `$${billions.toFixed(1)}B`,
    exact: `$${(billions / 1000).toFixed(3)}T implied`,
  };
}

function formatSignedCurrency(val: number): string {
  const abs = Math.abs(val);
  const formatted = abs.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  if (val > 0.004) return `+$${formatted}`;
  if (val < -0.004) return `-$${formatted}`;
  return '$0.00';
}

function formatSignedPct(pct: number): string {
  if (pct > 0.004) return `+${pct.toFixed(2)}%`;
  if (pct < -0.004) return `${pct.toFixed(2)}%`;
  return '0.00%';
}

export function ValuationCalculatorPanel({
  meta,
  livePrice,
  referencePrice,
  priceInput,
  onPriceInputChange,
}: ValuationCalculatorPanelProps) {
  const [allocationInput, setAllocationInput] = useState<string>('1000');
  const [customEntry, setCustomEntry] = useState<{ ticker: string; value: string } | null>(
    null,
  );

  const defaultEntryPrice = livePrice ?? referencePrice ?? 100;
  const entryInput =
    customEntry && customEntry.ticker === meta.ticker
      ? customEntry.value
      : defaultEntryPrice.toFixed(2);

  const parsedPrice = Math.max(0, Number.parseFloat(priceInput) || 0);
  const parsedAllocation = Math.max(0, Number.parseFloat(allocationInput) || 0);
  const parsedEntry = Math.max(0, Number.parseFloat(entryInput) || 0);

  const anchorPrice = referencePrice ?? livePrice ?? parsedPrice;
  const deltaDollar = anchorPrice > 0 ? parsedPrice - anchorPrice : 0;
  const deltaPct = anchorPrice > 0 ? (deltaDollar / anchorPrice) * 100 : 0;

  const deltaTone =
    deltaDollar > 0.005
      ? 'text-emerald'
      : deltaDollar < -0.005
        ? 'text-crimson'
        : 'text-amber';

  const impliedCapBillions =
    meta.dilutedSharesBillions !== null
      ? parsedPrice * meta.dilutedSharesBillions
      : null;
  const valuationFormatted =
    impliedCapBillions !== null ? formatValuation(impliedCapBillions) : null;

  const presets = useMemo(() => {
    if (meta.fixedPresets) {
      return meta.fixedPresets.map((p) => ({
        label: `$${p}`,
        price: p,
      }));
    }
    const base = livePrice ?? referencePrice ?? 100;
    const multipliers = [
      { label: '-15%', mult: 0.85 },
      { label: '-8%', mult: 0.92 },
      { label: 'LIVE', mult: 1.0 },
      { label: '+8%', mult: 1.08 },
      { label: '+15%', mult: 1.15 },
      { label: '+25%', mult: 1.25 },
    ];
    return multipliers.map((m) => ({
      label: m.label,
      price: Number((base * m.mult).toFixed(2)),
    }));
  }, [meta.fixedPresets, livePrice, referencePrice]);

  const shareCount = parsedEntry > 0 ? parsedAllocation / parsedEntry : 0;
  const targetValue = shareCount * parsedPrice;
  const pnlDollar = targetValue - parsedAllocation;
  const pnlPct = parsedAllocation > 0 ? (pnlDollar / parsedAllocation) * 100 : 0;

  const pnlTone =
    pnlDollar > 0.005
      ? 'text-emerald'
      : pnlDollar < -0.005
        ? 'text-crimson'
        : '';

  return (
    <section
      className="terminal-card"
      aria-label={`${meta.ticker} Valuation and Position P&L Calculator`}
    >
      <div className="panel-header">
        <div className="panel-title-group">
          <h2 className="panel-title">VALUATION &amp; P&amp;L CALC</h2>
        </div>
        <span className="panel-badge">
          {meta.dilutedSharesBillions
            ? `${meta.dilutedSharesBillions}B SH`
            : meta.ticker}
        </span>
      </div>

      <div className="panel-body">
        <div className="calc-input-group">
          <div className="calc-label-row">
            <label htmlFor="target-price-input" className="calc-label">
              Target {meta.ticker} Share Price
            </label>
            {livePrice !== null && Math.abs(parsedPrice - livePrice) > 0.02 && (
              <button
                type="button"
                className="calc-reset-link"
                onClick={() => onPriceInputChange(livePrice.toFixed(2))}
              >
                Sync Live (${livePrice.toFixed(2)})
              </button>
            )}
          </div>

          <div className="currency-input-wrap">
            <span className="currency-prefix" aria-hidden="true">
              $
            </span>
            <input
              id="target-price-input"
              type="number"
              inputMode="decimal"
              min="0"
              step="0.50"
              className="currency-input"
              value={priceInput}
              onChange={(e) => onPriceInputChange(e.target.value)}
            />
          </div>

          <div className="preset-pills-row" role="group" aria-label="Quick price presets">
            {presets.map((preset) => {
              const isSelected = Math.abs(parsedPrice - preset.price) < 0.05;
              const activeClass = !isSelected
                ? ''
                : preset.price > anchorPrice + 0.01
                  ? ' active-bull'
                  : preset.price < anchorPrice - 0.01
                    ? ' active-bear'
                    : ' active-ipo';

              return (
                <button
                  key={preset.label}
                  type="button"
                  className={`preset-pill${activeClass}`}
                  onClick={() => onPriceInputChange(preset.price.toFixed(2))}
                  title={`Set target to $${preset.price.toFixed(2)}`}
                >
                  {preset.label}
                </button>
              );
            })}
          </div>
        </div>

        <div className="calc-outputs-grid">
          <div className="calc-stat-box">
            <span className="calc-stat-label">
              {valuationFormatted ? 'Implied Mkt Cap' : 'Target Level'}
            </span>
            <span className="calc-stat-primary">
              {valuationFormatted
                ? valuationFormatted.headline
                : `$${parsedPrice.toFixed(2)}`}
            </span>
            <span className="calc-stat-sub">
              {valuationFormatted
                ? valuationFormatted.exact
                : `${meta.ticker} scenario target`}
            </span>
          </div>

          <div className="calc-stat-box">
            <span className="calc-stat-label">vs. {meta.referenceLabel}</span>
            <span className={`calc-stat-primary ${deltaTone}`}>
              {formatSignedPct(deltaPct)}
            </span>
            <span className="calc-stat-sub">
              {formatSignedCurrency(deltaDollar)} / sh
            </span>
          </div>
        </div>

        {/* Position Simulator */}
        <div className="position-divider">
          <div className="position-header">
            <span className="position-title">My Entry / Target P&amp;L</span>
            <span className="position-target-note">
              Target: ${parsedPrice.toFixed(2)}
            </span>
          </div>

          <div className="position-inputs-row">
            <div className="position-field">
              <label htmlFor="pos-alloc-input" className="position-field-label">
                Allocation ($)
              </label>
              <div className="currency-input-wrap currency-input-wrap--compact">
                <span className="currency-prefix" aria-hidden="true">
                  $
                </span>
                <input
                  id="pos-alloc-input"
                  type="number"
                  inputMode="decimal"
                  min="0"
                  step="100"
                  className="currency-input currency-input--compact"
                  value={allocationInput}
                  onChange={(e) => setAllocationInput(e.target.value)}
                />
              </div>
            </div>

            <div className="position-field">
              <label htmlFor="pos-entry-input" className="position-field-label">
                Entry Price ($)
              </label>
              <div className="currency-input-wrap currency-input-wrap--compact">
                <span className="currency-prefix" aria-hidden="true">
                  $
                </span>
                <input
                  id="pos-entry-input"
                  type="number"
                  inputMode="decimal"
                  min="0"
                  step="0.50"
                  className="currency-input currency-input--compact"
                  value={entryInput}
                  onChange={(e) =>
                    setCustomEntry({ ticker: meta.ticker, value: e.target.value })
                  }
                />
              </div>
            </div>
          </div>

          <div className="position-results-strip" aria-live="polite">
            <div className="pos-metric">
              <span className="pos-metric-label">Shares</span>
              <span className="pos-metric-val">{shareCount.toFixed(2)}</span>
            </div>

            <div className="pos-metric">
              <span className="pos-metric-label">Value</span>
              <span className="pos-metric-val">
                $
                {targetValue.toLocaleString('en-US', {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}
              </span>
            </div>

            <div className="pos-metric">
              <span className="pos-metric-label">Est. P&amp;L</span>
              <span
                className={`pos-metric-val ${pnlTone}`}
                title={`${formatSignedCurrency(pnlDollar)} (${formatSignedPct(pnlPct)})`}
              >
                {formatSignedCurrency(pnlDollar)}
              </span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
