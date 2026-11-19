import "server-only";
import type { ObjectId } from "mongodb";
import type { Language } from "@/lib/shared/languages";
import { normalizeProctoring, type ProctoringSettings } from "@/lib/shared/proctoring";
import type {
  AdminTest, AttemptState, BestScore, PaperProblem, TestWindow, Violation,
} from "@/lib/shared/types";

export interface CaseDoc {
  id: string;
  input: string;
  output: string;
  hidden: boolean;
}

export interface ProblemDoc {
  id: string;
  title: string;
  statement: string;
  input_format: string;
  output_format: string;
  constraints: string;
  marks: number;
  cpu_time_limit: number;
  memory_limit_kb: number;
  languages: Language[];
  starter: Partial<Record<Language, string>>;
  cases: CaseDoc[];
}

export interface TestDoc {
  _id: ObjectId;
  title: string;
  instructions: string;
  duration_minutes: number;
  starts_at: Date;
  ends_at: Date;
  status: "draft" | "published";
  proctored: boolean;
  show_results: boolean;
  proctoring: ProctoringSettings;
  problems: ProblemDoc[];
  assign_all: boolean;
  candidate_ids: ObjectId[];
  created_by: ObjectId;
  created_at: Date;
  updated_at: Date;
}

export interface BestDoc extends Omit<BestScore, "at"> {
  at: Date;
  code: string;
}

export interface AttemptDoc {
  _id: ObjectId;
  test_id: ObjectId;
  user_id: ObjectId;
  started_at: Date;
  expires_at: Date;
  submitted_at: Date | null;
  code: Record<string, Partial<Record<Language, string>>>;
  language: Record<string, Language>;
  current_index: number;
  best: Record<string, BestDoc>;
  submit_counts: Record<string, number>;
  violations: Violation[];
  violation_count: number;
  auto_submitted: boolean;
  submitted_due_to_violation: boolean;
  last_judge_at: Date | null;
  final?: { marks_obtained: number; total_marks: number; percent: number; solved: number; count: number };
  user_agent?: string;
}

/** Hand-ins are accepted this long past the deadline (a slow network at 00:00). */
export const HAND_IN_GRACE_MS = 2 * 60 * 1000;

export function testWindow(t: Pick<TestDoc, "starts_at" | "ends_at">, now = new Date()): TestWindow {
  if (now < t.starts_at) return "upcoming";
  if (now >= t.ends_at) return "ended";
  return "live";
}

export function attemptState(a: AttemptDoc | null, now = new Date()): AttemptState {
  if (!a) return "not_started";
  if (a.submitted_at) return "submitted";
  if (now >= a.expires_at) return "timed_out";
  return "in_progress";
}

export function totalMarks(t: Pick<TestDoc, "problems">) {
  return t.problems.reduce((sum, p) => sum + p.marks, 0);
}

export function scoreOf(a: AttemptDoc, t: Pick<TestDoc, "problems">) {
  const total = totalMarks(t);
  let obtained = 0;
  let solved = 0;
  for (const p of t.problems) {
    const b = a.best?.[p.id];
    if (!b) continue;
    obtained += b.marks_obtained;
    if (b.total > 0 && b.passed === b.total) solved++;
  }
  obtained = Math.round(obtained * 100) / 100;
  return {
    marks_obtained: obtained,
    total_marks: total,
    percent: total ? Math.round((obtained / total) * 1000) / 10 : 0,
    solved,
    count: t.problems.length,
  };
}

export function toPaperProblem(p: ProblemDoc): PaperProblem {
  return {
    id: p.id,
    title: p.title,
    statement: p.statement,
    input_format: p.input_format,
    output_format: p.output_format,
    constraints: p.constraints,
    marks: p.marks,
    languages: p.languages,
    starter: p.starter,
    samples: p.cases.filter((c) => !c.hidden).map((c) => ({ input: c.input, output: c.output })),
    hidden_count: p.cases.filter((c) => c.hidden).length,
  };
}

export function toAdminTest(t: TestDoc): AdminTest {
  return {
    id: String(t._id),
    title: t.title,
    instructions: t.instructions,
    duration_minutes: t.duration_minutes,
    starts_at: t.starts_at.toISOString(),
    ends_at: t.ends_at.toISOString(),
    status: t.status,
    proctored: t.proctored,
    show_results: t.show_results,
    proctoring: normalizeProctoring(t.proctoring),
    problems: t.problems,
    assign_all: t.assign_all,
    candidate_ids: (t.candidate_ids || []).map(String),
    created_at: t.created_at.toISOString(),
    updated_at: t.updated_at.toISOString(),
  };
}

/** May this candidate see this test at all? */
export function isAssigned(t: Pick<TestDoc, "assign_all" | "candidate_ids" | "status">, userId: ObjectId) {
  if (t.status !== "published") return false;
  return t.assign_all || (t.candidate_ids || []).some((id) => id.equals(userId));
}
