import { useRef, useEffect } from "react";
import { EditorState } from "@codemirror/state";
import { EditorView, keymap } from "@codemirror/view";
import { defaultKeymap, history, historyKeymap, indentWithTab } from "@codemirror/commands";
import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import { search, searchKeymap, highlightSelectionMatches } from "@codemirror/search";

interface Props {
  content: string;
  onChange: (markdown: string) => void;
  placeholder?: string;
}

// Tab auto-continues lists (same UX as Rocktier Write)
const rocktierKeymap = keymap.of([
  {
    key: "Enter",
    run: (v) => {
      const { from } = v.state.selection.main;
      const line = v.state.doc.lineAt(from);
      const text = line.text;

      // Empty list marker → clear line
      if (/^\s*[-*+]\s+$/.test(text) || /^\s*[-*+]\s+\[[ xX]\]\s*$/.test(text)) {
        v.dispatch({ changes: { from: line.from, to: line.to, insert: "" } });
        return true;
      }
      // Task continuation
      const task = text.match(/^(\s*)([-*+])\s+\[[ xX]\]\s+(.+)$/);
      if (task) {
        v.dispatch({
          changes: { from, insert: `\n${task[1]}${task[2]} [ ] ` },
          selection: { anchor: from + 1 + task[1].length + task[2].length + 5 },
        });
        return true;
      }
      // Ordered / unordered list
      const list = text.match(/^(\s*)([-*+]|\d+[.)])\s+(.+)$/);
      if (list) {
        const marker = /^\d+/.test(list[2])
          ? `${parseInt(list[2], 10) + 1}. `
          : `${list[2]} `;
        v.dispatch({
          changes: { from, insert: `\n${list[1]}${marker}` },
          selection: { anchor: from + 1 + list[1].length + marker.length },
        });
        return true;
      }
      return false;
    },
  },
  indentWithTab,
]);

const cmTheme = EditorView.theme({
  "&": {
    height: "100%",
    fontSize: "15px",
    fontFamily: "var(--font-mono, 'SF Mono', ui-monospace, monospace)",
    color: "var(--text-primary)",
    backgroundColor: "transparent",
    caretColor: "var(--accent)",
  },
  ".cm-content": {
    padding: "24px 28px 64px",
    lineHeight: "1.8",
    whiteSpace: "pre-wrap",
    wordWrap: "break-word",
    tabSize: "4",
    caretColor: "var(--accent)",
  },
  ".cm-content:focus": { outline: "none" },
  ".cm-placeholder": { color: "var(--text-tertiary)", fontStyle: "italic" },
  ".cm-line": { padding: "0" },
  ".tok-heading": { fontWeight: "700", color: "var(--text-primary)" },
  ".tok-emphasis": { fontStyle: "italic" },
  ".tok-strong": { fontWeight: "700" },
  ".tok-link": { color: "var(--accent)" },
  ".tok-string": { color: "var(--text-secondary)" },
  ".tok-keyword": { color: "var(--accent)" },
  ".tok-comment": { color: "var(--text-tertiary)", fontStyle: "italic" },
  ".tok-meta": { color: "var(--text-tertiary)" },
  ".cm-selectionBackground, &.cm-focused .cm-selectionBackground": {
    background: "var(--selection) !important",
  },
  ".cm-activeLine": { backgroundColor: "transparent" },
});

export default function MilkdownEditor({ content, onChange, placeholder }: Props) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const viewRef = useRef<EditorView | null>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  // Build the editor once — synchronous, no async loading, no remote resources
  useEffect(() => {
    if (!hostRef.current) return;

    const state = EditorState.create({
      doc: content,
      extensions: [
        cmTheme,
        highlightSelectionMatches(),
        search(),
        history(),
        markdown({ base: markdownLanguage }),
        keymap.of([...defaultKeymap, ...historyKeymap, ...searchKeymap]),
        rocktierKeymap,
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

  // Sync external content changes (date switch)
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
