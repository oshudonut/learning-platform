"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { Bot, BookOpen, ChevronDown } from "lucide-react";
import { Sidebar } from "@/components/layout/Sidebar";
import { TutorChat } from "@/components/tutor/TutorChat";

type DocOption = { id: string; title: string };

function TutorPageInner() {
  const params = useSearchParams();
  const docParam = params.get("doc");

  const [docs, setDocs] = useState<DocOption[]>([]);
  const [selectedDoc, setSelectedDoc] = useState<string>(docParam ?? "");
  const [docTitle, setDocTitle] = useState<string>("");

  useEffect(() => {
    fetch("/api/library")
      .then((r) => r.json())
      .then((data) => {
        const list = (data.documents ?? []) as DocOption[];
        setDocs(list);
        if (docParam) {
          const found = list.find((d) => d.id === docParam);
          if (found) setDocTitle(found.title);
        }
      })
      .catch(() => null);
  }, [docParam]);

  function handleDocChange(id: string) {
    setSelectedDoc(id);
    const found = docs.find((d) => d.id === id);
    setDocTitle(found?.title ?? "");
  }

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <main className="flex-1 ml-60 flex flex-col overflow-hidden">
        {/* Header */}
        <div className="border-b border-border px-8 py-5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-xl bg-primary/10 ring-1 ring-primary/20 flex items-center justify-center">
              <Bot className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-foreground">AI Professor</h1>
              <p className="text-xs text-muted-foreground">
                Harvard-level tutoring · Socratic method · Adaptive teaching
              </p>
            </div>
          </div>

          {/* Document context selector */}
          <div className="relative">
            <div className="flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-sm">
              <BookOpen className="h-4 w-4 text-muted-foreground" />
              <select
                value={selectedDoc}
                onChange={(e) => handleDocChange(e.target.value)}
                className="bg-transparent text-foreground focus:outline-none pr-6 max-w-[200px]"
              >
                <option value="">No document context</option>
                {docs.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.title}
                  </option>
                ))}
              </select>
              <ChevronDown className="h-3.5 w-3.5 text-muted-foreground pointer-events-none absolute right-3" />
            </div>
          </div>
        </div>

        {/* Chat */}
        <div className="flex-1 overflow-hidden px-8 py-6 flex flex-col" style={{ maxHeight: "calc(100vh - 80px)" }}>
          <TutorChat
            key={selectedDoc} // remount when doc changes
            documentId={selectedDoc || undefined}
            documentTitle={docTitle || undefined}
          />
        </div>
      </main>
    </div>
  );
}

export default function TutorPage() {
  return (
    <Suspense fallback={
      <div className="flex min-h-screen">
        <Sidebar />
        <main className="flex-1 ml-60 flex items-center justify-center">
          <div className="h-8 w-8 rounded-full border-2 border-primary border-t-transparent animate-spin" />
        </main>
      </div>
    }>
      <TutorPageInner />
    </Suspense>
  );
}
