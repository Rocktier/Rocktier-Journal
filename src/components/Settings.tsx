import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { getVersion } from "@tauri-apps/api/app";
import { save } from "@tauri-apps/plugin-dialog";
import { useTheme } from "../hooks/useTheme";
import { useTranslation } from "../hooks/useTranslation";
import { LOCALES, type Locale } from "../i18n";

export default function Settings() {
  const { theme, toggleTheme } = useTheme();
  const { t, changeLocale, locale } = useTranslation();
  const [exporting, setExporting] = useState(false);
  const [exportMsg, setExportMsg] = useState<string | null>(null);
  const [version, setVersion] = useState<string>("");

  useEffect(() => {
    getVersion().then(setVersion).catch(() => {});
  }, []);

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
      setExportMsg(t("settings.export.done", { n: count }));
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
        <label>{t("settings.theme")}</label>
        {/* 设置面板里的这一行是「带标签的设置项」，不是图标按钮：
            家族统一的 28×28 .icon-btn 在侧栏底部（Sidebar.tsx）。
            两处共用 useTheme 的同一个三态循环。 */}
        <button
          onClick={toggleTheme}
          className="theme-toggle"
          data-mode={theme}
          title={theme === "light" ? t("settings.theme.dark") : theme === "dark" ? t("settings.theme.light") : t("sidebar.theme.auto")}
        >
          {theme === "light"
            ? t("sidebar.theme.light")
            : theme === "dark"
              ? t("sidebar.theme.dark")
              : t("sidebar.theme.auto")}
        </button>
      </div>

      <div className="settings-item">
        <label>{t("settings.language")}</label>
        {/* 家族标准 8 门语言。原为「切换为中文」单按钮 —— 6 门接入后没法用。
            原生 select：8 个选项不需要搜索，跨平台行为一致，
            键盘与读屏器支持免费获得。选项显示 endonym（语言自称）。 */}
        <select
          value={locale}
          onChange={(e) => changeLocale(e.target.value as Locale)}
          className="theme-toggle"
          aria-label={t("settings.language")}
        >
          {LOCALES.map((l) => (
            <option key={l.code} value={l.code}>{l.endonym}</option>
          ))}
        </select>
      </div>

      <div className="settings-item">
        <label>{t("settings.backup")}</label>
        <div className="settings-export">
          <button onClick={handleExport} disabled={exporting} className="theme-toggle">
            {exporting ? t("settings.export.doing") : t("settings.export")}
          </button>
          {exportMsg && <span className="settings-export-msg">{exportMsg}</span>}
        </div>
      </div>

      <div className="settings-item">
        <label>{t("settings.version")}</label>
        <span className="settings-version">{version || "—"} ({locale})</span>
      </div>
    </div>
  );
}
