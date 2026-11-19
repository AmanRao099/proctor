import { requireUser } from "@/lib/server/auth";
import { handle, ok } from "@/lib/server/http";
import { judge0About } from "@/lib/server/judge0";

export const dynamic = "force-dynamic";

export const GET = handle(async () => {
  await requireUser("admin");
  return ok({ judge0: await judge0About() });
});
