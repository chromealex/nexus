//! «Импорт из Claude Code и Codex»: finds project folders those agents already worked in (on this Mac
//! and in Nexus's own isolated profiles) and adds the chosen ones as Nexus projects. Only folder paths
//! and timestamps are read; conversations, credentials and settings of the agents are not touched.
use super::*;
use serde_json::{json, Value};
use std::collections::BTreeMap;
use std::io::{BufRead, Read};
use std::path::Path;

#[derive(Default, Clone)]
struct Found {
    sources: Vec<&'static str>,
    last_used: u64,
    sessions: u64,
}

fn mtime(path: &Path) -> u64 {
    path.metadata()
        .and_then(|m| m.modified())
        .ok()
        .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
        .map(|d| d.as_secs())
        .unwrap_or(0)
}

fn add(map: &mut BTreeMap<String, Found>, path: &str, source: &'static str, used: u64, sessions: u64) {
    let path = path.trim_end_matches('/');
    if path.is_empty() || !path.starts_with('/') {
        return;
    }
    let entry = map.entry(path.to_string()).or_default();
    if !entry.sources.contains(&source) {
        entry.sources.push(source);
    }
    entry.last_used = entry.last_used.max(used);
    entry.sessions += sessions;
}

/// Claude Code stores session folders as the path with `/` and `.` replaced by `-`.
pub(crate) fn claude_folder_name(path: &str) -> String {
    path.chars()
        .map(|c| if c == '/' || c == '.' { '-' } else { c })
        .collect()
}

/// `projects` keys of a `.claude.json` file.
pub(crate) fn claude_project_paths(json_text: &str) -> Vec<String> {
    serde_json::from_str::<Value>(json_text)
        .ok()
        .and_then(|v| {
            v.get("projects")
                .and_then(Value::as_object)
                .map(|m| m.keys().cloned().collect())
        })
        .unwrap_or_default()
}

/// `[projects."/path"]` tables of a Codex `config.toml`.
pub(crate) fn codex_project_paths(toml_text: &str) -> Vec<String> {
    toml_text
        .lines()
        .filter_map(|l| {
            let l = l.trim();
            let inner = l.strip_prefix("[projects.")?.strip_suffix(']')?;
            let inner = inner.trim();
            let path = inner
                .strip_prefix('"')
                .and_then(|s| s.strip_suffix('"'))
                .or_else(|| inner.strip_prefix('\'').and_then(|s| s.strip_suffix('\'')))?;
            Some(path.replace("\\\\", "\\"))
        })
        .collect()
}

/// `cwd` from the first line of a Codex session file (session_meta).
pub(crate) fn codex_session_cwd(first_line: &str) -> Option<String> {
    let v: Value = serde_json::from_str(first_line).ok()?;
    v.pointer("/payload/cwd")
        .or_else(|| v.get("cwd"))
        .and_then(Value::as_str)
        .map(String::from)
}

fn scan_claude(dir: &Path, map: &mut BTreeMap<String, Found>) {
    let projects_dir = dir.join("projects");
    for config in [
        dir.join(".claude.json"),
        dir.parent().map(|p| p.join(".claude.json")).unwrap_or_default(),
    ] {
        let Ok(text) = std::fs::read_to_string(&config) else {
            continue;
        };
        for path in claude_project_paths(&text) {
            let folder = projects_dir.join(claude_folder_name(&path));
            let sessions = std::fs::read_dir(&folder)
                .map(|d| {
                    d.flatten()
                        .filter(|e| e.path().extension().is_some_and(|x| x == "jsonl"))
                        .count() as u64
                })
                .unwrap_or(0);
            let used = if folder.exists() {
                mtime(&folder)
            } else {
                mtime(&config)
            };
            add(map, &path, "claude", used, sessions);
        }
    }
}

fn scan_codex(dir: &Path, map: &mut BTreeMap<String, Found>) {
    if let Ok(text) = std::fs::read_to_string(dir.join("config.toml")) {
        for path in codex_project_paths(&text) {
            add(map, &path, "codex", mtime(&dir.join("config.toml")), 0);
        }
    }
    // sessions/YYYY/MM/DD/rollout-*.jsonl — newest first, bounded.
    let mut files = Vec::new();
    let mut stack = vec![(dir.join("sessions"), 0)];
    while let Some((d, depth)) = stack.pop() {
        let Ok(entries) = std::fs::read_dir(&d) else {
            continue;
        };
        for e in entries.flatten() {
            let p = e.path();
            if p.is_dir() && depth < 4 {
                stack.push((p, depth + 1));
            } else if p.extension().is_some_and(|x| x == "jsonl") {
                files.push(p);
            }
        }
        if files.len() > 5000 {
            break;
        }
    }
    files.sort_by_key(|p| std::cmp::Reverse(mtime(p)));
    for file in files.into_iter().take(3000) {
        let Ok(f) = std::fs::File::open(&file) else {
            continue;
        };
        let mut line = String::new();
        if std::io::BufReader::new(f.take(64 * 1024))
            .read_line(&mut line)
            .is_err()
        {
            continue;
        }
        if let Some(cwd) = codex_session_cwd(&line) {
            add(map, &cwd, "codex", mtime(&file), 1);
        }
    }
}

