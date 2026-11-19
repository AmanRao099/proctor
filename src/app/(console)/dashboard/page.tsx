"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { ArrowRight } from "@phosphor-icons/react/dist/ssr/ArrowRight";
import { Browser } from "@phosphor-icons/react/dist/ssr/Browser";
import { CalendarBlank } from "@phosphor-icons/react/dist/ssr/CalendarBlank";
import { Camera } from "@phosphor-icons/react/dist/ssr/Camera";
import { CheckCircle } from "@phosphor-icons/react/dist/ssr/CheckCircle";
import { Clock } from "@phosphor-icons/react/dist/ssr/Clock";
import { Code } from "@phosphor-icons/react/dist/ssr/Code";
import { SpeakerSlash } from "@phosphor-icons/react/dist/ssr/SpeakerSlash";
import { Trophy } from "@phosphor-icons/react/dist/ssr/Trophy";
import { VideoCamera } from "@phosphor-icons/react/dist/ssr/VideoCamera";
import { WifiHigh } from "@phosphor-icons/react/dist/ssr/WifiHigh";
import { Badge, Button, Card, Dialog, EmptyState, Notice, Skeleton, Textarea, cx } from "@/components/ui";
import { api, ApiError, formatWhen } from "@/lib/client/api";
import type { AttemptState, SessionUser, TestWindow } from "@/lib/shared/types";

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

interface Lock { banned: boolean; can_appeal: boolean; appeal_status: string | null; allowed: boolean }

function statusOf(t: MyTest): { label: string; tone: "neutral" | "accent" | "ok" | "warn" } {
  if (t.state === "submitted") return { label: "Handed in", tone: "ok" };
  if (t.state === "timed_out") return { label: "Time over", tone: "neutral" };
  if (t.state === "in_progress") return { label: "In progress", tone: "warn" };
  if (t.window === "live") return { label: "Open now", tone: "accent" };
  if (t.window === "upcoming") return { label: "Upcoming", tone: "neutral" };
  return { label: "Closed", tone: "neutral" };
}

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
}

function untilText(iso: string) {
  const mins = Math.round((new Date(iso).getTime() - Date.now()) / 60000);
  if (mins <= 0) return "now";
  if (mins < 60) return `in ${mins} min`;
  const h = Math.round(mins / 60);
  return h < 48 ? `in ${h} h` : `on ${formatWhen(iso)}`;
}

const CHECKS = [
  { icon: Browser, title: "Chrome or Edge on a laptop", body: "Phones and tablets cannot sit a proctored test." },
  { icon: Camera, title: "Camera on, face in view", body: "Sit facing the screen in good light." },
  { icon: SpeakerSlash, title: "A quiet room, on your own", body: "A second person in view is recorded." },
  { icon: WifiHigh, title: "Steady connection", body: "Code saves as you type, so a short drop costs nothing." },
];

