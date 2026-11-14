use aes_gcm::{
    aead::{Aead, KeyInit},
    Aes256Gcm, Nonce,
};
use pbkdf2::pbkdf2_hmac;
use sha2::{Sha256, Digest};

pub const PBKDF2_ITERATIONS: u32 = 200_000;
pub const SALT_LEN: usize = 16;
pub const NONCE_LEN: usize = 12;
pub const KEY_LEN: usize = 32;

pub fn derive_key(password: &str, salt: &[u8]) -> [u8; KEY_LEN] {
    let mut key = [0u8; KEY_LEN];
    pbkdf2_hmac::<Sha256>(password.as_bytes(), salt, PBKDF2_ITERATIONS, &mut key);
    key
}

pub fn generate_salt() -> [u8; SALT_LEN] {
    rand::random()
}

/// Crockford Base32 alphabet (no I/L/O/U — transcription-ambiguous glyphs are
/// excluded; decoding is case-insensitive, matching normalize_recovery_code).
const RECOVERY_ALPHABET: &[u8] = b"0123456789ABCDEFGHJKMNPQRSTVWXYZ";

/// Generate a recovery code: 5 groups of 5 Crockford Base32 characters
/// ("XXXXX-XXXXX-XXXXX-XXXXX-XXXXX", 25 chars ≈ 125 bits).
///
/// The recovery code is the second key-holder in the DEK envelope scheme
/// (see vault.rs): it derives its own KEK that seals the same DEK the password
/// seals, so either one unlocks the vault. 125 bits of entropy makes online
/// brute force hopeless even before PBKDF2.
pub fn generate_recovery_code() -> String {
    let bytes: [u8; 16] = rand::random();
    let mut out = String::with_capacity(29); // 25 chars + 4 dashes
    for i in 0..25 {
        let bit = i * 5;
        let byte_idx = bit / 8;
        let shift = bit % 8;
        let v: u8 = if shift <= 3 {
            (bytes[byte_idx] >> (3 - shift)) & 0x1f
        } else {
            // The 5-bit group spans two bytes.
            let hi = (bytes[byte_idx] as u16) << 8;
            let next = if byte_idx + 1 < bytes.len() {
                bytes[byte_idx + 1] as u16
            } else {
                0
            };
            (((hi | next) >> (16 - 5 - shift)) & 0x1f) as u8
        };
        out.push(RECOVERY_ALPHABET[v as usize] as char);
        if (i + 1) % 5 == 0 && i != 24 {
            out.push('-');
        }
    }
    out
}

/// Normalize a user-typed recovery code before deriving its KEK: uppercase,
/// drop whitespace and dashes (people retype codes with all kinds of spacing).
pub fn normalize_recovery_code(code: &str) -> String {
    code
        .chars()
        .filter(|c| !c.is_whitespace() && *c != '-')
        .map(|c| c.to_ascii_uppercase())
        .collect()
}

pub fn encrypt(key: &[u8; KEY_LEN], plaintext: &[u8]) -> Result<Vec<u8>, String> {
    let cipher = Aes256Gcm::new_from_slice(key)
        .map_err(|e| format!("Key init error: {}", e))?;

    let nonce_bytes: [u8; NONCE_LEN] = rand::random();
    let nonce = Nonce::from_slice(&nonce_bytes);

    let ciphertext = cipher
        .encrypt(nonce, plaintext)
        .map_err(|e| format!("Encryption error: {}", e))?;

    // output = [nonce (12 bytes)] [ciphertext+tag]
    let mut out = Vec::with_capacity(NONCE_LEN + ciphertext.len());
    out.extend_from_slice(&nonce_bytes);
    out.extend_from_slice(&ciphertext);
    Ok(out)
}

