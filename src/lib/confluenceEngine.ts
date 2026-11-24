import { CURATED_MAP } from '../data/tickers';
import type { ChartTradePlan } from '../components/RealtimeCandleChart';
import {
  getTickerCatalystStatus,
  type TickerCatalystStatus,
} from './catalystCalendar';
import type { HlAssetCtx } from './hyperliquidFeed';
import {
  getTickerInsidersDigest,
  type InsidersBundle,
} from './insidersEngine';
import type { DirectoryEntry } from './marketCatalog';
import type { NewsArticle } from './newsFeed';
import type { MarketQuote } from './universalFeed';
import type { ChartGexLevels, TickerOptionsSummary } from './whaleFlowEngine';

export type ConfluencePillarId =
  | 'tech'
  | 'whale'
  | 'insider'
  | 'perp247'
  | 'catalyst';

export type PillarDirection = 'bull' | 'bear' | 'neutral';

export interface ConfluencePillar {
  id: ConfluencePillarId;
  shortLabel: string;
  label: string;
  direction: PillarDirection;
  strength: number; // 0..100
  active: boolean;
  headline: string;
  evidence: string;
}

export type ConfluenceVerdict =
  | 'STRONG BULL CONFLUENCE'
  | 'BULLISH CONFLUENCE'
  | 'STRONG BEAR CONFLUENCE'
  | 'BEARISH CONFLUENCE'
  | 'MIXED / CONFLICTING';

export interface ConfluenceReport {
  ticker: string;
  name: string;
  price: number | null;
  changePct: number | null;
  score: number; // 0..100 overall conviction
  bias: PillarDirection;
  verdict: ConfluenceVerdict;
  alignedCount: number;
  activePillars: number;
  pillars: ConfluencePillar[];
  topEvidence: string[];
  catalystStatus: TickerCatalystStatus;
  isIpo: boolean;
  isLive247: boolean;
}

export interface ComputeConfluenceInput {
  ticker: string;
  name?: string;
  price?: number | null;
  changePct?: number | null;
  hlCtx?: HlAssetCtx | null;
  quote?: MarketQuote | null;
  directoryEntry?: DirectoryEntry | null;
  insidersBundle?: InsidersBundle | null;
  articles?: NewsArticle[];
  tradePlan?: ChartTradePlan | null;
  gexLevels?: ChartGexLevels | null;
  optionsSummary?: TickerOptionsSummary | null;
}

function fmtCompactUsd(val: number): string {
  const abs = Math.abs(val);
  if (abs >= 1e9) return `$${(abs / 1e9).toFixed(2)}B`;
  if (abs >= 1e6) return `$${(abs / 1e6).toFixed(1)}M`;
  if (abs >= 1e3) return `$${(abs / 1e3).toFixed(0)}K`;
  return `$${abs.toFixed(0)}`;
}

