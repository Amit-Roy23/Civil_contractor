import React, { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { cn } from '../../lib/utils';

/* Categorical slots in fixed order (validated palette) — see index.css --s1..--s8 */
export const SERIES = ['var(--s1)', 'var(--s2)', 'var(--s3)', 'var(--s4)', 'var(--s5)', 'var(--s6)', 'var(--s7)', 'var(--s8)'];

function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [w, setW] = useState(600);
  useLayoutEffect(() => {
    if (!ref.current) return;
    const ro = new ResizeObserver(([e]) => setW(Math.max(200, e!.contentRect.width)));
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);
  return [ref, w] as const;
}

function niceMax(v: number) {
  if (v <= 0) return 1;
  const p = Math.pow(10, Math.floor(Math.log10(v)));
  const n = v / p;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * p;
}

export function Legend({ items }: { items: Array<{ label: string; color: string; value?: string }> }) {
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-fg-2">
      {items.map((i) => (
        <span key={i.label} className="inline-flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-[3px]" style={{ background: i.color }} />
          {i.label}
          {i.value && <span className="text-fg font-semibold num">{i.value}</span>}
        </span>
      ))}
    </div>
  );
}

function Tip({ x, y, w, children }: { x: number; y: number; w: number; children: React.ReactNode }) {
  const left = Math.min(Math.max(8, x - 90), w - 188);
  return (
    <div className="absolute z-10 pointer-events-none w-[180px] bg-surface border border-line rounded-xl shadow-pop px-3 py-2 text-xs anim-fade" style={{ left, top: Math.max(0, y - 8), transform: 'translateY(-100%)' }}>
      {children}
    </div>
  );
}

export interface SeriesDef {
  key: string;
  label: string;
  color?: string;
}

