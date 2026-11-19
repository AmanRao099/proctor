"use client";

import type { Sheet, SheetRow } from "@/lib/shared/sheet";
import { performanceAxes, problemAverages, problemAxes, type RadarAxis } from "./radar";

/*
 * PDF reports, built in the browser with jsPDF (imported on demand), the same
 * approach as MyCodeBud's testResultsPdf.ts and dsaStudentReportPdf.ts:
 *
 *   resultSheetPdf   one test's ranked sheet, absentees included, with each
 *                    student's violations printed directly under their row.
 *   studentReportPdf one student's report: standing, radar against the
 *                    cohort, per-problem marks vs the cohort average, the
 *                    proctoring record, the follow-up answer and the code.
 *
 * Everything comes from the result sheet the admin already has open, so a PDF
 * can never disagree with the screen.
 */

type Doc = import("jspdf").jsPDF;

const APP = process.env.NEXT_PUBLIC_APP_NAME || "Proctor";
const INK: [number, number, number] = [47, 62, 70];
const MUTED: [number, number, number] = [95, 111, 114];
const LINE: [number, number, number] = [202, 210, 197];
const ACCENT: [number, number, number] = [82, 121, 111];
const BAD: [number, number, number] = [180, 35, 24];
const WARN: [number, number, number] = [150, 84, 7];
const OK: [number, number, number] = [26, 115, 67];

async function newDoc(orientation: "portrait" | "landscape"): Promise<Doc> {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ orientation, unit: "mm", format: "a4" });
  doc.setFont("helvetica", "normal");
  return doc;
}

