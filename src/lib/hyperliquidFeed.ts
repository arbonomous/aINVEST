export type HlInterval = '1m' | '5m' | '15m' | '30m' | '1h' | '4h' | '1d';

export interface HlCandle {
  time: number; // unix seconds (lightweight-charts UTCTimestamp)
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface HlAssetCtx {
  coin: string;
  ticker: string;
  markPx: number;
  midPx: number | null;
  oraclePx: number | null;
  prevDayPx: number | null;
  dayNtlVlm: number;
  openInterest: number;
  funding: number;
  updatedAt: number;
}

const HL_INFO_URL = 'https://api.hyperliquid.xyz/info';
const HL_WS_URL = 'wss://api.hyperliquid.xyz/ws';

const INTERVAL_MS: Record<HlInterval, number> = {
  '1m': 60_000,
  '5m': 5 * 60_000,
  '15m': 15 * 60_000,
  '30m': 30 * 60_000,
  '1h': 60 * 60_000,
  '4h': 4 * 60 * 60_000,
  '1d': 24 * 60 * 60_000,
};

function parseNum(val: unknown): number {
  const n = typeof val === 'number' ? val : Number.parseFloat(String(val ?? ''));
  return Number.isFinite(n) ? n : 0;
}

function parseNullableNum(val: unknown): number | null {
  if (val === null || val === undefined || val === '') return null;
  const n = typeof val === 'number' ? val : Number.parseFloat(String(val));
  return Number.isFinite(n) ? n : null;
}

export function coinToTicker(coin: string): string {
  return coin.includes(':') ? coin.split(':')[1].toUpperCase() : coin.toUpperCase();
}

export function parseRawHlCandle(raw: Record<string, unknown>): HlCandle | null {
  const tMs = parseNum(raw.t);
  const open = parseNum(raw.o);
  const high = parseNum(raw.h);
  const low = parseNum(raw.l);
  const close = parseNum(raw.c);
  const volume = parseNum(raw.v);

  if (tMs <= 0 || open <= 0 || close <= 0) return null;
  return {
    time: Math.floor(tMs / 1000),
    open,
    high: Math.max(high, open, close),
    low: Math.min(low > 0 ? low : Math.min(open, close), open, close),
    close,
    volume,
  };
}

/** Fetches all live equity/macro markets on Hyperliquid HIP-3 dex (e.g. "xyz") in a single call */
export async function fetchHyperliquidDexCtxMap(
  dex = 'xyz',
  signal?: AbortSignal,
): Promise<Record<string, HlAssetCtx>> {
  const res = await fetch(HL_INFO_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type: 'metaAndAssetCtxs', dex }),
    signal,
  });

  if (!res.ok) return {};
  const data = (await res.json()) as [
    { universe?: Array<{ name?: string; isDelisted?: boolean }> },
    Array<Record<string, unknown>>,
  ];
  if (!Array.isArray(data) || data.length < 2) return {};

  const universe = data[0]?.universe ?? [];
  const ctxs = data[1] ?? [];
  const out: Record<string, HlAssetCtx> = {};
  const now = Date.now();

  for (let i = 0; i < universe.length; i++) {
    const meta = universe[i];
    const coin = meta?.name;
    const ctx = ctxs[i];
    if (!coin || meta?.isDelisted || !ctx) continue;
    const markPx = parseNum(ctx.markPx);
    if (markPx <= 0) continue;

    const ticker = coinToTicker(coin);
    out[ticker] = {
      coin,
      ticker,
      markPx,
      midPx: parseNullableNum(ctx.midPx),
      oraclePx: parseNullableNum(ctx.oraclePx),
      prevDayPx: parseNullableNum(ctx.prevDayPx),
      dayNtlVlm: parseNum(ctx.dayNtlVlm),
      openInterest: parseNum(ctx.openInterest) * markPx,
      funding: parseNum(ctx.funding),
      updatedAt: now,
    };
  }

  return out;
}

let cachedHip3DexNames: string[] | null = null;
let lastDexDiscoveryMs = 0;

async function discoverHip3DexNames(signal?: AbortSignal): Promise<string[]> {
  const now = Date.now();
  if (cachedHip3DexNames && now - lastDexDiscoveryMs < 10 * 60_000) {
    return cachedHip3DexNames;
  }

  try {
    const res = await fetch(HL_INFO_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'perpDexs' }),
      signal,
    });
    if (!res.ok) return ['xyz'];
    const raw = (await res.json()) as Array<{ name?: string } | null>;
    if (!Array.isArray(raw)) return ['xyz'];

    const names = new Set<string>(['xyz']);
    for (const item of raw) {
      const name = item?.name?.trim();
      if (name && /^[a-zA-Z0-9_-]{1,24}$/.test(name)) {
        names.add(name);
      }
    }
    const list = Array.from(names).slice(0, 12);
    cachedHip3DexNames = list;
    lastDexDiscoveryMs = now;
    return list;
  } catch {
    return cachedHip3DexNames ?? ['xyz'];
  }
}

