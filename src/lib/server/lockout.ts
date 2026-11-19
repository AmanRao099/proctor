import "server-only";
import type { Db, ObjectId } from "mongodb";
import { getSettings } from "./settings";

/*
 * Proctoring lockout, ported from MyCodeBud's services/proctor_lockout.py.
 *
 * The server decides; the client only renders the verdict. Each hand-in that
 * the PROCTOR forced (the violation limit was reached) is a STRIKE:
 *
 *   strike 1 -> 15 minutes   strike 2 -> 1 hour
 *   strike 3 -> 6 hours      strike 4 -> 24 hours
 *   strike 5 -> barred from proctored tests until an admin approves an appeal
 *
 * Strikes older than DECAY_DAYS stop counting. Rows are never deleted: an
 * approved appeal stamps `forgiven_at`, so the history stays reviewable.
 */

export const LADDER_SECONDS = [15 * 60, 60 * 60, 6 * 60 * 60, 24 * 60 * 60];
export const BAN_AT_STRIKE = LADDER_SECONDS.length + 1;
export const DECAY_DAYS = 30;

export interface StrikeDoc {
  _id: ObjectId;
  user_id: ObjectId;
  test_id: ObjectId;
  attempt_id: ObjectId;
  occurred_at: Date;
  violation_count: number;
  violation_types: string[];
  forgiven_at?: Date | null;
}

export interface AppealDoc {
  _id: ObjectId;
  user_id: ObjectId;
  message: string;
  status: "pending" | "approved" | "rejected";
  strike_count: number;
  created_at: Date;
  resolved_at?: Date;
  admin_note?: string;
}

export interface LockoutStatus {
  allowed: boolean;
  enabled: boolean;
  banned: boolean;
  strike_count: number;
  ban_at_strike: number;
  cooldown_until: string | null;
  cooldown_seconds_remaining: number;
  next_penalty: number | "ban";
  decay_days: number;
  appeal_status: AppealDoc["status"] | null;
  can_appeal: boolean;
}

export function activeStrikes(rows: StrikeDoc[], now = new Date()) {
  const cutoff = now.getTime() - DECAY_DAYS * 86400_000;
  return rows.filter((r) => !r.forgiven_at && (!(r.occurred_at instanceof Date) || r.occurred_at.getTime() >= cutoff));
}

export async function lockoutStatus(d: Db, userId: ObjectId, now = new Date()): Promise<LockoutStatus> {
  const { lockout_enabled } = await getSettings();
  const rows = await d.collection<StrikeDoc>("proctor_strikes").find({ user_id: userId }).sort({ occurred_at: 1 }).toArray();
  const active = activeStrikes(rows, now);
  const count = active.length;
  const banned = lockout_enabled && count >= BAN_AT_STRIKE;
  let cooldownUntil: Date | null = null;
  if (lockout_enabled && count > 0 && !banned) {
    const last = active[active.length - 1];
    const until = new Date(last.occurred_at.getTime() + LADDER_SECONDS[Math.min(count, LADDER_SECONDS.length) - 1] * 1000);
    if (until > now) cooldownUntil = until;
  }
  const appeal = await d.collection<AppealDoc>("ban_appeals").findOne({ user_id: userId }, { sort: { created_at: -1 } });
  const appealStatus = appeal ? appeal.status : null;
  return {
    allowed: !banned && !cooldownUntil,
    enabled: lockout_enabled,
    banned,
    strike_count: count,
    ban_at_strike: BAN_AT_STRIKE,
    cooldown_until: cooldownUntil?.toISOString() ?? null,
    cooldown_seconds_remaining: cooldownUntil ? Math.ceil((cooldownUntil.getTime() - now.getTime()) / 1000) : 0,
    next_penalty: count + 1 >= BAN_AT_STRIKE ? "ban" : LADDER_SECONDS[count],
    decay_days: DECAY_DAYS,
    appeal_status: appealStatus,
    can_appeal: banned && appealStatus !== "pending",
  };
}

/** Record the strike for one forced hand-in. Unique on attempt, so a retry files once. */
export async function recordStrike(d: Db, input: {
  userId: ObjectId; testId: ObjectId; attemptId: ObjectId; violationCount: number; violationTypes: string[];
}) {
  await d.collection("proctor_strikes").updateOne(
    { attempt_id: input.attemptId },
    {
      $setOnInsert: {
        user_id: input.userId,
        test_id: input.testId,
        attempt_id: input.attemptId,
        occurred_at: new Date(),
        violation_count: input.violationCount,
        violation_types: input.violationTypes.slice(0, 50),
        forgiven_at: null,
      },
    },
    { upsert: true },
  );
}

export function describeLockout(s: LockoutStatus): string {
  if (s.banned) {
    return s.appeal_status === "pending"
      ? "Your account is barred from proctored tests after repeated violations. Your appeal is waiting for a decision."
      : "Your account is barred from proctored tests after repeated violations. You can appeal to the organiser.";
  }
  const mins = Math.ceil(s.cooldown_seconds_remaining / 60);
  const span = mins >= 60 ? `${Math.floor(mins / 60)}h ${mins % 60}m` : `${mins} minute${mins === 1 ? "" : "s"}`;
  return `A recent test was handed in for proctoring violations. You can start a new proctored test in ${span}.`;
}
