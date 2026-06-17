use tauri::Manager;
use std::sync::Mutex;
use std::process::Command;
use std::path::PathBuf;

/// 共享状态：桌面 Core 后端地址 (Center Rust daemon, 端口 8080)
struct BackendState {
    base_url: String,
}

/// SonettoHere Python 后端进程句柄 (Tauri 关闭时 kill)
struct SonettoState(Mutex<Option<u32>>);

/// OCR Python 后端进程句柄 (按需启动, 空闲自动 kill)
struct OcrState {
    fastapi_pid: Mutex<Option<u32>>,
    llama_pid: Mutex<Option<u32>>,
    last_used: Mutex<Option<std::time::Instant>>,
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let backend_url = std::env::var("BACKEND_URL")
        .unwrap_or_else(|_| "http://127.0.0.1:8080".to_string());

    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_log::Builder::default().build())
        .plugin(tauri_plugin_fs::init())
        .manage(BackendState { base_url: backend_url })
        .manage(SonettoState(Mutex::new(None)))
        .manage(OcrState {
            fastapi_pid: Mutex::new(None),
            llama_pid: Mutex::new(None),
            last_used: Mutex::new(None),
        })
        .setup(|app| {
            // 设置窗口大小
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.set_title("Studio Arona");
            }

            // 启动 SonettoHere Python 后端 (本地 venv, 端口 8081)
            // 桌面应用: 启动时 spawn SonettoHere 进程, 关闭时自动 kill (OS 父进程退出)
            #[cfg(desktop)]
            {
                use tauri::tray::{TrayIconBuilder, MouseButton, MouseButtonState, TrayIconEvent};

                let _tray = TrayIconBuilder::new()
                    .icon(app.default_window_icon().unwrap().clone())
                    .tooltip("Studio Arona")
                    .on_tray_icon_event(|tray_icon, event| {
                        match event {
                            TrayIconEvent::Click {
                                button: MouseButton::Left,
                                button_state: MouseButtonState::Up,
                                ..
                            } => {
                                let app = tray_icon.app_handle();
                                if let Some(window) = app.get_webview_window("main") {
                                    let _ = window.show();
                                    let _ = window.set_focus();
                                }
                            }
                            _ => {}
                        }
                    })
                    .build(app)?;

                // 启动 SonettoHere (端口 8081, LangGraph ReAct agent 框架)
                let pid = spawn_sonetto();
                if let Some(state) = app.try_state::<SonettoState>() {
                    if let Ok(mut guard) = state.0.lock() {
                        *guard = pid;
                    }
                }
                if let Some(p) = pid {
                    log::info!("SonettoHere spawned, pid={}", p);
                } else {
                    log::warn!("SonettoHere spawn failed, see log at ~/Library/Logs/StudioArona/sonetto.log");
                }

                // OCR 空闲回收线程 (5 分钟无活动自动 kill)
                let app_handle = app.handle().clone();
                std::thread::spawn(move || {
                    loop {
                        std::thread::sleep(std::time::Duration::from_secs(60));
                        let ocr_state = app_handle.state::<OcrState>();
                        let should_kill = {
                            if let Ok(guard) = ocr_state.last_used.lock() {
                                if let Some(t) = *guard {
                                    t.elapsed().as_secs() > OCR_IDLE_SECS
                                } else {
                                    false
                                }
                            } else {
                                false
                            }
                        };
                        if should_kill {
                            log::info!("OCR idle for {}s, killing processes", OCR_IDLE_SECS);
                            kill_ocr_processes(&ocr_state);
                        }
                    }
                });
            }

            Ok(())
        })
