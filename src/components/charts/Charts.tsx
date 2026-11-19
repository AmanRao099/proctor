"use client";

import { useEffect, useRef, useState } from "react";

/*
 * Small single-series charts in plain SVG. One series, so no legend: the card
 * title names it. Marks use the validated --chart token (see globals.css);
 * text stays in ink tokens. Every chart has a hover tooltip and a hidden
 * table for screen readers.
 */

export interface Point { label: string; value: number; detail?: string }

function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [w, setW] = useState(0);
  useEffect(() => {
    if (!ref.current) return;
    const ro = new ResizeObserver(([e]) => setW(Math.floor(e.contentRect.width)));
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);
  return [ref, w] as const;
}

function niceMax(v: number) {
  if (v <= 4) return 4;
  const pow = 10 ** Math.floor(Math.log10(v));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * pow).find((s) => v / s <= 4) ?? pow * 10;
  return Math.ceil(v / step) * step;
}

function Tooltip({ x, y, title, value, width }: { x: number; y: number; title: string; value: string; width: number }) {
  const left = Math.min(Math.max(x, 70), width - 70);
  return (
    <div className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full rounded-ui border border-line bg-surface px-3 py-2 text-xs shadow-raised" style={{ left, top: y - 10 }}>
      <p className="whitespace-nowrap text-muted">{title}</p>
      <p className="whitespace-nowrap font-semibold text-ink tabular">{value}</p>
    </div>
  );
}

function SrTable({ data, unit, caption }: { data: Point[]; unit: string; caption: string }) {
  return (
    <table className="sr-only">
      <caption>{caption}</caption>
      <tbody>{data.map((d) => <tr key={d.label}><th>{d.label}</th><td>{d.value}{unit}</td></tr>)}</tbody>
    </table>
  );
}

const PAD = { top: 12, right: 8, bottom: 26, left: 32 };

/** Vertical columns: counts per category or per day. */
export function ColumnChart({ data, height = 200, unit = "", caption, labelEvery = 1, format = (v: number) => String(v) }: {
  data: Point[]; height?: number; unit?: string; caption: string; labelEvery?: number; format?: (v: number) => string;
}) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const max = niceMax(Math.max(0, ...data.map((d) => d.value)));
  const iw = Math.max(0, width - PAD.left - PAD.right);
  const ih = height - PAD.top - PAD.bottom;
  const slot = data.length ? iw / data.length : 0;
  const bw = Math.max(4, Math.min(44, slot - 2 - slot * 0.28));
  const y = (v: number) => PAD.top + ih - (v / max) * ih;
  const ticks = [0, max / 2, max];

  return (
    <div ref={ref} className="relative w-full" style={{ height }} onMouseLeave={() => setHover(null)}>
      {width > 0 ? (
        <svg width={width} height={height} role="img" aria-label={caption}>
          {ticks.map((t) => (
            <g key={t}>
              <line x1={PAD.left} x2={width - PAD.right} y1={y(t)} y2={y(t)} stroke="var(--line)" strokeDasharray={t === 0 ? undefined : "3 4"} />
              <text x={PAD.left - 8} y={y(t) + 4} textAnchor="end" fontSize={11} fill="var(--muted)">{format(t)}</text>
            </g>
          ))}
          {data.map((d, i) => {
            const cx = PAD.left + slot * i + slot / 2;
            const h = Math.max(d.value > 0 ? 3 : 0, (d.value / max) * ih);
            const r = Math.min(4, bw / 2, h);
            const x0 = cx - bw / 2, y0 = PAD.top + ih - h;
            return (
              <g key={d.label} onMouseEnter={() => setHover(i)}>
                <rect x={PAD.left + slot * i} y={PAD.top} width={slot} height={ih} fill="transparent" />
                {h > 0 ? (
                  <path
                    d={`M${x0},${PAD.top + ih} V${y0 + r} Q${x0},${y0} ${x0 + r},${y0} H${x0 + bw - r} Q${x0 + bw},${y0} ${x0 + bw},${y0 + r} V${PAD.top + ih} Z`}
                    fill="var(--chart)"
                    opacity={hover === null || hover === i ? 1 : 0.45}
                  />
                ) : null}
                {i % labelEvery === 0 ? (
                  <text x={cx} y={height - 8} textAnchor="middle" fontSize={11} fill="var(--muted)">{d.label}</text>
                ) : null}
              </g>
            );
          })}
        </svg>
      ) : null}
      {hover !== null && width > 0 ? (
        <Tooltip
          x={PAD.left + slot * hover + slot / 2}
          y={y(data[hover].value)}
          width={width}
          title={data[hover].detail ?? data[hover].label}
          value={`${format(data[hover].value)}${unit}`}
        />
      ) : null}
      <SrTable data={data} unit={unit} caption={caption} />
    </div>
  );
}