export function computeTickerConfluence(
  input: ComputeConfluenceInput,
): ConfluenceReport {
  const ticker = input.ticker.toUpperCase();
  const curated = CURATED_MAP[ticker];
  const dir = input.directoryEntry ?? null;
  const hl = input.hlCtx ?? null;
  const q = input.quote ?? null;

  const name =
    input.name ?? curated?.name ?? q?.longName ?? dir?.name ?? ticker;
  const price =
    input.price ?? hl?.markPx ?? q?.price ?? dir?.lastSale ?? null;

  const refPx = curated?.referencePrice ?? hl?.prevDayPx ?? q?.prevClose ?? null;
  const changePct =
    input.changePct ??
    (price !== null && refPx !== null && refPx > 0
      ? ((price - refPx) / refPx) * 100
      : q?.changePct ?? dir?.pctChange ?? null);

  // =========================================================================
  // PILLAR 1: TECHNICALS & INTRADAY MOMENTUM (Daily Bread + Live Price Action)
  // =========================================================================
  let techDir: PillarDirection = 'neutral';
  let techStrength = 35;
  let techActive = false;
  let techHeadline = 'Awaiting live momentum';
  let techEvidence = 'Open War Room for live 5m/15m/1h EMA + VWAP scan';

  if (input.tradePlan && input.tradePlan.ticker === ticker) {
    techActive = true;
    const tp = input.tradePlan;
    const entryMid = (tp.entryLow + tp.entryHigh) / 2;
    const risk = Math.abs(entryMid - tp.stopLoss);
    const reward = Math.abs(tp.target1 - entryMid);
    const rr = risk > 0 ? reward / risk : 1.5;
    const rrLabel = `${rr.toFixed(1)}R`;
    if (tp.direction === 'LONG') {
      techDir = 'bull';
      techStrength = Math.min(92, Math.round(68 + Math.min(24, rr * 8)));
      techHeadline = `DAILY BREAD LONG (${rrLabel})`;
      techEvidence = `Entry $${tp.entryLow.toFixed(2)}–$${tp.entryHigh.toFixed(2)} • TP1 $${tp.target1.toFixed(2)} / SL $${tp.stopLoss.toFixed(2)}`;
    } else if (tp.direction === 'SHORT') {
      techDir = 'bear';
      techStrength = Math.min(92, Math.round(68 + Math.min(24, rr * 8)));
      techHeadline = `DAILY BREAD SHORT (${rrLabel})`;
      techEvidence = `Entry $${tp.entryLow.toFixed(2)}–$${tp.entryHigh.toFixed(2)} • TP1 $${tp.target1.toFixed(2)} / SL $${tp.stopLoss.toFixed(2)}`;
    } else {
      techDir = 'neutral';
      techStrength = 44;
      techHeadline = 'WAIT / RANGE PIVOT';
      techEvidence = `Watching breakout $${tp.target1.toFixed(2)} vs breakdown $${tp.stopLoss.toFixed(2)}`;
    }
  } else if (changePct !== null && Number.isFinite(changePct)) {
    techActive = true;
    const absChg = Math.abs(changePct);
    if (changePct >= 1.25) {
      techDir = 'bull';
      techStrength = Math.min(90, Math.round(52 + absChg * 5.2));
      techHeadline = `UPTREND +${changePct.toFixed(2)}%`;
      techEvidence = `Strong positive session momentum (${changePct >= 4 ? 'expansion breakout' : 'steady bid'})`;
    } else if (changePct <= -1.25) {
      techDir = 'bear';
      techStrength = Math.min(90, Math.round(52 + absChg * 5.2));
      techHeadline = `SELL PRESSURE ${changePct.toFixed(2)}%`;
      techEvidence = `Bearish session tape (${changePct <= -4 ? 'heavy distribution' : 'sellers in control'})`;
    } else {
      techDir = 'neutral';
      techStrength = 42;
      techHeadline = `CONSOLIDATING (${changePct >= 0 ? '+' : ''}${changePct.toFixed(2)}%)`;
      techEvidence = 'Tight intraday balance near prior reference price';
    }
  }

  // =========================================================================
  // PILLAR 2: WHALE OPTIONS FLOW & DEALER GEX
  // =========================================================================
  let whaleDir: PillarDirection = 'neutral';
  let whaleStrength = 30;
  let whaleActive = false;
  let whaleHeadline = 'No live chain loaded';
  let whaleEvidence = 'CBOE options chain & Dealer GEX walls sync in War Room / Whale Flow';

  const opt = input.optionsSummary ?? null;
  const gex = input.gexLevels && input.gexLevels.ticker === ticker ? input.gexLevels : null;

  if (opt && opt.source === 'cboe') {
    whaleActive = true;
    if (opt.flowBias === 'BULLISH') {
      whaleDir = 'bull';
      whaleStrength = Math.min(95, 62 + Math.round(Math.min(33, opt.callPremiumUsd / 250_000)));
      whaleHeadline = `CALL FLOW (${fmtCompactUsd(opt.callPremiumUsd)})`;
    } else if (opt.flowBias === 'BEARISH') {
      whaleDir = 'bear';
      whaleStrength = Math.min(95, 62 + Math.round(Math.min(33, opt.putPremiumUsd / 250_000)));
      whaleHeadline = `PUT FLOW (${fmtCompactUsd(opt.putPremiumUsd)})`;
    } else {
      whaleDir = 'neutral';
      whaleStrength = 48;
      whaleHeadline = `BALANCED FLOW (P/C ${opt.putCallVolRatio.toFixed(2)})`;
    }
    const wallNote = [
      opt.callWall ? `Call Wall $${opt.callWall}` : null,
      opt.putWall ? `Put Wall $${opt.putWall}` : null,
      opt.netGammaRegime,
    ]
      .filter(Boolean)
      .join(' • ');
    whaleEvidence = wallNote || `Net options flow ${fmtCompactUsd(opt.netPremiumUsd)}`;
  } else if (gex) {
    whaleActive = true;
    const spot = gex.spotPrice;
    const aboveFlip = gex.gammaFlip !== null && spot >= gex.gammaFlip;
    const nearPutWall =
      gex.putWall !== null && spot > 0 && Math.abs(spot - gex.putWall) / spot <= 0.035;
    const nearCallWall =
      gex.callWall !== null && spot > 0 && Math.abs(gex.callWall - spot) / spot <= 0.035;

    if (gex.netGammaRegime === 'PIN (+GEX)' || aboveFlip || nearPutWall) {
      whaleDir = 'bull';
      whaleStrength = nearPutWall ? 74 : 66;
      whaleHeadline = `${gex.netGammaRegime} SUPPORT`;
    } else if (gex.netGammaRegime === 'VOLATILE (-GEX)') {
      whaleDir = 'bear';
      whaleStrength = 70;
      whaleHeadline = 'VOLATILE (-GEX) REGIME';
    } else {
      whaleDir = 'neutral';
      whaleStrength = 48;
      whaleHeadline = nearCallWall ? 'APPROACHING CALL WALL' : 'NEUTRAL GEX';
    }
    const parts = [
      gex.callWall ? `Call Wall $${gex.callWall}` : null,
      gex.putWall ? `Put Wall $${gex.putWall}` : null,
      gex.maxPain ? `Max Pain $${gex.maxPain}` : null,
    ].filter(Boolean);
    whaleEvidence = parts.join(' • ') || 'Dealer gamma levels active on chart';
  }

  // =========================================================================
  // PILLAR 3: INSIDERS (CONGRESS STOCK ACT, SEC FORM 4 CLUSTERS & FINRA SQUEEZE)
  // =========================================================================
  let insiderDir: PillarDirection = 'neutral';
  let insiderStrength = 25;
  let insiderActive = false;
  let insiderHeadline = 'No recent filings';
  let insiderEvidence = 'No elevated Congress, Form 4, or FINRA short-squeeze prints';

  const digest = getTickerInsidersDigest(input.insidersBundle ?? null, ticker);
  const congBuys = digest.congressTrades.filter((t) => t.action === 'BUY');
  const congSells = digest.congressTrades.filter((t) => t.action === 'SELL');
  const f4Buys = digest.form4Trades.filter((t) => t.action === 'BUY');
  const f4Sells = digest.form4Trades.filter((t) => t.action === 'SELL');
  const sqz = digest.squeeze;

  if (
    digest.clusterBuy ||
    congBuys.length > 0 ||
    congSells.length > 0 ||
    f4Buys.length > 0 ||
    f4Sells.length > 0 ||
    (sqz && sqz.squeezeScore >= 52)
  ) {
    insiderActive = true;
    const bullPts =
      (digest.clusterBuy ? 42 : 0) +
      congBuys.length * 24 +
      f4Buys.length * 16 +
      (sqz && sqz.squeezeScore >= 60 ? Math.round((sqz.squeezeScore - 40) * 0.7) : 0);
    const bearPts = congSells.length * 20 + f4Sells.length * 14;

    if (bullPts > bearPts) {
      insiderDir = 'bull';
      insiderStrength = Math.min(96, 48 + bullPts);
    } else if (bearPts > bullPts) {
      insiderDir = 'bear';
      insiderStrength = Math.min(92, 46 + bearPts);
    } else {
      insiderDir = 'neutral';
      insiderStrength = 52;
    }

    const evBits: string[] = [];
    if (digest.clusterBuy) {
      evBits.push(
        `C-Suite Cluster Buy (${digest.clusterBuy.insiderCount} insiders • ${fmtCompactUsd(digest.clusterBuy.totalBuyUsd)})`,
      );
    }
    if (congBuys.length > 0) {
      const names = Array.from(new Set(congBuys.map((c) => c.politician.split(' ').at(-1)))).slice(0, 2);
      evBits.push(`Congress Buy (${names.join(', ')})`);
    } else if (congSells.length > 0) {
      evBits.push(`${congSells.length} Congress Sell disclosure${congSells.length > 1 ? 's' : ''}`);
    }
    if (!digest.clusterBuy && f4Buys.length > 0) {
      evBits.push(`${f4Buys.length} SEC Form 4 open-mkt buy${f4Buys.length > 1 ? 's' : ''}`);
    } else if (f4Sells.length > 0) {
      evBits.push(`${f4Sells.length} insider Form 4 sale${f4Sells.length > 1 ? 's' : ''}`);
    }
    if (sqz && sqz.squeezeScore >= 52) {
      evBits.push(`FINRA Short ${sqz.shortVolPct.toFixed(0)}% (SQZ ${sqz.squeezeScore}/100)`);
    }

    insiderHeadline =
      digest.clusterBuy
        ? `CLUSTER BUY (${digest.clusterBuy.insiderCount}x)`
        : congBuys.length > 0
          ? `CONGRESS BUY (${congBuys.length})`
          : sqz && sqz.squeezeScore >= 65
            ? `SQUEEZE ${sqz.squeezeScore}/100`
            : bearPts > bullPts
              ? 'INSIDER SELLING'
              : 'SMART-MONEY ACTIVE';
    insiderEvidence = evBits.slice(0, 2).join(' • ');
  }

  // =========================================================================
  // PILLAR 4: 24/7 HYPERLIQUID OVERNIGHT ORDERBOOK & FUNDING SQUEEZE
  // =========================================================================
  let perpDir: PillarDirection = 'neutral';
  let perpStrength = 25;
  let perpActive = false;
  let perpHeadline = 'Regular US hours';
  let perpEvidence = 'No active 24/7 Hyperliquid HIP-3 equity perp';

  if (hl && Number.isFinite(hl.markPx) && hl.markPx > 0) {
    perpActive = true;
    const fundingApr = Number.isFinite(hl.funding) ? hl.funding * 24 * 365 * 100 : 0;
    const gapPct =
      hl.prevDayPx && hl.prevDayPx > 0
        ? ((hl.markPx - hl.prevDayPx) / hl.prevDayPx) * 100
        : 0;

    if (fundingApr <= -10) {
      perpDir = 'bull';
      perpStrength = Math.min(92, Math.round(64 + Math.abs(fundingApr) * 0.45));
      perpHeadline = `SHORT SQUEEZE (${fundingApr.toFixed(0)}% APR)`;
      perpEvidence = `Shorts paying longs on 24/7 perp • ${fmtCompactUsd(hl.dayNtlVlm)} 24h vol`;
    } else if (fundingApr >= 22) {
      perpDir = 'bear';
      perpStrength = Math.min(86, Math.round(58 + fundingApr * 0.35));
      perpHeadline = `CROWDED LONGS (+${fundingApr.toFixed(0)}% APR)`;
      perpEvidence = `Elevated long leverage on 24/7 perp • ${fmtCompactUsd(hl.dayNtlVlm)} 24h vol`;
    } else if (gapPct >= 1.2) {
      perpDir = 'bull';
      perpStrength = Math.min(82, Math.round(55 + gapPct * 4));
      perpHeadline = `24/7 BID +${gapPct.toFixed(2)}%`;
      perpEvidence = `Live HIP-3 orderbook strength • ${fmtCompactUsd(hl.dayNtlVlm)} 24h vol`;
    } else if (gapPct <= -1.2) {
      perpDir = 'bear';
      perpStrength = Math.min(82, Math.round(55 + Math.abs(gapPct) * 4));
      perpHeadline = `24/7 OFFER ${gapPct.toFixed(2)}%`;
      perpEvidence = `Live HIP-3 orderbook weakness • ${fmtCompactUsd(hl.dayNtlVlm)} 24h vol`;
    } else {
      perpDir = 'neutral';
      perpStrength = 44;
      perpHeadline = `24/7 LIVE (${fundingApr >= 0 ? '+' : ''}${fundingApr.toFixed(0)}% APR)`;
      perpEvidence = `${fmtCompactUsd(hl.dayNtlVlm)} 24h perp volume • balanced funding`;
    }
  }

  // =========================================================================
  // PILLAR 5: BREAKING NEWS SENTIMENT + EARNINGS / MACRO CATALYST RADAR
  // =========================================================================
  const liveImpliedMove = opt?.expectedMovePct ?? gex?.expectedMovePct ?? null;
  const catalystStatus = getTickerCatalystStatus(ticker, liveImpliedMove);
  const matchingNews = (input.articles ?? []).filter((a) =>
    a.tickers.includes(ticker),
  );
  const bullNews = matchingNews.filter((a) => a.sentiment === 'bull');
  const bearNews = matchingNews.filter((a) => a.sentiment === 'bear');

  let catDir: PillarDirection = 'neutral';
  let catStrength = 30;
  let catActive = false;
  let catHeadline = 'No immediate catalyst';
  let catEvidence = catalystStatus.nextMacro
    ? `Next macro: ${catalystStatus.nextMacro.shortLabel} ${catalystStatus.nextMacro.countdownLabel}`
    : 'Quiet catalyst tape';

  if (bullNews.length > 0 || bearNews.length > 0) {
    catActive = true;
    if (bullNews.length > bearNews.length) {
      catDir = 'bull';
      catStrength = Math.min(88, 58 + bullNews.length * 10);
      catHeadline = `BULLISH WIRE (${bullNews.length})`;
      catEvidence = bullNews[0].title;
    } else if (bearNews.length > bullNews.length) {
      catDir = 'bear';
      catStrength = Math.min(88, 58 + bearNews.length * 10);
      catHeadline = `BEARISH WIRE (${bearNews.length})`;
      catEvidence = bearNews[0].title;
    } else {
      catDir = 'neutral';
      catStrength = 50;
      catHeadline = `MIXED WIRE (${matchingNews.length})`;
      catEvidence = matchingNews[0].title;
    }
  } else if (catalystStatus.earnings && catalystStatus.earnings.daysUntil <= 21) {
    catActive = true;
    catDir = 'neutral';
    catStrength = catalystStatus.earnings.daysUntil <= 7 ? 78 : 58;
    catHeadline = `EARNINGS ${catalystStatus.earnings.countdownLabel}`;
    catEvidence = `${catalystStatus.earnings.quarterLabel} (${catalystStatus.earnings.timing}) • ±${catalystStatus.earnings.estImpliedMovePct.toFixed(1)}% implied move`;
  } else if (matchingNews.length > 0) {
    catActive = true;
    catDir = 'neutral';
    catStrength = 46;
    catHeadline = `${matchingNews.length} IN THE NEWS`;
    catEvidence = matchingNews[0].title;
  }

  const pillars: ConfluencePillar[] = [
    {
      id: 'tech',
      shortLabel: 'TECH',
      label: 'Technicals & Tape',
      direction: techDir,
      strength: techStrength,
      active: techActive,
      headline: techHeadline,
      evidence: techEvidence,
    },
    {
      id: 'whale',
      shortLabel: 'WHALE',
      label: 'Options Flow & GEX',
      direction: whaleDir,
      strength: whaleStrength,
      active: whaleActive,
      headline: whaleHeadline,
      evidence: whaleEvidence,
    },
    {
      id: 'insider',
      shortLabel: 'INSIDER',
      label: 'Congress, Form 4 & Squeeze',
      direction: insiderDir,
      strength: insiderStrength,
      active: insiderActive,
      headline: insiderHeadline,
      evidence: insiderEvidence,
    },
    {
      id: 'perp247',
      shortLabel: '24/7',
      label: '24/7 Perps & Funding',
      direction: perpDir,
      strength: perpStrength,
      active: perpActive,
      headline: perpHeadline,
      evidence: perpEvidence,
    },
    {
      id: 'catalyst',
      shortLabel: 'CATALYST',
      label: 'News, Earnings & Macro',
      direction: catDir,
      strength: catStrength,
      active: catActive,
      headline: catHeadline,
      evidence: catEvidence,
    },
  ];

  // Weighted directional fusion across active pillars
  const activeList = pillars.filter((p) => p.active);
  const bullPillars = activeList.filter((p) => p.direction === 'bull');
  const bearPillars = activeList.filter((p) => p.direction === 'bear');

  const bullPower = bullPillars.reduce((acc, p) => acc + p.strength, 0);
  const bearPower = bearPillars.reduce((acc, p) => acc + p.strength, 0);

  let bias: PillarDirection = 'neutral';
  let alignedCount = 0;

  if (bullPower > bearPower && bullPillars.length > 0) {
    bias = 'bull';
    alignedCount = bullPillars.length;
  } else if (bearPower > bullPower && bearPillars.length > 0) {
    bias = 'bear';
    alignedCount = bearPillars.length;
  }

  // Conviction score rewards BOTH average pillar strength AND multi-pillar agreement
  const dominant = bias === 'bull' ? bullPillars : bias === 'bear' ? bearPillars : [];
  const opposing = bias === 'bull' ? bearPillars : bias === 'bear' ? bullPillars : [];
  const avgDom =
    dominant.length > 0
      ? dominant.reduce((s, p) => s + p.strength, 0) / dominant.length
      : 40;
  const alignmentBonus = Math.max(0, alignedCount - 1) * 9;
  const conflictPenalty = opposing.length * 10;
  const rawScore = Math.round(avgDom * 0.78 + alignmentBonus - conflictPenalty + (activeList.length >= 3 ? 6 : 0));
  const score = Math.max(18, Math.min(98, rawScore));

  let verdict: ConfluenceVerdict = 'MIXED / CONFLICTING';
  if (bias === 'bull') {
    verdict =
      alignedCount >= 3 || score >= 76
        ? 'STRONG BULL CONFLUENCE'
        : 'BULLISH CONFLUENCE';
  } else if (bias === 'bear') {
    verdict =
      alignedCount >= 3 || score >= 76
        ? 'STRONG BEAR CONFLUENCE'
        : 'BEARISH CONFLUENCE';
  }

  // Rank top evidence bullets (aligned pillars first, then catalyst/warning)
  const topEvidence = [...activeList]
    .sort((a, b) => {
      const aMatch = a.direction === bias ? 1 : 0;
      const bMatch = b.direction === bias ? 1 : 0;
      if (aMatch !== bMatch) return bMatch - aMatch;
      return b.strength - a.strength;
    })
    .slice(0, 3)
    .map((p) => `${p.shortLabel}: ${p.headline}`);

  return {
    ticker,
    name,
    price,
    changePct,
    score,
    bias,
    verdict,
    alignedCount,
    activePillars: activeList.length,
    pillars,
    topEvidence,
    catalystStatus,
    isIpo: Boolean(curated?.isIpo || dir?.isIpo),
    isLive247: Boolean(hl),
  };
}

