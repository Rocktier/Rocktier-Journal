import { useState, useRef, useEffect } from "react";
import { useAuth } from "../hooks/AuthContext";

type Mode = "unlock" | "reset" | "forceCreate";

/**
 * Pure authentication gate — only rendered when a vault already exists.
 * Offers: unlock | forgot (hint answer → reset) | force-create (overwrite).
 */
export default function LockScreen() {
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
    if (!password) return setLocalError("Please enter your password.");
    await unlock(password);
  };

  // ── Forgot → fetch hint, branch ───────────────────────────────
  const handleForgot = async () => {
    setLocalError(null);
    const h = await fetchHint();
    if (h && h.trim().length > 0) {
      setMode("reset");
    } else {
      setLocalError(
        "No hint was set on this vault. It cannot be recovered. " +
        "Use 'Create new vault' below to start fresh (old data is erased)."
      );
      setMode("forceCreate");
      consumeHint();
    }
  };

  // ── Reset via hint answer ─────────────────────────────────────
  const handleReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setLocalError(null);
    if (!hintAnswer.trim()) return setLocalError("Please enter your hint answer.");
    try {
      await resetVault(hintAnswer.trim());
      // After reset, App.tsx sees hasVault=false → switches to SetupScreen
      clearAll();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setLocalError(msg || "Incorrect hint answer.");
    }
  };

  // ── Force-create (overwrite) ──────────────────────────────────
  const handleForceCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setLocalError(null);
    if (!password) return setLocalError("Please enter a password.");
    if (password.length < 8) return setLocalError("Password must be at least 8 characters.");
    if (password !== confirmPassword) return setLocalError("Passwords do not match.");
    if (!hintQuestion.trim()) return setLocalError("Please set a hint question.");
    if (!hintAnswer.trim()) return setLocalError("Please set a hint answer.");
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
        <div className="brand-dot" />
        <h1 className="lock-title">Rocktier Journal</h1>

        {/* UNLOCK */}
        {mode === "unlock" && (
          <>
            <p className="lock-subtitle">Enter password to unlock</p>
            <form onSubmit={handleUnlock} className="lock-form">
              <div className="lock-input-wrap">
                <input
                  ref={passwordRef}
                  type={showPassword ? "text" : "password"}
                  placeholder="Password"
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
                {isUnlocking ? "Please wait…" : "Unlock"}
              </button>
            </form>
            <div className="lock-secondary-actions">
              <button type="button" className="lock-forgot" onClick={handleForgot}>
                Forgot password?
              </button>
              <button type="button" className="lock-forgot danger" onClick={() => { setMode("forceCreate"); clearAll(); }}>
                Create new vault (erases old)
              </button>
            </div>
          </>
        )}

        {/* RESET via hint */}
        {mode === "reset" && (
          <>
            <p className="lock-subtitle">Answer your hint question</p>
            <form onSubmit={handleReset} className="lock-form">
              <div className="lock-hint-display">
                <span className="lock-hint-q">Q:</span>
                <span className="lock-hint-text">{hint ?? "—"}</span>
              </div>
              <div className="lock-input-wrap">
                <input
                  ref={answerRef}
                  type={showHintAnswer ? "text" : "password"}
                  placeholder="Your answer"
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
                {isUnlocking ? "Please wait…" : "Erase & Reset Vault"}
              </button>
              <button type="button" className="lock-cancel" onClick={backToUnlock}>← Back to unlock</button>
            </form>
          </>
        )}

        {/* FORCE CREATE */}
        {mode === "forceCreate" && (
          <>
            <p className="lock-subtitle">Create new vault (overwrites old data)</p>
            <form onSubmit={handleForceCreate} className="lock-form">
              <div className="lock-input-wrap">
                <input
                  ref={passwordRef}
                  type={showPassword ? "text" : "password"}
                  placeholder="New password"
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
                placeholder="Confirm new password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="lock-input"
              />
              <div className="lock-hint-section">
                <input
                  type="text"
                  placeholder="Hint question (e.g. First pet's name?)"
                  value={hintQuestion}
                  onChange={(e) => setHintQuestion(e.target.value)}
                  className="lock-input"
                />
                <input
                  type="text"
                  placeholder="Hint answer"
                  value={hintAnswer}
                  onChange={(e) => setHintAnswer(e.target.value)}
                  className="lock-input"
                />
              </div>
              <button type="submit" disabled={isUnlocking} className="lock-btn danger">
                {isUnlocking ? "Please wait…" : "Overwrite & Create"}
              </button>
              <button type="button" className="lock-cancel" onClick={backToUnlock}>← Back to unlock</button>
            </form>
          </>
        )}

        {currentError && <p className="lock-error">{currentError}</p>}
      </div>
    </div>
  );
}
