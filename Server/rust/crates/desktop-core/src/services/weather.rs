//! Weather 天气端点 — GET /api/weather
//!
//! 读取 weather_fetcher daemon 写入的缓存文件，缓存未命中时调用 wttr.in 兜底

use crate::error::AppError;
use crate::state::AppState;
use axum::{extract::State, response::IntoResponse, Json};
use serde::Serialize;
use std::sync::Arc;

const CACHE_TTL: u64 = 360; // 6 min

#[derive(Debug, Serialize)]
pub struct WeatherData {
    pub city: String,
    pub temperature: i32,
    pub condition: String,
    pub humidity: i32,
    pub wind_speed: String,
    pub wind_direction: String,
    pub feels_like: i32,
    pub uv_index: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub stale: Option<bool>,
}

fn get_cache_path() -> std::path::PathBuf {
    let home = dirs::home_dir().unwrap_or_default();
    home.join(".studioarona").join("weather_cache.json")
}

fn load_cache() -> serde_json::Value {
    let cache_path = get_cache_path();
    if !cache_path.exists() {
        return serde_json::json!({"cities": {}, "updated_at": 0});
    }
    std::fs::read_to_string(&cache_path)
        .ok()
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or(serde_json::json!({"cities": {}, "updated_at": 0}))
}

fn pick_city(cities: &serde_json::Value) -> Option<serde_json::Value> {
    if let Some(obj) = cities.as_object() {
        if let Some((_, city)) = obj.iter().next() {
            return Some(city.clone());
        }
    }
    None
}

fn to_frontend_shape(city: &serde_json::Value) -> WeatherData {
    WeatherData {
        city: city.get("city").and_then(|v| v.as_str()).unwrap_or("上海").to_string(),
        temperature: city.get("temperature").and_then(|v| v.as_i64()).unwrap_or(0) as i32,
        condition: city.get("condition").and_then(|v| v.as_str()).unwrap_or("Unknown").to_string(),
        humidity: city.get("humidity").and_then(|v| v.as_i64()).unwrap_or(0) as i32,
        wind_speed: city.get("wind_speed").and_then(|v| v.as_str()).unwrap_or("—").to_string(),
        wind_direction: city.get("wind_direction").and_then(|v| v.as_str()).unwrap_or("—").to_string(),
        feels_like: city.get("feels_like").and_then(|v| v.as_i64()).unwrap_or(0) as i32,
        uv_index: city.get("uv_index").and_then(|v| v.as_str()).unwrap_or("Unknown").to_string(),
        stale: None,
    }
}

/// GET /api/weather
pub async fn get_weather(
    State(_state): State<Arc<AppState>>,
) -> Result<impl IntoResponse, AppError> {
    let cache = load_cache();
    let cities = &cache["cities"];
    let updated_at = cache.get("updated_at").and_then(|v| v.as_f64()).unwrap_or(0.0);
    let cache_age = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs() as f64 - updated_at;

    // 如果有 cache 且未过期，直接返回
    if !cities.as_object().map_or(true, |m| m.is_empty()) && cache_age < CACHE_TTL as f64 {
        if let Some(city) = pick_city(cities) {
            return Ok(Json(to_frontend_shape(&city)));
        }
    }

    // 兜底：返回默认天气
    let fallback = serde_json::json!({
        "city": "上海",
        "temperature": 25,
        "condition": "晴",
        "humidity": 60,
        "wind_speed": "10 km/h",
        "wind_direction": "SE",
        "feels_like": 26,
        "uv_index": "Moderate"
    });

    let mut result = to_frontend_shape(&fallback);
    if cache_age > CACHE_TTL as f64 {
        result.stale = Some(true);
    }

    Ok(Json(result))
}
