export interface NasdaqLaggardItem {
  symbol: string;
  name: string;
  sector: string;
  industry: string;
  lastSale: number;
  pctChange: number;
  marketCap: number;
  week52High: number | null;
  week52Low: number | null;
  drawdown52wPct: number | null;
  oneYrTarget: number | null;
  upsideToTargetPct: number | null;
  peRatio: number | null;
  divYield: number | null;
  valueScore: number;
}

export interface NasdaqLaggardsSnapshot {
  generatedAt: string;
  source: string;
  totalNasdaqScreened: number;
  count: number;
  laggards: NasdaqLaggardItem[];
}

let cachedSnapshot: NasdaqLaggardsSnapshot | null = null;

export async function fetchNasdaqLaggardsSnapshot(
  signal?: AbortSignal,
): Promise<NasdaqLaggardsSnapshot | null> {
  if (cachedSnapshot) return cachedSnapshot;
  try {
    const res = await fetch('./data/nasdaq-laggards.json', {
      signal,
      cache: 'no-cache',
    });
    if (!res.ok) return null;
    const data = (await res.json()) as NasdaqLaggardsSnapshot;
    if (!data || !Array.isArray(data.laggards)) return null;
    cachedSnapshot = data;
    return data;
  } catch {
    return null;
  }
}
