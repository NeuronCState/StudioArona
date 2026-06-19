//! 主密钥管理 + AEAD (AES-256-GCM) 加解密 — 给 agent_secrets 用 (P1#2).
//!
//! 设计:
//! - 主密钥从 env `APP_MASTER_KEY` 读: 64 hex chars (= 32 bytes raw key)
//! - 主密钥解析失败 → 启动失败 (production 模式)
//! - 每个 secret 有独立 12-byte nonce, 跟密文一起存
//! - key_version = 1 (后续轮换可扩展到 2)
//! - key 不打日志, 加密 plaintext 不打日志, 错误信息只打 size + 字段名
//!
//! 应用场景:
//! - encrypt(key_id, plaintext) -> (ciphertext_b64, nonce_b64)
//! - decrypt(key_id, ciphertext_b64, nonce_b64) -> plaintext
//!
//! 简易 KDF: 主密钥 + secret_key 当 salt → 派生 per-secret 子密钥.
//! 这样不同 secret 的 nonce 重用风险更小, 也方便未来按 secret_key 单独 rotate.

use aes_gcm::{aead::AeadInPlace, AeadCore, Aes256Gcm, KeyInit, Nonce};
use anyhow::{anyhow, Result};
use base64::{engine::general_purpose::STANDARD as B64, Engine as _};
use rand::rngs::OsRng;
use sha2::{Digest, Sha256};

/// H3 修复: 加密算法版本.
pub const V1_NO_AAD: u32 = 1; // 旧: 无 AAD, 子密钥派生用 master + secret_key. 已被 F4 替换.
/// 新: AAD = `user_id || 0x00 || secret_key`. 任何跨用户移动 / 篡改 → decrypt 失败.
pub const V2_WITH_AAD: u32 = 2;
/// 新写入永远用 v2. 旧 (v1) 密文在 reader 解密时惰性重加密到 v2.
pub const CURRENT_KEY_VERSION: u32 = V2_WITH_AAD;

/// 主密钥缓存 (启动时从 env 读一次, 后续不再读).
/// 用 `OnceLock` 保证读一次后不再访问 env (避免 runtime hot-reload 的密钥漂移).
static MASTER_KEY: std::sync::OnceLock<[u8; 32]> = std::sync::OnceLock::new();

/// 加载并校验主密钥. dev 模式自动 seed 一个 (生产警告日志); production 必须显式提供.
pub fn load_master_key(is_production: bool) -> Result<[u8; 32]> {
    if let Some(k) = MASTER_KEY.get() {
        return Ok(*k);
    }
    let raw = std::env::var("APP_MASTER_KEY").unwrap_or_default();
    let key = if raw.is_empty() {
        if is_production {
            return Err(anyhow!(
                "APP_MASTER_KEY is required in production (64 hex chars = 32 bytes)"
            ));
        }
        // Dev 兜底: 固定 32 字节 dev key (启动有 WARN 日志)
        let mut dev = [0u8; 32];
        for (i, b) in dev.iter_mut().enumerate() {
            *b = (i as u8).wrapping_mul(7);
        }
        tracing::warn!("APP_MASTER_KEY not set; using built-in DEV key. Do NOT use in production.");
        dev
    } else {
        parse_hex_key(&raw)?
    };

    let _ = MASTER_KEY.set(key);
    Ok(key)
}

fn parse_hex_key(s: &str) -> Result<[u8; 32]> {
    let s = s.trim();
    if s.len() != 64 {
        return Err(anyhow!(
            "APP_MASTER_KEY must be 64 hex chars (32 bytes); got {} chars",
            s.len()
        ));
    }
    let bytes = hex::decode(s).map_err(|e| anyhow!("APP_MASTER_KEY not valid hex: {e}"))?;
    if bytes.len() != 32 {
        return Err(anyhow!(
            "APP_MASTER_KEY decoded to {} bytes; expected 32",
            bytes.len()
        ));
    }
    let mut out = [0u8; 32];
    out.copy_from_slice(&bytes);
    Ok(out)
}

/// 从 secret_key 派生 per-secret 子密钥 (32 bytes). 不存, 只在内存算.
fn derive_subkey(master: &[u8; 32], secret_key: &str) -> [u8; 32] {
    let mut h = Sha256::new();
    h.update(master);
    h.update(b"|");
    h.update(secret_key.as_bytes());
    let out = h.finalize();
    let mut key = [0u8; 32];
    key.copy_from_slice(&out);
    key
}

