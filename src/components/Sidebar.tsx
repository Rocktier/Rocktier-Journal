import { useTheme } from "../hooks/useTheme";
import { useTranslation } from "../hooks/useTranslation";
import JnLogo from "./JnLogo";

interface Props {
  currentView: string;
  onViewChange: (view: any) => void;
  onLock: () => void;
}

/* 家族规范 §6.6：图标一律内联 SVG，currentColor 随主题。
   此前侧栏用 ✏ ▦ ≣ ⌕ ⚙ ☀ ☾ 这些字符冒充图标 —— 覆盖度完全取决于系统字体
   回退：⌕ / ≣ 在 Windows 上没有可靠字形，容易出豆腐块；即便渲染成功，
   各字形的 ascent/descent 也各不相同，就是 B1「图标和文字没居中」的根因
   （.sidebar-icon 是 inline span，width/text-align 对它无效）。 */
function Icon({ path }: { path: React.ReactNode }) {
  return (
    <span className="sidebar-icon" aria-hidden>
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        {path}
      </svg>
    </span>
  );
}

const PATHS: Record<string, React.ReactNode> = {
  // 今天 = 写下
  today: <path d="M4 20h4L19 9a2.1 2.1 0 0 0-3-3L5 17v3zM14.5 7.5l2 2" />,
  // 日历
  calendar: (
    <>
      <rect x="3.5" y="5" width="17" height="15" rx="3" />
      <path d="M3.5 10h17M8 3v4M16 3v4" />
    </>
  ),
  // 时光轴
  timeline: <path d="M4 7h10M4 12h16M4 17h7" />,
  // 搜索
  search: (
    <>
      <circle cx="11" cy="11" r="6.5" />
      <path d="M16 16l4.5 4.5" />
    </>
  ),
  // 设置 = 三根滑杆
  settings: (
    <>
      <path d="M4 7h16M4 12h16M4 17h16" />
      <circle cx="9" cy="7" r="2" fill="var(--bg-secondary)" />
      <circle cx="15" cy="12" r="2" fill="var(--bg-secondary)" />
      <circle cx="8" cy="17" r="2" fill="var(--bg-secondary)" />
    </>
  ),
};

export default function Sidebar({ currentView, onViewChange, onLock }: Props) {
  const { t } = useTranslation();
  const { theme, toggleTheme } = useTheme();
  const themeLabel =
    theme === "light"
      ? t("sidebar.theme.light")
      : theme === "dark"
        ? t("sidebar.theme.dark")
        : t("sidebar.theme.auto");

  const navItems = [
    { id: "today", label: t("sidebar.today"), icon: "today" },
    { id: "calendar", label: t("sidebar.calendar"), icon: "calendar" },
    { id: "timeline", label: t("sidebar.timeline"), icon: "timeline" },
    { id: "search", label: t("sidebar.search"), icon: "search" },
    { id: "settings", label: t("sidebar.settings"), icon: "settings" },
  ];

  return (
    <nav className="sidebar">
      <div className="sidebar-header">
        <JnLogo size={28} />
        <span className="sidebar-brand">Rocktier Journal</span>
        <span className="dot-live" aria-hidden="true" />
      </div>
      <div className="sidebar-tagline">{t("common.tagline")}</div>

      <ul className="sidebar-nav">
        {navItems.map((item) => (
          <li key={item.id}>
            <button
              className={`sidebar-item ${currentView === item.id ? "active" : ""}`}
              onClick={() => onViewChange(item.id)}
            >
              <Icon path={PATHS[item.icon]} />
              <span className="sidebar-label">{item.label}</span>
            </button>
          </li>
        ))}
      </ul>

      <div className="sidebar-bottom">
        {/* 家族唯一主题按钮：.icon-btn（28×28 + 40×40 命中区）。
            此前是整行带文字的 sidebar 按钮，跨产品认不出是同一个控件。
            三态 auto → light → dark，data-mode 驱动角标，title/aria-label 说明当前档。 */}
        <button
          className="icon-btn"
          data-mode={theme}
          onClick={toggleTheme}
          title={`${t("settings.theme")} \u00b7 ${themeLabel}`}
          aria-label={`${t("settings.theme")}: ${themeLabel}`}
        >
          {theme === "auto" ? (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <rect x="2.5" y="4" width="19" height="13" rx="2" />
              <path d="M8 20.5h8M12 17v3.5" />
            </svg>
          ) : theme === "dark" ? (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <circle cx="12" cy="12" r="4" />
              <path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
            </svg>
          ) : (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M21 12.8A9 9 0 1 1 11.2 3 7 7 0 0 0 21 12.8z" />
            </svg>
          )}
        </button>
        <button className="sidebar-lock" onClick={onLock}>
          {t("sidebar.lock")}
        </button>
      </div>
    </nav>
  );
}
