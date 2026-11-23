import type { DailyBreadCall } from './dailyBreadEngine';
import type {
  ClusterBuySignal,
  CongressTrade,
  ShortSqueezeRow,
} from './insidersEngine';
import type { MultiLegHeatmapResult } from './optionsPricing';
import type { TickerOptionsSummary } from './whaleFlowEngine';

export type SnapshotResult = 'copied' | 'downloaded' | 'failed';

const W = 1200;
const H = 630;

function createCardCanvas(): {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
} | null {
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  // Institutional Slate background
  ctx.fillStyle = '#0B0E14';
  ctx.fillRect(0, 0, W, H);

  // Subtle top accent gradient bar
  const grad = ctx.createLinearGradient(0, 0, W, 0);
  grad.addColorStop(0, '#10B981');
  grad.addColorStop(0.5, '#38BDF8');
  grad.addColorStop(1, '#A78BFA');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, 5);

  // Outer card border
  ctx.strokeStyle = '#1E2636';
  ctx.lineWidth = 2;
  ctx.strokeRect(20, 22, W - 40, H - 44);

  // Header brand masthead
  ctx.fillStyle = '#111622';
  ctx.fillRect(21, 23, W - 42, 62);
  ctx.strokeStyle = '#1E2636';
  ctx.beginPath();
  ctx.moveTo(21, 85);
  ctx.lineTo(W - 21, 85);
  ctx.stroke();

  // Brand emblem box
  ctx.fillStyle = 'rgba(16, 185, 129, 0.14)';
  ctx.strokeStyle = 'rgba(16, 185, 129, 0.45)';
  ctx.lineWidth = 1.5;
  ctx.fillRect(42, 38, 34, 32);
  ctx.strokeRect(42, 38, 34, 32);

  ctx.font = '700 16px "JetBrains Mono", monospace';
  ctx.fillStyle = '#10B981';
  ctx.fillText('aI', 50, 60);

  ctx.font = '700 22px Inter, system-ui, sans-serif';
  ctx.fillStyle = '#F8FAFC';
  ctx.fillText('a', 88, 62);
  ctx.fillStyle = '#10B981';
  ctx.fillText('INVEST', 102, 62);

  // Timestamp & URL watermark
  const stamp = new Date().toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  ctx.font = '600 13px "JetBrains Mono", monospace';
  ctx.fillStyle = '#64748B';
  ctx.textAlign = 'right';
  ctx.fillText(`LIVE TERMINAL • ${stamp} • ainvest`, W - 42, 60);
  ctx.textAlign = 'left';

  return { canvas, ctx };
}

function drawFooter(ctx: CanvasRenderingContext2D, note: string): void {
  ctx.strokeStyle = '#1E2636';
  ctx.beginPath();
  ctx.moveTo(40, H - 56);
  ctx.lineTo(W - 40, H - 56);
  ctx.stroke();

  ctx.font = '500 12px "JetBrains Mono", monospace';
  ctx.fillStyle = '#64748B';
  ctx.fillText(note, 42, H - 34);
  ctx.textAlign = 'right';
  ctx.fillStyle = '#10B981';
  ctx.fillText('arbonomous.github.io/aINVEST', W - 42, H - 34);
  ctx.textAlign = 'left';
}

function drawKpiBox(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  label: string,
  value: string,
  valueColor = '#F8FAFC',
): void {
  ctx.fillStyle = '#111622';
  ctx.strokeStyle = '#1E2636';
  ctx.lineWidth = 1.25;
  ctx.fillRect(x, y, w, h);
  ctx.strokeRect(x, y, w, h);

  ctx.font = '600 11px "JetBrains Mono", monospace';
  ctx.fillStyle = '#64748B';
  ctx.fillText(label, x + 12, y + 22);

  ctx.font = '700 20px "JetBrains Mono", monospace';
  ctx.fillStyle = valueColor;
  ctx.fillText(value, x + 12, y + 48);
}

function fmtUsdCompact(n: number): string {
  const sign = n > 0 ? '+' : n < 0 ? '-' : '';
  const abs = Math.abs(n);
  if (abs >= 1e9) return `${sign}$${(abs / 1e9).toFixed(2)}B`;
  if (abs >= 1e6) return `${sign}$${(abs / 1e6).toFixed(2)}M`;
  if (abs >= 1e3) return `${sign}$${(abs / 1e3).toFixed(1)}K`;
  return `${sign}$${abs.toFixed(0)}`;
}

