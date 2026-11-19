import { requireUser } from "@/lib/server/auth";
import { db } from "@/lib/server/db";
import { handle, ok } from "@/lib/server/http";
import { scoreOf, testWindow, type AttemptDoc, type TestDoc } from "@/lib/server/models";
import { getSettings } from "@/lib/server/settings";

export const dynamic = "force-dynamic";

/** The screen /admin opens on: how the organisation is doing, at a glance. */
export const GET = handle(async () => {
  await requireUser("admin");
  const d = await db();
  const now = new Date();
  const dayAgo = new Date(now.getTime() - 86400_000);
  const weekAgo = new Date(now.getTime() - 7 * 86400_000);
  const { pass_mark } = await getSettings();

  const [candidates, activeToday, newThisWeek, tests, attempts, pendingAppeals] = await Promise.all([
    d.collection("users").countDocuments({ role: "candidate" }),
    d.collection("users").countDocuments({ role: "candidate", last_login_at: { $gte: dayAgo } }),
    d.collection("users").countDocuments({ role: "candidate", created_at: { $gte: weekAgo } }),
    d.collection<TestDoc>("tests").find({}, { projection: { "problems.cases": 0, "problems.statement": 0, "problems.starter": 0 } }).toArray(),
    d.collection<AttemptDoc>("attempts").find({}, { projection: { code: 0, "best.code": 0, violations: 0 } }).toArray(),
    d.collection("ban_appeals").countDocuments({ status: "pending" }),
  ]);
  const testById = new Map(tests.map((t) => [String(t._id), t]));
  const users = await d.collection("users")
    .find({ _id: { $in: attempts.map((a) => a.user_id) } }, { projection: { name: 1, username: 1 } })
    .toArray();
  const nameOf = new Map(users.map((u) => [String(u._id), u as unknown as { name: string; username: string }]));

  const finished = attempts.filter((a) => a.submitted_at || a.expires_at <= now);
  const percents = finished.map((a) => {
    const t = testById.get(String(a.test_id));
    return t ? scoreOf(a, t).percent : 0;
  });
  const passed = percents.filter((p) => p >= pass_mark).length;

  const published = tests.filter((t) => t.status === "published");
  const live = published.filter((t) => testWindow(t, now) === "live");
  const upcoming = published.filter((t) => testWindow(t, now) === "upcoming").sort((a, b) => +a.starts_at - +b.starts_at);

  const recent = attempts
    .filter((a) => a.submitted_at)
    .sort((a, b) => +b.submitted_at! - +a.submitted_at!)
    .slice(0, 8)
    .map((a) => {
      const t = testById.get(String(a.test_id));
      const s = t ? scoreOf(a, t) : null;
      return {
        attempt_id: String(a._id),
        test_id: String(a.test_id),
        test: t?.title ?? "",
        name: nameOf.get(String(a.user_id))?.name ?? "",
        username: nameOf.get(String(a.user_id))?.username ?? "",
        marks_obtained: s?.marks_obtained ?? 0,
        total_marks: s?.total_marks ?? 0,
        percent: s?.percent ?? 0,
        violation_count: a.violation_count ?? 0,
        auto_submitted: !!a.auto_submitted,
        submitted_at: a.submitted_at!.toISOString(),
      };
    });

  // Hand-ins per day for the last 14 days (server-local calendar days).
  const days: { date: string; hand_ins: number; average: number }[] = [];
  const dayStart = new Date(now);
  dayStart.setHours(0, 0, 0, 0);
  for (let i = 13; i >= 0; i--) {
    const from = new Date(dayStart.getTime() - i * 86400_000);
    const to = new Date(from.getTime() + 86400_000);
    const inDay = attempts.filter((a) => a.submitted_at && a.submitted_at >= from && a.submitted_at < to);
    const pcts = inDay.map((a) => {
      const t = testById.get(String(a.test_id));
      return t ? scoreOf(a, t).percent : 0;
    });
    days.push({
      date: from.toISOString(),
      hand_ins: inDay.length,
      average: pcts.length ? Math.round(pcts.reduce((x, y) => x + y, 0) / pcts.length) : 0,
    });
  }
  const thisWeek = days.slice(7).reduce((x, d) => x + d.hand_ins, 0);
  const lastWeek = days.slice(0, 7).reduce((x, d) => x + d.hand_ins, 0);
  const bands = [[0, 39], [40, 59], [60, 79], [80, 100]].map(([low, high]) => ({
    label: `${low}-${high}%`, low, high, count: percents.filter((p) => p >= low && p <= high).length,
  }));

  return ok({
    server_time: now.toISOString(),
    daily: days,
    week: { this_week: thisWeek, last_week: lastWeek },
    bands,
    stats: {
      candidates,
      active_today: activeToday,
      new_this_week: newThisWeek,
      writing_now: attempts.filter((a) => !a.submitted_at && a.expires_at > now).length,
      hand_ins: attempts.filter((a) => a.submitted_at).length,
      hand_ins_today: attempts.filter((a) => a.submitted_at && a.submitted_at >= dayAgo).length,
      average_score: percents.length ? Math.round((percents.reduce((x, y) => x + y, 0) / percents.length) * 10) / 10 : 0,
      pass_rate: percents.length ? Math.round((passed / percents.length) * 100) : 0,
      pass_mark,
      flagged_attempts: finished.filter((a) => (a.violation_count ?? 0) > 0).length,
      pending_appeals: pendingAppeals,
      tests_live: live.length,
      tests_upcoming: upcoming.length,
      tests_draft: tests.filter((t) => t.status === "draft").length,
    },
    live: live.map((t) => ({ id: String(t._id), title: t.title, ends_at: t.ends_at.toISOString(), writing: attempts.filter((a) => a.test_id.equals(t._id) && !a.submitted_at && a.expires_at > now).length })),
    upcoming: upcoming.slice(0, 5).map((t) => ({ id: String(t._id), title: t.title, starts_at: t.starts_at.toISOString(), duration_minutes: t.duration_minutes })),
    recent,
  });
});
