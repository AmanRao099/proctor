"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import {
  CAMERA_LEVELS, DEFAULT_PROCTORING, MIC_LEVELS, MIC_SAMPLE_MS, asLevel, type ProctoringSettings,
} from "@/lib/shared/proctoring";
import type { Violation } from "@/lib/shared/types";

/*
 * The proctor engine. A port of MyCodeBud's ProctorContext, keeping every rule
 * that was learned in production rounds:
 *
 *  1. A deliberate submit is never a violation. Submitting exits fullscreen;
 *     the guard against that is a REF set synchronously (state would be read
 *     stale by the fullscreenchange listener), and handlers stand down first.
 *  2. No camera session without a live video track, and a track that dies
 *     mid-test raises a strike instead of going quiet.
 *  3. Exactly one <video> element, visible, so detection reads the element the
 *     candidate can see painting (a hidden 1x1 video may never decode frames).
 *  4. The strike threshold is the only way a session ends. Every signal goes
 *     through addViolation.
 *  5. Liveness is judged from frame ARRIVAL, not track events: a covered lens
 *     or a disabled track fires no event and leaves the last frame painted.
 *  6. A frozen page is not a dead camera; a late poll resets the clock.
 *  7. Models run on the CPU on macOS (WebGL video reads are unreliable there)
 *     and always read a 2D-canvas copy of the frame.
 *
 * Face: MediaPipe FaceLandmarker. Phone: MediaPipe ObjectDetector
 * (EfficientDet-Lite0, COCO "cell phone"). Both self-hosted under
 * /vendor/mediapipe so a test never depends on a CDN being reachable.
 */

export interface StartResult {
  ok: boolean;
  reason?: string;
}

interface ProctorState {
  isMonitoring: boolean;
  testSubmitted: boolean;
  violations: Violation[];
  violationCount: number;
  maxViolations: number;
  autoSubmitted: boolean;
  cameraLive: boolean;
  faceStatus: "ok" | "no_face" | "multiple_faces" | "looking_away" | "unknown";
  phoneDetected: boolean;
}

interface ProctorValue {
  state: ProctorState;
  mediaStream: MediaStream | null;
  hasMic: boolean;
  modelReady: boolean;
  modelFailed: boolean;
  faceCheckPassed: boolean;
  requestMedia: (wantAudio: boolean) => Promise<StartResult>;
  requestFullscreen: () => Promise<boolean>;
  runFaceCheck: () => Promise<StartResult>;
  startMonitoring: (opts: { camera: boolean; settings: ProctoringSettings; requireFaceCheck?: boolean }) => StartResult;
  updateSettings: (settings: ProctoringSettings) => void;
  restoreViolations: (list: Violation[]) => void;
  addViolation: (type: Violation["type"], description: string) => void;
  beginFinish: () => void;
  cancelFinish: () => StartResult;
  completeCleanup: () => void;
  setPreview: (on: boolean) => void;
}

const Ctx = createContext<ProctorValue | null>(null);

export function useProctor() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useProctor must be used inside ProctorProvider");
  return v;
}

// ─── Tuning ───────────────────────────────────────────────────────────────────

const DETECT_INTERVAL_MS = 250; // ~4 fps
const FRAMES_PER_SECOND = 1000 / DETECT_INTERVAL_MS;
const RESTRIKE_COOLDOWN_MS = 15_000;
const LIVENESS_STALL_MS = 12_000;
const LIVENESS_RECOVER_MS = 3000;
const LIVENESS_POLL_MS = 500;
const LIVENESS_BLOCKED_GAP_MS = 1500;
const LIVENESS_WARMUP_MS = 10_000;
const LIVENESS_FLAG_POLLS = 4;
const FACE_WARMUP_MS = 8000;
const FOCUS_LOSS_GRACE_MS = 1500;
const FULLSCREEN_SETTLE_MS = 2500;
const PASTE_COOLDOWN_MS = 15_000;
const FRAME_W = 320;

const WASM_PATH = "/vendor/mediapipe/wasm";
const FACE_MODEL = "/vendor/mediapipe/models/face_landmarker.task";
const PHONE_MODEL = "/vendor/mediapipe/models/efficientdet_lite0.tflite";
const PHONE_LABELS = new Set(["cell phone", "cellphone", "mobile phone"]);
const PHONE_INTERVAL_MS = 1000;
const PHONE_SCORE = 0.5;
const PHONE_MODEL_SCORE = 0.3;
const PHONE_FRAMES = 3;

function isWebKitSafari() {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  return /Safari\//.test(ua) && !/Chrome\/|Chromium\/|CriOS\/|Edg\/|OPR\/|Firefox\/|FxiOS\//.test(ua);
}

function preferCpu() {
  if (typeof navigator === "undefined") return false;
  return isWebKitSafari() || /Macintosh|Mac OS X/.test(navigator.userAgent);
}

function faceWidth(landmarks: { x: number }[]) {
  let min = 1, max = 0;
  for (const p of landmarks) {
    if (p.x < min) min = p.x;
    if (p.x > max) max = p.x;
  }
  return Math.max(0, max - min);
}

