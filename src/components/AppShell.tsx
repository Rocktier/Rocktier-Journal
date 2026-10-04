import { useState, useEffect, useCallback } from "react";
import { listen } from "@tauri-apps/api/event";
import Calendar from "./Calendar";
import Editor from "./Editor";
import { LicenseDialog } from "./LicenseDialog";
import Sidebar from "./Sidebar";
import SearchView from "./SearchView";
import Settings from "./Settings";
import Timeline from "./Timeline";
import {
  licenseStatus,
  onLicenseExpired,
  type LicenseInfo,
} from "../services/license";

type View = "today" | "calendar" | "timeline" | "search" | "settings";

interface Props {
  onLock: () => void;
}

export default function AppShell({ onLock }: Props) {
  const [view, setView] = useState<View>("today");
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [sidebarVisible, setSidebarVisible] = useState(true);
  /** 编辑器之外的「上一个视图」——「完成」按钮回到这里（默认时光轴）。
   *  只记非编辑器视图：从设置页进来、按下完成，不该被弹回设置。 */
  const [returnView, setReturnView] = useState<View>("timeline");

  /* L6 家族授权：试用状态 + 到期被拦时的激活对话框。
     事件链为主（Rust 在闸门处 emit），catch 里的错误码判定为双保险 —— 与
     FAMILY-LICENSE.md §2「命令层是唯一入口」一致：两道都漏才会漏。 */
  const [license, setLicense] = useState<LicenseInfo | null>(null);
  const [licenseOpen, setLicenseOpen] = useState(false);

  const refreshLicense = useCallback(() => {
    licenseStatus()
      .then(setLicense)
      .catch(() => {
        /* 拿不到状态就当作「无授权信息」：不弹窗、不显示胶囊。
           取不到目录不该变成一次锁死（与 Rust 侧失败安全同向）。 */
      });
  }, []);

  useEffect(() => {
    refreshLicense();
    const un = onLicenseExpired(() => setLicenseOpen(true));
    return () => {
      void un.then((fn) => fn()).catch(() => {});
    };
  }, [refreshLicense]);

  const navigate = useCallback((next: View) => {
    if (next !== "today") setReturnView(next);
    setView(next);
  }, []);

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

  // Lock vault from menu bar (File → Lock Vault)
  useEffect(() => {
    const unlisten = listen("menu:lock-vault", () => {
      onLock();
    });
    return () => {
      unlisten.then((f) => f()).catch(() => {});
    };
  }, [onLock]);

  return (
    <div className={`app-shell${sidebarVisible ? "" : " sidebar-hidden"}`}>
      {sidebarVisible && (
        <Sidebar
          currentView={view}
          onViewChange={navigate}
          onLock={onLock}
        />
      )}

      <main className="app-main">
        {view === "today" && (
          <Editor date={selectedDate ?? todayISO()} onDone={() => navigate(returnView)} />
        )}
        {view === "calendar" && (
          <Calendar onDateSelect={handleDateSelect} />
        )}
        {view === "timeline" && <Timeline />}
        {view === "search" && <SearchView onSelect={handleDateSelect} />}
        {view === "settings" && <Settings />}
      </main>

      {licenseOpen && (
        <LicenseDialog
          info={license}
          onRefresh={refreshLicense}
          onClose={() => setLicenseOpen(false)}
        />
      )}
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
