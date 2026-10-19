import { useState, useEffect, useCallback, useRef } from "react";
import { listen } from "@tauri-apps/api/event";
import Calendar from "./Calendar";
import Editor from "./Editor";
import { LicenseDialog } from "./LicenseDialog";
import { invoke } from "@tauri-apps/api/core";
import { checkForUpdates, currentVersion, type UpdateResult } from "../services/updates";
import { t } from "../i18n";
import Sidebar from "./Sidebar";
import SearchView from "./SearchView";
import Settings from "./Settings";
import Timeline from "./Timeline";
import {
  licenseStatus,
  onLicenseExpired,
  revalidateLicence,
  type LicenseInfo,
} from "../services/license";

type View = "today" | "calendar" | "timeline" | "search" | "settings";

const UPDATE_CHECKED_KEY = "rocktier.journal.updateCheckedAt";

/** 打包时写死，与 tag 同源 —— 不会出现系统里装着新版本而代码里写着旧版本的错位。 */
const APP_VERSION = currentVersion();

type UpdateState = "idle" | "checking" | "uptodate" | "available" | "failed";

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
  /* B1：吊销复检判定 revoked 时置位，激活框顶部显示「许可已被吊销」专属通告 ——
     回执已清、info 与试用到期无从区分，verdict 是唯一可靠的传递点。 */
  const [licenseRevoked, setLicenseRevoked] = useState(false);

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

  /* 更新检查。状态只由用户点击推进 —— 没有任何 effect 会自动发起联网请求，
     这是「除非你要求，应用不会联网」这条承诺的落点。 */
  const [updateState, setUpdateState] = useState<UpdateState>("idle");
  const [updateResult, setUpdateResult] = useState<UpdateResult | null>(null);
  const [lastCheckedAt, setLastCheckedAt] = useState<number | null>(() => {
    const raw = localStorage.getItem(UPDATE_CHECKED_KEY);
    const n = raw ? Number(raw) : 0;
    return n > 0 ? n : null;
  });
  const updateChecking = useRef(false);

  const runUpdateCheck = useCallback(async () => {
    if (updateChecking.current) return;
    updateChecking.current = true;
    setUpdateState("checking");
    try {
      const result = await checkForUpdates();
      setUpdateResult(result);
      setLastCheckedAt(result.checkedAt);
      try { localStorage.setItem(UPDATE_CHECKED_KEY, String(result.checkedAt)); } catch { /* 隐私模式下忽略 */ }
      setUpdateState(result.hasUpdate ? "available" : "uptodate");
      /* 顺带吊销复检：同一次点击、同一承诺（只在点击时联网）。revoked → 清回执，
         授权状态回到未激活并弹激活对话框。 */
      const verdict = await revalidateLicence();
      if (verdict === "revoked") {
        setLicenseRevoked(true);
        refreshLicense();
        setLicenseOpen(true);
      }
    } catch {
      setUpdateState("failed");
    } finally {
      updateChecking.current = false;
    }
  }, []);

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

  // Check for updates from menu bar (Help → 检查更新)：点击才联网
  useEffect(() => {
    const unlisten = listen("menu:check-updates", () => {
      void runUpdateCheck();
    });
    return () => {
      unlisten.then((f) => f()).catch(() => {});
    };
  }, [runUpdateCheck]);

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

      {/* 更新检查入口。固定右下角 —— 点击才联网：启动时、工作中、后台都不检查，
          见 services/updates.ts 头注。 */}
      <div className={`update-corner${updateState === "available" ? " has-update" : ""}`}>
        <button
          type="button"
          className="update-line"
          onClick={() => void runUpdateCheck()}
          disabled={updateState === "checking"}
          title={t("update.privacyNote")}
        >
          <span className="update-ver">v{APP_VERSION}</span>
          <span className="update-sep" aria-hidden="true">·</span>
          <span className="update-action">
            {updateState === "checking" ? t("update.checking") : t("update.check")}
          </span>
        </button>
        <div className="update-note" role="status" aria-live="polite">
          {updateState === "uptodate" && t("update.upToDate")}
          {updateState === "failed" && t("update.failed")}
          {updateState === "available" && updateResult && (
            <button
              type="button"
              className="update-get"
              onClick={() => void invoke("open_url", { url: updateResult.url }).catch(() => {})}
              title={t("update.available", { v: updateResult.latest })}
            >
              {t("update.download", { v: updateResult.latest })}
            </button>
          )}
          {updateState === "idle" &&
            t("update.lastChecked", {
              date: lastCheckedAt ? formatCheckedAt(lastCheckedAt) : t("update.never"),
            })}
        </div>
      </div>

      {licenseOpen && (
        <LicenseDialog
          info={license}
          revoked={licenseRevoked}
          onRefresh={refreshLicense}
          onClose={() => { setLicenseOpen(false); setLicenseRevoked(false); }}
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

/**
 * 「上次检查」的时间戳格式化。跟随界面语言 —— documentElement.lang
 * 由 i18n 模块维护（中文界面下是 zh-CN），避免中英混排。
 */
function formatCheckedAt(ts: number): string {
  try {
    return new Date(ts).toLocaleDateString(document.documentElement.lang || "en");
  } catch {
    return new Date(ts).toISOString().slice(0, 10);
  }
}
