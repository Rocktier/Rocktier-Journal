import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { save } from "@tauri-apps/plugin-dialog";
import { useTheme } from "../hooks/useTheme";
import { useTranslation } from "../hooks/useTranslation";

export default function Settings() {
  const { theme, toggleTheme } = useTheme();
  const { t, toggleLocale, locale } = useTranslation();
  const [exporting, setExporting] = useState(false);
  const [exportMsg, setExportMsg] = useState<string | null>(null);

  const handleExport = async () => {
    setExporting(true);
    setExportMsg(null);

    try {
      const defaultName = `rocktier-journal-backup-${new Date().toISOString().slice(0, 10)}.zip`;
      const outputPath = await save({
        title: "Export Vault",
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
      setExportMsg(`Export failed: ${msg}`);
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
        <button onClick={toggleTheme} className="theme-toggle">
          {theme === "dark" ? t("settings.theme.light") : t("settings.theme.dark")}
        </button>
      </div>

      <div className="settings-item">
        <label>Language</label>
        <button onClick={toggleLocale} className="theme-toggle">
          {t("i18n.switch")}
        </button>
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
        <span className="settings-version">0.1.0 ({locale})</span>
      </div>
    </div>
  );
}
