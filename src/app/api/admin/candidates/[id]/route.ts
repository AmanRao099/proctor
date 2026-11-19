import { z } from "zod";
import { generatePassword, hashPassword, requireUser, unlockLogin, type UserDoc } from "@/lib/server/auth";
import { db, oid } from "@/lib/server/db";
import { body, handle, HttpError, ok } from "@/lib/server/http";

type Ctx = { params: Promise<{ id: string }> };

const patchSchema = z.object({
  disabled: z.boolean().optional(),
  reset_password: z.boolean().optional(),
  /** Lift login locks from wrong-password attempts. */
  unlock: z.boolean().optional(),
  name: z.string().trim().min(1).max(120).optional(),
});

/** Disable/enable, rename, or reset a password (returned once). Ends any live session. */
export const PATCH = handle(async (req: Request, ctx: Ctx) => {
  await requireUser("admin");
  const id = oid((await ctx.params).id);
  if (!id) throw new HttpError(404, "Candidate not found.");
  const input = await body(req, patchSchema);
  const d = await db();
  const set: Partial<UserDoc> = {};
  let password: string | undefined;
  if (input.name) set.name = input.name;
  if (input.disabled !== undefined) {
    set.disabled = input.disabled;
    if (input.disabled) set.sid = null;
  }
  if (input.reset_password) {
    password = generatePassword();
    set.password_hash = await hashPassword(password);
    set.sid = null;
  }
  const target = await d.collection<UserDoc>("users").findOne({ _id: id, role: "candidate" }, { projection: { username: 1 } });
  if (!target) throw new HttpError(404, "Candidate not found.");
  if (Object.keys(set).length) await d.collection<UserDoc>("users").updateOne({ _id: id }, { $set: set });
  if (input.unlock || input.reset_password) await unlockLogin(target.username);
  return ok({ password });
});

export const DELETE = handle(async (_req: Request, ctx: Ctx) => {
  await requireUser("admin");
  const id = oid((await ctx.params).id);
  if (!id) throw new HttpError(404, "Candidate not found.");
  const d = await db();
  if (await d.collection("attempts").countDocuments({ user_id: id })) {
    throw new HttpError(409, "This candidate has test attempts on record. Disable the account instead.");
  }
  await d.collection("users").deleteOne({ _id: id, role: "candidate" });
  await d.collection("tests").updateMany({}, { $pull: { candidate_ids: id } } as never);
  return ok({});
});
