import { requireUser } from "@/lib/server/auth";
import { db, oid } from "@/lib/server/db";
import { handle, ok } from "@/lib/server/http";
import { describeLockout, lockoutStatus } from "@/lib/server/lockout";

export const dynamic = "force-dynamic";

/** Whether this candidate may start a proctored test now. The server decides. */
export const GET = handle(async () => {
  const user = await requireUser("candidate");
  const status = await lockoutStatus(await db(), oid(user.id)!);
  return ok({ lockout: status, message: status.allowed ? "" : describeLockout(status) });
});
