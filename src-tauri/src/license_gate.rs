/* ── 授权：试用与激活（L6 家族底座，见 license.rs 的模块说明）─────────────
 *
 * Journal 的写命令都定义在 `vault.rs`（子模块），所以闸门放在这里由 vault.rs
 * 调用。放在 crate 根的 main.rs 是为了与 Sign / MD / Write 的形态一致 ——
 * 家族接入规程（FAMILY-LICENSE.md §2）要求闸门是**唯一入口**。
 *
 * 与 Sign 的关键差异：**Journal 的 `save_diary` 不能一刀切地拦**。
 * 日记是每天都要写的工具，到期当天写不进去 = 体验崩塌；但完全放行 =
 * 付费墙形同虚设。故按 FAMILY-LICENSE.md §2 的特例口径：
 *
 *   `date ≤ 到期日`（试用起始 + TRIAL_DAYS）→ 放行
 *   `date >  到期日`                     → 拦截（不许新建往后的日记）
 *
 * 读路径（load / list / search / unlock / get_hint / check_vault_exists）
 * 与元数据操作（set_default 之类）一律放行 —— 与家族「过期后仍可看、
 * 不能产出」的基调一致。
 */

use std::path::PathBuf;
use std::sync::OnceLock;

/// 试用与授权状态的落盘目录。由 `main.rs` 的 `setup()` 注入。
///
/// 用全局而不是给 save_diary 再加一个参数：那会让命令签名多一个与业务无关的参数。
static LICENSE_DIR: OnceLock<PathBuf> = OnceLock::new();

pub fn init_license_dir(dir: PathBuf) {
    let _ = LICENSE_DIR.set(dir);
}

/// 供闸门发事件用。setup 注入；即使没注入也照样能拦截，只是界面不会自动弹窗。
static APP_HANDLE: OnceLock<tauri::AppHandle> = OnceLock::new();

pub fn init_app_handle(app: tauri::AppHandle) {
    let _ = APP_HANDLE.set(app);
}

fn now_secs() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0)
}

/// 目录未注入（setup 失败）时按「试用中、满额天数」处理 —— 失败方向刻意选**放行**：
/// 一个取不到的目录不该变成一次锁死。
pub fn current_license() -> crate::license::Status {
    let Some(dir) = LICENSE_DIR.get() else {
        return crate::license::Status::Trialing {
            days_left: crate::license::TRIAL_DAYS,
        };
    };
    let now = now_secs();
    /* 试用起点双写（AppData + 副存储）并按机器指纹判定，
       见 trial.rs 的模块说明。app_key 用 bundle identifier ——
       家族内唯一，避免两个产品的副存储互相覆盖。 */
    let started = crate::trial::ensure_started(
        dir,
        crate::APP_KEY,
        now,
        &crate::trial::machine_fingerprint(),
    );
    // 只认本单品与全家桶的回执：别人的回执即使验签通过，也不是本应用的授权。
    let receipt = crate::license::read_valid_receipt(dir, crate::license::PUBLIC_KEY_B64)
        .filter(crate::license::accepts);
    crate::license::status_from(Some(started), receipt.as_ref(), now)
}

/// 试用到期日（Unix 秒）。仅在试用中有效；已过期时返回值无意义。
fn trial_deadline() -> i64 {
    let Some(dir) = LICENSE_DIR.get() else {
        return i64::MAX;
    };
    /* trial::ensure_started 返回 i64（不再是 Option）：取不到记录时它
       会写入当前时间并返回它，所以不再有 None 分支。 */
    let start = crate::trial::ensure_started(
        dir,
        crate::APP_KEY,
        now_secs(),
        &crate::trial::machine_fingerprint(),
    );
    start + crate::license::TRIAL_DAYS * 86_400
}

/// 把 `YYYY-MM-DD` 解析成**当地午夜**的 Unix 秒（与 trial_deadline() 同量纲）。
///
/// ⚠️ J1 教训：这里曾用「年×365 + 月×31」粗算，产出约 6.4e10 的伪时间戳，
/// 与 trial_deadline() 的真实 Unix 秒（约 1.79e9）差 35 倍 —— 比较恒为 false，
/// 「补写过去日记」的特例整个死掉，过期后连当天的日记都写不进。日期比较
/// 必须在同一量纲上进行，没有例外。
///
/// 刻意**只解析不校验日历合法性之外的任何东西**：解析不了（含 DST 不存在的
/// 午夜）就返回 None，由调用方按「放行」处理 —— 一个格式异常不该让用户写不进
/// 日记（失败安全方向：宁可少拦，不可拦死）。
fn date_start_secs(date: &str) -> Option<i64> {
    let d = chrono::NaiveDate::parse_from_str(date, "%Y-%m-%d").ok()?;
    d.and_hms_opt(0, 0, 0)?
        .and_local_timezone(chrono::Local)
        .single()
        .map(|dt| dt.timestamp())
}

