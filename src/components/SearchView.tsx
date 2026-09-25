import { useState, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";

interface DiarySummary {
  date: string;
  title?: string;
  word_count: number;
  has_images: boolean;
  mood: string | null;
}

export default function SearchView() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<DiarySummary[]>([]);
  const [searched, setSearched] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSearch = useCallback(async () => {
    if (!query.trim()) {
      setResults([]);
      setSearched(false);
      return;
    }
    setLoading(true);
    try {
      const res = await invoke<DiarySummary[]>("search_diaries", {
        query: query.trim(),
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
  }, [query]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      handleSearch();
    }
  };

  const moodMap: Record<string, string> = {
    happy: "😀", neutral: "😐", sad: "😢", angry: "😡", tired: "😴", custom: "❓",
  };

  return (
    <div className="search-view">
      <h2>Search</h2>

      <div className="search-controls">
        <input
          type="text"
          className="search-input"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Search by date or title…"
        />
        <button onClick={handleSearch} className="search-btn" disabled={loading}>
          {loading ? "…" : "Search"}
        </button>
      </div>

      {searched && (
        <p className="search-summary">
          {results.length} result{results.length !== 1 ? "s" : ""}
        </p>
      )}

      {results.length > 0 && (
        <ul className="search-results">
          {results.map((r) => (
            <li key={r.date} className="search-result-item">
              <span className="search-result-date">{formatDate(r.date)}</span>
              {r.title && <span className="search-result-title">{r.title}</span>}
              <span className="search-result-words">{r.word_count} words</span>
              {r.mood && <span className="search-result-mood">{moodMap[r.mood] || "❓"}</span>}
            </li>
          ))}
        </ul>
      )}

      {searched && results.length === 0 && !loading && (
        <p className="search-empty">No entries found.</p>
      )}

      <p className="search-note">
        Note: Full-text content search decrypts all entries and runs locally. Date and title search is instant.
      </p>
    </div>
  );
}

function formatDate(iso: string): string {
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}
