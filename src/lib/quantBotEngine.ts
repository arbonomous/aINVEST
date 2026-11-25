import {
  CURATED_MAP,
  FEATURED_IPOS,
  FLAGSHIP_TICKERS,
  resolveTickerMeta,
} from '../data/tickers';
import {
  computeTickerConfluence,
  rankMarketConfluence,
  type ConfluenceReport,
} from './confluenceEngine';
import type { HlAssetCtx } from './hyperliquidFeed';
import type { InsidersBundle } from './insidersEngine';
import type { DirectoryEntry } from './marketCatalog';
import { fetchNasdaqLaggardsSnapshot } from './nasdaqFeed';
import type { NewsArticle } from './newsFeed';
import type { MarketQuote } from './universalFeed';
import {
  fetchTickerOptionsFlow,
  type TickerOptionsSummary,
} from './whaleFlowEngine';

export interface QuantBotMetric {
  label: string;
  value: string;
  tone?: 'emerald' | 'crimson' | 'amber' | 'neutral';
}

export interface QuantBotRow {
  rank?: number;
  ticker: string;
  name: string;
  price?: string;
  changePct?: string;
  changeTone?: 'emerald' | 'crimson' | 'neutral';
  detail: string;
  badge?: string;
  badgeTone?: 'emerald' | 'crimson' | 'amber';
}

export interface QuantBotResponse {
  id: string;
  intent: 'ticker' | 'compare' | 'scan' | 'concept' | 'help';
  title: string;
  badge: string;
  badgeTone: 'emerald' | 'crimson' | 'amber' | 'neutral';
  summary: string;
  bullets: string[];
  rows?: QuantBotRow[];
  metrics: QuantBotMetric[];
  tickers: string[];
  followUps: string[];
}

export interface QuantBotContext {
  activeTicker: string;
  ctxMap: Record<string, HlAssetCtx>;
  quoteMap: Record<string, MarketQuote>;
  directoryMap: Record<string, DirectoryEntry>;
  insidersBundle: InsidersBundle | null;
  optionsMap: Record<string, TickerOptionsSummary>;
  articles: NewsArticle[];
}

interface TaConcept {
  id: string;
  keywords: string[];
  title: string;
  badge: string;
  summary: string;
  bullets: string[];
  followUps: string[];
}

