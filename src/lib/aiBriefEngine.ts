import type { TickerMeta } from '../data/tickers';
import {
  computeAtr,
  computeEma,
  computeLatestRsi,
  computeSessionVwap,
  type HlCandle,
} from './hyperliquidFeed';
import { computeLatestMacd, evaluateTechnicals } from './technicalEngine';
import type { MarketQuote } from './universalFeed';

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
  if (!Number.isFinite(n) || n <= 0) return '—';
  if (n >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `$${(n / 1e3).toFixed(0)}K`;
  return `$${n.toFixed(0)}`;
}

function fmtShares(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return '—';
  if (n >= 1e9) return `${(n / 1e9).toFixed(2)}B sh`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(2)}M sh`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(1)}K sh`;
  return `${Math.round(n)} sh`;
}

/**
 * Generates real-time quantitative AI market intelligence from live 15m/1h candles
 * and unified market quote (Hyperliquid 24/7 perps OR NASDAQ/NYSE/AMEX stocks & IPOs).
 * Also synthesizes a clean IPO / Reference brief when a listing has no intraday bars yet.
 */
export function generateAiBrief(
  meta: TickerMeta,
  candles15m: HlCandle[],
  candles1h: HlCandle[],
  quote: MarketQuote | null,
): AiMarketBrief | null {
  const ticker = meta.ticker;

  // Fallback brief for upcoming IPOs or stocks awaiting intraday candle bars
  if (candles15m.length < 20) {
    const refPx = quote?.price ?? meta.referencePrice ?? null;
    if (refPx === null && !meta.isIpo) return null;

    const anchor = refPx ?? 50;
    const isUpcoming = meta.ipoStatus === 'upcoming';
    const pct = quote?.changePct ?? null;
    const bias: 'bull' | 'bear' | 'neutral' =
      pct !== null && pct >= 1.5 ? 'bull' : pct !== null && pct <= -1.5 ? 'bear' : 'neutral';

    const levels: AiKeyLevel[] = meta.referenceLines?.length
      ? meta.referenceLines.map((rl) => ({
          label: rl.title.toUpperCase(),
          price: rl.price,
          tone: rl.tone,
          note: 'Key IPO / S-1 reference level',
        }))
      : [
          {
            label: 'UPSIDE +10%',
            price: Number((anchor * 1.1).toFixed(2)),
            tone: 'bull',
            note: 'Breakout extension target',
          },
          {
            label: meta.referenceLabel.toUpperCase(),
            price: anchor,
            tone: 'amber',
            note: isUpcoming ? 'Reference valuation anchor' : 'Latest session price',
          },
          {
            label: 'PULLBACK -8%',
            price: Number((anchor * 0.92).toFixed(2)),
            tone: 'amber',
            note: 'Initial support zone',
          },
          {
            label: 'FLOOR -15%',
            price: Number((anchor * 0.85).toFixed(2)),
            tone: 'bear',
            note: 'Downside risk guardrail',
          },
        ];

    return {
      regime: isUpcoming
        ? 'PRE-IPO S-1 WATCHLIST'
        : meta.isIpo
          ? 'EARLY IPO PRICE DISCOVERY'
          : 'EXCHANGE QUOTE SNAPSHOT',
      bias,
      conviction: isUpcoming ? 50 : 58,
      summaryHeadline: isUpcoming
        ? `${meta.name} (${ticker}) is in the ${meta.exchange ?? 'US'} IPO pipeline (${meta.ipoDate ?? 'Upcoming'}). Floor Chat, Valuation Calc & S-1 tracker are live ahead of Day 1 trading.`
        : refPx !== null
          ? `${meta.name} (${ticker}) last printed ${fmtUsd(refPx)} on ${quote?.exchangeLabel ?? meta.exchange ?? 'US Market'}${pct !== null ? ` (${pct >= 0 ? '+' : ''}${pct.toFixed(2)}%)` : ''}. Full intraday bars activate as session volume prints.`
          : `${meta.name} (${ticker}) War Room active — switch to TradingView chart or watch live session prints.`,
      overviewBullets: [
        `Listing Venue: ${meta.exchange ?? quote?.exchangeLabel ?? 'US Equities'} — ${meta.sector}.`,
        meta.ipoRangeLabel
          ? `IPO Terms: ${meta.ipoRangeLabel}${meta.ipoRaisedLabel ? ` (${meta.ipoRaisedLabel})` : ''}.`
          : `Valuation Anchor: ${refPx !== null ? fmtUsd(refPx) : 'Pending first trade'}${meta.dilutedSharesBillions ? ` (~${meta.dilutedSharesBillions}B diluted shares)` : ''}.`,
        'Multi-timeframe 15m/1h quantitative signals compute automatically once 20+ live bars stream in.',
      ],
      positioningBullets: [
        `Market Session: ${quote?.marketState ?? (isUpcoming ? 'PRE-LISTING' : 'STANDARD')} on ${quote?.exchangeLabel ?? meta.exchange ?? 'Exchange'}.`,
        quote && quote.volume > 0
          ? `Reported Volume: ${fmtShares(quote.volume)} (${fmtCompact(quote.dayNtlVlm)} est. notional).`
          : `Liquidity Watch: Awaiting regular exchange volume prints for ${ticker}.`,
        meta.isIpo
          ? 'IPO Volatility Profile: Expect wider opening-week spreads and rapid VWAP discovery.'
          : 'Use the Valuation & P&L Calculator and TradingView tab for multi-day structure.',
      ],
      levels,
      atrPct: null,
      rsi15m: null,
      vwapDistPct: null,
    };
  }

  const last = candles15m[candles15m.length - 1];
  const price = quote?.price && quote.price > 0 ? quote.price : last.close;

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

  const window24h = candles15m.slice(-96);
  const high24h = Math.max(...window24h.map((c) => c.high));
  const low24h = Math.min(...window24h.map((c) => c.low));
  const rangePos =
    high24h > low24h ? ((price - low24h) / (high24h - low24h)) * 100 : 50;

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

  const totalSignals =
    (tech15m?.buyCount ?? 0) + (tech15m?.sellCount ?? 0) + (tech15m?.neutralCount ?? 0);

  const summaryHeadline =
    bias === 'bull'
      ? `${ticker} holds ${vwapDistPct >= 0 ? '+' : ''}${vwapDistPct.toFixed(2)}% vs session VWAP with ${tech15m?.buyCount ?? 0}/${totalSignals} bullish 15m signals.`
      : bias === 'bear'
        ? `${ticker} trades ${vwapDistPct.toFixed(2)}% vs session VWAP; sellers control short-term EMA structure (${tech15m?.sellCount ?? 0} sell signals).`
        : `${ticker} is coiling mid-range (${rangePos.toFixed(0)}% of recent range) near ${fmtUsd(vwap)} VWAP pivot.`;

  const overviewBullets: string[] = [
    `Structure: EMA(9) ${fmtUsd(ema9)} is ${emaSpreadPct >= 0 ? 'above' : 'below'} EMA(21) ${fmtUsd(ema21)} (${emaSpreadPct >= 0 ? '+' : ''}${emaSpreadPct.toFixed(2)}% spread); multi-TF bias is ${tech1h ? tech1h.verdict : 'syncing'} on 1h.`,
    `Momentum: 15m RSI(14) reads ${rsi15m !== null ? rsi15m.toFixed(1) : '—'}${macd15m ? ` with MACD histogram ${macd15m.hist >= 0 ? '+' : ''}${macd15m.hist.toFixed(2)}` : ''}.`,
    `Volatility: 15m ATR is ${atr15m ? fmtUsd(atr15m) : '—'}${atrPct ? ` (${atrPct.toFixed(2)}% per bar)` : ''}; price sits at ${rangePos.toFixed(0)}% of range (${fmtUsd(low24h)} – ${fmtUsd(high24h)}).`,
  ];

  // Positioning / Flow bullets adapt cleanly between Hyperliquid 24/7 Perps and Exchange Equities/IPOs
  let positioningBullets: string[];
  if (quote?.source === 'hyperliquid' && quote.funding !== null) {
    const fundingAnn = quote.funding * 24 * 365 * 100;
    const fundingTone =
      fundingAnn > 18
        ? 'Crowded longs (elevated positive funding)'
        : fundingAnn < -10
          ? 'Short-heavy (squeeze potential on negative funding)'
          : 'Balanced two-way positioning';

    positioningBullets = [
      `Funding Bias: ${quote.funding >= 0 ? '+' : ''}${(quote.funding * 100).toFixed(4)}%/hr (${fundingAnn >= 0 ? '+' : ''}${fundingAnn.toFixed(1)}% ann.) — ${fundingTone}.`,
      `Liquidity & OI: 24h notional volume ${fmtCompact(quote.dayNtlVlm)} against ${quote.openInterest !== null ? fmtCompact(quote.openInterest) : '—'} live open interest.`,
      quote.oraclePx && quote.oraclePx > 0
        ? `Basis vs Oracle: Mark ${fmtUsd(price)} vs Oracle ${fmtUsd(quote.oraclePx)} (${((price - quote.oraclePx) / quote.oraclePx) * 100 >= 0 ? '+' : ''}${(((price - quote.oraclePx) / quote.oraclePx) * 100).toFixed(2)}% perp premium/discount).`
        : `24/7 Perp Price Discovery: Tracking real-time mark ${fmtUsd(price)} via ${quote.exchangeLabel}.`,
    ];
  } else {
    const dayRangeStr =
      quote?.dayLow && quote.dayHigh
        ? `${fmtUsd(quote.dayLow)} – ${fmtUsd(quote.dayHigh)}`
        : `${fmtUsd(low24h)} – ${fmtUsd(high24h)}`;
    const wk52Str =
      quote?.fiftyTwoWeekLow && quote.fiftyTwoWeekHigh
        ? `${fmtUsd(quote.fiftyTwoWeekLow)} – ${fmtUsd(quote.fiftyTwoWeekHigh)} (${(((price - quote.fiftyTwoWeekLow) / Math.max(0.01, quote.fiftyTwoWeekHigh - quote.fiftyTwoWeekLow)) * 100).toFixed(0)}% of 52W)`
        : null;

    positioningBullets = [
      `Exchange Flow (${quote?.exchangeLabel ?? meta.exchange ?? 'US MKT'}): Session status ${quote?.marketState ?? 'LIVE'} with ${quote && quote.volume > 0 ? `${fmtShares(quote.volume)} (${fmtCompact(quote.dayNtlVlm)} est.)` : 'active intraday bars'}.`,
      `Session Range: Trading inside ${dayRangeStr} (${rangePos.toFixed(0)}% range position vs VWAP ${fmtUsd(vwap)}).`,
      wk52Str
        ? `52-Week Positioning: ${wk52Str}.`
        : meta.referencePrice
          ? `vs ${meta.referenceLabel}: ${fmtUsd(price)} vs ${fmtUsd(meta.referencePrice)} (${(((price - meta.referencePrice) / meta.referencePrice) * 100) >= 0 ? '+' : ''}${(((price - meta.referencePrice) / meta.referencePrice) * 100).toFixed(2)}%).`
          : `Direct Exchange Feed: Live multi-timeframe candles & technical consensus synced for ${ticker}.`,
    ];
  }

  const atrStep = atr15m && atr15m > 0 ? atr15m : price * 0.012;
  const levels: AiKeyLevel[] = [
    {
      label: 'RANGE BREAKOUT',
      price: high24h,
      tone: 'bull',
      note: 'Recent range high resistance',
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
      label: 'RANGE FLOOR',
      price: low24h,
      tone: 'bear',
      note: 'Recent range low invalidation',
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
