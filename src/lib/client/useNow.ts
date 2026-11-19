"use client";

import { useEffect, useState } from "react";

/**
 * The current time, but only after the page has mounted in the browser.
 * Text built from the clock (dates, "Good morning") must not be rendered on
 * the server: the server and the browser format dates differently and sit in
 * different time zones, and the mismatch breaks hydration (React #418).
 */
export function useNow(): Date | null {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => setNow(new Date()), []);
  return now;
}

export function greetingFor(d: Date | null) {
  if (!d) return "Welcome";
  const h = d.getHours();
  return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
}
