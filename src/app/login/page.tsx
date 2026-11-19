import type { Metadata } from "next";
import { Suspense } from "react";
import { Browser } from "@phosphor-icons/react/dist/ssr/Browser";
import { Camera } from "@phosphor-icons/react/dist/ssr/Camera";
import { ShieldCheck } from "@phosphor-icons/react/dist/ssr/ShieldCheck";
import { SpeakerSlash } from "@phosphor-icons/react/dist/ssr/SpeakerSlash";
import { WifiHigh } from "@phosphor-icons/react/dist/ssr/WifiHigh";
import { Wordmark } from "@/components/TopBar";
import { LoginForm } from "./LoginForm";

export const metadata: Metadata = { title: "Sign in" };

const CHECKS = [
  { icon: Browser, title: "Latest Chrome or Edge on a laptop", body: "Phones and tablets cannot sit a proctored test." },
  { icon: Camera, title: "A working webcam", body: "Your face stays in frame for the whole test." },
  { icon: SpeakerSlash, title: "A quiet room, on your own", body: "A second person in view is recorded as a violation." },
  { icon: WifiHigh, title: "A steady connection", body: "Your code saves as you type, so a short drop costs nothing." },
];

export default function LoginPage() {
  return (
    <div className="grid min-h-[100dvh] grid-cols-1 bg-surface lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <section className="flex flex-col px-6 py-8 sm:px-12">
        <Wordmark />
        <div className="flex flex-1 items-center justify-center">
          <div className="w-full max-w-[380px] py-16">
            <h1 className="text-[28px] font-semibold tracking-tight">Welcome back</h1>
            <p className="mt-2 text-sm text-muted">Sign in with the username and password your test organiser sent you.</p>
            <Suspense>
              <LoginForm />
            </Suspense>
            <p className="mt-8 text-center text-xs text-muted">Trouble signing in? Your organiser can reset your password.</p>
          </div>
        </div>
      </section>

      <aside className="hidden p-4 lg:block">
        <div className="relative flex h-full flex-col justify-center overflow-hidden rounded-[20px] bg-accent-soft px-14 py-12">
          <div aria-hidden className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-accent/10" />
          <div aria-hidden className="pointer-events-none absolute -bottom-28 -left-16 h-80 w-80 rounded-full bg-accent/[0.07]" />
          <div className="relative max-w-md">
            <span className="grid h-11 w-11 place-items-center rounded-card bg-surface text-accent shadow-card"><ShieldCheck size={22} weight="fill" /></span>
            <h2 className="mt-6 text-2xl font-semibold tracking-tight text-ink">Ready for your coding round</h2>
            <p className="mt-2 text-sm text-ink-2">The test runs in fullscreen with your camera on. A minute spent on these now saves a lot of stress later.</p>
            <ul className="mt-8 grid gap-3">
              {CHECKS.map(({ icon: Icon, title, body }) => (
                <li key={title} className="flex items-start gap-4 rounded-card bg-surface/85 p-4 shadow-card backdrop-blur">
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-accent-soft text-accent"><Icon size={18} /></span>
                  <span>
                    <span className="block text-sm font-medium text-ink">{title}</span>
                    <span className="block text-[13px] text-muted">{body}</span>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </aside>
    </div>
  );
}
