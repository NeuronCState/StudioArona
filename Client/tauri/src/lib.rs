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
            }

            Ok(())
        })
        .on_window_event(|window, event| {
            // 窗口关闭时 kill SonettoHere (macOS/Linux; Windows 父进程自动)
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
            }
        })
        .invoke_handler(tauri::generate_handler![
            get_service_status,
            open_external,
            get_weather,
            get_me,
            get_system_info,
            get_sonetto_status,
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
