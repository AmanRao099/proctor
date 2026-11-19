"use client";

import { useMemo, useState } from "react";
import { MagnifyingGlass } from "@phosphor-icons/react/dist/ssr/MagnifyingGlass";
import { Plus } from "@phosphor-icons/react/dist/ssr/Plus";
import { Badge, Button, Dialog, Input, Notice, Select, Skeleton } from "@/components/ui";
import { api, ApiError } from "@/lib/client/api";
import { DIFFICULTIES, type AdminProblem } from "@/lib/shared/types";
import { difficultyTone, useBank, type BankProblem } from "./BankPicker";
import { ProblemEditor, blankProblem } from "./ProblemEditor";

/**
 * DSA Master > Problems: the organisation's problem bank. Write once, add to
 * any number of tests (each test gets its own copy).
 */
export function ProblemBank() {
  const { list, error, reload } = useBank();
  const [q, setQ] = useState("");
  const [diff, setDiff] = useState("");
  const [editing, setEditing] = useState<AdminProblem | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<BankProblem | null>(null);

  const shown = useMemo(() => (list ?? []).filter((p) =>
    (!diff || p.difficulty === diff) && (!q || `${p.title} ${p.topics.join(" ")}`.toLowerCase().includes(q.toLowerCase()))), [list, q, diff]);
  const counts = useMemo(() => Object.fromEntries(DIFFICULTIES.map((d) => [d, (list ?? []).filter((p) => p.difficulty === d).length])), [list]);

  async function save() {
    if (!editing) return;
    setSaving(true);
    setSaveError(null);
    const payload = { ...editing, id: undefined, cases: editing.cases.map((c) => ({ ...c, id: c.id || undefined })) };
    try {
      if (editing.id) await api.put(`/api/admin/problems/${editing.id}`, payload);
      else await api.post("/api/admin/problems", payload);
      setEditing(null);
      reload();
    } catch (e) {
      setSaveError(e instanceof ApiError ? e.message : "Could not save.");
    } finally {
      setSaving(false);
    }
  }

  async function remove(p: BankProblem) {
    await api.del(`/api/admin/problems/${p.id}`).catch(() => {});
    setConfirmDelete(null);
    reload();
  }

  return (
    <div className="grid gap-5">
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative w-full max-w-xs">
          <MagnifyingGlass size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search title or topic" className="h-9 pl-9" aria-label="Search problems" />
        </div>
        <Select value={diff} onChange={(e) => setDiff(e.target.value)} className="h-9 w-40" aria-label="Difficulty">
          <option value="">All levels ({list?.length ?? 0})</option>
          {DIFFICULTIES.map((d) => <option key={d} value={d}>{d} ({counts[d] ?? 0})</option>)}
        </Select>
        <Button variant="primary" className="ml-auto" onClick={() => setEditing(blankProblem((list?.length ?? 0) + 1))}><Plus size={16} /> New problem</Button>
      </div>

      {error ? <Notice tone="bad" title="Could not load the bank">{error}</Notice> : null}
      {list === null && !error ? <div className="grid gap-2"><Skeleton className="h-14" /><Skeleton className="h-14" /></div> : null}
      {list?.length === 0 ? (
        <div className="rounded-card border border-dashed border-line-strong bg-surface/60 px-6 py-14 text-center">
          <p className="font-medium">The problem bank is empty</p>
          <p className="mx-auto mt-1 max-w-sm text-sm text-muted">Write problems here with their test cases, then add them to any test from the test editor.</p>
        </div>
      ) : null}

      {shown.length ? (
        <div className="overflow-hidden rounded-card border border-line bg-surface shadow-card">
          {shown.map((p) => (
            <div key={p.id} className="grid grid-cols-[1fr_auto] items-center gap-4 border-t border-line px-4 py-3 first:border-t-0 sm:grid-cols-[1fr_90px_90px_120px_auto]">
              <div className="min-w-0">
                <p className="truncate font-medium">{p.title}</p>
                <p className="truncate text-xs text-muted">{p.topics.join(", ") || "No topics"}</p>
              </div>
              <Badge tone={difficultyTone(p.difficulty)} className="hidden justify-self-start sm:inline-flex">{p.difficulty}</Badge>
              <span className="hidden font-mono text-xs text-muted sm:block">{p.marks} marks</span>
              <span className="hidden font-mono text-xs text-muted sm:block">{p.cases.filter((c) => !c.hidden).length} sample, {p.cases.filter((c) => c.hidden).length} hidden</span>
              <div className="flex items-center gap-1">
                {p.used_in ? <span className="mr-2 text-xs text-muted">in {p.used_in} test{p.used_in === 1 ? "" : "s"}</span> : null}
                <Button size="sm" variant="ghost" onClick={() => setEditing(p)}>Edit</Button>
                <Button size="sm" variant="ghost" onClick={() => setConfirmDelete(p)}>Delete</Button>
              </div>
            </div>
          ))}
        </div>
      ) : null}

      <Dialog
        open={!!editing}
        onClose={() => setEditing(null)}
        title={editing?.id ? "Edit problem" : "New problem"}
        width="max-w-4xl"
        footer={
          <>
            {saveError ? <p className="mr-auto self-center text-sm text-bad">{saveError}</p> : null}
            <Button onClick={() => setEditing(null)}>Cancel</Button>
            <Button variant="primary" busy={saving} onClick={save}>Save to bank</Button>
          </>
        }
      >
        {editing ? (
          <div className="-mx-1 max-h-[70vh] overflow-y-auto px-1">
            <ProblemEditor problem={editing} index={0} defaultOpen onChange={setEditing} onRemove={() => setEditing(null)} />
            {editing.id ? <p className="mt-3 text-xs text-muted">Tests that already contain this problem keep their own copy and are not changed.</p> : null}
          </div>
        ) : null}
      </Dialog>

      <Dialog
        open={!!confirmDelete}
        onClose={() => setConfirmDelete(null)}
        title="Delete from the bank?"
        tone="bad"
        footer={<><Button onClick={() => setConfirmDelete(null)}>Cancel</Button><Button variant="danger" onClick={() => confirmDelete && remove(confirmDelete)}>Delete</Button></>}
      >
        &quot;{confirmDelete?.title}&quot; leaves the bank. Tests that already contain it keep their copy.
      </Dialog>
    </div>
  );
}
