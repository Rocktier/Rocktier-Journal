#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

// 业务模块都编在 lib 目标里（`mod` 声明见 lib.rs），这里直接引用 lib 的导出。
// 重复声明会得到两个不同的 crate::license_gate，`#[tauri::command]` 也会被注册两次。
use rocktier_journal_lib::{license_gate, menu, vault};
use tauri::Manager;

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        // 菜单事件处理只在这里注册一次（其余七款产品同款写法）。
        // 不能挂进 menu::build_app_menu —— 它每次重建菜单都会被调一次，
        // 而 on_menu_event 是累加监听器：切语言几次，点一下就会触发几次
        // （切换类操作被抵消 = 「点了没反应」）。详见 menu.rs 的注释。
        .on_menu_event(|app, event| menu::handle_menu_event(app, event.id().as_ref()))
        .setup(|app| {
            // 初建用英文；前端挂载后会按持久化语言调 build_menu 重建（MD 同款模式）
            menu::build_app_menu(&app.handle().clone(), "en")?;
            // 删除/覆盖保险箱采用 7 天墓碑制（vault::tombstone_vault_dir），启动时清扫过期墓碑
            vault::cleanup_deleted_vaults(app.handle());
            // L6 家族授权：注入落盘目录与 AppHandle（闸门发事件用）
            if let Ok(dir) = app.path().app_data_dir() {
                license_gate::init_license_dir(dir);
            }
            license_gate::init_app_handle(app.handle().clone());
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            menu::build_menu,
            vault::force_create_vault,
            vault::delete_vault,
            vault::get_hint,
            vault::check_vault_exists,
            vault::init_vault,
            vault::unlock_vault,
            vault::recover_vault,
            vault::regenerate_recovery_code,
            vault::lock_vault,
            vault::save_diary,
            vault::load_diary,
            vault::list_diaries,
            vault::delete_diary,
            vault::search_diaries,
            vault::export_vault,
            vault::restore_vault,
            license_gate::license_status,
            license_gate::report_machine_fingerprint,
            license_gate::store_receipt,
            license_gate::clear_receipt,
        ])
        .manage(vault::VaultState::new())
        .run(tauri::generate_context!())
        .expect("error while running Rocktier Journal");
}
