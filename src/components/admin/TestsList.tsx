"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Plus } from "@phosphor-icons/react/dist/ssr/Plus";
import { Badge, Button, Notice, Skeleton, EmptyState } from "@/components/ui";
import { useApi } from "@/lib/client/useApi";
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

export function TestsList() {
  const { data, error } = useApi<{ tests: Row[] }>("/api/admin/tests");
  const rows = data ? data.tests : null;

  return (
    <div className="flex flex-col gap-6">
      {error ? <Notice tone="bad" title="Could not load tests">{error}</Notice> : null}

      {rows === null && !error ? (
        <div className="grid gap-2">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-16" />)}</div>
      ) : null}

      {rows?.length === 0 ? (
        <EmptyState image="no-tests" title="No tests yet" action={<Link href="/admin/tests/new"><Button variant="primary"><Plus size={16} /> New test</Button></Link>}>
          Create a test, add problems with test cases, assign students, then publish it.
        </EmptyState>
      ) : null}

      {rows?.length ? (
        <div className="overflow-x-auto rounded-card border border-line bg-surface shadow-card">
          <table className="data-table min-w-[760px]">
            <thead>
              <tr>
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
                  <tr key={r.id} className="">
                    <td className="px-5 py-3.5">
                      <Link href={`/admin/tests/${r.id}`} className="font-medium text-ink hover:underline">{r.title}</Link>
                      <div className="mt-1 flex items-center gap-2">
                        <Badge tone={s.tone}>{s.label}</Badge>
                        <span className="text-xs text-muted">{r.duration_minutes} min{r.proctored ? ", proctored" : ""}</span>
                      </div>
                    </td>
                    <td className="px-3 py-3.5 text-xs text-ink-2">{formatWhen(r.starts_at)}<br /><span className="text-muted">to {formatWhen(r.ends_at)}</span></td>
                    <td className="px-3 py-3.5 text-xs tabular">{r.problem_count} | {r.total_marks} marks</td>
                    <td className="px-3 py-3.5 text-xs tabular">{r.assigned === "all" ? "Everyone" : r.assigned}</td>
                    <td className="px-3 py-3.5 text-xs tabular">{r.submitted}<span className="text-muted">/{r.started} started</span></td>
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
