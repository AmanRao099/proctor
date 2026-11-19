"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Code } from "@phosphor-icons/react/dist/ssr/Code";
import { FileText } from "@phosphor-icons/react/dist/ssr/FileText";
import { GearSix } from "@phosphor-icons/react/dist/ssr/GearSix";
import { Gavel } from "@phosphor-icons/react/dist/ssr/Gavel";
import { List } from "@phosphor-icons/react/dist/ssr/List";
import { Pulse } from "@phosphor-icons/react/dist/ssr/Pulse";
import { SignOut } from "@phosphor-icons/react/dist/ssr/SignOut";
import { SquaresFour } from "@phosphor-icons/react/dist/ssr/SquaresFour";
import { Trophy } from "@phosphor-icons/react/dist/ssr/Trophy";
import { Users } from "@phosphor-icons/react/dist/ssr/Users";
import { X } from "@phosphor-icons/react/dist/ssr/X";
import { api } from "@/lib/client/api";
import { useApi } from "@/lib/client/useApi";
import { useNow } from "@/lib/client/useNow";
import { Bell } from "@phosphor-icons/react/dist/ssr/Bell";
import { Plus } from "@phosphor-icons/react/dist/ssr/Plus";

const todayFmt = new Intl.DateTimeFormat(undefined, { weekday: "long", day: "numeric", month: "long", year: "numeric" });
import type { SessionUser } from "@/lib/shared/types";
import { Wordmark } from "@/components/TopBar";
import { Avatar, cx } from "@/components/ui";

type NavItem = { href: string; label: string; icon: typeof Code; exact?: boolean; also?: string; count?: "writing" | "appeals" };

const GROUPS: { title: string; items: NavItem[] }[] = [
  {
    title: "Monitor",
    items: [
      { href: "/admin", label: "Overview", icon: SquaresFour, exact: true },
      { href: "/admin/active", label: "Active Students", icon: Pulse, count: "writing" },
      { href: "/admin/leaderboard", label: "Leaderboard", icon: Trophy },
    ],
  },
  {
    title: "Assessments",
    items: [
      { href: "/admin/dsa-master", label: "DSA Master", icon: Code, also: "/admin/tests" },
      { href: "/admin/candidates", label: "Students", icon: Users },
      { href: "/admin/appeals", label: "Ban Appeals", icon: Gavel, count: "appeals" },
    ],
  },
  {
    title: "Output",
    items: [
      { href: "/admin/reports", label: "Reports", icon: FileText },
      { href: "/admin/settings", label: "Settings", icon: GearSix },
    ],
  },
];

interface Counts { writing: number; appeals: number }

function Nav({ onNavigate, counts }: { onNavigate?: () => void; counts?: Counts }) {
  const pathname = usePathname();
  return (
    <nav className="grid gap-6">
      {GROUPS.map((g) => (
        <div key={g.title}>
          <p className="mb-1.5 px-3 text-xs font-medium text-muted">{g.title}</p>
          <div className="grid gap-0.5">
            {g.items.map((item) => {
              const active = item.exact
                ? pathname === item.href
                : pathname.startsWith(item.href) || (!!item.also && pathname.startsWith(item.also));
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={onNavigate}
                  aria-current={active ? "page" : undefined}
                  className={cx(
                    "flex h-9 items-center gap-3 rounded-ui px-3 text-sm transition-colors",
                    active ? "bg-accent-soft font-medium text-accent" : "text-ink-2 hover:bg-sunken hover:text-ink",
                  )}
                >
                  <Icon size={18} weight={active ? "fill" : "regular"} className={active ? "text-accent" : "text-muted"} />
                  {item.label}
                  {item.count && counts && counts[item.count] > 0 ? (
                    <span className={cx(
                      "ml-auto grid h-5 min-w-5 place-items-center rounded-full px-1.5 text-[11px] font-semibold tabular",
                      item.count === "appeals" ? "bg-bad text-white" : "bg-accent text-accent-ink",
                    )}>
                      {counts[item.count]}
                    </span>
                  ) : null}
                </Link>
              );
            })}
          </div>
        </div>
      ))}
    </nav>
  );
}

