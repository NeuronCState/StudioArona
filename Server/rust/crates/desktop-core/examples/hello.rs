//! Hello world — 验证 desktop-core 能用
use desktop_core::{config::Config, AppState};

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    let cfg = Config::load()?;
    println!("✓ Config loaded: bind={}, db_mode={}", cfg.server.bind, cfg.database.mode);
    println!("✓ LLM provider: {}", cfg.llm.provider);
    println!("✓ desktop-core hello OK");

    // AppState::new() 需要连 PG, 跳过
    let _ = AppState::new(cfg.clone()); // 不 await, 仅类型检查
    Ok(())
}
