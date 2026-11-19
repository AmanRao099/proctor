"use client";

import { useEffect, useState } from "react";
import { DownloadSimple, FilePdf, MagnifyingGlass } from "@phosphor-icons/react/dist/ssr";
import { PageHeader } from "@/components/admin/AdminShell";
import { downloadText, sheetCsv } from "@/components/admin/ResultsBoard";
import { Button, Field, Input, Notice, Select, Toggle } from "@/components/ui";
import { api, ApiError, formatWhen } from "@/lib/client/api";
import type { Sheet } from "@/lib/shared/sheet";

interface TestOpt { id: string; title: string; starts_at: string; status: string }
interface SubRow {
  at: string; name: string; username: string; email: string; test: string; problem: string; difficulty: string;
  language: string; status: string; passed: number; total: number; marks_obtained: number; marks: number; code?: string;
}

const cell = (v: unknown) => {
  const s = String(v ?? "");
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/*
 * Reports (MyCodeBud's Performance Reports + CSV Reports):
 *   Test reports      the result sheet as PDF or CSV, and every student's
 *                     performance report as PDFs in one go.
 *   Submissions log   every Submit, filterable, as CSV (optionally with code).
 */
export default function ReportsPage() {
  const [tests, setTests] = useState<TestOpt[]>([]);
  const [test, setTest] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const [subTest, setSubTest] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [q, setQ] = useState("");
  const [withCode, setWithCode] = useState(false);
  const [preview, setPreview] = useState<SubRow[] | null>(null);

  useEffect(() => {
    api.get<{ tests: TestOpt[] }>("/api/admin/tests").then((r) => {
      const pub = r.tests.filter((t) => t.status === "published");
      setTests(pub);
      if (pub[0]) setTest(pub[0].id);
    }).catch(() => {});
  }, []);

  async function sheet(): Promise<Sheet> {
    return api.get<Sheet>(`/api/admin/tests/${test}/results`);
  }

  async function run(kind: "pdf" | "csv" | "students") {
    if (!test) return;
    setBusy(kind);
    setError(null);
    setNote(null);
    try {
      const s = await sheet();
      const pdf = await import("@/lib/client/pdf");
      if (kind === "csv") downloadText(`${s.test.title.replace(/[^\w-]+/g, "_")}_results.csv`, sheetCsv(s));
      if (kind === "pdf") await pdf.resultSheetPdf(s);
      if (kind === "students") {
        const sat = s.rows.filter((r) => r.state !== "not_started" && r.attempt_id);
        for (const row of sat) {
          const detail = await api.get<{ problems: { title: string; best: { language: string; code: string } | null }[] }>(`/api/admin/attempts/${row.attempt_id}`);
          await pdf.studentReportPdf(s, row, detail.problems.map((p) => ({ title: p.title, language: p.best?.language ?? "", code: p.best?.code ?? "" })));
        }
        setNote(`${sat.length} report${sat.length === 1 ? "" : "s"} downloaded. Your browser may ask once to allow multiple downloads.`);
      }
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not build the report.");
    } finally {
      setBusy(null);
    }
  }

  function subUrl() {
    const p = new URLSearchParams();
    if (subTest) p.set("test", subTest);
    if (from) p.set("from", from);
    if (to) p.set("to", to);
    if (q.trim()) p.set("q", q.trim());
    if (withCode) p.set("code", "1");
    return `/api/admin/reports/submissions?${p}`;
  }

  async function loadSubs(download: boolean) {
    setBusy(download ? "subs-csv" : "subs");
    setError(null);
    try {
      const r = await api.get<{ rows: SubRow[] }>(subUrl());
      setPreview(r.rows);
      if (download) {
        const head = ["Submitted at", "Name", "Username", "Email", "Test", "Problem", "Difficulty", "Language", "Status", "Passed", "Total", "Marks", "Out of", ...(withCode ? ["Code"] : [])];
        const body = r.rows.map((x) => [x.at, x.name, x.username, x.email, x.test, x.problem, x.difficulty, x.language, x.status, x.passed, x.total, x.marks_obtained, x.marks, ...(withCode ? [x.code ?? ""] : [])]);
        downloadText(`submissions_${new Date().toISOString().slice(0, 10)}.csv`, [head, ...body].map((l) => l.map(cell).join(",")).join("\n"));
      }
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not load submissions.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div>
      <PageHeader title="Reports" subtitle="Finished documents for a test, and the raw submission log for analysis." />
      {error ? <div className="mb-4"><Notice tone="bad" title="Report failed">{error}</Notice></div> : null}
      {note ? <div className="mb-4"><Notice tone="ok" title="Done">{note}</Notice></div> : null}

      <section className="rounded-ui border border-line bg-surface p-5">
        <h2 className="font-semibold">Test reports</h2>
        <p className="mt-1 text-sm text-muted">The ranked result sheet with every violation under its student, and a performance report per student: rank, percentile, radar against the cohort, per-problem marks, proctoring record and the scoring code.</p>
        <div className="mt-5 flex flex-wrap items-end gap-3">
          <Field label="Test" className="w-full max-w-md">
            {(id) => (
              <Select id={id} value={test} onChange={(e) => setTest(e.target.value)}>
                {tests.length === 0 ? <option value="">No published tests</option> : null}
                {tests.map((t) => <option key={t.id} value={t.id}>{t.title} | {formatWhen(t.starts_at)}</option>)}
              </Select>
            )}
          </Field>
          <Button variant="primary" disabled={!test || !!busy} busy={busy === "pdf"} onClick={() => run("pdf")}><FilePdf size={16} /> Result sheet PDF</Button>
          <Button disabled={!test || !!busy} busy={busy === "csv"} onClick={() => run("csv")}><DownloadSimple size={16} /> Result sheet CSV</Button>
          <Button disabled={!test || !!busy} busy={busy === "students"} onClick={() => run("students")}><FilePdf size={16} /> All student reports</Button>
        </div>
        <p className="mt-3 text-xs text-muted">A single student&apos;s report is also on the results board: click their row.</p>
      </section>

      <section className="mt-8 rounded-ui border border-line bg-surface p-5">
        <h2 className="font-semibold">Submissions log</h2>
        <p className="mt-1 text-sm text-muted">Every Submit a student made, newest first: test, problem, language, verdict, tests passed and marks.</p>
        <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Test">
            {(id) => (
              <Select id={id} value={subTest} onChange={(e) => setSubTest(e.target.value)}>
                <option value="">All tests</option>
                {tests.map((t) => <option key={t.id} value={t.id}>{t.title}</option>)}
              </Select>
            )}
          </Field>
          <Field label="From">{(id) => <Input id={id} type="date" value={from} onChange={(e) => setFrom(e.target.value)} />}</Field>
          <Field label="To">{(id) => <Input id={id} type="date" value={to} onChange={(e) => setTo(e.target.value)} />}</Field>
          <Field label="Search">
            {(id) => (
              <div className="relative">
                <MagnifyingGlass size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
                <Input id={id} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Student, test or problem" className="pl-9" />
              </div>
            )}
          </Field>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <Toggle checked={withCode} onChange={setWithCode} label="Include code" description="Makes the file much larger." />
          <div className="ml-auto flex gap-2">
            <Button busy={busy === "subs"} disabled={!!busy} onClick={() => loadSubs(false)}>Preview</Button>
            <Button variant="primary" busy={busy === "subs-csv"} disabled={!!busy} onClick={() => loadSubs(true)}><DownloadSimple size={16} /> Download CSV</Button>
          </div>
        </div>
        {preview ? (
          <div className="mt-5 overflow-x-auto rounded-ui border border-line">
            <table className="w-full min-w-[760px] text-sm">
              <thead><tr className="border-b border-line text-left text-xs text-muted">
                <th className="px-3 py-2 font-medium">When</th><th className="px-3 py-2 font-medium">Student</th><th className="px-3 py-2 font-medium">Test / problem</th>
                <th className="px-3 py-2 font-medium">Language</th><th className="px-3 py-2 font-medium">Verdict</th><th className="px-3 py-2 text-right font-medium">Marks</th>
              </tr></thead>
              <tbody>
                {preview.slice(0, 50).map((x, i) => (
                  <tr key={i} className="border-t border-line first:border-t-0">
                    <td className="px-3 py-2 text-xs text-muted">{formatWhen(x.at)}</td>
                    <td className="px-3 py-2">{x.name} <span className="font-mono text-xs text-muted">{x.username}</span></td>
                    <td className="max-w-64 truncate px-3 py-2 text-ink-2">{x.test} | {x.problem}</td>
                    <td className="px-3 py-2 text-xs">{x.language}</td>
                    <td className="px-3 py-2 text-xs">{x.status.replace("_", " ")} ({x.passed}/{x.total})</td>
                    <td className="px-3 py-2 text-right font-mono text-xs tabular">{x.marks_obtained}/{x.marks}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="border-t border-line px-3 py-2 text-xs text-muted">{preview.length} row{preview.length === 1 ? "" : "s"}{preview.length > 50 ? ", first 50 shown" : ""}.</p>
          </div>
        ) : null}
      </section>
    </div>
  );
}
