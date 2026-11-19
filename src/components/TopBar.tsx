"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { SignOut } from "@phosphor-icons/react/dist/ssr";
import { api } from "@/lib/client/api";
import type { SessionUser } from "@/lib/shared/types";

const APP = process.env.NEXT_PUBLIC_APP_NAME || "Proctor";


export function Wordmark() {
  return (
    <span className="flex items-center gap-2 text-[15px] font-semibold tracking-tight text-ink">
      <span aria-hidden className="grid h-5 w-5 place-items-center rounded-[4px] bg-ink font-mono text-[11px] font-bold text-bg">
        {APP.slice(0, 1).toUpperCase()}
      </span>
      {APP}
    </span>
  );
}

export function TopBar({ user }: { user: SessionUser }) {
  const router = useRouter();
  const [leaving, setLeaving] = useState(false);

  async function signOut() {
    setLeaving(true);
    try {
      await api.post("/api/auth/logout");
    } finally {
      router.replace("/login");
      router.refresh();
    }
  }

  return (
    <header className="sticky top-0 z-30 border-b border-line bg-bg/90 backdrop-blur supports-[backdrop-filter]:bg-bg/75">
      <div className="mx-auto flex h-14 max-w-6xl items-center gap-6 px-4 sm:px-6">
        <Link href={user.role === "admin" ? "/admin" : "/dashboard"} className="shrink-0">
          <Wordmark />
        </Link>
        <div className="ml-auto flex items-center gap-3">
          <span className="hidden text-right leading-tight sm:block">
            <span className="block text-[13px] text-ink">{user.name}</span>
            <span className="block font-mono text-[11px] text-muted">{user.username}</span>
          </span>
          <button
            onClick={signOut}
            disabled={leaving}
            className="inline-flex h-8 items-center gap-1.5 rounded-ui px-2 text-[13px] text-muted transition-colors hover:bg-sunken hover:text-ink"
          >
            <SignOut size={16} />
            Sign out
          </button>
        </div>
      </div>
    </header>
  );
}
