export interface MacroEvent {
  id: string;
  title: string;
  shortLabel: string;
  dateIso: string; // YYYY-MM-DD
  timeEt: string;
  impact: 'HIGH' | 'ELEVATED';
  note: string;
}

export interface EarningsEvent {
  ticker: string;
  dateIso: string; // YYYY-MM-DD
  timing: 'BMO' | 'AMC';
  estImpliedMovePct: number;
  quarterLabel: string;
}

export interface UpcomingMacroCatalyst extends MacroEvent {
  daysUntil: number;
  countdownLabel: string;
}

export interface TickerCatalystStatus {
  earnings: (EarningsEvent & { daysUntil: number; countdownLabel: string }) | null;
  nextMacro: UpcomingMacroCatalyst | null;
  warningLabel: string | null;
  warningTone: 'crimson' | 'amber' | null;
}

// High-impact US macro catalyst dates (FOMC, CPI, NFP, PCE) spanning late 2026 -> 2027
const MACRO_EVENTS: MacroEvent[] = [
  {
    id: 'pce-2026-11',
    title: 'US Core PCE Inflation Print',
    shortLabel: 'CORE PCE',
    dateIso: '2026-11-25',
    timeEt: '08:30 ET',
    impact: 'HIGH',
    note: 'Fed preferred inflation gauge — rates & mega-cap tech vol catalyst',
  },
  {
    id: 'nfp-2026-12',
    title: 'US Non-Farm Payrolls (NFP)',
    shortLabel: 'US NFP',
    dateIso: '2026-12-04',
    timeEt: '08:30 ET',
    impact: 'HIGH',
    note: 'Monthly labor report & unemployment rate',
  },
  {
    id: 'cpi-2026-12',
    title: 'US CPI Inflation Report',
    shortLabel: 'US CPI',
    dateIso: '2026-12-10',
    timeEt: '08:30 ET',
    impact: 'HIGH',
    note: 'Headline & Core Consumer Price Index',
  },
  {
    id: 'fomc-2026-12',
    title: 'FOMC Rate Decision & Dot Plot',
    shortLabel: 'FOMC SEP',
    dateIso: '2026-12-16',
    timeEt: '14:00 ET',
    impact: 'HIGH',
    note: 'Federal Reserve rate decision, Summary of Economic Projections & Powell presser',
  },
  {
    id: 'opex-2026-12',
    title: 'Quarterly Quad Witching OpEx',
    shortLabel: 'QUAD WITCH',
    dateIso: '2026-12-18',
    timeEt: '16:00 ET',
    impact: 'ELEVATED',
    note: 'Major index & single-stock options/futures gamma unpinning',
  },
  {
    id: 'nfp-2027-01',
    title: 'US Non-Farm Payrolls (Jan)',
    shortLabel: 'US NFP',
    dateIso: '2027-01-08',
    timeEt: '08:30 ET',
    impact: 'HIGH',
    note: 'First labor print of 2027',
  },
  {
    id: 'cpi-2027-01',
    title: 'US CPI Inflation Report (Jan)',
    shortLabel: 'US CPI',
    dateIso: '2027-01-13',
    timeEt: '08:30 ET',
    impact: 'HIGH',
    note: 'December CPI print',
  },
  {
    id: 'fomc-2027-01',
    title: 'FOMC Rate Decision',
    shortLabel: 'FOMC',
    dateIso: '2027-01-27',
    timeEt: '14:00 ET',
    impact: 'HIGH',
    note: 'Federal Reserve policy decision & press conference',
  },
  {
    id: 'fomc-2027-03',
    title: 'FOMC Rate Decision & Dot Plot',
    shortLabel: 'FOMC SEP',
    dateIso: '2027-03-17',
    timeEt: '14:00 ET',
    impact: 'HIGH',
    note: 'Q1 SEP & rate path update',
  },
];