async function emitCanvasPng(
  canvas: HTMLCanvasElement,
  filename: string,
): Promise<SnapshotResult> {
  const blob: Blob | null = await new Promise((resolve) =>
    canvas.toBlob((b) => resolve(b), 'image/png'),
  );
  if (!blob) return 'failed';

  // Always trigger download so user immediately gets the PNG file, and also copy to clipboard when allowed
  let copied = false;
  try {
    if (
      typeof navigator !== 'undefined' &&
      navigator.clipboard &&
      'write' in navigator.clipboard &&
      typeof ClipboardItem !== 'undefined'
    ) {
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
      copied = true;
    }
  } catch {
    copied = false;
  }

  try {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1500);
    return copied ? 'copied' : 'downloaded';
  } catch {
    return copied ? 'copied' : 'failed';
  }
}

export async function exportGexSnapshotCard(
  summary: TickerOptionsSummary,
): Promise<SnapshotResult> {
  const created = createCardCanvas();
  if (!created) return 'failed';
  const { canvas, ctx } = created;

  // Title Row
  ctx.font = '700 32px Inter, system-ui, sans-serif';
  ctx.fillStyle = '#F8FAFC';
  ctx.fillText(`${summary.ticker} — DEALER GEX PROFILE`, 42, 134);

  ctx.font = '700 20px "JetBrains Mono", monospace';
  ctx.fillStyle = '#94A3B8';
  ctx.fillText(`SPOT $${summary.spotPrice.toFixed(2)}`, 510, 134);

  const regimeColor =
    summary.netGammaRegime === 'PIN (+GEX)'
      ? '#10B981'
      : summary.netGammaRegime === 'VOLATILE (-GEX)'
        ? '#F43F5E'
        : '#F59E0B';
  ctx.textAlign = 'right';
  ctx.fillStyle = regimeColor;
  ctx.fillText(
    `${summary.netGammaRegime} (${fmtUsdCompact(summary.netGexUsd)} / 1%)`,
    W - 42,
    134,
  );
  ctx.textAlign = 'left';

  // 5 Key Dealer Level Boxes
  const boxW = (W - 84 - 4 * 12) / 5;
  const boxY = 156;
  drawKpiBox(
    ctx,
    42,
    boxY,
    boxW,
    64,
    'CALL WALL (RES)',
    summary.callWall ? `$${summary.callWall}` : '—',
    '#10B981',
  );
  drawKpiBox(
    ctx,
    42 + (boxW + 12) * 1,
    boxY,
    boxW,
    64,
    'PUT WALL (SUP)',
    summary.putWall ? `$${summary.putWall}` : '—',
    '#F43F5E',
  );
  drawKpiBox(
    ctx,
    42 + (boxW + 12) * 2,
    boxY,
    boxW,
    64,
    'ZERO-GAMMA FLIP',
    summary.gammaFlip ? `$${summary.gammaFlip}` : '—',
    '#F59E0B',
  );
  drawKpiBox(
    ctx,
    42 + (boxW + 12) * 3,
    boxY,
    boxW,
    64,
    'MAX PAIN',
    summary.maxPainStrike ? `$${summary.maxPainStrike}` : '—',
    '#A78BFA',
  );
  drawKpiBox(
    ctx,
    42 + (boxW + 12) * 4,
    boxY,
    boxW,
    64,
    '±1σ EXPECTED MOVE',
    summary.expectedMovePct !== null ? `±${summary.expectedMovePct}%` : '—',
    '#38BDF8',
  );

  // Diverging GEX Bars (up to 10 strikes)
  const rows = summary.gexProfile.slice(0, 10);
  const maxAbs = Math.max(
    1,
    ...rows.flatMap((r) => [Math.abs(r.callGex), Math.abs(r.putGex)]),
  );
  const startY = 250;
  const rowH = 30;
  const centerX = 650;
  const barMaxW = 430;

  ctx.font = '600 12px "JetBrains Mono", monospace';
  ctx.fillStyle = '#F43F5E';
  ctx.textAlign = 'right';
  ctx.fillText('◄ PUT GEX (SHORT VOL)', centerX - 14, startY - 8);
  ctx.fillStyle = '#10B981';
  ctx.textAlign = 'left';
  ctx.fillText('CALL GEX (DEALER PINNING) ►', centerX + 14, startY - 8);

  // Center axis line
  ctx.strokeStyle = '#334155';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(centerX, startY);
  ctx.lineTo(centerX, startY + rows.length * rowH);
  ctx.stroke();

  rows.forEach((row, idx) => {
    const y = startY + idx * rowH;
    const isCallWall = row.strike === summary.callWall;
    const isPutWall = row.strike === summary.putWall;

    ctx.font = '700 14px "JetBrains Mono", monospace';
    ctx.fillStyle = '#E2E8F0';
    ctx.fillText(`$${row.strike}`, 44, y + 19);

    if (isCallWall) {
      ctx.fillStyle = '#10B981';
      ctx.font = '700 11px "JetBrains Mono", monospace';
      ctx.fillText('C-WALL', 118, y + 19);
    } else if (isPutWall) {
      ctx.fillStyle = '#F43F5E';
      ctx.font = '700 11px "JetBrains Mono", monospace';
      ctx.fillText('P-WALL', 118, y + 19);
    }

    const putW = Math.round((Math.abs(row.putGex) / maxAbs) * barMaxW);
    const callW = Math.round((Math.abs(row.callGex) / maxAbs) * barMaxW);

    if (putW > 0) {
      ctx.fillStyle = 'rgba(244, 63, 94, 0.85)';
      ctx.fillRect(centerX - putW - 2, y + 6, putW, 16);
    }
    if (callW > 0) {
      ctx.fillStyle = 'rgba(16, 185, 129, 0.85)';
      ctx.fillRect(centerX + 2, y + 6, callW, 16);
    }

    ctx.font = '600 11px "JetBrains Mono", monospace';
    if (row.callGex > 0) {
      ctx.fillStyle = '#10B981';
      ctx.fillText(fmtUsdCompact(row.callGex), centerX + callW + 8, y + 18);
    }
  });

  drawFooter(
    ctx,
    'DEALER GAMMA EXPOSURE (GEX) • LIVE CBOE OPTIONS CHAIN ANALYTICS • NOT FINANCIAL ADVICE',
  );

  return emitCanvasPng(canvas, `aINVEST_${summary.ticker}_GEX.png`);
}

