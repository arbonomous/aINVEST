import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, Search, Share2 } from 'lucide-react';
import { FLAGSHIP_MAP, FLAGSHIP_TICKERS } from '../data/tickers';
import type { HlAssetCtx } from '../lib/hyperliquidFeed';
import { THEMES, type ThemeId } from '../lib/themes';

interface TerminalHeaderProps {
  activeTicker: string;
  ctxMap: Record<string, HlAssetCtx>;
  onSelectTicker: (ticker: string) => void;
  onShareLink: () => void;
  copied: boolean;
  themeId: ThemeId;
  onSelectTheme: (theme: ThemeId) => void;
}

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
  onSelectTicker,
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

  const searchResults = useMemo(() => {
    const q = query.trim().toUpperCase();
    const allTickers = new Set<string>(FLAGSHIP_TICKERS.map((t) => t.ticker));
    for (const k of Object.keys(ctxMap)) allTickers.add(k);

    const items = Array.from(allTickers).map((ticker) => {
      const meta = FLAGSHIP_MAP[ticker];
      const ctx = ctxMap[ticker];
      return {
        ticker,
        name:
          meta?.name ??
          (ticker === 'XYZ100'
            ? 'Nasdaq 100 Index'
            : ticker === 'SP500'
              ? 'S&P 500 Index'
              : ticker),
        sector: meta?.sector ?? '24/7 Equity / Macro Perp',
        price: ctx?.markPx ?? null,
        vol: ctx?.dayNtlVlm ?? 0,
        isFlagship: Boolean(meta),
      };
    });

    const filtered = q
      ? items.filter(
          (i) =>
            i.ticker.includes(q) ||
            i.name.toUpperCase().includes(q) ||
            i.sector.toUpperCase().includes(q),
        )
      : items;

    return filtered
      .sort((a, b) => {
        if (q) {
          const aExact = a.ticker === q ? 1 : 0;
          const bExact = b.ticker === q ? 1 : 0;
          if (aExact !== bExact) return bExact - aExact;
        }
        if (a.isFlagship !== b.isFlagship) return a.isFlagship ? -1 : 1;
        return b.vol - a.vol;
      })
      .slice(0, 12);
  }, [query, ctxMap]);

  const pickTicker = (ticker: string) => {
    onSelectTicker(ticker);
    setQuery('');
    setOpenSearch(false);
    inputRef.current?.blur();
  };

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
            <span>0-DELAY LIVE</span>
          </div>
        </div>

        {/* Multi-Ticker Search Bar (⌘K) */}
        <div ref={searchWrapRef} className="ticker-search-wrap">
          <Search size={13} className="ticker-search-icon" aria-hidden="true" />
          <input
            ref={inputRef}
            id="ainvest-ticker-search"
            type="text"
            className="ticker-search-input mono"
            placeholder={`Search ${Object.keys(ctxMap).length || 100}+ live tickers (ANT, NVDA, TSLA…)`}
            value={query}
            onFocus={() => setOpenSearch(true)}
            onChange={(e) => {
              setQuery(e.target.value);
              setOpenSearch(true);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && searchResults.length > 0) {
                e.preventDefault();
                pickTicker(searchResults[0].ticker);
              }
            }}
            aria-label="Search live stock tickers"
          />
          <span className="search-kbd mono" aria-hidden="true">
            ⌘K
          </span>

          {openSearch && (
            <div
              className="search-dropdown"
              role="listbox"
              aria-label="Matching live tickers"
            >
              {searchResults.length === 0 ? (
                <div className="search-empty mono">
                  No live market matches &ldquo;{query}&rdquo;
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
                      <span className="search-opt-name">{item.name}</span>
                    </div>
                    <span className="search-opt-price mono">
                      {item.price !== null ? `$${item.price.toFixed(2)}` : '—'}
                    </span>
                  </button>
                ))
              )}
            </div>
          )}
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
