"use client";

import { useEffect, useState } from "react";
import { X } from "@phosphor-icons/react/dist/ssr";
import { Badge, Button, Dialog, Skeleton, cx } from "@/components/ui";
import { api, ApiError, formatWhen } from "@/lib/client/api";
import { LANGUAGES, type Language } from "@/lib/shared/languages";
import type { AttemptState, Violation } from "@/lib/shared/types";

interface Detail {
  attempt: {
    id: string;
    state: AttemptState;
    started_at: string;
    expires_at: string;
    submitted_at: string | null;
    auto_submitted: boolean;
    submitted_due_to_violation: boolean;
    user_agent: string;
    score: { marks_obtained: number; total_marks: number; percent: number; solved: number; count: number };
    violations: Violation[];
  };
  candidate: { name: string; username: string; email: string };
  problems: {
    id: string;
    title: string;
    marks: number;
    submissions: number;
    best: { marks_obtained: number; passed: number; total: number; language: Language; at: string; code: string } | null;
    final_language: Language;
    final_code: string;
  }[];
}

const time = new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit", second: "2-digit" });

export function AttemptDrawer({ attemptId, onClose, onReset }: { attemptId: string | null; onClose: () => void; onReset: () => void }) {
  const [data, setData] = useState<Detail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [problemIdx, setProblemIdx] = useState(0);
  const [view, setView] = useState<"best" | "final">("best");
  const [confirmReset, setConfirmReset] = useState(false);

  useEffect(() => {
    if (!attemptId) return;
    setData(null);
    setError(null);
    setProblemIdx(0);
    api.get<Detail>(`/api/admin/attempts/${attemptId}`)
      .then(setData)
      .catch((e) => setError(e instanceof ApiError ? e.message : "Could not load the attempt."));
  }, [attemptId]);

  useEffect(() => {
    if (!attemptId) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [attemptId, onClose]);

  if (!attemptId) return null;
  const p = data?.problems[problemIdx];
  const shownCode = p ? (view === "best" && p.best ? p.best.code : p.final_code) : "";
  const shownLang = p ? (view === "best" && p.best ? p.best.language : p.final_language) : "python";
  const started = data ? new Date(data.attempt.started_at).getTime() : 0;

  async function reset() {
    if (!attemptId) return;
    try {
      await api.del(`/api/admin/attempts/${attemptId}`);
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
        aria-label="Attempt detail"
      >
        <div className="flex items-start justify-between gap-4 border-b border-line bg-surface px-6 py-4">
          <div className="min-w-0">
            <p className="truncate text-lg font-semibold">{data?.candidate.name ?? "Loading"}</p>
            <p className="font-mono text-xs text-muted">{data?.candidate.username} {data?.candidate.email ? `| ${data.candidate.email}` : ""}</p>
          </div>
          <button onClick={onClose} aria-label="Close" className="grid h-8 w-8 place-items-center rounded-ui text-muted hover:bg-sunken hover:text-ink"><X size={16} /></button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-6">
          {error ? <p className="text-sm text-bad">{error}</p> : null}
          {!data && !error ? <div className="grid gap-3"><Skeleton className="h-16" /><Skeleton className="h-64" /></div> : null}
          {data ? (
            <div className="grid gap-8">
              <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm sm:grid-cols-4">
                <div><dt className="text-xs text-muted">Score</dt><dd className="font-mono tabular">{data.attempt.score.marks_obtained}/{data.attempt.score.total_marks}</dd></div>
                <div><dt className="text-xs text-muted">Solved</dt><dd className="font-mono tabular">{data.attempt.score.solved}/{data.attempt.score.count}</dd></div>
                <div><dt className="text-xs text-muted">Started</dt><dd>{formatWhen(data.attempt.started_at)}</dd></div>
                <div><dt className="text-xs text-muted">Handed in</dt><dd>{data.attempt.submitted_at ? formatWhen(data.attempt.submitted_at) : <span className="text-muted">Not yet</span>}</dd></div>
              </dl>
              {data.attempt.auto_submitted ? (
                <p className="rounded-ui border border-bad bg-bad-soft px-3 py-2 text-sm text-bad">
                  Handed in automatically{data.attempt.submitted_due_to_violation ? " after reaching the violation limit" : ""}.
                </p>
              ) : null}

              <section>
                <div className="flex flex-wrap items-center gap-2">
                  {data.problems.map((x, i) => (
                    <button
                      key={x.id}
                      onClick={() => setProblemIdx(i)}
                      className={cx("h-8 rounded-ui border px-3 text-[13px]", i === problemIdx ? "border-ink bg-ink text-bg" : "border-line text-ink-2 hover:border-line-strong")}
                    >
                      P{i + 1} <span className="font-mono">{x.best ? `${x.best.marks_obtained}/${x.marks}` : "-"}</span>
                    </button>
                  ))}
                </div>
                {p ? (
                  <div className="mt-4">
                    <div className="flex flex-wrap items-center gap-3">
                      <p className="font-medium">{p.title}</p>
                      <span className="text-xs text-muted">{p.submissions} submission{p.submissions === 1 ? "" : "s"}</span>
                      <div className="ml-auto flex rounded-ui border border-line p-0.5">
                        {(["best", "final"] as const).map((v) => (
                          <button key={v} onClick={() => setView(v)} className={cx("h-7 rounded-[4px] px-2.5 text-xs", view === v ? "bg-sunken text-ink" : "text-muted")}>
                            {v === "best" ? "Best submission" : "Last saved"}
                          </button>
                        ))}
                      </div>
                    </div>
                    {view === "best" && p.best ? (
                      <p className="mt-2 text-xs text-muted">{p.best.passed}/{p.best.total} tests passed | submitted {formatWhen(p.best.at)}</p>
                    ) : null}
                    <div className="mt-3 overflow-hidden rounded-ui border border-line">
                      <div className="flex h-8 items-center border-b border-line bg-surface px-3 text-xs text-muted">{LANGUAGES[shownLang]?.label}</div>
                      <pre className="max-h-[420px] overflow-auto bg-[var(--editor)] p-4 font-mono text-[12.5px] leading-relaxed text-ink">
                        {shownCode || (view === "best" ? "No submission." : "Nothing saved.")}
                      </pre>
                    </div>
                  </div>
                ) : null}
              </section>

              <section>
                <h3 className="text-sm font-semibold">Violations <span className="font-mono text-muted">{data.attempt.violations.length}</span></h3>
                {data.attempt.violations.length === 0 ? (
                  <p className="mt-2 text-sm text-muted">None recorded.</p>
                ) : (
                  <ol className="mt-3 grid gap-px overflow-hidden rounded-ui border border-line bg-line">
                    {data.attempt.violations.map((v) => {
                      const offset = Math.max(0, Math.round((new Date(v.timestamp).getTime() - started) / 1000));
                      return (
                        <li key={v.id} className="grid grid-cols-[72px_88px_1fr] items-center gap-3 bg-surface px-3 py-2 text-sm">
                          <span className="font-mono text-xs text-muted tabular">+{Math.floor(offset / 60)}m {offset % 60}s</span>
                          <Badge tone={v.type === "CRITICAL" ? "bad" : "warn"}>{v.type === "CRITICAL" ? "Critical" : "Warning"}</Badge>
                          <span className="min-w-0 text-ink-2">
                            {v.description}
                            <span className="ml-2 text-xs text-muted">{time.format(new Date(v.timestamp))}</span>
                          </span>
                        </li>
                      );
                    })}
                  </ol>
                )}
              </section>

              {data.attempt.user_agent ? <p className="break-all font-mono text-[11px] text-muted">{data.attempt.user_agent}</p> : null}
            </div>
          ) : null}
        </div>

        {data ? (
          <div className="flex items-center justify-between gap-3 border-t border-line bg-surface px-6 py-3">
            <p className="text-xs text-muted">Reset removes this attempt so the candidate can start again. The old one is archived.</p>
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
          {data?.candidate.name} will be able to start the test again with a full timer, inside the test window. Their current score and violations leave the results sheet.
        </Dialog>
      </div>
    </div>
  );
}