const TA_CONCEPTS: TaConcept[] = [
  {
    id: 'gex',
    keywords: ['gex', 'gamma exposure', 'gamma flip', 'call wall', 'put wall', 'dealer gamma', 'zero gamma'],
    title: 'Dealer Gamma Exposure (GEX), Walls & Gamma Flip',
    badge: 'OPTIONS STRUCTURE',
    summary:
      'Dealer GEX measures how options market makers must hedge as price moves. Positive GEX (+GEX) dampens volatility (mean-reversion / pinning); negative GEX (-GEX) amplifies moves (trend / squeeze acceleration).',
    bullets: [
      'Call Wall: Strike with the highest positive Call GEX above spot — acts as a magnetic ceiling or resistance.',
      'Put Wall: Strike with the largest Put GEX below spot — acts as dealer-hedged support.',
      'Zero-Gamma Flip: Price level where net dealer gamma crosses zero; below it, dealers sell into drops and buy into rips.',
    ],
    followUps: ['SPY GEX & walls', 'NVDA options flow', 'What is Max Pain?'],
  },
  {
    id: 'max-pain',
    keywords: ['max pain', 'pinning', 'opex'],
    title: 'Max Pain & Expiration Pinning',
    badge: 'OPTIONS',
    summary:
      'Max Pain is the strike price where the largest dollar value of open call and put contracts would expire worthless at expiration.',
    bullets: [
      'Strongest on Thursday–Friday of weekly/monthly OPEX when 0–2 DTE gamma is highest.',
      'Works best alongside Call/Put Walls — if Max Pain sits inside a +GEX zone, price tends to gravitate toward it.',
    ],
    followUps: ['SPY max pain', 'Explain Gamma Flip', 'Top bullish setups'],
  },
  {
    id: 'vwap',
    keywords: ['vwap', 'volume weighted'],
    title: 'Session VWAP (Volume-Weighted Average Price)',
    badge: 'INTRADAY TA',
    summary:
      'VWAP is the institutional benchmark for fair intraday value, weighting every trade by volume.',
    bullets: [
      'Price holding above rising VWAP signals institutional accumulation (bullish bias).',
      'Reclaiming VWAP on expanding volume after an early flush is one of the highest-probability intraday long triggers.',
      'Avoid chasing extended >2 ATR above VWAP — look for pullbacks to VWAP or EMA 9.',
    ],
    followUps: ['Explain RSI divergence', 'Analyze NVDA', 'Top bullish setups'],
  },
  {
    id: 'rsi',
    keywords: ['rsi', 'relative strength', 'overbought', 'oversold', 'divergence'],
    title: 'RSI(14) & Momentum Divergence',
    badge: 'MOMENTUM TA',
    summary:
      'RSI(14) measures the speed and magnitude of recent price changes on a 0–100 scale.',
    bullets: [
      'Bullish Divergence: Price makes a lower low while RSI makes a higher low — signals selling exhaustion.',
      'Bearish Divergence: Price makes a higher high while RSI makes a lower high — warns of upside fade.',
      'In strong trends, RSI can stay >70 (bull) or <30 (bear) for days; pair with VWAP & GEX walls before fading.',
    ],
    followUps: ['Explain MACD', 'Explain VWAP', 'Analyze TSLA'],
  },
  {
    id: 'macd',
    keywords: ['macd', 'histogram', 'signal line'],
    title: 'MACD (12, 26, 9) Trend & Momentum',
    badge: 'TREND TA',
    summary:
      'MACD tracks the convergence/divergence between the 12-period and 26-period EMAs, with a 9-period signal line.',
    bullets: [
      'Bullish cross above the zero line confirms trend continuation rather than just a dead-cat bounce.',
      'Histogram shrinking toward zero often precedes a cross by 2–4 candles.',
    ],
    followUps: ['Explain EMA 9/21', 'Explain RSI', 'Analyze SPY'],
  },
  {
    id: 'ema',
    keywords: ['ema', 'moving average', 'sma', 'golden cross', 'death cross', 'ribbon'],
    title: 'EMA 9 / 21 / 50 Trend Structure',
    badge: 'TREND TA',
    summary:
      'Exponential Moving Averages react faster to recent price action than SMAs, making EMA 9/21 ideal for intraday & swing momentum.',
    bullets: [
      'Bullish Stack (Price > EMA 9 > EMA 21 > EMA 50): healthy uptrend; dips to EMA 9/21 often get bought.',
      'EMA 9 crossing below EMA 21 on rising volume warns of short-term momentum breakdown.',
    ],
    followUps: ['Explain VWAP', 'Explain ATR risk sizing', 'Analyze NVDA'],
  },
  {
    id: 'atr',
    keywords: ['atr', 'bollinger', 'volatility', 'stop loss', 'position size', 'risk reward', 'r:r'],
    title: 'ATR Risk Sizing, Bollinger Bands & R:R',
    badge: 'RISK MGMT',
    summary:
      'ATR(14) measures average candle range so stops and targets adapt to each ticker’s real volatility instead of arbitrary percentages.',
    bullets: [
      'Daily Bread places stops ~1.0–1.4× ATR beyond invalidation and targets 1.5R (TP1) and 2.5R+ (TP2).',
      'Bollinger Band Squeeze (narrow bands) signals volatility compression before an explosive breakout.',
    ],
    followUps: ['What is Expected Move?', 'Top bullish setups', 'Analyze PLTR'],
  },
  {
    id: 'squeeze',
    keywords: ['short squeeze', 'ftd', 'fail to deliver', 'reg sho', 'short volume'],
    title: 'FINRA Short Volume & SEC FTD Squeeze Signals',
    badge: 'INSIDER / SQUEEZE',
    summary:
      'Short squeezes ignite when elevated short interest/FTDs collide with positive catalysts or call-heavy options flow.',
    bullets: [
      'Short Volume Ratio >55% across multiple sessions shows heavy aggressive shorting.',
      'Spiking SEC Fails-to-Deliver (FTDs) indicate settlement stress; forced buy-ins can trigger vertical squeezes.',
    ],
    followUps: ['Show short squeeze setups', 'Congress & cluster buys', 'Analyze GME'],
  },
  {
    id: 'iv',
    keywords: ['iv skew', 'skew', 'term structure', 'expected move', 'straddle', 'backwardation', 'contango'],
    title: 'IV Skew, Term Structure & ±1σ Expected Move',
    badge: 'VOLATILITY',
    summary:
      'Options implied volatility reveals how much movement the market is pricing in and which tail traders are paying up to hedge.',
    bullets: [
      '±1σ Expected Move ≈ 0.85 × ATM Straddle — defines the market-implied range into the next expiration.',
      'Put Skew >+4%: institutions paying up for downside protection; Call FOMO (< -3%): aggressive upside call bidding.',
      'Backwardation (Front IV > Back IV): near-term event risk (earnings, FOMC, CPI).',
    ],
    followUps: ['Explain GEX & Gamma Flip', 'Upcoming earnings', 'Analyze NVDA'],
  },
  {
    id: 'confluence',
    keywords: ['confluence', '5-pillar', 'pillars', 'how does ainvest work', 'score'],
    title: 'aINVEST 5-Pillar Cross-Signal Confluence',
    badge: 'SYSTEM',
    summary:
      'Confluence measures how many independent market forces agree on direction at the same time (0–100 score).',
    bullets: [
      'TECH: Intraday trend, price action & Daily Bread structure.',
      'WHALE: Options Call/Put premium flow & Dealer GEX regime.',
      'INSIDER: Congress STOCK Act trades, SEC Form 4 cluster buys & FINRA short squeeze pressure.',
      '24/7 + CATALYST: Hyperliquid perp bid/offer & Earnings/Macro/News catalysts.',
    ],
    followUps: ['Top bullish setups', 'Top bearish setups', 'Congress & cluster buys'],
  },
];

