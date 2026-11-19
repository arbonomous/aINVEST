import {
  computeEma,
  computeLatestRsi,
  computeSessionVwap,
  type HlCandle,
} from './hyperliquidFeed';

export type SignalVote = 'buy' | 'neutral' | 'sell';

export interface IndicatorSignal {
  name: string;
  valueLabel: string;
  signal: SignalVote;
  group: 'ma' | 'osc';
}

export interface TechnicalSummary {
  verdict: 'STRONG SELL' | 'SELL' | 'NEUTRAL' | 'BUY' | 'STRONG BUY';
  score: number; // -1 to +1
  buyCount: number;
  neutralCount: number;
  sellCount: number;
  maCounts: { buy: number; neutral: number; sell: number };
  oscCounts: { buy: number; neutral: number; sell: number };
  highlights: IndicatorSignal[];
  lastPrice: number;
  candleCount: number;
}

function computeLatestSma(closes: number[], period: number): number | null {
  if (closes.length < period) return null;
  let sum = 0;
  for (let i = closes.length - period; i < closes.length; i++) {
    sum += closes[i];
  }
  return sum / period;
}

export function computeLatestMacd(
  candles: HlCandle[],
): { macd: number; signal: number; hist: number } | null {
  if (candles.length < 35) return null;
  const ema12 = computeEma(candles, 12);
  const ema26 = computeEma(candles, 26);
  const macdSeries: number[] = [];
  for (let i = 0; i < candles.length; i++) {
    macdSeries.push(ema12[i].value - ema26[i].value);
  }
  const k = 2 / (9 + 1);
  let sig = macdSeries[0];
  for (let i = 1; i < macdSeries.length; i++) {
    sig = macdSeries[i] * k + sig * (1 - k);
  }
  const macd = macdSeries[macdSeries.length - 1];
  return { macd, signal: sig, hist: macd - sig };
}

function computeStochK(candles: HlCandle[], period = 14): number | null {
  if (candles.length < period) return null;
  const slice = candles.slice(-period);
  const highest = Math.max(...slice.map((c) => c.high));
  const lowest = Math.min(...slice.map((c) => c.low));
  if (highest === lowest) return 50;
  const close = slice[slice.length - 1].close;
  return ((close - lowest) / (highest - lowest)) * 100;
}

function computeCci(candles: HlCandle[], period = 20): number | null {
  if (candles.length < period) return null;
  const slice = candles.slice(-period);
  const tps = slice.map((c) => (c.high + c.low + c.close) / 3);
  const mean = tps.reduce((a, b) => a + b, 0) / period;
  const meanDev = tps.reduce((a, b) => a + Math.abs(b - mean), 0) / period;
  if (meanDev === 0) return 0;
  return (tps[tps.length - 1] - mean) / (0.015 * meanDev);
}

function computeWilliamsR(candles: HlCandle[], period = 14): number | null {
  if (candles.length < period) return null;
  const slice = candles.slice(-period);
  const highest = Math.max(...slice.map((c) => c.high));
  const lowest = Math.min(...slice.map((c) => c.low));
  if (highest === lowest) return -50;
  const close = slice[slice.length - 1].close;
  return ((highest - close) / (highest - lowest)) * -100;
}

function maVote(price: number, level: number): SignalVote {
  const pctDiff = ((price - level) / level) * 100;
  if (pctDiff > 0.08) return 'buy';
  if (pctDiff < -0.08) return 'sell';
  return 'neutral';
}

