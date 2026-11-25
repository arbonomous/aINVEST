import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Activity,
  ArrowRight,
  Bell,
  BellRing,
  Bot,
  Check,
  Flame,
  Globe,
  Landmark,
  Layers,
  Newspaper,
  Search,
  Share2,
  Waves,
} from 'lucide-react';
import { CURATED_MAP, FEATURED_IPOS, FLAGSHIP_TICKERS } from '../data/tickers';
import type { HlAssetCtx } from '../lib/hyperliquidFeed';
import type { DirectoryEntry } from '../lib/marketCatalog';
import { THEMES, type ThemeId } from '../lib/themes';
import type { ExplorerTab } from './MarketExplorerModal';
import { BrandLogo } from './ui/BrandLogo';

export type AppView =
  | 'home'
  | 'whale-flow'
  | 'insiders'
  | 'daily-bread'
  | 'terminal';

interface TerminalHeaderProps {
  activeView: AppView;
  activeTicker: string;
  ctxMap: Record<string, HlAssetCtx>;
  directory: DirectoryEntry[];
  directoryMap: Record<string, DirectoryEntry>;
  activeAlertsCount: number;
  triggeredAlertsCount: number;
  onSelectView: (view: AppView) => void;
  onSelectTicker: (ticker: string) => void;
  onOpenExplorer: (tab?: ExplorerTab) => void;
  onOpenQuantBot?: (initialQuery?: string) => void;
  onOpenAlerts: () => void;
  onShareLink: () => void;
  copied: boolean;
  themeId: ThemeId;
  onSelectTheme: (theme: ThemeId) => void;
}

const VALID_TICKER_RE = /^[A-Z0-9][A-Z0-9._-]{0,11}$/;

function formatEtTime(date: Date): string {
  try {
    return new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/New_York',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    }).format(date);
  } catch {
    return date.toTimeString().slice(0, 8);
  }
}

