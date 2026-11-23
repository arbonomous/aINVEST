#!/usr/bin/env node
/**
 * Free Automated Data Pipeline for aINVEST Insiders & Short Squeeze Desk.
 * Runs during scheduled GitHub Pages builds (zero API keys, zero bot commits).
 *
 * Merge-and-preserve policy:
 *  - Fetches official SEC EDGAR Form 4 XML filings (open-market P/S trades)
 *  - Fetches official FINRA Reg SHO Daily Short Sale Volume + SEC FTD ZIP
 *  - Fetches public Congressional STOCK Act disclosures
 *  - If any single source temporarily times out or rate-limits, retains the
 *    previous good snapshot for that pillar and never fails the build.
 */

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const BUNDLE_PATH = path.resolve(process.cwd(), 'public/data/insiders-bundle.json');
const SEC_HEADERS = {
  'User-Agent': 'aINVEST-Terminal/1.0 (https://arbonomous.github.io/aINVEST/; contact@ainvest.app)',
  Accept: 'application/xml, text/xml, application/atom+xml, application/json, text/plain, */*',
};

const PRIORITY_TICKERS = new Set([
  'ANT', 'SPCX', 'NVDA', 'TSLA', 'PLTR', 'MSFT', 'META', 'AAPL', 'GOOGL', 'AMZN',
  'AMD', 'AVGO', 'ARM', 'MU', 'INTC', 'SMCI', 'GME', 'COIN', 'CRWV', 'RDDT',
  'HOOD', 'JPM', 'GS', 'LLY', 'BA', 'SPY', 'QQQ', 'SKHY', 'CBRS', 'CRCL',
]);

async function fetchText(url, headers = {}, timeoutMs = 10000) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { headers, signal: ctrl.signal });
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function fetchBuffer(url, headers = {}, timeoutMs = 14000) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { headers, signal: ctrl.signal });
    if (!res.ok) return null;
    return Buffer.from(await res.arrayBuffer());
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function xmlTag(xml, tag) {
  const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i');
  const m = re.exec(xml);
  return m ? m[1].replace(/<[^>]+>/g, '').trim() : '';
}

function computeSqueezeScore(shortVolPct, shortExemptRatioPct, ftdUsd) {
  const signals = [];
  const shortPts = Math.max(0, Math.min(56, (shortVolPct - 32) * 1.45));
  if (shortVolPct >= 60) signals.push('SHORT VOL >60%');
  else if (shortVolPct >= 50) signals.push('SHORT VOL >50%');

  const exemptPts = Math.max(0, Math.min(26, shortExemptRatioPct * 6.5));
  if (shortExemptRatioPct >= 2.0) signals.push('REG SHO EXEMPT SPIKE');

  const ftdPts =
    ftdUsd >= 250_000
      ? Math.max(0, Math.min(26, (Math.log10(ftdUsd) - 5) * 9.5))
      : 0;
  if (ftdUsd >= 10_000_000) signals.push('FTD >$10M');
  else if (ftdUsd >= 2_000_000) signals.push('FTD >$2M');

  const squeezeScore = Math.round(
    Math.max(10, Math.min(99, shortPts + exemptPts + ftdPts)),
  );
  const regime =
    squeezeScore >= 80
      ? 'EXTREME'
      : squeezeScore >= 65
        ? 'HIGH'
        : squeezeScore >= 50
          ? 'ELEVATED'
          : 'NORMAL';
  if (signals.length === 0) signals.push('ACTIVE SHORT FLOW');
  return { squeezeScore, regime, signals: signals.slice(0, 3) };
}

/**
 * 1. Official SEC EDGAR Form 4 XML Sync
 */