/**
 * Fetches live markets across ALL active Hyperliquid HIP-3 builder DEXes (xyz, io, para, etc.).
 * When a ticker trades on multiple DEXes, keeps xyz: if active or highest 24h notional volume.
 */
export async function fetchAllHyperliquidHip3CtxMap(
  signal?: AbortSignal,
): Promise<Record<string, HlAssetCtx>> {
  const dexNames = await discoverHip3DexNames(signal);
  const settled = await Promise.allSettled(
    dexNames.map((dex) => fetchHyperliquidDexCtxMap(dex, signal)),
  );

  const merged: Record<string, HlAssetCtx> = {};
  for (const res of settled) {
    if (res.status !== 'fulfilled') continue;
    for (const [ticker, ctx] of Object.entries(res.value)) {
      const existing = merged[ticker];
      if (!existing) {
        merged[ticker] = ctx;
      } else {
        const existingIsXyz = existing.coin.startsWith('xyz:');
        const nextIsXyz = ctx.coin.startsWith('xyz:');
        if (nextIsXyz && !existingIsXyz) {
          merged[ticker] = ctx;
        } else if (existingIsXyz === nextIsXyz && ctx.dayNtlVlm > existing.dayNtlVlm) {
          merged[ticker] = ctx;
        }
      }
    }
  }
  return merged;
}

export async function fetchHyperliquidCandles(
  coin: string,
  interval: HlInterval,
  bars = 220,
  signal?: AbortSignal,
): Promise<HlCandle[]> {
  const endTime = Date.now();
  const startTime = endTime - INTERVAL_MS[interval] * bars;

  const res = await fetch(HL_INFO_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      type: 'candleSnapshot',
      req: { coin, interval, startTime, endTime },
    }),
    signal,
  });

  if (!res.ok) return [];
  const rawList = (await res.json()) as Array<Record<string, unknown>>;
  if (!Array.isArray(rawList)) return [];

  const byTime = new Map<number, HlCandle>();
  for (const item of rawList) {
    const parsed = parseRawHlCandle(item);
    if (parsed) {
      byTime.set(parsed.time, parsed);
    }
  }

  return Array.from(byTime.values()).sort((a, b) => a.time - b.time);
}

export interface LinePoint {
  time: number;
  value: number;
}

export function computeSessionVwap(candles: HlCandle[]): LinePoint[] {
  let cumPV = 0;
  let cumV = 0;
  let lastDay = -1;
  const out: LinePoint[] = [];

  for (const c of candles) {
    const dayBucket = Math.floor(c.time / 86400);
    if (dayBucket !== lastDay) {
      cumPV = 0;
      cumV = 0;
      lastDay = dayBucket;
    }
    const typical = (c.high + c.low + c.close) / 3;
    const vol = c.volume > 0 ? c.volume : 0.0001;
    cumPV += typical * vol;
    cumV += vol;
    out.push({ time: c.time, value: cumPV / cumV });
  }
  return out;
}

export function computeEma(candles: HlCandle[], period: number): LinePoint[] {
  if (candles.length === 0) return [];
  const k = 2 / (period + 1);
  let ema = candles[0].close;
  const out: LinePoint[] = [];

  for (const c of candles) {
    ema = c.close * k + ema * (1 - k);
    out.push({ time: c.time, value: ema });
  }
  return out;
}

export function computeLatestRsi(candles: HlCandle[], period = 14): number | null {
  if (candles.length < period + 1) return null;
  let avgGain = 0;
  let avgLoss = 0;

  for (let i = 1; i <= period; i++) {
    const diff = candles[i].close - candles[i - 1].close;
    if (diff > 0) avgGain += diff;
    else avgLoss += Math.abs(diff);
  }
  avgGain /= period;
  avgLoss /= period;

  for (let i = period + 1; i < candles.length; i++) {
    const diff = candles[i].close - candles[i - 1].close;
    const gain = diff > 0 ? diff : 0;
    const loss = diff < 0 ? Math.abs(diff) : 0;
    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;
  }

  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return 100 - 100 / (1 + rs);
}

