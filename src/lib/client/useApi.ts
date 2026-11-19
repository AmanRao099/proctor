"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { api, ApiError, onApiWrite } from "./api";

/*
 * Stale-while-revalidate for page data.
 *
 * Coming back to a page shows what it showed last time IMMEDIATELY, then
 * refreshes in the background, so moving between pages never waits on the
 * network for something it has already seen. Concurrent requests for the same
 * URL share one fetch. Any write through `api` clears the cache (see
 * invalidateApiCache), so data changed by an action is never served stale.
 */

const cache = new Map<string, { data: unknown; at: number }>();
const inflight = new Map<string, Promise<unknown>>();
export function invalidateApiCache() {
  cache.clear();
}
onApiWrite(invalidateApiCache);

function fetchShared<T>(url: string): Promise<T> {
  const running = inflight.get(url);
  if (running) return running as Promise<T>;
  const p = api.get<T>(url)
    .then((data) => {
      cache.set(url, { data, at: Date.now() });
      return data;
    })
    .finally(() => inflight.delete(url));
  inflight.set(url, p);
  return p;
}

/** Warm the cache for a page the user is likely to open next. */
export function prefetchApi(url: string) {
  if (!cache.has(url)) fetchShared(url).catch(() => {});
}

export function useApi<T>(url: string | null, opts: { refreshMs?: number } = {}) {
  const cached = url ? (cache.get(url)?.data as T | undefined) : undefined;
  const [data, setData] = useState<T | undefined>(cached);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(!cached && !!url);
  const urlRef = useRef(url);
  urlRef.current = url;

  const reload = useCallback(async () => {
    const u = urlRef.current;
    if (!u) return;
    try {
      const fresh = await fetchShared<T>(u);
      if (urlRef.current === u) {
        setData(fresh);
        setError(null);
      }
    } catch (e) {
      if (urlRef.current === u) setError(e instanceof ApiError ? e.message : "Could not load.");
    } finally {
      if (urlRef.current === u) setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!url) return;
    const hit = cache.get(url)?.data as T | undefined;
    setData(hit);
    setLoading(!hit);
    void reload();
    if (!opts.refreshMs) return;
    const t = window.setInterval(() => void reload(), opts.refreshMs);
    return () => window.clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url, opts.refreshMs]);

  return { data, error, loading, reload, setData };
}
