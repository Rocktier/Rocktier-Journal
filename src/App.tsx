import { useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import LockScreen from "./components/LockScreen";
import SetupScreen from "./components/SetupScreen";
import RecoveryCodeCard from "./components/RecoveryCodeCard";
import AppShell from "./components/AppShell";
import { ThemeProvider } from "./hooks/useTheme";
import { AuthProvider, useAuth } from "./hooks/AuthContext";
import { getLocale } from "./i18n";

function AppInner() {
  const { isAuthenticated, hasVault, lock, recoveryCode, dismissRecoveryCode } = useAuth();

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
      {/* 一次性恢复码保存卡：创建 / 覆盖创建 / v1→v2 迁移 / 重置 / 重新生成
          之后，state.recoveryCode 里有且仅有一次明文 —— 阻断式 overlay，
          用户点「我已保存」后才 dismiss（码从此不可再读，只能重新生成）。 */}
      {recoveryCode && (
        <RecoveryCodeCard code={recoveryCode} onDismiss={dismissRecoveryCode} />
      )}
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
