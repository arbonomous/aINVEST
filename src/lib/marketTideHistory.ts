export interface MarketTidePoint {
  ts: number;
  label: string; // HH:MM
  callPrem: number;
  putPrem: number;
  spyPx: number | null;
}

const TIDE_STORAGE_KEY = 'ainvest_market_tide_history_v1';

function todayEtKey(): string {
  try {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/New_York',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date());
  } catch {
    return new Date().toISOString().slice(0, 10);
  }
}

export function loadTodayMarketTideHistory(): MarketTidePoint[] {
  try {
    const raw = window.localStorage.getItem(TIDE_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as { day?: string; points?: MarketTidePoint[] };
    if (parsed.day !== todayEtKey() || !Array.isArray(parsed.points)) return [];
    return parsed.points.slice(-80);
  } catch {
    return [];
  }
}

export function appendMarketTideHistory(
  prev: MarketTidePoint[],
  callPrem: number,
  putPrem: number,
  spyPx: number | null,
): MarketTidePoint[] {
  if (callPrem <= 0 && putPrem <= 0) return prev;
  const now = Date.now();
  const label = new Date(now).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  const last = prev[prev.length - 1];
  if (
    last &&
    now - last.ts < 30_000 &&
    Math.abs(last.callPrem - callPrem) < 1 &&
    Math.abs(last.putPrem - putPrem) < 1
  ) {
    return prev;
  }
  const next = [...prev, { ts: now, label, callPrem, putPrem, spyPx }].slice(-80);
  try {
    window.localStorage.setItem(
      TIDE_STORAGE_KEY,
      JSON.stringify({ day: todayEtKey(), points: next }),
    );
  } catch {
    // Ignore storage quota issues
  }
  return next;
}
