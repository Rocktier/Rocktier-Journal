use tauri::menu::{AboutMetadata, Menu, MenuItem, PredefinedMenuItem, Submenu};
use tauri::{AppHandle, Emitter};
use tauri_plugin_opener::OpenerExt;

/// Open a URL or mailto link — whitelist only (family rule). Previously this
/// hand-rolled `open`/`cmd /C start`/`xdg-open` via std::process: no whitelist
/// at all, and the Windows branch launched without quoting the argument.
fn open_extern(app: &AppHandle, url: &str) {
    const ALLOWED: [&str; 3] =
        ["https://rocktier.com/", "https://www.rocktier.com/", "mailto:"];
    if !ALLOWED.iter().any(|p| url.starts_with(p)) {
        return;
    }
    let _ = app.opener().open_url(url, None::<&str>);
}

/// Build the standard Rocktier family application menu.
///
/// `lang` is the UI locale ("zh-CN" / "en-US" — anything starting with "zh"
/// counts as Chinese). Labels follow the UI language; the front-end rebuilds
/// the menu on mount and on language switch (same pattern as Rocktier MD).
pub fn build_app_menu(app: &AppHandle, lang: &str) -> Result<(), String> {
    let zh = lang.starts_with("zh");
    let l = |zhv: &'static str, en: &'static str| if zh { zhv } else { en };

    // ---- App menu ----
    let about = PredefinedMenuItem::about(
        app,
        Some(l("关于 Rocktier 日记", "About Rocktier Journal")),
        Some(AboutMetadata {
            version: Some(env!("CARGO_PKG_VERSION").to_string()),
            copyright: Some("Copyright © 2026 Rocktier".to_string()),
            ..Default::default()
        }),
    )
    .map_err(|e| e.to_string())?;

    let hide = PredefinedMenuItem::hide(app, None).map_err(|e| e.to_string())?;
    let hide_others = PredefinedMenuItem::hide_others(app, None).map_err(|e| e.to_string())?;
    let quit = PredefinedMenuItem::quit(app, None).map_err(|e| e.to_string())?;

    let app_menu = Submenu::with_items(
        app,
        "Rocktier Journal",
        true,
        &[
            &about,
            &PredefinedMenuItem::separator(app).map_err(|e| e.to_string())?,
            &hide,
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
        l("锁定保险箱", "Lock Vault"),
        true,
        Some("CmdOrCtrl+L"),
    )
    .map_err(|e| e.to_string())?;

    let close = PredefinedMenuItem::close_window(app, None)
        .map_err(|e| e.to_string())?;

    let file_menu = Submenu::with_items(
        app,
        l("文件", "File"),
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
        l("编辑", "Edit"),
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
        l("切换侧栏", "Toggle Sidebar"),
        true,
        // 准则 §13：显示菜单不给单键快捷键（b 是日记正文最高频字母）
        None::<&str>,
    )
    .map_err(|e| e.to_string())?;

    let toggle_theme = MenuItem::with_id(
        app,
        "display_toggle_theme",
        l("切换日夜模式", "Toggle Theme"),
        true,
        None::<&str>,
    )
    .map_err(|e| e.to_string())?;

    let view_menu = Submenu::with_items(
        app,
        l("显示", "View"),
        true,
        &[&toggle_sidebar, &toggle_theme],
    )
    .map_err(|e| e.to_string())?;

    // ---- Window menu ----
    let minimize = PredefinedMenuItem::minimize(app, None).map_err(|e| e.to_string())?;
    let fullscreen = PredefinedMenuItem::fullscreen(app, None).map_err(|e| e.to_string())?;

    let window_menu = Submenu::with_items(
        app,
        l("窗口", "Window"),
        true,
        &[
            &minimize,
            &PredefinedMenuItem::separator(app).map_err(|e| e.to_string())?,
            &fullscreen,
        ],
    )
    .map_err(|e| e.to_string())?;

    // ---- Help menu ----
    // 准则 §13 标准 2 项：官网 + 反馈（原 4 项里的 Contact 与 Feedback 同为
    // mailto:hello@；Help 页链接随菜单收敛移除）。
    let help_website = MenuItem::with_id(
        app,
        "help_website",
        l("官方网站", "Website"),
        true,
        None::<&str>,
    )
    .map_err(|e| e.to_string())?;

    let help_feedback = MenuItem::with_id(
        app,
        "help_feedback",
        l("反馈", "Feedback"),
        true,
        None::<&str>,
    )
    .map_err(|e| e.to_string())?;

    let help_menu = Submenu::with_items(
        app,
        l("帮助", "Help"),
        true,
        &[&help_website, &help_feedback],
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

    // ---- Wire up menu events ----
    let app_handle = app.clone();
    app.on_menu_event(move |_, event| {
        match event.id().as_ref() {
            "help_website" => open_extern(&app_handle, "https://rocktier.com"),
            // 家族统一 hello@（其余 14 处外链全是它；danglei1024@gmail.com 是个人地址）
            "help_feedback" => {
                open_extern(&app_handle, "mailto:hello@rocktier.com?subject=Rocktier%20Journal%20Feedback")
            }
            "lock_vault" => {
                let _ = app_handle.emit("menu:lock-vault", ());
            }
            "display_toggle_sidebar" => {
                let _ = app_handle.emit("menu:toggle-sidebar", ());
            }
            "display_toggle_theme" => {
                let _ = app_handle.emit("menu:toggle-theme", ());
            }
            _ => {}
        }
    });

    Ok(())
}

/// 前端挂载后（以及语言切换时）调用，按当前 UI 语言重建菜单（MD 同款模式）。
#[tauri::command]
pub fn build_menu(app: AppHandle, lang: String) -> Result<(), String> {
    build_app_menu(&app, &lang).map_err(|e| e.to_string())
}