export async function exportDailyBreadSnapshotCard(
  call: DailyBreadCall,
): Promise<SnapshotResult> {
  const created = createCardCanvas();
  if (!created) return 'failed';
  const { canvas, ctx } = created;

  const dirColor =
    call.direction === 'LONG'
      ? '#10B981'
      : call.direction === 'SHORT'
        ? '#F43F5E'
        : '#F59E0B';

  // Badge + Headline
  ctx.fillStyle =
    call.direction === 'LONG'
      ? 'rgba(16,185,129,0.16)'
      : call.direction === 'SHORT'
        ? 'rgba(244,63,94,0.16)'
        : 'rgba(245,158,11,0.16)';
  ctx.strokeStyle = dirColor;
  ctx.lineWidth = 1.5;
  ctx.fillRect(42, 108, 172, 36);
  ctx.strokeRect(42, 108, 172, 36);

  ctx.font = '700 16px "JetBrains Mono", monospace';
  ctx.fillStyle = dirColor;
  ctx.fillText(`DAILY BREAD • ${call.direction}`, 54, 131);

  ctx.font = '700 36px Inter, system-ui, sans-serif';
  ctx.fillStyle = '#F8FAFC';
  ctx.fillText(`${call.ticker} — ${call.name}`, 232, 138);

  ctx.textAlign = 'right';
  ctx.font = '700 22px "JetBrains Mono", monospace';
  ctx.fillStyle = dirColor;
  ctx.fillText(`GRADE ${call.grade} • ${call.confidence}% CONF`, W - 42, 136);
  ctx.textAlign = 'left';

  // 5 Trade Plan KPI boxes
  const boxW = (W - 84 - 4 * 12) / 5;
  const boxY = 172;
  drawKpiBox(
    ctx,
    42,
    boxY,
    boxW,
    72,
    'LIVE SPOT',
    `$${call.livePrice.toFixed(2)}`,
    '#F8FAFC',
  );
  drawKpiBox(
    ctx,
    42 + (boxW + 12) * 1,
    boxY,
    boxW,
    72,
    'ENTRY ZONE',
    `$${call.entryLow.toFixed(2)}–$${call.entryHigh.toFixed(2)}`,
    '#F59E0B',
  );
  drawKpiBox(
    ctx,
    42 + (boxW + 12) * 2,
    boxY,
    boxW,
    72,
    'TARGET 1 (TP1)',
    `$${call.target1.toFixed(2)}`,
    '#10B981',
  );
  drawKpiBox(
    ctx,
    42 + (boxW + 12) * 3,
    boxY,
    boxW,
    72,
    'TARGET 2 (TP2)',
    `$${call.target2.toFixed(2)}`,
    '#10B981',
  );
  drawKpiBox(
    ctx,
    42 + (boxW + 12) * 4,
    boxY,
    boxW,
    72,
    `STOP LOSS (R:R ${call.riskReward.toFixed(1)}×)`,
    `$${call.stopLoss.toFixed(2)}`,
    '#F43F5E',
  );

  // Thesis Box
  ctx.fillStyle = '#111622';
  ctx.strokeStyle = '#1E2636';
  ctx.fillRect(42, 268, W - 84, 118);
  ctx.strokeRect(42, 268, W - 84, 118);

  ctx.font = '700 13px "JetBrains Mono", monospace';
  ctx.fillStyle = '#10B981';
  ctx.fillText(`AI TECHNICAL THESIS — ${call.setupName.toUpperCase()}`, 60, 296);

  ctx.font = '500 18px Inter, system-ui, sans-serif';
  ctx.fillStyle = '#E2E8F0';
  const words = call.thesis.split(' ');
  let line = '';
  let ty = 328;
  for (const w of words) {
    const test = line ? `${line} ${w}` : w;
    if (ctx.measureText(test).width > W - 124 && line) {
      ctx.fillText(line, 60, ty);
      line = w;
      ty += 26;
      if (ty > 372) break;
    } else {
      line = test;
    }
  }
  if (line && ty <= 372) ctx.fillText(line, 60, ty);

  // Key Technical Indicators Strip
  ctx.font = '700 13px "JetBrains Mono", monospace';
  ctx.fillStyle = '#94A3B8';
  ctx.fillText('MULTI-TIMEFRAME INDICATORS & INVALIDATION', 42, 422);

  const chipCols = call.indicators.slice(0, 4);
  if (chipCols.length > 0) {
    const chipW = (W - 84 - (chipCols.length - 1) * 12) / chipCols.length;
    chipCols.forEach((ind, idx) => {
      const toneColor =
        ind.tone === 'bull'
          ? '#10B981'
          : ind.tone === 'bear'
            ? '#F43F5E'
            : ind.tone === 'amber'
              ? '#F59E0B'
              : '#E2E8F0';
      drawKpiBox(
        ctx,
        42 + idx * (chipW + 12),
        436,
        chipW,
        64,
        ind.label.toUpperCase(),
        ind.value,
        toneColor,
      );
    });
  }

  ctx.font = '500 14px "JetBrains Mono", monospace';
  ctx.fillStyle = '#F59E0B';
  ctx.fillText(`INVALIDATION: ${call.invalidationNote.slice(0, 96)}`, 42, 536);

  drawFooter(
    ctx,
    'DAILY BREAD AI MULTI-TF CHART & INDICATOR SCANNER • INFORMATIONAL ONLY, NOT FINANCIAL ADVICE',
  );

  return emitCanvasPng(canvas, `aINVEST_${call.ticker}_AI_CALL.png`);
}

