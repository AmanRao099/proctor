"use client";

import { forwardRef, useEffect, useId, useRef } from "react";
import { twMerge } from "tailwind-merge";
import { CaretDown } from "@phosphor-icons/react/dist/ssr/CaretDown";

/** Class join that lets a later class win a conflict (w-40 over w-full). */
export function cx(...parts: (string | false | null | undefined)[]) {
  return twMerge(parts.filter(Boolean).join(" "));
}

// ─── Button ───────────────────────────────────────────────────────────────────

type Variant = "primary" | "accent" | "dark" | "secondary" | "ghost" | "danger";
type Size = "sm" | "md";

const VARIANTS: Record<Variant, string> = {
  primary: "bg-accent text-accent-ink border border-accent hover:bg-accent-hover hover:border-accent-hover shadow-card",
  accent: "bg-accent text-accent-ink border border-accent hover:bg-accent-hover hover:border-accent-hover shadow-card",
  dark: "bg-ink text-bg border border-ink hover:opacity-90 shadow-card",
  secondary: "bg-surface text-ink border border-line-strong hover:bg-raised hover:border-muted/40 shadow-card",
  ghost: "bg-transparent text-ink-2 border border-transparent hover:bg-sunken hover:text-ink",
  danger: "bg-surface text-bad border border-line-strong hover:bg-bad-soft hover:border-bad/50",
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
        "transition-[background-color,border-color,opacity,transform,color] duration-150 active:translate-y-px",
        "disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-none disabled:active:translate-y-0",
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
        <span key={i} className="h-1 w-1 rounded-full bg-current opacity-60 motion-safe:animate-pulse" style={{ animationDelay: `${i * 150}ms` }} />
      ))}
    </span>
  );
}

// ─── Form controls ────────────────────────────────────────────────────────────

const control =
  "w-full rounded-ui border border-line-strong bg-surface px-3 text-sm text-ink shadow-card placeholder:text-muted/80 " +
  "transition-[border-color,box-shadow] focus:border-accent focus:outline-none focus-visible:outline-none focus:ring-[3px] focus:ring-accent/15 " +
  "disabled:cursor-not-allowed disabled:bg-sunken disabled:text-muted disabled:shadow-none";

export const Input = forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  function Input({ className, ...rest }, ref) {
    return <input ref={ref} className={cx(control, "h-10", className)} {...rest} />;
  },
);

export const Textarea = forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(
  function Textarea({ className, ...rest }, ref) {
    return <textarea ref={ref} className={cx(control, "min-h-24 py-2.5 leading-relaxed", className)} {...rest} />;
  },
);

export function Select({ className, children, ...rest }: React.SelectHTMLAttributes<HTMLSelectElement>) {
  // Width classes go on the wrapper so the chevron stays inside the control.
  const width = (className ?? "").split(/\s+/).filter((c) => /^(w-|max-w-|min-w-|flex-)/.test(c)).join(" ");
  const rest_ = (className ?? "").split(/\s+/).filter((c) => !/^(w-|max-w-|min-w-|flex-)/.test(c)).join(" ");
  return (
    <span className={cx("relative inline-flex w-full", width)}>
      <select className={cx(control, "h-10 cursor-pointer appearance-none pr-9", rest_)} {...rest}>
        {children}
      </select>
      <CaretDown size={14} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-muted" />
    </span>
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
      <label htmlFor={id} className="text-[13px] font-medium text-ink">{label}</label>
      {hint ? <p className="-mt-1 text-xs text-muted">{hint}</p> : null}
      {children(id)}
      {error ? <p className="text-xs text-bad" role="alert">{error}</p> : null}
    </div>
  );
}

