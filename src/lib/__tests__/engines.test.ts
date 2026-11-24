import { describe, expect, it } from 'vitest';
import {
  getNextMacroCatalyst,
  getTickerCatalystStatus,
} from '../catalystCalendar';
import { computeTickerConfluence } from '../confluenceEngine';
import { normCdf, priceBlackScholes } from '../optionsPricing';
import {
  createPriceAlert,
  evaluateAlertsWithPrices,
  type PriceAlert,
} from '../priceAlerts';
import {
  analyzeCboeOptionsPayload,
  parseOccSymbol,
  toCboeOptionSymbol,
} from '../whaleFlowEngine';

describe('optionsPricing', () => {
  it('normCdf is a valid CDF', () => {
    expect(normCdf(0)).toBeCloseTo(0.5, 5);
    expect(normCdf(1.96)).toBeCloseTo(0.975, 3);
    expect(normCdf(-1.96)).toBeCloseTo(0.025, 3);
    expect(normCdf(-20)).toBe(0);
    expect(normCdf(20)).toBe(1);
  });

  it('Black-Scholes matches a known reference value', () => {
    // S=100 K=100 T=1 r=5% sigma=20% -> call ≈ 10.4506, put ≈ 5.5735
    const call = priceBlackScholes({
      type: 'CALL', spot: 100, strike: 100, timeYears: 1, iv: 0.2, rate: 0.05,
    });
    const put = priceBlackScholes({
      type: 'PUT', spot: 100, strike: 100, timeYears: 1, iv: 0.2, rate: 0.05,
    });
    expect(call.price).toBeCloseTo(10.45, 1);
    expect(put.price).toBeCloseTo(5.57, 1);
    // put-call parity: C - P = S - K e^{-rT}
    expect(call.price - put.price).toBeCloseTo(100 - 100 * Math.exp(-0.05), 1);
    expect(call.delta).toBeGreaterThan(0.5);
    expect(put.delta).toBeLessThan(0);
  });

  it('expired option collapses to intrinsic value', () => {
    const itm = priceBlackScholes({
      type: 'CALL', spot: 110, strike: 100, timeYears: 0, iv: 0.3,
    });
    expect(itm.price).toBeCloseTo(10, 5);
    const otm = priceBlackScholes({
      type: 'CALL', spot: 90, strike: 100, timeYears: 0, iv: 0.3,
    });
    expect(otm.price).toBeCloseTo(0, 5);
  });
});

describe('priceAlerts', () => {
  it('picks direction from current price and rejects bad input', () => {
    expect(
      createPriceAlert({ ticker: '$nvda', targetPrice: 150, currentPrice: 140 })
        ?.condition,
    ).toBe('ABOVE');
    expect(
      createPriceAlert({ ticker: 'NVDA', targetPrice: 120, currentPrice: 140 })
        ?.condition,
    ).toBe('BELOW');
    expect(createPriceAlert({ ticker: '', targetPrice: 10 })).toBeNull();
    expect(createPriceAlert({ ticker: 'X', targetPrice: -1 })).toBeNull();
    expect(createPriceAlert({ ticker: 'X', targetPrice: NaN })).toBeNull();
  });

  it('triggers only the alerts whose threshold is crossed', () => {
    const base = {
      label: 't', createdAt: 0, status: 'ACTIVE' as const,
    };
    const alerts: PriceAlert[] = [
      { ...base, id: 'a', ticker: 'AAA', targetPrice: 100, condition: 'ABOVE' },
      { ...base, id: 'b', ticker: 'BBB', targetPrice: 50, condition: 'BELOW' },
      { ...base, id: 'c', ticker: 'CCC', targetPrice: 10, condition: 'ABOVE' },
    ];
    const res = evaluateAlertsWithPrices(alerts, { AAA: 101, BBB: 60 });
    expect(res.newlyTriggered.map((a) => a.id)).toEqual(['a']);
    expect(res.alerts.find((a) => a.id === 'b')?.status).toBe('ACTIVE');
    // nothing triggered -> same array reference (no needless state updates)
    const none = evaluateAlertsWithPrices(alerts, { AAA: 1 });
    expect(none.alerts).toBe(alerts);
  });
});

