"use client";

import { useEffect, useRef, useState } from "react";
import { Microphone, Stop } from "@phosphor-icons/react/dist/ssr";
import { PageHeader } from "@/components/admin/AdminShell";
import { ProctoringForm } from "@/components/admin/ProctoringForm";
import { Button, Field, Input, Notice, Skeleton, Toggle } from "@/components/ui";
import { api, ApiError } from "@/lib/client/api";
import { LEVEL_LABELS, MIC_LEVELS, SENSITIVITY_LEVELS, asLevel, type ProctoringSettings, type SensitivityLevel } from "@/lib/shared/proctoring";

interface Settings { default_proctoring: ProctoringSettings; lockout_enabled: boolean; pass_mark: number }

/**
 * Live microphone meter for calibrating a room before a round (MyCodeBud's
 * SettingsTab). Reads the admin's own mic through the same processing the
 * proctor asks for and draws each level's threshold from MIC_LEVELS, the
 * numbers the engine strikes on. Nothing is recorded or sent anywhere.
 */
function MicMeter({ level }: { level: SensitivityLevel }) {
  const [on, setOn] = useState(false);
  const [rms, setRms] = useState(0);
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
      const tick = () => {
        analyser.getFloatTimeDomainData(buf);
        let sum = 0;
        for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i];
        setRms(Math.sqrt(sum / buf.length));
        raf = requestAnimationFrame(tick);
      };
      tick();
      stop.current = () => {
        cancelAnimationFrame(raf);
        stream.getTracks().forEach((t) => t.stop());
        ctx.close().catch(() => {});
        setOn(false);
        setRms(0);
      };
      setOn(true);
    } catch {
      setError("Microphone access was refused.");
    }
  }
  useEffect(() => () => stop.current(), []);

  // 0..0.3 RMS mapped onto the bar; above that is shouting.
  const scale = (v: number) => Math.min(100, (v / 0.3) * 100);
  const threshold = MIC_LEVELS[level].threshold;
  return (
    <div className="rounded-ui border border-line bg-surface p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold">Microphone test meter</p>
          <p className="text-xs text-muted">Run it in the exam room. If the bar keeps crossing the selected line while the room is quiet, choose a lower sensitivity.</p>
        </div>
        <Button size="sm" onClick={() => (on ? stop.current() : start())}>{on ? <><Stop size={14} /> Stop</> : <><Microphone size={14} /> Start meter</>}</Button>
      </div>
      {error ? <p className="mt-3 text-sm text-bad">{error}</p> : null}
      <div className="relative mt-5 h-6 overflow-hidden rounded-ui border border-line bg-sunken">
        <div className="h-full bg-accent/70 transition-[width] duration-75" style={{ width: `${scale(rms)}%` }} />
        {SENSITIVITY_LEVELS.map((l) => (
          <div key={l} className={l === level ? "absolute inset-y-0 w-0.5 bg-ink" : "absolute inset-y-0 w-px bg-line-strong"} style={{ left: `${scale(MIC_LEVELS[l].threshold)}%` }} title={`${LEVEL_LABELS[l]} threshold`} />
        ))}
      </div>
      <div className="relative mt-1 h-4 text-[10px] text-muted">
        {SENSITIVITY_LEVELS.map((l) => (
          <span key={l} className={`absolute -translate-x-1/2 ${l === level ? "font-semibold text-ink" : ""}`} style={{ left: `${scale(MIC_LEVELS[l].threshold)}%` }}>{LEVEL_LABELS[l]}</span>
        ))}
      </div>
      <p className="mt-3 text-xs text-muted">
        At {LEVEL_LABELS[level]}, a warning needs the level above the line ({threshold}) for {Math.round(MIC_LEVELS[level].fraction * 100)}% of {MIC_LEVELS[level].windowSeconds} seconds.
      </p>
    </div>
  );
}

