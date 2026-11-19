import { requireUser, type UserDoc } from "@/lib/server/auth";
import { db } from "@/lib/server/db";
import { handle, ok } from "@/lib/server/http";
import { scoreOf, type AttemptDoc, type TestDoc } from "@/lib/server/models";

export const dynamic = "force-dynamic";

/** A heartbeat older than this reads as "no signal": tab closed, laptop asleep, network gone. */
const SIGNAL_MS = 45_000;

/**
 * Active Students: everyone writing a test right now, with what the proctor
 * sees (camera, fullscreen, focus, face) from their last heartbeat, plus the
 * candidates signed in recently who are not in a test.
 */
export const GET = handle(async () => {
  await requireUser("admin");
  const d = await db();
  const now = new Date();
  const open = await d.collection<AttemptDoc>("attempts")
    .find({ submitted_at: null, expires_at: { $gt: now } }, { projection: { code: 0, "best.code": 0 } })
    .toArray();
  const [tests, users, recentLogins] = await Promise.all([
    d.collection<TestDoc>("tests").find({ _id: { $in: [...new Set(open.map((a) => a.test_id))] } }, { projection: { title: 1, problems: 1 } }).toArray(),
    d.collection<UserDoc>("users").find({ _id: { $in: open.map((a) => a.user_id) } }, { projection: { name: 1, username: 1, email: 1 } }).toArray(),
    d.collection<UserDoc>("users")
      .find({ role: "candidate", last_login_at: { $gte: new Date(now.getTime() - 30 * 60_000) } }, { projection: { name: 1, username: 1, last_login_at: 1 } })
      .sort({ last_login_at: -1 })
      .limit(200)
      .toArray(),
  ]);
  const testById = new Map(tests.map((t) => [String(t._id), t]));
  const userById = new Map(users.map((u) => [String(u._id), u]));
  const writingIds = new Set(open.map((a) => String(a.user_id)));

  const writing = open.map((a) => {
    const t = testById.get(String(a.test_id));
    const u = userById.get(String(a.user_id));
    const s = t ? scoreOf(a, t) : null;
    const p = a.presence;
    const signal = !!p && now.getTime() - p.at.getTime() < SIGNAL_MS;
    const last = a.violations?.[a.violations.length - 1] ?? null;
    return {
      attempt_id: String(a._id),
      test_id: String(a.test_id),
      test: t?.title ?? "",
      user_id: String(a.user_id),
      name: u?.name ?? "",
      username: u?.username ?? "",
      started_at: a.started_at.toISOString(),
      remaining_seconds: Math.max(0, Math.round((a.expires_at.getTime() - now.getTime()) / 1000)),
      problem: p && t ? `${p.current_index + 1}. ${t.problems[p.current_index]?.title ?? ""}` : "",
      marks_obtained: s?.marks_obtained ?? 0,
      total_marks: s?.total_marks ?? 0,
      solved: s?.solved ?? 0,
      problem_count: s?.count ?? 0,
      violation_count: a.violations?.length ?? 0,
      last_violation: last,
      signal,
      last_seen: p?.at.toISOString() ?? null,
      camera_live: p?.camera_live ?? null,
      fullscreen: p?.fullscreen ?? null,
      focused: p?.focused ?? null,
      face_status: p?.face_status ?? null,
    };
  }).sort((x, y) => Number(x.signal) - Number(y.signal) || y.violation_count - x.violation_count || x.name.localeCompare(y.name));

  return ok({
    server_time: now.toISOString(),
    writing,
    online: recentLogins
      .filter((u) => !writingIds.has(String(u._id)))
      .map((u) => ({ user_id: String(u._id), name: u.name, username: u.username, last_login_at: u.last_login_at?.toISOString() ?? null })),
  });
});
