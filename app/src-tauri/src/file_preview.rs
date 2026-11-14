//! Files opened in the side panel: paths an agent mentions in a chat (or the user clicks) are read only
//! from that chat's project — its working folder, its local context folders/files — or from the chat
//! browser's output folder. Anything outside is refused, including through symlinks.
use super::*;
use base64::{engine::general_purpose::STANDARD, Engine};
use serde_json::{json, Value};
use std::path::Path;

const MAX_BYTES: u64 = 20_000_000;

fn roots(chat_id: &str) -> Result<(PathBuf, Vec<PathBuf>), String> {
    let db = load_project_store()?;
    let chat = db.chats.iter().find(|c| c.id == chat_id).ok_or("Чат не найден")?;
    let project = db
        .projects
        .iter()
        .find(|p| p.id == chat.project_id)
        .ok_or("Проект не найден")?;
    let workspace = PathBuf::from(&project.workspace);
    let mut list = vec![workspace.clone()];
    let sources = project.contexts.iter().chain(
        db.folders
            .iter()
            .filter(|f| f.project_id == project.id)
            .flat_map(|f| f.contexts.iter()),
    );
    for s in sources {
        if matches!(s.kind.as_str(), "directory" | "file" | "folder") && Path::new(&s.value).is_absolute() {
            list.push(PathBuf::from(&s.value));
        }
    }
    let safe: String = chat_id
        .chars()
        .filter(|c| c.is_ascii_alphanumeric() || *c == '-')
        .take(80)
        .collect();
    list.push(
        home()
            .join("Library/Application Support/NEXUS/browser-output")
            .join(safe),
    );
    let list = list.into_iter().filter_map(|p| p.canonicalize().ok()).collect();
    Ok((workspace, list))
}

/// Clean path text from an answer: `src/a.rs:12`, `./x.md`, `~/Notes/y.txt`, `file:///…`.
pub(crate) fn split_line(raw: &str) -> (String, Option<u32>) {
    let text = raw.trim().trim_matches(|c| c == '`' || c == '"' || c == '\'');
    let text = text.strip_prefix("file://").unwrap_or(text);
    let mut parts = text.rsplitn(3, ':').collect::<Vec<_>>();
    parts.reverse();
    match parts.as_slice() {
        [path, line, col] if line.parse::<u32>().is_ok() && col.parse::<u32>().is_ok() => {
            (path.to_string(), line.parse().ok())
        }
        [a, b, line] if line.parse::<u32>().is_ok() => (format!("{a}:{b}"), line.parse().ok()),
        [path, line] if line.parse::<u32>().is_ok() => (path.to_string(), line.parse().ok()),
        _ => (text.to_string(), None),
    }
}

/// Resolves a path inside the allowed roots; relative paths are taken from the project folder.
pub(crate) fn resolve_in(workspace: &Path, roots: &[PathBuf], raw: &str) -> Result<PathBuf, String> {
    if raw.is_empty() || raw.len() > 4096 || raw.chars().any(char::is_control) {
        return Err("Некорректный путь".into());
    }
    let expanded = if let Some(rest) = raw.strip_prefix("~/") {
        home().join(rest)
    } else {
        PathBuf::from(raw)
    };
    let candidate = if expanded.is_absolute() {
        expanded
    } else {
        workspace.join(expanded)
    };
    let real = candidate
        .canonicalize()
        .map_err(|_| "Файл не найден".to_string())?;
    if !roots.iter().any(|root| real.starts_with(root)) {
        return Err("Файл вне проекта: открываются только файлы рабочей папки и контекста проекта".into());
    }
    if !real.is_file() {
        return Err("Это не файл".into());
    }
    Ok(real)
}

