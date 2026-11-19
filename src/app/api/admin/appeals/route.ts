import { requireUser, type UserDoc } from "@/lib/server/auth";
import { db } from "@/lib/server/db";
import { handle, ok } from "@/lib/server/http";
import type { AppealDoc, StrikeDoc } from "@/lib/server/lockout";
import type { TestDoc } from "@/lib/server/models";

export const dynamic = "force-dynamic";

/** Ban appeals with the strike history beside each one: judging an appeal blind is guessing. */
export const GET = handle(async (req: Request) => {
  await requireUser("admin");
  const status = new URL(req.url).searchParams.get("status") || "pending";
  const d = await db();
  const appeals = await d.collection<AppealDoc>("ban_appeals")
    .find(status === "all" ? {} : { status: status as AppealDoc["status"] })
    .sort({ created_at: -1 })
    .limit(500)
    .toArray();
  const userIds = appeals.map((a) => a.user_id);
  const [users, strikes] = await Promise.all([
    d.collection<UserDoc>("users").find({ _id: { $in: userIds } }, { projection: { name: 1, username: 1, email: 1 } }).toArray(),
    d.collection<StrikeDoc>("proctor_strikes").find({ user_id: { $in: userIds } }).sort({ occurred_at: -1 }).toArray(),
  ]);
  const tests = await d.collection<TestDoc>("tests").find({ _id: { $in: strikes.map((s) => s.test_id) } }, { projection: { title: 1 } }).toArray();
  const title = new Map(tests.map((t) => [String(t._id), t.title]));
  const userById = new Map(users.map((u) => [String(u._id), u]));
  return ok({
    appeals: appeals.map((a) => ({
      id: String(a._id),
      user_id: String(a.user_id),
      name: userById.get(String(a.user_id))?.name ?? "",
      username: userById.get(String(a.user_id))?.username ?? "",
      email: userById.get(String(a.user_id))?.email ?? "",
      message: a.message,
      status: a.status,
      strike_count: a.strike_count,
      created_at: a.created_at.toISOString(),
      resolved_at: a.resolved_at?.toISOString() ?? null,
      admin_note: a.admin_note ?? "",
      strikes: strikes.filter((s) => s.user_id.equals(a.user_id)).map((s) => ({
        occurred_at: s.occurred_at.toISOString(),
        test: title.get(String(s.test_id)) ?? "",
        violation_count: s.violation_count,
        violation_types: s.violation_types,
        forgiven: !!s.forgiven_at,
      })),
    })),
  });
});
