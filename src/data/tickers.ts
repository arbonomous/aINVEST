import type { HlAssetCtx } from '../lib/hyperliquidFeed';
import type { DirectoryEntry, UsExchange } from '../lib/marketCatalog';
import type { MarketQuote } from '../lib/universalFeed';

export interface UnlockWave {
  id: string;
  dateLabel: string;
  dayLabel: string;
  sharesMillions: number;
  unlockIso: string;
}

export interface TickerMeta {
  ticker: string;
  hlCoin: string | null;
  tvSymbol: string;
  exchange?: UsExchange | 'INDEX';
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
  isIpo?: boolean;
  ipoStatus?: 'live' | 'upcoming';
  ipoDate?: string;
  ipoRangeLabel?: string;
  ipoRaisedLabel?: string;
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
    exchange: 'NASDAQ',
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
    isIpo: true,
    ipoStatus: 'live',
    ipoDate: 'Nov 19, 2026',
    ipoRangeLabel: '$70–$78 → Priced $83.00',
    ipoRaisedLabel: '$81.3B Raised',
  },
  {
    ticker: 'SPCX',
    hlCoin: null,
    tvSymbol: 'NASDAQ:SPCX',
    exchange: 'NASDAQ',
    name: 'SpaceX',
    sector: 'Aerospace, Starlink & xAI • 2026 IPO',
    dilutedSharesBillions: 13.58,
    referencePrice: 135.0,
    referenceLabel: 'IPO Offer',
    catalystHeadline: 'Jun 2026 Mega-IPO • Launch, Starlink & xAI',
    catalystNotes: [
      'Priced at $135.00 ($75.0B raised) on NASDAQ in June 2026',
      'Combines Starship/Falcon launch cadence, Starlink broadband & xAI compute',
      'Watch $135.00 IPO offer price as major institutional support pivot',
    ],
    referenceLines: [{ price: 135, title: 'IPO $135', tone: 'bull' }],
    isIpo: true,
    ipoStatus: 'live',
    ipoDate: 'Jun 2026',
    ipoRangeLabel: 'Priced $135.00',
    ipoRaisedLabel: '$75.0B Raised',
  },
  {
    ticker: 'NVDA',
    hlCoin: 'xyz:NVDA',
    tvSymbol: 'NASDAQ:NVDA',
    exchange: 'NASDAQ',
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
    exchange: 'NASDAQ',
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
    exchange: 'NASDAQ',
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
    exchange: 'NASDAQ',
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
    exchange: 'NASDAQ',
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
    exchange: 'NASDAQ',
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
    exchange: 'NASDAQ',
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
    exchange: 'NASDAQ',
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

/** Curated 2025–2026 & upcoming IPO War Rooms with rich S-1 / listing metadata */
export const FEATURED_IPOS: TickerMeta[] = [
  FLAGSHIP_TICKERS[0], // ANT
  FLAGSHIP_TICKERS[1], // SPCX
  {
    ticker: 'SKHY',
    hlCoin: null,
    tvSymbol: 'NASDAQ:SKHY',
    exchange: 'NASDAQ',
    name: 'SK hynix (ADR)',
    sector: 'HBM Memory & AI Semiconductors • 2026 IPO',
    dilutedSharesBillions: 7.29,
    referencePrice: null,
    referenceLabel: 'Prev Close',
    catalystHeadline: '2026 NASDAQ ADR Listing • HBM AI Memory Leader',
    catalystNotes: [
      'Major 2026 US ADR debut ($26.5B offering) for leading HBM supplier',
      'Core supply-chain partner to NVIDIA & hyperscaler AI accelerators',
      'Watch correlation with NVDA & SOX semiconductor breadth',
    ],
    isIpo: true,
    ipoStatus: 'live',
    ipoDate: '2026',
    ipoRaisedLabel: '$26.5B Offering',
  },
  {
    ticker: 'CBRS',
    hlCoin: null,
    tvSymbol: 'NASDAQ:CBRS',
    exchange: 'NASDAQ',
    name: 'Cerebras Systems',
    sector: 'Wafer-Scale AI Chips • 2026 IPO',
    dilutedSharesBillions: 0.243,
    referencePrice: null,
    referenceLabel: 'Prev Close',
    catalystHeadline: '2026 NASDAQ IPO • Wafer-Scale AI Inference',
    catalystNotes: [
      'Pure-play wafer-scale AI compute challenger listed on NASDAQ in 2026',
      'High-beta AI hardware tape sensitive to hyperscaler & sovereign inference deals',
      'Monitor intraday VWAP & volume spikes for institutional accumulation',
    ],
    isIpo: true,
    ipoStatus: 'live',
    ipoDate: '2026',
  },
  {
    ticker: 'CRWV',
    hlCoin: null,
    tvSymbol: 'NASDAQ:CRWV',
    exchange: 'NASDAQ',
    name: 'CoreWeave',
    sector: 'AI Cloud Infrastructure • 2025 IPO',
    dilutedSharesBillions: 0.555,
    referencePrice: 40.0,
    referenceLabel: 'IPO Offer',
    catalystHeadline: 'NASDAQ IPO • Purpose-Built GPU Cloud',
    catalystNotes: [
      'Priced at $40.00 on NASDAQ; leading pure-play neocloud GPU provider',
      'Closely tracks AI training/inference capex cycles & debt financing spreads',
      'Watch $40.00 IPO offer reference and 15m/1h EMA trend alignment',
    ],
    referenceLines: [{ price: 40, title: 'IPO $40', tone: 'amber' }],
    isIpo: true,
    ipoStatus: 'live',
    ipoDate: 'Mar 2025',
    ipoRangeLabel: 'Priced $40.00',
  },
  {
    ticker: 'BSP',
    hlCoin: null,
    tvSymbol: 'NASDAQ:BSP',
    exchange: 'NASDAQ',
    name: 'Bending Spoons',
    sector: 'Consumer Software & AI Apps • 2026 IPO',
    dilutedSharesBillions: 0.695,
    referencePrice: null,
    referenceLabel: 'Prev Close',
    catalystHeadline: '2026 NASDAQ IPO • Digital Software Consolidator',
    catalystNotes: [
      'High-margin European software acquirer & AI app platform listed on NASDAQ',
      'Tracks subscription ARR growth, M&A cadence & EBITDA margin expansion',
      'Monitor 1h technical consensus & volume breakouts',
    ],
    isIpo: true,
    ipoStatus: 'live',
    ipoDate: '2026',
  },
  {
    ticker: 'CRCL',
    hlCoin: null,
    tvSymbol: 'NYSE:CRCL',
    exchange: 'NYSE',
    name: 'Circle Internet Group',
    sector: 'Digital Dollars & Fintech • 2025 IPO',
    dilutedSharesBillions: 0.256,
    referencePrice: 31.0,
    referenceLabel: 'IPO Offer',
    catalystHeadline: 'NYSE IPO • USDC Stablecoin Infrastructure',
    catalystNotes: [
      'Issuer of USDC stablecoin listed on NYSE in 2025',
      'Revenue sensitive to circulating USDC supply & short-term Treasury yields',
      'Watch 15m VWAP pivot & crypto-beta sympathy flow',
    ],
    referenceLines: [{ price: 31, title: 'IPO $31', tone: 'amber' }],
    isIpo: true,
    ipoStatus: 'live',
    ipoDate: 'Jun 2025',
    ipoRangeLabel: 'Priced $31.00',
  },
  {
    ticker: 'CHYM',
    hlCoin: null,
    tvSymbol: 'NASDAQ:CHYM',
    exchange: 'NASDAQ',
    name: 'Chime Financial',
    sector: 'Consumer Fintech & Neobank • 2025 IPO',
    dilutedSharesBillions: 0.385,
    referencePrice: 27.0,
    referenceLabel: 'IPO Offer',
    catalystHeadline: 'NASDAQ IPO • Consumer Digital Banking',
    catalystNotes: [
      'Leading US consumer neobank IPO listed on NASDAQ in 2025',
      'Watch active member growth, interchange volume & fintech peer multiples',
      'Track 24h range boundaries & 1h RSI divergence',
    ],
    referenceLines: [{ price: 27, title: 'IPO $27', tone: 'amber' }],
    isIpo: true,
    ipoStatus: 'live',
    ipoDate: 'Jun 2025',
    ipoRangeLabel: 'Priced $27.00',
  },
  {
    ticker: 'MDLN',
    hlCoin: null,
    tvSymbol: 'NASDAQ:MDLN',
    exchange: 'NASDAQ',
    name: 'Medline Inc.',
    sector: 'Medical Supplies & Healthcare • 2025 IPO',
    dilutedSharesBillions: 1.316,
    referencePrice: null,
    referenceLabel: 'Prev Close',
    catalystHeadline: 'Mega-Cap Healthcare IPO • Hospital Supply Chain',
    catalystNotes: [
      'One of the largest PE-backed healthcare IPOs on NASDAQ',
      'Defensive cash-flow profile relative to high-beta tech listings',
      'Watch 1h EMA 20/50 trend for institutional rotation signals',
    ],
    isIpo: true,
    ipoStatus: 'live',
    ipoDate: '2025',
  },
  {
    ticker: 'VVVV',
    hlCoin: null,
    tvSymbol: 'NYSE:VVVV',
    exchange: 'NYSE',
    name: 'vVARDIS Holding',
    sector: 'Healthcare Innovation • Nov 2026 IPO',
    dilutedSharesBillions: null,
    referencePrice: 22.5,
    referenceLabel: 'IPO Mid',
    catalystHeadline: 'Nov 13, 2026 NYSE IPO • $21–$24 S-1 Range',
    catalystNotes: [
      'November 2026 NYSE debut; 9.52M shares offered ($21.00–$24.00 range)',
      'Early post-IPO price discovery phase — watch Day 1–5 VWAP anchor',
      'Track volume stabilization & institutional lock-up schedule',
    ],
    referenceLines: [
      { price: 24, title: 'S-1 $24', tone: 'bull' },
      { price: 21, title: 'S-1 $21', tone: 'bear' },
    ],
    isIpo: true,
    ipoStatus: 'live',
    ipoDate: 'Nov 13, 2026',
    ipoRangeLabel: '$21.00–$24.00',
    ipoRaisedLabel: '$263M Deal',
  },
  {
    ticker: 'WWB',
    hlCoin: null,
    tvSymbol: 'NASDAQ:WWB',
    exchange: 'NASDAQ',
    name: 'Windward Bio',
    sector: 'Biotech & Therapeutics • Nov 2026 IPO',
    dilutedSharesBillions: null,
    referencePrice: 17.0,
    referenceLabel: 'IPO Mid',
    catalystHeadline: 'Nov 13, 2026 NASDAQ IPO • $16–$18 S-1 Range',
    catalystNotes: [
      'November 2026 NASDAQ Global biotech listing; 10.29M shares ($16–$18)',
      'Monitor initial liquidity formation & S-1 range defense',
      'Use Valuation & P&L calculator to stress-test post-IPO volatility',
    ],
    referenceLines: [
      { price: 18, title: 'S-1 $18', tone: 'bull' },
      { price: 16, title: 'S-1 $16', tone: 'bear' },
    ],
    isIpo: true,
    ipoStatus: 'live',
    ipoDate: 'Nov 13, 2026',
    ipoRangeLabel: '$16.00–$18.00',
    ipoRaisedLabel: '$213M Deal',
  },
  {
    ticker: 'RZRA',
    hlCoin: null,
    tvSymbol: 'NASDAQ:RZRA',
    exchange: 'NASDAQ',
    name: 'Rezera Inc.',
    sector: 'Growth Tech • Nov 2026 IPO',
    dilutedSharesBillions: null,
    referencePrice: 12.0,
    referenceLabel: 'IPO Mid',
    catalystHeadline: 'Nov 12, 2026 NASDAQ IPO • $11–$13 S-1 Range',
    catalystNotes: [
      'November 2026 NASDAQ Global debut; 16.67M shares ($11.00–$13.00)',
      'Early post-IPO float discovery — watch VWAP and opening range levels',
      'Isolated Floor Chat & sentiment poll live for traders',
    ],
    referenceLines: [
      { price: 13, title: 'S-1 $13', tone: 'bull' },
      { price: 11, title: 'S-1 $11', tone: 'bear' },
    ],
    isIpo: true,
    ipoStatus: 'live',
    ipoDate: 'Nov 12, 2026',
    ipoRangeLabel: '$11.00–$13.00',
    ipoRaisedLabel: '$249M Deal',
  },
  {
    ticker: 'NSCL',
    hlCoin: null,
    tvSymbol: 'NYSE:NSCL',
    exchange: 'NYSE',
    name: 'Nscale',
    sector: 'AI Data Centers & Cloud • Upcoming IPO',
    dilutedSharesBillions: null,
    referencePrice: null,
    referenceLabel: 'Expected IPO',
    catalystHeadline: 'Upcoming Dec 2026 NYSE IPO • AI Infra Pipeline',
    catalystNotes: [
      'Targeted NYSE debut before year-end 2026 (proposed ticker NSCL)',
      'Pre-listing War Room open for S-1 watch, crowd sentiment & valuation scenarios',
      'Live quotes & candles activate automatically on Day 1 first trade',
    ],
    isIpo: true,
    ipoStatus: 'upcoming',
    ipoDate: 'Dec 2026 (Est.)',
    ipoRangeLabel: 'S-1 Pipeline',
  },
  {
    ticker: 'RDDT',
    hlCoin: null,
    tvSymbol: 'NYSE:RDDT',
    exchange: 'NYSE',
    name: 'Reddit',
    sector: 'Community & AI Data Licensing',
    dilutedSharesBillions: 0.19,
    referencePrice: 34.0,
    referenceLabel: 'IPO Offer',
    catalystHeadline: 'High-Growth Social & AI Training Data Platform',
    catalystNotes: [
      'NYSE listing with rapid ad monetization & AI data-licensing expansion',
      'High-beta momentum tape sensitive to DAU growth & margin beats',
      'Watch 15m/1h VWAP & EMA 9/21 trend shifts',
    ],
    isIpo: true,
    ipoStatus: 'live',
    ipoDate: 'Mar 2024',
    ipoRangeLabel: 'Priced $34.00',
  },
  {
    ticker: 'ARM',
    hlCoin: null,
    tvSymbol: 'NASDAQ:ARM',
    exchange: 'NASDAQ',
    name: 'Arm Holdings',
    sector: 'AI Compute Architecture & Licensing',
    dilutedSharesBillions: 1.06,
    referencePrice: 51.0,
    referenceLabel: 'IPO Offer',
    catalystHeadline: 'v9 Royalty Expansion & Data Center CPU Share',
    catalystNotes: [
      'Core semiconductor IP anchor powering mobile, cloud & AI edge silicon',
      'Tightly correlated with NVDA & hyperscaler custom silicon roadmaps',
      'Monitor 1h technical consensus & intraday ATR breakouts',
    ],
    isIpo: true,
    ipoStatus: 'live',
    ipoDate: 'Sep 2023',
    ipoRangeLabel: 'Priced $51.00',
  },
];

/** Curated popular non-flagship stocks & ETFs so common symbols have instant exchange resolution before directory finishes loading */
const QUICK_EXCHANGE_OVERRIDES: Record<
  string,
  { name: string; exchange: UsExchange; sector: string }
> = {
  SPY: { name: 'SPDR S&P 500 ETF', exchange: 'AMEX', sector: 'S&P 500 Index ETF' },
  QQQ: { name: 'Invesco QQQ Trust', exchange: 'NASDAQ', sector: 'Nasdaq-100 Index ETF' },
  IWM: { name: 'iShares Russell 2000 ETF', exchange: 'AMEX', sector: 'Small-Cap Index ETF' },
  DIA: { name: 'SPDR Dow Jones ETF', exchange: 'AMEX', sector: 'Dow 30 Index ETF' },
  SOXL: { name: 'Direxion Daily Semi Bull 3X', exchange: 'AMEX', sector: 'Leveraged Semis ETF' },
  SMH: { name: 'VanEck Semiconductor ETF', exchange: 'NASDAQ', sector: 'Semiconductor ETF' },
  GLD: { name: 'SPDR Gold Shares', exchange: 'AMEX', sector: 'Gold Commodity ETF' },
  JPM: { name: 'JPMorgan Chase', exchange: 'NYSE', sector: 'Banking & Financial Services' },
  DIS: { name: 'Walt Disney', exchange: 'NYSE', sector: 'Media & Entertainment' },
  V: { name: 'Visa', exchange: 'NYSE', sector: 'Payments & Fintech' },
  MA: { name: 'Mastercard', exchange: 'NYSE', sector: 'Payments & Fintech' },
  WMT: { name: 'Walmart', exchange: 'NYSE', sector: 'Consumer Retail' },
  'BRK.B': { name: 'Berkshire Hathaway (Class B)', exchange: 'NYSE', sector: 'Diversified Financials' },
  ORCL: { name: 'Oracle', exchange: 'NYSE', sector: 'Cloud & Enterprise Software' },
  CRM: { name: 'Salesforce', exchange: 'NYSE', sector: 'Enterprise Cloud SaaS' },
  UBER: { name: 'Uber Technologies', exchange: 'NYSE', sector: 'Mobility & Delivery' },
  SPOT: { name: 'Spotify Technology', exchange: 'NYSE', sector: 'Digital Media & Audio' },
  SNOW: { name: 'Snowflake', exchange: 'NYSE', sector: 'AI Data Cloud' },
  TSM: { name: 'Taiwan Semiconductor (ADR)', exchange: 'NYSE', sector: 'Semiconductor Foundry' },
  BABA: { name: 'Alibaba Group (ADR)', exchange: 'NYSE', sector: 'E-Commerce & Cloud AI' },
  LLY: { name: 'Eli Lilly', exchange: 'NYSE', sector: 'Pharmaceuticals & Biotech' },
  UNH: { name: 'UnitedHealth Group', exchange: 'NYSE', sector: 'Managed Healthcare' },
  BA: { name: 'Boeing', exchange: 'NYSE', sector: 'Aerospace & Defense' },
  GS: { name: 'Goldman Sachs', exchange: 'NYSE', sector: 'Investment Banking' },
  NKE: { name: 'Nike', exchange: 'NYSE', sector: 'Consumer Apparel' },
  KO: { name: 'Coca-Cola', exchange: 'NYSE', sector: 'Consumer Staples' },
  XOM: { name: 'Exxon Mobil', exchange: 'NYSE', sector: 'Energy & Oil' },
  GME: { name: 'GameStop', exchange: 'NYSE', sector: 'Specialty Retail' },
  AMC: { name: 'AMC Entertainment', exchange: 'NYSE', sector: 'Entertainment' },
  AMD: { name: 'Advanced Micro Devices', exchange: 'NASDAQ', sector: 'AI Compute & Semiconductors' },
  AVGO: { name: 'Broadcom', exchange: 'NASDAQ', sector: 'AI Networking & Semiconductors' },
  NFLX: { name: 'Netflix', exchange: 'NASDAQ', sector: 'Streaming Entertainment' },
  COST: { name: 'Costco Wholesale', exchange: 'NASDAQ', sector: 'Consumer Retail' },
  COIN: { name: 'Coinbase Global', exchange: 'NASDAQ', sector: 'Digital Assets & Exchange' },
  HOOD: { name: 'Robinhood Markets', exchange: 'NASDAQ', sector: 'Retail Brokerage & Fintech' },
  MSTR: { name: 'Strategy (MicroStrategy)', exchange: 'NASDAQ', sector: 'Enterprise Analytics & BTC Treasury' },
  SOFI: { name: 'SoFi Technologies', exchange: 'NASDAQ', sector: 'Digital Banking & Fintech' },
  INTC: { name: 'Intel', exchange: 'NASDAQ', sector: 'Semiconductors & Foundry' },
  MU: { name: 'Micron Technology', exchange: 'NASDAQ', sector: 'HBM Memory & Semiconductors' },
  SMCI: { name: 'Super Micro Computer', exchange: 'NASDAQ', sector: 'AI Server Infrastructure' },
  RKLB: { name: 'Rocket Lab', exchange: 'NASDAQ', sector: 'Aerospace & Space Launch' },
  IONQ: { name: 'IonQ', exchange: 'NYSE', sector: 'Quantum Computing' },
};

export const FLAGSHIP_MAP: Record<string, TickerMeta> = Object.fromEntries(
  FLAGSHIP_TICKERS.map((t) => [t.ticker, t]),
);

export const CURATED_MAP: Record<string, TickerMeta> = Object.fromEntries(
  [...FLAGSHIP_TICKERS, ...FEATURED_IPOS].map((t) => [t.ticker, t]),
);

export interface ResolveTickerOptions {
  directoryEntry?: DirectoryEntry | null;
  hlCoin?: string | null;
  resolvedExchange?: UsExchange;
  longName?: string;
  hlCtx?: HlAssetCtx | null;
  liveQuote?: MarketQuote | null;
}

/**
 * Builds rich, unified metadata for ANY stock, ETF, macro index, or IPO across
 * Hyperliquid HIP-3 + all 7,290+ NASDAQ/NYSE/AMEX listings + arbitrary new IPO tickers.
 */
export function resolveTickerMeta(
  rawTicker: string,
  options: ResolveTickerOptions = {},
): TickerMeta {
  const clean = rawTicker
    .trim()
    .toUpperCase()
    .replace(/^[A-Z0-9_-]+:/, '');
  const { directoryEntry, hlCtx, liveQuote } = options;

  const curated = CURATED_MAP[clean];
  const discoveredHlCoin = options.hlCoin ?? hlCtx?.coin ?? null;
  const resolvedQuoteExchange =
    options.resolvedExchange ?? liveQuote?.resolvedExchange;
  const resolvedQuoteName = options.longName ?? liveQuote?.longName;

  if (curated) {
    const inferredShares =
      curated.dilutedSharesBillions ??
      (directoryEntry?.marketCap && directoryEntry.lastSale && directoryEntry.lastSale > 0
        ? Number((directoryEntry.marketCap / directoryEntry.lastSale / 1e9).toFixed(3))
        : null);

    return {
      ...curated,
      hlCoin: discoveredHlCoin ?? curated.hlCoin,
      dilutedSharesBillions: inferredShares,
    };
  }

  // Macro index perps on Hyperliquid
  if (clean === 'XYZ100' || clean === 'SP500') {
    return {
      ticker: clean,
      hlCoin: discoveredHlCoin ?? `xyz:${clean}`,
      tvSymbol: clean === 'XYZ100' ? 'NASDAQ:QQQ' : 'AMEX:SPY',
      exchange: 'INDEX',
      name: clean === 'XYZ100' ? 'Nasdaq 100 Index' : 'S&P 500 Index',
      sector: 'Macro Equity Index (24/7)',
      dilutedSharesBillions: null,
      referencePrice: null,
      referenceLabel: 'Prev Close',
      catalystHeadline: `Live 24/7 Macro Index Perp (${clean})`,
      catalystNotes: [
        `Streaming 0-delay 24/7 candles and live mark price for ${discoveredHlCoin ?? `xyz:${clean}`}`,
        'AI brief & 17-indicator consensus update automatically from live 15m/1h bars',
        `Share this War Room directly via ?ticker=${clean}`,
      ],
    };
  }

  const quick = QUICK_EXCHANGE_OVERRIDES[clean];
  const exchange =
    directoryEntry?.exchange ?? resolvedQuoteExchange ?? quick?.exchange;
  const name =
    directoryEntry?.name || resolvedQuoteName || quick?.name || clean;
  const isIpo = Boolean(directoryEntry?.isIpo);
  const ipoYear = directoryEntry?.ipoYear ?? null;

  const baseSector =
    directoryEntry?.sector && directoryEntry.sector !== 'Equities'
      ? directoryEntry.industry
        ? `${directoryEntry.sector} • ${directoryEntry.industry}`
        : directoryEntry.sector
      : quick?.sector ??
        (discoveredHlCoin ? '24/7 Equity / Macro Perp' : 'US Equity / Global Market');

  const sector = isIpo && ipoYear ? `${baseSector} • ${ipoYear} IPO` : baseSector;

  // TradingView symbol: use exact EXCHANGE:TICKER when known, otherwise bare TICKER so TradingView auto-resolves
  const tvSymbol = exchange ? `${exchange}:${clean}` : clean;

  const dilutedSharesBillions =
    directoryEntry?.marketCap && directoryEntry.lastSale && directoryEntry.lastSale > 0
      ? Number((directoryEntry.marketCap / directoryEntry.lastSale / 1e9).toFixed(3))
      : null;

  const venueDesc = discoveredHlCoin
    ? `24/7 Hyperliquid (${discoveredHlCoin})`
    : exchange
      ? `${exchange} Listed Equity`
      : 'Universal Stock & IPO Feed';

  const catalystHeadline = isIpo
    ? `${ipoYear ?? 'Recent'} IPO War Room • ${exchange ?? 'US Market'} (${clean})`
    : `${venueDesc} • Live Multi-Timeframe Terminal`;

  const catalystNotes = isIpo
    ? [
        `${name} (${clean}) went public in ${ipoYear ?? 'recent session'} on ${exchange ?? 'US exchange'}`,
        'Streaming intraday candles, VWAP/EMA structure, AI brief & 17-indicator technical gauge',
        `Isolated live Floor Chat & Bull/Bear poll synced at ?ticker=${clean}`,
      ]
    : [
        `Live market chart, AI brief & 17-indicator consensus for ${name} (${clean})`,
        discoveredHlCoin
          ? `0-delay 24/7 WebSocket price discovery via ${discoveredHlCoin}`
          : `Streaming ${exchange ?? 'exchange'} intraday & extended-hours candles with TradingView backup`,
        `Share this War Room directly via ?ticker=${clean}`,
      ];

  return {
    ticker: clean,
    hlCoin: discoveredHlCoin,
    tvSymbol,
    exchange,
    name,
    sector,
    dilutedSharesBillions,
    referencePrice: null,
    referenceLabel: 'Prev Close',
    catalystHeadline,
    catalystNotes,
    isIpo,
    ipoStatus: isIpo ? 'live' : undefined,
    ipoDate: isIpo && ipoYear ? String(ipoYear) : undefined,
  };
}
