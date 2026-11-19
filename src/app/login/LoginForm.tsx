"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { Eye, EyeSlash } from "@phosphor-icons/react/dist/ssr";
import { Button, Field, Input, Notice } from "@/components/ui";
import { api, ApiError } from "@/lib/client/api";
import type { SessionUser } from "@/lib/shared/types";

export function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const expired = params.get("reason") === "expired";

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const { user } = await api.post<{ user: SessionUser }>("/api/auth/login", { username, password });
      const next = params.get("next");
      // Only same-site paths, and only into the area this role may use.
      const safe = next && next.startsWith("/") && !next.startsWith("//")
        && (user.role === "admin" ? next.startsWith("/admin") : !next.startsWith("/admin"));
      router.replace(safe ? next : user.role === "admin" ? "/admin" : "/dashboard");
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Sign in failed. Try again.");
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="mt-8 flex flex-col gap-5" noValidate>
      {expired && !error ? (
        <Notice tone="warn" title="You were signed out">
          Your session ended, or this account signed in somewhere else. Sign in again to continue.
        </Notice>
      ) : null}
      <Field label="Username">
        {(id) => (
          <Input
            id={id}
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoComplete="username"
            autoCapitalize="none"
            spellCheck={false}
            autoFocus
            required
          />
        )}
      </Field>
      <Field label="Password" error={error}>
        {(id) => (
          <div className="relative">
            <Input
              id={id}
              type={show ? "text" : "password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              className="pr-10"
              required
            />
            <button
              type="button"
              onClick={() => setShow((s) => !s)}
              aria-label={show ? "Hide password" : "Show password"}
              className="absolute inset-y-0 right-0 grid w-10 place-items-center text-muted hover:text-ink"
            >
              {show ? <EyeSlash size={16} /> : <Eye size={16} />}
            </button>
          </div>
        )}
      </Field>
      <Button type="submit" variant="primary" busy={busy} disabled={!username || !password} className="mt-1">
        Sign in
      </Button>
    </form>
  );
}