export default function SettingsPage() {
  const [s, setS] = useState<Settings | null>(null);
  const [saving, setSaving] = useState<"save" | "apply" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);

  useEffect(() => {
    api.get<{ settings: Settings }>("/api/admin/settings").then((r) => setS(r.settings)).catch((e) => setError(e instanceof ApiError ? e.message : "Could not load settings."));
  }, []);

  async function save(apply: boolean) {
    if (!s) return;
    setSaving(apply ? "apply" : "save");
    setError(null);
    try {
      const r = await api.put<{ settings: Settings; applied: number }>("/api/admin/settings", { ...s, apply_to_tests: apply });
      setS(r.settings);
      setSaved(apply ? `Saved, and applied to ${r.applied} test${r.applied === 1 ? "" : "s"} that have not ended.` : "Saved. New tests start from these settings.");
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not save.");
    } finally {
      setSaving(null);
    }
  }

  if (!s) return <div><PageHeader title="Settings" />{error ? <Notice tone="bad" title="Could not load">{error}</Notice> : <Skeleton className="h-96" />}</div>;

  return (
    <div>
      <PageHeader title="Settings" subtitle="Proctoring defaults, the lockout ladder and scoring." />
      <div className="grid gap-8">
        <section>
          <h2 className="mb-1 text-base font-semibold">Default proctoring</h2>
          <p className="mb-4 text-sm text-muted">Every new test starts from these. Each test can still be changed on its own page.</p>
          <ProctoringForm value={s.default_proctoring} onChange={(v) => setS({ ...s, default_proctoring: v })} proctored setProctored={() => {}} hideMaster />
        </section>

        <MicMeter level={asLevel(s.default_proctoring.mic_sensitivity)} />

        <section className="rounded-ui border border-line bg-surface p-5">
          <h2 className="text-base font-semibold">Lockout after a forced hand-in</h2>
          <Toggle
            checked={s.lockout_enabled}
            onChange={(v) => setS({ ...s, lockout_enabled: v })}
            label="Escalating cooldown"
            description="When the proctor hands a test in at the violation limit, the student cannot start another proctored test for a while."
          />
          <ol className="mt-3 grid gap-px overflow-hidden rounded-ui border border-line bg-line text-sm sm:grid-cols-5">
            {[["1st", "15 minutes"], ["2nd", "1 hour"], ["3rd", "6 hours"], ["4th", "24 hours"], ["5th", "Barred until an appeal is approved"]].map(([n, v]) => (
              <li key={n} className="bg-bg px-3 py-2.5"><span className="block text-xs text-muted">{n} strike</span>{v}</li>
            ))}
          </ol>
          <p className="mt-2 text-xs text-muted">Strikes stop counting after 30 days. A test already in progress is never interrupted by a cooldown.</p>
        </section>

        <section className="rounded-ui border border-line bg-surface p-5">
          <h2 className="text-base font-semibold">Scoring</h2>
          <Field label="Pass mark (%)" hint="Used for pass rates, pass and fail on result sheets, and reports." className="mt-3 max-w-xs">
            {(id) => <Input id={id} type="number" min={1} max={100} value={s.pass_mark} onChange={(e) => setS({ ...s, pass_mark: Number(e.target.value) })} />}
          </Field>
        </section>

        <div className="sticky bottom-0 z-20 border-t border-line bg-bg/95 py-4 backdrop-blur">
          {error ? <p className="mb-2 text-sm text-bad">{error}</p> : null}
          {saved ? <p className="mb-2 text-sm text-ok">{saved}</p> : null}
          <div className="flex flex-wrap gap-2">
            <Button variant="primary" busy={saving === "save"} disabled={!!saving} onClick={() => save(false)}>Save settings</Button>
            <Button busy={saving === "apply"} disabled={!!saving} onClick={() => save(true)}>Save and apply to current tests</Button>
          </div>
        </div>
      </div>
    </div>
  );
}
