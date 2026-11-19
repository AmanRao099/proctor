import { candidateTest } from "@/lib/server/candidate";
import { handle, ok } from "@/lib/server/http";
import { attemptState, testWindow, totalMarks, type AttemptDoc } from "@/lib/server/models";
import { cameraRequired, normalizeProctoring } from "@/lib/shared/proctoring";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/** What the system-check screen needs before the paper is opened. No problems. */
export const GET = handle(async (_req: Request, ctx: Ctx) => {
  const c = await candidateTest((await ctx.params).id);
  const a = await c.d.collection<AttemptDoc>("attempts").findOne(
    { test_id: c.test._id, user_id: c.userId },
    { projection: { code: 0, best: 0 } },
  );
  const now = new Date();
  const proctoring = normalizeProctoring(c.test.proctoring);
  const state = attemptState(a, now);
  const window = testWindow(c.test, now);
  return ok({
    server_time: now.toISOString(),
    test: {
      id: String(c.test._id),
      title: c.test.title,
      instructions: c.test.instructions,
      duration_minutes: c.test.duration_minutes,
      starts_at: c.test.starts_at.toISOString(),
      ends_at: c.test.ends_at.toISOString(),
      problem_count: c.test.problems.length,
      total_marks: totalMarks(c.test),
      proctored: c.test.proctored,
      camera_required: cameraRequired(c.test.proctored, proctoring),
      window,
      state,
      can_start: window === "live" && (state === "not_started" || state === "in_progress"),
    },
    proctoring,
  });
});
