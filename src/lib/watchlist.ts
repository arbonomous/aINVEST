const PINNED_STORAGE_KEY = 'ainvest_pinned_tickers_v1';
const RECENT_STORAGE_KEY = 'ainvest_recent_tickers_v1';

export function loadPinnedTickers(): string[] {
  try {
    const raw = window.localStorage.getItem(PINNED_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((x): x is string => typeof x === 'string' && x.length > 0 && x.length <= 16)
      .slice(0, 24);
  } catch {
    return [];
  }
}

export function savePinnedTickers(tickers: string[]): void {
  try {
    window.localStorage.setItem(PINNED_STORAGE_KEY, JSON.stringify(tickers.slice(0, 24)));
  } catch {
    // Ignore storage quota errors
  }
}

export function loadRecentTickers(): string[] {
  try {
    const raw = window.localStorage.getItem(RECENT_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((x): x is string => typeof x === 'string' && x.length > 0 && x.length <= 16)
      .slice(0, 12);
  } catch {
    return [];
  }
}

export function saveRecentTickers(tickers: string[]): void {
  try {
    window.localStorage.setItem(RECENT_STORAGE_KEY, JSON.stringify(tickers.slice(0, 12)));
  } catch {
    // Ignore storage quota errors
  }
}