/// 纯判定：该日记日期是否放行（`date ≤ 截止`；解析不了放行）。
///
/// 抽成纯函数是为了可单测 —— 闸门本体依赖进程级全局 `LICENSE_DIR`，
/// 直接测会有测试间竞争（J1 的空断言测试正源于绕开它而丢弃了断言）。
fn diary_date_allowed(date: &str, deadline_secs: i64) -> bool {
    match date_start_secs(date) {
        Some(ds) => ds <= deadline_secs,
        None => true,
    }
}

/// Journal 专用的写闸门。
///
/// 与家族通用闸门的差别只有一处：**带日期的日记按日期判定**，而不是一律放行。
/// `date` 是日记内容的归属日期（`YYYY-MM-DD`），用户可以补写过去的日记 ——
/// 那不受试用期限影响（`date ≤ 到期日` 都放行）。
pub fn ensure_diary_write_allowed(date: &str) -> Result<(), String> {
    if current_license().allows_write(crate::license::enforced()) {
        return Ok(());
    }
    // 已经到期：只放行到期日及之前的日记（含试用期内补写的旧日记）
    if diary_date_allowed(date, trial_deadline()) {
        return Ok(());
    }
    emit_expired();
    Err("LICENSE_EXPIRED".to_string())
}

/// 不带日期的写闸门（导出保险箱等）。
pub fn ensure_write_allowed() -> Result<(), String> {
    if current_license().allows_write(crate::license::enforced()) {
        return Ok(());
    }
    emit_expired();
    Err("LICENSE_EXPIRED".to_string())
}

