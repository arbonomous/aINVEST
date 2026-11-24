import type { TickerOptionsSummary } from './whaleFlowEngine';

export interface PreSyncedOptionsItem {
  ticker: string;
  spotPrice: number;
  callVolume: number;
  putVolume: number;
  putCallVolRatio: number;
  callPremiumUsd: number;
  putPremiumUsd: number;
  netPremiumUsd: number;
  flowBias: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
  netGammaRegime: 'PIN (+GEX)' | 'VOLATILE (-GEX)' | 'NEUTRAL';
  netGexUsd: number;
  callWall: number | null;
  putWall: number | null;
  expectedMovePct: number | null;
  expectedMoveExp: string | null;
}

interface ConfluenceOptionsSnapshot {
  generatedAt: string;
  source: string;
  count: number;
  tickers: Record<string, PreSyncedOptionsItem>;
}

let cachedMap: Record<string, TickerOptionsSummary> | null = null;

function toOptionsSummary(
  item: PreSyncedOptionsItem,
  updatedAt: number,
): TickerOptionsSummary {
  return {
    ticker: item.ticker,
    spotPrice: item.spotPrice,
    updatedAt,
    callVolume: item.callVolume,
    putVolume: item.putVolume,
    putCallVolRatio: item.putCallVolRatio,
    callPremiumUsd: item.callPremiumUsd,
    putPremiumUsd: item.putPremiumUsd,
    netPremiumUsd: item.netPremiumUsd,
    flowBias: item.flowBias,
    maxPainStrike: null,
    maxPainExpiration: null,
    netGammaRegime: item.netGammaRegime,
    netGexUsd: item.netGexUsd,
    callWall: item.callWall,
    putWall: item.putWall,
    gammaFlip: null,
    expectedMoveUsd:
      item.expectedMovePct != null
        ? Number(((item.spotPrice * item.expectedMovePct) / 100).toFixed(2))
        : null,
    expectedMovePct: item.expectedMovePct,
    expectedMoveExp: item.expectedMoveExp,
    ivSkewPct: null,
    gexProfile: [],
    ivTermStructure: [],
    unusualContracts: [],
    source: 'cboe',
  };
}

/**
 * Loads the GitHub Actions pre-synced CBOE options/GEX snapshot once per session
 * so all 5 Confluence pillars (including WHALE) light up immediately on page load.
 */
export async function fetchConfluenceOptionsMap(
  signal?: AbortSignal,
): Promise<Record<string, TickerOptionsSummary>> {
  if (cachedMap) return cachedMap;
  try {
    const res = await fetch('./data/confluence-options.json', {
      signal,
      cache: 'no-cache',
    });
    if (!res.ok) return {};
    const data = (await res.json()) as ConfluenceOptionsSnapshot;
    const ts = Date.parse(data.generatedAt) || Date.now();
    const out: Record<string, TickerOptionsSummary> = {};
    for (const [sym, item] of Object.entries(data.tickers ?? {})) {
      out[sym.toUpperCase()] = toOptionsSummary(item, ts);
    }
    cachedMap = out;
    return out;
  } catch {
    return {};
  }
}
