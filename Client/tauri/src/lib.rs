use std::path::PathBuf;
use std::process::Command;
use std::sync::Mutex;
use tauri::Manager;

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
    let backend_url =
        std::env::var("BACKEND_URL").unwrap_or_else(|_| "http://127.0.0.1:8080".to_string());

    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
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
            ocr_check_update,
            ocr_install,
            ocr_install_status,
            ocr_activate,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

/// 启动 SonettoHere Python 后端 (本地 venv, 端口 8081)
/// 桌面应用启动时调用, 进程后台跑, 应用关闭时 kill.
#[cfg(desktop)]
fn spawn_sonetto() -> Option<u32> {
    let root = client_root()?;
    let venv_python = ensure_sonetto_venv()?;
    let sonetto_dir = root.join("services/sonetto");
    if !sonetto_dir.join("api/server.py").exists() {
        log::error!(
            "Bundled SonettoHere runtime not found at {}",
            sonetto_dir.display()
        );
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
        .current_dir(&sonetto_dir)
        .env("PYTHONPATH", &sonetto_dir)
        .env("PYTHONUNBUFFERED", "1")
        .stdout(log_file)
        .stderr(
            log_stderr
                .unwrap_or_else(|| std::fs::File::create(&log_path).expect("create sonetto log")),
        )
        .spawn()
        .ok()?;

    Some(child.id())
}

/// 确保 SonettoHere venv 存在, 首次启动自动建 + 装依赖.
/// Uses the Client-local runtime and Python 3.12 environment shared with OCR.
#[cfg(desktop)]
fn ensure_sonetto_venv() -> Option<PathBuf> {
    let root = client_root()?;
    let venv_dir = root.join(".venv-sonetto");
    let venv_python = venv_dir.join("bin/python3");

    if venv_python.exists() {
        return Some(venv_python.canonicalize().unwrap_or(venv_python));
    }

    // 首次启动 setup: uv venv + uv pip install
    log::info!("SonettoHere venv not found, bootstrapping (30s first-time) ...");

    // 1. 找 uv 二进制
    let uv = find_uv()?;
    log::info!("uv: {}", uv.display());

    // 2. Find Python 3.12
    let python = find_python312()?;
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

    // 4. Install from the runtime bundled inside Client.
    let sonetto_req = root.join("services/sonetto/requirements.txt");
    let ocr_req = root.join("services/ocr/requirements.txt");
    if !sonetto_req.exists() || !ocr_req.exists() {
        log::error!("bundled requirements not found");
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
        .arg(&sonetto_req)
        .arg("-r")
        .arg(&ocr_req)
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
    let home = std::env::var_os("HOME").map(PathBuf::from);
    let candidates = [
        home.as_ref().map(|path| path.join(".local/bin/uv")),
        home.as_ref().map(|path| path.join(".cargo/bin/uv")),
        Some(PathBuf::from("/usr/local/bin/uv")),
        Some(PathBuf::from("/opt/homebrew/bin/uv")),
    ];
    for c in candidates.into_iter().flatten() {
        if c.exists() {
            return Some(c.canonicalize().unwrap_or(c));
        }
    }
    None
}

#[cfg(desktop)]
fn find_python312() -> Option<PathBuf> {
    let home = std::env::var_os("HOME").map(PathBuf::from);
    let candidates = [
        home.as_ref().map(|path| path.join(".local/bin/python3.12")),
        Some(PathBuf::from("/usr/local/bin/python3.12")),
        Some(PathBuf::from("/opt/homebrew/bin/python3.12")),
        Some(PathBuf::from("/usr/bin/python3")),
    ];
    for c in candidates.into_iter().flatten() {
        if c.exists() {
            return Some(c.canonicalize().unwrap_or(c));
        }
    }
    None
}

/// Resolve the Client directory without a developer-specific absolute path.
fn client_root() -> Option<PathBuf> {
    let mut candidates = Vec::new();
    if let Ok(cwd) = std::env::current_dir() {
        candidates.push(cwd.clone());
        if let Some(parent) = cwd.parent() {
            candidates.push(parent.to_path_buf());
        }
    }
    if let Ok(exe) = std::env::current_exe() {
        let mut current = exe.parent();
        for _ in 0..6 {
            if let Some(path) = current {
                candidates.push(path.to_path_buf());
                current = path.parent();
            }
        }
    }
    candidates.into_iter().find(|path| {
        path.join("services/sonetto/api/server.py").exists()
            && path.join("web/package.json").exists()
    })
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
    let resp = client
        .get(format!("{}/api/me", state.base_url))
        .send()
        .await
        .map_err(|e| e.to_string())?;
    let json: serde_json::Value = resp.json().await.map_err(|e| e.to_string())?;
    Ok(json)
}

/// 获取系统信息 (admin)
#[tauri::command]
async fn get_system_info(
    state: tauri::State<'_, BackendState>,
) -> Result<serde_json::Value, String> {
    let client = reqwest::Client::new();
    let resp = client
        .get(format!("{}/api/admin/system", state.base_url))
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
    client_root().unwrap_or_else(|| PathBuf::from(".."))
}

fn ocr_vendor_dir() -> PathBuf {
    ocr_vendor_root().join("vendor").join("paddle-ocr")
}

/// 读 vendor/paddle-ocr/current.json 找当前激活版本, 返回 (model, mmproj) 路径.
/// 兼容旧平铺布局: vendor/paddle-ocr/PaddleOCR-VL-*-GGUF.gguf.
/// 找不到返回 None (未安装, 前端可引导用户跑 download_ocr.sh 或 POST /api/ocr/install).
fn ocr_current_model_paths() -> Option<(PathBuf, PathBuf)> {
    let vendor = ocr_vendor_dir();
    let current_json = vendor.join("current.json");
    if let Ok(s) = std::fs::read_to_string(&current_json) {
        if let Ok(v) = serde_json::from_str::<serde_json::Value>(&s) {
            if let Some(version) = v.get("version").and_then(|x| x.as_str()) {
                let model = vendor
                    .join(version)
                    .join(format!("PaddleOCR-VL-{}-GGUF.gguf", version));
                let mmproj = vendor
                    .join(version)
                    .join(format!("PaddleOCR-VL-{}-GGUF-mmproj.gguf", version));
                if model.exists() && mmproj.exists() {
                    return Some((model, mmproj));
                }
            }
        }
    }
    // Fallback: 旧平铺布局 — 取平铺目录里第一个匹配的 gguf
    if let Ok(entries) = std::fs::read_dir(&vendor) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_file() {
                if let Some(name) = path.file_name().and_then(|n| n.to_str()) {
                    if name.starts_with("PaddleOCR-VL-")
                        && name.ends_with("-GGUF.gguf")
                        && !name.ends_with("-mmproj.gguf")
                    {
                        let mmproj_name = name.replace("-GGUF.gguf", "-GGUF-mmproj.gguf");
                        let mmproj = path.with_file_name(mmproj_name);
                        if mmproj.exists() {
                            return Some((path, mmproj));
                        }
                    }
                }
            }
        }
    }
    None
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
    let plat = platform_key().ok_or_else(|| {
        format!(
            "Unsupported platform: {}-{}",
            std::env::consts::OS,
            std::env::consts::ARCH
        )
    })?;

    let llama_server = llama_dir.join(plat).join(if cfg!(windows) {
        "llama-server.exe"
    } else {
        "llama-server"
    });
    if !llama_server.exists() {
        return Err(format!(
            "llama-server not found at {}",
            llama_server.display()
        ));
    }

    let (model, mmproj) = ocr_current_model_paths().ok_or_else(|| {
        format!(
            "OCR model not installed. Run `bash scripts/download_ocr.sh 1.6` or POST /api/ocr/install {{\"version\": \"1.6\"}} from OCR page. Looked under: {}",
            vendor.display()
        )
    })?;

    // 1. 启 llama-server
    let llama_log = ocr_log_path("ocr-llama.log");
    let llama_log_file = std::fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(&llama_log)
        .map_err(|e| format!("open llama log: {}", e))?;
    let llama_stderr = llama_log_file.try_clone().ok();

    let llama_child = Command::new(&llama_server)
        .args([
            "-m",
            model.to_str().unwrap(),
            "--mmproj",
            mmproj.to_str().unwrap(),
            "--port",
            &OCR_LLAMA_PORT.to_string(),
            "--host",
            "127.0.0.1",
            "-ngl",
            "99",
        ])
        .env("DYLD_LIBRARY_PATH", llama_dir.join(plat))
        .env("LD_LIBRARY_PATH", llama_dir.join(plat))
        .stdout(llama_log_file)
        .stderr(
            llama_stderr
                .unwrap_or_else(|| std::fs::File::create(&llama_log).expect("create llama log")),
        )
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
        if reqwest::get(&url)
            .await
            .map(|r| r.status().is_success())
            .unwrap_or(false)
        {
            ready = true;
            break;
        }
    }
    if !ready {
        kill_pid(llama_pid);
        return Err(format!(
            "llama-server failed to start within 60s, see {}",
            llama_log.display()
        ));
    }

    // 3. 启 fastapi (复用 helper, install/update 也要起 fastapi 但不起 llama-server)
    let fastapi_pid = ocr_ensure_fastapi(&state).await?;

    Ok(serde_json::json!({
        "status": "ready",
        "started": true,
        "llama_pid": llama_pid,
        "fastapi_pid": fastapi_pid,
        "load_secs_estimate": 30,
    }))
}