/** Column chart — grouped or stacked, 4px rounded data ends, 2px surface gaps */
export function ColumnChart({ data, series, height = 220, stacked, format = (n) => n.toLocaleString('en-IN'), className }: { data: Array<{ label: string; values: Record<string, number> }>; series: SeriesDef[]; height?: number; stacked?: boolean; format?: (n: number) => string; className?: string }) {
  const [ref, w] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const pad = { l: 48, r: 8, t: 10, b: 26 };
  const iw = w - pad.l - pad.r;
  const ih = height - pad.t - pad.b;
  const max = niceMax(Math.max(1, ...data.map((d) => (stacked ? series.reduce((s, x) => s + Math.max(0, d.values[x.key] || 0), 0) : Math.max(...series.map((x) => d.values[x.key] || 0))))));
  const band = iw / Math.max(1, data.length);
  const groupW = Math.min(stacked ? 26 : 24 * series.length + 2 * (series.length - 1), band * 0.72);
  const barW = stacked ? groupW : Math.min(24, (groupW - 2 * (series.length - 1)) / series.length);
  const y = (v: number) => pad.t + ih - (v / max) * ih;
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((t) => t * max);
  const labelEvery = Math.ceil(data.length / Math.max(1, Math.floor(iw / 56)));
  const colors = series.map((s, i) => s.color || SERIES[i]!);
  const r = 4;
  const path = (x: number, top: number, bottom: number, bw: number, round: boolean) => {
    const h = bottom - top;
    if (h <= 0.5) return '';
    const rr = round ? Math.min(r, h, bw / 2) : 0;
    return `M${x},${bottom} V${top + rr} Q${x},${top} ${x + rr},${top} H${x + bw - rr} Q${x + bw},${top} ${x + bw},${top + rr} V${bottom} Z`;
  };
  return (
    <div className={cn('space-y-3', className)}>
      {series.length > 1 && <Legend items={series.map((s, i) => ({ label: s.label, color: colors[i]! }))} />}
      <div ref={ref} className="relative" onMouseLeave={() => setHover(null)}>
        <svg width={w} height={height} className="block overflow-visible">
          {ticks.map((t) => (
            <g key={t}>
              <line x1={pad.l} x2={w - pad.r} y1={y(t)} y2={y(t)} stroke="var(--grid)" strokeWidth={1} />
              <text x={pad.l - 8} y={y(t) + 4} textAnchor="end" className="fill-[var(--muted)] text-[10px] num">
                {format(t)}
              </text>
            </g>
          ))}
          {data.map((d, i) => {
            const cx = pad.l + band * i + band / 2;
            let acc = 0;
            const lastIdx = series.map((s) => (d.values[s.key] || 0) > 0).lastIndexOf(true);
            return (
              <g key={d.label} onMouseEnter={() => setHover(i)}>
                <rect x={pad.l + band * i} y={pad.t} width={band} height={ih} fill={hover === i ? 'var(--surface-3)' : 'transparent'} opacity={0.6} />
                {series.map((s, si) => {
                  const v = Math.max(0, d.values[s.key] || 0);
                  if (stacked) {
                    const bottom = y(acc) - (acc > 0 ? 2 : 0);
                    acc += v;
                    const top = y(acc);
                    return <path key={s.key} d={path(cx - barW / 2, top, bottom, barW, si === lastIdx)} fill={colors[si]} className="col-grow" style={{ animationDelay: `${i * 18}ms` }} />;
                  }
                  const x = cx - groupW / 2 + si * (barW + 2);
                  return <path key={s.key} d={path(x, y(v), y(0), barW, true)} fill={colors[si]} className="col-grow" style={{ animationDelay: `${i * 18}ms` }} />;
                })}
                {i % labelEvery === 0 && (
                  <text x={cx} y={height - 8} textAnchor="middle" className="fill-[var(--muted)] text-[10px]">
                    {d.label}
                  </text>
                )}
              </g>
            );
          })}
          <line x1={pad.l} x2={w - pad.r} y1={y(0)} y2={y(0)} stroke="var(--line-strong)" />
        </svg>
        {hover !== null && data[hover] && (
          <Tip x={pad.l + band * hover + band / 2} y={pad.t + 10} w={w}>
            <div className="font-semibold text-fg mb-1">{data[hover]!.label}</div>
            {series.map((s, i) => (
              <div key={s.key} className="flex items-center justify-between gap-2 text-fg-2">
                <span className="inline-flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-sm" style={{ background: colors[i] }} />
                  {s.label}
                </span>
                <span className="text-fg font-medium num">{format(data[hover]!.values[s.key] || 0)}</span>
              </div>
            ))}
          </Tip>
        )}
      </div>
    </div>
  );
}

