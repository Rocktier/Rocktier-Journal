pub mod crypto;
/// 家族内唯一的产品标识，用作试用记录的副存储命名空间。
///
/// 必须与 `tauri.conf.json` 的 `bundle.identifier` 逐字一致 ——
/// 副存储按它分文件，改了会导致老用户的试用记录读不到（等于白送 7 天）。
/// 改动时两处必须同步。
pub const APP_KEY: &str = "Rocktier.RocktierJournal";

pub mod license;

pub mod trial;

pub mod license_gate;
pub mod menu;
pub mod vault;
