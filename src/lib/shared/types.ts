import type { Language } from "./languages";
import type { ProctoringSettings } from "./proctoring";

export type Role = "admin" | "candidate";

export interface SessionUser {
  id: string;
  username: string;
  name: string;
  role: Role;
}

export interface Violation {
  id: string;
  type: "CRITICAL" | "WARNING";
  description: string;
  timestamp: string;
}

/** Where a test sits relative to the server clock. */
export type TestWindow = "upcoming" | "live" | "ended";

export type AttemptState = "not_started" | "in_progress" | "submitted" | "timed_out";

/** One case's outcome. Hidden cases never carry input, expected or output. */
export type CaseStatus =
  | "passed"
  | "wrong_answer"
  | "time_limit"
  | "compile_error"
  | "runtime_error"
  | "judge_error";

export interface CaseResult {
  index: number;
  hidden: boolean;
  status: CaseStatus;
  time_ms: number;
  memory_kb: number;
  input?: string;
  expected?: string;
  output?: string;
  /** Compiler output or stderr, visible cases only (and compile errors). */
  message?: string;
}

export interface JudgeResult {
  status: CaseStatus;
  passed: number;
  total: number;
  marks_obtained: number;
  marks: number;
  results: CaseResult[];
  /** Set for a compile error, shown once instead of per case. */
  compile_output?: string;
}

export interface CustomRunResult {
  status: "finished" | CaseStatus;
  stdout: string;
  stderr: string;
  compile_output: string;
  time_ms: number;
  memory_kb: number;
}

/** A problem as a candidate sees it: hidden cases are counted, never shown. */
export interface PaperProblem {
  id: string;
  title: string;
  statement: string;
  input_format: string;
  output_format: string;
  constraints: string;
  marks: number;
  languages: Language[];
  starter: Partial<Record<Language, string>>;
  samples: { input: string; output: string }[];
  hidden_count: number;
}

export interface BestScore {
  marks_obtained: number;
  passed: number;
  total: number;
  language: Language;
  at: string;
}

export interface PaperResponse {
  test: {
    id: string;
    title: string;
    instructions: string;
    duration_minutes: number;
    proctored: boolean;
    show_results: boolean;
    ends_at: string;
    started_at: string;
    expires_at: string;
    remaining_seconds: number;
  };
  proctoring: ProctoringSettings;
  problems: PaperProblem[];
  progress: {
    code: Record<string, Partial<Record<Language, string>>>;
    language: Record<string, Language>;
    current_index: number;
    best: Record<string, BestScore>;
    violations: Violation[];
  };
  server_time: string;
}

export interface AdminProblem {
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
  cases: { id: string; input: string; output: string; hidden: boolean }[];
}

export interface AdminTest {
  id: string;
  title: string;
  instructions: string;
  duration_minutes: number;
  starts_at: string;
  ends_at: string;
  status: "draft" | "published";
  proctored: boolean;
  show_results: boolean;
  proctoring: ProctoringSettings;
  problems: AdminProblem[];
  assign_all: boolean;
  candidate_ids: string[];
  created_at: string;
  updated_at: string;
}