async function syncSecForm4(existingForm4) {
  const atomUrl =
    'https://www.sec.gov/cgi-bin/browse-edgar?action=getcurrent&type=4&owner=only&count=80&output=atom';
  const atomXml = await fetchText(atomUrl, SEC_HEADERS, 12000);
  if (!atomXml) return null;

  const entryMatches = [...atomXml.matchAll(/<entry>([\s\S]*?)<\/entry>/gi)];
  const fresh = [];

  for (const match of entryMatches.slice(0, 36)) {
    const entry = match[1];
    const linkMatch = /href="(https:\/\/www\.sec\.gov\/Archives\/edgar\/data\/[^"]+)"/i.exec(entry);
    if (!linkMatch) continue;
    const indexUrl = linkMatch[1];
    const dirUrl = indexUrl.slice(0, indexUrl.lastIndexOf('/') + 1);

    const indexJsonText = await fetchText(`${dirUrl}index.json`, SEC_HEADERS, 6000);
    if (!indexJsonText) continue;

    let xmlName = null;
    try {
      const idx = JSON.parse(indexJsonText);
      const items = idx?.directory?.item ?? [];
      const candidate = items.find(
        (it) =>
          typeof it.name === 'string' &&
          it.name.toLowerCase().endsWith('.xml') &&
          !it.name.toLowerCase().includes('xsl') &&
          it.name.toLowerCase() !== 'filingsummary.xml',
      );
      xmlName = candidate?.name ?? null;
    } catch {
      continue;
    }
    if (!xmlName) continue;

    const formXml = await fetchText(`${dirUrl}${xmlName}`, SEC_HEADERS, 6000);
    if (!formXml || !formXml.includes('<ownershipDocument')) continue;

    const ticker = xmlTag(formXml, 'issuerTradingSymbol')
      .toUpperCase()
      .replace(/[^A-Z0-9.-]/g, '');
    if (!ticker || ticker === 'NONE' || ticker.length > 6) continue;

    const companyName = xmlTag(formXml, 'issuerName') || ticker;
    const insiderName = xmlTag(formXml, 'rptOwnerName') || 'Insider';
    const officerTitle = xmlTag(formXml, 'officerTitle');
    const isDirector = xmlTag(formXml, 'isDirector') === '1' || xmlTag(formXml, 'isDirector').toLowerCase() === 'true';
    const isTenPct = xmlTag(formXml, 'isTenPercentOwner') === '1';
    const role = officerTitle || (isDirector ? 'Director' : isTenPct ? '10% Owner' : 'Insider');
    const isCsuite = /\b(ceo|cfo|coo|cto|president|chief|evp|svp)\b/i.test(role);
    const filedDate = (xmlTag(formXml, 'periodOfReport') || new Date().toISOString().slice(0, 10)).slice(0, 10);

    const txBlocks = [
      ...formXml.matchAll(/<nonDerivativeTransaction>([\s\S]*?)<\/nonDerivativeTransaction>/gi),
    ];
    let buyShares = 0;
    let buyUsd = 0;
    let sellShares = 0;
    let sellUsd = 0;
    let latestTradeDate = filedDate;

    for (const tb of txBlocks) {
      const block = tb[1];
      const code = xmlTag(block, 'transactionCode').toUpperCase();
      if (code !== 'P' && code !== 'S') continue;
      const shares = Number(xmlTag(xmlTag(block, 'transactionShares'), 'value'));
      const price = Number(xmlTag(xmlTag(block, 'transactionPricePerShare'), 'value'));
      const tDate = xmlTag(xmlTag(block, 'transactionDate'), 'value');
      if (tDate && tDate.length >= 10) latestTradeDate = tDate.slice(0, 10);
      if (!Number.isFinite(shares) || shares <= 0 || !Number.isFinite(price) || price <= 0) {
        continue;
      }
      if (code === 'P') {
        buyShares += shares;
        buyUsd += shares * price;
      } else {
        sellShares += shares;
        sellUsd += shares * price;
      }
    }

    if (buyShares > 0 && buyUsd >= 25_000) {
      fresh.push({
        id: `sec-${ticker}-${insiderName.replace(/\s+/g, '')}-${latestTradeDate}-B`,
        ticker,
        companyName,
        insiderName,
        role,
        isCsuite,
        action: 'BUY',
        shares: Math.round(buyShares),
        price: Number((buyUsd / buyShares).toFixed(2)),
        valueUsd: Math.round(buyUsd),
        tradeDate: latestTradeDate,
        filedDate,
        filingUrl: indexUrl,
      });
    }
    if (sellShares > 0 && sellUsd >= 50_000) {
      fresh.push({
        id: `sec-${ticker}-${insiderName.replace(/\s+/g, '')}-${latestTradeDate}-S`,
        ticker,
        companyName,
        insiderName,
        role,
        isCsuite,
        action: 'SELL',
        shares: Math.round(sellShares),
        price: Number((sellUsd / sellShares).toFixed(2)),
        valueUsd: Math.round(sellUsd),
        tradeDate: latestTradeDate,
        filedDate,
        filingUrl: indexUrl,
      });
    }

    // Polite SEC rate pacing (~8 req/sec max)
    await new Promise((r) => setTimeout(r, 130));
  }

  if (fresh.length === 0) return null;

  const seen = new Set();
  const merged = [];
  for (const row of [...fresh, ...existingForm4]) {
    if (seen.has(row.id)) continue;
    seen.add(row.id);
    merged.push(row);
  }
  merged.sort((a, b) => b.filedDate.localeCompare(a.filedDate) || b.valueUsd - a.valueUsd);
  return merged.slice(0, 120);
}

