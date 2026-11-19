# Proctor

Proctored coding assessments. Admins write problems with test cases, schedule a
test window, assign candidates and watch a live results board. Candidates sign
in, pass a system check (camera, face, fullscreen), and solve problems in a
browser IDE whose code is judged on the Judge0 instance on EC2.

The proctoring engine is a port of MyCodeBud's (`ProctorContext.tsx`), kept
rule-for-rule, so behaviour learned in MyCodeBud rounds carries over.

## Architecture

```
Browser (Next.js client)                 Next.js server (route handlers)            External
------------------------                 -------------------------------            --------
/login                    -- cookie -->  /api/auth/*        bcrypt + JWT (jose)
/dashboard                               /api/tests         candidate's tests
/test/[id]/check  ProctorProvider        /api/tests/[id]/start     opens attempt, starts server clock
/test/[id]        Monaco + engine  --->  /api/tests/[id]/run|submit|finish  --->  Judge0 1.13.1 (EC2 :2358)
                  strikes, autosave      /api/tests/[id]/violations|progress      X-Auth-Token, base64, batch+poll
/admin/*          editor, live board     /api/admin/*                       --->  MongoDB
```

One deployable: the Next.js app is both frontend and backend. The browser never
talks to Judge0; only the server does, with the token from the environment.

### Source map

| Path | What it is |
| --- | --- |
| `src/middleware.ts` | Route guard by role, CSRF origin check on mutating API calls |
| `src/lib/server/auth.ts` | Login, logout, session lookup, throttling, password generation |
| `src/lib/server/session.ts` | JWT sign/verify (edge-safe, used by middleware) |
| `src/lib/server/judge0.ts` | Judge0 client: base64 wire, batch + poll, concurrency cap |
| `src/lib/server/judge.ts` | Runs cases, compares output, redacts hidden cases |
| `src/lib/server/models.ts` | Mongo document types, scoring, attempt state |
| `src/lib/server/candidate.ts` | Shared guards for candidate routes (assignment, open attempt, judge throttle) |
| `src/lib/proctor/ProctorProvider.tsx` | Proctor engine: face, phone, liveness, mic, focus, fullscreen, clipboard |
| `src/lib/shared/proctoring.ts` | Settings, defaults, sensitivity levels (shared with the admin form) |
| `src/app/test/[id]/check` | System check |
| `src/app/test/[id]` | Exam workspace |
| `src/app/(console)/admin` | Tests, editor, results board, candidates |

### Data (MongoDB)

- `users` `{username (unique), name, email, role: admin|candidate, password_hash, sid, disabled}`
- `tests` `{title, instructions, duration_minutes, starts_at, ends_at, status, proctored, show_results, proctoring, problems[ {id, title, statement, ..., marks, cpu_time_limit, memory_limit_kb, languages, cases[ {input, output, hidden} ]} ], assign_all, candidate_ids}`
- `attempts` (unique on `test_id + user_id`) `{started_at, expires_at, submitted_at, code, language, best, submit_counts, violations, violation_count, auto_submitted, final}`
- `submissions` every Submit, for audit
- `attempt_archive` attempts removed by "Reset attempt"
- `login_throttle` TTL-indexed failed-login counters

### Rules the server enforces (not the browser)

- **Timer.** `expires_at = min(start + duration, window end)`, set when the paper first opens. A reload resumes with what is left. Run, submit and autosave are refused after it; hand-in has a 2 minute grace.
- **One attempt.** Unique index plus an atomic claim on hand-in, so double hand-ins file once.
- **Hidden cases stay hidden.** The paper carries only sample cases. Results for hidden cases carry status and time, never input, expected or output (a program can print its input).
- **Scoring.** Marks are `marks x passed / total` per problem; the best submission counts and a worse one never lowers it. On hand-in, unsubmitted final code is judged once more and can only raise the score. A Judge0 failure (status 13/14) is never counted against the candidate.
- **One session per account.** Each login rotates `sid`; an older session on another device stops working.
- **Throttling.** One judge request per attempt every 3 seconds. Five wrong passwords lock a username for 15 minutes.
- **Results withheld.** With "Show scores" off, Submit only says the code was recorded.

### Proctoring

Ported from MyCodeBud. MediaPipe models and wasm are self-hosted in `public/vendor/mediapipe`; Monaco is self-hosted from `node_modules` into `public/vendor/monaco` by `scripts/copy-monaco.mjs`. No CDN is needed on test day.

Signals: no face, multiple faces (size-gated by sensitivity), looking away, phone in frame (opt-in), dead camera feed (frame-arrival liveness), sustained talking (opt-in), tab or app switch, leaving fullscreen, blocked shortcuts and devtools, paste. Every signal is a strike; reaching the test's limit hands the test in. Strikes are sent to the server as they happen and restored after a reload. Admin changes to a running test's settings reach candidates within 30 seconds.

## Local setup

Requires Node 20+.

```bash
npm install
cp .env.example .env.local      # fill SESSION_SECRET and JUDGE0_AUTH_TOKEN
npm run db:memory               # terminal 1: local MongoDB on :27018 (no install)
npm run seed:admin -- admin "Your Name"      # prints a generated password
npm run seed:demo               # optional: a live demo test + demo001-003 logins
npm run check:judge0            # optional: proves the Judge0 token works
npm run dev                     # http://localhost:3100
```

Set `MONGODB_URI=mongodb://127.0.0.1:27018` in `.env.local` when using `db:memory`.

## Deploy

Environment (see `.env.example`): `MONGODB_URI`, `MONGODB_DB`, `SESSION_SECRET`,
`JUDGE0_URL`, `JUDGE0_AUTH_HEADER`, `JUDGE0_AUTH_TOKEN`, `JUDGE0_MAX_CONCURRENCY`,
`NEXT_PUBLIC_APP_NAME`.

- **Docker (e.g. on EC2):** `docker build -t proctor .` then `docker run --env-file .env.production -p 3100:3100 proctor`. Put it behind HTTPS (Caddy); browsers only allow the camera on HTTPS or localhost.
- **Vercel:** set the same variables in the project. The Judge0 box must accept connections from Vercel.

Use a MongoDB database of its own for this product. The Judge0 instance is shared with MyCodeBud, so keep `JUDGE0_MAX_CONCURRENCY` modest (default 4 per server process).

## Problem format

Problems are stdin/stdout. Output is compared line by line after trimming
trailing spaces and trailing blank lines. Java submissions must declare
`public class Main`.
