"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowRight, Plus } from "@phosphor-icons/react/dist/ssr";
import { PageHeader, Stat, StatGrid } from "@/components/admin/AdminShell";
import { Badge, Button, Notice, Skeleton } from "@/components/ui";
import { api, ApiError, formatWhen } from "@/lib/client/api";

interface Overview {
  stats: {
    candidates: number; active_today: number; new_this_week: number; writing_now: number;
    hand_ins: number; hand_ins_today: number; average_score: number; pass_rate: number; pass_mark: number;
    flagged_attempts: number; pending_appeals: number; tests_live: number; tests_upcoming: number; tests_draft: number;
  };
  live: { id: string; title: string; ends_at: string; writing: number }[];
  upcoming: { id: string; title: string; starts_at: string; duration_minutes: number }[];
  recent: {
    attempt_id: string; test_id: string; test: string; name: string; username: string;
    marks_obtained: number; total_marks: number; percent: number; violation_count: number; auto_submitted: boolean; submitted_at: string;
  }[];
}

export default function OverviewPage() {
  const [data, setData] = useState<Overview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [judge, setJudge] = useState<{ ok: boolean; version?: string; error?: string } | null>(null);

  useEffect(() => {
    const load = () => api.get<Overview>("/api/admin/overview").then(setData).catch((e) => setError(e instanceof ApiError ? e.message : "Could not load."));
    load();
    api.get<{ judge0: { ok: boolean; version?: string; error?: string } }>("/api/admin/health").then((r) => setJudge(r.judge0)).catch(() => setJudge({ ok: false }));
    const t = window.setInterval(load, 30_000);
    return () => window.clearInterval(t);
  }, []);

  const s = data?.stats;
  return (
    <div>
      <PageHeader
        title="Overview"
        subtitle={<>Code runner {judge === null ? "checking" : judge.ok ? <span className="text-ok">reachable{judge.version ? `, Judge0 ${judge.version}` : ""}</span> : <span className="text-bad">unreachable</span>}</>}
        actions={<Link href="/admin/tests/new"><Button variant="primary"><Plus size={16} /> New test</Button></Link>}
      />
      {error ? <Notice tone="bad" title="Could not load the overview">{error}</Notice> : null}
      {!s && !error ? <div className="grid gap-3"><Skeleton className="h-24" /><Skeleton className="h-24" /><Skeleton className="h-64" /></div> : null}

      {s ? (
        <div className="grid gap-8">
          <StatGrid>
            <Stat label="Students" value={s.candidates} hint={`${s.new_this_week} new this week`} />
            <Stat label="Signed in today" value={s.active_today} />
            <Stat label="Writing now" value={s.writing_now} tone={s.writing_now ? "accent" : undefined} hint={<Link href="/admin/active" className="hover:text-ink">Open live view</Link>} />
            <Stat label="Hand-ins" value={s.hand_ins} hint={`${s.hand_ins_today} today`} />
            <Stat label="Average score" value={`${s.average_score}%`} />
            <Stat label="Pass rate" value={`${s.pass_rate}%`} hint={`Pass mark ${s.pass_mark}%`} />
            <Stat label="Flagged attempts" value={s.flagged_attempts} tone={s.flagged_attempts ? "warn" : undefined} />
            <Stat label="Pending appeals" value={s.pending_appeals} tone={s.pending_appeals ? "bad" : undefined} hint={s.pending_appeals ? <Link href="/admin/appeals" className="hover:text-ink">Review</Link> : undefined} />
          </StatGrid>

          <div className="grid gap-8 lg:grid-cols-[1fr_1.4fr]">
            <section>
              <h2 className="mb-3 text-sm font-semibold">Tests</h2>
              <div className="overflow-hidden rounded-ui border border-line bg-surface">
                {data!.live.map((t) => (
                  <Link key={t.id} href={`/admin/tests/${t.id}/results`} className="flex items-center gap-3 border-t border-line px-4 py-3 first:border-t-0 hover:bg-sunken/60">
                    <Badge tone="accent">Live</Badge>
                    <span className="min-w-0 flex-1 truncate text-sm">{t.title}</span>
                    <span className="font-mono text-xs text-muted">{t.writing} writing</span>
                  </Link>
                ))}
                {data!.upcoming.map((t) => (
                  <Link key={t.id} href={`/admin/tests/${t.id}`} className="flex items-center gap-3 border-t border-line px-4 py-3 first:border-t-0 hover:bg-sunken/60">
                    <Badge tone="warn">Scheduled</Badge>
                    <span className="min-w-0 flex-1 truncate text-sm">{t.title}</span>
                    <span className="text-xs text-muted">{formatWhen(t.starts_at)}</span>
                  </Link>
                ))}
                {!data!.live.length && !data!.upcoming.length ? (
                  <p className="px-4 py-8 text-center text-sm text-muted">Nothing live or scheduled. {s.tests_draft ? `${s.tests_draft} draft${s.tests_draft === 1 ? "" : "s"} waiting.` : ""}</p>
                ) : null}
              </div>
              <Link href="/admin/dsa-master?view=schedule" className="mt-2 inline-flex items-center gap-1 text-sm text-muted hover:text-ink">All tests <ArrowRight size={13} /></Link>
            </section>

            <section>
              <h2 className="mb-3 text-sm font-semibold">Latest hand-ins</h2>
              <div className="overflow-hidden rounded-ui border border-line bg-surface">
                {data!.recent.length === 0 ? <p className="px-4 py-8 text-center text-sm text-muted">No hand-ins yet.</p> : data!.recent.map((r) => (
                  <Link key={r.attempt_id} href={`/admin/tests/${r.test_id}/results`} className="grid grid-cols-[1fr_auto] items-center gap-x-4 border-t border-line px-4 py-3 first:border-t-0 hover:bg-sunken/60">
                    <span className="min-w-0">
                      <span className="block truncate text-sm">{r.name} <span className="font-mono text-xs text-muted">{r.username}</span></span>
                      <span className="block truncate text-xs text-muted">{r.test} | {formatWhen(r.submitted_at)}</span>
                    </span>
                    <span className="text-right">
                      <span className="block font-mono text-sm tabular">{r.marks_obtained}<span className="text-muted">/{r.total_marks}</span></span>
                      {r.auto_submitted ? <span className="text-xs text-bad">auto handed in</span> : r.violation_count ? <span className="text-xs text-warn">{r.violation_count} violations</span> : null}
                    </span>
                  </Link>
                ))}
              </div>
            </section>
          </div>
        </div>
      ) : null}
    </div>
  );
}
