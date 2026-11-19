"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowsOut } from "@phosphor-icons/react/dist/ssr/ArrowsOut";
import { Camera } from "@phosphor-icons/react/dist/ssr/Camera";
import { CameraSlash } from "@phosphor-icons/react/dist/ssr/CameraSlash";
import { Eye } from "@phosphor-icons/react/dist/ssr/Eye";
import { MagnifyingGlass } from "@phosphor-icons/react/dist/ssr/MagnifyingGlass";
import { ShieldWarning } from "@phosphor-icons/react/dist/ssr/ShieldWarning";
import { WifiSlash } from "@phosphor-icons/react/dist/ssr/WifiSlash";
import { PageHeader, Stat, StatGrid } from "@/components/admin/AdminShell";
import { Avatar, Input, Notice, Person, Select, Skeleton, cx } from "@/components/ui";
import { useApi } from "@/lib/client/useApi";
import { api, ApiError, formatDuration } from "@/lib/client/api";
import type { Violation } from "@/lib/shared/types";

interface Writing {
  attempt_id: string; test_id: string; test: string; user_id: string; name: string; username: string;
  started_at: string; remaining_seconds: number; problem: string;
  marks_obtained: number; total_marks: number; solved: number; problem_count: number;
  violation_count: number; last_violation: Violation | null;
  signal: boolean; last_seen: string | null;
  camera_live: boolean | null; fullscreen: boolean | null; focused: boolean | null; face_status: string | null;
}
interface Data { writing: Writing[]; online: { user_id: string; name: string; username: string; last_login_at: string | null }[] }

const FACE: Record<string, string> = { no_face: "No face", multiple_faces: "Multiple faces", looking_away: "Looking away" };

function ago(iso: string | null) {
  if (!iso) return "never";
  const s = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
  return s < 60 ? `${s}s ago` : `${Math.floor(s / 60)}m ago`;
}

function Signal({ w }: { w: Writing }) {
  if (!w.signal) return <span className="inline-flex items-center gap-1 text-xs text-bad"><WifiSlash size={14} /> No signal</span>;
  const issues: string[] = [];
  if (w.camera_live === false) issues.push("camera off");
  if (w.fullscreen === false) issues.push("out of fullscreen");
  if (w.focused === false) issues.push("window unfocused");
  if (w.face_status && FACE[w.face_status]) issues.push(FACE[w.face_status].toLowerCase());
  return (
    <span className="flex items-center gap-2 text-xs">
      <span title={w.camera_live === false ? "Camera off" : "Camera on"} className={w.camera_live === false ? "text-bad" : "text-ok"}>
        {w.camera_live === false ? <CameraSlash size={15} /> : <Camera size={15} />}
      </span>
      <span title={w.fullscreen === false ? "Out of fullscreen" : "Fullscreen"} className={w.fullscreen === false ? "text-bad" : "text-ok"}><ArrowsOut size={15} /></span>
      <span title={w.focused === false ? "Window not focused" : "Focused"} className={w.focused === false ? "text-warn" : "text-ok"}><Eye size={15} /></span>
      {issues.length ? <span className="text-warn">{issues.join(", ")}</span> : <span className="text-muted">ok</span>}
    </span>
  );
}

