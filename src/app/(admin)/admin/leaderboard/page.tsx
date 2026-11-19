"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { DownloadSimple } from "@phosphor-icons/react/dist/ssr/DownloadSimple";
import { MagnifyingGlass } from "@phosphor-icons/react/dist/ssr/MagnifyingGlass";
import { Trophy } from "@phosphor-icons/react/dist/ssr/Trophy";
import { PageHeader } from "@/components/admin/AdminShell";
import { ResultsBoard, downloadText } from "@/components/admin/ResultsBoard";
import { Button, Input, Person, Notice, Select, Skeleton, cx } from "@/components/ui";
import { useApi } from "@/lib/client/useApi";
import { api, ApiError, formatWhen } from "@/lib/client/api";

interface Row {
  rank: number; user_id: string; name: string; username: string; tests_taken: number;
  marks_obtained: number; marks_possible: number; percent: number; best_percent: number; tests_passed: number;
  solved: number; problems: number; violations: number; auto_submitted: number; last_activity: string;
}
interface Data { rows: Row[]; tests: { id: string; title: string; window: string; starts_at: string; started: number }[] }

export default function LeaderboardPage() {
  const { data, error } = useApi<Data>("/api/admin/leaderboard");
  const [scope, setScope] = useState("overall");
  const [q, setQ] = useState("");
  // Open on the live test's board when one is running, once.
  const picked = useRef(false);
  useEffect(() => {
    if (!data || picked.current) return;
    picked.current = true;
    const live = data.tests.find((t) => t.window === "live");
    if (live) setScope(live.id);
  }, [data]);

  const rows = useMemo(() => (data?.rows ?? []).filter((r) => !q || `${r.name} ${r.username}`.toLowerCase().includes(q.toLowerCase())), [data, q]);

  function exportCsv() {
    const head = ["Rank", "Name", "Username", "Tests taken", "Marks", "Possible", "Percent", "Best percent", "Tests passed", "Solved", "Problems", "Violations", "Auto handed in", "Last activity"];
    const body = (data?.rows ?? []).map((r) => [r.rank, r.name, r.username, r.tests_taken, r.marks_obtained, r.marks_possible, r.percent, r.best_percent, r.tests_passed, r.solved, r.problems, r.violations, r.auto_submitted, r.last_activity]);
    downloadText("leaderboard_overall.csv", [head, ...body].map((l) => l.map((v) => (/[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : v)).join(",")).join("\n"));
  }

  return (
    <div>
      <PageHeader
        title="Leaderboard"
        subtitle="Overall standing across every test, or one test's live board."
        actions={
          <Select value={scope} onChange={(e) => setScope(e.target.value)} className="h-9 w-72" aria-label="Leaderboard scope">
            <option value="overall">Overall, all tests</option>
            {(data?.tests ?? []).map((t) => (
              <option key={t.id} value={t.id}>{t.window === "live" ? "Live: " : ""}{t.title} ({formatWhen(t.starts_at)})</option>
            ))}
          </Select>
        }
      />
      {error ? <Notice tone="bad" title="Could not load the leaderboard">{error}</Notice> : null}
      {!data && !error ? <Skeleton className="h-72" /> : null}

      {data && scope !== "overall" ? <ResultsBoard key={scope} testId={scope} /> : null}

      {data && scope === "overall" ? (
        <div className="grid gap-6">
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative w-full max-w-xs">
              <MagnifyingGlass size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
              <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search students" className="h-9 pl-9" aria-label="Search" />
            </div>
            <Button size="sm" className="ml-auto" onClick={exportCsv} disabled={!data.rows.length}><DownloadSimple size={14} /> CSV</Button>
          </div>
          {data.rows.length === 0 ? (
            <div className="rounded-card border border-dashed border-line-strong bg-surface/60 px-6 py-14 text-center">
              <p className="font-medium">No rankings yet</p>
              <p className="mt-1 text-sm text-muted">The board fills in as students sit tests.</p>
            </div>
          ) : (
            <>
              <div className="grid gap-3 sm:grid-cols-3">
                {data.rows.slice(0, 3).map((r) => (
                  <div key={r.user_id} className={cx("rounded-ui border bg-surface px-5 py-4", r.rank === 1 ? "border-accent" : "border-line")}>
                    <p className="flex items-center gap-1.5 text-xs text-muted"><Trophy size={14} weight={r.rank === 1 ? "fill" : "regular"} className={r.rank === 1 ? "text-accent" : ""} /> Rank {r.rank}</p>
                    <p className="mt-2 truncate font-semibold">{r.name}</p>
                    <p className="font-mono text-xs text-muted">{r.username}</p>
                    <p className="mt-3 text-2xl font-semibold tabular">{r.percent}%</p>
                    <p className="text-xs text-muted">{r.marks_obtained}/{r.marks_possible} marks over {r.tests_taken} test{r.tests_taken === 1 ? "" : "s"}</p>
                  </div>
                ))}
              </div>
              <div className="overflow-x-auto rounded-card border border-line bg-surface shadow-card">
                <table className="data-table min-w-[760px]">
                  <thead>
                    <tr>
                      <th className="w-14 px-4 py-3 font-medium">Rank</th>
                      <th className="px-3 py-3 font-medium">Student</th>
                      <th className="px-3 py-3 text-right font-medium">Score</th>
                      <th className="px-3 py-3 text-right font-medium">Marks</th>
                      <th className="px-3 py-3 text-right font-medium">Tests</th>
                      <th className="px-3 py-3 text-right font-medium">Solved</th>
                      <th className="px-3 py-3 text-right font-medium">Best</th>
                      <th className="px-4 py-3 text-right font-medium">Violations</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => (
                      <tr key={r.user_id} className="">
                        <td className="px-4 py-3 text-xs tabular">{r.rank}</td>
                        <td className="px-3 py-3"><Person name={r.name} sub={r.username} /></td>
                        <td className="px-3 py-3 text-right tabular">{r.percent}%</td>
                        <td className="px-3 py-3 text-right text-xs tabular">{r.marks_obtained}<span className="text-muted">/{r.marks_possible}</span></td>
                        <td className="px-3 py-3 text-right text-xs tabular">{r.tests_taken}<span className="text-muted"> ({r.tests_passed} passed)</span></td>
                        <td className="px-3 py-3 text-right text-xs tabular">{r.solved}/{r.problems}</td>
                        <td className="px-3 py-3 text-right text-xs tabular">{r.best_percent}%</td>
                        <td className={cx("px-4 py-3 text-right text-xs tabular", r.auto_submitted ? "text-bad" : r.violations ? "text-warn" : "text-muted")}>
                          {r.violations}{r.auto_submitted ? ` (${r.auto_submitted} auto)` : ""}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="text-xs text-muted">Ranked on the share of all available marks earned across the tests a student sat, then total marks, then fewer violations.</p>
            </>
          )}
        </div>
      ) : null}
    </div>
  );
}
