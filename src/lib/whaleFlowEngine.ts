import type { HlAssetCtx } from './hyperliquidFeed';
import type { DirectoryEntry } from './marketCatalog';
import type { MarketQuote } from './universalFeed';

export type OptionType = 'CALL' | 'PUT';

export interface OptionContractFlow {
  id: string;
  ticker: string;
  contract: string;
  type: OptionType;
  expiration: string; // YYYY-MM-DD
  dte: number;
  strike: number;
  spotPrice: number;
  bid: number;
  ask: number;
  mark: number;
  volume: number;
  openInterest: number;
  volOiRatio: number;
  estPremiumUsd: number;
  iv: number | null; // percentage e.g. 54.2
  delta: number | null;
  gamma: number | null;
  moneyness: 'ITM' | 'ATM' | 'OTM';
  unusualScore: number;
  tags: string[];
}

export interface TickerOptionsSummary {
  ticker: string;
  spotPrice: number;
  updatedAt: number;
  callVolume: number;
  putVolume: number;
  putCallVolRatio: number;
  callPremiumUsd: number;
  putPremiumUsd: number;
  netPremiumUsd: number;
  flowBias: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
  maxPainStrike: number | null;
  maxPainExpiration: string | null;
  netGammaRegime: 'PIN (+GEX)' | 'VOLATILE (-GEX)' | 'NEUTRAL';
  unusualContracts: OptionContractFlow[];
  source: 'cboe' | 'none';
}

export interface WhaleTapePrint {
  id: string;
  coin: string;
  ticker: string;
  side: 'BUY' | 'SELL';
  price: number;
  size: number;
  notionalUsd: number;
  time: number; // unix ms
  isTwap: boolean;
  walletTag: string | null;
  tier: 'MEGA' | 'WHALE' | 'BLOCK' | 'TAPE';
}

export interface SectorHeatItem {
  sector: string;
  avgPct: number;
  leaders: Array<{ ticker: string; pct: number; price: number | null }>;
}

export interface MarketTideSummary {
  score: number; // -100 to +100
  verdict: 'RISK-ON BULLISH' | 'RISK-OFF BEARISH' | 'ROTATION / MIXED';
  callPremiumUsd: number;
  putPremiumUsd: number;
  netPremiumUsd: number;
  advancers: number;
  decliners: number;
  sectors: SectorHeatItem[];
}

const HL_INFO_URL = 'https://api.hyperliquid.xyz/info';
const HL_WS_URL = 'wss://api.hyperliquid.xyz/ws';
const ZERO_HASH = '0x0000000000000000000000000000000000000000000000000000000000000000';

const CORS_RELAYS: Array<(targetUrl: string) => string> = [
  (u) => `https://corsproxy.io/?url=${encodeURIComponent(u)}`,
  (u) => `https://api.allorigins.win/raw?url=${encodeURIComponent(u)}`,
  (u) => `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(u)}`,
];

const OPTIONS_CACHE_TTL_MS = 2 * 60_000;
const optionsCache = new Map<
  string,
  { summary: TickerOptionsSummary; fetchedAt: number }
>();

export function toCboeOptionSymbol(ticker: string): string {
  const clean = ticker.trim().toUpperCase().replace(/^XYZ:/, '');
  if (clean === 'SP500' || clean === '^GSPC') return 'SPY';
  if (clean === 'XYZ100' || clean === '^NDX') return 'QQQ';
  return clean.replace(/\./g, '');
}

const OCC_SYMBOL_RE = /^([A-Z]{1,6})(\d{2})(\d{2})(\d{2})([CP])(\d{8})$/;

export function parseOccSymbol(raw: string): {
  root: string;
  expiration: string;
  type: OptionType;
  strike: number;
} | null {
  const clean = raw.trim().toUpperCase();
  const match = OCC_SYMBOL_RE.exec(clean);
  if (!match) return null;
  const [, root, yy, mm, dd, cp, strikeRaw] = match;
  const strike = Number(strikeRaw) / 1000;
  if (!Number.isFinite(strike) || strike <= 0) return null;
  return {
    root,
    expiration: `20${yy}-${mm}-${dd}`,
    type: cp === 'C' ? 'CALL' : 'PUT',
    strike,
  };
}

