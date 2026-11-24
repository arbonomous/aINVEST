import {
  fetchHyperliquidCandles,
  type HlAssetCtx,
  type HlCandle,
  type HlInterval,
} from './hyperliquidFeed';
import type { DirectoryEntry, UsExchange } from './marketCatalog';
import { buildRelayUrls } from './proxyConfig';

export type FeedSource = 'hyperliquid' | 'yahoo' | 'directory' | 'none';

export interface MarketQuote {
  ticker: string;
  source: FeedSource;
  price: number | null;
  prevClose: number | null;
  change: number | null;
  changePct: number | null;
  dayHigh: number | null;
  dayLow: number | null;
  fiftyTwoWeekHigh: number | null;
  fiftyTwoWeekLow: number | null;
  volume: number;
  dayNtlVlm: number;
  openInterest: number | null;
  funding: number | null;
  oraclePx: number | null;
  marketState: string;
  exchangeLabel: string;
  resolvedExchange?: UsExchange;
  longName?: string;
  updatedAt: number;
}

export interface UniversalCandleResult {
  candles: HlCandle[];
  source: FeedSource;
  quote: MarketQuote | null;
  fallbackIntervalUsed?: string;
}

export function hlCtxToQuote(ctx: HlAssetCtx): MarketQuote {
  const prev = ctx.prevDayPx;
  const change = prev && prev > 0 ? ctx.markPx - prev : null;
  const changePct = change !== null && prev && prev > 0 ? (change / prev) * 100 : null;
  return {
    ticker: ctx.ticker,
    source: 'hyperliquid',
    price: ctx.markPx,
    prevClose: prev,
    change,
    changePct,
    dayHigh: null,
    dayLow: null,
    fiftyTwoWeekHigh: null,
    fiftyTwoWeekLow: null,
    volume: ctx.markPx > 0 ? ctx.dayNtlVlm / ctx.markPx : 0,
    dayNtlVlm: ctx.dayNtlVlm,
    openInterest: ctx.openInterest,
    funding: ctx.funding,
    oraclePx: ctx.oraclePx,
    marketState: '24/7',
    exchangeLabel: ctx.coin,
    updatedAt: ctx.updatedAt,
  };
}

export function directoryEntryToQuote(entry: DirectoryEntry): MarketQuote {
  const price = entry.lastSale;
  const prevClose =
    price !== null && entry.netChange !== null ? price - entry.netChange : null;
  return {
    ticker: entry.ticker,
    source: 'directory',
    price,
    prevClose: prevClose && prevClose > 0 ? prevClose : null,
    change: entry.netChange,
    changePct: entry.pctChange,
    dayHigh: null,
    dayLow: null,
    fiftyTwoWeekHigh: null,
    fiftyTwoWeekLow: null,
    volume: entry.volume,
    dayNtlVlm: price ? entry.volume * price : 0,
    openInterest: null,
    funding: null,
    oraclePx: null,
    marketState: 'EOD',
    exchangeLabel: entry.exchange,
    resolvedExchange: entry.exchange,
    longName: entry.name,
    updatedAt: Date.now(),
  };
}

function toYahooSymbol(ticker: string): string {
  const clean = ticker.trim().toUpperCase().replace(/^XYZ:/, '');
  if (clean === 'XYZ100') return '^NDX';
  if (clean === 'SP500') return '^GSPC';
  // Yahoo Finance uses hyphens for share classes (BRK.B -> BRK-B, BF.B -> BF-B)
  return clean.replace(/\./g, '-');
}

function mapYahooExchange(raw?: string): UsExchange | undefined {
  if (!raw) return undefined;
  const u = raw.toUpperCase();
  if (u === 'NMS' || u === 'NGM' || u === 'NCM' || u.includes('NASDAQ')) return 'NASDAQ';
  if (u === 'NYQ' || u === 'NYSE') return 'NYSE';
  if (u === 'ASE' || u === 'PCX' || u === 'BTS' || u.includes('AMEX') || u.includes('ARCA')) {
    return 'AMEX';
  }
  return undefined;
}

