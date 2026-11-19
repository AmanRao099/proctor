"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { ArrowLeft } from "@phosphor-icons/react/dist/ssr";
import { PageHeader } from "@/components/admin/AdminShell";
import { ResultsBoard } from "@/components/admin/ResultsBoard";
import { api } from "@/lib/client/api";

export default function ResultsPage() {
  const { id } = useParams<{ id: string }>();
  const [title, setTitle] = useState("Results");
  const [window_, setWindow] = useState("");
  useEffect(() => {
    api.get<{ test: { title: string; window: string } }>(`/api/admin/tests/${id}/results`)
      .then((r) => { setTitle(r.test.title); setWindow(r.test.window); })
      .catch(() => {});
  }, [id]);
  return (
    <div>
      <Link href="/admin/dsa-master?view=results" className="mb-3 inline-flex items-center gap-1.5 text-sm text-muted hover:text-ink"><ArrowLeft size={14} /> DSA Master</Link>
      <PageHeader
        title={title}
        subtitle={window_ === "live" ? <span className="text-accent">Live. The board refreshes every 15 seconds.</span> : "Result sheet"}
        actions={<Link href={`/admin/tests/${id}`} className="text-sm text-muted hover:text-ink">Edit test</Link>}
      />
      <ResultsBoard testId={id} />
    </div>
  );
}
