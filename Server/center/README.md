# Studio Arona Center

`center` 是 Studio Arona Server 当前唯一的主后端实现：一个独立运行的 Rust axum daemon，默认监听 `:8080`。

完整架构、API、环境变量、已知限制和启动方式见 [Server README](../README.md)。后续开发与验收要求见 [WORK_REQUIREMENTS.md](../WORK_REQUIREMENTS.md)。

## 职责

- JWT 认证与多用户数据隔离。
- 日程、Memory、RSS、网页监控和 Skill 安装元数据。
- RSS/网页定时抓取。
- SSE 与站内通知。
- 可选 SMTP 离线邮件。
- 天气、系统指标和开发阶段 VM mock。

SonettoHere 不运行在 Center 中；它由 Client 在用户终端独立运行。

## 开发

```bash
cd Server/center

cargo run
cargo fmt --check
cargo test
cargo clippy --all-targets -- -D warnings
cargo build
```

数据库迁移通过 `sqlx::migrate!("../infra/db/versions")` 在启动时自动执行。

## 当前状态

Center 可以编译，但尚未达到生产验收标准。当前主要缺口包括：

- IPv6 loopback SSRF 防护失败。
- RSS 新条目没有通知和邮件闭环。
- 网页摘要不是智能变化摘要。
- 自定义 Skill 内容和 Sonetto 配置不能同步。
- SSE presence 与邮箱验证不完整。
- Marketplace 仍是静态 mock。
- 缺少 PostgreSQL 集成测试。

不要根据路由存在与否判断功能完成度，应以 [WORK_REQUIREMENTS.md](../WORK_REQUIREMENTS.md) 的最终验收标准为准。
