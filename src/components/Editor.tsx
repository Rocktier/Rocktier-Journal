import { useState, useEffect, useCallback, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import JournalEditor from "./JournalEditor";
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

type SaveStatus = "idle" | "saving" | "saved" | "unsaved";

export default function Editor({ date }: Props) {
  const [content, setContent] = useState("");
  const [title, setTitle] = useState<string | undefined>(undefined);
  const [mood, setMood] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
  const [dirty, setDirty] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Force remount editor when date changes
  const [editorKey, setEditorKey] = useState(0);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setEditorKey((k) => k + 1);
    setSaveStatus("idle");
    if (saveTimer.current) clearTimeout(saveTimer.current);

    invoke<DiaryEntry | null>("load_diary", { date })
      .then((entry) => {
        if (cancelled) return;
        if (entry) {
          // First load: ensure content is valid HTML for the rich-text editor.
          setContent(toStyledHtml(entry.content || ""));
          setTitle(entry.title);
          setMood(entry.mood || null);
        } else {
          setContent("");
          setTitle(undefined);
          setMood(null);
        }
        setDirty(false);
        setSaveStatus("saved");
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

  // Tiptap emits HTML — wrap the (possibly markdown) string so it renders
  // correctly when re-edited in the rich-text editor.
  const internalSetContent = useCallback((raw: string) => {
    setContent(toStyledHtml(raw));
    setDirty(true);
    setError(null);
  }, []);

  const handleSave = useCallback(async () => {
    setError(null);
    setSaveStatus("saving");
    try {
      await invoke("save_diary", {
        date,
        title,
        content,
        mood,
        customMood: mood === "custom" ? null : null,
        images: [],
      });
      setSaveStatus("saved");
      setDirty(false);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg);
      setSaveStatus("unsaved");
    }
  }, [date, title, content, mood]);

  // Auto-save: debounced 1500ms after last dirty change.
  // During typing, keep the previous status ("saved") — showing "unsaved"
  // on every keystroke is distracting.
  useEffect(() => {
    if (!dirty) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      handleSave();
    }, 1500);
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [content, title, mood]);

  // On blur (window loses focus): save immediately if dirty.
  useEffect(() => {
    const onBlur = () => {
      if (!dirty) return;
      if (saveTimer.current) clearTimeout(saveTimer.current);
      handleSave();
    };
    window.addEventListener("blur", onBlur);
    return () => window.removeEventListener("blur", onBlur);
  }, [dirty, handleSave]);

  // Listen for Cmd/Ctrl+S (immediate save, bypass debounce)
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "s") {
        e.preventDefault();
        if (saveTimer.current) clearTimeout(saveTimer.current);
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
          disabled={!dirty && saveStatus === "idle"}
          className={`editor-save ${saveStatus === "saved" ? "saved" : ""} ${dirty && saveStatus !== "saving" ? "dirty" : ""}`}
          title="Save (Ctrl/Cmd+S)"
        >
          {saveStatus === "saving" ? "Saving…" : saveStatus === "saved" ? "Saved ✓" : dirty ? "Save •" : "Save"}
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
        <JournalEditor
          key={editorKey}
          content={content}
          onChange={internalSetContent}
        />
      </div>

      <div className="editor-footer">
        <span className="editor-wordcount">
          {wordCount} words · {charCount} chars
        </span>
        <span className="editor-save-status">
          {saveStatus === "saving" && <span className="sv-saving">Saving…</span>}
          {saveStatus === "saved" && <span className="sv-saved">Saved ✓</span>}
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

/**
 * Count words — CJK characters count 1 each; Latin runs split on whitespace.
 * e.g. "你好 world" → 3 (你 + 好 + world)
 */
function countWords(html: string): number {
  const text = stripHtml(html);
  if (!text.trim()) return 0;
  // Count CJK chars individually
  const cjk = (text.match(/[一-鿿]/g) || []).length;
  // Count non-CJK word runs (whitespace-delimited, ignoring CJK-adjacent spaces)
  const latin = text.replace(/[一-鿿]/g, " ").split(/\s+/).filter(Boolean).length;
  return cjk + latin;
}

/** Convert legacy plain-text / markdown into styled HTML paragraphs. */
function toStyledHtml(raw: string): string {
  if (!raw.trim()) return "";
  // Already HTML?
  if (/<\/?[a-z][\s\S]*>/i.test(raw)) return raw;
  const escaped = raw
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  return escaped
    .split(/\n{2,}/)
    .map((p) => {
      const inline = p
        .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
        .replace(/\*(.+?)\*/g, "<em>$1</em>")
        .replace(/`(.+?)`/g, "<code>$1</code>")
        .replace(/\n/g, "<br>");
      return `<p>${inline}</p>`;
    })
    .join("");
}

/** Strip HTML tags for word / char count. */
function stripHtml(html: string): string {
  return html
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
