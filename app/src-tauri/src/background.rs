//! Keep Nexus working with the window closed: hide instead of quitting, reopen from the Dock,
//! opt out of App Nap while channels are active, optional login item (SMAppService, macOS 13+).
use serde::{Deserialize, Serialize};
#[cfg(target_os = "macos")]
use tauri::Manager;

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct Settings {
    pub keep_running: bool,
    pub launch_at_login: bool,
}
impl Default for Settings {
    fn default() -> Self {
        Self {
            keep_running: true,
            launch_at_login: false,
        }
    }
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct View {
    keep_running: bool,
    launch_at_login: bool,
    login_status: String,
    active_channels: usize,
}

fn path() -> std::path::PathBuf {
    super::home().join("Library/Application Support/NEXUS/background.json")
}
pub fn load() -> Settings {
    std::fs::read(path())
        .ok()
        .and_then(|b| serde_json::from_slice(&b).ok())
        .unwrap_or_default()
}
fn save(s: &Settings) -> Result<(), String> {
    let p = path();
    std::fs::create_dir_all(p.parent().ok_or("Invalid path")?).map_err(|e| e.to_string())?;
    let tmp = p.with_extension("json.tmp");
    std::fs::write(&tmp, serde_json::to_vec_pretty(s).map_err(|e| e.to_string())?)
        .map_err(|e| e.to_string())?;
    std::fs::rename(tmp, p).map_err(|e| e.to_string())
}
fn active_channels() -> usize {
    super::remote_channels::load_configs()
        .map(|c| c.iter().filter(|c| c.enabled && c.kind != "push").count())
        .unwrap_or(0)
        + super::automations::enabled_count()
}
/// The window is hidden instead of closed only when it is useful: the setting is on and a task source is enabled.
pub fn keep_alive() -> bool {
    load().keep_running && active_channels() > 0
}

#[cfg(target_os = "macos")]
mod native {
    unsafe extern "C" {
        fn nexus_background_activity(on: i32);
        fn nexus_login_item_status() -> i32;
        fn nexus_login_item_set(on: i32) -> i32;
    }
    pub fn activity(on: bool) {
        unsafe { nexus_background_activity(on as i32) }
    }
    pub fn login_status() -> i32 {
        unsafe { nexus_login_item_status() }
    }
    pub fn set_login(on: bool) -> i32 {
        unsafe { nexus_login_item_set(on as i32) }
    }
}
#[cfg(not(target_os = "macos"))]
mod native {
    pub fn activity(_: bool) {}
    pub fn login_status() -> i32 {
        4
    }
    pub fn set_login(_: bool) -> i32 {
        -2
    }
}

/// Re-evaluates App Nap opt-out after settings or channel changes.
pub fn apply() {
    native::activity(keep_alive())
}
fn login_text(code: i32) -> String {
    match code {
        1 => "Включено",
        2 => "Ждёт подтверждения: Системные настройки → Основные → Объекты входа",
        3 => "Недоступно для этой сборки (приложение не найдено системой)",
        4 => "Нужна macOS 13 или новее",
        _ => "Выключено",
    }
    .into()
}
fn view() -> View {
    let s = load();
    View {
        keep_running: s.keep_running,
        launch_at_login: s.launch_at_login,
        login_status: login_text(native::login_status()),
        active_channels: active_channels(),
    }
}

pub fn on_window_event(window: &tauri::Window, event: &tauri::WindowEvent) {
    if let tauri::WindowEvent::CloseRequested { api, .. } = event {
        if window.label() == "main" && keep_alive() {
            api.prevent_close();
            let _ = window.hide();
        }
    }
}
pub fn on_run_event(app: &tauri::AppHandle, event: &tauri::RunEvent) {
    #[cfg(target_os = "macos")]
    if let tauri::RunEvent::Reopen { .. } = event {
        if let Some(w) = app.get_webview_window("main") {
            let _ = w.show();
            let _ = w.unminimize();
            let _ = w.set_focus();
        }
    }
    #[cfg(not(target_os = "macos"))]
    {
        let _ = (app, event);
    }
}
#[tauri::command]
pub fn background_settings() -> View {
    view()
}
#[tauri::command]
pub fn background_save(keep_running: bool, launch_at_login: bool) -> Result<View, String> {
    let prev = load();
    save(&Settings {
        keep_running,
        launch_at_login,
    })?;
    if prev.launch_at_login != launch_at_login || launch_at_login && native::login_status() != 1 {
        let code = native::set_login(launch_at_login);
        if code != 0 && !(launch_at_login && native::login_status() == 2) {
            let mut s = load();
            s.launch_at_login = prev.launch_at_login;
            save(&s)?;
            return Err(format!(
                "macOS не изменил автозапуск (код {code}). {}",
                login_text(native::login_status())
            ));
        }
    }
    apply();
    Ok(view())
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn defaults_keep_running() {
        let s: Settings = serde_json::from_str("{}").unwrap();
        assert!(s.keep_running && !s.launch_at_login);
        assert_eq!(login_text(2).contains("Объекты входа"), true);
    }
}
