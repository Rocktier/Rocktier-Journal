use tauri::menu::{AboutMetadata, Menu, MenuItem, PredefinedMenuItem, Submenu};
use tauri::{AppHandle, Emitter, Manager};
use tauri_plugin_opener::OpenerExt;

/// Open a URL or mailto link — whitelist only (family rule). Previously this
/// hand-rolled `open`/`cmd /C start`/`xdg-open` via std::process: no whitelist
/// at all, and the Windows branch launched without quoting the argument.
/// Exact-host whitelist check. The previous prefix list
/// `["https://rocktier.com/", …]` silently rejected "https://rocktier.com"
/// (no trailing slash — the help-menu caller), leaving the Help → Website
/// item dead. Parse the host instead of comparing prefixes, so the check is
/// neither too strict nor bypassable via "https://rocktier.com.evil.tld/".
fn is_allowed_url(url: &str) -> bool {
    if url.starts_with("mailto:") {
        return true;
    }
    let Some(rest) = url
        .strip_prefix("https://")
        .or_else(|| url.strip_prefix("http://"))
    else {
        return false;
    };
    let host = rest.split(['/', '?', '#']).next().unwrap_or("");
    host == "rocktier.com" || host == "www.rocktier.com"
}

fn open_extern(app: &AppHandle, url: &str) {
    if !is_allowed_url(url) {
        return;
    }
    let _ = app.opener().open_url(url, None::<&str>);
}

/// Build the standard Rocktier family application menu.
///
/// `lang` is the UI locale ("zh-CN" / "en-US" — anything starting with "zh"
/// counts as Chinese). Labels follow the UI language; the front-end rebuilds
/// the menu on mount and on language switch (same pattern as Rocktier MD).
/// Menu labels for one language.
///
/// Same approach as the other four products' menus: a struct per language
/// instead of widening the old `l(zh, en)` closure to eight arguments — with
/// eight positional string arguments, swapping `ja` and `ko` compiles cleanly
/// and silently shows the wrong language. One field per call site makes that a
/// compile error.
///
/// Journal's UI locale is a full tag (`en-US` / `ja-JP`), while the other
/// products use bare language codes. Matching on the primary subtag handles
/// both, so the same stored value works whichever form arrives.
///
/// Unknown codes fall back to English rather than panicking, so a stale
/// `localStorage` value degrades to a usable menu.
struct MenuStrings {
    file: &'static str,
    edit: &'static str,
    view: &'static str,
    lock: &'static str,
    toggle_sidebar: &'static str,
    toggle_theme: &'static str,
    window: &'static str,
    help: &'static str,
    website: &'static str,
    check_updates: &'static str,
    feedback: &'static str,
    about: &'static str,
}

impl MenuStrings {
    fn for_lang(lang: &str) -> Self {
        // Primary subtag: "zh-CN" / "zh-Hans" / "ja-JP" all land correctly.
        let code = lang.split(['-', '_']).next().unwrap_or("");
        match code {
            "zh" => Self {
                file: "文件", edit: "编辑", view: "显示", lock: "锁定保险箱",
                toggle_sidebar: "切换侧栏", toggle_theme: "切换日夜模式", window: "窗口",
                help: "帮助", website: "官方网站", feedback: "反馈",
                about: "关于 Rocktier 日记",
                check_updates: "检查更新…",
            },
            "ja" => Self {
                file: "ファイル", edit: "編集", view: "表示", lock: "金庫をロック",
                toggle_sidebar: "サイドバーの切り替え", toggle_theme: "テーマを切り替え",
                window: "ウインドウ", help: "ヘルプ", website: "公式サイト",
                feedback: "フィードバック", about: "Rocktier Journal について",
                check_updates: "アップデートを確認…",
            },
            "ko" => Self {
                file: "파일", edit: "편집", view: "보기", lock: "금고 잠금",
                toggle_sidebar: "사이드바 전환", toggle_theme: "테마 전환",
                window: "창", help: "도움말", website: "공식 웹사이트",
                feedback: "피드백", about: "Rocktier Journal 정보",
                check_updates: "업데이트 확인…",
            },
            "de" => Self {
                file: "Datei", edit: "Bearbeiten", view: "Ansicht", lock: "Tresor sperren",
                toggle_sidebar: "Seitenleiste umschalten", toggle_theme: "Design wechseln",
                window: "Fenster", help: "Hilfe", website: "Website",
                feedback: "Feedback", about: "Über Rocktier Journal",
                check_updates: "Nach Updates suchen…",
            },
            "es" => Self {
                file: "Archivo", edit: "Editar", view: "Ver", lock: "Bloquear la cámara",
                toggle_sidebar: "Alternar barra lateral", toggle_theme: "Cambiar tema",
                window: "Ventana", help: "Ayuda", website: "Sitio web",
                feedback: "Comentarios", about: "Acerca de Rocktier Journal",
                check_updates: "Buscar actualizaciones…",
            },
            "pt" => Self {
                file: "Arquivo", edit: "Editar", view: "Exibir", lock: "Bloquear o cofre",
                toggle_sidebar: "Alternar barra lateral", toggle_theme: "Alternar tema",
                window: "Janela", help: "Ajuda", website: "Site",
                feedback: "Comentários", about: "Sobre o Rocktier Journal",
                check_updates: "Verificar atualizações…",
            },
            "ar" => Self {
                file: "ملف", edit: "تحرير", view: "عرض", lock: "قفل الخزنة",
                toggle_sidebar: "تبديل الشريط الجانبي", toggle_theme: "تبديل المظهر",
                window: "نافذة", help: "مساعدة", website: "الموقع",
                feedback: "ملاحظات", about: "حول Rocktier Journal",
                check_updates: "التحقق من التحديثات…",
            },
            // English is both the family default and the fallback.
            _ => Self {
                file: "File", edit: "Edit", view: "View", lock: "Lock Vault",
                toggle_sidebar: "Toggle Sidebar", toggle_theme: "Toggle Theme",
                window: "Window", help: "Help", website: "Website",
                feedback: "Feedback", about: "About Rocktier Journal",
                check_updates: "Check for Updates…",
            },
        }
    }
}

