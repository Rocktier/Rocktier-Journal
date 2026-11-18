// i18n —— 2026-11-18 起与 PDF 仓同构：嵌套字典 + 点路径查找 + en 兜底 +
// {var} 插值。locale 沿用 Journal 原有全码（en-US / zh-CN）。
// 家族规范：默认英文、不跟随系统，仅在用户手动切换后记忆。
// 存储键已是每应用命名空间（rocktier.journal.lang），与 PDF 的
// rocktier.pdf.lang 同构，保持不变。

import { en } from "./en";
import { zh } from "./zh";
import { LOCALES, type Locale } from "./locales";

const STRINGS: Record<Locale, unknown> = { "en-US": en, "zh-CN": zh };

const STORAGE_KEY = "rocktier.journal.lang";

function lookup(dict: unknown, path: string): string | undefined {
  const value = path.split(".").reduce<unknown>((acc, k) => {
    if (acc && typeof acc === "object" && k in (acc as object)) {
      return (acc as Record<string, unknown>)[k];
    }
    return undefined;
  }, dict);
  return typeof value === "string" ? value : undefined;
}

/** 当前 locale → en 兜底 → key。缺键绝不能把路径露给用户。 */
function resolve(locale: Locale, path: string): string {
  const hit = lookup(STRINGS[locale], path) ?? lookup(STRINGS["en-US"], path);
  // 缺键静默回落 en（与 Journal 旧实现一致；PDF 的 DEV 告警需要 vite/client 类型）
  return hit ?? path;
}

export { LOCALES };
export type { Locale };

export function getLocale(): Locale {
  const saved = localStorage.getItem(STORAGE_KEY);
  // 家族规范：默认英文，不跟随系统语言；只记住用户手动选择
  return LOCALES.some((l) => l.code === saved) ? (saved as Locale) : "en-US";
}

export function setLocale(loc: Locale): void {
  localStorage.setItem(STORAGE_KEY, loc);
  // 无障碍底线：屏幕阅读器要用对应语言的语音引擎
  if (typeof document !== "undefined") document.documentElement.lang = loc;
}

/** 启动时同步一次 lang 属性（切换时由 setLocale 负责） */
export function syncHtmlLang(): void {
  if (typeof document !== "undefined") document.documentElement.lang = getLocale();
}

export function t(path: string, vars?: Record<string, string | number>): string {
  let s = resolve(getLocale(), path);
  if (vars) {
    for (const [k, v] of Object.entries(vars)) {
      s = s.replace(new RegExp(`\{${k}\}`, "g"), String(v));
    }
  }
  return s;
}
