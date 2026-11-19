import "server-only";

/*
 * Judge0 client for the shared EC2 instance (Judge0 1.13.1).
 *
 * Ported from MyCodeBud's judge0_client.py, keeping the three things that
 * instance taught us:
 *
 *  1. EVERYTHING is base64 on the wire. With base64_encoded=false the batch GET
 *     400s for the WHOLE batch as soon as any field holds a non-ASCII byte, and
 *     a candidate's program may print anything.
 *  2. The batch endpoint ignores wait=true on this instance: POST returns only
 *     tokens, so results are polled until every row leaves the queue.
 *  3. Statuses 13 and 14 mean the judge failed, never the candidate. They are
 *     reported as `judge_error` and must not cost marks.
 *
 * The instance serves MyCodeBud too, so this app caps how many Judge0 jobs it
 * has in flight (JUDGE0_MAX_CONCURRENCY) instead of flooding the queue at the
 * start of a round.
 */

const JUDGE0_URL = (process.env.JUDGE0_URL || "http://65.2.208.229:2358").replace(/\/+$/, "");
const AUTH_HEADER = process.env.JUDGE0_AUTH_HEADER || "X-Auth-Token";
const AUTH_TOKEN = process.env.JUDGE0_AUTH_TOKEN || "";
const MAX_BATCH = 20; // max_submission_batch_size on the instance
const HTTP_TIMEOUT_MS = 30_000;
const POLL_INITIAL_MS = 150;
const POLL_MAX_MS = 1000;
const POLL_TIMEOUT_MS = 90_000;

// Instance ceilings (/config_info): cpu 15s max, wall 20s max, memory 512000 KB max.
export const LIMITS = { cpuMax: 15, wallMax: 20, memoryMaxKb: 512_000 };

export class Judge0Error extends Error {}

export interface Judge0Submission {
  source_code: string;
  language_id: number;
  stdin: string;
  cpu_time_limit: number;
  wall_time_limit?: number;
  memory_limit: number;
}

export interface Judge0Row {
  status: { id: number; description: string };
  stdout: string;
  stderr: string;
  compile_output: string;
  message: string;
  time: string | null;
  memory: number | null;
}

// ─── Concurrency gate ─────────────────────────────────────────────────────────

const MAX_CONCURRENCY = Math.max(1, Number(process.env.JUDGE0_MAX_CONCURRENCY) || 4);
let active = 0;
const waiting: (() => void)[] = [];

async function withSlot<T>(fn: () => Promise<T>): Promise<T> {
  if (active >= MAX_CONCURRENCY) await new Promise<void>((r) => waiting.push(r));
  active++;
  try {
    return await fn();
  } finally {
    active--;
    waiting.shift()?.();
  }
}

// ─── Wire ─────────────────────────────────────────────────────────────────────

const b64 = (text: string) => Buffer.from(text, "utf8").toString("base64");
const unb64 = (value: unknown) => {
  if (typeof value !== "string" || !value) return "";
  try {
    return Buffer.from(value, "base64").toString("utf8");
  } catch {
    return value;
  }
};

function headers(): HeadersInit {
  const h: Record<string, string> = { "Content-Type": "application/json" };
  if (AUTH_TOKEN) h[AUTH_HEADER] = AUTH_TOKEN;
  return h;
}

async function call(path: string, init?: RequestInit): Promise<unknown> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), HTTP_TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(`${JUDGE0_URL}${path}`, { ...init, headers: headers(), signal: ctrl.signal, cache: "no-store" });
  } catch (err) {
    throw new Judge0Error(`Judge0 unreachable: ${(err as Error).message}`);
  } finally {
    clearTimeout(timer);
  }
  if (res.status === 401) throw new Judge0Error("Judge0 rejected the auth token");
  if (res.status >= 400) {
    const text = await res.text().catch(() => "");
    throw new Judge0Error(`Judge0 HTTP ${res.status}: ${text.slice(0, 200)}`);
  }
  return res.json();
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function awaitTokens(tokens: string[]): Promise<Judge0Row[]> {
  const fields = "token,stdout,stderr,compile_output,message,time,memory,status";
  const path = `/submissions/batch?tokens=${tokens.join(",")}&base64_encoded=true&fields=${fields}`;
  const deadline = Date.now() + POLL_TIMEOUT_MS;
  let delay = POLL_INITIAL_MS;
  for (;;) {
    const body = (await call(path)) as { submissions?: Record<string, unknown>[] };
    const rows = body?.submissions ?? [];
    const done = rows.length === tokens.length
      && rows.every((r) => ((r?.status as { id?: number } | undefined)?.id ?? 0) > 2);
    if (done) {
      return rows.map((r) => ({
        status: (r.status as Judge0Row["status"]) ?? { id: 13, description: "Internal Error" },
        stdout: unb64(r.stdout),
        stderr: unb64(r.stderr),
        compile_output: unb64(r.compile_output),
        message: unb64(r.message),
        time: (r.time as string | null) ?? null,
        memory: (r.memory as number | null) ?? null,
      }));
    }
    if (Date.now() > deadline) throw new Judge0Error(`Judge0 did not finish ${tokens.length} submissions in time`);
    await sleep(delay);
    delay = Math.min(delay * 1.5, POLL_MAX_MS);
  }
}

/** Run submissions, results in the same order. Chunked to the batch ceiling. */
export async function runBatch(subs: Judge0Submission[]): Promise<Judge0Row[]> {
  if (!subs.length) return [];
  return withSlot(async () => {
    const out: Judge0Row[] = [];
    for (let i = 0; i < subs.length; i += MAX_BATCH) {
      const chunk = subs.slice(i, i + MAX_BATCH).map((s) => ({
        ...s,
        source_code: b64(s.source_code),
        stdin: b64(s.stdin),
        cpu_time_limit: Math.min(LIMITS.cpuMax, s.cpu_time_limit),
        wall_time_limit: Math.min(LIMITS.wallMax, s.wall_time_limit ?? Math.max(s.cpu_time_limit * 2, 5)),
        memory_limit: Math.min(LIMITS.memoryMaxKb, s.memory_limit),
        redirect_stderr_to_stdout: false,
      }));
      const body = (await call("/submissions/batch?base64_encoded=true", {
        method: "POST",
        body: JSON.stringify({ submissions: chunk }),
      })) as { token?: string }[];
      const tokens = Array.isArray(body) ? body.map((t) => t?.token) : [];
      if (!tokens.length || tokens.some((t) => !t)) throw new Judge0Error("Judge0 returned no tokens for a batch");
      out.push(...(await awaitTokens(tokens as string[])));
    }
    return out;
  });
}

/** Health probe for the admin console and scripts/check-judge0.ts. */
export async function judge0About(): Promise<{ ok: boolean; version?: string; error?: string }> {
  try {
    const about = (await call("/about")) as { version?: string };
    return { ok: true, version: about?.version };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}
