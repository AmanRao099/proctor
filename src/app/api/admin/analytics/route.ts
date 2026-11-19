import { requireUser } from "@/lib/server/auth";
import { db, oid } from "@/lib/server/db";
import { handle, ok } from "@/lib/server/http";
import { lockoutStatus } from "@/lib/server/lockout";
import type { TestDoc } from "@/lib/server/models";
import { getSettings } from "@/lib/server/settings";
import { buildSheet, type Sheet, type SheetRow } from "@/lib/server/sheet";

export const dynamic = "force-dynamic";

/*
 * DSA Master analytics, ported from MyCodeBud's institute round analytics:
 * Round (how the cohort did), Integrity (who was caught and exactly what the
 * proctor saw), Performance groups (who is strong at what). One request feeds
 * all three so they always describe the same window.
 *
 * Same thresholds as MyCodeBud: STRONG at 70%+ accuracy over at least 4 test
 * cases of a kind, NEEDS WORK at 40% or below; score bands 0-39, 40-59,
 * 60-79, 80-100.
 */

const STRONG_ACCURACY = 70;
const WEAK_ACCURACY = 40;
const MIN_ASKED = 4;
const BANDS: [number, number][] = [[0, 39], [40, 59], [60, 79], [80, 100]];

const pct = (part: number, whole: number) => (whole ? Math.round((part / whole) * 100) : 0);

function groupsFor(sheet: Sheet, by: "difficulty" | "topics") {
  const topicsOf = new Map(sheet.test.problems.map((p) => [p.id, p.topics]));
  const groups = new Map<string, { attempted: number; strong: Member[]; developing: Member[] }>();
  for (const row of sheet.rows) {
    if (row.state === "not_started") continue;
    const per = new Map<string, { asked: number; correct: number }>();
    for (const cell of row.problems) {
      const names = by === "difficulty" ? [cell.difficulty] : topicsOf.get(cell.problem_id) ?? [];
      for (const name of names) {
        if (!name) continue;
        const acc = per.get(name) ?? { asked: 0, correct: 0 };
        acc.asked += cell.total;
        acc.correct += cell.passed;
        per.set(name, acc);
      }
    }
    for (const [name, { asked, correct }] of per) {
      const g = groups.get(name) ?? { attempted: 0, strong: [], developing: [] };
      g.attempted += 1;
      const m: Member = { user_id: row.user_id, name: row.name, username: row.username, asked, correct, accuracy: pct(correct, asked) };
      if (asked >= MIN_ASKED) {
        if (m.accuracy >= STRONG_ACCURACY) g.strong.push(m);
        else if (m.accuracy <= WEAK_ACCURACY) g.developing.push(m);
      }
      groups.set(name, g);
    }
  }
  return [...groups.entries()]
    .map(([name, g]) => ({
      name,
      students_attempted: g.attempted,
      strong: g.strong.sort((a, b) => b.accuracy - a.accuracy || b.asked - a.asked || a.name.localeCompare(b.name)),
      developing: g.developing.sort((a, b) => a.accuracy - b.accuracy || b.asked - a.asked || a.name.localeCompare(b.name)),
    }))
    .sort((a, b) => b.strong.length - a.strong.length || b.students_attempted - a.students_attempted || a.name.localeCompare(b.name));
}

interface Member { user_id: string; name: string; username: string; asked: number; correct: number; accuracy: number }

