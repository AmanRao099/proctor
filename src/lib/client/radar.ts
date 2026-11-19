import type { Sheet, SheetRow } from "@/lib/shared/sheet";

/*
 * The numbers behind a student's performance radar, ported from MyCodeBud's
 * lib/reports/radarMetrics.ts. Every axis is 0-100, and each comes with the
 * cohort average over those who sat the test, so one shape has something to
 * be read against. Pure functions over the result sheet.
 */

export interface RadarAxis {
  axis: string;
  student: number;
  cohort: number;
  hint: string;
}

const pct = (part: number, whole: number) => (whole ? Math.round((part / whole) * 100) : 0);
const clamp = (n: number) => Math.max(0, Math.min(100, Math.round(n)));

function metricsFor(row: SheetRow, sheet: Sheet) {
  const tried = row.problems.filter((p) => p.attempted);
  const accuracy = pct(tried.reduce((s, p) => s + p.passed, 0), tried.reduce((s, p) => s + p.total, 0));
  const completion = pct(tried.length, row.problems.length);
  const allowed = sheet.test.duration_minutes * 60;
  // Time left over, but only for a student who scored: finishing fast with nothing right is not speed.
  const speed = allowed > 0 && row.percent > 0 ? 100 - pct(Math.min(row.time_spent_seconds, allowed), allowed) : 0;
  const integrity = row.auto_submitted ? 0 : 100 - 20 * row.violation_count;
  return { score: row.percent, accuracy, completion, speed, percentile: row.percentile ?? 0, integrity };
}

const AXES: { key: keyof ReturnType<typeof metricsFor>; label: string; hint: string }[] = [
  { key: "score", label: "Score", hint: "Marks scored as a share of the paper" },
  { key: "accuracy", label: "Accuracy", hint: "Test cases passed on the problems submitted" },
  { key: "completion", label: "Completion", hint: "Problems submitted out of the paper" },
  { key: "speed", label: "Speed", hint: "Time left on the clock at hand-in (0 if nothing scored)" },
  { key: "percentile", label: "Percentile", hint: "Share of the other students who scored lower" },
  { key: "integrity", label: "Integrity", hint: "100 less 20 per violation; 0 if auto handed in" },
];

export function sat(sheet: Sheet) {
  return sheet.rows.filter((r) => r.state !== "not_started");
}

export function performanceAxes(sheet: Sheet, row: SheetRow): RadarAxis[] {
  const all = sat(sheet).map((r) => metricsFor(r, sheet));
  const mine = metricsFor(row, sheet);
  return AXES.map(({ key, label, hint }) => ({
    axis: label,
    student: clamp(mine[key]),
    cohort: clamp(all.length ? all.reduce((s, m) => s + m[key], 0) / all.length : 0),
    hint,
  }));
}

/** Share of test cases passed per problem. Null under three problems, where a list says it better. */
export function problemAxes(sheet: Sheet, row: SheetRow): RadarAxis[] | null {
  if (row.problems.length < 3) return null;
  const others = sat(sheet);
  return row.problems.map((p, i) => {
    const vals = others.map((r) => r.problems[i]).filter(Boolean).map((c) => pct(c.passed, c.total));
    return {
      axis: `P${i + 1}`,
      student: clamp(pct(p.passed, p.total)),
      cohort: clamp(vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0),
      hint: p.title,
    };
  });
}

/** Cohort average marks per problem, for the report's per-problem table. */
export function problemAverages(sheet: Sheet) {
  const rows = sat(sheet);
  return sheet.test.problems.map((p, i) => {
    const marks = rows.map((r) => r.problems[i]?.marks_obtained ?? 0);
    return marks.length ? Math.round((marks.reduce((a, b) => a + b, 0) / marks.length) * 100) / 100 : 0;
  });
}
