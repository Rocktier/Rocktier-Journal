import { useState, useCallback } from "react";
import { getLocale, setLocale, t, Locale } from "../i18n";

export function useTranslation() {
  const [locale, setLocaleState] = useState<Locale>(getLocale);

  const changeLocale = useCallback((next: Locale) => {
    setLocale(next);
    setLocaleState(next);
  }, []);

  const toggleLocale = useCallback(() => {
    const next: Locale = locale === "en-US" ? "zh-CN" : "en-US";
    setLocale(next);
    setLocaleState(next);
  }, [locale]);

  return { locale, t, changeLocale, toggleLocale };
}
