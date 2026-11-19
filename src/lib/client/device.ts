"use client";

/** Phones and tablets cannot sit a proctored test: no fullscreen lock, no reliable camera framing. */
export function isMobileDevice(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  if (/Android|iPhone|iPad|iPod|Mobile|Silk|Kindle/i.test(ua)) return true;
  // iPadOS reports itself as a Mac; touch points give it away.
  return /Macintosh/.test(ua) && navigator.maxTouchPoints > 1;
}

export function browserName(): string {
  if (typeof navigator === "undefined") return "";
  const ua = navigator.userAgent;
  if (/Edg\//.test(ua)) return "Edge";
  if (/OPR\//.test(ua)) return "Opera";
  if (/Firefox\//.test(ua)) return "Firefox";
  if (/Chrome\//.test(ua)) return "Chrome";
  if (/Safari\//.test(ua)) return "Safari";
  return "your browser";
}

export function isSupportedBrowser(): boolean {
  const name = browserName();
  return name === "Chrome" || name === "Edge";
}
