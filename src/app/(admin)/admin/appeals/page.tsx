"use client";

import { useCallback, useEffect, useState } from "react";
import { PageHeader } from "@/components/admin/AdminShell";
import { Badge, Button, Person, Notice, Select, Skeleton, Textarea, EmptyState } from "@/components/ui";
import { useApi } from "@/lib/client/useApi";
import { api, ApiError, formatWhen } from "@/lib/client/api";

interface Appeal {
  id: string; user_id: string; name: string; username: string; email: string; message: string;
  status: "pending" | "approved" | "rejected"; strike_count: number; created_at: string; resolved_at: string | null; admin_note: string;
  strikes: { occurred_at: string; test: string; violation_count: number; violation_types: string[]; forgiven: boolean }[];
}

/*
 * Ban appeals: the admin end of the proctoring lockout (MyCodeBud's
 * ProctorAppealsTab). A student whose tests the proctor handed in five times
 * is barred from proctored tests until someone here decides. Approving
 * forgives every strike (stamped, never deleted); rejecting keeps the ban and
 * lets them appeal again. The strike history sits beside each appeal, because
 * judging a paragraph without seeing what happened is guessing.
 */
function AppealCard({ a, onDone }: { a: Appeal; onDone: () => void }) {
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState<"approved" | "rejected" | null>(null);
  const [error, setError] = useState<string | null>(null);
  async function decide(status: "approved" | "rejected") {
    setBusy(status);
    try {
      await api.patch(`/api/admin/appeals/${a.id}`, { status, admin_note: note });
      onDone();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not save.");
      setBusy(null);
    }
  }
  return (
    <article className="rounded-ui border border-line bg-surface">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-line px-5 py-4">
        <div>
          <Person name={a.name} sub={`${a.username} | appealed ${formatWhen(a.created_at)} with ${a.strike_count} active strikes`} size={38} />
        </div>
        <Badge tone={a.status === "pending" ? "warn" : a.status === "approved" ? "ok" : "bad"}>{a.status[0].toUpperCase() + a.status.slice(1)}</Badge>
      </div>
      <div className="grid gap-5 px-5 py-4 lg:grid-cols-[1fr_1fr]">
        <div>
          <p className="text-xs font-medium text-muted">Their message</p>
          <p className="mt-1.5 whitespace-pre-wrap text-sm leading-relaxed text-ink-2">{a.message}</p>
        </div>
        <div>
          <p className="text-xs font-medium text-muted">Strike history</p>
          <ol className="mt-1.5 grid gap-2">
            {a.strikes.map((s, i) => (
              <li key={i} className="rounded-ui border border-line bg-bg px-3 py-2 text-sm">
                <p className="flex justify-between gap-3">
                  <span className="truncate">{s.test || "Test"}</span>
                  <span className="shrink-0 text-xs text-muted">{formatWhen(s.occurred_at)}{s.forgiven ? " | forgiven" : ""}</span>
                </p>
                <p className="mt-0.5 text-xs text-muted">{s.violation_count} violations: {Array.from(new Set(s.violation_types)).slice(0, 4).join("; ")}</p>
              </li>
            ))}
          </ol>
        </div>
      </div>
      {a.status === "pending" ? (
        <div className="grid gap-3 border-t border-line px-5 py-4">
          <Textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="Note for the record (optional)" className="min-h-16" aria-label="Admin note" />
          {error ? <p className="text-sm text-bad">{error}</p> : null}
          <div className="flex gap-2">
            <Button variant="primary" busy={busy === "approved"} disabled={!!busy} onClick={() => decide("approved")}>Approve and forgive strikes</Button>
            <Button variant="danger" busy={busy === "rejected"} disabled={!!busy} onClick={() => decide("rejected")}>Reject</Button>
          </div>
        </div>
      ) : a.admin_note ? (
        <p className="border-t border-line px-5 py-3 text-sm text-ink-2"><span className="text-muted">Note: </span>{a.admin_note}</p>
      ) : null}
    </article>
  );
}

export default function AppealsPage() {
  const [status, setStatus] = useState("pending");
  const { data, error, reload: load } = useApi<{ appeals: Appeal[] }>(`/api/admin/appeals?status=${status}`);
  const list = data ? data.appeals : null;

  return (
    <div>
      <PageHeader
        title="Ban Appeals"
        subtitle="Students barred after five proctor-forced hand-ins ask for proctored tests back."
        actions={
          <Select value={status} onChange={(e) => setStatus(e.target.value)} className="h-9 w-40" aria-label="Status">
            <option value="pending">Pending</option>
            <option value="approved">Approved</option>
            <option value="rejected">Rejected</option>
            <option value="all">All</option>
          </Select>
        }
      />
      {error ? <Notice tone="bad" title="Could not load">{error}</Notice> : null}
      {list === null && !error ? <Skeleton className="h-40" /> : null}
      {list?.length === 0 ? (
        <EmptyState image="all-clear" title={`No ${status === "all" ? "" : status + " "}appeals`}>A barred student can appeal from their dashboard.</EmptyState>
      ) : null}
      <div className="grid gap-4">{list?.map((a) => <AppealCard key={a.id} a={a} onDone={load} />)}</div>
    </div>
  );
}