/// 提示答案哈希的方案标识。写进存储字符串的前缀，校验时据此分流。
///
/// 为什么需要版本化：2026-11 之前存的是裸 `sha256(小写去空白)` —— 无盐、无迭代、
/// 一次 SHA256 就能试一个猜测。提示答案本身是低熵的（宠物名、门牌号、生日），
/// 拿到 vault.meta 的人可以在秒级枚举出答案，虽然解不开日记正文（正文走
/// PBKDF2 200k 派生的密钥），但会泄露用户的私人信息。改成加盐 PBKDF2 后，
/// 每次猜测的代价与主口令一致；旧值必须仍能校验，否则存量用户会被锁在
/// 删除门外面。
pub const HINT_HASH_SCHEME: &str = "pbkdf2-sha256";

/// 提示答案的规范化：去首尾空白 + 小写。与旧实现逐字节一致 ——
/// 存量裸 SHA256 是对同一规范化结果求的，改了这里存量校验会全部失败。
pub fn normalize_hint_answer(answer: &str) -> String {
    answer.trim().to_lowercase()
}

fn to_hex(bytes: &[u8]) -> String {
    let mut s = String::with_capacity(bytes.len() * 2);
    for b in bytes {
        s.push_str(&format!("{:02x}", b));
    }
    s
}

fn from_hex(s: &str) -> Option<Vec<u8>> {
    if s.len() & 1 == 1 {
        return None;
    }
    let bytes = s.as_bytes();
    let mut out = Vec::with_capacity(s.len() / 2);
    let nibble = |c: u8| -> Option<u8> {
        match c {
            b'0'..=b'9' => Some(c - b'0'),
            b'a'..=b'f' => Some(c - b'a' + 10),
            b'A'..=b'F' => Some(c - b'A' + 10),
            _ => None,
        }
    };
    for pair in bytes.chunks(2) {
        out.push((nibble(pair[0])? << 4) | nibble(pair[1])?);
    }
    Some(out)
}

/// 定长比较，避免按字节短路泄露「前几位对上了」。
fn ct_eq(a: &[u8], b: &[u8]) -> bool {
    if a.len() != b.len() {
        return false;
    }
    let mut diff = 0u8;
    for (x, y) in a.iter().zip(b.iter()) {
        diff |= x ^ y;
    }
    diff == 0
}

/// 生成提示答案的存储值：`pbkdf2-sha256$<轮数>$<盐hex>$<摘要hex>`。
///
/// 每次调用都用新的随机盐 —— 同一个人用同一句答案建两个库，
/// 存储值也不同，无法据此判断「这两台机器是同一个提示答案」。
pub fn hash_hint_answer(answer: &str) -> String {
    let normalized = normalize_hint_answer(answer);
    let salt = generate_salt();
    let mut digest = [0u8; KEY_LEN];
    pbkdf2_hmac::<Sha256>(
        normalized.as_bytes(),
        &salt,
        PBKDF2_ITERATIONS,
        &mut digest,
    );
    format!(
        "{}${}${}${}",
        HINT_HASH_SCHEME,
        PBKDF2_ITERATIONS,
        to_hex(&salt),
        to_hex(&digest)
    )
}

/// 校验提示答案。同时接受新格式与旧的无盐 SHA256（64 位十六进制）。
///
/// 旧格式只是为存量库保留的读路径；`hint_hash_needs_upgrade` 为真时，
/// 调用方应在答对后把存储值升级成新格式。
pub fn verify_hint_answer_hash(answer: &str, stored: &str) -> bool {
    let normalized = normalize_hint_answer(answer);
    let stored = stored.trim();

    if let Some(rest) = stored.strip_prefix(HINT_HASH_SCHEME).and_then(|s| s.strip_prefix('$')) {
        let mut parts = rest.splitn(3, '$');
        let (Some(iter_s), Some(salt_hex), Some(digest_hex)) =
            (parts.next(), parts.next(), parts.next())
        else {
            return false;
        };
        // 轮数以存储值为准（便于以后调高而不破坏旧值），但拒收 0 轮。
        let Ok(iterations) = iter_s.parse::<u32>() else {
            return false;
        };
        if iterations == 0 {
            return false;
        }
        let (Some(salt), Some(expected)) = (from_hex(salt_hex), from_hex(digest_hex)) else {
            return false;
        };
        if salt.is_empty() || expected.len() != KEY_LEN {
            return false;
        }
        let mut digest = [0u8; KEY_LEN];
        pbkdf2_hmac::<Sha256>(normalized.as_bytes(), &salt, iterations, &mut digest);
        return ct_eq(&digest, &expected);
    }

    // 旧格式：裸 sha256 hex。
    let Some(expected) = from_hex(stored) else {
        return false;
    };
    if expected.len() != KEY_LEN {
        return false;
    }
    let legacy = Sha256::digest(normalized.as_bytes());
    ct_eq(legacy.as_slice(), &expected)
}

