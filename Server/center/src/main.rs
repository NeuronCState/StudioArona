//! Binary entry — 调 lib::run().

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    studio_arona_center::run().await
}
