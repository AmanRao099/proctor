"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { ArrowLeft, Plus } from "@phosphor-icons/react/dist/ssr";
import { Badge, Button, Dialog, Field, Input, Notice, Skeleton, Textarea, Toggle } from "@/components/ui";
import { api, ApiError } from "@/lib/client/api";
import { DEFAULT_PROCTORING, type ProctoringSettings } from "@/lib/shared/proctoring";
import type { AdminProblem, AdminTest } from "@/lib/shared/types";
import { CandidatePicker } from "./CandidatePicker";
import { ProblemEditor, blankProblem } from "./ProblemEditor";
import { ProctoringForm } from "./ProctoringForm";

/** ISO to the value a datetime-local input wants, in the admin's own timezone. */
function toLocalInput(iso: string) {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function defaultWindow() {
  const start = new Date();
  start.setDate(start.getDate() + 1);
  start.setHours(10, 0, 0, 0);
  const end = new Date(start);
  end.setHours(13, 0, 0, 0);
  return { starts: toLocalInput(start.toISOString()), ends: toLocalInput(end.toISOString()) };
}

type Draft = {
  title: string;
  instructions: string;
  duration_minutes: number;
  starts: string;
  ends: string;
  proctored: boolean;
  show_results: boolean;
  proctoring: ProctoringSettings;
  problems: AdminProblem[];
  assign_all: boolean;
  candidate_ids: string[];
};

const SECTIONS = [
  { id: "details", label: "Details" },
  { id: "problems", label: "Problems" },
  { id: "candidates", label: "Candidates" },
  { id: "proctoring", label: "Proctoring" },
];

export function TestEditor({ testId }: { testId?: string }) {
  const router = useRouter();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [status, setStatus] = useState<"draft" | "published">("draft");
  const [attempts, setAttempts] = useState(0);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState<"draft" | "published" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    if (!testId) {
      const w = defaultWindow();
      setDraft({
        title: "", instructions: "", duration_minutes: 90, starts: w.starts, ends: w.ends,
        proctored: true, show_results: true, proctoring: DEFAULT_PROCTORING,
        problems: [blankProblem(1)], assign_all: false, candidate_ids: [],
      });
      return;
    }
    api.get<{ test: AdminTest; attempts: number }>(`/api/admin/tests/${testId}`)
      .then(({ test, attempts }) => {
        setStatus(test.status);
        setAttempts(attempts);
        setDraft({
          title: test.title, instructions: test.instructions, duration_minutes: test.duration_minutes,
          starts: toLocalInput(test.starts_at), ends: toLocalInput(test.ends_at),
          proctored: test.proctored, show_results: test.show_results, proctoring: test.proctoring,
          problems: test.problems, assign_all: test.assign_all, candidate_ids: test.candidate_ids,
        });
      })
      .catch((e) => setLoadError(e instanceof ApiError ? e.message : "Could not load this test."));
  }, [testId]);

  if (loadError) return <Notice tone="bad" title="Could not open the test">{loadError}</Notice>;
  if (!draft) return <div className="grid gap-3"><Skeleton className="h-8 w-1/3" /><Skeleton className="h-64" /></div>;

  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setDraft((d) => (d ? { ...d, [k]: v } : d));
  const setProblem = (i: number, p: AdminProblem) => set("problems", draft.problems.map((x, j) => (j === i ? p : x)));
  const totalMarks = draft.problems.reduce((s, p) => s + (Number(p.marks) || 0), 0);

  async function save(next: "draft" | "published") {
    if (!draft) return;
    setSaving(next);
    setError(null);
    const payload = {
      title: draft.title,
      instructions: draft.instructions,
      duration_minutes: Number(draft.duration_minutes),
      starts_at: new Date(draft.starts).toISOString(),
      ends_at: new Date(draft.ends).toISOString(),
      status: next,
      proctored: draft.proctored,
      show_results: draft.show_results,
      proctoring: draft.proctoring,
      problems: draft.problems.map((p) => ({ ...p, id: p.id || undefined, cases: p.cases.map((c) => ({ ...c, id: c.id || undefined })) })),
      assign_all: draft.assign_all,
      candidate_ids: draft.candidate_ids,
    };
    try {
      if (testId) {
        await api.put(`/api/admin/tests/${testId}`, payload);
        const fresh = await api.get<{ test: AdminTest }>(`/api/admin/tests/${testId}`);
        setDraft((d) => (d ? { ...d, problems: fresh.test.problems } : d));
        setStatus(next);
        setSavedAt(new Date().toLocaleTimeString());
      } else {
        const res = await api.post<{ id: string }>("/api/admin/tests", payload);
        router.replace(`/admin/tests/${res.id}`);
      }
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not save.");
    } finally {
      setSaving(null);
    }
  }

  async function remove() {
    if (!testId) return;
    try {
      await api.del(`/api/admin/tests/${testId}`);
      router.replace("/admin");
    } catch (e) {
      setConfirmDelete(false);
      setError(e instanceof ApiError ? e.message : "Could not delete.");
    }
  }

  return (
    <div className="grid gap-8 lg:grid-cols-[180px_1fr]">
      <aside className="hidden lg:block">
        <div className="sticky top-24 grid gap-1">
          <Link href="/admin" className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted hover:text-ink"><ArrowLeft size={14} /> All tests</Link>
          {SECTIONS.map((s) => (
            <a key={s.id} href={`#${s.id}`} className="rounded-ui px-2.5 py-1.5 text-sm text-muted hover:bg-sunken hover:text-ink">{s.label}</a>
          ))}
          {testId && status === "published" ? (
            <Link href={`/admin/tests/${testId}/results`} className="mt-4 rounded-ui px-2.5 py-1.5 text-sm text-accent hover:bg-accent-soft">Results</Link>
          ) : null}
        </div>
      </aside>

      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold tracking-tight">{testId ? draft.title || "Untitled test" : "New test"}</h1>
          {testId ? <Badge tone={status === "published" ? "accent" : "neutral"}>{status === "published" ? "Published" : "Draft"}</Badge> : null}
        </div>
        {attempts > 0 ? (
          <div className="mt-4">
            <Notice tone="warn" title={`${attempts} candidate${attempts === 1 ? " has" : "s have"} started this test`}>
              Edits apply to them immediately. Changing test cases does not rescore submissions already made.
            </Notice>
          </div>
        ) : null}

        <section id="details" className="scroll-mt-24 pt-8">
          <h2 className="text-base font-semibold">Details</h2>
          <div className="mt-4 grid gap-5">
            <Field label="Title">{(id) => <Input id={id} value={draft.title} onChange={(e) => set("title", e.target.value)} placeholder="Campus coding round, November" />}</Field>
            <Field label="Instructions" hint="Shown to candidates on the system check page before they start.">
              {(id) => <Textarea id={id} value={draft.instructions} onChange={(e) => set("instructions", e.target.value)} />}
            </Field>
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="Opens">{(id) => <Input id={id} type="datetime-local" value={draft.starts} onChange={(e) => set("starts", e.target.value)} />}</Field>
              <Field label="Closes">{(id) => <Input id={id} type="datetime-local" value={draft.ends} onChange={(e) => set("ends", e.target.value)} />}</Field>
              <Field label="Duration (minutes)" hint="Per candidate, from when they open the paper.">
                {(id) => <Input id={id} type="number" min={1} max={600} value={draft.duration_minutes} onChange={(e) => set("duration_minutes", Number(e.target.value))} />}
              </Field>
            </div>
            <Toggle checked={draft.show_results} onChange={(v) => set("show_results", v)} label="Show scores to candidates" description="Off: candidates see only that a submission was recorded." />
          </div>
        </section>

        <section id="problems" className="scroll-mt-24 border-t border-line pt-8 mt-10">
          <div className="flex items-baseline justify-between">
            <h2 className="text-base font-semibold">Problems</h2>
            <span className="font-mono text-xs text-muted">{draft.problems.length} problems | {totalMarks} marks</span>
          </div>
          <div className="mt-4 grid gap-3">
            {draft.problems.map((p, i) => (
              <ProblemEditor
                key={p.id || `new-${i}`}
                problem={p}
                index={i}
                defaultOpen={!testId && i === 0}
                onChange={(np) => setProblem(i, np)}
                onRemove={() => set("problems", draft.problems.filter((_, j) => j !== i))}
                onDuplicate={() => set("problems", [
                  ...draft.problems.slice(0, i + 1),
                  { ...p, id: "", title: `${p.title} (copy)`, cases: p.cases.map((c) => ({ ...c, id: "" })) },
                  ...draft.problems.slice(i + 1),
                ])}
              />
            ))}
          </div>
          <Button className="mt-3" onClick={() => set("problems", [...draft.problems, blankProblem(draft.problems.length + 1)])}>
            <Plus size={16} /> Add problem
          </Button>
        </section>

        <section id="candidates" className="scroll-mt-24 border-t border-line pt-8 mt-10">
          <h2 className="text-base font-semibold">Candidates</h2>
          <div className="mt-4">
            <CandidatePicker
              assignAll={draft.assign_all}
              setAssignAll={(v) => set("assign_all", v)}
              selected={draft.candidate_ids}
              setSelected={(ids) => set("candidate_ids", ids)}
            />
          </div>
        </section>

        <section id="proctoring" className="scroll-mt-24 border-t border-line pt-8 mt-10">
          <h2 className="text-base font-semibold">Proctoring</h2>
          <div className="mt-4">
            <ProctoringForm
              value={draft.proctoring}
              onChange={(v) => set("proctoring", v)}
              proctored={draft.proctored}
              setProctored={(v) => set("proctored", v)}
            />
          </div>
        </section>

        <div className="sticky bottom-0 z-20 mt-12 border-t border-line bg-bg/95 py-4 backdrop-blur">
          {error ? <p className="mb-3 text-sm text-bad" role="alert">{error}</p> : null}
          <div className="flex flex-wrap items-center gap-3">
            <Button variant="primary" busy={saving === "published"} disabled={!!saving} onClick={() => save("published")}>
              {status === "published" ? "Save changes" : "Publish"}
            </Button>
            <Button busy={saving === "draft"} disabled={!!saving} onClick={() => save("draft")}>
              {status === "published" ? "Unpublish" : "Save draft"}
            </Button>
            {savedAt ? <span className="text-xs text-muted">Saved at {savedAt}</span> : null}
            {testId && attempts === 0 ? (
              <Button variant="danger" className="ml-auto" onClick={() => setConfirmDelete(true)}>Delete</Button>
            ) : null}
          </div>
        </div>
      </div>

      <Dialog
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        title="Delete this test?"
        tone="bad"
        footer={<><Button onClick={() => setConfirmDelete(false)}>Cancel</Button><Button variant="danger" onClick={remove}>Delete test</Button></>}
      >
        This removes the test and its problems permanently. It cannot be undone.
      </Dialog>
    </div>
  );
}
