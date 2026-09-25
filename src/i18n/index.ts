// Minimal i18n: en-US default, zh-CN available. Locale persisted in localStorage under "rj-locale".
export type Locale = "en-US" | "zh-CN";

const STRINGS: Record<Locale, Record<string, string>> = {
  "en-US": {
    "app.name": "Rocktier Journal",
    "lock.create": "Create your vault",
    "lock.unlock": "Enter password to unlock",
    "lock.password": "Password",
    "lock.confirm": "Confirm password",
    "lock.createBtn": "Create Vault",
    "lock.unlockBtn": "Unlock",
    "lock.forgot": "Forgot password?",
    "sidebar.today": "Today",
    "sidebar.calendar": "Calendar",
    "sidebar.timeline": "Timeline",
    "sidebar.search": "Search",
    "sidebar.settings": "Settings",
    "sidebar.lock": "Lock",
    "editor.save": "Save",
    "editor.saved": "Saved \u2713",
    "editor.untitled": "Untitled",
    "editor.placeholder": "What's on your mind today?",
    "calendar.today": "Today",
    "settings.theme": "Theme",
    "settings.theme.dark": "Switch to Dark",
    "settings.theme.light": "Switch to Light",
    "settings.backup": "Backup",
    "settings.export": "Export Vault as ZIP",
    "settings.export.doing": "Exporting\u2026",
    "settings.export.done": "Exported {n} entries.",
    "settings.version": "Version",
    "search.placeholder": "Search by date or title\u2026",
    "search.note": "Note: Full-text content search decrypts all entries locally. Date and title search is instant.",
    "search.noResults": "No entries found.",
    "search.results": "{n} results",
    "timeline.subtitle": "{n} entries \u00b7 Scroll through your past",
    "timeline.empty": "No entries to show. Write your first diary entry to see it here.",
    "i18n.switch": "Switch to Chinese",
    "common.cancel": "Cancel",
    "common.confirm": "Confirm",
  },
  "zh-CN": {
    "app.name": "Rocktier \u65E5\u8BB0",
    "lock.create": "\u521B\u5EFA\u4F60\u7684\u4FDD\u9669\u7BB1",
    "lock.unlock": "\u8F93\u5165\u5BC6\u7801\u89E3\u9501",
    "lock.password": "\u5BC6\u7801",
    "lock.confirm": "\u786E\u8BA4\u5BC6\u7801",
    "lock.createBtn": "\u521B\u5EFA\u4FDD\u9669\u7BB1",
    "lock.unlockBtn": "\u89E3\u9501",
    "lock.forgot": "\u5FD8\u8BB0\u5BC6\u7801\uFF1F",
    "sidebar.today": "\u4ECA\u5929",
    "sidebar.calendar": "\u65E5\u5386",
    "sidebar.timeline": "\u65F6\u5149\u8F74",
    "sidebar.search": "\u641C\u7D22",
    "sidebar.settings": "\u8BBE\u7F6E",
    "sidebar.lock": "\u9501\u5B9A",
    "editor.save": "\u4FDD\u5B58",
    "editor.saved": "\u5DF2\u4FDD\u5B58 \u2713",
    "editor.untitled": "\u65E0\u6807\u9898",
    "editor.placeholder": "\u4ECA\u5929\u60F3\u5199\u70B9\u4EC0\u4E48\uFF1F",
    "calendar.today": "\u4ECA\u5929",
    "settings.theme": "\u4E3B\u9898",
    "settings.theme.dark": "\u5207\u6362\u6DF1\u8272",
    "settings.theme.light": "\u5207\u6362\u6D45\u8272",
    "settings.backup": "\u5907\u4EFD",
    "settings.export": "\u5BFC\u51FA\u4FDD\u9669\u7BB1\u4E3A ZIP",
    "settings.export.doing": "\u5BFC\u51FA\u4E2D\u2026",
    "settings.export.done": "\u5DF2\u5BFC\u51FA {n} \u7BC7\u65E5\u8BB0\u3002",
    "settings.version": "\u7248\u672C",
    "search.placeholder": "\u6309\u65E5\u671F\u6216\u6807\u9898\u641C\u7D22\u2026",
    "search.note": "\u63D0\u793A\uFF1A\u5168\u6587\u5185\u5BB9\u641C\u7D22\u9700\u5728\u672C\u5730\u89E3\u5BC6\u5168\u90E8\u65E5\u8BB0\u3002\u65E5\u671F\u548C\u6807\u9898\u641C\u7D22\u5373\u65F6\u5B8C\u6210\u3002",
    "search.noResults": "\u672A\u627E\u5230\u65E5\u8BB0\u3002",
    "search.results": "{n} \u6761\u7ED3\u679C",
    "timeline.subtitle": "{n} \u7BC7\u65E5\u8BB0 \u00b7 \u56DE\u987E\u4F60\u7684\u8FC7\u5F80",
    "timeline.empty": "\u6682\u65E0\u65E5\u8BB0\u3002\u5199\u4E0B\u7B2C\u4E00\u7BC7\u65E5\u8BB0\uFF0C\u5B83\u5C31\u4F1A\u51FA\u73B0\u5728\u8FD9\u91CC\u3002",
    "i18n.switch": "Switch to English",
    "common.cancel": "\u53D6\u6D88",
    "common.confirm": "\u786E\u8BA4",
  },
};

const STORAGE_KEY = "rj-locale";

export function getLocale(): Locale {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved === "en-US" || saved === "zh-CN") return saved;
  if (typeof navigator !== "undefined" && navigator.language) {
    if (navigator.language.startsWith("zh")) return "zh-CN";
  }
  return "en-US";
}

export function setLocale(loc: Locale): void {
  localStorage.setItem(STORAGE_KEY, loc);
}

export function t(key: string, vars?: Record<string, string | number>): string {
  const locale = getLocale();
  let s = STRINGS[locale]?.[key] ?? STRINGS["en-US"][key] ?? key;
  if (vars) {
    for (const [k, v] of Object.entries(vars)) {
      s = s.replace(new RegExp(`\\{${k}\\}`, "g"), String(v));
    }
  }
  return s;
}