function numOrZero(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function numOrNull(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function daysUntilExpiration(expIso: string): number {
  const expMs = Date.parse(`${expIso}T20:00:00Z`);
  if (!Number.isFinite(expMs)) return 0;
  return Math.max(0, Math.ceil((expMs - Date.now()) / 86_400_000));
}

function computeMaxPain(
  contracts: OptionContractFlow[],
): { strike: number | null; expiration: string | null } {
  if (contracts.length === 0) return { strike: null, expiration: null };

  // Group by expiration and pick nearest expiration with substantial OI
  const byExp = new Map<string, OptionContractFlow[]>();
  for (const c of contracts) {
    if (c.openInterest <= 0) continue;
    const arr = byExp.get(c.expiration) ?? [];
    arr.push(c);
    byExp.set(c.expiration, arr);
  }

  const sortedExps = Array.from(byExp.keys()).sort();
  let targetExp: string | null = null;
  let bestList: OptionContractFlow[] = [];
  for (const exp of sortedExps) {
    const list = byExp.get(exp) ?? [];
    const totalOi = list.reduce((acc, item) => acc + item.openInterest, 0);
    if (totalOi >= 500 || bestList.length === 0) {
      targetExp = exp;
      bestList = list;
      if (totalOi >= 500) break;
    }
  }
  if (!targetExp || bestList.length === 0) {
    return { strike: null, expiration: null };
  }

  const strikes = Array.from(new Set(bestList.map((c) => c.strike))).sort(
    (a, b) => a - b,
  );
  if (strikes.length === 0) return { strike: null, expiration: targetExp };

  let bestStrike = strikes[0];
  let minPayout = Number.POSITIVE_INFINITY;

  for (const testStrike of strikes) {
    let payout = 0;
    for (const c of bestList) {
      if (c.type === 'CALL' && testStrike > c.strike) {
        payout += (testStrike - c.strike) * c.openInterest;
      } else if (c.type === 'PUT' && testStrike < c.strike) {
        payout += (c.strike - testStrike) * c.openInterest;
      }
    }
    if (payout < minPayout) {
      minPayout = payout;
      bestStrike = testStrike;
    }
  }

  return { strike: bestStrike, expiration: targetExp };
}

export function analyzeCboeOptionsPayload(
  displayTicker: string,
  payload: Record<string, unknown>,
  fallbackSpot?: number | null,
): TickerOptionsSummary | null {
  const dataObj = payload.data as Record<string, unknown> | undefined;
  const rawOptions = Array.isArray(dataObj?.options)
    ? (dataObj.options as Array<Record<string, unknown>>)
    : [];
  if (rawOptions.length === 0) return null;

  const spotPrice =
    numOrNull(dataObj?.current_price) ??
    numOrNull(dataObj?.close) ??
    fallbackSpot ??
    0;

  let callVolume = 0;
  let putVolume = 0;
  let callPremiumUsd = 0;
  let putPremiumUsd = 0;
  let netGexRaw = 0;
  const parsed: OptionContractFlow[] = [];

  for (const row of rawOptions) {
    const rawSym = String(row.option ?? '');
    const occ = parseOccSymbol(rawSym);
    if (!occ) continue;

    const volume = numOrZero(row.volume);
    const openInterest = numOrZero(row.open_interest);
    if (volume <= 0 && openInterest <= 0) continue;

    const bid = numOrZero(row.bid);
    const ask = numOrZero(row.ask);
    const last = numOrZero(row.last_trade_price);
    const mark =
      bid > 0 && ask > 0
        ? (bid + ask) / 2
        : last > 0
          ? last
          : Math.max(bid, ask);
    const ivRaw = numOrNull(row.iv);
    const iv =
      ivRaw !== null && ivRaw > 0
        ? Number((ivRaw <= 5 ? ivRaw * 100 : ivRaw).toFixed(1))
        : null;
    const delta = numOrNull(row.delta);
    const gamma = numOrNull(row.gamma);
    const dte = daysUntilExpiration(occ.expiration);
    const volOiRatio =
      openInterest > 0 ? volume / openInterest : volume >= 50 ? volume / 10 : 0;
    const estPremiumUsd = volume * mark * 100;

    if (occ.type === 'CALL') {
      callVolume += volume;
      callPremiumUsd += estPremiumUsd;
      if (gamma !== null) netGexRaw += gamma * openInterest;
    } else {
      putVolume += volume;
      putPremiumUsd += estPremiumUsd;
      if (gamma !== null) netGexRaw -= gamma * openInterest;
    }

    const effectiveSpot = spotPrice > 0 ? spotPrice : occ.strike;
    const distPct = Math.abs(occ.strike - effectiveSpot) / effectiveSpot;
    const moneyness: 'ITM' | 'ATM' | 'OTM' =
      distPct <= 0.015
        ? 'ATM'
        : occ.type === 'CALL'
          ? occ.strike < effectiveSpot
            ? 'ITM'
            : 'OTM'
          : occ.strike > effectiveSpot
            ? 'ITM'
            : 'OTM';

    const tags: string[] = [];
    if (volOiRatio >= 2 && volume >= 75) tags.push('VOL>OI');
    if (estPremiumUsd >= 250_000) tags.push('MEGA');
    else if (estPremiumUsd >= 50_000) tags.push('WHALE');
    if (dte <= 7 && volume >= 100) tags.push('0-7 DTE');
    if (moneyness === 'OTM' && volOiRatio >= 2.5 && estPremiumUsd >= 25_000) {
      tags.push('OTM SWEEP');
    }

    const unusualScore =
      (estPremiumUsd >= 10_000 ? Math.log10(estPremiumUsd) * 14 : 0) +
      Math.min(45, volOiRatio * 9) +
      (dte <= 14 ? 8 : 0) +
      (moneyness === 'OTM' && volume >= 100 ? 6 : 0);

    parsed.push({
      id: rawSym,
      ticker: displayTicker,
      contract: `${occ.expiration.slice(5).replace('-', '/')} $${occ.strike}${occ.type === 'CALL' ? 'C' : 'P'}`,
      type: occ.type,
      expiration: occ.expiration,
      dte,
      strike: occ.strike,
      spotPrice: effectiveSpot,
      bid,
      ask,
      mark,
      volume,
      openInterest,
      volOiRatio: Number(volOiRatio.toFixed(2)),
      estPremiumUsd,
      iv,
      delta: delta !== null ? Number(delta.toFixed(2)) : null,
      gamma: gamma !== null ? Number(gamma.toFixed(4)) : null,
      moneyness,
      unusualScore: Number(unusualScore.toFixed(1)),
      tags,
    });
  }

  const maxPain = computeMaxPain(parsed);
  const unusualContracts = parsed
    .filter((c) => c.volume >= 25 && c.estPremiumUsd >= 3_000)
    .sort((a, b) => b.unusualScore - a.unusualScore)
    .slice(0, 16);

  const netPremiumUsd = callPremiumUsd - putPremiumUsd;
  const totalPrem = callPremiumUsd + putPremiumUsd;
  const bullShare = totalPrem > 0 ? callPremiumUsd / totalPrem : 0.5;
  const flowBias: TickerOptionsSummary['flowBias'] =
    bullShare >= 0.56 ? 'BULLISH' : bullShare <= 0.44 ? 'BEARISH' : 'NEUTRAL';
  const putCallVolRatio =
    callVolume > 0 ? Number((putVolume / callVolume).toFixed(2)) : 0;

  const netGammaRegime: TickerOptionsSummary['netGammaRegime'] =
    netGexRaw > 150
      ? 'PIN (+GEX)'
      : netGexRaw < -150
        ? 'VOLATILE (-GEX)'
        : 'NEUTRAL';

  return {
    ticker: displayTicker,
    spotPrice,
    updatedAt: Date.now(),
    callVolume,
    putVolume,
    putCallVolRatio,
    callPremiumUsd,
    putPremiumUsd,
    netPremiumUsd,
    flowBias,
    maxPainStrike: maxPain.strike,
    maxPainExpiration: maxPain.expiration,
    netGammaRegime,
    unusualContracts,
    source: 'cboe',
  };
}

async function fetchJsonWithRelays(
  targetUrl: string,
  signal?: AbortSignal,
): Promise<Record<string, unknown> | null> {
  const urls = [targetUrl, ...CORS_RELAYS.map((fn) => fn(targetUrl))];
  for (const url of urls) {
    if (signal?.aborted) return null;
    const ctrl = new AbortController();
    const timer = window.setTimeout(() => ctrl.abort(), 6500);
    const onAbort = () => ctrl.abort();
    signal?.addEventListener('abort', onAbort, { once: true });
    try {
      const res = await fetch(url, { signal: ctrl.signal });
      if (!res.ok) continue;
      const json = (await res.json()) as Record<string, unknown>;
      if (json && typeof json === 'object' && json.data) {
        return json;
      }
    } catch {
      // Try next relay
    } finally {
      window.clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
    }
  }
  return null;
}

export async function fetchTickerOptionsFlow(
  ticker: string,
  fallbackSpot?: number | null,
  forceRefresh = false,
  signal?: AbortSignal,
): Promise<TickerOptionsSummary | null> {
  const clean = ticker.trim().toUpperCase().replace(/^\$/, '');
  if (!clean) return null;

  const cached = optionsCache.get(clean);
  if (
    !forceRefresh &&
    cached &&
    Date.now() - cached.fetchedAt < OPTIONS_CACHE_TTL_MS
  ) {
    return cached.summary;
  }

  const cboeSym = toCboeOptionSymbol(clean);
  const url = `https://cdn.cboe.com/api/global/delayed_quotes/options/${encodeURIComponent(cboeSym)}.json`;
  const payload = await fetchJsonWithRelays(url, signal);
  if (!payload) return null;

  const summary = analyzeCboeOptionsPayload(clean, payload, fallbackSpot);
  if (summary) {
    optionsCache.set(clean, { summary, fetchedAt: Date.now() });
  }
  return summary;
}

export const WHALE_FLOW_LEADERS = [
  'SPY',
  'QQQ',
  'NVDA',
  'TSLA',
  'AAPL',
  'MSFT',
  'META',
  'AMZN',
  'AMD',
  'PLTR',
];

export async function scanMarketOptionsFlow(
  tickers: string[] = WHALE_FLOW_LEADERS,
  forceRefresh = false,
  signal?: AbortSignal,
): Promise<{
  summaries: TickerOptionsSummary[];
  hotContracts: OptionContractFlow[];
}> {
  const settled = await Promise.allSettled(
    tickers.map((t) => fetchTickerOptionsFlow(t, null, forceRefresh, signal)),
  );
  const summaries: TickerOptionsSummary[] = [];
  const allHot: OptionContractFlow[] = [];

  for (const r of settled) {
    if (r.status === 'fulfilled' && r.value) {
      summaries.push(r.value);
      allHot.push(...r.value.unusualContracts.slice(0, 6));
    }
  }

  allHot.sort((a, b) => b.unusualScore - a.unusualScore);

  return {
    summaries,
    hotContracts: allHot.slice(0, 48),
  };
}

// ===========================
// LIVE 24/7 HYPERLIQUID WHALE TRADE TAPE
// ===========================

function stripDexPrefix(coin: string): string {
  const idx = coin.indexOf(':');
  return (idx >= 0 ? coin.slice(idx + 1) : coin).toUpperCase();
}

function formatWalletShort(raw?: unknown): string | null {
  if (typeof raw !== 'string' || raw.length < 10) return null;
  return `${raw.slice(0, 6)}…${raw.slice(-4)}`;
}

export function parseHlTrade(raw: Record<string, unknown>): WhaleTapePrint | null {
  const coin = String(raw.coin ?? '');
  const price = Number(raw.px);
  const size = Number(raw.sz);
  const time = Number(raw.time);
  if (!coin || !Number.isFinite(price) || !Number.isFinite(size) || price <= 0 || size <= 0) {
    return null;
  }

  const side: 'BUY' | 'SELL' = raw.side === 'B' ? 'BUY' : 'SELL';
  const notionalUsd = price * size;
  const hash = typeof raw.hash === 'string' ? raw.hash : '';
  const isTwap = hash === ZERO_HASH;
  const users = Array.isArray(raw.users) ? raw.users : [];
  const takerAddr = side === 'BUY' ? users[0] : users[1];
  const tier: WhaleTapePrint['tier'] =
    notionalUsd >= 100_000
      ? 'MEGA'
      : notionalUsd >= 25_000
        ? 'WHALE'
        : notionalUsd >= 5_000
          ? 'BLOCK'
          : 'TAPE';

  const tid = String(raw.tid ?? `${time}-${price}-${size}`);
  return {
    id: `${coin}-${tid}`,
    coin,
    ticker: stripDexPrefix(coin),
    side,
    price,
    size,
    notionalUsd,
    time: Number.isFinite(time) && time > 0 ? time : Date.now(),
    isTwap,
    walletTag: formatWalletShort(takerAddr),
    tier,
  };
}

export async function fetchRecentHlWhalePrints(
  coins: string[],
  signal?: AbortSignal,
): Promise<WhaleTapePrint[]> {
  const settled = await Promise.allSettled(
    coins.map(async (coin) => {
      const res = await fetch(HL_INFO_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'recentTrades', coin }),
        signal,
      });
      if (!res.ok) return [];
      const arr = (await res.json()) as Array<Record<string, unknown>>;
      if (!Array.isArray(arr)) return [];
      const out: WhaleTapePrint[] = [];
      for (const item of arr) {
        const parsed = parseHlTrade(item);
        if (parsed) out.push(parsed);
      }
      return out;
    }),
  );

  const merged: WhaleTapePrint[] = [];
  for (const r of settled) {
    if (r.status === 'fulfilled') merged.push(...r.value);
  }
  return merged.sort((a, b) => b.time - a.time).slice(0, 80);
}

