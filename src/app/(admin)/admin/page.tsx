"use client";

import Link from "next/link";
import { ArrowRight } from "@phosphor-icons/react/dist/ssr/ArrowRight";
import { ArrowDownRight } from "@phosphor-icons/react/dist/ssr/ArrowDownRight";
import { ArrowUpRight } from "@phosphor-icons/react/dist/ssr/ArrowUpRight";
import { CalendarBlank } from "@phosphor-icons/react/dist/ssr/CalendarBlank";
import { ChartLineUp } from "@phosphor-icons/react/dist/ssr/ChartLineUp";
import { Gavel } from "@phosphor-icons/react/dist/ssr/Gavel";
import { Plus } from "@phosphor-icons/react/dist/ssr/Plus";
import { Pulse } from "@phosphor-icons/react/dist/ssr/Pulse";
import { ShieldWarning } from "@phosphor-icons/react/dist/ssr/ShieldWarning";
import { SignIn } from "@phosphor-icons/react/dist/ssr/SignIn";
import { Target } from "@phosphor-icons/react/dist/ssr/Target";
import { Tray } from "@phosphor-icons/react/dist/ssr/Tray";
import { Users } from "@phosphor-icons/react/dist/ssr/Users";
import { ColumnChart } from "@/components/charts/Charts";
import { Badge, Button, Card, EmptyState, Illustration, Notice, Person, Skeleton, cx } from "@/components/ui";
import { formatWhen } from "@/lib/client/api";
import { useApi } from "@/lib/client/useApi";
import type { SessionUser } from "@/lib/shared/types";

interface Overview {
  stats: {
    candidates: number; active_today: number; new_this_week: number; writing_now: number;
    hand_ins: number; hand_ins_today: number; average_score: number; pass_rate: number; pass_mark: number;
    flagged_attempts: number; pending_appeals: number; tests_live: number; tests_upcoming: number; tests_draft: number;
  };
  daily: { date: string; hand_ins: number; average: number }[];
  week: { this_week: number; last_week: number };
  bands: { label: string; low: number; high: number; count: number }[];
  live: { id: string; title: string; ends_at: string; writing: number }[];
  upcoming: { id: string; title: string; starts_at: string; duration_minutes: number }[];
  recent: {
    attempt_id: string; test_id: string; test: string; name: string; username: string;
    marks_obtained: number; total_marks: number; percent: number; violation_count: number; auto_submitted: boolean; submitted_at: string;
  }[];
}

const dayFmt = new Intl.DateTimeFormat(undefined, { weekday: "long", day: "numeric", month: "long" });
const shortFmt = new Intl.DateTimeFormat(undefined, { day: "numeric", month: "short" });
const dayNum = new Intl.DateTimeFormat(undefined, { day: "numeric" });

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
}

function Kpi({ label, value, icon, foot, tone }: { label: string; value: React.ReactNode; icon: React.ReactNode; foot?: React.ReactNode; tone?: "accent" }) {
  return (
    <Card className="p-5">
      <div className="flex items-center justify-between">
        <span className="text-[13px] font-medium text-muted">{label}</span>
        <span className={cx("grid h-9 w-9 place-items-center rounded-ui", tone === "accent" ? "bg-accent text-accent-ink" : "bg-accent-soft text-accent")}>{icon}</span>
      </div>
      <p className="mt-3 text-[30px] font-semibold leading-none tracking-tight text-ink tabular">{value}</p>
      {foot ? <div className="mt-3 text-xs text-muted">{foot}</div> : null}
    </Card>
  );
}

function Trend({ now, before }: { now: number; before: number }) {
  if (!now && !before) return <span>No hand-ins in the last two weeks</span>;
  const diff = now - before;
  const pct = before ? Math.round((diff / before) * 100) : null;
  const up = diff >= 0;
  return (
    <span className="flex items-center gap-1.5">
      <span className={cx("inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 font-medium", up ? "bg-ok-soft text-ok" : "bg-bad-soft text-bad")}>
        {up ? <ArrowUpRight size={12} weight="bold" /> : <ArrowDownRight size={12} weight="bold" />}
        {pct === null ? `+${diff}` : `${Math.abs(pct)}%`}
      </span>
      vs last week
    </span>
  );
}

