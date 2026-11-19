import type { Metadata } from "next";
import { Suspense } from "react";
import { Camera, Browser, SpeakerSlash, WifiHigh } from "@phosphor-icons/react/dist/ssr";
import { Wordmark } from "@/components/TopBar";
import { LoginForm } from "./LoginForm";

export const metadata: Metadata = { title: "Sign in" };

const CHECKS = [
  { icon: Browser, title: "Latest Chrome or Edge on a laptop", body: "Phones and tablets cannot sit a proctored test." },
  { icon: Camera, title: "A working webcam", body: "Your face must stay in frame for the whole test." },
  { icon: SpeakerSlash, title: "A quiet room, on your own", body: "A second person in view is recorded as a violation." },
  { icon: WifiHigh, title: "A steady connection", body: "Your code saves as you type, so a short drop costs nothing." },
];

export default function LoginPage() {
  return (
    <div className="grid min-h-[100dvh] grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)]">
      <section className="flex flex-col px-6 py-8 sm:px-12">
        <Wordmark />
        <div className="flex flex-1 items-center">
          <div className="w-full max-w-sm py-16">
            <h1 className="text-3xl font-semibold tracking-tight">Sign in</h1>
            <p className="mt-2 text-sm text-muted">Use the username and password your test organiser sent you.</p>
            <Suspense>
              <LoginForm />
            </Suspense>
          </div>
        </div>
        <p className="text-xs text-muted">Trouble signing in? Contact your test organiser. They can reset your password.</p>
      </section>

      <aside className="hidden border-l border-line bg-surface lg:flex lg:flex-col lg:justify-center lg:px-16">
        <div className="max-w-md">
          <h2 className="text-lg font-semibold tracking-tight">Before you start</h2>
          <p className="mt-1 text-sm text-muted">The test runs in fullscreen with your camera on. Check these now, not five minutes in.</p>
          <ul className="mt-8 grid gap-6">
            {CHECKS.map(({ icon: Icon, title, body }) => (
              <li key={title} className="grid grid-cols-[36px_1fr] gap-4">
                <span className="grid h-9 w-9 place-items-center rounded-ui border border-line bg-bg text-ink-2">
                  <Icon size={18} />
                </span>
                <span>
                  <span className="block text-sm font-medium text-ink">{title}</span>
                  <span className="block text-sm text-muted">{body}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      </aside>
    </div>
  );
}