pub fn build_app_menu(app: &AppHandle, lang: &str) -> Result<(), String> {
    let m = MenuStrings::for_lang(lang);

    // ---- App menu ----
    let about = PredefinedMenuItem::about(
        app,
        Some(m.about),
        Some(AboutMetadata {
            version: Some(env!("CARGO_PKG_VERSION").to_string()),
            copyright: Some("Copyright © 2026 Rocktier".to_string()),
            ..Default::default()
        }),
    )
    .map_err(|e| e.to_string())?;

    // macOS-only：Windows 上 muda 的 hide_others 落进 `_ => {}` 点了无反应，
    // 且 hide 是 SW_HIDE（窗口消失、无 Dock/托盘召不回）——见 findings D-42。
    #[cfg(target_os = "macos")]
    let hide = PredefinedMenuItem::hide(app, None).map_err(|e| e.to_string())?;
    #[cfg(target_os = "macos")]
    let hide_others = PredefinedMenuItem::hide_others(app, None).map_err(|e| e.to_string())?;
    let quit = PredefinedMenuItem::quit(app, None).map_err(|e| e.to_string())?;

    let app_menu = Submenu::with_items(
        app,
        "Rocktier Journal",
        true,
        &[
            &about,
            &PredefinedMenuItem::separator(app).map_err(|e| e.to_string())?,
            #[cfg(target_os = "macos")]
            &hide,
            #[cfg(target_os = "macos")]
            &hide_others,
            &PredefinedMenuItem::separator(app).map_err(|e| e.to_string())?,
            &quit,
        ],
    )
    .map_err(|e| e.to_string())?;

    // ---- File menu ----
    // Journal 是保险箱日记，无「打开…」文档模型；应用特有项 = 锁定保险箱。
    let lock = MenuItem::with_id(
        app,
        "lock_vault",
        m.lock,
        true,
        Some("CmdOrCtrl+L"),
    )
    .map_err(|e| e.to_string())?;

    let close = PredefinedMenuItem::close_window(app, None)
        .map_err(|e| e.to_string())?;

    let file_menu = Submenu::with_items(
        app,
        m.file,
        true,
        &[
            &lock,
            &PredefinedMenuItem::separator(app).map_err(|e| e.to_string())?,
            &close,
        ],
    )
    .map_err(|e| e.to_string())?;

    // ---- Edit menu ----
    let undo = PredefinedMenuItem::undo(app, None).map_err(|e| e.to_string())?;
    let redo = PredefinedMenuItem::redo(app, None).map_err(|e| e.to_string())?;
    let cut = PredefinedMenuItem::cut(app, None).map_err(|e| e.to_string())?;
    let copy = PredefinedMenuItem::copy(app, None).map_err(|e| e.to_string())?;
    let paste = PredefinedMenuItem::paste(app, None).map_err(|e| e.to_string())?;
    let select_all = PredefinedMenuItem::select_all(app, None).map_err(|e| e.to_string())?;

    let edit_menu = Submenu::with_items(
        app,
        m.edit,
        true,
        &[
            &undo,
            &redo,
            &PredefinedMenuItem::separator(app).map_err(|e| e.to_string())?,
            &cut,
            &copy,
            &paste,
            &select_all,
        ],
    )
    .map_err(|e| e.to_string())?;

    // ---- View menu (was: Display) ----
    let toggle_sidebar = MenuItem::with_id(
        app,
        "display_toggle_sidebar",
        m.toggle_sidebar,
        true,
        // 准则 §13：显示菜单不给单键快捷键（b 是日记正文最高频字母）
        None::<&str>,
    )
    .map_err(|e| e.to_string())?;

    let toggle_theme = MenuItem::with_id(
        app,
        "display_toggle_theme",
        m.toggle_theme,
        true,
        None::<&str>,
    )
    .map_err(|e| e.to_string())?;

    let view_menu = Submenu::with_items(
        app,
        m.view,
        true,
        &[&toggle_sidebar, &toggle_theme],
    )
    .map_err(|e| e.to_string())?;

    // ---- Window menu ----
    let minimize = PredefinedMenuItem::minimize(app, None).map_err(|e| e.to_string())?;
    // macOS：原生全屏（有效）。Windows：muda 的 fullscreen 落进 `_ => {}` 点了
    // 无反应，改用自定义项，由 handle_menu_event 调 set_fullscreen 真全屏。
    #[cfg(target_os = "macos")]
    let fullscreen = PredefinedMenuItem::fullscreen(app, None).map_err(|e| e.to_string())?;
    #[cfg(target_os = "windows")]
    let win_fullscreen =
        MenuItem::with_id(app, "win-fullscreen", "Toggle Full Screen", true, None::<&str>)
            .map_err(|e| e.to_string())?;

    let window_menu = Submenu::with_items(
        app,
        m.window,
        true,
        &[
            &minimize,
            &PredefinedMenuItem::separator(app).map_err(|e| e.to_string())?,
            #[cfg(target_os = "macos")]
            &fullscreen,
            #[cfg(target_os = "windows")]
            &win_fullscreen,
        ],
    )
    .map_err(|e| e.to_string())?;

    // ---- Help menu ----
    // 准则 §13 标准 2 项：官网 + 反馈（原 4 项里的 Contact 与 Feedback 同为
    // mailto:hello@；Help 页链接随菜单收敛移除）。
    // 检查更新：只 emit "menu:check-updates"，联网由前端 services/updates.ts 做。
    let help_updates = MenuItem::with_id(
        app,
        "check_updates",
        m.check_updates,
        true,
        None::<&str>,
    )
    .map_err(|e| e.to_string())?;

    let help_website = MenuItem::with_id(
        app,
        "help_website",
        m.website,
        true,
        None::<&str>,
    )
    .map_err(|e| e.to_string())?;

    let help_feedback = MenuItem::with_id(
        app,
        "help_feedback",
        m.feedback,
        true,
        None::<&str>,
    )
    .map_err(|e| e.to_string())?;

    let help_menu = Submenu::with_items(
        app,
        m.help,
        true,
        &[&help_updates, &help_website, &help_feedback],
    )
    .map_err(|e| e.to_string())?;

    // ---- Assemble ----
    let menu = Menu::with_items(
        app,
        &[
            &app_menu,
            &file_menu,
            &edit_menu,
            &view_menu,
            &window_menu,
            &help_menu,
        ],
    )
    .map_err(|e| e.to_string())?;

    app.set_menu(menu).map_err(|e| e.to_string())?;

    Ok(())
}