export async function exportOptionsPayoffSnapshotCard(params: {
  ticker: string;
  strategyLabel: string;
  legsSummary: string;
  spot: number;
  heatmap: MultiLegHeatmapResult;
}): Promise<SnapshotResult> {
  const created = createCardCanvas();
  if (!created) return 'failed';
  const { canvas, ctx } = created;
  const { ticker, strategyLabel, legsSummary, spot, heatmap } = params;

  ctx.font = '700 30px Inter, system-ui, sans-serif';
  ctx.fillStyle = '#F8FAFC';
  ctx.fillText(`${ticker} — ${strategyLabel}`, 42, 132);

  ctx.font = '600 14px "JetBrains Mono", monospace';
  ctx.fillStyle = '#94A3B8';
  ctx.fillText(`${legsSummary}  •  SPOT $${spot.toFixed(2)}`, 42, 158);

  const boxW = (W - 84 - 4 * 12) / 5;
  const boxY = 176;
  drawKpiBox(
    ctx,
    42,
    boxY,
    boxW,
    62,
    heatmap.isNetCredit ? 'NET CREDIT' : 'NET DEBIT',
    `$${Math.abs(heatmap.netCostUsd).toLocaleString('en-US', { maximumFractionDigits: 0 })}`,
    '#F8FAFC',
  );
  drawKpiBox(
    ctx,
    42 + (boxW + 12) * 1,
    boxY,
    boxW,
    62,
    'BREAKEVEN(S)',
    heatmap.breakevens.length > 0
      ? heatmap.breakevens.map((b) => `$${b.toFixed(1)}`).join(' / ')
      : '—',
    '#F59E0B',
  );
  drawKpiBox(
    ctx,
    42 + (boxW + 12) * 2,
    boxY,
    boxW,
    62,
    'PROB OF PROFIT',
    `${heatmap.popPct}%`,
    heatmap.popPct >= 50 ? '#10B981' : '#F43F5E',
  );
  drawKpiBox(
    ctx,
    42 + (boxW + 12) * 3,
    boxY,
    boxW,
    62,
    'MAX PROFIT',
    heatmap.maxProfitLabel,
    '#10B981',
  );
  drawKpiBox(
    ctx,
    42 + (boxW + 12) * 4,
    boxY,
    boxW,
    62,
    'MAX LOSS',
    heatmap.maxLossLabel,
    '#F43F5E',
  );

  // Draw Compact P&L Heatmap Grid (9 representative rows)
  const stride = Math.max(1, Math.floor(heatmap.rows.length / 9));
  const sampledRows = heatmap.rows.filter((_, idx) => idx % stride === 0).slice(0, 9);
  const maxAbs = Math.max(
    1,
    ...sampledRows.flatMap((r) => r.cells.map((c) => Math.abs(c.pnlUsd))),
  );

  const tableX = 42;
  const tableY = 258;
  const tableW = W - 84;
  const colCount = heatmap.dateLabels.length + 2;
  const colW = tableW / colCount;
  const rowH = 30;

  // Header row
  ctx.fillStyle = '#111622';
  ctx.fillRect(tableX, tableY, tableW, 28);
  ctx.font = '700 12px "JetBrains Mono", monospace';
  ctx.fillStyle = '#94A3B8';
  ctx.fillText(`${ticker} PX`, tableX + 10, tableY + 19);
  ctx.fillText('MOVE', tableX + colW + 10, tableY + 19);
  heatmap.dateLabels.forEach((lbl, ci) => {
    ctx.fillText(lbl, tableX + (ci + 2) * colW + 10, tableY + 19);
  });

  sampledRows.forEach((r, ri) => {
    const y = tableY + 28 + ri * rowH;
    ctx.font = '700 13px "JetBrains Mono", monospace';
    ctx.fillStyle = r.isSpotRow ? '#F59E0B' : '#E2E8F0';
    ctx.fillText(`$${r.price.toFixed(2)}`, tableX + 10, y + 20);
    ctx.fillStyle = r.pctMove >= 0 ? '#10B981' : '#F43F5E';
    ctx.fillText(
      `${r.pctMove >= 0 ? '+' : ''}${r.pctMove}%`,
      tableX + colW + 10,
      y + 20,
    );

    r.cells.forEach((cell, ci) => {
      const cx = tableX + (ci + 2) * colW;
      const alpha = Math.min(0.48, Math.max(0.08, (Math.abs(cell.pnlUsd) / maxAbs) * 0.46));
      ctx.fillStyle =
        cell.pnlUsd >= 0
          ? `rgba(16, 185, 129, ${alpha.toFixed(2)})`
          : `rgba(244, 63, 94, ${alpha.toFixed(2)})`;
      ctx.fillRect(cx + 1, y + 1, colW - 2, rowH - 2);
      ctx.fillStyle = cell.pnlUsd >= 0 ? '#34D399' : '#FB7185';
      ctx.fillText(fmtUsdCompact(cell.pnlUsd), cx + 10, y + 20);
    });
  });

  drawFooter(
    ctx,
    `BLACK-SCHOLES MULTI-LEG SIM • Δ ${heatmap.greeks.delta.toFixed(2)} · Γ ${heatmap.greeks.gamma.toFixed(3)} · Θ ${heatmap.greeks.thetaDaily.toFixed(2)}/d · ν ${heatmap.greeks.vegaPer1Pct.toFixed(2)}`,
  );

  return emitCanvasPng(
    canvas,
    `aINVEST_${ticker}_${strategyLabel.replace(/\s+/g, '_')}.png`,
  );
}

