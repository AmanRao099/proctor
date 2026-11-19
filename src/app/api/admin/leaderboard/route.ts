import { requireUser } from "@/lib/server/auth";
import { db } from "@/lib/server/db";
import { handle, ok } from "@/lib/server/http";
import type { TestDoc } from "@/lib/server/models";
import { getSettings } from "@/lib/server/settings";
import { buildSheet } from "@/lib/server/sheet";

export const dynamic = "force-dynamic";

/**
 * Overall leaderboard across every published test a candidate sat. Ranked on
 * the share of all available marks they earned, so sitting more tests is not
 * an advantage by itself. Per-test boards come from the results route.
 */
export const GET = handle(async () => {
  await requireUser("admin");
  const d = await db();
  const { pass_mark } = await getSettings();
  const now = new Date();
  const tests = await d.collection<TestDoc>("tests").find({ status: "published" }).sort({ starts_at: -1 }).toArray();
  const sheets = await Promise.all(tests.map((t) => buildSheet(d, t, pass_mark, now)));

  const agg = new Map<string, {
    user_id: string; name: string; username: string; tests: number; marks: number; possible: number;
    solved: number; problems: number; violations: number; auto: number; best: number; passed: number; last: string;
  }>();
  for (const s of sheets) {
    for (const r of s.rows) {
      if (r.state === "not_started") continue;
      const a = agg.get(r.user_id) ?? {
        user_id: r.user_id, name: r.name, username: r.username, tests: 0, marks: 0, possible: 0,
        solved: 0, problems: 0, violations: 0, auto: 0, best: 0, passed: 0, last: "",
      };
      a.tests += 1;
      a.marks += r.marks_obtained;
      a.possible += r.total_marks;
      a.solved += r.solved;
      a.problems += r.problems.length;
      a.violations += r.violation_count;
      a.auto += r.auto_submitted ? 1 : 0;
      a.best = Math.max(a.best, r.percent);
      a.passed += r.status === "passed" ? 1 : 0;
      const at = r.submitted_at ?? r.started_at ?? "";
      if (at > a.last) a.last = at;
      agg.set(r.user_id, a);
    }
  }
  const rows = [...agg.values()]
    .map((a) => ({
      user_id: a.user_id,
      name: a.name,
      username: a.username,
      tests_taken: a.tests,
      marks_obtained: Math.round(a.marks * 100) / 100,
      marks_possible: a.possible,
      percent: a.possible ? Math.round((a.marks / a.possible) * 1000) / 10 : 0,
      best_percent: a.best,
      tests_passed: a.passed,
      solved: a.solved,
      problems: a.problems,
      violations: a.violations,
      auto_submitted: a.auto,
      last_activity: a.last,
    }))
    .sort((x, y) => y.percent - x.percent || y.marks_obtained - x.marks_obtained || x.violations - y.violations);
  rows.forEach((r, i) => Object.assign(r, { rank: i + 1 }));

  return ok({
    server_time: now.toISOString(),
    tests: sheets.map((s) => ({ id: s.test.id, title: s.test.title, window: s.test.window, starts_at: s.test.starts_at, started: s.summary.started })),
    rows,
  });
});
