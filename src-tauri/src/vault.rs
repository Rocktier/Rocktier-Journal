use std::fs;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use serde::{Deserialize, Serialize};
use tauri::{State, Manager};

use crate::crypto;

const VAULT_DIRNAME: &str = ".rocktier-journal";
const SALT_FILENAME: &str = "vault.salt";
const META_FILENAME: &str = "vault.meta";
const ENTRIES_DIR: &str = "entries";
const IMAGES_DIR: &str = "images";
const RKD_MAGIC: &[u8] = b"RKDJ";
const RKD_VERSION: u32 = 1;

// ---- Data Structures ----

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DiaryEntry {
    pub date: String,          // "YYYY-MM-DD"
    pub title: Option<String>,
    pub content: String,       // Markdown text
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

#[tauri::command]
pub fn check_vault_exists(state: State<'_, VaultState>) -> bool {
    state.path.lock().unwrap().is_some()
}

#[tauri::command]
pub fn init_vault(
    state: State<'_, VaultState>,
    app_handle: tauri::AppHandle,
    password: String,
) -> Result<(), String> {
    if password.len() < 8 {
        return Err("Password must be at least 8 characters".to_string());
    }

    let app_dir = app_handle
        .path()
        .app_local_data_dir()
        .map_err(|e| format!("Cannot resolve app data dir: {}", e))?;
    let vault_dir = app_dir.join(VAULT_DIRNAME);

    if vault_dir.exists() {
        return Err("Vault already exists".to_string());
    }

    // Create directory structure
    fs::create_dir_all(&vault_dir)
        .map_err(|e| format!("Failed to create vault dir: {}", e))?;
    fs::create_dir_all(vault_dir.join(ENTRIES_DIR))
        .map_err(|e| format!("Failed to create entries dir: {}", e))?;
    fs::create_dir_all(vault_dir.join(IMAGES_DIR))
        .map_err(|e| format!("Failed to create images dir: {}", e))?;

    // Generate and save salt
    let salt = crypto::generate_salt();
    let salt_path = vault_dir.join(SALT_FILENAME);
    fs::write(&salt_path, &salt)
        .map_err(|e| format!("Failed to write salt: {}", e))?;

    // Derive key from password + salt
    let key = crypto::derive_key(&password, &salt);

    // Save vault metadata
    let meta = VaultMeta {
        version: 1,
        created_at: chrono::Utc::now().to_rfc3339(),
        last_accessed: chrono::Utc::now().to_rfc3339(),
    };
    let meta_json = serde_json::to_vec(&meta)
        .map_err(|e| format!("Failed to serialize meta: {}", e))?;
    let meta_path = vault_dir.join(META_FILENAME);
    fs::write(&meta_path, &meta_json)
        .map_err(|e| format!("Failed to write meta: {}", e))?;

    // Update state
    *state.key.lock().unwrap() = Some(key);
    *state.path.lock().unwrap() = Some(vault_dir);
    *state.salt.lock().unwrap() = Some(salt);

    Ok(())
}

#[tauri::command]
pub fn unlock_vault(
    state: State<'_, VaultState>,
    app_handle: tauri::AppHandle,
    password: String,
) -> Result<(), String> {
    let app_dir = app_handle
        .path()
        .app_local_data_dir()
        .map_err(|e| format!("Cannot resolve app data dir: {}", e))?;
    let vault_dir = app_dir.join(VAULT_DIRNAME);

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
    let key = crypto::derive_key(&password, &salt);

    // Verify by checking meta file exists (proves vault integrity)
    let meta_path = vault_dir.join(META_FILENAME);
    let _meta_bytes = fs::read(&meta_path)
        .map_err(|e| format!("Vault metadata missing or corrupted: {}", e))?;

    // Update state
    *state.key.lock().unwrap() = Some(key);
    *state.path.lock().unwrap() = Some(vault_dir);
    *state.salt.lock().unwrap() = Some(salt);

    Ok(())
}

#[tauri::command]
pub fn lock_vault(state: State<'_, VaultState>) -> Result<(), String> {
    *state.key.lock().unwrap() = None;
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

    // Serialize + encrypt
    let plaintext = serde_json::to_vec(&entry)
        .map_err(|e| format!("Failed to serialize entry: {}", e))?;
    let encrypted = crypto::encrypt(&key, &plaintext)
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

    // Write atomically: temp file → rename
    let entry_path = entries_dir.join(format!("{}.rkd", date));
    let temp_path = entry_path.with_extension("tmp");
    fs::write(&temp_path, &rkd_data)
        .map_err(|e| format!("Failed to write temp entry: {}", e))?;
    fs::rename(&temp_path, &entry_path)
        .map_err(|e| format!("Failed to write entry: {}", e))?;

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
    let vault_dir = state.path.lock().unwrap().clone()
        .ok_or("Vault is not initialized")?;
    let key = key_guard(&state)?;

    let entries_dir = vault_dir.join(ENTRIES_DIR);

    if !entries_dir.exists() {
        return Ok(Vec::new());
    }

    let mut summaries = Vec::new();

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

        // Try to read the entry
        if let Ok(diary) = read_entry(&vault_dir, &key, filename) {
            let word_count = count_words(&diary.content);
            summaries.push(DiarySummary {
                date: diary.date,
                title: diary.title,
                word_count,
                has_images: !diary.images.is_empty(),
                mood: diary.mood,
            });
        }
    }

    // Sort descending by date
    summaries.sort_by(|a, b| b.date.cmp(&a.date));

    Ok(summaries)
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
    let all = list_diaries(state)?;
    let query_lower = query.to_lowercase();

    let filtered: Vec<DiarySummary> = all
        .into_iter()
        .filter(|summary| {
            // Date range filter
            if let Some(ref from) = date_from {
                if summary.date < *from {
                    return false;
                }
            }
            if let Some(ref to) = date_to {
                if summary.date > *to {
                    return false;
                }
            }
            // Mood filter
            if let Some(ref m) = mood_filter {
                if summary.mood.as_deref() != Some(m.as_str()) {
                    return false;
                }
            }
            // Text search on date and title
            if !query_lower.is_empty() {
                let date_match = summary.date.contains(&query_lower);
                let title_match = summary.title
                    .as_ref()
                    .map(|t| t.to_lowercase().contains(&query_lower))
                    .unwrap_or(false);
                return date_match || title_match;
            }
            true
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

    let entries_dir = vault_dir.join(ENTRIES_DIR);
    if !entries_dir.exists() {
        return Err("No entries to export".to_string());
    }

    let path = Path::new(&output_path);
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

        zip.start_file(filename, zip::write::FileOptions::default()
            .compression_method(zip::CompressionMethod::Deflated)
            .unix_permissions(0o600))
            .map_err(|e| format!("Zip write error: {}", e))?;
        use std::io::Write;
        zip.write_all(&data)
            .map_err(|e| format!("Zip data write error: {}", e))?;

        count += 1;
    }

    zip.finish().map_err(|e| format!("Zip finalize error: {}", e))?;

    Ok(count)
}

// ---- Internal Helpers ----

fn key_guard(state: &State<'_, VaultState>) -> Result<[u8; crypto::KEY_LEN], String> {
    state.key.lock().unwrap().ok_or_else(|| "Vault is locked".to_string())
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

fn count_words(markdown: &str) -> u32 {
    // Strip markdown syntax heuristically, then count words
    let mut plain = String::with_capacity(markdown.len());
    let mut in_code = false;
    for line in markdown.lines() {
        if line.starts_with("```") {
            in_code = !in_code;
            continue;
        }
        if in_code {
            continue;
        }
        // Strip markdown links [text](url) → text
        let mut cleaned = String::new();
        let mut chars = line.chars().peekable();
        while let Some(c) = chars.next() {
            match c {
                '[' => {
                    // Read until ]
                    let mut link_text = String::new();
                    let mut found_end = false;
                    while let Some(ch) = chars.next() {
                        if ch == ']' {
                            found_end = true;
                            break;
                        }
                        link_text.push(ch);
                    }
                    if found_end && chars.peek() == Some(&'(') {
                        chars.next(); // skip (
                        // skip until )
                        while let Some(ch) = chars.next() {
                            if ch == ')' { break; }
                        }
                    }
                    cleaned.push_str(&link_text);
                }
                '`' | '*' | '_' | '#' | '>' | '-' | '!' => {
                    // skip markdown syntax chars
                }
                other => cleaned.push(other),
            }
        }
        plain.push_str(&cleaned);
        plain.push(' ');
    }
    plain.split_whitespace().count() as u32
}