export class HyperliquidWhaleTapeStream {
  private ws: WebSocket | null = null;
  private closed = false;
  private reconnectTimer: number | null = null;
  private pingTimer: number | null = null;
  private readonly coins: string[];
  private readonly onPrints: (prints: WhaleTapePrint[]) => void;
  private readonly onStatus: (live: boolean) => void;

  constructor(
    coins: string[],
    onPrints: (prints: WhaleTapePrint[]) => void,
    onStatus: (live: boolean) => void,
  ) {
    this.coins = coins;
    this.onPrints = onPrints;
    this.onStatus = onStatus;
  }

  connect(): void {
    if (this.closed || this.coins.length === 0) return;
    try {
      this.ws = new WebSocket(HL_WS_URL);
    } catch {
      this.scheduleReconnect();
      return;
    }

    this.ws.onopen = () => {
      this.onStatus(true);
      for (const coin of this.coins) {
        this.ws?.send(
          JSON.stringify({
            method: 'subscribe',
            subscription: { type: 'trades', coin },
          }),
        );
      }
      this.pingTimer = window.setInterval(() => {
        if (this.ws?.readyState === WebSocket.OPEN) {
          this.ws.send(JSON.stringify({ method: 'ping' }));
        }
      }, 25_000);
    };

    this.ws.onmessage = (ev) => {
      try {
        const msg = JSON.parse(String(ev.data)) as {
          channel?: string;
          data?: unknown;
        };
        if (msg.channel === 'trades' && Array.isArray(msg.data)) {
          const parsed: WhaleTapePrint[] = [];
          for (const item of msg.data) {
            if (item && typeof item === 'object') {
              const p = parseHlTrade(item as Record<string, unknown>);
              if (p) parsed.push(p);
            }
          }
          if (parsed.length > 0) this.onPrints(parsed);
        }
      } catch {
        // Ignore malformed frame
      }
    };

    this.ws.onclose = () => {
      this.clearPing();
      this.onStatus(false);
      if (!this.closed) this.scheduleReconnect();
    };

    this.ws.onerror = () => {
      this.ws?.close();
    };
  }