fn emit_expired() {
    // 让界面主动知道"被拦下了"，而不是在每个动作的 catch 里各判一次错误码 ——
    // 那种写法漏掉一处，用户看到的就只是一个没有解释的失败。
    if let Some(app) = APP_HANDLE.get() {
        use tauri::Emitter as _;
        let _ = app.emit("license-expired", ());
    }
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LicenseInfo {
    /// `trial` / `expired` / `licensed`。
    pub status: String,
    /// 仅 `trial` 时有意义。
    pub days_left: i64,
    /// 仅 `licensed` 时有值（`JO` 单品 / `FL` 全家桶）。
    pub product: Option<String>,
    /// 仅 `licensed` 时有值：回执里的交易号（吊销复检的凭据）。
    pub txn: Option<String>,
    /// 当前是否真的会拦截写操作（渠道 + 公钥 + 总开关三者决定）。
    pub enforcing: bool,
    /// `direct`（官网直链）/ `store`（微软商店）。
    pub channel: String,
    /// 本构建是否已配置验签公钥。
    pub activation_configured: bool,
}

/// 回执里的交易号（吊销复检用）。无有效回执时为 None。
fn receipt_txn() -> Option<String> {
    let dir = LICENSE_DIR.get()?;
    crate::license::read_valid_receipt(dir, crate::license::PUBLIC_KEY_B64).map(|r| r.txn)
}

fn license_info() -> LicenseInfo {
    let status = current_license();
    let txn = receipt_txn();
    LicenseInfo {
        status: status.as_str().to_string(),
        days_left: match &status {
            crate::license::Status::Trialing { days_left } => *days_left,
            _ => 0,
        },
        product: match &status {
            crate::license::Status::Licensed { product } => Some(product.clone()),
            _ => None,
        },
        txn,
        enforcing: crate::license::enforced(),
        channel: crate::license::channel().to_string(),
        activation_configured: !crate::license::PUBLIC_KEY_B64.trim().is_empty(),
    }
}

/// 供界面展示：剩余试用天数 / 是否已激活 / 当前渠道。
#[tauri::command]
pub async fn license_status() -> Result<LicenseInfo, String> {
    Ok(license_info())
}

/// 保存服务端签出的回执并立即验签。
///
/// 联网换回执的那一步在**前端**做（`fetch` 到 rocktier.com/api/activate），
/// 为的是不引入 HTTP 客户端依赖；但**验签与落盘必须在这里** —— 前端拿到的只是一段
/// 待验的字符串，能证明它有效与否的只有公钥。
/// 本机指纹，供前端在**激活时**上报给服务端做设备计数。
///
/// 为什么单独开一个命令而不是让前端自己算：指纹要读注册表 / ioreg，
/// 只有 Rust 侧做得到；且**试用与激活必须用同一个指纹** ——
/// 用两套标识会出现「A 说没试过、B 说试过」这种自相矛盾。
///
/// 取不到时返回空串：服务端据此不计数也不拦激活（见
/// `rocktier.com/api/devices.js` 的模块说明）。
#[tauri::command]
pub fn report_machine_fingerprint() -> String {
    crate::trial::machine_fingerprint()
}

#[tauri::command]
pub async fn store_receipt(signed: String) -> Result<LicenseInfo, String> {
    let dir = LICENSE_DIR
        .get()
        .ok_or_else(|| "no app data directory".to_string())?;
    let trimmed = signed.trim();
    let receipt = crate::license::verify_receipt(trimmed, crate::license::PUBLIC_KEY_B64)?;

    // 其它单品的码虽然签名有效，但**不属于**本应用 —— 而且不要落盘：落下去以后
    // 会被当成有效回执读回来，等于自己给自己开后门。
    if !crate::license::accepts(&receipt) {
        return Err("LICENSE_WRONG_PRODUCT".to_string());
    }

    crate::license::save_receipt(dir, trimmed)?;
    Ok(license_info())
}

/// 清除本地回执（吊销复检判定 revoked 时由前端调用）。
/// 之后 license_status 回到 trial/expired，写闸门按状态拦截。
#[tauri::command]
pub fn clear_receipt() -> Result<(), String> {
    let dir = LICENSE_DIR
        .get()
        .ok_or_else(|| "no app data directory".to_string())?;
    let p = dir.join("receipt.txt");
    if p.exists() {
        std::fs::remove_file(&p).map_err(|e| e.to_string())?;
    }
    Ok(())
}
#[cfg(test)]
mod tests {
    use super::*;

    /// `date_start_secs` 的单调性 —— 「到期日之前/之后」的判定全靠它。
    #[test]
    fn date_parsing_is_strictly_ordered_within_a_year() {
        let d1 = date_start_secs("2026-10-01").expect("应能解析");
        let d2 = date_start_secs("2026-10-02").expect("应能解析");
        let d3 = date_start_secs("2026-10-10").expect("应能解析");
        assert!(d1 < d2, "10-01 必须早于 10-02");
        assert!(d2 < d3, "10-02 必须早于 10-10");
        assert!(
            date_start_secs("2026-09-30").expect("应能解析") < d1,
            "9-30 必须早于 10-01"
        );
    }

    #[test]
    fn malformed_dates_are_rejected() {
        for bad in ["", "not-a-date", "2026-13-01", "2026-10-99", "20261001"] {
            assert!(date_start_secs(bad).is_none(), "非法日期应解析失败（{bad:?}）");
        }
    }

    /// 到期判定的完整契约（J1 回归）：到期日当天及之前的日记放行（补写旧日记），
    /// 到期日次日及未来拦截，解析不了放行（宁可少拦，不可拦死）。
    ///
    /// 本测试直接测纯函数 `diary_date_allowed`，不碰进程级全局 `LICENSE_DIR` ——
    /// J1 的旧版测试正因为绕开全局而丢掉了断言（`let _ = ensure_...()`），
    /// 空断言放过了恒不生效的特例。
    #[test]
    fn diary_date_contract_after_expiry() {
        // 截止取 2026-10-19 12:00 本地 —— 与 trial_deadline() 同为 Unix 秒量纲。
        let deadline = date_start_secs("2026-10-19").expect("应能解析") + 12 * 3600;
        assert!(
            diary_date_allowed("2026-10-19", deadline),
            "到期日当天的日记必须放行"
        );
        assert!(
            diary_date_allowed("2026-10-01", deadline),
            "到期日之前的日记必须放行（补写旧日记是正当需求）"
        );
        assert!(
            !diary_date_allowed("2026-10-20", deadline),
            "到期日次日的日记必须拦截"
        );
        assert!(!diary_date_allowed("2027-01-01", deadline), "未来日记必须拦截");
        assert!(
            diary_date_allowed("garbage", deadline),
            "日期解析不了时必须放行 —— 日记写不进去是灾难性体验"
        );
    }
}
