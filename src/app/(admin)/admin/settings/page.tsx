"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Gavel } from "@phosphor-icons/react/dist/ssr/Gavel";
import { Microphone } from "@phosphor-icons/react/dist/ssr/Microphone";
import { ShieldCheck } from "@phosphor-icons/react/dist/ssr/ShieldCheck";
import { Stop } from "@phosphor-icons/react/dist/ssr/Stop";
import { Target } from "@phosphor-icons/react/dist/ssr/Target";
import { PageHeader } from "@/components/admin/AdminShell";
import { ProctoringForm } from "@/components/admin/ProctoringForm";
import { Button, Card, Input, Notice, SectionCard, Segmented, SettingRow, Skeleton, Switch, cx } from "@/components/ui";
import { api, ApiError } from "@/lib/client/api";
import { LEVEL_LABELS, MIC_LEVELS, SENSITIVITY_LEVELS, asLevel, type ProctoringSettings, type SensitivityLevel } from "@/lib/shared/proctoring";

interface Settings { default_proctoring: ProctoringSettings; lockout_enabled: boolean; pass_mark: number }

type Tab = "proctoring" | "room" | "lockout" | "scoring";
const TABS: { id: Tab; label: string; hint: string; icon: typeof Target }[] = [
  { id: "proctoring", label: "Proctoring defaults", hint: "What new tests watch for", icon: ShieldCheck },
  { id: "room", label: "Room check", hint: "Calibrate the microphone", icon: Microphone },
  { id: "lockout", label: "Lockout", hint: "After a forced hand-in", icon: Gavel },
  { id: "scoring", label: "Scoring", hint: "Pass mark", icon: Target },
];

/**
 * Live microphone meter for calibrating a room before a round. Reads the
 * admin's own mic through the same processing the proctor asks for, and marks
 * each sensitivity's threshold from MIC_LEVELS, the numbers the engine
 * strikes on. Nothing is recorded or sent anywhere.
 */
function MicMeter() {
  const [on, setOn] = useState(false);
  const [rms, setRms] = useState(0);
  const [peak, setPeak] = useState(0);
  const [level, setLevel] = useState<SensitivityLevel>("medium");
  const [error, setError] = useState<string | null>(null);
  const stop = useRef<() => void>(() => {});

  async function start() {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true } });
      const ctx = new AudioContext();
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 1024;
      ctx.createMediaStreamSource(stream).connect(analyser);
      const buf = new Float32Array(analyser.fftSize);
      let raf = 0;
      let last = 0;
      const tick = (t: number) => {
        raf = requestAnimationFrame(tick);
        if (t - last < 60) return;
        last = t;
        analyser.getFloatTimeDomainData(buf);
        let sum = 0;
        for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i];
        const v = Math.sqrt(sum / buf.length);
        setRms(v);
        setPeak((p) => Math.max(v, p * 0.97));
      };
      raf = requestAnimationFrame(tick);
      stop.current = () => {
        cancelAnimationFrame(raf);
        stream.getTracks().forEach((tr) => tr.stop());
        ctx.close().catch(() => {});
        setOn(false);
        setRms(0);
        setPeak(0);
      };
      setOn(true);
    } catch {
      setError("Microphone access was refused. Allow it in the address bar and try again.");
    }
  }
  useEffect(() => () => stop.current(), []);

  const scale = (v: number) => Math.min(100, (v / 0.3) * 100);
  const cfg = MIC_LEVELS[level];
  const over = rms >= cfg.threshold;

  return (
    <SectionCard
      title="Microphone room check"
      description="Run this in the exam room with the class seated. If the level keeps crossing the line while the room is quiet, choose a lower sensitivity in Proctoring defaults."
    >
      <div className="py-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Segmented label="Sensitivity to preview" size="sm" value={level} onChange={setLevel} options={SENSITIVITY_LEVELS.map((l) => ({ value: l, label: LEVEL_LABELS[l] }))} />
          <Button variant={on ? "secondary" : "primary"} size="sm" onClick={() => (on ? stop.current() : start())}>
            {on ? <><Stop size={14} weight="fill" /> Stop</> : <><Microphone size={14} /> Start listening</>}
          </Button>
        </div>
        {error ? <p className="mt-3 text-sm text-bad">{error}</p> : null}

        <div className="relative mt-6 h-3 overflow-hidden rounded-full bg-sunken">
          <div className={cx("h-full rounded-full transition-[width] duration-100", over ? "bg-warn" : "bg-accent")} style={{ width: `${scale(rms)}%` }} />
          <div className="absolute inset-y-0 w-0.5 bg-ink/30" style={{ left: `${scale(peak)}%` }} />
        </div>
        <div className="relative mt-1 h-6">
          <div className="absolute -top-4 h-5 w-0.5 rounded bg-ink" style={{ left: `${scale(cfg.threshold)}%` }} />
          <span className="absolute top-1.5 -translate-x-1/2 text-[11px] font-medium text-ink" style={{ left: `${scale(cfg.threshold)}%` }}>
            {LEVEL_LABELS[level]} line
          </span>
        </div>

        <p className={cx("mt-3 text-sm", !on ? "text-muted" : over ? "text-warn" : "text-ok")}>
          {!on ? "Not listening." : over ? "Above the line. Held this loud, it would record a warning." : "Below the line. This room would not trigger warnings."}
        </p>
        <p className="mt-1 text-xs text-muted">
          At {LEVEL_LABELS[level]}, a warning needs the level above the line for {Math.round(cfg.fraction * 100)}% of {cfg.windowSeconds} seconds. Nothing is recorded or sent anywhere.
        </p>
      </div>
    </SectionCard>
  );
}