  private clearPing(): void {
    if (this.pingTimer !== null) {
      window.clearInterval(this.pingTimer);
      this.pingTimer = null;
    }
  }

  private scheduleReconnect(): void {
    if (this.closed) return;
    this.reconnectTimer = window.setTimeout(() => this.connect(), 3500);
  }

  destroy(): void {
    this.closed = true;
    this.clearPing();
    if (this.reconnectTimer !== null) {
      window.clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.ws) {
      this.ws.onclose = null;
      this.ws.close();
      this.ws = null;
    }
  }
}

// ===========================
// MARKET TIDE & 6-SECTOR HEATMAP
// ===========================

const SECTOR_BASKETS: Array<{ sector: string; tickers: string[] }> = [
  { sector: 'AI & Semis', tickers: ['NVDA', 'AMD', 'AVGO', 'MU', 'ARM'] },
  { sector: 'Mega-Cap Tech', tickers: ['AAPL', 'MSFT', 'GOOGL', 'AMZN', 'META'] },
  { sector: '2026 IPOs', tickers: ['ANT', 'SPCX', 'SKHY', 'CBRS', 'CRWV'] },
  { sector: 'Indices', tickers: ['XYZ100', 'SP500', 'SPY', 'QQQ'] },
  { sector: 'High Beta & EV', tickers: ['TSLA', 'PLTR', 'COIN', 'HOOD'] },
  { sector: 'Financials', tickers: ['JPM', 'GS', 'BRK.B', 'CRCL'] },
];

