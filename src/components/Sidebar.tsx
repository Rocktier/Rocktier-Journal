import { useTheme } from "../hooks/useTheme";
import { useTranslation } from "../hooks/useTranslation";
import JnLogo from "./JnLogo";

interface Props {
  currentView: string;
  onViewChange: (view: any) => void;
  onLock: () => void;
}

export default function Sidebar({ currentView, onViewChange, onLock }: Props) {
  const { t } = useTranslation();
  const { theme, toggleTheme } = useTheme();

  const navItems = [
    { id: "today", label: t("sidebar.today"), icon: "✏" },
    { id: "calendar", label: t("sidebar.calendar"), icon: "▦" },
    { id: "timeline", label: t("sidebar.timeline"), icon: "≣" },
    { id: "search", label: t("sidebar.search"), icon: "⌕" },
    { id: "settings", label: t("sidebar.settings"), icon: "⚙" },
  ];

  return (
    <nav className="sidebar">
      <div className="sidebar-header">
        <JnLogo size={28} />
        <span className="sidebar-brand">Journal</span>
      </div>
      <div className="sidebar-tagline">{t("common.tagline")}</div>

      <ul className="sidebar-nav">
        {navItems.map((item) => (
          <li key={item.id}>
            <button
              className={`sidebar-item ${currentView === item.id ? "active" : ""}`}
              onClick={() => onViewChange(item.id)}
            >
              <span className="sidebar-icon">{item.icon}</span>
              <span className="sidebar-label">{item.label}</span>
            </button>
          </li>
        ))}
      </ul>

      <div className="sidebar-bottom">
        <button className="sidebar-theme-toggle" onClick={toggleTheme} title={theme === "dark" ? t("settings.theme.light") : t("settings.theme.dark")}>
          <span className="sidebar-icon">{theme === "dark" ? "☀" : "☾"}</span>
          <span>{theme === "dark" ? t("sidebar.theme.light") : t("sidebar.theme.dark")}</span>
        </button>
        <button className="sidebar-lock" onClick={onLock}>
          {t("sidebar.lock")}
        </button>
      </div>
    </nav>
  );
}
