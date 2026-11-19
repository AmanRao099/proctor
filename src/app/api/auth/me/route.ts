import { requireUser } from "@/lib/server/auth";
import { handle, ok } from "@/lib/server/http";

export const dynamic = "force-dynamic";

export const GET = handle(async () => {
  const user = await requireUser();
  return ok({ user, server_time: new Date().toISOString() });
});
