import "server-only";
import { db } from "./db";
import { DEFAULT_PROCTORING, normalizeProctoring, type ProctoringSettings } from "@/lib/shared/proctoring";

/*
 * Platform settings: one document. The proctoring block is the DEFAULT a new
 * test starts from (each test keeps its own copy, as in MyCodeBud where a
 * round is proctored by the settings served with its paper).
 */

export interface PlatformSettings {
  default_proctoring: ProctoringSettings;
  /** Escalating cooldown after a violation auto hand-in (see lockout.ts). */
  lockout_enabled: boolean;
  /** Percent a candidate needs to count as passed in analytics. */
  pass_mark: number;
}

export const DEFAULT_SETTINGS: PlatformSettings = {
  default_proctoring: DEFAULT_PROCTORING,
  lockout_enabled: true,
  pass_mark: 60,
};

export function normalizeSettings(raw: unknown): PlatformSettings {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const pass = Math.round(Number(r.pass_mark));
  return {
    default_proctoring: normalizeProctoring(r.default_proctoring),
    lockout_enabled: typeof r.lockout_enabled === "boolean" ? r.lockout_enabled : DEFAULT_SETTINGS.lockout_enabled,
    pass_mark: Number.isFinite(pass) ? Math.min(100, Math.max(1, pass)) : DEFAULT_SETTINGS.pass_mark,
  };
}

// Read on most admin requests; a few seconds of staleness across processes is
// fine, and this process's own saves update it immediately.
let cached: { value: PlatformSettings; at: number } | null = null;
const TTL_MS = 10_000;

export async function getSettings(): Promise<PlatformSettings> {
  if (cached && Date.now() - cached.at < TTL_MS) return cached.value;
  const d = await db();
  const doc = await d.collection("settings").findOne({ _id: "platform" as never });
  cached = { value: normalizeSettings(doc), at: Date.now() };
  return cached.value;
}

export async function saveSettings(next: PlatformSettings) {
  const d = await db();
  await d.collection("settings").updateOne(
    { _id: "platform" as never },
    { $set: { ...next, updated_at: new Date() } },
    { upsert: true },
  );
  cached = { value: next, at: Date.now() };
}
