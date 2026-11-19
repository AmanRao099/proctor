"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  ArrowLeft, ArrowsOut, Browser, Camera, Check, Clock, Code, Microphone, Warning, X,
} from "@phosphor-icons/react/dist/ssr";
import { Wordmark } from "@/components/TopBar";
import { Button, Notice, Skeleton, cx } from "@/components/ui";
import { api, ApiError, formatWhen } from "@/lib/client/api";
import { browserName, isMobileDevice, isSupportedBrowser } from "@/lib/client/device";
import { useProctor } from "@/lib/proctor/ProctorProvider";
import type { ProctoringSettings } from "@/lib/shared/proctoring";
import type { AttemptState, TestWindow } from "@/lib/shared/types";

interface Brief {
  id: string;
  title: string;
  instructions: string;
  duration_minutes: number;
  starts_at: string;
  ends_at: string;
  problem_count: number;
  total_marks: number;
  proctored: boolean;
  camera_required: boolean;
  window: TestWindow;
  state: AttemptState;
  can_start: boolean;
}

type StepState = "todo" | "active" | "done" | "failed";

function StepIcon({ state, icon: Icon }: { state: StepState; icon: typeof Camera }) {
  return (
    <span
      className={cx(
        "grid h-8 w-8 shrink-0 place-items-center rounded-ui border",
        state === "done" && "border-ok bg-ok-soft text-ok",
        state === "failed" && "border-bad bg-bad-soft text-bad",
        state === "active" && "border-ink bg-surface text-ink",
        state === "todo" && "border-line bg-surface text-muted",
      )}
    >
      {state === "done" ? <Check size={16} weight="bold" /> : state === "failed" ? <X size={16} weight="bold" /> : <Icon size={16} />}
    </span>
  );
}

function Step({ state, icon, title, children }: { state: StepState; icon: typeof Camera; title: string; children?: React.ReactNode }) {
  return (
    <li className="grid grid-cols-[32px_1fr] gap-4">
      <StepIcon state={state} icon={icon} />
      <div className="min-w-0 pt-1">
        <p className={cx("text-sm font-medium", state === "todo" ? "text-muted" : "text-ink")}>{title}</p>
        {children ? <div className="mt-2 text-sm text-ink-2">{children}</div> : null}
      </div>
    </li>
  );
}

