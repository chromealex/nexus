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
/// Files under `root` whose path ends with `suffix` (whole path components). Symlinks are not followed;
/// dependency, build and VCS folders are skipped; the walk is bounded.
pub(crate) fn find_by_suffix(root: &Path, suffix: &str) -> Vec<PathBuf> {
    const SKIP: &[&str] = &[
        ".git",
        "node_modules",
        "target",
        ".venv",
        "venv",
        "__pycache__",
        "DerivedData",
        "Library",
        ".cache",
        "dist",
        ".next",
        "Pods",
    ];
    let wanted: Vec<&str> = suffix
        .split(['/', '\\'])
        .filter(|p| !p.is_empty() && *p != ".")
        .collect();
    if wanted.is_empty() {
        return vec![];
    }
    let mut out = Vec::new();
    let mut seen = 0;
    let mut stack = vec![(root.to_path_buf(), 0)];
    while let Some((dir, depth)) = stack.pop() {
        let Ok(entries) = std::fs::read_dir(&dir) else {
            continue;
        };
        for e in entries.flatten() {
            seen += 1;
            if seen > 60_000 || out.len() > 8 {
                return out;
            }
            let Ok(kind) = e.file_type() else {
                continue;
            };
            let name = e.file_name().to_string_lossy().to_string();
            if kind.is_dir() {
                if depth < 14 && !SKIP.contains(&name.as_str()) {
                    stack.push((e.path(), depth + 1));
                }
            } else if kind.is_file() && name == *wanted.last().unwrap_or(&"") {
                let path = e.path();
                let parts: Vec<String> = path
                    .components()
                    .map(|c| c.as_os_str().to_string_lossy().to_string())
                    .collect();
                if parts.len() >= wanted.len()
                    && parts[parts.len() - wanted.len()..]
                        .iter()
                        .zip(&wanted)
                        .all(|(a, b)| a == b)
                {
                    out.push(path);
                }
            }
        }
    }
    out.sort_by_key(|p| p.components().count());
    out
}
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
    let real = match candidate.canonicalize() {
        Ok(real) => real,
        Err(_) if !Path::new(raw).is_absolute() && !raw.starts_with("~/") && !raw.contains("..") => {
            return resolve_lookup(workspace, roots, raw).map(|(p, _, _)| p);
        }
        Err(_) => return Err(format!("Файл не найден: {raw}")),
    };
    if !roots.iter().any(|root| real.starts_with(root)) {
        return Err("Файл вне проекта: открываются только файлы рабочей папки и контекста проекта".into());
    }
    if !real.is_file() {
        return Err("Это не файл".into());
    }
    Ok(real)
}

/// Agents often name a file without its folder (`build_city.py`), with a partial path, or with a path
/// that is only an example. Lookup order: path suffix, then the bare file name. The match closest to the
/// project root opens; the others are returned as alternatives. Returns (file, alternatives, exact suffix).
pub(crate) fn resolve_lookup(
    workspace: &Path,
    roots: &[PathBuf],
    raw: &str,
) -> Result<(PathBuf, Vec<String>, bool), String> {
    let base = workspace
        .canonicalize()
        .unwrap_or_else(|_| workspace.to_path_buf());
    let mut found = find_by_suffix(workspace, raw);
    let exact = !found.is_empty();
    if found.is_empty() {
        if let Some(name) = Path::new(raw)
            .file_name()
            .map(|n| n.to_string_lossy().to_string())
        {
            if name != raw {
                found = find_by_suffix(workspace, &name);
            }
        }
    }
    let found: Vec<PathBuf> = found
        .into_iter()
        .filter_map(|p| p.canonicalize().ok())
        .filter(|p| p.is_file() && roots.iter().any(|r| p.starts_with(r)))
        .collect();
    let Some(first) = found.first().cloned() else {
        return Err(format!("Файл не найден в проекте: {raw}"));
    };
    let rel = |p: &PathBuf| p.strip_prefix(&base).unwrap_or(p).to_string_lossy().to_string();
    let others = found.iter().skip(1).take(6).map(rel).collect();
    Ok((first, others, exact))
}
#[tauri::command]
pub fn read_project_file(chat_id: String, path: String) -> Result<Value, String> {
    let (raw, line) = split_line(&path);
    let (workspace, roots) = roots(&chat_id)?;
    let (real, alternatives, exact) = match resolve_in(&workspace, &roots, &raw) {
        Ok(real) => (real, vec![], true),
        Err(_) if !Path::new(&raw).is_absolute() && !raw.starts_with("~/") && !raw.contains("..") => {
            resolve_lookup(&workspace, &roots, &raw)?
        }
        Err(e) => return Err(e),
    };
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
        "alternatives": alternatives,
        "requested": if exact { Value::Null } else { json!(raw) },
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
    let mut cmd = crate::new_command("open");
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
    fn bare_file_names_are_found_in_the_project() {
        let root = std::env::temp_dir().join(format!("nexus-find-{}", std::process::id()));
        let deep = root.join("assets_src/_pipeline");
        std::fs::create_dir_all(&deep).unwrap();
        std::fs::create_dir_all(root.join("node_modules/x")).unwrap();
        std::fs::write(deep.join("build_city.py"), "print(1)").unwrap();
        std::fs::write(root.join("node_modules/x/build_city.py"), "").unwrap();
        let found = find_by_suffix(&root, "build_city.py");
        assert_eq!(found.len(), 1);
        assert!(found[0].ends_with("assets_src/_pipeline/build_city.py"));
        assert_eq!(find_by_suffix(&root, "_pipeline/build_city.py").len(), 1);
        assert!(find_by_suffix(&root, "other/build_city.py").is_empty());
        let roots = vec![root.canonicalize().unwrap()];
        assert!(resolve_in(&root, &roots, "build_city.py").is_ok());
        // A path that does not exist falls back to the file name and says so.
        let (p, _, exact) = resolve_lookup(&root, &roots, "scripts/build_city.py").unwrap();
        assert!(p.ends_with("build_city.py") && !exact);
        std::fs::create_dir_all(root.join("project/Builds/x")).unwrap();
        std::fs::write(root.join("project/rules.json"), "{}").unwrap();
        std::fs::write(root.join("project/Builds/x/rules.json"), "{}").unwrap();
        let (p, others, _) = resolve_lookup(&root, &roots, "rules.json").unwrap();
        assert!(p.ends_with("project/rules.json") && others.len() == 1);
        let _ = std::fs::remove_dir_all(&root);
    }
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
