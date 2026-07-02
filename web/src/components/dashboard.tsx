// Reusable SVG data-visualisation primitives for the executive dashboard.
// Zero-dependency — all hand-rolled SVG so the bundle stays lean.
// Chart text/grid use CSS variables so both light and dark themes render correctly.

import { useEffect, useRef, useState, type ComponentType, type ReactNode, type SVGProps } from 'react';

const INK = 'var(--ink-strong)';
const MUTED = 'var(--muted)';
const GRID = 'var(--line)';

/** Animated count-up for KPI values. */
export function useCountUp(target: number, durationMs = 700): number {
  const [value, setValue] = useState(target);
  const from = useRef(0);
  useEffect(() => {
    const start = performance.now();
    const initial = from.current;
    let raf = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / durationMs);
      const eased = 1 - Math.pow(1 - t, 3);
      setValue(initial + (target - initial) * eased);
      if (t < 1) raf = requestAnimationFrame(tick);
      else from.current = target;
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, durationMs]);
  return value;
}

// ── Sparkline ───────────────────────────────────────────────────────────────
export function Sparkline({ data, color = '#4f46e5', w = 96, h = 28 }: { data: number[]; color?: string; w?: number; h?: number }) {
  if (data.length < 2) return null;
  const min = Math.min(...data), max = Math.max(...data);
  const span = max - min || 1;
  const pts = data.map((v, i) => [(i / (data.length - 1)) * w, h - 2 - ((v - min) / span) * (h - 4)] as const);
  const d = pts.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
  const area = `${d} L${w},${h} L0,${h} Z`;
  const id = `sg-${color.replace('#', '')}`;
  return (
    <svg width={w} height={h} aria-hidden style={{ display: 'block' }}>
      <defs><linearGradient id={id} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={color} stopOpacity="0.18" /><stop offset="100%" stopColor={color} stopOpacity="0" /></linearGradient></defs>
      <path d={area} fill={`url(#${id})`} />
      <path d={d} fill="none" stroke={color} strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={pts[pts.length - 1]![0]} cy={pts[pts.length - 1]![1]} r={2.4} fill={color} />
    </svg>
  );
}

// ── KPI card ────────────────────────────────────────────────────────────────
export interface KpiProps {
  icon: ComponentType<SVGProps<SVGSVGElement>>;
  tint: string; // accent color for the icon chip + sparkline
  label: string;
  value: ReactNode;
  trend?: { dir: 'up' | 'down' | 'flat'; text: string };
  series?: number[];
  context?: string;
}

export function KpiCard({ icon: Icon, tint, label, value, trend, series, context }: KpiProps) {
  return (
    <div className="kpi">
      <div className="head">
        <span className="ic" style={{ background: `${tint}1a`, color: tint }}><Icon width={16} height={16} /></span>
        {label}
      </div>
      <div className="num">{value}</div>
      <div className="foot">
        <div>
          {trend && (
            <span className={`trend ${trend.dir}`}>
              {trend.dir === 'up' ? '↑' : trend.dir === 'down' ? '↓' : '→'} {trend.text}
            </span>
          )}
          {context && <div className="lbl">{context}</div>}
        </div>
        {series && <Sparkline data={series} color={tint} />}
      </div>
    </div>
  );
}

// ── Radial gauge ──────────────────────────────────────────────────────────────
export function Gauge({ value, max = 100, label, sub, color = '#4f46e5', size = 150 }: { value: number; max?: number; label: string; sub?: string; color?: string; size?: number }) {
  const r = size / 2 - 14;
  const cx = size / 2, cy = size / 2;
  const start = Math.PI * 0.75, end = Math.PI * 2.25; // 270° arc
  const frac = Math.max(0, Math.min(1, value / max));
  const polar = (a: number) => [cx + r * Math.cos(a), cy + r * Math.sin(a)] as const;
  const arc = (a0: number, a1: number) => {
    const [x0, y0] = polar(a0), [x1, y1] = polar(a1);
    return `M${x0.toFixed(1)},${y0.toFixed(1)} A${r},${r} 0 ${a1 - a0 > Math.PI ? 1 : 0} 1 ${x1.toFixed(1)},${y1.toFixed(1)}`;
  };
  return (
    <div style={{ textAlign: 'center' }}>
      <svg width={size} height={size} role="img" aria-label={`${label}: ${value} of ${max}`}>
        <path d={arc(start, end)} fill="none" stroke={GRID} strokeWidth={11} strokeLinecap="round" />
        <path d={arc(start, start + (end - start) * frac)} fill="none" stroke={color} strokeWidth={11} strokeLinecap="round" />
        <text x={cx} y={cy - 2} textAnchor="middle" fontSize={size * 0.2} fontWeight={800} fill={INK}>{Math.round(value)}{max === 100 ? '%' : ''}</text>
        {sub && <text x={cx} y={cy + size * 0.13} textAnchor="middle" fontSize={11} fill={MUTED}>{sub}</text>}
      </svg>
      <div className="ring-label">{label}</div>
    </div>
  );
}

