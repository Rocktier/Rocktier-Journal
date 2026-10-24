import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useTranslation } from "./useTranslation";
import { localizeVaultError } from "../services/errorText";

export interface AuthState {
  isAuthenticated: boolean;
  hasVault: boolean;
  isUnlocking: boolean;
  error: string | null;
  hint: string | null;
  /** 一次性恢复码：init / force_create / 迁移解锁 / recover / regenerate 之后
   *  由 UI 弹出保存卡。明文恢复码只在这几个时刻存在（信封只能解不能读），
   *  所以 UI 必须当场展示，用户 dismiss 后即从 state 消失。 */
  recoveryCode: string | null;
}

export interface AuthApi extends AuthState {
  initVault: (password: string, hintQuestion: string, hintAnswer: string) => Promise<void>;
  unlock: (password: string) => Promise<void>;
  lock: () => Promise<void>;
  resetVault: (answer: string) => Promise<void>;
  forceCreateVault: (
    password: string,
    hintQuestion: string,
    hintAnswer: string,
    oldHintAnswer?: string | null,
  ) => Promise<void>;
  restoreVault: (zipPath: string, password: string) => Promise<void>;
  fetchHint: () => Promise<string | null>;
  consumeHint: () => void;
  /** 忘记密码的恢复路径：恢复码 → 重设密码（数据零丢失）。成功后直接进入
   *  已解锁态，并把新恢复码写进 state.recoveryCode 供保存卡展示。 */
  recoverVault: (
    recoveryCode: string,
    newPassword: string,
    hintQuestion: string,
    hintAnswer: string,
  ) => Promise<void>;
  /** 重新生成恢复码（旧码作废，DEK 不变）。新码进 state.recoveryCode。 */
  regenerateRecoveryCode: () => Promise<string | null>;
  /** 保存卡关闭：清掉一次性恢复码（用户已保存或选择稍后在设置里重新生成）。 */
  dismissRecoveryCode: () => void;
}

