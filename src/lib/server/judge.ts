import "server-only";
import { LANGUAGES, type Language } from "@/lib/shared/languages";
import type { CaseResult, CaseStatus, CustomRunResult, JudgeResult } from "@/lib/shared/types";
import { runBatch, type Judge0Row } from "./judge0";
import type { ProblemDoc } from "./models";

/*
 * Judging. Problems are stdin/stdout: every case runs the candidate's program
 * as written, and the printed output is compared with the stored answer HERE,
 * not by Judge0. No expected_output is sent, so Judge0 only reports whether
 * the program ran; correctness is decided by one comparison function that
 * both the admin's "check answer" and the candidate's run go through.
 */

/** CRLF to LF, trailing spaces off every line, trailing blank lines off the end. */
export function normalizeOutput(text: string): string {
  return text
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => line.replace(/[ \t]+$/, ""))
    .join("\n")
    .replace(/\n+$/, "");
}

function runKind(statusId: number): CaseStatus | "ran" {
  if (statusId === 3 || statusId === 4) return "ran";
  if (statusId === 5) return "time_limit";
  if (statusId === 6) return "compile_error";
  if (statusId >= 7 && statusId <= 12) return "runtime_error";
  return "judge_error";
}

const ms = (row: Judge0Row) => Math.round(Number(row.time || 0) * 1000);
const clip = (s: string, n = 4000) => (s.length > n ? `${s.slice(0, n)}\n... (truncated)` : s);

/**
 * Judge `code` against a problem's cases.
 *
 * scope "samples": the visible cases only (the Run button).
 * scope "all": every case (Submit and the final hand-in).
 *
 * Hidden cases come back with status and timing only. Echoing a hidden case's
 * output would leak its input: a program can print whatever it reads.
 */
export async function judge(
  problem: ProblemDoc,
  code: string,
  language: Language,
  scope: "samples" | "all",
): Promise<JudgeResult> {
  const cases = problem.cases.filter((c) => scope === "all" || !c.hidden);
  const rows = await runBatch(
    cases.map((c) => ({
      source_code: code,
      language_id: LANGUAGES[language].judge0Id,
      stdin: c.input,
      cpu_time_limit: problem.cpu_time_limit,
      memory_limit: problem.memory_limit_kb,
    })),
  );

  let passed = 0;
  let overall: CaseStatus = "passed";
  let compileOutput: string | undefined;
  const results: CaseResult[] = cases.map((c, index) => {
    const row = rows[index];
    const kind = runKind(row.status?.id ?? 13);
    let status: CaseStatus;
    if (kind === "ran") {
      status = normalizeOutput(row.stdout) === normalizeOutput(c.output) ? "passed" : "wrong_answer";
    } else {
      status = kind;
    }
    if (status === "passed") passed++;
    // judge_error outranks every verdict: it is not a statement about the code.
    else if (overall === "passed" || status === "judge_error") overall = status;
    if (status === "compile_error") compileOutput = clip(row.compile_output || row.stderr);

    const base: CaseResult = {
      index,
      hidden: c.hidden,
      status,
      time_ms: ms(row),
      memory_kb: row.memory ?? 0,
    };
    if (c.hidden) return base;
    return {
      ...base,
      input: clip(c.input, 2000),
      expected: clip(c.output, 2000),
      output: clip(row.stdout, 2000),
      message: status === "runtime_error" || status === "time_limit"
        ? clip(row.stderr || row.message, 2000)
        : undefined,
    };
  });

  const total = cases.length;
  const marks = problem.marks;
  return {
    status: total ? overall : "judge_error",
    passed,
    total,
    marks,
    marks_obtained: total ? Math.round((marks * passed / total) * 100) / 100 : 0,
    results,
    compile_output: compileOutput,
  };
}

/** Run with the candidate's own input. No comparison, nothing recorded. */
export async function runCustom(
  problem: ProblemDoc,
  code: string,
  language: Language,
  stdin: string,
): Promise<CustomRunResult> {
  const [row] = await runBatch([{
    source_code: code,
    language_id: LANGUAGES[language].judge0Id,
    stdin,
    cpu_time_limit: problem.cpu_time_limit,
    memory_limit: problem.memory_limit_kb,
  }]);
  const kind = runKind(row.status?.id ?? 13);
  return {
    status: kind === "ran" ? "finished" : kind,
    stdout: clip(row.stdout),
    stderr: clip(row.stderr || (kind === "judge_error" ? row.message : "")),
    compile_output: clip(row.compile_output),
    time_ms: ms(row),
    memory_kb: row.memory ?? 0,
  };
}