function inFullscreen() {
  const d = document as Document & { webkitFullscreenElement?: Element };
  return !!(d.fullscreenElement || d.webkitFullscreenElement);
}

const newId = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;

// ─── Provider ─────────────────────────────────────────────────────────────────

export function ProctorProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<ProctorState>({
    isMonitoring: false,
    testSubmitted: false,
    violations: [],
    violationCount: 0,
    maxViolations: DEFAULT_PROCTORING.max_violations,
    autoSubmitted: false,
    cameraLive: false,
    faceStatus: "unknown",
    phoneDetected: false,
  });
  const [config, setConfig] = useState<ProctoringSettings>(DEFAULT_PROCTORING);
  const [mediaStream, setMediaStream] = useState<MediaStream | null>(null);
  const [modelReady, setModelReady] = useState(false);
  const [modelFailed, setModelFailed] = useState(false);
  const [phoneReady, setPhoneReady] = useState(false);
  const [faceCheckPassed, setFaceCheckPassed] = useState(false);
  const [previewOn, setPreviewOn] = useState(false);
  const [cameraMonitored, setCameraMonitored] = useState(true);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const landmarkerRef = useRef<any>(null); // eslint-disable-line @typescript-eslint/no-explicit-any
  const detectorRef = useRef<any>(null); // eslint-disable-line @typescript-eslint/no-explicit-any
  const frameCanvas = useRef<HTMLCanvasElement | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const lastFullscreenEnter = useRef(0);
  /** THE submit guard. A ref, never state: see rule 1 above. */
  const finishingRef = useRef(false);
  const submittedRef = useRef(false);
  const cameraRequiredRef = useRef(true);
  const faceCheckRef = useRef(false);
  const modelReadyRef = useRef(false);
  const modelFailedRef = useRef(false);
  modelReadyRef.current = modelReady;
  modelFailedRef.current = modelFailed;

  // ─── Face model ─────────────────────────────────────────────────────────

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const vision = await import("@mediapipe/tasks-vision");
        const fileset = await vision.FilesetResolver.forVisionTasks(WASM_PATH);
        const create = (delegate: "GPU" | "CPU") => vision.FaceLandmarker.createFromOptions(fileset, {
          baseOptions: { modelAssetPath: FACE_MODEL, delegate },
          runningMode: "VIDEO",
          numFaces: 4,
          outputFaceBlendshapes: false,
          outputFacialTransformationMatrixes: false,
        });
        let lm;
        if (preferCpu()) lm = await create("CPU");
        else {
          try { lm = await create("GPU"); } catch { lm = await create("CPU"); }
        }
        if (cancelled) return;
        // Warm up now so the first exam frame does not freeze the page.
        try {
          const blank = document.createElement("canvas");
          blank.width = 64; blank.height = 64;
          lm.detectForVideo(blank, performance.now());
        } catch { /* warm-up only */ }
        landmarkerRef.current = lm;
        setModelReady(true);
      } catch (err) {
        console.error("[proctor] face model failed to load", err);
        if (!cancelled) setModelFailed(true);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // ─── Phone model (only when enabled) ────────────────────────────────────

  useEffect(() => {
    if (!config.phone_detection_enabled) {
      try { detectorRef.current?.close(); } catch { /* closed */ }
      detectorRef.current = null;
      setPhoneReady(false);
      setState((p) => (p.phoneDetected ? { ...p, phoneDetected: false } : p));
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const vision = await import("@mediapipe/tasks-vision");
        const fileset = await vision.FilesetResolver.forVisionTasks(WASM_PATH);
        const created = await vision.ObjectDetector.createFromOptions(fileset, {
          baseOptions: { modelAssetPath: PHONE_MODEL, delegate: preferCpu() ? "CPU" : "GPU" },
          runningMode: "VIDEO",
          maxResults: 8,
          scoreThreshold: PHONE_MODEL_SCORE,
        });
        if (cancelled) { try { created.close(); } catch { /* closed */ } return; }
        detectorRef.current = created;
        setPhoneReady(true);
      } catch (err) {
        console.error("[proctor] phone model failed to load", err);
      }
    })();
    return () => {
      cancelled = true;
      try { detectorRef.current?.close(); } catch { /* closed */ }
      detectorRef.current = null;
    };
  }, [config.phone_detection_enabled]);

  // ─── Media ──────────────────────────────────────────────────────────────

  const requestMedia = useCallback(async (wantAudio: boolean): Promise<StartResult> => {
    if (!navigator.mediaDevices?.getUserMedia) {
      return { ok: false, reason: "This browser cannot use a camera. Use the latest Chrome or Edge." };
    }
    const video = {
      width: { ideal: 640, max: 1280 },
      height: { ideal: 480, max: 720 },
      facingMode: "user",
      frameRate: { ideal: 15, max: 30 },
    };
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video,
        audio: wantAudio ? { channelCount: 1, echoCancellation: true, noiseSuppression: true } : false,
      });
      let final = stream;
      // macOS may pick an iPhone over Continuity Camera, which drops whenever
      // the phone moves. Prefer the built-in camera when there is one.
      try {
        const label = stream.getVideoTracks()[0]?.label || "";
        if (/iphone|continuity|desk view/i.test(label)) {
          const devices = await navigator.mediaDevices.enumerateDevices();
          const builtIn = devices.find((d) => d.kind === "videoinput" && /facetime|built-in|isight/i.test(d.label));
          if (builtIn) {
            const swapped = await navigator.mediaDevices.getUserMedia({
              video: { ...video, deviceId: { exact: builtIn.deviceId } },
              audio: false,
            });
            stream.getVideoTracks().forEach((t) => t.stop());
            final = new MediaStream([...swapped.getVideoTracks(), ...stream.getAudioTracks()]);
          }
        }
      } catch { /* keep the original camera */ }
      faceCheckRef.current = false;
      setFaceCheckPassed(false);
      setMediaStream((old) => {
        old?.getTracks().forEach((t) => t.stop());
        return final;
      });
      return { ok: true };
    } catch (err) {
      const name = (err as DOMException)?.name;
      if (name === "NotAllowedError") {
        return { ok: false, reason: "Camera access was blocked. Click the camera icon in the address bar, allow it, then try again." };
      }
      if (name === "NotFoundError") return { ok: false, reason: "No camera was found. Connect one and try again." };
      if (name === "NotReadableError") {
        return { ok: false, reason: "The camera is in use by another app (Zoom, Teams, Meet). Close it and try again." };
      }
      return { ok: false, reason: `Could not start the camera: ${(err as Error)?.message || name}` };
    }
  }, []);

  const requestFullscreen = useCallback(async () => {
    const el = document.documentElement as HTMLElement & { webkitRequestFullscreen?: () => Promise<void> };
    try {
      if (el.requestFullscreen) await el.requestFullscreen({ navigationUI: "hide" });
      else if (el.webkitRequestFullscreen) await el.webkitRequestFullscreen();
      else return false;
      lastFullscreenEnter.current = Date.now();
      return true;
    } catch {
      return false;
    }
  }, []);

  const exitFullscreenRaw = useCallback(() => {
    const d = document as Document & { webkitExitFullscreen?: () => void };
    try {
      if (!inFullscreen()) return;
      if (d.exitFullscreen) d.exitFullscreen().catch(() => {});
      else d.webkitExitFullscreen?.();
    } catch { /* already out */ }
  }, []);

  // ─── Strikes: the only path ─────────────────────────────────────────────

  const addViolation = useCallback((type: Violation["type"], description: string) => {
    if (finishingRef.current || submittedRef.current) return;
    const v: Violation = { id: newId(), type, description, timestamp: new Date().toISOString() };
    console.warn(`[proctor] strike (${type}): ${description}`);
    setState((p) => {
      const violations = [...p.violations, v];
      const violationCount = p.violationCount + 1;
      if (violationCount >= p.maxViolations && !p.testSubmitted) {
        submittedRef.current = true;
        return { ...p, violations, violationCount, testSubmitted: true, autoSubmitted: true, isMonitoring: false };
      }
      return { ...p, violations, violationCount };
    });
  }, []);

  const restoreViolations = useCallback((list: Violation[]) => {
    if (!list?.length) return;
    setState((p) => {
      const known = new Set(p.violations.map((v) => v.id));
      const merged = [...list.filter((v) => !known.has(v.id)), ...p.violations]
        .sort((a, b) => a.timestamp.localeCompare(b.timestamp));
      const violationCount = Math.max(p.violationCount, merged.length);
      if (violationCount >= p.maxViolations && !p.testSubmitted) {
        // At the limit before the reload: a reload does not buy another chance.
        submittedRef.current = true;
        return { ...p, violations: merged, violationCount, testSubmitted: true, autoSubmitted: true, isMonitoring: false };
      }
      return { ...p, violations: merged, violationCount };
    });
  }, []);

  // ─── Frame source + face check ──────────────────────────────────────────

  const grabFrame = useCallback((): HTMLCanvasElement | null => {
    const video = videoRef.current;
    if (!video || video.readyState < 2 || !video.videoWidth) return null;
    let canvas = frameCanvas.current;
    if (!canvas) {
      canvas = document.createElement("canvas");
      frameCanvas.current = canvas;
    }
    const h = Math.round((video.videoHeight / video.videoWidth) * FRAME_W) || 240;
    if (canvas.width !== FRAME_W || canvas.height !== h) {
      canvas.width = FRAME_W;
      canvas.height = h;
    }
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return null;
    try {
      ctx.drawImage(video, 0, 0, FRAME_W, h);
    } catch {
      return null;
    }
    return canvas;
  }, []);

  const runFaceCheck = useCallback(async (): Promise<StartResult> => {
    const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
    for (let i = 0; i < 100 && !modelReadyRef.current && !modelFailedRef.current; i++) await wait(250);
    if (!modelReadyRef.current || !landmarkerRef.current) {
      return { ok: false, reason: "Camera proctoring could not start in this browser. Update it or use the latest Chrome, then try again." };
    }
    const video = videoRef.current;
    if (video?.paused) video.play().catch(() => {});
    let streak = 0;
    const until = Date.now() + 15_000;
    while (Date.now() < until) {
      await wait(DETECT_INTERVAL_MS);
      const frame = grabFrame();
      if (!frame) continue;
      let faces = 0;
      try {
        faces = landmarkerRef.current.detectForVideo(frame, performance.now())?.faceLandmarks?.length ?? 0;
      } catch {
        faces = 0;
      }
      streak = faces > 0 ? streak + 1 : 0;
      if (streak >= 4) {
        faceCheckRef.current = true;
        setFaceCheckPassed(true);
        return { ok: true };
      }
    }
    return { ok: false, reason: "We could not see your face. Sit facing the camera in good light, uncover the lens, and try again." };
  }, [grabFrame]);

  // ─── Start / finish ─────────────────────────────────────────────────────

  const liveTrack = useCallback(() => {
    const t = mediaStream?.getVideoTracks()[0];
    return t && t.readyState === "live" && !t.muted ? t : null;
  }, [mediaStream]);

  const applySettings = useCallback((s: ProctoringSettings) => {
    setConfig(s);
    setState((p) => ({ ...p, maxViolations: s.max_violations }));
  }, []);

  const startMonitoring = useCallback((opts: { camera: boolean; settings: ProctoringSettings; requireFaceCheck?: boolean }): StartResult => {
    applySettings(opts.settings);
    cameraRequiredRef.current = opts.camera;
    setCameraMonitored(opts.camera);
    if (opts.camera) {
      if (!liveTrack()) {
        return {
          ok: false,
          reason: !mediaStream
            ? "Camera access has not been granted. Go back through the system check."
            : "The camera is not producing video. Check it is not covered, in use elsewhere, or disabled.",
        };
      }
      if (opts.requireFaceCheck && !faceCheckRef.current) {
        return { ok: false, reason: "The camera check has not been completed on this page load." };
      }
    }
    finishingRef.current = false;
    submittedRef.current = false;
    setState((p) => ({ ...p, isMonitoring: true, cameraLive: opts.camera }));
    return { ok: true };
  }, [applySettings, liveTrack, mediaStream]);

  const beginFinish = useCallback(() => {
    finishingRef.current = true;
    setState((p) => ({ ...p, isMonitoring: false }));
  }, []);

  const cancelFinish = useCallback((): StartResult => {
    if (cameraRequiredRef.current && !liveTrack()) {
      setState((p) => ({ ...p, cameraLive: false }));
      return { ok: false, reason: "The camera is no longer available. Reload the page to continue." };
    }
    finishingRef.current = false;
    setState((p) => ({ ...p, isMonitoring: true, cameraLive: cameraRequiredRef.current }));
    return { ok: true };
  }, [liveTrack]);

  const completeCleanup = useCallback(() => {
    // Stand down BEFORE anything observable happens, then exit fullscreen,
    // then release the hardware last so the preview does not flash black.
    finishingRef.current = true;
    submittedRef.current = true;
    setState((p) => ({ ...p, isMonitoring: false, testSubmitted: true, cameraLive: false }));
    exitFullscreenRaw();
    setTimeout(() => {
      setMediaStream((s) => {
        s?.getTracks().forEach((t) => { try { t.stop(); } catch { /* stopped */ } });
        return null;
      });
      try { audioCtxRef.current?.close(); } catch { /* closed */ }
      audioCtxRef.current = null;
      faceCheckRef.current = false;
      setFaceCheckPassed(false);
    }, 50);
  }, [exitFullscreenRaw]);

  // ─── Bind stream to the one video ───────────────────────────────────────

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    if (mediaStream && video.srcObject !== mediaStream) {
      video.srcObject = mediaStream;
      video.play().catch(() => {});
    } else if (!mediaStream && video.srcObject) {
      video.srcObject = null;
    }
  }, [mediaStream]);

  // ─── Track events ───────────────────────────────────────────────────────

  useEffect(() => {
    const track = mediaStream?.getVideoTracks()[0];
    if (!track) return;
    const dead = (why: string) => () => {
      if (finishingRef.current || submittedRef.current || !cameraRequiredRef.current) return;
      setState((p) => ({ ...p, cameraLive: false }));
      if (state.isMonitoring) addViolation("CRITICAL", why);
    };
    const onEnded = dead("Camera stopped during the session");
    const onMute = dead("Camera stopped producing video (covered or disabled)");
    const onUnmute = () => setState((p) => ({ ...p, cameraLive: true }));
    track.addEventListener("ended", onEnded);
    track.addEventListener("mute", onMute);
    track.addEventListener("unmute", onUnmute);
    return () => {
      track.removeEventListener("ended", onEnded);
      track.removeEventListener("mute", onMute);
      track.removeEventListener("unmute", onUnmute);
    };
  }, [mediaStream, addViolation, state.isMonitoring]);

  // ─── Liveness ───────────────────────────────────────────────────────────

  useEffect(() => {
    if (!state.isMonitoring || state.testSubmitted || !mediaStream || !cameraMonitored) return;
    const video = videoRef.current;
    if (!video) return;
    const track = mediaStream.getVideoTracks()[0];
    const startedAt = Date.now();
    let lastFrameAt = startedAt;
    let lastPollAt = startedAt;
    let lastStrikeAt = 0;
    let deadPolls = 0;
    let lastMediaTime = -1;
    let lastCurrentTime = -1;
    let lastDecoded = -1;
    let lastSig = "";
    let lastRecoverAt = 0;
    let struck = false;
    let rvfc = 0;
    let cancelled = false;

    const v = video as HTMLVideoElement & {
      requestVideoFrameCallback?: (cb: (now: number, meta: { mediaTime?: number }) => void) => number;
      cancelVideoFrameCallback?: (h: number) => void;
    };
    const sig = document.createElement("canvas");
    sig.width = 16; sig.height = 12;
    const sigCtx = sig.getContext("2d", { willReadFrequently: true });
    const pictureSig = () => {
      if (!sigCtx || video.readyState < 2) return "";
      try {
        sigCtx.drawImage(video, 0, 0, 16, 12);
        const d = sigCtx.getImageData(0, 0, 16, 12).data;
        let h = 0;
        for (let i = 0; i < d.length; i += 4) h = (h * 31 + d[i] + d[i + 1] * 3 + d[i + 2] * 7) | 0;
        return String(h);
      } catch {
        return "";
      }
    };
    const alive = (at: number) => {
      lastFrameAt = at;
      if (struck) {
        struck = false;
        setState((p) => ({ ...p, cameraLive: true }));
      }
    };
    const onFrame = (_n: number, meta: { mediaTime?: number }) => {
      if (cancelled) return;
      const t = meta?.mediaTime ?? video.currentTime;
      if (t !== lastMediaTime) {
        lastMediaTime = t;
        alive(Date.now());
      }
      rvfc = v.requestVideoFrameCallback!(onFrame);
    };
    if (v.requestVideoFrameCallback) rvfc = v.requestVideoFrameCallback(onFrame);

    const poll = window.setInterval(() => {
      if (finishingRef.current || submittedRef.current) return;
      const now = Date.now();
      const gap = now - lastPollAt;
      lastPollAt = now;
      if (gap > LIVENESS_BLOCKED_GAP_MS) {
        // The page was frozen, not the camera.
        lastFrameAt = now;
        deadPolls = 0;
        return;
      }
      if (video.currentTime !== lastCurrentTime) {
        if (lastCurrentTime >= 0) alive(now);
        lastCurrentTime = video.currentTime;
      }
      const decoded = video.getVideoPlaybackQuality?.()?.totalVideoFrames ?? -1;
      if (decoded >= 0 && decoded !== lastDecoded) {
        if (lastDecoded >= 0) alive(now);
        lastDecoded = decoded;
      }
      const s = pictureSig();
      if (s && s !== lastSig) {
        if (lastSig) alive(now);
        lastSig = s;
      }
      if (now - lastFrameAt > LIVENESS_RECOVER_MS && now - lastRecoverAt > LIVENESS_RECOVER_MS) {
        lastRecoverAt = now;
        try {
          if (video.paused) video.play().catch(() => {});
          else if (video.srcObject === mediaStream) {
            video.srcObject = null;
            video.srcObject = mediaStream;
            video.play().catch(() => {});
          }
        } catch { /* the next poll judges */ }
      }
      const flagsNow = !track || track.readyState !== "live" || track.muted || track.enabled === false;
      deadPolls = flagsNow ? deadPolls + 1 : 0;
      const flagsDead = !track || track.readyState !== "live" || deadPolls >= LIVENESS_FLAG_POLLS;
      const stalled = now - lastFrameAt > LIVENESS_STALL_MS;
      if ((stalled || flagsDead) && !struck && now - startedAt > LIVENESS_WARMUP_MS && now - lastStrikeAt > RESTRIKE_COOLDOWN_MS) {
        struck = true;
        lastStrikeAt = now;
        setState((p) => ({ ...p, cameraLive: false, faceStatus: "no_face" }));
        addViolation("CRITICAL", "Camera feed stopped — the video is not updating. Check the camera is on, uncovered and not disabled.");
      }
    }, LIVENESS_POLL_MS);

    return () => {
      cancelled = true;
      window.clearInterval(poll);
      if (rvfc && v.cancelVideoFrameCallback) {
        try { v.cancelVideoFrameCallback(rvfc); } catch { /* gone */ }
      }
    };
  }, [state.isMonitoring, state.testSubmitted, mediaStream, cameraMonitored, addViolation]);

  // ─── Face detection ─────────────────────────────────────────────────────

  useEffect(() => {
    if (!state.isMonitoring || state.testSubmitted) return;
    if (!modelReady || !landmarkerRef.current || !mediaStream || !cameraMonitored) return;
    let raf = 0;
    let stopped = false;
    let lastRun = 0;
    let noFace = 0, multiFace = 0, lookAway = 0;
    let lastStrikeAt = 0;
    const startedAt = Date.now();
    const level = CAMERA_LEVELS[asLevel(config.camera_sensitivity)];
    const noFaceFrames = Math.round(Math.max(1, config.face_absence_grace_checks || 3) * FRAMES_PER_SECOND * level.noFaceScale);
    const faceRequired = config.face_detection_enabled;
    const multiEnabled = config.multi_person_detection_enabled;
    const canStrike = () => Date.now() - startedAt > FACE_WARMUP_MS && Date.now() - lastStrikeAt > RESTRIKE_COOLDOWN_MS;
    const strike = (type: Violation["type"], msg: string) => {
      lastStrikeAt = Date.now();
      addViolation(type, msg);
    };

    const loop = () => {
      if (stopped) return;
      raf = requestAnimationFrame(loop);
      const now = performance.now();
      if (now - lastRun < DETECT_INTERVAL_MS) return;
      lastRun = now;
      if (finishingRef.current) return;
      const frame = grabFrame();
      if (!frame) return;
      let faces: { x: number }[][] = [];
      try {
        faces = landmarkerRef.current.detectForVideo(frame, now)?.faceLandmarks ?? [];
      } catch {
        return;
      }
      if (faces.length === 0) {
        noFace++; multiFace = 0; lookAway = 0;
        if (faceRequired && noFace >= noFaceFrames && canStrike()) {
          setState((p) => ({ ...p, faceStatus: "no_face" }));
          strike("WARNING", "No face detected — stay visible in the camera");
          noFace = 0;
        }
        return;
      }
      // The candidate is the LARGEST face; others count only when big enough.
      const widths = faces.map(faceWidth);
      let primary = 0;
      widths.forEach((w, i) => { if (w > widths[primary]) primary = i; });
      const extras = widths.filter((w, i) => i !== primary && w >= widths[primary] * level.extraFaceMinRatio).length;
      if (multiEnabled && extras > 0) {
        multiFace++; noFace = 0; lookAway = 0;
        if (multiFace >= level.multiFaceFrames && canStrike()) {
          setState((p) => ({ ...p, faceStatus: "multiple_faces" }));
          strike("CRITICAL", `${extras + 1} faces detected — only you may be present`);
          multiFace = 0;
        }
        return;
      }
      noFace = 0; multiFace = 0;
      // Yaw from landmark geometry: nose tip vs the midpoint of the outer eye corners.
      const lm = faces[primary] as { x: number }[];
      const nose = lm[1], eyeL = lm[33], eyeR = lm[263];
      let away = false;
      if (nose && eyeL && eyeR) {
        const span = Math.abs(eyeR.x - eyeL.x) || 1e-6;
        away = Math.abs(nose.x - (eyeL.x + eyeR.x) / 2) / span > level.yawAwayRatio;
      }
      if (away && faceRequired) {
        lookAway++;
        if (lookAway >= level.lookAwayFrames && canStrike()) {
          setState((p) => ({ ...p, faceStatus: "looking_away" }));
          strike("WARNING", "Looking away from the screen for a sustained period");
          lookAway = 0;
        }
      } else {
        lookAway = 0;
        setState((p) => (p.faceStatus === "ok" ? p : { ...p, faceStatus: "ok" }));
      }
    };
    raf = requestAnimationFrame(loop);
    return () => { stopped = true; cancelAnimationFrame(raf); };
  }, [
    state.isMonitoring, state.testSubmitted, modelReady, mediaStream, cameraMonitored, grabFrame, addViolation,
    config.camera_sensitivity, config.face_absence_grace_checks, config.face_detection_enabled, config.multi_person_detection_enabled,
  ]);

  // ─── Microphone ─────────────────────────────────────────────────────────

  useEffect(() => {
    if (!state.isMonitoring || state.testSubmitted || !config.audio_detection_enabled || !mediaStream) return;
    const audio = mediaStream.getAudioTracks()[0];
    if (!audio) return;
    const level = MIC_LEVELS[asLevel(config.mic_sensitivity)];
    const windowSize = Math.round((level.windowSeconds * 1000) / MIC_SAMPLE_MS);
    let ctx: AudioContext;
    try { ctx = new AudioContext(); } catch { return; }
    audioCtxRef.current = ctx;
    const source = ctx.createMediaStreamSource(new MediaStream([audio]));
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 1024;
    source.connect(analyser);
    const buffer = new Float32Array(analyser.fftSize);
    const samples: boolean[] = [];
    let lastStrikeAt = 0;
    const timer = window.setInterval(() => {
      if (finishingRef.current || submittedRef.current) return;
      if (ctx.state === "suspended") ctx.resume().catch(() => {});
      analyser.getFloatTimeDomainData(buffer);
      let sum = 0;
      for (let i = 0; i < buffer.length; i++) sum += buffer[i] * buffer[i];
      samples.push(Math.sqrt(sum / buffer.length) >= level.threshold);
      if (samples.length > windowSize) samples.shift();
      if (samples.length < windowSize) return;
      const loud = samples.filter(Boolean).length / windowSize;
      if (loud >= level.fraction && Date.now() - lastStrikeAt > RESTRIKE_COOLDOWN_MS) {
        lastStrikeAt = Date.now();
        samples.length = 0;
        addViolation("WARNING", "Sustained talking or noise detected at your microphone");
      }
    }, MIC_SAMPLE_MS);
    return () => {
      window.clearInterval(timer);
      try { source.disconnect(); } catch { /* gone */ }
      if (audioCtxRef.current === ctx) audioCtxRef.current = null;
      ctx.close().catch(() => {});
    };
  }, [state.isMonitoring, state.testSubmitted, config.audio_detection_enabled, config.mic_sensitivity, mediaStream, addViolation]);

  // ─── Phone detection ────────────────────────────────────────────────────

  useEffect(() => {
    if (!state.isMonitoring || state.testSubmitted || !config.phone_detection_enabled) return;
    if (!phoneReady || !detectorRef.current || !mediaStream || !cameraMonitored) return;
    let raf = 0;
    let stopped = false;
    let lastRun = 0;
    let seen = 0;
    let lastStrikeAt = 0;
    let flagged = false;
    const loop = () => {
      if (stopped) return;
      raf = requestAnimationFrame(loop);
      const now = performance.now();
      if (now - lastRun < PHONE_INTERVAL_MS) return;
      lastRun = now;
      if (finishingRef.current) return;
      const frame = grabFrame();
      if (!frame) return;
      let best = 0;
      try {
        const dets = detectorRef.current.detectForVideo(frame, now)?.detections ?? [];
        for (const det of dets) {
          for (const cat of det?.categories ?? []) {
            if (PHONE_LABELS.has(String(cat?.categoryName ?? "").toLowerCase()) && cat.score > best) best = cat.score;
          }
        }
      } catch {
        return;
      }
      if (best >= PHONE_SCORE) {
        seen++;
        if (!flagged) {
          flagged = true;
          setState((p) => ({ ...p, phoneDetected: true }));
        }
        if (seen >= PHONE_FRAMES && Date.now() - lastStrikeAt > RESTRIKE_COOLDOWN_MS) {
          lastStrikeAt = Date.now();
          addViolation("CRITICAL", "Phone detected in the camera — put the device away and keep it out of frame");
          seen = 0;
        }
      } else {
        seen = 0;
        if (flagged) {
          flagged = false;
          setState((p) => ({ ...p, phoneDetected: false }));
        }
      }
    };
    raf = requestAnimationFrame(loop);
    return () => {
      stopped = true;
      cancelAnimationFrame(raf);
      setState((p) => (p.phoneDetected ? { ...p, phoneDetected: false } : p));
    };
  }, [state.isMonitoring, state.testSubmitted, config.phone_detection_enabled, phoneReady, mediaStream, cameraMonitored, grabFrame, addViolation]);

  // ─── Browser event signals ──────────────────────────────────────────────

  useEffect(() => {
    if (!state.isMonitoring || state.testSubmitted) return;
    const active = () => !finishingRef.current && !submittedRef.current;
    const settling = () => Date.now() - lastFullscreenEnter.current < FULLSCREEN_SETTLE_MS;
    let hiddenTimer = 0;
    let blurTimer = 0;
    let lastPaste = 0;

    const onVisibility = () => {
      if (!active()) return;
      window.clearTimeout(hiddenTimer);
      if (!document.hidden || settling()) return;
      hiddenTimer = window.setTimeout(() => {
        if (active() && document.hidden) addViolation("CRITICAL", "Tab switched or window minimized");
      }, FOCUS_LOSS_GRACE_MS);
    };
    const onBlur = () => {
      if (!active() || settling()) return;
      window.clearTimeout(blurTimer);
      blurTimer = window.setTimeout(() => {
        if (active() && document.visibilityState === "visible" && !document.hasFocus()) {
          addViolation("CRITICAL", "Lost focus — switched to another application");
        }
      }, FOCUS_LOSS_GRACE_MS);
    };
    const onFocus = () => window.clearTimeout(blurTimer);
    const onKey = (e: KeyboardEvent) => {
      if (!config.block_dev_tools || !active()) return;
      // Exactly MyCodeBud's rule: new tab, close, new window, reload, switch tab.
      if ((e.ctrlKey || e.metaKey) && ["t", "w", "n", "r", "Tab"].includes(e.key)) {
        e.preventDefault();
        addViolation("CRITICAL", "Prohibited keyboard shortcut attempted");
      }
      if (e.key === "F12") {
        e.preventDefault();
        addViolation("CRITICAL", "Attempted to open developer tools");
      }
    };
    // Blocked, never a strike: a two-finger tap on a trackpad IS a right-click.
    const onContext = (e: Event) => {
      if (config.block_right_click && active()) e.preventDefault();
    };
    // Capture phase + stopImmediatePropagation so Monaco's own clipboard
    // handler never sees it. Only paste brings outside text in, so only paste
    // is a strike, at most once per cooldown.
    const onClipboard = (e: ClipboardEvent) => {
      if (!active()) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      if (e.type !== "paste" || Date.now() - lastPaste < PASTE_COOLDOWN_MS) return;
      lastPaste = Date.now();
      addViolation("WARNING", "Paste is disabled during the test");
    };
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (!active()) return;
      e.preventDefault();
      e.returnValue = "";
    };
    const onFullscreen = () => {
      if (!active() || !config.require_fullscreen) return;
      if (inFullscreen()) {
        lastFullscreenEnter.current = Date.now();
        return;
      }
      addViolation("CRITICAL", "Exited fullscreen mode during the test");
    };
    const html = document.documentElement;
    const prevOverscroll = [html.style.overscrollBehaviorX, document.body.style.overscrollBehaviorX];
    html.style.overscrollBehaviorX = "none";
    document.body.style.overscrollBehaviorX = "none";

    if (config.tab_switch_enabled) {
      document.addEventListener("visibilitychange", onVisibility);
      window.addEventListener("blur", onBlur);
      window.addEventListener("focus", onFocus);
    }
    window.addEventListener("beforeunload", onBeforeUnload);
    document.addEventListener("keydown", onKey, true);
    document.addEventListener("contextmenu", onContext);
    document.addEventListener("copy", onClipboard, true);
    document.addEventListener("cut", onClipboard, true);
    document.addEventListener("paste", onClipboard, true);
    document.addEventListener("fullscreenchange", onFullscreen);
    document.addEventListener("webkitfullscreenchange", onFullscreen);
    return () => {
      window.clearTimeout(hiddenTimer);
      window.clearTimeout(blurTimer);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("blur", onBlur);
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("beforeunload", onBeforeUnload);
      document.removeEventListener("keydown", onKey, true);
      document.removeEventListener("contextmenu", onContext);
      document.removeEventListener("copy", onClipboard, true);
      document.removeEventListener("cut", onClipboard, true);
      document.removeEventListener("paste", onClipboard, true);
      document.removeEventListener("fullscreenchange", onFullscreen);
      document.removeEventListener("webkitfullscreenchange", onFullscreen);
      html.style.overscrollBehaviorX = prevOverscroll[0];
      document.body.style.overscrollBehaviorX = prevOverscroll[1];
    };
  }, [
    state.isMonitoring, state.testSubmitted, addViolation,
    config.tab_switch_enabled, config.block_right_click, config.block_dev_tools, config.require_fullscreen,
  ]);

  // ─── Preview ────────────────────────────────────────────────────────────

  const showPreview = (state.isMonitoring || previewOn) && !!mediaStream;
  useEffect(() => {
    if (showPreview && videoRef.current?.paused) videoRef.current.play().catch(() => {});
  }, [showPreview]);

  const value: ProctorValue = {
    state,
    mediaStream,
    hasMic: !!mediaStream?.getAudioTracks().length,
    modelReady,
    modelFailed,
    faceCheckPassed,
    requestMedia,
    requestFullscreen,
    runFaceCheck,
    startMonitoring,
    updateSettings: applySettings,
    restoreViolations,
    addViolation,
    beginFinish,
    cancelFinish,
    completeCleanup,
    setPreview: setPreviewOn,
  };

  const faceLabel: Record<ProctorState["faceStatus"], string> = {
    ok: "", unknown: "", no_face: "No face", multiple_faces: "Multiple faces", looking_away: "Looking away",
  };

  return (
    <Ctx.Provider value={value}>
      {/*
        THE one video element. Visible on purpose: the candidate can see they
        are recorded, and a painting element is guaranteed to decode frames.
        Always mounted so the ref is stable; only its visibility changes.
      */}
      <div
        aria-hidden="true"
        className="pointer-events-none fixed bottom-4 right-4 z-[55] w-44 overflow-hidden rounded-ui border border-white/15 bg-[#0b0b0d] shadow-[0_10px_30px_rgb(0_0_0/0.35)] transition-opacity duration-200"
        style={{ opacity: showPreview ? 1 : 0, visibility: showPreview ? "visible" : "hidden" }}
      >
        <video ref={videoRef} autoPlay muted playsInline className="block h-[124px] w-full -scale-x-100 object-cover" />
        <div className="absolute left-1.5 top-1.5 flex items-center gap-1.5 rounded-[4px] bg-black/55 px-1.5 py-0.5">
          <span className={`h-1.5 w-1.5 rounded-full ${state.cameraLive || !state.isMonitoring ? "bg-[#f87171]" : "bg-[#9ca3af]"}`} />
          <span className="font-mono text-[9px] font-semibold tracking-wider text-white">
            {state.isMonitoring && !state.cameraLive && cameraMonitored ? "NO SIGNAL" : "REC"}
          </span>
        </div>
        {state.phoneDetected || (state.isMonitoring && faceLabel[state.faceStatus]) ? (
          <div className="absolute inset-x-1.5 bottom-1.5 rounded-[4px] bg-[#b42318]/90 px-1.5 py-0.5 text-center font-mono text-[9px] font-semibold tracking-wide text-white">
            {state.phoneDetected ? "PHONE DETECTED" : faceLabel[state.faceStatus].toUpperCase()}
          </div>
        ) : null}
      </div>
      {children}
    </Ctx.Provider>
  );
}
