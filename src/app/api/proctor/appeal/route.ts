import { MongoServerError } from "mongodb";
import { z } from "zod";
import { requireUser } from "@/lib/server/auth";
import { db, oid } from "@/lib/server/db";
import { body, handle, HttpError, ok } from "@/lib/server/http";
import { lockoutStatus } from "@/lib/server/lockout";

const schema = z.object({ message: z.string().trim().min(20, "Write at least a couple of sentences").max(2000) });

/** A barred candidate asks for proctored tests back. One open appeal at a time. */
export const POST = handle(async (req: Request) => {
  const user = await requireUser("candidate");
  const userId = oid(user.id)!;
  const d = await db();
  const status = await lockoutStatus(d, userId);
  if (!status.banned) throw new HttpError(409, "Your account is not barred, so there is nothing to appeal.");
  if (!status.can_appeal) throw new HttpError(409, "You already have an appeal waiting for a decision.");
  const { message } = await body(req, schema);
  try {
    await d.collection("ban_appeals").insertOne({
      user_id: userId,
      message,
      status: "pending",
      strike_count: status.strike_count,
      created_at: new Date(),
    });
  } catch (err) {
    if (err instanceof MongoServerError && err.code === 11000) throw new HttpError(409, "You already have an appeal waiting for a decision.");
    throw err;
  }
  return ok({}, { status: 201 });
});
