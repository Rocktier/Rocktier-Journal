use std::fs;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use serde::{Deserialize, Serialize};
use tauri::{State, Manager};
use zeroize::{Zeroize, Zeroizing};

use crate::crypto;

const VAULT_DIRNAME: &str = ".rocktier-journal";
const SALT_FILENAME: &str = "vault.salt";
const META_FILENAME: &str = "vault.meta";
const VERIFIER_FILENAME: &str = "vault.verifier";
const ENTRIES_DIR: &str = "entries";
const IMAGES_DIR: &str = "images";
/// Prefix of tombstoned vault dirs (see `tombstone_vault_dir`). Must stay in
/// sync with VAULT_DIRNAME: "<VAULT_DIRNAME>.deleted-<unix_ts>".
const DELETED_PREFIX: &str = ".rocktier-journal.deleted-";
/// Tombstones older than this many days are swept at startup.
const TOMBSTONE_RETENTION_DAYS: i64 = 7;
const RKD_MAGIC: &[u8] = b"RKDJ";
const RKD_VERSION: u32 = 1;
const VERIFIER_PLAINTEXT: &[u8] = b"ROCKTIER_VAULT_OK";

/// Legacy identifier (pre-0.2.x) whose app-data dir may hold an existing vault.
const LEGACY_IDENTIFIER_DIR: &str = "com.rocktier.journal";

/// Resolve the vault directory, migrating a pre-0.2.x vault if needed.
///
/// The bundle identifier changed from `com.rocktier.journal` to
/// `Rocktier.RocktierJournal` for the Microsoft Store, and macOS derives
/// `app_local_data_dir()` from that identifier — so an identifier-only change
/// would silently orphan every vault created under the old one. One-time
/// migration: **copy** (never move, never delete) legacy vault contents into
/// the new location; the old copy stays untouched as a lifeline. Only fills
/// in what is missing, so an interrupted migration simply runs again.
fn resolve_vault_dir(app_handle: &tauri::AppHandle) -> Result<PathBuf, String> {
    let app_dir = app_handle
        .path()
        .app_local_data_dir()
        .map_err(|e| format!("Cannot resolve app data dir: {}", e))?;
    let vault_dir = app_dir.join(VAULT_DIRNAME);
    if vault_dir.exists() {
        return Ok(vault_dir);
    }
    let legacy_dir = app_dir
        .parent()
        .map(|p| p.join(LEGACY_IDENTIFIER_DIR).join(VAULT_DIRNAME));
    if let Some(legacy) = legacy_dir {
        if legacy.exists() {
            fs::create_dir_all(&vault_dir)
                .map_err(|e| format!("Cannot create vault dir: {}", e))?;
            for entry in fs::read_dir(&legacy)
                .map_err(|e| format!("Cannot read legacy vault: {}", e))?
                .flatten()
            {
                let dest = vault_dir.join(entry.file_name());
                if dest.exists() {
                    continue; // never overwrite anything already in the new vault
                }
                if entry.path().is_dir() {
                    copy_dir_all(&entry.path(), &dest)?;
                } else {
                    fs::copy(entry.path(), &dest)
                        .map_err(|e| format!("Cannot migrate {}: {}", entry.file_name().to_string_lossy(), e))?;
                }
            }
        }
    }
    Ok(vault_dir)
}

fn copy_dir_all(src: &Path, dst: &Path) -> Result<(), String> {
    fs::create_dir_all(dst).map_err(|e| e.to_string())?;
    for entry in fs::read_dir(src).map_err(|e| e.to_string())?.flatten() {
        let dest = dst.join(entry.file_name());
        if entry.path().is_dir() {
            copy_dir_all(&entry.path(), &dest)?;
        } else {
            fs::copy(entry.path(), &dest).map_err(|e| e.to_string())?;
        }
    }
    Ok(())
}

/// Per-process sequence for temp file names (same as MD's TMP_SEQ): the PID
/// alone is constant for the life of the process, so two saves racing would
/// share one temp name and truncate each other.
static TMP_SEQ: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(0);

/// Same idea for restore's scratch dir: two concurrent restores (or the
/// parallel test suite) must not share one extraction directory.
static RESTORE_SEQ: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(0);

