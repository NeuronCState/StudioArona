//! Center client (Phase 3 stub)
//!
//! 桌面 app 探测 + 连接 Linux 中心 daemon:
//!   - 启动 5s 探测 GET /health
//!   - 探测到 → 中心注册 (带 invite code) + JWT
//!   - 探测不到 → degraded mode (个人模式)
//!   - 反向 WebSocket 收 ha_event/notification/vm_status/rss_update

use std::time::Duration;

pub struct CenterClient {
    base_url: String,
    jwt: Option<String>,
    client: reqwest::Client,
}

impl CenterClient {
    pub fn new(base_url: impl Into<String>) -> Self {
        Self {
            base_url: base_url.into(),
            jwt: None,
            client: reqwest::Client::builder()
                .timeout(Duration::from_secs(5))
                .build()
                .expect("reqwest client"),
        }
    }

    /// 5s 探测中心健康状态
    pub async fn probe(&self) -> bool {
        match self
            .client
            .get(format!("{}/health", self.base_url))
            .send()
            .await
        {
            Ok(resp) if resp.status().is_success() => true,
            _ => false,
        }
    }

    /// Phase 3 实装: 中心注册 / JWT / 反向 WS
    pub async fn register(&mut self, _invite_code: &str) -> anyhow::Result<()> {
        // TODO: POST /api/center/register { invite_code, user_id?, device_id? }
        // 返 { jwt, center_user_id }
        unimplemented!()
    }
}
