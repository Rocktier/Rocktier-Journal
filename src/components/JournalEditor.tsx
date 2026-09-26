import { useCallback, useEffect, useRef } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import type { Editor } from "@tiptap/core";

// CommandButton — one toolbar action
function CommandButton({
  active = false,
  disabled = false,
  onClick,
  title,
  children,
}: {
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      className={`tbar-btn ${active ? "is-active" : ""}`}
      disabled={disabled}
      onClick={onClick}
      title={title}
      aria-label={title}
      aria-pressed={active}
    >
      {children}
    </button>
  );
}

function Toolbar({ editor }: { editor: Editor | null }) {
  if (!editor) return null;

  const setLink = useCallback(() => {
    const href = window.prompt("Link URL", "https://");
    if (href === null) return; // cancelled
    if (href === "") {
      editor.chain().focus().extendMarkRange("link").unsetLink().run();
      return;
    }
    editor.chain().focus().extendMarkRange("link").setLink({ href }).run();
  }, [editor]);

  return (
    <div className="jeditor-toolbar" role="toolbar" aria-label="Formatting">
      {/* Inline marks */}
      <CommandButton
        title="Bold (⌘B)"
        active={editor.isActive("bold")}
        onClick={() => editor.chain().focus().toggleBold().run()}
      >
        <span className="tb-icon strong">B</span>
      </CommandButton>
      <CommandButton
        title="Italic (⌘I)"
        active={editor.isActive("italic")}
        onClick={() => editor.chain().focus().toggleItalic().run()}
      >
        <span className="tb-icon italic">I</span>
      </CommandButton>
      <CommandButton
        title="Strikethrough"
        active={editor.isActive("strike")}
        onClick={() => editor.chain().focus().toggleStrike().run()}
      >
        <span className="tb-icon strike">S</span>
      </CommandButton>
      <button
        type="button"
        className={`tbar-btn ${editor.isActive("code") ? "is-active" : ""}`}
        title="Inline code"
        onClick={() => editor.chain().focus().toggleCode().run()}
        aria-label="Inline code"
        aria-pressed={editor.isActive("code")}
      >
        <span className="tb-icon mono">{"</>"}</span>
      </button>

      <span className="tb-divider" aria-hidden="true" />

      {/* Block: headings */}
      <CommandButton
        title="Heading 1"
        active={editor.isActive("heading", { level: 1 })}
        onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
      >
        <span className="tb-icon">H1</span>
      </CommandButton>
      <CommandButton
        title="Heading 2"
        active={editor.isActive("heading", { level: 2 })}
        onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
      >
        <span className="tb-icon">H2</span>
      </CommandButton>
      <CommandButton
        title="Heading 3"
        active={editor.isActive("heading", { level: 3 })}
        onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
      >
        <span className="tb-icon">H3</span>
      </CommandButton>
      <button
        type="button"
        className={`tbar-btn ${editor.isActive("paragraph") ? "is-active" : ""}`}
        title="Body text"
        onClick={() => editor.chain().focus().setParagraph().run()}
        aria-label="Body text"
        aria-pressed={editor.isActive("paragraph")}
      >
        <span className="tb-icon">P</span>
      </button>

      <span className="tb-divider" aria-hidden="true" />

      {/* Lists + quote + code block */}
      <CommandButton
        title="Bullet list"
        active={editor.isActive("bulletList")}
        onClick={() => editor.chain().focus().toggleBulletList().run()}
      >
        <span className="tb-icon">•≡</span>
      </CommandButton>
      <CommandButton
        title="Ordered list"
        active={editor.isActive("orderedList")}
        onClick={() => editor.chain().focus().toggleOrderedList().run()}
      >
        <span className="tb-icon">1.</span>
      </CommandButton>
      <button
        type="button"
        className={`tbar-btn ${editor.isActive("blockquote") ? "is-active" : ""}`}
        title="Quote"
        onClick={() => editor.chain().focus().toggleBlockquote().run()}
        aria-label="Quote"
        aria-pressed={editor.isActive("blockquote")}
      >
        <span className="tb-icon">❝</span>
      </button>
      <button
        type="button"
        className={`tbar-btn ${editor.isActive("codeBlock") ? "is-active" : ""}`}
        title="Code block"
        onClick={() => editor.chain().focus().toggleCodeBlock().run()}
        aria-label="Code block"
        aria-pressed={editor.isActive("codeBlock")}
      >
        <span className="tb-icon mono">{"</>"}</span>
      </button>

      <span className="tb-divider" aria-hidden="true" />

      {/* Link + undo/redo */}
      <button
        type="button"
        className={`tbar-btn ${editor.isActive("link") ? "is-active" : ""}`}
        title="Link"
        onClick={setLink}
        aria-label="Link"
        aria-pressed={editor.isActive("link")}
      >
        <span className="tb-icon link">⌬</span>
      </button>
      <CommandButton
        title="Undo (⌘Z)"
        disabled={!editor.can().undo()}
        onClick={() => editor.chain().focus().undo().run()}
      >
        <span className="tb-icon">↶</span>
      </CommandButton>
      <CommandButton
        title="Redo (⌘⇧Z)"
        disabled={!editor.can().redo()}
        onClick={() => editor.chain().focus().redo().run()}
      >
        <span className="tb-icon">↷</span>
      </CommandButton>
    </div>
  );
}

interface Props {
  content: string;
  onChange: (html: string) => void;
}

export default function JournalEditor({ content, onChange }: Props) {
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  const editor = useEditor({
    extensions: [
      StarterKit,
      Placeholder.configure({
        placeholder: "",
      }),
    ],
    editorProps: {
      attributes: {
        class: "jeditor-content",
        spellcheck: "true",
        "aria-label": "Diary editor",
      },
    },
    content: "",
    onUpdate: ({ editor: e }) => {
      onChangeRef.current(e.getHTML());
    },
  });

  // Sync external content changes (date switch) into the editor
  useEffect(() => {
    const e = editor;
    if (!e) return;
    const current = e.getHTML();
    if (current !== content) {
      e.commands.setContent(content || "", false);
    }
  }, [content, editor]);

  return (
    <div className="jeditor">
      <Toolbar editor={editor} />
      <div className="jeditor-scroll">
        <EditorContent editor={editor} />
      </div>
    </div>
  );
}