export function computeMarketTide(
  optionSummaries: TickerOptionsSummary[],
  ctxMap: Record<string, HlAssetCtx>,
  quoteMap: Record<string, MarketQuote>,
  directoryMap: Record<string, DirectoryEntry>,
): MarketTideSummary {
  let callPremiumUsd = 0;
  let putPremiumUsd = 0;
  for (const s of optionSummaries) {
    callPremiumUsd += s.callPremiumUsd;
    putPremiumUsd += s.putPremiumUsd;
  }
  const netPremiumUsd = callPremiumUsd - putPremiumUsd;

  let advancers = 0;
  let decliners = 0;
  const seen = new Set<string>();

  const getLiveChange = (
    ticker: string,
  ): { price: number | null; pct: number | null } => {
    const hl = ctxMap[ticker];
    const q = quoteMap[ticker];
    const d = directoryMap[ticker];
    const price = hl?.markPx ?? q?.price ?? d?.lastSale ?? null;
    const prev = hl?.prevDayPx ?? q?.prevClose ?? null;
    const pct =
      price !== null && prev !== null && prev > 0
        ? ((price - prev) / prev) * 100
        : q?.changePct ?? d?.pctChange ?? null;
    return { price, pct };
  };

  const sectors: SectorHeatItem[] = SECTOR_BASKETS.map(({ sector, tickers }) => {
    const leaders: SectorHeatItem['leaders'] = [];
    let pctSum = 0;
    let pctCount = 0;
    for (const sym of tickers) {
      const { price, pct } = getLiveChange(sym);
      if (pct !== null && Number.isFinite(pct)) {
        pctSum += pct;
        pctCount += 1;
        if (!seen.has(sym)) {
          seen.add(sym);
          if (pct >= 0) advancers += 1;
          else decliners += 1;
        }
        leaders.push({ ticker: sym, pct, price });
      }
    }
    return {
      sector,
      avgPct: pctCount > 0 ? pctSum / pctCount : 0,
      leaders: leaders.slice(0, 4),
    };
  });

  const totalPrem = callPremiumUsd + putPremiumUsd;
  const optScore =
    totalPrem > 0 ? ((callPremiumUsd - putPremiumUsd) / totalPrem) * 65 : 0;
  const totalBreadth = advancers + decliners;
  const breadthScore =
    totalBreadth > 0 ? ((advancers - decliners) / totalBreadth) * 35 : 0;

  const score = Math.max(-100, Math.min(100, Math.round(optScore + breadthScore)));
  const verdict: MarketTideSummary['verdict'] =
    score >= 16
      ? 'RISK-ON BULLISH'
      : score <= -16
        ? 'RISK-OFF BEARISH'
        : 'ROTATION / MIXED';

  return {
    score,
    verdict,
    callPremiumUsd,
    putPremiumUsd,
    netPremiumUsd,
    advancers,
    decliners,
    sectors,
  };
}
