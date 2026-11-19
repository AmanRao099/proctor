"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { ArrowRight, Clock, Code, VideoCamera } from "@phosphor-icons/react/dist/ssr";
import { Badge, Button, Notice, Skeleton } from "@/components/ui";
import { api, ApiError, formatWhen } from "@/lib/client/api";
import type { AttemptState, TestWindow } from "@/lib/shared/types";

interface MyTest {
  id: string;
  title: string;
  window: TestWindow;
  state: AttemptState;
  starts_at: string;
  ends_at: string;
  duration_minutes: number;
  problem_count: number;
  total_marks: number;
  proctored: boolean;
  can_start: boolean;
  score: { marks_obtained: number; total_marks: number; percent: number; solved: number; count: number } | null;
}

function statusOf(t: MyTest): { label: string; tone: "neutral" | "accent" | "ok" | "warn" } {
  if (t.state === "submitted") return { label: "Handed in", tone: "ok" };
  if (t.state === "timed_out") return { label: "Time over", tone: "neutral" };
  if (t.state === "in_progress") return { label: "In progress", tone: "warn" };
  if (t.window === "live") return { label: "Open now", tone: "accent" };
  if (t.window === "upcoming") return { label: "Upcoming", tone: "neutral" };
  return { label: "Closed", tone: "neutral" };
}

export default function DashboardPage() {
  const [tests, setTests] = useState<MyTest[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [skew, setSkew] = useState(0);

  const load = useCallback(async () => {
    try {
      const res = await api.get<{ tests: MyTest[]; server_time: string }>("/api/tests");
      setSkew(new Date(res.server_time).getTime() - Date.now());
      setTests(res.tests);
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not load your tests.");
    }
  }, []);

  useEffect(() => {
    void load();
    // Refresh as windows open and close.
    const timer = window.setInterval(() => void load(), 30_000);
    return () => window.clearInterval(timer);
  }, [load]);

  const live = tests?.filter((t) => t.can_start) ?? [];
  const rest = tests?.filter((t) => !t.can_start) ?? [];

  return (
    <div className="flex flex-col gap-10">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Your tests</h1>
        <p className="mt-1 text-sm text-muted">Tests open at their scheduled time. Your timer starts when you open the paper, not before.</p>
      </div>

      {error ? <Notice tone="bad" title="Something went wrong">{error}</Notice> : null}

      {tests === null && !error ? (
        <div className="grid gap-3">
          <Skeleton className="h-28" />
          <Skeleton className="h-16" />
          <Skeleton className="h-16" />
        </div>
      ) : null}

      {tests && tests.length === 0 ? (
        <div className="rounded-ui border border-dashed border-line-strong px-6 py-14 text-center">
          <p className="font-medium">No tests assigned yet</p>
          <p className="mt-1 text-sm text-muted">When your organiser assigns you a test it will appear here. This page refreshes on its own.</p>
        </div>
      ) : null}

      {live.length ? (
        <section className="grid gap-3">
          {live.map((t) => (
            <article key={t.id} className="grid gap-5 rounded-ui border border-ink/80 bg-surface p-5 sm:grid-cols-[1fr_auto] sm:items-center sm:p-6">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone={statusOf(t).tone}>{statusOf(t).label}</Badge>
                  <span className="text-xs text-muted">Closes {formatWhen(t.ends_at)}</span>
                </div>
                <h2 className="mt-3 truncate text-xl font-semibold tracking-tight">{t.title}</h2>
                <dl className="mt-3 flex flex-wrap gap-x-6 gap-y-2 text-sm text-ink-2">
                  <div className="flex items-center gap-1.5"><Clock size={15} className="text-muted" />{t.duration_minutes} min</div>
                  <div className="flex items-center gap-1.5"><Code size={15} className="text-muted" />{t.problem_count} problem{t.problem_count === 1 ? "" : "s"}, {t.total_marks} marks</div>
                  {t.proctored ? <div className="flex items-center gap-1.5"><VideoCamera size={15} className="text-muted" />Camera proctored</div> : null}
                </dl>
              </div>
              <Link href={`/test/${t.id}/check`} className="sm:justify-self-end">
                <Button variant="primary" className="w-full sm:w-auto">
                  {t.state === "in_progress" ? "Resume test" : "Start test"}
                  <ArrowRight size={16} />
                </Button>
              </Link>
            </article>
          ))}
        </section>
      ) : null}

      {rest.length ? (
        <section>
          <h2 className="mb-3 text-sm font-medium text-muted">{live.length ? "Other tests" : "All tests"}</h2>
          <div className="overflow-hidden rounded-ui border border-line bg-surface">
            {rest.map((t, i) => {
              const s = statusOf(t);
              return (
                <div key={t.id} className={`grid gap-2 px-5 py-4 sm:grid-cols-[1fr_auto_auto] sm:items-center sm:gap-6 ${i ? "border-t border-line" : ""}`}>
                  <div className="min-w-0">
                    <p className="truncate font-medium">{t.title}</p>
                    <p className="text-xs text-muted">
                      {t.window === "upcoming" ? `Opens ${formatWhen(t.starts_at)}` : `Window ${formatWhen(t.starts_at)} to ${formatWhen(t.ends_at)}`}
                      {" "}| {t.duration_minutes} min
                    </p>
                  </div>
                  {t.score ? (
                    <p className="font-mono text-sm tabular">
                      {t.score.marks_obtained}<span className="text-muted">/{t.score.total_marks}</span>
                    </p>
                  ) : <span />}
                  <Badge tone={s.tone}>{s.label}</Badge>
                </div>
              );
            })}
          </div>
        </section>
      ) : null}

      {skew && Math.abs(skew) > 120_000 ? (
        <Notice tone="warn" title="Your computer clock is off">
          It differs from the server by {Math.round(Math.abs(skew) / 60000)} minutes. Test times here follow the server, so nothing changes for your test.
        </Notice>
      ) : null}
    </div>
  );
}