/// F4 修复: 加密 / 解密必须用 user_id 当 AAD.
///
/// 旧实现问题 (v1): 子密钥派生用 `master + secret_key`, AES-GCM 加密时 **没有 AAD**.
/// 同 secret_key 跨用户使用同一子密钥; 密文被错误移动到另一用户的行 (DB 错配 / 入侵篡改)
/// 时, 解密仍成功, 不会发现租户错配.
///
/// 新实现 (v2): AAD = `user_id || 0x00 || secret_key`. AES-GCM 的 AAD 被 GCM tag 完整性覆盖,
/// 任何篡改 (换 user_id, 换 secret_key, 改 ciphertext) 都会让 decrypt 失败.
fn aad_bytes(user_id: &str, secret_key: &str) -> Vec<u8> {
    let mut aad = Vec::with_capacity(user_id.len() + secret_key.len() + 1);
    aad.extend_from_slice(user_id.as_bytes());
    aad.push(0x00);
    aad.extend_from_slice(secret_key.as_bytes());
    aad
}

/// 加密 (v2, AAD 绑 user_id). 返回 (ciphertext_b64, nonce_b64).
/// 新写入永远走这里. key_version = V2_WITH_AAD.
pub fn encrypt_v2(user_id: &str, secret_key: &str, plaintext: &[u8]) -> Result<(String, String)> {
    let master = load_master_key(false).map_err(|e| anyhow!("key load: {e}"))?;
    let key = derive_subkey(&master, secret_key);
    let cipher = Aes256Gcm::new(&key.into());
    let nonce_bytes = Aes256Gcm::generate_nonce(&mut OsRng);
    let aad = aad_bytes(user_id, secret_key);

    // encrypt_in_place: 拷贝 plaintext 到 buffer, 加密 in place. ciphertext = buffer + tag.
    let mut buf = plaintext.to_vec();
    let tag = cipher
        .encrypt_in_place_detached(&nonce_bytes, &aad, &mut buf)
        .map_err(|e| anyhow!("aead encrypt: {}", redact(&e.to_string())))?;
    // 拼接 ciphertext || tag
    let mut ct_with_tag = buf;
    ct_with_tag.extend_from_slice(tag.as_slice());
    Ok((B64.encode(ct_with_tag), B64.encode(nonce_bytes)))
}

/// 加密顶层入口 — 永远用 v2. 旧调用方兼容 (key_version 隐式 v2).
pub fn encrypt(user_id: &str, secret_key: &str, plaintext: &[u8]) -> Result<(String, String)> {
    encrypt_v2(user_id, secret_key, plaintext)
}

/// 解密 v2 (AAD 绑 user_id). 失败时返 Err, 错误信息只含 key 标识 (不含密文 / nonce).
/// 验 AAD 失败 → 视为"租户错配" (密文可能属于别的 user_id).
pub fn decrypt_v2(
    user_id: &str,
    secret_key: &str,
    ciphertext_b64: &str,
    nonce_b64: &str,
) -> Result<Vec<u8>> {
    let master = load_master_key(false).map_err(|e| anyhow!("key load: {e}"))?;
    let key = derive_subkey(&master, secret_key);
    let cipher = Aes256Gcm::new(&key.into());
    let nonce_bytes = B64
        .decode(nonce_b64)
        .map_err(|e| anyhow!("nonce base64 decode: {e}"))?;
    if nonce_bytes.len() != 12 {
        return Err(anyhow!("nonce length invalid"));
    }
    let ct_with_tag = B64
        .decode(ciphertext_b64)
        .map_err(|e| anyhow!("ciphertext base64 decode: {e}"))?;
    if ct_with_tag.len() < 16 {
        return Err(anyhow!("ciphertext too short (missing tag)"));
    }
    let (ct, tag_bytes) = ct_with_tag.split_at(ct_with_tag.len() - 16);
    let nonce = Nonce::from_slice(&nonce_bytes);
    let aad = aad_bytes(user_id, secret_key);

    // decrypt_in_place: AAD 不匹配 → 立即失败 (防租户错配)
    let mut buf = ct.to_vec();
    cipher
        .decrypt_in_place_detached(nonce, &aad, &mut buf, tag_bytes.into())
        .map_err(|_| {
            anyhow!(
                "decrypt v2 failed (wrong key, tampered ciphertext, user_id mismatch, or rotated key version)"
            )
        })?;
    Ok(buf)
}