const STOP_WORDS = new Set([
  'A', 'AN', 'AND', 'ARE', 'AS', 'AT', 'BE', 'BEST', 'BULL', 'BEAR', 'BUY',
  'BY', 'CAN', 'COMPARE', 'DO', 'DOES', 'EARNINGS', 'EXPLAIN', 'FIND', 'FLOW',
  'FOR', 'FROM', 'GEX', 'GOOD', 'HOW', 'I', 'IN', 'IS', 'IT', 'LIKE', 'LONG',
  'MACD', 'MAX', 'ME', 'MY', 'NOW', 'OF', 'ON', 'OR', 'RSI', 'SCAN', 'SELL',
  'SETUP', 'SETUPS', 'SHORT', 'SHOW', 'SQUEEZE', 'STOCK', 'STOCKS', 'TELL',
  'THE', 'THIS', 'TO', 'TOP', 'TRADE', 'UP', 'VS', 'VWAP', 'WHAT', 'WHALE',
  'WHEN', 'WHERE', 'WHICH', 'WHY', 'WITH', 'EMA', 'ATR', 'IV', 'OI', 'PE',
  'IPO', 'IPOS', 'BOT', 'AI', 'TA', 'NEWS', 'PRICE', 'TARGET', 'SUPPORT',
  'RESISTANCE', 'ANALYZE', 'ANALYSIS', 'CHECK', 'LOOK', 'ABOUT', 'TEACH',
  'GAMMA', 'EXPOSURE', 'FLIP', 'WALL', 'WALLS', 'PAIN', 'SKEW', 'TERM',
  'STRUCTURE', 'DIVERGENCE', 'BOLLINGER', 'BANDS', 'CONFLUENCE', 'PILLAR',
  'PILLARS', 'VOLATILITY', 'PINNING', 'OPEX', 'STRADDLE', 'BACKWARDATION',
  'CONTANGO', 'MEAN', 'DEFINE', 'MAKE', 'LIST', 'THAT', 'GIVE', 'WANT',
  'NEED', 'HELP', 'HAVE', 'USE', 'USES',
]);

