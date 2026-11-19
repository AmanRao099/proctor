import type { RadarAxis } from "@/lib/client/radar";

/**
 * Student-vs-cohort radar. Student in the accent colour, cohort as a dashed
 * neutral outline; a legend below says which is which, so colour is never the
 * only cue. Plain SVG, sized by its container.
 */
export function Radar({ axes, title }: { axes: RadarAxis[]; title: string }) {
  const size = 260;
  const c = size / 2;
  const r = 86;
  const n = axes.length;
  const point = (i: number, v: number) => {
    const a = (Math.PI * 2 * i) / n - Math.PI / 2;
    return [c + Math.cos(a) * r * (v / 100), c + Math.sin(a) * r * (v / 100)] as const;
  };
  const poly = (vals: number[]) => vals.map((v, i) => point(i, v).join(",")).join(" ");
  return (
    <figure className="min-w-0">
      <figcaption className="mb-1 text-xs font-medium text-muted">{title}</figcaption>
      <svg viewBox={`-56 -6 ${size + 112} ${size + 12}`} className="h-auto w-full max-w-[340px] overflow-visible" role="img" aria-label={`${title}: ${axes.map((a) => `${a.axis} ${a.student}`).join(", ")}`}>
        {[25, 50, 75, 100].map((ring) => (
          <polygon key={ring} points={poly(axes.map(() => ring))} fill="none" stroke="var(--line)" strokeWidth={1} />
        ))}
        {axes.map((_, i) => {
          const [x, y] = point(i, 100);
          return <line key={i} x1={c} y1={c} x2={x} y2={y} stroke="var(--line)" strokeWidth={1} />;
        })}
        <polygon points={poly(axes.map((a) => a.cohort))} fill="none" stroke="var(--muted)" strokeWidth={1.5} strokeDasharray="4 3" />
        <polygon points={poly(axes.map((a) => a.student))} fill="var(--accent)" fillOpacity={0.14} stroke="var(--accent)" strokeWidth={2} />
        {axes.map((a, i) => {
          const [x, y] = point(i, 100);
          const dx = x - c, dy = y - c;
          const lx = c + dx * 1.18, ly = c + dy * 1.18;
          const anchor = Math.abs(dx) < 4 ? "middle" : dx > 0 ? "start" : "end";
          return (
            <text key={a.axis} x={lx} y={ly + 4} textAnchor={anchor} fontSize={10.5} fill="var(--ink-2)">
              <title>{a.hint}</title>
              {a.axis} <tspan fill="var(--accent)" fontWeight={600}>{a.student}</tspan>
            </text>
          );
        })}
      </svg>
      <div className="mt-1 flex gap-4 text-[11px] text-muted">
        <span className="flex items-center gap-1.5"><span className="h-0.5 w-4 bg-accent" />Student</span>
        <span className="flex items-center gap-1.5"><span className="h-0 w-4 border-t border-dashed border-muted" />Cohort average</span>
      </div>
    </figure>
  );
}
