import { requireUser } from "@/lib/server/auth";
import { db, oid } from "@/lib/server/db";
import { handle, ok } from "@/lib/server/http";
import { describeLockout, lockoutStatus } from "@/lib/server/lockout";
import { attemptState, scoreOf, testWindow, totalMarks, type AttemptDoc, type TestDoc } from "@/lib/server/models";

export const dynamic = "force-dynamic";

/** The candidate's tests. `can_start` is decided here, on the server clock. */
export const GET = handle(async () => {
  const user = await requireUser("candidate");
  const userId = oid(user.id)!;
  const d = await db();
  const tests = await d.collection<TestDoc>("tests")
    .find(
      { status: "published", $or: [{ assign_all: true }, { candidate_ids: userId }] },
      { projection: { "problems.cases": 0, "problems.statement": 0, "problems.starter": 0 } },
    )
    .sort({ starts_at: 1 })
    .toArray();
  const attempts = await d.collection<AttemptDoc>("attempts")
    .find({ user_id: userId, test_id: { $in: tests.map((t) => t._id) } }, { projection: { code: 0, "best.code": 0 } })
    .toArray();
  const byTest = new Map(attempts.map((a) => [String(a.test_id), a]));
  const now = new Date();
  const lock = await lockoutStatus(d, userId, now);

  return ok({
    server_time: now.toISOString(),
    user,
    lockout: lock,
    lockout_message: lock.allowed ? "" : describeLockout(lock),
    tests: tests.map((t) => {
      const a = byTest.get(String(t._id)) ?? null;
      const state = attemptState(a, now);
      const window = testWindow(t, now);
      const score = a && t.show_results && state !== "in_progress" ? scoreOf(a, t) : null;
      return {
        id: String(t._id),
        title: t.title,
        window,
        state,
        starts_at: t.starts_at.toISOString(),
        ends_at: t.ends_at.toISOString(),
        duration_minutes: t.duration_minutes,
        problem_count: t.problems.length,
        total_marks: totalMarks(t),
        proctored: t.proctored,
        can_start: window === "live" && (state === "in_progress" || (state === "not_started" && (!t.proctored || lock.allowed))),
        score,
      };
    }),
  });
});
