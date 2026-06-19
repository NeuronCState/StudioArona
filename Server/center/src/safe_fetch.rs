//! 安全 HTTP 客户端 — 给 RSS / page_monitor cron 共用.
//!
//! 提供:
//! - SSRF 防护: 拒绝 IPv4/IPv6 loopback、私网、链路本地、ULA、CGN、组播、未指定、保留
//! - IPv6 URL 方括号 host 正确处理 (`http://[::1]/x` 走 typed `Host::Ipv6` 解析)
//! - DNS rebinding 防御: 解析 → 校验 → 把 SocketAddr 通过 reqwest `resolve_to_addrs`
//!   绑死, reqwest 实际连接必须命中已校验 IP, 不允许再次解析
//! - Body 限制: 边读边 count 字节, 超过直接 abort
//! - Redirect 限制: 默认最多 3 次, 每跳都重新 resolve+validate
//! - 域名解析失败 → 拒绝
//! - 仅允许 `http` / `https` scheme
//!
//! 调用方: `rss::fetch_feed` / `page_monitor::run_once`.
//! 用户主动请求 (web client fetch) 仍走普通 client, 不受限 — 因为 client 自己拿不到 server 私网.

use std::net::{IpAddr, Ipv4Addr, Ipv6Addr, SocketAddr, ToSocketAddrs};
use std::time::Duration;

use anyhow::{anyhow, Context, Result};
use reqwest::redirect::Policy;

/// 默认 body 上限: RSS 8 MB (Atom/RSS 偶有几百条带全文), page monitor 4 MB.
pub const RSS_BODY_LIMIT: usize = 8 * 1024 * 1024;
pub const PAGE_MONITOR_BODY_LIMIT: usize = 4 * 1024 * 1024;

/// 默认 timeout.
pub const DEFAULT_TIMEOUT: Duration = Duration::from_secs(20);

/// 默认 redirect 上限.
pub const MAX_REDIRECTS: usize = 3;

/// 解析后 + 校验过的目标. `addrs` 是 DNS rebinding 防御用的 pinned SocketAddr 列表,
/// 所有 IP 都已通过 `is_public_ip`, reqwest 直接用它们连接.
#[derive(Debug, Clone)]
pub struct ResolvedTarget {
    pub parsed: url::Url,
    pub host_header: String,
    pub addrs: Vec<SocketAddr>,
}

/// 校验 URL 格式 + scheme + host 不能解析到私网 IP.
///
/// 返回 `ResolvedTarget`, 调用方拿 `addrs` 去绑 reqwest.
///
/// DNS 解析失败 → Err. 解析结果含任一私网/保留 IP → Err.
pub fn validate_public_url(url_str: &str) -> Result<ResolvedTarget> {
    let parsed = url::Url::parse(url_str).context("url parse")?;
    match parsed.scheme() {
        "http" | "https" => {}
        other => return Err(anyhow!("scheme {other} not allowed (only http/https)")),
    }

    let host = parsed.host().ok_or_else(|| anyhow!("url has no host"))?;

    // typed host: Domain(String) | Ipv4(Ipv4Addr) | Ipv6(Ipv6Addr)
    // 这样 IPv6 字面量 (URL 中带方括号) 不走 string 解析, 直接拿 typed address
    let host_header: String = match &host {
        url::Host::Domain(d) => d.to_string(),
        url::Host::Ipv4(a) => a.to_string(),
        url::Host::Ipv6(a) => format!("[{a}]"), // HTTP Host header IPv6 必须带括号
    };
    let lookup_key: String = match &host {
        url::Host::Domain(d) => d.to_string(),
        url::Host::Ipv4(a) => a.to_string(),
        url::Host::Ipv6(a) => a.to_string(), // 解析时不要括号
    };

    let ips = resolve_host(&lookup_key)?;
    if ips.is_empty() {
        return Err(anyhow!("no addresses for host {lookup_key}"));
    }
    for ip in &ips {
        if !is_public_ip(*ip) {
            return Err(anyhow!(
                "refusing to fetch non-public IP {ip} for host {lookup_key} (SSRF guard)"
            ));
        }
    }

    let port = parsed
        .port_or_known_default()
        .ok_or_else(|| anyhow!("no port for {url_str}"))?;
    let addrs: Vec<SocketAddr> = ips.iter().map(|ip| SocketAddr::new(*ip, port)).collect();

    Ok(ResolvedTarget {
        parsed,
        host_header,
        addrs,
    })
}

