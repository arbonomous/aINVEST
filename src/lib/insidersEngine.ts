export type PoliticalParty = 'D' | 'R' | 'I';
export type CongressChamber = 'House' | 'Senate';
export type TradeAction = 'BUY' | 'SELL';
export type SqueezeRegime = 'EXTREME' | 'HIGH' | 'ELEVATED' | 'NORMAL';

export interface CongressTrade {
  id: string;
  politician: string;
  party: PoliticalParty;
  chamber: CongressChamber;
  state: string;
  committees: string[];
  ticker: string;
  assetName: string;
  action: TradeAction;
  amountLabel: string;
  amountMinUsd: number;
  amountMaxUsd: number;
  tradeDate: string; // YYYY-MM-DD
  filedDate: string; // YYYY-MM-DD
  lagDays: number;
  sourceUrl: string;
}

export interface InsiderForm4Trade {
  id: string;
  ticker: string;
  companyName: string;
  insiderName: string;
  role: string;
  isCsuite: boolean;
  action: TradeAction;
  shares: number;
  price: number;
  valueUsd: number;
  tradeDate: string; // YYYY-MM-DD
  filedDate: string; // YYYY-MM-DD
  filingUrl: string;
}

export interface ShortSqueezeRow {
  ticker: string;
  companyName: string;
  tradeDate: string;
  shortVolume: number;
  shortExemptVolume: number;
  totalVolume: number;
  shortVolPct: number;
  ftdShares: number;
  ftdUsd: number;
  ftdDate: string;
  squeezeScore: number; // 0..100
  regime: SqueezeRegime;
  signals: string[];
}

export interface PillarMeta {
  syncedAt: string; // ISO timestamp
  sourceLabel: string;
  mode: 'LIVE OFFICIAL' | 'SNAPSHOT';
  recordCount: number;
}

export interface InsidersBundle {
  generatedAt: string;
  meta: {
    congress: PillarMeta;
    form4: PillarMeta;
    squeeze: PillarMeta;
  };
  congress: CongressTrade[];
  form4: InsiderForm4Trade[];
  squeeze: ShortSqueezeRow[];
}

export interface ClusterBuySignal {
  ticker: string;
  companyName: string;
  insiderCount: number;
  totalBuyUsd: number;
  insiders: Array<{ name: string; role: string; valueUsd: number }>;
  latestDate: string;
}

export interface PoliticianLeader {
  politician: string;
  party: PoliticalParty;
  chamber: CongressChamber;
  state: string;
  committees: string[];
  tradeCount: number;
  buyCount: number;
  sellCount: number;
  estVolumeUsd: number;
  topTickers: string[];
  latestDate: string;
}

export interface TickerInsidersDigest {
  ticker: string;
  congressTrades: CongressTrade[];
  form4Trades: InsiderForm4Trade[];
  clusterBuy: ClusterBuySignal | null;
  squeeze: ShortSqueezeRow | null;
}

const CACHE_TTL_MS = 5 * 60_000;
let cachedBundle: { data: InsidersBundle; fetchedAt: number } | null = null;

export function createEmptyInsidersBundle(): InsidersBundle {
  const now = new Date().toISOString();
  return {
    generatedAt: now,
    meta: {
      congress: {
        syncedAt: now,
        sourceLabel: 'US House & Senate STOCK Act',
        mode: 'SNAPSHOT',
        recordCount: 0,
      },
      form4: {
        syncedAt: now,
        sourceLabel: 'SEC EDGAR Form 4',
        mode: 'SNAPSHOT',
        recordCount: 0,
      },
      squeeze: {
        syncedAt: now,
        sourceLabel: 'FINRA Reg SHO & SEC FTD',
        mode: 'SNAPSHOT',
        recordCount: 0,
      },
    },
    congress: [],
    form4: [],
    squeeze: [],
  };
}