const NAME_TO_TICKER: Record<string, string> = {
  NVIDIA: 'NVDA',
  TESLA: 'TSLA',
  APPLE: 'AAPL',
  MICROSOFT: 'MSFT',
  AMAZON: 'AMZN',
  GOOGLE: 'GOOGL',
  ALPHABET: 'GOOGL',
  META: 'META',
  FACEBOOK: 'META',
  PALANTIR: 'PLTR',
  ANTHROPIC: 'ANT',
  SPACEX: 'SPCX',
  COINBASE: 'COIN',
  CROWDSTRIKE: 'CRWD',
  BROADCOM: 'AVGO',
  NETFLIX: 'NFLX',
  MICRON: 'MU',
  COREWEAVE: 'CRWV',
  GAMESTOP: 'GME',
  ROBINHOOD: 'HOOD',
  ORACLE: 'ORCL',
  DISNEY: 'DIS',
};

function fmtUsd(n: number): string {
  const abs = Math.abs(n);
  const sign = n < 0 ? '-' : '';
  if (abs >= 1e9) return `${sign}$${(abs / 1e9).toFixed(2)}B`;
  if (abs >= 1e6) return `${sign}$${(abs / 1e6).toFixed(1)}M`;
  if (abs >= 1e3) return `${sign}$${(abs / 1e3).toFixed(0)}K`;
  return `${sign}$${abs.toFixed(0)}`;
}

export function extractTickersFromQuery(
  rawQuery: string,
  directoryMap: Record<string, DirectoryEntry>,
): string[] {
  const found: string[] = [];
  const push = (sym: string) => {
    const clean = sym.toUpperCase();
    if (!found.includes(clean)) found.push(clean);
  };

  const tokens = rawQuery.trim().split(/[\s,/?!]+/).filter(Boolean);
  for (const rawTok of tokens) {
    const cleanDollar = rawTok.startsWith('$')
      ? rawTok.slice(1).toUpperCase().replace(/[^A-Z0-9._-]/g, '')
      : '';
    if (cleanDollar && cleanDollar.length <= 10) {
      push(cleanDollar);
      continue;
    }

    const tok = rawTok.toUpperCase().replace(/[^A-Z0-9._-]/g, '');
    if (!tok) continue;

    if (NAME_TO_TICKER[tok]) {
      push(NAME_TO_TICKER[tok]);
      continue;
    }

    if (tok.length > 6 || STOP_WORDS.has(tok)) continue;

    const meta = resolveTickerMeta(tok);
    const isKnown =
      Boolean(CURATED_MAP[tok]) ||
      Boolean(directoryMap[tok]) ||
      FLAGSHIP_TICKERS.some((f) => f.ticker === tok) ||
      FEATURED_IPOS.some((f) => f.ticker === tok) ||
      meta.name !== `${tok} Inc.`;

    if (isKnown) {
      push(tok);
    }
  }

  return found;
}