export function TerminalHeader({
  activeView,
  activeTicker,
  ctxMap,
  directory,
  directoryMap,
  activeAlertsCount,
  triggeredAlertsCount,
  onSelectView,
  onSelectTicker,
  onOpenExplorer,
  onOpenQuantBot,
  onOpenAlerts,
  onShareLink,
  copied,
  themeId,
  onSelectTheme,
}: TerminalHeaderProps) {
  const [etClock, setEtClock] = useState<string>(() => formatEtTime(new Date()));
  const [query, setQuery] = useState<string>('');
  const [openSearch, setOpenSearch] = useState<boolean>(false);
  const searchWrapRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    const id = window.setInterval(() => {
      setEtClock(formatEtTime(new Date()));
    }, 1000);
    return () => window.clearInterval(id);
  }, []);

  // Cmd/Ctrl + K focuses ticker search; Cmd/Ctrl + J opens QuantBot AI
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpenSearch(true);
        inputRef.current?.focus();
      } else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'j') {
        e.preventDefault();
        onOpenQuantBot?.();
      } else if (e.key === 'Escape') {
        setOpenSearch(false);
        inputRef.current?.blur();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onOpenQuantBot]);

  // Close dropdown on outside click
  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      if (
        searchWrapRef.current &&
        !searchWrapRef.current.contains(e.target as Node)
      ) {
        setOpenSearch(false);
      }
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, []);

  const cleanQuery = query.trim().toUpperCase().replace(/^\$/, '');

  const searchResults = useMemo(() => {
    interface SearchItem {
      ticker: string;
      name: string;
      exchange: string;
      price: number | null;
      score: number;
      isIpo: boolean;
      isLive247: boolean;
    }

    const results: SearchItem[] = [];
    const seen = new Set<string>();

    const addCandidate = (
      ticker: string,
      name: string,
      exchange: string,
      price: number | null,
      baseWeight: number,
      isIpo: boolean,
      isLive247: boolean,
    ) => {
      if (seen.has(ticker)) return;
      let matchScore = baseWeight;
      if (cleanQuery) {
        const upName = name.toUpperCase();
        if (ticker === cleanQuery) {
          matchScore += 100_000;
        } else if (ticker.startsWith(cleanQuery)) {
          matchScore += 20_000 - ticker.length * 100;
        } else if (ticker.includes(cleanQuery)) {
          matchScore += 8_000;
        } else if (upName.startsWith(cleanQuery)) {
          matchScore += 6_000;
        } else if (upName.includes(cleanQuery)) {
          matchScore += 3_000;
        } else {
          return;
        }
      }
      seen.add(ticker);
      results.push({
        ticker,
        name,
        exchange,
        price,
        score: matchScore,
        isIpo,
        isLive247,
      });
    };

    // 1. Flagship & Featured IPOs first
    for (const m of [...FLAGSHIP_TICKERS, ...FEATURED_IPOS]) {
      const hl = ctxMap[m.ticker];
      const dir = directoryMap[m.ticker];
      addCandidate(
        m.ticker,
        m.name,
        m.exchange ?? dir?.exchange ?? 'NASDAQ',
        hl?.markPx ?? dir?.lastSale ?? m.referencePrice ?? null,
        1500,
        Boolean(m.isIpo),
        Boolean(hl),
      );
    }

    // 2. All discovered 24/7 Hyperliquid HIP-3 markets
    for (const [ticker, ctx] of Object.entries(ctxMap)) {
      const dir = directoryMap[ticker];
      const curated = CURATED_MAP[ticker];
      addCandidate(
        ticker,
        curated?.name ??
          dir?.name ??
          (ticker === 'XYZ100'
            ? 'Nasdaq 100 Index'
            : ticker === 'SP500'
              ? 'S&P 500 Index'
              : ticker),
        dir?.exchange ?? ctx.coin.split(':')[0].toUpperCase(),
        ctx.markPx,
        900 + Math.min(500, Math.log10(Math.max(1, ctx.dayNtlVlm)) * 40),
        Boolean(curated?.isIpo || dir?.isIpo),
        true,
      );
    }

    // 3. Full 7,290+ US equities & IPOs directory
    if (cleanQuery) {
      for (const d of directory) {
        if (seen.has(d.ticker)) continue;
        if (
          !d.ticker.includes(cleanQuery) &&
          !d.name.toUpperCase().includes(cleanQuery)
        ) {
          continue;
        }
        const mcapBoost = d.marketCap
          ? Math.min(800, Math.log10(Math.max(1, d.marketCap)) * 60)
          : 0;
        const derivPenalty = d.isDerivativeListing ? -1500 : 0;
        addCandidate(
          d.ticker,
          d.name,
          d.exchange,
          d.lastSale,
          mcapBoost + derivPenalty + (d.isIpo ? 180 : 0),
          d.isIpo,
          false,
        );
      }
    }

    return results.sort((a, b) => b.score - a.score).slice(0, 12);
  }, [cleanQuery, ctxMap, directory, directoryMap]);

  const canDirectLaunch =
    VALID_TICKER_RE.test(cleanQuery) &&
    !searchResults.some((item) => item.ticker === cleanQuery);

  const pickTicker = (ticker: string) => {
    onSelectTicker(ticker);
    setQuery('');
    setOpenSearch(false);
    inputRef.current?.blur();
  };

  const totalMarketsLabel =
    directory.length > 0
      ? `${directory.length.toLocaleString()}+ stocks & IPOs`
      : 'all stocks & IPOs';

  return (
    <header className="terminal-header">
      {/* Row 1: Dedicated Brand Masthead */}
      <div className="header-brand-row">
        <div className="header-brand-row-inner">
          <button
            id="brand-home-btn"
            type="button"
            className="brand-home-btn"
            onClick={() => onSelectView('home')}
            title="Go to aINVEST News Front Page"
          >
            <BrandLogo asHeading={activeView === 'terminal'} />
          </button>
          <span className="brand-tagline mono">
            NEWS • WHALE FLOW • INSIDERS • AI TERMINAL
          </span>
        </div>
      </div>

      {/* Row 2: Navigation Tabs (Left) + Telemetry, Theme, Alerts & Share (Right) */}
      <div className="terminal-header-inner">
        <nav className="primary-view-nav" aria-label="Primary sections">
          <button
            id="nav-view-home"
            type="button"
            className={`view-nav-btn mono${activeView === 'home' ? ' active' : ''}`}
            aria-current={activeView === 'home' ? 'page' : undefined}
            onClick={() => onSelectView('home')}
          >
            <Newspaper size={12} />
            <span>NEWS</span>
          </button>
          <button
            id="nav-view-whale-flow"
            type="button"
            className={`view-nav-btn view-nav-btn--whale mono${activeView === 'whale-flow' ? ' active' : ''}`}
            aria-current={activeView === 'whale-flow' ? 'page' : undefined}
            onClick={() => onSelectView('whale-flow')}
          >
            <Waves size={12} />
            <span>WHALE FLOW</span>
          </button>
          <button
            id="nav-view-insiders"
            type="button"
            className={`view-nav-btn view-nav-btn--insiders mono${activeView === 'insiders' ? ' active' : ''}`}
            aria-current={activeView === 'insiders' ? 'page' : undefined}
            onClick={() => onSelectView('insiders')}
          >
            <Landmark size={12} />
            <span>INSIDERS</span>
          </button>
          <button
            id="nav-view-daily-bread"
            type="button"
            className={`view-nav-btn view-nav-btn--bread mono${activeView === 'daily-bread' ? ' active' : ''}`}
            aria-current={activeView === 'daily-bread' ? 'page' : undefined}
            onClick={() => onSelectView('daily-bread')}
          >
            <Flame size={12} />
            <span>DAILY BREAD</span>
          </button>
          <button
            id="nav-view-terminal"
            type="button"
            className={`view-nav-btn mono${activeView === 'terminal' ? ' active' : ''}`}
            aria-current={activeView === 'terminal' ? 'page' : undefined}
            onClick={() => onSelectView('terminal')}
          >
            <Activity size={12} />
            <span>{activeTicker}</span>
          </button>
        </nav>

        <div className="header-controls">
          <div className="session-telemetry" aria-label="Eastern Time">
            <span>
              {activeView === 'home'
                ? 'NEWS'
                : activeView === 'whale-flow'
                  ? 'WHALE FLOW'
                  : activeView === 'insiders'
                    ? 'INSIDERS'
                    : activeView === 'daily-bread'
                      ? 'DAILY BREAD'
                      : `ROOM: ${activeTicker}`}
            </span>
            <span className="session-divider" aria-hidden="true" />
            <span className="session-clock">{etClock} ET</span>
          </div>

          <div
            className="theme-switcher"
            role="radiogroup"
            aria-label="Color scheme selector"
          >
            {THEMES.map((t) => (
              <button
                key={t.id}
                id={`theme-opt-${t.id}`}
                type="button"
                role="radio"
                aria-checked={themeId === t.id}
                title={t.description}
                className={`theme-chip${themeId === t.id ? ' active' : ''}`}
                onClick={() => onSelectTheme(t.id)}
              >
                <span
                  className="theme-swatch"
                  style={{
                    backgroundColor: t.swatchBg,
                    boxShadow: `inset 0 0 0 2px ${t.swatchAccent}`,
                  }}
                  aria-hidden="true"
                />
                <span>{t.label}</span>
              </button>
            ))}
          </div>

          <button
            id="alerts-drawer-btn"
            type="button"
            className={`alerts-header-btn mono${
              triggeredAlertsCount > 0
                ? ' has-triggered'
                : activeAlertsCount > 0
                  ? ' has-active'
                  : ''
            }`}
            onClick={onOpenAlerts}
            title="Live Price Alerts (free browser notifications & chime)"
            aria-label={`Open Price Alerts (${activeAlertsCount} active)`}
          >
            {triggeredAlertsCount > 0 ? (
              <BellRing size={14} strokeWidth={2.1} />
            ) : (
              <Bell size={14} strokeWidth={2} />
            )}
            <span>Alerts</span>
            {(activeAlertsCount > 0 || triggeredAlertsCount > 0) && (
              <span className="alerts-count-badge">
                {triggeredAlertsCount > 0 ? triggeredAlertsCount : activeAlertsCount}
              </span>
            )}
          </button>

          <button
            id="share-room-btn"
            type="button"
            className={`share-btn${copied ? ' copied' : ''}`}
            onClick={onShareLink}
          >
            {copied ? <Check size={14} strokeWidth={2.2} /> : <Share2 size={14} strokeWidth={2} />}
            <span>
              {copied
                ? 'Copied'
                : activeView === 'terminal'
                  ? `Share ${activeTicker}`
                  : 'Share'}
            </span>
          </button>
        </div>
      </div>

      {/* Dedicated Row 2: Universal Stock & IPO Search Bar (⌘K) + Explorer Trigger */}
      <div className="header-search-row">
        <div className="header-search-row-inner">
          <div className="header-discovery-group">
            <div ref={searchWrapRef} className="ticker-search-wrap">
              <Search size={13} className="ticker-search-icon" aria-hidden="true" />
              <input
                ref={inputRef}
                id="ainvest-ticker-search"
                type="text"
                className="ticker-search-input mono"
                placeholder={`Search ${totalMarketsLabel} or ask QuantBot (e.g. "Analyze NVDA")…`}
                value={query}
                onFocus={() => setOpenSearch(true)}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setOpenSearch(true);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    const isQuestion =
                      query.trim().includes(' ') || query.trim().includes('?');
                    if (isQuestion && onOpenQuantBot) {
                      onOpenQuantBot(query.trim());
                      setQuery('');
                      setOpenSearch(false);
                      inputRef.current?.blur();
                    } else if (searchResults.length > 0) {
                      pickTicker(searchResults[0].ticker);
                    } else if (VALID_TICKER_RE.test(cleanQuery)) {
                      pickTicker(cleanQuery);
                    } else if (query.trim() && onOpenQuantBot) {
                      onOpenQuantBot(query.trim());
                      setQuery('');
                      setOpenSearch(false);
                      inputRef.current?.blur();
                    }
                  }
                }}
                aria-label="Search all stocks or ask QuantBot technical analysis AI"
              />
              <span className="search-kbd mono" aria-hidden="true">
                ⌘K
              </span>

              {openSearch && (
                <div
                  className="search-dropdown"
                  role="listbox"
                  aria-label="Matching stocks and IPOs"
                >
                  {query.trim().includes(' ') && onOpenQuantBot && (
                    <button
                      type="button"
                      role="option"
                      aria-selected="false"
                      className="search-option search-option--direct"
                      onClick={() => {
                        onOpenQuantBot(query.trim());
                        setQuery('');
                        setOpenSearch(false);
                        inputRef.current?.blur();
                      }}
                    >
                      <div className="search-option-left">
                        <span className="search-opt-ticker mono">QUANTBOT</span>
                        <span className="search-opt-name">
                          Ask Market &amp; TA AI: &ldquo;{query.trim()}&rdquo;
                        </span>
                      </div>
                      <span className="search-opt-launch mono">
                        ASK AI <ArrowRight size={11} />
                      </span>
                    </button>
                  )}
                  {canDirectLaunch && (
                    <button
                      type="button"
                      role="option"
                      aria-selected="false"
                      className="search-option search-option--direct"
                      onClick={() => pickTicker(cleanQuery)}
                    >
                      <div className="search-option-left">
                        <span className="search-opt-ticker mono">{cleanQuery}</span>
                        <span className="search-opt-name">
                          Open {cleanQuery} War Room directly
                        </span>
                      </div>
                      <span className="search-opt-launch mono">
                        OPEN <ArrowRight size={11} />
                      </span>
                    </button>
                  )}

                  {searchResults.length === 0 && !canDirectLaunch ? (
                    <div className="search-empty mono">
                      Type any stock or IPO symbol (e.g. AAPL, SPCX, JPM, BRK.B)
                    </div>
                  ) : (
                    searchResults.map((item) => (
                      <button
                        key={item.ticker}
                        type="button"
                        role="option"
                        aria-selected={activeTicker === item.ticker}
                        className={`search-option${activeTicker === item.ticker ? ' active' : ''}`}
                        onClick={() => pickTicker(item.ticker)}
                      >
                        <div className="search-option-left">
                          <span className="search-opt-ticker mono">{item.ticker}</span>
                          {item.isIpo && (
                            <span className="search-micro-tag search-micro-tag--ipo mono">
                              IPO
                            </span>
                          )}
                          {item.isLive247 && (
                            <span className="search-micro-tag search-micro-tag--live mono">
                              24/7
                            </span>
                          )}
                          <span className="search-opt-name">{item.name}</span>
                        </div>
                        <div className="search-option-right">
                          <span className="search-opt-ex mono">{item.exchange}</span>
                          <span className="search-opt-price mono">
                            {item.price !== null ? `$${item.price.toFixed(2)}` : '—'}
                          </span>
                        </div>
                      </button>
                    ))
                  )}

                  <div className="search-dropdown-footer">
                    <button
                      type="button"
                      className="search-browse-btn mono"
                      onClick={() => {
                        setOpenSearch(false);
                        onOpenExplorer('ipos');
                      }}
                    >
                      <Flame size={11} />
                      <span>IPOs</span>
                    </button>
                    <button
                      type="button"
                      className="search-browse-btn mono"
                      onClick={() => {
                        setOpenSearch(false);
                        onOpenExplorer('all');
                      }}
                    >
                      <Globe size={11} />
                      <span>
                        Browse all{' '}
                        {directory.length > 0
                          ? directory.length.toLocaleString()
                          : '7,000+'}
                        + markets →
                      </span>
                    </button>
                  </div>
                </div>
              )}
            </div>

            {onOpenQuantBot && (
              <button
                id="open-quantbot-btn"
                type="button"
                className="markets-explorer-btn markets-explorer-btn--quantbot mono"
                onClick={() => onOpenQuantBot()}
                title="Ask aINVEST QuantBot — Market & Technical Analysis AI (⌘J)"
              >
                <Bot size={13} />
                <span>ASK QUANTBOT</span>
              </button>
            )}

            <button
              id="open-confluence-screener-btn"
              type="button"
              className="markets-explorer-btn markets-explorer-btn--screener mono"
              onClick={() => onOpenExplorer('confluence')}
              title="Open 5-Pillar Multi-Signal Confluence Screener"
            >
              <Layers size={13} />
              <span>SCREENER</span>
            </button>

            <button
              id="open-markets-explorer-btn"
              type="button"
              className="markets-explorer-btn mono"
              onClick={() => onOpenExplorer('ipos')}
              title="Browse all 7,290+ US stocks, ETFs, recent & upcoming IPOs, and 24/7 markets"
            >
              <Globe size={13} />
              <span>ALL STOCKS &amp; IPOs</span>
            </button>
          </div>

          <div className="header-quick-jump mono" aria-label="Quick jump tickers">
            <span className="header-qj-label">QUICK JUMP</span>
            {(['ANT', 'NVDA', 'TSLA', 'SPCX', 'SPY', 'QQQ'] as const).map((sym) => (
              <button
                key={sym}
                type="button"
                className={`header-qj-pill${
                  activeView === 'terminal' && activeTicker === sym ? ' active' : ''
                }`}
                onClick={() => pickTicker(sym)}
              >
                {sym}
              </button>
            ))}
          </div>
        </div>
      </div>
    </header>
  );
}
