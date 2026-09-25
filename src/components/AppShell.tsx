import { useState } from "react";
import Calendar from "./Calendar";
import Editor from "./Editor";
import Sidebar from "./Sidebar";
import SearchView from "./SearchView";
import Settings from "./Settings";
import Timeline from "./Timeline";

type View = "today" | "calendar" | "timeline" | "search" | "settings";

interface Props {
  onLock: () => void;
}

export default function AppShell({ onLock }: Props) {
  const [view, setView] = useState<View>("today");
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  const handleDateSelect = (date: string) => {
    setSelectedDate(date);
    setView("today");
  };

  return (
    <div className="app-shell">
      <Sidebar
        currentView={view}
        onViewChange={setView}
        onLock={onLock}
      />

      <main className="app-main">
        {view === "today" && (
          <Editor date={selectedDate ?? todayISO()} />
        )}
        {view === "calendar" && (
          <Calendar onDateSelect={handleDateSelect} />
        )}
        {view === "timeline" && <Timeline />}
        {view === "search" && <SearchView />}
        {view === "settings" && <Settings />}
      </main>
    </div>
  );
}

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}