const AuthContext = createContext<AuthApi | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  /* 错误原文映射用：Rust 把错误拍平成英文串，这里换成当前语言的措辞 */
  const { t } = useTranslation();
  const [state, setState] = useState<AuthState>({
    isAuthenticated: false,
    hasVault: false,
    isUnlocking: false,
    error: null,
    hint: null,
    recoveryCode: null,
  });

  useEffect(() => {
    invoke<boolean>("check_vault_exists")
      .then((hasVault) => setState((s) => ({ ...s, hasVault })))
      .catch(() => {});
  }, []);

  const fetchHint = useCallback(async () => {
    try {
      const hint = await invoke<string | null>("get_hint");
      setState((s) => ({ ...s, hint: hint ?? null }));
      return hint ?? null;
    } catch {
      return null;
    }
  }, []);

  const consumeHint = useCallback(() => {
    setState((s) => ({ ...s, hint: null }));
  }, []);

  const dismissRecoveryCode = useCallback(() => {
    setState((s) => ({ ...s, recoveryCode: null }));
  }, []);

  const recoverVault = useCallback(
    async (
      recoveryCode: string,
      newPassword: string,
      hintQuestion: string,
      hintAnswer: string,
    ) => {
      setState((s) => ({ ...s, isUnlocking: true, error: null }));
      try {
        const newCode = await invoke<string>("recover_vault", {
          recoveryCode,
          newPassword,
          hintQuestion,
          hintAnswer,
        });
        // Rust 侧已把 vault 置于新密码的解锁态；这里同步前端态并挂上新恢复码
        // （旧码已被 Rust 烧掉，新码只此一次可见）。
        setState((s) => ({
          ...s,
          isAuthenticated: true,
          hasVault: true,
          isUnlocking: false,
          error: null,
          hint: null,
          recoveryCode: newCode,
        }));
      } catch (e: unknown) {
        const msg = localizeVaultError(e instanceof Error ? e.message : String(e), t);
        setState((s) => ({ ...s, isUnlocking: false, error: msg }));
        throw e;
      }
    },
    [t],
  );

  const regenerateRecoveryCode = useCallback(async () => {
    try {
      const newCode = await invoke<string>("regenerate_recovery_code");
      setState((s) => ({ ...s, recoveryCode: newCode }));
      return newCode;
    } catch (e: unknown) {
      const msg = localizeVaultError(e instanceof Error ? e.message : String(e), t);
      setState((s) => ({ ...s, error: msg }));
      return null;
    }
  }, [t]);

  const resetVault = useCallback(async (answer: string) => {
    await invoke("delete_vault", { hintAnswer: answer });
    setState((s) => ({ ...s, hasVault: false, error: null, hint: null }));
  }, []);

  const forceCreateVault = useCallback(
    async (
      password: string,
      hintQuestion: string,
      hintAnswer: string,
      oldHintAnswer: string | null = null,
    ) => {
      setState((s) => ({ ...s, isUnlocking: true, error: null }));
      try {
        // 旧保险箱设有提示问题时，后端会校验 oldHintAnswer（与 delete_vault 同一道闸）
        const recoveryCode = await invoke<string>("force_create_vault", { password, hintQuestion, hintAnswer, oldHintAnswer });
        setState((s) => ({ ...s, isAuthenticated: true, hasVault: true, isUnlocking: false, recoveryCode }));
      } catch (e: unknown) {
        const msg = localizeVaultError(e instanceof Error ? e.message : String(e), t);
        setState((s) => ({ ...s, isUnlocking: false, error: msg }));
      }
    },
    []
  );

  const initVault = useCallback(
    async (password: string, hintQuestion: string, hintAnswer: string) => {
      setState((s) => ({ ...s, isUnlocking: true, error: null }));
      try {
        const recoveryCode = await invoke<string>("init_vault", { password, hintQuestion, hintAnswer });
        setState((s) => ({ ...s, isAuthenticated: true, hasVault: true, isUnlocking: false, recoveryCode }));
      } catch (e: unknown) {
        const msg = localizeVaultError(e instanceof Error ? e.message : String(e), t);
        setState((s) => ({ ...s, isUnlocking: false, error: msg }));
      }
    },
    [t]
  );

  const unlock = useCallback(async (password: string) => {
    setState((s) => ({ ...s, isUnlocking: true, error: null }));
    try {
      // v2：unlock 返回 { migrated, recoveryCode }——migrated=true 表示本次解锁
      // 把旧版保险箱升级成了信封加密，recoveryCode 是仅此一次的明文码。
      const outcome = await invoke<{ migrated: boolean; recoveryCode: string | null }>(
        "unlock_vault",
        { password },
      );
      setState((s) => ({
        ...s,
        isAuthenticated: true,
        isUnlocking: false,
        recoveryCode: outcome?.recoveryCode ?? s.recoveryCode,
      }));
    } catch (e: unknown) {
      const msg = localizeVaultError(e instanceof Error ? e.message : String(e), t);
      setState((s) => ({ ...s, isUnlocking: false, error: msg }));
    }
  }, [t]);

  const lock = useCallback(async () => {
    try {
      await invoke("lock_vault");
    } catch (_) {
      /* noop */
    }
    setState((s) => ({ ...s, isAuthenticated: false }));
  }, []);

  const restoreVault = useCallback(async (zipPath: string, password: string) => {
    setState((s) => ({ ...s, isUnlocking: true, error: null }));
    try {
      await invoke("restore_vault", { zipPath, password });
      setState((s) => ({ ...s, hasVault: true, isUnlocking: false }));
    } catch (e: unknown) {
      const msg = localizeVaultError(e instanceof Error ? e.message : String(e), t);
      setState((s) => ({ ...s, isUnlocking: false, error: msg }));
    }
  }, []);

  return (
    <AuthContext.Provider
      value={{
        ...state,
        initVault,
        unlock,
        lock,
        resetVault,
        forceCreateVault,
        restoreVault,
        fetchHint,
        consumeHint,
        recoverVault,
        regenerateRecoveryCode,
        dismissRecoveryCode,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthApi {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return ctx;
}
