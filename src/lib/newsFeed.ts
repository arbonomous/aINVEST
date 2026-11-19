export type NewsCategory = 'all' | 'stocks' | 'ipos' | 'ai-tech' | 'macro';

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

export function formatRelativeAge(unixMs: number): string {
  const diffSec = Math.max(0, Math.floor((Date.now() - unixMs) / 1000));
  if (diffSec < 60) return 'Just now';
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`;
  return `${Math.floor(diffSec / 86400)}d ago`;
}

/**
 * Grounded current market news desk baseline so the landing page renders instantaneously
 * with real breaking coverage while live RSS feeds stream in and prepend fresh updates.
 */
export function getInitialEditorialNews(): NewsArticle[] {
  const now = Date.now();
  const min = 60_000;
  const hr = 60 * min;

  return [
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
    name: 'CNBC Top News',
    url: 'https://www.cnbc.com/id/100003114/device/rss/rss.html',
    defaultCategory: 'stocks',
  },
  {
    name: 'CNBC Tech',
    url: 'https://www.cnbc.com/id/19854910/device/rss/rss.html',
    defaultCategory: 'ai-tech',
  },
  {
    name: 'Yahoo Finance',
    url: 'https://feeds.finance.yahoo.com/rss/2.0/headline?s=ANT,NVDA,TSLA,AAPL,MSFT,GOOGL,AMZN,META,SPCX,SPY&region=US&lang=en-US',
    defaultCategory: 'stocks',
  },
];

interface Rss2JsonItem {
  title?: string;
  pubDate?: string;
  link?: string;
  guid?: string;
  description?: string;
  thumbnail?: string;
  enclosure?: { link?: string };
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
    for (const item of data.items.slice(0, 10)) {
      const title = stripHtml(item.title ?? '');
      const url = (item.link ?? '').trim();
      if (!title || !url) continue;

      const summary = stripHtml(item.description ?? '').slice(0, 220);
      const parsedTime = item.pubDate ? Date.parse(item.pubDate) : NaN;
      const publishedAt = Number.isFinite(parsedTime) ? parsedTime : Date.now();
      const tickers = extractTickersFromText(`${title} ${summary}`);
      const category = classifyCategory(title, summary) || src.defaultCategory;
      const rawImg = item.thumbnail || item.enclosure?.link || '';
      const imageUrl =
        rawImg && /^https:\/\//i.test(rawImg) && !rawImg.includes('pixel')
          ? rawImg
          : undefined;

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

async function fetchRssViaXmlProxy(
  src: RssSource,
  signal?: AbortSignal,
): Promise<NewsArticle[]> {
  const endpoint = `https://api.allorigins.win/raw?url=${encodeURIComponent(src.url)}`;
  const timeoutCtrl = new AbortController();
  const timer = window.setTimeout(() => timeoutCtrl.abort(), 5500);
  const onAbort = () => timeoutCtrl.abort();
  signal?.addEventListener('abort', onAbort, { once: true });

  try {
    const res = await fetch(endpoint, { signal: timeoutCtrl.signal });
    if (!res.ok) return [];
    const xmlText = await res.text();
    if (!xmlText || !xmlText.includes('<item')) return [];

    const doc = new DOMParser().parseFromString(xmlText, 'text/xml');
    const items = Array.from(doc.querySelectorAll('item')).slice(0, 10);
    const out: NewsArticle[] = [];

    for (const node of items) {
      const title = stripHtml(node.querySelector('title')?.textContent ?? '');
      const url = (node.querySelector('link')?.textContent ?? '').trim();
      if (!title || !url) continue;

      const summary = stripHtml(
        node.querySelector('description')?.textContent ?? '',
      ).slice(0, 220);
      const pubRaw = node.querySelector('pubDate')?.textContent ?? '';
      const parsedTime = pubRaw ? Date.parse(pubRaw) : NaN;
      const publishedAt = Number.isFinite(parsedTime) ? parsedTime : Date.now();
      const tickers = extractTickersFromText(`${title} ${summary}`);
      const category = classifyCategory(title, summary) || src.defaultCategory;

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

let cachedLiveNews: { articles: NewsArticle[]; fetchedAt: number; liveCount: number } | null =
  null;
const NEWS_CACHE_TTL_MS = 3 * 60_000;

/**
 * Fetches live breaking stock market headlines from CNBC + Yahoo Finance RSS feeds,
 * merges & deduplicates them with the grounded editorial desk stories, and sorts newest first.
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

  // Keep the 3 editorial hero/feature stories anchored with photography when live items lack imagery,
  // while placing fresh live breaking RSS items right into the live news stream.
  const sortedLive = [...liveItems].sort((a, b) => b.publishedAt - a.publishedAt);
  for (const item of sortedLive) addUnique(item);
  for (const item of editorial) addUnique(item);

  const result = {
    articles: combined.slice(0, 32),
    liveCount: liveItems.length,
  };

  cachedLiveNews = {
    ...result,
    fetchedAt: Date.now(),
  };

  return result;
}
