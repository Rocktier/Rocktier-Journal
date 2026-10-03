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
              <Icon path={PATHS[item.icon]} />
              <span className="sidebar-label">{item.label}</span>
            </button>
          </li>
        ))}
      </ul>

      <div className="sidebar-bottom">
        <button className="sidebar-theme-toggle" onClick={toggleTheme} title={theme === "dark" ? t("settings.theme.light") : t("settings.theme.dark")}>
          <Icon
            path={
              theme === "dark" ? (
                // 太阳
                <>
                  <circle cx="12" cy="12" r="4" />
                  <path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M19.1 4.9l-1.4 1.4M6.3 17.7l-1.4 1.4" />
                </>
              ) : (
                // 月牙
                <path d="M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5z" />
              )
            }
          />
          <span>{theme === "dark" ? t("sidebar.theme.light") : t("sidebar.theme.dark")}</span>
        </button>
        <button className="sidebar-lock" onClick={onLock}>
          {t("sidebar.lock")}
        </button>
      </div>
    </nav>
  );
}