/// 菜单事件处理 —— **只从 Builder 注册一次**（见 main.rs）。
///
/// 2026-10-17：这段注册此前写在 `build_app_menu` 里，而该函数会被反复调用
/// （启动建一次 + 前端挂载后按语言重建 + 每次切语言再重建）。Tauri v2 的
/// `on_menu_event` 是把 handler **push** 进 `global_event_listeners`
/// （`Mutex<Vec>`），派发时遍历全部调用 —— 于是第 N 次重建之后，点一下会
/// 触发 N 次：「切换侧栏 / 切换主题」被触发偶数次 = 原地不动（用户报的
/// 「点了没反应」），官网/反馈会开 N 个页面。
/// 菜单可以重建（标签要跟着语言走），事件处理必须只挂一次。
pub fn handle_menu_event(app: &AppHandle, id: &str) {
    match id {
        // Windows 真全屏（替代 muda 在 Win 上无效的 PredefinedMenuItem::fullscreen）
        "win-fullscreen" => {
            if let Some(win) = app.webview_windows().values().next().cloned() {
                let _ = win.set_fullscreen(!win.is_fullscreen().unwrap_or(false));
            }
        }
        "help_website" => open_extern(app, "https://rocktier.com"),
        // 家族统一 hello@（其余 14 处外链全是它；danglei1024@gmail.com 是个人地址）
        "help_feedback" => {
            open_extern(app, "mailto:hello@rocktier.com?subject=Rocktier%20Journal%20Feedback")
        }
        "lock_vault" => {
            let _ = app.emit("menu:lock-vault", ());
        }
        "display_toggle_sidebar" => {
            let _ = app.emit("menu:toggle-sidebar", ());
        }
        "display_toggle_theme" => {
            let _ = app.emit("menu:toggle-theme", ());
        }
        "check_updates" => {
            let _ = app.emit("menu:check-updates", ());
        }
        _ => {}
    }
}

/// 前端挂载后（以及语言切换时）调用，按当前 UI 语言重建菜单（MD 同款模式）。
#[tauri::command]
pub fn build_menu(app: AppHandle, lang: String) -> Result<(), String> {
    build_app_menu(&app, &lang).map_err(|e| e.to_string())
}