function Chip({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return <span className="inline-flex items-center gap-1.5 text-[13px] text-ink-2"><span className="text-muted">{icon}</span>{children}</span>;
}

export default function DashboardPage() {
  const [tests, setTests] = useState<MyTest[] | null>(null);
  const [user, setUser] = useState<SessionUser | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [skew, setSkew] = useState(0);
  const [lock, setLock] = useState<Lock | null>(null);
  const [lockMsg, setLockMsg] = useState("");
  const [appealOpen, setAppealOpen] = useState(false);
  const [appealText, setAppealText] = useState("");
  const [appealBusy, setAppealBusy] = useState(false);
  const [appealError, setAppealError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await api.get<{ tests: MyTest[]; server_time: string; user: SessionUser; lockout: Lock; lockout_message: string }>("/api/tests");
      setSkew(new Date(res.server_time).getTime() - Date.now());
      setTests(res.tests);
      setUser(res.user);
      setLock(res.lockout);
      setLockMsg(res.lockout_message);
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not load your tests.");
    }
  }, []);

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => void load(), 30_000);
    return () => window.clearInterval(timer);
  }, [load]);

  async function sendAppeal() {
    setAppealBusy(true);
    setAppealError(null);
    try {
      await api.post("/api/proctor/appeal", { message: appealText });
      setAppealOpen(false);
      setAppealText("");
      void load();
    } catch (err) {
      setAppealError(err instanceof ApiError ? err.message : "Could not send your appeal.");
    } finally {
      setAppealBusy(false);
    }
  }

  const live = tests?.filter((t) => t.can_start) ?? [];
  const upcoming = tests?.filter((t) => !t.can_start && t.window === "upcoming") ?? [];
  const past = tests?.filter((t) => !t.can_start && t.window !== "upcoming") ?? [];
  const firstName = user?.name.split(/\s+/)[0];

  return (
    <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_300px]">
      <div className="flex min-w-0 flex-col gap-8">
        <div>
          <h1 className="text-[26px] font-semibold tracking-tight">{greeting()}{firstName ? `, ${firstName}` : ""}</h1>
          <p className="mt-1.5 text-sm text-muted">
            {tests === null ? "Loading your tests." : live.length
              ? `You have ${live.length} test${live.length === 1 ? "" : "s"} open right now.`
              : "No test is open right now. This page refreshes on its own."}
          </p>
        </div>

        {error ? <Notice tone="bad" title="Something went wrong">{error}</Notice> : null}
        {lock && !lock.allowed ? (
          <Notice
            tone={lock.banned ? "bad" : "warn"}
            title={lock.banned ? "Proctored tests are locked" : "Cooldown in effect"}
            action={lock.can_appeal ? <Button size="sm" variant="primary" onClick={() => setAppealOpen(true)}>Appeal</Button> : null}
          >
            {lockMsg}
          </Notice>
        ) : null}

        {tests === null && !error ? <div className="grid gap-3"><Skeleton className="h-36" /><Skeleton className="h-20" /></div> : null}

        {tests && tests.length === 0 ? (
          <EmptyState icon={<CalendarBlank size={20} />} title="No tests assigned yet">
            When your organiser assigns you a test it appears here.
          </EmptyState>
        ) : null}

        {live.length ? (
          <section className="grid gap-4">
            {live.map((t) => (
              <Card key={t.id} className="overflow-hidden">
                <div className="flex flex-col gap-5 p-6 sm:flex-row sm:items-center">
                  <span className="grid h-12 w-12 shrink-0 place-items-center rounded-card bg-accent-soft text-accent">
                    <Code size={22} weight="bold" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge tone={statusOf(t).tone}>{statusOf(t).label}</Badge>
                      <span className="text-xs text-muted">Closes {formatWhen(t.ends_at)}</span>
                    </div>
                    <h2 className="mt-2 truncate text-lg font-semibold tracking-tight">{t.title}</h2>
                    <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1.5">
                      <Chip icon={<Clock size={15} />}>{t.duration_minutes} minutes</Chip>
                      <Chip icon={<Code size={15} />}>{t.problem_count} problem{t.problem_count === 1 ? "" : "s"}</Chip>
                      <Chip icon={<Trophy size={15} />}>{t.total_marks} marks</Chip>
                      {t.proctored ? <Chip icon={<VideoCamera size={15} />}>Camera proctored</Chip> : null}
                    </div>
                  </div>
                  <Link href={`/test/${t.id}/check`} className="sm:self-center">
                    <Button variant="primary" className="w-full sm:w-auto">
                      {t.state === "in_progress" ? "Resume test" : "Start test"}
                      <ArrowRight size={16} />
                    </Button>
                  </Link>
                </div>
                <div className="border-t border-line bg-raised px-6 py-2.5 text-xs text-muted">
                  {t.state === "in_progress"
                    ? "Your timer is running. Resume to continue where you left off."
                    : `Your ${t.duration_minutes} minute timer starts when you open the paper, not before.`}
                </div>
              </Card>
            ))}
          </section>
        ) : null}

        {upcoming.length ? (
          <section>
            <h2 className="mb-3 text-[15px] font-semibold">Coming up</h2>
            <Card className="divide-y divide-line">
              {upcoming.map((t) => (
                <div key={t.id} className="flex items-center gap-4 px-5 py-4">
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-card bg-sunken text-ink-2"><CalendarBlank size={18} /></span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{t.title}</p>
                    <p className="text-xs text-muted">{formatWhen(t.starts_at)} | {t.duration_minutes} min | {t.problem_count} problems</p>
                  </div>
                  <Badge>Opens {untilText(t.starts_at)}</Badge>
                </div>
              ))}
            </Card>
          </section>
        ) : null}

        {past.length ? (
          <section>
            <h2 className="mb-3 text-[15px] font-semibold">Past tests</h2>
            <Card className="divide-y divide-line">
              {past.map((t) => {
                const s = statusOf(t);
                return (
                  <div key={t.id} className="flex items-center gap-4 px-5 py-4">
                    <span className={cx("grid h-10 w-10 shrink-0 place-items-center rounded-card", t.state === "submitted" ? "bg-ok-soft text-ok" : "bg-sunken text-muted")}>
                      <CheckCircle size={18} weight={t.state === "submitted" ? "fill" : "regular"} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">{t.title}</p>
                      <p className="text-xs text-muted">{formatWhen(t.starts_at)} | {t.duration_minutes} min</p>
                    </div>
                    {t.score ? (
                      <span className="text-right">
                        <span className="block text-base font-semibold tabular">{t.score.marks_obtained}<span className="text-sm font-normal text-muted">/{t.score.total_marks}</span></span>
                        <span className="block text-xs text-muted">{t.score.solved} of {t.score.count} solved</span>
                      </span>
                    ) : <Badge tone={s.tone}>{s.label}</Badge>}
                  </div>
                );
              })}
            </Card>
          </section>
        ) : null}

        {skew && Math.abs(skew) > 120_000 ? (
          <Notice tone="warn" title="Your computer clock is off">
            It differs from the server by {Math.round(Math.abs(skew) / 60000)} minutes. Test times here follow the server, so your test is not affected.
          </Notice>
        ) : null}
      </div>

      <aside className="lg:pt-[72px]">
        <Card className="p-5">
          <h2 className="text-[15px] font-semibold">Before you start</h2>
          <p className="mt-1 text-[13px] text-muted">Check these now, not five minutes in.</p>
          <ul className="mt-5 grid gap-4">
            {CHECKS.map(({ icon: Icon, title, body }) => (
              <li key={title} className="flex gap-3">
                <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-accent-soft text-accent"><Icon size={16} /></span>
                <span>
                  <span className="block text-[13px] font-medium text-ink">{title}</span>
                  <span className="block text-xs text-muted">{body}</span>
                </span>
              </li>
            ))}
          </ul>
        </Card>
      </aside>

      <Dialog
        open={appealOpen}
        onClose={() => setAppealOpen(false)}
        title="Appeal to the organiser"
        footer={
          <>
            <Button onClick={() => setAppealOpen(false)}>Cancel</Button>
            <Button variant="primary" busy={appealBusy} disabled={appealText.trim().length < 20} onClick={sendAppeal}>Send appeal</Button>
          </>
        }
      >
        <p>Explain what happened during the tests that were handed in. An organiser reviews your appeal alongside the proctor&apos;s record.</p>
        <Textarea value={appealText} onChange={(e) => setAppealText(e.target.value)} className="mt-3 min-h-32" aria-label="Appeal message" />
        {appealError ? <p className="mt-2 text-sm text-bad">{appealError}</p> : null}
      </Dialog>
    </div>
  );
}
