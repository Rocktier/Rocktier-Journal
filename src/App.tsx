import { useEffect } from "react";
import LockScreen from "./components/LockScreen";
import AppShell from "./components/AppShell";
import { useTheme } from "./hooks/useTheme";
import { useAuth } from "./hooks/useAuth";

export default function App() {
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
