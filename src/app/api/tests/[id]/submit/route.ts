import { z } from "zod";
import { candidateTest, claimJudgeSlot, openAttempt } from "@/lib/server/candidate";
import { body, handle, HttpError, ok } from "@/lib/server/http";
import { judge } from "@/lib/server/judge";
import { Judge0Error } from "@/lib/server/judge0";
import type { AttemptDoc } from "@/lib/server/models";
import { isLanguage } from "@/lib/shared/languages";

type Ctx = { params: Promise<{ id: string }> };

const schema = z.object({
  problem_id: z.string().max(40),
  language: z.string(),
  code: z.string().min(1, "Write some code first").max(100_000),
});

/**
 * Submit one problem: judged on every case, hidden ones included. The best
 * submission per problem is what scores; a worse later one never lowers it.
 */
export const POST = handle(async (req: Request, ctx: Ctx) => {
  const c = await candidateTest((await ctx.params).id);
  const a = await openAttempt(c);
  const input = await body(req, schema);
  const problem = c.test.problems.find((p) => p.id === input.problem_id);
  if (!problem) throw new HttpError(404, "Problem not found.");
  if (!isLanguage(input.language) || !problem.languages.includes(input.language)) {
    throw new HttpError(400, "That language is not allowed for this problem.");
  }
  await claimJudgeSlot(c, a);

  let result;
  try {
    result = await judge(problem, input.code, input.language, "all");
  } catch (err) {
    if (err instanceof Judge0Error) {
      console.error("[judge0]", err.message);
      throw new HttpError(503, "The code runner is busy or unreachable. Nothing was recorded; submit again in a moment.");
    }
    throw err;
  }

  const now = new Date();
  const attempts = c.d.collection<AttemptDoc>("attempts");
  // A runner failure is not a verdict: record nothing that could lower a score.
  const judged = result.status !== "judge_error";
  const prev = a.best?.[problem.id];
  const improves = judged && (!prev || result.marks_obtained > prev.marks_obtained);
  await attempts.updateOne(
    { _id: a._id, submitted_at: null },
    {
      $inc: { [`submit_counts.${problem.id}`]: 1 },
      $set: {
        [`code.${problem.id}.${input.language}`]: input.code,
        [`language.${problem.id}`]: input.language,
        ...(improves ? {
          last_improved_at: now,
          [`best.${problem.id}`]: {
            marks_obtained: result.marks_obtained,
            passed: result.passed,
            total: result.total,
            language: input.language,
            code: input.code,
            at: now,
          },
        } : {}),
      },
    },
  );
  await c.d.collection("submissions").insertOne({
    attempt_id: a._id,
    test_id: c.test._id,
    user_id: c.userId,
    problem_id: problem.id,
    language: input.language,
    code: input.code,
    status: result.status,
    passed: result.passed,
    total: result.total,
    marks_obtained: result.marks_obtained,
    at: now,
  });

  const best = improves
    ? { marks_obtained: result.marks_obtained, passed: result.passed, total: result.total, language: input.language, at: now.toISOString() }
    : prev ? { marks_obtained: prev.marks_obtained, passed: prev.passed, total: prev.total, language: prev.language, at: prev.at.toISOString() } : null;

  // With results withheld the candidate learns only that it was recorded (and
  // whether it compiled, which Run would have told them anyway).
  if (!c.test.show_results) {
    return ok({
      result: null,
      compile_output: result.compile_output ?? null,
      recorded: judged,
      best: null,
      withheld: true,
    });
  }
  return ok({ result, best, withheld: false });
});
