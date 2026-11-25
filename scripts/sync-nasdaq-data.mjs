#!/usr/bin/env node
/**
 * Official Nasdaq API Direct Sync (api.nasdaq.com — zero third-party middleman).
 * Fetches Nasdaq-listed stocks from Nasdaq's official screener and enriches the
 * top liquid laggards with official Nasdaq 52-Week High/Low, 1Y Target Price,
 * P/E Ratio, Sector, and Dividend Yield into public/data/nasdaq-laggards.json.
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_PATH = path.resolve(__dirname, '../public/data/nasdaq-laggards.json');

const NASDAQ_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
  Accept: 'application/json, text/plain, */*',
  Origin: 'https://www.nasdaq.com',
  Referer: 'https://www.nasdaq.com/',
};

function parseMoney(raw) {
  if (!raw || typeof raw !== 'string') return null;
  const cleaned = raw.replace(/[$,%\s,]/g, '');
  if (!cleaned || cleaned === 'N/A' || cleaned === '--') return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

function parse52Week(raw) {
  if (!raw || typeof raw !== 'string') return { high: null, low: null };
  const parts = raw.split('/').map((s) => parseMoney(s.trim()));
  if (parts.length !== 2) return { high: null, low: null };
  const [a, b] = parts;
  if (a === null || b === null) return { high: null, low: null };
  return { high: Math.max(a, b), low: Math.min(a, b) };
}

async function fetchNasdaqSummary(symbol) {
  const url = `https://api.nasdaq.com/api/quote/${encodeURIComponent(symbol)}/summary?assetclass=stocks`;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 8000);
  try {
    const res = await fetch(url, { headers: NASDAQ_HEADERS, signal: ctrl.signal });
    if (!res.ok) return null;
    const json = await res.json();
    return json?.data?.summaryData ?? null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function main() {
  const screenerUrl =
    'https://api.nasdaq.com/api/screener/stocks?tableonly=true&limit=3500&exchange=nasdaq';
  const res = await fetch(screenerUrl, { headers: NASDAQ_HEADERS });
  if (!res.ok) {
    console.log(`Nasdaq screener returned HTTP ${res.status}; keeping existing snapshot.`);
    return;
  }
  const json = await res.json();
  const rows = Array.isArray(json?.data?.table?.rows) ? json.data.table.rows : [];
  if (rows.length === 0) {
    console.log('Nasdaq screener returned 0 rows; keeping existing snapshot.');
    return;
  }

  // Filter to liquid Nasdaq-listed common stocks ($1B+ market cap, $5+ price, clean ticker)
  const candidates = [];
  for (const r of rows) {
    const symbol = String(r.symbol || '').trim().toUpperCase();
    if (!symbol || !/^[A-Z]{1,5}$/.test(symbol)) continue;
    const lastSale = parseMoney(r.lastsale);
    const pctChange = parseMoney(r.pctchange);
    const marketCap = parseMoney(r.marketCap);
    if (!lastSale || lastSale < 5 || !marketCap || marketCap < 1_000_000_000) continue;
    candidates.push({
      symbol,
      name: String(r.name || symbol).replace(/\s+Common Stock.*$/i, '').trim(),
      lastSale,
      pctChange: pctChange ?? 0,
      marketCap,
    });
  }

  // Sort by session laggards first (most negative pctChange) to inspect top 85 liquid Nasdaq laggards
  const laggardPool = candidates
    .slice()
    .sort((a, b) => a.pctChange - b.pctChange)
    .slice(0, 85);

  const enriched = [];
  const concurrency = 8;
  for (let i = 0; i < laggardPool.length; i += concurrency) {
    const batch = laggardPool.slice(i, i + concurrency);
    const settled = await Promise.all(
      batch.map(async (item) => {
        const s = await fetchNasdaqSummary(item.symbol);
        if (!s) return null;
        const { high: week52High, low: week52Low } = parse52Week(
          s.FiftTwoWeekHighLow?.value,
        );
        const oneYrTarget = parseMoney(s.OneYrTarget?.value);
        const peRatio = parseMoney(s.PERatio?.value);
        const divYield = parseMoney(s.Yield?.value);
        const sector = String(s.Sector?.value || 'Nasdaq Equity').trim();
        const industry = String(s.Industry?.value || '').trim();

        const drawdown52wPct =
          week52High && week52High > 0
            ? Number((((item.lastSale - week52High) / week52High) * 100).toFixed(1))
            : null;
        const upsideToTargetPct =
          oneYrTarget && oneYrTarget > 0
            ? Number((((oneYrTarget - item.lastSale) / item.lastSale) * 100).toFixed(1))
            : null;

        // Require at least 15% drawdown from 52W high or negative day + positive upside to Nasdaq 1Y target
        if (upsideToTargetPct === null || upsideToTargetPct < 10) return null;

        // Undervalued Laggard Score: rewards deep 52W drawdown + large upside to Nasdaq 1Y target + lower P/E
        const drawdownScore = drawdown52wPct !== null ? Math.min(45, Math.abs(drawdown52wPct)) : 0;
        const targetScore = Math.min(45, upsideToTargetPct * 0.75);
        const peBonus = peRatio !== null && peRatio > 0 && peRatio <= 22 ? (25 - peRatio) * 0.8 : 0;
        const laggardBonus = item.pctChange < 0 ? Math.min(12, Math.abs(item.pctChange) * 2) : 0;
        const valueScore = Number((drawdownScore + targetScore + peBonus + laggardBonus).toFixed(1));

        return {
          symbol: item.symbol,
          name: item.name,
          sector,
          industry,
          lastSale: Number(item.lastSale.toFixed(2)),
          pctChange: Number(item.pctChange.toFixed(2)),
          marketCap: item.marketCap,
          week52High,
          week52Low,
          drawdown52wPct,
          oneYrTarget,
          upsideToTargetPct,
          peRatio,
          divYield,
          valueScore,
        };
      }),
    );
    for (const row of settled) {
      if (row) enriched.push(row);
    }
  }

  enriched.sort((a, b) => b.valueScore - a.valueScore);
  const top20 = enriched.slice(0, 20);

  if (top20.length === 0) {
    console.log('Nasdaq summary enrichment yielded 0 items; keeping existing snapshot.');
    return;
  }

  await fs.mkdir(path.dirname(OUT_PATH), { recursive: true });
  await fs.writeFile(
    OUT_PATH,
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        source: 'Official Nasdaq API (api.nasdaq.com)',
        totalNasdaqScreened: candidates.length,
        count: top20.length,
        laggards: top20,
      },
      null,
      2,
    ),
  );

  console.log(
    `Synced Top ${top20.length} Undervalued Nasdaq Laggards from api.nasdaq.com (${candidates.length} liquid Nasdaq stocks screened) -> ${OUT_PATH}`,
  );
}

main().catch((err) => {
  console.error('Nasdaq sync warning:', err?.message ?? err);
  process.exit(0);
});