/// H3: 旧 v1 加密 (无 AAD, master + secret_key 派生子密钥). 用于兼容升级前已存的密文.
/// 升级路径: 读取 v1 → decrypt_v1 → 重加密为 v2 (encrypt_v2) → 写回 DB → 下次走 v2 路径.
///
/// 返回 (ciphertext_b64, nonce_b64). 跟 v2 一样的 ciphertext || tag 拼一起的存储格式.
pub fn encrypt_v1(secret_key: &str, plaintext: &[u8]) -> Result<(String, String)> {
    let master = load_master_key(false).map_err(|e| anyhow!("key load: {e}"))?;
    let key = derive_subkey(&master, secret_key);
    let cipher = Aes256Gcm::new(&key.into());
    let nonce_bytes = Aes256Gcm::generate_nonce(&mut OsRng);
    // v1: 不传 aad 参数 (空切片)
    let mut buf = plaintext.to_vec();
    let tag = cipher
        .encrypt_in_place_detached(&nonce_bytes, &[], &mut buf)
        .map_err(|e| anyhow!("aead encrypt v1: {}", redact(&e.to_string())))?;
    let mut ct_with_tag = buf;
    ct_with_tag.extend_from_slice(tag.as_slice());
    Ok((B64.encode(ct_with_tag), B64.encode(nonce_bytes)))
}

/// H3: 旧 v1 解密 (无 AAD, master + secret_key 派生子密钥). 用于兼容升级前已存的密文.
pub fn decrypt_v1(secret_key: &str, ciphertext_b64: &str, nonce_b64: &str) -> Result<Vec<u8>> {
    let master = load_master_key(false).map_err(|e| anyhow!("key load: {e}"))?;
    let key = derive_subkey(&master, secret_key);
    let cipher = Aes256Gcm::new(&key.into());
    let nonce_bytes = B64
        .decode(nonce_b64)
        .map_err(|e| anyhow!("nonce base64 decode: {e}"))?;
    if nonce_bytes.len() != 12 {
        return Err(anyhow!("nonce length invalid"));
    }
    let ct_with_tag = B64
        .decode(ciphertext_b64)
        .map_err(|e| anyhow!("ciphertext base64 decode: {e}"))?;
    if ct_with_tag.len() < 16 {
        return Err(anyhow!("ciphertext too short (missing tag)"));
    }
    let (ct, tag_bytes) = ct_with_tag.split_at(ct_with_tag.len() - 16);
    let nonce = Nonce::from_slice(&nonce_bytes);
    let mut buf = ct.to_vec();
    cipher
        .decrypt_in_place_detached(nonce, &[], &mut buf, tag_bytes.into())
        .map_err(|_| {
            anyhow!("decrypt v1 failed (wrong key, tampered ciphertext, or wrong key version)")
        })?;
    Ok(buf)
}

/// H3: 顶层 dispatch — 按 key_version 调对应版本. 惰性重加密 v1 → v2 由 caller
/// (agent_config.rs) 负责, 这里只解密.
pub fn decrypt_versioned(
    user_id: &str,
    secret_key: &str,
    ciphertext_b64: &str,
    nonce_b64: &str,
    key_version: u32,
) -> Result<Vec<u8>> {
    match key_version {
        V1_NO_AAD => decrypt_v1(secret_key, ciphertext_b64, nonce_b64),
        V2_WITH_AAD => decrypt_v2(user_id, secret_key, ciphertext_b64, nonce_b64),
        other => Err(anyhow!("unsupported key_version: {other}")),
    }
}

/// 生成 secret 掩码 (前 4 + 后 4 字符, 中间 `***`). 用于 API 响应展示.
pub fn mask_secret(plaintext: &str) -> String {
    let len = plaintext.chars().count();
    if len <= 8 {
        return "***".to_string();
    }
    let prefix: String = plaintext.chars().take(4).collect();
    let suffix: String = plaintext.chars().skip(len - 4).collect();
    format!("{prefix}***{suffix}")
}

