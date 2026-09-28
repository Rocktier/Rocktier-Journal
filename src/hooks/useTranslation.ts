import { useState, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { getLocale, setLocale, t, Locale } from "../i18n";

// 语言切换时同步重建系统菜单（Rust 侧 build_menu，Rocktier MD 同款模式）
function syncMenuLang(loc: Locale) {
  invoke("build_menu", { lang: loc }).catch(() => {});
}

export function useTranslation() {
  const [locale, setLocaleState] = useState<Locale>(getLocale);

  const changeLocale = useCallback((next: Locale) => {
    setLocale(next);
    setLocaleState(next);
    syncMenuLang(next);
  }, []);

  const toggleLocale = useCallback(() => {
    const next: Locale = locale === "en-US" ? "zh-CN" : "en-US";
    setLocale(next);
    setLocaleState(next);
    syncMenuLang(next);
  }, [locale]);

  return { locale, t, changeLocale, toggleLocale };
}
