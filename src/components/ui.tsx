"use client";

import { forwardRef, useEffect, useId, useRef } from "react";

export function cx(...parts: (string | false | null | undefined)[]) {
  return parts.filter(Boolean).join(" ");
}

// ─── Button ───────────────────────────────────────────────────────────────────

type Variant = "primary" | "accent" | "secondary" | "ghost" | "danger";
type Size = "sm" | "md";

const VARIANTS: Record<Variant, string> = {
  primary: "bg-ink text-bg hover:bg-ink-2 border border-ink",
  accent: "bg-accent text-accent-ink hover:opacity-90 border border-accent",
  secondary: "bg-surface text-ink border border-line-strong hover:bg-sunken",
  ghost: "bg-transparent text-ink-2 border border-transparent hover:bg-sunken hover:text-ink",
  danger: "bg-surface text-bad border border-line-strong hover:bg-bad-soft hover:border-bad",
};

const SIZES: Record<Size, string> = {
  sm: "h-8 px-3 text-[13px] gap-1.5",
  md: "h-10 px-4 text-sm gap-2",
};

export const Button = forwardRef<
  HTMLButtonElement,
  React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: Size; busy?: boolean }
>(function Button({ variant = "secondary", size = "md", busy, className, children, disabled, ...rest }, ref) {
  return (
    <button
      ref={ref}
      disabled={disabled || busy}
      aria-busy={busy || undefined}
      className={cx(
        "inline-flex select-none items-center justify-center whitespace-nowrap rounded-ui font-medium",
        "transition-[background-color,border-color,opacity,transform] duration-150 active:translate-y-px",
        "disabled:cursor-not-allowed disabled:opacity-50 disabled:active:translate-y-0",
        VARIANTS[variant],
        SIZES[size],
        className,
      )}
      {...rest}
    >
      {busy ? <BusyDots /> : null}
      {children}
    </button>
  );
});

function BusyDots() {
  return (
    <span aria-hidden className="inline-flex gap-0.5">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="h-1 w-1 rounded-full bg-current opacity-60 motion-safe:animate-pulse"
          style={{ animationDelay: `${i * 150}ms` }}
        />
      ))}
    </span>
  );
}

// ─── Form controls ────────────────────────────────────────────────────────────

const control =
  "w-full rounded-ui border border-line-strong bg-surface px-3 text-sm text-ink placeholder:text-muted " +
  "transition-colors focus:border-accent focus:outline-none focus-visible:outline-none focus:ring-2 focus:ring-accent/25 " +
  "disabled:cursor-not-allowed disabled:bg-sunken disabled:text-muted";

export const Input = forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  function Input({ className, ...rest }, ref) {
    return <input ref={ref} className={cx(control, "h-10", className)} {...rest} />;
  },
);

export const Textarea = forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(
  function Textarea({ className, ...rest }, ref) {
    return <textarea ref={ref} className={cx(control, "min-h-24 py-2 leading-relaxed", className)} {...rest} />;
  },
);

export function Select({ className, children, ...rest }: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select className={cx(control, "h-10 appearance-none bg-[length:12px] pr-8", className)} {...rest}>
      {children}
    </select>
  );
}

/** Label above, hint under the label, error under the control. */
export function Field({
  label, hint, error, children, className,
}: {
  label: string;
  hint?: React.ReactNode;
  error?: string | null;
  children: (id: string) => React.ReactNode;
  className?: string;
}) {
  const id = useId();
  return (
    <div className={cx("flex flex-col gap-1.5", className)}>
      <label htmlFor={id} className="text-[13px] font-medium text-ink-2">{label}</label>
      {hint ? <p className="-mt-1 text-xs text-muted">{hint}</p> : null}
      {children(id)}
      {error ? <p className="text-xs text-bad" role="alert">{error}</p> : null}
    </div>
  );
}

