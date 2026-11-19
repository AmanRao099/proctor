"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Plus } from "@phosphor-icons/react/dist/ssr";
import { Badge, Button, Notice, Skeleton } from "@/components/ui";
import { api, ApiError, formatWhen } from "@/lib/client/api";
import type { TestWindow } from "@/lib/shared/types";

interface Row {
  id: string;
  title: string;
  status: "draft" | "published";
  window: TestWindow;
  starts_at: string;
  ends_at: string;
  duration_minutes: number;
  proctored: boolean;
  problem_count: number;
  total_marks: number;
  assigned: number | "all";
  started: number;
  submitted: number;
}

function status(r: Row): { label: string; tone: "neutral" | "accent" | "ok" | "warn" } {
  if (r.status === "draft") return { label: "Draft", tone: "neutral" };
  if (r.window === "live") return { label: "Live", tone: "accent" };
  if (r.window === "upcoming") return { label: "Scheduled", tone: "warn" };
  return { label: "Closed", tone: "ok" };
}

export default function AdminTestsPage() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [judge, setJudge] = useState<{ ok: boolean; version?: string; error?: string } | null>(null);

  useEffect(() => {
    api.get<{ tests: Row[] }>("/api/admin/tests")
      .then((r) => setRows(r.tests))
      .catch((e) => setError(e instanceof ApiError ? e.message : "Could not load tests."));
    api.get<{ judge0: { ok: boolean; version?: string; error?: string } }>("/api/admin/health")
      .then((r) => setJudge(r.judge0))
      .catch(() => setJudge({ ok: false, error: "Health check failed" }));
  }, []);

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Tests</h1>
          <p className="mt-1 text-sm text-muted">
            Code runner:{" "}
            {judge === null ? "checking" : judge.ok
              ? <span className="text-ok">reachable{judge.version ? ` (Judge0 ${judge.version})` : ""}</span>
              : <span className="text-bad">unreachable. {judge.error}</span>}
          </p>
        </div>
        <Link href="/admin/tests/new">
          <Button variant="primary"><Plus size={16} /> New test</Button>
        </Link>
      </div>

      {error ? <Notice tone="bad" title="Could not load tests">{error}</Notice> : null}

      {rows === null && !error ? (
        <div className="grid gap-2">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-16" />)}</div>
      ) : null}

      {rows?.length === 0 ? (
        <div className="rounded-ui border border-dashed border-line-strong px-6 py-16 text-center">
          <p className="font-medium">No tests yet</p>
          <p className="mx-auto mt-1 max-w-sm text-sm text-muted">Create a test, add problems with test cases, assign candidates, then publish it.</p>
          <Link href="/admin/tests/new" className="mt-6 inline-block"><Button variant="primary"><Plus size={16} /> New test</Button></Link>
        </div>
      ) : null}

      {rows?.length ? (
        <div className="overflow-x-auto rounded-ui border border-line bg-surface">
          <table className="w-full min-w-[760px] text-sm">
            <thead>
              <tr className="border-b border-line text-left text-xs text-muted">
                <th className="px-5 py-3 font-medium">Test</th>
                <th className="px-3 py-3 font-medium">Window</th>
                <th className="px-3 py-3 font-medium">Problems</th>
                <th className="px-3 py-3 font-medium">Candidates</th>
                <th className="px-3 py-3 font-medium">Handed in</th>
                <th className="px-5 py-3 font-medium" />
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const s = status(r);
                return (
                  <tr key={r.id} className="border-t border-line first:border-t-0 hover:bg-sunken/60">
                    <td className="px-5 py-3.5">
                      <Link href={`/admin/tests/${r.id}`} className="font-medium text-ink hover:underline">{r.title}</Link>
                      <div className="mt-1 flex items-center gap-2">
                        <Badge tone={s.tone}>{s.label}</Badge>
                        <span className="text-xs text-muted">{r.duration_minutes} min{r.proctored ? ", proctored" : ""}</span>
                      </div>
                    </td>
                    <td className="px-3 py-3.5 text-xs text-ink-2">{formatWhen(r.starts_at)}<br /><span className="text-muted">to {formatWhen(r.ends_at)}</span></td>
                    <td className="px-3 py-3.5 font-mono text-xs tabular">{r.problem_count} | {r.total_marks} marks</td>
                    <td className="px-3 py-3.5 font-mono text-xs tabular">{r.assigned === "all" ? "Everyone" : r.assigned}</td>
                    <td className="px-3 py-3.5 font-mono text-xs tabular">{r.submitted}<span className="text-muted">/{r.started} started</span></td>
                    <td className="px-5 py-3.5 text-right">
                      {r.status === "published" ? (
                        <Link href={`/admin/tests/${r.id}/results`}><Button size="sm">{r.window === "live" ? "Live board" : "Results"}</Button></Link>
                      ) : (
                        <Link href={`/admin/tests/${r.id}`}><Button size="sm" variant="ghost">Edit</Button></Link>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  );
}
