"use client";

import { useState } from "react";
import { CaretDown } from "@phosphor-icons/react/dist/ssr/CaretDown";
import { CaretRight } from "@phosphor-icons/react/dist/ssr/CaretRight";
import { Copy } from "@phosphor-icons/react/dist/ssr/Copy";
import { Eye } from "@phosphor-icons/react/dist/ssr/Eye";
import { EyeSlash } from "@phosphor-icons/react/dist/ssr/EyeSlash";
import { Plus } from "@phosphor-icons/react/dist/ssr/Plus";
import { Trash } from "@phosphor-icons/react/dist/ssr/Trash";
import { Button, Field, Input, Select, Textarea, cx } from "@/components/ui";
import { LANGUAGES, LANGUAGE_KEYS, type Language } from "@/lib/shared/languages";
import { DIFFICULTIES, type AdminProblem } from "@/lib/shared/types";

export function blankProblem(n: number): AdminProblem {
  return {
    id: "",
    title: `Problem ${n}`,
    statement: "",
    input_format: "",
    output_format: "",
    constraints: "",
    marks: 10,
    difficulty: "Medium",
    topics: [],
    cpu_time_limit: 2,
    memory_limit_kb: 256_000,
    languages: [...LANGUAGE_KEYS],
    starter: {},
    cases: [{ id: "", input: "", output: "", hidden: false }],
  };
}

const mono = "font-mono text-[12.5px]";