let preferredRelayIdx: number | null = null;

async function fetchJsonViaRelays(
  targetUrl: string,
  signal?: AbortSignal,
): Promise<unknown | null> {
  const relays = buildRelayUrls(targetUrl);
  const order: number[] = [];
  if (preferredRelayIdx !== null && preferredRelayIdx < relays.length) {
    order.push(preferredRelayIdx);
  }
  for (let i = 0; i < relays.length; i++) {
    if (i !== preferredRelayIdx) order.push(i);
  }

  for (const idx of order) {
    if (signal?.aborted) return null;
    const proxiedUrl = relays[idx];
    const timeoutController = new AbortController();
    const timer = window.setTimeout(() => timeoutController.abort(), 6500);

    const onParentAbort = () => timeoutController.abort();
    signal?.addEventListener('abort', onParentAbort, { once: true });

    try {
      const res = await fetch(proxiedUrl, { signal: timeoutController.signal });
      if (!res.ok) continue;
      const text = await res.text();
      if (!text || text[0] !== '{') continue;
      const json = JSON.parse(text) as unknown;
      preferredRelayIdx = idx;
      return json;
    } catch {
      // Try next relay
    } finally {
      window.clearTimeout(timer);
      signal?.removeEventListener('abort', onParentAbort);
    }
  }
  return null;
}

interface YahooChartResponse {
  chart?: {
    result?: Array<{
      meta?: {
        symbol?: string;
        longName?: string;
        shortName?: string;
        exchangeName?: string;
        fullExchangeName?: string;
        regularMarketPrice?: number;
        preMarketPrice?: number;
        postMarketPrice?: number;
        chartPreviousClose?: number;
        previousClose?: number;
        regularMarketDayHigh?: number;
        regularMarketDayLow?: number;
        fiftyTwoWeekHigh?: number;
        fiftyTwoWeekLow?: number;
        regularMarketVolume?: number;
        marketState?: string;
      };
      timestamp?: number[];
      indicators?: {
        quote?: Array<{
          open?: Array<number | null>;
          high?: Array<number | null>;
          low?: Array<number | null>;
          close?: Array<number | null>;
          volume?: Array<number | null>;
        }>;
      };
    }>;
  };
}

function yahooParamsForInterval(interval: HlInterval): {
  iv: string;
  range: string;
  aggregate4h?: boolean;
} {
  switch (interval) {
    case '1m':
      return { iv: '1m', range: '1d' };
    case '5m':
      return { iv: '5m', range: '5d' };
    case '15m':
      return { iv: '15m', range: '5d' };
    case '30m':
      return { iv: '30m', range: '1mo' };
    case '1h':
      return { iv: '60m', range: '1mo' };
    case '4h':
      return { iv: '60m', range: '3mo', aggregate4h: true };
    case '1d':
      return { iv: '1d', range: '1y' };
  }
}

function aggregateCandles4h(candles: HlCandle[]): HlCandle[] {
  const bucketSec = 4 * 3600;
  const map = new Map<number, HlCandle>();
  for (const c of candles) {
    const bucket = Math.floor(c.time / bucketSec) * bucketSec;
    const prev = map.get(bucket);
    if (!prev) {
      map.set(bucket, {
        time: bucket,
        open: c.open,
        high: c.high,
        low: c.low,
        close: c.close,
        volume: c.volume,
      });
    } else {
      prev.high = Math.max(prev.high, c.high);
      prev.low = Math.min(prev.low, c.low);
      prev.close = c.close;
      prev.volume += c.volume;
    }
  }
  return Array.from(map.values()).sort((a, b) => a.time - b.time);
}

