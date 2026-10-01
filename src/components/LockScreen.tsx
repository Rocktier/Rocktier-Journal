import { useState, useRef, useEffect } from "react";
import { ask } from "@tauri-apps/plugin-dialog";
import { useAuth } from "../hooks/AuthContext";
import { useTranslation } from "../hooks/useTranslation";
import JnLogo from "./JnLogo";

type Mode = "unlock" | "reset" | "forceCreate";

/**
 * Native warning dialog in Tauri, window.confirm in browser-only dev mode.
 * Same helper family as Rocktier Write's services/file.ts confirmDialog.
 */
async function confirmDestructive(message: string): Promise<boolean> {
  try {
    return await ask(message, { title: "Rocktier Journal", kind: "warning" });
  } catch {
    return window.confirm(message);
  }
}

/**
 * Pure authentication gate — only rendered when a vault already exists.
 * Offers: unlock | forgot (hint answer → reset) | force-create (overwrite).
 */
export default function LockScreen() {
  const { t } = useTranslation();
  const {
    unlock,
    isUnlocking,
    resetVault,
    forceCreateVault,
    fetchHint,
    consumeHint,
    error,
    hint,
  } = useAuth();

  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  const [hintAnswer, setHintAnswer] = useState("");
  const [showHintAnswer, setShowHintAnswer] = useState(false);

  const [confirmPassword, setConfirmPassword] = useState("");
  const [hintQuestion, setHintQuestion] = useState("");

  const [mode, setMode] = useState<Mode>("unlock");
  const [localError, setLocalError] = useState<string | null>(null);

  const passwordRef = useRef<HTMLInputElement | null>(null);
  const answerRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (mode === "unlock") passwordRef.current?.focus();
    else answerRef.current?.focus();
  }, [mode]);

  const currentError = localError ?? error;

  const clearAll = () => {
    setPassword("");
    setConfirmPassword("");
    setHintQuestion("");
    setHintAnswer("");
    setLocalError(null);
  };

  // ── Unlock ────────────────────────────────────────────────────
  const handleUnlock = async (e: React.FormEvent) => {
    e.preventDefault();
    setLocalError(null);
    if (!password) return setLocalError(t("lock.enterPassword"));
    await unlock(password);
  };

  // ── Forgot → fetch hint, branch ───────────────────────────────
  const handleForgot = async () => {
    setLocalError(null);
    const h = await fetchHint();
    if (h && h.trim().length > 0) {
      setMode("reset");
    } else {
      setLocalError(t("lock.noHint"));
      setMode("forceCreate");
      consumeHint();
    }
  };

  // ── Reset via hint answer ─────────────────────────────────────
  const handleReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setLocalError(null);
    if (!hintAnswer.trim()) return setLocalError(t("lock.enterHintAnswer"));
    // 不可逆销毁：先确认（此前点一下就没了）
    const ok = await confirmDestructive(t("lock.eraseWarn"));
    if (!ok) return;
    try {
      await resetVault(hintAnswer.trim());
      // After reset, App.tsx sees hasVault=false → switches to SetupScreen
      clearAll();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setLocalError(msg || t("lock.incorrectHint"));
    }
  };

  // ── Force-create (overwrite) ──────────────────────────────────
  const handleForceCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setLocalError(null);
    if (!password) return setLocalError(t("lock.enterNewPassword"));
    if (password.length < 8) return setLocalError(t("lock.minChars"));
    if (password !== confirmPassword) return setLocalError(t("lock.mismatch"));
    if (!hintQuestion.trim()) return setLocalError(t("lock.setQuestion"));
    if (!hintAnswer.trim()) return setLocalError(t("lock.setAnswer"));
    // 不可逆销毁：先确认（与 reset 同一条守卫）
    const ok = await confirmDestructive(t("lock.eraseWarn"));
    if (!ok) return;
    await forceCreateVault(password, hintQuestion.trim(), hintAnswer.trim());
  };

  const backToUnlock = () => {
    setMode("unlock");
    clearAll();
    consumeHint();
  };

  return (
    <div className="lock-screen">
      <div className="lock-card">
        <JnLogo size={48} />
        <h1 className="lock-title">{t("app.name")}</h1>
        <p className="lock-tagline">{t("common.tagline")}</p>

        {/* UNLOCK */}
        {mode === "unlock" && (
          <>
            <p className="lock-subtitle">{t("lock.unlock")}</p>
            <form onSubmit={handleUnlock} className="lock-form">
              <div className="lock-input-wrap">
                <input
                  ref={passwordRef}
                  type={showPassword ? "text" : "password"}
                  placeholder={t("lock.password")}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="lock-input"
                  autoFocus
                />
                <button type="button" className="lock-visibility-toggle" onClick={() => setShowPassword((v) => !v)}>
                  {showPassword ? "◉" : "◎"}
                </button>
              </div>
              <button type="submit" disabled={isUnlocking} className="lock-btn">
                {isUnlocking ? t("lock.pleaseWait") : t("lock.unlockBtn")}
              </button>
            </form>
            <div className="lock-secondary-actions">
              <button type="button" className="lock-forgot" onClick={handleForgot}>
                {t("lock.forgot")}
              </button>
              <button type="button" className="lock-forgot danger" onClick={() => { setMode("forceCreate"); clearAll(); }}>
                {t("lock.createErase")}
              </button>
            </div>
          </>
        )}

        {/* RESET via hint */}
        {mode === "reset" && (
          <>
            <p className="lock-subtitle">{t("lock.hint")}</p>
            <form onSubmit={handleReset} className="lock-form">
              <div className="lock-hint-display">
                <span className="lock-hint-q">Q:</span>
                <span className="lock-hint-text">{hint ?? "—"}</span>
              </div>
              <div className="lock-input-wrap">
                <input
                  ref={answerRef}
                  type={showHintAnswer ? "text" : "password"}
                  placeholder={t("lock.hintAnswer")}
                  value={hintAnswer}
                  onChange={(e) => setHintAnswer(e.target.value)}
                  className="lock-input"
                  autoFocus
                />
                <button type="button" className="lock-visibility-toggle" onClick={() => setShowHintAnswer((v) => !v)}>
                  {showHintAnswer ? "◉" : "◎"}
                </button>
              </div>
              <button type="submit" disabled={isUnlocking} className="lock-btn danger">
                {isUnlocking ? t("lock.pleaseWait") : t("lock.eraseReset")}
              </button>
              <button type="button" className="lock-cancel" onClick={backToUnlock}>{t("lock.backToUnlock")}</button>
            </form>
          </>
        )}

        {/* FORCE CREATE */}
        {mode === "forceCreate" && (
          <>
            <p className="lock-subtitle">{t("lock.createOverwrite")}</p>
            <form onSubmit={handleForceCreate} className="lock-form">
              <div className="lock-input-wrap">
                <input
                  ref={passwordRef}
                  type={showPassword ? "text" : "password"}
                  placeholder={t("lock.newPassword")}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="lock-input"
                  autoFocus
                />
                <button type="button" className="lock-visibility-toggle" onClick={() => setShowPassword((v) => !v)}>
                  {showPassword ? "◉" : "◎"}
                </button>
              </div>
              <input
                type={showPassword ? "text" : "password"}
                placeholder={t("lock.confirmNew")}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="lock-input"
              />
              <div className="lock-hint-section">
                <input
                  type="text"
                  placeholder={t("lock.hintQuestion")}
                  value={hintQuestion}
                  onChange={(e) => setHintQuestion(e.target.value)}
                  className="lock-input"
                />
                <input
                  type="text"
                  placeholder={t("lock.hintAnswer")}
                  value={hintAnswer}
                  onChange={(e) => setHintAnswer(e.target.value)}
                  className="lock-input"
                />
              </div>
              <button type="submit" disabled={isUnlocking} className="lock-btn danger">
                {isUnlocking ? t("lock.pleaseWait") : t("lock.overwriteCreate")}
              </button>
              <button type="button" className="lock-cancel" onClick={backToUnlock}>{t("lock.backToUnlock")}</button>
            </form>
          </>
        )}

        {currentError && <p className="lock-error">{currentError}</p>}
      </div>
    </div>
  );
}
