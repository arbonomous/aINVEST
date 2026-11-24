#!/usr/bin/env node
/**
 * Zero-backend GitHub Actions pre-sync pipeline for aINVEST's 5-Pillar Confluence Engine.
 * Fetches public CBOE delayed options chains for 32 major US stocks, ETFs & IPOs
 * and computes compact Dealer GEX, Call/Put Walls, Flow Bias & ATM Expected Move snapshots
 * into public/data/confluence-options.json (~10 KB).
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_PATH = path.resolve(__dirname, '../public/data/confluence-options.json');

const WATCHED_TICKERS = [
  'SPY',
  'QQQ',
  'NVDA',
  'TSLA',
  'AAPL',
  'MSFT',
  'META',
  'AMZN',
  'GOOGL',
  'AMD',
  'PLTR',
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
  'ANT',
  'SPCX',
  'DIS',
];

const OCC_RE = /^([A-Z.]+?)(\d{2})(\d{2})(\d{2})([CP])(\d{8})$/;

function parseOcc(raw) {
  const m = OCC_RE.exec(String(raw || '').trim());
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
  const ms = Date.parse(`${iso}T16:00:00-05:00`);
  if (!Number.isFinite(ms)) return 999;
  return Math.max(0, Math.round((ms - Date.now()) / 86_400_000));
}

function analyzeChain(ticker, payload) {
  const dataObj = payload?.data;
  const rawOptions = Array.isArray(dataObj?.options) ? dataObj.options : [];
  if (rawOptions.length === 0) return null;

  const spotPrice = num(dataObj.current_price) || num(dataObj.close);
  if (spotPrice <= 0) return null;

  let callVolume = 0;
  let putVolume = 0;
  let callPremiumUsd = 0;
  let putPremiumUsd = 0;
  let totalNetGexUsd = 0;

  const gexScale = spotPrice * spotPrice;
  const byStrike = new Map();
  const nearAtm = new Map(); // expiration -> { dte, callMark, putMark, callDist, putDist }

  for (const row of rawOptions) {
    const occ = parseOcc(row.option);
    if (!occ) continue;

    const volume = num(row.volume);
    const oi = num(row.open_interest);
    if (volume <= 0 && oi <= 0) continue;

    const bid = num(row.bid);
    const ask = num(row.ask);
    const last = num(row.last_trade_price);
    const mark = bid > 0 && ask > 0 ? (bid + ask) / 2 : last > 0 ? last : Math.max(bid, ask);
    const gamma = num(row.gamma);
    const dte = daysUntil(occ.expiration);
    const estPrem = volume * mark * 100;

    if (occ.type === 'CALL') {
      callVolume += volume;
      callPremiumUsd += estPrem;
    } else {
      putVolume += volume;
      putPremiumUsd += estPrem;
    }

    if (dte <= 90 && oi > 0) {
      const rawG =
        gamma > 0
          ? gamma
          : 0.015 / Math.max(1, (Math.abs(occ.strike - spotPrice) / spotPrice) * 18 + 1);
      const gex = rawG * oi * gexScale;
      const bucket = byStrike.get(occ.strike) ?? { callGex: 0, putGex: 0 };
      if (occ.type === 'CALL') {
        bucket.callGex += gex;
        totalNetGexUsd += gex;
      } else {
        bucket.putGex += gex;
        totalNetGexUsd -= gex;
      }
      byStrike.set(occ.strike, bucket);
    }

    if (dte >= 1 && dte <= 18 && mark > 0) {
      const dist = Math.abs(occ.strike - spotPrice);
      const cur = nearAtm.get(occ.expiration) ?? {
        dte,
        callMark: 0,
        putMark: 0,
        callDist: Infinity,
        putDist: Infinity,
      };
      if (occ.type === 'CALL' && dist < cur.callDist) {
        cur.callDist = dist;
        cur.callMark = mark;
      } else if (occ.type === 'PUT' && dist < cur.putDist) {
        cur.putDist = dist;
        cur.putMark = mark;
      }
      nearAtm.set(occ.expiration, cur);
    }
  }

  let callWall = null;
  let maxCallGex = 0;
  let putWall = null;
  let maxPutGex = 0;

  for (const [strike, b] of byStrike.entries()) {
    if (strike >= spotPrice * 0.96 && b.callGex > maxCallGex) {
      maxCallGex = b.callGex;
      callWall = strike;
    }
    if (strike <= spotPrice * 1.04 && b.putGex > maxPutGex) {
      maxPutGex = b.putGex;
      putWall = strike;
    }
  }

  // ATM straddle expected move for nearest expiration
  let expectedMovePct = null;
  let expectedMoveExp = null;
  const sortedExps = [...nearAtm.entries()]
    .filter(([, v]) => v.callMark > 0 && v.putMark > 0)
    .sort((a, b) => a[1].dte - b[1].dte);

  if (sortedExps.length > 0) {
    const [exp, best] = sortedExps[0];
    const straddle = (best.callMark + best.putMark) * 0.85;
    expectedMovePct = Number(((straddle / spotPrice) * 100).toFixed(1));
    expectedMoveExp = exp;
  }

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

  return {
    ticker,
    spotPrice: Number(spotPrice.toFixed(2)),
    callVolume,
    putVolume,
    putCallVolRatio,
    callPremiumUsd: Math.round(callPremiumUsd),
    putPremiumUsd: Math.round(putPremiumUsd),
    netPremiumUsd: Math.round(netPremiumUsd),
    flowBias,
    netGammaRegime,
    netGexUsd: Math.round(totalNetGexUsd),
    callWall,
    putWall,
    expectedMovePct,
    expectedMoveExp,
  };
}

let loggedDiag = false;

async function fetchTickerCboe(ticker) {
  const url = `https://cdn.cboe.com/api/global/delayed_quotes/options/${encodeURIComponent(ticker)}.json`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 9000);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'aINVEST-Terminal/1.0 (+https://arbonomous.github.io/aINVEST/)',
        Accept: 'application/json',
      },
    });
    if (!res.ok) {
      if (!loggedDiag) {
        loggedDiag = true;
        console.log(`CBOE diagnostic (${ticker}): HTTP ${res.status}`);
      }
      return null;
    }
    const json = await res.json();
    return analyzeChain(ticker, json);
  } catch (err) {
    if (!loggedDiag) {
      loggedDiag = true;
      console.log(`CBOE diagnostic (${ticker}): ${err?.message ?? err}`);
    }
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function main() {
  const results = {};
  const concurrency = 6;

  for (let i = 0; i < WATCHED_TICKERS.length; i += concurrency) {
    const batch = WATCHED_TICKERS.slice(i, i + concurrency);
    const settled = await Promise.all(batch.map((t) => fetchTickerCboe(t)));
    for (const item of settled) {
      if (item) {
        results[item.ticker] = item;
      }
    }
  }

  const count = Object.keys(results).length;
  // Preserve previous snapshot if network fetch yielded zero chains (fail-safe)
  if (count === 0) {
    try {
      await fs.access(OUT_PATH);
      console.log('CBOE sync returned 0 chains; keeping existing snapshot.');
      return;
    } catch {
      // Write empty shell if no prior file exists
    }
  }

  const payload = {
    generatedAt: new Date().toISOString(),
    source: 'CBOE Delayed Options Chains',
    count,
    tickers: results,
  };

  await fs.mkdir(path.dirname(OUT_PATH), { recursive: true });
  await fs.writeFile(OUT_PATH, JSON.stringify(payload, null, 2));
  console.log(`Synced ${count}/${WATCHED_TICKERS.length} CBOE options/GEX snapshots -> ${OUT_PATH}`);
}

main().catch((err) => {
  console.error('Confluence options sync warning:', err?.message ?? err);
  process.exit(0);
});