/// Folders worth offering: existing directories, not the home folder or system roots, not Nexus data.
pub(crate) fn importable(path: &str, home_dir: &Path) -> bool {
    let p = Path::new(path);
    p.is_absolute()
        && p.is_dir()
        && p != home_dir
        && p.components().count() > 2
        && !path.contains("/Library/Application Support/NEXUS")
        && !path.starts_with("/private/")
        && !path.starts_with("/tmp")
        && !path.starts_with("/var/")
}

#[tauri::command]
pub async fn import_candidates() -> Result<Vec<Value>, String> {
    tokio::task::spawn_blocking(|| {
        let mut map = BTreeMap::new();
        let home_dir = home();
        scan_claude(&home_dir.join(".claude"), &mut map);
        scan_codex(&home_dir.join(".codex"), &mut map);
        // Nexus keeps each connected account in its own profile folder.
        for profile in load_profiles().unwrap_or_default() {
            let dir = PathBuf::from(&profile.config_dir);
            match profile.provider.as_str() {
                "claude" => scan_claude(&dir, &mut map),
                "codex" => scan_codex(&dir, &mut map),
                _ => {}
            }
        }
        let existing: Vec<String> = load_project_store()
            .map(|db| db.projects.into_iter().map(|p| p.workspace).collect())
            .unwrap_or_default();
        let mut rows: Vec<Value> = map
            .into_iter()
            .filter(|(path, _)| importable(path, &home_dir))
            .map(|(path, f)| {
                let name = Path::new(&path).file_name().map(|n| n.to_string_lossy().to_string()).unwrap_or_default();
                let added = existing.iter().any(|w| w.trim_end_matches('/') == path);
                json!({"path":path,"name":name,"sources":f.sources,"lastUsed":f.last_used,"sessions":f.sessions,"added":added})
            })
            .collect();
        rows.sort_by_key(|r| std::cmp::Reverse(r["lastUsed"].as_u64().unwrap_or(0)));
        rows.truncate(300);
        Ok(rows)
    })
    .await
    .map_err(|e| e.to_string())?
}

/// Adds the chosen folders as projects named after the folder; already added folders are skipped.
#[tauri::command]
pub fn import_projects(paths: Vec<String>) -> Result<Value, String> {
    if paths.len() > 100 {
        return Err("Не больше 100 проектов за раз".into());
    }
    let mut added = Vec::new();
    let mut skipped = Vec::new();
    for path in paths {
        let name = Path::new(&path)
            .file_name()
            .map(|n| n.to_string_lossy().chars().take(120).collect::<String>())
            .unwrap_or_else(|| "Проект".into());
        match create_project(name, path.clone(), None) {
            Ok(p) => added.push(json!(p)),
            Err(e) => skipped.push(json!({"path":path,"reason":e})),
        }
    }
    Ok(json!({"added":added,"skipped":skipped}))
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn parses_agent_configs() {
        assert_eq!(claude_folder_name("/Users/a/my.app/x"), "-Users-a-my-app-x");
        assert_eq!(
            claude_project_paths(r#"{"projects":{"/Users/a/one":{},"/Users/a/two":{"x":1}},"other":1}"#),
            vec!["/Users/a/one", "/Users/a/two"]
        );
        assert!(claude_project_paths("not json").is_empty());
        let toml = "model = \"x\"\n[projects.\"/Users/a/game\"]\ntrust_level = \"trusted\"\n[projects.'/Users/a/site']\n[profiles.x]\n";
        assert_eq!(codex_project_paths(toml), vec!["/Users/a/game", "/Users/a/site"]);
        assert_eq!(
            codex_session_cwd(r#"{"type":"session_meta","payload":{"id":"1","cwd":"/Users/a/game"}}"#)
                .as_deref(),
            Some("/Users/a/game")
        );
        assert_eq!(codex_session_cwd("{}"), None);
    }
    #[test]
    fn filters_unsuitable_folders() {
        let base = std::env::temp_dir().join(format!("nexus-import-{}", std::process::id()));
        std::fs::create_dir_all(base.join("proj")).unwrap();
        let home_dir = PathBuf::from("/Users/nobody");
        assert!(!importable("/", &home_dir));
        assert!(!importable("/Users/nobody", &home_dir));
        assert!(!importable("/does/not/exist", &home_dir));
        assert!(!importable("relative/path", &home_dir));
        let p = base.join("proj");
        // temp dirs are excluded on macOS (/private, /var); elsewhere an existing folder is accepted.
        let expected = !p.starts_with("/tmp") && !p.starts_with("/var") && !p.starts_with("/private");
        assert_eq!(importable(&p.to_string_lossy(), &home_dir), expected);
        let mut map = BTreeMap::new();
        add(&mut map, "/Users/a/x/", "claude", 5, 2);
        add(&mut map, "/Users/a/x", "codex", 9, 1);
        let f = &map["/Users/a/x"];
        assert_eq!(
            (f.sources.clone(), f.last_used, f.sessions),
            (vec!["claude", "codex"], 9, 3)
        );
        let _ = std::fs::remove_dir_all(&base);
    }
}
