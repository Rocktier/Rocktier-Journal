import { useEffect } from "react";
import LockScreen from "./components/LockScreen";
import AppShell from "./components/AppShell";
import { useTheme } from "./hooks/useTheme";
import { AuthProvider, useAuth } from "./hooks/AuthContext";

function AppInner() {
  const { theme } = useTheme();
  const { isAuthenticated, lock } = useAuth();

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
  }, [theme]);

  return (
    <div className="app-root">
      {isAuthenticated ? <AppShell onLock={lock} /> : <LockScreen />}
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
