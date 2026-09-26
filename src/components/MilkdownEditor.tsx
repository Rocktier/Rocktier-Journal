import { useRef, useEffect } from "react";
import { EditorState } from "@codemirror/state";
import { EditorView, keymap } from "@codemirror/view";
import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import { markdown, markdownLanguage } from "@codemirror/lang-markdown";

interface Props {
  content: string;
  onChange: (markdown: string) => void;
  placeholder?: string;
}

// Minimal CM theme that makes the editing surface unmistakably visible
// against the parent's background.
const cmTheme = EditorView.theme({
  "&": {
    height: "100%",
    width: "100%",
    fontSize: "15px",
    fontFamily:
      "ui-monospace, SF Mono, Menlo, Consolas, monospace",
    color: "#1a1a1a",
    backgroundColor: "#ffffff",
    caretColor: "#e5484d",
  },
  ".cm-content": {
    padding: "24px 28px 96px",
    lineHeight: "1.8",
    whiteSpace: "pre-wrap",
    wordBreak: "break-word",
    tabSize: "4",
    caretColor: "#e5484d",
  },
  ".cm-content:focus": { outline: "none" },
  ".cm-placeholder": { color: "#999", fontStyle: "italic" },
  ".cm-line": { padding: "0 2px" },
  ".tok-heading": { fontWeight: "700", color: "#1a1a1a" },
  ".tok-emphasis": { fontStyle: "italic" },
  ".tok-strong": { fontWeight: "700" },
  ".tok-link": { color: "#0969da" },
  ".tok-string": { color: "#cf222e" },
  ".tok-keyword": { color: "#0969da" },
  ".tok-comment": { color: "#999", fontStyle: "italic" },
  ".tok-meta": { color: "#999" },
  ".cm-selectionBackground, &.cm-focused .cm-selectionBackground": {
    background: "#add6ff !important",
  },
});

export default function MilkdownEditor({ content, onChange, placeholder }: Props) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const viewRef = useRef<EditorView | null>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  useEffect(() => {
    if (!hostRef.current) return;

    const state = EditorState.create({
      doc: content,
      extensions: [
        cmTheme,
        history(),
        markdown({ base: markdownLanguage }),
        keymap.of([...defaultKeymap, ...historyKeymap]),
        EditorView.updateListener.of((u) => {
          if (u.docChanged) {
            onChangeRef.current(u.state.doc.toString());
          }
        }),
        EditorView.contentAttributes.of({
          "aria-label": placeholder || "",
          "spellcheck": "true",
        }),
      ],
    });

    const view = new EditorView({ state, parent: hostRef.current });
    viewRef.current = view;

    return () => {
      view.destroy();
      viewRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Sync date-switch content changes
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    const current = view.state.doc.toString();
    if (current !== content) {
      view.dispatch({ changes: { from: 0, to: current.length, insert: content } });
    }
  }, [content]);

  return <div ref={hostRef} className="cm-editor-host" />;
}