export function computeAtr(candles: HlCandle[], period = 14): number | null {
  if (candles.length < period + 1) return null;
  let trSum = 0;
  const start = candles.length - period;
  for (let i = start; i < candles.length; i++) {
    const cur = candles[i];
    const prev = candles[i - 1];
    const tr = Math.max(
      cur.high - cur.low,
      Math.abs(cur.high - prev.close),
      Math.abs(cur.low - prev.close),
    );
    trSum += tr;
  }
  return trSum / period;
}

export interface HlStreamCallbacks {
  onAssetCtx?: (ctx: HlAssetCtx) => void;
  onCandle?: (candle: HlCandle) => void;
  onStatus?: (connected: boolean) => void;
}

export class HyperliquidStream {
  private coin: string;
  private interval?: HlInterval;
  private callbacks: HlStreamCallbacks;
  private ws: WebSocket | null = null;
  private pingTimer: number | null = null;
  private reconnectTimer: number | null = null;
  private closed = false;
  private attempts = 0;

  constructor(
    coin: string,
    callbacks: HlStreamCallbacks,
    interval?: HlInterval,
  ) {
    this.coin = coin;
    this.callbacks = callbacks;
    this.interval = interval;
  }

  connect(): void {
    if (this.closed) return;
    try {
      const ws = new WebSocket(HL_WS_URL);
      this.ws = ws;

      ws.onopen = () => {
        this.attempts = 0;
        this.callbacks.onStatus?.(true);

        if (this.callbacks.onAssetCtx) {
          ws.send(
            JSON.stringify({
              method: 'subscribe',
              subscription: { type: 'activeAssetCtx', coin: this.coin },
            }),
          );
        }

        if (this.callbacks.onCandle && this.interval) {
          ws.send(
            JSON.stringify({
              method: 'subscribe',
              subscription: {
                type: 'candle',
                coin: this.coin,
                interval: this.interval,
              },
            }),
          );
        }

        this.pingTimer = window.setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ method: 'ping' }));
          }
        }, 25_000);
      };

      ws.onmessage = (ev: MessageEvent) => {
        try {
          const msg = JSON.parse(String(ev.data)) as {
            channel?: string;
            data?: Record<string, unknown> | Array<Record<string, unknown>>;
          };

          if (msg.channel === 'activeAssetCtx' && msg.data && !Array.isArray(msg.data)) {
            const payload = msg.data as {
              coin?: string;
              ctx?: Record<string, unknown>;
            };
            const ctx = payload.ctx;
            if (ctx) {
              const markPx = parseNum(ctx.markPx);
              if (markPx > 0) {
                const resolvedCoin = payload.coin || this.coin;
                this.callbacks.onAssetCtx?.({
                  coin: resolvedCoin,
                  ticker: coinToTicker(resolvedCoin),
                  markPx,
                  midPx: parseNullableNum(ctx.midPx),
                  oraclePx: parseNullableNum(ctx.oraclePx),
                  prevDayPx: parseNullableNum(ctx.prevDayPx),
                  dayNtlVlm: parseNum(ctx.dayNtlVlm),
                  openInterest: parseNum(ctx.openInterest) * markPx,
                  funding: parseNum(ctx.funding),
                  updatedAt: Date.now(),
                });
              }
            }
          } else if (msg.channel === 'candle' && msg.data) {
            const items = Array.isArray(msg.data) ? msg.data : [msg.data];
            for (const raw of items) {
              const parsed = parseRawHlCandle(raw);
              if (parsed) {
                this.callbacks.onCandle?.(parsed);
              }
            }
          }
        } catch {
          // Ignore malformed frames
        }
      };

      ws.onclose = () => {
        this.clearPing();
        this.callbacks.onStatus?.(false);
        if (!this.closed) {
          const delay = Math.min(12_000, 1200 * Math.pow(1.6, this.attempts));
          this.attempts += 1;
          this.reconnectTimer = window.setTimeout(() => this.connect(), delay);
        }
      };

      ws.onerror = () => {
        ws.close();
      };
    } catch {
      this.callbacks.onStatus?.(false);
    }
  }

  private clearPing(): void {
    if (this.pingTimer !== null) {
      window.clearInterval(this.pingTimer);
      this.pingTimer = null;
    }
  }

  destroy(): void {
    this.closed = true;
    this.clearPing();
    if (this.reconnectTimer !== null) {
      window.clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.ws) {
      try {
        this.ws.close();
      } catch {
        // Ignore
      }
      this.ws = null;
    }
  }
}