export async function exportCongressSnapshotCard(
  trade: CongressTrade,
): Promise<SnapshotResult> {
  const created = createCardCanvas();
  if (!created) return 'failed';
  const { canvas, ctx } = created;

  const isBuy = trade.action === 'BUY';
  const actionColor = isBuy ? '#10B981' : '#F43F5E';
  const partyColor =
    trade.party === 'D' ? '#38BDF8' : trade.party === 'R' ? '#F43F5E' : '#F59E0B';

  // Badge
  ctx.fillStyle = isBuy ? 'rgba(16,185,129,0.16)' : 'rgba(244,63,94,0.16)';
  ctx.strokeStyle = actionColor;
  ctx.lineWidth = 1.5;
  ctx.fillRect(42, 108, 224, 34);
  ctx.strokeRect(42, 108, 224, 34);
  ctx.font = '700 14px "JetBrains Mono", monospace';
  ctx.fillStyle = actionColor;
  ctx.fillText(`CONGRESS STOCK ACT • ${trade.action}`, 54, 130);

  // Politician Headline
  ctx.font = '700 38px Inter, system-ui, sans-serif';
  ctx.fillStyle = '#F8FAFC';
  ctx.fillText(`${trade.politician} (${trade.party}-${trade.state})`, 42, 194);

  ctx.font = '700 22px "JetBrains Mono", monospace';
  ctx.fillStyle = partyColor;
  ctx.fillText(
    `${trade.chamber.toUpperCase()}  •  ${trade.committees.join(' / ').toUpperCase()}`,
    42,
    228,
  );

  // 4 KPI Boxes
  const boxW = (W - 84 - 3 * 14) / 4;
  const boxY = 264;
  drawKpiBox(ctx, 42, boxY, boxW, 84, 'TICKER', `$${trade.ticker}`, '#10B981');
  drawKpiBox(
    ctx,
    42 + (boxW + 14) * 1,
    boxY,
    boxW,
    84,
    'DISCLOSED SIZE',
    trade.amountLabel.replace(/ – /g, '–'),
    actionColor,
  );
  drawKpiBox(
    ctx,
    42 + (boxW + 14) * 2,
    boxY,
    boxW,
    84,
    'TRADE DATE',
    trade.tradeDate,
    '#F8FAFC',
  );
  drawKpiBox(
    ctx,
    42 + (boxW + 14) * 3,
    boxY,
    boxW,
    84,
    'DISCLOSURE LAG',
    `+${trade.lagDays}d (Filed ${trade.filedDate})`,
    '#F59E0B',
  );

  // Asset Details Box
  ctx.fillStyle = '#111622';
  ctx.strokeStyle = '#1E2636';
  ctx.fillRect(42, 376, W - 84, 152);
  ctx.strokeRect(42, 376, W - 84, 152);

  ctx.font = '700 13px "JetBrains Mono", monospace';
  ctx.fillStyle = '#94A3B8';
  ctx.fillText('OFFICIAL DISCLOSURE SUMMARY', 62, 412);

  ctx.font = '600 22px Inter, system-ui, sans-serif';
  ctx.fillStyle = '#E2E8F0';
  ctx.fillText(
    `${trade.politician} disclosed a ${trade.action} of ${trade.assetName} ($${trade.ticker})`,
    62,
    454,
  );
  ctx.font = '500 15px "JetBrains Mono", monospace';
  ctx.fillStyle = '#94A3B8';
  ctx.fillText(
    `Range: ${trade.amountLabel}  •  Trade ${trade.tradeDate}  •  Filed ${trade.filedDate}`,
    62,
    494,
  );

  drawFooter(
    ctx,
    'US HOUSE & SENATE STOCK ACT DISCLOSURES • PUBLIC FILINGS TRACKED BY aINVEST • NOT FINANCIAL ADVICE',
  );

  return emitCanvasPng(
    canvas,
    `aINVEST_CONGRESS_${trade.ticker}_${trade.politician.replace(/\s+/g, '_')}.png`,
  );
}

