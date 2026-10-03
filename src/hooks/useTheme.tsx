import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from "react";
import { listen } from "@tauri-apps/api/event";

/** 三态：auto 跟随系统 → light → dark → auto（家族 §6.5 唯一状态机）。 */
export type Theme = "auto" | "light" | "dark";
type Resolved = "light" | "dark";

interface ThemeCtx {
  /** 用户选择的档位（可能是 auto）。data-theme 用 resolve 后的值。 */
  theme: Theme;
  /** auto 落成实际生效的 light/dark —— 画布类组件要跟这个走。 */
  resolved: Resolved;
  setTheme: (theme: Theme) => void;
  /** 菜单栏入口：与按钮共用同一个三态循环。 */
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeCtx | null>(null);

const STORAGE_KEY = "rocktier.journal.theme";
const CYCLE: readonly Theme[] = ["auto", "light", "dark"];

/** 三态引入前这个键只存 light/dark —— 原样读取，老用户偏好不丢。 */
function readMode(): Theme {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === "light" || saved === "dark" || saved === "auto") return saved;
  } catch {
    /* localStorage may be unavailable */
  }
  // 未手动选择过：跟随系统偏好（与 head 内联首帧脚本一致）
  return "auto";
}

function systemTheme(): Resolved {
  return window.matchMedia?.("(prefers-color-scheme: light)").matches ? "light" : "dark";
}

/** auto 落成实际生效值 —— data-theme 只接受 light/dark。 */
function resolveTheme(theme: Theme): Resolved {
  return theme === "auto" ? systemTheme() : theme;
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  // Read immediately so there's no flash on first paint
  const [theme, setThemeState] = useState<Theme>(readMode);
  const [resolved, setResolved] = useState<Resolved>(() => resolveTheme(readMode()));

  // Drive the document-level attribute so CSS variables switch
  useEffect(() => {
    const next = resolveTheme(theme);
    setResolved(next);
    document.documentElement.setAttribute("data-theme", next);
  }, [theme]);

  // auto 态下系统外观变了要跟着变；light/dark 是明确选择，不动。
  useEffect(() => {
    if (theme !== "auto") return;
    const mq = window.matchMedia("(prefers-color-scheme: light)");
    const onChange = () => {
      const next = systemTheme();
      setResolved(next);
      document.documentElement.setAttribute("data-theme", next);
    };
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [theme]);

  const setTheme = useCallback((next: Theme) => {
    setThemeState(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      /* ignore */
    }
  }, []);

  const toggleTheme = useCallback(() => {
    setThemeState((prev) => {
      const next = CYCLE[(CYCLE.indexOf(prev) + 1) % CYCLE.length];
      try {
        localStorage.setItem(STORAGE_KEY, next);
      } catch {
        /* ignore */
      }
      return next;
    });
  }, []);

  // Listen for menu bar theme toggle
  useEffect(() => {
    const unlisten = listen("menu:toggle-theme", () => {
      toggleTheme();
    });
    return () => {
      unlisten.then((f) => f()).catch(() => {});
    };
  }, [toggleTheme]);

  return (
    <ThemeContext.Provider value={{ theme, resolved, setTheme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme(): ThemeCtx {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within <ThemeProvider>");
  return ctx;
}