/// 仅起 fastapi (不起 llama-server). 给 install/update/activate 命令复用.
/// 已起着就直接返回 pid.
async fn ocr_ensure_fastapi(state: &tauri::State<'_, OcrState>) -> Result<u32, String> {
    if ocr_ping_fastapi().await {
        if let Ok(guard) = state.fastapi_pid.lock() {
            if let Some(pid) = *guard {
                return Ok(pid);
            }
        }
        // ping 通了但没记 pid — 重新启一个 (会冲突端口, 让它失败就好)
    }

    let python = ocr_python_path()
        .ok_or_else(|| "Python venv not found (.venv-sonetto/bin/python3)".to_string())?;
    let ocr_main = ocr_vendor_root().join("services/ocr/main.py");
    if !ocr_main.exists() {
        return Err(format!("OCR main.py not found at {}", ocr_main.display()));
    }

    let fastapi_log = ocr_log_path("ocr-fastapi.log");
    let fastapi_log_file = std::fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(&fastapi_log)
        .map_err(|e| format!("open fastapi log: {}", e))?;
    let fastapi_stderr = fastapi_log_file.try_clone().ok();

    let fastapi_child =
        Command::new(&python)
            .args([
                "-m",
                "uvicorn",
                "main:app",
                "--host",
                "127.0.0.1",
                "--port",
                &OCR_FASTAPI_PORT.to_string(),
                "--log-level",
                "info",
            ])
            .current_dir(ocr_vendor_root().join("services/ocr"))
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

    // 等 fastapi /health (最多 15s)
    for _ in 0..30 {
        tokio::time::sleep(std::time::Duration::from_millis(500)).await;
        if ocr_ping_fastapi().await {
            return Ok(fastapi_pid);
        }
    }

    Err(format!(
        "fastapi failed to start within 15s, see {}",
        fastapi_log.display()
    ))
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

// ============================================================
// OCR 模型管理 (可选安装 + 升级)
// 前端: 调这些 command → Rust 代理到 fastapi (同时按需启 fastapi)
// ============================================================

fn ocr_fastapi_url(path: &str) -> String {
    format!("http://127.0.0.1:{}{}", OCR_FASTAPI_PORT, path)
}

#[tauri::command]
async fn ocr_check_update(state: tauri::State<'_, OcrState>) -> Result<serde_json::Value, String> {
    // 更新 last_used (install 期间也算"用了 OCR 服务")
    if let Ok(mut guard) = state.last_used.lock() {
        *guard = Some(std::time::Instant::now());
    }
    ocr_ensure_fastapi(&state).await?;
    let resp = reqwest::get(ocr_fastapi_url("/api/ocr/check-update"))
        .await
        .map_err(|e| format!("check-update: {}", e))?;
    let status = resp.status();
    let json: serde_json::Value = resp.json().await.map_err(|e| format!("parse: {}", e))?;
    if !status.is_success() {
        return Err(format!("check-update failed ({}): {:?}", status, json));
    }
    Ok(json)
}

#[tauri::command]
async fn ocr_install(
    state: tauri::State<'_, OcrState>,
    version: String,
) -> Result<serde_json::Value, String> {
    if let Ok(mut guard) = state.last_used.lock() {
        *guard = Some(std::time::Instant::now());
    }
    ocr_ensure_fastapi(&state).await?;
    let resp = reqwest::Client::new()
        .post(ocr_fastapi_url("/api/ocr/install"))
        .json(&serde_json::json!({"version": version, "activate": true}))
        .send()
        .await
        .map_err(|e| format!("install: {}", e))?;
    let status = resp.status();
    let json: serde_json::Value = resp.json().await.map_err(|e| format!("parse: {}", e))?;
    if !status.is_success() {
        return Err(format!("install failed ({}): {:?}", status, json));
    }
    Ok(json)
}

#[tauri::command]
async fn ocr_install_status(
    state: tauri::State<'_, OcrState>,
    job_id: String,
) -> Result<serde_json::Value, String> {
    if let Ok(mut guard) = state.last_used.lock() {
        *guard = Some(std::time::Instant::now());
    }
    ocr_ensure_fastapi(&state).await?;
    let resp = reqwest::get(ocr_fastapi_url(&format!(
        "/api/ocr/install/status?job_id={}",
        urlencoding_minimal(&job_id)
    )))
    .await
    .map_err(|e| format!("install status: {}", e))?;
    let status = resp.status();
    let json: serde_json::Value = resp.json().await.map_err(|e| format!("parse: {}", e))?;
    if !status.is_success() {
        return Err(format!("install status failed ({}): {:?}", status, json));
    }
    Ok(json)
}

#[tauri::command]
async fn ocr_activate(
    state: tauri::State<'_, OcrState>,
    version: String,
) -> Result<serde_json::Value, String> {
    if let Ok(mut guard) = state.last_used.lock() {
        *guard = Some(std::time::Instant::now());
    }
    ocr_ensure_fastapi(&state).await?;
    let resp = reqwest::Client::new()
        .post(ocr_fastapi_url("/api/ocr/activate"))
        .json(&serde_json::json!({"version": version}))
        .send()
        .await
        .map_err(|e| format!("activate: {}", e))?;
    let status = resp.status();
    let json: serde_json::Value = resp.json().await.map_err(|e| format!("parse: {}", e))?;
    if !status.is_success() {
        return Err(format!("activate failed ({}): {:?}", status, json));
    }
    Ok(json)
}

/// 轻量 URL 编码 (只处理 job_id 可能的特殊字符, 不引 urlencoding crate)
fn urlencoding_minimal(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
    for c in s.chars() {
        if c.is_ascii_alphanumeric() || matches!(c, '-' | '_' | '.' | '~') {
            out.push(c);
        } else {
            for b in c.to_string().as_bytes() {
                out.push_str(&format!("%{:02X}", b));
            }
        }
    }
    out
}
