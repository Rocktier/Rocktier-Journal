import { useState, useRef, useEffect } from "react";
import { useAuth } from "../hooks/AuthContext";
import { useTranslation } from "../hooks/useTranslation";
import JnLogo from "./JnLogo";

type Mode = "unlock" | "reset" | "noHint" | "forceCreate";

/**
 * Destructive vault erasure (reset via hint, or force-create) is gated behind a
 * typed confirmation: the user must type DELETE, not just click a button, so a
 * single misclick can never wipe the whole diary. See runDestructive / the
 * lock-destroy-confirm panel below.
 */

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
  // 旧保险箱的提示答案：旧保险箱设有提示问题时，销毁它必须先答对（P0-11）
  const [oldHintAnswer, setOldHintAnswer] = useState("");

  const [mode, setMode] = useState<Mode>("unlock");
  const [localError, setLocalError] = useState<string | null>(null);
  const [pendingDestructive, setPendingDestructive] = useState<null | "reset" | "forceCreate">(null);
  const [confirmPhrase, setConfirmPhrase] = useState("");

  const passwordRef = useRef<HTMLInputElement | null>(null);
  const answerRef = useRef<HTMLInputElement | null>(null);

  const oldHintRequired = !!hint && hint.trim().length > 0;

  useEffect(() => {
    if (mode === "unlock") passwordRef.current?.focus();
    else answerRef.current?.focus();
  }, [mode]);

  // 进入「创建新保险箱（销毁旧数据）」表单时查明旧保险箱是否设有提示问题，
  // 设有时展示必填的旧答案输入框（后端 force_create_vault 会校验）
  useEffect(() => {
    if (mode === "forceCreate") void fetchHint();
  }, [mode, fetchHint]);

  const currentError = localError ?? error;

  const clearAll = () => {
    setPassword("");
    setConfirmPassword("");
    setHintQuestion("");
    setHintAnswer("");
    setOldHintAnswer("");
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
      // P0-11：无提示问题 ≠ 直接进入销毁流程。先停在纯说明页，
      // 由用户显式选择「创建新保险箱」后才进入（仍需 DELETE 确认）。
      setMode("noHint");
    }
  };

  // ── Reset via hint answer ─────────────────────────────────────
  const handleReset = (e: React.FormEvent) => {
    e.preventDefault();
    setLocalError(null);
    if (!hintAnswer.trim()) return setLocalError(t("lock.enterHintAnswer"));
    // 不可逆销毁：进入二次确认（需手动输入 DELETE），不再是一键删除
    setPendingDestructive("reset");
  };

  // ── Force-create (overwrite) ──────────────────────────────────
  const handleForceCreate = (e: React.FormEvent) => {
    e.preventDefault();
    setLocalError(null);
    if (!password) return setLocalError(t("lock.enterNewPassword"));
    if (password.length < 8) return setLocalError(t("lock.minChars"));
    if (password !== confirmPassword) return setLocalError(t("lock.mismatch"));
    if (!hintQuestion.trim()) return setLocalError(t("lock.setQuestion"));
    if (!hintAnswer.trim()) return setLocalError(t("lock.setAnswer"));
    // 旧保险箱设有提示问题时，必须先答对才允许销毁（后端 force_create_vault 同样校验）
    if (oldHintRequired && !oldHintAnswer.trim()) return setLocalError(t("lock.enterHintAnswer"));
    // 不可逆销毁：进入二次确认（需手动输入 DELETE）
    setPendingDestructive("forceCreate");
  };

  const runDestructive = async () => {
    setLocalError(null);
    try {
      if (pendingDestructive === "reset") {
        await resetVault(hintAnswer.trim());
      } else if (pendingDestructive === "forceCreate") {
        await forceCreateVault(
          password,
          hintQuestion.trim(),
          hintAnswer.trim(),
          oldHintRequired ? oldHintAnswer.trim() : null,
        );
      }
      setPendingDestructive(null);
      setConfirmPhrase("");
      clearAll();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setLocalError(msg || t("lock.incorrectHint"));
      setPendingDestructive(null);
      setConfirmPhrase("");
    }
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

        {/* DESTRUCTIVE CONFIRM (requires typing DELETE) */}
        {pendingDestructive && (
          <div className="lock-destroy-confirm">
            <p className="lock-destroy-warn">{t("lock.eraseWarn")}</p>
            <p className="lock-destroy-hint">{t("lock.typeDelete")}</p>
            <input
              type="text"
              className="lock-input"
              placeholder="DELETE"
              value={confirmPhrase}
              onChange={(e) => setConfirmPhrase(e.target.value)}
              autoFocus
            />
            <div className="lock-destroy-actions">
              <button
                type="button"
                className="lock-btn danger"
                disabled={confirmPhrase !== "DELETE"}
                onClick={runDestructive}
              >
                {t("lock.confirmErase")}
              </button>
              <button
                type="button"
                className="lock-cancel"
                onClick={() => { setPendingDestructive(null); setConfirmPhrase(""); }}
              >
                {t("common.cancel")}
              </button>
            </div>
          </div>
        )}

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

        {/* NO HINT — pure explanation page, no destructive action here */}
        {mode === "noHint" && (
          <>
            <p className="lock-subtitle">{t("lock.noHint")}</p>
            <div className="lock-form">
              <button
                type="button"
                className="lock-btn danger"
                onClick={() => { setMode("forceCreate"); clearAll(); }}
              >
                {t("lock.createErase")}
              </button>
              <button type="button" className="lock-cancel" onClick={backToUnlock}>
                {t("lock.backToUnlock")}
              </button>
            </div>
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
              {oldHintRequired && (
                <div className="lock-hint-section">
                  <div className="lock-hint-display">
                    <span className="lock-hint-q">Q:</span>
                    <span className="lock-hint-text">{hint}</span>
                  </div>
                  <input
                    type={showHintAnswer ? "text" : "password"}
                    placeholder={t("lock.oldHintAnswer")}
                    value={oldHintAnswer}
                    onChange={(e) => setOldHintAnswer(e.target.value)}
                    className="lock-input"
                  />
                </div>
              )}
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