/**
 * 2. Official FINRA Reg SHO Daily Short Sale Volume + SEC FTD ZIP Sync
 */
async function syncFinraAndFtd(existingSqueeze) {
  let finraText = null;
  let finraDateIso = '';
  const today = new Date();

  for (let back = 0; back <= 6; back += 1) {
    const d = new Date(today.getTime() - back * 86_400_000);
    const day = d.getUTCDay();
    if (day === 0 || day === 6) continue;
    const yyyy = d.getUTCFullYear();
    const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
    const dd = String(d.getUTCDate()).padStart(2, '0');
    const url = `https://cdn.finra.org/equity/regsho/daily/CNMSshvol${yyyy}${mm}${dd}.txt`;
    const txt = await fetchText(url, {}, 10000);
    if (txt && txt.includes('Symbol|ShortVolume')) {
      finraText = txt;
      finraDateIso = `${yyyy}-${mm}-${dd}`;
      break;
    }
  }
  if (!finraText) return null;

  // Optionally fetch latest SEC FTD zip and extract via unzip -p
  const ftdMap = new Map();
  try {
    const ftdPage = await fetchText(
      'https://www.sec.gov/data-research/sec-markets-data/fails-deliver-data',
      SEC_HEADERS,
      10000,
    );
    const zipMatch = ftdPage?.match(/\/files\/data\/fails-deliver-data\/cnsfails\d{6}[ab]\.zip/i);
    if (zipMatch) {
      const zipBuf = await fetchBuffer(`https://www.sec.gov${zipMatch[0]}`, SEC_HEADERS, 15000);
      if (zipBuf) {
        const tmpZip = path.join(os.tmpdir(), 'ainvest_ftd.zip');
        fs.writeFileSync(tmpZip, zipBuf);
        const rawFtd = execFileSync('unzip', ['-p', tmpZip], {
          encoding: 'utf8',
          maxBuffer: 40 * 1024 * 1024,
        });
        fs.unlinkSync(tmpZip);
        const lines = rawFtd.split(/\r?\n/);
        for (let i = 1; i < lines.length; i += 1) {
          const parts = lines[i].split('|');
          if (parts.length < 6) continue;
          const [dateRaw, , sym, qtyRaw, desc, pxRaw] = parts;
          const symClean = (sym || '').trim().toUpperCase();
          const qty = Number(qtyRaw);
          const px = Number(pxRaw);
          if (!symClean || !Number.isFinite(qty) || !Number.isFinite(px) || qty <= 0) continue;
          const ftdUsd = qty * px;
          const prev = ftdMap.get(symClean);
          const dateFmt =
            dateRaw.length === 8
              ? `${dateRaw.slice(0, 4)}-${dateRaw.slice(4, 6)}-${dateRaw.slice(6, 8)}`
              : finraDateIso;
          if (!prev || dateFmt >= prev.date) {
            ftdMap.set(symClean, {
              shares: qty,
              usd: Math.round(ftdUsd),
              date: dateFmt,
              name: (desc || '').trim(),
            });
          }
        }
      }
    }
  } catch {
    // FTD enrichment optional; FINRA short volume still succeeds cleanly
  }

  const nameLookup = new Map(existingSqueeze.map((r) => [r.ticker, r.companyName]));
  const rows = [];
  const lines = finraText.split(/\r?\n/);
  for (let i = 1; i < lines.length; i += 1) {
    const parts = lines[i].split('|');
    if (parts.length < 5) continue;
    const sym = (parts[1] || '').trim().toUpperCase();
    if (!sym || !/^[A-Z]{1,5}$/.test(sym)) continue;
    const shortVol = Number(parts[2]);
    const shortExempt = Number(parts[3]);
    const totalVol = Number(parts[4]);
    if (!Number.isFinite(totalVol) || totalVol <= 0) continue;
    if (totalVol < 400_000 && !PRIORITY_TICKERS.has(sym)) continue;

    const shortVolPct = Number(((shortVol / totalVol) * 100).toFixed(1));
    const shortExemptPct = (shortExempt / totalVol) * 100;
    const ftd = ftdMap.get(sym);
    const ftdShares = ftd?.shares ?? 0;
    const ftdUsd = ftd?.usd ?? 0;
    const { squeezeScore, regime, signals } = computeSqueezeScore(
      shortVolPct,
      shortExemptPct,
      ftdUsd,
    );

    if (squeezeScore < 52 && !PRIORITY_TICKERS.has(sym)) continue;

    rows.push({
      ticker: sym,
      companyName: nameLookup.get(sym) || ftd?.name || sym,
      tradeDate: finraDateIso,
      shortVolume: Math.round(shortVol),
      shortExemptVolume: Math.round(shortExempt),
      totalVolume: Math.round(totalVol),
      shortVolPct,
      ftdShares,
      ftdUsd,
      ftdDate: ftd?.date || finraDateIso,
      squeezeScore,
      regime,
      signals,
    });
  }

  if (rows.length < 10) return null;
  rows.sort((a, b) => b.squeezeScore - a.squeezeScore || b.shortVolPct - a.shortVolPct);

  // Keep top 90 squeeze setups + ensure all priority tickers present
  const kept = new Map();
  for (const r of rows.slice(0, 90)) kept.set(r.ticker, r);
  for (const r of rows) {
    if (PRIORITY_TICKERS.has(r.ticker) && !kept.has(r.ticker)) {
      kept.set(r.ticker, r);
    }
  }
  return Array.from(kept.values()).sort(
    (a, b) => b.squeezeScore - a.squeezeScore || b.shortVolPct - a.shortVolPct,
  );
}

