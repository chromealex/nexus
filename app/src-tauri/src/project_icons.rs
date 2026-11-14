//! Project icons in the navigation: found automatically in the project folder (app icon, logo,
//! favicon), chosen by the user, or switched off. Settings live in `project-icons.json`; a custom
//! image is copied into NEXUS so it survives changes in the project folder.
use super::*;
use base64::{engine::general_purpose::STANDARD, Engine};
use serde_json::{json, Value};
use std::path::Path;

const MAX_ICON: u64 = 2_000_000;
static ICONS_LOCK: std::sync::Mutex<()> = std::sync::Mutex::new(());

fn icons_dir() -> PathBuf {
    home().join("Library/Application Support/NEXUS/project-icons")
}
fn settings_path() -> PathBuf {
    home().join("Library/Application Support/NEXUS/project-icons.json")
}
fn load_settings() -> HashMap<String, Value> {
    std::fs::read(settings_path())
        .ok()
        .and_then(|b| serde_json::from_slice(&b).ok())
        .unwrap_or_default()
}
fn save_settings(map: &HashMap<String, Value>) -> Result<(), String> {
    let path = settings_path();
    std::fs::create_dir_all(path.parent().unwrap()).map_err(|e| e.to_string())?;
    let temp = path.with_extension("json.tmp");
    std::fs::write(&temp, serde_json::to_vec_pretty(map).map_err(|e| e.to_string())?)
        .map_err(|e| e.to_string())?;
    std::fs::rename(temp, path).map_err(|e| e.to_string())
}

pub(crate) fn mime_for(path: &Path) -> Option<&'static str> {
    match path.extension()?.to_str()?.to_ascii_lowercase().as_str() {
        "png" => Some("image/png"),
        "svg" => Some("image/svg+xml"),
        "jpg" | "jpeg" => Some("image/jpeg"),
        "webp" => Some("image/webp"),
        "ico" => Some("image/x-icon"),
        "gif" => Some("image/gif"),
        _ => None,
    }
}

/// Usual places of an app icon or logo, most specific first.
const CANDIDATES: &[&str] = &[
    "icon.svg",
    "icon.png",
    "logo.svg",
    "logo.png",
    "assets/icon.svg",
    "assets/icon.png",
    "assets/logo.svg",
    "assets/logo.png",
    "public/icon.svg",
    "public/icon.png",
    "public/logo.svg",
    "public/logo.png",
    "public/favicon.svg",
    "public/favicon.png",
    "public/apple-touch-icon.png",
    "static/favicon.svg",
    "static/favicon.png",
    "favicon.svg",
    "favicon.png",
    "src-tauri/icons/icon.png",
    "app/src-tauri/icons/icon.png",
    "src-tauri/icons/128x128@2x.png",
    "app/public/favicon.svg",
    "docs/assets/icon.svg",
    "docs/assets/icon.png",
    "docs/assets/logo.svg",
    "docs/assets/logo.png",
    ".github/logo.svg",
    ".github/logo.png",
    "build/icon.png",
    "resources/icon.png",
    "Assets/Icon.png",
    "public/favicon.ico",
    "favicon.ico",
];

fn usable(path: &Path) -> bool {
    mime_for(path).is_some()
        && path.is_file()
        && path
            .metadata()
            .map(|m| m.len() > 0 && m.len() <= MAX_ICON)
            .unwrap_or(false)
}

/// First icon found in the project folder; also looks for `*icon*` / `*logo*` images one level into
/// `docs/assets`, `assets`, `public`, and for an Xcode AppIcon set.
pub(crate) fn find_icon(workspace: &Path) -> Option<PathBuf> {
    for c in CANDIDATES {
        let p = workspace.join(c);
        if usable(&p) {
            return Some(p);
        }
    }
    for dir in ["docs/assets", "assets", "public", "images", "img"] {
        let Ok(entries) = std::fs::read_dir(workspace.join(dir)) else {
            continue;
        };
        let mut found: Vec<PathBuf> = entries
            .flatten()
            .map(|e| e.path())
            .filter(|p| {
                let name = p
                    .file_name()
                    .and_then(|n| n.to_str())
                    .unwrap_or("")
                    .to_ascii_lowercase();
                (name.contains("icon") || name.contains("logo")) && usable(p)
            })
            .collect();
        found.sort();
        if let Some(p) = found.into_iter().next() {
            return Some(p);
        }
    }
    // Xcode / Unity style: …/AppIcon.appiconset/*.png, two levels deep at most.
    let mut stack = vec![(workspace.to_path_buf(), 0)];
    while let Some((dir, depth)) = stack.pop() {
        let Ok(entries) = std::fs::read_dir(&dir) else {
            continue;
        };
        for e in entries.flatten().take(200) {
            let p = e.path();
            let name = p.file_name().and_then(|n| n.to_str()).unwrap_or("");
            if !p.is_dir()
                || name.starts_with('.')
                || ["node_modules", "target", "dist", "build"].contains(&name)
            {
                continue;
            }
            if name.ends_with(".appiconset") {
                let mut pngs: Vec<PathBuf> = std::fs::read_dir(&p)
                    .into_iter()
                    .flatten()
                    .flatten()
                    .map(|e| e.path())
                    .filter(|p| usable(p))
                    .collect();
                pngs.sort_by_key(|p| std::cmp::Reverse(p.metadata().map(|m| m.len()).unwrap_or(0)));
                if let Some(p) = pngs.into_iter().next() {
                    return Some(p);
                }
            } else if depth < 3 {
                stack.push((p, depth + 1));
            }
        }
    }
    None
}