/**
 * Ranks the highest-conviction multi-signal setups across the entire market
 * by intersecting live Insiders/Squeeze filings, 24/7 Hyperliquid orderbooks,
 * breaking news sentiment, and upcoming Earnings catalysts.
 */
export function rankMarketConfluence(params: {
  ctxMap: Record<string, HlAssetCtx>;
  quoteMap: Record<string, MarketQuote>;
  directoryMap: Record<string, DirectoryEntry>;
  insidersBundle: InsidersBundle | null;
  optionsMap?: Record<string, TickerOptionsSummary>;
  articles: NewsArticle[];
  limit?: number;
}): ConfluenceReport[] {
  const {
    ctxMap,
    quoteMap,
    directoryMap,
    insidersBundle,
    optionsMap = {},
    articles,
    limit = 12,
  } = params;

  const candidates = new Set<string>([
    'ANT',
    'NVDA',
    'SPCX',
    'TSLA',
    'PLTR',
    'MSFT',
    'META',
    'AMZN',
    'GOOGL',
    'AMD',
    'AVGO',
    'CRWD',
    'COIN',
    'CRWV',
    'SKHY',
  ]);

  for (const sym of Object.keys(optionsMap)) {
    candidates.add(sym);
  }

  if (insidersBundle) {
    for (const c of insidersBundle.congress.slice(0, 35)) candidates.add(c.ticker);
    for (const f of insidersBundle.form4.slice(0, 35)) candidates.add(f.ticker);
    for (const s of insidersBundle.squeeze.slice(0, 30)) {
      if (s.squeezeScore >= 52) candidates.add(s.ticker);
    }
  }

  for (const a of articles.slice(0, 20)) {
    for (const t of a.tickers.slice(0, 2)) candidates.add(t);
  }

  const reports: ConfluenceReport[] = [];
  for (const sym of candidates) {
    if (!sym || sym === 'XYZ100' || sym === 'SP500' || sym.length > 6) continue;
    const report = computeTickerConfluence({
      ticker: sym,
      hlCtx: ctxMap[sym] ?? null,
      quote: quoteMap[sym] ?? null,
      directoryEntry: directoryMap[sym] ?? null,
      insidersBundle,
      optionsSummary: optionsMap[sym] ?? null,
      articles,
    });
    if (report.activePillars >= 2) {
      reports.push(report);
    }
  }

  reports.sort((a, b) => {
    if (b.alignedCount !== a.alignedCount) return b.alignedCount - a.alignedCount;
    if (b.score !== a.score) return b.score - a.score;
    return b.activePillars - a.activePillars;
  });

  return reports.slice(0, limit);
}
