export interface UnlockWave {
  id: string;
  dateLabel: string;
  dayLabel: string;
  sharesMillions: number;
  unlockIso: string;
}

export interface TickerMeta {
  ticker: string;
  hlCoin: string;
  tvSymbol: string;
  name: string;
  sector: string;
  dilutedSharesBillions: number | null;
  referencePrice: number | null;
  referenceLabel: string;
  catalystHeadline: string;
  catalystNotes: string[];
  fixedPresets?: number[];
  referenceLines?: Array<{
    price: number;
    title: string;
    tone: 'bull' | 'amber' | 'bear';
  }>;
  unlockWaves?: UnlockWave[];
  totalPoolMillions?: number;
}

export const ANT_UNLOCK_WAVES: UnlockWave[] = [
  {
    id: 'wave-1',
    dateLabel: 'Nov 19, 2026',
    dayLabel: 'Day 1',
    sharesMillions: 316,
    unlockIso: '2026-11-19T09:30:00-05:00',
  },
  {
    id: 'wave-2',
    dateLabel: 'Dec 15, 2026',
    dayLabel: 'Day 27',
    sharesMillions: 299,
    unlockIso: '2026-12-15T09:30:00-05:00',
  },
  {
    id: 'wave-3',
    dateLabel: 'Jan 05, 2027',
    dayLabel: 'Day 48',
    sharesMillions: 299,
    unlockIso: '2027-01-05T09:30:00-05:00',
  },
  {
    id: 'wave-4',
    dateLabel: 'Jan 19, 2027',
    dayLabel: 'Day 62',
    sharesMillions: 349,
    unlockIso: '2027-01-19T09:30:00-05:00',
  },
];