export function AdminShell({ user, children }: { user: SessionUser; children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const now = useNow();
  useEffect(() => setOpen(false), [pathname]);
  // Shared with the Overview page through the useApi cache: one request.
  const overview = useApi<{ stats: { writing_now: number; pending_appeals: number } }>("/api/admin/overview", { refreshMs: 30_000 });
  const health = useApi<{ judge0: { ok: boolean; version?: string } }>("/api/admin/health", { refreshMs: 120_000 });
  const counts = overview.data ? { writing: overview.data.stats.writing_now, appeals: overview.data.stats.pending_appeals } : undefined;
  const judgeOk = health.data?.judge0.ok;

  async function signOut() {
    try { await api.post("/api/auth/logout"); } finally {
      router.replace("/login");
      router.refresh();
    }
  }

  const footer = (
    <div className="flex items-center gap-3 rounded-card border border-line bg-raised p-2.5">
      <Avatar name={user.name} size={34} />
      <div className="min-w-0 flex-1 leading-tight">
        <p className="truncate text-[13px] font-medium text-ink">{user.name}</p>
        <p className="truncate text-xs text-muted">Administrator</p>
      </div>
      <button onClick={signOut} title="Sign out" aria-label="Sign out" className="grid h-8 w-8 place-items-center rounded-ui text-muted transition-colors hover:bg-sunken hover:text-ink">
        <SignOut size={17} />
      </button>
    </div>
  );

  return (
    <div className="min-h-[100dvh] lg:grid lg:grid-cols-[248px_1fr]">
      <aside className="sticky top-0 hidden h-[100dvh] flex-col gap-7 border-r border-line bg-surface px-3 py-5 lg:flex">
        <Link href="/admin" className="px-3"><Wordmark /></Link>
        <div className="min-h-0 flex-1 overflow-y-auto"><Nav counts={counts} /></div>
        <div className="rounded-card border border-line bg-raised p-3.5">
          <p className="flex items-center gap-2 text-[13px] font-medium text-ink">
            <span className={cx("h-2 w-2 rounded-full", judgeOk === undefined ? "bg-line-strong" : judgeOk ? "bg-ok" : "bg-bad")} />
            Code runner {judgeOk === undefined ? "checking" : judgeOk ? "online" : "offline"}
          </p>
          <p className="mt-0.5 text-xs text-muted">{health.data?.judge0.version ? `Judge0 ${health.data.judge0.version}` : "Judge0"} on EC2</p>
        </div>
        {footer}
      </aside>

      <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-line bg-surface/95 px-4 backdrop-blur lg:hidden">
        <Wordmark />
        <button onClick={() => setOpen(true)} aria-label="Open menu" className="grid h-9 w-9 place-items-center rounded-ui hover:bg-sunken"><List size={20} /></button>
      </header>
      {open ? (
        <div className="fixed inset-0 z-50 bg-[rgb(47_62_70/0.4)] lg:hidden" onClick={() => setOpen(false)}>
          <aside className="flex h-full w-72 flex-col gap-7 border-r border-line bg-surface px-3 py-5 shadow-pop" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-3">
              <Wordmark />
              <button onClick={() => setOpen(false)} aria-label="Close menu" className="grid h-8 w-8 place-items-center rounded-ui hover:bg-sunken"><X size={16} /></button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto"><Nav counts={counts} onNavigate={() => setOpen(false)} /></div>
            {footer}
          </aside>
        </div>
      ) : null}

      <div className="min-w-0">
        <div className="sticky top-0 z-20 hidden h-16 items-center gap-3 border-b border-line bg-bg/85 px-10 backdrop-blur lg:flex">
          <p className="text-sm text-muted">{now ? todayFmt.format(now) : ""}</p>
          <div className="ml-auto flex items-center gap-2">
            {counts && counts.writing > 0 ? (
              <Link href="/admin/active" className="inline-flex h-9 items-center gap-2 rounded-full border border-accent-line bg-accent-soft px-3 text-[13px] font-medium text-accent">
                <span className="relative flex h-2 w-2"><span className="absolute inline-flex h-full w-full rounded-full bg-accent opacity-60 motion-safe:animate-ping" /><span className="relative inline-flex h-2 w-2 rounded-full bg-accent" /></span>
                {counts.writing} writing now
              </Link>
            ) : null}
            <Link href="/admin/appeals" title="Pending appeals" aria-label={`Pending appeals: ${counts?.appeals ?? 0}`} className="relative grid h-9 w-9 place-items-center rounded-full border border-line bg-surface text-ink-2 shadow-card hover:text-ink">
              <Bell size={17} />
              {counts && counts.appeals > 0 ? <span className="absolute -right-0.5 -top-0.5 grid h-4 min-w-4 place-items-center rounded-full bg-bad px-1 text-[10px] font-semibold text-white">{counts.appeals}</span> : null}
            </Link>
            <Link href="/admin/tests/new" className="inline-flex h-9 items-center gap-1.5 rounded-full bg-accent px-4 text-[13px] font-medium text-accent-ink shadow-card hover:bg-accent-hover">
              <Plus size={15} weight="bold" /> New test
            </Link>
          </div>
        </div>
        <main className="px-4 pb-24 pt-6 sm:px-8 lg:px-10 lg:pt-8">
          <div className="mx-auto max-w-[1160px]">{children}</div>
        </main>
      </div>
    </div>
  );
}

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: React.ReactNode; actions?: React.ReactNode }) {
  return (
    <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        <h1 className="text-[26px] font-semibold leading-tight tracking-tight text-ink">{title}</h1>
        {subtitle ? <p className="mt-1.5 text-sm text-muted">{subtitle}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}

const TONE_TEXT = { ok: "text-ok", warn: "text-warn", bad: "text-bad", accent: "text-accent" } as const;
const TONE_CHIP = { ok: "bg-ok-soft text-ok", warn: "bg-warn-soft text-warn", bad: "bg-bad-soft text-bad", accent: "bg-accent-soft text-accent" } as const;

export function Stat({ label, value, hint, tone, icon }: {
  label: string;
  value: React.ReactNode;
  hint?: React.ReactNode;
  tone?: keyof typeof TONE_TEXT;
  icon?: React.ReactNode;
}) {
  return (
    <div className="rounded-card border border-line bg-surface px-5 py-4 shadow-card">
      <dt className="flex items-center justify-between gap-2 text-[13px] text-muted">
        {label}
        {icon ? <span className={cx("grid h-7 w-7 place-items-center rounded-full", tone ? TONE_CHIP[tone] : "bg-sunken text-ink-2")}>{icon}</span> : null}
      </dt>
      <dd className={cx("mt-2 text-[26px] font-semibold leading-none tracking-tight tabular", tone ? TONE_TEXT[tone] : "text-ink")}>{value}</dd>
      {hint ? <dd className="mt-2 text-xs text-muted">{hint}</dd> : null}
    </div>
  );
}

/** Stat cards in a responsive grid. */
export function StatGrid({ children, cols = 4 }: { children: React.ReactNode; cols?: 2 | 3 | 4 | 5 }) {
  const c = { 2: "lg:grid-cols-2", 3: "lg:grid-cols-3", 4: "lg:grid-cols-4", 5: "lg:grid-cols-5" }[cols];
  return <dl className={cx("grid grid-cols-2 gap-3 sm:gap-4", c)}>{children}</dl>;
}