export default function ActivePage() {
  const { data, error } = useApi<Data>("/api/admin/active", { refreshMs: 10_000 });
  const [q, setQ] = useState("");
  const [test, setTest] = useState("");
  const [updated, setUpdated] = useState<Date | null>(null);
  useEffect(() => { if (data) setUpdated(new Date()); }, [data]);

  const tests = useMemo(() => [...new Map((data?.writing ?? []).map((w) => [w.test_id, w.test])).entries()], [data]);
  const rows = (data?.writing ?? []).filter((w) =>
    (!test || w.test_id === test) && (!q || `${w.name} ${w.username}`.toLowerCase().includes(q.toLowerCase())));
  const all = data?.writing ?? [];

  return (
    <div>
      <PageHeader
        title="Active Students"
        subtitle={<>Everyone writing a test right now. Refreshes every 10 seconds{updated ? `, last at ${updated.toLocaleTimeString()}` : ""}.</>}
      />
      {error ? <div className="mb-4"><Notice tone="bad" title="Live view interrupted">{error}</Notice></div> : null}
      {!data && !error ? <div className="grid gap-3"><Skeleton className="h-20" /><Skeleton className="h-64" /></div> : null}

      {data ? (
        <div className="grid gap-8">
          <StatGrid>
            <Stat label="Writing now" value={all.length} tone={all.length ? "accent" : undefined} />
            <Stat label="No signal" value={all.filter((w) => !w.signal).length} tone={all.some((w) => !w.signal) ? "bad" : undefined} hint="No heartbeat for 45 s" />
            <Stat label="Camera or fullscreen issue" value={all.filter((w) => w.signal && (w.camera_live === false || w.fullscreen === false)).length} />
            <Stat label="With violations" value={all.filter((w) => w.violation_count > 0).length} tone={all.some((w) => w.violation_count) ? "warn" : undefined} />
          </StatGrid>

          <div className="flex flex-wrap items-center gap-3">
            <div className="relative w-full max-w-xs">
              <MagnifyingGlass size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
              <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search students" className="h-9 pl-9" aria-label="Search" />
            </div>
            {tests.length > 1 ? (
              <Select value={test} onChange={(e) => setTest(e.target.value)} className="h-9 w-56" aria-label="Test">
                <option value="">All live tests</option>
                {tests.map(([id, title]) => <option key={id} value={id}>{title}</option>)}
              </Select>
            ) : null}
          </div>

          {all.length === 0 ? (
            <div className="rounded-card border border-dashed border-line-strong bg-surface/60 px-6 py-14 text-center">
              <p className="font-medium">Nobody is writing a test right now</p>
              <p className="mt-1 text-sm text-muted">Students appear here the moment they open a paper.</p>
            </div>
          ) : (
            <div className="overflow-x-auto rounded-card border border-line bg-surface shadow-card">
              <table className="data-table min-w-[900px]">
                <thead>
                  <tr>
                    <th className="px-4 py-3 font-medium">Student</th>
                    <th className="px-3 py-3 font-medium">On problem</th>
                    <th className="px-3 py-3 font-medium">Proctor</th>
                    <th className="px-3 py-3 text-right font-medium">Marks</th>
                    <th className="px-3 py-3 text-right font-medium">Time left</th>
                    <th className="px-4 py-3 font-medium">Violations</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((w) => (
                    <tr key={w.attempt_id} className={cx("", !w.signal && "bg-bad-soft/40")}>
                      <td className="px-4 py-3">
                        <Person name={w.name} sub={<>{w.username} | <Link href={`/admin/tests/${w.test_id}/results`} className="hover:text-ink">{w.test}</Link></>} />
                      </td>
                      <td className="max-w-48 truncate px-3 py-3 text-ink-2">{w.problem || <span className="text-muted">-</span>}</td>
                      <td className="px-3 py-3">
                        <Signal w={w} />
                        <p className="mt-0.5 text-[11px] text-muted">seen {ago(w.last_seen)}</p>
                      </td>
                      <td className="px-3 py-3 text-right tabular">{w.marks_obtained}<span className="text-muted">/{w.total_marks}</span><p className="text-[11px] text-muted">{w.solved}/{w.problem_count} solved</p></td>
                      <td className={cx("px-3 py-3 text-right tabular", w.remaining_seconds < 300 ? "text-warn" : "")}>{formatDuration(w.remaining_seconds)}</td>
                      <td className="px-4 py-3">
                        {w.violation_count ? (
                          <span className="flex items-start gap-1.5 text-xs">
                            <ShieldWarning size={15} className={w.last_violation?.type === "CRITICAL" ? "text-bad" : "text-warn"} />
                            <span><span className="font-mono">{w.violation_count}</span> | {w.last_violation?.description} <span className="text-muted">({ago(w.last_violation?.timestamp ?? null)})</span></span>
                          </span>
                        ) : <span className="text-xs text-muted">None</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <section>
            <h2 className="mb-3 text-sm font-semibold">Signed in, not in a test <span className="font-mono text-muted">{data.online.length}</span></h2>
            {data.online.length === 0 ? <p className="text-sm text-muted">Nobody in the last 30 minutes.</p> : (
              <div className="flex flex-wrap gap-2">
                {data.online.map((u) => (
                  <span key={u.user_id} className="flex items-center gap-2 rounded-full border border-line bg-surface py-1 pl-1 pr-3 text-sm shadow-card">
                    <Avatar name={u.name} size={24} />{u.name} <span className="text-xs text-muted">{ago(u.last_login_at)}</span>
                  </span>
                ))}
              </div>
            )}
          </section>
        </div>
      ) : null}
    </div>
  );
}