/// 简单 hex encode (不引 hex crate, 因为已经在 Cargo.lock 但依赖很小)
mod hex {
    pub fn decode(s: &str) -> Result<Vec<u8>, String> {
        if !s.len().is_multiple_of(2) {
            return Err("odd length".into());
        }
        let mut out = Vec::with_capacity(s.len() / 2);
        for i in (0..s.len()).step_by(2) {
            let b = u8::from_str_radix(&s[i..i + 2], 16).map_err(|e| e.to_string())?;
            out.push(b);
        }
        Ok(out)
    }
}

fn redact(s: &str) -> String {
    if s.len() <= 16 {
        "<redacted>".into()
    } else {
        format!("{}…<redacted>", &s[..16])
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn dev_master() {
        // 测试时显式加载 (env 干净的情况下 load_master_key 会用 dev fallback)
        let _ = load_master_key(false);
    }

    #[test]
    fn parse_hex_key_rejects_short() {
        assert!(parse_hex_key("abcd").is_err());
        assert!(parse_hex_key(&"a".repeat(64)).is_ok());
    }

    #[test]
    fn parse_hex_key_rejects_non_hex() {
        assert!(parse_hex_key(&"z".repeat(64)).is_err());
    }

    #[test]
    fn encrypt_decrypt_round_trip() {
        dev_master();
        let user_id = "user-alice";
        let secret_key = "openai_api_key";
        let plaintext = b"sk-proj-1234567890abcdefghij";
        let (ct, nonce) = encrypt(user_id, secret_key, plaintext).unwrap();
        assert!(!ct.is_empty());
        assert!(!nonce.is_empty());
        let pt = decrypt_v2(user_id, secret_key, &ct, &nonce).unwrap();
        assert_eq!(pt, plaintext);
    }

    #[test]
    fn decrypt_with_wrong_key_fails() {
        dev_master();
        let (ct, nonce) = encrypt("user-alice", "openai_api_key", b"hello").unwrap();
        // 不同 secret_key → 不同 subkey → 应失败
        let r = decrypt_v2("user-alice", "anthropic_api_key", &ct, &nonce);
        assert!(r.is_err());
    }

    /// H3 关键测试: v1 加密 (无 AAD) 仍能解密 — 升级前的密文不能 500.
    /// v1 → v1 走无 AAD 路径, dispatch 用 key_version=V1_NO_AAD.
    #[test]
    fn v1_round_trip_no_aad() {
        dev_master();
        let plaintext = b"legacy secret from before H3 upgrade";
        let (ct, nonce) = encrypt_v1("legacy_key", plaintext).unwrap();
        // 用 v1 dispatch 读 → 成功
        let pt = decrypt_versioned("any_user", "legacy_key", &ct, &nonce, V1_NO_AAD).unwrap();
        assert_eq!(pt, plaintext);
    }

    /// H3 关键测试: v1 密文不能用 v2 路径读 — AAD 不匹配 → 失败.
    /// 这强制升级路径: 读 v1 必须明确指定 key_version=1, 不能用 v2 兜底.
    #[test]
    fn v1_ciphertext_rejected_by_v2_dispatch() {
        dev_master();
        let (ct, nonce) = encrypt_v1("k", b"x").unwrap();
        let r = decrypt_versioned("user-alice", "k", &ct, &nonce, V2_WITH_AAD);
        assert!(r.is_err(), "v1 密文不能被 v2 dispatch 解密 (AAD 不匹配)");
    }

    /// H3 关键测试: v2 密文不能用 v1 路径读 — 旧 v1 没考虑 tag 拼接格式 → 失败.
    /// v1 升级必须先把 v1 ciphertext 读出来, 重写为 v2, 才能用 v2 dispatch.
    #[test]
    fn v2_ciphertext_rejected_by_v1_dispatch() {
        dev_master();
        let (ct, nonce) = encrypt_v2("user-alice", "k", b"x").unwrap();
        let r = decrypt_versioned("user-alice", "k", &ct, &nonce, V1_NO_AAD);
        assert!(r.is_err(), "v2 密文 (新格式) 不能用 v1 dispatch 解密");
    }

    /// H3 升级路径端到端: v1 加密 → v1 dispatch 读 → 重加密 v2 → v2 dispatch 读.
    /// 这就是 agent_config.rs list_secrets 走的路径.
    #[test]
    fn v1_to_v2_upgrade_path() {
        dev_master();
        let user_id = "user-alice";
        let secret_key = "openai_api_key";
        let plaintext = b"sk-proj-v1-data";

        // 1. v1 加密
        let (v1_ct, v1_nonce) = encrypt_v1(secret_key, plaintext).unwrap();

        // 2. v1 dispatch 解密
        let pt1 = decrypt_versioned(user_id, secret_key, &v1_ct, &v1_nonce, V1_NO_AAD).unwrap();
        assert_eq!(pt1, plaintext);

        // 3. 重加密 v2
        let (v2_ct, v2_nonce) = encrypt_v2(user_id, secret_key, &pt1).unwrap();
        assert_ne!(v2_ct, v1_ct, "v2 ciphertext 应该跟 v1 不同");
        assert_ne!(v2_nonce, v1_nonce, "v2 nonce 应该跟 v1 不同");

        // 4. v2 dispatch 解密
        let pt2 = decrypt_versioned(user_id, secret_key, &v2_ct, &v2_nonce, V2_WITH_AAD).unwrap();
        assert_eq!(pt2, plaintext);

        // 5. 旧 v1 ciphertext 现在再被 v1 dispatch 读仍 OK (兼容保留),
        //    但 v2 拒绝 (因为 v1 ciphertext 缺乏 AAD)
        let r = decrypt_versioned(user_id, secret_key, &v1_ct, &v1_nonce, V2_WITH_AAD);
        assert!(r.is_err());
    }

    #[test]
    fn current_key_version_is_v2() {
        // 防御: 防止有人误改回 v1.
        assert_eq!(CURRENT_KEY_VERSION, V2_WITH_AAD);
    }

    /// F4 关键测试: 同 secret_key 跨 user_id — 密文被错误移动/篡改到另一用户行 → 解密失败.
    /// 旧实现没有 AAD, 这种情况解密会成功, 暴露租户错配.
    #[test]
    fn cross_user_same_secret_key_fails() {
        dev_master();
        let alice = "user-alice";
        let bob = "user-bob";
        let secret_key = "openai_api_key"; // 两人都用这 key
        let plaintext = b"alice's secret value";
        let (ct, nonce) = encrypt(alice, secret_key, plaintext).unwrap();
        // 正常 Alice 解密 → 成功
        let pt = decrypt_v2(alice, secret_key, &ct, &nonce).unwrap();
        assert_eq!(pt, plaintext);
        // 同样密文被 Bob 解密 → 应该失败 (AAD 不匹配, GCM tag 验证不过)
        let r = decrypt_v2(bob, secret_key, &ct, &nonce);
        assert!(
            r.is_err(),
            "同 secret_key 跨 user_id 必须失败 (AAD 检测租户错配)"
        );
    }

    #[test]
    fn tampered_ciphertext_fails() {
        dev_master();
        let (ct, nonce) = encrypt("user-alice", "openai_api_key", b"hello").unwrap();
        // 改一个字符 (flip base64 last char of ciphertext)
        let mut bad_ct = ct;
        let last = bad_ct.pop().unwrap();
        bad_ct.push(if last == 'A' { 'B' } else { 'A' });
        assert!(decrypt_v2("user-alice", "openai_api_key", &bad_ct, &nonce).is_err());
    }

    #[test]
    fn nonce_uniqueness() {
        // 同一密钥同一明文, 两次加密应给不同 nonce (OS RNG)
        dev_master();
        let (_, n1) = encrypt("user-alice", "k", b"x").unwrap();
        let (_, n2) = encrypt("user-alice", "k", b"x").unwrap();
        assert_ne!(n1, n2);
    }

    #[test]
    fn mask_secret_short_returns_stars() {
        assert_eq!(mask_secret("ab"), "***");
        assert_eq!(mask_secret("12345678"), "***");
    }

    #[test]
    fn mask_secret_long_keeps_edges() {
        let m = mask_secret("sk-proj-abcdefghij1234567890ABCD");
        assert!(m.starts_with("sk-p"));
        assert!(m.ends_with("ABCD"));
        assert!(m.contains("***"));
    }

    #[test]
    fn ciphertext_differs_for_same_plaintext_due_to_nonce() {
        dev_master();
        let (c1, _) = encrypt("user-alice", "k", b"hello").unwrap();
        let (c2, _) = encrypt("user-alice", "k", b"hello").unwrap();
        assert_ne!(c1, c2);
    }
}