/** A line with a soft area under it, for change over time. */
export function AreaChart({ data, height = 200, unit = "", caption, labelEvery = 1, max: fixedMax, format = (v: number) => String(v) }: {
  data: Point[]; height?: number; unit?: string; caption: string; labelEvery?: number; max?: number; format?: (v: number) => string;
}) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const max = fixedMax ?? niceMax(Math.max(0, ...data.map((d) => d.value)));
  const iw = Math.max(0, width - PAD.left - PAD.right);
  const ih = height - PAD.top - PAD.bottom;
  const x = (i: number) => PAD.left + (data.length > 1 ? (iw * i) / (data.length - 1) : iw / 2);
  const y = (v: number) => PAD.top + ih - (v / max) * ih;
  const line = data.map((d, i) => `${i ? "L" : "M"}${x(i)},${y(d.value)}`).join(" ");
  const area = data.length ? `${line} L${x(data.length - 1)},${PAD.top + ih} L${x(0)},${PAD.top + ih} Z` : "";
  const ticks = [0, max / 2, max];
  const gid = useRef(`g${Math.random().toString(36).slice(2, 8)}`).current;

  function onMove(e: React.MouseEvent<SVGSVGElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const px = e.clientX - rect.left - PAD.left;
    const i = data.length > 1 ? Math.round((px / iw) * (data.length - 1)) : 0;
    setHover(Math.max(0, Math.min(data.length - 1, i)));
  }

  return (
    <div ref={ref} className="relative w-full" style={{ height }}>
      {width > 0 ? (
        <svg width={width} height={height} role="img" aria-label={caption} onMouseMove={onMove} onMouseLeave={() => setHover(null)}>
          <defs>
            <linearGradient id={gid} x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor="var(--chart)" stopOpacity={0.22} />
              <stop offset="100%" stopColor="var(--chart)" stopOpacity={0} />
            </linearGradient>
          </defs>
          {ticks.map((t) => (
            <g key={t}>
              <line x1={PAD.left} x2={width - PAD.right} y1={y(t)} y2={y(t)} stroke="var(--line)" strokeDasharray={t === 0 ? undefined : "3 4"} />
              <text x={PAD.left - 8} y={y(t) + 4} textAnchor="end" fontSize={11} fill="var(--muted)">{format(t)}</text>
            </g>
          ))}
          <path d={area} fill={`url(#${gid})`} />
          <path d={line} fill="none" stroke="var(--chart)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
          {data.map((d, i) => (i % labelEvery === 0 || i === data.length - 1 ? (
            <text key={d.label + i} x={x(i)} y={height - 8} textAnchor="middle" fontSize={11} fill="var(--muted)">{d.label}</text>
          ) : null))}
          {hover !== null ? (
            <g>
              <line x1={x(hover)} x2={x(hover)} y1={PAD.top} y2={PAD.top + ih} stroke="var(--line-strong)" />
              <circle cx={x(hover)} cy={y(data[hover].value)} r={5} fill="var(--chart)" stroke="var(--surface)" strokeWidth={2} />
            </g>
          ) : null}
        </svg>
      ) : null}
      {hover !== null && width > 0 ? (
        <Tooltip x={x(hover)} y={y(data[hover].value)} width={width} title={data[hover].detail ?? data[hover].label} value={`${format(data[hover].value)}${unit}`} />
      ) : null}
      <SrTable data={data} unit={unit} caption={caption} />
    </div>
  );
}
