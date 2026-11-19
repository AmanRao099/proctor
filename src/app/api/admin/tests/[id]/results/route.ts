import { requireUser, type UserDoc } from "@/lib/server/auth";
import { db, ObjectId, oid } from "@/lib/server/db";
import { handle, HttpError, ok } from "@/lib/server/http";
import { attemptState, scoreOf, testWindow, totalMarks, type AttemptDoc, type TestDoc } from "@/lib/server/models";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/**
 * The result sheet: every assigned candidate, attempted or not, ranked by
 * marks then by how early they handed in. Polled by the live board.
 */
export const GET = handle(async (_req: Request, ctx: Ctx) => {
  await requireUser("admin");
  const id = oid((await ctx.params).id);
  if (!id) throw new HttpError(404, "Test not found.");
  const d = await db();
  const test = await d.collection<TestDoc>("tests").findOne({ _id: id });
  if (!test) throw new HttpError(404, "Test not found.");

  const attempts = await d.collection<AttemptDoc>("attempts")
    .find({ test_id: id }, { projection: { code: 0, "best.code": 0 } })
    .toArray();
  const userIds: ObjectId[] = test.assign_all
    ? attempts.map((a) => a.user_id)
    : Array.from(new Map([...test.candidate_ids, ...attempts.map((a) => a.user_id)].map((u) => [String(u), u])).values());
  const users = await d.collection<UserDoc>("users")
    .find({ _id: { $in: userIds } }, { projection: { username: 1, name: 1, email: 1 } })
    .toArray();
  const userById = new Map(users.map((u) => [String(u._id), u]));
  const attemptByUser = new Map(attempts.map((a) => [String(a.user_id), a]));

  const now = new Date();
  const rows = userIds.map((uid) => {
    const u = userById.get(String(uid));
    const a = attemptByUser.get(String(uid)) ?? null;
    const score = a ? scoreOf(a, test) : null;
    return {
      user_id: String(uid),
      attempt_id: a ? String(a._id) : null,
      name: u?.name ?? "(deleted)",
      username: u?.username ?? "",
      email: u?.email ?? "",
      state: attemptState(a, now),
      marks_obtained: score?.marks_obtained ?? 0,
      percent: score?.percent ?? 0,
      solved: score?.solved ?? 0,
      problems: test.problems.map((p) => {
        const b = a?.best?.[p.id];
        return {
          problem_id: p.id,
          marks_obtained: b?.marks_obtained ?? 0,
          passed: b?.passed ?? 0,
          total: b?.total ?? 0,
          language: b?.language ?? null,
          submissions: a?.submit_counts?.[p.id] ?? 0,
        };
      }),
      violation_count: a?.violation_count ?? 0,
      auto_submitted: !!a?.auto_submitted,
      started_at: a?.started_at.toISOString() ?? null,
      submitted_at: a?.submitted_at?.toISOString() ?? null,
      time_spent_seconds: a
        ? Math.round(((a.submitted_at ?? (now < a.expires_at ? now : a.expires_at)).getTime() - a.started_at.getTime()) / 1000)
        : 0,
    };
  });

  rows.sort((x, y) => {
    if (x.state === "not_started" && y.state !== "not_started") return 1;
    if (y.state === "not_started" && x.state !== "not_started") return -1;
    if (y.marks_obtained !== x.marks_obtained) return y.marks_obtained - x.marks_obtained;
    return x.time_spent_seconds - y.time_spent_seconds;
  });
  let rank = 0;
  const ranked = rows.map((r, i) => {
    if (r.state !== "not_started") rank = i + 1;
    return { ...r, rank: r.state === "not_started" ? null : rank };
  });

  return ok({
    server_time: now.toISOString(),
    test: {
      id: String(test._id),
      title: test.title,
      window: testWindow(test, now),
      starts_at: test.starts_at.toISOString(),
      ends_at: test.ends_at.toISOString(),
      duration_minutes: test.duration_minutes,
      total_marks: totalMarks(test),
      problems: test.problems.map((p) => ({ id: p.id, title: p.title, marks: p.marks })),
    },
    summary: {
      assigned: test.assign_all ? null : test.candidate_ids.length,
      started: attempts.length,
      in_progress: ranked.filter((r) => r.state === "in_progress").length,
      submitted: ranked.filter((r) => r.state === "submitted").length,
      flagged: ranked.filter((r) => r.violation_count > 0).length,
    },
    rows: ranked,
  });
});