/** Line / area chart with crosshair tooltip */
export function LineChart({ data, series, height = 220, format = (n) => n.toLocaleString('en-IN'), area = true, className, refLine }: { data: Array<{ label: string; values: Record<string, number> }>; series: SeriesDef[]; height?: number; format?: (n: number) => string; area?: boolean; className?: string; refLine?: { value: number; label: string } }) {
  const [ref, w] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const pad = { l: 48, r: 12, t: 12, b: 26 };
  const iw = w - pad.l - pad.r;
  const ih = height - pad.t - pad.b;
  const max = niceMax(Math.max(1, refLine?.value || 0, ...data.flatMap((d) => series.map((s) => d.values[s.key] || 0))));
  const x = (i: number) => pad.l + (data.length <= 1 ? iw / 2 : (i / (data.length - 1)) * iw);
  const y = (v: number) => pad.t + ih - (v / max) * ih;
  const colors = series.map((s, i) => s.color || SERIES[i]!);
  const labelEvery = Math.ceil(data.length / Math.max(1, Math.floor(iw / 64)));
  const paths = useMemo(
    () =>
      series.map((s) => {
        const pts = data.map((d, i) => [x(i), y(d.values[s.key] || 0)] as const);
        const line = pts.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ');
        return { line, area: `${line} L${x(data.length - 1)},${y(0)} L${x(0)},${y(0)} Z` };
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [data, series, w, max],
  );
  return (
    <div className={cn('space-y-3', className)}>
      {series.length > 1 && <Legend items={series.map((s, i) => ({ label: s.label, color: colors[i]! }))} />}
      <div
        ref={ref}
        className="relative"
        onMouseMove={(e) => {
          const r = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
          const px = e.clientX - r.left - pad.l;
          const i = Math.round((px / iw) * (data.length - 1));
          setHover(Math.max(0, Math.min(data.length - 1, i)));
        }}
        onMouseLeave={() => setHover(null)}
      >
        <svg width={w} height={height} className="block overflow-visible">
          {[0, 0.25, 0.5, 0.75, 1].map((t) => (
            <g key={t}>
              <line x1={pad.l} x2={w - pad.r} y1={y(t * max)} y2={y(t * max)} stroke="var(--grid)" />
              <text x={pad.l - 8} y={y(t * max) + 4} textAnchor="end" className="fill-[var(--muted)] text-[10px] num">
                {format(t * max)}
              </text>
            </g>
          ))}
          {refLine && (
            <g>
              <line x1={pad.l} x2={w - pad.r} y1={y(refLine.value)} y2={y(refLine.value)} stroke="var(--bad)" strokeWidth={1} />
              <text x={w - pad.r} y={y(refLine.value) - 4} textAnchor="end" className="fill-[var(--bad)] text-[10px] font-medium">
                {refLine.label}
              </text>
            </g>
          )}
          {paths.map((p, i) => (
            <g key={series[i]!.key}>
              {area && <path d={p.area} fill={colors[i]} opacity={0.1} className="anim-fade" />}
              <path d={p.line} fill="none" stroke={colors[i]} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" className="line-draw" style={{ ['--len' as string]: 3000 }} />
            </g>
          ))}
          {data.map((d, i) =>
            i % labelEvery === 0 ? (
              <text key={d.label} x={x(i)} y={height - 8} textAnchor="middle" className="fill-[var(--muted)] text-[10px]">
                {d.label}
              </text>
            ) : null,
          )}
          {hover !== null && (
            <g>
              <line x1={x(hover)} x2={x(hover)} y1={pad.t} y2={pad.t + ih} stroke="var(--line-strong)" />
              {series.map((s, i) => (
                <circle key={s.key} cx={x(hover)} cy={y(data[hover]!.values[s.key] || 0)} r={4.5} fill={colors[i]} stroke="var(--surface)" strokeWidth={2} />
              ))}
            </g>
          )}
        </svg>
        {hover !== null && data[hover] && (
          <Tip x={x(hover)} y={pad.t + 8} w={w}>
            <div className="font-semibold text-fg mb-1">{data[hover]!.label}</div>
            {series.map((s, i) => (
              <div key={s.key} className="flex items-center justify-between gap-2 text-fg-2">
                <span className="inline-flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full" style={{ background: colors[i] }} />
                  {s.label}
                </span>
                <span className="text-fg font-medium num">{format(data[hover]!.values[s.key] || 0)}</span>
              </div>
            ))}
          </Tip>
        )}
      </div>
    </div>
  );
}

/** Donut — share of a whole */
export function Donut({ segments, size = 168, center, format = (n) => n.toLocaleString('en-IN') }: { segments: Array<{ label: string; value: number; color?: string }>; size?: number; center?: React.ReactNode; format?: (n: number) => string }) {
  const [hover, setHover] = useState<number | null>(null);
  const total = segments.reduce((s, x) => s + Math.max(0, x.value), 0) || 1;
  const R = size / 2 - 6;
  const sw = 18;
  const C = 2 * Math.PI * R;
  let acc = 0;
  return (
    <div className="@container">
    <div className="flex flex-col @[440px]:flex-row items-center gap-5">
      <div className="relative shrink-0" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="-rotate-90">
          <circle cx={size / 2} cy={size / 2} r={R} fill="none" stroke="var(--surface-3)" strokeWidth={sw} />
          {segments.map((s, i) => {
            const frac = Math.max(0, s.value) / total;
            const gap = segments.length > 1 ? Math.min(2.5, frac * C) : 0;
            const el = (
              <circle
                key={s.label}
                cx={size / 2}
                cy={size / 2}
                r={R}
                fill="none"
                stroke={s.color || SERIES[i]}
                strokeWidth={hover === i ? sw + 4 : sw}
                strokeDasharray={`${Math.max(0, frac * C - gap)} ${C}`}
                strokeDashoffset={-acc * C}
                onMouseEnter={() => setHover(i)}
                onMouseLeave={() => setHover(null)}
                style={{ transition: 'stroke-width .15s' }}
                className="anim-fade"
              />
            );
            acc += frac;
            return el;
          })}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center text-center px-6 pointer-events-none">
          {hover !== null ? (
            <>
              <div className="text-[11px] text-muted leading-tight">{segments[hover]!.label}</div>
              <div className="text-base font-bold text-fg num">{format(segments[hover]!.value)}</div>
              <div className="text-[11px] text-fg-2">{((segments[hover]!.value / total) * 100).toFixed(1)}%</div>
            </>
          ) : (
            center
          )}
        </div>
      </div>
      <div className="w-full min-w-0 space-y-1.5">
        {segments.map((s, i) => (
          <div key={s.label} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)} className={cn('flex items-center justify-between gap-3 text-[13px] px-2 py-1 rounded-lg transition-colors', hover === i && 'bg-surface-3')}>
            <span className="inline-flex items-center gap-2 text-fg-2 min-w-0">
              <span className="w-2.5 h-2.5 rounded-[3px] shrink-0" style={{ background: s.color || SERIES[i] }} />
              <span className="truncate">{s.label}</span>
            </span>
            <span className="text-fg font-medium num shrink-0">
              {format(s.value)} <span className="text-muted text-[11px]">{((s.value / total) * 100).toFixed(0)}%</span>
            </span>
          </div>
        ))}
      </div>
    </div>
    </div>
  );
}

