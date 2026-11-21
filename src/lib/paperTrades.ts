import type { DailyBreadCall } from './dailyBreadEngine';

export type TrackedTradeStatus =
  | 'OPEN'
  | 'TP1_HIT'
  | 'TP2_HIT'
  | 'STOPPED'
  | 'CLOSED';

export interface TrackedTrade {
  id: string;
  ticker: string;
  name: string;
  direction: 'LONG' | 'SHORT';
  setupName: string;
  grade: string;
  confidence: number;
  entryPrice: number;
  target1: number;
  target2: number;
  stopLoss: number;
  riskReward: number;
  openedAt: number;
  status: TrackedTradeStatus;
  exitPrice?: number;
  closedAt?: number;
}

export interface EvaluatedTrade {
  trade: TrackedTrade;
  markPrice: number;
  pnlPct: number;
  rMultiple: number;
  isWin: boolean;
}

export interface ScorecardStats {
  total: number;
  openCount: number;
  wins: number;
  losses: number;
  winRatePct: number | null;
  avgPnlPct: number;
}

const STORAGE_KEY = 'ainvest_daily_bread_trades_v1';
const MAX_TRADES = 40;

export function loadTrackedTrades(): TrackedTrade[] {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(
        (t): t is TrackedTrade =>
          Boolean(t) &&
          typeof t.id === 'string' &&
          typeof t.ticker === 'string' &&
          (t.direction === 'LONG' || t.direction === 'SHORT') &&
          typeof t.entryPrice === 'number' &&
          t.entryPrice > 0,
      )
      .slice(0, MAX_TRADES);
  } catch {
    return [];
  }
}

export function saveTrackedTrades(trades: TrackedTrade[]): void {
  try {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify(trades.slice(0, MAX_TRADES)),
    );
  } catch {
    // Ignore storage quota / private-mode restrictions
  }
}

export function createTrackedTradeFromCall(
  call: DailyBreadCall,
): TrackedTrade | null {
  if (call.direction === 'WAIT') return null;
  const entryMid = Number(((call.entryLow + call.entryHigh) / 2).toFixed(3));
  const entryPrice = entryMid > 0 ? entryMid : call.livePrice;
  if (!Number.isFinite(entryPrice) || entryPrice <= 0) return null;

  return {
    id: `${call.ticker}-${call.direction}-${Date.now()}`,
    ticker: call.ticker,
    name: call.name,
    direction: call.direction,
    setupName: call.setupName,
    grade: call.grade,
    confidence: call.confidence,
    entryPrice,
    target1: call.target1,
    target2: call.target2,
    stopLoss: call.stopLoss,
    riskReward: call.riskReward,
    openedAt: Date.now(),
    status: 'OPEN',
  };
}

/**
 * Checks if any OPEN or TP1_HIT tracked trades have hit TP1, TP2, or Stop Loss
 * based on current live market prices. Returns `{ trades, changed }` so callers
 * can skip unnecessary React state updates.
 */
export function reconcileTradesWithPrices(
  trades: TrackedTrade[],
  priceMap: Record<string, number>,
): { trades: TrackedTrade[]; changed: boolean } {
  let changed = false;
  const now = Date.now();

  const next = trades.map((t) => {
    if (t.status === 'TP2_HIT' || t.status === 'STOPPED' || t.status === 'CLOSED') {
      return t;
    }
    const px = priceMap[t.ticker];
    if (!Number.isFinite(px) || px <= 0) return t;

    if (t.direction === 'LONG') {
      if (px >= t.target2) {
        changed = true;
        return { ...t, status: 'TP2_HIT' as const, exitPrice: t.target2, closedAt: now };
      }
      if (px <= t.stopLoss && t.status === 'OPEN') {
        changed = true;
        return { ...t, status: 'STOPPED' as const, exitPrice: t.stopLoss, closedAt: now };
      }
      if (px >= t.target1 && t.status === 'OPEN') {
        changed = true;
        return { ...t, status: 'TP1_HIT' as const };
      }
    } else {
      if (px <= t.target2) {
        changed = true;
        return { ...t, status: 'TP2_HIT' as const, exitPrice: t.target2, closedAt: now };
      }
      if (px >= t.stopLoss && t.status === 'OPEN') {
        changed = true;
        return { ...t, status: 'STOPPED' as const, exitPrice: t.stopLoss, closedAt: now };
      }
      if (px <= t.target1 && t.status === 'OPEN') {
        changed = true;
        return { ...t, status: 'TP1_HIT' as const };
      }
    }

    return t;
  });

  return { trades: changed ? next : trades, changed };
}

export function evaluateTrackedTrade(
  trade: TrackedTrade,
  livePrice?: number | null,
): EvaluatedTrade {
  const isFinal =
    trade.status === 'TP2_HIT' ||
    trade.status === 'STOPPED' ||
    trade.status === 'CLOSED';
  const markPrice =
    isFinal && trade.exitPrice && trade.exitPrice > 0
      ? trade.exitPrice
      : livePrice && livePrice > 0
        ? livePrice
        : trade.entryPrice;

  const rawDiff =
    trade.direction === 'LONG'
      ? markPrice - trade.entryPrice
      : trade.entryPrice - markPrice;
  const pnlPct = (rawDiff / trade.entryPrice) * 100;
  const risk = Math.max(0.001, Math.abs(trade.entryPrice - trade.stopLoss));
  const rMultiple = rawDiff / risk;

  return {
    trade,
    markPrice,
    pnlPct,
    rMultiple,
    isWin: pnlPct >= 0,
  };
}

export function computeScorecardStats(
  evaluated: EvaluatedTrade[],
): ScorecardStats {
  const total = evaluated.length;
  let openCount = 0;
  let wins = 0;
  let losses = 0;
  let sumPnl = 0;

  for (const item of evaluated) {
    sumPnl += item.pnlPct;
    const st = item.trade.status;
    if (st === 'OPEN') {
      openCount += 1;
    } else if (st === 'TP1_HIT' || st === 'TP2_HIT') {
      wins += 1;
    } else if (st === 'STOPPED') {
      losses += 1;
    } else if (st === 'CLOSED') {
      if (item.pnlPct >= 0) wins += 1;
      else losses += 1;
    }
  }

  const graded = wins + losses;
  return {
    total,
    openCount,
    wins,
    losses,
    winRatePct: graded > 0 ? Math.round((wins / graded) * 100) : null,
    avgPnlPct: total > 0 ? sumPnl / total : 0,
  };
}