// Curated earnings schedule + historical ATM options-implied move baselines for active US leaders & IPOs
const EARNINGS_SCHEDULE: EarningsEvent[] = [
  { ticker: 'CRWD', dateIso: '2026-12-01', timing: 'AMC', estImpliedMovePct: 8.6, quarterLabel: 'Q3 FY27' },
  { ticker: 'SNOW', dateIso: '2026-12-02', timing: 'AMC', estImpliedMovePct: 10.4, quarterLabel: 'Q3 FY27' },
  { ticker: 'CRM', dateIso: '2026-12-03', timing: 'AMC', estImpliedMovePct: 6.4, quarterLabel: 'Q3 FY27' },
  { ticker: 'AVGO', dateIso: '2026-12-10', timing: 'AMC', estImpliedMovePct: 7.8, quarterLabel: 'Q4 FY26' },
  { ticker: 'ORCL', dateIso: '2026-12-09', timing: 'AMC', estImpliedMovePct: 7.2, quarterLabel: 'Q2 FY27' },
  { ticker: 'ADBE', dateIso: '2026-12-11', timing: 'AMC', estImpliedMovePct: 6.9, quarterLabel: 'Q4 FY26' },
  { ticker: 'MU', dateIso: '2026-12-17', timing: 'AMC', estImpliedMovePct: 9.2, quarterLabel: 'Q1 FY27' },
  { ticker: 'NKE', dateIso: '2026-12-18', timing: 'AMC', estImpliedMovePct: 7.4, quarterLabel: 'Q2 FY27' },
  { ticker: 'FDX', dateIso: '2026-12-17', timing: 'AMC', estImpliedMovePct: 6.8, quarterLabel: 'Q2 FY27' },
  { ticker: 'JPM', dateIso: '2027-01-15', timing: 'BMO', estImpliedMovePct: 4.1, quarterLabel: 'Q4 2026' },
  { ticker: 'GS', dateIso: '2027-01-15', timing: 'BMO', estImpliedMovePct: 4.5, quarterLabel: 'Q4 2026' },
  { ticker: 'NFLX', dateIso: '2027-01-21', timing: 'AMC', estImpliedMovePct: 8.5, quarterLabel: 'Q4 2026' },
  { ticker: 'TSLA', dateIso: '2027-01-27', timing: 'AMC', estImpliedMovePct: 9.1, quarterLabel: 'Q4 2026' },
  { ticker: 'MSFT', dateIso: '2027-01-27', timing: 'AMC', estImpliedMovePct: 5.2, quarterLabel: 'Q2 FY27' },
  { ticker: 'META', dateIso: '2027-01-28', timing: 'AMC', estImpliedMovePct: 7.6, quarterLabel: 'Q4 2026' },
  { ticker: 'AAPL', dateIso: '2027-01-29', timing: 'AMC', estImpliedMovePct: 4.4, quarterLabel: 'Q1 FY27' },
  { ticker: 'AMD', dateIso: '2027-02-02', timing: 'AMC', estImpliedMovePct: 8.4, quarterLabel: 'Q4 2026' },
  { ticker: 'GOOGL', dateIso: '2027-02-03', timing: 'AMC', estImpliedMovePct: 5.8, quarterLabel: 'Q4 2026' },
  { ticker: 'PLTR', dateIso: '2027-02-03', timing: 'AMC', estImpliedMovePct: 12.6, quarterLabel: 'Q4 2026' },
  { ticker: 'AMZN', dateIso: '2027-02-04', timing: 'AMC', estImpliedMovePct: 6.2, quarterLabel: 'Q4 2026' },
  { ticker: 'ARM', dateIso: '2027-02-04', timing: 'AMC', estImpliedMovePct: 10.8, quarterLabel: 'Q3 FY27' },
  { ticker: 'COIN', dateIso: '2027-02-11', timing: 'AMC', estImpliedMovePct: 11.4, quarterLabel: 'Q4 2026' },
  { ticker: 'CRWV', dateIso: '2027-02-18', timing: 'AMC', estImpliedMovePct: 13.5, quarterLabel: 'Q4 2026' },
  { ticker: 'NVDA', dateIso: '2027-02-24', timing: 'AMC', estImpliedMovePct: 8.9, quarterLabel: 'Q4 FY27' },
  { ticker: 'ANT', dateIso: '2027-02-25', timing: 'AMC', estImpliedMovePct: 14.2, quarterLabel: '1st Public Q' },
  { ticker: 'SPCX', dateIso: '2027-02-10', timing: 'AMC', estImpliedMovePct: 11.8, quarterLabel: 'Q4 2026' },
];

