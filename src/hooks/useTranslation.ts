import { useCallback, useSyncExternalStore } from "react";
import { invoke } from "@tauri-apps/api/core";
import { getLocale, setLocale, t, Locale } from "../i18n";

// Locale is a MODULE-LEVEL store shared by every useTranslation() consumer.
// The previous implementation kept locale in per-hook useState: only the
// component that clicked the switcher re-rendered, every other screen stayed
// in its mount-time language — the "switch doesn't apply app-wide" bug.
let listeners: Array<() => void> = [];

function subscribe(cb: () => void): () => void {
  listeners.push(cb);
  return () => {
    listeners = listeners.filter((l) => l !== cb);
  };
}

function emit(): void {
  for (const l of listeners) l();
}

// 语言切换时同步重建系统菜单（Rust 侧 build_menu，家族同款模式）
function syncMenuLang(loc: Locale) {
  invoke("build_menu", { lang: loc }).catch(() => {});
}

export function useTranslation() {
  const locale = useSyncExternalStore(subscribe, getLocale);

  const changeLocale = useCallback((next: Locale) => {
    setLocale(next);
    emit();
    syncMenuLang(next);
  }, []);


  return { locale, t, changeLocale };
}
