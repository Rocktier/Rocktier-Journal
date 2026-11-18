/* 家族标准语言表 —— 单一真源（与 PDF 仓同构）。Journal 沿用全码 locale：
 * 原有约定，Rust 侧按主 subtag 匹配。 */

export const LOCALES = [
  { code: "en-US", endonym: "English" },
  { code: "zh-CN", endonym: "中文" },
] as const;

export type Locale = (typeof LOCALES)[number]["code"];