export const GET = handle(async (req: Request) => {
  await requireUser("admin");
  const url = new URL(req.url);
  const testParam = url.searchParams.get("test") || "all";
  const days = Math.min(730, Math.max(1, Number(url.searchParams.get("days")) || 90));
  const d = await db();
  const { pass_mark } = await getSettings();
  const now = new Date();
  const since = new Date(now.getTime() - days * 86400_000);

  const published = await d.collection<TestDoc>("tests")
    .find({ status: "published", starts_at: { $gte: since } })
    .sort({ starts_at: -1 })
    .toArray();
  const sheets = await Promise.all(published.map((t) => buildSheet(d, t, pass_mark, now)));
  const options = sheets.map((s) => ({ id: s.test.id, title: s.test.title, starts_at: s.test.starts_at, students: s.summary.started }));
  const scoped = testParam === "all" ? sheets : sheets.filter((s) => s.test.id === testParam);

  // ── Round ────────────────────────────────────────────────────────────────
  const finished: { row: SheetRow; sheet: Sheet }[] = [];
  const cohort = new Set<string>();
  for (const s of scoped) {
    for (const r of s.rows) {
      cohort.add(r.user_id);
      if (r.state === "submitted" || r.state === "timed_out") finished.push({ row: r, sheet: s });
    }
  }
  const scores = finished.map((f) => f.row.percent).sort((a, b) => a - b);
  const best = new Map<string, number>();
  for (const { row } of finished) best.set(row.user_id, Math.max(best.get(row.user_id) ?? 0, row.percent));
  const passed = [...best.values()].filter((b) => b >= pass_mark).length;
  const flagged = finished.filter((f) => f.row.violation_count > 0).length;
  const round = {
    attempts: finished.length,
    students_attempted: best.size,
    cohort_size: cohort.size,
    participation_percent: pct(best.size, cohort.size),
    average_score: scores.length ? Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 10) / 10 : 0,
    median_score: scores.length ? scores[Math.floor(scores.length / 2)] : 0,
    top_score: scores.length ? scores[scores.length - 1] : 0,
    lowest_score: scores.length ? scores[0] : 0,
    pass_mark,
    passed_students: passed,
    pass_rate_percent: pct(passed, best.size),
    auto_submitted_attempts: finished.filter((f) => f.row.auto_submitted).length,
    flagged_attempts: flagged,
    clean_attempts: finished.length - flagged,
    bands: BANDS.map(([low, high]) => ({
      label: `${low}-${high}%`, low, high, attempts: scores.filter((s) => s >= low && s <= high).length,
    })),
  };

  // ── Integrity ────────────────────────────────────────────────────────────
  const perUser = new Map<string, { row: SheetRow; incidents: { test: string; test_id: string; started_at: string | null; submitted_at: string | null; percent: number; auto_submitted: boolean; violations: SheetRow["violations"] }[] }>();
  for (const s of scoped) {
    for (const r of s.rows) {
      if (!r.violation_count) continue;
      const entry = perUser.get(r.user_id) ?? { row: r, incidents: [] };
      entry.incidents.push({
        test: s.test.title, test_id: s.test.id, started_at: r.started_at, submitted_at: r.submitted_at,
        percent: r.percent, auto_submitted: r.auto_submitted, violations: r.violations,
      });
      perUser.set(r.user_id, entry);
    }
  }
  const integrity = await Promise.all([...perUser.entries()].map(async ([uid, { row, incidents }]) => {
    const types = new Map<string, number>();
    for (const inc of incidents) for (const v of inc.violations) types.set(v.description, (types.get(v.description) ?? 0) + 1);
    const lock = await lockoutStatus(d, oid(uid)!, now);
    const last = incidents.flatMap((i) => i.violations.map((v) => v.timestamp)).sort().pop() ?? "";
    return {
      user_id: uid,
      name: row.name,
      username: row.username,
      email: row.email,
      violation_count: incidents.reduce((s, i) => s + i.violations.length, 0),
      critical_count: incidents.reduce((s, i) => s + i.violations.filter((v) => v.type === "CRITICAL").length, 0),
      flagged_attempts: incidents.length,
      auto_submitted_attempts: incidents.filter((i) => i.auto_submitted).length,
      active_strikes: lock.strike_count,
      banned: lock.banned,
      cooldown_until: lock.cooldown_until,
      violation_types: [...types.entries()].map(([type, count]) => ({ type, count })).sort((a, b) => b.count - a.count),
      last_incident: last,
      incidents,
    };
  }));
  integrity.sort((a, b) => b.auto_submitted_attempts - a.auto_submitted_attempts || b.critical_count - a.critical_count || b.violation_count - a.violation_count);

  // ── Performance groups, per test ─────────────────────────────────────────
  const groups_by_test = scoped.map((s) => ({
    id: s.test.id,
    title: s.test.title,
    starts_at: s.test.starts_at,
    students: s.summary.started,
    difficulties: groupsFor(s, "difficulty"),
    topics: groupsFor(s, "topics"),
  }));

  return ok({
    days,
    test: testParam,
    tests: options,
    round,
    integrity,
    groups_by_test,
    thresholds: { strong_accuracy: STRONG_ACCURACY, weak_accuracy: WEAK_ACCURACY, min_asked: MIN_ASKED, pass_mark },
  });
});
