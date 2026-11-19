import { requireUser, type UserDoc } from "@/lib/server/auth";
import { db, oid } from "@/lib/server/db";
import { handle, ok } from "@/lib/server/http";
import type { TestDoc } from "@/lib/server/models";

export const dynamic = "force-dynamic";

/**
 * Raw submission log for CSV export (Reports > Submissions): every Submit a
 * candidate made, filterable by test, date range and search. Code is included
 * only when asked, because it makes the file large.
 */
export const GET = handle(async (req: Request) => {
  await requireUser("admin");
  const url = new URL(req.url);
  const test = oid(url.searchParams.get("test") || "");
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");
  const q = (url.searchParams.get("q") || "").trim().toLowerCase();
  const withCode = url.searchParams.get("code") === "1";
  const limit = Math.min(20_000, Math.max(1, Number(url.searchParams.get("limit")) || 5000));
  const d = await db();

  const match: Record<string, unknown> = {};
  if (test) match.test_id = test;
  if (from || to) {
    match.at = {
      ...(from ? { $gte: new Date(from) } : {}),
      ...(to ? { $lte: new Date(new Date(to).getTime() + 86400_000 - 1) } : {}),
    };
  }
  const subs = await d.collection("submissions")
    .find(match, withCode ? {} : { projection: { code: 0 } })
    .sort({ at: -1 })
    .limit(limit)
    .toArray();
  const [users, tests] = await Promise.all([
    d.collection<UserDoc>("users").find({ _id: { $in: subs.map((s) => s.user_id) } }, { projection: { name: 1, username: 1, email: 1 } }).toArray(),
    d.collection<TestDoc>("tests").find({ _id: { $in: subs.map((s) => s.test_id) } }, { projection: { title: 1, problems: 1 } }).toArray(),
  ]);
  const u = new Map(users.map((x) => [String(x._id), x]));
  const t = new Map(tests.map((x) => [String(x._id), x]));
  const rows = subs.map((s) => {
    const user = u.get(String(s.user_id));
    const tst = t.get(String(s.test_id));
    const prob = tst?.problems.find((p) => p.id === s.problem_id);
    return {
      at: (s.at as Date).toISOString(),
      name: user?.name ?? "",
      username: user?.username ?? "",
      email: user?.email ?? "",
      test: tst?.title ?? "",
      problem: prob?.title ?? s.problem_id,
      difficulty: prob?.difficulty ?? "",
      language: s.language,
      status: s.status,
      passed: s.passed,
      total: s.total,
      marks_obtained: s.marks_obtained,
      marks: prob?.marks ?? 0,
      ...(withCode ? { code: s.code } : {}),
    };
  }).filter((r) => !q || `${r.name} ${r.username} ${r.email} ${r.test} ${r.problem}`.toLowerCase().includes(q));
  return ok({ rows, tests: tests.map((x) => ({ id: String(x._id), title: x.title })) });
});
