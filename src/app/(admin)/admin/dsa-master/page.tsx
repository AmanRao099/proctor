"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import {
  CalendarBlank, CaretDown, CaretRight, ChartBar, Code, FileText, Plus, ShieldWarning, UsersThree,
} from "@phosphor-icons/react/dist/ssr";
import { PageHeader, Stat, StatGrid } from "@/components/admin/AdminShell";
import { ProblemBank } from "@/components/admin/ProblemBank";
import { ResultsBoard } from "@/components/admin/ResultsBoard";
import { TestsList } from "@/components/admin/TestsList";
import { Badge, Button, Person, Notice, Select, Skeleton, cx } from "@/components/ui";
import { api, ApiError, formatWhen } from "@/lib/client/api";
import type { Violation } from "@/lib/shared/types";

/*
 * DSA MASTER: a coding round end to end, ported from MyCodeBud's DSA Master
 * (AptiMasterTab with kind="dsa"):
 *
 *   Round Analytics  participation, spread, pass rate, score bands
 *   Test Results     the ranked sheet / live board per test
 *   Integrity        who was caught, and exactly what the proctor saw
 *   Groups           who is strong at what, by difficulty and topic
 *   Problems         the problem bank
 *   Schedule         tests: create, schedule, publish
 *
 * One analytics request feeds Round, Integrity and Groups so the three always
 * describe the same window. A violation count is never shown bare: every
 * integrity row opens to the incidents it was built from.
 */

type View = "round" | "results" | "integrity" | "groups" | "problems" | "schedule";
const VIEWS: { id: View; label: string; icon: typeof ChartBar }[] = [
  { id: "round", label: "Round Analytics", icon: ChartBar },
  { id: "results", label: "Test Results", icon: FileText },
  { id: "integrity", label: "Integrity", icon: ShieldWarning },
  { id: "groups", label: "Performance Groups", icon: UsersThree },
  { id: "problems", label: "Problems", icon: Code },
  { id: "schedule", label: "Schedule Test", icon: CalendarBlank },
];

interface Member { user_id: string; name: string; username: string; asked: number; correct: number; accuracy: number }
interface Group { name: string; students_attempted: number; strong: Member[]; developing: Member[] }
interface Analytics {
  tests: { id: string; title: string; starts_at: string; students: number }[];
  round: {
    attempts: number; students_attempted: number; cohort_size: number; participation_percent: number;
    average_score: number; median_score: number; top_score: number; lowest_score: number; pass_mark: number;
    passed_students: number; pass_rate_percent: number; auto_submitted_attempts: number; flagged_attempts: number;
    clean_attempts: number; bands: { label: string; low: number; high: number; attempts: number }[];
  };
  integrity: {
    user_id: string; name: string; username: string; email: string; violation_count: number; critical_count: number;
    flagged_attempts: number; auto_submitted_attempts: number; active_strikes: number; banned: boolean; cooldown_until: string | null;
    violation_types: { type: string; count: number }[]; last_incident: string;
    incidents: { test: string; test_id: string; started_at: string | null; submitted_at: string | null; percent: number; auto_submitted: boolean; violations: Violation[] }[];
  }[];
  groups_by_test: { id: string; title: string; starts_at: string; students: number; difficulties: Group[]; topics: Group[] }[];
  thresholds: { strong_accuracy: number; weak_accuracy: number; min_asked: number; pass_mark: number };
}