/**
 * 3. Public Congressional STOCK Act Disclosures Sync (House & Senate mirrors)
 */
async function syncCongress(existingCongress) {
  const mirrorUrls = [
    'https://house-stock-watcher-data.s3-us-west-2.amazonaws.com/data/all_transactions.json',
  ];
  for (const url of mirrorUrls) {
    const txt = await fetchText(url, {}, 10000);
    if (!txt) continue;
    try {
      const parsed = JSON.parse(txt);
      if (!Array.isArray(parsed) || parsed.length === 0) continue;
      const fresh = [];
      for (const item of parsed.slice(0, 300)) {
        const ticker = String(item.ticker || '')
          .trim()
          .toUpperCase();
        if (!ticker || ticker === '--' || !/^[A-Z]{1,5}$/.test(ticker)) continue;
        const typeRaw = String(item.type || '').toLowerCase();
        const action = typeRaw.includes('purchase') ? 'BUY' : typeRaw.includes('sale') ? 'SELL' : null;
        if (!action) continue;
        const politician = String(item.representative || '').trim();
        if (!politician) continue;
        const amountLabel = String(item.amount || '$15,001 - $50,000');
        const nums = [...amountLabel.matchAll(/[\d,]+/g)].map((m) =>
          Number(m[0].replace(/,/g, '')),
        );
        const amountMinUsd = nums[0] || 15001;
        const amountMaxUsd = nums[1] || amountMinUsd * 2;
        const tradeDate = String(item.transaction_date || '').slice(0, 10);
        const filedDate = String(item.disclosure_date || tradeDate).slice(0, 10);
        const lagDays = Math.max(
          0,
          Math.round((Date.parse(filedDate) - Date.parse(tradeDate)) / 86_400_000) || 0,
        );
        const partyRaw = String(item.party || 'D').toUpperCase();
        const party = partyRaw.startsWith('R') ? 'R' : partyRaw.startsWith('I') ? 'I' : 'D';
        const state = String(item.district || 'US').slice(0, 2).toUpperCase();

        fresh.push({
          id: `house-${politician.replace(/\s+/g, '')}-${ticker}-${tradeDate}-${action}`,
          politician,
          party,
          chamber: 'House',
          state,
          committees: ['US House'],
          ticker,
          assetName: String(item.asset_description || ticker).slice(0, 48),
          action,
          amountLabel,
          amountMinUsd,
          amountMaxUsd,
          tradeDate,
          filedDate,
          lagDays,
          sourceUrl:
            item.ptr_link || 'https://disclosures-clerk.house.gov/FinancialDisclosure',
        });
      }
      if (fresh.length >= 10) {
        const seen = new Set();
        const merged = [];
        for (const r of [...fresh, ...existingCongress]) {
          if (seen.has(r.id)) continue;
          seen.add(r.id);
          merged.push(r);
        }
        merged.sort((a, b) => b.filedDate.localeCompare(a.filedDate));
        return merged.slice(0, 120);
      }
    } catch {
      // Try next mirror or keep snapshot
    }
  }
  return null;
}