// ---- Data Structures ----

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DiaryEntry {
    pub date: String,          // "YYYY-MM-DD"
    pub title: Option<String>,
    pub content: String,       // Tiptap HTML
    pub mood: Option<String>,  // mood key
    pub custom_mood: Option<String>,
    pub images: Vec<ImageRef>,
    pub created_at: String,    // ISO timestamp
    pub updated_at: String,    // ISO timestamp
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ImageRef {
    pub id: String,            // UUID
    pub filename: String,      // original filename
    pub caption: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct VaultMeta {
    pub version: u32,
    pub created_at: String,
    pub last_accessed: String,
    pub hint_question: Option<String>,
    pub hint_answer_hash: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
pub struct DiarySummary {
    pub date: String,
    pub title: Option<String>,
    pub word_count: u32,
    pub has_images: bool,
    pub mood: Option<String>,
}

// ---- Vault State ----

#[derive(Default)]
pub struct VaultState {
    pub key: Mutex<Option<[u8; crypto::KEY_LEN]>>,
    pub path: Mutex<Option<PathBuf>>,
    pub salt: Mutex<Option<[u8; crypto::SALT_LEN]>>,
}

impl VaultState {
    pub fn new() -> Self {
        Self {
            key: Mutex::new(None),
            path: Mutex::new(None),
            salt: Mutex::new(None),
        }
    }
}

// ---- Tauri Commands ----

/// Get the stored hint question (if any) without unlocking.
#[tauri::command]
pub fn get_hint(
    app_handle: tauri::AppHandle,
) -> Result<Option<String>, String> {
    let vault_dir = resolve_vault_dir(&app_handle)?;
    let meta_path = vault_dir.join(META_FILENAME);

    if !meta_path.exists() {
        return Ok(None);
    }

    let bytes = fs::read(&meta_path)
        .map_err(|e| format!("Failed to read meta: {}", e))?;
    let meta: VaultMeta = serde_json::from_slice(&bytes)
        .map_err(|e| format!("Failed to parse meta: {}", e))?;

    Ok(meta.hint_question)
}

/// Delete the entire vault, but only if hint answer matches (when hint is set).
#[tauri::command]
pub fn delete_vault(
    state: State<'_, VaultState>,
    app_handle: tauri::AppHandle,
    hint_answer: Option<String>,
) -> Result<(), String> {
    let vault_dir = resolve_vault_dir(&app_handle)?;

    // If meta exists and has a hint, verify the answer before allowing delete
    verify_hint_answer(&vault_dir, hint_answer.as_deref())?;

    // Never rm -rf the diary outright: rename to a tombstone sibling first so
    // an accidental deletion stays recoverable for a few days.
    if vault_dir.exists() {
        tombstone_vault_dir(&vault_dir)?;
    }

    zeroize_state_key(&state);
    *state.path.lock().unwrap() = None;
    *state.salt.lock().unwrap() = None;
    Ok(())
}

#[tauri::command]
pub fn check_vault_exists(state: State<'_, VaultState>, app_handle: tauri::AppHandle) -> bool {
    // Runtime state takes precedence; fall back to disk check
    if state.path.lock().unwrap().is_some() {
        return true;
    }
    resolve_vault_dir(&app_handle)
        .map(|d| d.exists())
        .unwrap_or(false)
}

/// Force-create a new vault even if one already exists (destroy old data).
/// When the old vault has a hint, `old_hint_answer` must match it — same gate
/// as `delete_vault`; without a hint the frontend's typed DELETE confirmation
/// is the only guard.
#[tauri::command]
pub fn force_create_vault(
    state: State<'_, VaultState>,
    app_handle: tauri::AppHandle,
    password: String,
    hint_question: String,
    hint_answer: String,
    old_hint_answer: Option<String>,
) -> Result<(), String> {
    if password.len() < 8 {
        return Err("Password must be at least 8 characters".to_string());
    }

    let vault_dir = resolve_vault_dir(&app_handle)?;
    if vault_dir.exists() {
        // Same authorization gate as delete_vault before destroying anything.
        verify_hint_answer(&vault_dir, old_hint_answer.as_deref())?;
        // Tombstone instead of rm -rf: accidental overwrites stay recoverable.
        tombstone_vault_dir(&vault_dir)?;
    }
    zeroize_state_key(&state);
    *state.path.lock().unwrap() = None;
    *state.salt.lock().unwrap() = None;

    init_vault_at(&vault_dir, &password, &hint_question, &hint_answer).map(|(key, salt)| {
        *state.key.lock().unwrap() = Some(*key);
        *state.path.lock().unwrap() = Some(vault_dir);
        *state.salt.lock().unwrap() = Some(salt);
    })
}

#[tauri::command]
pub fn init_vault(
    state: State<'_, VaultState>,
    app_handle: tauri::AppHandle,
    password: String,
    hint_question: String,
    hint_answer: String,
) -> Result<(), String> {
    let vault_dir = resolve_vault_dir(&app_handle)?;

    let (key, salt) = init_vault_at(&vault_dir, &password, &hint_question, &hint_answer)?;

    *state.key.lock().unwrap() = Some(*key);
    *state.path.lock().unwrap() = Some(vault_dir);
    *state.salt.lock().unwrap() = Some(salt);
    Ok(())
}

/// Core vault creation, shared by the `init_vault` command and tests: builds
/// the directory structure and writes salt / meta / verifier at the vault
/// ROOT (that is where `unlock_vault` and `get_hint` read them at runtime).
/// Returns the derived key and generated salt.
fn init_vault_at(
    vault_dir: &Path,
    password: &str,
    hint_question: &str,
    hint_answer: &str,
) -> Result<(Zeroizing<[u8; crypto::KEY_LEN]>, [u8; crypto::SALT_LEN]), String> {
    if password.len() < 8 {
        return Err("Password must be at least 8 characters".to_string());
    }
    if hint_question.trim().is_empty() {
        return Err("Hint question is required".to_string());
    }
    if hint_answer.trim().is_empty() {
        return Err("Hint answer is required".to_string());
    }

    if vault_dir.exists() {
        return Err("Vault already exists".to_string());
    }

    // Create directory structure
    fs::create_dir_all(vault_dir)
        .map_err(|e| format!("Failed to create vault dir: {}", e))?;
    fs::create_dir_all(vault_dir.join(ENTRIES_DIR))
        .map_err(|e| format!("Failed to create entries dir: {}", e))?;
    fs::create_dir_all(vault_dir.join(IMAGES_DIR))
        .map_err(|e| format!("Failed to create images dir: {}", e))?;

    // Generate and save salt
    let salt = crypto::generate_salt();
    let salt_path = vault_dir.join(SALT_FILENAME);
    fs::write(&salt_path, salt)
        .map_err(|e| format!("Failed to write salt: {}", e))?;

    // Derive key from password + salt
    let key = Zeroizing::new(crypto::derive_key(password, &salt));

    // Hash hint answer (case-insensitive, trimmed)
    let answer_hash = crypto::hash_hint_answer(hint_answer);

    // Save vault metadata
    let meta = VaultMeta {
        version: 1,
        created_at: chrono::Utc::now().to_rfc3339(),
        last_accessed: chrono::Utc::now().to_rfc3339(),
        hint_question: Some(hint_question.trim().to_string()),
        hint_answer_hash: Some(answer_hash),
    };
    let meta_json = serde_json::to_vec(&meta)
        .map_err(|e| format!("Failed to serialize meta: {}", e))?;
    let meta_path = vault_dir.join(META_FILENAME);
    fs::write(&meta_path, &meta_json)
        .map_err(|e| format!("Failed to write meta: {}", e))?;

    // Write encrypted verifier so we can validate password on unlock
    let verifier_encrypted = crypto::encrypt(&key, VERIFIER_PLAINTEXT)
        .map_err(|e| format!("Failed to write verifier: {}", e))?;
    let verifier_path = vault_dir.join(VERIFIER_FILENAME);
    fs::write(&verifier_path, &verifier_encrypted)
        .map_err(|e| format!("Failed to write verifier: {}", e))?;

    Ok((key, salt))
}

#[tauri::command]
pub fn unlock_vault(
    state: State<'_, VaultState>,
    app_handle: tauri::AppHandle,
    password: String,
) -> Result<(), String> {
    let vault_dir = resolve_vault_dir(&app_handle)?;

    if !vault_dir.exists() {
        return Err("Vault does not exist. Please create one first.".to_string());
    }

    // Read salt
    let salt_path = vault_dir.join(SALT_FILENAME);
    let salt_bytes = fs::read(&salt_path)
        .map_err(|e| format!("Failed to read salt: {}", e))?;
    if salt_bytes.len() != crypto::SALT_LEN {
        return Err("Salt file corrupted".to_string());
    }
    let mut salt = [0u8; crypto::SALT_LEN];
    salt.copy_from_slice(&salt_bytes);

    // Derive key
    let key = Zeroizing::new(crypto::derive_key(&password, &salt));

    // Verify password by decrypting verifier (AES-GCM tag check fails on wrong key).
    // A vault WITHOUT a verifier is incomplete (partial restore, failed copy).
    // Accepting any password here would decrypt to garbage and present an
    // empty-looking vault — refuse loudly instead of faking a successful unlock.
    let verifier_path = vault_dir.join(VERIFIER_FILENAME);
    if !verifier_path.exists() {
        return Err(
            "Vault file is incomplete (missing vault.verifier). Restore a full backup before unlocking."
                .to_string(),
        );
    }
    let verifier_encrypted = fs::read(&verifier_path)
        .map_err(|e| format!("Failed to read verifier: {}", e))?;
    match crypto::decrypt(&key, &verifier_encrypted) {
        Ok(plaintext) if plaintext == VERIFIER_PLAINTEXT => { /* ok */ }
        _ => return Err("Incorrect password".to_string()),
    }

    // Update state
    *state.key.lock().unwrap() = Some(*key);
    *state.path.lock().unwrap() = Some(vault_dir);
    *state.salt.lock().unwrap() = Some(salt);

    Ok(())
}

#[tauri::command]
pub fn lock_vault(state: State<'_, VaultState>) -> Result<(), String> {
    zeroize_state_key(&state);
    // Keep path so we know vault exists; just drop the key
    Ok(())
}

#[tauri::command]
pub fn save_diary(
    state: State<'_, VaultState>,
    date: String,
    title: Option<String>,
    content: String,
    mood: Option<String>,
    custom_mood: Option<String>,
    images: Vec<ImageRef>,
) -> Result<(), String> {
    let vault_dir = state.path.lock().unwrap().clone()
        .ok_or("Vault is not initialized")?;
    let key = key_guard(&state)?;

    // Check for existing entry to preserve created_at
    let created_at = match read_entry(&vault_dir, &key, &date) {
        Ok(existing) => existing.created_at,
        Err(_) => chrono::Utc::now().to_rfc3339(),
    };
    let updated_at = chrono::Utc::now().to_rfc3339();

    let entry = DiaryEntry {
        date: date.clone(),
        title,
        content,
        mood,
        custom_mood,
        images,
        created_at,
        updated_at,
    };

    write_entry_atomic(&vault_dir, &key, &entry)
}

/// Serialize + encrypt one entry and write it as an atomic `.rkd` file.
/// Shared by the `save_diary` command and the export/restore roundtrip test.
fn write_entry_atomic(
    vault_dir: &Path,
    key: &[u8; crypto::KEY_LEN],
    entry: &DiaryEntry,
) -> Result<(), String> {
    // Serialize + encrypt
    let plaintext = serde_json::to_vec(entry)
        .map_err(|e| format!("Failed to serialize entry: {}", e))?;
    let encrypted = crypto::encrypt(key, &plaintext)
        .map_err(|e| format!("Encryption failed: {}", e))?;

    // Build .rkd binary: [magic(4)] [version(4)] [encrypted_data]
    let mut rkd_data = Vec::new();
    rkd_data.extend_from_slice(RKD_MAGIC);
    rkd_data.extend_from_slice(&RKD_VERSION.to_le_bytes());
    rkd_data.extend_from_slice(&encrypted);

    // Ensure entries dir exists
    let entries_dir = vault_dir.join(ENTRIES_DIR);
    if !entries_dir.exists() {
        fs::create_dir_all(&entries_dir)
            .map_err(|e| format!("Failed to create entries dir: {}", e))?;
    }

    // Write atomically: temp file → rename. Backported from Rocktier MD's
    // write_atomically (family reference impl): the previous fixed ".tmp" name
    // let two racing saves / two instances truncate each other and left
    // orphans behind, and without fsync the rename only published the name —
    // a power loss still left a zero-length entry. A per-process sequence
    // number makes every write its own temp file.
    let entry_path = entries_dir.join(format!("{}.rkd", entry.date));
    let temp_path = entries_dir.join(format!(
        ".{}.{}.{}.tmp",
        entry.date,
        std::process::id(),
        TMP_SEQ.fetch_add(1, std::sync::atomic::Ordering::Relaxed)
    ));
    {
        use std::io::Write as _;
        let mut f = fs::File::create(&temp_path)
            .map_err(|e| format!("Failed to create temp entry: {}", e))?;
        f.write_all(&rkd_data)
            .map_err(|e| format!("Failed to write temp entry: {}", e))?;
        f.sync_all()
            .map_err(|e| format!("Failed to sync temp entry: {}", e))?;
    }
    if let Err(e) = fs::rename(&temp_path, &entry_path) {
        let _ = fs::remove_file(&temp_path);
        return Err(format!("Failed to write entry: {}", e));
    }
    // Persist the rename itself so the directory entry survives a crash too.
    #[cfg(unix)]
    {
        if let Ok(d) = fs::File::open(&entries_dir) {
            let _ = d.sync_all();
        }
    }

    Ok(())
}

#[tauri::command]
pub fn load_diary(
    state: State<'_, VaultState>,
    date: String,
) -> Result<Option<DiaryEntry>, String> {
    let vault_dir = state.path.lock().unwrap().clone()
        .ok_or("Vault is not initialized")?;
    let key = key_guard(&state)?;

    match read_entry(&vault_dir, &key, &date) {
        Ok(entry) => Ok(Some(entry)),
        Err(_) => Ok(None),
    }
}

#[tauri::command]
pub fn list_diaries(state: State<'_, VaultState>) -> Result<Vec<DiarySummary>, String> {
    let entries = load_all_entries(state)?;
    let mut summaries = Vec::with_capacity(entries.len());
    for diary in entries {
        let word_count = count_words(&diary.content);
        summaries.push(DiarySummary {
            date: diary.date,
            title: diary.title,
            word_count,
            has_images: !diary.images.is_empty(),
            mood: diary.mood,
        });
    }
    summaries.sort_by(|a, b| b.date.cmp(&a.date));
    Ok(summaries)
}

/// Decrypt and return every diary entry (including content).
/// Shared by list_diaries and search_diaries.
fn load_all_entries(state: State<'_, VaultState>) -> Result<Vec<DiaryEntry>, String> {
    let vault_dir = state.path.lock().unwrap().clone()
        .ok_or("Vault is not initialized")?;
    let key = key_guard(&state)?;

    let entries_dir = vault_dir.join(ENTRIES_DIR);
    if !entries_dir.exists() {
        return Ok(Vec::new());
    }

    let mut entries = Vec::new();

    for entry in fs::read_dir(&entries_dir)
        .map_err(|e| format!("Failed to read entries dir: {}", e))?
    {
        let entry = entry.map_err(|e| format!("Dir entry error: {}", e))?;
        let path = entry.path();
        let filename = path.file_stem()
            .and_then(|s| s.to_str())
            .unwrap_or("");

        if filename.is_empty() {
            continue;
        }

        if let Ok(diary) = read_entry(&vault_dir, &key, filename) {
            entries.push(diary);
        }
    }

    Ok(entries)
}

#[tauri::command]
pub fn delete_diary(
    state: State<'_, VaultState>,
    date: String,
) -> Result<(), String> {
    let vault_dir = state.path.lock().unwrap().clone()
        .ok_or("Vault is not initialized")?;

    let entry_path = vault_dir.join(ENTRIES_DIR).join(format!("{}.rkd", date));
    if entry_path.exists() {
        fs::remove_file(&entry_path)
            .map_err(|e| format!("Failed to delete entry: {}", e))?;
    }

    Ok(())
}

#[tauri::command]
pub fn search_diaries(
    state: State<'_, VaultState>,
    query: String,
    date_from: Option<String>,
    date_to: Option<String>,
    mood_filter: Option<String>,
) -> Result<Vec<DiarySummary>, String> {
    let all = load_all_entries(state)?;
    let query_lower = query.to_lowercase();

    let filtered: Vec<DiarySummary> = all
        .into_iter()
        .filter(|entry| {
            // Date range filter
            if let Some(ref from) = date_from {
                if entry.date < *from {
                    return false;
                }
            }
            if let Some(ref to) = date_to {
                if entry.date > *to {
                    return false;
                }
            }
            // Mood filter
            if let Some(ref m) = mood_filter {
                if entry.mood.as_deref() != Some(m.as_str()) {
                    return false;
                }
            }
            // Text search on date, title, and content body
            if !query_lower.is_empty() {
                let date_match = entry.date.contains(&query_lower);
                let title_match = entry.title
                    .as_ref()
                    .map(|t| t.to_lowercase().contains(&query_lower))
                    .unwrap_or(false);
                let content_match = entry.content.to_lowercase().contains(&query_lower);
                return date_match || title_match || content_match;
            }
            true
        })
        .map(|entry| DiarySummary {
            date: entry.date,
            title: entry.title,
            word_count: count_words(&entry.content),
            has_images: !entry.images.is_empty(),
            mood: entry.mood,
        })
        .collect();

    Ok(filtered)
}

#[tauri::command]
pub fn export_vault(
    state: State<'_, VaultState>,
    output_path: String,
) -> Result<u64, String> {
    let vault_dir = state.path.lock().unwrap().clone()
        .ok_or("Vault is not initialized")?;
    export_vault_to_zip(&vault_dir, &output_path)
}

/// Core backup writer, shared by the `export_vault` command and tests: packs
/// entries/, images/ and the key material into a self-contained zip. The key
/// material (salt, verifier, meta) lives at the vault ROOT at runtime (see
/// `init_vault_at` / `unlock_vault`), so it is read from there and stored
/// under `meta/` inside the archive; `restore_vault_from_zip` writes it back
/// to the root.
fn export_vault_to_zip(vault_dir: &Path, output_path: &str) -> Result<u64, String> {
    use std::io::Write;

    let entries_dir = vault_dir.join(ENTRIES_DIR);
    if !entries_dir.exists() {
        return Err("No entries to export".to_string());
    }

    let path = Path::new(output_path);
    let file = fs::File::create(path)
        .map_err(|e| format!("Failed to create output file: {}", e))?;
    let mut zip = zip::ZipWriter::new(file);

    let mut count: u64 = 0;

    for entry in fs::read_dir(&entries_dir)
        .map_err(|e| format!("Failed to read entries dir: {}", e))?
    {
        let entry = entry.map_err(|e| format!("Dir entry error: {}", e))?;
        let path = entry.path();
        if !path.is_file() {
            continue;
        }
        let filename = path.file_name()
            .and_then(|n| n.to_str())
            .unwrap_or("");
        if !filename.ends_with(".rkd") {
            continue;
        }

        let data = fs::read(&path)
            .map_err(|e| format!("Failed to read {}: {}", filename, e))?;

        zip.start_file(format!("entries/{}", filename), zip::write::FileOptions::default()
            .compression_method(zip::CompressionMethod::Deflated)
            .unix_permissions(0o600))
            .map_err(|e| format!("Zip write error: {}", e))?;
        zip.write_all(&data)
            .map_err(|e| format!("Zip data write error: {}", e))?;

        count += 1;
    }

    // P0-12: also back up the vault key material and the image assets so the
    // exported file is fully self-contained and restorable on its own.

    // Key material (salt, verifier, meta) — required to re-derive the key on
    // restore. It lives at the vault ROOT, not in a meta/ subdir; salt and
    // verifier are mandatory for a restorable backup, meta is best-effort.
    for (name, required) in [
        (SALT_FILENAME, true),
        (VERIFIER_FILENAME, true),
        (META_FILENAME, false),
    ] {
        let data = match fs::read(vault_dir.join(name)) {
            Ok(d) => d,
            Err(e) if required => {
                return Err(format!("Failed to read key material {}: {}", name, e));
            }
            Err(_) => continue,
        };
        zip.start_file(
            format!("meta/{}", name),
            zip::write::FileOptions::default()
                .compression_method(zip::CompressionMethod::Deflated)
                .unix_permissions(0o600),
        )
        .map_err(|e| format!("Zip write error: {}", e))?;
        zip.write_all(&data)
            .map_err(|e| format!("Zip data write error: {}", e))?;
    }

    // images/ — diary picture attachments.
    let images_dir = vault_dir.join(IMAGES_DIR);
    if let Ok(rd) = fs::read_dir(&images_dir) {
        for img in rd.flatten() {
            let ip = img.path();
            if ip.is_file() {
                if let Some(n) = ip.file_name() {
                    if let Ok(d) = fs::read(&ip) {
                        zip.start_file(
                            format!("images/{}", n.to_string_lossy()),
                            zip::write::FileOptions::default()
                                .compression_method(zip::CompressionMethod::Deflated)
                                .unix_permissions(0o600),
                        )
                        .map_err(|e| format!("Zip write error: {}", e))?;
                        zip.write_all(&d).map_err(|e| format!("Zip data write error: {}", e))?;
                    }
                }
            }
        }
    }

    zip.finish().map_err(|e| format!("Zip finalize error: {}", e))?;

    Ok(count)
}

// ---- Internal Helpers ----

/// Copy the AES key out of state. Wrapped in `Zeroizing` so every transient
/// per-command copy is wiped from memory when it goes out of scope.
fn key_guard(state: &State<'_, VaultState>) -> Result<Zeroizing<[u8; crypto::KEY_LEN]>, String> {
    state
        .key
        .lock()
        .unwrap()
        .ok_or_else(|| "Vault is locked".to_string())
        .map(Zeroizing::new)
}

/// Wipe the in-state AES key before dropping it (lock / delete / overwrite).
fn zeroize_state_key(state: &State<'_, VaultState>) {
    if let Some(mut k) = state.key.lock().unwrap().take() {
        k.zeroize();
    }
}

/// Delete gate shared by `delete_vault` and `force_create_vault`: when the
/// vault's meta has a hint, the provided answer must match it; without a hint
/// the destruction is allowed (the frontend gates it behind typed DELETE).
fn verify_hint_answer(vault_dir: &Path, provided: Option<&str>) -> Result<(), String> {
    let meta_path = vault_dir.join(META_FILENAME);
    if !meta_path.exists() {
        return Ok(());
    }
    let bytes = fs::read(&meta_path)
        .map_err(|e| format!("Failed to read meta: {}", e))?;
    let meta: VaultMeta = serde_json::from_slice(&bytes)
        .map_err(|e| format!("Failed to parse meta: {}", e))?;

    match (&meta.hint_answer_hash, provided) {
        (Some(stored_hash), Some(answer)) if *stored_hash == crypto::hash_hint_answer(answer) => {
            Ok(())
        }
        (Some(_), Some(_)) => Err("Incorrect hint answer".to_string()),
        (Some(_), None) => Err("Hint answer required to delete this vault".to_string()),
        _ => Ok(()), /* no hint set — allow delete */
    }
}

/// Instead of `fs::remove_dir_all`, rename the vault to a tombstone sibling
/// (`.rocktier-journal.deleted-<unix_ts>`) so an accidental deletion stays
/// recoverable; `cleanup_deleted_vaults` sweeps tombstones older than
/// TOMBSTONE_RETENTION_DAYS at startup. Fails closed: on rename error the
/// vault stays in place and the caller returns the error.
fn tombstone_vault_dir(vault_dir: &Path) -> Result<(), String> {
    let parent = vault_dir
        .parent()
        .ok_or_else(|| "Vault dir has no parent".to_string())?;
    let mut ts = chrono::Utc::now().timestamp();
    let mut dest = parent.join(format!("{}{}", DELETED_PREFIX, ts));
    while dest.exists() {
        ts += 1;
        dest = parent.join(format!("{}{}", DELETED_PREFIX, ts));
    }
    fs::rename(vault_dir, &dest).map_err(|e| format!("Failed to delete vault: {}", e))
}

/// Startup sweep: remove tombstoned vaults older than the retention window.
/// Best-effort — failures are ignored so the app always starts.
pub fn cleanup_deleted_vaults(app_handle: &tauri::AppHandle) {
    let Ok(app_dir) = app_handle.path().app_local_data_dir() else {
        return;
    };
    let Ok(rd) = fs::read_dir(&app_dir) else {
        return;
    };
    let cutoff = chrono::Utc::now().timestamp() - TOMBSTONE_RETENTION_DAYS * 24 * 60 * 60;
    for entry in rd.flatten() {
        let fname = entry.file_name();
        let Some(name) = fname.to_str() else { continue };
        let Some(ts) = name.strip_prefix(DELETED_PREFIX) else { continue };
        let Ok(ts) = ts.parse::<i64>() else { continue };
        if ts < cutoff {
            let _ = fs::remove_dir_all(entry.path());
        }
    }
}

impl VaultState {
    #[allow(dead_code)]
    fn entry_path(vault_dir: &Path, date: &str) -> PathBuf {
        vault_dir.join(ENTRIES_DIR).join(format!("{}.rkd", date))
    }
}

fn read_entry(vault_dir: &Path, key: &[u8; crypto::KEY_LEN], date: &str) -> Result<DiaryEntry, String> {
    let path = vault_dir.join(ENTRIES_DIR).join(format!("{}.rkd", date));
    if !path.exists() {
        return Err("Entry not found".to_string());
    }

    let data = fs::read(&path)
        .map_err(|e| format!("Failed to read entry: {}", e))?;

    // Validate magic
    if data.len() < 8 || &data[..4] != RKD_MAGIC {
        return Err("Invalid .rkd file format".to_string());
    }

    // Skip version (bytes 4-8), rest is encrypted payload
    let encrypted = &data[8..];

    // Decrypt
    let plaintext = crypto::decrypt(key, encrypted)?;

    // Deserialize
    let entry: DiaryEntry = serde_json::from_slice(&plaintext)
        .map_err(|e| format!("Failed to deserialize entry: {}", e))?;

    Ok(entry)
}

/// P0-12: restore a previously exported vault backup. The backup carries its
/// own key material (salt + verifier), so the same password that created it
/// decrypts it — entries are stored encrypted and are copied back verbatim,
/// no re-encryption needed. Images are restored along with the entries.
#[tauri::command]
pub async fn restore_vault(
    app_handle: tauri::AppHandle,
    zip_path: String,
    password: String,
) -> Result<(), String> {
    let vault_dir = resolve_vault_dir(&app_handle)?;
    restore_vault_from_zip(&vault_dir, &zip_path, &password)
}

/// Core restore, shared by the `restore_vault` command and tests.
///
/// - Full backups (with `meta/`): the password is verified against the
///   backup's own verifier, then key material is written back to the vault
///   ROOT — the location `unlock_vault` reads at runtime — and entries/ +
///   images/ are replaced with the backup's contents.
/// - Legacy backups (exported before key material was packaged, no `meta/`):
///   they can only be restored into the vault they came from, so the live
///   root key material is kept (and the password verified against its
///   verifier) while entries/ + images/ are replaced.
fn restore_vault_from_zip(vault_dir: &Path, zip_path: &str, password: &str) -> Result<(), String> {
    let tmp = std::env::temp_dir().join(format!(
        "rocktier-journal-restore-{}-{}",
        std::process::id(),
        RESTORE_SEQ.fetch_add(1, std::sync::atomic::Ordering::Relaxed)
    ));
    let _ = std::fs::remove_dir_all(&tmp);
    std::fs::create_dir_all(&tmp).map_err(|e| e.to_string())?;

    let result = (|| -> Result<(), String> {
        let file = std::fs::File::open(zip_path)
            .map_err(|e| format!("无法打开备份文件: {e}"))?;
        let mut archive = zip::ZipArchive::new(file)
            .map_err(|e| format!("备份文件损坏或不是有效的备份: {e}"))?;
        archive.extract(&tmp).map_err(|e| format!("解压备份失败: {e}"))?;

        let backup_salt_path = tmp.join("meta").join(SALT_FILENAME);
        let salt_bytes;
        let verifier_encrypted;
        if backup_salt_path.exists() {
            // Self-contained backup: use its own key material.
            salt_bytes = std::fs::read(&backup_salt_path)
                .map_err(|_| "备份缺少 vault.salt，可能不是有效的保险箱备份".to_string())?;
            if salt_bytes.len() != crypto::SALT_LEN {
                return Err("备份中的 salt 已损坏".into());
            }
            verifier_encrypted = std::fs::read(tmp.join("meta").join(VERIFIER_FILENAME))
                .map_err(|_| "备份缺少 vault.verifier，可能不是有效的保险箱备份".to_string())?;
        } else {
            // Legacy backup without key material: fall back to the live
            // vault's root key material and verify against its verifier.
            let salt_path = vault_dir.join(SALT_FILENAME);
            let verifier_path = vault_dir.join(VERIFIER_FILENAME);
            if !(vault_dir.exists() && salt_path.exists() && verifier_path.exists()) {
                return Err(
                    "备份缺少 vault.salt，可能不是有效的保险箱备份（旧版备份只能恢复到原保险箱）"
                        .to_string(),
                );
            }
            salt_bytes = std::fs::read(&salt_path)
                .map_err(|e| format!("Failed to read salt: {e}"))?;
            verifier_encrypted = std::fs::read(&verifier_path)
                .map_err(|e| format!("Failed to read verifier: {e}"))?;
        }

        // Wrong password → AES-GCM tag check fails (same gate as unlock_vault).
        let salt = {
            let mut s = [0u8; crypto::SALT_LEN];
            s.copy_from_slice(&salt_bytes);
            s
        };
        let key = Zeroizing::new(crypto::derive_key(password, &salt));
        match crypto::decrypt(&key, &verifier_encrypted) {
            Ok(plaintext) if plaintext == VERIFIER_PLAINTEXT => { /* ok */ }
            _ => return Err("密码错误：无法解密此备份".into()),
        }

        // Lay down the backup contents. Key material goes back to the vault
        // ROOT where the running app reads it — never into a meta/ subdir.
        std::fs::create_dir_all(vault_dir)
            .map_err(|e| format!("Failed to create vault dir: {e}"))?;
        std::fs::write(vault_dir.join(SALT_FILENAME), &salt_bytes)
            .map_err(|e| format!("Failed to write salt: {e}"))?;
        std::fs::write(vault_dir.join(VERIFIER_FILENAME), &verifier_encrypted)
            .map_err(|e| format!("Failed to write verifier: {e}"))?;
        if let Ok(meta_bytes) = std::fs::read(tmp.join("meta").join(META_FILENAME)) {
            let _ = std::fs::write(vault_dir.join(META_FILENAME), &meta_bytes);
        }

        // Overwrite the current vault's data with the backup's contents; also
        // drop a stale meta/ subdir left behind by pre-fix restore runs.
        for sub in [ENTRIES_DIR, IMAGES_DIR, "meta"] {
            let _ = std::fs::remove_dir_all(vault_dir.join(sub));
        }
        for sub in [ENTRIES_DIR, IMAGES_DIR] {
            let from = tmp.join(sub);
            if from.exists() {
                copy_dir_all(&from, &vault_dir.join(sub))?;
            }
        }
        Ok(())
    })();

    let _ = std::fs::remove_dir_all(&tmp);
    result
}

/// P0-10: entries are stored as Tiptap HTML, so strip markup before counting
/// (tags would otherwise pollute the count). <script>/<style> blocks are
/// dropped wholesale; the common HTML entities are decoded. Then: CJK / kana /
/// Hangul characters each count as 1 (they have no word boundaries), while
/// runs of other letters count as one word each.
fn count_words(html: &str) -> u32 {
    let plain = strip_html(html);
    let mut count = 0u32;
    let mut in_word = false;
    for ch in plain.chars() {
        let cp = ch as u32;
        let is_cjk = (0x4E00..=0x9FFF).contains(&cp)
            || (0x3400..=0x4DBF).contains(&cp)
            || (0xF900..=0xFAFF).contains(&cp)
            || (0x3040..=0x30FF).contains(&cp)
            || (0xAC00..=0xD7A3).contains(&cp);
        if is_cjk {
            count += 1;
            in_word = false;
        } else if ch.is_whitespace() {
            in_word = false;
        } else if !in_word {
            count += 1;
            in_word = true;
        }
    }
    count
}

/// Remove HTML markup for word/char counting: cut <script>/<style> blocks
/// (content included), replace every remaining tag with a space (so inline
/// tags like <br> do not glue neighbouring words together) and decode the
/// common entities. Not a full HTML parser — good enough for counting.
fn strip_html(html: &str) -> String {
    // 1) Cut <script>/<style> blocks. to_ascii_lowercase preserves byte
    //    lengths, so offsets found in `lower` index the original string too.
    let lower = html.to_ascii_lowercase();
    let mut kept = String::with_capacity(html.len());
    let mut pos = 0usize;
    loop {
        let s = lower[pos..].find("<script").map(|i| pos + i);
        let t = lower[pos..].find("<style").map(|i| pos + i);
        let next = match (s, t) {
            (Some(a), Some(b)) => a.min(b),
            (Some(a), None) => a,
            (None, Some(b)) => b,
            (None, None) => break,
        };
        kept.push_str(&html[pos..next]);
        let close_tag = if lower[next..].starts_with("<script") { "</script" } else { "</style" };
        let end = match lower[next..].find(close_tag) {
            Some(i) => {
                let from = next + i;
                // Skip past the closing tag's '>'
                lower[from..].find('>').map_or(lower.len(), |j| from + j + 1)
            }
            // Unclosed block: drop the remainder
            None => lower.len(),
        };
        pos = end;
    }
    kept.push_str(&html[pos..]);

    // 2) Replace every remaining tag with a single space.
    let mut out = String::with_capacity(kept.len());
    let mut in_tag = false;
    for c in kept.chars() {
        match c {
            '<' => {
                in_tag = true;
                out.push(' ');
            }
            '>' => in_tag = false,
            c if !in_tag => out.push(c),
            _ => {}
        }
    }

    // 3) Decode the common entities. &amp; last, so "&amp;lt;" decodes to the
    //    literal text "&lt;", not "<".
    out.replace("&nbsp;", " ")
        .replace("&lt;", "<")
        .replace("&gt;", ">")
        .replace("&quot;", "\"")
        .replace("&#39;", "'")
        .replace("&apos;", "'")
        .replace("&amp;", "&")
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Unique temp workspace per test (no extra dev-dependency needed).
    fn temp_workspace(tag: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!(
            "rocktier-journal-test-{}-{}-{}",
            std::process::id(),
            tag,
            chrono::Utc::now().timestamp_nanos_opt().unwrap_or_default()
        ));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        dir
    }

    fn sample_entry(date: &str, content: &str) -> DiaryEntry {
        DiaryEntry {
            date: date.to_string(),
            title: Some("A title".to_string()),
            content: content.to_string(),
            mood: Some("happy".to_string()),
            custom_mood: None,
            images: vec![],
            created_at: format!("{}T00:00:00Z", date),
            updated_at: format!("{}T00:00:00Z", date),
        }
    }

    /// 1c) Full loop: init → save → export → (lose vault) → restore → unlock
    /// with the original password and read the diary back.
    #[test]
    fn export_restore_roundtrip_recovers_entries_and_key_material() {
        let base = temp_workspace("roundtrip");
        let vault_dir = base.join("vault");
        let zip_path = base.join("backup.zip");
        let password = "round-trip-pass";

        // init + one diary entry + one image asset
        let (key, salt) = init_vault_at(&vault_dir, password, "pet?", "cat").unwrap();
        write_entry_atomic(&vault_dir, &key, &sample_entry("2026-10-02", "<p>你好 world</p>")).unwrap();
        fs::write(vault_dir.join(IMAGES_DIR).join("pic.png"), b"fake-png").unwrap();

        // export
        let count = export_vault_to_zip(&vault_dir, zip_path.to_str().unwrap()).unwrap();
        assert_eq!(count, 1);

        // simulate data loss: the vault is gone entirely
        fs::remove_dir_all(&vault_dir).unwrap();

        // restore with the original password
        restore_vault_from_zip(&vault_dir, zip_path.to_str().unwrap(), password).unwrap();

        // key material is back where unlock_vault reads it (vault ROOT)
        let salt_on_disk = fs::read(vault_dir.join(SALT_FILENAME)).unwrap();
        assert_eq!(salt_on_disk.len(), crypto::SALT_LEN);
        assert_eq!(salt_on_disk.as_slice(), &salt[..]);
        assert!(vault_dir.join(VERIFIER_FILENAME).exists());
        assert!(vault_dir.join(META_FILENAME).exists());
        let verifier = fs::read(vault_dir.join(VERIFIER_FILENAME)).unwrap();
        let restored_key = crypto::derive_key(password, &salt);
        assert_eq!(crypto::decrypt(&restored_key, &verifier).unwrap(), VERIFIER_PLAINTEXT);

        // the diary (and the image) survived the loss
        let loaded = read_entry(&vault_dir, &restored_key, "2026-10-02").unwrap();
        assert_eq!(loaded.content, "<p>你好 world</p>");
        assert_eq!(fs::read(vault_dir.join(IMAGES_DIR).join("pic.png")).unwrap(), b"fake-png");

        // a wrong password must NOT unlock the restored vault
        let wrong_key = crypto::derive_key("wrong-password", &salt);
        assert!(read_entry(&vault_dir, &wrong_key, "2026-10-02").is_err());

        fs::remove_dir_all(&base).unwrap();
    }

    /// Backward compatibility: a legacy backup (entries only, no meta/) can
    /// still be restored into the vault it came from, keeping the root key
    /// material untouched.
    #[test]
    fn legacy_backup_without_meta_restores_into_same_vault() {
        use std::io::Write as _;

        let base = temp_workspace("legacy");
        let vault_dir = base.join("vault");
        let password = "legacy-pass-123";

        let (key, salt) = init_vault_at(&vault_dir, password, "q", "a").unwrap();
        write_entry_atomic(&vault_dir, &key, &sample_entry("2026-10-01", "<p>legacy</p>")).unwrap();

        // Hand-build a pre-P0-12 style backup: entries only.
        let zip_path = base.join("legacy.zip");
        let file = fs::File::create(&zip_path).unwrap();
        let mut zw = zip::ZipWriter::new(file);
        zw.start_file(
            "entries/2026-10-01.rkd",
            zip::write::FileOptions::default()
                .compression_method(zip::CompressionMethod::Deflated),
        )
        .unwrap();
        zw.write_all(&fs::read(vault_dir.join(ENTRIES_DIR).join("2026-10-01.rkd")).unwrap())
            .unwrap();
        zw.finish().unwrap();

        // partial data loss: entries gone, key material intact
        fs::remove_dir_all(vault_dir.join(ENTRIES_DIR)).unwrap();

        restore_vault_from_zip(&vault_dir, zip_path.to_str().unwrap(), password).unwrap();

        // root key material unchanged; entry readable with the same key
        assert_eq!(fs::read(vault_dir.join(SALT_FILENAME)).unwrap().as_slice(), &salt[..]);
        assert!(read_entry(&vault_dir, &key, "2026-10-01").is_ok());

        // wrong password is rejected before anything is touched
        let before = fs::read(vault_dir.join(SALT_FILENAME)).unwrap();
        assert!(restore_vault_from_zip(&vault_dir, zip_path.to_str().unwrap(), "nope-nope").is_err());
        assert_eq!(fs::read(vault_dir.join(SALT_FILENAME)).unwrap(), before);

        fs::remove_dir_all(&base).unwrap();
    }

    /// 4c) delete/overwrite must tombstone instead of rm -rf.
    #[test]
    fn tombstone_renames_vault_for_retention_window() {
        let base = temp_workspace("tombstone");
        let vault_dir = base.join("vault");
        let (key, _salt) = init_vault_at(&vault_dir, "tombstone-pass", "q", "a").unwrap();
        write_entry_atomic(&vault_dir, &key, &sample_entry("2026-10-02", "<p>x</p>")).unwrap();

        tombstone_vault_dir(&vault_dir).unwrap();

        assert!(!vault_dir.exists());
        let rd = fs::read_dir(&base).unwrap().flatten().collect::<Vec<_>>();
        assert_eq!(rd.len(), 1);
        let name = rd[0].file_name().to_string_lossy().to_string();
        assert!(name.starts_with(DELETED_PREFIX), "unexpected tombstone name: {name}");
        assert!(name[DELETED_PREFIX.len()..].parse::<i64>().is_ok());
        // the tombstoned vault is still fully recoverable
        assert!(rd[0].path().join(ENTRIES_DIR).join("2026-10-02.rkd").exists());

        fs::remove_dir_all(&base).unwrap();
    }

    /// 3) Word counting operates on Tiptap HTML, not raw markup.
    #[test]
    fn count_words_strips_html() {
        assert_eq!(count_words("<p>你好 world</p>"), 3);
        // tags must not glue or pollute words
        assert_eq!(count_words("<p>hello</p><p>world</p>"), 2);
        assert_eq!(count_words("hello<br/>世界"), 3);
        // script/style content is dropped entirely
        assert_eq!(count_words("<p>a</p><script>alert(1)</script><style>.x{}</style><p>b</p>"), 2);
        // common entities are decoded
        assert_eq!(count_words("<p>Fish &amp; Chips</p>"), 3);
        // a decoded &lt;tag&gt; reads as literal "<tag>" text: one word run
        assert_eq!(count_words("<p>&lt;tag&gt; x</p>"), 2);
        // empty content
        assert_eq!(count_words("<p></p>"), 0);
    }
}