// ── Radar chart ───────────────────────────────────────────────────────────────
export function Radar({ axes, values, color = '#4f46e5', size = 220, max = 5 }: { axes: string[]; values: number[]; color?: string; size?: number; max?: number }) {
  const cx = size / 2, cy = size / 2, r = size / 2 - 26;
  const n = axes.length;
  const angle = (i: number) => (Math.PI * 2 * i) / n - Math.PI / 2;
  const pt = (i: number, frac: number) => [cx + r * frac * Math.cos(angle(i)), cy + r * frac * Math.sin(angle(i))] as const;
  const rings = [0.25, 0.5, 0.75, 1];
  const poly = (frac: (i: number) => number) => axes.map((_, i) => pt(i, frac(i)).join(',')).join(' ');
  return (
    <svg width={size} height={size} role="img" aria-label="INVEST radar">
      {rings.map((f) => <polygon key={f} points={poly(() => f)} fill="none" stroke={GRID} strokeWidth={1} />)}
      {axes.map((_, i) => { const [x, y] = pt(i, 1); return <line key={i} x1={cx} y1={cy} x2={x} y2={y} stroke={GRID} strokeWidth={1} />; })}
      <polygon points={poly((i) => (values[i] ?? 0) / max)} fill={`${color}26`} stroke={color} strokeWidth={2} strokeLinejoin="round" />
      {axes.map((a, i) => { const [x, y] = pt(i, 1.2); return <text key={a} x={x} y={y} textAnchor="middle" dominantBaseline="middle" fontSize={11} fontWeight={600} fill={MUTED}>{a}</text>; })}
    </svg>
  );
}

// ── Donut chart ───────────────────────────────────────────────────────────────
export function Donut({ segments, size = 170, label }: { segments: { label: string; value: number; color: string }[]; size?: number; label?: string }) {
  const total = segments.reduce((s, x) => s + x.value, 0) || 1;
  const cx = size / 2, cy = size / 2, r = size / 2 - 16;
  let angle = -Math.PI / 2;
  const arcs = segments.filter((s) => s.value > 0).map((s) => {
    const span = (s.value / total) * Math.PI * 2;
    const a0 = angle, a1 = angle + span;
    angle = a1;
    const large = span > Math.PI ? 1 : 0;
    const [x0, y0] = [cx + r * Math.cos(a0), cy + r * Math.sin(a0)];
    const [x1, y1] = [cx + r * Math.cos(a1 - 0.0001), cy + r * Math.sin(a1 - 0.0001)];
    return { ...s, d: `M${x0},${y0} A${r},${r} 0 ${large} 1 ${x1},${y1}` };
  });
  return (
    <div style={{ display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>
      <svg width={size} height={size} role="img" aria-label={label ?? 'Distribution'}>
        {arcs.map((a) => <path key={a.label} d={a.d} fill="none" stroke={a.color} strokeWidth={17} strokeLinecap="butt"><title>{a.label}: {a.value}</title></path>)}
        <text x={cx} y={cy - 3} textAnchor="middle" fontSize={size * 0.17} fontWeight={800} fill={INK}>{total}</text>
        {label && <text x={cx} y={cy + size * 0.11} textAnchor="middle" fontSize={10.5} fill={MUTED}>{label}</text>}
      </svg>
      <div>
        {segments.map((s) => (
          <div key={s.label} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, margin: '4px 0' }}>
            <span style={{ width: 10, height: 10, borderRadius: 3, background: s.color, display: 'inline-block' }} />
            <span style={{ color: 'var(--muted)' }}>{s.label}</span>
            <strong style={{ marginLeft: 'auto', paddingLeft: 12 }}>{s.value}</strong>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Outcome progress bar ──────────────────────────────────────────────────────
export function ProgressBar({ label, current, target, pct, color }: { label: string; current: string; target: string; pct: number; color: string }) {
  return (
    <div className="progress">
      <div className="top"><span style={{ fontWeight: 600 }}>{label}</span><span className="hint">{current} → {target}</span></div>
      <div className="bar"><div className="fill" style={{ width: `${Math.max(4, Math.min(100, pct))}%`, background: color }} /></div>
    </div>
  );
}

// ── Workflow pipeline flow ────────────────────────────────────────────────────
export function Flow({ stages }: { stages: { label: string; count: number }[] }) {
  const max = Math.max(1, ...stages.map((s) => s.count));
  return (
    // tabIndex makes the horizontally-scrollable strip keyboard-reachable (axe: scrollable-region-focusable)
    <div className="flow" role="list" aria-label="Delivery pipeline stages" tabIndex={0}>
      {stages.map((s, i) => (
        <div className="stage" role="listitem" key={s.label}>
          <div className={`node${s.count === max && s.count > 0 ? ' hot' : ''}`}>
            <div className="n">{s.count}</div>
            <div className="s">{s.label}</div>
          </div>
          {i < stages.length - 1 && <div className="link" aria-hidden />}
        </div>
      ))}
    </div>
  );
}

/** Deterministic gentle series ending near `value` — for indicative sparklines. */
export function trendSeries(value: number, points = 8, swing = 0.12): number[] {
  const out: number[] = [];
  for (let i = 0; i < points; i++) {
    const base = value * (0.82 + (0.18 * i) / (points - 1)); // rising toward value
    const wobble = Math.sin(i * 1.7 + value) * value * swing * (1 - i / points);
    out.push(Math.max(0, base + wobble));
  }
  out[points - 1] = value;
  return out;
}