const EARNINGS_MAP = new Map<string, EarningsEvent>(
  EARNINGS_SCHEDULE.map((e) => [e.ticker, e]),
);

function startOfUtcDayMs(date: Date): number {
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
}

function parseIsoDayMs(iso: string): number {
  const [y, m, d] = iso.split('-').map(Number);
  return Date.UTC(y || 2026, (m || 1) - 1, d || 1);
}

function formatCountdown(daysUntil: number): string {
  if (daysUntil <= 0) return 'TODAY';
  if (daysUntil === 1) return 'TOMORROW';
  return `IN ${daysUntil}D`;
}

export function getNextMacroCatalyst(now: Date = new Date()): UpcomingMacroCatalyst | null {
  const todayMs = startOfUtcDayMs(now);
  let best: UpcomingMacroCatalyst | null = null;

  for (const ev of MACRO_EVENTS) {
    const evMs = parseIsoDayMs(ev.dateIso);
    const daysUntil = Math.round((evMs - todayMs) / 86_400_000);
    if (daysUntil < 0) continue;
    if (!best || daysUntil < best.daysUntil) {
      best = {
        ...ev,
        daysUntil,
        countdownLabel: formatCountdown(daysUntil),
      };
    }
  }
  return best;
}

export function getUpcomingEarnings(
  ticker: string,
  liveImpliedMovePct?: number | null,
  now: Date = new Date(),
): (EarningsEvent & { daysUntil: number; countdownLabel: string }) | null {
  const ev = EARNINGS_MAP.get(ticker.toUpperCase());
  if (!ev) return null;
  const todayMs = startOfUtcDayMs(now);
  const daysUntil = Math.round((parseIsoDayMs(ev.dateIso) - todayMs) / 86_400_000);
  if (daysUntil < 0) return null;

  const estImpliedMovePct =
    liveImpliedMovePct != null && Number.isFinite(liveImpliedMovePct) && liveImpliedMovePct > 0
      ? Number(liveImpliedMovePct.toFixed(1))
      : ev.estImpliedMovePct;

  return {
    ...ev,
    estImpliedMovePct,
    daysUntil,
    countdownLabel: formatCountdown(daysUntil),
  };
}

export function getTickerCatalystStatus(
  ticker: string,
  liveImpliedMovePct?: number | null,
  now: Date = new Date(),
): TickerCatalystStatus {
  const earnings = getUpcomingEarnings(ticker, liveImpliedMovePct, now);
  const nextMacro = getNextMacroCatalyst(now);

  if (earnings && earnings.daysUntil <= 7) {
    return {
      earnings,
      nextMacro,
      warningLabel: `EARNINGS ${earnings.countdownLabel} (${earnings.timing}) • ±${earnings.estImpliedMovePct.toFixed(1)}% IMPLIED`,
      warningTone: 'crimson',
    };
  }

  if (earnings && earnings.daysUntil <= 21) {
    return {
      earnings,
      nextMacro,
      warningLabel: `EARNINGS ${earnings.countdownLabel} • ±${earnings.estImpliedMovePct.toFixed(1)}% IMPLIED`,
      warningTone: 'amber',
    };
  }

  if (nextMacro && nextMacro.daysUntil <= 3) {
    return {
      earnings,
      nextMacro,
      warningLabel: `${nextMacro.shortLabel} ${nextMacro.countdownLabel} (${nextMacro.timeEt})`,
      warningTone: nextMacro.daysUntil <= 1 ? 'crimson' : 'amber',
    };
  }

  return {
    earnings,
    nextMacro,
    warningLabel: null,
    warningTone: null,
  };
}
