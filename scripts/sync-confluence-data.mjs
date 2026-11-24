#!/usr/bin/env node
/**
 * Zero-backend GitHub Actions pre-sync pipeline for aINVEST's 5-Pillar Confluence Engine
 * and Whale Flow Desk (Dealer GEX Profile, Gamma Walls, Max Pain & Unusual Options Flow).
 *
 * Strategy:
 *  1. Try Yahoo Finance v7 options (with fc.yahoo.com cookie + crumb, 100% reliable from Actions & VM)
 *     and/or CBOE delayed options chains.
 *  2. Compute Dealer GEX, Call/Put Walls, Zero-Gamma Flip, Max Pain, IV Term Structure,
 *     ATM Expected Move, and top Unusual Contracts.
 *  3. Write compact snapshots into:
 *     - public/data/confluence-options.json (32 tickers for 5-Pillar Confluence & Screener)
 *     - public/data/whale-flow-snapshot.json (full GEX profiles + UOA contracts for Whale Flow Desk & War Rooms)
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CONFLUENCE_OUT = path.resolve(__dirname, '../public/data/confluence-options.json');
const WHALE_OUT = path.resolve(__dirname, '../public/data/whale-flow-snapshot.json');

const WHALE_LEADERS = [
  'SPY',
  'QQQ',
  'NVDA',
  'TSLA',
  'AAPL',
  'MSFT',
  'META',
  'AMZN',
  'AMD',
  'PLTR',
];

const WATCHED_TICKERS = [
  ...WHALE_LEADERS,
  'AVGO',
  'COIN',
  'NFLX',
  'CRWD',
  'MU',
  'ARM',
  'JPM',
  'GS',
  'ORCL',
  'CRM',
  'ADBE',
  'SNOW',
  'NKE',
  'SMCI',
  'MSTR',
  'HOOD',
  'SOFI',
  'CRWV',
  'DIS',
];

const OCC_RE = /^([A-Z.]+?)(\d{2})(\d{2})(\d{2})([CP])(\d{8})$/;
const SQRT_2PI = Math.sqrt(2 * Math.PI);

function parseOcc(raw) {
  const m = OCC_RE.exec(String(raw || '').trim().toUpperCase());
  if (!m) return null;
  const [, , yy, mm, dd, cp, strikeRaw] = m;
  return {
    expiration: `20${yy}-${mm}-${dd}`,
    type: cp === 'C' ? 'CALL' : 'PUT',
    strike: Number(strikeRaw) / 1000,
  };
}

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function daysUntil(iso) {
  const ms = Date.parse(`${iso}T20:00:00Z`);
  if (!Number.isFinite(ms)) return 999;
  return Math.max(0, Math.ceil((ms - Date.now()) / 86_400_000));
}

function normCdf(x) {
  if (x < -8) return 0;
  if (x > 8) return 1;
  const sign = x < 0 ? -1 : 1;
  const absX = Math.abs(x) / Math.SQRT2;
  const t = 1 / (1 + 0.3275911 * absX);
  const poly =
    t *
    (0.254829592 +
      t * (-0.284496736 + t * (1.421413741 + t * (-1.453152027 + t * 1.061405429))));
  const erf = 1 - poly * Math.exp(-absX * absX);
  return 0.5 * (1 + sign * erf);
}

function bsGreeks(type, spot, strike, dte, ivDec) {
  const safeSpot = Math.max(0.01, spot);
  const safeStrike = Math.max(0.01, strike);
  const T = Math.max(1 / 365, dte / 365);
  const iv = Math.max(0.08, Math.min(3.5, ivDec > 0.01 ? ivDec : 0.35));
  const r = 0.045;
  const sqrtT = Math.sqrt(T);
  const d1 = (Math.log(safeSpot / safeStrike) + (r + 0.5 * iv * iv) * T) / (iv * sqrtT);
  const pdf = Math.exp(-0.5 * d1 * d1) / SQRT_2PI;
  const delta = type === 'CALL' ? normCdf(d1) : normCdf(d1) - 1;
  const gamma = pdf / (safeSpot * iv * sqrtT);
  return {
    delta: Number(delta.toFixed(2)),
    gamma: Number(gamma.toFixed(4)),
  };
}

function computeMaxPain(contracts) {
  if (contracts.length === 0) return { strike: null, expiration: null };
  const byExp = new Map();
  for (const c of contracts) {
    if (c.openInterest <= 0) continue;
    const arr = byExp.get(c.expiration) ?? [];
    arr.push(c);
    byExp.set(c.expiration, arr);
  }
  const sortedExps = [...byExp.keys()].sort();
  let targetExp = null;
  let bestList = [];
  for (const exp of sortedExps) {
    const list = byExp.get(exp) ?? [];
    const totalOi = list.reduce((acc, item) => acc + item.openInterest, 0);
    if (totalOi >= 500 || bestList.length === 0) {
      targetExp = exp;
      bestList = list;
      if (totalOi >= 500) break;
    }
  }
  if (!targetExp || bestList.length === 0) return { strike: null, expiration: null };
  const strikes = [...new Set(bestList.map((c) => c.strike))].sort((a, b) => a - b);
  let bestStrike = strikes[0] ?? null;
  let minPayout = Infinity;
  for (const testStrike of strikes) {
    let payout = 0;
    for (const c of bestList) {
      if (c.type === 'CALL' && testStrike > c.strike) {
        payout += (testStrike - c.strike) * c.openInterest;
      } else if (c.type === 'PUT' && testStrike < c.strike) {
        payout += (c.strike - testStrike) * c.openInterest;
      }
    }
    if (payout < minPayout) {
      minPayout = payout;
      bestStrike = testStrike;
    }
  }
  return { strike: bestStrike, expiration: targetExp };
}

function analyzeNormalizedChain(ticker, spotPrice, rawContracts, source = 'cboe') {
  if (!spotPrice || spotPrice <= 0 || rawContracts.length === 0) return null;

  let callVolume = 0;
  let putVolume = 0;
  let callPremiumUsd = 0;
  let putPremiumUsd = 0;
  const contracts = [];
  const byStrike = new Map();
  const gexScale = spotPrice * spotPrice;
  let totalNetGexUsd = 0;

  for (const row of rawContracts) {
    const occ = parseOcc(row.option);
    if (!occ) continue;
    const volume = num(row.volume);
    const openInterest = num(row.openInterest);
    if (volume <= 0 && openInterest <= 0) continue;

    const bid = num(row.bid);
    const ask = num(row.ask);
    const last = num(row.lastPrice);
    const mark =
      bid > 0 && ask > 0 ? (bid + ask) / 2 : last > 0 ? last : Math.max(bid, ask);
    const dte = daysUntil(occ.expiration);
    const ivRaw = num(row.iv);
    const ivDec = ivRaw > 5 ? ivRaw / 100 : ivRaw;
    const ivPct =
      ivDec > 0.005 ? Number((ivDec * 100).toFixed(1)) : null;

    const greeks =
      row.gamma && row.gamma > 0 && row.delta != null
        ? { delta: Number(num(row.delta).toFixed(2)), gamma: Number(num(row.gamma).toFixed(4)) }
        : bsGreeks(occ.type, spotPrice, occ.strike, dte, ivDec);

    const volOiRatio =
      openInterest > 0 ? volume / openInterest : volume >= 50 ? volume / 10 : 0;
    const estPremiumUsd = volume * mark * 100;

    if (occ.type === 'CALL') {
      callVolume += volume;
      callPremiumUsd += estPremiumUsd;
    } else {
      putVolume += volume;
      putPremiumUsd += estPremiumUsd;
    }

    if (dte <= 90 && openInterest > 0) {
      const gex = greeks.gamma * openInterest * gexScale;
      const bucket = byStrike.get(occ.strike) ?? {
        strike: occ.strike,
        callGex: 0,
        putGex: 0,
        netGex: 0,
        callOi: 0,
        putOi: 0,
        callVol: 0,
        putVol: 0,
        callIv: null,
        putIv: null,
      };
      if (occ.type === 'CALL') {
        bucket.callGex += gex;
        bucket.netGex += gex;
        bucket.callOi += openInterest;
        bucket.callVol += volume;
        if (ivPct && (bucket.callIv === null || openInterest > 10)) bucket.callIv = ivPct;
        totalNetGexUsd += gex;
      } else {
        bucket.putGex -= gex;
        bucket.netGex -= gex;
        bucket.putOi += openInterest;
        bucket.putVol += volume;
        if (ivPct && (bucket.putIv === null || openInterest > 10)) bucket.putIv = ivPct;
        totalNetGexUsd -= gex;
      }
      byStrike.set(occ.strike, bucket);
    }

    const distPct = Math.abs(occ.strike - spotPrice) / spotPrice;
    const moneyness =
      distPct <= 0.015
        ? 'ATM'
        : occ.type === 'CALL'
          ? occ.strike < spotPrice
            ? 'ITM'
            : 'OTM'
          : occ.strike > spotPrice
            ? 'ITM'
            : 'OTM';

    const tags = [];
    if (volOiRatio >= 2 && volume >= 75) tags.push('VOL>OI');
    if (estPremiumUsd >= 250_000) tags.push('MEGA');
    else if (estPremiumUsd >= 50_000) tags.push('WHALE');
    if (dte <= 7 && volume >= 100) tags.push('0-7 DTE');
    if (moneyness === 'OTM' && volOiRatio >= 2.5 && estPremiumUsd >= 25_000) {
      tags.push('OTM SWEEP');
    }

    const unusualScore =
      (estPremiumUsd >= 10_000 ? Math.log10(estPremiumUsd) * 14 : 0) +
      Math.min(45, volOiRatio * 9) +
      (dte <= 14 ? 8 : 0) +
      (moneyness === 'OTM' && volume >= 100 ? 6 : 0);

    contracts.push({
      id: `${ticker}-${row.option}`,
      ticker,
      contract: `${occ.expiration.slice(5)} $${occ.strike}${occ.type === 'CALL' ? 'C' : 'P'}`,
      type: occ.type,
      expiration: occ.expiration,
      dte,
      strike: occ.strike,
      spotPrice,
      bid,
      ask,
      mark: Number(mark.toFixed(2)),
      volume,
      openInterest,
      volOiRatio: Number(volOiRatio.toFixed(2)),
      estPremiumUsd: Math.round(estPremiumUsd),
      iv: ivPct,
      delta: greeks.delta,
      gamma: greeks.gamma,
      moneyness,
      unusualScore: Number(unusualScore.toFixed(1)),
      tags,
    });
  }

  if (contracts.length === 0) return null;

  const allLevels = [...byStrike.values()].sort((a, b) => a.strike - b.strike);
  const callWallLevel =
    allLevels
      .filter((l) => l.strike >= spotPrice * 0.96 && l.callGex > 0)
      .sort((a, b) => b.callGex - a.callGex)[0] ?? null;
  const putWallLevel =
    allLevels
      .filter((l) => l.strike <= spotPrice * 1.04 && l.putGex < 0)
      .sort((a, b) => a.putGex - b.putGex)[0] ?? null;

  let gammaFlip = null;
  let bestFlipDist = Infinity;
  for (let i = 1; i < allLevels.length; i += 1) {
    const prev = allLevels[i - 1];
    const curr = allLevels[i];
    if ((prev.netGex < 0 && curr.netGex > 0) || (prev.netGex > 0 && curr.netGex < 0)) {
      const denom = Math.abs(prev.netGex) + Math.abs(curr.netGex);
      const frac = denom > 0 ? Math.abs(prev.netGex) / denom : 0.5;
      const cross = Number((prev.strike + (curr.strike - prev.strike) * frac).toFixed(2));
      const dist = Math.abs(cross - spotPrice);
      if (dist < bestFlipDist) {
        bestFlipDist = dist;
        gammaFlip = cross;
      }
    }
  }

  const localStrikes = allLevels.filter(
    (l) => l.strike >= spotPrice * 0.85 && l.strike <= spotPrice * 1.15,
  );
  const gexProfile = (localStrikes.length >= 6 ? localStrikes : allLevels)
    .slice()
    .sort(
      (a, b) =>
        Math.abs(b.callGex) +
        Math.abs(b.putGex) +
        (b.callOi + b.putOi) * 10 -
        (Math.abs(a.callGex) + Math.abs(a.putGex) + (a.callOi + a.putOi) * 10),
    )
    .slice(0, 16)
    .sort((a, b) => b.strike - a.strike)
    .map((l) => ({
      ...l,
      callGex: Math.round(l.callGex),
      putGex: Math.round(l.putGex),
      netGex: Math.round(l.netGex),
    }));

  const byExp = new Map();
  for (const c of contracts) {
    const arr = byExp.get(c.expiration) ?? [];
    arr.push(c);
    byExp.set(c.expiration, arr);
  }
  const sortedExps = [...byExp.keys()].sort();
  let expectedMoveUsd = null;
  let expectedMovePct = null;
  let expectedMoveExp = null;
  const ivTermStructure = [];

  for (const exp of sortedExps) {
    const list = byExp.get(exp) ?? [];
    const calls = list.filter((c) => c.type === 'CALL' && (c.mark > 0 || c.iv !== null));
    const puts = list.filter((c) => c.type === 'PUT' && (c.mark > 0 || c.iv !== null));
    if (calls.length === 0 || puts.length === 0) continue;
    const atmCall = calls.reduce((best, cur) =>
      Math.abs(cur.strike - spotPrice) < Math.abs(best.strike - spotPrice) ? cur : best,
    );
    const atmPut = puts.reduce((best, cur) =>
      Math.abs(cur.strike - atmCall.strike) < Math.abs(best.strike - atmCall.strike)
        ? cur
        : best,
    );
    if (
      expectedMoveUsd === null &&
      atmCall.mark > 0 &&
      atmPut.mark > 0 &&
      Math.abs(atmCall.strike - spotPrice) / spotPrice <= 0.08
    ) {
      const move = Number(((atmCall.mark + atmPut.mark) * 0.85).toFixed(2));
      if (move > 0) {
        expectedMoveUsd = move;
        expectedMovePct = Number(((move / spotPrice) * 100).toFixed(1));
        expectedMoveExp = exp;
      }
    }
    const ivVals = [atmCall.iv, atmPut.iv].filter((v) => v !== null && v > 0);
    if (ivVals.length > 0 && ivTermStructure.length < 5) {
      const avgIv = ivVals.reduce((a, b) => a + b, 0) / ivVals.length;
      ivTermStructure.push({
        expiration: exp,
        dte: atmCall.dte,
        atmIv: Number(avgIv.toFixed(1)),
      });
    }
  }

  const targetPutStrike = spotPrice * 0.95;
  const targetCallStrike = spotPrice * 1.05;
  const otmPutIvLevel = allLevels
    .filter((l) => l.putIv !== null && l.strike <= spotPrice)
    .sort((a, b) => Math.abs(a.strike - targetPutStrike) - Math.abs(b.strike - targetPutStrike))[0];
  const otmCallIvLevel = allLevels
    .filter((l) => l.callIv !== null && l.strike >= spotPrice)
    .sort((a, b) => Math.abs(a.strike - targetCallStrike) - Math.abs(b.strike - targetCallStrike))[0];
  const ivSkewPct =
    otmPutIvLevel?.putIv != null && otmCallIvLevel?.callIv != null
      ? Number((otmPutIvLevel.putIv - otmCallIvLevel.callIv).toFixed(1))
      : null;

  const netPremiumUsd = callPremiumUsd - putPremiumUsd;
  const totalPrem = callPremiumUsd + putPremiumUsd;
  const putCallVolRatio = callVolume > 0 ? Number((putVolume / callVolume).toFixed(2)) : 1;

  let flowBias = 'NEUTRAL';
  if (totalPrem > 0) {
    const callShare = callPremiumUsd / totalPrem;
    if (callShare >= 0.56) flowBias = 'BULLISH';
    else if (callShare <= 0.44) flowBias = 'BEARISH';
  }

  const netGammaRegime =
    totalNetGexUsd >= 5_000_000
      ? 'PIN (+GEX)'
      : totalNetGexUsd <= -5_000_000
        ? 'VOLATILE (-GEX)'
        : 'NEUTRAL';

  const unusualContracts = contracts
    .filter((c) => c.estPremiumUsd >= 10_000 || (c.volume >= 100 && c.volOiRatio >= 1.5))
    .sort((a, b) => b.unusualScore - a.unusualScore)
    .slice(0, 12);

  const maxPain = computeMaxPain(contracts);

  return {
    ticker,
    spotPrice: Number(spotPrice.toFixed(2)),
    updatedAt: Date.now(),
    callVolume,
    putVolume,
    putCallVolRatio,
    callPremiumUsd: Math.round(callPremiumUsd),
    putPremiumUsd: Math.round(putPremiumUsd),
    netPremiumUsd: Math.round(netPremiumUsd),
    flowBias,
    maxPainStrike: maxPain.strike,
    maxPainExpiration: maxPain.expiration,
    netGammaRegime,
    netGexUsd: Math.round(totalNetGexUsd),
    callWall: callWallLevel?.strike ?? null,
    putWall: putWallLevel?.strike ?? null,
    gammaFlip,
    expectedMoveUsd,
    expectedMovePct,
    expectedMoveExp,
    ivSkewPct,
    gexProfile,
    ivTermStructure,
    unusualContracts,
    source,
  };
}

async function getYahooAuth() {
  try {
    const r1 = await fetch('https://fc.yahoo.com', {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
    });
    const setCookie = r1.headers.get('set-cookie') || '';
    const cookie = setCookie.split(';')[0];
    if (!cookie) return null;
    const r2 = await fetch('https://query1.finance.yahoo.com/v1/test/getcrumb', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        Cookie: cookie,
      },
    });
    if (!r2.ok) return null;
    const crumb = (await r2.text()).trim();
    if (!crumb) return null;
    return { cookie, crumb };
  } catch {
    return null;
  }
}

async function fetchYahooOptionsForTicker(ticker, auth, isLeader) {
  try {
    const base = `https://query1.finance.yahoo.com/v7/finance/options/${encodeURIComponent(ticker)}?crumb=${encodeURIComponent(auth.crumb)}`;
    const r1 = await fetch(base, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        Cookie: auth.cookie,
      },
    });
    if (!r1.ok) return null;
    const j1 = await r1.json();
    const res1 = j1?.optionChain?.result?.[0];
    if (!res1) return null;

    const spotPrice = num(res1.quote?.regularMarketPrice) || num(res1.quote?.postMarketPrice);
    if (spotPrice <= 0) return null;

    const rawContracts = [];
    const pushBucket = (optBucket) => {
      if (!optBucket) return;
      for (const c of [...(optBucket.calls || []), ...(optBucket.puts || [])]) {
        rawContracts.push({
          option: c.contractSymbol,
          volume: c.volume,
          openInterest: c.openInterest,
          bid: c.bid,
          ask: c.ask,
          lastPrice: c.lastPrice,
          iv: c.impliedVolatility,
        });
      }
    };

    pushBucket(res1.options?.[0]);

    // For WHALE_LEADERS, fetch up to 3 additional near-term expirations for richer GEX + IV Term Structure
    const exps = Array.isArray(res1.expirationDates) ? res1.expirationDates.slice(1, 4) : [];
    if (isLeader && exps.length > 0) {
      const extra = await Promise.all(
        exps.map(async (ts) => {
          try {
            const r = await fetch(`${base}&date=${ts}`, {
              headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                Cookie: auth.cookie,
              },
            });
            if (!r.ok) return null;
            const j = await r.json();
            return j?.optionChain?.result?.[0]?.options?.[0] ?? null;
          } catch {
            return null;
          }
        }),
      );
      for (const b of extra) pushBucket(b);
    }

    return analyzeNormalizedChain(ticker, spotPrice, rawContracts, 'cboe');
  } catch {
    return null;
  }
}

async function main() {
  const summaries = {};
  const leaderSet = new Set(WHALE_LEADERS);
  const auth = await getYahooAuth();

  if (auth) {
    const concurrency = 5;
    for (let i = 0; i < WATCHED_TICKERS.length; i += concurrency) {
      const batch = WATCHED_TICKERS.slice(i, i + concurrency);
      const settled = await Promise.all(
        batch.map((t) => fetchYahooOptionsForTicker(t, auth, leaderSet.has(t))),
      );
      for (const item of settled) {
        if (item) {
          summaries[item.ticker] = item;
        }
      }
    }
  } else {
    console.log('Yahoo options auth unavailable; skipping options sync.');
  }

  const count = Object.keys(summaries).length;
  if (count === 0) {
    console.log('Options sync returned 0 chains; keeping existing snapshots.');
    return;
  }

  // 1. Write compact Confluence Options summary (32 tickers)
  const confluenceTickers = {};
  for (const [sym, s] of Object.entries(summaries)) {
    confluenceTickers[sym] = {
      ticker: s.ticker,
      spotPrice: s.spotPrice,
      callVolume: s.callVolume,
      putVolume: s.putVolume,
      putCallVolRatio: s.putCallVolRatio,
      callPremiumUsd: s.callPremiumUsd,
      putPremiumUsd: s.putPremiumUsd,
      netPremiumUsd: s.netPremiumUsd,
      flowBias: s.flowBias,
      netGammaRegime: s.netGammaRegime,
      netGexUsd: s.netGexUsd,
      callWall: s.callWall,
      putWall: s.putWall,
      expectedMovePct: s.expectedMovePct,
      expectedMoveExp: s.expectedMoveExp,
    };
  }

  const generatedAt = new Date().toISOString();
  await fs.mkdir(path.dirname(CONFLUENCE_OUT), { recursive: true });
  await fs.writeFile(
    CONFLUENCE_OUT,
    JSON.stringify(
      {
        generatedAt,
        source: 'Yahoo Finance Options Chains + Black-Scholes GEX',
        count,
        tickers: confluenceTickers,
      },
      null,
      2,
    ),
  );

  // 2. Write full Whale Flow snapshot (GEX profiles, IV Term Structure, UOA hot contracts)
  const leaderSummaries = WHALE_LEADERS.map((t) => summaries[t]).filter(Boolean);
  const allHot = Object.values(summaries)
    .flatMap((s) => s.unusualContracts.slice(0, 6))
    .sort((a, b) => b.unusualScore - a.unusualScore)
    .slice(0, 48);

  await fs.writeFile(
    WHALE_OUT,
    JSON.stringify(
      {
        generatedAt,
        source: 'Yahoo Finance Options Chains + Black-Scholes GEX',
        summaries: leaderSummaries,
        allTickers: summaries,
        hotContracts: allHot,
      },
      null,
      2,
    ),
  );

  console.log(
    `Synced ${count}/${WATCHED_TICKERS.length} options/GEX snapshots (${allHot.length} UOA contracts) -> confluence-options.json & whale-flow-snapshot.json`,
  );
}

main().catch((err) => {
  console.error('Options sync warning:', err?.message ?? err);
  process.exit(0);
});
