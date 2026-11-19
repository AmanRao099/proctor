/**
 * Proctoring settings and the one place a Low / Medium / High choice becomes
 * detector numbers. Shared by the engine (browser) and the admin test editor.
 *
 * Ported from MyCodeBud's proctoring (lib/proctoring/sensitivity.ts and
 * proctoringConfigService.ts) so both products strike on the same numbers.
 */

export type SensitivityLevel = "very_low" | "low" | "medium" | "high";

export const SENSITIVITY_LEVELS: SensitivityLevel[] = ["very_low", "low", "medium", "high"];

export const LEVEL_LABELS: Record<SensitivityLevel, string> = {
  very_low: "Very low",
  low: "Low",
  medium: "Medium",
  high: "High",
};

export interface ProctoringSettings {
  max_violations: number;
  face_detection_enabled: boolean;
  multi_person_detection_enabled: boolean;
  /** Pulls a ~7MB model and has real false positives, so it is opt-in. */
  phone_detection_enabled: boolean;
  /** Seconds with no face in frame before a warning. */
  face_absence_grace_checks: number;
  camera_sensitivity: SensitivityLevel;
  /** Off by default: in a shared room the whole class is audible. */
  audio_detection_enabled: boolean;
  mic_sensitivity: SensitivityLevel;
  tab_switch_enabled: boolean;
  block_right_click: boolean;
  block_dev_tools: boolean;
  require_fullscreen: boolean;
}

export const DEFAULT_PROCTORING: ProctoringSettings = {
  max_violations: 5,
  face_detection_enabled: true,
  multi_person_detection_enabled: true,
  phone_detection_enabled: false,
  face_absence_grace_checks: 3,
  camera_sensitivity: "medium",
  audio_detection_enabled: false,
  mic_sensitivity: "medium",
  tab_switch_enabled: true,
  block_right_click: true,
  block_dev_tools: true,
  require_fullscreen: true,
};

/**
 * Camera. Detection runs at ~4 fps, so frame counts are quarter-seconds.
 * `extraFaceMinRatio`: a second face only counts when its width is at least
 * this fraction of the candidate's own face, so a person a row behind is
 * ignored at Low while someone at the shoulder is still caught.
 */
export const CAMERA_LEVELS: Record<SensitivityLevel, {
  extraFaceMinRatio: number;
  multiFaceFrames: number;
  lookAwayFrames: number;
  yawAwayRatio: number;
  noFaceScale: number;
}> = {
  very_low: { extraFaceMinRatio: 0.85, multiFaceFrames: 40, lookAwayFrames: 120, yawAwayRatio: 0.6, noFaceScale: 4 },
  low: { extraFaceMinRatio: 0.6, multiFaceFrames: 16, lookAwayFrames: 32, yawAwayRatio: 0.42, noFaceScale: 1.5 },
  medium: { extraFaceMinRatio: 0, multiFaceFrames: 8, lookAwayFrames: 20, yawAwayRatio: 0.34, noFaceScale: 1 },
  high: { extraFaceMinRatio: 0, multiFaceFrames: 4, lookAwayFrames: 12, yawAwayRatio: 0.28, noFaceScale: 1 },
};

/** Microphone: RMS above `threshold` for `fraction` of the last `windowSeconds`. */
export const MIC_LEVELS: Record<SensitivityLevel, { threshold: number; windowSeconds: number; fraction: number }> = {
  very_low: { threshold: 0.25, windowSeconds: 8, fraction: 0.8 },
  low: { threshold: 0.15, windowSeconds: 6, fraction: 0.7 },
  medium: { threshold: 0.08, windowSeconds: 4, fraction: 0.6 },
  high: { threshold: 0.04, windowSeconds: 3, fraction: 0.5 },
};

export const MIC_SAMPLE_MS = 100;

export function asLevel(value: unknown): SensitivityLevel {
  return value === "very_low" || value === "low" || value === "high" ? value : "medium";
}

/** Coerce anything (a stored doc, a request body) into complete settings. */
export function normalizeProctoring(raw: unknown): ProctoringSettings {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const bool = (k: keyof ProctoringSettings) =>
    typeof r[k] === "boolean" ? (r[k] as boolean) : (DEFAULT_PROCTORING[k] as boolean);
  const int = (k: keyof ProctoringSettings, min: number, max: number) => {
    const n = Math.round(Number(r[k]));
    return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : (DEFAULT_PROCTORING[k] as number);
  };
  return {
    max_violations: int("max_violations", 1, 50),
    face_detection_enabled: bool("face_detection_enabled"),
    multi_person_detection_enabled: bool("multi_person_detection_enabled"),
    phone_detection_enabled: bool("phone_detection_enabled"),
    face_absence_grace_checks: int("face_absence_grace_checks", 1, 60),
    camera_sensitivity: asLevel(r.camera_sensitivity),
    audio_detection_enabled: bool("audio_detection_enabled"),
    mic_sensitivity: asLevel(r.mic_sensitivity),
    tab_switch_enabled: bool("tab_switch_enabled"),
    block_right_click: bool("block_right_click"),
    block_dev_tools: bool("block_dev_tools"),
    require_fullscreen: bool("require_fullscreen"),
  };
}

/** Does this test need the camera at all? */
export function cameraRequired(proctored: boolean, s: ProctoringSettings): boolean {
  return proctored && (s.face_detection_enabled || s.multi_person_detection_enabled || s.phone_detection_enabled);
}
