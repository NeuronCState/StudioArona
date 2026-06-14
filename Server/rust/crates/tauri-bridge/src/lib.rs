//! Tauri commands 桥接 (Phase 2 stub)
//!
//! 实际 Tauri 集成:
//! ```ignore
//! #[tauri::command]
//! async fn get_user_info(state: tauri::State<'_, AppState>) -> Result<UserPublic, ApiError> {
//!     Ok(state.users.get_current().await?)
//! }
//! ```

pub fn placeholder() {
    // Phase 2: 把 desktop-core 的 axum router 桥接到 Tauri command
    //   - tauri::generate_handler![get_user_info, list_skills, ...]
    //   - 前端 import { invoke } from '@tauri-apps/api/core'
}
