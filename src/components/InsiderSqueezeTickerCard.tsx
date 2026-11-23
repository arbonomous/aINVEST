import { memo, useEffect, useMemo, useState } from 'react';
import { ArrowRight, Flame, Landmark, Sparkles } from 'lucide-react';
import type { TickerMeta } from '../data/tickers';
import {
  fetchInsidersBundle,
  getTickerInsidersDigest,
  type InsidersBundle,
} from '../lib/insidersEngine';

interface InsiderSqueezeTickerCardProps {
  meta: TickerMeta;
  onOpenInsidersForTicker: (ticker: string) => void;
}

function fmtUsd(n: number): string {
  const abs = Math.abs(n);
  if (abs >= 1e9) return `$${(abs / 1e9).toFixed(2)}B`;
  if (abs >= 1e6) return `$${(abs / 1e6).toFixed(2)}M`;
  if (abs >= 1e3) return `$${(abs / 1e3).toFixed(0)}K`;
  return `$${abs.toFixed(0)}`;
}

function InsiderSqueezeTickerCardComponent({
  meta,
  onOpenInsidersForTicker,
}: InsiderSqueezeTickerCardProps) {
  const [bundle, setBundle] = useState<InsidersBundle | null>(null);

  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    void fetchInsidersBundle(false, controller.signal).then((data) => {
      if (active && !controller.signal.aborted) {
        setBundle(data);
      }
    });
    return () => {
      active = false;
      controller.abort();
    };
  }, []);

  const digest = useMemo(
    () => getTickerInsidersDigest(bundle, meta.ticker),
    [bundle, meta.ticker],
  );

  const hasAnySignal =
    digest.congressTrades.length > 0 ||
    digest.form4Trades.length > 0 ||
    digest.squeeze !== null;

  return (
    <section
      className="terminal-card"
      aria-label={`Congress, Insider Form 4 and Short Squeeze signals for ${meta.ticker}`}
    >
      <div className="panel-header">
        <div className="panel-title-group">
          <Landmark size={13} className="text-amber" aria-hidden="true" />
          <h2 className="panel-title">INSIDERS &amp; SQUEEZE</h2>
        </div>
        {digest.squeeze ? (
          <span
            className={`panel-badge mono ${
              digest.squeeze.regime === 'EXTREME'
                ? 'panel-badge--crimson'
                : digest.squeeze.regime === 'HIGH'
                  ? 'panel-badge--amber'
                  : 'panel-badge--emerald'
            }`}
          >
            SQZ {digest.squeeze.squeezeScore}/100
          </span>
        ) : (
          <span className="panel-badge mono">{meta.ticker}</span>
        )}
      </div>

      <div className="panel-body whale-term-body">
        {!bundle ? (
          <div className="ta-loading-state mono">
            Checking Congress, SEC Form 4 &amp; FINRA Short Volume for {meta.ticker}…
          </div>
        ) : !hasAnySignal ? (
          <div className="ta-loading-state mono">
            No recent Congress, Form 4, or elevated FINRA short-squeeze alerts on {meta.ticker}.
          </div>
        ) : (
          <>
            {/* Cluster Buy Alert Banner if active */}
            {digest.clusterBuy && (
              <div className="insider-term-cluster mono">
                <Sparkles size={11} className="text-emerald" />
                <span>
                  CLUSTER BUY: <strong>{digest.clusterBuy.insiderCount} INSIDERS</strong>{' '}
                  bought <strong>{fmtUsd(digest.clusterBuy.totalBuyUsd)}</strong>
                </span>
              </div>
            )}

            {/* FINRA Short Vol % + SEC FTD Strip */}
            {digest.squeeze && (
              <div className="whale-term-metrics mono">
                <div className="whale-term-stat-box">
                  <span className="bread-lvl-label">FINRA SHORT VOL</span>
                  <span
                    className={`bread-lvl-val ${
                      digest.squeeze.shortVolPct >= 55
                        ? 'text-crimson'
                        : digest.squeeze.shortVolPct >= 50
                          ? 'text-amber'
                          : ''
                    }`}
                  >
                    {digest.squeeze.shortVolPct.toFixed(1)}%
                  </span>
                </div>
                <div className="whale-term-stat-box">
                  <span className="bread-lvl-label">SEC FTD PRESSURE</span>
                  <span className="bread-lvl-val gex-violet">
                    {digest.squeeze.ftdUsd > 0 ? fmtUsd(digest.squeeze.ftdUsd) : '—'}
                  </span>
                </div>
              </div>
            )}

            {/* Recent Congress Disclosures on this Ticker */}
            {digest.congressTrades.length > 0 && (
              <div className="whale-term-contracts mono">
                <div className="whale-term-subhead">
                  <span>CONGRESS DISCLOSURES</span>
                  <span className="text-muted">STOCK ACT</span>
                </div>
                {digest.congressTrades.slice(0, 2).map((c) => (
                  <div key={c.id} className="insider-term-row">
                    <span
                      className={`whale-cp-badge ${
                        c.action === 'BUY'
                          ? 'whale-cp-badge--bull'
                          : 'whale-cp-badge--bear'
                      }`}
                    >
                      {c.action}
                    </span>
                    <span className="insider-term-who">
                      {c.politician} ({c.party}-{c.state})
                    </span>
                    <span className="text-amber">
                      {fmtUsd((c.amountMinUsd + c.amountMaxUsd) / 2)}
                    </span>
                  </div>
                ))}
              </div>
            )}

            {/* Recent SEC Form 4 Filings on this Ticker */}
            {digest.form4Trades.length > 0 && (
              <div className="whale-term-contracts mono">
                <div className="whale-term-subhead">
                  <span>SEC FORM 4 FLOW</span>
                  <span className="text-muted">OPEN MKT</span>
                </div>
                {digest.form4Trades.slice(0, 2).map((f) => (
                  <div key={f.id} className="insider-term-row">
                    <span
                      className={`whale-cp-badge ${
                        f.action === 'BUY'
                          ? 'whale-cp-badge--bull'
                          : 'whale-cp-badge--bear'
                      }`}
                    >
                      {f.action}
                    </span>
                    <span className="insider-term-who">
                      {f.insiderName} · {f.role}
                    </span>
                    <span className={f.action === 'BUY' ? 'text-emerald' : 'text-crimson'}>
                      {fmtUsd(f.valueUsd)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        <button
          type="button"
          className="insider-term-open-btn mono"
          onClick={() => onOpenInsidersForTicker(meta.ticker)}
        >
          <Flame size={11} />
          <span>OPEN {meta.ticker} IN INSIDERS DESK</span>
          <ArrowRight size={11} />
        </button>
      </div>
    </section>
  );
}

export const InsiderSqueezeTickerCard = memo(InsiderSqueezeTickerCardComponent);