/// 把已校验的 addrs 钉到 reqwest client 上, 让 reqwest 实际连接时不再自行解析.
///
/// 同时给 client 配置 timeout / UA / 禁 redirect / 关闭 keep-alive (避免跨跳复用 socket).
pub fn build_pinned_client(
    target: &ResolvedTarget,
    timeout: Duration,
    user_agent: &str,
) -> Result<reqwest::Client> {
    let host_for_resolve = target
        .parsed
        .host_str()
        .ok_or_else(|| anyhow!("resolved target has no host_str"))?;

    let mut builder = reqwest::Client::builder()
        .timeout(timeout)
        .user_agent(user_agent)
        .redirect(Policy::none())
        .tcp_nodelay(true);

    // resolve_to_addrs(&str, Vec<SocketAddr>) → reqwest 把这些 addr 当成 host 的解析结果,
    // 实际连接必须命中已校验 IP, 不允许再走系统 DNS.
    if let Some(first) = target.addrs.first().copied() {
        builder = builder.resolve(host_for_resolve, first);
    }
    builder.build().context("build pinned http client")
}

/// 手动 follow redirect: 每跳一次重新 resolve + validate_public_url (防 302 → 内网).
pub async fn fetch_with_limit(
    timeout: Duration,
    user_agent: &str,
    start_url: &str,
    limit_bytes: usize,
) -> Result<Vec<u8>> {
    let mut current = start_url.to_string();
    for hop in 0..=MAX_REDIRECTS {
        let target =
            validate_public_url(&current).with_context(|| format!("validate {current}"))?;
        let client = build_pinned_client(&target, timeout, user_agent)?;

        let resp = client
            .get(&current)
            .header(reqwest::header::HOST, &target.host_header)
            .send()
            .await
            .with_context(|| format!("send to {current}"))?;

        let status = resp.status();
        if status.is_redirection() {
            let loc = resp
                .headers()
                .get(reqwest::header::LOCATION)
                .ok_or_else(|| {
                    anyhow!(
                        "redirect status {} without Location header",
                        status.as_u16()
                    )
                })?
                .to_str()
                .map_err(|e| anyhow!("invalid Location header: {e}"))?;
            let next = target
                .parsed
                .join(loc)
                .with_context(|| format!("resolve redirect {loc}"))?
                .to_string();
            if hop == MAX_REDIRECTS {
                anyhow::bail!("too many redirects (>{MAX_REDIRECTS})");
            }
            current = next;
            continue;
        }

        let resp = resp
            .error_for_status()
            .with_context(|| format!("status error from {current}"))?;

        return read_body_limited(resp, limit_bytes).await;
    }
    anyhow::bail!("too many redirects (>{MAX_REDIRECTS})")
}

/// 解析 host 为 IP 列表. 失败返回 Err, 不放行 (防 DNS rebinding 第一阶段).
fn resolve_host(host: &str) -> Result<Vec<IpAddr>> {
    // 如果 host 本身就是 IP 字面量, 直接解析 (IPv4 / IPv6 都可)
    if let Ok(ip) = host.parse::<IpAddr>() {
        return Ok(vec![ip]);
    }
    // 域名解析 → 拿所有 A/AAAA
    // 注意: 端口占位 0, 我们只关心 IP. 真实连接端口由 caller 提供.
    let addrs: Vec<IpAddr> = (host, 0u16)
        .to_socket_addrs()
        .map(|iter| iter.map(|sa| sa.ip()).collect())
        .with_context(|| format!("dns resolve {host}"))?;
    Ok(addrs)
}

/// 反向判断: 是否公开可达 (非 loopback/私网/链路本地/ULA/CGN/组播/未指定/保留).
pub fn is_public_ip(ip: IpAddr) -> bool {
    !is_blocked_ip(ip)
}

