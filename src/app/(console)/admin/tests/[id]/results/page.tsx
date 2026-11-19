"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowLeft, DownloadSimple, MagnifyingGlass, ShieldWarning } from "@phosphor-icons/react/dist/ssr";
import { AttemptDrawer } from "@/components/admin/AttemptDrawer";
import { Badge, Button, Input, Notice, Select, Skeleton, cx } from "@/components/ui";
import { api, ApiError, formatDuration, formatWhen } from "@/lib/client/api";
import type { AttemptState, TestWindow } from "@/lib/shared/types";

interface Row {
  user_id: string;
  attempt_id: string | null;
  name: string;
  username: string;
  email: string;
  state: AttemptState;
  rank: number | null;
  marks_obtained: number;
  percent: number;
  solved: number;
  problems: { problem_id: string; marks_obtained: number; passed: number; total: number; language: string | null; submissions: number }[];
  violation_count: number;
  auto_submitted: boolean;
  started_at: string | null;
  submitted_at: string | null;
  time_spent_seconds: number;
}

interface Sheet {
  server_time: string;
  test: {
    id: string; title: string; window: TestWindow; starts_at: string; ends_at: string;
    duration_minutes: number; total_marks: number; problems: { id: string; title: string; marks: number }[];
  };
  summary: { assigned: number | null; started: number; in_progress: number; submitted: number; flagged: number };
  rows: Row[];
}

const STATE: Record<AttemptState, { label: string; tone: "neutral" | "accent" | "ok" | "warn" }> = {
  not_started: { label: "Not started", tone: "neutral" },
  in_progress: { label: "Writing", tone: "accent" },
  submitted: { label: "Handed in", tone: "ok" },
  timed_out: { label: "Timed out", tone: "warn" },
};