/** The switch itself, no label. */
export function Switch({ checked, onChange, disabled, label }: { checked: boolean; onChange: (v: boolean) => void; disabled?: boolean; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cx(
        "relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors duration-200",
        "disabled:cursor-not-allowed disabled:opacity-50",
        checked ? "bg-accent" : "bg-line-strong",
      )}
    >
      <span
        className={cx(
          "inline-block h-5 w-5 rounded-full bg-white shadow-[0_1px_3px_rgb(16_24_40/0.25)] transition-transform duration-200",
          checked ? "translate-x-[22px]" : "translate-x-0.5",
        )}
      />
    </button>
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
    <div className={cx("flex items-start justify-between gap-6 py-2", disabled && "opacity-60")}>
      <span className="flex min-w-0 flex-col">
        <span className="text-sm font-medium text-ink">{label}</span>
        {description ? <span className="mt-0.5 text-[13px] text-muted">{description}</span> : null}
      </span>
      <Switch checked={checked} onChange={onChange} disabled={disabled} label={label} />
    </div>
  );
}

/** Segmented control: a few mutually exclusive options, all visible. */
export function Segmented<T extends string>({
  value, onChange, options, disabled, size = "md", label,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string }[];
  disabled?: boolean;
  size?: "sm" | "md";
  label: string;
}) {
  return (
    <div role="radiogroup" aria-label={label} className={cx("inline-flex rounded-ui border border-line bg-sunken p-0.5", disabled && "opacity-50")}>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={on}
            disabled={disabled}
            onClick={() => onChange(o.value)}
            className={cx(
              "whitespace-nowrap rounded-[6px] font-medium transition-colors",
              size === "sm" ? "h-7 px-2.5 text-xs" : "h-8 px-3 text-[13px]",
              on ? "bg-surface text-ink shadow-card" : "text-muted hover:text-ink",
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

// ─── Layout pieces ────────────────────────────────────────────────────────────

export function Card({ className, children, ...rest }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cx("rounded-card border border-line bg-surface shadow-card", className)} {...rest}>{children}</div>;
}

/** A titled card whose body is a list of setting rows. */
export function SectionCard({
  title, description, children, footer, className,
}: {
  title: string;
  description?: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
  className?: string;
}) {
  return (
    <Card className={className}>
      <div className="border-b border-line px-6 py-4">
        <h3 className="text-[15px] font-semibold text-ink">{title}</h3>
        {description ? <p className="mt-0.5 text-[13px] text-muted">{description}</p> : null}
      </div>
      <div className="divide-y divide-line px-6">{children}</div>
      {footer ? <div className="rounded-b-card border-t border-line bg-raised px-6 py-3">{footer}</div> : null}
    </Card>
  );
}

/** Label and description on the left, the control on the right. */
export function SettingRow({
  label, description, children, stack,
}: {
  label: string;
  description?: React.ReactNode;
  children: React.ReactNode;
  /** Put the control under the text (wide controls). */
  stack?: boolean;
}) {
  return (
    <div className={cx("py-4", stack ? "grid gap-3" : "flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-8")}>
      <div className="min-w-0">
        <p className="text-sm font-medium text-ink">{label}</p>
        {description ? <p className="mt-0.5 max-w-[60ch] text-[13px] text-muted">{description}</p> : null}
      </div>
      <div className={cx("shrink-0", stack && "w-full")}>{children}</div>
    </div>
  );
}

export function EmptyState({ icon, title, children, action }: { icon?: React.ReactNode; title: string; children?: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center rounded-card border border-dashed border-line-strong bg-surface/60 px-6 py-14 text-center">
      {icon ? <span className="mb-4 grid h-11 w-11 place-items-center rounded-full bg-accent-soft text-accent">{icon}</span> : null}
      <p className="font-medium text-ink">{title}</p>
      {children ? <p className="mt-1 max-w-sm text-sm text-muted">{children}</p> : null}
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}

// ─── Display ──────────────────────────────────────────────────────────────────

type Tone = "neutral" | "accent" | "ok" | "warn" | "bad";

const TONES: Record<Tone, string> = {
  neutral: "bg-sunken text-ink-2 ring-line",
  accent: "bg-accent-soft text-accent ring-accent-line",
  ok: "bg-ok-soft text-ok ring-ok/20",
  warn: "bg-warn-soft text-warn ring-warn/25",
  bad: "bg-bad-soft text-bad ring-bad/20",
};

export function Badge({ tone = "neutral", children, className }: { tone?: Tone; children: React.ReactNode; className?: string }) {
  return (
    <span className={cx("inline-flex h-6 items-center gap-1 whitespace-nowrap rounded-full px-2.5 text-xs font-medium ring-1 ring-inset", TONES[tone], className)}>
      {children}
    </span>
  );
}

/** Initials in a soft circle. The hue comes from the name, so a person keeps theirs across pages. */
const AVATAR_HUES = ["#52796f", "#354f52", "#6b8f71", "#8a6d3b", "#5b6c8f", "#8c5a5a", "#4f7a86", "#7a6f4f"];
export function Avatar({ name, size = 32 }: { name: string; size?: number }) {
  const initials = name.trim().split(/\s+/).slice(0, 2).map((p) => p[0]?.toUpperCase() ?? "").join("") || "?";
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) | 0;
  const hue = AVATAR_HUES[Math.abs(h) % AVATAR_HUES.length];
  return (
    <span
      aria-hidden
      className="grid shrink-0 place-items-center rounded-full font-semibold"
      style={{ width: size, height: size, fontSize: size * 0.38, color: `color-mix(in srgb, ${hue} 70%, var(--ink))`, background: `color-mix(in srgb, ${hue} 16%, transparent)` }}
    >
      {initials}
    </span>
  );
}

/** Avatar + name + username, the standard way a person appears in a table. */
export function Person({ name, sub, size = 32 }: { name: string; sub?: React.ReactNode; size?: number }) {
  return (
    <span className="flex min-w-0 items-center gap-3">
      <Avatar name={name} size={size} />
      <span className="min-w-0 leading-tight">
        <span className="block truncate font-medium text-ink">{name}</span>
        {sub ? <span className="block truncate text-xs text-muted">{sub}</span> : null}
      </span>
    </span>
  );
}

export function Notice({ tone = "neutral", title, children, action }: {
  tone?: Tone;
  title?: string;
  children?: React.ReactNode;
  action?: React.ReactNode;
}) {
  const box: Record<Tone, string> = {
    neutral: "border-line bg-surface",
    accent: "border-accent-line bg-accent-soft",
    ok: "border-ok/25 bg-ok-soft",
    warn: "border-warn/30 bg-warn-soft",
    bad: "border-bad/25 bg-bad-soft",
  };
  const titleColor: Record<Tone, string> = { neutral: "text-ink", accent: "text-accent", ok: "text-ok", warn: "text-warn", bad: "text-bad" };
  return (
    <div role={tone === "bad" ? "alert" : "status"} className={cx("flex flex-col gap-3 rounded-card border px-4 py-3.5 sm:flex-row sm:items-center", box[tone])}>
      <div className="flex-1 text-sm">
        {title ? <p className={cx("font-semibold", titleColor[tone])}>{title}</p> : null}
        {children ? <div className="text-ink-2">{children}</div> : null}
      </div>
      {action}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cx("rounded-card bg-line/60 motion-safe:animate-pulse", className)} />;
}

export function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="rounded-[5px] border border-line-strong bg-surface px-1.5 py-0.5 font-mono text-[11px] text-ink-2 shadow-card">
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
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-[rgb(47_62_70/0.45)] p-4 backdrop-blur-[2px]" onClick={dismissable ? onClose : undefined}>
      <div
        ref={panel}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
        className={cx("w-full overflow-hidden rounded-card border border-line bg-surface shadow-pop focus:outline-none", width)}
      >
        <div className="px-6 pb-2 pt-5">
          <h2 className={cx("text-base font-semibold", tone === "bad" ? "text-bad" : tone === "warn" ? "text-warn" : "text-ink")}>{title}</h2>
        </div>
        <div className="px-6 pb-5 text-sm text-ink-2">{children}</div>
        {footer ? <div className="flex justify-end gap-2 border-t border-line bg-raised px-6 py-3.5">{footer}</div> : null}
      </div>
    </div>
  );
}
