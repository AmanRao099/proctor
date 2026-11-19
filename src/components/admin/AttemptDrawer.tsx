"use client";

import { useEffect, useMemo, useState } from "react";
import { DownloadSimple, X } from "@phosphor-icons/react/dist/ssr";
import { Badge, Button, Dialog, Skeleton, cx } from "@/components/ui";
import { api, ApiError, formatDuration, formatWhen } from "@/lib/client/api";
import { performanceAxes, problemAverages, problemAxes } from "@/lib/client/radar";
import { LANGUAGES, type Language } from "@/lib/shared/languages";
import type { Sheet, SheetRow } from "@/lib/shared/sheet";
import { Radar } from "./Radar";

interface Detail {
  problems: {
    id: string;
    title: string;
    marks: number;
    submissions: number;
    best: { marks_obtained: number; passed: number; total: number; language: Language; at: string; code: string } | null;
    final_language: Language;
    final_code: string;
  }[];
  attempt: { user_agent: string };
}

const time = new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit", second: "2-digit" });

/**
 * One student on one test: standing, radar against the cohort, per-problem
 * line, the proctoring record, the code behind each score, and the PDF
 * report. Ported from MyCodeBud's StudentReportDialog + SubmittedCodeViewer.
 */
export function AttemptDrawer({ sheet, row, onClose, onReset }: {
  sheet: Sheet;
  row: SheetRow | null;
  onClose: () => void;
  onReset: () => void;
}) {
  const [detail, setDetail] = useState<Detail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [problemIdx, setProblemIdx] = useState(0);
  const [view, setView] = useState<"best" | "final">("best");
  const [confirmReset, setConfirmReset] = useState(false);
  const [pdfBusy, setPdfBusy] = useState(false);

  useEffect(() => {
    if (!row?.attempt_id) return;
    setDetail(null);
    setError(null);
    setProblemIdx(0);
    api.get<Detail>(`/api/admin/attempts/${row.attempt_id}`)
      .then(setDetail)
      .catch((e) => setError(e instanceof ApiError ? e.message : "Could not load the code."));
  }, [row?.attempt_id]);

  useEffect(() => {
    if (!row) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [row, onClose]);

  const perf = useMemo(() => (row ? performanceAxes(sheet, row) : []), [sheet, row]);
  const byProblem = useMemo(() => (row ? problemAxes(sheet, row) : null), [sheet, row]);
  const avgs = useMemo(() => problemAverages(sheet), [sheet]);

  if (!row) return null;
  const p = detail?.problems[problemIdx];
  const shownCode = p ? (view === "best" && p.best ? p.best.code : p.final_code) : "";
  const shownLang = p ? (view === "best" && p.best ? p.best.language : p.final_language) : "python";
  const started = row.started_at ? new Date(row.started_at).getTime() : 0;
  const satCount = sheet.rows.filter((r) => r.state !== "not_started").length;

  async function downloadPdf() {
    if (!row) return;
    setPdfBusy(true);
    try {
      const { studentReportPdf } = await import("@/lib/client/pdf");
      await studentReportPdf(sheet, row, detail?.problems.map((x) => ({
        title: x.title,
        language: x.best ? LANGUAGES[x.best.language]?.label ?? x.best.language : "",
        code: x.best?.code ?? "",
      })));
    } finally {
      setPdfBusy(false);
    }
  }

  async function reset() {
    if (!row?.attempt_id) return;
    try {
      await api.del(`/api/admin/attempts/${row.attempt_id}`);
      setConfirmReset(false);
      onReset();
    } catch (e) {
      setConfirmReset(false);
      setError(e instanceof ApiError ? e.message : "Could not reset.");
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-[rgb(10_10_12/0.4)]" onClick={onClose}>
      <aside
        className="flex h-full w-full max-w-3xl flex-col border-l border-line bg-bg shadow-[0_0_60px_rgb(10_10_12/0.25)]"
        onClick={(e) => e.stopPropagation()}
        aria-label="Student report"
      >
        <div className="flex items-start justify-between gap-4 border-b border-line bg-surface px-6 py-4">
          <div className="min-w-0">
            <p className="truncate text-lg font-semibold">{row.name}</p>
            <p className="truncate font-mono text-xs text-muted">{row.username}{row.email ? ` | ${row.email}` : ""}</p>
          </div>
          <div className="flex items-center gap-2">
            <Button size="sm" onClick={downloadPdf} busy={pdfBusy} disabled={row.state === "not_started"}><DownloadSimple size={14} /> Report PDF</Button>
            <button onClick={onClose} aria-label="Close" className="grid h-8 w-8 place-items-center rounded-ui text-muted hover:bg-sunken hover:text-ink"><X size={16} /></button>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-6">
          <div className="grid gap-8">
            <dl className="grid grid-cols-3 gap-px overflow-hidden rounded-ui border border-line bg-line sm:grid-cols-6">
              {[
                ["Marks", `${row.marks_obtained}/${row.total_marks}`],
                ["Score", `${row.percent}%`],
                ["Rank", row.rank ? `${row.rank}/${satCount}` : "-"],
                ["Percentile", row.percentile ?? "-"],
                ["Solved", `${row.solved}/${row.problems.length}`],
                ["Time", row.state === "not_started" ? "-" : formatDuration(row.time_spent_seconds)],
              ].map(([k, v]) => (
                <div key={k as string} className="bg-surface px-3 py-2.5">
                  <dt className="text-[11px] text-muted">{k}</dt>
                  <dd className="font-mono text-base font-semibold tabular">{v}</dd>
                </div>
              ))}
            </dl>

            {row.auto_submitted ? (
              <p className="rounded-ui border border-bad bg-bad-soft px-3 py-2 text-sm text-bad">Handed in automatically at the violation limit.</p>
            ) : null}

            {row.state !== "not_started" ? (
              <section className="grid gap-6 sm:grid-cols-2">
                <Radar axes={perf} title="Performance vs cohort" />
                {byProblem ? <Radar axes={byProblem} title="Tests passed by problem" /> : null}
              </section>
            ) : null}

            <section>
              <h3 className="mb-2 text-sm font-semibold">Problems</h3>
              <div className="overflow-hidden rounded-ui border border-line bg-surface">
                <table className="w-full text-sm">
                  <thead><tr className="border-b border-line text-left text-xs text-muted">
                    <th className="px-3 py-2 font-medium">Problem</th><th className="px-3 py-2 font-medium">Level</th>
                    <th className="px-3 py-2 text-right font-medium">Tests</th><th className="px-3 py-2 text-right font-medium">Marks</th>
                    <th className="px-3 py-2 text-right font-medium">Cohort avg</th><th className="px-3 py-2 text-right font-medium">Submits</th>
                  </tr></thead>
                  <tbody>
                    {row.problems.map((c, i) => (
                      <tr key={c.problem_id} className="border-t border-line first:border-t-0">
                        <td className="max-w-56 truncate px-3 py-2">P{i + 1}. {c.title}</td>
                        <td className="px-3 py-2 text-xs text-muted">{c.difficulty}</td>
                        <td className="px-3 py-2 text-right font-mono text-xs tabular">{c.attempted ? `${c.passed}/${c.total}` : "-"}</td>
                        <td className={cx("px-3 py-2 text-right font-mono text-xs tabular", c.accepted ? "text-ok" : c.attempted ? "" : "text-muted")}>{c.marks_obtained}/{c.marks}</td>
                        <td className="px-3 py-2 text-right font-mono text-xs text-muted tabular">{avgs[i]}</td>
                        <td className="px-3 py-2 text-right font-mono text-xs tabular">{c.submissions}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {sheet.test.followup_prompt ? (
                <p className="mt-3 text-sm">
                  <span className="text-muted">Follow-up: </span>{sheet.test.followup_prompt}{" "}
                  {row.followup
                    ? <span className={row.followup.correct ? "text-ok" : "text-bad"}>Answer "{row.followup.answer}" ({row.followup.correct ? "correct" : "incorrect"})</span>
                    : <span className="text-muted">Not answered</span>}
                </p>
              ) : null}
            </section>

            <section>
              <h3 className="text-sm font-semibold">Violations <span className="font-mono text-muted">{row.violations.length}</span></h3>
              {row.violations.length === 0 ? <p className="mt-2 text-sm text-muted">None recorded.</p> : (
                <ol className="mt-3 grid gap-px overflow-hidden rounded-ui border border-line bg-line">
                  {row.violations.map((v) => {
                    const off = started ? Math.max(0, Math.round((new Date(v.timestamp).getTime() - started) / 1000)) : 0;
                    return (
                      <li key={v.id} className="grid grid-cols-[72px_88px_1fr] items-center gap-3 bg-surface px-3 py-2 text-sm">
                        <span className="font-mono text-xs text-muted tabular">+{Math.floor(off / 60)}m {off % 60}s</span>
                        <Badge tone={v.type === "CRITICAL" ? "bad" : "warn"}>{v.type === "CRITICAL" ? "Critical" : "Warning"}</Badge>
                        <span className="min-w-0 text-ink-2">{v.description}<span className="ml-2 text-xs text-muted">{time.format(new Date(v.timestamp))}</span></span>
                      </li>
                    );
                  })}
                </ol>
              )}
            </section>

            {row.attempt_id ? (
              <section>
                <h3 className="text-sm font-semibold">Code</h3>
                {error ? <p className="mt-2 text-sm text-bad">{error}</p> : null}
                {!detail && !error ? <Skeleton className="mt-3 h-48" /> : null}
                {detail ? (
                  <div className="mt-3">
                    <div className="flex flex-wrap items-center gap-2">
                      {detail.problems.map((x, i) => (
                        <button key={x.id} onClick={() => setProblemIdx(i)}
                          className={cx("h-8 rounded-ui border px-3 text-[13px]", i === problemIdx ? "border-ink bg-ink text-bg" : "border-line text-ink-2 hover:border-line-strong")}>
                          P{i + 1}
                        </button>
                      ))}
                      <div className="ml-auto flex rounded-ui border border-line p-0.5">
                        {(["best", "final"] as const).map((v) => (
                          <button key={v} onClick={() => setView(v)} className={cx("h-7 rounded-[4px] px-2.5 text-xs", view === v ? "bg-sunken text-ink" : "text-muted")}>
                            {v === "best" ? "Best submission" : "Last saved"}
                          </button>
                        ))}
                      </div>
                    </div>
                    {p && view === "best" && p.best ? <p className="mt-2 text-xs text-muted">{p.best.passed}/{p.best.total} tests | submitted {formatWhen(p.best.at)}</p> : null}
                    <div className="mt-2 overflow-hidden rounded-ui border border-line">
                      <div className="flex h-8 items-center border-b border-line bg-surface px-3 text-xs text-muted">{LANGUAGES[shownLang]?.label}</div>
                      <pre className="max-h-[420px] overflow-auto bg-[var(--editor)] p-4 font-mono text-[12.5px] leading-relaxed text-ink">
                        {shownCode || (view === "best" ? "No submission." : "Nothing saved.")}
                      </pre>
                    </div>
                    {detail.attempt.user_agent ? <p className="mt-3 break-all font-mono text-[11px] text-muted">{detail.attempt.user_agent}</p> : null}
                  </div>
                ) : null}
              </section>
            ) : null}
          </div>
        </div>

        {row.attempt_id ? (
          <div className="flex items-center justify-between gap-3 border-t border-line bg-surface px-6 py-3">
            <p className="text-xs text-muted">Reset lets the student start again with a full timer, inside the window. The old attempt is archived.</p>
            <Button size="sm" variant="danger" onClick={() => setConfirmReset(true)}>Reset attempt</Button>
          </div>
        ) : null}
      </aside>

      <div onClick={(e) => e.stopPropagation()}>
        <Dialog
          open={confirmReset}
          onClose={() => setConfirmReset(false)}
          title="Reset this attempt?"
          tone="bad"
          footer={<><Button onClick={() => setConfirmReset(false)}>Cancel</Button><Button variant="danger" onClick={reset}>Reset</Button></>}
        >
          {row.name} will be able to start the test again with a full timer, inside the test window. Their current score and violations leave the results sheet.
        </Dialog>
      </div>
    </div>
  );
}
