import { candidateTest } from "@/lib/server/candidate";
import { handle, ok } from "@/lib/server/http";
import { normalizeProctoring } from "@/lib/shared/proctoring";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/** Polled mid-test so an admin's change to the settings reaches a running test. */
export const GET = handle(async (_req: Request, ctx: Ctx) => {
  const c = await candidateTest((await ctx.params).id);
  return ok({ proctoring: normalizeProctoring(c.test.proctoring), proctored: c.test.proctored });
});
