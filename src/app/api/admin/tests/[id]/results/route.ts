import { requireUser } from "@/lib/server/auth";
import { db, oid } from "@/lib/server/db";
import { handle, HttpError, ok } from "@/lib/server/http";
import type { TestDoc } from "@/lib/server/models";
import { getSettings } from "@/lib/server/settings";
import { buildSheet } from "@/lib/server/sheet";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/** The result sheet / live board for one test. Polled while the test is live. */
export const GET = handle(async (_req: Request, ctx: Ctx) => {
  await requireUser("admin");
  const id = oid((await ctx.params).id);
  if (!id) throw new HttpError(404, "Test not found.");
  const d = await db();
  const test = await d.collection<TestDoc>("tests").findOne({ _id: id });
  if (!test) throw new HttpError(404, "Test not found.");
  const { pass_mark } = await getSettings();
  const now = new Date();
  return ok({ server_time: now.toISOString(), ...(await buildSheet(d, test, pass_mark, now)) });
});