describe('catalystCalendar', () => {
  it('never returns a macro event in the past', () => {
    const next = getNextMacroCatalyst(new Date('2026-01-01T12:00:00Z'));
    expect(next).not.toBeNull();
    expect(next!.daysUntil).toBeGreaterThanOrEqual(0);
  });

  it('returns null once every event is behind us', () => {
    expect(getNextMacroCatalyst(new Date('2100-01-01T00:00:00Z'))).toBeNull();
  });

  it('status has no earnings for an unknown ticker', () => {
    const s = getTickerCatalystStatus(
      'ZZZZZ', null, new Date('2026-01-01T12:00:00Z'),
    );
    expect(s.earnings).toBeNull();
  });
});

describe('whaleFlowEngine parsing', () => {
  it('parses OCC symbols', () => {
    expect(parseOccSymbol('NVDA260116C00150000')).toEqual({
      root: 'NVDA', expiration: '2026-01-16', type: 'CALL', strike: 150,
    });
    expect(parseOccSymbol('SPY261218P00500500')?.strike).toBe(500.5);
    expect(parseOccSymbol('garbage')).toBeNull();
  });

  it('maps index aliases to CBOE option roots', () => {
    expect(toCboeOptionSymbol('SP500')).toBe('SPY');
    expect(toCboeOptionSymbol('xyz100')).toBe('QQQ');
    expect(toCboeOptionSymbol('BRK.B')).toBe('BRKB');
  });

  it('returns null for empty chains and flags call-heavy flow as BULLISH', () => {
    expect(analyzeCboeOptionsPayload('X', { data: { options: [] } })).toBeNull();

    const row = (sym: string, volume: number) => ({
      option: sym, volume, open_interest: 1000, bid: 2, ask: 2.2,
      last_trade_price: 2.1, iv: 0.5, delta: 0.5, gamma: 0.01,
    });
    const res = analyzeCboeOptionsPayload('TEST', {
      data: {
        current_price: 100,
        options: [
          row('TEST990116C00100000', 5000),
          row('TEST990116P00100000', 200),
        ],
      },
    });
    expect(res).not.toBeNull();
    expect(res!.callVolume).toBe(5000);
    expect(res!.putVolume).toBe(200);
    expect(res!.flowBias).toBe('BULLISH');
  });
});

describe('confluenceEngine', () => {
  it('produces a bounded, well-formed report with 5 pillars', () => {
    const r = computeTickerConfluence({
      ticker: 'nvda', price: 150, changePct: 3.2,
    });
    expect(r.ticker).toBe('NVDA');
    expect(r.pillars).toHaveLength(5);
    expect(r.score).toBeGreaterThanOrEqual(0);
    expect(r.score).toBeLessThanOrEqual(100);
    expect(r.alignedCount).toBeLessThanOrEqual(r.activePillars);
  });

  it('bullish options flow lights up the WHALE pillar bullish', () => {
    const r = computeTickerConfluence({
      ticker: 'NVDA', price: 150, changePct: 1,
      optionsSummary: {
        ticker: 'NVDA', spotPrice: 150, updatedAt: Date.now(),
        callVolume: 90000, putVolume: 20000, putCallVolRatio: 0.22,
        callPremiumUsd: 40_000_000, putPremiumUsd: 8_000_000,
        netPremiumUsd: 32_000_000, flowBias: 'BULLISH',
        maxPainStrike: null, maxPainExpiration: null,
        netGammaRegime: 'NEUTRAL', netGexUsd: 0,
        callWall: 160, putWall: 140, gammaFlip: null,
        expectedMoveUsd: null, expectedMovePct: null, expectedMoveExp: null,
        ivSkewPct: null, gexProfile: [], ivTermStructure: [],
        unusualContracts: [], source: 'cboe',
      },
    });
    const whale = r.pillars.find((p) => p.id === 'whale');
    expect(whale?.active).toBe(true);
    expect(whale?.direction).toBe('bull');
  });
});
