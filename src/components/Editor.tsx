import { useState, useEffect, useCallback, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { t } from "../i18n";
import { useTranslation } from "../hooks/useTranslation";
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
  /**
   * 「完成」按钮：立即落盘（若有未存改动）后退出编辑器。
   * 保存失败时不调用 onDone —— 调用方无需处理失败，编辑器会留在原地，
   * 错误已在页脚状态条上显示。
   */
  onDone?: () => void;
}

type SaveStatus = "idle" | "saving" | "saved" | "unsaved";

export default function Editor({ date, onDone }: Props) {
  const { locale } = useTranslation();
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
  // dirty 的同步镜像：卸载回调只能读到 ref（闭包里的 dirty 会是旧值）。
  const dirtyRef = useRef(false);

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
        dirtyRef.current = false;
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
    dirtyRef.current = true;
    setError(null);
  }, []);

  const handleSave = useCallback(async (): Promise<boolean> => {
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
      dirtyRef.current = false;
      return true;
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg);
      setSaveStatus("unsaved");
      return false;
    }
  }, [date, title, content, mood]);

  /** 「我写完了」：先落盘再退出。存失败就留在编辑器里（错误已在页脚显示），
   *  否则用户会带着未保存的内容离开 —— 语义上这才是「结束」的含义。 */
  const handleDone = useCallback(async () => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    if (dirtyRef.current) {
      const ok = await handleSave();
      if (!ok) return;
    }
    onDone?.();
  }, [handleSave, onDone]);

  // 卸载时（切视图 / 关窗）立刻落盘。此前只有「窗口失焦」+ 1.5s 防抖两条路径：
  // blur 不冒泡，元素失焦不会触发 window 的 blur，所以在防抖窗口内点侧栏切视图
  // 既不等满定时器也不失焦 —— 那 1.5 秒内的输入会静默丢失。
  const saveRef = useRef(handleSave);
  saveRef.current = handleSave;
  useEffect(
    () => () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
      if (dirtyRef.current) void saveRef.current();
    },
    []
  );

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
  // Count the rendered text, not the HTML markup length.
  const charCount = stripHtml(content).length;

  if (loading) {
    // Skeleton — no text that implies network I/O; local disk read is near-instant
    return <div className="editor" aria-busy="true" />;
  }

  return (
    <div className="editor">
      <div className="editor-header">
        <h2 className="editor-date">{formatDate(date, locale)}</h2>
        {/* 心情此前直接接 setMood，不置 dirty —— 只改心情不动正文时，
            记录不会落盘，刷新后心情丢失。 */}
        <MoodPicker
          selected={mood}
          onSelect={(m) => {
            setMood(m);
            setDirty(true);
            dirtyRef.current = true;
          }}
        />
        {/* 「完成」= 结束本次记录（落盘 + 退出编辑器）。保存状态由页脚的
            .editor-save-status 常驻显示，不再占用一个假动作按钮。 */}
        <button
          onClick={handleDone}
          disabled={saveStatus === "saving"}
          className={`editor-done${dirty ? " dirty" : ""}`}
          title={t("editor.doneHint")}
        >
          {saveStatus === "saving" ? t("editor.saving") : t("editor.done")}
        </button>
      </div>

      <div className="editor-title-input-wrap">
        <input
          type="text"
          className="editor-title-input"
          placeholder={t("editor.titlePlaceholder")}
          value={title || ""}
          onChange={(e) => {
            setTitle(e.target.value || undefined);
            setDirty(true);
            dirtyRef.current = true;
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
          {t("editor.wordsChars", { w: wordCount, c: charCount })}
        </span>
        <span className="editor-save-status" aria-live="polite">
          {saveStatus === "saving" && <span className="sv-saving">{t("editor.saving")}</span>}
          {saveStatus === "saved" && <span className="sv-saved">{t("editor.saved")}</span>}
          {saveStatus === "unsaved" && <span className="sv-unsaved">{t("editor.unsaved")}</span>}
        </span>
        {error && <span className="editor-error">{error}</span>}
      </div>
    </div>
  );
}

function formatDate(iso: string, locale: string): string {
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString(locale, {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

/**
 * Count words — CJK / kana / Hangul characters count 1 each; Latin runs split
 * on whitespace. e.g. "你好 world" → 3 (你 + 好 + world). Uses Intl.Segmenter
 * when available (correct per-language segmentation) and falls back to a
 * script-range heuristic.
 */
function countWords(html: string): number {
  const text = stripHtml(html);
  if (!text.trim()) return 0;
  const SegmenterCtor = (Intl as unknown as { Segmenter?: typeof Intl.Segmenter }).Segmenter;
  if (SegmenterCtor) {
    const seg = new SegmenterCtor(undefined, { granularity: "word" });
    let n = 0;
    for (const s of seg.segment(text)) {
      if (s.isWordLike) n++;
    }
    return n;
  }
  // Fallback: count CJK/kana/Hangul per character, other runs per whitespace word.
  const cjk = (
    text.match(/[㐀-䶿一-鿿豈-﫿぀-ヿ가-힣]/gu) || []
  ).length;
  const latin = text
    .replace(/[㐀-䶿一-鿿豈-﫿぀-ヿ가-힣]/gu, " ")
    .split(/\s+/)
    .filter(Boolean).length;
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

/**
 * Strip HTML markup for word / char count. Kept in step with the backend's
 * strip_html (vault.rs): drop <script>/<style> blocks wholesale, replace every
 * remaining tag with a space, decode the common entities (&amp; last).
 */
function stripHtml(html: string): string {
  return html
    .replace(/<(script|style)\b[\s\S]*?<\/\1>/gi, " ")
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}
