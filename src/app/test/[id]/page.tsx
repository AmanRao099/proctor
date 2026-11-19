"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowCounterClockwise, ArrowsOut, CheckCircle, Clock, CloudCheck, CloudSlash, Play, ShieldWarning, UploadSimple,
} from "@phosphor-icons/react/dist/ssr";
import { CodeEditor } from "@/components/exam/CodeEditor";
import { ResultPanel, type Outcome } from "@/components/exam/ResultPanel";
import { Statement } from "@/components/exam/Statement";
import { Badge, Button, Dialog, Notice, Select, Skeleton, cx } from "@/components/ui";
import { api, ApiError, formatDuration } from "@/lib/client/api";
import { isMobileDevice } from "@/lib/client/device";
import { useProctor } from "@/lib/proctor/ProctorProvider";
import { DEFAULT_STARTERS, LANGUAGES, type Language } from "@/lib/shared/languages";
import { cameraRequired, type ProctoringSettings } from "@/lib/shared/proctoring";
import type { BestScore, CustomRunResult, JudgeResult, PaperResponse, Violation } from "@/lib/shared/types";

type CodeBook = Record<string, Partial<Record<Language, string>>>;

interface FinalResult {
  marks_obtained: number;
  total_marks: number;
  percent: number;
  solved: number;
  count: number;
  problems: { id: string; title: string; marks: number; marks_obtained: number; passed: number; total: number }[];
}

const AUTOSAVE_MS = 2000;

interface HandInResponse {
  results_hidden: boolean;
  result: FinalResult | null;
  lockout: { allowed: boolean; banned: boolean; cooldown_seconds_remaining: number } | null;
}
const SETTINGS_POLL_MS = 30_000;
const VIOLATION_RESEND_MS = 15_000;

function isFullscreen() {
  const d = document as Document & { webkitFullscreenElement?: Element };
  return !!(d.fullscreenElement || d.webkitFullscreenElement);
}

