import { z } from "zod";
import { candidateTest, openAttempt } from "@/lib/server/candidate";
import { body, handle, ok } from "@/lib/server/http";
import type { AttemptDoc } from "@/lib/server/models";
import { isLanguage } from "@/lib/shared/languages";

type Ctx = { params: Promise<{ id: string }> };

const schema = z.object({
  code: z.record(z.string(), z.record(z.string(), z.string().max(100_000))),
  language: z.record(z.string(), z.string()),
  current_index: z.number().int().min(0).max(100),
});

/** Autosave. Not a submission: nothing is judged, nothing scored. */
export const PUT = handle(async (req: Request, ctx: Ctx) => {
  const c = await candidateTest((await ctx.params).id);
  const a = await openAttempt(c);
  const input = await body(req, schema);
  const known = new Set(c.test.problems.map((p) => p.id));

  const set: Record<string, unknown> = { current_index: input.current_index };
  for (const [pid, byLang] of Object.entries(input.code)) {
    if (!known.has(pid)) continue;
    for (const [lang, code] of Object.entries(byLang)) {
      if (isLanguage(lang)) set[`code.${pid}.${lang}`] = code;
    }
  }
  for (const [pid, lang] of Object.entries(input.language)) {
    if (known.has(pid) && isLanguage(lang)) set[`language.${pid}`] = lang;
  }
  await c.d.collection<AttemptDoc>("attempts").updateOne({ _id: a._id, submitted_at: null }, { $set: set });
  return ok({ saved_at: new Date().toISOString() });
});
