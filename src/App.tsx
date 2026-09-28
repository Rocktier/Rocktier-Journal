import { useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import LockScreen from "./components/LockScreen";
import SetupScreen from "./components/SetupScreen";
import AppShell from "./components/AppShell";
import { ThemeProvider } from "./hooks/useTheme";
import { AuthProvider, useAuth } from "./hooks/AuthContext";
import { getLocale } from "./i18n";

function AppInner() {
  const { isAuthenticated, hasVault, lock } = useAuth();

  // 挂载即按持久化语言构建系统菜单（Rust 侧 setup 只建了英文初版）
  useEffect(() => {
    invoke("build_menu", { lang: getLocale() }).catch(() => {});
  }, []);

  // Not authenticated: show setup (no vault) or lock (vault exists)
  if (!isAuthenticated) {
    return (
      <div className="app-root">
        {hasVault ? <LockScreen /> : <SetupScreen />}
      </div>
    );
  }

  return (
    <div className="app-root">
      <AppShell onLock={lock} />
    </div>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <AppInner />
      </AuthProvider>
    </ThemeProvider>
  );
}