export const FLAGSHIP_TICKERS: TickerMeta[] = [
  {
    ticker: 'ANT',
    hlCoin: 'xyz:ANT',
    tvSymbol: 'NASDAQ:ANT',
    name: 'Anthropic',
    sector: 'Frontier AI • IPO War Room',
    dilutedSharesBillions: 17.5,
    referencePrice: 83.0,
    referenceLabel: 'IPO Offer',
    catalystHeadline: 'Nov 19, 2026 IPO • Staggered S-1 Lock-Ups',
    catalystNotes: [
      'Priced at $83.00 ($81.3B raised) above $70–$78 S-1 range',
      'Day 1 active float: 316M of 1,263M Class A pool (25.0%)',
      'Next supply cliff: Dec 15, 2026 (+299M Class A shares)',
    ],
    fixedPresets: [70, 78, 83, 92, 105, 120],
    referenceLines: [
      { price: 83, title: 'IPO $83', tone: 'bull' },
      { price: 78, title: 'S-1 $78', tone: 'amber' },
      { price: 70, title: 'S-1 $70', tone: 'bear' },
    ],
    unlockWaves: ANT_UNLOCK_WAVES,
    totalPoolMillions: 1263,
  },
  {
    ticker: 'NVDA',
    hlCoin: 'xyz:NVDA',
    tvSymbol: 'NASDAQ:NVDA',
    name: 'NVIDIA',
    sector: 'AI Compute & Semiconductors',
    dilutedSharesBillions: 24.5,
    referencePrice: null,
    referenceLabel: 'Prev Close',
    catalystHeadline: 'Data Center GPU Cycle & Hyperscaler Capex',
    catalystNotes: [
      'Highest-volume 24/7 equity perp on Hyperliquid HIP-3',
      'Key AI infrastructure bellwether correlated with frontier model IPOs',
      'Watch VWAP & EMA 21 on 15m/1h for institutional trend continuation',
    ],
  },
  {
    ticker: 'TSLA',
    hlCoin: 'xyz:TSLA',
    tvSymbol: 'NASDAQ:TSLA',
    name: 'Tesla',
    sector: 'Autonomy, Energy & Robotics',
    dilutedSharesBillions: 3.48,
    referencePrice: null,
    referenceLabel: 'Prev Close',
    catalystHeadline: 'High-Beta Autonomy & FSD Catalyst Tape',
    catalystNotes: [
      'High intraday volatility; watch ATR range expansion & funding swings',
      'Overnight 24/7 perp frequently leads pre-market NASDAQ gap direction',
      'Track RSI extremes & VWAP reclaims for intraday mean-reversion',
    ],
  },
  {
    ticker: 'PLTR',
    hlCoin: 'xyz:PLTR',
    tvSymbol: 'NASDAQ:PLTR',
    name: 'Palantir',
    sector: 'Enterprise AI & Defense Software',
    dilutedSharesBillions: 2.42,
    referencePrice: null,
    referenceLabel: 'Prev Close',
    catalystHeadline: 'AIP Commercial Growth & Momentum Flow',
    catalystNotes: [
      'Retail & institutional momentum leader in enterprise AI software',
      'Sympathy mover alongside frontier AI valuation benchmarks like ANT',
      'Monitor 1h MACD & open interest build for breakout confirmation',
    ],
  },
  {
    ticker: 'MSFT',
    hlCoin: 'xyz:MSFT',
    tvSymbol: 'NASDAQ:MSFT',
    name: 'Microsoft',
    sector: 'Cloud & Enterprise AI',
    dilutedSharesBillions: 7.45,
    referencePrice: null,
    referenceLabel: 'Prev Close',
    catalystHeadline: 'Azure AI Revenue & Cloud Margins',
    catalystNotes: [
      'Mega-cap AI cloud anchor with tight spreads & deep liquidity',
      'Key comparative valuation yardstick against Anthropic & hyperscalers',
      'Watch 1h EMA 20/50 alignment for macro risk-on/risk-off regime',
    ],
  },
  {
    ticker: 'META',
    hlCoin: 'xyz:META',
    tvSymbol: 'NASDAQ:META',
    name: 'Meta',
    sector: 'AI Ads & Open-Weight Models',
    dilutedSharesBillions: 2.57,
    referencePrice: null,
    referenceLabel: 'Prev Close',
    catalystHeadline: 'Ad Monetization & AI Infra Efficiency',
    catalystNotes: [
      'Strong operating leverage paired with aggressive AI compute capex',
      'Tracks Nasdaq-100 mega-cap beta with sharp earnings-driven gaps',
      'Watch session VWAP pivot & 24h range highs for momentum triggers',
    ],
  },
  {
    ticker: 'GOOGL',
    hlCoin: 'xyz:GOOGL',
    tvSymbol: 'NASDAQ:GOOGL',
    name: 'Alphabet',
    sector: 'Search, Cloud & Frontier AI',
    dilutedSharesBillions: 12.25,
    referencePrice: null,
    referenceLabel: 'Prev Close',
    catalystHeadline: 'Cloud Growth, TPUs & Strategic AI Stakes',
    catalystNotes: [
      'Major strategic cloud & compute partner across frontier AI ecosystem',
      'Direct valuation beneficiary on Anthropic IPO mark-to-market repricing',
      'Monitor relative strength vs NDX100 & 15m/1h technical consensus',
    ],
  },
  {
    ticker: 'AMZN',
    hlCoin: 'xyz:AMZN',
    tvSymbol: 'NASDAQ:AMZN',
    name: 'Amazon',
    sector: 'AWS Cloud & Commerce',
    dilutedSharesBillions: 10.7,
    referencePrice: null,
    referenceLabel: 'Prev Close',
    catalystHeadline: 'AWS Bedrock Demand & Anthropic Stake',
    catalystNotes: [
      'Primary AWS Trainium/Bedrock compute partner and major ANT stakeholder',
      'Watch sympathy flow & implied stake value sensitivity on ANT IPO moves',
      'Track 24h volume spikes & funding tilt for institutional accumulation',
    ],
  },
  {
    ticker: 'AAPL',
    hlCoin: 'xyz:AAPL',
    tvSymbol: 'NASDAQ:AAPL',
    name: 'Apple',
    sector: 'Consumer Devices & Edge AI',
    dilutedSharesBillions: 15.1,
    referencePrice: null,
    referenceLabel: 'Prev Close',
    catalystHeadline: 'Device Upgrade Cycle & Services Margin',
    catalystNotes: [
      'Core S&P 500 & Nasdaq-100 defensive mega-cap liquidity anchor',
      'Low volatility relative to AI pure-plays; watch 1h EMA breaks',
      'Useful macro risk gauge alongside NDX100 index perp',
    ],
  },
];

export const FLAGSHIP_MAP: Record<string, TickerMeta> = Object.fromEntries(
  FLAGSHIP_TICKERS.map((t) => [t.ticker, t]),
);

/** Builds full metadata for any discovered Hyperliquid xyz: ticker (flagship or dynamically searched) */
export function resolveTickerMeta(rawTicker: string): TickerMeta {
  const clean = rawTicker.trim().toUpperCase().replace(/^XYZ:/, '');
  if (FLAGSHIP_MAP[clean]) {
    return FLAGSHIP_MAP[clean];
  }

  const isIndex = clean === 'XYZ100' || clean === 'SP500';
  const tvSymbol =
    clean === 'XYZ100'
      ? 'NASDAQ:QQQ'
      : clean === 'SP500'
        ? 'AMEX:SPY'
        : `NASDAQ:${clean}`;

  return {
    ticker: clean,
    hlCoin: `xyz:${clean}`,
    tvSymbol,
    name: clean === 'XYZ100' ? 'Nasdaq 100 Index' : clean === 'SP500' ? 'S&P 500 Index' : clean,
    sector: isIndex ? 'Macro Equity Index (24/7)' : '24/7 Equity / Macro Perp',
    dilutedSharesBillions: null,
    referencePrice: null,
    referenceLabel: 'Prev Close',
    catalystHeadline: `Live 24/7 Hyperliquid Market (${clean})`,
    catalystNotes: [
      `Streaming 0-delay candles and live orderbook mark price for xyz:${clean}`,
      'AI brief & 17-indicator consensus update automatically from live 15m/1h bars',
      'Share this room URL directly via ?ticker=' + clean,
    ],
  };
}
