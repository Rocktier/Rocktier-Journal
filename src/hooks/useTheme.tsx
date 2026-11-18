import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from "react";
import { listen } from "@tauri-apps/api/event";

/** 两态：light ⇄ dark。
 *  2026-11-15 用户令：全家族取消「跟随系统」，原 §6.5 三态状态机退役；
 *  图标只做太阳 / 月亮。 */
export type Theme = "light" | "dark";
type Resolved = "light" | "dark";

interface ThemeCtx {
  /** 用户选择的档位（两态下即实际生效值）。data-theme 用它。 */
  theme: Theme;
  /** 实际生效值 —— 画布类组件要跟这个走（两态下与 theme 相同）。 */
  resolved: Resolved;
  setTheme: (theme: Theme) => void;
  /** 菜单栏入口：与按钮共用同一个两态切换。 */
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeCtx | null>(null);

/* 2026-11-18 起与 PDF 仓同构：键改 rocktier.theme（家族统一键）；
   旧键 rocktier.journal.theme 仅作读取回落，一次迁移后不再使用。 */
const STORAGE_KEY = "rocktier.theme";
const STORAGE_KEY_LEGACY = "rocktier.journal.theme";

function systemTheme(): Resolved {
  return window.matchMedia?.("(prefers-color-scheme: light)").matches ? "light" : "dark";
}

function readMode(): Theme {
  try {
    const saved =
      localStorage.getItem(STORAGE_KEY) ?? localStorage.getItem(STORAGE_KEY_LEGACY);
    if (saved === "light" || saved === "dark") return saved;
    if (saved === "auto") {
      // 旧「跟随系统」用户：按读取当时的系统值一次性落定并持久化，
      // 此后不再跟随系统变化（用户看得见的偏好不丢）。
      const resolved = systemTheme();
      try {
        localStorage.setItem(STORAGE_KEY, resolved);
      } catch {
        /* ignore */
      }
      return resolved;
    }
  } catch {
    /* localStorage may be unavailable */
  }
  // 未手动选择过：深色（家族基线；2026-11-15 起不再跟随系统）
  return "dark";
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  // Read immediately so there's no flash on first paint
  const [theme, setThemeState] = useState<Theme>(readMode);

  // Drive the document-level attribute so CSS variables switch
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
  }, [theme]);

  // 「跟随系统」已取消：不再监听 prefers-color-scheme 变化，
  // light/dark 都是明确选择，启动后保持不变。

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
      const next: Theme = prev === "dark" ? "light" : "dark";
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
    <ThemeContext.Provider value={{ theme, resolved: theme, setTheme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme(): ThemeCtx {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within <ThemeProvider>");
  return ctx;
}