/// 存储值是否还是旧的无盐格式（答对后应升级）。
pub fn hint_hash_needs_upgrade(stored: &str) -> bool {
    match stored.trim().strip_prefix(HINT_HASH_SCHEME) {
        Some(rest) => !rest.starts_with('$'),
        None => true,
    }
}

pub fn decrypt(key: &[u8; KEY_LEN], data: &[u8]) -> Result<Vec<u8>, String> {
    if data.len() < NONCE_LEN {
        return Err("Invalid encrypted data: too short".to_string());
    }

    let cipher = Aes256Gcm::new_from_slice(key)
        .map_err(|e| format!("Key init error: {}", e))?;

    let nonce = Nonce::from_slice(&data[..NONCE_LEN]);
    let plaintext = cipher
        .decrypt(nonce, &data[NONCE_LEN..])
        .map_err(|_| "Decryption failed (wrong password?)".to_string())?;

    Ok(plaintext)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_encrypt_decrypt_roundtrip() {
        let salt = generate_salt();
        let key = derive_key("test_password_123", &salt);

        let plaintext = b"Hello, this is my private diary entry.";
        let encrypted = encrypt(&key, plaintext).unwrap();
        let decrypted = decrypt(&key, &encrypted).unwrap();

        assert_eq!(plaintext.to_vec(), decrypted);
    }

    #[test]
    fn test_wrong_key_fails() {
        let salt = generate_salt();
        let key1 = derive_key("correct_password", &salt);
        let key2 = derive_key("wrong_password", &salt);

        let plaintext = b"secret text";
        let encrypted = encrypt(&key1, plaintext).unwrap();
        let result = decrypt(&key2, &encrypted);

        assert!(result.is_err());
    }

    #[test]
    fn test_different_salts_produce_different_keys() {
        let salt1 = generate_salt();
        let salt2 = generate_salt();
        let key1 = derive_key("same_password", &salt1);
        let key2 = derive_key("same_password", &salt2);

        assert_ne!(key1, key2);
    }

    /// Recovery codes: 5 groups of 5 Crockford Base32 chars, no ambiguous
    /// glyphs, unique per call, and normalization tolerates retyping habits.
    #[test]
    fn test_recovery_code_format_and_normalization() {
        let code = generate_recovery_code();
        assert_eq!(code.len(), 29, "expected XXXXX-XXXXX-XXXXX-XXXXX-XXXXX");
        let groups: Vec<&str> = code.split('-').collect();
        assert_eq!(groups.len(), 5);
        for g in &groups {
            assert_eq!(g.len(), 5);
            assert!(g.chars().all(|c| c.is_ascii_digit() || c.is_ascii_uppercase()));
            assert!(!g.contains('I') && !g.contains('L') && !g.contains('O') && !g.contains('U'));
        }
        // Two codes must differ (125-bit space).
        assert_ne!(code, generate_recovery_code());

        // Normalization: lowercase + spaces + dashes all fold into the same key.
        let spaced = format!("{} {}", &code[..5], &code[6..]);
        assert_eq!(normalize_recovery_code(&code), normalize_recovery_code(&spaced));
        assert_eq!(normalize_recovery_code(&code), normalize_recovery_code(&code.to_lowercase()));
    }

    /// 旧实现（无盐 SHA256）的原样复刻，只用于验证兼容路径。
    /// 一旦有人「顺手统一」了规范化逻辑，这里会红 —— 这正是它的用途。
    fn legacy_hint_hash(answer: &str) -> String {
        let normalized = answer.trim().to_lowercase();
        let hash = Sha256::digest(normalized.as_bytes());
        hash.iter().map(|b| format!("{:02x}", b)).collect()
    }

    #[test]
    fn hint_hash_roundtrip_and_normalization() {
        let stored = hash_hint_answer("  福州 ");
        assert!(stored.starts_with("pbkdf2-sha256$200000$"));
        assert_eq!(stored.split('$').count(), 4);

        // 答对：大小写与首尾空白不该影响结果（用户重打习惯）。
        assert!(verify_hint_answer_hash("福州", &stored));
        assert!(verify_hint_answer_hash("  福州  ", &stored));

        // 答错：大小写之外的内容必须拒绝。
        assert!(!verify_hint_answer_hash("福州2", &stored));
        assert!(!verify_hint_answer_hash("", &stored));
    }

    #[test]
    fn hint_hash_is_salted_per_call() {
        // 同一句答案两次入库必须不同 —— 否则相同答案的库可以互相识别。
        let a = hash_hint_answer("same answer");
        let b = hash_hint_answer("same answer");
        assert_ne!(a, b);
        assert!(verify_hint_answer_hash("same answer", &a));
        assert!(verify_hint_answer_hash("same answer", &b));
    }

    #[test]
    fn hint_hash_rejects_tampering() {
        let stored = hash_hint_answer("correct horse");
        let mut parts: Vec<String> = stored.split('$').map(|s| s.to_string()).collect();
        // 翻掉摘要最后一个 hex 位
        let last = parts[3].pop().unwrap();
        parts[3].push(if last == '0' { '1' } else { '0' });
        let tampered = parts.join("$");
        assert!(!verify_hint_answer_hash("correct horse", &tampered));
    }

    #[test]
    fn hint_hash_rejects_malformed_storage() {
        for bad in [
            "",
            "not-a-hash",
            "pbkdf2-sha256$",
            "pbkdf2-sha256$0$00$00",        // 0 轮
            "pbkdf2-sha256$200000$abc$00",  // 奇数长度盐
            "pbkdf2-sha256$200000$00$00",   // 摘要长度不对
            "pbkdf2-sha256$xx$00$00",       // 轮数不是数字
            "0123456789abcdef",             // 太短的裸哈希
        ] {
            assert!(
                !verify_hint_answer_hash("anything", bad),
                "should reject: {bad}"
            );
        }
    }

    #[test]
    fn legacy_sha256_still_verifies_and_is_flagged_for_upgrade() {
        let legacy = legacy_hint_hash("我的第一只猫");
        assert_eq!(legacy.len(), 64);
        assert!(hint_hash_needs_upgrade(&legacy));
        // 存量库必须还能过删除门，否则老用户被锁在外面。
        assert!(verify_hint_answer_hash("我的第一只猫", &legacy));
        assert!(verify_hint_answer_hash("  我的第一只猫 ", &legacy));
        assert!(!verify_hint_answer_hash("别的猫", &legacy));

        let upgraded = hash_hint_answer("我的第一只猫");
        assert!(!hint_hash_needs_upgrade(&upgraded));
        assert!(verify_hint_answer_hash("我的第一只猫", &upgraded));
    }

    #[test]
    fn legacy_hash_uppercase_hex_is_accepted() {
        // 手工改过 meta、或别的工具写出大写 hex 时不该直接判死。
        let legacy = legacy_hint_hash("abc").to_uppercase();
        assert!(verify_hint_answer_hash("abc", &legacy));
    }
}