function MiniStat({ icon, label, value, href, tone }: { icon: React.ReactNode; label: string; value: React.ReactNode; href?: string; tone?: "warn" | "bad" }) {
  const body = (
    <span className="flex items-center gap-3">
      <span className={cx("grid h-9 w-9 shrink-0 place-items-center rounded-full", tone === "bad" ? "bg-bad-soft text-bad" : tone === "warn" ? "bg-warn-soft text-warn" : "bg-sunken text-ink-2")}>{icon}</span>
      <span className="min-w-0 leading-tight">
        <span className="block text-lg font-semibold tabular text-ink">{value}</span>
        <span className="block truncate text-xs text-muted">{label}</span>
      </span>
    </span>
  );
  return href ? <Link href={href} className="rounded-ui p-1.5 transition-colors hover:bg-raised">{body}</Link> : <div className="p-1.5">{body}</div>;
}

export default function OverviewPage() {
  const { data, error } = useApi<Overview>("/api/admin/overview", { refreshMs: 30_000 });
  const me = useApi<{ user: SessionUser }>("/api/auth/me");
  const s = data?.stats;
  const firstName = me.data?.user.name.split(/\s+/)[0];

  return (
    <div className="grid gap-6">
      <Card className="relative overflow-hidden bg-gradient-to-br from-accent-soft via-surface to-surface">
        <div className="grid items-center gap-6 p-6 sm:p-8 md:grid-cols-[1fr_auto]">
          <div className="min-w-0">
            <p className="text-sm text-muted">{dayFmt.format(new Date())}</p>
            <h1 className="mt-1 text-[28px] font-semibold leading-tight tracking-tight text-ink">
              {greeting()}{firstName ? `, ${firstName}` : ""}
            </h1>
            <p className="mt-2 max-w-lg text-sm text-ink-2">
              {!s ? "Loading today's picture." : s.writing_now
                ? `${s.writing_now} student${s.writing_now === 1 ? " is" : "s are"} writing right now across ${s.tests_live} live test${s.tests_live === 1 ? "" : "s"}.`
                : s.tests_upcoming
                  ? `No test is live. ${s.tests_upcoming} test${s.tests_upcoming === 1 ? " is" : "s are"} scheduled.`
                  : "No test is live or scheduled. Create one to get started."}
            </p>
            <div className="mt-5 flex flex-wrap gap-2">
              <Link href="/admin/tests/new"><Button variant="primary"><Plus size={16} /> New test</Button></Link>
              <Link href="/admin/active"><Button><Pulse size={16} /> Live view</Button></Link>
            </div>
          </div>
          <Illustration name="admin-overview" className="hidden h-40 w-auto md:block" />
        </div>
      </Card>

      {error ? <Notice tone="bad" title="Could not load the overview">{error}</Notice> : null}
      {!s && !error ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-36" />)}</div>
      ) : null}

      {s && data ? (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Kpi label="Students" icon={<Users size={18} />} value={s.candidates} foot={`${s.new_this_week} added this week`} />
            <Kpi label="Writing now" icon={<Pulse size={18} />} tone="accent" value={s.writing_now} foot={<Link href="/admin/active" className="font-medium text-accent hover:underline">Open live view</Link>} />
            <Kpi label="Hand-ins this week" icon={<Tray size={18} />} value={data.week.this_week} foot={<Trend now={data.week.this_week} before={data.week.last_week} />} />
            <Kpi label="Average score" icon={<ChartLineUp size={18} />} value={`${s.average_score}%`} foot={`Pass mark ${s.pass_mark}%`} />
          </div>

          <div className="grid gap-6 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
            <Card className="p-5 sm:p-6">
              <h2 className="text-[15px] font-semibold">Hand-ins, last 14 days</h2>
              <p className="text-xs text-muted">{data.daily.reduce((x, d) => x + d.hand_ins, 0)} in total, {s.hand_ins_today} today</p>
              <div className="mt-5">
                <ColumnChart
                  caption="Hand-ins per day over the last 14 days"
                  height={220}
                  labelEvery={2}
                  unit=" hand-ins"
                  data={data.daily.map((d) => ({
                    label: dayNum.format(new Date(d.date)),
                    value: d.hand_ins,
                    detail: `${shortFmt.format(new Date(d.date))}${d.hand_ins ? `, average ${d.average}%` : ""}`,
                  }))}
                />
              </div>
            </Card>

            <Card className="flex flex-col p-5 sm:p-6">
              <h2 className="text-[15px] font-semibold">Tests</h2>
              <p className="text-xs text-muted">{s.tests_live} live, {s.tests_upcoming} scheduled, {s.tests_draft} draft</p>
              <div className="mt-4 grid flex-1 content-start gap-2.5">
                {data.live.map((t) => (
                  <Link key={t.id} href={`/admin/tests/${t.id}/results`} className="rounded-ui border border-accent-line bg-accent-soft/60 p-3.5 transition-colors hover:bg-accent-soft">
                    <div className="flex items-center gap-2">
                      <span className="relative flex h-2 w-2"><span className="absolute inline-flex h-full w-full rounded-full bg-accent opacity-60 motion-safe:animate-ping" /><span className="relative inline-flex h-2 w-2 rounded-full bg-accent" /></span>
                      <span className="text-xs font-medium text-accent">Live</span>
                      <span className="ml-auto text-xs text-muted">ends {formatWhen(t.ends_at)}</span>
                    </div>
                    <p className="mt-1.5 truncate text-sm font-medium text-ink">{t.title}</p>
                    <p className="text-xs text-ink-2">{t.writing} writing now</p>
                  </Link>
                ))}
                {data.upcoming.map((t) => (
                  <Link key={t.id} href={`/admin/tests/${t.id}`} className="flex items-center gap-3 rounded-ui border border-line p-3.5 transition-colors hover:bg-raised">
                    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-ui bg-sunken text-ink-2"><CalendarBlank size={17} /></span>
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium">{t.title}</span>
                      <span className="block text-xs text-muted">{formatWhen(t.starts_at)} | {t.duration_minutes} min</span>
                    </span>
                  </Link>
                ))}
                {!data.live.length && !data.upcoming.length ? (
                  <div className="grid place-items-center py-4 text-center">
                    <Illustration name="no-tests" className="h-24 w-auto" />
                    <p className="mt-3 text-sm text-muted">Nothing live or scheduled.</p>
                  </div>
                ) : null}
              </div>
              <Link href="/admin/dsa-master?view=schedule" className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-accent hover:underline">All tests <ArrowRight size={14} /></Link>
            </Card>
          </div>

          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)]">
            <Card className="p-5 sm:p-6">
              <h2 className="text-[15px] font-semibold">Score distribution</h2>
              <p className="text-xs text-muted">All finished attempts</p>
              <div className="mt-5">
                <ColumnChart
                  caption="Number of finished attempts in each score band"
                  height={190}
                  unit=" attempts"
                  data={data.bands.map((b) => ({ label: b.label, value: b.count, detail: `Scored ${b.label}` }))}
                />
              </div>
              <div className="mt-5 grid grid-cols-2 gap-2 border-t border-line pt-4">
                <MiniStat icon={<SignIn size={16} />} label="Signed in today" value={s.active_today} />
                <MiniStat icon={<Target size={16} />} label="Pass rate" value={`${s.pass_rate}%`} />
                <MiniStat icon={<ShieldWarning size={16} />} label="Flagged attempts" value={s.flagged_attempts} tone={s.flagged_attempts ? "warn" : undefined} href="/admin/dsa-master?view=integrity" />
                <MiniStat icon={<Gavel size={16} />} label="Pending appeals" value={s.pending_appeals} tone={s.pending_appeals ? "bad" : undefined} href="/admin/appeals" />
              </div>
            </Card>

            <Card className="flex flex-col">
              <div className="flex items-center justify-between px-5 pt-5 sm:px-6 sm:pt-6">
                <div>
                  <h2 className="text-[15px] font-semibold">Latest hand-ins</h2>
                  <p className="text-xs text-muted">Most recent first</p>
                </div>
                <Link href="/admin/leaderboard" className="text-sm font-medium text-accent hover:underline">Leaderboard</Link>
              </div>
              {data.recent.length === 0 ? (
                <div className="grid flex-1 place-items-center p-6 text-center">
                  <div>
                    <Illustration name="empty" className="mx-auto h-28 w-auto" />
                    <p className="mt-4 font-medium">No hand-ins yet</p>
                    <p className="text-sm text-muted">They appear here as students finish.</p>
                  </div>
                </div>
              ) : (
                <ul className="mt-3 divide-y divide-line">
                  {data.recent.map((r) => (
                    <li key={r.attempt_id}>
                      <Link href={`/admin/tests/${r.test_id}/results`} className="flex items-center gap-4 px-5 py-3 transition-colors hover:bg-raised sm:px-6">
                        <span className="min-w-0 flex-1"><Person name={r.name} sub={`${r.test} | ${formatWhen(r.submitted_at)}`} /></span>
                        {r.auto_submitted ? <Badge tone="bad">Auto handed in</Badge> : r.violation_count ? <Badge tone="warn">{r.violation_count} violations</Badge> : null}
                        <span className="w-24 shrink-0 text-right">
                          <span className="block text-sm font-semibold tabular">{r.marks_obtained}<span className="font-normal text-muted">/{r.total_marks}</span></span>
                          <span className="block text-xs text-muted">{r.percent}%</span>
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </div>
        </>
      ) : null}
    </div>
  );
}
