import { useState, useRef, useEffect } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { useAuth } from "../hooks/AuthContext";
import { useTranslation } from "../hooks/useTranslation";

/**
 * First-time vault setup: collect password + hint Q&A, then create vault.
 * Only rendered when no vault exists on disk.
 */
export default function SetupScreen() {
  const { t } = useTranslation();
  const { initVault, restoreVault, isUnlocking, error } = useAuth();

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [hintQuestion, setHintQuestion] = useState("");
  const [hintAnswer, setHintAnswer] = useState("");
  const [showHintAnswer, setShowHintAnswer] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  const [restoreMode, setRestoreMode] = useState(false);
  const [restoreFile, setRestoreFile] = useState("");
  const [restorePassword, setRestorePassword] = useState("");

  const handlePickBackup = async () => {
    try {
      const selected = await open({
        multiple: false,
        filters: [{ name: "Journal Backup", extensions: ["zip"] }],
      });
      if (typeof selected === "string") setRestoreFile(selected);
    } catch {
      /* dialog cancelled */
    }
  };

  const handleRestore = async (e: React.FormEvent) => {
    e.preventDefault();
    setLocalError(null);
    if (!restoreFile) return setLocalError(t("setup.chooseFile"));
    if (!restorePassword) return setLocalError(t("setup.restorePassword"));
    await restoreVault(restoreFile, restorePassword);
  };

  const passwordRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    passwordRef.current?.focus();
  }, []);

  const currentError = localError ?? error;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLocalError(null);

    if (!password) return setLocalError(t("lock.enterNewPassword"));
    if (password.length < 8) return setLocalError(t("lock.minChars"));
    if (password !== confirmPassword) return setLocalError(t("lock.mismatch"));
    if (!hintQuestion.trim()) return setLocalError(t("setup.needQuestion"));
    if (!hintAnswer.trim()) return setLocalError(t("lock.setAnswer"));

    await initVault(password, hintQuestion.trim(), hintAnswer.trim());
  };

  return (
    <div className="lock-screen">
      <div className="lock-card">
        <div className="brand-dot" />
        <h1 className="lock-title">{t("app.name")}</h1>
        <p className="lock-subtitle">{t("lock.create")}</p>

        <form onSubmit={handleSubmit} className="lock-form">
          <div className="lock-input-wrap">
            <input
              ref={passwordRef}
              type={showPassword ? "text" : "password"}
              placeholder={t("lock.password")}
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
            placeholder={t("lock.confirm")}
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
            <div className="lock-input-wrap">
              <input
                type={showHintAnswer ? "text" : "password"}
                placeholder={t("lock.hintAnswer")}
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
            {isUnlocking ? t("lock.pleaseWait") : t("lock.createBtn")}
          </button>
        </form>

        <button type="button" className="lock-forgot" onClick={() => setRestoreMode((v) => !v)}>
          {restoreMode ? t("common.cancel") : t("setup.restore")}
        </button>

        {restoreMode && (
          <form onSubmit={handleRestore} className="lock-form">
            <p className="lock-subtitle">{t("setup.restoreHint")}</p>
            <button type="button" className="lock-btn" onClick={handlePickBackup}>
              {restoreFile ? restoreFile.split(/[\\/]/).pop() : t("setup.chooseFile")}
            </button>
            <input
              type={showPassword ? "text" : "password"}
              placeholder={t("setup.restorePassword")}
              value={restorePassword}
              onChange={(e) => setRestorePassword(e.target.value)}
              className="lock-input"
            />
            <button type="submit" disabled={isUnlocking} className="lock-btn danger">
              {isUnlocking ? t("lock.pleaseWait") : t("setup.restoreBtn")}
            </button>
          </form>
        )}

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
  const { t } = useTranslation();
  const label = score <= 1 ? t("setup.weak") : score <= 3 ? t("setup.medium") : t("setup.strong");
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
