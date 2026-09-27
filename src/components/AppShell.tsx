import { useState, useEffect } from "react";
import { listen } from "@tauri-apps/api/event";
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
  const [sidebarVisible, setSidebarVisible] = useState(true);

  const handleDateSelect = (date: string) => {
    setSelectedDate(date);
    setView("today");
  };

  // Toggle sidebar from menu bar
  useEffect(() => {
    const unlisten = listen("menu:toggle-sidebar", () => {
      setSidebarVisible((v) => !v);
    });
    return () => {
      unlisten.then((f) => f()).catch(() => {});
    };
  }, []);

  return (
    <div className={`app-shell${sidebarVisible ? "" : " sidebar-hidden"}`}>
      {sidebarVisible && (
        <Sidebar
          currentView={view}
          onViewChange={setView}
          onLock={onLock}
        />
      )}

      <main className="app-main">
        {view === "today" && (
          <Editor date={selectedDate ?? todayISO()} />
        )}
        {view === "calendar" && (
          <Calendar onDateSelect={handleDateSelect} />
        )}
        {view === "timeline" && <Timeline />}
        {view === "search" && <SearchView onSelect={handleDateSelect} />}
        {view === "settings" && <Settings />}
      </main>
    </div>
  );
}

function todayISO(): string {
  // 本地日期，不能用 toISOString()——它以 UTC 计算，上午（UTC+8 的
  // 00:00–08:00）会把今天的日记落到昨天。App 内两处「今天」曾各算各的，
  // 现在统一走这里。
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
