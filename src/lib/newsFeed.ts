export type NewsCategory = 'all' | 'stocks' | 'ipos' | 'ai-tech' | 'macro';
export type NewsSentiment = 'bull' | 'bear' | 'neutral';

export interface NewsArticle {
  id: string;
  title: string;
  summary: string;
  url: string;
  source: string;
  publishedAt: number; // unix ms
  category: Exclude<NewsCategory, 'all'>;
  tickers: string[];
  imageUrl?: string;
  sentiment?: NewsSentiment;
  isBreaking?: boolean;
  isLiveFetched?: boolean;
}

const ENTITY_TICKER_PATTERNS: Array<[RegExp, string]> = [
  [/\banthropic\b|\bclaude\b|\bANT\b/i, 'ANT'],
  [/\bspacex\b|\bstarlink\b|\bSPCX\b/i, 'SPCX'],
  [/\bnvidia\b|\bNVDA\b/i, 'NVDA'],
  [/\btesla\b|\bTSLA\b/i, 'TSLA'],
  [/\bapple\b|\biPhone\b|\bAAPL\b/i, 'AAPL'],
  [/\bmicrosoft\b|\bazure\b|\bMSFT\b/i, 'MSFT'],
  [/\balphabet\b|\bgoogle\b|\bGOOGL?\b/i, 'GOOGL'],
  [/\bamazon\b|\baws\b|\bAMZN\b/i, 'AMZN'],
  [/\bmeta\b|\binstagram\b|\bMETA\b/i, 'META'],
  [/\bpalantir\b|\bPLTR\b/i, 'PLTR'],
  [/\bcoreweave\b|\bCRWV\b/i, 'CRWV'],
  [/\bcerebras\b|\bCBRS\b/i, 'CBRS'],
  [/\bsk hynix\b|\bSKHY\b/i, 'SKHY'],
  [/\bamd\b|\badvanced micro\b/i, 'AMD'],
  [/\bbroadcom\b|\bAVGO\b/i, 'AVGO'],
  [/\bintel\b|\bINTC\b/i, 'INTC'],
  [/\bmicron\b|\bMU\b/i, 'MU'],
  [/\barm holdings\b|\bARM\b/i, 'ARM'],
  [/\breddit\b|\bRDDT\b/i, 'RDDT'],
  [/\bcircle\b|\bCRCL\b/i, 'CRCL'],
  [/\bchime\b|\bCHYM\b/i, 'CHYM'],
  [/\bwalmart\b|\bWMT\b/i, 'WMT'],
  [/\btarget\b|\bTGT\b/i, 'TGT'],
  [/\bjpmorgan\b|\bjamie dimon\b|\bJPM\b/i, 'JPM'],
  [/\bgoldman sachs\b|\bGS\b/i, 'GS'],
  [/\bberkshire\b|\bbuffett\b|\bBRK\.B\b/i, 'BRK.B'],
  [/\bnetflix\b|\bNFLX\b/i, 'NFLX'],
  [/\bdisney\b|\bDIS\b/i, 'DIS'],
  [/\bcoinbase\b|\bCOIN\b/i, 'COIN'],
  [/\brobinhood\b|\bHOOD\b/i, 'HOOD'],
  [/\boracle\b|\bORCL\b/i, 'ORCL'],
  [/\bsalesforce\b|\bCRM\b/i, 'CRM'],
  [/\buber\b|\bUBER\b/i, 'UBER'],
  [/\bspotify\b|\bSPOT\b/i, 'SPOT'],
  [/\bcrowdstrike\b|\bCRWD\b/i, 'CRWD'],
  [/\bboeing\b|\bBA\b/i, 'BA'],
  [/\beli lilly\b|\bLLY\b/i, 'LLY'],
  [/\bexxon\b|\bXOM\b/i, 'XOM'],
  [/\bchevron\b|\bCVX\b/i, 'CVX'],
  [/\bcostco\b|\bCOST\b/i, 'COST'],
  [/\bs&p 500\b|\bSPY\b/i, 'SPY'],
  [/\bnasdaq\b|\bQQQ\b/i, 'QQQ'],
  [/\bdow jones\b|\bdow\b|\bDIA\b/i, 'DIA'],
];