export async function exportClusterBuySnapshotCard(
  cluster: ClusterBuySignal,
): Promise<SnapshotResult> {
  const created = createCardCanvas();
  if (!created) return 'failed';
  const { canvas, ctx } = created;

  ctx.fillStyle = 'rgba(16,185,129,0.16)';
  ctx.strokeStyle = '#10B981';
  ctx.lineWidth = 1.5;
  ctx.fillRect(42, 108, 250, 34);
  ctx.strokeRect(42, 108, 250, 34);
  ctx.font = '700 14px "JetBrains Mono", monospace';
  ctx.fillStyle = '#10B981';
  ctx.fillText('SEC FORM 4 • CLUSTER BUY ALERT', 54, 130);

  ctx.font = '700 38px Inter, system-ui, sans-serif';
  ctx.fillStyle = '#F8FAFC';
  ctx.fillText(`$${cluster.ticker} — ${cluster.companyName}`, 42, 194);

  const boxW = (W - 84 - 2 * 14) / 3;
  drawKpiBox(
    ctx,
    42,
    220,
    boxW,
    78,
    'DISTINCT INSIDERS BUYING',
    `${cluster.insiderCount} EXECUTIVES / DIRECTORS`,
    '#10B981',
  );
  drawKpiBox(
    ctx,
    42 + (boxW + 14) * 1,
    220,
    boxW,
    78,
    'TOTAL OPEN-MARKET BUY',
    fmtUsdCompact(cluster.totalBuyUsd).replace(/^\+/, ''),
    '#F59E0B',
  );
  drawKpiBox(
    ctx,
    42 + (boxW + 14) * 2,
    220,
    boxW,
    78,
    'LATEST FILING DATE',
    cluster.latestDate,
    '#F8FAFC',
  );

  ctx.font = '700 13px "JetBrains Mono", monospace';
  ctx.fillStyle = '#94A3B8';
  ctx.fillText('PARTICIPATING INSIDERS (14-DAY WINDOW)', 42, 336);

  cluster.insiders.slice(0, 4).forEach((ins, i) => {
    const y = 354 + i * 44;
    ctx.fillStyle = '#111622';
    ctx.strokeStyle = '#1E2636';
    ctx.fillRect(42, y, W - 84, 36);
    ctx.strokeRect(42, y, W - 84, 36);

    ctx.font = '700 15px Inter, system-ui, sans-serif';
    ctx.fillStyle = '#F8FAFC';
    ctx.fillText(ins.name, 58, y + 23);

    ctx.font = '600 13px "JetBrains Mono", monospace';
    ctx.fillStyle = '#94A3B8';
    ctx.fillText(ins.role, 390, y + 23);

    ctx.textAlign = 'right';
    ctx.fillStyle = '#10B981';
    ctx.fillText(
      `BUY ${fmtUsdCompact(ins.valueUsd).replace(/^\+/, '')}`,
      W - 58,
      y + 23,
    );
    ctx.textAlign = 'left';
  });

  drawFooter(
    ctx,
    'SEC EDGAR FORM 4 OPEN-MARKET PURCHASES • CLUSTER BUY DETECTOR • INFORMATIONAL ONLY',
  );

  return emitCanvasPng(canvas, `aINVEST_${cluster.ticker}_CLUSTER_BUY.png`);
}

