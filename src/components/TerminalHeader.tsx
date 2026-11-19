import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowRight, Check, Flame, Globe, Search, Share2 } from 'lucide-react';
import { CURATED_MAP, FEATURED_IPOS, FLAGSHIP_TICKERS } from '../data/tickers';
import type { HlAssetCtx } from '../lib/hyperliquidFeed';
import type { DirectoryEntry } from '../lib/marketCatalog';
import { THEMES, type ThemeId } from '../lib/themes';
import type { ExplorerTab } from './MarketExplorerModal';

interface TerminalHeaderProps {
  activeTicker: string;
  ctxMap: Record<string, HlAssetCtx>;
  directory: DirectoryEntry[];
  directoryMap: Record<string, DirectoryEntry>;
  onSelectTicker: (ticker: string) => void;
  onOpenExplorer: (tab?: ExplorerTab) => void;
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
  activeTicker,
  ctxMap,
  directory,
  directoryMap,
  onSelectTicker,
  onOpenExplorer,
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

  // Cmd/Ctrl + K focuses ticker search
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpenSearch(true);
        inputRef.current?.focus();
      } else if (e.key === 'Escape') {
        setOpenSearch(false);
        inputRef.current?.blur();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

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
      <div className="terminal-header-inner">
        <div className="brand-cluster">
          <div className="brand-mark" aria-hidden="true">
            a<span className="text-emerald">I</span>
          </div>
          <h1 className="brand-title">
            <span>
              a<span className="text-emerald">INVEST</span>
            </span>
            <span className="brand-slash">//</span>
            <span>LIVE TERMINAL</span>
          </h1>
          <div className="live-status-pill" role="status" aria-live="polite">
            <span className="pulse-dot" aria-hidden="true" />
            <span>ALL STOCKS &amp; IPOs</span>
          </div>
        </div>

        {/* Universal Stock & IPO Search Bar (⌘K) + Explorer Trigger */}
        <div className="header-discovery-group">
          <div ref={searchWrapRef} className="ticker-search-wrap">
            <Search size={13} className="ticker-search-icon" aria-hidden="true" />
            <input
              ref={inputRef}
              id="ainvest-ticker-search"
              type="text"
              className="ticker-search-input mono"
              placeholder={`Search ${totalMarketsLabel} (ANT, SPCX, JPM, DIS…)`}
              value={query}
              onFocus={() => setOpenSearch(true)}
              onChange={(e) => {
                setQuery(e.target.value);
                setOpenSearch(true);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  if (searchResults.length > 0) {
                    pickTicker(searchResults[0].ticker);
                  } else if (VALID_TICKER_RE.test(cleanQuery)) {
                    pickTicker(cleanQuery);
                  }
                }
              }}
              aria-label="Search all stocks and IPO tickers"
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

        <div className="header-controls">
          <div className="session-telemetry" aria-label="Active room & Eastern Time">
            <span>ROOM: {activeTicker}</span>
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
            id="share-room-btn"
            type="button"
            className={`share-btn${copied ? ' copied' : ''}`}
            onClick={onShareLink}
          >
            {copied ? <Check size={14} strokeWidth={2.2} /> : <Share2 size={14} strokeWidth={2} />}
            <span>{copied ? 'Copied' : `Share ${activeTicker}`}</span>
          </button>
        </div>
      </div>
    </header>
  );
}