const IGNORE_TICKERS = new Set([
  'CEO',
  'CFO',
  'CTO',
  'IPO',
  'SEC',
  'FED',
  'GDP',
  'CPI',
  'PPI',
  'ETF',
  'USA',
  'USD',
  'NYSE',
  'AI',
  'US',
  'UK',
  'EU',
  'Q1',
  'Q2',
  'Q3',
  'Q4',
  'S1',
  'THE',
  'FOR',
  'AND',
  'NOW',
]);

export function extractTickersFromText(text: string): string[] {
  const found: string[] = [];
  const seen = new Set<string>();

  const push = (t: string) => {
    if (!t || seen.has(t) || IGNORE_TICKERS.has(t)) return;
    seen.add(t);
    found.push(t);
  };

  // Explicit $TICKER or (NASDAQ: TICKER) / (NYSE: TICKER)
  const explicitMatches = text.matchAll(
    /(?:\$([A-Z]{1,5}(?:\.[A-Z])?)|\((?:NASDAQ|NYSE|AMEX):\s*([A-Z]{1,5}(?:\.[A-Z])?)\))/g,
  );
  for (const m of explicitMatches) {
    const sym = (m[1] || m[2] || '').trim().toUpperCase();
    if (sym) push(sym);
  }

  for (const [pattern, ticker] of ENTITY_TICKER_PATTERNS) {
    if (pattern.test(text)) {
      push(ticker);
    }
    if (found.length >= 4) break;
  }

  return found.slice(0, 4);
}

function classifyCategory(title: string, summary: string): Exclude<NewsCategory, 'all'> {
  const blob = `${title} ${summary}`.toLowerCase();
  if (/\b(ipo|debut|s-1|public offering|flotation|lock-up|listing|spac)\b/.test(blob)) {
    return 'ipos';
  }
  if (
    /\b(fed|federal reserve|rate hike|rate cut|inflation|treasury|yield|gdp|dow|s&p 500|nasdaq|tariff|jobs report|recession|wall street)\b/.test(
      blob,
    )
  ) {
    return 'macro';
  }
  if (
    /\b(ai|artificial intelligence|chip|semiconductor|gpu|nvidia|anthropic|claude|openai|data center|cloud|cerebras|coreweave|software|tech)\b/.test(
      blob,
    )
  ) {
    return 'ai-tech';
  }
  return 'stocks';
}

const BULL_HEADLINE_RE =
  /\b(surge[sd]?|soar[sd]?|rally|rallies|rallied|jump[sd]?|climb[sd]?|beat[s]?|top[s]? estimates|upgrade[sd]?|outperform|record high|breakout|raises? guidance|strong demand|rebound[sd]?|gains? \d|up \d|bullish|approval|approved|partnership|buyback)\b/gi;

const BEAR_HEADLINE_RE =
  /\b(plunge[sd]?|tumble[sd]?|drop[sp]?|slide[sd]?|slump[sd]?|sink[s]?|selloff|sell-off|miss(?:es|ed)?|downgrade[sd]?|underperform|cuts? guidance|layoff[s]?|probe|investigation|lawsuit|antitrust|tariff[s]?|export (?:ban|curb|rule)|down \d|falls? \d|bearish|warning|weak demand|recession|default)\b/gi;

export function classifyNewsSentiment(title: string, summary: string): NewsSentiment {
  const blob = `${title} ${summary}`;
  const bullHits = (blob.match(BULL_HEADLINE_RE) ?? []).length;
  const bearHits = (blob.match(BEAR_HEADLINE_RE) ?? []).length;
  if (bullHits > bearHits && bullHits >= 1) return 'bull';
  if (bearHits > bullHits && bearHits >= 1) return 'bear';
  return 'neutral';
}

