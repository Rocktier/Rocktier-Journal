use tauri::menu::{AboutMetadata, Menu, PredefinedMenuItem, Submenu};
use tauri::{AppHandle, Manager};

/// Build the standard Rocktier family application menu.
pub fn build_app_menu(app: &mut AppHandle) -> Result<(), String> {
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

    let close = PredefinedMenuItem::close_window(app, Some("Close Window"))
        .map_err(|e| e.to_string())?;

    let file_menu =
        Submenu::with_items(app, "File", true, &[&close]).map_err(|e| e.to_string())?;

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

    let display_menu = Submenu::with_items(app, "Display", true, &[]).map_err(|e| e.to_string())?;

    let minimize = PredefinedMenuItem::minimize(app, None).map_err(|e| e.to_string())?;
    let fullscreen = PredefinedMenuItem::fullscreen(app, None).map_err(|e| e.to_string())?;

    let window_menu =
        Submenu::with_items(app, "Window", true, &[&minimize, &fullscreen])
            .map_err(|e| e.to_string())?;

    let help_menu = Submenu::with_items(app, "Help", true, &[]).map_err(|e| e.to_string())?;

    let menu = Menu::with_items(
        app,
        &[&app_menu, &file_menu, &edit_menu, &display_menu, &window_menu, &help_menu],
    )
    .map_err(|e| e.to_string())?;

    app.set_menu(menu).map_err(|e| e.to_string())?;

    Ok(())
}
