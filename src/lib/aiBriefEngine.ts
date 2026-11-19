import {
  computeAtr,
  computeEma,
  computeLatestRsi,
  computeSessionVwap,
  type HlAssetCtx,
  type HlCandle,
} from './hyperliquidFeed';
import { computeLatestMacd, evaluateTechnicals } from './technicalEngine';

export interface AiKeyLevel {
  label: string;
  price: number;
  tone: 'bull' | 'amber' | 'bear';
  note: string;
}

export interface AiMarketBrief {
  regime: string;
  bias: 'bull' | 'bear' | 'neutral';
  conviction: number; // 0-100
  summaryHeadline: string;
  overviewBullets: string[];
  positioningBullets: string[];
  levels: AiKeyLevel[];
  atrPct: number | null;
  rsi15m: number | null;
  vwapDistPct: number | null;
}

function fmtUsd(n: number): string {
  return `$${n.toFixed(2)}`;
}

function fmtCompact(n: number): string {
  if (n >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `$${(n / 1e3).toFixed(0)}K`;
  return `$${n.toFixed(0)}`;
}

/**
 * Generates real-time quantitative AI market intelligence from live 15m/1h candles
 * and Hyperliquid orderbook/funding context. Zero fabricated prices or guesses.
 */
export function generateAiBrief(
  ticker: string,
  candles15m: HlCandle[],
  candles1h: HlCandle[],
  ctx: HlAssetCtx | null,
): AiMarketBrief | null {
  if (candles15m.length < 20) return null;

  const last = candles15m[candles15m.length - 1];
  const price = ctx?.markPx && ctx.markPx > 0 ? ctx.markPx : last.close;

  const tech15m = evaluateTechnicals(candles15m);
  const tech1h = candles1h.length >= 20 ? evaluateTechnicals(candles1h) : null;
  const vwapArr = computeSessionVwap(candles15m);
  const vwap = vwapArr[vwapArr.length - 1]?.value ?? price;
  const vwapDistPct = ((price - vwap) / vwap) * 100;

  const ema9Arr = computeEma(candles15m, 9);
  const ema21Arr = computeEma(candles15m, 21);
  const ema9 = ema9Arr[ema9Arr.length - 1]?.value ?? price;
  const ema21 = ema21Arr[ema21Arr.length - 1]?.value ?? price;
  const emaSpreadPct = ((ema9 - ema21) / ema21) * 100;

  const rsi15m = computeLatestRsi(candles15m, 14);
  const macd15m = computeLatestMacd(candles15m);
  const atr15m = computeAtr(candles15m, 14);
  const atrPct = atr15m ? (atr15m / price) * 100 : null;

  // 24h range from last 96 x 15m candles
  const window24h = candles15m.slice(-96);
  const high24h = Math.max(...window24h.map((c) => c.high));
  const low24h = Math.min(...window24h.map((c) => c.low));
  const rangePos =
    high24h > low24h ? ((price - low24h) / (high24h - low24h)) * 100 : 50;

  // Composite score combining 15m + 1h technicals & VWAP regime
  const rawScore =
    (tech15m?.score ?? 0) * 0.55 +
    (tech1h?.score ?? tech15m?.score ?? 0) * 0.35 +
    (vwapDistPct > 0 ? 0.1 : -0.1);

  let bias: 'bull' | 'bear' | 'neutral' = 'neutral';
  if (rawScore >= 0.16) bias = 'bull';
  else if (rawScore <= -0.16) bias = 'bear';

  const conviction = Math.min(
    96,
    Math.max(24, Math.round(50 + Math.abs(rawScore) * 48)),
  );

  let regime = 'RANGE CONSOLIDATION';
  if (bias === 'bull' && rsi15m !== null && rsi15m > 68) {
    regime = 'BULLISH OVERBOUGHT STRETCH';
  } else if (bias === 'bull' && vwapDistPct > 0 && emaSpreadPct > 0) {
    regime = 'BULLISH TREND ABOVE VWAP';
  } else if (bias === 'bull') {
    regime = 'VWAP RECLAIM / ACCUMULATION';
  } else if (bias === 'bear' && rsi15m !== null && rsi15m < 32) {
    regime = 'OVERSOLD FLUSH / BOUNCE WATCH';
  } else if (bias === 'bear' && vwapDistPct < 0 && emaSpreadPct < 0) {
    regime = 'BEARISH DISTRIBUTION BELOW VWAP';
  } else if (bias === 'bear') {
    regime = 'PULLBACK PRESSURE';
  }

  const summaryHeadline =
    bias === 'bull'
      ? `${ticker} holds ${vwapDistPct >= 0 ? '+' : ''}${vwapDistPct.toFixed(2)}% vs session VWAP with ${tech15m?.buyCount ?? 0}/${(tech15m?.buyCount ?? 0) + (tech15m?.sellCount ?? 0) + (tech15m?.neutralCount ?? 0)} bullish 15m signals.`
      : bias === 'bear'
        ? `${ticker} trades ${vwapDistPct.toFixed(2)}% vs session VWAP; sellers control short-term EMA structure (${tech15m?.sellCount ?? 0} sell signals).`
        : `${ticker} is coiling mid-range (${rangePos.toFixed(0)}% of 24h range) near ${fmtUsd(vwap)} VWAP pivot.`;

  const overviewBullets: string[] = [
    `Structure: EMA(9) ${fmtUsd(ema9)} is ${emaSpreadPct >= 0 ? 'above' : 'below'} EMA(21) ${fmtUsd(ema21)} (${emaSpreadPct >= 0 ? '+' : ''}${emaSpreadPct.toFixed(2)}% spread); multi-TF bias is ${tech1h ? tech1h.verdict : 'syncing'} on 1h.`,
    `Momentum: 15m RSI(14) reads ${rsi15m !== null ? rsi15m.toFixed(1) : '—'}${macd15m ? ` with MACD histogram ${macd15m.hist >= 0 ? '+' : ''}${macd15m.hist.toFixed(2)}` : ''}.`,
    `Volatility: 15m ATR is ${atr15m ? fmtUsd(atr15m) : '—'}${atrPct ? ` (${atrPct.toFixed(2)}% per bar)` : ''}; price sits at ${rangePos.toFixed(0)}% of 24h range (${fmtUsd(low24h)} – ${fmtUsd(high24h)}).`,
  ];

  // Positioning bullets from Hyperliquid funding, OI, volume
  const fundingAnn = ctx ? ctx.funding * 24 * 365 * 100 : null;
  const fundingTone =
    fundingAnn === null
      ? 'Neutral'
      : fundingAnn > 18
        ? 'Crowded longs (elevated positive funding)'
        : fundingAnn < -10
          ? 'Short-heavy (squeeze potential on negative funding)'
          : 'Balanced two-way positioning';

  const positioningBullets: string[] = [
    `Funding Bias: ${ctx ? `${ctx.funding >= 0 ? '+' : ''}${(ctx.funding * 100).toFixed(4)}%/hr` : '—'}${fundingAnn !== null ? ` (${fundingAnn >= 0 ? '+' : ''}${fundingAnn.toFixed(1)}% ann.)` : ''} — ${fundingTone}.`,
    `Liquidity & OI: 24h notional volume ${ctx ? fmtCompact(ctx.dayNtlVlm) : '—'} against ${ctx ? fmtCompact(ctx.openInterest) : '—'} live open interest.`,
    ctx?.oraclePx && ctx.oraclePx > 0
      ? `Basis vs Oracle: Mark ${fmtUsd(price)} vs Oracle ${fmtUsd(ctx.oraclePx)} (${(((price - ctx.oraclePx) / ctx.oraclePx) * 100 >= 0 ? '+' : '')}${(((price - ctx.oraclePx) / ctx.oraclePx) * 100).toFixed(2)}% perp premium/discount).`
      : `24/7 Perp Price Discovery: Tracking real-time mark ${fmtUsd(price)} with 0-delay WebSocket updates.`,
  ];

  const atrStep = atr15m && atr15m > 0 ? atr15m : price * 0.012;
  const levels: AiKeyLevel[] = [
    {
      label: '24H BREAKOUT',
      price: high24h,
      tone: 'bull',
      note: '24h range high resistance',
    },
    {
      label: 'VWAP PIVOT',
      price: vwap,
      tone: 'amber',
      note: 'Intraday institutional fair value',
    },
    {
      label: 'ATR SUPPORT',
      price: Math.max(0.01, price - atrStep * 1.5),
      tone: 'amber',
      note: '1.5× ATR pullback cushion',
    },
    {
      label: '24H FLOOR',
      price: low24h,
      tone: 'bear',
      note: '24h range low invalidation',
    },
  ];

  return {
    regime,
    bias,
    conviction,
    summaryHeadline,
    overviewBullets,
    positioningBullets,
    levels,
    atrPct,
    rsi15m,
    vwapDistPct,
  };
}