export function ProblemEditor({
  problem, index, onChange, onRemove, onDuplicate, defaultOpen, actions,
}: {
  problem: AdminProblem;
  index: number;
  onChange: (p: AdminProblem) => void;
  onRemove: () => void;
  onDuplicate?: () => void;
  defaultOpen?: boolean;
  /** Extra controls in the header row, e.g. Save for a bank problem. */
  actions?: React.ReactNode;
}) {
  const [open, setOpen] = useState(!!defaultOpen);
  const set = <K extends keyof AdminProblem>(k: K, v: AdminProblem[K]) => onChange({ ...problem, [k]: v });
  const setCase = (i: number, patch: Partial<AdminProblem["cases"][number]>) =>
    set("cases", problem.cases.map((c, j) => (j === i ? { ...c, ...patch } : c)));
  const visible = problem.cases.filter((c) => !c.hidden).length;
  const hidden = problem.cases.length - visible;

  function toggleLang(l: Language) {
    const has = problem.languages.includes(l);
    if (has && problem.languages.length === 1) return;
    set("languages", has ? problem.languages.filter((x) => x !== l) : [...problem.languages, l]);
  }

  return (
    <div className="rounded-card border border-line bg-surface shadow-card">
      <div className="flex items-center gap-3 px-4 py-3">
        <button type="button" onClick={() => setOpen(!open)} className="flex min-w-0 flex-1 items-center gap-3 text-left">
          {open ? <CaretDown size={14} className="text-muted" /> : <CaretRight size={14} className="text-muted" />}
          <span className="grid h-6 w-6 place-items-center rounded-full bg-sunken text-xs font-medium text-ink-2">{index + 1}</span>
          <span className="truncate font-medium">{problem.title || "Untitled problem"}</span>
          <span className="ml-auto hidden shrink-0 text-xs text-muted sm:inline">
            {problem.difficulty || "Medium"} | {problem.marks} marks | {visible} sample, {hidden} hidden
          </span>
        </button>
        {actions}
        {onDuplicate ? <Button size="sm" variant="ghost" onClick={onDuplicate} aria-label="Duplicate problem" title="Duplicate"><Copy size={14} /></Button> : null}
        <Button size="sm" variant="ghost" onClick={onRemove} aria-label="Remove problem" title="Remove"><Trash size={14} /></Button>
      </div>

      {open ? (
        <div className="grid gap-6 border-t border-line px-4 py-5">
          <div className="grid gap-4 sm:grid-cols-[1fr_110px_110px_130px]">
            <Field label="Title">{(id) => <Input id={id} value={problem.title} onChange={(e) => set("title", e.target.value)} />}</Field>
            <Field label="Marks">{(id) => <Input id={id} type="number" min={0} value={problem.marks} onChange={(e) => set("marks", Number(e.target.value))} />}</Field>
            <Field label="CPU limit (s)">{(id) => <Input id={id} type="number" min={0.5} max={15} step={0.5} value={problem.cpu_time_limit} onChange={(e) => set("cpu_time_limit", Number(e.target.value))} />}</Field>
            <Field label="Memory (MB)">{(id) => <Input id={id} type="number" min={16} max={512} value={Math.round(problem.memory_limit_kb / 1000)} onChange={(e) => set("memory_limit_kb", Number(e.target.value) * 1000)} />}</Field>
          </div>

          <div className="grid gap-4 sm:grid-cols-[160px_1fr]">
            <Field label="Difficulty">
              {(id) => (
                <Select id={id} value={problem.difficulty || "Medium"} onChange={(e) => set("difficulty", e.target.value)}>
                  {DIFFICULTIES.map((x) => <option key={x} value={x}>{x}</option>)}
                </Select>
              )}
            </Field>
            <Field label="Topics" hint="Comma separated. Performance groups are built on difficulty and topics.">
              {(id) => (
                <Input
                  id={id}
                  defaultValue={(problem.topics || []).join(", ")}
                  onBlur={(e) => set("topics", Array.from(new Set(e.target.value.split(",").map((t) => t.trim()).filter(Boolean))).slice(0, 12))}
                  placeholder="Arrays, Hashing"
                />
              )}
            </Field>
          </div>

          <Field label="Statement" hint="Plain text. Blank lines start a new paragraph; wrap code in `backticks`.">
            {(id) => <Textarea id={id} value={problem.statement} onChange={(e) => set("statement", e.target.value)} className="min-h-40" />}
          </Field>
          <div className="grid gap-4 md:grid-cols-3">
            <Field label="Input format">{(id) => <Textarea id={id} value={problem.input_format} onChange={(e) => set("input_format", e.target.value)} />}</Field>
            <Field label="Output format">{(id) => <Textarea id={id} value={problem.output_format} onChange={(e) => set("output_format", e.target.value)} />}</Field>
            <Field label="Constraints">{(id) => <Textarea id={id} value={problem.constraints} onChange={(e) => set("constraints", e.target.value)} />}</Field>
          </div>

          <fieldset>
            <legend className="text-[13px] font-medium text-ink-2">Languages allowed</legend>
            <div className="mt-2 flex flex-wrap gap-2">
              {LANGUAGE_KEYS.map((l) => (
                <button
                  key={l}
                  type="button"
                  onClick={() => toggleLang(l)}
                  aria-pressed={problem.languages.includes(l)}
                  className={cx(
                    "h-8 rounded-ui border px-3 text-[13px] transition-colors",
                    problem.languages.includes(l) ? "border-ink bg-ink text-bg" : "border-line-strong text-muted hover:text-ink",
                  )}
                >
                  {LANGUAGES[l].label}
                </button>
              ))}
            </div>
            <p className="mt-2 text-xs text-muted">Programs read stdin and print to stdout. Java code must use a class named Main.</p>
          </fieldset>

          <div>
            <div className="flex items-baseline justify-between">
              <p className="text-[13px] font-medium text-ink-2">Test cases</p>
              <p className="text-xs text-muted">Visible cases appear as examples and run on Run. Hidden cases only run on Submit.</p>
            </div>
            <div className="mt-3 grid gap-3">
              {problem.cases.map((c, i) => (
                <div key={i} className="grid gap-3 rounded-ui border border-line bg-bg p-3 md:grid-cols-[1fr_1fr_auto]">
                  <Field label={`Input ${i + 1}`}>
                    {(id) => <Textarea id={id} value={c.input} onChange={(e) => setCase(i, { input: e.target.value })} className={cx("min-h-20", mono)} spellCheck={false} />}
                  </Field>
                  <Field label="Expected output">
                    {(id) => <Textarea id={id} value={c.output} onChange={(e) => setCase(i, { output: e.target.value })} className={cx("min-h-20", mono)} spellCheck={false} />}
                  </Field>
                  <div className="flex gap-1 md:flex-col md:pt-6">
                    <Button
                      size="sm"
                      variant={c.hidden ? "secondary" : "ghost"}
                      onClick={() => setCase(i, { hidden: !c.hidden })}
                      title={c.hidden ? "Hidden from candidates" : "Shown as an example"}
                    >
                      {c.hidden ? <EyeSlash size={14} /> : <Eye size={14} />}
                      {c.hidden ? "Hidden" : "Sample"}
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => set("cases", problem.cases.filter((_, j) => j !== i))} aria-label={`Remove case ${i + 1}`}>
                      <Trash size={14} />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
            <Button size="sm" className="mt-3" onClick={() => set("cases", [...problem.cases, { id: "", input: "", output: "", hidden: true }])}>
              <Plus size={14} /> Add test case
            </Button>
            <p className="mt-2 text-xs text-muted">Output is compared line by line, ignoring trailing spaces and trailing blank lines.</p>
          </div>
        </div>
      ) : null}
    </div>
  );
}
