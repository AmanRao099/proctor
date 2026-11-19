import { z } from "zod";
import { candidateTest, claimJudgeSlot, openAttempt } from "@/lib/server/candidate";
import { body, handle, HttpError, ok } from "@/lib/server/http";
import { judge, runCustom } from "@/lib/server/judge";
import { Judge0Error } from "@/lib/server/judge0";
import { isLanguage } from "@/lib/shared/languages";

type Ctx = { params: Promise<{ id: string }> };

const schema = z.object({
  problem_id: z.string().max(40),
  language: z.string(),
  code: z.string().min(1, "Write some code first").max(100_000),
  /** When set, run once with this input instead of the sample cases. */
  stdin: z.string().max(100_000).optional(),
});

/** Run against the visible sample cases (or custom input). Never scored. */
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
  try {
    if (input.stdin !== undefined) {
      return ok({ kind: "custom", result: await runCustom(problem, input.code, input.language, input.stdin) });
    }
    return ok({ kind: "samples", result: await judge(problem, input.code, input.language, "samples") });
  } catch (err) {
    if (err instanceof Judge0Error) {
      console.error("[judge0]", err.message);
      throw new HttpError(503, "The code runner is busy or unreachable. Your code is safe; try again in a moment.");
    }
    throw err;
  }
});
