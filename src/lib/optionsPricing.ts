import type { OptionContractFlow, OptionType } from './whaleFlowEngine';

export interface BlackScholesInput {
  type: OptionType;
  spot: number;
  strike: number;
  timeYears: number;
  iv: number; // decimal e.g. 0.55 for 55%
  rate?: number;
}

export interface BlackScholesOutput {
  price: number;
  intrinsic: number;
  extrinsic: number;
  delta: number;
  gamma: number;
  thetaDaily: number;
  vegaPer1Pct: number;
  popLong: number;
}

export interface HeatmapRow {
  price: number;
  pctMove: number;
  isSpotRow: boolean;
  isStrikeRow: boolean;
  cells: Array<{
    pnlUsd: number;
    roiPct: number;
    optionPrice: number;
  }>;
}

export interface PayoffHeatmapResult {
  dateLabels: string[];
  rows: HeatmapRow[];
  breakeven: number;
  costBasisUsd: number;
  maxProfitLabel: string;
  maxLossLabel: string;
  popPct: number;
  greeks: BlackScholesOutput;
  effectiveIvPct: number;
}

export type StrategyPresetId =
  | 'SINGLE'
  | 'BULL_CALL_SPREAD'
  | 'BEAR_PUT_SPREAD'
  | 'STRADDLE'
  | 'STRANGLE'
  | 'IRON_CONDOR';

export interface OptionLeg {
  id: string;
  type: OptionType;
  side: 'LONG' | 'SHORT';
  strike: number;
  entryPrice: number;
  ivPct: number;
  ratio: number;
}

export interface MultiLegHeatmapResult {
  dateLabels: string[];
  rows: HeatmapRow[];
  breakevens: number[];
  netCostUsd: number; // positive = debit paid, negative = credit received
  isNetCredit: boolean;
  riskCapitalUsd: number;
  maxProfitLabel: string;
  maxLossLabel: string;
  popPct: number;
  greeks: {
    delta: number;
    gamma: number;
    thetaDaily: number;
    vegaPer1Pct: number;
  };
  effectiveIvPct: number;
}

export const STRATEGY_PRESETS: Array<{ id: StrategyPresetId; label: string }> = [
  { id: 'SINGLE', label: 'Single Leg' },
  { id: 'BULL_CALL_SPREAD', label: 'Call Spread' },
  { id: 'BEAR_PUT_SPREAD', label: 'Put Spread' },
  { id: 'STRADDLE', label: 'Straddle' },
  { id: 'STRANGLE', label: 'Strangle' },
  { id: 'IRON_CONDOR', label: 'Iron Condor' },
];

const SQRT_2PI = Math.sqrt(2 * Math.PI);

/** Standard normal PDF */
export function normPdf(x: number): number {
  return Math.exp(-0.5 * x * x) / SQRT_2PI;
}

/** High-precision Abramowitz & Stegun approximation for Standard Normal CDF */
export function normCdf(x: number): number {
  if (x < -8) return 0;
  if (x > 8) return 1;
  const sign = x < 0 ? -1 : 1;
  const absX = Math.abs(x) / Math.SQRT2;
  const t = 1 / (1 + 0.3275911 * absX);
  const poly =
    t *
    (0.254829592 +
      t *
        (-0.284496736 +
          t * (1.421413741 + t * (-1.453152027 + t * 1.061405429))));
  const erf = 1 - poly * Math.exp(-absX * absX);
  return 0.5 * (1 + sign * erf);
}

