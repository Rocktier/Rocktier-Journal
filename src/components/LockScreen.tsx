import { useState, useRef, useEffect } from "react";
import { useAuth } from "../hooks/useAuth";

export default function LockScreen() {
  const { hasVault, initVault, unlock, isUnlocking, resetVault, error } = useAuth();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);
  const passwordRef = useRef<HTMLInputElement | null>(null);

  const isCreating = !hasVault;

  useEffect(() => {
    passwordRef.current?.focus();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLocalError(null);
    setConfirmReset(false);

    if (!password) {
      setLocalError("Please enter a password.");
      return;
    }

    if (isCreating) {
      if (password.length < 8) {
        setLocalError("Password must be at least 8 characters.");
        return;
      }
      if (password !== confirmPassword) {
        setLocalError("Passwords do not match.");
        return;
      }
      await initVault(password);
    } else {
      await unlock(password);
    }
  };

  const handleReset = async () => {
    setLocalError(null);
    if (!confirmReset) {
      setConfirmReset(true);
      return;
    }
    await resetVault();
    setPassword("");
    setConfirmPassword("");
    setConfirmReset(false);
  };

  return (
    <div className="lock-screen">
      <div className="lock-card">
        <div className="brand-dot" />
        <h1 className="lock-title">Rocktier Journal</h1>
        <p className="lock-subtitle">
          {isCreating ? "Create your vault" : "Enter password to unlock"}
        </p>

        <form onSubmit={handleSubmit} className="lock-form">
          <div className="lock-input-wrap">
            <input
              ref={passwordRef}
              type={showPassword ? "text" : "password"}
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="lock-input"
              aria-label="Password"
              autoFocus
            />
            <button
              type="button"
              className="lock-visibility-toggle"
              onClick={() => setShowPassword((v) => !v)}
              aria-label={showPassword ? "Hide password" : "Show password"}
            >
              {showPassword ? "◉" : "◎"}
            </button>
          </div>

          {isCreating && (
            <input
              type={showPassword ? "text" : "password"}
              placeholder="Confirm password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="lock-input"
              aria-label="Confirm password"
            />
          )}

          <button type="submit" disabled={isUnlocking} className="lock-btn">
            {isUnlocking
              ? "Please wait…"
              : isCreating
                ? "Create Vault"
                : "Unlock"}
          </button>
        </form>

        <button
          type="button"
          className={`lock-forgot${confirmReset ? " danger" : ""}`}
          onClick={handleReset}
        >
          {confirmReset
            ? "⚠️ Click again to erase diary & reset"
            : "Forgot password?"}
        </button>

        {(error || localError) && (
          <p className="lock-error">{localError ?? error}</p>
        )}

        {isCreating && password.length > 0 && (
          <PasswordStrength password={password} />
        )}
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
