import { useState, useRef, useEffect } from "react";
import { useAuth } from "../hooks/AuthContext";

type Mode = "unlock" | "create" | "reset" | "forceCreate";

export default function LockScreen() {
  const {
    hasVault,
    initVault,
    unlock,
    isUnlocking,
    resetVault,
    forceCreateVault,
    fetchHint,
    consumeHint,
    error,
    hint,
  } = useAuth();

  // Fields
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [hintQuestion, setHintQuestion] = useState("");
  const [hintAnswer, setHintAnswer] = useState("");
  const [showHintAnswer, setShowHintAnswer] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  // Initial mode from vault presence
  const [mode, setMode] = useState<Mode>(hasVault ? "unlock" : "create");

  const passwordRef = useRef<HTMLInputElement | null>(null);
  const answerRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    passwordRef.current?.focus();
  }, [mode]);

  // If hasVault changes (e.g. deleted via resetVault), sync mode
  useEffect(() => {
    if (!hasVault && (mode === "unlock" || mode === "reset")) {
      setMode("create");
      setPassword("");
      setHintAnswer("");
    }
  }, [hasVault, mode]);

  const currentError = localError ?? error;

  const clearAll = () => {
    setPassword("");
    setConfirmPassword("");
    setHintQuestion("");
    setHintAnswer("");
    setLocalError(null);
  };

  // ── Create (fresh vault) ─────────────────────────────────────
  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setLocalError(null);
    if (!password) return setLocalError("Please enter a password.");
    if (password.length < 8) return setLocalError("Password must be at least 8 characters.");
    if (password !== confirmPassword) return setLocalError("Passwords do not match.");
    if (!hintQuestion.trim()) return setLocalError("Please set a hint question.");
    if (!hintAnswer.trim()) return setLocalError("Please set a hint answer.");
    await initVault(password, hintQuestion.trim(), hintAnswer.trim());
  };

  // ── Force-create (overwrite existing) ────────────────────────
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

  // ── Unlock ────────────────────────────────────────────────────
  const handleUnlock = async (e: React.FormEvent) => {
    e.preventDefault();
    setLocalError(null);
    if (!password) return setLocalError("Please enter your password.");
    await unlock(password);
  };

  // ── Forgot password: fetch hint, branch on result ─────────────
  const handleForgot = async () => {
    setLocalError(null);
    const h = await fetchHint();
    if (h && h.trim().length > 0) {
      setMode("reset");
    } else {
      // No hint — vault is unrecoverable; offer force create
      setLocalError("No hint set on this vault. You can overwrite with a new vault (all old data lost).");
      setMode("forceCreate");
      consumeHint();
    }
  };

  // ── Reset with hint answer ────────────────────────────────────
  const handleReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setLocalError(null);
    if (!hintAnswer.trim()) return setLocalError("Please enter your hint answer.");
    try {
      await resetVault(hintAnswer.trim());
      // After reset, switch to create
      setMode("create");
      clearAll();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setLocalError(msg || "Incorrect hint answer.");
    }
  };

  const switchToUnlock = () => {
    setMode("unlock");
    clearAll();
    consumeHint();
  };

  const switchToForceCreate = () => {
    setMode("forceCreate");
    clearAll();
  };

  // ── Render ────────────────────────────────────────────────────
  const visibilityBtn = (show: boolean, fn: (v: boolean) => void) => (
    <button type="button" className="lock-visibility-toggle" onClick={() => fn(!show)} aria-label="">
      {show ? "◉" : "◎"}
    </button>
  );

  return (
    <div className="lock-screen">
      <div className="lock-card">
        <div className="brand-dot" />
        <h1 className="lock-title">Rocktier Journal</h1>

        {/* CREATE (fresh) */}
        {mode === "create" && (
          <>
            <p className="lock-subtitle">Create your vault</p>
            <form onSubmit={handleCreate} className="lock-form">
              <div className="lock-input-wrap">
                <input ref={passwordRef} type={showPassword ? "text" : "password"} placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} className="lock-input" />
                {visibilityBtn(showPassword, setShowPassword)}
              </div>
              <input type={showPassword ? "text" : "password"} placeholder="Confirm password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} className="lock-input" />
              <div className="lock-hint-section">
                <input type="text" placeholder="Hint question (e.g. First pet's name?)" value={hintQuestion} onChange={(e) => setHintQuestion(e.target.value)} className="lock-input" />
                <input type="text" placeholder="Hint answer" value={hintAnswer} onChange={(e) => setHintAnswer(e.target.value)} className="lock-input" />
              </div>
              <button type="submit" disabled={isUnlocking} className="lock-btn">{isUnlocking ? "Please wait…" : "Create Vault"}</button>
            </form>
            {password.length > 0 && <PasswordStrength password={password} />}
          </>
        )}

        {/* UNLOCK */}
        {mode === "unlock" && (
          <>
            <p className="lock-subtitle">Enter password to unlock</p>
            <form onSubmit={handleUnlock} className="lock-form">
              <div className="lock-input-wrap">
                <input ref={passwordRef} type={showPassword ? "text" : "password"} placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} className="lock-input" autoFocus />
                {visibilityBtn(showPassword, setShowPassword)}
              </div>
              <button type="submit" disabled={isUnlocking} className="lock-btn">{isUnlocking ? "Please wait…" : "Unlock"}</button>
            </form>
            <div className="lock-secondary-actions">
              <button type="button" className="lock-forgot" onClick={handleForgot}>Forgot password?</button>
              <button type="button" className="lock-forgot danger" onClick={switchToForceCreate}>Create new vault (erase old)</button>
            </div>
          </>
        )}

        {/* RESET via hint answer */}
        {mode === "reset" && (
          <>
            <p className="lock-subtitle">Answer your hint question</p>
            <form onSubmit={handleReset} className="lock-form">
              <div className="lock-hint-display">
                <span className="lock-hint-q">Q:</span>
                <span className="lock-hint-text">{hint ?? "—"}</span>
              </div>
              <div className="lock-input-wrap">
                <input ref={answerRef} type={showHintAnswer ? "text" : "password"} placeholder="Your answer" value={hintAnswer} onChange={(e) => setHintAnswer(e.target.value)} className="lock-input" autoFocus />
                {visibilityBtn(showHintAnswer, setShowHintAnswer)}
              </div>
              <button type="submit" disabled={isUnlocking} className="lock-btn danger">{isUnlocking ? "Please wait…" : "Erase & Reset Vault"}</button>
              <button type="button" className="lock-cancel" onClick={switchToUnlock}>← Back to unlock</button>
            </form>
          </>
        )}

        {/* FORCE CREATE (overwrite, usually triggered by forgot with no hint) */}
        {mode === "forceCreate" && (
          <>
            <p className="lock-subtitle">Create new vault (overwrites old data)</p>
            <form onSubmit={handleForceCreate} className="lock-form">
              <div className="lock-input-wrap">
                <input ref={passwordRef} type={showPassword ? "text" : "password"} placeholder="New password" value={password} onChange={(e) => setPassword(e.target.value)} className="lock-input" autoFocus />
                {visibilityBtn(showPassword, setShowPassword)}
              </div>
              <input type={showPassword ? "text" : "password"} placeholder="Confirm new password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} className="lock-input" />
              <div className="lock-hint-section">
                <input type="text" placeholder="Hint question (e.g. First pet's name?)" value={hintQuestion} onChange={(e) => setHintQuestion(e.target.value)} className="lock-input" />
                <input type="text" placeholder="Hint answer" value={hintAnswer} onChange={(e) => setHintAnswer(e.target.value)} className="lock-input" />
              </div>
              <button type="submit" disabled={isUnlocking} className="lock-btn danger">{isUnlocking ? "Please wait…" : "Overwrite & Create"}</button>
              <button type="button" className="lock-cancel" onClick={switchToUnlock}>← Back to unlock</button>
            </form>
          </>
        )}

        {currentError && <p className="lock-error">{currentError}</p>}
      </div>
    </div>
  );
}

function PasswordStrength({ password }: { password: string }) {
  let score = 0;
  if (password.length >= 8) score++;
  if (password.length >= 12) score++;
  if (/[A-Z]/.test(password) && /[a-z]/.test(password)) score++;
  if (/\d/.test(password)) score++;
  if (/[^A-Za-z0-9]/.test(password)) score++;
  const label = score <= 1 ? "Weak" : score <= 3 ? "Medium" : "Strong";
  const cls = score <= 1 ? "weak" : score <= 3 ? "medium" : "strong";
  return (
    <div className="password-strength">
      <div className="password-strength-bar">
        <div className={`password-strength-fill ${cls}`} style={{ width: `${(score / 5) * 100}%` }} />
      </div>
      <span className={`password-strength-label ${cls}`}>{label}</span>
    </div>
  );
}
