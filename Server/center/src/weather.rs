use axum::{
    extract::{Query, State},
    http::StatusCode,
    Json,
};
use serde::Deserialize;
use serde_json::{json, Value};
use std::collections::HashMap;
use std::sync::{Arc, Mutex, OnceLock};
use std::time::{Duration, Instant};
use sysinfo::{Disks, Networks, System};

use crate::AppState;

const METRICS_CACHE_TTL: Duration = Duration::from_secs(5);

/// In-process weather cache. Keyed by city; entries expire after 5 minutes.
///
/// We use a process-local cache because the openweathermap free tier rate-limits
/// at 60 req/min. Multiple concurrent `/api/weather` calls for the same city
/// within the window collapse into a single upstream call (cheap + correct).
type WeatherCacheMap = HashMap<String, (Instant, Value)>;

#[derive(Clone)]
pub struct WeatherCache {
    inner: Arc<Mutex<WeatherCacheMap>>,
}

impl WeatherCache {
    pub fn new() -> Self {
        Self {
            inner: Arc::new(Mutex::new(HashMap::new())),
        }
    }

    fn get_fresh(&self, city: &str) -> Option<Value> {
        let map = self.inner.lock().unwrap();
        map.get(city).and_then(|(at, val)| {
            if at.elapsed() < Duration::from_secs(5 * 60) {
                Some(val.clone())
            } else {
                None
            }
        })
    }

    fn put(&self, city: &str, val: Value) {
        let mut map = self.inner.lock().unwrap();
        map.insert(city.to_string(), (Instant::now(), val));
    }
}

/// Global weather cache. Initialized once in `main` via `init_weather_cache`
/// and then cloned into every `AppState`. We expose this as a free function
/// so `main.rs` can wire it without an explicit setter.
static WEATHER_CACHE: OnceLock<WeatherCache> = OnceLock::new();

pub fn init_weather_cache() {
    let _ = WEATHER_CACHE.set(WeatherCache::new());
}

/// Shared cache handle. Always safe — returns a working cache even if
/// `init_weather_cache` was never called (e.g. in tests).
fn shared_cache() -> WeatherCache {
    WEATHER_CACHE.get().cloned().unwrap_or_else(WeatherCache::new)
}

/// One-shot flag for the "WEATHER_API_KEY not set" warning. The mock path
/// runs on every request when no key is configured, so we only want to log
/// the warning once per process to keep logs readable.
static KEY_MISSING_LOGGED: OnceLock<Mutex<bool>> = OnceLock::new();

fn log_key_missing_once() {
    let lock = KEY_MISSING_LOGGED.get_or_init(|| Mutex::new(false));
    let mut fired = lock.lock().unwrap();
    if !*fired {
        tracing::warn!("weather API key not set, using mock (set WEATHER_API_KEY for live data)");
        *fired = true;
    }
}

#[derive(Deserialize)]
pub struct WeatherQuery {
    #[serde(default = "default_city")]
    pub city: String,
}

fn default_city() -> String {
    "上海".to_string()
}

/// GET /api/weather — 给 Studio HomePage weather 磁贴用
///
/// Reads `WEATHER_API_KEY` env var. If unset, returns the static mock and
/// logs a warning once per process. If set, calls openweathermap
/// (`/data/2.5/weather`) and caches per-city for 5 minutes.
pub async fn get_weather(
    State(_state): State<AppState>,
    Query(q): Query<WeatherQuery>,
) -> Result<Json<Value>, (StatusCode, Json<Value>)> {
    let city = q.city.trim().to_string();
    if city.is_empty() {
        return Err((
            StatusCode::BAD_REQUEST,
            Json(json!({"error": "city is required"})),
        ));
    }

    let cache = shared_cache();
    if let Some(cached) = cache.get_fresh(&city) {
        return Ok(Json(cached));
    }

    let key = std::env::var("WEATHER_API_KEY").ok().filter(|s| !s.is_empty());
    let payload = match key {
        Some(k) => match fetch_openweather(&k, &city).await {
            Ok(v) => {
                tracing::debug!(city = %city, "weather: served from openweathermap");
                v
            }
            Err(e) => {
                tracing::warn!(city = %city, error = %e, "weather: openweathermap call failed, falling back to mock");
                mock_for_city(&city)
            }
        },
        None => {
            // Rate-limited warn so we don't spam the log on every request.
            log_key_missing_once();
            mock_for_city(&city)
        }
    };

    cache.put(&city, payload.clone());
    Ok(Json(payload))
}

