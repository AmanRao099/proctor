import { requireUser } from "@/lib/server/auth";
import { db, oid } from "@/lib/server/db";
import { body, handle, HttpError, ok } from "@/lib/server/http";
import { toAdminTest, type TestDoc } from "@/lib/server/models";
import { testSchema, toTestFields } from "@/lib/server/testSchema";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

async function load(idRaw: string) {
  const id = oid(idRaw);
  if (!id) throw new HttpError(404, "Test not found.");
  const d = await db();
  const test = await d.collection<TestDoc>("tests").findOne({ _id: id });
  if (!test) throw new HttpError(404, "Test not found.");
  return { d, test };
}

export const GET = handle(async (_req: Request, ctx: Ctx) => {
  await requireUser("admin");
  const { d, test } = await load((await ctx.params).id);
  const attempts = await d.collection("attempts").countDocuments({ test_id: test._id });
  return ok({ test: toAdminTest(test), attempts });
});

export const PUT = handle(async (req: Request, ctx: Ctx) => {
  await requireUser("admin");
  const { d, test } = await load((await ctx.params).id);
  const fields = toTestFields(await body(req, testSchema));
  await d.collection<TestDoc>("tests").updateOne(
    { _id: test._id },
    { $set: { ...fields, updated_at: new Date() } },
  );
  return ok({ id: String(test._id) });
});

export const DELETE = handle(async (_req: Request, ctx: Ctx) => {
  await requireUser("admin");
  const { d, test } = await load((await ctx.params).id);
  const attempts = await d.collection("attempts").countDocuments({ test_id: test._id });
  if (attempts > 0) {
    throw new HttpError(409, "Candidates have already attempted this test. Unpublish it instead of deleting it.");
  }
  await d.collection("tests").deleteOne({ _id: test._id });
  return ok({});
});