export default function CheckPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const proctor = useProctor();
  const [brief, setBrief] = useState<Brief | null>(null);
  const [settings, setSettings] = useState<ProctoringSettings | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [mobile, setMobile] = useState(false);
  const [supported, setSupported] = useState(true);

  const [camState, setCamState] = useState<StepState>("active");
  const [camError, setCamError] = useState<string | null>(null);
  const [camBusy, setCamBusy] = useState(false);
  const [faceState, setFaceState] = useState<StepState>("todo");
  const [faceError, setFaceError] = useState<string | null>(null);
  const [accepted, setAccepted] = useState(false);
  const [starting, setStarting] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);

  useEffect(() => {
    setMobile(isMobileDevice());
    setSupported(isSupportedBrowser());
    api.get<{ test: Brief; proctoring: ProctoringSettings }>(`/api/tests/${id}`)
      .then((res) => { setBrief(res.test); setSettings(res.proctoring); })
      .catch((err) => setLoadError(err instanceof ApiError ? err.message : "Could not load this test."));
  }, [id]);

  // The preview must be visibly painting for the face check to read frames.
  useEffect(() => {
    proctor.setPreview(true);
    return () => proctor.setPreview(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const cameraNeeded = !!brief?.camera_required;
  const fullscreenNeeded = settings?.require_fullscreen !== false && !!brief?.proctored;
  const wantAudio = !!settings?.audio_detection_enabled && !!brief?.proctored;

  async function enableCamera() {
    setCamBusy(true);
    setCamError(null);
    const res = await proctor.requestMedia(wantAudio);
    setCamBusy(false);
    if (!res.ok) {
      setCamState("failed");
      setCamError(res.reason ?? "Could not start the camera.");
      return;
    }
    setCamState("done");
    setFaceState("active");
    void checkFace();
  }

  async function checkFace() {
    setFaceState("active");
    setFaceError(null);
    const res = await proctor.runFaceCheck();
    if (res.ok) setFaceState("done");
    else {
      setFaceState("failed");
      setFaceError(res.reason ?? "Face check failed.");
    }
  }

  async function start() {
    if (!brief) return;
    setStarting(true);
    setStartError(null);
    // Fullscreen must be requested inside the click itself.
    if (fullscreenNeeded) {
      const ok = await proctor.requestFullscreen();
      if (!ok) {
        setStarting(false);
        setStartError("Fullscreen was refused. Allow it when the browser asks, or press F11, then try again.");
        return;
      }
    }
    router.push(`/test/${id}`);
  }

  const cameraReady = !cameraNeeded || (camState === "done" && faceState === "done");
  const ready = !!brief?.can_start && !mobile && cameraReady && accepted;

  return (
    <div className="min-h-[100dvh]">
      <header className="border-b border-line">
        <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-4 sm:px-6">
          <Wordmark />
          <Link href="/dashboard" className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-ink">
            <ArrowLeft size={14} /> Back to tests
          </Link>
        </div>
      </header>

      <main className="mx-auto grid max-w-5xl gap-10 px-4 py-10 sm:px-6 lg:grid-cols-[1.1fr_1fr] lg:gap-16">
        <section className="min-w-0">
          {loadError ? <Notice tone="bad" title="This test cannot be opened">{loadError}</Notice> : null}
          {!brief && !loadError ? (
            <div className="grid gap-3"><Skeleton className="h-8 w-2/3" /><Skeleton className="h-4 w-1/2" /><Skeleton className="h-40" /></div>
          ) : null}
          {brief ? (
            <>
              <h1 className="text-2xl font-semibold tracking-tight">{brief.title}</h1>
              <dl className="mt-3 flex flex-wrap gap-x-6 gap-y-2 text-sm text-ink-2">
                <div className="flex items-center gap-1.5"><Clock size={15} className="text-muted" />{brief.duration_minutes} minutes</div>
                <div className="flex items-center gap-1.5"><Code size={15} className="text-muted" />{brief.problem_count} problem{brief.problem_count === 1 ? "" : "s"}, {brief.total_marks} marks</div>
              </dl>
              <p className="mt-1 text-xs text-muted">Window closes {formatWhen(brief.ends_at)}. Your timer cannot run past that.</p>

              {brief.instructions ? (
                <div className="mt-8">
                  <h2 className="text-sm font-medium text-muted">Instructions</h2>
                  <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-ink-2">{brief.instructions}</p>
                </div>
              ) : null}

              {brief.proctored && settings ? (
                <div className="mt-8">
                  <h2 className="text-sm font-medium text-muted">How this test is proctored</h2>
                  <ul className="mt-3 grid gap-2 text-sm text-ink-2">
                    {settings.require_fullscreen ? <li>The test runs in fullscreen. Leaving it is recorded.</li> : null}
                    {settings.tab_switch_enabled ? <li>Switching tabs or apps is recorded.</li> : null}
                    {cameraNeeded ? <li>Your camera watches for your face{settings.multi_person_detection_enabled ? ", for other people" : ""}{settings.phone_detection_enabled ? " and for a phone" : ""}.</li> : null}
                    {wantAudio ? <li>Sustained talking at your microphone is recorded.</li> : null}
                    <li>Pasting into the editor is disabled.</li>
                    <li>
                      After <span className="font-medium text-ink">{settings.max_violations}</span> recorded violations your test is handed in automatically.
                    </li>
                  </ul>
                </div>
              ) : null}
            </>
          ) : null}
        </section>

        <section className="min-w-0">
          <div className="rounded-ui border border-line bg-surface p-5 sm:p-6">
            <h2 className="font-semibold tracking-tight">System check</h2>
            <ol className="mt-6 grid gap-6">
              <Step state={mobile ? "failed" : "done"} icon={Browser} title={mobile ? "This device cannot sit the test" : `Browser: ${browserName()}`}>
                {mobile ? "Open this page on a laptop or desktop computer." : !supported ? (
                  <span className="text-warn">Chrome or Edge is recommended. Camera checks may not work reliably here.</span>
                ) : null}
              </Step>

              {cameraNeeded ? (
                <Step state={mobile ? "todo" : camState} icon={wantAudio ? Microphone : Camera} title={wantAudio ? "Camera and microphone" : "Camera"}>
                  {camState !== "done" && !mobile ? (
                    <div className="grid gap-3">
                      {camError ? <p className="text-bad">{camError}</p> : <p>Your browser will ask for permission. Choose Allow.</p>}
                      <Button size="sm" variant="secondary" onClick={enableCamera} busy={camBusy} className="justify-self-start">
                        {camState === "failed" ? "Try again" : wantAudio ? "Allow camera and mic" : "Allow camera"}
                      </Button>
                    </div>
                  ) : camState === "done" ? <p>Working. Your preview is in the bottom-right corner.</p> : null}
                </Step>
              ) : null}

              {cameraNeeded ? (
                <Step state={faceState} icon={Camera} title="Face check">
                  {faceState === "active" ? <p>Look at the screen for a few seconds.</p> : null}
                  {faceState === "failed" ? (
                    <div className="grid gap-3">
                      <p className="text-bad">{faceError}</p>
                      <Button size="sm" onClick={checkFace} className="justify-self-start">Check again</Button>
                    </div>
                  ) : null}
                  {faceState === "done" ? <p>We can see you clearly.</p> : null}
                </Step>
              ) : null}

              {fullscreenNeeded ? (
                <Step state={ready ? "active" : "todo"} icon={ArrowsOut} title="Fullscreen">
                  {ready ? <p>Starting the test switches your screen to fullscreen.</p> : null}
                </Step>
              ) : null}
            </ol>

            <div className="mt-8 border-t border-line pt-5">
              <label className="flex cursor-pointer items-start gap-3 text-sm text-ink-2">
                <input
                  type="checkbox"
                  checked={accepted}
                  onChange={(e) => setAccepted(e.target.checked)}
                  className="mt-0.5 h-4 w-4 accent-[var(--accent)]"
                />
                I will work alone, without other devices, notes or outside help.
              </label>

              {brief && !brief.can_start ? (
                <p className="mt-4 flex items-center gap-2 text-sm text-warn">
                  <Warning size={16} />
                  {brief.state === "submitted" ? "You have already handed in this test."
                    : brief.state === "timed_out" ? "Your time for this test is over."
                      : brief.window === "upcoming" ? `This test opens ${formatWhen(brief.starts_at)}.`
                        : "This test has closed."}
                </p>
              ) : null}
              {startError ? <p className="mt-4 text-sm text-bad">{startError}</p> : null}

              <Button variant="primary" className="mt-5 w-full" disabled={!ready} busy={starting} onClick={start}>
                {brief?.state === "in_progress" ? "Resume test" : "Start test"}
              </Button>
              {brief?.state !== "in_progress" ? (
                <p className="mt-2 text-center text-xs text-muted">Your {brief?.duration_minutes ?? ""} minute timer starts when the paper opens.</p>
              ) : null}
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
