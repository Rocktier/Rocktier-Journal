/**
 * 保险箱错误文案本地化 —— 把 Rust 侧返回的英文原文映射为当前语言的措辞。
 *
 * 为什么需要：Rust 的 vault 命令把错误**拍平为英文字符串**（`Err("Incorrect
 * password")` 等 14 处），AuthContext 四处 `catch` 都直接 `String(e)` 存进
 * state，LockScreen 再 `{currentError}` 原样显示。结果：中文用户在**解锁这个
 * 最关键的界面**全程看英文。
 *
 * 为什么在 AuthContext 收口而不是改 Rust：那 4 处 catch 模式完全相同，在这里
 * 换成一个函数即可；改 Rust 要动 14 个返回点，改动面大得多，而且新增错误就
 * 又漏一个。未知文案回退原文 —— 规范要求失败时展示底层真实错误文本。
 */

/** Rust 错误原文 → i18n 键。键须在 i18n/index.ts 的 en-US 与 zh-CN 两侧都存在。 */
const EXACT: Record<string, string> = {
  'Incorrect password': 'vault.incorrectPassword',
  'Password must be at least 8 characters': 'vault.passwordTooShort',
  'Vault already exists': 'vault.alreadyExists',
  'Vault does not exist. Please create one first.': 'vault.doesNotExist',
  'Hint question is required': 'vault.hintQuestionRequired',
  'Hint answer is required': 'vault.hintAnswerRequired',
  'Hint answer required to delete this vault': 'vault.hintRequiredToDelete',
  'Incorrect hint answer': 'vault.incorrectHint',
  'Invalid encrypted data: too short': 'vault.corruptEntry',
  'Invalid .rkd file format': 'vault.badEntryFormat',
  'Salt file corrupted': 'vault.saltCorrupted',
  'Entry not found': 'vault.entryNotFound',
  'No entries to export': 'vault.nothingToExport',
};

/** 归一化匹配：忽略大小写、标点与多余空白。 */
const NORMALIZED: Record<string, string> = {};
for (const [raw, key] of Object.entries(EXACT)) {
  NORMALIZED[normalize(raw)] = key;
}

function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/[.,;:!?'"()]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * 返回本地化后的错误文案。
 *
 * @param raw    Rust 返回的原始错误串
 * @param lookup i18n 的取值函数（通常是 `t`）；找不到键时返回原串
 */
export function localizeVaultError(raw: string, lookup: (key: string) => string): string {
  if (!raw) return raw;

  const key = EXACT[raw] ?? NORMALIZED[normalize(raw)];
  if (!key) return raw; // 未知文案 → 原样显示底层真实错误

  const translated = lookup(key);
  return translated && translated !== key ? translated : raw;
}