export async function fetchInsidersBundle(
  forceRefresh = false,
  signal?: AbortSignal,
): Promise<InsidersBundle> {
  if (
    !forceRefresh &&
    cachedBundle &&
    Date.now() - cachedBundle.fetchedAt < CACHE_TTL_MS
  ) {
    return cachedBundle.data;
  }

  try {
    const res = await fetch('./data/insiders-bundle.json', {
      cache: forceRefresh ? 'no-cache' : 'default',
      signal,
    });
    if (!res.ok) {
      return cachedBundle?.data ?? createEmptyInsidersBundle();
    }
    const json = (await res.json()) as Partial<InsidersBundle>;
    const normalized: InsidersBundle = {
      generatedAt: json.generatedAt ?? new Date().toISOString(),
      meta: json.meta ?? createEmptyInsidersBundle().meta,
      congress: Array.isArray(json.congress) ? json.congress : [],
      form4: Array.isArray(json.form4) ? json.form4 : [],
      squeeze: Array.isArray(json.squeeze) ? json.squeeze : [],
    };
    cachedBundle = { data: normalized, fetchedAt: Date.now() };
    return normalized;
  } catch {
    return cachedBundle?.data ?? createEmptyInsidersBundle();
  }
}

/**
 * Automatically detects corporate C-Suite / Insider Cluster Buys:
 * 2 or more distinct executives/directors making open-market purchases
 * on the same ticker within a 14-day window.
 */
export function detectClusterBuys(
  trades: InsiderForm4Trade[],
  windowDays = 14,
): ClusterBuySignal[] {
  const buysByTicker = new Map<string, InsiderForm4Trade[]>();
  for (const t of trades) {
    if (t.action !== 'BUY' || t.valueUsd <= 0) continue;
    const list = buysByTicker.get(t.ticker) ?? [];
    list.push(t);
    buysByTicker.set(t.ticker, list);
  }

  const clusters: ClusterBuySignal[] = [];

  for (const [ticker, list] of buysByTicker.entries()) {
    const sorted = [...list].sort((a, b) =>
      b.tradeDate.localeCompare(a.tradeDate),
    );
    const newestMs = Date.parse(`${sorted[0].tradeDate}T00:00:00Z`);
    const cutoffMs = Number.isFinite(newestMs)
      ? newestMs - windowDays * 86_400_000
      : 0;

    const inWindow = sorted.filter((t) => {
      const ms = Date.parse(`${t.tradeDate}T00:00:00Z`);
      return !Number.isFinite(ms) || ms >= cutoffMs;
    });

    const byPerson = new Map<
      string,
      { name: string; role: string; valueUsd: number }
    >();
    for (const t of inWindow) {
      const key = t.insiderName.trim().toLowerCase();
      const prev = byPerson.get(key);
      if (prev) {
        prev.valueUsd += t.valueUsd;
      } else {
        byPerson.set(key, {
          name: t.insiderName,
          role: t.role,
          valueUsd: t.valueUsd,
        });
      }
    }

    if (byPerson.size >= 2) {
      const insiders = Array.from(byPerson.values()).sort(
        (a, b) => b.valueUsd - a.valueUsd,
      );
      const totalBuyUsd = insiders.reduce((acc, p) => acc + p.valueUsd, 0);
      clusters.push({
        ticker,
        companyName: sorted[0].companyName,
        insiderCount: insiders.length,
        totalBuyUsd,
        insiders,
        latestDate: sorted[0].tradeDate,
      });
    }
  }

  return clusters.sort(
    (a, b) => b.insiderCount - a.insiderCount || b.totalBuyUsd - a.totalBuyUsd,
  );
}

/**
 * Aggregates Congress STOCK Act disclosures into the Most Active Lawmakers Leaderboard.
 */
