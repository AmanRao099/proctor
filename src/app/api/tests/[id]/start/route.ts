import { MongoServerError } from "mongodb";
import { candidateTest } from "@/lib/server/candidate";
import { handle, HttpError, ok } from "@/lib/server/http";
import { testWindow, toPaperProblem, type AttemptDoc } from "@/lib/server/models";
import { normalizeProctoring } from "@/lib/shared/proctoring";
import type { PaperResponse } from "@/lib/shared/types";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/**
 * Open the paper. The first call creates the attempt and starts the clock; a
 * later call (a reload, a crash) resumes it with what is LEFT, never a fresh
 * allowance. The clock ends at the test window's end at the latest.
 */
export const POST = handle(async (req: Request, ctx: Ctx) => {
  const c = await candidateTest((await ctx.params).id);
  const attempts = c.d.collection<AttemptDoc>("attempts");
  const now = new Date();

  let a = await attempts.findOne({ test_id: c.test._id, user_id: c.userId });
  if (!a) {
    const window = testWindow(c.test, now);
    if (window === "upcoming") throw new HttpError(409, "This test has not opened yet.", "upcoming");
    if (window === "ended") throw new HttpError(409, "This test has closed.", "ended");
    const fresh: Omit<AttemptDoc, "_id"> = {
      test_id: c.test._id,
      user_id: c.userId,
      started_at: now,
      expires_at: new Date(Math.min(now.getTime() + c.test.duration_minutes * 60_000, c.test.ends_at.getTime())),
      submitted_at: null,
      code: {},
      language: {},
      current_index: 0,
      best: {},
      submit_counts: {},
      violations: [],
      violation_count: 0,
      auto_submitted: false,
      submitted_due_to_violation: false,
      last_judge_at: null,
      user_agent: (req.headers.get("user-agent") || "").slice(0, 300),
    };
    try {
      const res = await attempts.insertOne(fresh as AttemptDoc);
      a = { ...fresh, _id: res.insertedId } as AttemptDoc;
    } catch (err) {
      // Two tabs raced; the unique index let one through. Use that one.
      if (!(err instanceof MongoServerError && err.code === 11000)) throw err;
      a = await attempts.findOne({ test_id: c.test._id, user_id: c.userId });
      if (!a) throw err;
    }
  }

  if (a.submitted_at) throw new HttpError(409, "You have already handed in this test.", "submitted");
  const remaining = Math.floor((a.expires_at.getTime() - now.getTime()) / 1000);
  if (remaining <= 0) throw new HttpError(409, "Your time for this test is over.", "timed_out");

  const best: PaperResponse["progress"]["best"] = {};
  for (const [pid, b] of Object.entries(a.best || {})) {
    best[pid] = { marks_obtained: b.marks_obtained, passed: b.passed, total: b.total, language: b.language, at: b.at.toISOString() };
  }

  const paper: PaperResponse = {
    test: {
      id: String(c.test._id),
      title: c.test.title,
      instructions: c.test.instructions,
      duration_minutes: c.test.duration_minutes,
      proctored: c.test.proctored,
      show_results: c.test.show_results,
      ends_at: c.test.ends_at.toISOString(),
      started_at: a.started_at.toISOString(),
      expires_at: a.expires_at.toISOString(),
      remaining_seconds: remaining,
    },
    proctoring: normalizeProctoring(c.test.proctoring),
    problems: c.test.problems.map(toPaperProblem),
    progress: {
      code: a.code || {},
      language: a.language || {},
      current_index: a.current_index || 0,
      best,
      violations: a.violations || [],
    },
    server_time: now.toISOString(),
  };
  return ok(paper);
});
