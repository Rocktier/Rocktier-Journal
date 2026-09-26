import { useState, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import MilkdownEditor from "./MilkdownEditor";
import MoodPicker from "./MoodPicker";

interface DiaryEntry {
  date: string;
  title?: string;
  content: string;
  mood: string | null;
  custom_mood: string | null;
  images: Array<{ id: string; filename: string; caption?: string }>;
  created_at: string;
  updated_at: string;
}

interface Props {
  date: string;
}

export default function Editor({ date }: Props) {
  const [content, setContent] = useState("");
  const [title, setTitle] = useState<string | undefined>(undefined);
  const [mood, setMood] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Force remount editor when date changes
  const [editorKey, setEditorKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setEditorKey((k) => k + 1);

    invoke<DiaryEntry | null>("load_diary", { date })
      .then((entry) => {
        if (cancelled) return;
        if (entry) {
          setContent(entry.content || "");
          setTitle(entry.title);
          setMood(entry.mood || null);
        } else {
          setContent("");
          setTitle(undefined);
          setMood(null);
        }
        setDirty(false);
        setLoading(false);
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        const msg = e instanceof Error ? e.message : String(e);
        setError(msg);
        setContent("");
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [date]);

  const internalSetContent = useCallback((markdown: string) => {
    setContent(markdown);
    setDirty(true);
    setError(null);
  }, []);

  const handleSave = useCallback(async () => {
    setError(null);
    try {
      await invoke("save_diary", {
        date,
        title,
        content,
        mood,
        customMood: mood === "custom" ? null : null,
        images: [],
      });
      setSaved(true);
      setDirty(false);
      setTimeout(() => setSaved(false), 2500);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg);
    }
  }, [date, title, content, mood]);

  // Listen for Cmd/Ctrl+S
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "s") {
        e.preventDefault();
        handleSave();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [handleSave]);

  const wordCount = countWords(content);
  const charCount = content.length;

  if (loading) {
    // Skeleton — no text that implies network I/O; local disk read is near-instant
    return <div className="editor" aria-busy="true" />;
  }

  return (
    <div className="editor">
      <div className="editor-header">
        <h2 className="editor-date">{formatDate(date)}</h2>
        <MoodPicker selected={mood} onSelect={setMood} />
        <button
          onClick={handleSave}
          disabled={!dirty && !saved}
          className={`editor-save ${saved ? "saved" : ""} ${dirty ? "dirty" : ""}`}
          title="Save (Ctrl/Cmd+S)"
        >
          {saved ? "Saved ✓" : dirty ? "Save •" : "Save"}
        </button>
      </div>

      <div className="editor-title-input-wrap">
        <input
          type="text"
          className="editor-title-input"
          placeholder="Optional title…"
          value={title || ""}
          onChange={(e) => {
            setTitle(e.target.value || undefined);
            setDirty(true);
          }}
        />
      </div>

      <div className="editor-body">
        <MilkdownEditor
          key={editorKey}
          content={content}
          onChange={internalSetContent}
          placeholder="What's on your mind today?"
        />
      </div>

      <div className="editor-footer">
        <span className="editor-wordcount">
          {wordCount} words · {charCount} chars
        </span>
        {error && <span className="editor-error">{error}</span>}
      </div>
    </div>
  );
}

function formatDate(iso: string): string {
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

function countWords(markdown: string): number {
  if (!markdown.trim()) return 0;
  let text = markdown
    .replace(/[#*`~\[\]()>\-_!]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return text ? text.split(/\s+/).length : 0;
}
