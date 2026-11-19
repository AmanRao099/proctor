"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  Code, FileText, GearSix, Gavel, List, Pulse, SignOut, SquaresFour, Trophy, Users, X,
} from "@phosphor-icons/react/dist/ssr";
import { api } from "@/lib/client/api";
import type { SessionUser } from "@/lib/shared/types";
import { Wordmark } from "@/components/TopBar";
import { cx } from "@/components/ui";

type NavItem = { href: string; label: string; icon: typeof Code; exact?: boolean; also?: string };

const GROUPS: { title: string; items: NavItem[] }[] = [
  {
    title: "Monitor",
    items: [
      { href: "/admin", label: "Overview", icon: SquaresFour, exact: true },
      { href: "/admin/active", label: "Active Students", icon: Pulse },
      { href: "/admin/leaderboard", label: "Leaderboard", icon: Trophy },
    ],
  },
  {
    title: "Assessments",
    items: [
      { href: "/admin/dsa-master", label: "DSA Master", icon: Code, also: "/admin/tests" },
      { href: "/admin/candidates", label: "Students", icon: Users },
      { href: "/admin/appeals", label: "Ban Appeals", icon: Gavel },
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

function Nav({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  return (
    <nav className="grid gap-6">
      {GROUPS.map((g) => (
        <div key={g.title}>
          <p className="mb-1.5 px-2.5 text-[11px] font-medium text-muted">{g.title}</p>
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
                    "flex h-9 items-center gap-2.5 rounded-ui px-2.5 text-sm transition-colors",
                    active ? "bg-surface text-ink shadow-[inset_0_0_0_1px_var(--line)]" : "text-ink-2 hover:bg-sunken hover:text-ink",
                  )}
                >
                  <Icon size={17} weight={active ? "fill" : "regular"} className={active ? "text-accent" : "text-muted"} />
                  {item.label}
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
  useEffect(() => setOpen(false), [pathname]);

  async function signOut() {
    try { await api.post("/api/auth/logout"); } finally {
      router.replace("/login");
      router.refresh();
    }
  }

  const footer = (
    <div className="flex items-center gap-2 border-t border-line pt-4">
      <div className="min-w-0 flex-1 leading-tight">
        <p className="truncate text-[13px] text-ink">{user.name}</p>
        <p className="truncate font-mono text-[11px] text-muted">{user.username}</p>
      </div>
      <button onClick={signOut} title="Sign out" aria-label="Sign out" className="grid h-8 w-8 place-items-center rounded-ui text-muted hover:bg-sunken hover:text-ink">
        <SignOut size={16} />
      </button>
    </div>
  );

  return (
    <div className="min-h-[100dvh] lg:grid lg:grid-cols-[232px_1fr]">
      <aside className="sticky top-0 hidden h-[100dvh] flex-col gap-8 border-r border-line bg-bg px-3 py-5 lg:flex">
        <Link href="/admin" className="px-2.5"><Wordmark /></Link>
        <div className="min-h-0 flex-1 overflow-y-auto"><Nav /></div>
        {footer}
      </aside>

      <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-line bg-bg/95 px-4 backdrop-blur lg:hidden">
        <Wordmark />
        <button onClick={() => setOpen(true)} aria-label="Open menu" className="grid h-9 w-9 place-items-center rounded-ui hover:bg-sunken"><List size={20} /></button>
      </header>
      {open ? (
        <div className="fixed inset-0 z-50 bg-[rgb(10_10_12/0.4)] lg:hidden" onClick={() => setOpen(false)}>
          <aside className="flex h-full w-72 flex-col gap-8 border-r border-line bg-bg px-3 py-5" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-2.5">
              <Wordmark />
              <button onClick={() => setOpen(false)} aria-label="Close menu" className="grid h-8 w-8 place-items-center rounded-ui hover:bg-sunken"><X size={16} /></button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto"><Nav onNavigate={() => setOpen(false)} /></div>
            {footer}
          </aside>
        </div>
      ) : null}

      <main className="min-w-0 px-4 pb-20 pt-6 sm:px-8 lg:pt-8">
        <div className="mx-auto max-w-[1180px]">{children}</div>
      </main>
    </div>
  );
}

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: React.ReactNode; actions?: React.ReactNode }) {
  return (
    <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {subtitle ? <p className="mt-1 text-sm text-muted">{subtitle}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}

export function Stat({ label, value, hint, tone }: { label: string; value: React.ReactNode; hint?: React.ReactNode; tone?: "ok" | "warn" | "bad" | "accent" }) {
  const color = tone === "ok" ? "text-ok" : tone === "warn" ? "text-warn" : tone === "bad" ? "text-bad" : tone === "accent" ? "text-accent" : "text-ink";
  return (
    <div className="bg-surface px-5 py-4">
      <dt className="text-xs text-muted">{label}</dt>
      <dd className={cx("mt-1 font-mono text-2xl font-semibold tabular", color)}>{value}</dd>
      {hint ? <dd className="mt-0.5 text-xs text-muted">{hint}</dd> : null}
    </div>
  );
}

/** Stats in a hairline grid: the cells share borders instead of each being a card. */
export function StatGrid({ children, cols = 4 }: { children: React.ReactNode; cols?: 2 | 3 | 4 | 5 }) {
  const c = { 2: "sm:grid-cols-2", 3: "sm:grid-cols-3", 4: "sm:grid-cols-4", 5: "sm:grid-cols-5" }[cols];
  return <dl className={cx("grid grid-cols-2 gap-px overflow-hidden rounded-ui border border-line bg-line", c)}>{children}</dl>;
}