const clean = (s: string) => (s || "").replace(/[^\x09\x0A\x0D\x20-\x7E]/g, "?");
const fmtDate = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString(undefined, { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" }) : "-";
const fmtTime = (iso: string) => new Date(iso).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit", second: "2-digit" });
const mins = (s: number) => `${Math.floor(s / 60)}m ${String(s % 60).padStart(2, "0")}s`;
const fileSafe = (s: string) => s.replace(/[^\w-]+/g, "_").slice(0, 60);
const STATUS: Record<SheetRow["status"], string> = { passed: "Passed", failed: "Failed", absent: "Absent", in_progress: "Writing" };

function header(doc: Doc, title: string, sub: string, right: string) {
  const W = doc.internal.pageSize.getWidth();
  doc.setFillColor(...INK);
  doc.rect(0, 0, W, 24, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.text(APP.toUpperCase(), 12, 8.5);
  doc.setFontSize(14);
  doc.text(clean(title).slice(0, 90), 12, 16);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.text(clean(sub), 12, 21);
  doc.text(clean(right), W - 12, 8.5, { align: "right" });
  doc.setFillColor(...ACCENT);
  doc.rect(0, 24, W, 0.8, "F");
  doc.setTextColor(...INK);
}

function footer(doc: Doc) {
  const n = doc.getNumberOfPages();
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  for (let i = 1; i <= n; i++) {
    doc.setPage(i);
    doc.setFontSize(7.5);
    doc.setTextColor(...MUTED);
    doc.text(`Page ${i} of ${n}`, W - 12, H - 6, { align: "right" });
    doc.text(`Generated ${fmtDate(new Date().toISOString())}`, 12, H - 6);
  }
}

// ─── Result sheet ─────────────────────────────────────────────────────────────

export async function resultSheetPdf(sheet: Sheet) {
  const doc = await newDoc("landscape");
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const t = sheet.test;
  header(doc, t.title, `${fmtDate(t.starts_at)} to ${fmtDate(t.ends_at)} | ${t.duration_minutes} min | ${t.total_marks} marks | pass mark ${sheet.pass_mark}%`, "Result sheet");

  // Summary cards.
  const s = sheet.summary;
  const cards: [string, string][] = [
    ["Sat the test", `${s.started}${s.assigned !== null ? ` / ${s.assigned}` : ""}`],
    ["Passed", String(s.passed)], ["Failed", String(s.failed)], ["Absent", String(s.absent)],
    ["Average", `${s.average_percent}%`], ["Flagged", String(s.flagged)], ["Auto handed in", String(s.auto_submitted)],
  ];
  const cw = (W - 24 - 6 * 3) / cards.length;
  cards.forEach(([label, value], i) => {
    const x = 12 + i * (cw + 3);
    doc.setDrawColor(...LINE);
    doc.rect(x, 30, cw, 15);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(13);
    doc.text(value, x + 3, 38);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.setTextColor(...MUTED);
    doc.text(label.toUpperCase(), x + 3, 42.5);
    doc.setTextColor(...INK);
  });

  // Columns.
  const probCols = t.problems.map((p, i) => ({ label: `P${i + 1} /${p.marks}`, w: 14 }));
  const fixed = [
    { label: "#", w: 9 }, { label: "Student", w: 62 }, { label: "Status", w: 18 }, { label: "Marks", w: 22 },
    ...probCols, { label: "Time", w: 18 }, { label: "Violations", w: 22 },
  ];
  const used = fixed.reduce((a, c) => a + c.w, 0);
  const scale = Math.min(1, (W - 24) / used);
  const cols = fixed.map((c) => ({ ...c, w: c.w * scale }));
  let y = 52;

  const head = () => {
    doc.setFillColor(237, 241, 235);
    doc.rect(12, y - 4.5, W - 24, 7, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    let x = 14;
    cols.forEach((c) => { doc.text(c.label, x, y); x += c.w; });
    doc.setFont("helvetica", "normal");
    y += 6;
  };
  head();

  for (const r of sheet.rows) {
    const extra = r.violations.length ? 4 + r.violations.length * 4 : 0;
    if (y + 12 + extra > H - 12) {
      doc.addPage();
      y = 16;
      head();
    }
    let x = 14;
    doc.setFontSize(8.5);
    const cells = [
      r.rank ? String(r.rank) : "-",
      "",
      STATUS[r.status],
      r.state === "not_started" ? "-" : `${r.marks_obtained}/${r.total_marks} (${r.percent}%)`,
      ...r.problems.map((p) => (p.attempted ? String(p.marks_obtained) : "-")),
      r.state === "not_started" ? "-" : mins(r.time_spent_seconds),
      r.violation_count ? `${r.violation_count}${r.auto_submitted ? " (auto)" : ""}` : "0",
    ];
    cells.forEach((v, i) => {
      if (i === 1) {
        doc.setFont("helvetica", "bold");
        doc.text(clean(r.name).slice(0, 40), x, y);
        doc.setFont("helvetica", "normal");
        doc.setFontSize(7);
        doc.setTextColor(...MUTED);
        doc.text(clean(`${r.username}${r.email ? ` | ${r.email}` : ""}`).slice(0, 52), x, y + 3.6);
        doc.setTextColor(...INK);
        doc.setFontSize(8.5);
      } else {
        if (i === 2) doc.setTextColor(...(r.status === "passed" ? OK : r.status === "failed" ? BAD : MUTED));
        if (i === cells.length - 1 && r.violation_count) doc.setTextColor(...(r.auto_submitted ? BAD : WARN));
        doc.text(v, x, y);
        doc.setTextColor(...INK);
      }
      x += cols[i].w;
    });
    // Two-line rows: name, then username + email at y + 3.6.
    y += 8.5;
    if (r.violations.length) {
      const started = r.started_at ? new Date(r.started_at).getTime() : 0;
      doc.setFontSize(7.2);
      for (const v of r.violations) {
        const off = started ? Math.max(0, Math.round((new Date(v.timestamp).getTime() - started) / 1000)) : 0;
        doc.setTextColor(...(v.type === "CRITICAL" ? BAD : WARN));
        doc.text(v.type === "CRITICAL" ? "CRITICAL" : "WARNING", 26, y);
        doc.setTextColor(...MUTED);
        doc.text(`${fmtTime(v.timestamp)}  +${mins(off)}`, 44, y);
        doc.setTextColor(...INK);
        doc.text(clean(v.description).slice(0, 140), 74, y);
        y += 4;
      }
      y += 1;
    }
    doc.setDrawColor(...LINE);
    doc.line(12, y - 2.5, W - 12, y - 2.5);
    y += 2;
  }
  footer(doc);
  doc.save(`${fileSafe(t.title)}_result_sheet.pdf`);
}

// ─── Student report ───────────────────────────────────────────────────────────

function radar(doc: Doc, axes: RadarAxis[], cx: number, cy: number, r: number, title: string) {
  const n = axes.length;
  const pt = (i: number, v: number): [number, number] => {
    const a = (Math.PI * 2 * i) / n - Math.PI / 2;
    return [cx + Math.cos(a) * r * (v / 100), cy + Math.sin(a) * r * (v / 100)];
  };
  const shape = (vals: number[], style: "S" | "FD") => {
    const pts = vals.map((v, i) => pt(i, v));
    const deltas = pts.slice(1).map((p, i) => [p[0] - pts[i][0], p[1] - pts[i][1]]);
    doc.lines(deltas, pts[0][0], pts[0][1], [1, 1], style, true);
  };
  doc.setFontSize(8);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...MUTED);
  doc.text(title.toUpperCase(), cx, cy - r - 8, { align: "center" });
  doc.setFont("helvetica", "normal");
  doc.setDrawColor(...LINE);
  doc.setLineWidth(0.2);
  [25, 50, 75, 100].forEach((ring) => shape(axes.map(() => ring), "S"));
  axes.forEach((_, i) => { const [x, y] = pt(i, 100); doc.line(cx, cy, x, y); });
  doc.setDrawColor(...MUTED);
  doc.setLineDashPattern([1, 1], 0);
  shape(axes.map((a) => a.cohort), "S");
  doc.setLineDashPattern([], 0);
  doc.setDrawColor(...ACCENT);
  doc.setFillColor(222, 233, 225);
  doc.setLineWidth(0.6);
  shape(axes.map((a) => a.student), "FD");
  doc.setLineWidth(0.2);
  doc.setFontSize(7.5);
  axes.forEach((a, i) => {
    const [x, y] = pt(i, 122);
    const align = Math.abs(x - cx) < 2 ? "center" : x > cx ? "left" : "right";
    doc.setTextColor(...INK);
    doc.text(`${a.axis} ${a.student}`, x, y + 1, { align });
  });
  doc.setTextColor(...INK);
}

export async function studentReportPdf(sheet: Sheet, row: SheetRow, code?: { title: string; language: string; code: string }[]) {
  const doc = await newDoc("portrait");
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const t = sheet.test;
  header(doc, row.name || "Student", `${t.title} | ${fmtDate(t.starts_at)}`, "Performance report");
  let y = 32;
  const ensure = (h: number) => { if (y + h > H - 14) { doc.addPage(); y = 16; } };
  const section = (title: string) => {
    ensure(12);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.setTextColor(...MUTED);
    doc.text(title.toUpperCase(), 12, y);
    doc.setDrawColor(...LINE);
    doc.line(12, y + 1.5, W - 12, y + 1.5);
    doc.setTextColor(...INK);
    doc.setFont("helvetica", "normal");
    y += 7;
  };

  // Identity.
  doc.setFontSize(9);
  const id: [string, string][] = [
    ["Username", row.username], ["Email", row.email || "-"],
    ["Started", fmtDate(row.started_at)], ["Handed in", row.submitted_at ? fmtDate(row.submitted_at) : STATUS[row.status]],
  ];
  id.forEach(([k, v], i) => {
    const x = i % 2 ? W / 2 : 12;
    if (i % 2 === 0 && i) y += 5.5;
    doc.setTextColor(...MUTED); doc.text(k, x, y);
    doc.setTextColor(...INK); doc.text(clean(v).slice(0, 48), x + 24, y);
  });
  y += 10;

  // Score cards.
  const sat = sheet.rows.filter((r) => r.state !== "not_started").length;
  const cards: [string, string][] = [
    ["Marks", `${row.marks_obtained}/${row.total_marks}`], ["Score", `${row.percent}%`],
    ["Rank", row.rank ? `${row.rank} / ${sat}` : "-"], ["Percentile", row.percentile !== null ? String(row.percentile) : "-"],
    ["Solved", `${row.solved}/${row.problems.length}`], ["Violations", `${row.violation_count}${row.auto_submitted ? " (auto)" : ""}`],
  ];
  const cw = (W - 24 - 5 * 2.5) / 6;
  cards.forEach(([label, value], i) => {
    const x = 12 + i * (cw + 2.5);
    doc.setDrawColor(...LINE);
    doc.rect(x, y, cw, 15);
    doc.setFont("helvetica", "bold"); doc.setFontSize(12);
    doc.text(value, x + 2.5, y + 7.5);
    doc.setFont("helvetica", "normal"); doc.setFontSize(7); doc.setTextColor(...MUTED);
    doc.text(label.toUpperCase(), x + 2.5, y + 12);
    doc.setTextColor(...INK);
  });
  y += 24;

  // Radars.
  section("Performance against the cohort");
  ensure(78);
  const perf = performanceAxes(sheet, row);
  const byProblem = problemAxes(sheet, row);
  if (byProblem) {
    radar(doc, perf, W / 4 + 4, y + 36, 24, "Overall");
    radar(doc, byProblem, (3 * W) / 4 - 4, y + 36, 24, "By problem");
  } else {
    radar(doc, perf, W / 2, y + 36, 26, "Overall");
  }
  y += 74;
  doc.setFontSize(7.5); doc.setTextColor(...MUTED);
  doc.text("Filled: this student. Dashed: average of everyone who sat the test.", 12, y);
  doc.setTextColor(...INK);
  y += 8;

  // Problems vs cohort.
  section("Problems");
  const avgs = problemAverages(sheet);
  doc.setFontSize(8); doc.setFont("helvetica", "bold");
  ["Problem", "Level", "Tests passed", "Marks", "Cohort avg", "Submits", "Language"].forEach((h, i) => doc.text(h, [12, 92, 112, 136, 156, 176, 192][i], y));
  doc.setFont("helvetica", "normal");
  y += 5;
  row.problems.forEach((p, i) => {
    ensure(6);
    doc.text(clean(`P${i + 1}. ${p.title}`).slice(0, 44), 12, y);
    doc.text(p.difficulty, 92, y);
    doc.text(p.attempted ? `${p.passed}/${p.total}` : "-", 112, y);
    doc.setTextColor(...(p.accepted ? OK : p.attempted ? INK : MUTED));
    doc.text(`${p.marks_obtained}/${p.marks}`, 136, y);
    doc.setTextColor(...INK);
    doc.text(String(avgs[i] ?? 0), 156, y);
    doc.text(String(p.submissions), 176, y);
    doc.text(p.language ?? "-", 192, y);
    y += 5.5;
  });
  y += 4;

  if (sheet.test.followup_prompt) {
    section("Follow-up question");
    doc.setFontSize(8.5);
    const lines = doc.splitTextToSize(clean(sheet.test.followup_prompt), W - 24);
    doc.text(lines, 12, y); y += lines.length * 4 + 1;
    doc.setTextColor(...(row.followup ? (row.followup.correct ? OK : BAD) : MUTED));
    doc.text(row.followup ? `Answer: ${clean(row.followup.answer)} (${row.followup.correct ? "correct" : "incorrect"})` : "Not answered", 12, y);
    doc.setTextColor(...INK);
    y += 8;
  }

  section("Proctoring record");
  doc.setFontSize(8.5);
  if (!row.violations.length) {
    doc.text("No violations recorded.", 12, y); y += 6;
  } else {
    const started = row.started_at ? new Date(row.started_at).getTime() : 0;
    for (const v of row.violations) {
      ensure(5);
      const off = started ? Math.max(0, Math.round((new Date(v.timestamp).getTime() - started) / 1000)) : 0;
      doc.setTextColor(...(v.type === "CRITICAL" ? BAD : WARN));
      doc.text(v.type === "CRITICAL" ? "Critical" : "Warning", 12, y);
      doc.setTextColor(...MUTED);
      doc.text(`+${mins(off)}`, 32, y);
      doc.setTextColor(...INK);
      doc.text(clean(v.description).slice(0, 100), 50, y);
      y += 4.8;
    }
    if (row.auto_submitted) {
      doc.setTextColor(...BAD);
      doc.text("The test was handed in automatically at the violation limit.", 12, y + 1);
      doc.setTextColor(...INK);
      y += 6;
    }
  }

  if (code?.length) {
    doc.addPage();
    y = 16;
    section("Submitted code (best submission per problem)");
    for (const c of code) {
      ensure(14);
      doc.setFont("helvetica", "bold"); doc.setFontSize(9);
      doc.text(clean(`${c.title} (${c.language})`), 12, y);
      doc.setFont("courier", "normal"); doc.setFontSize(7.5);
      y += 5;
      const lines = doc.splitTextToSize(clean(c.code || "(no submission)").replace(/\t/g, "    "), W - 24) as string[];
      for (const line of lines) {
        ensure(4);
        doc.text(line, 12, y);
        y += 3.4;
      }
      doc.setFont("helvetica", "normal");
      y += 6;
    }
  }
  footer(doc);
  doc.save(`${fileSafe(row.name || row.username)}_${fileSafe(t.title)}_report.pdf`);
}
