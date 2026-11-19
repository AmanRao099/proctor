import { z } from "zod";
import { candidateTest, openAttempt } from "@/lib/server/candidate";
import { body, handle, ok } from "@/lib/server/http";
import type { AttemptDoc } from "@/lib/server/models";

type Ctx = { params: Promise<{ id: string }> };

const schema = z.object({
  current_index: z.number().int().min(0).max(100),
  camera_live: z.boolean(),
  fullscreen: z.boolean(),
  focused: z.boolean(),
  face_status: z.string().max(20),
});

/**
 * Presence for the Active Students board, every 15 s while the paper is open.
 * Self-reported, so it is a monitoring aid and never evidence: the strikes
 * are what count. A candidate whose heartbeat stops shows as "no signal".
 */
export const POST = handle(async (req: Request, ctx: Ctx) => {
  const c = await candidateTest((await ctx.params).id);
  const a = await openAttempt(c);
  const input = await body(req, schema);
  await c.d.collection<AttemptDoc>("attempts").updateOne(
    { _id: a._id, submitted_at: null },
    { $set: { presence: { ...input, at: new Date() } } },
  );
  return ok({ server_time: new Date().toISOString() });
});
