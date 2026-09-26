import { useState, useRef, useEffect } from "react";
import { useAuth } from "../hooks/useAuth";

type Mode = "unlock" | "create" | "reset";

export default function LockScreen() {
  const {
    hasVault,
    initVault,
    unlock,
    isUnlocking,
    resetVault,
    fetchHint,
    error,
    hint,
  } = useAuth();

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  const [hintQuestion, setHintQuestion] = useState("");
  const [hintAnswer, setHintAnswer] = useState("");
  const [showHintAnswer, setShowHintAnswer] = useState(false);

  const [mode, setMode] = useState<Mode>(hasVault ? "unlock" : "create");
  const [localError, setLocalError] = useState<string | null>(null);

  const passwordRef = useRef<HTMLInputElement | null>(null);
  const answerRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    passwordRef.current?.focus();
  }, [mode]);

  const currentError = localError ?? error;

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

  const handleUnlock = async (e: React.FormEvent) => {
    e.preventDefault();
    setLocalError(null);
    if (!password) return setLocalError("Please enter your password.");
    await unlock(password);
  };

  const handleForgot = async () => {
    setLocalError(null);
    const h = await fetchHint();
    if (h) {
      setMode("reset");
    } else {
      setLocalError("No hint was set. Vault cannot be recovered.");
    }
  };

  const handleReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setLocalError(null);
    if (!hintAnswer.trim()) return setLocalError("Please enter your hint answer.");
    try {
      await resetVault(hintAnswer.trim());
      setMode("create");
      setPassword("");
      setConfirmPassword("");
      setHintAnswer("");
      setHintQuestion("");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setLocalError(msg || "Incorrect hint answer.");
    }
  };

  const switchToUnlock = () => {
    setMode("unlock");
    setHintAnswer("");
    setLocalError(null);
  };

  return (
    <div className="lock-screen">
      <div className="lock-card">
        <div className="brand-dot" />
        <h1 className="lock-title">Rocktier Journal</h1>

        {mode === "create" && (
          <>
            <p className="lock-subtitle">Create your vault</p>
            <form onSubmit={handleCreate} className="lock-form">
              <div className="lock-input-wrap">
                <input ref={passwordRef} type={showPassword ? "text" : "password"} placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} className="lock-input" aria-label="Password" />
                <button type="button" className="lock-visibility-toggle" onClick={() => setShowPassword((v) => !v)} aria-label={showPassword ? "Hide password" : "Show password"}>{showPassword ? "◉" : "◎"}</button>
              </div>
              <input type={showPassword ? "text" : "password"} placeholder="Confirm password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} className="lock-input" aria-label="Confirm password" />
              <div className="lock-hint-section">
                <input type="text" placeholder="Hint question (e.g. First pet's name?)" value={hintQuestion} onChange={(e) => setHintQuestion(e.target.value)} className="lock-input" aria-label="Hint question" />
                <input type="text" placeholder="Hint answer" value={hintAnswer} onChange={(e) => setHintAnswer(e.target.value)} className="lock-input" aria-label="Hint answer" />
              </div>
              <button type="submit" disabled={isUnlocking} className="lock-btn">{isUnlocking ? "Please wait…" : "Create Vault"}</button>
            </form>
            {password.length > 0 && <PasswordStrength password={password} />}
          </>
        )}

        {mode === "unlock" && (
          <>
            <p className="lock-subtitle">Enter password to unlock</p>
            <form onSubmit={handleUnlock} className="lock-form">
              <div className="lock-input-wrap">
                <input ref={passwordRef} type={showPassword ? "text" : "password"} placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} className="lock-input" aria-label="Password" autoFocus />
                <button type="button" className="lock-visibility-toggle" onClick={() => setShowPassword((v) => !v)} aria-label={showPassword ? "Hide password" : "Show password"}>{showPassword ? "◉" : "◎"}</button>
              </div>
              <button type="submit" disabled={isUnlocking} className="lock-btn">{isUnlocking ? "Please wait…" : "Unlock"}</button>
            </form>
            <button type="button" className="lock-forgot" onClick={handleForgot}>Forgot password?</button>
          </>
        )}

        {mode === "reset" && (
          <>
            <p className="lock-subtitle">Answer your hint question</p>
            <form onSubmit={handleReset} className="lock-form">
              <div className="lock-hint-display">
                <span className="lock-hint-q">Q:</span>
                <span className="lock-hint-text">{hint ?? "—"}</span>
              </div>
              <div className="lock-input-wrap">
                <input ref={answerRef} type={showHintAnswer ? "text" : "password"} placeholder="Your answer" value={hintAnswer} onChange={(e) => setHintAnswer(e.target.value)} className="lock-input" aria-label="Hint answer" autoFocus />
                <button type="button" className="lock-visibility-toggle" onClick={() => setShowHintAnswer((v) => !v)} aria-label={showHintAnswer ? "Hide answer" : "Show answer"}>{showHintAnswer ? "◉" : "◎"}</button>
              </div>
              <button type="submit" disabled={isUnlocking} className="lock-btn danger">{isUnlocking ? "Please wait…" : "Erase & Reset Vault"}</button>
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