function csvCell(v: unknown) {
  const s = String(v ?? "");
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export default function ResultsPage() {
  const { id } = useParams<{ id: string }>();
  const [sheet, setSheet] = useState<Sheet | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<"all" | AttemptState | "flagged">("all");
  const [openAttempt, setOpenAttempt] = useState<string | null>(null);
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);

  const load = useCallback(async () => {
    try {
      setSheet(await api.get<Sheet>(`/api/admin/tests/${id}/results`));
      setUpdatedAt(new Date());
      setError(null);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not load results.");
    }
  }, [id]);

  useEffect(() => {
    void load();
    const t = window.setInterval(() => void load(), 15_000);
    return () => window.clearInterval(t);
  }, [load]);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (sheet?.rows ?? []).filter((r) => {
      if (q && !`${r.name} ${r.username} ${r.email}`.toLowerCase().includes(q)) return false;
      if (filter === "flagged") return r.violation_count > 0;
      return filter === "all" || r.state === filter;
    });
  }, [sheet, query, filter]);

  function exportCsv() {
    if (!sheet) return;
    const head = ["Rank", "Name", "Username", "Email", "State", "Marks", "Total", "Percent", "Solved",
      ...sheet.test.problems.map((p) => `${p.title} (/${p.marks})`), "Violations", "Auto handed in", "Started", "Handed in", "Minutes"];
    const body = sheet.rows.map((r) => [
      r.rank ?? "", r.name, r.username, r.email, STATE[r.state].label, r.marks_obtained, sheet.test.total_marks, r.percent, r.solved,
      ...r.problems.map((p) => p.marks_obtained), r.violation_count, r.auto_submitted ? "yes" : "", r.started_at ?? "", r.submitted_at ?? "",
      Math.round(r.time_spent_seconds / 60),
    ]);
    const csv = [head, ...body].map((line) => line.map(csvCell).join(",")).join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `${sheet.test.title.replace(/[^\w-]+/g, "_")}_results.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  if (error && !sheet) return <Notice tone="bad" title="Could not load results">{error}</Notice>;
  if (!sheet) return <div className="grid gap-3"><Skeleton className="h-8 w-1/3" /><Skeleton className="h-20" /><Skeleton className="h-72" /></div>;

  const s = sheet.summary;
  const stats = [
    { label: "Started", value: s.assigned !== null ? `${s.started}/${s.assigned}` : String(s.started) },
    { label: "Writing now", value: String(s.in_progress) },
    { label: "Handed in", value: String(s.submitted) },
    { label: "With violations", value: String(s.flagged) },
  ];

  return (
    <div className="flex flex-col gap-8">
      <div>
        <Link href={`/admin/tests/${id}`} className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-ink"><ArrowLeft size={14} /> Edit test</Link>
        <div className="mt-3 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">{sheet.test.title}</h1>
            <p className="mt-1 text-sm text-muted">
              {formatWhen(sheet.test.starts_at)} to {formatWhen(sheet.test.ends_at)} | {sheet.test.duration_minutes} min | {sheet.test.total_marks} marks
              {sheet.test.window === "live" ? <span className="text-accent"> | live, refreshes every 15 s</span> : null}
            </p>
          </div>
          <Button onClick={exportCsv}><DownloadSimple size={16} /> Export CSV</Button>
        </div>
      </div>

      <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-ui border border-line bg-line sm:grid-cols-4">
        {stats.map((x) => (
          <div key={x.label} className="bg-surface px-5 py-4">
            <dt className="text-xs text-muted">{x.label}</dt>
            <dd className="mt-1 font-mono text-2xl font-semibold tabular">{x.value}</dd>
          </div>
        ))}
      </dl>

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative w-full max-w-xs">
          <MagnifyingGlass size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
          <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search candidates" className="h-9 pl-9" aria-label="Search candidates" />
        </div>
        <Select value={filter} onChange={(e) => setFilter(e.target.value as typeof filter)} className="h-9 w-44" aria-label="Filter">
          <option value="all">Everyone</option>
          <option value="in_progress">Writing</option>
          <option value="submitted">Handed in</option>
          <option value="timed_out">Timed out</option>
          <option value="not_started">Not started</option>
          <option value="flagged">With violations</option>
        </Select>
        <span className="ml-auto text-xs text-muted">{updatedAt ? `Updated ${updatedAt.toLocaleTimeString()}` : ""}{error ? ` | ${error}` : ""}</span>
      </div>

      <div className="overflow-x-auto rounded-ui border border-line bg-surface">
        <table className="w-full min-w-[820px] text-sm">
          <thead>
            <tr className="border-b border-line text-left text-xs text-muted">
              <th className="w-12 px-4 py-3 font-medium">#</th>
              <th className="px-3 py-3 font-medium">Candidate</th>
              <th className="px-3 py-3 font-medium">State</th>
              <th className="px-3 py-3 text-right font-medium">Marks</th>
              {sheet.test.problems.map((p, i) => (
                <th key={p.id} className="px-3 py-3 text-right font-medium" title={p.title}>P{i + 1}</th>
              ))}
              <th className="px-3 py-3 text-right font-medium">Time</th>
              <th className="px-4 py-3 text-right font-medium">Flags</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr><td colSpan={6 + sheet.test.problems.length} className="px-4 py-12 text-center text-sm text-muted">No one matches.</td></tr>
            ) : rows.map((r) => (
              <tr
                key={r.user_id}
                onClick={() => r.attempt_id && setOpenAttempt(r.attempt_id)}
                className={cx("border-t border-line first:border-t-0", r.attempt_id && "cursor-pointer hover:bg-sunken/60")}
              >
                <td className="px-4 py-3 font-mono text-xs text-muted tabular">{r.rank ?? ""}</td>
                <td className="px-3 py-3">
                  <p className="font-medium">{r.name}</p>
                  <p className="font-mono text-xs text-muted">{r.username}</p>
                </td>
                <td className="px-3 py-3"><Badge tone={STATE[r.state].tone}>{STATE[r.state].label}</Badge></td>
                <td className="px-3 py-3 text-right font-mono tabular">
                  {r.state === "not_started" ? <span className="text-muted">-</span> : <>{r.marks_obtained}<span className="text-muted">/{sheet.test.total_marks}</span></>}
                </td>
                {r.problems.map((p) => {
                  const max = sheet.test.problems.find((x) => x.id === p.problem_id)?.marks ?? 0;
                  return (
                    <td key={p.problem_id} className="px-3 py-3 text-right font-mono text-xs tabular">
                      {p.submissions === 0 ? <span className="text-muted">-</span> : (
                        <span className={p.marks_obtained >= max && max > 0 ? "text-ok" : p.marks_obtained > 0 ? "text-ink" : "text-bad"}>
                          {p.marks_obtained}
                        </span>
                      )}
                    </td>
                  );
                })}
                <td className="px-3 py-3 text-right font-mono text-xs text-muted tabular">{r.state === "not_started" ? "" : formatDuration(r.time_spent_seconds)}</td>
                <td className="px-4 py-3 text-right">
                  {r.violation_count ? (
                    <span className={cx("inline-flex items-center gap-1 font-mono text-xs tabular", r.auto_submitted ? "text-bad" : "text-warn")}>
                      <ShieldWarning size={14} />{r.violation_count}
                    </span>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <AttemptDrawer attemptId={openAttempt} onClose={() => setOpenAttempt(null)} onReset={() => { setOpenAttempt(null); void load(); }} />
    </div>
  );
}
