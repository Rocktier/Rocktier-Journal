use tauri::menu::{AboutMetadata, Menu, MenuItem, PredefinedMenuItem, Submenu};
use tauri::{AppHandle, Emitter};
use tauri_plugin_opener::OpenerExt;

/// Open a URL or mailto: link — whitelist only (family rule). Previously this
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
pub fn build_app_menu(app: &AppHandle) -> Result<(), String> {
    // ---- App menu ----
    let about = PredefinedMenuItem::about(
        app,
        Some("Rocktier Journal"),
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
        &[&about, &hide, &hide_others, &quit],
    )
    .map_err(|e| e.to_string())?;

    // ---- File menu ----
    let close = PredefinedMenuItem::close_window(app, Some("Close Window"))
        .map_err(|e| e.to_string())?;

    let file_menu =
        Submenu::with_items(app, "File", true, &[&close]).map_err(|e| e.to_string())?;

    // ---- Edit menu ----
    let undo = PredefinedMenuItem::undo(app, None).map_err(|e| e.to_string())?;
    let redo = PredefinedMenuItem::redo(app, None).map_err(|e| e.to_string())?;
    let cut = PredefinedMenuItem::cut(app, None).map_err(|e| e.to_string())?;
    let copy = PredefinedMenuItem::copy(app, None).map_err(|e| e.to_string())?;
    let paste = PredefinedMenuItem::paste(app, None).map_err(|e| e.to_string())?;
    let select_all = PredefinedMenuItem::select_all(app, None).map_err(|e| e.to_string())?;

    let edit_menu = Submenu::with_items(
        app,
        "Edit",
        true,
        &[&undo, &redo, &cut, &copy, &paste, &select_all],
    )
    .map_err(|e| e.to_string())?;

    // ---- Display menu ----
    let toggle_sidebar = MenuItem::with_id(
        app,
        "display_toggle_sidebar",
        "Toggle Sidebar",
        true,
        // 准则 §13：显示菜单不给单键快捷键（b 是日记正文最高频字母）
        None::<&str>,
    )
    .map_err(|e| e.to_string())?;

    let toggle_theme = MenuItem::with_id(
        app,
        "display_toggle_theme",
        "Toggle Theme",
        true,
        None::<&str>,
    )
    .map_err(|e| e.to_string())?;

    let display_menu = Submenu::with_items(
        app,
        "Display",
        true,
        &[&toggle_sidebar, &toggle_theme],
    )
    .map_err(|e| e.to_string())?;

    // ---- Window menu ----
    let minimize = PredefinedMenuItem::minimize(app, None).map_err(|e| e.to_string())?;
    let fullscreen = PredefinedMenuItem::fullscreen(app, None).map_err(|e| e.to_string())?;

    let window_menu =
        Submenu::with_items(app, "Window", true, &[&minimize, &fullscreen])
            .map_err(|e| e.to_string())?;

    // ---- Help menu ----
    let help_website = MenuItem::with_id(app, "help_website", "Visit Website", true, None::<&str>)
        .map_err(|e| e.to_string())?;

    let help_contact =
        MenuItem::with_id(app, "help_contact", "Contact Us", true, None::<&str>)
            .map_err(|e| e.to_string())?;

    let help_feedback =
        MenuItem::with_id(app, "help_feedback", "Send Feedback", true, None::<&str>)
            .map_err(|e| e.to_string())?;

    let help_help = MenuItem::with_id(app, "help_help", "Rocktier Journal Help", true, None::<&str>)
        .map_err(|e| e.to_string())?;

    let help_menu = Submenu::with_items(
        app,
        "Help",
        true,
        &[&help_help, &help_website, &help_contact, &help_feedback],
    )
    .map_err(|e| e.to_string())?;

    // ---- Assemble ----
    let menu = Menu::with_items(
        app,
        &[
            &app_menu,
            &file_menu,
            &edit_menu,
            &display_menu,
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
            "help_contact" => open_extern(&app_handle, "mailto:hello@rocktier.com"),
            "help_feedback" => {
                open_extern(&app_handle, "mailto:hello@rocktier.com?subject=Rocktier%20Journal%20Feedback")
            }
            "help_help" => open_extern(&app_handle, "https://rocktier.com/journal/help"),
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
