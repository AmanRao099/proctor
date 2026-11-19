import "server-only";
import { randomBytes } from "crypto";
import { z } from "zod";
import { LANGUAGE_KEYS, type Language } from "@/lib/shared/languages";
import { normalizeProctoring } from "@/lib/shared/proctoring";
import { HttpError } from "./http";
import { ObjectId, oid } from "./db";
import type { ProblemDoc, TestDoc } from "./models";

const lang = z.enum(LANGUAGE_KEYS as [Language, ...Language[]]);
const text = (max: number) => z.string().max(max).default("");

const caseSchema = z.object({
  id: z.string().max(40).optional(),
  input: z.string().max(1_000_000),
  output: z.string().max(1_000_000),
  hidden: z.boolean().default(true),
});

const problemSchema = z.object({
  id: z.string().max(40).optional(),
  title: z.string().trim().min(1, "Every problem needs a title").max(200),
  statement: text(50_000),
  input_format: text(10_000),
  output_format: text(10_000),
  constraints: text(10_000),
  marks: z.number().min(0).max(1000).default(10),
  cpu_time_limit: z.number().min(0.5).max(15).default(2),
  memory_limit_kb: z.number().int().min(16_000).max(512_000).default(256_000),
  languages: z.array(lang).min(1, "Allow at least one language").default(LANGUAGE_KEYS),
  starter: z.record(lang, z.string().max(50_000)).default({}),
  cases: z.array(caseSchema).max(200).default([]),
});

export const testSchema = z.object({
  title: z.string().trim().min(1, "Give the test a title").max(200),
  instructions: text(20_000),
  duration_minutes: z.number().int().min(1).max(600),
  starts_at: z.string().datetime({ offset: true }),
  ends_at: z.string().datetime({ offset: true }),
  status: z.enum(["draft", "published"]).default("draft"),
  proctored: z.boolean().default(true),
  show_results: z.boolean().default(true),
  proctoring: z.unknown().optional(),
  problems: z.array(problemSchema).max(30).default([]),
  assign_all: z.boolean().default(false),
  candidate_ids: z.array(z.string()).max(20_000).default([]),
});

export type TestInput = z.infer<typeof testSchema>;

const newId = () => randomBytes(6).toString("hex");

/** Validate cross-field rules and shape the document fields to store. */
export function toTestFields(input: TestInput): Omit<TestDoc, "_id" | "created_by" | "created_at" | "updated_at"> {
  const starts = new Date(input.starts_at);
  const ends = new Date(input.ends_at);
  if (!(ends > starts)) throw new HttpError(400, "The window must end after it starts.");

  const problems: ProblemDoc[] = input.problems.map((p) => ({
    ...p,
    id: p.id || newId(),
    languages: Array.from(new Set(p.languages)),
    cases: p.cases.map((c) => ({ ...c, id: c.id || newId() })),
  }));
  const ids = new Set(problems.map((p) => p.id));
  if (ids.size !== problems.length) throw new HttpError(400, "Two problems share an id.");

  if (input.status === "published") {
    if (!problems.length) throw new HttpError(400, "Add at least one problem before publishing.");
    const empty = problems.find((p) => !p.cases.length);
    if (empty) throw new HttpError(400, `"${empty.title}" has no test cases. Add some before publishing.`);
    if (!input.assign_all && !input.candidate_ids.length) {
      throw new HttpError(400, "Assign candidates, or open the test to everyone, before publishing.");
    }
  }

  const candidateIds: ObjectId[] = [];
  for (const id of input.candidate_ids) {
    const o = oid(id);
    if (o) candidateIds.push(o);
  }

  return {
    title: input.title,
    instructions: input.instructions,
    duration_minutes: input.duration_minutes,
    starts_at: starts,
    ends_at: ends,
    status: input.status,
    proctored: input.proctored,
    show_results: input.show_results,
    proctoring: normalizeProctoring(input.proctoring),
    problems,
    assign_all: input.assign_all,
    candidate_ids: candidateIds,
  };
}