export function computePoliticianLeaderboard(
  trades: CongressTrade[],
): PoliticianLeader[] {
  const map = new Map<
    string,
    {
      politician: string;
      party: PoliticalParty;
      chamber: CongressChamber;
      state: string;
      committees: Set<string>;
      tradeCount: number;
      buyCount: number;
      sellCount: number;
      estVolumeUsd: number;
      tickerCounts: Map<string, number>;
      latestDate: string;
    }
  >();

  for (const t of trades) {
    const key = t.politician.trim();
    if (!key) continue;
    const entry = map.get(key) ?? {
      politician: key,
      party: t.party,
      chamber: t.chamber,
      state: t.state,
      committees: new Set<string>(),
      tradeCount: 0,
      buyCount: 0,
      sellCount: 0,
      estVolumeUsd: 0,
      tickerCounts: new Map<string, number>(),
      latestDate: t.tradeDate,
    };

    for (const c of t.committees) entry.committees.add(c);
    entry.tradeCount += 1;
    if (t.action === 'BUY') entry.buyCount += 1;
    else entry.sellCount += 1;
    entry.estVolumeUsd += (t.amountMinUsd + t.amountMaxUsd) / 2;
    entry.tickerCounts.set(
      t.ticker,
      (entry.tickerCounts.get(t.ticker) ?? 0) + 1,
    );
    if (t.tradeDate > entry.latestDate) entry.latestDate = t.tradeDate;

    map.set(key, entry);
  }

  return Array.from(map.values())
    .map((e) => ({
      politician: e.politician,
      party: e.party,
      chamber: e.chamber,
      state: e.state,
      committees: Array.from(e.committees).slice(0, 2),
      tradeCount: e.tradeCount,
      buyCount: e.buyCount,
      sellCount: e.sellCount,
      estVolumeUsd: Math.round(e.estVolumeUsd),
      topTickers: Array.from(e.tickerCounts.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 4)
        .map(([sym]) => sym),
      latestDate: e.latestDate,
    }))
    .sort((a, b) => b.estVolumeUsd - a.estVolumeUsd || b.tradeCount - a.tradeCount);
}

/**
 * Computes composite Short Squeeze Score (0-100) from FINRA daily short volume
 * and SEC Failures-to-Deliver (FTD) pressure.
 */
export function computeSqueezeScore(params: {
  shortVolPct: number;
  shortExemptRatioPct: number;
  ftdUsd: number;
}): { score: number; regime: SqueezeRegime; signals: string[] } {
  const { shortVolPct, shortExemptRatioPct, ftdUsd } = params;
  const signals: string[] = [];

  // 0..56 pts from FINRA Short Volume % (baseline ~38%, elevated >50%, extreme >62%)
  const shortPts = Math.max(0, Math.min(56, (shortVolPct - 32) * 1.45));
  if (shortVolPct >= 60) signals.push('SHORT VOL >60%');
  else if (shortVolPct >= 50) signals.push('SHORT VOL >50%');

  // 0..26 pts from Reg SHO Short Exempt spikes (>2% of total vol is institutional exemption surge)
  const exemptPts = Math.max(0, Math.min(26, shortExemptRatioPct * 6.5));
  if (shortExemptRatioPct >= 2.0) signals.push('REG SHO EXEMPT SPIKE');

  // 0..26 pts from SEC FTD dollar notional
  const ftdPts =
    ftdUsd >= 250_000
      ? Math.max(0, Math.min(26, (Math.log10(ftdUsd) - 5) * 9.5))
      : 0;
  if (ftdUsd >= 10_000_000) signals.push('FTD >$10M');
  else if (ftdUsd >= 2_000_000) signals.push('FTD >$2M');

  const score = Math.round(Math.max(10, Math.min(99, shortPts + exemptPts + ftdPts)));
  const regime: SqueezeRegime =
    score >= 80
      ? 'EXTREME'
      : score >= 65
        ? 'HIGH'
        : score >= 50
          ? 'ELEVATED'
          : 'NORMAL';

  if (signals.length === 0) signals.push('ACTIVE SHORT FLOW');
  return { score, regime, signals: signals.slice(0, 3) };
}

export function getTickerInsidersDigest(
  bundle: InsidersBundle | null,
  ticker: string,
): TickerInsidersDigest {
  const clean = ticker.trim().toUpperCase().replace(/^XYZ:/, '');
  if (!bundle || !clean) {
    return {
      ticker: clean,
      congressTrades: [],
      form4Trades: [],
      clusterBuy: null,
      squeeze: null,
    };
  }

  const congressTrades = bundle.congress.filter((c) => c.ticker === clean);
  const form4Trades = bundle.form4.filter((f) => f.ticker === clean);
  const clusterBuy =
    detectClusterBuys(form4Trades).find((c) => c.ticker === clean) ?? null;
  const squeeze = bundle.squeeze.find((s) => s.ticker === clean) ?? null;

  return {
    ticker: clean,
    congressTrades,
    form4Trades,
    clusterBuy,
    squeeze,
  };
}
