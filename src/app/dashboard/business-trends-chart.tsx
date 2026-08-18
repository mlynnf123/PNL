'use client';

import { ArrowDown, ArrowUp } from 'lucide-react';
import { useState } from 'react';
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Card } from '@/components/ui';
import { cn } from '@/lib/utils';
import type { TrendPoint } from '@/server/queries/business-trends';

type MetricKey = 'revenue' | 'collections' | 'costs' | 'dealsSigned';

const fmtCurrency = (v: number) => {
  const abs = Math.abs(v);
  if (abs >= 1000) return `$${(v / 1000).toFixed(abs >= 100000 ? 0 : 1)}k`;
  return `$${Math.round(v)}`;
};
const fmtCount = (v: number) => v.toLocaleString();

interface Metric {
  key: MetricKey;
  label: string;
  color: string;
  format: (n: number) => string;
  /** For costs, a decrease month-over-month is the good direction. */
  lowerIsBetter?: boolean;
}

// Slate/teal-aligned accents: teal for topline, sky for cash, amber for costs,
// violet for deal count. Concrete hex so recharts strokes resolve everywhere.
const ALL_METRICS: Metric[] = [
  { key: 'revenue', label: 'Revenue', color: '#0d9488', format: fmtCurrency },
  { key: 'collections', label: 'Collections', color: '#0ea5e9', format: fmtCurrency },
  { key: 'costs', label: 'Costs', color: '#f59e0b', format: fmtCurrency, lowerIsBetter: true },
  { key: 'dealsSigned', label: 'Deals signed', color: '#8b5cf6', format: fmtCount },
];

const monthShort = (iso: string) =>
  new Date(`${iso}T00:00:00`).toLocaleDateString('en-US', { month: 'short' });
const monthLong = (iso: string) =>
  new Date(`${iso}T00:00:00`).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

export function BusinessTrendsChart({
  data,
  canViewCosts = true,
}: {
  data: TrendPoint[];
  canViewCosts?: boolean;
}) {
  const metrics = canViewCosts ? ALL_METRICS : ALL_METRICS.filter((m) => m.key !== 'costs');
  const [selected, setSelected] = useState<MetricKey>('revenue');
  const active = metrics.find((m) => m.key === selected) ?? metrics[0];

  return (
    <Card className="overflow-hidden p-0">
      {/* Metric tiles — click to switch the chart series */}
      <div
        className={cn(
          'grid border-b border-slate-200',
          metrics.length === 4
            ? 'sm:grid-cols-2 lg:grid-cols-4'
            : 'sm:grid-cols-3',
        )}
      >
        {metrics.map((m, i) => {
          const total = data.reduce((s, d) => s + d[m.key], 0);
          const last = data.at(-1)?.[m.key] ?? 0;
          const prev = data.at(-2)?.[m.key] ?? 0;
          const change = prev === 0 ? (last > 0 ? 100 : 0) : ((last - prev) / Math.abs(prev)) * 100;
          const good = m.lowerIsBetter ? change <= 0 : change >= 0;
          const isSelected = selected === m.key;

          return (
            <button
              key={m.key}
              type="button"
              onClick={() => setSelected(m.key)}
              className={cn(
                'flex flex-col items-start gap-1 border-slate-200 p-4 text-left transition-colors hover:bg-slate-50',
                i > 0 && 'border-t sm:border-t-0 sm:border-l',
                'lg:border-t-0 lg:border-l',
                isSelected && 'bg-slate-50',
              )}
            >
              <div className="flex w-full items-center justify-between">
                <span className="text-sm text-slate-500">{m.label}</span>
                <span
                  className={cn(
                    'inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-xs font-normal tabular-nums',
                    good ? 'bg-teal-50 text-teal-700' : 'bg-red-50 text-red-700',
                  )}
                >
                  {change >= 0 ? <ArrowUp className="size-3" /> : <ArrowDown className="size-3" />}
                  {Math.abs(change).toFixed(0)}%
                </span>
              </div>
              <span
                className={cn(
                  'text-2xl font-normal tabular-nums text-slate-900 transition-colors',
                  isSelected && 'text-slate-950',
                )}
              >
                {m.format(total)}
              </span>
              <span className="text-xs text-slate-400">
                trailing 12 mo · <span style={{ color: m.color }}>●</span> vs last mo
              </span>
            </button>
          );
        })}
      </div>

      {/* Selected-metric trend */}
      <div className="px-2 py-5 sm:px-4">
        <ResponsiveContainer width="100%" height={320}>
          <LineChart data={data} margin={{ top: 16, right: 16, left: 4, bottom: 8 }}>
            <defs>
              <filter id="trend-line-shadow" x="-20%" y="-40%" width="140%" height="200%">
                <feDropShadow dx="0" dy="4" stdDeviation="6" floodColor={active.color} floodOpacity="0.25" />
              </filter>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
            <XAxis
              dataKey="month"
              axisLine={false}
              tickLine={false}
              tickMargin={10}
              tick={{ fontSize: 11, fill: '#94a3b8' }}
              tickFormatter={monthShort}
            />
            <YAxis
              axisLine={false}
              tickLine={false}
              tickMargin={8}
              width={52}
              tick={{ fontSize: 11, fill: '#94a3b8' }}
              tickFormatter={(v) => active.format(Number(v))}
            />
            <Tooltip
              cursor={{ stroke: '#cbd5e1', strokeDasharray: '3 3' }}
              content={({ active: on, payload }) => {
                if (!on || !payload?.length) return null;
                const p = payload[0];
                const iso = String(p.payload.month);
                return (
                  <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs shadow-lg">
                    <div className="mb-1 text-slate-500">{monthLong(iso)}</div>
                    <div className="flex items-center gap-2">
                      <span className="size-2 rounded-full" style={{ backgroundColor: active.color }} />
                      <span className="text-slate-600">{active.label}</span>
                      <span className="ml-auto font-medium tabular-nums text-slate-900">
                        {active.format(Number(p.value))}
                      </span>
                    </div>
                  </div>
                );
              }}
            />
            <Line
              type="monotone"
              dataKey={selected}
              stroke={active.color}
              strokeWidth={2.5}
              filter="url(#trend-line-shadow)"
              dot={false}
              activeDot={{ r: 5, fill: active.color, stroke: '#fff', strokeWidth: 2 }}
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </Card>
  );
}