function buildTickerResponse(
  id: string,
  report: ConfluenceReport,
  options: TickerOptionsSummary | null,
): QuantBotResponse {
  const biasLabel =
    report.bias === 'bull' ? 'BULLISH' : report.bias === 'bear' ? 'BEARISH' : 'MIXED';
  const badgeTone =
    report.bias === 'bull' ? 'emerald' : report.bias === 'bear' ? 'crimson' : 'amber';

  const priceStr = report.price !== null ? `$${report.price.toFixed(2)}` : '—';
  const chgStr =
    report.changePct !== null
      ? `${report.changePct >= 0 ? '+' : ''}${report.changePct.toFixed(2)}%`
      : '—';

  const metrics: QuantBotMetric[] = [
    { label: 'CONFLUENCE', value: `${report.score}/100 (${biasLabel})`, tone: badgeTone },
    {
      label: 'PRICE',
      value: `${priceStr} (${chgStr})`,
      tone:
        report.changePct === null
          ? 'neutral'
          : report.changePct >= 0
            ? 'emerald'
            : 'crimson',
    },
    {
      label: 'ALIGNMENT',
      value: `${report.alignedCount}/${Math.max(1, report.activePillars)} PILLARS`,
      tone: badgeTone,
    },
  ];

  if (options) {
    metrics.push({
      label: 'GEX REGIME',
      value: options.netGammaRegime,
      tone:
        options.netGammaRegime === 'PIN (+GEX)'
          ? 'emerald'
          : options.netGammaRegime === 'VOLATILE (-GEX)'
            ? 'crimson'
            : 'amber',
    });
    if (options.callWall || options.putWall) {
      metrics.push({
        label: 'CALL / PUT WALL',
        value: `${options.callWall ? `$${options.callWall}` : '—'} / ${options.putWall ? `$${options.putWall}` : '—'}`,
        tone: 'neutral',
      });
    }
    if (options.maxPainStrike) {
      metrics.push({
        label: 'MAX PAIN / ±1σ',
        value: `$${options.maxPainStrike}${options.expectedMovePct ? ` (±${options.expectedMovePct}%)` : ''}`,
        tone: 'amber',
      });
    }
  } else if (report.catalystStatus.earnings) {
    metrics.push({
      label: 'EARNINGS',
      value: `${report.catalystStatus.earnings.countdownLabel} (±${report.catalystStatus.earnings.estImpliedMovePct.toFixed(1)}%)`,
      tone: report.catalystStatus.earnings.daysUntil <= 7 ? 'crimson' : 'amber',
    });
  }

  const bullets = report.pillars.map(
    (p) => `${p.shortLabel} (${p.active ? `${p.strength}/100` : 'IDLE'}): ${p.headline} — ${p.evidence}`,
  );

  if (options && options.unusualContracts.length > 0) {
    const top = options.unusualContracts[0];
    bullets.push(
      `TOP UOA: ${top.contract} • ${fmtUsd(top.estPremiumUsd)} prem (${top.volOiRatio}× Vol/OI)`,
    );
  }

  const summary = `${report.ticker} (${report.name}) scores ${report.score}/100 (${report.verdict}) with ${report.alignedCount} of ${Math.max(1, report.activePillars)} active pillars aligned ${biasLabel.toLowerCase()}.`;

  return {
    id,
    intent: 'ticker',
    title: `${report.ticker} — Live Quantitative & TA Brief`,
    badge: `${report.score}/100 ${biasLabel}`,
    badgeTone,
    summary,
    bullets,
    metrics,
    tickers: [report.ticker],
    followUps: [
      `Compare ${report.ticker} vs SPY`,
      'Top bullish setups',
      'Explain Gamma Flip',
    ],
  };
}

async function fastOptionsLookup(
  ticker: string,
  optionsMap: Record<string, TickerOptionsSummary>,
): Promise<TickerOptionsSummary | null> {
  if (optionsMap[ticker]) return optionsMap[ticker];
  const ctrl = new AbortController();
  const timer = globalThis.setTimeout(() => ctrl.abort(), 1200);
  try {
    return await fetchTickerOptionsFlow(ticker, null, false, ctrl.signal);
  } catch {
    return null;
  } finally {
    globalThis.clearTimeout(timer);
  }
}

