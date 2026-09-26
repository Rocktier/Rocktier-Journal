import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";

interface DiarySummary {
  date: string;
  title?: string;
  word_count: number;
  has_images: boolean;
  mood: string | null;
}

interface Props {
  onDateSelect: (date: string) => void;
}

export default function Calendar({ onDateSelect }: Props) {
  const [currentMonth, setCurrentMonth] = useState(() => {
    const now = new Date();
    return { year: now.getFullYear(), month: now.getMonth() };
  });
  const [entries, setEntries] = useState<Record<string, DiarySummary>>({});
  const [loading, setLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    invoke<DiarySummary[]>("list_diaries")
      .then((list) => {
        const map: Record<string, DiarySummary> = {};
        for (const e of list) {
          map[e.date] = e;
        }
        setEntries(map);
      })
      .catch(() => {
        setEntries({});
      })
      .finally(() => setLoading(false));
  }, [currentMonth]);

  const handlePrev = () => {
    setCurrentMonth(({ year, month }) => {
      if (month === 0) return { year: year - 1, month: 11 };
      return { year, month: month - 1 };
    });
  };

  const handleNext = () => {
    setCurrentMonth(({ year, month }) => {
      if (month === 11) return { year: year + 1, month: 0 };
      return { year, month: month + 1 };
    });
  };

  const handleDayClick = (dateStr: string) => {
    setSelectedDate(dateStr);
    onDateSelect(dateStr);
  };

  const today = new Date();
  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;

  const firstDay = new Date(currentMonth.year, currentMonth.month, 1);
  const lastDay = new Date(currentMonth.year, currentMonth.month + 1, 0);
  const startWeekday = firstDay.getDay();
  const daysInMonth = lastDay.getDate();

  const monthName = firstDay.toLocaleDateString("en-US", { month: "long", year: "numeric" });

  const dayNames = ["S", "M", "T", "W", "T", "F", "S"];

  const cells: Array<{ date?: string; day?: number }> = [];
  for (let i = 0; i < startWeekday; i++) {
    cells.push({});
  }
  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = `${currentMonth.year}-${String(currentMonth.month + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    cells.push({ date: dateStr, day: d });
  }

  const selectedEntry = selectedDate ? entries[selectedDate] : null;

  return (
    <div className="calendar-view">
      <div className="calendar-header">
        <h2>{monthName}</h2>
        <div className="calendar-nav">
          <button onClick={handlePrev} className="calendar-nav-btn" aria-label="Previous month">‹</button>
          <button onClick={() => {
            const now = new Date();
            setCurrentMonth({ year: now.getFullYear(), month: now.getMonth() });
            setSelectedDate(todayStr);
            onDateSelect(todayStr);
          }} className="calendar-today-btn">Today</button>
          <button onClick={handleNext} className="calendar-nav-btn" aria-label="Next month">›</button>
        </div>
      </div>

      <div className="calendar-grid">
        {dayNames.map((dn, i) => (
          <div key={`dn-${i}`} className="calendar-day-name">{dn}</div>
        ))}
        {cells.map((cell, idx) => {
          if (!cell.day) {
            return <div key={`empty-${idx}`} className="calendar-cell empty" />;
          }
          const entry = entries[cell.date!];
          const isToday = cell.date === todayStr;
          const isSelected = cell.date === selectedDate;
          const density = entry ? densityLevel(entry.word_count) : 0;

          return (
            <button
              key={cell.date}
              className={`calendar-cell ${isToday ? "today" : ""} ${isSelected ? "selected" : ""} ${entry ? "has-entry" : ""}`}
              onClick={() => handleDayClick(cell.date!)}
            >
              <span className="calendar-day-num">{cell.day}</span>
              {entry && (
                <>
                  <span className={`calendar-dot density-${density}`} />
                  {entry.mood && <span className="calendar-mood">{moodEmoji(entry.mood)}</span>}
                </>
              )}
            </button>
          );
        })}
      </div>

      {selectedDate && (
        <div className="calendar-detail">
          <h3>{formatDate(selectedDate)}</h3>
          {selectedEntry ? (
            <div className="calendar-entry-summary">
              {selectedEntry.title && <p className="calendar-entry-title">{selectedEntry.title}</p>}
              <p className="calendar-entry-words">{selectedEntry.word_count} words</p>
              {selectedEntry.mood && <p className="calendar-entry-mood">Mood: {moodLabel(selectedEntry.mood)}</p>}
            </div>
          ) : (
            <p className="calendar-no-entry">No entry for this date.</p>
          )}
          <button className="calendar-open-btn" onClick={() => onDateSelect(selectedDate)}>
            Open in Editor
          </button>
        </div>
      )}

      {loading && <div className="calendar-loading">Loading…</div>}
    </div>
  );
}

function densityLevel(wordCount: number): number {
  if (wordCount === 0) return 0;
  if (wordCount < 100) return 1;
  if (wordCount < 300) return 2;
  if (wordCount < 800) return 3;
  return 4;
}

function moodEmoji(mood: string): string {
  const map: Record<string, string> = {
    happy: "😀",
    neutral: "😐",
    sad: "😢",
    angry: "😡",
    tired: "😴",
    custom: "❓",
  };
  return map[mood] || "❓";
}

function moodLabel(mood: string): string {
  const map: Record<string, string> = {
    happy: "Happy",
    neutral: "Neutral",
    sad: "Sad",
    angry: "Angry",
    tired: "Tired",
    custom: "Custom",
  };
  return map[mood] || mood;
}

function formatDate(iso: string): string {
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" });
}
