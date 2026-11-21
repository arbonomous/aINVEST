import type { OptionType } from './whaleFlowEngine';

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
  popLong: number; // 0..100 probability of finishing ITM / profitable approx
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

  const safeSpot = Math.max(0.5, spot);
  const safeStrike = Math.max(0.5, strike);
  const safeEntry = Math.max(0.01, entryPrice);
  const safeContracts = Math.max(1, Math.round(contracts));
  const safeDte = Math.max(0, dte);
  const effectiveIvPct = Math.max(5, Math.min(400, ivPct * (1 + ivShiftPct / 100)));
  const effectiveIv = effectiveIvPct / 100;

  const timeYearsNow = Math.max(safeDte, 0.25) / 365;
  const currentGreeks = priceBlackScholes({
    type,
    spot: safeSpot,
    strike: safeStrike,
    timeYears: timeYearsNow,
    iv: effectiveIv,
  });

  const breakeven =
    type === 'CALL'
      ? Number((safeStrike + safeEntry).toFixed(2))
      : Number(Math.max(0.01, safeStrike - safeEntry).toFixed(2));

  // Probability of reaching breakeven at expiration
  const beD2 =
    safeDte > 0
      ? (Math.log(safeSpot / breakeven) +
          (0.045 - 0.5 * effectiveIv * effectiveIv) * timeYearsNow) /
        (effectiveIv * Math.sqrt(timeYearsNow))
      : safeSpot > breakeven
        ? 8
        : -8;
  const probAboveBe = normCdf(beD2) * 100;
  const popLongBe = type === 'CALL' ? probAboveBe : 100 - probAboveBe;
  const popPct = Number(
    (side === 'LONG' ? popLongBe : 100 - popLongBe).toFixed(1),
  );

  const costBasisUsd = safeEntry * 100 * safeContracts;
  const maxProfitLabel =
    side === 'LONG'
      ? type === 'CALL'
        ? 'UNLIMITED'
        : `$${Math.max(0, (safeStrike - safeEntry) * 100 * safeContracts).toLocaleString('en-US', { maximumFractionDigits: 0 })}`
      : `$${costBasisUsd.toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
  const maxLossLabel =
    side === 'LONG'
      ? `-$${costBasisUsd.toLocaleString('en-US', { maximumFractionDigits: 0 })}`
      : type === 'CALL'
        ? 'UNLIMITED'
        : `-$${Math.max(0, (safeStrike - safeEntry) * 100 * safeContracts).toLocaleString('en-US', { maximumFractionDigits: 0 })}`;

  // Build 5 time columns from Today to Expiration
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
      timeYears: idx === fractions.length - 1 ? 0 : Math.max(0.05 / 365, remainingDays / 365),
    };
  });

  // Build 13 price rows covering spot, strike, and ±15% range
  const spanPct = Math.min(
    0.35,
    Math.max(
      0.12,
      Math.abs(safeStrike - safeSpot) / safeSpot + 0.08,
    ),
  );
  const highPrice = safeSpot * (1 + spanPct);
  const lowPrice = Math.max(0.5, safeSpot * (1 - spanPct));
  const rowCount = 13;
  const step = (highPrice - lowPrice) / (rowCount - 1);

  const rawPrices: number[] = [];
  for (let i = 0; i < rowCount; i += 1) {
    rawPrices.push(Number((highPrice - i * step).toFixed(2)));
  }

  let closestSpotIdx = 0;
  let closestStrikeIdx = 0;
  let minSpotDiff = Number.POSITIVE_INFINITY;
  let minStrikeDiff = Number.POSITIVE_INFINITY;
  rawPrices.forEach((px, i) => {
    const sd = Math.abs(px - safeSpot);
    if (sd < minSpotDiff) {
      minSpotDiff = sd;
      closestSpotIdx = i;
    }
    const kd = Math.abs(px - safeStrike);
    if (kd < minStrikeDiff) {
      minStrikeDiff = kd;
      closestStrikeIdx = i;
    }
  });
  rawPrices[closestSpotIdx] = Number(safeSpot.toFixed(2));

  const rows: HeatmapRow[] = rawPrices.map((px, idx) => {
    const pctMove = Number((((px - safeSpot) / safeSpot) * 100).toFixed(1));
    const cells = dateSteps.map((stepInfo) => {
      const theo = priceBlackScholes({
        type,
        spot: px,
        strike: safeStrike,
        timeYears: stepInfo.timeYears,
        iv: effectiveIv,
      }).price;
      const diffPerShare = side === 'LONG' ? theo - safeEntry : safeEntry - theo;
      const pnlUsd = Number((diffPerShare * 100 * safeContracts).toFixed(0));
      const roiPct = Number(
        (costBasisUsd > 0 ? (pnlUsd / costBasisUsd) * 100 : 0).toFixed(0),
      );
      return {
        pnlUsd,
        roiPct,
        optionPrice: Number(theo.toFixed(2)),
      };
    });

    return {
      price: px,
      pctMove,
      isSpotRow: idx === closestSpotIdx,
      isStrikeRow: idx === closestStrikeIdx,
      cells,
    };
  });

  return {
    dateLabels: dateSteps.map((s) => s.label),
    rows,
    breakeven,
    costBasisUsd,
    maxProfitLabel,
    maxLossLabel,
    popPct,
    greeks: currentGreeks,
    effectiveIvPct: Number(effectiveIvPct.toFixed(1)),
  };
}
