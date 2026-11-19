import "server-only";
import type { Db, ObjectId } from "mongodb";
import type { UserDoc } from "./auth";
import { attemptState, scoreOf, testWindow, totalMarks, type AttemptDoc, type TestDoc } from "./models";
import type { Sheet, SheetRow } from "@/lib/shared/sheet";

export type { Sheet, SheetRow };

/*
 * A test's result sheet: every assigned candidate, attempted or not, ranked.
 * The ONE builder behind the results board, the leaderboard, analytics and
 * reports, so no two screens can disagree about a candidate's score.
 */

type UserLite = Pick<UserDoc, "_id" | "username" | "name" | "email">;

/**
 * Sheets for many tests in TWO queries (attempts, then users) instead of two
 * per test. Analytics, the leaderboard and reports build every sheet in scope,
 * so per-test queries grew linearly with the number of tests.
 */
export async function buildSheets(d: Db, tests: TestDoc[], passMark: number, now = new Date()): Promise<Sheet[]> {
  if (!tests.length) return [];
  const attempts = await d.collection<AttemptDoc>("attempts")
    .find({ test_id: { $in: tests.map((t) => t._id) } }, { projection: { code: 0, "best.code": 0, presence: 0, user_agent: 0 } })
    .toArray();
  const userIds = new Map<string, ObjectId>();
  for (const t of tests) if (!t.assign_all) for (const u of t.candidate_ids || []) userIds.set(String(u), u);
  for (const a of attempts) userIds.set(String(a.user_id), a.user_id);
  const users = await d.collection<UserDoc>("users")
    .find({ _id: { $in: [...userIds.values()] } }, { projection: { username: 1, name: 1, email: 1 } })
    .toArray();
  const userById = new Map<string, UserLite>(users.map((u) => [String(u._id), u]));
  const byTest = new Map<string, AttemptDoc[]>();
  for (const a of attempts) {
    const k = String(a.test_id);
    const list = byTest.get(k);
    if (list) list.push(a); else byTest.set(k, [a]);
  }
  return tests.map((t) => assembleSheet(t, byTest.get(String(t._id)) ?? [], userById, passMark, now));
}

export async function buildSheet(d: Db, test: TestDoc, passMark: number, now = new Date()): Promise<Sheet> {
  return (await buildSheets(d, [test], passMark, now))[0];
}

function assembleSheet(test: TestDoc, attempts: AttemptDoc[], userById: Map<string, UserLite>, passMark: number, now: Date): Sheet {
  const ids = new Map<string, ObjectId>();
  if (!test.assign_all) for (const u of test.candidate_ids || []) ids.set(String(u), u);
  for (const a of attempts) ids.set(String(a.user_id), a.user_id);
  const attemptByUser = new Map(attempts.map((a) => [String(a.user_id), a]));
  const total = totalMarks(test);

  const rows: SheetRow[] = [...ids.entries()].map(([uid]) => {
    const u = userById.get(uid);
    const a = attemptByUser.get(uid) ?? null;
    const state = attemptState(a, now);
    const score = a ? scoreOf(a, test) : null;
    const end = a ? (a.submitted_at ?? (now < a.expires_at ? now : a.expires_at)) : null;
    const percent = score?.percent ?? 0;
    return {
      user_id: uid,
      attempt_id: a ? String(a._id) : null,
      name: u?.name ?? "(deleted)",
      username: u?.username ?? "",
      email: u?.email ?? "",
      state,
      status: state === "not_started" ? "absent" : state === "in_progress" ? "in_progress" : percent >= passMark ? "passed" : "failed",
      rank: null,
      percentile: null,
      marks_obtained: score?.marks_obtained ?? 0,
      total_marks: total,
      percent,
      solved: score?.solved ?? 0,
      problems: test.problems.map((p) => {
        const b = a?.best?.[p.id];
        return {
          problem_id: p.id,
          title: p.title,
          difficulty: p.difficulty || "Medium",
          marks: p.marks,
          marks_obtained: b?.marks_obtained ?? 0,
          passed: b?.passed ?? 0,
          total: b?.total ?? p.cases.length,
          accepted: !!b && b.total > 0 && b.passed === b.total,
          attempted: !!b,
          submissions: a?.submit_counts?.[p.id] ?? 0,
          language: b?.language ?? null,
        };
      }),
      violation_count: a?.violations?.length ?? 0,
      violations: a?.violations ?? [],
      auto_submitted: !!a?.auto_submitted,
      started_at: a?.started_at.toISOString() ?? null,
      expires_at: a?.expires_at.toISOString() ?? null,
      submitted_at: a?.submitted_at?.toISOString() ?? null,
      last_improved_at: a?.last_improved_at?.toISOString() ?? null,
      time_spent_seconds: a && end ? Math.max(0, Math.round((end.getTime() - a.started_at.getTime()) / 1000)) : 0,
      followup: a?.followup ?? null,
    };
  });

  // Marks first, then whoever got there sooner (last improvement, else time used).
  const tieTime = (r: SheetRow) => (r.last_improved_at ? new Date(r.last_improved_at).getTime() : Infinity);
  rows.sort((x, y) => {
    const xa = x.state === "not_started", ya = y.state === "not_started";
    if (xa !== ya) return xa ? 1 : -1;
    if (y.marks_obtained !== x.marks_obtained) return y.marks_obtained - x.marks_obtained;
    if (tieTime(x) !== tieTime(y)) return tieTime(x) - tieTime(y);
    return x.time_spent_seconds - y.time_spent_seconds;
  });
  const sat = rows.filter((r) => r.state !== "not_started");
  sat.forEach((r, i) => {
    const prev = sat[i - 1];
    r.rank = prev && prev.marks_obtained === r.marks_obtained && tieTime(prev) === tieTime(r) ? prev.rank : i + 1;
    // Share of the OTHER candidates who scored lower.
    const lower = sat.filter((o) => o.marks_obtained < r.marks_obtained).length;
    r.percentile = sat.length > 1 ? Math.round((lower / (sat.length - 1)) * 100) : 100;
  });

  return {
    test: {
      id: String(test._id),
      title: test.title,
      window: testWindow(test, now),
      status: test.status,
      starts_at: test.starts_at.toISOString(),
      ends_at: test.ends_at.toISOString(),
      duration_minutes: test.duration_minutes,
      proctored: test.proctored,
      total_marks: total,
      followup_prompt: test.followup?.prompt ?? "",
      problems: test.problems.map((p) => ({ id: p.id, title: p.title, marks: p.marks, difficulty: p.difficulty || "Medium", topics: p.topics || [] })),
    },
    pass_mark: passMark,
    summary: {
      assigned: test.assign_all ? null : (test.candidate_ids || []).length,
      started: sat.length,
      in_progress: rows.filter((r) => r.state === "in_progress").length,
      submitted: rows.filter((r) => r.state === "submitted").length,
      absent: rows.filter((r) => r.state === "not_started").length,
      passed: rows.filter((r) => r.status === "passed").length,
      failed: rows.filter((r) => r.status === "failed").length,
      flagged: rows.filter((r) => r.violation_count > 0).length,
      auto_submitted: rows.filter((r) => r.auto_submitted).length,
      full_marks: sat.filter((r) => total > 0 && r.marks_obtained >= total).length,
      average_percent: sat.length ? Math.round((sat.reduce((s, r) => s + r.percent, 0) / sat.length) * 10) / 10 : 0,
    },
    rows,
  };
}
