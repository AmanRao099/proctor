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
        "editorLineNumber.foreground": "#a3b0a8",
        "editorLineNumber.activeForeground": "#354f52",
        "editor.lineHighlightBackground": "#f3f6f2",
        "editorCursor.foreground": "#52796f",
        "editor.selectionBackground": "#cad2c5aa",
        "editorIndentGuide.background1": "#e1e7de",
      },
    });
    monaco.editor.defineTheme("proctor-dark", {
      base: "vs-dark",
      inherit: true,
      rules: [],
      colors: {
        "editor.background": "#1e292e",
        "editorLineNumber.foreground": "#5d6f6c",
        "editorLineNumber.activeForeground": "#cad2c5",
        "editor.lineHighlightBackground": "#24323a",
        "editorCursor.foreground": "#84a98c",
        "editor.selectionBackground": "#52796f66",
        "editorIndentGuide.background1": "#2c3a41",
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
