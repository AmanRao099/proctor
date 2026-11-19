"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { DownloadSimple } from "@phosphor-icons/react/dist/ssr/DownloadSimple";
import { FilePdf } from "@phosphor-icons/react/dist/ssr/FilePdf";
import { MagnifyingGlass } from "@phosphor-icons/react/dist/ssr/MagnifyingGlass";
import { ShieldWarning } from "@phosphor-icons/react/dist/ssr/ShieldWarning";
import { Trophy } from "@phosphor-icons/react/dist/ssr/Trophy";
import { Badge, Button, Person, Input, Notice, Select, Skeleton, cx } from "@/components/ui";
import { useApi } from "@/lib/client/useApi";
import { api, ApiError, formatDuration, formatWhen } from "@/lib/client/api";
import type { Sheet, SheetRow } from "@/lib/shared/sheet";
import { Stat, StatGrid } from "./AdminShell";
import { AttemptDrawer } from "./AttemptDrawer";

const STATE: Record<SheetRow["state"], { label: string; tone: "neutral" | "accent" | "ok" | "warn" }> = {
  not_started: { label: "Absent", tone: "neutral" },
  in_progress: { label: "Writing", tone: "accent" },
  submitted: { label: "Handed in", tone: "ok" },
  timed_out: { label: "Timed out", tone: "warn" },
};

