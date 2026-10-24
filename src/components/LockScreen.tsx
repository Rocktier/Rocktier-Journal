import { useState, useRef, useEffect } from "react";
import { useAuth } from "../hooks/AuthContext";
import { useTranslation } from "../hooks/useTranslation";
import JnLogo from "./JnLogo";

type Mode = "unlock" | "forgot" | "recover" | "reset" | "noHint" | "forceCreate";

/**
 * Destructive vault erasure (reset via hint, or force-create) is gated behind a
 * typed confirmation: the user must type DELETE, not just click a button, so a
 * single misclick can never wipe the whole diary. See runDestructive / the
 * lock-destroy-confirm panel below.
 */

/**
 * Pure authentication gate — only rendered when a vault already exists.
 * Offers: unlock | forgot (hint → recovery code → erase as last resort) |
 * force-create (overwrite).
 */
export default function LockScreen() {
  const { t } = useTranslation();
  const {
    unlock,
    isUnlocking,
    resetVault,
    forceCreateVault,
    recoverVault,
    fetchHint,
    consumeHint,
    error,
    hint,
  } = useAuth();

  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  const [hintAnswer, setHintAnswer] = useState("");
  const [showHintAnswer, setShowHintAnswer] = useState(false);

  // 恢复码重置流程（v2，2026-10-24）：忘记密码 → 恢复码 → 新密码，数据零丢失
  const [recoveryCode, setRecoveryCode] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newPasswordConfirm, setNewPasswordConfirm] = useState("");
  const [newHintQuestion, setNewHintQuestion] = useState("");
  const [newHintAnswer, setNewHintAnswer] = useState("");

  // 强制创建流程（销毁旧保险箱）的表单状态，与上面的 newXxx 系列互不重名
  const [confirmPassword, setConfirmPassword] = useState("");
  const [hintQuestion, setHintQuestion] = useState("");

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
    setRecoveryCode("");
    setNewPassword("");
    setNewPasswordConfirm("");
    setNewHintQuestion("");
    setNewHintAnswer("");
    setLocalError(null);
  };

  // ── Unlock ────────────────────────────────────────────────────
  const handleUnlock = async (e: React.FormEvent) => {
    e.preventDefault();
    setLocalError(null);
    if (!password) return setLocalError(t("lock.enterPassword"));
    await unlock(password);
  };

  // ── Forgot → recall first (hint), then recovery code, erase last ──
  const handleForgot = async () => {
    setLocalError(null);
    await fetchHint();
    setMode("forgot");
  };

  // ── Recover: reset password via recovery code (keeps all data) ─
  const handleRecover = (e: React.FormEvent) => {
    e.preventDefault();
    setLocalError(null);
    if (!recoveryCode.trim()) return setLocalError(t("lock.recoverCode"));
    if (!newPassword) return setLocalError(t("lock.enterNewPassword"));
    if (newPassword.length < 8) return setLocalError(t("lock.minChars"));
    if (newPassword !== newPasswordConfirm) return setLocalError(t("lock.mismatch"));
    if (!newHintQuestion.trim()) return setLocalError(t("lock.setQuestion"));
    if (!newHintAnswer.trim()) return setLocalError(t("lock.setAnswer"));
    void recoverVault(
      recoveryCode.trim(),
      newPassword,
      newHintQuestion.trim(),
      newHintAnswer.trim(),
    )
      .then(() => {
        // 成功即已解锁（Rust 侧已置态）；新恢复码由 App 层的一次性保存卡展示
        clearAll();
      })
      .catch(() => {
        /* 错误已由 AuthContext 写入 state.error */
      });
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

        {/* FORGOT — recall (hint) first, recovery code second, erase last */}
        {mode === "forgot" && (
          <>
            <p className="lock-subtitle">{t("lock.forgotTitle")}</p>
            <div className="lock-form">
              <p className="lock-forgot-lead">{t("lock.forgotTryFirst")}</p>
              {hint ? (
                <div className="lock-hint-display">
                  <span className="lock-hint-q">Q:</span>
                  <span className="lock-hint-text">{hint}</span>
                </div>
              ) : (
                <p className="lock-forgot-lead">{t("lock.forgotNoQ")}</p>
              )}
              <button type="button" className="lock-btn" onClick={() => setMode("recover")}>
                {t("lock.forgotUseCode")}
              </button>
              <button type="button" className="lock-forgot" onClick={backToUnlock}>
                {t("lock.backToUnlock")}
              </button>
              <p className="lock-forgot-lead danger">{t("lock.forgotNoCode")}</p>
              <button
                type="button"
                className="lock-forgot danger"
                onClick={() => setMode(hint ? "reset" : "noHint")}
              >
                {hint ? t("lock.eraseReset") : t("lock.createErase")}
              </button>
            </div>
          </>
        )}

        {/* RECOVER — reset the password with the recovery code (v2) */}
        {mode === "recover" && (
          <>
            <p className="lock-subtitle">{t("lock.recoverTitle")}</p>
            <form onSubmit={handleRecover} className="lock-form">
              <input
                type="text"
                className="lock-input recovery-code-input"
                placeholder={t("lock.recoverCodePh")}
                value={recoveryCode}
                onChange={(e) => setRecoveryCode(e.target.value)}
                autoFocus
                spellCheck={false}
                autoCapitalize="characters"
              />
              <div className="lock-input-wrap">
                <input
                  type={showPassword ? "text" : "password"}
                  placeholder={t("lock.newPassword")}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="lock-input"
                />
                <button type="button" className="lock-visibility-toggle" onClick={() => setShowPassword((v) => !v)}>
                  {showPassword ? "◉" : "◎"}
                </button>
              </div>
              <input
                type={showPassword ? "text" : "password"}
                placeholder={t("lock.confirmNew")}
                value={newPasswordConfirm}
                onChange={(e) => setNewPasswordConfirm(e.target.value)}
                className="lock-input"
              />
              <input
                type="text"
                placeholder={t("lock.hintQuestion")}
                value={newHintQuestion}
                onChange={(e) => setNewHintQuestion(e.target.value)}
                className="lock-input"
              />
              <div className="lock-input-wrap">
                <input
                  type={showHintAnswer ? "text" : "password"}
                  placeholder={t("lock.hintAnswer")}
                  value={newHintAnswer}
                  onChange={(e) => setNewHintAnswer(e.target.value)}
                  className="lock-input"
                />
                <button type="button" className="lock-visibility-toggle" onClick={() => setShowHintAnswer((v) => !v)}>
                  {showHintAnswer ? "◉" : "◎"}
                </button>
              </div>
              <button type="submit" disabled={isUnlocking} className="lock-btn">
                {isUnlocking ? t("lock.pleaseWait") : t("lock.recoverSubmit")}
              </button>
              <button type="button" className="lock-cancel" onClick={() => setMode("forgot")}>
                {t("lock.backToUnlock")}
              </button>
            </form>
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
