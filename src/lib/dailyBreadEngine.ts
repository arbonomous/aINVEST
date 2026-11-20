import type { TickerMeta } from '../data/tickers';
import {
  computeAtr,
  computeEma,
  computeLatestRsi,
  computeSessionVwap,
  type HlCandle,
} from './hyperliquidFeed';
import type { NewsArticle } from './newsFeed';
import { computeLatestMacd, evaluateTechnicals } from './technicalEngine';
import type { MarketQuote } from './universalFeed';

export type BreadDirection = 'LONG' | 'SHORT' | 'WAIT';

export interface BreadIndicatorChip {
  label: string;
  value: string;
  tone: 'bull' | 'bear' | 'amber' | 'neutral';
}

export interface DailyBreadCall {
  ticker: string;
  name: string;
  direction: BreadDirection;
  setupName: string;
  grade: 'A+' | 'A' | 'B+' | 'B' | 'C';
  confidence: number; // 0-100
  timeframe: string;
  livePrice: number;
  changePct: number | null;
  entryLow: number;
  entryHigh: number;
  target1: number;
  target2: number;
  stopLoss: number;
  riskReward: number;
  thesis: string;
  invalidationNote: string;
  catalystHeadline?: string;
  indicators: BreadIndicatorChip[];
  updatedAt: number;
}

function roundPx(n: number): number {
  if (!Number.isFinite(n) || n <= 0) return 0.01;
  return n >= 10 ? Number(n.toFixed(2)) : Number(n.toFixed(3));
}

function fmtUsd(n: number): string {
  return n >= 10 ? `$${n.toFixed(2)}` : `$${n.toFixed(3)}`;
}

function computeBollinger(
  candles: HlCandle[],
  period = 20,
): { mid: number; upper: number; lower: number; widthPct: number; pos: number } | null {
  if (candles.length < period) return null;
  const slice = candles.slice(-period).map((c) => c.close);
  const mid = slice.reduce((a, b) => a + b, 0) / period;
  const variance =
    slice.reduce((acc, v) => acc + Math.pow(v - mid, 2), 0) / period;
  const std = Math.sqrt(variance);
  const upper = mid + 2 * std;
  const lower = mid - 2 * std;
  const last = slice[slice.length - 1];
  const widthPct = mid > 0 ? ((upper - lower) / mid) * 100 : 0;
  const pos = upper > lower ? (last - lower) / (upper - lower) : 0.5;
  return { mid, upper, lower, widthPct, pos };
}

function computeVolumeRatio(candles: HlCandle[]): number | null {
  if (candles.length < 24) return null;
  const recent = candles.slice(-3);
  const baseline = candles.slice(-23, -3);
  const recentAvg = recent.reduce((a, c) => a + c.volume, 0) / recent.length;
  const baseAvg = baseline.reduce((a, c) => a + c.volume, 0) / baseline.length;
  if (baseAvg <= 0) return null;
  return recentAvg / baseAvg;
}

function computeGrade(confidence: number, direction: BreadDirection): DailyBreadCall['grade'] {
  if (direction === 'WAIT') return confidence >= 55 ? 'B' : 'C';
  if (confidence >= 84) return 'A+';
  if (confidence >= 74) return 'A';
  if (confidence >= 64) return 'B+';
  if (confidence >= 54) return 'B';
  return 'C';
}

/**
 * Generates an AI-assisted multi-timeframe day-trade call ("Daily Bread") directly from
 * live 5m / 15m / 1h chart candles, VWAP, EMA 9/21/50, RSI, MACD, Bollinger Bands, ATR,
 * volume surge, and active breaking news catalysts.
 */
