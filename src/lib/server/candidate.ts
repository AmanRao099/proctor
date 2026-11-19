import "server-only";
import type { Db } from "mongodb";
import { requireUser } from "./auth";
import { db, ObjectId, oid } from "./db";
import { HttpError } from "./http";
import { HAND_IN_GRACE_MS, isAssigned, type AttemptDoc, type TestDoc } from "./models";
import type { SessionUser, Violation } from "@/lib/shared/types";

export interface CandidateCtx {
  d: Db;
  user: SessionUser;
  userId: ObjectId;
  test: TestDoc;
}

/** The signed-in candidate and a test they are assigned to, or a 404. */
export async function candidateTest(testIdRaw: string): Promise<CandidateCtx> {
  const user = await requireUser("candidate");
  const userId = oid(user.id)!;
  const testId = oid(testIdRaw);
  if (!testId) throw new HttpError(404, "This test does not exist.");
  const d = await db();
  const test = await d.collection<TestDoc>("tests").findOne({ _id: testId });
  // Same answer for "missing" and "not yours", so ids cannot be probed.
  if (!test || !isAssigned(test, userId)) throw new HttpError(404, "This test does not exist.");
  return { d, user, userId, test };
}

/**
 * The candidate's attempt, required to be open. `graceMs` lets a hand-in or a
 * last violation report land a little after the deadline.
 */
export async function openAttempt(ctx: CandidateCtx, graceMs = 0): Promise<AttemptDoc> {
  const a = await ctx.d.collection<AttemptDoc>("attempts").findOne({ test_id: ctx.test._id, user_id: ctx.userId });
  if (!a) throw new HttpError(409, "You have not started this test.", "not_started");
  if (a.submitted_at) throw new HttpError(409, "You have already handed in this test.", "submitted");
  if (Date.now() > a.expires_at.getTime() + graceMs) throw new HttpError(409, "Your time for this test is over.", "timed_out");
  return a;
}

/**
 * One judge request per attempt at a time, at most every few seconds. Atomic,
 * so two tabs or a double click cannot both get through.
 */
export async function claimJudgeSlot(ctx: CandidateCtx, a: AttemptDoc, gapMs = 3000) {
  const now = new Date();
  const res = await ctx.d.collection<AttemptDoc>("attempts").updateOne(
    {
      _id: a._id,
      submitted_at: null,
      $or: [{ last_judge_at: null }, { last_judge_at: { $lt: new Date(now.getTime() - gapMs) } }],
    },
    { $set: { last_judge_at: now } },
  );
  if (!res.matchedCount) throw new HttpError(429, "Your previous run is still being judged. Try again in a moment.");
}

/**
 * Add violations to an attempt, ATOMICALLY de-duplicated.
 *
 * The client re-sends its whole list (on every new strike, on a 15 s timer,
 * and with the hand-in), so the same violation often arrives in two requests
 * at once. A read-then-push let both through and stored it twice; the live
 * proctoring test caught 6 stored for 5 shown. $addToSet compares the whole
 * (normalised) entry inside the database, so each one is stored once however
 * the requests race, and the count is recomputed from the array itself.
 */
export async function mergeViolations(d: Db, attemptId: ObjectId, list: Violation[]): Promise<number> {
  const attempts = d.collection<AttemptDoc>("attempts");
  if (list.length) {
    const clean = list.slice(0, 500).map((v) => ({ id: v.id, type: v.type, description: v.description, timestamp: v.timestamp }));
    await attempts.updateOne({ _id: attemptId }, { $addToSet: { violations: { $each: clean } } });
  }
  await attempts.updateOne({ _id: attemptId }, [{ $set: { violation_count: { $size: { $ifNull: ["$violations", []] } } } }]);
  const a = await attempts.findOne({ _id: attemptId }, { projection: { violation_count: 1 } });
  return a?.violation_count ?? 0;
}

export { HAND_IN_GRACE_MS };
