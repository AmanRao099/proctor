"use client";

import { useState } from "react";
import { CheckCircle, LockSimple, XCircle } from "@phosphor-icons/react/dist/ssr";
import { Textarea, cx } from "@/components/ui";
import type { CaseResult, CaseStatus, CustomRunResult, JudgeResult } from "@/lib/shared/types";

export const STATUS_LABEL: Record<CaseStatus | "finished", string> = {
  passed: "Passed",
  wrong_answer: "Wrong answer",
  time_limit: "Time limit exceeded",
  compile_error: "Compilation error",
  runtime_error: "Runtime error",
  judge_error: "Runner error",
  finished: "Finished",
};

export type Outcome =
  | { kind: "samples"; result: JudgeResult }
  | { kind: "submit"; result: JudgeResult }
  | { kind: "withheld"; recorded: boolean; compile_output: string | null }
  | { kind: "custom"; result: CustomRunResult }
  | { kind: "error"; message: string };

function Mono({ label, text, tone }: { label: string; text?: string; tone?: "bad" }) {
  return (
    <div className="min-w-0">
      <p className="mb-1 text-xs text-muted">{label}</p>
      <pre className={cx(
        "max-h-40 overflow-auto rounded-ui border border-line bg-sunken px-3 py-2 font-mono text-[12.5px] leading-relaxed",
        tone === "bad" ? "text-bad" : "text-ink",
      )}>{text || " "}</pre>
    </div>
  );
}

function CaseRow({ r, open, onToggle }: { r: CaseResult; open: boolean; onToggle: () => void }) {
  const pass = r.status === "passed";
  return (
    <div className="border-t border-line first:border-t-0">
      <button
        type="button"
        onClick={r.hidden ? undefined : onToggle}
        className={cx("flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm", !r.hidden && "hover:bg-sunken")}
      >
        {pass ? <CheckCircle size={16} weight="fill" className="text-ok" /> : <XCircle size={16} weight="fill" className="text-bad" />}
        <span className="text-ink">{r.hidden ? "Hidden test" : "Test"} {r.index + 1}</span>
        {r.hidden ? <LockSimple size={13} className="text-muted" /> : null}
        <span className={cx("ml-auto text-xs", pass ? "text-muted" : "text-bad")}>{STATUS_LABEL[r.status]}</span>
        <span className="w-16 text-right font-mono text-xs text-muted tabular">{r.time_ms} ms</span>
      </button>
      {open && !r.hidden ? (
        <div className="grid gap-3 px-4 pb-4 sm:grid-cols-3">
          <Mono label="Input" text={r.input} />
          <Mono label="Expected" text={r.expected} />
          <Mono label="Your output" text={r.output} tone={pass ? undefined : "bad"} />
          {r.message ? <div className="sm:col-span-3"><Mono label="Error" text={r.message} tone="bad" /></div> : null}
        </div>
      ) : null}
    </div>
  );
}

function JudgeView({ result, submit }: { result: JudgeResult; submit: boolean }) {
  const firstFail = result.results.find((r) => r.status !== "passed" && !r.hidden)?.index ?? -1;
  const [open, setOpen] = useState<number>(firstFail);
  const all = result.passed === result.total && result.total > 0;
  return (
    <div>
      <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1 px-4 py-3">
        <p className={cx("text-sm font-semibold", all ? "text-ok" : result.status === "judge_error" ? "text-warn" : "text-bad")}>
          {all ? (submit ? "Accepted" : "Sample tests passed") : STATUS_LABEL[result.status]}
        </p>
        <p className="font-mono text-xs text-muted tabular">
          {result.passed}/{result.total} passed{submit ? ` | ${result.marks_obtained}/${result.marks} marks` : ""}
        </p>
        {!submit && all ? <p className="text-xs text-muted">Submit to run the hidden tests.</p> : null}
      </div>
      {result.status === "judge_error" ? (
        <p className="px-4 pb-3 text-sm text-warn">The runner failed on some tests. This is not a problem with your code, and it was not counted against you. Try again.</p>
      ) : null}
      {result.compile_output ? (
        <div className="px-4 pb-4"><Mono label="Compiler output" text={result.compile_output} tone="bad" /></div>
      ) : (
        <div className="border-t border-line">
          {result.results.map((r) => (
            <CaseRow key={r.index} r={r} open={open === r.index} onToggle={() => setOpen(open === r.index ? -1 : r.index)} />
          ))}
        </div>
      )}
    </div>
  );
}

export function ResultPanel({
  outcome, tab, setTab, stdin, setStdin,
}: {
  outcome: Outcome | null;
  tab: "result" | "custom";
  setTab: (t: "result" | "custom") => void;
  stdin: string;
  setStdin: (s: string) => void;
}) {
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex h-9 shrink-0 items-center gap-1 border-b border-line px-2">
        {(["result", "custom"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={cx(
              "h-7 rounded-ui px-2.5 text-[13px]",
              tab === t ? "bg-sunken text-ink" : "text-muted hover:text-ink",
            )}
          >
            {t === "result" ? "Result" : "Custom input"}
          </button>
        ))}
      </div>
      <div className="min-h-0 flex-1 overflow-auto">
        {tab === "custom" ? (
          <div className="grid gap-3 p-4">
            <Textarea
              value={stdin}
              onChange={(e) => setStdin(e.target.value)}
              placeholder="Type input here, then press Run with custom input"
              className="min-h-28 font-mono text-[13px]"
              spellCheck={false}
            />
            {outcome?.kind === "custom" ? (
              <div className="grid gap-3">
                <p className="text-sm">
                  <span className={outcome.result.status === "finished" ? "text-ok" : "text-bad"}>{STATUS_LABEL[outcome.result.status]}</span>
                  <span className="ml-3 font-mono text-xs text-muted">{outcome.result.time_ms} ms</span>
                </p>
                {outcome.result.compile_output ? <Mono label="Compiler output" text={outcome.result.compile_output} tone="bad" /> : null}
                <Mono label="Output" text={outcome.result.stdout} />
                {outcome.result.stderr ? <Mono label="Error output" text={outcome.result.stderr} tone="bad" /> : null}
              </div>
            ) : null}
          </div>
        ) : !outcome || outcome.kind === "custom" ? (
          <p className="p-4 text-sm text-muted">Run checks your code against the examples. Submit runs every test and records your score.</p>
        ) : outcome.kind === "error" ? (
          <p className="p-4 text-sm text-bad">{outcome.message}</p>
        ) : outcome.kind === "withheld" ? (
          <div className="p-4 text-sm">
            <p className={outcome.recorded ? "font-medium text-ok" : "font-medium text-warn"}>
              {outcome.recorded ? "Submission recorded." : "The runner failed. Nothing was recorded; submit again."}
            </p>
            <p className="mt-1 text-muted">Scores for this test are released by your organiser after it closes.</p>
            {outcome.compile_output ? <div className="mt-3"><Mono label="Compiler output" text={outcome.compile_output} tone="bad" /></div> : null}
          </div>
        ) : (
          <JudgeView key={JSON.stringify(outcome.result.results.map((r) => r.status))} result={outcome.result} submit={outcome.kind === "submit"} />
        )}
      </div>
    </div>
  );
}
