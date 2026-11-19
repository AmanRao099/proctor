"use client";

/** Thrown for any non-2xx answer. `status` 0 means the request never arrived. */
export class ApiError extends Error {
  constructor(public status: number, message: string, public code?: string) {
    super(message);
  }
}

type Json = Record<string, unknown>;

/** Called after every successful write, so cached reads can be dropped. */
const writeHooks = new Set<() => void>();
export function onApiWrite(fn: () => void) {
  writeHooks.add(fn);
}

async function request<T>(method: string, url: string, data?: unknown, timeoutMs = 60_000): Promise<T> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  let res: Response;
  try {
    res = await fetch(url, {
      method,
      headers: data !== undefined ? { "Content-Type": "application/json" } : undefined,
      body: data !== undefined ? JSON.stringify(data) : undefined,
      credentials: "same-origin",
      cache: "no-store",
      signal: ctrl.signal,
    });
  } catch {
    throw new ApiError(0, "Could not reach the server. Check your connection.");
  } finally {
    clearTimeout(timer);
  }
  let payload: Json = {};
  try {
    payload = (await res.json()) as Json;
  } catch {
    /* empty or non-JSON body */
  }
  if (!res.ok || payload.success === false) {
    if (res.status === 401 && payload.code === "signed_out" && typeof window !== "undefined") {
      const next = encodeURIComponent(window.location.pathname + window.location.search);
      window.location.href = `/login?next=${next}&reason=expired`;
    }
    throw new ApiError(res.status, String(payload.error || `Request failed (${res.status})`), payload.code as string | undefined);
  }
  if (method !== "GET") writeHooks.forEach((fn) => fn());
  return payload as T;
}

export const api = {
  get: <T>(url: string) => request<T>("GET", url),
  post: <T>(url: string, data?: unknown, timeoutMs?: number) => request<T>("POST", url, data ?? {}, timeoutMs),
  put: <T>(url: string, data?: unknown) => request<T>("PUT", url, data ?? {}),
  patch: <T>(url: string, data?: unknown) => request<T>("PATCH", url, data ?? {}),
  del: <T>(url: string) => request<T>("DELETE", url),
};

export function formatDuration(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${pad(m)}:${pad(sec)}` : `${pad(m)}:${pad(sec)}`;
}

const dateFmt = new Intl.DateTimeFormat(undefined, {
  day: "numeric", month: "short", hour: "numeric", minute: "2-digit",
});

export function formatWhen(iso: string | null | undefined): string {
  if (!iso) return "";
  return dateFmt.format(new Date(iso));
}