const NON_MARKET_NOISE_RE =
  /\b(moneyist|stay-at-home|my husband|my wife|my spouse|my fiance|my mother|my father|my sister|my brother|my son|my daughter|raid (?:his|her|my|our) 401\(k\)|401\(k\)|social security|inheritance|will and trust|divorce|prenup|alimony|credit card debt|student loan forgiveness|should i retire|retire at \d+|early retirement|how much do i need to retire|i(?:'|’)m \d{2} and|wedding|tipping|etiquette|real estate agent|homebuyer|mortgage payment|dating|relationship advice)\b/i;

export function isNonMarketNoise(title: string, summary: string): boolean {
  return NON_MARKET_NOISE_RE.test(`${title} ${summary}`);
}

/**
 * Normalizes publisher feed names into canonical outlet groups (e.g. CNBC, MarketWatch,
 * Yahoo Finance, Investing.com) so hero/feature slots maintain multi-source diversity.
 */
export function getPublisherGroup(source: string): string {
  const s = source.toLowerCase();
  if (s.includes('cnbc')) return 'cnbc';
  if (s.includes('marketwatch')) return 'marketwatch';
  if (s.includes('yahoo')) return 'yahoo';
  if (s.includes('investing')) return 'investing';
  return s.replace(/[^a-z0-9]/g, '');
}

function stripHtml(raw: string): string {
  return raw
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

function sanitizeImageUrl(raw?: string | null): string | undefined {
  if (!raw) return undefined;
  const trimmed = raw.trim();
  if (!/^https:\/\//i.test(trimmed)) return undefined;
  if (/pixel|1x1|spacer|icon|favicon|logo_small/i.test(trimmed)) return undefined;
  return trimmed;
}

function extractImageFromHtml(html: string): string | undefined {
  const match = html.match(/<img[^>]+src=["'](https:\/\/[^"']+)["']/i);
  return sanitizeImageUrl(match?.[1]);
}

export function formatRelativeAge(unixMs: number): string {
  const diffSec = Math.max(0, Math.floor((Date.now() - unixMs) / 1000));
  if (diffSec < 60) return 'Just now';
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`;
  return `${Math.floor(diffSec / 86400)}d ago`;
}

export const EDITORIAL_IMAGE_POOL: string[] = [
  './news/story-trading-desk.jpg',
  './news/story-semiconductors.jpg',
  './news/story-ai-compute.jpg',
  './news/hero-ipo-floor.jpg',
  './news/story-fed-treasury.jpg',
  './news/story-wallstreet-macro.jpg',
  './news/story-ev-energy.jpg',
  './news/story-space-aerospace.jpg',
];

export const FALLBACK_EDITORIAL_IMAGES: Record<Exclude<NewsCategory, 'all'>, string> = {
  ipos: './news/hero-ipo-floor.jpg',
  stocks: './news/story-trading-desk.jpg',
  'ai-tech': './news/story-ai-compute.jpg',
  macro: './news/story-wallstreet-macro.jpg',
};

function hashString(input: string): number {
  let h = 0;
  for (let i = 0; i < input.length; i += 1) {
    h = (h * 31 + input.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

/**
 * Picks a topic-matched local editorial photo for any news article that lacks
 * an RSS thumbnail (or whose remote image fails to load), avoiding duplicates
 * within the `recentAvoid` window when provided.
 */
export function getArticleFallbackImage(
  article: Pick<NewsArticle, 'id' | 'title' | 'summary' | 'category' | 'tickers'>,
  recentAvoid?: string | string[],
): string {
  const titleLower = article.title.toLowerCase();
  const fullText = `${article.title} ${article.summary}`.toLowerCase();
  const tickers = new Set(article.tickers.map((t) => t.toUpperCase()));
  const avoidSet = new Set(
    Array.isArray(recentAvoid)
      ? recentAvoid
      : recentAvoid
        ? [recentAvoid]
        : [],
  );

  let preferred: string;
  if (
    tickers.has('SPCX') ||
    tickers.has('BA') ||
    /\b(spacex|starlink|rocket|orbital|aerospace|satellite|defense)\b/.test(titleLower)
  ) {
    preferred = './news/story-space-aerospace.jpg';
  } else if (
    tickers.has('NVDA') ||
    tickers.has('AMD') ||
    tickers.has('ARM') ||
    tickers.has('AVGO') ||
    tickers.has('TSM') ||
    tickers.has('MU') ||
    tickers.has('INTC') ||
    tickers.has('SKHY') ||
    tickers.has('CBRS') ||
    /\b(semiconductor|chip|chips|soxx|smh|dram|hbm|wafer|gpu|foundry|silicon|nvidia|arm)\b/.test(
      titleLower,
    )
  ) {
    preferred = './news/story-semiconductors.jpg';
  } else if (
    tickers.has('TSLA') ||
    tickers.has('XOM') ||
    tickers.has('CVX') ||
    /\b(tesla|electric vehicle|\bev\b|battery|energy|crude|oil|solar|grid|lithium|robotics)\b/.test(
      titleLower,
    )
  ) {
    preferred = './news/story-ev-energy.jpg';
  } else if (
    /\b(fed|federal reserve|powell|treasury|bond yield|inflation|cpi|pce|fomc|rate cut|rate hike|tariff|central bank)\b/.test(
      fullText,
    )
  ) {
    preferred = './news/story-fed-treasury.jpg';
  } else if (
    article.category === 'ipos' ||
    /\b(ipo|public offering|flotation|nasdaq debut|nyse debut|s-1|new issue)\b/.test(
      titleLower,
    )
  ) {
    preferred = './news/hero-ipo-floor.jpg';
  } else if (
    article.category === 'ai-tech' ||
    /\b(ai|artificial intelligence|anthropic|claude|openai|data center|cloud)\b/.test(
      titleLower,
    )
  ) {
    preferred = './news/story-ai-compute.jpg';
  } else if (article.category === 'macro') {
    preferred = './news/story-wallstreet-macro.jpg';
  } else {
    preferred = './news/story-trading-desk.jpg';
  }

  if (avoidSet.has(preferred)) {
    const startIdx =
      hashString(article.id || article.title) % EDITORIAL_IMAGE_POOL.length;
    for (let offset = 0; offset < EDITORIAL_IMAGE_POOL.length; offset += 1) {
      const candidate =
        EDITORIAL_IMAGE_POOL[(startIdx + offset) % EDITORIAL_IMAGE_POOL.length];
      if (!avoidSet.has(candidate)) return candidate;
    }
  }

  return preferred;
}

/**
 * Fallback market news baseline used immediately before live RSS feeds finish loading
 * or when a corporate firewall blocks public RSS relays.
 */
export function getInitialEditorialNews(): NewsArticle[] {
  const now = Date.now();
  const min = 60_000;
  const hr = 60 * min;

  const base: NewsArticle[] = [
    {
      id: 'ed-ant-debut',
      title:
        'Anthropic closes up 17% at $97.17 in record $81.3B Nasdaq IPO as broader Wall Street sells off',
      summary:
        'Shares of the Claude AI maker (ANT) opened at $111.50 before settling 17.1% above its $83 offer price — surpassing SpaceX’s $75B June flotation as the largest US IPO on record, even as broader equity benchmarks reversed sharply lower.',
      url: 'https://www.theguardian.com/business/live/2026/nov/19/anthropic-float-stock-market-nasdaq-raises-81bn-record-ipo-latest-news-updates',
      source: 'Markets Desk',
      publishedAt: now - 18 * min,
      category: 'ipos',
      tickers: ['ANT', 'SPCX', 'GOOGL', 'AMZN'],
      imageUrl: './news/hero-ipo-floor.jpg',
      isBreaking: true,
    },
    {
      id: 'ed-ai-chips-rotation',
      title:
        'AI chip and cloud leaders whipsaw as investors weigh $1.5T frontier model valuations against capex ROI',
      summary:
        'Semiconductor and hyperscaler heavyweights swung sharply after early morning gains faded, with traders watching NVIDIA, AMD, Broadcom, and recent AI hardware debuts SK hynix and Cerebras for institutional trend confirmation.',
      url: 'https://www.cnn.com/2026/11/19/business/anthropic-ipo-stock-test-ai',
      source: 'Tech & Semis',
      publishedAt: now - 42 * min,
      category: 'ai-tech',
      tickers: ['NVDA', 'AMD', 'SKHY', 'CBRS'],
      imageUrl: './news/story-ai-compute.jpg',
      isBreaking: true,
    },
    {
      id: 'ed-wallstreet-selloff',
      title:
        'Dow sinks 1,084 points and Nasdaq drops 2.2% as Fed rate-hike jitters collide with mega-IPO supply',
      summary:
        'All three major US indexes reversed early futures strength after hawkish Federal Reserve minutes signaled broad support for keeping policy tight, dragging S&P 500 and Nasdaq-100 trackers below key moving-average pivots.',
      url: 'https://apnews.com/article/wall-street-stocks-dow-nasdaq-2f178054aea79d282e5ccf8d62f26a28',
      source: 'Macro & Rates',
      publishedAt: now - 54 * min,
      category: 'macro',
      tickers: ['SPY', 'QQQ', 'DIA'],
      imageUrl: './news/story-wallstreet-macro.jpg',
      isBreaking: true,
    },
    {
      id: 'ed-alphabet-amazon-stakes',
      title:
        'Alphabet and Amazon in focus as Anthropic’s $1.7T debut puts fresh mark-to-market value on strategic AI stakes',
      summary:
        'Analysts recalibrated sum-of-the-parts estimates for major cloud backers Alphabet and Amazon following ANT’s first day of public price discovery and staggered 316M-share Day 1 float structure.',
      url: 'https://www.fool.com/coverage/stock-market-today/2026/11/19/stock-market-today-nov-19-stock-market-today-nov-19-alphabet-shares-fall-as-anthropic-nasdaq-debut-puts-fresh-value-on-google-s-stake/',
      source: 'Equities Desk',
      publishedAt: now - 68 * min,
      category: 'stocks',
      tickers: ['GOOGL', 'AMZN', 'ANT'],
    },
    {
      id: 'ed-ant-leveraged-etfs',
      title:
        'Leveraged single-stock ETFs tied to Anthropic (ANTT, ANTZ) slated for Nov. 23 debut following historic volume',
      summary:
        'Tradr announced plans to list 2X long and 2X inverse ETFs linked to ANT just two trading sessions after its Nasdaq launch, highlighting surging institutional and retail derivatives demand.',
      url: 'https://wolf.financial/blog/anthropic-ipo-live',
      source: 'IPO Watch',
      publishedAt: now - 95 * min,
      category: 'ipos',
      tickers: ['ANT', 'QQQ'],
    },
    {
      id: 'ed-retail-earnings',
      title:
        'Walmart, Target and TJX earnings offer defensive bright spot amid big-tech volatility',
      summary:
        'Consumer staples and off-price retail bellwethers beat consensus revenue targets and lifted full-year guidance, attracting defensive rotation flows out of high-multiple software.',
      url: 'https://www.schwab.com/learn/story/stock-market-update-open',
      source: 'Earnings Wire',
      publishedAt: now - 2 * hr,
      category: 'stocks',
      tickers: ['WMT', 'TGT', 'COST'],
    },
    {
      id: 'ed-ipo-pipeline-dec',
      title:
        '2026 mega-IPO leaderboard: Anthropic tops SpaceX and SK hynix as Nscale eyes December NYSE debut',
      summary:
        'With 268 US IPOs already priced in 2026 — led by Anthropic ($81.3B), SpaceX ($75.0B), and SK hynix ($26.5B) — AI cloud builder Nscale (NSCL) headlines the year-end NYSE filing calendar.',
      url: 'https://stockanalysis.com/ipos/2026/',
      source: 'IPO Calendar',
      publishedAt: now - 3 * hr,
      category: 'ipos',
      tickers: ['SPCX', 'SKHY', 'NSCL', 'CRWV'],
    },
    {
      id: 'ed-ai-chip-export-rules',
      title:
        'Semiconductor stocks react to tightened US AI accelerator export rules ahead of diplomatic talks',
      summary:
        'Chip designers and foundry leaders traded under pressure after Washington outlined stricter licensing thresholds on advanced compute clusters, putting SMH, NVDA, AVGO, and TSM in focus.',
      url: 'https://www.cnn.com/2026/11/19/business/anthropic-ipo-stock-test-ai',
      source: 'Policy & Tech',
      publishedAt: now - 4 * hr,
      category: 'ai-tech',
      tickers: ['NVDA', 'AVGO', 'TSM', 'SMH'],
    },
    {
      id: 'ed-nov-ipo-cohort',
      title:
        'November IPO cohort watch: vVARDIS (VVVV), Windward Bio (WWB), and Rezera (RZRA) enter post-debut discovery',
      summary:
        'Recent mid-November healthcare and growth listings are establishing initial institutional VWAP ranges as underwriters balance stabilization bids against active float supply.',
      url: 'https://www.firstrade.com/resources/upcoming-ipo',
      source: 'New Issues',
      publishedAt: now - 5 * hr,
      category: 'ipos',
      tickers: ['VVVV', 'WWB', 'RZRA'],
    },
    {
      id: 'ed-247-perp-flows',
      title:
        'Overnight 24/7 equity perps lead pre-market price discovery on NVDA, TSLA, and ANT ahead of US cash open',
      summary:
        'Round-the-clock HIP-3 orderbooks processed over $4.4B in daily volume across 130+ equity, ETF, and index contracts, increasingly telegraphing regular-session NASDAQ opening gaps.',
      url: 'https://0xarchive.io/resources/market-data-guides/hyperliquid-stocks',
      source: '24/7 Markets',
      publishedAt: now - 6 * hr,
      category: 'stocks',
      tickers: ['NVDA', 'TSLA', 'ANT', 'PLTR'],
    },
  ];

  return base.map((item) => ({
    ...item,
    sentiment: classifyNewsSentiment(item.title, item.summary),
  }));
}

interface RssSource {
  name: string;
  url: string;
  defaultCategory: Exclude<NewsCategory, 'all'>;
}

const LIVE_RSS_SOURCES: RssSource[] = [
  {
    name: 'CNBC Markets',
    url: 'https://www.cnbc.com/id/20910258/device/rss/rss.html',
    defaultCategory: 'macro',
  },
  {
    name: 'CNBC Investing',
    url: 'https://www.cnbc.com/id/15839069/device/rss/rss.html',
    defaultCategory: 'stocks',
  },
  {
    name: 'CNBC Tech',
    url: 'https://www.cnbc.com/id/19854910/device/rss/rss.html',
    defaultCategory: 'ai-tech',
  },
  {
    name: 'MarketWatch Pulse',
    url: 'https://feeds.content.dowjones.io/public/rss/mw_marketpulse',
    defaultCategory: 'stocks',
  },
  {
    name: 'Yahoo Finance',
    url: 'https://finance.yahoo.com/news/rssindex',
    defaultCategory: 'stocks',
  },
  {
    name: 'Yahoo Equities',
    url: 'https://feeds.finance.yahoo.com/rss/2.0/headline?s=ANT,NVDA,TSLA,AAPL,MSFT,GOOGL,AMZN,META,SPCX,SPY&region=US&lang=en-US',
    defaultCategory: 'stocks',
  },
  {
    name: 'Investing.com',
    url: 'https://www.investing.com/rss/news_25.rss',
    defaultCategory: 'stocks',
  },
];

interface Rss2JsonItem {
  title?: string;
  pubDate?: string;
  link?: string;
  guid?: string;
  description?: string;
  content?: string;
  thumbnail?: string;
  enclosure?: { link?: string; thumbnail?: string };
}

interface Rss2JsonPayload {
  status?: string;
  items?: Rss2JsonItem[];
}

async function fetchRssViaRss2Json(
  src: RssSource,
  signal?: AbortSignal,
): Promise<NewsArticle[]> {
  const endpoint = `https://api.rss2json.com/v1/api.json?rss_url=${encodeURIComponent(src.url)}`;
  const timeoutCtrl = new AbortController();
  const timer = window.setTimeout(() => timeoutCtrl.abort(), 5500);
  const onAbort = () => timeoutCtrl.abort();
  signal?.addEventListener('abort', onAbort, { once: true });

  try {
    const res = await fetch(endpoint, { signal: timeoutCtrl.signal });
    if (!res.ok) return [];
    const data = (await res.json()) as Rss2JsonPayload;
    if (data.status !== 'ok' || !Array.isArray(data.items)) return [];

    const out: NewsArticle[] = [];
    for (const item of data.items.slice(0, 12)) {
      const title = stripHtml(item.title ?? '');
      const url = (item.link ?? '').trim();
      if (!title || !url) continue;

      const rawDesc = item.description ?? '';
      const summary = stripHtml(rawDesc).slice(0, 220);
      if (isNonMarketNoise(title, summary)) continue;

      const parsedTime = item.pubDate ? Date.parse(item.pubDate) : NaN;
      const publishedAt = Number.isFinite(parsedTime) ? parsedTime : Date.now();
      const tickers = extractTickersFromText(`${title} ${summary}`);
      const category = classifyCategory(title, summary) || src.defaultCategory;
      const sentiment = classifyNewsSentiment(title, summary);
      const imageUrl =
        sanitizeImageUrl(item.thumbnail) ??
        sanitizeImageUrl(item.enclosure?.link) ??
        sanitizeImageUrl(item.enclosure?.thumbnail) ??
        extractImageFromHtml(rawDesc) ??
        extractImageFromHtml(item.content ?? '');

      out.push({
        id: `live-${src.name}-${item.guid || url}`.slice(0, 120),
        title,
        summary:
          summary || `Live ${src.name} market coverage — open related tickers in aINVEST Terminal.`,
        url,
        source: src.name,
        publishedAt,
        category,
        tickers,
        imageUrl,
        sentiment,
        isBreaking: Date.now() - publishedAt < 3 * 3600_000,
        isLiveFetched: true,
      });
    }
    return out;
  } catch {
    return [];
  } finally {
    window.clearTimeout(timer);
    signal?.removeEventListener('abort', onAbort);
  }
}

const XML_PROXIES: Array<(rssUrl: string) => string> = [
  (u) => `https://corsproxy.io/?url=${encodeURIComponent(u)}`,
  (u) => `https://api.allorigins.win/raw?url=${encodeURIComponent(u)}`,
];

function extractXmlNodeImage(node: Element, rawDesc: string): string | undefined {
  // Check <media:content url="...">, <media:thumbnail url="...">, <enclosure url="...">
  const mediaNodes = node.getElementsByTagName('*');
  for (let i = 0; i < mediaNodes.length; i++) {
    const el = mediaNodes[i];
    const tag = el.tagName.toLowerCase();
    if (
      tag.endsWith('content') ||
      tag.endsWith('thumbnail') ||
      tag === 'enclosure' ||
      tag === 'image'
    ) {
      const candidate =
        sanitizeImageUrl(el.getAttribute('url')) ??
        sanitizeImageUrl(el.getAttribute('href')) ??
        sanitizeImageUrl(el.textContent);
      if (candidate) return candidate;
    }
  }
  return extractImageFromHtml(rawDesc);
}

async function fetchRssViaXmlProxy(
  src: RssSource,
  signal?: AbortSignal,
): Promise<NewsArticle[]> {
  for (const buildProxy of XML_PROXIES) {
    if (signal?.aborted) return [];
    const endpoint = buildProxy(src.url);
    const timeoutCtrl = new AbortController();
    const timer = window.setTimeout(() => timeoutCtrl.abort(), 5500);
    const onAbort = () => timeoutCtrl.abort();
    signal?.addEventListener('abort', onAbort, { once: true });

    try {
      const res = await fetch(endpoint, { signal: timeoutCtrl.signal });
      if (!res.ok) continue;
      const xmlText = await res.text();
      if (!xmlText || !xmlText.includes('<item')) continue;

      const doc = new DOMParser().parseFromString(xmlText, 'text/xml');
      const items = Array.from(doc.querySelectorAll('item')).slice(0, 12);
      const out: NewsArticle[] = [];

      for (const node of items) {
        const title = stripHtml(node.querySelector('title')?.textContent ?? '');
        const url = (node.querySelector('link')?.textContent ?? '').trim();
        if (!title || !url) continue;

        const rawDesc = node.querySelector('description')?.textContent ?? '';
        const summary = stripHtml(rawDesc).slice(0, 220);
        if (isNonMarketNoise(title, summary)) continue;

        const pubRaw = node.querySelector('pubDate')?.textContent ?? '';
        const parsedTime = pubRaw ? Date.parse(pubRaw) : NaN;
        const publishedAt = Number.isFinite(parsedTime) ? parsedTime : Date.now();
        const tickers = extractTickersFromText(`${title} ${summary}`);
        const category = classifyCategory(title, summary) || src.defaultCategory;
        const sentiment = classifyNewsSentiment(title, summary);
        const imageUrl = extractXmlNodeImage(node, rawDesc);

        out.push({
          id: `xml-${src.name}-${url}`.slice(0, 120),
          title,
          summary:
            summary || `Live ${src.name} market headline — click to read full story.`,
          url,
          source: src.name,
          publishedAt,
          category,
          tickers,
          imageUrl,
          sentiment,
          isBreaking: Date.now() - publishedAt < 3 * 3600_000,
          isLiveFetched: true,
        });
      }
      if (out.length > 0) return out;
    } catch {
      // Try next proxy
    } finally {
      window.clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
    }
  }
  return [];
}

let cachedLiveNews: { articles: NewsArticle[]; fetchedAt: number; liveCount: number } | null =
  null;
const NEWS_CACHE_TTL_MS = 3 * 60_000;

/**
 * Fetches live breaking stock market headlines from CNBC, MarketWatch, and Yahoo Finance RSS feeds,
 * merges & deduplicates them with the fallback editorial desk, and sorts newest first.
 */
export async function fetchBreakingMarketNews(
  forceRefresh = false,
  signal?: AbortSignal,
): Promise<{ articles: NewsArticle[]; liveCount: number }> {
  if (
    !forceRefresh &&
    cachedLiveNews &&
    Date.now() - cachedLiveNews.fetchedAt < NEWS_CACHE_TTL_MS
  ) {
    return {
      articles: cachedLiveNews.articles,
      liveCount: cachedLiveNews.liveCount,
    };
  }

  const settled = await Promise.allSettled(
    LIVE_RSS_SOURCES.map(async (src) => {
      const viaJson = await fetchRssViaRss2Json(src, signal);
      if (viaJson.length > 0) return viaJson;
      return fetchRssViaXmlProxy(src, signal);
    }),
  );

  const liveItems: NewsArticle[] = [];
  for (const r of settled) {
    if (r.status === 'fulfilled') {
      liveItems.push(...r.value);
    }
  }

  const editorial = getInitialEditorialNews();
  const seenTitles = new Set<string>();
  const combined: NewsArticle[] = [];

  const addUnique = (article: NewsArticle) => {
    const key = article.title
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '')
      .slice(0, 60);
    if (!key || seenTitles.has(key)) return;
    seenTitles.add(key);
    combined.push(article);
  };

  const sortedLive = [...liveItems].sort((a, b) => b.publishedAt - a.publishedAt);
  for (const item of sortedLive) addUnique(item);
  for (const item of editorial) addUnique(item);

  const result = {
    articles: combined.slice(0, 36),
    liveCount: liveItems.length,
  };

  cachedLiveNews = {
    ...result,
    fetchedAt: Date.now(),
  };

  return result;
}