export default function ExamPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const proctor = useProctor();
  const { state: ps } = proctor;

  const [paper, setPaper] = useState<PaperResponse | null>(null);
  const [fatal, setFatal] = useState<string | null>(null);
  const [settings, setSettings] = useState<ProctoringSettings | null>(null);
  const [started, setStarted] = useState(false);
  const [current, setCurrent] = useState(0);
  const [codes, setCodes] = useState<CodeBook>({});
  const [langs, setLangs] = useState<Record<string, Language>>({});
  const [best, setBest] = useState<Record<string, BestScore>>({});
  const [outcomes, setOutcomes] = useState<Record<string, Outcome>>({});
  const [stdins, setStdins] = useState<Record<string, string>>({});
  const [tab, setTab] = useState<"result" | "custom">("result");
  const [busy, setBusy] = useState<"run" | "submit" | null>(null);
  const [timeLeft, setTimeLeft] = useState(0);
  const [saveState, setSaveState] = useState<"saved" | "saving" | "offline">("saved");
  const [inFs, setInFs] = useState(true);

  const [confirmOpen, setConfirmOpen] = useState(false);
  const [finishing, setFinishing] = useState(false);
  const [finished, setFinished] = useState(false);
  const [final, setFinal] = useState<FinalResult | null>(null);
  const [resultsHidden, setResultsHidden] = useState(false);
  const [handInError, setHandInError] = useState<string | null>(null);
  const [canResend, setCanResend] = useState(false);
  const [resending, setResending] = useState(false);

  const [followupAnswer, setFollowupAnswer] = useState("");
  const followupRef = useRef("");
  followupRef.current = followupAnswer;
  const [lockNote, setLockNote] = useState<string | null>(null);
  const [critical, setCritical] = useState<Violation | null>(null);
  const [warning, setWarning] = useState<Violation | null>(null);

  const deadline = useRef(0);
  const codesRef = useRef(codes);
  codesRef.current = codes;
  const langsRef = useRef(langs);
  langsRef.current = langs;
  const currentRef = useRef(current);
  currentRef.current = current;
  const paperRef = useRef(paper);
  paperRef.current = paper;
  const finishLatch = useRef(false);
  const lastSaved = useRef("");
  const reported = useRef(0);
  const lastSeenViolations = useRef(0);

  const problems = paper?.problems ?? [];
  const problem = problems[current];
  const lang: Language = problem ? (langs[problem.id] ?? problem.languages[0]) : "python";
  const starterFor = useCallback((pid: string, l: Language) => {
    const p = paperRef.current?.problems.find((x) => x.id === pid);
    return p?.starter?.[l] ?? DEFAULT_STARTERS[l];
  }, []);
  const code = problem ? (codes[problem.id]?.[lang] ?? starterFor(problem.id, lang)) : "";

  // ── Load the paper ────────────────────────────────────────────────────────
  useEffect(() => {
    if (isMobileDevice()) {
      setFatal("This test cannot be taken on a phone or tablet. Open it on a laptop or desktop computer.");
      return;
    }
    (async () => {
      try {
        const res = await api.post<PaperResponse>(`/api/tests/${id}/start`);
        setPaper(res);
        setSettings(res.proctoring);
        setCodes(res.progress.code || {});
        const chosen: Record<string, Language> = {};
        for (const p of res.problems) {
          const want = res.progress.language?.[p.id] ?? res.progress.best?.[p.id]?.language;
          chosen[p.id] = want && p.languages.includes(want) ? want : p.languages[0];
        }
        setLangs(chosen);
        setBest(res.progress.best || {});
        setCurrent(Math.min(res.progress.current_index || 0, Math.max(0, res.problems.length - 1)));
        lastSaved.current = JSON.stringify([res.progress.code || {}, chosen, res.progress.current_index || 0]);
        reported.current = res.progress.violations.length;
        // Seeded from what the SERVER says is left, against the local clock.
        deadline.current = Date.now() + res.test.remaining_seconds * 1000;
        setTimeLeft(res.test.remaining_seconds);
      } catch (err) {
        setFatal(err instanceof ApiError ? err.message : "Could not open the test. Check your connection and reload.");
      }
    })();
  }, [id]);

  // ── Start proctoring once the paper is here ───────────────────────────────
  useEffect(() => {
    if (!paper || started) return;
    const s = paper.proctoring;
    const proctored = paper.test.proctored;
    const camera = cameraRequired(proctored, s);
    const effective: ProctoringSettings = proctored ? s : {
      ...s, require_fullscreen: false, tab_switch_enabled: false, audio_detection_enabled: false,
      face_detection_enabled: false, multi_person_detection_enabled: false, phone_detection_enabled: false,
    };
    const res = proctor.startMonitoring({ camera, settings: effective, requireFaceCheck: camera });
    if (!res.ok) {
      // A reload loses the stream and the face check: back through the check.
      router.replace(`/test/${id}/check`);
      return;
    }
    proctor.restoreViolations(paper.progress.violations);
    lastSeenViolations.current = paper.progress.violations.length;
    setStarted(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paper]);

  // ── Fullscreen watch ──────────────────────────────────────────────────────
  useEffect(() => {
    const read = () => setInFs(isFullscreen());
    read();
    document.addEventListener("fullscreenchange", read);
    document.addEventListener("webkitfullscreenchange", read);
    return () => {
      document.removeEventListener("fullscreenchange", read);
      document.removeEventListener("webkitfullscreenchange", read);
    };
  }, []);

  // ── Autosave ──────────────────────────────────────────────────────────────
  const save = useCallback(async () => {
    const key = JSON.stringify([codesRef.current, langsRef.current, currentRef.current]);
    if (key === lastSaved.current) return;
    setSaveState("saving");
    try {
      await api.put(`/api/tests/${id}/progress`, {
        code: codesRef.current, language: langsRef.current, current_index: currentRef.current,
      });
      lastSaved.current = key;
      setSaveState("saved");
    } catch {
      setSaveState("offline");
    }
  }, [id]);

  useEffect(() => {
    if (!started || finished) return;
    const t = window.setTimeout(() => void save(), AUTOSAVE_MS);
    return () => window.clearTimeout(t);
  }, [codes, langs, current, started, finished, save]);

  // ── Strikes to the server, as they happen ─────────────────────────────────
  const sendViolations = useCallback(() => {
    const list = ps.violations;
    if (list.length <= reported.current) return;
    api.post(`/api/tests/${id}/violations`, { violations: list })
      .then(() => { reported.current = Math.max(reported.current, list.length); })
      .catch(() => { /* resent on the timer below and with the hand-in */ });
  }, [id, ps.violations]);

  useEffect(() => { if (started) sendViolations(); }, [ps.violations, started, sendViolations]);
  useEffect(() => {
    if (!started) return;
    const t = window.setInterval(sendViolations, VIOLATION_RESEND_MS);
    return () => window.clearInterval(t);
  }, [started, sendViolations]);

  // Show each new strike once.
  useEffect(() => {
    if (ps.violationCount <= lastSeenViolations.current) return;
    lastSeenViolations.current = ps.violationCount;
    const newest = ps.violations[ps.violations.length - 1];
    if (!newest || ps.autoSubmitted) return;
    if (newest.type === "CRITICAL") setCritical(newest);
    else setWarning(newest);
  }, [ps.violationCount, ps.violations, ps.autoSubmitted]);

  useEffect(() => {
    if (!warning) return;
    const t = window.setTimeout(() => setWarning(null), 6000);
    return () => window.clearTimeout(t);
  }, [warning]);

  // ── Admin changes to proctoring reach a running test ──────────────────────
  useEffect(() => {
    if (!started || finished || !paper?.test.proctored) return;
    let applied = JSON.stringify(settings);
    const t = window.setInterval(async () => {
      try {
        const res = await api.get<{ proctoring: ProctoringSettings }>(`/api/tests/${id}/proctoring`);
        const key = JSON.stringify(res.proctoring);
        if (key === applied) return;
        applied = key;
        setSettings(res.proctoring);
        proctor.updateSettings(res.proctoring);
      } catch { /* next poll */ }
    }, SETTINGS_POLL_MS);
    return () => window.clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [started, finished, id]);

  // ── Heartbeat for the admin's Active Students board ───────────────────────
  const psRef = useRef(ps);
  psRef.current = ps;
  useEffect(() => {
    if (!started || finished) return;
    const beat = () => {
      api.post(`/api/tests/${id}/heartbeat`, {
        current_index: currentRef.current,
        camera_live: psRef.current.cameraLive,
        fullscreen: isFullscreen(),
        focused: document.hasFocus(),
        face_status: psRef.current.faceStatus,
      }).catch(() => { /* next beat */ });
    };
    beat();
    const t = window.setInterval(beat, 15_000);
    return () => window.clearInterval(t);
  }, [started, finished, id]);

  // ── Hand-in ───────────────────────────────────────────────────────────────
  const handInPayload = useRef<unknown>(null);

  const send = useCallback(async () => {
    let last: unknown;
    for (let i = 0; i < 3; i++) {
      try {
        return await api.post<HandInResponse>(`/api/tests/${id}/finish`, handInPayload.current, 180_000);
      } catch (err) {
        last = err;
        if (err instanceof ApiError && err.status > 0 && err.status < 500) throw err;
        if (i < 2) await new Promise((r) => setTimeout(r, 1500 * (i + 1)));
      }
    }
    throw last;
  }, [id]);

  const settle = useCallback((res: HandInResponse) => {
    setHandInError(null);
    if (res.lockout && !res.lockout.allowed) {
      setLockNote(res.lockout.banned
        ? "This was a forced hand-in. Your account is now barred from proctored tests until an organiser approves an appeal from your dashboard."
        : `This was a forced hand-in, so you cannot start another proctored test for ${Math.ceil(res.lockout.cooldown_seconds_remaining / 60)} minutes.`);
    }
    setCanResend(false);
    setResultsHidden(res.results_hidden);
    setFinal(res.result);
  }, []);

  const fail = useCallback((err: unknown) => {
    if (err instanceof ApiError && err.status > 0 && err.status < 500) {
      setHandInError(err.message);
      setCanResend(false);
      return;
    }
    setCanResend(true);
    setHandInError("Your hand-in did not reach the server. Check your connection and press Try again. Your code is also autosaved.");
  }, []);

  const finish = useCallback(async (dueToViolation: boolean) => {
    if (finishLatch.current || !paperRef.current) return;
    finishLatch.current = true;
    setConfirmOpen(false);
    setCritical(null);
    setFinishing(true);
    // Stand the proctor down BEFORE the fullscreen exit, or that exit is
    // recorded as a violation.
    proctor.beginFinish();
    proctor.completeCleanup();
    const handIn: Record<string, { language: Language; code: string }> = {};
    for (const p of paperRef.current.problems) {
      const l = langsRef.current[p.id] ?? p.languages[0];
      handIn[p.id] = { language: l, code: codesRef.current[p.id]?.[l] ?? starterFor(p.id, l) };
    }
    handInPayload.current = {
      code: handIn,
      violations: ps.violations,
      auto_submitted: dueToViolation || ps.autoSubmitted,
      submitted_due_to_violation: dueToViolation,
      followup_answer: followupRef.current.trim() || undefined,
    };
    try {
      settle(await send());
    } catch (err) {
      fail(err);
    } finally {
      setFinishing(false);
      setFinished(true);
    }
  }, [proctor, ps.violations, ps.autoSubmitted, send, settle, fail, starterFor]);

  const finishRef = useRef(finish);
  finishRef.current = finish;

  useEffect(() => {
    if (ps.autoSubmitted && started && !finished) void finishRef.current(true);
  }, [ps.autoSubmitted, started, finished]);

  // ── Clock ─────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!started || finished) return;
    const t = window.setInterval(() => {
      const left = Math.max(0, Math.round((deadline.current - Date.now()) / 1000));
      setTimeLeft(left);
      if (left <= 0) {
        window.clearInterval(t);
        void finishRef.current(false);
      }
    }, 1000);
    return () => window.clearInterval(t);
  }, [started, finished]);

  // ── Run / submit ──────────────────────────────────────────────────────────
  async function run(custom: boolean) {
    if (!problem || busy) return;
    setBusy("run");
    if (!custom) setTab("result");
    try {
      const res = await api.post<{ kind: "samples" | "custom"; result: JudgeResult | CustomRunResult }>(
        `/api/tests/${id}/run`,
        { problem_id: problem.id, language: lang, code, ...(custom ? { stdin: stdins[problem.id] ?? "" } : {}) },
        120_000,
      );
      setOutcomes((o) => ({ ...o, [problem.id]: res.kind === "custom"
        ? { kind: "custom", result: res.result as CustomRunResult }
        : { kind: "samples", result: res.result as JudgeResult } }));
    } catch (err) {
      setTab("result");
      setOutcomes((o) => ({ ...o, [problem.id]: { kind: "error", message: err instanceof ApiError ? err.message : "Run failed." } }));
    } finally {
      setBusy(null);
    }
  }

  async function submit() {
    if (!problem || busy) return;
    setBusy("submit");
    setTab("result");
    try {
      const res = await api.post<{
        result: JudgeResult | null; best: BestScore | null; withheld: boolean; recorded?: boolean; compile_output?: string | null;
      }>(`/api/tests/${id}/submit`, { problem_id: problem.id, language: lang, code }, 180_000);
      if (res.withheld) {
        setOutcomes((o) => ({ ...o, [problem.id]: { kind: "withheld", recorded: !!res.recorded, compile_output: res.compile_output ?? null } }));
        if (res.recorded) setBest((b) => ({ ...b, [problem.id]: { marks_obtained: 0, passed: 0, total: 0, language: lang, at: new Date().toISOString() } }));
      } else if (res.result) {
        setOutcomes((o) => ({ ...o, [problem.id]: { kind: "submit", result: res.result! } }));
        if (res.best) setBest((b) => ({ ...b, [problem.id]: res.best! }));
      }
    } catch (err) {
      setOutcomes((o) => ({ ...o, [problem.id]: { kind: "error", message: err instanceof ApiError ? err.message : "Submit failed." } }));
    } finally {
      setBusy(null);
    }
  }

  function setCode(v: string) {
    if (!problem) return;
    setCodes((c) => ({ ...c, [problem.id]: { ...(c[problem.id] || {}), [lang]: v } }));
  }

  function resetCode() {
    if (!problem) return;
    setCodes((c) => ({ ...c, [problem.id]: { ...(c[problem.id] || {}), [lang]: starterFor(problem.id, lang) } }));
  }

  const withheld = paper ? !paper.test.show_results : false;
  const solvedCount = useMemo(
    () => problems.filter((p) => best[p.id] && (withheld || (best[p.id].total > 0 && best[p.id].passed === best[p.id].total))).length,
    [problems, best, withheld],
  );

  // ── Render: fatal / finished / loading ────────────────────────────────────
  if (fatal) {
    return (
      <Centered>
        <Notice tone="bad" title="This test cannot continue" action={<Link href="/dashboard"><Button size="sm">Back to tests</Button></Link>}>
          {fatal}
        </Notice>
      </Centered>
    );
  }

  if (finished || finishing) {
    return (
      <Centered>
        <div className="w-full max-w-lg">
          {finishing ? (
            <div className="grid gap-3">
              <p className="text-lg font-semibold">Handing in your test</p>
              <p className="text-sm text-muted">Your last code is being judged. Keep this page open.</p>
              <Skeleton className="mt-2 h-2 w-full" />
            </div>
          ) : handInError ? (
            <Notice
              tone={canResend ? "warn" : "bad"}
              title={canResend ? "Not handed in yet" : "Hand-in refused"}
              action={canResend ? (
                <Button size="sm" variant="primary" busy={resending} onClick={async () => {
                  setResending(true);
                  try { settle(await send()); } catch (err) { fail(err); } finally { setResending(false); }
                }}>Try again</Button>
              ) : <Link href="/dashboard"><Button size="sm">Back to tests</Button></Link>}
            >
              {handInError}
            </Notice>
          ) : (
            <div>
              <CheckCircle size={32} weight="fill" className="text-ok" />
              <h1 className="mt-4 text-2xl font-semibold tracking-tight">Test handed in</h1>
              <p className="mt-1 text-sm text-muted">
                {ps.autoSubmitted
                  ? `It was handed in automatically after ${ps.violationCount} recorded violations.`
                  : "Your answers are saved. You can close this window."}
              </p>
              {lockNote ? <div className="mt-5"><Notice tone="warn" title="Lockout">{lockNote}</Notice></div> : null}
              {final && !resultsHidden ? (
                <div className="mt-8 rounded-ui border border-line bg-surface">
                  <div className="flex items-baseline justify-between border-b border-line px-5 py-4">
                    <span className="text-sm text-muted">Score</span>
                    <span className="text-2xl font-semibold tabular">
                      {final.marks_obtained}<span className="text-base text-muted">/{final.total_marks}</span>
                    </span>
                  </div>
                  {final.problems.map((p) => (
                    <div key={p.id} className="flex items-center justify-between gap-4 border-t border-line px-5 py-3 text-sm first:border-t-0">
                      <span className="min-w-0 truncate">{p.title}</span>
                      <span className="shrink-0 text-xs text-muted tabular">
                        {p.passed}/{p.total} tests | {p.marks_obtained}/{p.marks}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="mt-6 text-sm text-ink-2">Scores are released by your organiser.</p>
              )}
              <Link href="/dashboard" className="mt-8 inline-block"><Button>Back to tests</Button></Link>
            </div>
          )}
        </div>
      </Centered>
    );
  }

  if (!paper || !problem || !started) {
    return (
      <div className="grid h-[100dvh] grid-rows-[48px_1fr]">
        <div className="border-b border-line" />
        <div className="grid grid-cols-[42%_1fr] gap-px">
          <div className="grid content-start gap-3 p-6"><Skeleton className="h-6 w-1/2" /><Skeleton className="h-40" /><Skeleton className="h-24" /></div>
          <Skeleton className="m-4" />
        </div>
      </div>
    );
  }

  const strikesLeft = Math.max(0, ps.maxViolations - ps.violationCount);
  const needFs = paper.test.proctored && !!settings?.require_fullscreen;
  const low = timeLeft <= 300;
  const veryLow = timeLeft <= 60;
  const outcome = outcomes[problem.id] ?? null;

  return (
    <div className="grid h-[100dvh] grid-rows-[56px_1fr] overflow-hidden">
      {/* ── Header ── */}
      <header className="flex items-center gap-4 border-b border-line bg-surface px-4 shadow-card">
        <p className="hidden max-w-60 truncate text-sm font-semibold lg:block">{paper.test.title}</p>
        <span className="hidden h-6 w-px bg-line lg:block" />
        <nav className="flex min-w-0 items-center gap-1 overflow-x-auto" aria-label="Problems">
          {problems.map((p, i) => {
            const b = best[p.id];
            const full = b && b.total > 0 && b.passed === b.total;
            return (
              <button
                key={p.id}
                onClick={() => setCurrent(i)}
                title={p.title}
                className={cx(
                  "flex h-8 shrink-0 items-center gap-1.5 rounded-full px-3 text-[13px] font-medium transition-colors",
                  i === current ? "bg-accent-soft text-accent ring-1 ring-inset ring-accent-line" : "text-ink-2 hover:bg-sunken",
                )}
              >
                <span>Problem {i + 1}</span>
                {b ? (
                  <span className={cx("h-1.5 w-1.5 rounded-full", withheld ? "bg-accent" : full ? "bg-ok" : "bg-warn")} aria-label="submitted" />
                ) : null}
              </button>
            );
          })}
        </nav>

        <div className="ml-auto flex items-center gap-4">
          <span
            className={cx("hidden items-center gap-1.5 text-xs sm:flex", saveState === "offline" ? "text-warn" : "text-muted")}
            title={saveState === "offline" ? "Autosave failed. It retries on your next change." : "Your code autosaves"}
          >
            {saveState === "offline" ? <CloudSlash size={15} /> : <CloudCheck size={15} />}
            {saveState === "saving" ? "Saving" : saveState === "offline" ? "Not saved" : "Saved"}
          </span>
          {paper.test.proctored ? (
            <span
              className={cx("flex items-center gap-1.5 text-xs", ps.violationCount ? "text-bad" : "text-muted")}
              title={`${strikesLeft} more violation${strikesLeft === 1 ? "" : "s"} hands in your test`}
            >
              <ShieldWarning size={15} />
              <span className="tabular">{ps.violationCount}/{ps.maxViolations}</span>
            </span>
          ) : null}
          <span
            className={cx(
              "inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-sm font-semibold tabular ring-1 ring-inset",
              veryLow ? "bg-bad-soft text-bad ring-bad/30" : low ? "bg-warn-soft text-warn ring-warn/30" : "bg-sunken text-ink ring-line",
            )}
            aria-live={low ? "polite" : "off"}
            title="Time left"
          >
            <Clock size={15} weight="bold" />
            {formatDuration(timeLeft)}
          </span>
          <Button size="sm" variant="dark" onClick={() => setConfirmOpen(true)}>Hand in</Button>
        </div>
      </header>

      {/* ── Body ── */}
      <div className="grid min-h-0 grid-cols-[minmax(340px,42%)_1fr]">
        <div className="min-h-0 overflow-y-auto border-r border-line bg-surface">
          <Statement problem={problem} index={current} />
        </div>

        <div className="grid min-h-0 grid-rows-[52px_minmax(0,1fr)_minmax(190px,34%)]">
          <div className="flex items-center gap-2 border-b border-line bg-surface px-3">
            <Select
              value={lang}
              onChange={(e) => setLangs((l) => ({ ...l, [problem.id]: e.target.value as Language }))}
              className="h-8 w-40 text-[13px] shadow-none"
              aria-label="Language"
            >
              {problem.languages.map((l) => <option key={l} value={l}>{LANGUAGES[l].label}</option>)}
            </Select>
            <Button size="sm" variant="ghost" onClick={resetCode} title="Replace your code with the starter code">
              <ArrowCounterClockwise size={14} /> Reset
            </Button>
            {best[problem.id] && !withheld ? (
              <Badge tone={best[problem.id].passed === best[problem.id].total ? "ok" : "warn"} className="ml-1">
                Best {best[problem.id].marks_obtained}/{problem.marks}
              </Badge>
            ) : best[problem.id] ? <Badge tone="accent" className="ml-1">Submitted</Badge> : null}
            <div className="ml-auto flex items-center gap-2">
              <Button size="sm" title="Run (Ctrl + ')" onClick={() => run(tab === "custom")} busy={busy === "run"} disabled={!!busy}>
                <Play size={14} weight="fill" /> {tab === "custom" ? "Run with custom input" : "Run"}
              </Button>
              <Button size="sm" variant="accent" onClick={submit} busy={busy === "submit"} disabled={!!busy}>
                <UploadSimple size={14} /> Submit
              </Button>
            </div>
          </div>

          <div className="min-h-0 bg-[var(--editor)]">
            <CodeEditor
              key={`${problem.id}:${lang}`}
              value={code}
              language={lang}
              onChange={setCode}
              onRun={() => void run(false)}
            />
          </div>

          <div className="min-h-0 border-t border-line bg-surface">
            <ResultPanel
              outcome={outcome}
              tab={tab}
              setTab={setTab}
              stdin={stdins[problem.id] ?? problem.samples[0]?.input ?? ""}
              setStdin={(s) => setStdins((x) => ({ ...x, [problem.id]: s }))}
            />
          </div>
        </div>
      </div>

      {/* ── Overlays ── */}
      {needFs && !inFs && !critical ? (
        <div className="fixed inset-0 z-[58] grid place-items-center bg-bg/95 p-6">
          <div className="max-w-sm text-center">
            <ArrowsOut size={28} className="mx-auto text-ink-2" />
            <p className="mt-4 text-lg font-semibold">Return to fullscreen</p>
            <p className="mt-1 text-sm text-muted">The test continues in fullscreen. Your timer is still running.</p>
            <Button variant="primary" className="mt-6" onClick={() => void proctor.requestFullscreen()}>Enter fullscreen</Button>
          </div>
        </div>
      ) : null}

      <Dialog
        open={!!critical}
        title="Violation recorded"
        tone="bad"
        dismissable={false}
        footer={
          <Button variant="primary" onClick={() => {
            setCritical(null);
            if (needFs && !isFullscreen()) void proctor.requestFullscreen();
          }}>
            Return to the test
          </Button>
        }
      >
        <p className="text-ink">{critical?.description}</p>
        <p className="mt-3">
          {strikesLeft > 0
            ? <>You have <span className="font-semibold text-ink">{strikesLeft}</span> more before your test is handed in automatically.</>
            : "Your test is being handed in."}
        </p>
      </Dialog>

      {warning ? (
        <div role="status" className="fixed left-1/2 top-16 z-[57] w-[min(92vw,440px)] -translate-x-1/2 rounded-ui border border-warn bg-surface px-4 py-3 shadow-[0_12px_32px_rgb(10_10_12/0.18)]">
          <p className="text-sm font-medium text-warn">Warning recorded</p>
          <p className="mt-0.5 text-sm text-ink-2">{warning.description}</p>
        </div>
      ) : null}

      <Dialog
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        title="Hand in your test?"
        footer={
          <>
            <Button onClick={() => setConfirmOpen(false)}>Keep working</Button>
            <Button variant="primary" disabled={!!paper.test.followup_prompt && !followupAnswer.trim()} onClick={() => void finish(false)}>Hand in</Button>
          </>
        }
      >
        <p>You cannot reopen the test afterwards. Code you have not submitted is judged once more when you hand in.</p>
        <ul className="mt-4 divide-y divide-line rounded-ui border border-line">
          {problems.map((p, i) => {
            const b = best[p.id];
            return (
              <li key={p.id} className="flex items-center justify-between gap-3 px-3 py-2">
                <span className="min-w-0 truncate"><span className="font-mono text-muted">{i + 1}</span> {p.title}</span>
                <span className="shrink-0 text-xs">
                  {!b ? <span className="text-muted">Not submitted</span>
                    : withheld ? <span className="text-accent">Submitted</span>
                      : <span className="tabular text-ink-2">{b.marks_obtained}/{p.marks}</span>}
                </span>
              </li>
            );
          })}
        </ul>
        {paper.test.followup_prompt ? (
          <div className="mt-4 grid gap-1.5">
            <label htmlFor="followup" className="text-[13px] font-medium text-ink">{paper.test.followup_prompt}</label>
            <input
              id="followup"
              value={followupAnswer}
              onChange={(e) => setFollowupAnswer(e.target.value)}
              maxLength={100}
              autoComplete="off"
              className="h-10 rounded-ui border border-line-strong bg-surface px-3 text-sm text-ink focus:border-accent focus:outline-none"
              placeholder="Your answer"
            />
            <p className="text-xs text-muted">Answer this to hand in.</p>
          </div>
        ) : null}
        <p className="mt-3 text-xs text-muted">{solvedCount} of {problems.length} {withheld ? "submitted" : "fully solved"} | {formatDuration(timeLeft)} left</p>
      </Dialog>
    </div>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return <div className="grid min-h-[100dvh] place-items-center px-4 py-16">{children}</div>;
}