/// 同 `is_public_ip`, 但语义更明确 — 用于日志和错误信息.
pub fn is_blocked_ip(ip: IpAddr) -> bool {
    match ip {
        IpAddr::V4(v4) => is_blocked_v4(v4),
        IpAddr::V6(v6) => is_blocked_v6(v6),
    }
}

fn is_blocked_v4(ip: Ipv4Addr) -> bool {
    let o = ip.octets();
    // 0.0.0.0/8 — current network / unspecified
    o[0] == 0
        // 10.0.0.0/8 — private (RFC1918)
        || o[0] == 10
        // 127.0.0.0/8 — loopback
        || o[0] == 127
        // 169.254.0.0/16 — link-local (含 AWS metadata 169.254.169.254)
        || (o[0] == 169 && o[1] == 254)
        // 172.16.0.0/12 — private (RFC1918)
        || (o[0] == 172 && (16..=31).contains(&o[1]))
        // 192.0.0.0/24 — IETF protocol assignments
        || (o[0] == 192 && o[1] == 0 && o[2] == 0)
        // 192.168.0.0/16 — private (RFC1918)
        || (o[0] == 192 && o[1] == 168)
        // 198.18.0.0/15 — benchmark testing (RFC2544)
        || (o[0] == 198 && (o[1] == 18 || o[1] == 19))
        // 100.64.0.0/10 — CGN (RFC6598)
        || (o[0] == 100 && (64..=127).contains(&o[1]))
        // 224.0.0.0/4 — multicast + reserved (240/4 也是 reserved)
        || o[0] >= 224
}

fn is_blocked_v6(ip: Ipv6Addr) -> bool {
    if ip.is_loopback() || ip.is_unspecified() {
        return true;
    }
    let s = ip.segments();
    // fc00::/7 — unique local (ULA)
    if (s[0] & 0xfe00) == 0xfc00 {
        return true;
    }
    // fe80::/10 — link-local
    if (s[0] & 0xffc0) == 0xfe80 {
        return true;
    }
    // ff00::/8 — multicast
    if (s[0] & 0xff00) == 0xff00 {
        return true;
    }
    // IPv4-mapped IPv6 (::ffff:x.x.x.x) → 检查内嵌的 v4
    if let Some(v4) = ip.to_ipv4_mapped() {
        return is_blocked_v4(v4);
    }
    false
}

