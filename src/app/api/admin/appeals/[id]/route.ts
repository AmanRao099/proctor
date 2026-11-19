import { z } from "zod";
import { requireUser } from "@/lib/server/auth";
import { db, oid } from "@/lib/server/db";
import { body, handle, HttpError, ok } from "@/lib/server/http";
import type { AppealDoc } from "@/lib/server/lockout";

type Ctx = { params: Promise<{ id: string }> };

const schema = z.object({ status: z.enum(["approved", "rejected"]), admin_note: z.string().max(1000).default("") });

/**
 * Approve: every strike on the account is FORGIVEN (stamped, never deleted).
 * Reject: the ban stands and the candidate may appeal again.
 */
export const PATCH = handle(async (req: Request, ctx: Ctx) => {
  const admin = await requireUser("admin");
  const id = oid((await ctx.params).id);
  if (!id) throw new HttpError(404, "Appeal not found.");
  const input = await body(req, schema);
  const d = await db();
  const now = new Date();
  const appeal = await d.collection<AppealDoc>("ban_appeals").findOneAndUpdate(
    { _id: id, status: "pending" },
    { $set: { status: input.status, admin_note: input.admin_note, resolved_at: now, resolved_by: oid(admin.id) } },
  );
  if (!appeal) throw new HttpError(409, "This appeal was already decided.");
  if (input.status === "approved") {
    await d.collection("proctor_strikes").updateMany(
      { user_id: appeal.user_id, forgiven_at: null },
      { $set: { forgiven_at: now, forgiven_by_appeal: id } },
    );
  }
  return ok({});
});