export function Sparkline({ values, color = 'var(--s1)', height = 36 }: { values: number[]; color?: string; height?: number }) {
  const [ref, w] = useWidth<HTMLDivElement>();
  if (!values.length) return null;
  const max = Math.max(...values, 1);
  const min = Math.min(...values, 0);
  const x = (i: number) => (values.length <= 1 ? w / 2 : (i / (values.length - 1)) * (w - 8) + 4);
  const y = (v: number) => height - 4 - ((v - min) / (max - min || 1)) * (height - 8);
  const line = values.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
  return (
    <div ref={ref}>
      <svg width={w} height={height} className="block">
        <path d={`${line} L${x(values.length - 1)},${height} L${x(0)},${height} Z`} fill={color} opacity={0.1} />
        <path d={line} fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="line-draw" />
        <circle cx={x(values.length - 1)} cy={y(values[values.length - 1]!)} r={3.5} fill={color} stroke="var(--surface)" strokeWidth={2} />
      </svg>
    </div>
  );
}

/** Horizontal bar list — ranked magnitudes with direct labels */
export function BarList({ rows, format = (n) => n.toLocaleString('en-IN'), color = 'var(--s1)' }: { rows: Array<{ label: React.ReactNode; value: number; sub?: React.ReactNode; color?: string }>; format?: (n: number) => string; color?: string }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <div className="space-y-3">
      {rows.map((r, i) => (
        <div key={i}>
          <div className="flex items-center justify-between gap-3 text-[13px] mb-1">
            <span className="text-fg-2 truncate min-w-0">{r.label}</span>
            <span className="text-fg font-semibold num shrink-0">{format(r.value)}</span>
          </div>
          <div className="h-2 rounded-full bg-surface-3 overflow-hidden">
            <div className="h-full rounded-full bar-grow" style={{ width: `${(Math.max(0, r.value) / max) * 100}%`, background: r.color || color, animationDelay: `${i * 50}ms` }} />
          </div>
          {r.sub && <div className="text-[11px] text-muted mt-1">{r.sub}</div>}
        </div>
      ))}
    </div>
  );
}
