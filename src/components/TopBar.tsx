"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { SignOut } from "@phosphor-icons/react/dist/ssr";
import { api } from "@/lib/client/api";
import type { SessionUser } from "@/lib/shared/types";
import { Avatar } from "./ui";

const APP = process.env.NEXT_PUBLIC_APP_NAME || "Proctor";

export function Wordmark() {
  return (
    <span className="flex items-center gap-2.5 text-[15px] font-semibold tracking-tight text-ink">
      <span aria-hidden className="grid h-7 w-7 place-items-center rounded-ui bg-accent text-[13px] font-bold text-accent-ink shadow-card">
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
    <header className="sticky top-0 z-30 border-b border-line bg-surface/90 backdrop-blur supports-[backdrop-filter]:bg-surface/80">
      <div className="mx-auto flex h-16 max-w-5xl items-center gap-6 px-4 sm:px-6">
        <Link href={user.role === "admin" ? "/admin" : "/dashboard"} className="shrink-0">
          <Wordmark />
        </Link>
        <div className="ml-auto flex items-center gap-3">
          <span className="hidden items-center gap-2.5 sm:flex">
            <Avatar name={user.name} size={32} />
            <span className="leading-tight">
              <span className="block text-[13px] font-medium text-ink">{user.name}</span>
              <span className="block text-xs text-muted">{user.username}</span>
            </span>
          </span>
          <span className="hidden h-6 w-px bg-line sm:block" />
          <button
            onClick={signOut}
            disabled={leaving}
            className="inline-flex h-9 items-center gap-1.5 rounded-ui px-2.5 text-[13px] text-muted transition-colors hover:bg-sunken hover:text-ink"
          >
            <SignOut size={16} />
            Sign out
          </button>
        </div>
      </div>
    </header>
  );
}
