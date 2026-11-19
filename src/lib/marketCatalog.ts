export type UsExchange = 'NASDAQ' | 'NYSE' | 'AMEX';

export interface DirectoryEntry {
  ticker: string;
  name: string;
  exchange: UsExchange;
  sector: string;
  industry: string;
  ipoYear: number | null;
  lastSale: number | null;
  netChange: number | null;
  pctChange: number | null;
  volume: number;
  marketCap: number | null;
  country: string;
  isIpo: boolean;
  isDerivativeListing: boolean;
}

const DIRECTORY_CACHE_KEY = 'ainvest_us_directory_v1';
const DIRECTORY_TTL_MS = 12 * 60 * 60 * 1000; // 12 hours
const RECENT_IPO_MIN_YEAR = 2025;

const EXCHANGE_URLS: Array<{ exchange: UsExchange; url: string }> = [
  {
    exchange: 'NASDAQ',
    url: 'https://raw.githubusercontent.com/rreichel3/US-Stock-Symbols/main/nasdaq/nasdaq_full_tickers.json',
  },
  {
    exchange: 'NYSE',
    url: 'https://raw.githubusercontent.com/rreichel3/US-Stock-Symbols/main/nyse/nyse_full_tickers.json',
  },
  {
    exchange: 'AMEX',
    url: 'https://raw.githubusercontent.com/rreichel3/US-Stock-Symbols/main/amex/amex_full_tickers.json',
  },
];

interface RawUsTickerRow {
  symbol?: string;
  name?: string;
  lastsale?: string;
  netchange?: string;
  pctchange?: string;
  volume?: string;
  marketCap?: string;
  country?: string;
  ipoyear?: string;
  industry?: string;
  sector?: string;
}

/** Compact tuple stored in localStorage to stay well within 5MB browser quota */
type CompactTuple = [
  string, // 0: ticker
  string, // 1: name
  UsExchange, // 2: exchange
  string, // 3: sector
  string, // 4: industry
  number | null, // 5: ipoYear
  number | null, // 6: lastSale
  number | null, // 7: netChange
  number | null, // 8: pctChange
  number, // 9: volume
  number | null, // 10: marketCap
  string, // 11: country
];

function parseCurrency(val: unknown): number | null {
  if (typeof val !== 'string' && typeof val !== 'number') return null;
  const cleaned = String(val).replace(/[$,%\s,]/g, '');
  if (!cleaned) return null;
  const n = Number.parseFloat(cleaned);
  return Number.isFinite(n) ? n : null;
}

function cleanCompanyName(raw: string): string {
  return raw
    .replace(/\s+Common Stock.*$/i, '')
    .replace(/\s+Ordinary Shares?.*$/i, '')
    .replace(/\s+Class [A-Z] (Common|Ordinary).*$/i, '')
    .replace(/\s+American Depositary Shares.*$/i, ' (ADR)')
    .replace(/\s+Depositary Shares.*$/i, '')
    .trim();
}

function isDerivativeSymbol(symbol: string, rawName: string): boolean {
  if (symbol.includes('^') || symbol.includes('/')) return true;
  if (symbol.length >= 5 && /[WUR]$/.test(symbol)) return true;
  if (/\b(Warrant|Warrants|Right|Rights|Unit|Units)\b/i.test(rawName)) return true;
  return false;
}

function hydrateTuple(t: CompactTuple): DirectoryEntry {
  const ticker = t[0];
  const ipoYear = t[5];
  return {
    ticker,
    name: t[1],
    exchange: t[2],
    sector: t[3],
    industry: t[4],
    ipoYear,
    lastSale: t[6],
    netChange: t[7],
    pctChange: t[8],
    volume: t[9],
    marketCap: t[10],
    country: t[11],
    isIpo: ipoYear !== null && ipoYear >= RECENT_IPO_MIN_YEAR,
    isDerivativeListing: isDerivativeSymbol(ticker, t[1]),
  };
}

