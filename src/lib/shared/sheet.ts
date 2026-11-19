import type { AttemptState, TestWindow, Violation } from "./types";

/** A test's result sheet as the admin API returns it (built in lib/server/sheet.ts). */
export interface SheetProblemCell {
  problem_id: string;
  title: string;
  difficulty: string;
  marks: number;
  marks_obtained: number;
  passed: number;
  total: number;
  accepted: boolean;
  attempted: boolean;
  submissions: number;
  language: string | null;
}

export interface SheetRow {
  user_id: string;
  attempt_id: string | null;
  name: string;
  username: string;
  email: string;
  state: AttemptState;
  status: "passed" | "failed" | "absent" | "in_progress";
  rank: number | null;
  percentile: number | null;
  marks_obtained: number;
  total_marks: number;
  percent: number;
  solved: number;
  problems: SheetProblemCell[];
  violation_count: number;
  violations: Violation[];
  auto_submitted: boolean;
  started_at: string | null;
  expires_at: string | null;
  submitted_at: string | null;
  last_improved_at: string | null;
  time_spent_seconds: number;
  followup: { answer: string; correct: boolean } | null;
}

export interface Sheet {
  test: {
    id: string;
    title: string;
    window: TestWindow;
    status: "draft" | "published";
    starts_at: string;
    ends_at: string;
    duration_minutes: number;
    proctored: boolean;
    total_marks: number;
    followup_prompt: string;
    problems: { id: string; title: string; marks: number; difficulty: string; topics: string[] }[];
  };
  pass_mark: number;
  summary: {
    assigned: number | null;
    started: number;
    in_progress: number;
    submitted: number;
    absent: number;
    passed: number;
    failed: number;
    flagged: number;
    auto_submitted: number;
    full_marks: number;
    average_percent: number;
  };
  rows: SheetRow[];
}