async function main() {
  const existing = JSON.parse(fs.readFileSync(BUNDLE_PATH, 'utf8'));
  const nowIso = new Date().toISOString();

  console.log('[aINVEST sync] Starting official SEC Form 4, FINRA Short Vol, SEC FTD & Congress sync…');

  const [form4Live, squeezeLive, congressLive] = await Promise.all([
    syncSecForm4(existing.form4 || []).catch(() => null),
    syncFinraAndFtd(existing.squeeze || []).catch(() => null),
    syncCongress(existing.congress || []).catch(() => null),
  ]);

  const next = {
    generatedAt: nowIso,
    meta: {
      congress: congressLive
        ? {
            syncedAt: nowIso,
            sourceLabel: 'US House & Senate STOCK Act',
            mode: 'LIVE OFFICIAL',
            recordCount: congressLive.length,
          }
        : existing.meta.congress,
      form4: form4Live
        ? {
            syncedAt: nowIso,
            sourceLabel: 'SEC EDGAR Form 4 XML',
            mode: 'LIVE OFFICIAL',
            recordCount: form4Live.length,
          }
        : existing.meta.form4,
      squeeze: squeezeLive
        ? {
            syncedAt: nowIso,
            sourceLabel: 'FINRA Reg SHO & SEC FTD',
            mode: 'LIVE OFFICIAL',
            recordCount: squeezeLive.length,
          }
        : existing.meta.squeeze,
    },
    congress: congressLive ?? existing.congress,
    form4: form4Live ?? existing.form4,
    squeeze: squeezeLive ?? existing.squeeze,
  };

  fs.mkdirSync(path.dirname(BUNDLE_PATH), { recursive: true });
  fs.writeFileSync(BUNDLE_PATH, `${JSON.stringify(next, null, 2)}\n`);
  console.log('[aINVEST sync] Completed:', {
    congress: `${next.meta.congress.mode} (${next.congress.length})`,
    form4: `${next.meta.form4.mode} (${next.form4.length})`,
    squeeze: `${next.meta.squeeze.mode} (${next.squeeze.length})`,
  });
}

main().catch((err) => {
  console.warn('[aINVEST sync] Non-fatal sync error, preserving snapshot:', err?.message || err);
});