fn mock_for_city(city: &str) -> Value {
    json!({
        "city": city,
        "temperature": 24,
        "condition": "多云",
        "humidity": 65,
        "windSpeed": 17,
        "windDirection": "S",
        "feelsLike": 23,
        "uvIndex": 5,
        "updatedAt": chrono::Utc::now().to_rfc3339(),
        "source": "mock",
    })
}

async fn fetch_openweather(api_key: &str, city: &str) -> anyhow::Result<Value> {
    let url = format!(
        "https://api.openweathermap.org/data/2.5/weather?q={}&appid={}&units=metric",
        urlencoding_simple(city),
        api_key,
    );

    let body: serde_json::Value = reqwest::Client::builder()
        .timeout(Duration::from_secs(10))
        .build()?
        .get(&url)
        .send()
        .await?
        .error_for_status()?
        .json()
        .await?;

    // openweathermap response shape:
    //   { main: {temp, feels_like, humidity}, weather: [{main, description}],
    //     wind: {speed, deg}, name: "..." }
    let main = body.get("main").cloned().unwrap_or(json!({}));
    let temp = main.get("temp").and_then(|v| v.as_f64()).unwrap_or(0.0);
    let feels_like = main.get("feels_like").and_then(|v| v.as_f64()).unwrap_or(temp);
    let humidity = main.get("humidity").and_then(|v| v.as_f64()).unwrap_or(0.0);
    let wind_speed = body
        .get("wind")
        .and_then(|w| w.get("speed"))
        .and_then(|v| v.as_f64())
        .unwrap_or(0.0);
    let wind_deg = body
        .get("wind")
        .and_then(|w| w.get("deg"))
        .and_then(|v| v.as_f64())
        .unwrap_or(0.0);
    let condition = body
        .get("weather")
        .and_then(|w| w.get(0))
        .and_then(|w| w.get("main"))
        .and_then(|v| v.as_str())
        .unwrap_or("Unknown")
        .to_string();
    let resolved_city = body
        .get("name")
        .and_then(|v| v.as_str())
        .unwrap_or(city)
        .to_string();

    Ok(json!({
        "city": resolved_city,
        "temperature": temp,
        "condition": condition,
        "humidity": humidity,
        "windSpeed": wind_speed,
        "windDirection": deg_to_compass(wind_deg),
        "feelsLike": feels_like,
        "uvIndex": 0,    // requires separate One Call API endpoint
        "updatedAt": chrono::Utc::now().to_rfc3339(),
        "source": "openweathermap",
    }))
}

fn deg_to_compass(deg: f64) -> &'static str {
    let d = deg.rem_euclid(360.0);
    let idx = ((d + 22.5) / 45.0).floor() as usize % 8;
    ["N", "NE", "E", "SE", "S", "SW", "W", "NW"][idx]
}

/// Minimal RFC 3986 query-string escape. Avoids pulling in `urlencoding` crate
/// just for one call.
fn urlencoding_simple(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
    for b in s.bytes() {
        match b {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => out.push(b as char),
            // UTF-8 bytes: percent-encode raw
            _ => {
                out.push('%');
                out.push_str(&format!("{:02X}", b));
            }
        }
    }
    out
}

// ---------------------------------------------------------------------------
// GET /api/system/metrics — real CPU / mem / disk / net via sysinfo
// ---------------------------------------------------------------------------

/// Cached payload returned to clients. Cached at most `METRICS_CACHE_TTL` between refreshes
/// so a busy HomePage polling this endpoint doesn't pay the cost of `refresh_all()` (which
/// walks every process and is O(n) in process count) on every request.
#[derive(Clone)]
struct CachedMetrics {
    collected_at: Instant,
    payload: Value,
}

#[derive(Clone)]
pub struct MetricsCache {
    inner: Arc<Mutex<Option<CachedMetrics>>>,
}

impl MetricsCache {
    pub fn new() -> Self {
        Self {
            inner: Arc::new(Mutex::new(None)),
        }
    }
}

impl Default for MetricsCache {
    fn default() -> Self {
        Self::new()
    }
}

