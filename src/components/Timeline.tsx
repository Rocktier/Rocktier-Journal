import { useState, useEffect, useCallback, useMemo } from "react";
import { invoke } from "@tauri-apps/api/core";

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

interface DiarySummary {
  date: string;
  title?: string;
  word_count: number;
  has_images: boolean;
  mood: string | null;
}

interface GroupedEntry {
  year: number;
  month: number;
  entries: DiarySummary[];
}

export default function Timeline() {
  const [summaries, setSummaries] = useState<DiarySummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [previewDate, setPreviewDate] = useState<string | null>(null);
  const [previewEntry, setPreviewEntry] = useState<DiaryEntry | null>(null);

  useEffect(() => {
    invoke<DiarySummary[]>("list_diaries")
      .then((list) => {
        setSummaries(list);
      })
      .catch(() => {
        setSummaries([]);
      })
      .finally(() => setLoading(false));
  }, []);

  const grouped = useMemo(() => {
    const groups: Record<string, GroupedEntry> = {};
    for (const s of summaries) {
      const d = new Date(s.date + "T00:00:00");
      const year = d.getFullYear();
      const month = d.getMonth();
      const key = `${year}-${String(month + 1).padStart(2, "0")}`;
      if (!groups[key]) {
        groups[key] = { year, month, entries: [] };
      }
      groups[key].entries.push(s);
    }
    // sort entries within each group desc
    for (const g of Object.values(groups)) {
      g.entries.sort((a, b) => b.date.localeCompare(a.date));
    }
    return Object.values(groups).sort((a, b) => {
      if (a.year !== b.year) return b.year - a.year;
      return b.month - a.month;
    });
  }, [summaries]);

  const loadPreview = useCallback(async (date: string) => {
    try {
      const entry = await invoke<DiaryEntry | null>("load_diary", { date });
      setPreviewEntry(entry);
      setPreviewDate(date);
    } catch {
      setPreviewEntry(null);
    }
  }, []);

  const today = new Date();
  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;

  const moodMap: Record<string, string> = {
    happy: "😀", neutral: "😐", sad: "😢", angry: "😡", tired: "😴", custom: "❓",
  };

  if (loading) {
    return (
      <div className="timeline-view">
        <h2>Timeline</h2>
        <div className="timeline-loading">
          <span className="brand-dot small" />
          <span>Loading timeline…</span>
        </div>
      </div>
    );
  }

  return (
    <div className="timeline-view">
      <h2>Timeline</h2>
      <p className="timeline-subtitle">{summaries.length} entries · Scroll through your past</p>

      {grouped.length === 0 && (
        <div className="timeline-empty">
          <p>No entries to show.</p>
          <p className="placeholder">Write your first diary entry to see it here.</p>
        </div>
      )}

      <div className="timeline-scroll">
        {grouped.map((group) => (
          <section key={`${group.year}-${group.month}`} className="timeline-section">
            <h3 className="timeline-month-label">
              {new Date(group.year, group.month, 1).toLocaleDateString("en-US", { month: "long", year: "numeric" })}
            </h3>
            <div className="timeline-entries">
              {group.entries.map((entry) => (
                <button
                  key={entry.date}
                  className={`timeline-entry ${(entry.date === todayStr) ? "today" : ""} ${entry.has_images ? "has-images" : ""}`}
                  onClick={() => loadPreview(entry.date)}
                >
                  <span className="timeline-entry-date">
                    {new Date(entry.date + "T00:00:00").getDate()}
                  </span>
                  <div className="timeline-entry-content">
                    <p className="timeline-entry-title">
                      {entry.title || "Untitled"}
                    </p>
                    <span className="timeline-entry-words">{entry.word_count} words</span>
                  </div>
                  {entry.mood && (
                    <span className="timeline-entry-mood">{moodMap[entry.mood] || "❓"}</span>
                  )}
                </button>
              ))}
            </div>
          </section>
        ))}
      </div>

      {previewEntry && previewDate && (
        <div className="timeline-preview" onClick={() => setPreviewDate(null)}>
          <div className="timeline-preview-card" onClick={(e) => e.stopPropagation()}>
            <h4>{formatDate(previewDate)}</h4>
            {previewEntry.title && <p className="timeline-preview-title">{previewEntry.title}</p>}
            <div className="timeline-preview-content">
              {stripMarkdown(previewEntry.content).slice(0, 300)}
              {previewEntry.content.length > 300 ? "…" : ""}
            </div>
            {previewEntry.mood && (
              <span className="timeline-preview-mood">{moodMap[previewEntry.mood] || "❓"}</span>
            )}
            <button className="timeline-preview-close" onClick={() => setPreviewDate(null)}>Close</button>
          </div>
        </div>
      )}
    </div>
  );
}

function stripMarkdown(md: string): string {
  return md
    .replace(/!\[([^\]]*)\]\([^)]+\)/g, " $1 ")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/[#*`~>_!\-]/g, "")
    .replace(/\n+/g, " ")
    .trim();
}

function formatDate(iso: string): string {
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" });
}
