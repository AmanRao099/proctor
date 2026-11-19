"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { DownloadSimple, MagnifyingGlass, UserPlus } from "@phosphor-icons/react/dist/ssr";
import { Badge, Button, Person, Dialog, Field, Input, Notice, Skeleton, Textarea, cx } from "@/components/ui";
import { api, ApiError, formatWhen } from "@/lib/client/api";

interface Candidate {
  id: string;
  username: string;
  name: string;
  email: string;
  disabled: boolean;
  created_at: string;
  last_login_at: string | null;
}

interface Created { name: string; username: string; email: string; password: string }

function downloadCsv(rows: Created[], name: string) {
  const cell = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  const csv = ["name,username,email,password", ...rows.map((r) => [r.name, r.username, r.email, r.password].map(cell).join(","))].join("\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

/** "Name, email" or "Name, username, email" per line. A header row is skipped. */
function parseRows(text: string) {
  return text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean)
    .filter((l, i) => !(i === 0 && /^name\s*,/i.test(l)))
    .map((line) => {
      const parts = line.split(/\s*[,\t]\s*/);
      const name = parts[0] ?? "";
      const email = parts.find((p, i) => i > 0 && p.includes("@")) ?? "";
      const username = parts.length >= 3 ? parts[1] : "";
      return { name, email: email || undefined, username: username || undefined };
    });
}

export default function CandidatesPage() {
  const [list, setList] = useState<Candidate[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  const [text, setText] = useState("");
  const [prefix, setPrefix] = useState("");
  const [busy, setBusy] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);
  const [created, setCreated] = useState<Created[] | null>(null);
  const [reset, setReset] = useState<{ username: string; password: string } | null>(null);

  const load = useCallback(() => {
    api.get<{ candidates: Candidate[] }>("/api/admin/candidates")
      .then((r) => setList(r.candidates))
      .catch((e) => setError(e instanceof ApiError ? e.message : "Could not load candidates."));
  }, []);
  useEffect(load, [load]);

  const parsed = useMemo(() => parseRows(text), [text]);
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (list ?? []).filter((c) => !q || `${c.name} ${c.username} ${c.email}`.toLowerCase().includes(q));
  }, [list, query]);

  async function create() {
    setBusy(true);
    setAddError(null);
    try {
      const res = await api.post<{ created: Created[] }>("/api/admin/candidates", { candidates: parsed, prefix: prefix || undefined });
      setCreated(res.created);
      setAddOpen(false);
      setText("");
      load();
    } catch (e) {
      setAddError(e instanceof ApiError ? e.message : "Could not create accounts.");
    } finally {
      setBusy(false);
    }
  }

  async function patch(c: Candidate, body: object) {
    try {
      const res = await api.patch<{ password?: string }>(`/api/admin/candidates/${c.id}`, body);
      if (res.password) setReset({ username: c.username, password: res.password });
      load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Update failed.");
    }
  }

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Students</h1>
          <p className="mt-1 text-sm text-muted">Accounts that can sign in and take tests assigned to them.</p>
        </div>
        <Button variant="primary" onClick={() => setAddOpen(true)}><UserPlus size={16} /> Add students</Button>
      </div>

      {created ? (
        <Notice
          tone="ok"
          title={`${created.length} account${created.length === 1 ? "" : "s"} created`}
          action={<Button size="sm" variant="primary" onClick={() => downloadCsv(created, `credentials-${Date.now()}.csv`)}><DownloadSimple size={14} /> Download logins</Button>}
        >
          Passwords are shown only once. Download the file now and share it securely.
        </Notice>
      ) : null}
      {error ? <Notice tone="bad" title="Something went wrong">{error}</Notice> : null}

      <div className="relative w-full max-w-xs">
        <MagnifyingGlass size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
        <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search" className="h-9 pl-9" aria-label="Search candidates" />
      </div>

      {list === null && !error ? <div className="grid gap-2">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-12" />)}</div> : null}

      {list?.length === 0 ? (
        <div className="rounded-card border border-dashed border-line-strong bg-surface/60 px-6 py-16 text-center">
          <p className="font-medium">No candidates yet</p>
          <p className="mx-auto mt-1 max-w-sm text-sm text-muted">Paste a list of names and emails. Usernames and passwords are generated for you.</p>
        </div>
      ) : null}

      {shown.length ? (
        <div className="overflow-x-auto rounded-card border border-line bg-surface shadow-card">
          <table className="data-table min-w-[720px]">
            <thead>
              <tr>
                <th className="px-5 py-3 font-medium">Name</th>
                <th className="px-3 py-3 font-medium">Username</th>
                <th className="px-3 py-3 font-medium">Last sign-in</th>
                <th className="px-5 py-3 text-right font-medium" />
              </tr>
            </thead>
            <tbody>
              {shown.map((c) => (
                <tr key={c.id} className={cx("", c.disabled && "text-muted")}>
                  <td className="px-5 py-3">
                    <span className="flex items-center gap-2">
                      <Person name={c.name} sub={c.email || undefined} />
                      {c.disabled ? <Badge>Disabled</Badge> : null}
                    </span>
                  </td>
                  <td className="px-3 py-3 font-mono text-xs">{c.username}</td>
                  <td className="px-3 py-3 text-xs text-muted">{c.last_login_at ? formatWhen(c.last_login_at) : "Never"}</td>
                  <td className="px-5 py-3 text-right">
                    <div className="inline-flex gap-1">
                      <Button size="sm" variant="ghost" onClick={() => patch(c, { reset_password: true })}>Reset password</Button>
                      <Button size="sm" variant="ghost" onClick={() => patch(c, { disabled: !c.disabled })}>{c.disabled ? "Enable" : "Disable"}</Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      <Dialog
        open={addOpen}
        onClose={() => setAddOpen(false)}
        title="Add candidates"
        width="max-w-xl"
        footer={
          <>
            <Button onClick={() => setAddOpen(false)}>Cancel</Button>
            <Button variant="primary" busy={busy} disabled={!parsed.length} onClick={create}>
              Create {parsed.length || ""} account{parsed.length === 1 ? "" : "s"}
            </Button>
          </>
        }
      >
        <div className="grid gap-4">
          <Field label="One candidate per line" hint="Name, email  or  Name, username, email. Pasting from a spreadsheet works.">
            {(id) => (
              <Textarea
                id={id}
                value={text}
                onChange={(e) => setText(e.target.value)}
                className="min-h-44 font-mono text-[12.5px]"
                placeholder={"Ananya Rao, ananya.rao@college.edu\nFarhan Qureshi, farhan.q@college.edu"}
                spellCheck={false}
              />
            )}
          </Field>
          <Field label="Username prefix" hint="Used when a line has no username or email, for example acme gives acme001, acme002.">
            {(id) => <Input id={id} value={prefix} onChange={(e) => setPrefix(e.target.value)} placeholder="cand" className="max-w-48" />}
          </Field>
          {addError ? <p className="text-sm text-bad" role="alert">{addError}</p> : null}
        </div>
      </Dialog>

      <Dialog
        open={!!reset}
        onClose={() => setReset(null)}
        title="New password"
        footer={<Button variant="primary" onClick={() => setReset(null)}>Done</Button>}
      >
        <p>Share this with <span className="font-mono text-ink">{reset?.username}</span>. It is shown only once, and any open session was signed out.</p>
        <p className="mt-4 select-all rounded-ui border border-line bg-sunken px-3 py-2 font-mono text-base text-ink">{reset?.password}</p>
      </Dialog>
    </div>
  );
}