export function generateDailyBreadCall(
  meta: TickerMeta,
  candles15m: HlCandle[],
  candles1h: HlCandle[],
  candles5m: HlCandle[],
  quote: MarketQuote | null,
  breakingNews: NewsArticle[] = [],
): DailyBreadCall | null {
  const primaryCandles = candles15m.length >= 20 ? candles15m : candles5m;
  if (primaryCandles.length < 20) return null;

  const lastBar = primaryCandles[primaryCandles.length - 1];
  const livePrice =
    quote?.price && quote.price > 0 ? quote.price : lastBar.close;

  const tech15m = evaluateTechnicals(primaryCandles);
  const tech1h = candles1h.length >= 20 ? evaluateTechnicals(candles1h) : null;
  const tech5m = candles5m.length >= 20 ? evaluateTechnicals(candles5m) : null;

  const vwapSeries = computeSessionVwap(primaryCandles);
  const vwap = vwapSeries[vwapSeries.length - 1]?.value ?? livePrice;
  const vwapDistPct = vwap > 0 ? ((livePrice - vwap) / vwap) * 100 : 0;

  const ema9Arr = computeEma(primaryCandles, 9);
  const ema21Arr = computeEma(primaryCandles, 21);
  const ema50Arr = computeEma(primaryCandles, 50);
  const ema9 = ema9Arr[ema9Arr.length - 1]?.value ?? livePrice;
  const ema21 = ema21Arr[ema21Arr.length - 1]?.value ?? livePrice;
  const ema50 = ema50Arr[ema50Arr.length - 1]?.value ?? livePrice;

  const rsi15 = computeLatestRsi(primaryCandles, 14);
  const macd15 = computeLatestMacd(primaryCandles);
  const atrRaw = computeAtr(primaryCandles, 14);
  const atr = atrRaw && atrRaw > 0 ? atrRaw : livePrice * 0.011;
  const bb = computeBollinger(primaryCandles, 20);
  const volRatio = computeVolumeRatio(primaryCandles);

  // Recent 24-bar intraday structure
  const recentWindow = primaryCandles.slice(-24);
  const recentHigh = Math.max(...recentWindow.map((c) => c.high));
  const recentLow = Math.min(...recentWindow.map((c) => c.low));

  // Multi-timeframe weighted indicator score (-1 to +1)
  const emaStackScore =
    ema9 > ema21 && ema21 > ema50
      ? 0.25
      : ema9 < ema21 && ema21 < ema50
        ? -0.25
        : ema9 > ema21
          ? 0.1
          : -0.1;

  const vwapScore =
    vwapDistPct > 0.15 ? 0.18 : vwapDistPct < -0.15 ? -0.18 : 0;

  const macdScore =
    macd15 && macd15.hist > 0 ? 0.12 : macd15 && macd15.hist < 0 ? -0.12 : 0;

  // Mean-reversion caution at extreme RSI
  const rsiAdjust =
    rsi15 !== null && rsi15 < 29
      ? 0.14
      : rsi15 !== null && rsi15 > 73
        ? -0.14
        : 0;

  const score =
    (tech15m?.score ?? 0) * 0.36 +
    (tech1h?.score ?? tech15m?.score ?? 0) * 0.28 +
    (tech5m?.score ?? tech15m?.score ?? 0) * 0.12 +
    emaStackScore +
    vwapScore +
    macdScore +
    rsiAdjust;

  let direction: BreadDirection = 'WAIT';
  if (score >= 0.14) direction = 'LONG';
  else if (score <= -0.14) direction = 'SHORT';

  // Higher-timeframe confluence bonus
  const tfAligned =
    (direction === 'LONG' && (tech1h?.score ?? 0) > 0 && vwapDistPct > 0) ||
    (direction === 'SHORT' && (tech1h?.score ?? 0) < 0 && vwapDistPct < 0);

  const volBonus = volRatio && volRatio >= 1.35 ? 6 : 0;
  const rawConf =
    direction === 'WAIT'
      ? 48 + Math.round(Math.abs(score) * 40)
      : Math.round(52 + Math.min(0.95, Math.abs(score)) * 38 + (tfAligned ? 7 : -4) + volBonus);
  const confidence = Math.max(32, Math.min(95, rawConf));
  const grade = computeGrade(confidence, direction);

  // Setup archetype classification
  let setupName = 'RANGE COIL — WAIT FOR BREAK';
  if (direction === 'LONG') {
    if (rsi15 !== null && rsi15 < 36) {
      setupName = 'OVERSOLD MEAN-REVERSION LONG';
    } else if (vwapDistPct >= 0 && vwapDistPct <= 0.75 && ema9 > ema21) {
      setupName = 'VWAP RECLAIM BREAKOUT';
    } else if (ema9 > ema21 && ema21 > ema50) {
      setupName = 'EMA TREND CONTINUATION';
    } else {
      setupName = 'INTRADAY MOMENTUM LONG';
    }
  } else if (direction === 'SHORT') {
    if (rsi15 !== null && rsi15 > 68) {
      setupName = 'OVERBOUGHT FADE SHORT';
    } else if (vwapDistPct <= 0 && vwapDistPct >= -0.85 && ema9 < ema21) {
      setupName = 'VWAP REJECTION SHORT';
    } else if (ema9 < ema21 && ema21 < ema50) {
      setupName = 'EMA BREAKDOWN CONTINUATION';
    } else {
      setupName = 'DISTRIBUTION PRESSURE SHORT';
    }
  } else if (bb && bb.widthPct < 1.6) {
    setupName = 'BOLLINGER SQUEEZE — BREAKOUT WATCH';
  }

  // ATR-calibrated Entry, Targets, Stop Loss, and Risk:Reward
  let entryLow: number;
  let entryHigh: number;
  let target1: number;
  let target2: number;
  let stopLoss: number;
  let invalidationNote: string;

  if (direction === 'LONG') {
    const pullbackAnchor = Math.max(livePrice - atr * 0.4, Math.min(livePrice, ema9));
    entryLow = roundPx(Math.min(livePrice, pullbackAnchor));
    entryHigh = roundPx(livePrice + atr * 0.12);
    const vwapStop = vwap < entryLow ? vwap - atr * 0.35 : entryLow - atr * 1.1;
    const rawStop = Math.min(entryLow - atr * 1.0, vwapStop);
    const boundedStop = Math.max(entryLow - atr * 1.45, rawStop);
    stopLoss = roundPx(Math.max(0.01, boundedStop));
    const unitRisk = Math.max(atr * 0.9, (entryLow + entryHigh) / 2 - stopLoss);
    target1 = roundPx(Math.max(entryHigh + unitRisk * 1.65, recentHigh));
    target2 = roundPx(target1 + unitRisk * 1.15);
    invalidationNote = `Invalidated on 15m close below ${fmtUsd(stopLoss)} (loses intraday EMA/VWAP support).`;
  } else if (direction === 'SHORT') {
    const bounceAnchor = Math.min(livePrice + atr * 0.4, Math.max(livePrice, ema9));
    entryLow = roundPx(Math.max(0.01, livePrice - atr * 0.12));
    entryHigh = roundPx(Math.max(livePrice, bounceAnchor));
    const vwapStop = vwap > entryHigh ? vwap + atr * 0.35 : entryHigh + atr * 1.1;
    const rawStop = Math.max(entryHigh + atr * 1.0, vwapStop);
    const boundedStop = Math.min(entryHigh + atr * 1.45, rawStop);
    stopLoss = roundPx(boundedStop);
    const unitRisk = Math.max(atr * 0.9, stopLoss - (entryLow + entryHigh) / 2);
    target1 = roundPx(Math.max(0.01, Math.min(entryLow - unitRisk * 1.65, recentLow)));
    target2 = roundPx(Math.max(0.01, target1 - unitRisk * 1.15));
    invalidationNote = `Invalidated on 15m reclaim above ${fmtUsd(stopLoss)} (breaks bearish EMA cap).`;
  } else {
    entryLow = roundPx(Math.max(0.01, vwap - atr * 0.25));
    entryHigh = roundPx(vwap + atr * 0.25);
    target1 = roundPx(recentHigh);
    target2 = roundPx(recentHigh + atr * 1.2);
    stopLoss = roundPx(Math.max(0.01, recentLow));
    invalidationNote = `Wait for decisive 15m candle close above ${fmtUsd(recentHigh)} (Long) or below ${fmtUsd(recentLow)} (Short).`;
  }

  const entryMid = (entryLow + entryHigh) / 2;
  const risk = Math.max(0.01, Math.abs(entryMid - stopLoss));
  const reward = Math.max(0.01, Math.abs(target1 - entryMid));
  const riskReward = Number((reward / risk).toFixed(1));

  // Match active breaking news catalyst mentioning this ticker
  const matchedNews = breakingNews.find((a) =>
    a.tickers.includes(meta.ticker),
  );

  // Build plain-English AI Chart Thesis
  const tfVerdict1h = tech1h ? tech1h.verdict : 'MIXED';
  const vwapWord = vwapDistPct >= 0 ? 'above' : 'below';
  const emaWord = ema9 >= ema21 ? 'bullish EMA(9)>EMA(21)' : 'bearish EMA(9)<EMA(21)';
  const rsiPhrase = rsi15 !== null ? `RSI(14) at ${rsi15.toFixed(0)}` : 'momentum stabilizing';
  const volPhrase =
    volRatio && volRatio >= 1.3
      ? ` with ${volRatio.toFixed(1)}× volume expansion`
      : '';

  let thesis: string;
  if (direction === 'LONG') {
    thesis = `${meta.ticker} trades ${Math.abs(vwapDistPct).toFixed(2)}% ${vwapWord} session VWAP (${fmtUsd(vwap)}) with ${emaWord}, ${rsiPhrase}, and 1h consensus ${tfVerdict1h}${volPhrase}. Favor dip entries in ${fmtUsd(entryLow)}–${fmtUsd(entryHigh)} targeting ${fmtUsd(target1)} and ${fmtUsd(target2)}.`;
  } else if (direction === 'SHORT') {
    thesis = `${meta.ticker} sits ${Math.abs(vwapDistPct).toFixed(2)}% ${vwapWord} session VWAP (${fmtUsd(vwap)}) under ${emaWord} pressure, ${rsiPhrase}, and 1h consensus ${tfVerdict1h}${volPhrase}. Look for failed bounce entries near ${fmtUsd(entryLow)}–${fmtUsd(entryHigh)} toward ${fmtUsd(target1)}.`;
  } else {
    thesis = `${meta.ticker} is compressing around session VWAP (${fmtUsd(vwap)}) with conflicting 15m/1h signals (${rsiPhrase}). Patience pays here — let price break ${fmtUsd(recentHigh)} or lose ${fmtUsd(recentLow)} before sizing in.`;
  }

  // Indicator checklist chips
  const indicators: BreadIndicatorChip[] = [
    {
      label: 'VWAP',
      value: `${vwapDistPct >= 0 ? '+' : ''}${vwapDistPct.toFixed(2)}%`,
      tone: vwapDistPct > 0.1 ? 'bull' : vwapDistPct < -0.1 ? 'bear' : 'amber',
    },
    {
      label: 'EMA 9/21',
      value: ema9 >= ema21 ? 'BULL' : 'BEAR',
      tone: ema9 >= ema21 ? 'bull' : 'bear',
    },
    {
      label: 'RSI(14)',
      value: rsi15 !== null ? rsi15.toFixed(1) : '—',
      tone:
        rsi15 === null
          ? 'neutral'
          : rsi15 < 32
            ? 'bull'
            : rsi15 > 68
              ? 'bear'
              : 'neutral',
    },
    {
      label: 'MACD',
      value: macd15 ? `${macd15.hist >= 0 ? '+' : ''}${macd15.hist.toFixed(2)}` : '—',
      tone:
        !macd15
          ? 'neutral'
          : macd15.hist > 0
            ? 'bull'
            : macd15.hist < 0
              ? 'bear'
              : 'neutral',
    },
    {
      label: '1H TA',
      value: tfVerdict1h,
      tone:
        tfVerdict1h === 'BUY' || tfVerdict1h === 'STRONG BUY'
          ? 'bull'
          : tfVerdict1h === 'SELL' || tfVerdict1h === 'STRONG SELL'
            ? 'bear'
            : 'amber',
    },
  ];

  if (volRatio !== null) {
    indicators.push({
      label: 'VOL',
      value: `${volRatio.toFixed(1)}×`,
      tone: volRatio >= 1.35 ? 'amber' : 'neutral',
    });
  }

  const baseRef = meta.referencePrice ?? quote?.prevClose ?? null;
  const changePct =
    baseRef && baseRef > 0
      ? ((livePrice - baseRef) / baseRef) * 100
      : quote?.changePct ?? null;

  return {
    ticker: meta.ticker,
    name: meta.name,
    direction,
    setupName,
    grade,
    confidence,
    timeframe: candles5m.length >= 20 ? '5m / 15m / 1h' : '15m / 1h',
    livePrice,
    changePct,
    entryLow,
    entryHigh,
    target1,
    target2,
    stopLoss,
    riskReward,
    thesis,
    invalidationNote,
    catalystHeadline: matchedNews?.title,
    indicators,
    updatedAt: Date.now(),
  };
}
