import { createContext, useContext, useState, useEffect, type ReactNode } from "react";

export type Theme = "dark" | "light";

interface ThemeCtx {
  theme: Theme;
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeCtx | null>(null);

const STORAGE_KEY = "rj-theme";

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<Theme>(() => {
    // Read immediately so there's no flash on first paint
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved === "light" || saved === "dark") return saved;
    } catch {
      /* localStorage may be unavailable */
    }
    // 未手动选择过：跟随系统偏好（锁定机会留给手动切换，与 head 内联首帧脚本一致）
    if (window.matchMedia?.("(prefers-color-scheme: light)").matches) {
      return "light";
    }
    return "dark";
  });

  // Drive the document-level attribute so CSS variables switch
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
  }, [theme]);

  const toggleTheme = () => {
    setTheme((prev) => {
      const next: Theme = prev === "dark" ? "light" : "dark";
      try {
        localStorage.setItem(STORAGE_KEY, next);
      } catch {
        /* ignore */
      }
      return next;
    });
  };

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme(): ThemeCtx {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within <ThemeProvider>");
  return ctx;
}
