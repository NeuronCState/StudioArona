use tauri::Manager;
use std::sync::Arc;

/// 共享状态：desktop-core 的 HTTP 端点地址
struct BackendState {
    base_url: String,
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
        .setup(|app| {
            // 设置窗口大小
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.set_title("Studio Arona");
            }

            // 设置系统托盘
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
            }

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            get_service_status,
            open_external,
            get_weather,
            get_me,
            get_system_info,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
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