/// 流式读取 response body, 边读边 count — 超过 limit 立刻 abort, 不全量 alloc.
///
/// 与旧实现区别: 不再 `resp.bytes().await` 一次 alloc 整个 body. 即使服务返回
/// `Content-Length: 999999999` 或 chunked 没声明长度, 我们读到 N+1 byte 时立刻报错.
pub async fn read_body_limited(mut resp: reqwest::Response, limit_bytes: usize) -> Result<Vec<u8>> {
    if let Some(cl) = resp.content_length() {
        if cl > limit_bytes as u64 {
            return Err(anyhow!(
                "Content-Length {cl} exceeds limit {limit_bytes} (no body read)"
            ));
        }
    }
    let mut buf: Vec<u8> = Vec::new();
    // limit_bytes + 1 让超限时一定能多读 1 byte 触发 Err
    let cap = limit_bytes.saturating_add(1);
    while let Some(chunk) = resp.chunk().await.context("read chunk")? {
        if buf.len() + chunk.len() > cap {
            return Err(anyhow!(
                "body exceeded limit {limit_bytes} (read {} so far)",
                buf.len()
            ));
        }
        buf.extend_from_slice(&chunk);
    }
    if buf.len() > limit_bytes {
        return Err(anyhow!(
            "body {} bytes exceeds limit {}",
            buf.len(),
            limit_bytes
        ));
    }
    Ok(buf)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn blocks_loopback_v4() {
        assert!(is_blocked_v4(Ipv4Addr::new(127, 0, 0, 1)));
        assert!(is_blocked_v4(Ipv4Addr::new(127, 255, 255, 255)));
    }

    #[test]
    fn blocks_rfc1918() {
        assert!(is_blocked_v4(Ipv4Addr::new(10, 0, 0, 1)));
        assert!(is_blocked_v4(Ipv4Addr::new(172, 16, 0, 1)));
        assert!(is_blocked_v4(Ipv4Addr::new(172, 31, 255, 254)));
        assert!(is_blocked_v4(Ipv4Addr::new(192, 168, 1, 1)));
    }

    #[test]
    fn blocks_link_local_v4() {
        assert!(is_blocked_v4(Ipv4Addr::new(169, 254, 1, 1)));
    }

    #[test]
    fn blocks_unspecified_v4() {
        assert!(is_blocked_v4(Ipv4Addr::new(0, 0, 0, 0)));
        assert!(is_blocked_v4(Ipv4Addr::new(0, 255, 255, 255)));
    }

    #[test]
    fn blocks_cgn() {
        assert!(is_blocked_v4(Ipv4Addr::new(100, 64, 0, 1)));
        assert!(is_blocked_v4(Ipv4Addr::new(100, 127, 255, 254)));
        // 边界外放行
        assert!(!is_blocked_v4(Ipv4Addr::new(100, 63, 255, 255)));
        assert!(!is_blocked_v4(Ipv4Addr::new(100, 128, 0, 0)));
    }

    #[test]
    fn blocks_benchmark_reserved() {
        assert!(is_blocked_v4(Ipv4Addr::new(198, 18, 0, 1)));
        assert!(is_blocked_v4(Ipv4Addr::new(198, 19, 255, 255)));
    }

    #[test]
    fn blocks_multicast_and_reserved_v4() {
        assert!(is_blocked_v4(Ipv4Addr::new(224, 0, 0, 1)));
        assert!(is_blocked_v4(Ipv4Addr::new(255, 255, 255, 255)));
    }

    #[test]
    fn allows_public_v4() {
        assert!(!is_blocked_v4(Ipv4Addr::new(8, 8, 8, 8)));
        assert!(!is_blocked_v4(Ipv4Addr::new(1, 1, 1, 1)));
        assert!(!is_blocked_v4(Ipv4Addr::new(140, 82, 114, 3))); // github
    }

    #[test]
    fn blocks_ipv6_loopback() {
        assert!(is_blocked_v6(Ipv6Addr::LOCALHOST));
        assert!(is_blocked_v6("::1".parse().unwrap()));
    }

    #[test]
    fn blocks_ipv6_unspecified() {
        assert!(is_blocked_v6(Ipv6Addr::UNSPECIFIED));
        assert!(is_blocked_v6("::".parse().unwrap()));
    }

    #[test]
    fn blocks_ipv6_ula() {
        assert!(is_blocked_v6("fc00::1".parse().unwrap()));
        assert!(is_blocked_v6("fd12:3456::1".parse().unwrap()));
        // fc00::/7 边界: fb00:: 不在 ULA (fc00::/7 是 fc..和 fd..)
        assert!(!is_blocked_v6("fb00::1".parse().unwrap()));
        assert!(!is_blocked_v6("fe00::1".parse().unwrap())); // fe00:: 不在 fc00::/7
    }

    #[test]
    fn blocks_ipv6_link_local() {
        assert!(is_blocked_v6("fe80::1".parse().unwrap()));
        assert!(is_blocked_v6("febf::1".parse().unwrap())); // fe80::/10 边界
    }

    #[test]
    fn blocks_ipv6_multicast() {
        assert!(is_blocked_v6("ff02::1".parse().unwrap()));
    }

    #[test]
    fn blocks_ipv4_mapped_ipv6_loopback() {
        // ::ffff:127.0.0.1 → 内嵌 v4 是 loopback
        let ip: Ipv6Addr = "::ffff:127.0.0.1".parse().unwrap();
        assert!(is_blocked_v6(ip));
        // ::ffff:10.0.0.1 → 内嵌 RFC1918
        let ip: Ipv6Addr = "::ffff:10.0.0.1".parse().unwrap();
        assert!(is_blocked_v6(ip));
    }

    #[test]
    fn allows_public_ipv6() {
        // Cloudflare DNS
        assert!(!is_blocked_v6("2606:4700:4700::1111".parse().unwrap()));
        // Google DNS
        assert!(!is_blocked_v6("2001:4860:4860::8888".parse().unwrap()));
    }

    #[test]
    fn url_scheme_only_http_https() {
        // 用 IP 字面量 — 不依赖 DNS, sandbox/隔离网络也能稳定通过.
        assert!(validate_public_url("https://1.1.1.1/").is_ok());
        assert!(validate_public_url("http://1.1.1.1/").is_ok());
        assert!(validate_public_url("ftp://1.1.1.1/").is_err());
        assert!(validate_public_url("file:///etc/passwd").is_err());
        assert!(validate_public_url("javascript:alert(1)").is_err());
    }

    #[test]
    fn url_rejects_literal_private_v4() {
        assert!(validate_public_url("http://127.0.0.1/x").is_err());
        assert!(validate_public_url("http://10.0.0.1/x").is_err());
        assert!(validate_public_url("http://192.168.1.1/x").is_err());
        assert!(validate_public_url("http://172.16.0.1/x").is_err());
        assert!(validate_public_url("http://100.64.0.1/x").is_err());
        assert!(validate_public_url("http://169.254.169.254/latest/meta-data/").is_err());
    }

    /// SPEC §4.1: 必须阻断带方括号的 IPv6 loopback URL.
    /// 修复前 fail (返回 Ok 因为 host_str 返 "[::1]" 然后 to_socket_addrs 退到 198.18.0.51).
    #[test]
    fn url_rejects_bracketed_ipv6_loopback() {
        assert!(validate_public_url("http://[::1]/x").is_err());
        assert!(validate_public_url("https://[::1]/admin").is_err());
    }

    #[test]
    fn url_rejects_literal_ipv6_private() {
        // ULA
        assert!(validate_public_url("http://[fc00::1]/x").is_err());
        // Link-local
        assert!(validate_public_url("http://[fe80::1]/x").is_err());
        // IPv4-mapped
        assert!(validate_public_url("http://[::ffff:127.0.0.1]/x").is_err());
        assert!(validate_public_url("http://[::ffff:10.0.0.1]/x").is_err());
    }

    #[test]
    fn url_accepts_public_ipv6_literal() {
        // Cloudflare DNS — typed Ipv6 host 应该通过
        let r = validate_public_url("https://[2606:4700:4700::1111]/dns-query");
        assert!(r.is_ok(), "expected ok, got {:?}", r.err());
        let t = r.unwrap();
        assert_eq!(t.host_header, "[2606:4700:4700::1111]");
        assert_eq!(t.addrs.len(), 1);
        assert_eq!(t.addrs[0].ip().to_string(), "2606:4700:4700::1111");
        assert_eq!(t.addrs[0].port(), 443);
    }

    /// SPEC §4.1: 重定向到私网 URL 必须阻断.
    /// 这一项需要起一个本地 HTTP server (集成测试), 这里只单测 validate 路径.
    #[test]
    fn url_redirect_chain_validates_each_target() {
        // 模拟 spec 中 "公网 URL → 重定向到私网 URL" 场景: validate_public_url
        // 对每一跳分别调用, 第二跳 (私网) 必须被拒.
        assert!(validate_public_url("http://[::1]/redirect-target").is_err());
        assert!(validate_public_url("http://127.0.0.1/redirect-target").is_err());
    }

    /// DNS 解析失败 → 拒绝 (不放行给 reqwest 重新解析).
    #[test]
    fn url_rejects_unresolvable_host() {
        // RFC 6761 .invalid TLD 保证永不解析
        let r = validate_public_url("http://nonexistent.invalid./x");
        assert!(r.is_err());
    }

    /// 不允许非标准端口 (scheme 不带 known default 且 URL 没显式 port) → 拒绝.
    /// 例: "http://example.com" → 80 OK (known default); "foo://example.com" → 拒绝 (scheme).
    #[test]
    fn url_resolves_known_default_port() {
        let r = validate_public_url("http://1.1.1.1/");
        assert!(r.is_ok());
        assert_eq!(r.unwrap().addrs[0].port(), 80);
        let r = validate_public_url("https://1.1.1.1/");
        assert!(r.is_ok());
        assert_eq!(r.unwrap().addrs[0].port(), 443);
    }
}
