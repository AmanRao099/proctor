import { requireUser } from "@/lib/server/auth";
import { db, ObjectId, oid } from "@/lib/server/db";
import { body, handle, ok } from "@/lib/server/http";
import { testWindow, totalMarks, type TestDoc } from "@/lib/server/models";
import { testSchema, toTestFields } from "@/lib/server/testSchema";

export const dynamic = "force-dynamic";

export const GET = handle(async () => {
  await requireUser("admin");
  const d = await db();
  const tests = await d.collection<TestDoc>("tests")
    .find({}, { projection: { "problems.cases": 0, "problems.statement": 0, "problems.starter": 0 } })
    .sort({ starts_at: -1 })
    .toArray();
  const counts = await d.collection("attempts").aggregate<{ _id: ObjectId; started: number; submitted: number }>([
    { $match: { test_id: { $in: tests.map((t) => t._id) } } },
    { $group: {
      _id: "$test_id",
      started: { $sum: 1 },
      submitted: { $sum: { $cond: [{ $ne: ["$submitted_at", null] }, 1, 0] } },
    } },
  ]).toArray();
  const byTest = new Map(counts.map((c) => [String(c._id), c]));
  const now = new Date();
  return ok({
    server_time: now.toISOString(),
    tests: tests.map((t) => ({
      id: String(t._id),
      title: t.title,
      status: t.status,
      window: testWindow(t, now),
      starts_at: t.starts_at.toISOString(),
      ends_at: t.ends_at.toISOString(),
      duration_minutes: t.duration_minutes,
      proctored: t.proctored,
      problem_count: t.problems.length,
      total_marks: totalMarks(t),
      assigned: t.assign_all ? "all" : (t.candidate_ids || []).length,
      started: byTest.get(String(t._id))?.started ?? 0,
      submitted: byTest.get(String(t._id))?.submitted ?? 0,
    })),
  });
});

export const POST = handle(async (req: Request) => {
  const admin = await requireUser("admin");
  const fields = toTestFields(await body(req, testSchema));
  const now = new Date();
  const doc = { ...fields, created_by: oid(admin.id)!, created_at: now, updated_at: now };
  const d = await db();
  const res = await d.collection("tests").insertOne(doc);
  return ok({ id: String(res.insertedId) }, { status: 201 });
});
