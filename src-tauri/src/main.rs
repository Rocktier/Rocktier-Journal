
mod crypto;
mod menu;
mod vault;

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            menu::build_app_menu(&app.handle().clone())?;
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            vault::delete_vault,
            vault::get_hint,
            vault::check_vault_exists,
            vault::init_vault,
            vault::unlock_vault,
            vault::lock_vault,
            vault::save_diary,
            vault::load_diary,
            vault::list_diaries,
            vault::delete_diary,
            vault::search_diaries,
            vault::export_vault,
        ])
        .manage(vault::VaultState::new())
        .run(tauri::generate_context!())
        .expect("error while running Rocktier Journal");
}