export async function askQuantBot(
  rawQuery: string,
  ctx: QuantBotContext,
): Promise<QuantBotResponse> {
  const id = `qb-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const query = rawQuery.trim();
  const lower = query.toLowerCase();

  if (!query) {
    return {
      id,
      intent: 'help',
      title: 'aINVEST QuantBot — Market & Technical Analysis AI',
      badge: 'READY',
      badgeTone: 'emerald',
      summary:
        'Ask me to analyze any ticker, compare two stocks, scan for bullish/bearish confluence or short squeezes, or explain technical & options concepts.',
      bullets: [
        `Ticker TA & GEX: "Analyze ${ctx.activeTicker}" or "NVDA support & resistance"`,
        'Head-to-head: "Compare NVDA vs AMD"',
        'Live Scans: "Top bullish setups", "Short squeeze radar", "Congress buys"',
        'TA Playbook: "What is Gamma Flip?", "Explain VWAP + RSI", "What is Max Pain?"',
      ],
      metrics: [],
      tickers: [ctx.activeTicker, 'SPY', 'NVDA'],
      followUps: [`Analyze ${ctx.activeTicker}`, 'Top bullish setups', 'Compare NVDA vs AMD'],
    };
  }

  const tickers = extractTickersFromQuery(query, ctx.directoryMap);

  // 0. Official Nasdaq Undervalued Laggards ("20 Nasdaq laggards", "undervalued Nasdaq")
  if (/\b(nasdaq|laggard|laggards|undervalued)\b/i.test(lower)) {
    const snap = await fetchNasdaqLaggardsSnapshot();
    if (snap && snap.laggards.length > 0) {
      const top20 = snap.laggards.slice(0, 20);
      return {
        id,
        intent: 'scan',
        title: `Top ${top20.length} Undervalued Nasdaq Laggards (Official Nasdaq API)`,
        badge: `${snap.totalNasdaqScreened.toLocaleString()} NASDAQ SCREENED`,
        badgeTone: 'amber',
        summary: `Ranked directly from official Nasdaq Exchange data (api.nasdaq.com — no third-party middleman) by 52W drawdown, laggard momentum, and upside to Nasdaq 1Y Target.`,
        bullets: [],
        rows: top20.map((item, idx) => {
          const dd =
            item.drawdown52wPct !== null ? `${item.drawdown52wPct}% off 52W High` : '';
          const tgt =
            item.oneYrTarget !== null && item.upsideToTargetPct !== null
              ? `1Y Target $${item.oneYrTarget.toFixed(2)} (+${item.upsideToTargetPct}%)`
              : '';
          const pe = item.peRatio !== null ? `P/E ${item.peRatio}` : '';
          return {
            rank: idx + 1,
            ticker: item.symbol,
            name: item.name,
            price: `$${item.lastSale.toFixed(2)}`,
            changePct: `${item.pctChange >= 0 ? '+' : ''}${item.pctChange.toFixed(2)}%`,
            changeTone: item.pctChange >= 0 ? 'emerald' : 'crimson',
            detail: [dd, tgt, pe, `Cap ${fmtUsd(item.marketCap)}`].filter(Boolean).join(' • '),
            badge: item.upsideToTargetPct !== null ? `+${item.upsideToTargetPct}% TGT` : undefined,
            badgeTone: 'amber',
          };
        }),
        metrics: [
          {
            label: 'SOURCE',
            value: 'api.nasdaq.com (Direct)',
            tone: 'emerald',
          },
          {
            label: 'UNIVERSE',
            value: `${snap.totalNasdaqScreened.toLocaleString()} Nasdaq ($1B+)`,
            tone: 'neutral',
          },
          {
            label: '#1 VALUE LAGGARD',
            value: `${top20[0].symbol} (+${top20[0].upsideToTargetPct ?? 0}% to Target)`,
            tone: 'amber',
          },
        ],
        tickers: [],
        followUps: [
          `Analyze ${top20[0].symbol}`,
          `Analyze ${top20[1]?.symbol ?? 'NVDA'}`,
          'Top bullish setups',
        ],
      };
    }
  }

  // 1. Comparison intent ("NVDA vs AMD", "compare X and Y")
  if (
    tickers.length >= 2 &&
    /\b(vs|versus|compare|better|over)\b/i.test(query)
  ) {
    const [t1, t2] = tickers;
    const [opt1, opt2] = await Promise.all([
      fastOptionsLookup(t1, ctx.optionsMap),
      fastOptionsLookup(t2, ctx.optionsMap),
    ]);
    const r1 = computeTickerConfluence({
      ticker: t1,
      hlCtx: ctx.ctxMap[t1],
      quote: ctx.quoteMap[t1],
      directoryEntry: ctx.directoryMap[t1],
      insidersBundle: ctx.insidersBundle,
      optionsSummary: opt1,
      articles: ctx.articles,
    });
    const r2 = computeTickerConfluence({
      ticker: t2,
      hlCtx: ctx.ctxMap[t2],
      quote: ctx.quoteMap[t2],
      directoryEntry: ctx.directoryMap[t2],
      insidersBundle: ctx.insidersBundle,
      optionsSummary: opt2,
      articles: ctx.articles,
    });

    const winner = r1.score >= r2.score ? r1 : r2;
    const loser = winner.ticker === r1.ticker ? r2 : r1;

    return {
      id,
      intent: 'compare',
      title: `${r1.ticker} vs ${r2.ticker} — Confluence Comparison`,
      badge: `EDGE: ${winner.ticker}`,
      badgeTone: winner.bias === 'bull' ? 'emerald' : winner.bias === 'bear' ? 'crimson' : 'amber',
      summary: `${winner.ticker} leads ${loser.ticker} on 5-Pillar Confluence (${winner.score}/100 ${winner.bias.toUpperCase()} vs ${loser.score}/100 ${loser.bias.toUpperCase()}).`,
      bullets: [
        `${r1.ticker}: ${r1.score}/100 (${r1.verdict}) • ${r1.topEvidence.slice(0, 2).join(' • ') || 'Active telemetry'}`,
        `${r2.ticker}: ${r2.score}/100 (${r2.verdict}) • ${r2.topEvidence.slice(0, 2).join(' • ') || 'Active telemetry'}`,
        ...(opt1 ? [`${r1.ticker} Options: ${opt1.flowBias} • ${opt1.netGammaRegime}`] : []),
        ...(opt2 ? [`${r2.ticker} Options: ${opt2.flowBias} • ${opt2.netGammaRegime}`] : []),
      ],
      metrics: [
        {
          label: r1.ticker,
          value: `${r1.score}/100 (${r1.price !== null ? `$${r1.price.toFixed(2)}` : '—'})`,
          tone: r1.bias === 'bull' ? 'emerald' : r1.bias === 'bear' ? 'crimson' : 'amber',
        },
        {
          label: r2.ticker,
          value: `${r2.score}/100 (${r2.price !== null ? `$${r2.price.toFixed(2)}` : '—'})`,
          tone: r2.bias === 'bull' ? 'emerald' : r2.bias === 'bear' ? 'crimson' : 'amber',
        },
      ],
      tickers: [r1.ticker, r2.ticker],
      followUps: [`Analyze ${r1.ticker}`, `Analyze ${r2.ticker}`, 'Top bullish setups'],
    };
  }

  // 2. Market Scan / Screener intent
  const isScanIntent =
    tickers.length === 0 &&
    /\b(top|best|find|scan|screener|show|list|which|stocks|setups|ideas|bullish|bearish|squeeze|congress|insider|earnings|whale)\b/i.test(
      query,
    );

  if (isScanIntent) {
    const ranked = rankMarketConfluence({
      ctxMap: ctx.ctxMap,
      quoteMap: ctx.quoteMap,
      directoryMap: ctx.directoryMap,
      insidersBundle: ctx.insidersBundle,
      optionsMap: ctx.optionsMap,
      articles: ctx.articles,
      limit: 60,
    });

    let filtered = ranked;
    let scanLabel = 'TOP CONFLUENCE SETUPS';
    let tone: QuantBotResponse['badgeTone'] = 'emerald';

    if (/\b(squeeze|short)\b/i.test(lower)) {
      filtered = ranked.filter((r) =>
        r.pillars.some((p) => p.id === 'insider' && p.active && p.headline.includes('SQUEEZE')),
      );
      scanLabel = 'SHORT SQUEEZE RADAR';
      tone = 'amber';
    } else if (/\b(congress|insider|cluster|form 4)\b/i.test(lower)) {
      filtered = ranked.filter((r) =>
        r.pillars.some(
          (p) =>
            p.id === 'insider' &&
            p.active &&
            (p.headline.includes('CONGRESS') || p.headline.includes('CLUSTER')),
        ),
      );
      scanLabel = 'CONGRESS & INSIDER CLUSTERS';
    } else if (/\b(earnings|catalyst)\b/i.test(lower)) {
      filtered = ranked.filter(
        (r) => r.catalystStatus.earnings && r.catalystStatus.earnings.daysUntil <= 30,
      );
      scanLabel = 'UPCOMING EARNINGS CATALYSTS';
      tone = 'amber';
    } else if (/\b(whale|options|gex|call|put)\b/i.test(lower)) {
      filtered = ranked.filter((r) =>
        r.pillars.some((p) => p.id === 'whale' && p.active),
      );
      scanLabel = 'WHALE FLOW LEADERS';
    } else if (/\b(bear|bearish|puts|downside)\b/i.test(lower)) {
      filtered = ranked.filter((r) => r.bias === 'bear');
      scanLabel = 'BEARISH CONFLUENCE';
      tone = 'crimson';
    } else if (/\b(bull|bullish|calls|upside|buy)\b/i.test(lower)) {
      filtered = ranked.filter((r) => r.bias === 'bull');
      scanLabel = 'BULLISH CONFLUENCE';
    }

    const top = (filtered.length > 0 ? filtered : ranked).slice(0, 5);
    return {
      id,
      intent: 'scan',
      title: `Live Scan: ${scanLabel}`,
      badge: `${top.length} MATCHES`,
      badgeTone: tone,
      summary:
        filtered.length > 0
          ? `Found ${filtered.length} tickers matching "${scanLabel}" ranked by 5-Pillar Confluence.`
          : `No strict matches right now — showing top ${top.length} converging tickers.`,
      bullets: [],
      rows: top.map((r, idx) => ({
        rank: idx + 1,
        ticker: r.ticker,
        name: r.name,
        price: r.price !== null ? `$${r.price.toFixed(2)}` : undefined,
        changePct:
          r.changePct !== null
            ? `${r.changePct >= 0 ? '+' : ''}${r.changePct.toFixed(2)}%`
            : undefined,
        changeTone:
          r.changePct === null ? 'neutral' : r.changePct >= 0 ? 'emerald' : 'crimson',
        detail: `${r.alignedCount}/${Math.max(1, r.activePillars)} pillars • ${r.topEvidence.slice(0, 2).join(' • ') || r.verdict}`,
        badge: `${r.score}/100 ${r.bias.toUpperCase()}`,
        badgeTone: r.bias === 'bull' ? 'emerald' : r.bias === 'bear' ? 'crimson' : 'amber',
      })),
      metrics: [],
      tickers: [],
      followUps: top.slice(0, 2).map((r) => `Analyze ${r.ticker}`).concat(['Short squeeze radar']),
    };
  }

  // 3. Technical Analysis & Options Concept Playbook (when no specific ticker was named)
  if (tickers.length === 0) {
    const matched = TA_CONCEPTS.find((c) =>
      c.keywords.some((kw) => lower.includes(kw)),
    );
    if (matched) {
      return {
        id,
        intent: 'concept',
        title: matched.title,
        badge: matched.badge,
        badgeTone: 'emerald',
        summary: matched.summary,
        bullets: matched.bullets,
        metrics: [],
        tickers: [ctx.activeTicker, 'SPY', 'NVDA'],
        followUps: matched.followUps,
      };
    }
  }

  // 4. Single-ticker deep analysis (explicit ticker or fallback to activeTicker if asking about "this" / "setup" / "levels")
  const targetTicker = tickers[0] || ctx.activeTicker || 'NVDA';
  const liveOptions = await fastOptionsLookup(targetTicker, ctx.optionsMap);

  const report = computeTickerConfluence({
    ticker: targetTicker,
    hlCtx: ctx.ctxMap[targetTicker],
    quote: ctx.quoteMap[targetTicker],
    directoryEntry: ctx.directoryMap[targetTicker],
    insidersBundle: ctx.insidersBundle,
    optionsSummary: liveOptions,
    articles: ctx.articles,
  });

  return buildTickerResponse(id, report, liveOptions);
}