function parseYahooChartResult(
  ticker: string,
  json: unknown,
): { candles: HlCandle[]; quote: MarketQuote | null } {
  const payload = json as YahooChartResponse;
  const result = payload?.chart?.result?.[0];
  if (!result) return { candles: [], quote: null };

  const meta = result.meta ?? {};
  const timestamps = result.timestamp ?? [];
  const q = result.indicators?.quote?.[0];
  const opens = q?.open ?? [];
  const highs = q?.high ?? [];
  const lows = q?.low ?? [];
  const closes = q?.close ?? [];
  const volumes = q?.volume ?? [];

  const byTime = new Map<number, HlCandle>();
  for (let i = 0; i < timestamps.length; i++) {
    const t = timestamps[i];
    const o = opens[i];
    const h = highs[i];
    const l = lows[i];
    const c = closes[i];
    const v = volumes[i];
    if (
      typeof t !== 'number' ||
      typeof o !== 'number' ||
      typeof c !== 'number' ||
      !Number.isFinite(o) ||
      !Number.isFinite(c) ||
      o <= 0 ||
      c <= 0
    ) {
      continue;
    }
    const hi = typeof h === 'number' && Number.isFinite(h) ? Math.max(h, o, c) : Math.max(o, c);
    const lo =
      typeof l === 'number' && Number.isFinite(l) && l > 0
        ? Math.min(l, o, c)
        : Math.min(o, c);
    byTime.set(t, {
      time: t,
      open: o,
      high: hi,
      low: lo,
      close: c,
      volume: typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : 0,
    });
  }

  const candles = Array.from(byTime.values()).sort((a, b) => a.time - b.time);

  const marketState = (meta.marketState ?? 'REGULAR').toUpperCase();
  const extendedPx =
    marketState === 'PRE' && typeof meta.preMarketPrice === 'number' && meta.preMarketPrice > 0
      ? meta.preMarketPrice
      : (marketState === 'POST' || marketState === 'POSTPOST') &&
          typeof meta.postMarketPrice === 'number' &&
          meta.postMarketPrice > 0
        ? meta.postMarketPrice
        : null;
  const regPx =
    typeof meta.regularMarketPrice === 'number' && meta.regularMarketPrice > 0
      ? meta.regularMarketPrice
      : candles.length > 0
        ? candles[candles.length - 1].close
        : null;
  const price = extendedPx ?? regPx;

  const prevClose =
    typeof meta.previousClose === 'number' && meta.previousClose > 0
      ? meta.previousClose
      : typeof meta.chartPreviousClose === 'number' && meta.chartPreviousClose > 0
        ? meta.chartPreviousClose
        : null;

  const change = price !== null && prevClose !== null ? price - prevClose : null;
  const changePct =
    change !== null && prevClose !== null && prevClose > 0
      ? (change / prevClose) * 100
      : null;

  const vol =
    typeof meta.regularMarketVolume === 'number' && Number.isFinite(meta.regularMarketVolume)
      ? meta.regularMarketVolume
      : candles.reduce((acc, c) => acc + c.volume, 0);

  const resolvedExchange = mapYahooExchange(meta.exchangeName || meta.fullExchangeName);
  const exchangeLabel = resolvedExchange ?? meta.exchangeName ?? 'US MKT';

  const quote: MarketQuote | null =
    price !== null
      ? {
          ticker,
          source: 'yahoo',
          price,
          prevClose,
          change,
          changePct,
          dayHigh:
            typeof meta.regularMarketDayHigh === 'number' && meta.regularMarketDayHigh > 0
              ? meta.regularMarketDayHigh
              : null,
          dayLow:
            typeof meta.regularMarketDayLow === 'number' && meta.regularMarketDayLow > 0
              ? meta.regularMarketDayLow
              : null,
          fiftyTwoWeekHigh:
            typeof meta.fiftyTwoWeekHigh === 'number' && meta.fiftyTwoWeekHigh > 0
              ? meta.fiftyTwoWeekHigh
              : null,
          fiftyTwoWeekLow:
            typeof meta.fiftyTwoWeekLow === 'number' && meta.fiftyTwoWeekLow > 0
              ? meta.fiftyTwoWeekLow
              : null,
          volume: vol,
          dayNtlVlm: price * vol,
          openInterest: null,
          funding: null,
          oraclePx: null,
          marketState:
            marketState === 'REGULAR'
              ? 'LIVE'
              : marketState === 'PRE'
                ? 'PRE-MKT'
                : marketState === 'POST' || marketState === 'POSTPOST'
                  ? 'AFTER-HRS'
                  : 'CLOSED',
          exchangeLabel,
          resolvedExchange,
          longName: meta.longName || meta.shortName,
          updatedAt: Date.now(),
        }
      : null;

  return { candles, quote };
}

