use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_notification::init())
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
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

/// 获取服务状态 (连接到 desktop-core)
#[tauri::command]
async fn get_service_status() -> Result<String, String> {
    // TODO: 连接到 Server/rust/desktop-core 获取状态
    Ok("ok".to_string())
}

/// 打开外部链接
#[tauri::command]
async fn open_external(url: String) -> Result<(), String> {
    open::that(&url).map_err(|e| e.to_string())
}
