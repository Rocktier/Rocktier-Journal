import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { getVersion } from "@tauri-apps/api/app";
import { save } from "@tauri-apps/plugin-dialog";
import { useTheme } from "../hooks/useTheme";
import { useTranslation } from "../hooks/useTranslation";
import { useAuth } from "../hooks/AuthContext";

export default function Settings() {
  const { theme, toggleTheme } = useTheme();
  const { t, tp, changeLocale, locale } = useTranslation();
  const { regenerateRecoveryCode } = useAuth();
  const [exporting, setExporting] = useState(false);
  const [exportMsg, setExportMsg] = useState<string | null>(null);
  const [regenMsg, setRegenMsg] = useState<string | null>(null);
  // 原生 window.confirm 是系统级白面板，不吃深色主题（2026-10-25 审计 D-78「恢复密钥弹窗白色面板」）。
  // 改为应用内两步确认：第一次点亮确认态（按钮文案换为「确认作废旧码」，悬停见后果），
  // 再点一次才真正作废旧码；点「取消」退出确认态。
  const [regenConfirming, setRegenConfirming] = useState(false);
  const [version, setVersion] = useState<string>("");

  useEffect(() => {
    getVersion().then(setVersion).catch(() => {});
  }, []);

  const handleRegenerate = async () => {
    if (!regenConfirming) {
      setRegenConfirming(true);
      return;
    }
    setRegenConfirming(false);
    setRegenMsg(null);
    // 新码进 AuthContext.state.recoveryCode → App 层的保存卡自动弹出展示
    const code = await regenerateRecoveryCode();
    setRegenMsg(code ? t("recovery.regenerated") : t("settings.export.failed", { e: "—" }));
    setTimeout(() => setRegenMsg(null), 5000);
  };

  const handleExport = async () => {
    setExporting(true);
    setExportMsg(null);

    try {
      const defaultName = `rocktier-journal-backup-${new Date().toISOString().slice(0, 10)}.zip`;
      const outputPath = await save({
        title: t("settings.export.title"),
        defaultPath: defaultName,
        filters: [{ name: "ZIP Archive", extensions: ["zip"] }],
      });

      if (!outputPath) {
        setExporting(false);
        return;
      }

      const count = await invoke<number>("export_vault", { outputPath });
      setExportMsg(tp("settings.export.done", count));
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setExportMsg(t("settings.export.failed", { e: msg }));
    } finally {
      setExporting(false);
      setTimeout(() => setExportMsg(null), 5000);
    }
  };

  return (
    <div className="settings">
      <h2>{t("sidebar.settings")}</h2>

      <div className="settings-item">
        <label>{t("settings.themeLabel")}</label>
        {/* 设置面板里的这一行是「带标签的设置项」，不是图标按钮：
            家族统一的 28×28 .icon-btn 在侧栏底部（Sidebar.tsx）。
            两处共用 useTheme 的同一个两态切换（2026-11-15 取消「跟随系统」）。 */}
        <button
          onClick={toggleTheme}
          className="theme-toggle"
          data-mode={theme}
          title={theme === "light" ? t("settings.themeDark") : t("settings.themeLight")}
        >
          {theme === "light" ? t("sidebar.theme.light") : t("sidebar.theme.dark")}
        </button>
      </div>

      <div className="settings-item">
        <label>{t("settings.language")}</label>
        {/* 语言切换收成 A+地球图标按钮（2026-11-15 用户令）：en/zh 对切。 */}
        <button
          className="icon-btn"
          onClick={() => changeLocale(locale === "en-US" ? "zh-CN" : "en-US")}
          aria-label={t("settings.language")}
          title={t("settings.language")}
        >
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <circle cx="12" cy="12" r="9" />
            <ellipse cx="12" cy="12" rx="3.8" ry="9" />
            <path d="M3 12h18" />
          </svg>
        </button>
      </div>

      <div className="settings-item">
        <label>{t("settings.backup")}</label>
        <div className="settings-export">
          <button onClick={handleExport} disabled={exporting} className="theme-toggle">
            {exporting ? t("settings.export.doing") : t("settings.exportBtn")}
          </button>
          {exportMsg && <span className="settings-export-msg">{exportMsg}</span>}
        </div>
      </div>

      <div className="settings-item">
        <label>{t("settings.recoveryLabel")}</label>
        <div className="settings-export">
          {/* 能进设置页 = 保险箱已解锁 = 信封已在（v2 或首次解锁时迁移），
              恢复码必然存在；这里只提供「重新生成」（旧码作废、新码展示一次）。 */}
          <span className="settings-version">{t("settings.recovery.ready")}</span>
          <button
            onClick={handleRegenerate}
            className="theme-toggle"
            title={regenConfirming ? t("settings.recovery.regenConfirm") : undefined}
          >
            {regenConfirming ? t("settings.recovery.regenGo") : t("settings.recovery.regen")}
          </button>
          {regenConfirming && (
            <button onClick={() => setRegenConfirming(false)} className="theme-toggle">
              {t("common.cancel")}
            </button>
          )}
          {regenMsg && <span className="settings-export-msg">{regenMsg}</span>}
        </div>
      </div>

      <div className="settings-item">
        <label>{t("settings.version")}</label>
        <span className="settings-version">{version || "—"} ({locale})</span>
      </div>
    </div>
  );
}
