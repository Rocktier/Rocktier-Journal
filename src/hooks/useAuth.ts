import { useState, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";

export interface AuthState {
  isAuthenticated: boolean;
  hasVault: boolean;
  isUnlocking: boolean;
  error: string | null;
}

export function useAuth() {
  const [state, setState] = useState<AuthState>({
    isAuthenticated: false,
    hasVault: false,
    isUnlocking: false,
    error: null,
  });

  useEffect(() => {
    invoke<boolean>("check_vault_exists")
      .then((hasVault) => setState((s) => ({ ...s, hasVault: hasVault })))
      .catch(() => {});
  }, []);

  const resetVault = useCallback(async () => {
    await invoke("delete_vault");
    setState((s) => ({ ...s, hasVault: false, error: null }));
  }, []);

  const initVault = useCallback(async (password: string) => {
    setState((s) => ({ ...s, isUnlocking: true, error: null }));
    try {
      await invoke("init_vault", { password });
      setState((s) => ({ ...s, isAuthenticated: true, isUnlocking: false }));
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setState((s) => ({ ...s, isUnlocking: false, error: msg }));
    }
  }, []);

  const unlock = useCallback(async (password: string) => {
    setState((s) => ({ ...s, isUnlocking: true, error: null }));
    try {
      await invoke("unlock_vault", { password });
      setState((s) => ({ ...s, isAuthenticated: true, isUnlocking: false }));
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setState((s) => ({ ...s, isUnlocking: false, error: msg }));
    }
  }, []);

  const lock = useCallback(async () => {
    try {
      await invoke("lock_vault");
    } catch (_) {
      /* noop */
    }
    setState((s) => ({ ...s, isAuthenticated: false }));
  }, []);

  return { ...state, initVault, unlock, lock, resetVault };
}