export async function exportSqueezeSnapshotCard(
  row: ShortSqueezeRow,
): Promise<SnapshotResult> {
  const created = createCardCanvas();
  if (!created) return 'failed';
  const { canvas, ctx } = created;

  const toneColor =
    row.regime === 'EXTREME'
      ? '#F43F5E'
      : row.regime === 'HIGH'
        ? '#F59E0B'
        : '#38BDF8';

  ctx.fillStyle = 'rgba(244,63,94,0.16)';
  ctx.strokeStyle = toneColor;
  ctx.lineWidth = 1.5;
  ctx.fillRect(42, 108, 256, 34);
  ctx.strokeRect(42, 108, 256, 34);
  ctx.font = '700 14px "JetBrains Mono", monospace';
  ctx.fillStyle = toneColor;
  ctx.fillText(`SHORT SQUEEZE RADAR • ${row.regime}`, 54, 130);

  ctx.font = '700 40px Inter, system-ui, sans-serif';
  ctx.fillStyle = '#F8FAFC';
  ctx.fillText(`$${row.ticker} — ${row.companyName}`, 42, 198);

  ctx.textAlign = 'right';
  ctx.font = '700 32px "JetBrains Mono", monospace';
  ctx.fillStyle = toneColor;
  ctx.fillText(`SCORE ${row.squeezeScore}/100`, W - 42, 196);
  ctx.textAlign = 'left';

  // Visual Score Bar
  ctx.fillStyle = '#111622';
  ctx.fillRect(42, 220, W - 84, 18);
  ctx.fillStyle = toneColor;
  ctx.fillRect(42, 220, Math.round(((W - 84) * row.squeezeScore) / 100), 18);

  const boxW = (W - 84 - 3 * 14) / 4;
  const boxY = 264;
  const exemptPct =
    row.totalVolume > 0
      ? ((row.shortExemptVolume / row.totalVolume) * 100).toFixed(2)
      : '0.00';

  drawKpiBox(
    ctx,
    42,
    boxY,
    boxW,
    84,
    'FINRA SHORT VOL %',
    `${row.shortVolPct.toFixed(1)}%`,
    row.shortVolPct >= 55 ? '#F43F5E' : '#F59E0B',
  );
  drawKpiBox(
    ctx,
    42 + (boxW + 14) * 1,
    boxY,
    boxW,
    84,
    'REG SHO EXEMPT %',
    `${exemptPct}%`,
    '#F59E0B',
  );
  drawKpiBox(
    ctx,
    42 + (boxW + 14) * 2,
    boxY,
    boxW,
    84,
    'SEC FTD PRESSURE',
    row.ftdUsd > 0 ? fmtUsdCompact(row.ftdUsd).replace(/^\+/, '') : '—',
    '#A78BFA',
  );
  drawKpiBox(
    ctx,
    42 + (boxW + 14) * 3,
    boxY,
    boxW,
    84,
    'FINRA TRADE DATE',
    row.tradeDate,
    '#F8FAFC',
  );

  // Signals Box
  ctx.fillStyle = '#111622';
  ctx.strokeStyle = '#1E2636';
  ctx.fillRect(42, 380, W - 84, 130);
  ctx.strokeRect(42, 380, W - 84, 130);

  ctx.font = '700 13px "JetBrains Mono", monospace';
  ctx.fillStyle = '#94A3B8';
  ctx.fillText('ACTIVE SHORT-PRESSURE SIGNALS', 62, 414);

  ctx.font = '700 20px "JetBrains Mono", monospace';
  ctx.fillStyle = '#E2E8F0';
  ctx.fillText(row.signals.join('   •   '), 62, 462);

  ctx.font = '500 14px "JetBrains Mono", monospace';
  ctx.fillStyle = '#94A3B8';
  ctx.fillText(
    `Short Vol: ${row.shortVolume.toLocaleString()} / Total Vol: ${row.totalVolume.toLocaleString()}  •  FTD Shares: ${row.ftdShares.toLocaleString()}`,
    62,
    494,
  );

  drawFooter(
    ctx,
    'FINRA DAILY SHORT SALE VOLUME & SEC FAILURES-TO-DELIVER (FTD) • NOT FINANCIAL ADVICE',
  );

  return emitCanvasPng(canvas, `aINVEST_${row.ticker}_SQUEEZE_RADAR.png`);
}