export function Toggle({
  checked, onChange, label, description, disabled,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  description?: string;
  disabled?: boolean;
}) {
  return (
    <label className={cx("flex items-start gap-3 py-2", disabled ? "opacity-50" : "cursor-pointer")}>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cx(
          "relative mt-0.5 h-5 w-9 shrink-0 rounded-full border transition-colors",
          checked ? "border-accent bg-accent" : "border-line-strong bg-sunken",
        )}
      >
        <span
          className={cx(
            "absolute top-0.5 h-3.5 w-3.5 rounded-full transition-transform",
            checked ? "translate-x-[18px] bg-accent-ink" : "translate-x-0.5 bg-muted",
          )}
        />
      </button>
      <span className="flex flex-col">
        <span className="text-sm text-ink">{label}</span>
        {description ? <span className="text-xs text-muted">{description}</span> : null}
      </span>
    </label>
  );
}

// ─── Display ──────────────────────────────────────────────────────────────────

type Tone = "neutral" | "accent" | "ok" | "warn" | "bad";

const TONES: Record<Tone, string> = {
  neutral: "bg-sunken text-ink-2 border-line",
  accent: "bg-accent-soft text-accent border-transparent",
  ok: "bg-ok-soft text-ok border-transparent",
  warn: "bg-warn-soft text-warn border-transparent",
  bad: "bg-bad-soft text-bad border-transparent",
};

export function Badge({ tone = "neutral", children, className }: { tone?: Tone; children: React.ReactNode; className?: string }) {
  return (
    <span className={cx("inline-flex h-6 items-center rounded-ui border px-2 text-xs font-medium", TONES[tone], className)}>
      {children}
    </span>
  );
}

export function Notice({ tone = "neutral", title, children, action }: {
  tone?: Tone;
  title?: string;
  children?: React.ReactNode;
  action?: React.ReactNode;
}) {
  const bar: Record<Tone, string> = {
    neutral: "border-l-line-strong", accent: "border-l-accent", ok: "border-l-ok", warn: "border-l-warn", bad: "border-l-bad",
  };
  return (
    <div
      role={tone === "bad" ? "alert" : "status"}
      className={cx("flex flex-col gap-3 rounded-ui border border-line border-l-4 bg-surface px-4 py-3 sm:flex-row sm:items-center", bar[tone])}
    >
      <div className="flex-1 text-sm">
        {title ? <p className="font-medium text-ink">{title}</p> : null}
        {children ? <div className="text-ink-2">{children}</div> : null}
      </div>
      {action}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cx("rounded-ui bg-sunken motion-safe:animate-pulse", className)} />;
}

export function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="rounded-[4px] border border-line-strong bg-surface px-1.5 py-0.5 font-mono text-[11px] text-ink-2">
      {children}
    </kbd>
  );
}

// ─── Dialog ───────────────────────────────────────────────────────────────────

export function Dialog({
  open, onClose, title, children, footer, tone = "neutral", dismissable = true, width = "max-w-md",
}: {
  open: boolean;
  onClose?: () => void;
  title: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  tone?: "neutral" | "bad" | "warn";
  dismissable?: boolean;
  width?: string;
}) {
  const panel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    panel.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && dismissable) onClose?.();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, dismissable, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-[rgb(10_10_12/0.55)] p-4">
      <div
        ref={panel}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={cx(
          "w-full rounded-ui border bg-surface shadow-[0_24px_60px_rgb(10_10_12/0.25)] focus:outline-none",
          tone === "bad" ? "border-bad" : tone === "warn" ? "border-warn" : "border-line",
          width,
        )}
      >
        <div className="border-b border-line px-5 py-4">
          <h2 className={cx("text-base font-semibold", tone === "bad" ? "text-bad" : tone === "warn" ? "text-warn" : "text-ink")}>
            {title}
          </h2>
        </div>
        <div className="px-5 py-4 text-sm text-ink-2">{children}</div>
        {footer ? <div className="flex justify-end gap-2 border-t border-line px-5 py-3">{footer}</div> : null}
      </div>
    </div>
  );
}
