"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { MagnifyingGlass } from "@phosphor-icons/react/dist/ssr/MagnifyingGlass";
import { Button, Input, Skeleton, Textarea, Toggle } from "@/components/ui";
import { api } from "@/lib/client/api";

export interface CandidateRow {
  id: string;
  username: string;
  name: string;
  email: string;
  disabled: boolean;
}

export function CandidatePicker({
  assignAll, setAssignAll, selected, setSelected,
}: {
  assignAll: boolean;
  setAssignAll: (v: boolean) => void;
  selected: string[];
  setSelected: (ids: string[]) => void;
}) {
  const [all, setAll] = useState<CandidateRow[] | null>(null);
  const [query, setQuery] = useState("");
  const [paste, setPaste] = useState("");
  const [pasteNote, setPasteNote] = useState<string | null>(null);

  useEffect(() => {
    api.get<{ candidates: CandidateRow[] }>("/api/admin/candidates").then((r) => setAll(r.candidates)).catch(() => setAll([]));
  }, []);

  const chosen = useMemo(() => new Set(selected), [selected]);
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = all ?? [];
    return q ? list.filter((c) => `${c.name} ${c.username} ${c.email}`.toLowerCase().includes(q)) : list;
  }, [all, query]);

  function toggle(id: string) {
    setSelected(chosen.has(id) ? selected.filter((x) => x !== id) : [...selected, id]);
  }

  function addPasted() {
    const wanted = paste.split(/[\s,;]+/).map((s) => s.trim().toLowerCase()).filter(Boolean);
    const byName = new Map((all ?? []).map((c) => [c.username, c.id]));
    const found = wanted.map((u) => byName.get(u)).filter((x): x is string => !!x);
    const missing = wanted.filter((u) => !byName.has(u));
    setSelected(Array.from(new Set([...selected, ...found])));
    setPasteNote(`Added ${found.length}.${missing.length ? ` Not found: ${missing.slice(0, 6).join(", ")}${missing.length > 6 ? "..." : ""}` : ""}`);
    setPaste("");
  }

  return (
    <div className="grid gap-5">
      <Toggle
        checked={assignAll}
        onChange={setAssignAll}
        label="Open to every candidate account"
        description="Anyone with a candidate login can take it, including accounts created later."
      />
      {assignAll ? null : (
        <div className="grid gap-5 lg:grid-cols-[1fr_280px]">
          <div className="min-w-0 rounded-ui border border-line bg-surface">
            <div className="flex items-center gap-2 border-b border-line p-3">
              <div className="relative flex-1">
                <MagnifyingGlass size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
                <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search name or username" className="h-9 pl-9" aria-label="Search candidates" />
              </div>
              <Button size="sm" variant="ghost" onClick={() => setSelected(Array.from(new Set([...selected, ...shown.map((c) => c.id)])))}>Select shown</Button>
              <Button size="sm" variant="ghost" onClick={() => setSelected([])}>Clear</Button>
            </div>
            <div className="max-h-80 overflow-y-auto">
              {all === null ? <div className="grid gap-2 p-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-8" />)}</div> : null}
              {all?.length === 0 ? (
                <p className="p-6 text-center text-sm text-muted">No candidates yet. <Link href="/admin/candidates" className="text-accent hover:underline">Create accounts</Link> first.</p>
              ) : null}
              {shown.map((c) => (
                <label key={c.id} className="flex cursor-pointer items-center gap-3 border-t border-line px-3 py-2 text-sm first:border-t-0 hover:bg-sunken/60">
                  <input type="checkbox" checked={chosen.has(c.id)} onChange={() => toggle(c.id)} className="h-4 w-4 accent-[var(--accent)]" />
                  <span className="min-w-0 flex-1 truncate">{c.name}</span>
                  <span className="font-mono text-xs text-muted">{c.username}</span>
                </label>
              ))}
            </div>
            <p className="border-t border-line px-3 py-2 text-xs text-muted">{selected.length} selected</p>
          </div>
          <div className="grid content-start gap-2">
            <p className="text-[13px] font-medium text-ink-2">Add by username</p>
            <Textarea value={paste} onChange={(e) => setPaste(e.target.value)} placeholder={"cand001\ncand002"} className="min-h-32 font-mono text-[12.5px]" />
            <Button size="sm" onClick={addPasted} disabled={!paste.trim()} className="justify-self-start">Add these</Button>
            {pasteNote ? <p className="text-xs text-muted">{pasteNote}</p> : null}
          </div>
        </div>
      )}
    </div>
  );
}
