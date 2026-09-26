import { useTheme } from "../hooks/useTheme";

interface Props {
  currentView: string;
  onViewChange: (view: any) => void;
  onLock: () => void;
}

export default function Sidebar({ currentView, onViewChange, onLock }: Props) {
  const { theme, toggleTheme } = useTheme();

  const navItems = [
    { id: "today", label: "Today", icon: "✏" },
    { id: "calendar", label: "Calendar", icon: "▦" },
    { id: "timeline", label: "Timeline", icon: "≣" },
    { id: "search", label: "Search", icon: "⌕" },
    { id: "settings", label: "Settings", icon: "⚙" },
  ];

  return (
    <nav className="sidebar">
      <div className="sidebar-header">
        <span className="brand-dot small" />
        <span className="sidebar-brand">Journal</span>
      </div>

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
        <button className="sidebar-theme-toggle" onClick={toggleTheme} title={theme === "dark" ? "Switch to light" : "Switch to dark"}>
          <span className="sidebar-icon">{theme === "dark" ? "☀" : "☾"}</span>
          <span>{theme === "dark" ? "Light" : "Dark"}</span>
        </button>
        <button className="sidebar-lock" onClick={onLock}>
          Lock
        </button>
      </div>
    </nav>
  );
}
