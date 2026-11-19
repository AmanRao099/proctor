"use client";

import Editor, { loader, type OnMount } from "@monaco-editor/react";
import { useEffect, useState } from "react";
import { LANGUAGES, type Language } from "@/lib/shared/languages";
import { Skeleton } from "@/components/ui";

// Self-hosted (copied to public/ by scripts/copy-monaco.mjs), never a CDN: an
// exam must not fail because a third party is slow at 10:00 on test day.
loader.config({ paths: { vs: "/vendor/monaco/vs" } });

function usePrefersDark() {
  const [dark, setDark] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const read = () => {
      const forced = document.documentElement.dataset.theme;
      setDark(forced ? forced === "dark" : mq.matches);
    };
    read();
    mq.addEventListener("change", read);
    return () => mq.removeEventListener("change", read);
  }, []);
  return dark;
}

export function CodeEditor({
  value, language, onChange, readOnly, onRun,
}: {
  value: string;
  language: Language;
  onChange: (v: string) => void;
  readOnly?: boolean;
  onRun?: () => void;
}) {
  const dark = usePrefersDark();

  const onMount: OnMount = (editor, monaco) => {
    monaco.editor.defineTheme("proctor-light", {
      base: "vs",
      inherit: true,
      rules: [],
      colors: {
        "editor.background": "#ffffff",
        "editorLineNumber.foreground": "#a1a1aa",
        "editorLineNumber.activeForeground": "#3f3f46",
        "editor.lineHighlightBackground": "#f4f4f5",
        "editorIndentGuide.background1": "#ececeb",
      },
    });
    monaco.editor.defineTheme("proctor-dark", {
      base: "vs-dark",
      inherit: true,
      rules: [],
      colors: {
        "editor.background": "#141417",
        "editorLineNumber.foreground": "#52525b",
        "editorLineNumber.activeForeground": "#d4d4d8",
        "editor.lineHighlightBackground": "#1c1c20",
        "editorIndentGuide.background1": "#232328",
      },
    });
    monaco.editor.setTheme(dark ? "proctor-dark" : "proctor-light");
    if (onRun) {
      editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Quote, onRun);
    }
    editor.focus();
  };

  return (
    <Editor
      height="100%"
      language={LANGUAGES[language].monaco}
      value={value}
      theme={dark ? "proctor-dark" : "proctor-light"}
      onChange={(v) => onChange(v ?? "")}
      onMount={onMount}
      loading={<div className="h-full w-full p-4"><Skeleton className="h-full w-full" /></div>}
      options={{
        readOnly,
        fontFamily: "var(--font-geist-mono), ui-monospace, monospace",
        fontSize: 14,
        lineHeight: 22,
        minimap: { enabled: false },
        scrollBeyondLastLine: false,
        renderLineHighlight: "line",
        tabSize: 4,
        automaticLayout: true,
        padding: { top: 12, bottom: 12 },
        // Proctoring: no context menu (its Paste would bypass the paste
        // block), no drag-and-drop of outside text.
        contextmenu: false,
        dragAndDrop: false,
        dropIntoEditor: { enabled: false },
        pasteAs: { enabled: false },
        quickSuggestions: { other: true, comments: false, strings: false },
        wordBasedSuggestions: "currentDocument",
        stickyScroll: { enabled: false },
        overviewRulerBorder: false,
        hideCursorInOverviewRuler: true,
        scrollbar: { verticalScrollbarSize: 10, horizontalScrollbarSize: 10 },
      }}
    />
  );
}