export function evaluateTechnicals(candles: HlCandle[]): TechnicalSummary | null {
  if (candles.length < 20) return null;

  const closes = candles.map((c) => c.close);
  const lastPrice = closes[closes.length - 1];
  const signals: IndicatorSignal[] = [];

  for (const p of [9, 20, 30, 50, 100]) {
    if (candles.length >= p) {
      const series = computeEma(candles, p);
      const val = series[series.length - 1].value;
      signals.push({
        name: `EMA(${p})`,
        valueLabel: `$${val.toFixed(2)}`,
        signal: maVote(lastPrice, val),
        group: 'ma',
      });
    }
  }

  for (const p of [10, 20, 30, 50, 100]) {
    const val = computeLatestSma(closes, p);
    if (val !== null) {
      signals.push({
        name: `SMA(${p})`,
        valueLabel: `$${val.toFixed(2)}`,
        signal: maVote(lastPrice, val),
        group: 'ma',
      });
    }
  }

  const vwapSeries = computeSessionVwap(candles);
  const latestVwap = vwapSeries[vwapSeries.length - 1]?.value;
  if (latestVwap) {
    signals.push({
      name: 'VWAP',
      valueLabel: `$${latestVwap.toFixed(2)}`,
      signal: maVote(lastPrice, latestVwap),
      group: 'ma',
    });
  }

  const rsi = computeLatestRsi(candles, 14);
  if (rsi !== null) {
    signals.push({
      name: 'RSI(14)',
      valueLabel: rsi.toFixed(1),
      signal: rsi < 30 ? 'buy' : rsi > 70 ? 'sell' : 'neutral',
      group: 'osc',
    });
  }

  const macd = computeLatestMacd(candles);
  if (macd !== null) {
    signals.push({
      name: 'MACD',
      valueLabel: `${macd.hist >= 0 ? '+' : ''}${macd.hist.toFixed(2)}`,
      signal: macd.hist > 0.01 ? 'buy' : macd.hist < -0.01 ? 'sell' : 'neutral',
      group: 'osc',
    });
  }

  const stoch = computeStochK(candles, 14);
  if (stoch !== null) {
    signals.push({
      name: 'STOCH %K',
      valueLabel: stoch.toFixed(1),
      signal: stoch < 20 ? 'buy' : stoch > 80 ? 'sell' : 'neutral',
      group: 'osc',
    });
  }

  const cci = computeCci(candles, 20);
  if (cci !== null) {
    signals.push({
      name: 'CCI(20)',
      valueLabel: cci.toFixed(0),
      signal: cci < -100 ? 'buy' : cci > 100 ? 'sell' : 'neutral',
      group: 'osc',
    });
  }

  const willR = computeWilliamsR(candles, 14);
  if (willR !== null) {
    signals.push({
      name: 'WILL %R',
      valueLabel: willR.toFixed(1),
      signal: willR < -80 ? 'buy' : willR > -20 ? 'sell' : 'neutral',
      group: 'osc',
    });
  }

  if (candles.length >= 11) {
    const mom = lastPrice - candles[candles.length - 11].close;
    signals.push({
      name: 'MOM(10)',
      valueLabel: `${mom >= 0 ? '+' : ''}${mom.toFixed(2)}`,
      signal: mom > 0.05 ? 'buy' : mom < -0.05 ? 'sell' : 'neutral',
      group: 'osc',
    });
  }

  const maCounts = { buy: 0, neutral: 0, sell: 0 };
  const oscCounts = { buy: 0, neutral: 0, sell: 0 };

  for (const s of signals) {
    const bucket = s.group === 'ma' ? maCounts : oscCounts;
    bucket[s.signal] += 1;
  }

  const buyCount = maCounts.buy + oscCounts.buy;
  const neutralCount = maCounts.neutral + oscCounts.neutral;
  const sellCount = maCounts.sell + oscCounts.sell;
  const total = Math.max(1, buyCount + neutralCount + sellCount);
  const score = (buyCount - sellCount) / total;

  let verdict: TechnicalSummary['verdict'] = 'NEUTRAL';
  if (score >= 0.45) verdict = 'STRONG BUY';
  else if (score >= 0.12) verdict = 'BUY';
  else if (score <= -0.45) verdict = 'STRONG SELL';
  else if (score <= -0.12) verdict = 'SELL';

  const highlightNames = ['RSI(14)', 'MACD', 'VWAP', 'EMA(20)', 'STOCH %K', 'MOM(10)'];
  const highlights = highlightNames
    .map((n) => signals.find((s) => s.name === n))
    .filter((item): item is IndicatorSignal => Boolean(item));

  return {
    verdict,
    score,
    buyCount,
    neutralCount,
    sellCount,
    maCounts,
    oscCounts,
    highlights,
    lastPrice,
    candleCount: candles.length,
  };
}
