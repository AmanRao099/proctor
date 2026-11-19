import { requireUser } from "@/lib/server/auth";
import { db } from "@/lib/server/db";
import { body, handle, ok } from "@/lib/server/http";
import { newId, problemSchema } from "@/lib/server/testSchema";

export const dynamic = "force-dynamic";

/**
 * The problem bank (DSA Master > Problems). Tests COPY a problem in when it is
 * added, so editing the bank never changes a test that is already scheduled
 * or running.
 */
export const GET = handle(async () => {
  await requireUser("admin");
  const d = await db();
  const rows = await d.collection("problems").find({ is_deleted: { $ne: true } }).sort({ created_at: -1 }).limit(2000).toArray();
  const used = await d.collection("tests").aggregate<{ _id: string; n: number }>([
    { $unwind: "$problems" },
    { $match: { "problems.source_id": { $in: rows.map((r) => String(r._id)) } } },
    { $group: { _id: "$problems.source_id", n: { $sum: 1 } } },
  ]).toArray();
  const usedBy = new Map(used.map((u) => [u._id, u.n]));
  return ok({
    problems: rows.map((r) => {
      const { _id, is_deleted: _del, ...rest } = r;
      return { ...rest, id: String(_id), used_in: usedBy.get(String(_id)) ?? 0 };
    }),
  });
});

export const POST = handle(async (req: Request) => {
  await requireUser("admin");
  const p = await body(req, problemSchema);
  const d = await db();
  const now = new Date();
  const res = await d.collection("problems").insertOne({
    ...p,
    id: undefined,
    languages: Array.from(new Set(p.languages)),
    cases: p.cases.map((c) => ({ ...c, id: c.id || newId() })),
    created_at: now,
    updated_at: now,
  });
  return ok({ id: String(res.insertedId) }, { status: 201 });
});