/// Hit the cache; on miss / stale, re-collect via sysinfo (blocking) and store.
async fn get_or_refresh(cache: &MetricsCache) -> Value {
    // Fast path: still fresh
    {
        let guard = cache.inner.lock().unwrap();
        if let Some(c) = guard.as_ref() {
            if c.collected_at.elapsed() < METRICS_CACHE_TTL {
                return c.payload.clone();
            }
        }
    }

    // Slow path: refresh. sysinfo is fully blocking; run on the blocking pool so we
    // don't park the request worker for the duration.
    let fresh = tokio::task::spawn_blocking(collect_metrics_blocking)
        .await
        .unwrap_or_else(|e| {
            tracing::error!(error = %e, "metrics refresh task panicked");
            json!({"error": "metrics collection failed"})
        });

    let mut guard = cache.inner.lock().unwrap();
    *guard = Some(CachedMetrics {
        collected_at: Instant::now(),
        payload: fresh.clone(),
    });
    fresh
}

/// Synchronous sysinfo collection. Designed to run on `spawn_blocking`.
fn collect_metrics_blocking() -> Value {
    let mut sys = System::new_all();
    sys.refresh_all();

    // CPU — sysinfo's `global_cpu_info().cpu_usage()` is the documented cross-platform
    // aggregate. The first `refresh_all` may report 0.0 on some platforms (Windows / Linux
    // the first call is sometimes 0); the cache hides that in practice because by the
    // second poll the value is real.
    let cpu = sys.global_cpu_info().cpu_usage();

    // Memory
    let mem_total = sys.total_memory(); // bytes
    let mem_used = sys.used_memory();   // bytes (total - available)

    // Disks — sum across physical filesystems. We do *not* divide by 1024.0 inside the
    // disk object since the spec wants bytes (callers can format).
    let disks = Disks::new_with_refreshed_list();
    let disk_entries: Vec<_> = disks
        .iter()
        .map(|d| {
            json!({
                "name": d.name().to_string_lossy(),
                "mount": d.mount_point().to_string_lossy(),
                "used": d.total_space() - d.available_space(),
                "total": d.total_space(),
            })
        })
        .collect();

    // Networks — sysinfo tracks per-interface rx/tx; we sum and report in bytes.
    // Note: deltas since boot. If callers want a rate, they need two samples and a
    // clock — that belongs in the client (or a future timeseries table), not here.
    let networks = Networks::new_with_refreshed_list();
    let mut net_rx: u64 = 0;
    let mut net_tx: u64 = 0;
    for (_, n) in networks.iter() {
        net_rx = net_rx.saturating_add(n.total_received());
        net_tx = net_tx.saturating_add(n.total_transmitted());
    }

    // Uptime — sysinfo gives boot time, derive uptime seconds.
    let boot_ts = System::boot_time();
    let now_ts = chrono::Utc::now().timestamp() as u64;
    let uptime = now_ts.saturating_sub(boot_ts);

    json!({
        "cpu": cpu,
        "memory": if mem_total > 0 {
            (mem_used as f64 / mem_total as f64) * 100.0
        } else {
            0.0
        },
        "mem_used": mem_used,
        "mem_total": mem_total,
        "disk": disk_entries,
        "disk_usage_pct": disk_entries.iter().map(|d| {
            // report max-used disk as a single top-line percentage (matches old shape)
            let total = d.get("total").and_then(|v| v.as_u64()).unwrap_or(0);
            let used = d.get("used").and_then(|v| v.as_u64()).unwrap_or(0);
            if total > 0 { (used as f64 / total as f64) * 100.0 } else { 0.0 }
        }).fold(0.0_f64, f64::max),
        "networkIn": net_rx,
        "networkOut": net_tx,
        "net_rx": net_rx,
        "net_tx": net_tx,
        "uptime": uptime,
        "updatedAt": chrono::Utc::now().to_rfc3339(),
    })
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

    // Real system metrics via sysinfo, served from a 5s shared cache so concurrent
    // requests don't each pay the O(processes) refresh cost.
    let metrics_cache = state.metrics_cache.clone();
    let mut payload = get_or_refresh(&metrics_cache).await;

    // Merge in the vms count (sqlx part) — easier to do as a separate post-step than
    // to push the pool handle into the blocking task.
    if let Some(obj) = payload.as_object_mut() {
        obj.insert("vmsTotal".to_string(), json!(total));
        obj.insert("vmsRunning".to_string(), json!(running));
    } else {
        // payload was an error stub; prepend vms counts under a sibling field
        payload = json!({
            "vmsTotal": total,
            "vmsRunning": running,
            "error": payload,
        });
    }

    Ok(Json(payload))
}
