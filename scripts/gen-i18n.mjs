#!/usr/bin/env node
/* Journal 多语言生成器。
 *
 * ── 家族第六种（也是最特殊的一种）i18n 形状 ──
 *   PDF     嵌套，每语言一个对象，键是裸标识符
 *   CAD     扁平，每语言一个 Record，键是裸标识符
 *   Sign    每个键内联所有语言
 *   MD      嵌套，每语言一个对象，键是**带引号的字符串**
 *   **Journal 一个对象装所有语言**：`STRINGS: Record<Locale, Record<key, string>>`
 *
 * 两个额外差异：
 * ① locale 用**全码**（`en-US`/`zh-CN`），不是裸语言码（`en`/`zh`）
 * ② 字典是**扁平一层**（不是嵌套），键带引号
 *
 * 所以输出到 `src/i18n/<locale>.ts`，再由 index.ts 组装进 STRINGS。
 *
 * ── 两道硬校验（与其他产品同一套） ──
 * ① 缺键即拒绝生成 —— 不产出「界面一半英文」的包
 * ② 占位符逐字对齐 —— 丢了 {n} 界面上会直接露出来
 *
 * 用法：node scripts/gen-i18n.mjs [--lang ja]
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = process.env.ROCKTIER_ROOT || join(HERE, "..", "..", "..", "..");
const GLOSSARY = join(REPO, "docs", "rocktier", "i18n", "glossary.json");
const INDEX = join(HERE, "..", "src", "i18n", "index.ts");

/* locale = 语言码 + 区域码，与 Journal 原有的 en-US / zh-CN 同构。
   缺区域码时 Rust 侧按主 subtag 匹配，这里保持一致：日/韩/德等用
   常规区域码，阿拉伯语用 arabic 区域。 */
const LANGS = [
  { lang: "ja", locale: "ja-JP" },
  { lang: "ko", locale: "ko-KR" },
  { lang: "de", locale: "de-DE" },
  { lang: "es", locale: "es-ES" },
  { lang: "pt", locale: "pt-BR" },
  { lang: "ar", locale: "ar-SA" },
];

const args = process.argv.slice(2);
const only = args.includes("--lang") ? args[args.indexOf("--lang") + 1] : null;

if (!existsSync(GLOSSARY)) {
  console.error(`  ❌ 找不到家族术语表: ${GLOSSARY}\n     设 ROCKTIER_ROOT 指向家族根`);
  process.exit(2);
}
const G = JSON.parse(readFileSync(GLOSSARY, "utf8"));
const approved = new Map();
for (const [, loc] of Object.entries(G.terms)) {
  const en = loc.en?.value;
  if (!en) continue;
  const pack = {};
  for (const { lang } of LANGS) if (loc[lang]?.value) pack[lang] = loc[lang].value;
  if (Object.keys(pack).length) approved.set(en, pack);
}
console.error(`  术语表: ${approved.size} 条英文有家族批准译法`);

/* 抽现有 en-US 块 —— 用括号配对定位，不靠正则猜嵌套。 */
const src = readFileSync(INDEX, "utf8");
const at = src.indexOf('"en-US": {');
if (at < 0) {
  console.error('  ❌ 找不到 `"en-US": {` —— 生成器与源码脱节');
  process.exit(2);
}
let depth = 0, end = -1;
for (let i = src.indexOf("{", at); i < src.length; i++) {
  if (src[i] === "{") depth++;
  else if (src[i] === "}") { depth--; if (depth === 0) { end = i; break; } }
}
if (end < 0) { console.error("  ❌ en-US 花括号不配对"); process.exit(2); }
const enBody = src.slice(src.indexOf("{", at) + 1, end);

/* 扁平一层，所以逐条抽 `key: "value"`。 */
const EN = new Map();
for (const m of enBody.matchAll(/"([^"]+)":\s*"((?:\\.|[^"\\])*)"/g)) {
  EN.set(m[1], JSON.parse(`"${m[2]}"`));
}
if (!EN.size) { console.error("  ❌ 没从 en-US 抽到任何条目"); process.exit(2); }
console.error(`  en-US: ${EN.size} 个键`);

let missingTotal = 0;
const built = new Map(); // locale -> Map<key, string>

for (const { lang, locale } of LANGS.filter((l) => !only || l.lang === only)) {
  let ctx = {};
  try {
    ctx = (await import(`./i18n/${lang}.mjs`)).default || {};
  } catch (e) {
    /* 不要静默吞：空 catch 会把「译文表有语法错误」伪装成「缺 N 条译文」，
       我据此在错方向上找了很久（Sign 阶段踩过）。区分两种情况。 */
    if (e && e.code === "ERR_MODULE_NOT_FOUND") {
      console.error(`     (scripts/i18n/${lang}.mjs 尚未创建)`);
    } else {
      console.error(`  ❌ scripts/i18n/${lang}.mjs 无法导入: ${String(e.message).split("\n")[0]}`);
      missingTotal++;
      continue;
    }
  }
  const out = new Map();
  const missing = [];
  for (const [k, en] of EN) {
    const term = approved.get(en)?.[lang];
    const v = term ?? (typeof ctx[k] === "string" ? ctx[k] : null);
    if (v === null) { missing.push(`${k} = ${en.slice(0, 46)}`); continue; }
    const want = [...en.matchAll(/\{(\w+)\}/g)].map((x) => x[1]).sort().join(",");
    const got = [...v.matchAll(/\{(\w+)\}/g)].map((x) => x[1]).sort().join(",");
    if (want !== got) { missing.push(`${k} — 占位符不符（源 {${want}} / 译文 {${got}}）`); continue; }
    out.set(k, v);
  }
  if (missing.length) {
    missingTotal += missing.length;
    console.error(`\n  ⚠️ ${lang}: 缺 ${missing.length} 条`);
    missing.forEach((m) => console.error(`      ${m}`));
    continue;
  }
  built.set(locale, out);
  console.error(`  ✅ ${lang} (${locale}): ${out.size} 条齐全`);
}

if (missingTotal || !built.size) {
  console.error(`\n  ❌ 共 ${missingTotal} 条缺译文。补齐后重跑。\n`);
  process.exit(1);
}

const q = (s) => JSON.stringify(s);

/* 写每个 locale 一个文件 —— 与 PDF/CAD/MD 一致的「旁挂文件」形态，
   避免把 index.ts 撑成一个 700 行的大对象。 */
const OUT = join(HERE, "..", "src", "i18n");
mkdirSync(OUT, { recursive: true });
const made = [];
for (const [locale, m] of built) {
  const lang = LANGS.find((l) => l.locale === locale).lang;
  const lines = [
    "/* 由 scripts/gen-i18n.mjs 生成 —— 请勿手改。",
    ` * 语言: ${locale} · 键数: ${m.size}`,
    " *",
    " * 家族术语优先取自 docs/rocktier/i18n/glossary.json（家族唯一真源）；",
    " * 其余取自 scripts/i18n/" + lang + ".mjs。",
    " * 改动流程：改术语表或译文表 → 重跑生成器。",
    " *",
    " * C 方案：机翻基线。接入翻译 API 后重跑生成器覆盖即可，",
    " * 键结构还原与术语优先级逻辑不变。",
    " */",
    "",
    "export const " + locale.replace("-", "_") + ": Record<string, string> = {",
  ];
  for (const [k, v] of m) lines.push(`  ${q(k)}: ${q(v)},`);
  lines.push("};", "");
  const p = join(OUT, locale + ".ts");
  writeFileSync(p, lines.join("\n"));
  made.push(locale);
}
console.error(`\n  ✅ 生成 ${made.join(", ")}\n`);