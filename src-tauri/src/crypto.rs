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

/// Hash a hint answer for storage (lowercase + trim + sha256 hex).
pub fn hash_hint_answer(answer: &str) -> String {
    let normalized = answer.trim().to_lowercase();
    let hash = Sha256::digest(normalized.as_bytes());
    hash.iter().map(|b| format!("{:02x}", b)).collect()
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
}
