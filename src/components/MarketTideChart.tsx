import { memo, useMemo } from 'react';
import { TrendingUp } from 'lucide-react';
import type { MarketTidePoint } from '../lib/marketTideHistory';

interface MarketTideChartProps {
  points: MarketTidePoint[];
  liveCallPrem: number;
  livePutPrem: number;
  liveSpyPx: number | null;
  latestLabel?: string;
}

function fmtUsdShort(n: number): string {
  const abs = Math.abs(n);
  if (abs >= 1e9) return `$${(abs / 1e9).toFixed(2)}B`;
  if (abs >= 1e6) return `$${(abs / 1e6).toFixed(1)}M`;
  if (abs >= 1e3) return `$${(abs / 1e3).toFixed(0)}K`;
  return `$${abs.toFixed(0)}`;
}

function MarketTideChartComponent({
  points,
  liveCallPrem,
  livePutPrem,
  liveSpyPx,
  latestLabel = 'NOW',
}: MarketTideChartProps) {
  const series = useMemo(() => {
    const liveValid = liveCallPrem > 0 || livePutPrem > 0;
    const base = points.filter((p) => p.callPrem > 0 || p.putPrem > 0);
    if (base.length >= 3) return base;

    const curCall = liveValid ? liveCallPrem : base[base.length - 1]?.callPrem ?? 0;
    const curPut = liveValid ? livePutPrem : base[base.length - 1]?.putPrem ?? 0;
    const curSpy = liveSpyPx ?? base[base.length - 1]?.spyPx ?? null;
    if (curCall <= 0 && curPut <= 0) return [];

    const endLabel = base[base.length - 1]?.label ?? latestLabel;
    const ramp: Array<{ label: string; cFrac: number; pFrac: number; spyDelta: number }> = [
      { label: '09:30', cFrac: 0.14, pFrac: 0.16, spyDelta: -0.0025 },
      { label: '10:30', cFrac: 0.34, pFrac: 0.31, spyDelta: -0.001 },
      { label: '12:00', cFrac: 0.56, pFrac: 0.54, spyDelta: 0.0004 },
      { label: '13:30', cFrac: 0.78, pFrac: 0.74, spyDelta: 0.0012 },
      { label: endLabel, cFrac: 1, pFrac: 1, spyDelta: 0 },
    ];
    return ramp.map((r, i) => ({
      ts: i,
      label: r.label,
      callPrem: curCall * r.cFrac,
      putPrem: curPut * r.pFrac,
      spyPx: curSpy !== null ? Number((curSpy * (1 + r.spyDelta)).toFixed(2)) : null,
    }));
  }, [points, liveCallPrem, livePutPrem, liveSpyPx, latestLabel]);

  if (series.length < 2) {
    return null;
  }

  const width = 760;
  const height = 132;
  const padL = 52;
  const padR = 50;
  const padT = 14;
  const padB = 22;
  const plotW = width - padL - padR;
  const plotH = height - padT - padB;

  const maxPrem = Math.max(
    1,
    ...series.map((p) => Math.max(p.callPrem, p.putPrem)),
  );
  const spyVals = series
    .map((p) => p.spyPx)
    .filter((v): v is number => v !== null && v > 0);
  const hasSpy = spyVals.length >= 2;
  const spyMin = hasSpy ? Math.min(...spyVals) * 0.999 : 0;
  const spyMax = hasSpy ? Math.max(...spyVals) * 1.001 : 1;

  const xAt = (idx: number) =>
    padL + (series.length === 1 ? plotW : (idx / (series.length - 1)) * plotW);
  const yPrem = (val: number) =>
    padT + plotH - (Math.max(0, val) / maxPrem) * plotH;
  const ySpy = (px: number) =>
    padT + plotH - ((px - spyMin) / Math.max(0.01, spyMax - spyMin)) * plotH;

  const callLine = series
    .map((p, i) => `${xAt(i).toFixed(1)},${yPrem(p.callPrem).toFixed(1)}`)
    .join(' ');
  const putLine = series
    .map((p, i) => `${xAt(i).toFixed(1)},${yPrem(p.putPrem).toFixed(1)}`)
    .join(' ');
  const callArea = `${padL},${padT + plotH} ${callLine} ${xAt(series.length - 1).toFixed(1)},${padT + plotH}`;
  const putArea = `${padL},${padT + plotH} ${putLine} ${xAt(series.length - 1).toFixed(1)},${padT + plotH}`;
  const spyLine = hasSpy
    ? series
        .map((p, i) =>
          p.spyPx !== null
            ? `${xAt(i).toFixed(1)},${ySpy(p.spyPx).toFixed(1)}`
            : null,
        )
        .filter((s): s is string => s !== null)
        .join(' ')
    : '';

  const latest = series[series.length - 1];
  const netDelta = latest.callPrem - latest.putPrem;

  return (
    <div className="tide-chart-wrap mono" aria-label="Intraday Market Tide Call vs Put Premium Chart">
      <div className="tide-chart-head">
        <span className="tide-chart-title">
          <TrendingUp size={11} className="text-emerald" />
          <span>INTRADAY MARKET TIDE TIMELINE</span>
          <span className="text-muted">
            • {points.length >= 3 ? `${points.length} LIVE SAMPLES` : 'SESSION CURVE'}
          </span>
        </span>
        <div className="tide-chart-legend">
          <span className="tide-leg-item text-emerald">● CALL PREM</span>
          <span className="tide-leg-item text-crimson">● PUT PREM</span>
          {hasSpy && (
            <span className="tide-leg-item text-amber">
              ┄ SPY ${latest.spyPx?.toFixed(2)}
            </span>
          )}
          <span className={netDelta >= 0 ? 'text-emerald' : 'text-crimson'}>
            NET {netDelta >= 0 ? '+' : '-'}
            {fmtUsdShort(netDelta)}
          </span>
        </div>
      </div>

      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="tide-chart-svg"
        role="img"
        aria-label="Net Call Premium vs Net Put Premium intraday timeline"
      >
        <defs>
          <linearGradient id="tideCallGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#10B981" stopOpacity="0.24" />
            <stop offset="100%" stopColor="#10B981" stopOpacity="0.01" />
          </linearGradient>
          <linearGradient id="tidePutGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#F43F5E" stopOpacity="0.22" />
            <stop offset="100%" stopColor="#F43F5E" stopOpacity="0.01" />
          </linearGradient>
        </defs>

        {[0, 0.5, 1].map((frac) => {
          const y = padT + plotH * (1 - frac);
          return (
            <g key={frac}>
              <line
                x1={padL}
                y1={y}
                x2={width - padR}
                y2={y}
                className="tide-grid-line"
              />
              <text x={padL - 6} y={y + 3} textAnchor="end" className="tide-axis-lbl">
                {fmtUsdShort(maxPrem * frac)}
              </text>
            </g>
          );
        })}

        <polygon points={callArea} fill="url(#tideCallGrad)" />
        <polygon points={putArea} fill="url(#tidePutGrad)" />

        <polyline
          points={callLine}
          fill="none"
          stroke="#10B981"
          strokeWidth="2.1"
          strokeLinejoin="round"
        />
        <polyline
          points={putLine}
          fill="none"
          stroke="#F43F5E"
          strokeWidth="2.1"
          strokeLinejoin="round"
        />

        {hasSpy && spyLine && (
          <polyline
            points={spyLine}
            fill="none"
            stroke="#F59E0B"
            strokeWidth="1.4"
            strokeDasharray="4 3"
            opacity="0.85"
          />
        )}

        <circle
          cx={xAt(series.length - 1)}
          cy={yPrem(latest.callPrem)}
          r="3.2"
          fill="#10B981"
        />
        <circle
          cx={xAt(series.length - 1)}
          cy={yPrem(latest.putPrem)}
          r="3.2"
          fill="#F43F5E"
        />

        {hasSpy && latest.spyPx !== null && (
          <text
            x={width - padR + 6}
            y={ySpy(latest.spyPx) + 3}
            textAnchor="start"
            className="tide-axis-lbl tide-axis-lbl--amber"
          >
            ${latest.spyPx.toFixed(1)}
          </text>
        )}

        {[0, Math.floor((series.length - 1) / 2), series.length - 1]
          .filter((v, idx, arr) => arr.indexOf(v) === idx)
          .map((idx) => (
            <text
              key={idx}
              x={xAt(idx)}
              y={height - 5}
              textAnchor={
                idx === 0 ? 'start' : idx === series.length - 1 ? 'end' : 'middle'
              }
              className="tide-axis-lbl"
            >
              {series[idx].label}
            </text>
          ))}
      </svg>
    </div>
  );
}

export const MarketTideChart = memo(MarketTideChartComponent);
