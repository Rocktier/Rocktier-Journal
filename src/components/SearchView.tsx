import { useState, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { t } from "../i18n";
import { useTranslation } from "../hooks/useTranslation";

interface DiarySummary {
  date: string;
  title?: string;
  word_count: number;
  has_images: boolean;
  mood: string | null;
}

interface Props {
  /** 点结果行 = 选该日期并回到今日视图（与日历同一条 handleDateSelect 路） */
  onSelect: (date: string) => void;
}

export default function SearchView({ onSelect }: Props) {
  const { locale } = useTranslation();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<DiarySummary[]>([]);
  const [searched, setSearched] = useState(false);
  const [loading, setLoading] = useState(false);

  const runSearch = useCallback(async (q: string) => {
    if (!q.trim()) {
      setResults([]);
      setSearched(false);
      return;
    }
    setLoading(true);
    try {
      const res = await invoke<DiarySummary[]>("search_diaries", {
        query: q.trim(),
        dateFrom: null,
        dateTo: null,
        moodFilter: null,
      });
      setResults(res);
      setSearched(true);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error("Search failed:", msg);
      setResults([]);
      setSearched(true);
    } finally {
      setLoading(false);
    }
  }, []);

  // Live search with debounce — body search decrypts every entry on each
  // keystroke, so we throttle to keep it responsive at hundreds of entries.
  useEffect(() => {
    const handle = setTimeout(() => {
      runSearch(query);
    }, 250);
    return () => clearTimeout(handle);
  }, [query, runSearch]);

  const moodMap: Record<string, string> = {
    happy: "😀", neutral: "😐", sad: "😢", angry: "😡", tired: "😴", custom: "❓",
  };

  return (
    <div className="search-view">
      <h2>{t("sidebar.search")}</h2>

      <div className="search-controls">
        <input
          type="text"
          className="search-input"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t("search.titlePh")}
        />
        {loading && <span className="search-spinner" aria-hidden="true">⌛</span>}
      </div>

      {searched && (
        <p className="search-summary">
          {query.trim()
            ? t("search.resultsFor", { n: results.length, q: query.trim() })
            : t("search.results", { n: results.length })}
        </p>
      )}

      {results.length > 0 && (
        <ul className="search-results">
          {results.map((r) => (
            <li
              key={r.date}
              className="search-result-item"
              role="button"
              tabIndex={0}
              title={formatDate(r.date)}
              onClick={() => onSelect(r.date)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  onSelect(r.date);
                }
              }}
            >
              <span className="search-result-date">{formatDate(r.date, locale)}</span>
              {r.title && <span className="search-result-title">{r.title}</span>}
              <span className="search-result-words">{t("calendar.words", { n: r.word_count })}</span>
              {r.mood && <span className="search-result-mood">{moodMap[r.mood] || "❓"}</span>}
            </li>
          ))}
        </ul>
      )}

      {searched && results.length === 0 && !loading && (
        <p className="search-empty">{t("search.noResults")}</p>
      )}

      <p className="search-note">{t("search.note")}</p>
    </div>
  );
}

function formatDate(iso: string, locale: string): string {
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString(locale, { year: "numeric", month: "short", day: "numeric" });
}