const LADDER: [string, string][] = [
  ["1st", "15 minutes"], ["2nd", "1 hour"], ["3rd", "6 hours"], ["4th", "24 hours"], ["5th", "Barred until appeal"],
];

export default function SettingsPage() {
  const [saved, setSaved] = useState<Settings | null>(null);
  const [s, setS] = useState<Settings | null>(null);
  const [tab, setTab] = useState<Tab>("proctoring");
  const [applyRunning, setApplyRunning] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);

  useEffect(() => {
    api.get<{ settings: Settings }>("/api/admin/settings")
      .then((r) => { setS(r.settings); setSaved(r.settings); })
      .catch((e) => setError(e instanceof ApiError ? e.message : "Could not load settings."));
  }, []);

  useEffect(() => {
    if (!flash) return;
    const t = window.setTimeout(() => setFlash(null), 4000);
    return () => window.clearTimeout(t);
  }, [flash]);

  const dirty = useMemo(() => !!s && !!saved && JSON.stringify(s) !== JSON.stringify(saved), [s, saved]);

  async function save() {
    if (!s) return;
    setSaving(true);
    setError(null);
    try {
      const r = await api.put<{ settings: Settings; applied: number }>("/api/admin/settings", { ...s, apply_to_tests: applyRunning });
      setS(r.settings);
      setSaved(r.settings);
      setFlash(applyRunning ? `Saved and applied to ${r.applied} test${r.applied === 1 ? "" : "s"} that have not ended.` : "Settings saved.");
      setApplyRunning(false);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not save.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <PageHeader title="Settings" subtitle="Defaults for new tests, the lockout rule, and how passing is scored." />
      {!s ? (error ? <Notice tone="bad" title="Could not load settings">{error}</Notice> : <Skeleton className="h-96" />) : (
        <div className="grid gap-8 lg:grid-cols-[230px_minmax(0,1fr)]">
          <nav aria-label="Settings sections" className="flex gap-1 overflow-x-auto lg:sticky lg:top-9 lg:flex-col lg:self-start">
            {TABS.map((t) => {
              const Icon = t.icon;
              const on = tab === t.id;
              return (
                <button
                  key={t.id}
                  onClick={() => setTab(t.id)}
                  aria-current={on ? "page" : undefined}
                  className={cx(
                    "flex shrink-0 items-center gap-3 rounded-ui px-3 py-2.5 text-left transition-colors",
                    on ? "bg-surface shadow-card ring-1 ring-line" : "hover:bg-sunken",
                  )}
                >
                  <span className={cx("grid h-8 w-8 shrink-0 place-items-center rounded-ui", on ? "bg-accent-soft text-accent" : "bg-sunken text-muted")}>
                    <Icon size={17} weight={on ? "fill" : "regular"} />
                  </span>
                  <span className="leading-tight">
                    <span className={cx("block text-sm", on ? "font-semibold text-ink" : "font-medium text-ink-2")}>{t.label}</span>
                    <span className="hidden text-xs text-muted lg:block">{t.hint}</span>
                  </span>
                </button>
              );
            })}
          </nav>

          <div className="min-w-0">
            {tab === "proctoring" ? (
              <>
                <Notice tone="accent">Every new test starts from these defaults. A test can still be changed on its own page.</Notice>
                <div className="mt-5">
                  <ProctoringForm value={s.default_proctoring} onChange={(v) => setS({ ...s, default_proctoring: v })} proctored setProctored={() => {}} hideMaster />
                </div>
              </>
            ) : null}

            {tab === "room" ? <MicMeter /> : null}

            {tab === "lockout" ? (
              <SectionCard title="Lockout after a forced hand-in" description="When the proctor hands a test in at the violation limit, the student waits before starting another proctored test.">
                <SettingRow label="Escalating cooldown" description="A test already in progress is never interrupted. Strikes stop counting after 30 days.">
                  <Switch label="Escalating cooldown" checked={s.lockout_enabled} onChange={(v) => setS({ ...s, lockout_enabled: v })} />
                </SettingRow>
                <div className={cx("py-5", !s.lockout_enabled && "opacity-50")}>
                  <ol className="grid gap-3 sm:grid-cols-5">
                    {LADDER.map(([n, v], i) => (
                      <li key={n} className={cx("rounded-ui border px-3 py-3", i === 4 ? "border-bad/30 bg-bad-soft" : "border-line bg-raised")}>
                        <span className="block text-xs text-muted">{n} strike</span>
                        <span className={cx("mt-1 block text-sm font-semibold", i === 4 ? "text-bad" : "text-ink")}>{v}</span>
                      </li>
                    ))}
                  </ol>
                  <p className="mt-3 text-xs text-muted">Barred students appeal from their dashboard. Appeals are decided under Ban Appeals.</p>
                </div>
              </SectionCard>
            ) : null}

            {tab === "scoring" ? (
              <SectionCard title="Scoring" description="Used for pass rates, pass and fail on result sheets, and reports.">
                <SettingRow label="Pass mark" description="A student passes a test at or above this share of its marks.">
                  <span className="flex items-center gap-2">
                    <Input type="number" aria-label="Pass mark" min={1} max={100} value={s.pass_mark} onChange={(e) => setS({ ...s, pass_mark: Number(e.target.value) })} className="h-9 w-20 text-center tabular" />
                    <span className="text-[13px] text-muted">percent</span>
                  </span>
                </SettingRow>
              </SectionCard>
            ) : null}
          </div>
        </div>
      )}

      {/* Floating save bar: only when something changed. */}
      {s && (dirty || flash || error) ? (
        <div className="fixed inset-x-0 bottom-5 z-40 flex justify-center px-4 lg:pl-[248px]">
          <Card className="flex w-full max-w-2xl flex-wrap items-center gap-x-5 gap-y-3 px-4 py-3 shadow-pop">
            {dirty ? (
              <>
                <span className="text-sm font-medium text-ink">Unsaved changes</span>
                {tab === "proctoring" ? (
                  <label className="flex cursor-pointer items-center gap-2 text-[13px] text-ink-2">
                    <input type="checkbox" checked={applyRunning} onChange={(e) => setApplyRunning(e.target.checked)} className="h-4 w-4 accent-[var(--accent)]" />
                    Also apply to tests that have not ended
                  </label>
                ) : null}
                <span className="ml-auto flex gap-2">
                  <Button size="sm" variant="ghost" onClick={() => { setS(saved); setApplyRunning(false); }} disabled={saving}>Discard</Button>
                  <Button size="sm" variant="primary" busy={saving} onClick={save}>Save changes</Button>
                </span>
              </>
            ) : (
              <span className={cx("text-sm", error ? "text-bad" : "text-ok")}>{error || flash}</span>
            )}
          </Card>
        </div>
      ) : null}
    </div>
  );
}