function loadCachedDirectory(): DirectoryEntry[] | null {
  try {
    const raw = window.localStorage.getItem(DIRECTORY_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { savedAt?: number; rows?: CompactTuple[] };
    if (
      !parsed ||
      typeof parsed.savedAt !== 'number' ||
      !Array.isArray(parsed.rows) ||
      Date.now() - parsed.savedAt > DIRECTORY_TTL_MS
    ) {
      return null;
    }
    return parsed.rows.map(hydrateTuple);
  } catch {
    return null;
  }
}

function saveCachedDirectory(entries: DirectoryEntry[]): void {
  try {
    // Store primary common stocks & ETFs first (skip warrants/rights/preferreds to keep cache compact ~700KB)
    const rows: CompactTuple[] = entries
      .filter((e) => !e.isDerivativeListing)
      .map((e) => [
        e.ticker,
        e.name,
        e.exchange,
        e.sector,
        e.industry,
        e.ipoYear,
        e.lastSale,
        e.netChange,
        e.pctChange,
        e.volume,
        e.marketCap,
        e.country,
      ]);
    window.localStorage.setItem(
      DIRECTORY_CACHE_KEY,
      JSON.stringify({ savedAt: Date.now(), rows }),
    );
  } catch {
    // Ignore quota errors
  }
}

let inMemoryDirectory: DirectoryEntry[] | null = null;
let pendingFetch: Promise<DirectoryEntry[]> | null = null;

export function getCachedDirectorySync(): DirectoryEntry[] {
  if (inMemoryDirectory) return inMemoryDirectory;
  const cached = loadCachedDirectory();
  if (cached) {
    inMemoryDirectory = cached;
    return cached;
  }
  return [];
}

/**
 * Loads the complete NASDAQ + NYSE + AMEX US equities & IPO directory (~7,000+ symbols).
 * Served over GitHub raw CDN (CORS-enabled, updated nightly at midnight ET).
 */
export async function loadUsMarketDirectory(
  signal?: AbortSignal,
): Promise<DirectoryEntry[]> {
  if (inMemoryDirectory && inMemoryDirectory.length > 0) {
    return inMemoryDirectory;
  }

  const cached = loadCachedDirectory();
  if (cached && cached.length > 0) {
    inMemoryDirectory = cached;
    return cached;
  }

  if (pendingFetch) return pendingFetch;

  pendingFetch = (async () => {
    const results = await Promise.allSettled(
      EXCHANGE_URLS.map(async ({ exchange, url }) => {
        const res = await fetch(url, { signal });
        if (!res.ok) return [] as DirectoryEntry[];
        const rawList = (await res.json()) as RawUsTickerRow[];
        if (!Array.isArray(rawList)) return [] as DirectoryEntry[];

        const out: DirectoryEntry[] = [];
        for (const row of rawList) {
          const rawSymbol = (row.symbol ?? '').trim().toUpperCase();
          if (!rawSymbol || rawSymbol.length > 12) continue;
          const rawName = (row.name ?? rawSymbol).trim();
          const normalizedTicker = rawSymbol.replace(/\//g, '.');
          const ipoYearNum = row.ipoyear ? Number.parseInt(row.ipoyear, 10) : NaN;
          const ipoYear =
            Number.isFinite(ipoYearNum) && ipoYearNum >= 1900 && ipoYearNum <= 2100
              ? ipoYearNum
              : null;
          const lastSale = parseCurrency(row.lastsale);
          const marketCapRaw = parseCurrency(row.marketCap);
          const marketCap = marketCapRaw && marketCapRaw > 0 ? marketCapRaw : null;
          const volume = parseCurrency(row.volume) ?? 0;

          out.push({
            ticker: normalizedTicker,
            name: cleanCompanyName(rawName) || normalizedTicker,
            exchange,
            sector: (row.sector ?? '').trim() || 'Equities',
            industry: (row.industry ?? '').trim(),
            ipoYear,
            lastSale: lastSale && lastSale > 0 ? lastSale : null,
            netChange: parseCurrency(row.netchange),
            pctChange: parseCurrency(row.pctchange),
            volume,
            marketCap,
            country: (row.country ?? '').trim(),
            isIpo: ipoYear !== null && ipoYear >= RECENT_IPO_MIN_YEAR,
            isDerivativeListing: isDerivativeSymbol(rawSymbol, rawName),
          });
        }
        return out;
      }),
    );

    const byTicker = new Map<string, DirectoryEntry>();
    for (const r of results) {
      if (r.status !== 'fulfilled') continue;
      for (const entry of r.value) {
        const existing = byTicker.get(entry.ticker);
        if (!existing || (entry.marketCap ?? 0) > (existing.marketCap ?? 0)) {
          byTicker.set(entry.ticker, entry);
        }
      }
    }

    const merged = Array.from(byTicker.values()).sort(
      (a, b) => (b.marketCap ?? 0) - (a.marketCap ?? 0) || b.volume - a.volume,
    );

    if (merged.length > 0) {
      inMemoryDirectory = merged;
      saveCachedDirectory(merged);
    }
    return merged;
  })().finally(() => {
    pendingFetch = null;
  });

  return pendingFetch;
}
