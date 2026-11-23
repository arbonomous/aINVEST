import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Activity,
  Building2,
  Camera,
  ExternalLink,
  Flame,
  Landmark,
  RefreshCw,
  Search,
  Sparkles,
  Star,
  Users,
  X,
} from 'lucide-react';
import {
  computePoliticianLeaderboard,
  detectClusterBuys,
  fetchInsidersBundle,
  type InsidersBundle,
} from '../lib/insidersEngine';
import {
  exportClusterBuySnapshotCard,
  exportCongressSnapshotCard,
  exportSqueezeSnapshotCard,
} from '../lib/snapshotCard';

type InsidersTab = 'congress' | 'form4' | 'squeeze';
type CongressFilter = 'ALL' | 'BUY' | 'SELL' | 'D' | 'R' | 'HOUSE' | 'SENATE' | 'LARGE';
type Form4Filter = 'ALL' | 'BUY' | 'SELL' | 'CSUITE' | 'CLUSTER' | 'LARGE';
type SqueezeFilter = 'ALL' | 'EXTREME' | 'HIGH' | 'SHORT50' | 'FTD1M';

interface InsidersDeskProps {
  pinnedTickers?: string[];
  initialSearch?: string;
  onSelectTicker: (ticker: string) => void;
  onNotify?: (message: string) => void;
}

function fmtUsd(n: number): string {
  const abs = Math.abs(n);
  if (abs >= 1e9) return `$${(abs / 1e9).toFixed(2)}B`;
  if (abs >= 1e6) return `$${(abs / 1e6).toFixed(2)}M`;
  if (abs >= 1e3) return `$${(abs / 1e3).toFixed(1)}K`;
  return `$${abs.toFixed(0)}`;
}