fn data_url(path: &Path) -> Option<String> {
    let mime = mime_for(path)?;
    let bytes = std::fs::read(path).ok()?;
    Some(format!("data:{mime};base64,{}", STANDARD.encode(bytes)))
}

/// Icon of one project: {mode: auto|custom|none, url, source}.
#[tauri::command]
pub fn project_icon(project_id: String) -> Result<Value, String> {
    let db = load_project_store()?;
    let project = db
        .projects
        .iter()
        .find(|p| p.id == project_id)
        .ok_or("Проект не найден")?;
    let setting = load_settings()
        .get(&project_id)
        .cloned()
        .unwrap_or(json!({"mode":"auto"}));
    let mode = setting["mode"].as_str().unwrap_or("auto").to_string();
    Ok(match mode.as_str() {
        "none" => json!({"mode":"none","url":null,"source":null}),
        "custom" => {
            let file = icons_dir().join(setting["file"].as_str().unwrap_or(""));
            json!({"mode":"custom","url":data_url(&file),"source":"Своя иконка"})
        }
        _ => {
            let workspace = PathBuf::from(&project.workspace);
            let found = find_icon(&workspace);
            json!({
                "mode": "auto",
                "url": found.as_deref().and_then(data_url),
                "source": found.map(|p| p.strip_prefix(&workspace).map(|r| r.to_string_lossy().to_string()).unwrap_or_default()),
            })
        }
    })
}

/// mode "auto" — search the project folder, "none" — no icon, "custom" — the given image (base64).
#[tauri::command]
pub fn set_project_icon(
    project_id: String,
    mode: String,
    data: Option<String>,
    name: Option<String>,
) -> Result<Value, String> {
    if !load_project_store()?.projects.iter().any(|p| p.id == project_id) {
        return Err("Проект не найден".into());
    }
    let safe: String = project_id
        .chars()
        .filter(|c| c.is_ascii_alphanumeric() || *c == '-')
        .take(80)
        .collect();
    let _guard = ICONS_LOCK.lock().map_err(|_| "Настройки иконок недоступны")?;
    let mut map = load_settings();
    match mode.as_str() {
        "auto" | "none" => {
            map.insert(project_id.clone(), json!({"mode":mode}));
        }
        "custom" => {
            let name = name.unwrap_or_default();
            let ext = Path::new(&name)
                .extension()
                .and_then(|e| e.to_str())
                .unwrap_or("")
                .to_ascii_lowercase();
            let file = format!("{safe}.{ext}");
            if mime_for(Path::new(&file)).is_none() {
                return Err("Подойдёт PNG, SVG, JPG, WebP, GIF или ICO".into());
            }
            let bytes = STANDARD
                .decode(data.unwrap_or_default().trim())
                .map_err(|_| "Не удалось прочитать картинку")?;
            if bytes.is_empty() || bytes.len() as u64 > MAX_ICON {
                return Err("Иконка должна быть не больше 2 МБ".into());
            }
            std::fs::create_dir_all(icons_dir()).map_err(|e| e.to_string())?;
            if let Ok(entries) = std::fs::read_dir(icons_dir()) {
                for e in entries.flatten() {
                    if e.path().file_stem().and_then(|s| s.to_str()) == Some(safe.as_str()) {
                        let _ = std::fs::remove_file(e.path());
                    }
                }
            }
            std::fs::write(icons_dir().join(&file), bytes).map_err(|e| e.to_string())?;
            map.insert(project_id.clone(), json!({"mode":"custom","file":file}));
        }
        _ => return Err("Неизвестный режим иконки".into()),
    }
    save_settings(&map)?;
    drop(_guard);
    project_icon(project_id)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn finds_icons_in_usual_places() {
        let base = std::env::temp_dir().join(format!("nexus-icons-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&base);
        std::fs::create_dir_all(base.join("a/public")).unwrap();
        std::fs::write(base.join("a/public/favicon.svg"), "<svg/>").unwrap();
        assert!(find_icon(&base.join("a"))
            .unwrap()
            .ends_with("public/favicon.svg"));
        std::fs::write(base.join("a/logo.png"), [1u8, 2, 3]).unwrap();
        assert!(find_icon(&base.join("a")).unwrap().ends_with("logo.png"));
        std::fs::create_dir_all(base.join("b/docs/assets")).unwrap();
        std::fs::write(base.join("b/docs/assets/nexus-icon.png"), [1u8]).unwrap();
        assert!(find_icon(&base.join("b")).unwrap().ends_with("nexus-icon.png"));
        std::fs::create_dir_all(base.join("c/Game/Assets.xcassets/AppIcon.appiconset")).unwrap();
        std::fs::write(
            base.join("c/Game/Assets.xcassets/AppIcon.appiconset/1024.png"),
            [1u8; 10],
        )
        .unwrap();
        assert!(find_icon(&base.join("c")).unwrap().ends_with("1024.png"));
        std::fs::create_dir_all(base.join("d")).unwrap();
        std::fs::write(base.join("d/icon.png"), []).unwrap();
        assert!(find_icon(&base.join("d")).is_none());
        let _ = std::fs::remove_dir_all(&base);
        assert_eq!(mime_for(Path::new("x.SVG")), Some("image/svg+xml"));
        assert_eq!(mime_for(Path::new("x.exe")), None);
    }
}
