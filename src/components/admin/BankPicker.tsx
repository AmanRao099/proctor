"use client";

import { useEffect, useMemo, useState } from "react";
import { MagnifyingGlass } from "@phosphor-icons/react/dist/ssr/MagnifyingGlass";
import { Badge, Button, Dialog, Input, Select, Skeleton } from "@/components/ui";
import { useApi } from "@/lib/client/useApi";
import { DIFFICULTIES, type AdminProblem } from "@/lib/shared/types";

export type BankProblem = AdminProblem & { used_in: number };

export function useBank(open = true) {
  const { data, error, reload } = useApi<{ problems: BankProblem[] }>(open ? "/api/admin/problems" : null);
  return { list: data ? data.problems : null, error, reload };
}

const TONE: Record<string, "ok" | "warn" | "bad"> = { Easy: "ok", Medium: "warn", Hard: "bad" };
export const difficultyTone = (d: string) => TONE[d] ?? "warn";

/** Pick bank problems to COPY into a test. */
export function BankPicker({ open, onClose, onAdd, exclude }: {
  open: boolean;
  onClose: () => void;
  onAdd: (picked: BankProblem[]) => void;
  exclude: string[];
}) {
  const { list } = useBank(open);
  const [q, setQ] = useState("");
  const [diff, setDiff] = useState("");
  const [picked, setPicked] = useState<string[]>([]);
  const shown = useMemo(() => (list ?? []).filter((p) =>
    !exclude.includes(p.id)
    && (!diff || p.difficulty === diff)
    && (!q || `${p.title} ${p.topics.join(" ")}`.toLowerCase().includes(q.toLowerCase()))), [list, q, diff, exclude]);

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Add from the problem bank"
      width="max-w-2xl"
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" disabled={!picked.length} onClick={() => { onAdd((list ?? []).filter((p) => picked.includes(p.id))); setPicked([]); }}>
            Add {picked.length || ""} problem{picked.length === 1 ? "" : "s"}
          </Button>
        </>
      }
    >
      <div className="flex gap-2">
        <div className="relative flex-1">
          <MagnifyingGlass size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search title or topic" className="h-9 pl-9" aria-label="Search problems" />
        </div>
        <Select value={diff} onChange={(e) => setDiff(e.target.value)} className="h-9 w-32" aria-label="Difficulty">
          <option value="">Any level</option>
          {DIFFICULTIES.map((d) => <option key={d}>{d}</option>)}
        </Select>
      </div>
      <div className="mt-3 max-h-80 overflow-y-auto rounded-ui border border-line">
        {list === null ? <div className="grid gap-2 p-3"><Skeleton className="h-8" /><Skeleton className="h-8" /></div> : null}
        {list && shown.length === 0 ? <p className="p-6 text-center text-sm text-muted">No problems match. Add problems in DSA Master, Problems.</p> : null}
        {shown.map((p) => (
          <label key={p.id} className="flex cursor-pointer items-center gap-3 border-t border-line px-3 py-2.5 first:border-t-0 hover:bg-sunken/60">
            <input
              type="checkbox"
              checked={picked.includes(p.id)}
              onChange={() => setPicked((x) => (x.includes(p.id) ? x.filter((y) => y !== p.id) : [...x, p.id]))}
              className="h-4 w-4 accent-[var(--accent)]"
            />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-ink">{p.title}</span>
              <span className="block truncate text-xs text-muted">{p.topics.join(", ") || "No topics"} | {p.cases.length} cases</span>
            </span>
            <Badge tone={difficultyTone(p.difficulty)}>{p.difficulty}</Badge>
            <span className="w-14 text-right font-mono text-xs text-muted">{p.marks} mk</span>
          </label>
        ))}
      </div>
      <p className="mt-2 text-xs text-muted">Problems are copied into the test. Later edits in the bank do not change this test.</p>
    </Dialog>
  );
}
