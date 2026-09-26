import { useEffect } from "react";
import LockScreen from "./components/LockScreen";
import SetupScreen from "./components/SetupScreen";
import AppShell from "./components/AppShell";
import { useTheme } from "./hooks/useTheme";
import { AuthProvider, useAuth } from "./hooks/AuthContext";

function AppInner() {
  const { theme } = useTheme();
  const { isAuthenticated, hasVault, lock } = useAuth();

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
  }, [theme]);

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
    <AuthProvider>
      <AppInner />
    </AuthProvider>
  );
}
