import type { PaperProblem } from "@/lib/shared/types";

/**
 * Plain-text statements with just enough structure: blank lines split
 * paragraphs, `backticks` mark inline code. No markdown engine, so nothing a
 * problem author types can inject markup.
 */
function Rich({ text }: { text: string }) {
  const paragraphs = text.trim().split(/\n\s*\n/);
  return (
    <div className="prose-plain text-[14.5px] leading-relaxed text-ink-2">
      {paragraphs.map((para, i) => (
        <p key={i} className="whitespace-pre-line">
          {para.split(/(`[^`\n]+`)/g).map((chunk, j) =>
            chunk.startsWith("`") && chunk.endsWith("`") && chunk.length > 2
              ? <code key={j}>{chunk.slice(1, -1)}</code>
              : <span key={j}>{chunk}</span>,
          )}
        </p>
      ))}
    </div>
  );
}

function Block({ title, text }: { title: string; text: string }) {
  if (!text.trim()) return null;
  return (
    <section className="mt-7">
      <h3 className="mb-2 text-[13px] font-semibold text-ink">{title}</h3>
      <Rich text={text} />
    </section>
  );
}

function Sample({ label, text }: { label: string; text: string }) {
  return (
    <div className="min-w-0">
      <p className="mb-1 text-xs text-muted">{label}</p>
      <pre className="overflow-x-auto rounded-ui border border-line bg-raised px-3 py-2.5 font-mono text-[13px] leading-relaxed text-ink">{text || " "}</pre>
    </div>
  );
}

export function Statement({ problem, index }: { problem: PaperProblem; index: number }) {
  return (
    <article className="px-6 py-6">
      <p className="flex items-center gap-2 text-xs text-muted"><span className="rounded-full bg-accent-soft px-2 py-0.5 font-medium text-accent">Problem {index + 1}</span>{problem.marks} marks</p>
      <h2 className="mt-3 text-[22px] font-semibold tracking-tight text-ink">{problem.title}</h2>
      <div className="mt-5"><Rich text={problem.statement} /></div>
      <Block title="Input" text={problem.input_format} />
      <Block title="Output" text={problem.output_format} />
      <Block title="Constraints" text={problem.constraints} />
      {problem.samples.length ? (
        <section className="mt-7">
          <h3 className="mb-3 text-[13px] font-semibold text-ink">Examples</h3>
          <div className="grid gap-5">
            {problem.samples.map((s, i) => (
              <div key={i} className="grid gap-3 sm:grid-cols-2">
                <Sample label={`Input ${i + 1}`} text={s.input} />
                <Sample label={`Output ${i + 1}`} text={s.output} />
              </div>
            ))}
          </div>
        </section>
      ) : null}
      {problem.hidden_count ? (
        <p className="mt-7 text-xs text-muted">
          Submit also runs {problem.hidden_count} hidden test{problem.hidden_count === 1 ? "" : "s"} you cannot see.
        </p>
      ) : null}
    </article>
  );
}