export function priceBlackScholes({
  type,
  spot,
  strike,
  timeYears,
  iv,
  rate = 0.045,
}: BlackScholesInput): BlackScholesOutput {
  const safeSpot = Math.max(0.01, spot);
  const safeStrike = Math.max(0.01, strike);
  const intrinsic =
    type === 'CALL'
      ? Math.max(0, safeSpot - safeStrike)
      : Math.max(0, safeStrike - safeSpot);

  const safeIv = Math.max(0.01, Math.min(5, iv));

  if (timeYears <= 1e-6) {
    const itm =
      type === 'CALL' ? safeSpot > safeStrike : safeSpot < safeStrike;
    const delta =
      type === 'CALL' ? (itm ? 1 : 0) : itm ? -1 : 0;
    return {
      price: intrinsic,
      intrinsic,
      extrinsic: 0,
      delta,
      gamma: 0,
      thetaDaily: 0,
      vegaPer1Pct: 0,
      popLong: itm ? 100 : 0,
    };
  }

  const sqrtT = Math.sqrt(timeYears);
  const volSqrtT = safeIv * sqrtT;
  const d1 =
    (Math.log(safeSpot / safeStrike) +
      (rate + 0.5 * safeIv * safeIv) * timeYears) /
    volSqrtT;
  const d2 = d1 - volSqrtT;
  const df = Math.exp(-rate * timeYears);

  const nd1 = normCdf(d1);
  const nd2 = normCdf(d2);
  const nNegD1 = normCdf(-d1);
  const nNegD2 = normCdf(-d2);
  const pdfD1 = normPdf(d1);

  const rawPrice =
    type === 'CALL'
      ? safeSpot * nd1 - safeStrike * df * nd2
      : safeStrike * df * nNegD2 - safeSpot * nNegD1;

  const price = Math.max(intrinsic, rawPrice);
  const delta = type === 'CALL' ? nd1 : nd1 - 1;
  const gamma = pdfD1 / (safeSpot * volSqrtT);

  const thetaAnnual =
    type === 'CALL'
      ? (-safeSpot * pdfD1 * safeIv) / (2 * sqrtT) - rate * safeStrike * df * nd2
      : (-safeSpot * pdfD1 * safeIv) / (2 * sqrtT) + rate * safeStrike * df * nNegD2;
  const thetaDaily = thetaAnnual / 365;
  const vegaPer1Pct = (safeSpot * pdfD1 * sqrtT) / 100;
  const popLong = (type === 'CALL' ? nd2 : nNegD2) * 100;

  return {
    price,
    intrinsic,
    extrinsic: Math.max(0, price - intrinsic),
    delta,
    gamma,
    thetaDaily,
    vegaPer1Pct,
    popLong,
  };
}

