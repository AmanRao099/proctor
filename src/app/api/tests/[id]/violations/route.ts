import { z } from "zod";
import { candidateTest, HAND_IN_GRACE_MS, mergeViolations } from "@/lib/server/candidate";
import { body, handle, HttpError, ok } from "@/lib/server/http";
import type { AttemptDoc } from "@/lib/server/models";

type Ctx = { params: Promise<{ id: string }> };

const schema = z.object({
  violations: z.array(z.object({
    id: z.string().max(40),
    type: z.enum(["CRITICAL", "WARNING"]),
    description: z.string().max(300),
    timestamp: z.string().max(40),
  })).max(500),
});

/**
 * Strikes are sent as they happen, so a reload cannot wipe them. The client
 * sends its whole list; the server merges by id, so a resend is harmless.
 * Accepted even after hand-in (a strike that raced the submit still counts).
 */
export const POST = handle(async (req: Request, ctx: Ctx) => {
  const c = await candidateTest((await ctx.params).id);
  const attempts = c.d.collection<AttemptDoc>("attempts");
  const a = await attempts.findOne({ test_id: c.test._id, user_id: c.userId }, { projection: { violations: 1, expires_at: 1, submitted_at: 1 } });
  if (!a) throw new HttpError(409, "You have not started this test.");
  const late = Date.now() > a.expires_at.getTime() + HAND_IN_GRACE_MS
    && (!a.submitted_at || Date.now() > a.submitted_at.getTime() + HAND_IN_GRACE_MS);
  if (late) throw new HttpError(409, "This attempt is closed.");

  const { violations } = await body(req, schema);
  const recorded = await mergeViolations(c.d, a._id, violations);
  return ok({ recorded });
});