function fmtStamp(iso: string): string {
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return 'Recently';
  return new Date(ms).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

export function InsidersDesk({
  pinnedTickers = [],
  initialSearch = '',
  onSelectTicker,
  onNotify,
}: InsidersDeskProps) {
  const [bundle, setBundle] = useState<InsidersBundle | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState<InsidersTab>('congress');
  const [searchQuery, setSearchQuery] = useState<string>(initialSearch);
  const [watchlistOnly, setWatchlistOnly] = useState<boolean>(false);
  const [selectedPolitician, setSelectedPolitician] = useState<string>('');
  const [congressFilter, setCongressFilter] = useState<CongressFilter>('ALL');
  const [form4Filter, setForm4Filter] = useState<Form4Filter>('ALL');
  const [squeezeFilter, setSqueezeFilter] = useState<SqueezeFilter>('ALL');

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

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      const data = await fetchInsidersBundle(true);
      setBundle(data);
      onNotify?.('Refreshed SEC Form 4, Congress & FINRA/FTD feeds');
    } finally {
      setRefreshing(false);
    }
  }, [onNotify]);

  const pinnedSet = useMemo(() => new Set(pinnedTickers), [pinnedTickers]);
  const queryLower = searchQuery.trim().toLowerCase();

  const clusterBuys = useMemo(
    () => (bundle ? detectClusterBuys(bundle.form4) : []),
    [bundle],
  );
  const clusterTickerSet = useMemo(
    () => new Set(clusterBuys.map((c) => c.ticker)),
    [clusterBuys],
  );

  const politicianLeaders = useMemo(
    () => (bundle ? computePoliticianLeaderboard(bundle.congress) : []),
    [bundle],
  );

  const filteredCongress = useMemo(() => {
    const list = bundle?.congress ?? [];
    return list.filter((t) => {
      if (watchlistOnly && pinnedSet.size > 0 && !pinnedSet.has(t.ticker)) {
        return false;
      }
      if (selectedPolitician && t.politician !== selectedPolitician) {
        return false;
      }
      if (congressFilter === 'BUY' && t.action !== 'BUY') return false;
      if (congressFilter === 'SELL' && t.action !== 'SELL') return false;
      if (congressFilter === 'D' && t.party !== 'D') return false;
      if (congressFilter === 'R' && t.party !== 'R') return false;
      if (congressFilter === 'HOUSE' && t.chamber !== 'House') return false;
      if (congressFilter === 'SENATE' && t.chamber !== 'Senate') return false;
      if (congressFilter === 'LARGE' && t.amountMinUsd < 100_000) return false;

      if (queryLower) {
        const hay = `${t.ticker} ${t.assetName} ${t.politician} ${t.state} ${t.committees.join(' ')}`.toLowerCase();
        if (!hay.includes(queryLower)) return false;
      }
      return true;
    });
  }, [bundle, watchlistOnly, pinnedSet, selectedPolitician, congressFilter, queryLower]);

  const filteredForm4 = useMemo(() => {
    const list = bundle?.form4 ?? [];
    return list.filter((t) => {
      if (watchlistOnly && pinnedSet.size > 0 && !pinnedSet.has(t.ticker)) {
        return false;
      }
      if (form4Filter === 'BUY' && t.action !== 'BUY') return false;
      if (form4Filter === 'SELL' && t.action !== 'SELL') return false;
      if (form4Filter === 'CSUITE' && !t.isCsuite) return false;
      if (form4Filter === 'CLUSTER' && !clusterTickerSet.has(t.ticker)) {
        return false;
      }
      if (form4Filter === 'LARGE' && t.valueUsd < 500_000) return false;

      if (queryLower) {
        const hay = `${t.ticker} ${t.companyName} ${t.insiderName} ${t.role}`.toLowerCase();
        if (!hay.includes(queryLower)) return false;
      }
      return true;
    });
  }, [bundle, watchlistOnly, pinnedSet, form4Filter, clusterTickerSet, queryLower]);

  const filteredSqueeze = useMemo(() => {
    const list = bundle?.squeeze ?? [];
    return list.filter((r) => {
      if (watchlistOnly && pinnedSet.size > 0 && !pinnedSet.has(r.ticker)) {
        return false;
      }
      if (squeezeFilter === 'EXTREME' && r.squeezeScore < 80) return false;
      if (squeezeFilter === 'HIGH' && r.squeezeScore < 65) return false;
      if (squeezeFilter === 'SHORT50' && r.shortVolPct < 50) return false;
      if (squeezeFilter === 'FTD1M' && r.ftdUsd < 1_000_000) return false;

      if (queryLower) {
        const hay = `${r.ticker} ${r.companyName} ${r.signals.join(' ')}`.toLowerCase();
        if (!hay.includes(queryLower)) return false;
      }
      return true;
    });
  }, [bundle, watchlistOnly, pinnedSet, squeezeFilter, queryLower]);

  const congressStats = useMemo(() => {
    let buyVol = 0;
    let sellVol = 0;
    let buys = 0;
    let sells = 0;
    for (const t of filteredCongress) {
      const mid = (t.amountMinUsd + t.amountMaxUsd) / 2;
      if (t.action === 'BUY') {
        buyVol += mid;
        buys += 1;
      } else {
        sellVol += mid;
        sells += 1;
      }
    }
    return { buyVol, sellVol, buys, sells };
  }, [filteredCongress]);

  return (
    <div className="insiders-shell">
      {/* 1. Institutional Masthead + Official Data Freshness Strip */}
      <section className="whale-card" aria-label="Congress, C-Suite Insider Flow & Short Squeeze Desk">
        <div className="whale-hero-head">
          <div className="whale-title-block">
            <div className="daily-bread-eyebrow-row">
              <span className="insiders-badge mono">
                <Landmark size={11} />
                <span>INSIDERS &amp; SQUEEZE</span>
              </span>
              <span className="daily-bread-subtag mono">
                CONGRESS STOCK ACT • SEC EDGAR FORM 4 • FINRA SHORT VOL &amp; FTD
              </span>
            </div>
            <h1 className="daily-bread-hero-title">
              Congressional Trades, C-Suite Cluster Buys &amp; Short Squeeze Radar
            </h1>
          </div>

          <div className="whale-tide-readout mono">
            <button
              type="button"
              className="dispatch-refresh-btn mono"
              onClick={() => void handleRefresh()}
              disabled={refreshing}
            >
              <RefreshCw size={11} className={refreshing ? 'spin-icon' : ''} />
              <span>REFRESH FEEDS</span>
            </button>
          </div>
        </div>

        {/* Per-Pillar Freshness & Source Mode Badges */}
        {bundle && (
          <div className="insiders-meta-strip mono">
            {(
              [
                ['CONGRESS', bundle.meta.congress],
                ['SEC FORM 4', bundle.meta.form4],
                ['FINRA / FTD', bundle.meta.squeeze],
              ] as const
            ).map(([label, meta]) => (
              <div key={label} className="insiders-meta-chip">
                <span className="text-muted">{label}:</span>
                <span
                  className={`insiders-mode-pill ${
                    meta.mode === 'LIVE OFFICIAL'
                      ? 'insiders-mode-pill--live'
                      : 'insiders-mode-pill--snap'
                  }`}
                >
                  {meta.mode}
                </span>
                <span className="text-muted">{fmtStamp(meta.syncedAt)}</span>
              </div>
            ))}
          </div>
        )}

        {/* Primary Pillar Tabs + Universal Search + Watchlist Toggle */}
        <div className="insiders-nav-toolbar">
          <div className="insiders-pillar-tabs mono" role="tablist" aria-label="Insiders intelligence pillars">
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'congress'}
              className={`insiders-pillar-btn${activeTab === 'congress' ? ' active' : ''}`}
              onClick={() => setActiveTab('congress')}
            >
              <Landmark size={12} />
              <span>CONGRESS ({bundle?.congress.length ?? 0})</span>
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'form4'}
              className={`insiders-pillar-btn${activeTab === 'form4' ? ' active' : ''}`}
              onClick={() => setActiveTab('form4')}
            >
              <Building2 size={12} />
              <span>
                C-SUITE FORM 4 ({bundle?.form4.length ?? 0})
                {clusterBuys.length > 0 ? ` • ${clusterBuys.length} CLUSTERS` : ''}
              </span>
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'squeeze'}
              className={`insiders-pillar-btn${activeTab === 'squeeze' ? ' active' : ''}`}
              onClick={() => setActiveTab('squeeze')}
            >
              <Flame size={12} />
              <span>SHORT SQUEEZE ({bundle?.squeeze.length ?? 0})</span>
            </button>
          </div>

          <div className="insiders-search-cluster">
            <div className="insiders-search-box">
              <Search size={12} className="bread-custom-icon" aria-hidden="true" />
              <input
                type="text"
                className="insiders-search-input mono"
                placeholder="Filter ticker, politician, CEO, committee…"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                aria-label="Filter insiders, politicians, or tickers"
              />
              {searchQuery && (
                <button
                  type="button"
                  className="insiders-clear-x"
                  onClick={() => setSearchQuery('')}
                  aria-label="Clear search"
                >
                  <X size={11} />
                </button>
              )}
            </div>

            <button
              type="button"
              className={`watchlist-filter-pill mono${watchlistOnly ? ' active' : ''}`}
              disabled={pinnedTickers.length === 0}
              onClick={() => setWatchlistOnly((v) => !v)}
              title={
                pinnedTickers.length > 0
                  ? `Filter to your ${pinnedTickers.length} pinned tickers`
                  : 'Pin tickers in any War Room or Explorer to enable Watchlist filter'
              }
            >
              <Star size={10} />
              <span>WATCHLIST ({pinnedTickers.length})</span>
            </button>
          </div>
        </div>
      </section>

      {!bundle ? (
        <section className="whale-card">
          <div className="daily-bread-loading mono">
            <Activity size={14} className="text-emerald" />
            <span>Loading official Congress, SEC Form 4 &amp; FINRA Short Squeeze feeds…</span>
          </div>
        </section>
      ) : activeTab === 'congress' ? (
        /* ================= PILLAR 1: CONGRESS STOCK ACT ================= */
        <div className="insiders-pillar-stack">
          {/* Most Active Lawmakers Leaderboard */}
          {politicianLeaders.length > 0 && (
            <section className="whale-card" aria-label="Most Active Lawmakers Leaderboard">
              <div className="panel-header">
                <div className="panel-title-group">
                  <Users size={13} className="text-emerald" aria-hidden="true" />
                  <h2 className="panel-title">MOST ACTIVE LAWMAKERS (CLICK TO FILTER)</h2>
                </div>
                {selectedPolitician && (
                  <button
                    type="button"
                    className="whale-reset-btn mono"
                    onClick={() => setSelectedPolitician('')}
                  >
                    CLEAR: {selectedPolitician.toUpperCase()} ×
                  </button>
                )}
              </div>

              <div className="politician-leader-grid">
                {politicianLeaders.slice(0, 6).map((pol) => {
                  const active = selectedPolitician === pol.politician;
                  return (
                    <button
                      key={pol.politician}
                      type="button"
                      className={`politician-card mono${active ? ' active' : ''}`}
                      onClick={() =>
                        setSelectedPolitician(active ? '' : pol.politician)
                      }
                    >
                      <div className="politician-card-top">
                        <strong className="politician-name">{pol.politician}</strong>
                        <span
                          className={`party-pill party-pill--${pol.party.toLowerCase()}`}
                        >
                          {pol.party}-{pol.state}
                        </span>
                      </div>
                      <div className="politician-card-sub">
                        <span>{pol.chamber}</span>
                        <span>•</span>
                        <span>{pol.committees[0] ?? 'Congress'}</span>
                      </div>
                      <div className="politician-card-metrics">
                        <span className="text-emerald">{pol.buyCount}B</span>
                        <span className="text-crimson">{pol.sellCount}S</span>
                        <span className="text-amber">~{fmtUsd(pol.estVolumeUsd)}</span>
                      </div>
                      <div className="politician-tickers">
                        {pol.topTickers.map((sym) => (
                          <span key={sym} className="politician-tk-chip">
                            ${sym}
                          </span>
                        ))}
                      </div>
                    </button>
                  );
                })}
              </div>
            </section>
          )}

          {/* Congressional Trade Tape */}
          <section className="whale-card" aria-label="Congressional Stock Trades Tape">
            <div className="panel-header">
              <div className="panel-title-group">
                <Landmark size={13} className="text-amber" aria-hidden="true" />
                <h2 className="panel-title">CONGRESSIONAL STOCK ACT TAPE</h2>
                <span className="panel-badge panel-badge--emerald mono">
                  {filteredCongress.length} DISCLOSURES • {congressStats.buys}B /{' '}
                  {congressStats.sells}S
                </span>
              </div>
              <div className="insiders-vol-summary mono">
                <span className="text-emerald">
                  EST BUYS ~{fmtUsd(congressStats.buyVol)}
                </span>
                <span className="text-crimson">
                  EST SELLS ~{fmtUsd(congressStats.sellVol)}
                </span>
              </div>
            </div>

            <div className="whale-uoa-toolbar">
              <div className="bread-filter-group" role="tablist" aria-label="Filter congressional trades">
                {(
                  [
                    ['ALL', 'All'],
                    ['BUY', 'Buys Only'],
                    ['SELL', 'Sells Only'],
                    ['D', 'Democrats'],
                    ['R', 'Republicans'],
                    ['HOUSE', 'House'],
                    ['SENATE', 'Senate'],
                    ['LARGE', '$100K+'],
                  ] as Array<[CongressFilter, string]>
                ).map(([id, label]) => (
                  <button
                    key={id}
                    type="button"
                    role="tab"
                    aria-selected={congressFilter === id}
                    className={`news-cat-tab mono${congressFilter === id ? ' active' : ''}`}
                    onClick={() => setCongressFilter(id)}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {filteredCongress.length === 0 ? (
              <div className="daily-bread-loading mono">
                No congressional trades match these filters — clear filters to view all disclosures.
              </div>
            ) : (
              <div className="whale-table-scroll">
                <table className="whale-table mono">
                  <thead>
                    <tr>
                      <th>LAWMAKER</th>
                      <th>TICKER</th>
                      <th>ACTION</th>
                      <th>EST. SIZE</th>
                      <th>TRADE / FILED</th>
                      <th>COMMITTEES</th>
                      <th>SHARE</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredCongress.map((t) => {
                      const isBuy = t.action === 'BUY';
                      return (
                        <tr key={t.id} className="whale-row">
                          <td>
                            <button
                              type="button"
                              className="insiders-person-btn"
                              onClick={() =>
                                setSelectedPolitician(
                                  selectedPolitician === t.politician ? '' : t.politician,
                                )
                              }
                            >
                              <strong>{t.politician}</strong>
                            </button>
                            <div className="whale-spot-sub">
                              <span
                                className={`party-pill party-pill--${t.party.toLowerCase()}`}
                              >
                                {t.party}-{t.state}
                              </span>{' '}
                              {t.chamber}
                            </div>
                          </td>
                          <td>
                            <button
                              type="button"
                              className="whale-sym-btn"
                              onClick={() => onSelectTicker(t.ticker)}
                            >
                              {t.ticker}
                            </button>
                            <div className="whale-spot-sub">{t.assetName}</div>
                          </td>
                          <td>
                            <span
                              className={`whale-cp-badge ${
                                isBuy ? 'whale-cp-badge--bull' : 'whale-cp-badge--bear'
                              }`}
                            >
                              {t.action}
                            </span>
                          </td>
                          <td>
                            <strong
                              className={
                                t.amountMinUsd >= 250_000
                                  ? 'text-amber'
                                  : isBuy
                                    ? 'text-emerald'
                                    : 'text-crimson'
                              }
                            >
                              {t.amountLabel}
                            </strong>
                          </td>
                          <td>
                            <div>{t.tradeDate}</div>
                            <div className="whale-spot-sub">
                              Filed {t.filedDate} (+{t.lagDays}d lag)
                            </div>
                          </td>
                          <td>
                            <div className="whale-tags-cell">
                              {t.committees.slice(0, 2).map((c) => (
                                <span key={c} className="whale-sig-tag">
                                  {c}
                                </span>
                              ))}
                            </div>
                          </td>
                          <td>
                            <div className="insiders-row-actions">
                              <button
                                type="button"
                                className="whale-sim-btn"
                                onClick={() => {
                                  void exportCongressSnapshotCard(t).then((res) => {
                                    if (res === 'copied') {
                                      onNotify?.(`Copied & saved ${t.politician} ${t.ticker} PNG card`);
                                    } else if (res === 'downloaded') {
                                      onNotify?.(`Downloaded ${t.politician} ${t.ticker} PNG card`);
                                    }
                                  });
                                }}
                                title="Export PNG Snapshot Card for X / Discord"
                              >
                                <Camera size={10} />
                                <span>PNG</span>
                              </button>
                              <a
                                href={t.sourceUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="insiders-filing-link"
                                title="View official STOCK Act filing portal"
                                aria-label={`Official disclosure for ${t.politician}`}
                              >
                                <ExternalLink size={11} />
                              </a>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>
      ) : activeTab === 'form4' ? (
        /* ================= PILLAR 2: CORPORATE C-SUITE FORM 4 ================= */
        <div className="insiders-pillar-stack">
          {/* Automatic Cluster Buy Spotlight */}
          {clusterBuys.length > 0 && (
            <section className="whale-card" aria-label="C-Suite Cluster Buy Detector">
              <div className="panel-header">
                <div className="panel-title-group">
                  <Sparkles size={13} className="text-emerald" aria-hidden="true" />
                  <h2 className="panel-title">
                    AUTOMATIC CLUSTER BUY DETECTOR (2+ INSIDERS BUYING IN 14D)
                  </h2>
                  <span className="panel-badge panel-badge--emerald mono">
                    {clusterBuys.length} ACTIVE CLUSTERS
                  </span>
                </div>
              </div>

              <div className="cluster-buy-grid">
                {clusterBuys.slice(0, 6).map((cb) => (
                  <div key={cb.ticker} className="cluster-buy-card mono">
                    <div className="cluster-buy-top">
                      <div>
                        <button
                          type="button"
                          className="whale-sym-btn"
                          onClick={() => onSelectTicker(cb.ticker)}
                        >
                          ${cb.ticker}
                        </button>
                        <div className="whale-spot-sub">{cb.companyName}</div>
                      </div>
                      <button
                        type="button"
                        className="whale-sim-btn"
                        onClick={() => {
                          void exportClusterBuySnapshotCard(cb).then((res) => {
                            if (res === 'copied') {
                              onNotify?.(`Copied & saved ${cb.ticker} Cluster Buy PNG card`);
                            } else if (res === 'downloaded') {
                              onNotify?.(`Downloaded ${cb.ticker} Cluster Buy PNG card`);
                            }
                          });
                        }}
                        title={`Export ${cb.ticker} Cluster Buy PNG card`}
                      >
                        <Camera size={10} />
                        <span>PNG CARD</span>
                      </button>
                    </div>

                    <div className="cluster-buy-stats">
                      <span className="text-emerald">
                        <strong>{cb.insiderCount} INSIDERS</strong> BUYING
                      </span>
                      <span className="text-amber">
                        <strong>{fmtUsd(cb.totalBuyUsd)}</strong> TOTAL
                      </span>
                    </div>

                    <div className="cluster-buy-list">
                      {cb.insiders.slice(0, 3).map((ins) => (
                        <div key={ins.name} className="cluster-insider-row">
                          <span className="cluster-insider-name">
                            {ins.name} ({ins.role})
                          </span>
                          <span className="text-emerald">{fmtUsd(ins.valueUsd)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* SEC EDGAR Form 4 Tape */}
          <section className="whale-card" aria-label="SEC EDGAR Form 4 Open-Market Trades">
            <div className="panel-header">
              <div className="panel-title-group">
                <Building2 size={13} className="text-emerald" aria-hidden="true" />
                <h2 className="panel-title">SEC EDGAR FORM 4 — OPEN-MARKET INSIDER FLOW</h2>
                <span className="panel-badge panel-badge--emerald mono">
                  {filteredForm4.length} FILINGS
                </span>
              </div>
            </div>

            <div className="whale-uoa-toolbar">
              <div className="bread-filter-group" role="tablist" aria-label="Filter Form 4 filings">
                {(
                  [
                    ['ALL', 'All Filings'],
                    ['BUY', 'Open-Market Buys'],
                    ['SELL', 'Sells'],
                    ['CSUITE', 'C-Suite Only'],
                    ['CLUSTER', 'Cluster Buys'],
                    ['LARGE', '$500K+'],
                  ] as Array<[Form4Filter, string]>
                ).map(([id, label]) => (
                  <button
                    key={id}
                    type="button"
                    role="tab"
                    aria-selected={form4Filter === id}
                    className={`news-cat-tab mono${form4Filter === id ? ' active' : ''}`}
                    onClick={() => setForm4Filter(id)}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {filteredForm4.length === 0 ? (
              <div className="daily-bread-loading mono">
                No SEC Form 4 filings match these filters.
              </div>
            ) : (
              <div className="whale-table-scroll">
                <table className="whale-table mono">
                  <thead>
                    <tr>
                      <th>TICKER</th>
                      <th>INSIDER &amp; ROLE</th>
                      <th>ACTION</th>
                      <th>VALUE</th>
                      <th>SHARES @ PX</th>
                      <th>TRADE / FILED</th>
                      <th>SEC</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredForm4.map((f) => {
                      const isBuy = f.action === 'BUY';
                      const isCluster = isBuy && clusterTickerSet.has(f.ticker);
                      return (
                        <tr key={f.id} className="whale-row">
                          <td>
                            <button
                              type="button"
                              className="whale-sym-btn"
                              onClick={() => onSelectTicker(f.ticker)}
                            >
                              {f.ticker}
                            </button>
                            <div className="whale-spot-sub">{f.companyName}</div>
                          </td>
                          <td>
                            <div>
                              <strong>{f.insiderName}</strong>
                            </div>
                            <div className="whale-spot-sub">
                              {f.role}
                              {f.isCsuite ? ' • C-SUITE' : ''}
                            </div>
                          </td>
                          <td>
                            <div className="whale-tags-cell">
                              <span
                                className={`whale-cp-badge ${
                                  isBuy ? 'whale-cp-badge--bull' : 'whale-cp-badge--bear'
                                }`}
                              >
                                {f.action}
                              </span>
                              {isCluster && (
                                <span className="whale-sig-tag whale-sig-tag--amber">
                                  CLUSTER
                                </span>
                              )}
                            </div>
                          </td>
                          <td>
                            <strong
                              className={
                                f.valueUsd >= 1_000_000
                                  ? 'text-amber'
                                  : isBuy
                                    ? 'text-emerald'
                                    : 'text-crimson'
                              }
                            >
                              {fmtUsd(f.valueUsd)}
                            </strong>
                          </td>
                          <td>
                            <div>{f.shares.toLocaleString()} sh</div>
                            <div className="whale-spot-sub">@ ${f.price.toFixed(2)}</div>
                          </td>
                          <td>
                            <div>{f.tradeDate}</div>
                            <div className="whale-spot-sub">Filed {f.filedDate}</div>
                          </td>
                          <td>
                            <a
                              href={f.filingUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="insiders-filing-link"
                              title="Open official SEC EDGAR Form 4 filing"
                              aria-label={`SEC Form 4 filing for ${f.ticker}`}
                            >
                              <ExternalLink size={12} />
                            </a>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>
      ) : (
        /* ================= PILLAR 3: FINRA SHORT VOL & SEC FTD SQUEEZE RADAR ================= */
        <section className="whale-card" aria-label="FINRA Short Volume and SEC FTD Short Squeeze Radar">
          <div className="panel-header">
            <div className="panel-title-group">
              <Flame size={13} className="text-crimson" aria-hidden="true" />
              <h2 className="panel-title">
                DARK POOL / SHORT SQUEEZE RADAR (FINRA SHORT VOL + SEC FTD)
              </h2>
              <span className="panel-badge panel-badge--crimson mono">
                {filteredSqueeze.length} TRACKED
              </span>
            </div>
          </div>

          <div className="whale-uoa-toolbar">
            <div className="bread-filter-group" role="tablist" aria-label="Filter short squeeze radar">
              {(
                [
                  ['ALL', 'All Ranked'],
                  ['EXTREME', 'Extreme (80+)'],
                  ['HIGH', 'High (65+)'],
                  ['SHORT50', 'Short Vol ≥ 50%'],
                  ['FTD1M', 'FTD ≥ $1M'],
                ] as Array<[SqueezeFilter, string]>
              ).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  role="tab"
                  aria-selected={squeezeFilter === id}
                  className={`news-cat-tab mono${squeezeFilter === id ? ' active' : ''}`}
                  onClick={() => setSqueezeFilter(id)}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {filteredSqueeze.length === 0 ? (
            <div className="daily-bread-loading mono">
              No short squeeze setups match these filters.
            </div>
          ) : (
            <div className="whale-table-scroll">
              <table className="whale-table mono">
                <thead>
                  <tr>
                    <th>TICKER</th>
                    <th>SQUEEZE SCORE</th>
                    <th>FINRA SHORT VOL %</th>
                    <th>REG SHO EXEMPT</th>
                    <th>SEC FTD PRESSURE</th>
                    <th>SIGNALS</th>
                    <th>SHARE</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredSqueeze.map((row) => {
                    const exemptPct =
                      row.totalVolume > 0
                        ? ((row.shortExemptVolume / row.totalVolume) * 100).toFixed(2)
                        : '0.00';
                    const tone =
                      row.regime === 'EXTREME'
                        ? 'bear'
                        : row.regime === 'HIGH'
                          ? 'amber'
                          : 'bull';
                    return (
                      <tr key={row.ticker} className="whale-row">
                        <td>
                          <button
                            type="button"
                            className="whale-sym-btn"
                            onClick={() => onSelectTicker(row.ticker)}
                          >
                            {row.ticker}
                          </button>
                          <div className="whale-spot-sub">{row.companyName}</div>
                        </td>
                        <td>
                          <div className="squeeze-score-cell">
                            <span
                              className={`whale-cp-badge ${
                                tone === 'bear'
                                  ? 'whale-cp-badge--bear'
                                  : tone === 'amber'
                                    ? 'squeeze-badge--amber'
                                    : 'whale-cp-badge--bull'
                              }`}
                            >
                              {row.squeezeScore} • {row.regime}
                            </span>
                            <div className="squeeze-meter">
                              <div
                                className={`squeeze-meter-fill squeeze-meter-fill--${tone}`}
                                style={{ width: `${row.squeezeScore}%` }}
                              />
                            </div>
                          </div>
                        </td>
                        <td>
                          <strong
                            className={
                              row.shortVolPct >= 60
                                ? 'text-crimson'
                                : row.shortVolPct >= 50
                                  ? 'text-amber'
                                  : ''
                            }
                          >
                            {row.shortVolPct.toFixed(1)}%
                          </strong>
                          <div className="whale-spot-sub">
                            {(row.shortVolume / 1e6).toFixed(1)}M /{' '}
                            {(row.totalVolume / 1e6).toFixed(1)}M
                          </div>
                        </td>
                        <td>
                          <div>{exemptPct}%</div>
                          <div className="whale-spot-sub">
                            {row.shortExemptVolume.toLocaleString()} sh
                          </div>
                        </td>
                        <td>
                          <strong className={row.ftdUsd >= 5_000_000 ? 'gex-violet' : ''}>
                            {row.ftdUsd > 0 ? fmtUsd(row.ftdUsd) : '—'}
                          </strong>
                          <div className="whale-spot-sub">
                            {row.ftdShares > 0
                              ? `${row.ftdShares.toLocaleString()} sh (${row.ftdDate.slice(5)})`
                              : 'No recent FTD'}
                          </div>
                        </td>
                        <td>
                          <div className="whale-tags-cell">
                            {row.signals.map((sig) => (
                              <span
                                key={sig}
                                className={`whale-sig-tag ${
                                  sig.includes('60%') || sig.includes('EXEMPT')
                                    ? 'whale-sig-tag--bear'
                                    : 'whale-sig-tag--amber'
                                }`}
                              >
                                {sig}
                              </span>
                            ))}
                          </div>
                        </td>
                        <td>
                          <button
                            type="button"
                            className="whale-sim-btn"
                            onClick={() => {
                              void exportSqueezeSnapshotCard(row).then((res) => {
                                if (res === 'copied') {
                                  onNotify?.(`Copied & saved ${row.ticker} Short Squeeze PNG card`);
                                } else if (res === 'downloaded') {
                                  onNotify?.(`Downloaded ${row.ticker} Short Squeeze PNG card`);
                                }
                              });
                            }}
                            title={`Export ${row.ticker} Short Squeeze PNG card`}
                          >
                            <Camera size={10} />
                            <span>PNG</span>
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      <div className="daily-bread-disclaimer mono">
        INSIDERS &amp; SQUEEZE aggregates public US House/Senate STOCK Act disclosures, SEC
        EDGAR Form 4 filings, FINRA Reg SHO daily short volume, and SEC Failures-to-Deliver
        (FTD) datasets via automated GitHub Actions builds — informational only, not financial
        advice.
      </div>
    </div>
  );
}