#[tauri::command]
pub fn read_project_file(chat_id: String, path: String) -> Result<Value, String> {
    let (raw, line) = split_line(&path);
    let (workspace, roots) = roots(&chat_id)?;
    let real = resolve_in(&workspace, &roots, &raw)?;
    let size = real.metadata().map_err(|e| e.to_string())?.len();
    if size > MAX_BYTES {
        return Err("Файл больше 20 МБ — откройте его в приложении".into());
    }
    let bytes = std::fs::read(&real).map_err(|e| e.to_string())?;
    let shown = real
        .strip_prefix(workspace.canonicalize().unwrap_or(workspace))
        .map(|p| p.to_string_lossy().to_string())
        .unwrap_or_else(|_| real.to_string_lossy().to_string());
    Ok(json!({
        "name": real.file_name().map(|n| n.to_string_lossy().to_string()).unwrap_or_default(),
        "path": real.to_string_lossy(),
        "display": shown,
        "size": size,
        "line": line,
        "data": STANDARD.encode(bytes),
    }))
}

/// Opening in the default app is limited to document and media types, never scripts or apps.
pub(crate) fn opens_in_app(path: &Path) -> bool {
    const SAFE: &[&str] = &[
        "pdf", "png", "jpg", "jpeg", "gif", "webp", "heic", "svg", "txt", "md", "csv", "tsv", "json", "rtf",
        "doc", "docx", "xls", "xlsx", "ppt", "pptx", "pages", "numbers", "key", "odt", "ods", "odp", "mp3",
        "wav", "m4a", "mp4", "mov", "webm",
    ];
    path.extension()
        .and_then(|e| e.to_str())
        .map(|e| SAFE.contains(&e.to_ascii_lowercase().as_str()))
        .unwrap_or(false)
}

#[tauri::command]
pub async fn reveal_project_file(chat_id: String, path: String, open: bool) -> Result<(), String> {
    let (raw, _) = split_line(&path);
    let (workspace, roots) = roots(&chat_id)?;
    let real = resolve_in(&workspace, &roots, &raw)?;
    if open && !opens_in_app(&real) {
        return Err("Этот тип файла можно только показать в Finder".into());
    }
    let mut cmd = Command::new("open");
    if !open {
        cmd.arg("-R");
    }
    let status = cmd.arg(&real).status().await.map_err(|e| e.to_string())?;
    if status.success() {
        Ok(())
    } else {
        Err("Не удалось открыть файл".into())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn line_suffixes() {
        assert_eq!(split_line("src/a.rs:12"), ("src/a.rs".into(), Some(12)));
        assert_eq!(split_line("`src/a.rs:12:5`"), ("src/a.rs".into(), Some(12)));
        assert_eq!(split_line("file:///tmp/x.md"), ("/tmp/x.md".into(), None));
        assert_eq!(split_line("README.md"), ("README.md".into(), None));
    }
    #[test]
    fn paths_stay_inside_roots() {
        let base = std::env::temp_dir().join(format!("nexus-fp-{}", std::process::id()));
        let ws = base.join("ws");
        let other = base.join("other");
        std::fs::create_dir_all(ws.join("src")).unwrap();
        std::fs::create_dir_all(&other).unwrap();
        std::fs::write(ws.join("src/a.txt"), "a").unwrap();
        std::fs::write(other.join("secret.txt"), "s").unwrap();
        #[cfg(unix)]
        std::os::unix::fs::symlink(other.join("secret.txt"), ws.join("link.txt")).unwrap();
        let roots = vec![ws.canonicalize().unwrap()];
        assert!(resolve_in(&ws, &roots, "src/a.txt").is_ok());
        assert!(resolve_in(&ws, &roots, "../other/secret.txt").is_err());
        assert!(resolve_in(&ws, &roots, &other.join("secret.txt").to_string_lossy()).is_err());
        #[cfg(unix)]
        assert!(resolve_in(&ws, &roots, "link.txt").is_err());
        assert!(resolve_in(&ws, &roots, "src").is_err());
        assert!(resolve_in(&ws, &roots, "a\nb").is_err());
        assert!(opens_in_app(Path::new("/a/b.docx")) && !opens_in_app(Path::new("/a/run.command")));
        let _ = std::fs::remove_dir_all(&base);
    }
}
