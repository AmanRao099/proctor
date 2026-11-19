import { z } from "zod";
import { candidateTest, HAND_IN_GRACE_MS, mergeViolations, openAttempt } from "@/lib/server/candidate";
import { body, handle, HttpError, ok } from "@/lib/server/http";
import { judge } from "@/lib/server/judge";
import { lockoutStatus, recordStrike } from "@/lib/server/lockout";
import { followupCorrect, scoreOf, type AttemptDoc, type BestDoc } from "@/lib/server/models";
import { isLanguage } from "@/lib/shared/languages";
import { normalizeProctoring } from "@/lib/shared/proctoring";

type Ctx = { params: Promise<{ id: string }> };

const schema = z.object({
  code: z.record(z.string(), z.object({ language: z.string(), code: z.string().max(100_000) })),
  violations: z.array(z.object({
    id: z.string().max(40),
    type: z.enum(["CRITICAL", "WARNING"]),
    description: z.string().max(300),
    timestamp: z.string().max(40),
  })).max(500).default([]),
  auto_submitted: z.boolean().default(false),
  submitted_due_to_violation: z.boolean().default(false),
  /** Reply to the test's follow-up question. Optional: a timer or the proctor hands in with nobody to answer. */
  followup_answer: z.string().max(200).optional(),
});

/**
 * Hand in. Claimed atomically FIRST, so a double hand-in (timer and button,
 * two tabs) files once. Then each problem's final code is judged if it differs
 * from that problem's best submission; it can only raise the score.
 */
export const POST = handle(async (req: Request, ctx: Ctx) => {
  const c = await candidateTest((await ctx.params).id);
  const a = await openAttempt(c, HAND_IN_GRACE_MS);
  const input = await body(req, schema);
  const attempts = c.d.collection<AttemptDoc>("attempts");
  const now = new Date();

  const given = (input.followup_answer ?? "").split(/\s+/).join(" ").trim().slice(0, 100);
  const followup = c.test.followup && given
    ? { answer: given, correct: followupCorrect(given, c.test.followup.answer) }
    : null;
  const claim = await attempts.updateOne(
    { _id: a._id, submitted_at: null },
    {
      $set: {
        submitted_at: now,
        auto_submitted: input.auto_submitted,
        submitted_due_to_violation: input.submitted_due_to_violation,
        followup,
      },
    } as never,
  );
  if (!claim.matchedCount) throw new HttpError(409, "You have already handed in this test.", "submitted");

  // A hand-in the proctor forced is a strike on the lockout ladder. The
  // server's own violation count must agree it reached the limit, so a client
  // cannot file a strike against itself by accident (or skip one by lying the
  // other way: the count is the server's, not the flag's).
  const violationCount = await mergeViolations(c.d, a._id, input.violations);
  const stored = await attempts.findOne({ _id: a._id }, { projection: { violations: 1 } });
  const allViolations = stored?.violations ?? [];
  const limit = normalizeProctoring(c.test.proctoring).max_violations;
  let lockout = null;
  if (c.test.proctored && input.submitted_due_to_violation && violationCount >= limit) {
    await recordStrike(c.d, {
      userId: c.userId,
      testId: c.test._id,
      attemptId: a._id,
      violationCount,
      violationTypes: allViolations.map((v) => v.description),
    });
    lockout = await lockoutStatus(c.d, c.userId);
  }

  // Judge final code that was never submitted as-is. Sequential on purpose:
  // the Judge0 box is shared and a whole room hands in at the same second.
  const updates: Record<string, unknown> = {};
  const best: Record<string, BestDoc> = { ...(a.best || {}) };
  for (const problem of c.test.problems) {
    const entry = input.code[problem.id];
    if (!entry || !isLanguage(entry.language) || !problem.languages.includes(entry.language)) continue;
    const code = entry.code;
    updates[`code.${problem.id}.${entry.language}`] = code;
    updates[`language.${problem.id}`] = entry.language;
    const starter = (problem.starter?.[entry.language] ?? "").trim();
    if (!code.trim() || code.trim() === starter) continue;
    const prev = best[problem.id];
    if (prev && prev.code === code && prev.language === entry.language) continue;
    if (prev && prev.total > 0 && prev.passed === prev.total) continue;
    try {
      const result = await judge(problem, code, entry.language, "all");
      if (result.status !== "judge_error" && (!prev || result.marks_obtained > prev.marks_obtained)) {
        best[problem.id] = {
          marks_obtained: result.marks_obtained,
          passed: result.passed,
          total: result.total,
          language: entry.language,
          code,
          at: now,
        };
        updates[`best.${problem.id}`] = best[problem.id];
        updates.last_improved_at = now;
      }
    } catch (err) {
      // The hand-in already counts; a runner failure only means the last
      // unsubmitted edit is kept for review without a score.
      console.error("[finish] judge failed", (err as Error).message);
    }
  }

  const final = scoreOf({ ...a, best } as AttemptDoc, c.test);
  await attempts.updateOne({ _id: a._id }, { $set: { ...updates, final } });

  if (!c.test.show_results) return ok({ results_hidden: true, result: null, lockout });
  return ok({
    lockout,
    results_hidden: false,
    result: {
      ...final,
      problems: c.test.problems.map((p) => ({
        id: p.id,
        title: p.title,
        marks: p.marks,
        marks_obtained: best[p.id]?.marks_obtained ?? 0,
        passed: best[p.id]?.passed ?? 0,
        total: best[p.id]?.total ?? p.cases.length,
      })),
    },
  });
});
