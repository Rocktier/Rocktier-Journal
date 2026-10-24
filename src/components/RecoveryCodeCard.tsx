import { useState } from "react";
import { useTranslation } from "../hooks/useTranslation";

/**
 * 一次性恢复码保存卡（v2 信封加密，2026-10-24）。
 *
 * 明文恢复码只存在于四个时刻：创建保险箱、覆盖创建、v1→v2 迁移解锁、
 * 恢复码重置/重新生成。信封（vault.recovery）只能被解、不能被读，所以 UI
 * 必须当场展示，用户关闭卡片后 state 里的码即消失。
 *
 * 卡片是阻断式 overlay：不点「我已保存」不能继续——数据安全的代价是
 * 一次不可跳过仪式。真没保存的用户，可以在设置里重新生成（旧码作废）。
 */
export default function RecoveryCodeCard({
  code,
  regenerated = false,
  onDismiss,
}: {
  code: string;
  /** true = 重新生成的码（文案切到「新码已生成，旧码作废」） */
  regenerated?: boolean;
  onDismiss: () => void;
}) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* 剪贴板不可用（权限/环境）：码就在屏幕上，用户可手动选取 */
    }
  };

  return (
    <div className="recovery-overlay" role="dialog" aria-modal="true">
      <div className="recovery-card">
        <h2 className="recovery-title">
          {regenerated ? t("recovery.regenerated") : t("recovery.title")}
        </h2>
        <p className="recovery-subtitle">
          {regenerated ? t("recovery.regeneratedHint") : t("recovery.subtitle")}
        </p>

        <div className="recovery-code-box">
          <code className="recovery-code">{code}</code>
          <button type="button" className="recovery-copy" onClick={handleCopy}>
            {copied ? t("recovery.copied") : t("recovery.copy")}
          </button>
        </div>

        <div className="recovery-notes">
          <p>{t("recovery.what")}</p>
          <p>{t("recovery.where")}</p>
          <p className="recovery-threat">{t("recovery.threat")}</p>
        </div>

        <button type="button" className="recovery-save-btn" onClick={onDismiss}>
          {t("recovery.saved")}
        </button>
      </div>
    </div>
  );
}