function formatShortDate(ms: number): string {
  const d = new Date(ms);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

function roundToStrikeIncrement(raw: number, spot: number): number {
  const inc = spot >= 300 ? 10 : spot >= 100 ? 5 : spot >= 25 ? 2.5 : spot >= 10 ? 1 : 0.5;
  return Math.max(inc, Math.round(raw / inc) * inc);
}

/**
 * Builds realistic 1-to-4 leg option structures anchored around a live UOA contract.
 */
export function buildStrategyLegs(
  contract: OptionContractFlow,
  preset: StrategyPresetId,
): OptionLeg[] {
  const spot = Math.max(1, contract.spotPrice);
  const baseIv = contract.iv && contract.iv > 0 ? contract.iv : 48;
  const timeYears = Math.max(contract.dte, 0.25) / 365;
  const width = roundToStrikeIncrement(spot * 0.05, spot);
  const atmStrike = roundToStrikeIncrement(spot, spot);

  const theo = (type: OptionType, strike: number) =>
    Number(
      Math.max(
        0.05,
        priceBlackScholes({
          type,
          spot,
          strike,
          timeYears,
          iv: baseIv / 100,
        }).price,
      ).toFixed(2),
    );

  const liveEntry =
    contract.ask > 0
      ? contract.ask
      : contract.mark > 0
        ? contract.mark
        : theo(contract.type, contract.strike);

  if (preset === 'SINGLE') {
    return [
      {
        id: 'leg-1',
        type: contract.type,
        side: 'LONG',
        strike: contract.strike,
        entryPrice: Number(liveEntry.toFixed(2)),
        ivPct: baseIv,
        ratio: 1,
      },
    ];
  }

  if (preset === 'BULL_CALL_SPREAD') {
    const kLong = contract.type === 'CALL' ? contract.strike : atmStrike;
    const kShort = Number((kLong + width).toFixed(2));
    return [
      {
        id: 'leg-1',
        type: 'CALL',
        side: 'LONG',
        strike: kLong,
        entryPrice:
          contract.type === 'CALL' && kLong === contract.strike
            ? Number(liveEntry.toFixed(2))
            : theo('CALL', kLong),
        ivPct: baseIv,
        ratio: 1,
      },
      {
        id: 'leg-2',
        type: 'CALL',
        side: 'SHORT',
        strike: kShort,
        entryPrice: theo('CALL', kShort),
        ivPct: baseIv,
        ratio: 1,
      },
    ];
  }

  if (preset === 'BEAR_PUT_SPREAD') {
    const kLong = contract.type === 'PUT' ? contract.strike : atmStrike;
    const kShort = Math.max(0.5, Number((kLong - width).toFixed(2)));
    return [
      {
        id: 'leg-1',
        type: 'PUT',
        side: 'LONG',
        strike: kLong,
        entryPrice:
          contract.type === 'PUT' && kLong === contract.strike
            ? Number(liveEntry.toFixed(2))
            : theo('PUT', kLong),
        ivPct: baseIv,
        ratio: 1,
      },
      {
        id: 'leg-2',
        type: 'PUT',
        side: 'SHORT',
        strike: kShort,
        entryPrice: theo('PUT', kShort),
        ivPct: baseIv,
        ratio: 1,
      },
    ];
  }

  if (preset === 'STRADDLE') {
    return [
      {
        id: 'leg-1',
        type: 'CALL',
        side: 'LONG',
        strike: atmStrike,
        entryPrice:
          contract.type === 'CALL' && contract.strike === atmStrike
            ? Number(liveEntry.toFixed(2))
            : theo('CALL', atmStrike),
        ivPct: baseIv,
        ratio: 1,
      },
      {
        id: 'leg-2',
        type: 'PUT',
        side: 'LONG',
        strike: atmStrike,
        entryPrice:
          contract.type === 'PUT' && contract.strike === atmStrike
            ? Number(liveEntry.toFixed(2))
            : theo('PUT', atmStrike),
        ivPct: baseIv,
        ratio: 1,
      },
    ];
  }

  if (preset === 'STRANGLE') {
    const kCall = roundToStrikeIncrement(spot * 1.05, spot);
    const kPut = roundToStrikeIncrement(spot * 0.95, spot);
    return [
      {
        id: 'leg-1',
        type: 'CALL',
        side: 'LONG',
        strike: kCall,
        entryPrice: theo('CALL', kCall),
        ivPct: baseIv,
        ratio: 1,
      },
      {
        id: 'leg-2',
        type: 'PUT',
        side: 'LONG',
        strike: kPut,
        entryPrice: theo('PUT', kPut),
        ivPct: baseIv,
        ratio: 1,
      },
    ];
  }

  // IRON_CONDOR: Short OTM Put + Long Further OTM Put + Short OTM Call + Long Further OTM Call
  const shortCall = roundToStrikeIncrement(spot * 1.05, spot);
  const longCall = Number((shortCall + width).toFixed(2));
  const shortPut = roundToStrikeIncrement(spot * 0.95, spot);
  const longPut = Math.max(0.5, Number((shortPut - width).toFixed(2)));
  return [
    {
      id: 'leg-1',
      type: 'PUT',
      side: 'LONG',
      strike: longPut,
      entryPrice: theo('PUT', longPut),
      ivPct: baseIv,
      ratio: 1,
    },
    {
      id: 'leg-2',
      type: 'PUT',
      side: 'SHORT',
      strike: shortPut,
      entryPrice: theo('PUT', shortPut),
      ivPct: baseIv,
      ratio: 1,
    },
    {
      id: 'leg-3',
      type: 'CALL',
      side: 'SHORT',
      strike: shortCall,
      entryPrice: theo('CALL', shortCall),
      ivPct: baseIv,
      ratio: 1,
    },
    {
      id: 'leg-4',
      type: 'CALL',
      side: 'LONG',
      strike: longCall,
      entryPrice: theo('CALL', longCall),
      ivPct: baseIv,
      ratio: 1,
    },
  ];
}

function evalLegsPnlPerShare(
  legs: OptionLeg[],
  spotAtEval: number,
  timeYears: number,
  ivMult: number,
): { pnlPerShare: number; markPerShare: number } {
  let pnlPerShare = 0;
  let markPerShare = 0;
  for (const leg of legs) {
    const iv = Math.max(0.05, Math.min(4, (leg.ivPct / 100) * ivMult));
    const theo = priceBlackScholes({
      type: leg.type,
      spot: spotAtEval,
      strike: leg.strike,
      timeYears,
      iv,
    }).price;
    const sign = leg.side === 'LONG' ? 1 : -1;
    pnlPerShare += sign * (theo - leg.entryPrice) * leg.ratio;
    markPerShare += sign * theo * leg.ratio;
  }
  return { pnlPerShare, markPerShare };
}

/**
 * Multi-leg Black-Scholes Price x Date P&L Heatmap, combined Greeks,
 * exact expiration breakevens, max profit/loss, and log-normal Probability of Profit.
 */
export function buildMultiLegPayoffHeatmap(params: {
  legs: OptionLeg[];
  spot: number;
  dte: number;
  contracts: number;
  ivShiftPct?: number;
}): MultiLegHeatmapResult {
  const { legs, spot, dte, contracts, ivShiftPct = 0 } = params;
  const safeSpot = Math.max(0.5, spot);
  const safeContracts = Math.max(1, Math.round(contracts));
  const safeDte = Math.max(0, dte);
  const ivMult = Math.max(0.2, 1 + ivShiftPct / 100);
  const avgBaseIv =
    legs.length > 0
      ? legs.reduce((acc, l) => acc + l.ivPct, 0) / legs.length
      : 48;
  const effectiveIvPct = Number(
    Math.max(5, Math.min(400, avgBaseIv * ivMult)).toFixed(1),
  );
  const timeYearsNow = Math.max(safeDte, 0.25) / 365;

  // Net entry cost (+ debit paid, - credit received)
  const netEntryPerShare = legs.reduce(
    (acc, l) => acc + (l.side === 'LONG' ? 1 : -1) * l.entryPrice * l.ratio,
    0,
  );
  const netCostUsd = Number((netEntryPerShare * 100 * safeContracts).toFixed(0));
  const isNetCredit = netCostUsd < 0;

  // Combined live Greeks
  let delta = 0;
  let gamma = 0;
  let thetaDaily = 0;
  let vegaPer1Pct = 0;
  for (const leg of legs) {
    const iv = Math.max(0.05, Math.min(4, (leg.ivPct / 100) * ivMult));
    const g = priceBlackScholes({
      type: leg.type,
      spot: safeSpot,
      strike: leg.strike,
      timeYears: timeYearsNow,
      iv,
    });
    const mult = (leg.side === 'LONG' ? 1 : -1) * leg.ratio;
    delta += g.delta * mult;
    gamma += g.gamma * mult;
    thetaDaily += g.thetaDaily * mult;
    vegaPer1Pct += g.vegaPer1Pct * mult;
  }

  // Numerical scan of expiration payoff curve for breakevens, max profit, max loss, and POP
  const strikes = legs.map((l) => l.strike);
  const minStrike = Math.min(...strikes, safeSpot);
  const maxStrike = Math.max(...strikes, safeSpot);
  const scanLo = Math.max(0.01, Math.min(safeSpot * 0.25, minStrike * 0.5));
  const scanHi = Math.max(safeSpot * 2.4, maxStrike * 1.6);
  const N = 260;
  const stepScan = (scanHi - scanLo) / N;

  let maxExpPnl = Number.NEGATIVE_INFINITY;
  let minExpPnl = Number.POSITIVE_INFINITY;
  const breakevens: number[] = [];

  // Check tail slope as S -> infinity (net long calls vs short calls)
  const highTailSlope = legs.reduce((acc, l) => {
    if (l.type !== 'CALL') return acc;
    return acc + (l.side === 'LONG' ? 1 : -1) * l.ratio;
  }, 0);

  // Probability of Profit via log-normal interval integration over expiration
  const effIvDec = effectiveIvPct / 100;
  const drift = (0.045 - 0.5 * effIvDec * effIvDec) * timeYearsNow;
  const volT = effIvDec * Math.sqrt(timeYearsNow);
  const cdfAtPrice = (px: number) => {
    if (px <= 0.01) return 0;
    if (volT <= 1e-6) return safeSpot <= px ? 1 : 0;
    const z = (Math.log(px / safeSpot) - drift) / volT;
    return normCdf(z);
  };

  let prevPx = scanLo;
  let prevPnl = evalLegsPnlPerShare(legs, prevPx, 0, ivMult).pnlPerShare * 100 * safeContracts;
  maxExpPnl = Math.max(maxExpPnl, prevPnl);
  minExpPnl = Math.min(minExpPnl, prevPnl);
  let popMass = 0;

  for (let i = 1; i <= N; i += 1) {
    const px = scanLo + i * stepScan;
    const pnl = evalLegsPnlPerShare(legs, px, 0, ivMult).pnlPerShare * 100 * safeContracts;
    maxExpPnl = Math.max(maxExpPnl, pnl);
    minExpPnl = Math.min(minExpPnl, pnl);

    if ((prevPnl < 0 && pnl >= 0) || (prevPnl >= 0 && pnl < 0)) {
      const frac = Math.abs(prevPnl) / (Math.abs(prevPnl) + Math.abs(pnl) || 1);
      const be = Number((prevPx + (px - prevPx) * frac).toFixed(2));
      if (breakevens.length === 0 || Math.abs(be - breakevens[breakevens.length - 1]) > 0.05) {
        breakevens.push(be);
      }
    }

    const midPnl = (prevPnl + pnl) / 2;
    if (midPnl > 0) {
      popMass += Math.max(0, cdfAtPrice(px) - cdfAtPrice(prevPx));
    }

    prevPx = px;
    prevPnl = pnl;
  }
  if (highTailSlope > 0) {
    popMass += Math.max(0, 1 - cdfAtPrice(scanHi));
  }

  const popPct = Number(Math.max(0, Math.min(100, popMass * 100)).toFixed(1));
  const riskCapitalUsd = Math.max(
    1,
    Math.abs(minExpPnl) > 0 && Number.isFinite(minExpPnl) && highTailSlope >= 0
      ? Math.abs(minExpPnl)
      : Math.max(Math.abs(netCostUsd), 100),
  );

  const maxProfitLabel =
    highTailSlope > 0
      ? 'UNLIMITED'
      : `$${Math.max(0, Math.round(maxExpPnl)).toLocaleString('en-US')}`;
  const maxLossLabel =
    highTailSlope < 0
      ? 'UNLIMITED'
      : `-$${Math.abs(Math.min(0, Math.round(minExpPnl))).toLocaleString('en-US')}`;

  // Build 5 time columns
  const nowMs = Date.now();
  const fractions = safeDte <= 1 ? [0, 0.5, 1] : [0, 0.25, 0.5, 0.75, 1];
  const dateSteps = fractions.map((frac, idx) => {
    const remainingDays = Math.max(0, safeDte * (1 - frac));
    const label =
      idx === 0
        ? 'NOW'
        : idx === fractions.length - 1
          ? 'EXP'
          : formatShortDate(nowMs + safeDte * frac * 86_400_000);
    return {
      label,
      timeYears:
        idx === fractions.length - 1 ? 0 : Math.max(0.05 / 365, remainingDays / 365),
    };
  });

  // Build 13 price rows covering spot & all strikes
  const maxDistFromSpot = Math.max(
    ...strikes.map((k) => Math.abs(k - safeSpot) / safeSpot),
    0.06,
  );
  const spanPct = Math.min(0.35, Math.max(0.12, maxDistFromSpot + 0.07));
  const highPrice = safeSpot * (1 + spanPct);
  const lowPrice = Math.max(0.5, safeSpot * (1 - spanPct));
  const rowCount = 13;
  const step = (highPrice - lowPrice) / (rowCount - 1);

  const rawPrices: number[] = [];
  for (let i = 0; i < rowCount; i += 1) {
    rawPrices.push(Number((highPrice - i * step).toFixed(2)));
  }

  let closestSpotIdx = 0;
  let minSpotDiff = Number.POSITIVE_INFINITY;
  rawPrices.forEach((px, i) => {
    const sd = Math.abs(px - safeSpot);
    if (sd < minSpotDiff) {
      minSpotDiff = sd;
      closestSpotIdx = i;
    }
  });
  rawPrices[closestSpotIdx] = Number(safeSpot.toFixed(2));

  const strikeRowIndices = new Set<number>();
  for (const k of strikes) {
    let bestI = 0;
    let bestD = Number.POSITIVE_INFINITY;
    rawPrices.forEach((px, i) => {
      const d = Math.abs(px - k);
      if (d < bestD) {
        bestD = d;
        bestI = i;
      }
    });
    strikeRowIndices.add(bestI);
  }

  const rows: HeatmapRow[] = rawPrices.map((px, idx) => {
    const pctMove = Number((((px - safeSpot) / safeSpot) * 100).toFixed(1));
    const cells = dateSteps.map((stepInfo) => {
      const { pnlPerShare, markPerShare } = evalLegsPnlPerShare(
        legs,
        px,
        stepInfo.timeYears,
        ivMult,
      );
      const pnlUsd = Number((pnlPerShare * 100 * safeContracts).toFixed(0));
      const roiPct = Number(((pnlUsd / riskCapitalUsd) * 100).toFixed(0));
      return {
        pnlUsd,
        roiPct,
        optionPrice: Number(markPerShare.toFixed(2)),
      };
    });

    return {
      price: px,
      pctMove,
      isSpotRow: idx === closestSpotIdx,
      isStrikeRow: strikeRowIndices.has(idx),
      cells,
    };
  });

  return {
    dateLabels: dateSteps.map((s) => s.label),
    rows,
    breakevens: breakevens.slice(0, 2),
    netCostUsd,
    isNetCredit,
    riskCapitalUsd: Math.round(riskCapitalUsd),
    maxProfitLabel,
    maxLossLabel,
    popPct,
    greeks: {
      delta,
      gamma,
      thetaDaily,
      vegaPer1Pct,
    },
    effectiveIvPct,
  };
}

export function buildPayoffHeatmap(params: {
  type: OptionType;
  side: 'LONG' | 'SHORT';
  spot: number;
  strike: number;
  entryPrice: number;
  dte: number;
  ivPct: number;
  contracts: number;
  ivShiftPct?: number;
}): PayoffHeatmapResult {
  const {
    type,
    side,
    spot,
    strike,
    entryPrice,
    dte,
    ivPct,
    contracts,
    ivShiftPct = 0,
  } = params;

  const multi = buildMultiLegPayoffHeatmap({
    legs: [
      {
        id: 'single',
        type,
        side,
        strike,
        entryPrice,
        ivPct,
        ratio: 1,
      },
    ],
    spot,
    dte,
    contracts,
    ivShiftPct,
  });

  const timeYearsNow = Math.max(dte, 0.25) / 365;
  const greeks = priceBlackScholes({
    type,
    spot,
    strike,
    timeYears: timeYearsNow,
    iv: multi.effectiveIvPct / 100,
  });
  const breakeven =
    type === 'CALL'
      ? Number((strike + entryPrice).toFixed(2))
      : Number(Math.max(0.01, strike - entryPrice).toFixed(2));

  return {
    dateLabels: multi.dateLabels,
    rows: multi.rows,
    breakeven,
    costBasisUsd: Math.abs(multi.netCostUsd),
    maxProfitLabel: multi.maxProfitLabel,
    maxLossLabel: multi.maxLossLabel,
    popPct: multi.popPct,
    greeks,
    effectiveIvPct: multi.effectiveIvPct,
  };
}
