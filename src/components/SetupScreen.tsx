import { useState, useRef, useEffect } from "react";
import { useAuth } from "../hooks/AuthContext";

/**
 * First-time vault setup: collect password + hint Q&A, then create vault.
 * Only rendered when no vault exists on disk.
 */
export default function SetupScreen() {
  const { initVault, isUnlocking, error } = useAuth();

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [hintQuestion, setHintQuestion] = useState("");
  const [hintAnswer, setHintAnswer] = useState("");
  const [showHintAnswer, setShowHintAnswer] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  const passwordRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    passwordRef.current?.focus();
  }, []);

  const currentError = localError ?? error;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLocalError(null);

    if (!password) return setLocalError("Please enter a password.");
    if (password.length < 8) return setLocalError("Password must be at least 8 characters.");
    if (password !== confirmPassword) return setLocalError("Passwords do not match.");
    if (!hintQuestion.trim()) return setLocalError("Please set a hint question (used for password recovery).");
    if (!hintAnswer.trim()) return setLocalError("Please set a hint answer.");

    await initVault(password, hintQuestion.trim(), hintAnswer.trim());
  };

  return (
    <div className="lock-screen">
      <div className="lock-card">
        <div className="brand-dot" />
        <h1 className="lock-title">Rocktier Journal</h1>
        <p className="lock-subtitle">Create your vault</p>

        <form onSubmit={handleSubmit} className="lock-form">
          <div className="lock-input-wrap">
            <input
              ref={passwordRef}
              type={showPassword ? "text" : "password"}
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="lock-input"
            />
            <button
              type="button"
              className="lock-visibility-toggle"
              onClick={() => setShowPassword((v) => !v)}
            >
              {showPassword ? "◉" : "◎"}
            </button>
          </div>

          <input
            type={showPassword ? "text" : "password"}
            placeholder="Confirm password"
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
            <div className="lock-input-wrap">
              <input
                type={showHintAnswer ? "text" : "password"}
                placeholder="Hint answer"
                value={hintAnswer}
                onChange={(e) => setHintAnswer(e.target.value)}
                className="lock-input"
              />
              <button
                type="button"
                className="lock-visibility-toggle"
                onClick={() => setShowHintAnswer((v) => !v)}
              >
                {showHintAnswer ? "◉" : "◎"}
              </button>
            </div>
          </div>

          <button type="submit" disabled={isUnlocking} className="lock-btn">
            {isUnlocking ? "Please wait…" : "Create Vault"}
          </button>
        </form>

        {password.length > 0 && <PasswordStrength password={password} />}
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
