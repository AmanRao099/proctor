import { requireUser } from "@/lib/server/auth";
import { handle, ok, body } from "@/lib/server/http";
import { getSettings, normalizeSettings, saveSettings } from "@/lib/server/settings";
import { z } from "zod";
import { db } from "@/lib/server/db";

export const dynamic = "force-dynamic";

export const GET = handle(async () => {
  await requireUser("admin");
  return ok({ settings: await getSettings() });
});

export const PUT = handle(async (req: Request) => {
  await requireUser("admin");
  const raw = await body(req, z.record(z.string(), z.unknown()));
  const next = normalizeSettings(raw);
  await saveSettings(next);
  let applied = 0;
  // Optionally push the default proctoring onto every test that has not
  // ended yet. Running tests pick it up within 30 s (the candidate page polls).
  if (raw.apply_to_tests === true) {
    const d = await db();
    const res = await d.collection("tests").updateMany(
      { ends_at: { $gt: new Date() } },
      { $set: { proctoring: next.default_proctoring, updated_at: new Date() } },
    );
    applied = res.modifiedCount;
  }
  return ok({ settings: next, applied });
});
