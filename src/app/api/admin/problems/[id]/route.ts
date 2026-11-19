import { requireUser } from "@/lib/server/auth";
import { db, oid } from "@/lib/server/db";
import { body, handle, HttpError, ok } from "@/lib/server/http";
import { newId, problemSchema } from "@/lib/server/testSchema";

type Ctx = { params: Promise<{ id: string }> };

export const PUT = handle(async (req: Request, ctx: Ctx) => {
  await requireUser("admin");
  const id = oid((await ctx.params).id);
  if (!id) throw new HttpError(404, "Problem not found.");
  const p = await body(req, problemSchema);
  const d = await db();
  const { id: _ignored, ...fields } = p;
  const res = await d.collection("problems").updateOne(
    { _id: id, is_deleted: { $ne: true } },
    { $set: {
      ...fields,
      languages: Array.from(new Set(p.languages)),
      cases: p.cases.map((c) => ({ ...c, id: c.id || newId() })),
      updated_at: new Date(),
    } },
  );
  if (!res.matchedCount) throw new HttpError(404, "Problem not found.");
  return ok({});
});

/** Soft delete: tests that already copied it keep their copy. */
export const DELETE = handle(async (_req: Request, ctx: Ctx) => {
  await requireUser("admin");
  const id = oid((await ctx.params).id);
  if (!id) throw new HttpError(404, "Problem not found.");
  const d = await db();
  await d.collection("problems").updateOne({ _id: id }, { $set: { is_deleted: true, deleted_at: new Date() } });
  return ok({});
});
