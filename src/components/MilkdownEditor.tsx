import { useRef } from "react";
import { Editor, rootCtx, defaultValueCtx } from "@milkdown/core";
import { commonmark } from "@milkdown/preset-commonmark";
import { history } from "@milkdown/plugin-history";
import { clipboard } from "@milkdown/plugin-clipboard";
import { listener, listenerCtx } from "@milkdown/plugin-listener";
import { upload } from "@milkdown/plugin-upload";
import { nord } from "@milkdown/theme-nord";
import { Milkdown, useEditor as useMilkdownEditor } from "@milkdown/react";

interface MilkdownEditorProps {
  content: string;
  onChange: (markdown: string) => void;
  placeholder?: string;
}

export default function MilkdownEditor({ content, onChange, placeholder }: MilkdownEditorProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);

  const { loading } = useMilkdownEditor((root) => {
    return Editor.make()
      .config((ctx) => {
        ctx.set(rootCtx, root);
        ctx.set(defaultValueCtx, content);

        if (placeholder) {
          ctx.update("placeholder", () => placeholder);
        }

        const l = ctx.get(listenerCtx);
        l.markdownUpdated((_ctx, markdown, _prevMarkdown) => {
          onChange(markdown);
        });
      })
      .use(nord)
      .use(commonmark)
      .use(history)
      .use(clipboard)
      .use(upload)
      .use(listener);
  }, []);

  if (loading) {
    return <div className="milkdown-loading" ref={containerRef}>Loading editor…</div>;
  }

  return <div ref={containerRef}><Milkdown /></div>;
}
