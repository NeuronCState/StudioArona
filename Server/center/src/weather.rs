use axum::{extract::State, http::StatusCode, Json};
use serde_json::{json, Value};

use crate::AppState;

/// GET /api/weather — 给 Studio HomePage weather 磁贴用
/// 暂时返固定上海天气, 后续接 weather_fetcher 服务
pub async fn get_weather(
    State(state): State<AppState>,
) -> Result<Json<Value>, (StatusCode, Json<Value>)> {
    let _ = &state.db; // 占位, 未来从 weather_cache 表读
    Ok(Json(json!({
        "city": "上海",
        "temperature": 24,
        "condition": "多云",
        "humidity": 65,
        "windSpeed": 17,
        "windDirection": "S",
        "feelsLike": 23,
        "uvIndex": 5,
        "updatedAt": chrono::Utc::now().to_rfc3339(),
    })))
}

/// GET /api/system/metrics — 给 SystemPage 用
pub async fn get_system_metrics(
    State(state): State<AppState>,
) -> Result<Json<Value>, (StatusCode, Json<Value>)> {
    let _ = &state.db;

    // 从 vms 表统计实际状态 (简单聚合)
    let vms: Vec<(String,)> = sqlx::query_as("SELECT status::text FROM vms")
        .fetch_all(&state.db)
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({"error": e.to_string()}))))?;

    let total = vms.len();
    let running = vms.iter().filter(|(s,)| s == "running").count();

    // CPU/内存/磁盘 模拟数据 (后续接 psutil / sysinfo)
    Ok(Json(json!({
        "cpu": 42.5,
        "memory": 67.2,
        "disk": 51.8,
        "networkIn": 120,
        "networkOut": 80,
        "vmsTotal": total,
        "vmsRunning": running,
        "updatedAt": chrono::Utc::now().to_rfc3339(),
    })))
}