function Bands({ bands, total }: { bands: Analytics["round"]["bands"]; total: number }) {
  const max = Math.max(1, ...bands.map((b) => b.attempts));
  return (
    <div className="rounded-card border border-line bg-surface p-6 shadow-card">
      <p className="text-sm font-semibold">Score distribution</p>
      <p className="text-xs text-muted">{total} finished attempt{total === 1 ? "" : "s"}</p>
      <div className="mt-5 grid grid-cols-4 items-end gap-4" style={{ height: 160 }}>
        {bands.map((b) => (
          <div key={b.label} className="flex h-full flex-col justify-end gap-2">
            <span className="text-center text-sm tabular">{b.attempts}</span>
            <div
              className={cx("rounded-t-[4px]", b.low >= 60 ? "bg-accent" : "bg-line-strong")}
              style={{ height: `${Math.max(2, (b.attempts / max) * 100)}%` }}
              title={`${b.attempts} attempts scored ${b.label}`}
            />
            <span className="text-center text-xs text-muted">{b.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function IntegrityCard({ row }: { row: Analytics["integrity"][number] }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-ui border border-line bg-surface">
      <button onClick={() => setOpen(!open)} className="grid w-full grid-cols-[16px_1fr_auto] items-start gap-3 px-4 py-3 text-left">
        {open ? <CaretDown size={14} className="mt-1 text-muted" /> : <CaretRight size={14} className="mt-1 text-muted" />}
        <div className="min-w-0">
          <Person name={row.name} sub={row.username} />
          <div className="mt-2 flex flex-wrap gap-1.5 pl-11">
            {row.violation_types.slice(0, 4).map((t) => (
              <span key={t.type} className="rounded-[4px] border border-line bg-bg px-1.5 py-0.5 text-[11px] text-ink-2">{t.type} <span className="font-mono text-muted">x{t.count}</span></span>
            ))}
            {row.violation_types.length > 4 ? <span className="text-[11px] text-muted">+{row.violation_types.length - 4} more</span> : null}
          </div>
        </div>
        <div className="flex flex-col items-end gap-1 text-right">
          <span className="text-sm tabular">{row.violation_count} <span className="text-xs text-muted">({row.critical_count} critical)</span></span>
          <span className="flex gap-1">
            {row.auto_submitted_attempts ? <Badge tone="bad">{row.auto_submitted_attempts} auto handed in</Badge> : null}
            {row.banned ? <Badge tone="bad">Barred</Badge> : row.cooldown_until ? <Badge tone="warn">Cooldown</Badge> : row.active_strikes ? <Badge tone="warn">{row.active_strikes} strike{row.active_strikes === 1 ? "" : "s"}</Badge> : null}
          </span>
        </div>
      </button>
      {open ? (
        <div className="grid gap-4 border-t border-line px-4 py-4">
          {row.incidents.map((inc, i) => {
            const started = inc.started_at ? new Date(inc.started_at).getTime() : 0;
            return (
              <div key={i}>
                <p className="text-sm">
                  <Link href={`/admin/tests/${inc.test_id}/results`} className="font-medium hover:underline">{inc.test}</Link>
                  <span className="text-xs text-muted"> | scored {inc.percent}% | {inc.submitted_at ? `handed in ${formatWhen(inc.submitted_at)}` : "not handed in"}{inc.auto_submitted ? " | auto handed in" : ""}</span>
                </p>
                <ol className="mt-2 grid gap-px overflow-hidden rounded-ui border border-line bg-line">
                  {inc.violations.map((v) => {
                    const off = started ? Math.max(0, Math.round((new Date(v.timestamp).getTime() - started) / 1000)) : 0;
                    return (
                      <li key={v.id} className="grid grid-cols-[70px_80px_1fr] items-center gap-3 bg-surface px-3 py-1.5 text-xs">
                        <span className="text-muted tabular">+{Math.floor(off / 60)}m {off % 60}s</span>
                        <Badge tone={v.type === "CRITICAL" ? "bad" : "warn"}>{v.type === "CRITICAL" ? "Critical" : "Warning"}</Badge>
                        <span className="text-ink-2">{v.description} <span className="text-muted">{new Date(v.timestamp).toLocaleTimeString()}</span></span>
                      </li>
                    );
                  })}
                </ol>
              </div>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

function GroupCard({ g, kind, t }: { g: Group; kind: string; t: Analytics["thresholds"] }) {
  const Chips = ({ list, tone }: { list: Member[]; tone: "ok" | "bad" }) => (
    list.length === 0 ? <p className="text-xs text-muted">Nobody yet.</p> : (
      <div className="flex flex-wrap gap-1.5">
        {list.map((m) => (
          <span key={m.user_id} title={`${m.correct}/${m.asked} test cases`} className={cx("rounded-[4px] border px-2 py-0.5 text-xs", tone === "ok" ? "border-ok/30 bg-ok-soft text-ok" : "border-bad/30 bg-bad-soft text-bad")}>
            {m.name} <span className="font-mono opacity-75">{m.accuracy}%</span>
          </span>
        ))}
      </div>
    )
  );
  return (
    <div className="rounded-ui border border-line bg-surface p-4">
      <div className="flex items-baseline justify-between">
        <p className="font-medium">{g.name}</p>
        <span className="text-xs text-muted">{g.students_attempted} attempted | {kind}</span>
      </div>
      <p className="mt-3 text-xs font-medium text-ok">Strong ({t.strong_accuracy}%+)</p>
      <div className="mt-1.5"><Chips list={g.strong} tone="ok" /></div>
      <p className="mt-3 text-xs font-medium text-bad">Needs work ({t.weak_accuracy}% or below)</p>
      <div className="mt-1.5"><Chips list={g.developing} tone="bad" /></div>
    </div>
  );
}

function DSAMaster() {
  const router = useRouter();
  const params = useSearchParams();
  const view = (VIEWS.some((v) => v.id === params.get("view")) ? params.get("view") : "round") as View;
  const [test, setTest] = useState(params.get("test") || "all");
  const [days, setDays] = useState(90);
  const [data, setData] = useState<Analytics | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [groupBy, setGroupBy] = useState<"difficulties" | "topics">("difficulties");

  const needsAnalytics = view === "round" || view === "integrity" || view === "groups" || view === "results";
  const load = useCallback(async () => {
    setLoading(true);
    try {
      setData(await api.get<Analytics>(`/api/admin/analytics?test=${encodeURIComponent(test === "all" ? "all" : test)}&days=${days}`));
      setError(null);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not load analytics.");
    } finally {
      setLoading(false);
    }
  }, [test, days]);
  useEffect(() => { if (needsAnalytics) void load(); }, [load, needsAnalytics]);

  const setView = (v: View) => router.replace(`/admin/dsa-master?view=${v}`, { scroll: false });
  const resultsTest = test !== "all" ? test : data?.tests[0]?.id ?? "";
  const r = data?.round;
  const groups = useMemo(() => data?.groups_by_test ?? [], [data]);

  return (
    <div>
      <PageHeader
        title="DSA Master"
        subtitle="Coding rounds end to end: analytics, results, integrity, performance groups, problems and scheduling."
        actions={<Link href="/admin/tests/new"><Button variant="primary"><Plus size={16} /> New test</Button></Link>}
      />

      <div className="mb-6 flex gap-1 overflow-x-auto border-b border-line">
        {VIEWS.map((v) => {
          const Icon = v.icon;
          const active = view === v.id;
          return (
            <button key={v.id} onClick={() => setView(v.id)}
              className={cx("-mb-px flex h-10 shrink-0 items-center gap-2 border-b-2 px-3 text-sm transition-colors",
                active ? "border-ink text-ink" : "border-transparent text-muted hover:text-ink")}>
              <Icon size={16} weight={active ? "fill" : "regular"} /> {v.label}
            </button>
          );
        })}
      </div>

      {needsAnalytics ? (
        <div className="mb-6 flex flex-wrap items-center gap-3">
          <Select value={view === "results" ? resultsTest : test} onChange={(e) => setTest(e.target.value)} className="h-9 w-80" aria-label="Test">
            {view !== "results" ? <option value="all">All tests</option> : null}
            {(data?.tests ?? []).map((t) => <option key={t.id} value={t.id}>{t.title} | {formatWhen(t.starts_at)} ({t.students})</option>)}
          </Select>
          {view !== "results" ? (
            <Select value={String(days)} onChange={(e) => setDays(Number(e.target.value))} className="h-9 w-40" aria-label="Window">
              {[30, 90, 180, 365].map((n) => <option key={n} value={n}>Last {n} days</option>)}
            </Select>
          ) : null}
          {loading ? <span className="text-xs text-muted">Loading</span> : null}
        </div>
      ) : null}
      {error && needsAnalytics ? <div className="mb-4"><Notice tone="bad" title="Could not load">{error}</Notice></div> : null}

      {view === "round" && !data && !error ? <div className="grid gap-3"><Skeleton className="h-24" /><Skeleton className="h-56" /></div> : null}
      {view === "round" && r ? (
        <div className="grid gap-6">
          <StatGrid>
            <Stat label="Attempts" value={r.attempts} hint={`${r.students_attempted} students`} />
            <Stat label="Participation" value={`${r.participation_percent}%`} hint={`${r.students_attempted} of ${r.cohort_size} assigned`} />
            <Stat label="Average score" value={`${r.average_score}%`} hint={`median ${r.median_score}%, top ${r.top_score}%`} />
            <Stat label="Pass rate" value={`${r.pass_rate_percent}%`} hint={`${r.passed_students} at ${r.pass_mark}%+, best attempt`} tone="ok" />
          </StatGrid>
          <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
            <Bands bands={r.bands} total={r.attempts} />
            <div className="rounded-card border border-line bg-surface p-6 shadow-card">
              <p className="text-sm font-semibold">Integrity at a glance</p>
              <dl className="mt-4 grid gap-3 text-sm">
                {[["Clean attempts", r.clean_attempts, "text-ok"], ["Attempts with violations", r.flagged_attempts, "text-warn"], ["Handed in by the proctor", r.auto_submitted_attempts, "text-bad"], ["Lowest score", `${r.lowest_score}%`, ""]].map(([k, v, c]) => (
                  <div key={k as string} className="flex items-baseline justify-between border-b border-line pb-2 last:border-0">
                    <dt className="text-ink-2">{k}</dt><dd className={cx("tabular", c as string)}>{v}</dd>
                  </div>
                ))}
              </dl>
              <button onClick={() => setView("integrity")} className="mt-4 text-sm text-accent hover:underline">Open the integrity report</button>
            </div>
          </div>
          {r.attempts === 0 ? <p className="text-sm text-muted">No finished attempts in this window yet.</p> : null}
        </div>
      ) : null}

      {view === "results" ? (
        resultsTest ? <ResultsBoard key={resultsTest} testId={resultsTest} /> : data ? <p className="text-sm text-muted">No published tests in the last {days} days.</p> : <Skeleton className="h-72" />
      ) : null}

      {view === "integrity" && data ? (
        <div className="grid gap-3">
          <p className="text-sm text-muted">
            Students with at least one recorded violation, worst first. Open a row for every incident: when it happened, how far into the test, and what the proctor saw.
            Strikes and cooldowns come from the lockout ladder (Settings).
          </p>
          {data.integrity.length === 0 ? (
            <div className="rounded-card border border-dashed border-line-strong bg-surface/60 px-6 py-12 text-center text-sm text-muted">No violations recorded in this window.</div>
          ) : data.integrity.map((row) => <IntegrityCard key={row.user_id} row={row} />)}
        </div>
      ) : null}

      {view === "groups" && data ? (
        <div className="grid gap-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="max-w-2xl text-sm text-muted">
              Strong = {data.thresholds.strong_accuracy}%+ of test cases passed over at least {data.thresholds.min_asked} cases of that kind.
              Needs work = {data.thresholds.weak_accuracy}% or below. A student can appear in several groups. Grouped per test, because strong in one round and weak in another would otherwise read as average.
            </p>
            <div className="flex rounded-ui border border-line p-0.5">
              {(["difficulties", "topics"] as const).map((g) => (
                <button key={g} onClick={() => setGroupBy(g)} className={cx("h-8 rounded-[4px] px-3 text-sm", groupBy === g ? "bg-sunken text-ink" : "text-muted")}>
                  By {g === "difficulties" ? "difficulty" : "topic"}
                </button>
              ))}
            </div>
          </div>
          {groups.length === 0 ? <p className="text-sm text-muted">No tests in this window.</p> : groups.map((t) => (
            <section key={t.id}>
              <h3 className="mb-3 text-sm font-semibold">{t.title} <span className="font-normal text-muted">| {formatWhen(t.starts_at)} | {t.students} sat</span></h3>
              {t[groupBy].length === 0 ? <p className="text-sm text-muted">No {groupBy === "topics" ? "topics" : "difficulties"} to group on.</p> : (
                <div className="grid gap-3 md:grid-cols-2">
                  {t[groupBy].map((g) => <GroupCard key={g.name} g={g} t={data.thresholds} kind={groupBy === "topics" ? "topic" : "difficulty"} />)}
                </div>
              )}
            </section>
          ))}
        </div>
      ) : null}

      {view === "problems" ? <ProblemBank /> : null}
      {view === "schedule" ? <TestsList /> : null}
    </div>
  );
}

export default function DSAMasterPage() {
  return <Suspense><DSAMaster /></Suspense>;
}