.on_window_event(|window, event| {
            // 窗口关闭时 kill SonettoHere + OCR 子进程 (macOS/Linux; Windows 父进程自动)
            if let tauri::WindowEvent::CloseRequested { .. } = event {
                if let Some(state) = window.try_state::<SonettoState>() {
                    if let Ok(guard) = state.0.lock() {
                        if let Some(pid) = *guard {
                            log::info!("Killing SonettoHere pid={}", pid);
                            #[cfg(unix)]
                            unsafe {
                                libc::kill(pid as i32, libc::SIGTERM);
                            }
                        }
                    }
                }
                if let Some(ocr) = window.try_state::<OcrState>() {
                    kill_ocr_processes(&ocr);
                }
            }
        })
        .invoke_handler(tauri::generate_handler![
            get_service_status,
            open_external,
            get_weather,
            get_me,
            get_system_info,
            get_sonetto_status,
            ocr_ensure,
            ocr_health,
            ocr_parse_b64,
            ocr_recognize_b64,
            ocr_idle_kill,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

/// 启动 SonettoHere Python 后端 (本地 venv, 端口 8081)
/// 桌面应用启动时调用, 进程后台跑, 应用关闭时 kill.
#[cfg(desktop)]
fn spawn_sonetto() -> Option<u32> {
    // 1. 确保 venv 存在 (首次启动自动建 + 装依赖, 30s 一次性)
    let venv_python = ensure_sonetto_venv()?;

    // 2. 找 SonettoHere 源码 (venv dir 上一级 .sonetto-run/src)
    let venv_src = {
        let venv_canon = venv_python.canonicalize().unwrap_or(venv_python.clone());
        let mut d = venv_canon.parent()?; // bin/
        d = d.parent()?; // venv dir (Client/.venv-sonetto)
        d = d.parent()?; // Client/
        d.join(".sonetto-run") // Client/.sonetto-run
    };
    if !venv_src.join("src/api/server.py").exists() {
        log::error!("SonettoHere src not found at {}", venv_src.display());
        return None;
    }

    // 3. 启动 uvicorn, 端口 8081
    let log_path = sonetto_log_path();
    std::fs::create_dir_all(log_path.parent()?).ok()?;
    let log_file = std::fs::File::create(&log_path).ok()?;
    let log_stderr = log_file.try_clone().ok();

    let child = Command::new(&venv_python)
        .arg("-m")
        .arg("uvicorn")
        .arg("api.server:create_app")
        .arg("--factory")
        .arg("--host")
        .arg("127.0.0.1")
        .arg("--port")
        .arg("8081")
        .current_dir(&venv_src)
        .env("PYTHONUNBUFFERED", "1")
        .stdout(log_file)
        .stderr(log_stderr.unwrap_or_else(|| {
            std::fs::File::create(&log_path).expect("create sonetto log")
        }))
        .spawn()
        .ok()?;

    Some(child.id())
}

/// 确保 SonettoHere venv 存在, 首次启动自动建 + 装依赖.
/// 用 ~/.local/bin/uv (project-local 路径), Python 3.11 (SonettoHere langchain-mcp-adapters 需要 ≥3.10).
#[cfg(desktop)]
fn ensure_sonetto_venv() -> Option<PathBuf> {
    let venv_dir = PathBuf::from("../.venv-sonetto");
    let venv_python = venv_dir.join("bin/python3");

    if venv_python.exists() {
        return Some(venv_python.canonicalize().unwrap_or(venv_python));
    }

    // 首次启动 setup: uv venv + uv pip install
    log::info!("SonettoHere venv not found, bootstrapping (30s first-time) ...");

    // 1. 找 uv 二进制
    let uv = find_uv()?;
    log::info!("uv: {}", uv.display());

    // 2. 找 Python 3.11
    let python = find_python311()?;
    log::info!("python: {}", python.display());

    // 3. uv venv
    let venv_status = Command::new(&uv)
        .arg("venv")
        .arg("--python")
        .arg(&python)
        .arg(&venv_dir)
        .status()
        .ok()?;
    if !venv_status.success() {
        log::error!("uv venv failed");
        return None;
    }

    // 4. 找 requirements.txt (硬路径, 桌面应用不依赖 symlink)
    let req_paths = [
        PathBuf::from("../.sonetto-run/src/requirements.txt"),
        PathBuf::from(".sonetto-run/src/requirements.txt"),
        PathBuf::from("/Users/zhangxuanning/Downloads/SonettoHere-main/requirements.txt"),
    ];
    let req = req_paths.iter().find(|p| p.exists())?.clone();
    if !req.exists() {
        log::error!("requirements.txt not found");
        return None;
    }

    // 5. uv pip install (30s, 后台不阻塞 UI)
    let install_status = Command::new(&uv)
        .arg("pip")
        .arg("install")
        .arg("--python")
        .arg(&venv_python)
        .arg("-i")
        .arg("https://pypi.tuna.tsinghua.edu.cn/simple/")
        .arg("-r")
        .arg(&req)
        .status()
        .ok()?;
    if !install_status.success() {
        log::error!("uv pip install failed");
        return None;
    }

    log::info!("SonettoHere venv ready");
    Some(venv_python.canonicalize().unwrap_or(venv_python))
}

#[cfg(desktop)]
fn find_uv() -> Option<PathBuf> {
    let candidates = [
        PathBuf::from("/Users/zhangxuanning/.local/bin/uv"),
        PathBuf::from("/usr/local/bin/uv"),
        PathBuf::from("/opt/homebrew/bin/uv"),
    ];
    for c in candidates.iter() {
        if c.exists() {
            return Some(c.canonicalize().unwrap_or(c.clone()));
        }
    }
    None
}

#[cfg(desktop)]
fn find_python311() -> Option<PathBuf> {
    let candidates = [
        PathBuf::from("/Users/zhangxuanning/.local/bin/python3.11"),
        PathBuf::from("/usr/local/bin/python3.11"),
        PathBuf::from("/opt/homebrew/bin/python3.11"),
    ];
    for c in candidates.iter() {
        if c.exists() {
            return Some(c.canonicalize().unwrap_or(c.clone()));
        }
    }
    None
}

#[cfg(desktop)]
fn sonetto_log_path() -> PathBuf {
    let home = std::env::var("HOME").unwrap_or_else(|_| "/tmp".to_string());
    PathBuf::from(format!("{}/Library/Logs/StudioArona/sonetto.log", home))
}

/// 检查 SonettoHere 健康 (Tauri 端 ping)
#[tauri::command]
async fn get_sonetto_status() -> Result<String, String> {
    let resp = reqwest::get("http://127.0.0.1:8081/api/health")
        .await
        .map_err(|e| e.to_string())?;
    let text = resp.text().await.map_err(|e| e.to_string())?;
    Ok(text)
}

/// 获取服务状态 (health check)
#[tauri::command]
async fn get_service_status(state: tauri::State<'_, BackendState>) -> Result<String, String> {
    let resp = reqwest::get(format!("{}/health", state.base_url))
        .await
        .map_err(|e| e.to_string())?;
    let text = resp.text().await.map_err(|e| e.to_string())?;
    Ok(text)
}

/// 打开外部链接
#[tauri::command]
async fn open_external(url: String) -> Result<(), String> {
    open::that(&url).map_err(|e| e.to_string())
}

/// 获取天气
#[tauri::command]
async fn get_weather(state: tauri::State<'_, BackendState>) -> Result<serde_json::Value, String> {
    let resp = reqwest::get(format!("{}/api/weather", state.base_url))
        .await
        .map_err(|e| e.to_string())?;
    let json: serde_json::Value = resp.json().await.map_err(|e| e.to_string())?;
    Ok(json)
}

/// 获取当前用户信息
#[tauri::command]
async fn get_me(state: tauri::State<'_, BackendState>) -> Result<serde_json::Value, String> {
    let client = reqwest::Client::new();
    let resp = client.get(format!("{}/api/me", state.base_url))
        .send()
        .await
        .map_err(|e| e.to_string())?;
    let json: serde_json::Value = resp.json().await.map_err(|e| e.to_string())?;
    Ok(json)
}

/// 获取系统信息 (admin)
#[tauri::command]
async fn get_system_info(state: tauri::State<'_, BackendState>) -> Result<serde_json::Value, String> {
    let client = reqwest::Client::new();
    let resp = client.get(format!("{}/api/admin/system", state.base_url))
        .send()
        .await
        .map_err(|e| e.to_string())?;
    let json: serde_json::Value = resp.json().await.map_err(|e| e.to_string())?;
    Ok(json)
}

// ============================================================
// OCR (按需启动, 空闲 5 分钟自动 kill)
// ============================================================

const OCR_FASTAPI_PORT: u16 = 8083;
const OCR_LLAMA_PORT: u16 = 8082;
const OCR_IDLE_SECS: u64 = 300; // 5 分钟空闲自动 kill

/// OCR 服务根目录 (StudioArona/vendor/)
fn ocr_vendor_root() -> PathBuf {
    let exe = std::env::current_exe().ok();
    if let Some(exe) = exe {
        // macOS .app: <app>.app/Contents/MacOS/<bin> → 找 ../../../../..
        if let Ok(canon) = exe.canonicalize() {
            let mut d = canon.parent();
            for _ in 0..5 {
                if let Some(p) = d {
                    if p.join("vendor").exists() {
                        return p.to_path_buf();
                    }
                    d = p.parent();
                }
            }
        }
    }
    // Dev fallback
    PathBuf::from("..")
}

fn ocr_vendor_dir() -> PathBuf {
    ocr_vendor_root().join("vendor").join("paddle-ocr")
}

fn ocr_llama_cpp_dir() -> PathBuf {
    ocr_vendor_root().join("vendor").join("llama.cpp")
}

fn ocr_log_path(name: &str) -> PathBuf {
    let home = std::env::var("HOME").unwrap_or_else(|_| "/tmp".to_string());
    let dir = PathBuf::from(format!("{}/Library/Logs/StudioArona", home));
    std::fs::create_dir_all(&dir).ok();
    dir.join(name)
}

fn ocr_python_path() -> Option<PathBuf> {
    // 共享 SonettoHere venv
    let candidates = [
        ocr_vendor_root().join(".venv-sonetto/bin/python3"),
        ocr_vendor_root().join(".venv-sonetto/bin/python"),
        PathBuf::from("/Users/zhangxuanning/StudioArona/Client/.venv-sonetto/bin/python3"),
    ];
    candidates.into_iter().find(|p| p.exists())
}

fn platform_key() -> Option<&'static str> {
    match (std::env::consts::OS, std::env::consts::ARCH) {
        ("macos", "aarch64") => Some("darwin-arm64"),
        ("linux", "x86_64") => Some("linux-x64"),
        ("windows", "x86_64") => Some("windows-x64"),
        _ => None,
    }
}

fn kill_pid(pid: u32) {
    #[cfg(unix)]
    unsafe {
        libc::kill(pid as i32, libc::SIGTERM);
    }
    #[cfg(windows)]
    {
        // Windows: 用 taskkill 兜底 (不依赖 winapi crate)
        let _ = Command::new("taskkill")
            .args(["/F", "/PID", &pid.to_string()])
            .output();
    }
}

fn kill_ocr_processes(state: &OcrState) {
    if let Ok(mut guard) = state.llama_pid.lock() {
        if let Some(pid) = *guard {
            log::info!("Killing OCR llama-server pid={}", pid);
            kill_pid(pid);
            *guard = None;
        }
    }
    if let Ok(mut guard) = state.fastapi_pid.lock() {
        if let Some(pid) = *guard {
            log::info!("Killing OCR fastapi pid={}", pid);
            kill_pid(pid);
            *guard = None;
        }
    }
    if let Ok(mut guard) = state.last_used.lock() {
        *guard = None;
    }
}

async fn ocr_ping_fastapi() -> bool {
    let url = format!("http://127.0.0.1:{}/health", OCR_FASTAPI_PORT);
    reqwest::Client::new()
        .get(&url)
        .timeout(std::time::Duration::from_secs(2))
        .send()
        .await
        .map(|r| r.status().is_success())
        .unwrap_or(false)
}

/// 确保 OCR 服务运行 (fastapi + llama-server 按需启动)
#[tauri::command]
async fn ocr_ensure(state: tauri::State<'_, OcrState>) -> Result<serde_json::Value, String> {
    // 更新 last_used
    if let Ok(mut guard) = state.last_used.lock() {
        *guard = Some(std::time::Instant::now());
    }

    // 已经在跑就直接返回
    if ocr_ping_fastapi().await {
        return Ok(serde_json::json!({"status": "ready", "started": false}));
    }

    let vendor = ocr_vendor_dir();
    let llama_dir = ocr_llama_cpp_dir();
    let plat = platform_key().ok_or_else(|| format!("Unsupported platform: {}-{}", std::env::consts::OS, std::env::consts::ARCH))?;

    let llama_server = llama_dir.join(plat).join(if cfg!(windows) { "llama-server.exe" } else { "llama-server" });
    if !llama_server.exists() {
        return Err(format!("llama-server not found at {}", llama_server.display()));
    }

    let model = vendor.join("PaddleOCR-VL-1.6-GGUF.gguf");
    let mmproj = vendor.join("PaddleOCR-VL-1.6-GGUF-mmproj.gguf");
    if !model.exists() {
        return Err(format!("OCR model not found at {}", model.display()));
    }
    if !mmproj.exists() {
        return Err(format!("OCR mmproj not found at {}", mmproj.display()));
    }

    // 1. 启 llama-server
    let llama_log = ocr_log_path("ocr-llama.log");
    let llama_log_file = std::fs::OpenOptions::new()
        .create(true).append(true).open(&llama_log)
        .map_err(|e| format!("open llama log: {}", e))?;
    let llama_stderr = llama_log_file.try_clone().ok();

    let llama_child = Command::new(&llama_server)
        .args([
            "-m", model.to_str().unwrap(),
            "--mmproj", mmproj.to_str().unwrap(),
            "--port", &OCR_LLAMA_PORT.to_string(),
            "--host", "127.0.0.1",
            "-ngl", "99",
        ])
        .env("DYLD_LIBRARY_PATH", llama_dir.join(plat))
        .env("LD_LIBRARY_PATH", llama_dir.join(plat))
        .stdout(llama_log_file)
        .stderr(llama_stderr.unwrap_or_else(|| {
            std::fs::File::create(&llama_log).expect("create llama log")
        }))
        .spawn()
        .map_err(|e| format!("spawn llama-server: {}", e))?;

    let llama_pid = llama_child.id();
    *state.llama_pid.lock().unwrap() = Some(llama_pid);
    log::info!("OCR llama-server spawned, pid={}", llama_pid);

    // 2. 等 llama-server /health
    let mut ready = false;
    for _ in 0..60 {
        tokio::time::sleep(std::time::Duration::from_secs(1)).await;
        let url = format!("http://127.0.0.1:{}/health", OCR_LLAMA_PORT);
        if reqwest::get(&url).await.map(|r| r.status().is_success()).unwrap_or(false) {
            ready = true;
            break;
        }
    }
    if !ready {
        kill_pid(llama_pid);
        return Err(format!("llama-server failed to start within 60s, see {}", llama_log.display()));
    }

    // 3. 启 fastapi
    let python = ocr_python_path().ok_or_else(|| "Python venv not found (.venv-sonetto/bin/python3)".to_string())?;
    let ocr_main = ocr_vendor_root().join("services/client_ocr/main.py");
    if !ocr_main.exists() {
        return Err(format!("OCR main.py not found at {}", ocr_main.display()));
    }

    let fastapi_log = ocr_log_path("ocr-fastapi.log");
    let fastapi_log_file = std::fs::OpenOptions::new()
        .create(true).append(true).open(&fastapi_log)
        .map_err(|e| format!("open fastapi log: {}", e))?;
    let fastapi_stderr = fastapi_log_file.try_clone().ok();

    let fastapi_child = Command::new(&python)
        .args(["-m", "uvicorn", "main:app", "--host", "127.0.0.1", "--port", &OCR_FASTAPI_PORT.to_string(), "--log-level", "info"])
        .current_dir(ocr_vendor_root().join("services/client_ocr"))
        .env("OCR_LLAMA_PORT", OCR_LLAMA_PORT.to_string())
        .env("OCR_PORT", OCR_FASTAPI_PORT.to_string())
        .env("PYTHONUNBUFFERED", "1")
        .stdout(fastapi_log_file)
        .stderr(fastapi_stderr.unwrap_or_else(|| {
            std::fs::File::create(&fastapi_log).expect("create fastapi log")
        }))
        .spawn()
        .map_err(|e| format!("spawn fastapi: {}", e))?;

    let fastapi_pid = fastapi_child.id();
    *state.fastapi_pid.lock().unwrap() = Some(fastapi_pid);
    log::info!("OCR fastapi spawned, pid={}", fastapi_pid);

    // 4. 等 fastapi /health
    for _ in 0..30 {
        tokio::time::sleep(std::time::Duration::from_millis(500)).await;
        if ocr_ping_fastapi().await {
            return Ok(serde_json::json!({
                "status": "ready",
                "started": true,
                "llama_pid": llama_pid,
                "fastapi_pid": fastapi_pid,
                "load_secs_estimate": 30,
            }));
        }
    }

    Err(format!("fastapi failed to start, see {}", fastapi_log.display()))
}

#[tauri::command]
async fn ocr_health() -> Result<serde_json::Value, String> {
    let url = format!("http://127.0.0.1:{}/health", OCR_FASTAPI_PORT);
    let resp = reqwest::get(&url).await.map_err(|e| e.to_string())?;
    let json: serde_json::Value = resp.json().await.map_err(|e| e.to_string())?;
    Ok(json)
}

/// 转发 PDF parse 到 fastapi (base64 输入)
#[tauri::command]
async fn ocr_parse_b64(
    state: tauri::State<'_, OcrState>,
    file_name: String,
    base64: String,
) -> Result<serde_json::Value, String> {
    if let Ok(mut guard) = state.last_used.lock() {
        *guard = Some(std::time::Instant::now());
    }

    use base64::{engine::general_purpose, Engine as _};
    let bytes = general_purpose::STANDARD
        .decode(&base64)
        .map_err(|e| format!("base64 decode: {}", e))?;

    let form = reqwest::multipart::Form::new().part(
        "file",
        reqwest::multipart::Part::bytes(bytes)
            .file_name(file_name)
            .mime_str("application/pdf")
            .map_err(|e| e.to_string())?,
    );

    let client = reqwest::Client::new();
    let url = format!("http://127.0.0.1:{}/ocr/parse", OCR_FASTAPI_PORT);
    let resp = client
        .post(&url)
        .timeout(std::time::Duration::from_secs(600))
        .multipart(form)
        .send()
        .await
        .map_err(|e| e.to_string())?;

    let status = resp.status();
    let text = resp.text().await.map_err(|e| e.to_string())?;
    if !status.is_success() {
        return Err(format!("OCR parse failed ({}): {}", status, text));
    }
    let json: serde_json::Value = serde_json::from_str(&text)
        .map_err(|e| format!("parse json: {} (body: {})", e, &text[..text.len().min(200)]))?;
    Ok(json)
}

/// 转发 image recognize 到 fastapi (base64 输入)
#[tauri::command]
async fn ocr_recognize_b64(
    state: tauri::State<'_, OcrState>,
    file_name: String,
    base64: String,
) -> Result<serde_json::Value, String> {
    if let Ok(mut guard) = state.last_used.lock() {
        *guard = Some(std::time::Instant::now());
    }

    use base64::{engine::general_purpose, Engine as _};
    let bytes = general_purpose::STANDARD
        .decode(&base64)
        .map_err(|e| format!("base64 decode: {}", e))?;

    let ext = std::path::Path::new(&file_name)
        .extension()
        .and_then(|s| s.to_str())
        .map(|s| s.to_lowercase())
        .unwrap_or_else(|| "png".to_string());

    let mime = match ext.as_str() {
        "png" => "image/png",
        "jpg" | "jpeg" => "image/jpeg",
        "webp" => "image/webp",
        "bmp" => "image/bmp",
        "gif" => "image/gif",
        "tiff" | "tif" => "image/tiff",
        _ => "image/png",
    };

    let form = reqwest::multipart::Form::new().part(
        "image",
        reqwest::multipart::Part::bytes(bytes)
            .file_name(file_name)
            .mime_str(mime)
            .map_err(|e| e.to_string())?,
    );

    let client = reqwest::Client::new();
    let url = format!("http://127.0.0.1:{}/ocr/recognize", OCR_FASTAPI_PORT);
    let resp = client
        .post(&url)
        .timeout(std::time::Duration::from_secs(300))
        .multipart(form)
        .send()
        .await
        .map_err(|e| e.to_string())?;

    let status = resp.status();
    let text = resp.text().await.map_err(|e| e.to_string())?;
    if !status.is_success() {
        return Err(format!("OCR recognize failed ({}): {}", status, text));
    }
    let json: serde_json::Value = serde_json::from_str(&text)
        .map_err(|e| format!("parse json: {} (body: {})", e, &text[..text.len().min(200)]))?;
    Ok(json)
}

/// 主动 kill OCR 进程 (空闲自动回收 + 用户手动)
#[tauri::command]
async fn ocr_idle_kill(state: tauri::State<'_, OcrState>) -> Result<serde_json::Value, String> {
    kill_ocr_processes(&state);
    Ok(serde_json::json!({"status": "killed"}))
}