const csvCell = (v: unknown) => {
  const s = String(v ?? "");
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export function downloadText(name: string, text: string, type = "text/csv") {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

export function sheetCsv(sheet: Sheet) {
  const head = ["Rank", "Percentile", "Name", "Username", "Email", "State", "Status", "Marks", "Total", "Percent", "Solved",
    ...sheet.test.problems.map((p, i) => `P${i + 1} ${p.title} (/${p.marks})`),
    ...(sheet.test.followup_prompt ? ["Follow-up answer", "Follow-up correct"] : []),
    "Violations", "Auto handed in", "Violation detail", "Started", "Handed in", "Minutes"];
  const body = sheet.rows.map((r) => [
    r.rank ?? "", r.percentile ?? "", r.name, r.username, r.email, STATE[r.state].label, r.status, r.marks_obtained, r.total_marks, r.percent, r.solved,
    ...r.problems.map((p) => (p.attempted ? p.marks_obtained : "")),
    ...(sheet.test.followup_prompt ? [r.followup?.answer ?? "", r.followup ? (r.followup.correct ? "yes" : "no") : ""] : []),
    r.violation_count, r.auto_submitted ? "yes" : "",
    r.violations.map((v) => `${v.timestamp} ${v.type} ${v.description}`).join(" | "),
    r.started_at ?? "", r.submitted_at ?? "", Math.round(r.time_spent_seconds / 60),
  ]);
  return [head, ...body].map((l) => l.map(csvCell).join(",")).join("\n");
}

/**
 * One test's board: live while the test runs (polled), the result sheet after.
 * Ranked by marks, ties broken by who got there first. Rows open the student
 * report. Ported from MyCodeBud's DSALiveLeaderboard + TestResultsPanel.
 */
export function ResultsBoard({ testId, live = true }: { testId: string; live?: boolean }) {
  const { data, error, reload: load } = useApi<Sheet>(`/api/admin/tests/${testId}/results`, { refreshMs: live ? 15_000 : undefined });
  const sheet = data ?? null;
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<"all" | SheetRow["state"] | "flagged" | "passed" | "failed">("all");
  const [open, setOpen] = useState<string | null>(null);
  const [updated, setUpdated] = useState<Date | null>(null);
  const [pdfBusy, setPdfBusy] = useState(false);

  useEffect(() => { if (data) setUpdated(new Date()); }, [data]);

  const rows = useMemo(() => (sheet?.rows ?? []).filter((r) => {
    if (q && !`${r.name} ${r.username} ${r.email}`.toLowerCase().includes(q.toLowerCase())) return false;
    if (filter === "flagged") return r.violation_count > 0;
    if (filter === "passed" || filter === "failed") return r.status === filter;
    return filter === "all" || r.state === filter;
  }), [sheet, q, filter]);

  if (error && !sheet) return <Notice tone="bad" title="Could not load results">{error}</Notice>;
  if (!sheet) return <div className="grid gap-3"><Skeleton className="h-20" /><Skeleton className="h-72" /></div>;

  const s = sheet.summary;
  const openRow = sheet.rows.find((r) => r.user_id === open) ?? null;

  return (
    <div className="grid gap-6">
      <StatGrid cols={5}>
        <Stat label="Sat the test" value={s.assigned !== null ? `${s.started}/${s.assigned}` : s.started} />
        <Stat label="Writing now" value={s.in_progress} tone={s.in_progress ? "accent" : undefined} />
        <Stat label={`Passed (${sheet.pass_mark}%+)`} value={s.passed} tone="ok" />
        <Stat label="Average" value={`${s.average_percent}%`} hint={`${s.full_marks} on full marks`} />
        <Stat label="Flagged" value={s.flagged} tone={s.flagged ? "warn" : undefined} hint={`${s.auto_submitted} auto handed in`} />
      </StatGrid>

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative w-full max-w-xs">
          <MagnifyingGlass size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search students" className="h-9 pl-9" aria-label="Search students" />
        </div>
        <Select value={filter} onChange={(e) => setFilter(e.target.value as typeof filter)} className="h-9 w-44" aria-label="Filter">
          <option value="all">Everyone</option>
          <option value="in_progress">Writing</option>
          <option value="submitted">Handed in</option>
          <option value="timed_out">Timed out</option>
          <option value="not_started">Absent</option>
          <option value="passed">Passed</option>
          <option value="failed">Failed</option>
          <option value="flagged">With violations</option>
        </Select>
        <div className="ml-auto flex items-center gap-2">
          <span className="hidden text-xs text-muted sm:inline">{updated ? `Updated ${updated.toLocaleTimeString()}` : ""}</span>
          <Button size="sm" onClick={() => downloadText(`${sheet.test.title.replace(/[^\w-]+/g, "_")}_results.csv`, sheetCsv(sheet))}><DownloadSimple size={14} /> CSV</Button>
          <Button size="sm" busy={pdfBusy} onClick={async () => {
            setPdfBusy(true);
            try { (await import("@/lib/client/pdf")).resultSheetPdf(sheet); } finally { setPdfBusy(false); }
          }}><FilePdf size={14} /> PDF</Button>
        </div>
      </div>

      <div className="overflow-x-auto rounded-card border border-line bg-surface shadow-card">
        <table className="data-table min-w-[860px]">
          <thead>
            <tr>
              <th className="w-14 px-4 py-3 font-medium">Rank</th>
              <th className="px-3 py-3 font-medium">Student</th>
              <th className="px-3 py-3 font-medium">State</th>
              <th className="px-3 py-3 text-right font-medium">Marks</th>
              {sheet.test.problems.map((p, i) => (
                <th key={p.id} className="px-2 py-3 text-right font-medium" title={`${p.title} (${p.difficulty}, ${p.marks} marks)`}>P{i + 1}</th>
              ))}
              <th className="px-3 py-3 text-right font-medium">Time</th>
              <th className="px-4 py-3 text-right font-medium">Flags</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr><td colSpan={6 + sheet.test.problems.length} className="px-4 py-12 text-center text-sm text-muted">No one matches.</td></tr>
            ) : rows.map((r) => (
              <tr key={r.user_id} onClick={() => setOpen(r.user_id)} className="is-clickable ">
                <td className="px-4 py-3 text-xs tabular">
                  {r.rank === 1 ? <span className="inline-flex items-center gap-1 text-accent"><Trophy size={13} weight="fill" />1</span> : r.rank ?? <span className="text-muted">-</span>}
                </td>
                <td className="px-3 py-3">
                  <Person name={r.name} sub={r.username} />
                </td>
                <td className="px-3 py-3">
                  <Badge tone={STATE[r.state].tone}>{STATE[r.state].label}</Badge>
                  {r.state === "submitted" || r.state === "timed_out" ? (
                    <span className={cx("ml-2 text-xs", r.status === "passed" ? "text-ok" : "text-muted")}>{r.status === "passed" ? "Passed" : "Below pass"}</span>
                  ) : null}
                </td>
                <td className="px-3 py-3 text-right tabular">
                  {r.state === "not_started" ? <span className="text-muted">-</span> : <>{r.marks_obtained}<span className="text-muted">/{r.total_marks}</span></>}
                </td>
                {r.problems.map((p) => (
                  <td key={p.problem_id} className="px-2 py-3 text-right text-xs tabular" title={p.attempted ? `${p.passed}/${p.total} tests, ${p.submissions} submits, ${p.language}` : "Not submitted"}>
                    {!p.attempted ? <span className="text-muted">-</span> : (
                      <span className={p.accepted ? "text-ok" : p.marks_obtained > 0 ? "text-ink" : "text-bad"}>{p.marks_obtained}</span>
                    )}
                  </td>
                ))}
                <td className="px-3 py-3 text-right text-xs text-muted tabular">
                  {r.state === "not_started" ? "" : formatDuration(r.time_spent_seconds)}
                </td>
                <td className="px-4 py-3 text-right">
                  {r.violation_count ? (
                    <span className={cx("inline-flex items-center gap-1 text-xs tabular", r.auto_submitted ? "text-bad" : "text-warn")} title={r.auto_submitted ? "Auto handed in" : "Violations"}>
                      <ShieldWarning size={14} />{r.violation_count}
                    </span>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-muted">
        {formatWhen(sheet.test.starts_at)} to {formatWhen(sheet.test.ends_at)}. Ranked by marks; a tie goes to whoever reached the score first. Click a row for the full report.
      </p>

      <AttemptDrawer sheet={sheet} row={openRow} onClose={() => setOpen(null)} onReset={() => { setOpen(null); void load(); }} />
    </div>
  );
}
