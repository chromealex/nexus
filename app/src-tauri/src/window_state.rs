use serde::{Deserialize, Serialize};
use tauri::Manager;
#[derive(Serialize, Deserialize)]
struct Geometry {
    x: i32,
    y: i32,
    width: u32,
    height: u32,
}
fn path() -> std::path::PathBuf {
    super::home().join("Library/Application Support/NEXUS/window.json")
}
pub fn restore(app: &tauri::AppHandle) {
    let Some(window) = app.get_webview_window("main") else {
        return;
    };
    let Some(g) = std::fs::read(path())
        .ok()
        .and_then(|v| serde_json::from_slice::<Geometry>(&v).ok())
    else {
        return;
    };
    if g.width < 600 || g.height < 400 || g.width > 20000 || g.height > 20000 {
        return;
    }
    let _ = window.set_size(tauri::PhysicalSize::new(g.width, g.height));
    if window.available_monitors().unwrap_or_default().iter().any(|m| {
        let p = m.position();
        let s = m.size();
        let right = p.x as i64 + s.width as i64;
        let bottom = p.y as i64 + s.height as i64;
        (g.x as i64) < right - 80
            && (g.x as i64 + g.width as i64) > p.x as i64 + 80
            && (g.y as i64) >= p.y as i64
            && (g.y as i64) < bottom - 80
    }) {
        let _ = window.set_position(tauri::PhysicalPosition::new(g.x, g.y));
    } else {
        let _ = window.center();
    }
}
pub fn save(window: &tauri::Window) {
    if window.is_minimized().unwrap_or(false)
        || window.is_maximized().unwrap_or(false)
        || window.is_fullscreen().unwrap_or(false)
    {
        return;
    }
    if let (Ok(p), Ok(s)) = (window.outer_position(), window.inner_size()) {
        let g = Geometry {
            x: p.x,
            y: p.y,
            width: s.width,
            height: s.height,
        };
        if let Ok(data) = serde_json::to_vec(&g) {
            let target = path();
            if let Some(parent) = target.parent() {
                let _ = std::fs::create_dir_all(parent);
            }
            let tmp = target.with_extension("tmp");
            if std::fs::write(&tmp, data).is_ok() {
                let _ = std::fs::rename(tmp, target);
            }
        }
    }
}

#[tauri::command]
pub fn drag_main_window(window: tauri::WebviewWindow) -> Result<(), String> {
    window.start_dragging().map_err(|e| e.to_string())
}
