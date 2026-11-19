import { requireUser, type UserDoc } from "@/lib/server/auth";
import { db, oid } from "@/lib/server/db";
import { handle, HttpError, ok } from "@/lib/server/http";
import { attemptState, scoreOf, type AttemptDoc, type TestDoc } from "@/lib/server/models";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/** One attempt in full: code per problem, best submission, the violation log. */
export const GET = handle(async (_req: Request, ctx: Ctx) => {
  await requireUser("admin");
  const id = oid((await ctx.params).id);
  if (!id) throw new HttpError(404, "Attempt not found.");
  const d = await db();
  const a = await d.collection<AttemptDoc>("attempts").findOne({ _id: id });
  if (!a) throw new HttpError(404, "Attempt not found.");
  const [test, user] = await Promise.all([
    d.collection<TestDoc>("tests").findOne({ _id: a.test_id }, { projection: { "problems.cases": 0 } }),
    d.collection<UserDoc>("users").findOne({ _id: a.user_id }, { projection: { username: 1, name: 1, email: 1 } }),
  ]);
  if (!test) throw new HttpError(404, "Test not found.");

  return ok({
    attempt: {
      id: String(a._id),
      state: attemptState(a),
      started_at: a.started_at.toISOString(),
      expires_at: a.expires_at.toISOString(),
      submitted_at: a.submitted_at?.toISOString() ?? null,
      auto_submitted: a.auto_submitted,
      submitted_due_to_violation: a.submitted_due_to_violation,
      user_agent: a.user_agent ?? "",
      score: scoreOf(a, test),
      violations: a.violations ?? [],
    },
    candidate: { name: user?.name ?? "", username: user?.username ?? "", email: user?.email ?? "" },
    problems: test.problems.map((p) => {
      const lang = a.best?.[p.id]?.language ?? a.language?.[p.id] ?? p.languages[0];
      const best = a.best?.[p.id];
      return {
        id: p.id,
        title: p.title,
        marks: p.marks,
        submissions: a.submit_counts?.[p.id] ?? 0,
        best: best ? {
          marks_obtained: best.marks_obtained,
          passed: best.passed,
          total: best.total,
          language: best.language,
          at: best.at.toISOString(),
          code: best.code,
        } : null,
        final_language: a.language?.[p.id] ?? lang,
        final_code: a.code?.[p.id]?.[a.language?.[p.id] ?? lang] ?? "",
      };
    }),
  });
});

/** Let a candidate sit the test again: the attempt is removed, not edited. */
export const DELETE = handle(async (_req: Request, ctx: Ctx) => {
  await requireUser("admin");
  const id = oid((await ctx.params).id);
  if (!id) throw new HttpError(404, "Attempt not found.");
  const d = await db();
  const a = await d.collection<AttemptDoc>("attempts").findOneAndDelete({ _id: id });
  if (!a) throw new HttpError(404, "Attempt not found.");
  await d.collection("attempt_archive").insertOne({ ...a, archived_at: new Date() });
  return ok({});
});