interface CacheEntry {
  result: UniversalCandleResult;
  fetchedAt: number;
}

const yahooCache = new Map<string, CacheEntry>();
const inflightMap = new Map<string, Promise<UniversalCandleResult>>();
const CACHE_TTL_MS = 10_000;

async function fetchYahooCandlesAndQuote(
  ticker: string,
  interval: HlInterval,
  signal?: AbortSignal,
): Promise<UniversalCandleResult> {
  const key = `${ticker}:${interval}`;
  const cached = yahooCache.get(key);
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
    return cached.result;
  }

  const existing = inflightMap.get(key);
  if (existing) return existing;

  const task = (async (): Promise<UniversalCandleResult> => {
    const yahooSym = toYahooSymbol(ticker);
    const { iv, range, aggregate4h } = yahooParamsForInterval(interval);
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(
      yahooSym,
    )}?interval=${iv}&range=${range}&includePrePost=${interval === '1d' ? 'false' : 'true'}`;

    const json = await fetchJsonViaRelays(url, signal);
    if (json) {
      const parsed = parseYahooChartResult(ticker, json);
      const candles = aggregate4h
        ? aggregateCandles4h(parsed.candles)
        : parsed.candles;
      if (candles.length > 0 || parsed.quote) {
        // If intraday returned a quote but very few candles (e.g., brand-new IPO or thin stock), try daily bars
        if (candles.length < 5 && interval !== '1d') {
          const dailyUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(
            yahooSym,
          )}?interval=1d&range=3mo&includePrePost=false`;
          const dailyJson = await fetchJsonViaRelays(dailyUrl, signal);
          if (dailyJson) {
            const dailyParsed = parseYahooChartResult(ticker, dailyJson);
            if (dailyParsed.candles.length > candles.length) {
              const out: UniversalCandleResult = {
                candles: dailyParsed.candles,
                source: 'yahoo',
                quote: parsed.quote ?? dailyParsed.quote,
                fallbackIntervalUsed: '1d',
              };
              yahooCache.set(key, { result: out, fetchedAt: Date.now() });
              return out;
            }
          }
        }

        const out: UniversalCandleResult = {
          candles,
          source: 'yahoo',
          quote: parsed.quote,
        };
        yahooCache.set(key, { result: out, fetchedAt: Date.now() });
        return out;
      }
    }

    return { candles: [], source: 'none', quote: null };
  })().finally(() => {
    inflightMap.delete(key);
  });

  inflightMap.set(key, task);
  return task;
}

/**
 * Universal OHLCV candle + quote fetcher for ANY stock or IPO:
 * 1. Hyperliquid HIP-3 0-delay candles when `hlCoin` is available.
 * 2. Yahoo Finance live intraday/extended-hours candles + quote for ALL NASDAQ/NYSE/AMEX stocks & IPOs.
 */
export async function fetchUniversalCandles(
  ticker: string,
  hlCoin: string | null,
  interval: HlInterval,
  bars = 220,
  signal?: AbortSignal,
): Promise<UniversalCandleResult> {
  if (hlCoin) {
    try {
      const hlCandles = await fetchHyperliquidCandles(hlCoin, interval, bars, signal);
      if (hlCandles.length > 0) {
        return { candles: hlCandles, source: 'hyperliquid', quote: null };
      }
    } catch {
      // Fall through to universal equity feed
    }
  }

  if (signal?.aborted) return { candles: [], source: 'none', quote: null };
  return fetchYahooCandlesAndQuote(ticker, interval, signal);
}

/** Fetches the latest live quote for any non-Hyperliquid stock or IPO */
export async function fetchUniversalQuote(
  ticker: string,
  signal?: AbortSignal,
): Promise<MarketQuote | null> {
  const res = await fetchYahooCandlesAndQuote(ticker, '5m', signal);
  return res.quote;
}
