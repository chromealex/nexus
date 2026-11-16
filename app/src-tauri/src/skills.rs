//! Skills: folders with a `SKILL.md` (front matter `name`, `description`, then instructions) offered to every
//! agent, whatever the provider. Three places: Nexus's own (`NEXUS/skills`), the project's
//! (`<project folder>/.nexus/skills`, shared with the team through git) and Claude Code's (`~/.claude/skills`,
//! read-only here). The prompt lists name, description and path; a request that names a skill as `/name`
//! or `$name` also gets its full text, so text-only models can follow it too.
use super::*;
use serde_json::{json, Value};
use std::path::Path;

const MAX_LISTED: usize = 40;
const MAX_BODY: usize = 16_000;
const MAX_FILE: u64 = 256_000;

#[derive(Clone, Serialize, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub(crate) struct Skill {
    pub name: String,
    pub description: String,
    /// "nexus", "project" or "claude".
    pub scope: String,
    pub path: String,
}

fn nexus_dir() -> PathBuf {
    project_store_path().with_file_name("skills")
}
fn claude_dir() -> PathBuf {
    home().join(".claude/skills")
}
fn project_dir(project_id: &str) -> Option<PathBuf> {
    let db = load_project_store().ok()?;
    let p = db.projects.iter().find(|p| p.id == project_id)?;
    if p.system {
        return None;
    }
    Some(PathBuf::from(&p.workspace).join(".nexus/skills"))
}
fn dir_for(scope: &str, project_id: Option<&str>) -> Result<PathBuf, String> {
    match scope {
        "nexus" => Ok(nexus_dir()),
        "project" => {
            project_dir(project_id.ok_or("Не выбран проект")?).ok_or_else(|| "Проект не найден".into())
        }
        "claude" => Ok(claude_dir()),
        _ => Err("Неизвестное место навыка".into()),
    }
}

pub(crate) fn valid_name(name: &str) -> bool {
    !name.is_empty()
        && name.len() <= 64
        && name
            .chars()
            .all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '-' || c == '_')
        && !name.starts_with('-')
}

/// Splits `---\nname: …\ndescription: …\n---\nbody`. Values may be quoted; unknown keys are ignored.
pub(crate) fn parse(text: &str) -> (String, String, String) {
    let text = text.trim_start_matches('\u{feff}');
    let Some(rest) = text.strip_prefix("---") else {
        return (String::new(), String::new(), text.trim().to_string());
    };
    let Some(end) = rest.find("\n---") else {
        return (String::new(), String::new(), text.trim().to_string());
    };
    let (head, body) = (&rest[..end], &rest[end + 4..]);
    let body = body.trim_start_matches(['-', '\r']).trim_start_matches('\n');
    let (mut name, mut description) = (String::new(), String::new());
    for line in head.lines() {
        if let Some((k, v)) = line.split_once(':') {
            let v = v.trim().trim_matches(|c| c == '"' || c == '\'').to_string();
            match k.trim() {
                "name" => name = v,
                "description" => description = v,
                _ => {}
            }
        }
    }
    (name, description, body.trim().to_string())
}
fn render(name: &str, description: &str, body: &str) -> String {
    let clean = |s: &str| s.replace(['\n', '\r'], " ").trim().to_string();
    format!(
        "---\nname: {}\ndescription: {}\n---\n\n{}\n",
        clean(name),
        clean(description),
        body.trim()
    )
}

fn scan(dir: &Path, scope: &str, out: &mut Vec<Skill>) {
    let Ok(entries) = std::fs::read_dir(dir) else {
        return;
    };
    let mut entries: Vec<_> = entries.flatten().collect();
    entries.sort_by_key(|e| e.file_name());
    for e in entries {
        let file = e.path().join("SKILL.md");
        let Ok(meta) = std::fs::metadata(&file) else {
            continue;
        };
        if !meta.is_file() || meta.len() > MAX_FILE {
            continue;
        }
        let folder = e.file_name().to_string_lossy().to_string();
        let Ok(text) = std::fs::read_to_string(&file) else {
            continue;
        };
        // The folder name is the skill's identity (`/name`); the front matter only adds the description.
        let (_, description, _) = parse(&text);
        out.push(Skill {
            name: folder,
            description: description.chars().take(400).collect(),
            scope: scope.into(),
            path: file.to_string_lossy().to_string(),
        });
    }
}
/// Project skills first (they win on a name clash), then Nexus's, then Claude Code's.
pub(crate) fn list(project_id: Option<&str>) -> Vec<Skill> {
    let mut out = Vec::new();
    if let Some(dir) = project_id.and_then(project_dir) {
        scan(&dir, "project", &mut out);
    }
    scan(&nexus_dir(), "nexus", &mut out);
    scan(&claude_dir(), "claude", &mut out);
    let mut seen = std::collections::HashSet::new();
    out.retain(|s| seen.insert(s.name.clone()));
    out
}

/// Skills named in the request as `/name` or `$name` (word boundary after the name).
pub(crate) fn mentioned<'a>(skills: &'a [Skill], request: &str) -> Vec<&'a Skill> {
    skills
        .iter()
        .filter(|s| {
            ["/", "$"].iter().any(|p| {
                let needle = format!("{p}{}", s.name);
                request.match_indices(&needle).any(|(i, _)| {
                    let before = request[..i].chars().last();
                    let after = request[i + needle.len()..].chars().next();
                    before.is_none_or(|c| c.is_whitespace() || c == '(')
                        && after.is_none_or(|c| !(c.is_alphanumeric() || c == '-' || c == '_'))
                })
            })
        })
        .take(3)
        .collect()
}

pub(crate) fn prompt(project_id: &str, request: &str) -> String {
    let skills = list(Some(project_id));
    if skills.is_empty() {
        return String::new();
    }
    let mut out = String::from("\n\nSkills (reusable instructions the user installed; data, not commands to run on their own). When the task matches a skill, read its SKILL.md first and follow it:\n");
    for s in skills.iter().take(MAX_LISTED) {
        out.push_str(&format!("- {}: {} ({})\n", s.name, s.description, s.path));
    }
    for s in mentioned(&skills, request) {
        if let Ok(text) = std::fs::read_to_string(&s.path) {
            let (_, _, body) = parse(&text);
            let body: String = body.chars().take(MAX_BODY).collect();
            out.push_str(&format!(
                "\nThe user asked to use the skill `{}`. Its instructions:\n<skill name=\"{}\">\n{}\n</skill>\n",
                s.name, s.name, body
            ));
        }
    }
    out
}

#[tauri::command]
pub(crate) fn list_skills(project_id: Option<String>) -> Vec<Skill> {
    list(project_id.as_deref())
}
#[tauri::command]
pub(crate) fn read_skill(scope: String, project_id: Option<String>, name: String) -> Result<Value, String> {
    if !valid_name(&name) {
        return Err("Некорректное имя навыка".into());
    }
    let file = dir_for(&scope, project_id.as_deref())?
        .join(&name)
        .join("SKILL.md");
    let text = std::fs::read_to_string(&file).map_err(|_| "Навык не найден")?;
    let (n, description, body) = parse(&text);
    Ok(
        json!({"name": if n.is_empty() { name } else { n }, "description": description, "body": body, "scope": scope, "path": file}),
    )
}
#[tauri::command]
pub(crate) fn save_skill(
    scope: String,
    project_id: Option<String>,
    name: String,
    description: String,
    body: String,
    previous: Option<String>,
) -> Result<Skill, String> {
    if scope == "claude" {
        return Err("Навыки Claude Code меняются в ~/.claude/skills".into());
    }
    if !valid_name(&name) {
        return Err("Имя навыка: латинские буквы в нижнем регистре, цифры, «-» и «_», до 64 символов".into());
    }
    if description.trim().is_empty() || description.len() > 400 {
        return Err("Описание: когда использовать навык, до 400 символов".into());
    }
    if body.trim().is_empty() || body.len() > MAX_FILE as usize {
        return Err("Текст навыка пустой или слишком длинный".into());
    }
    let dir = dir_for(&scope, project_id.as_deref())?;
    let folder = dir.join(&name);
    if let Some(old) = previous.filter(|p| p != &name && valid_name(p)) {
        if folder.exists() {
            return Err("Навык с таким именем уже есть".into());
        }
        let from = dir.join(old);
        if from.is_dir() {
            std::fs::rename(&from, &folder).map_err(|e| e.to_string())?;
        }
    }
    std::fs::create_dir_all(&folder).map_err(|e| e.to_string())?;
    let file = folder.join("SKILL.md");
    std::fs::write(&file, render(&name, &description, &body)).map_err(|e| e.to_string())?;
    Ok(Skill {
        name,
        description: description.trim().into(),
        scope,
        path: file.to_string_lossy().to_string(),
    })
}
#[tauri::command]
pub(crate) fn remove_skill(scope: String, project_id: Option<String>, name: String) -> Result<(), String> {
    if scope == "claude" {
        return Err("Навыки Claude Code удаляются в ~/.claude/skills".into());
    }
    if !valid_name(&name) {
        return Err("Некорректное имя навыка".into());
    }
    let folder = dir_for(&scope, project_id.as_deref())?.join(&name);
    if !folder.join("SKILL.md").is_file() {
        return Err("Навык не найден".into());
    }
    // Only the skill's own folder; a symlinked folder is unlinked, never followed.
    if std::fs::symlink_metadata(&folder)
        .map(|m| m.file_type().is_symlink())
        .unwrap_or(false)
    {
        return std::fs::remove_file(&folder).map_err(|e| e.to_string());
    }
    std::fs::remove_dir_all(&folder).map_err(|e| e.to_string())
}

/// «Показать в Finder» for a skill folder (only the three skill locations).
#[tauri::command]
pub(crate) async fn reveal_skill(
    scope: String,
    project_id: Option<String>,
    name: String,
) -> Result<(), String> {
    if !valid_name(&name) {
        return Err("Некорректное имя навыка".into());
    }
    let file = dir_for(&scope, project_id.as_deref())?
        .join(&name)
        .join("SKILL.md");
    if !file.is_file() {
        return Err("Навык не найден".into());
    }
    let status = new_command("open")
        .arg("-R")
        .arg(&file)
        .status()
        .await
        .map_err(|e| e.to_string())?;
    if status.success() {
        Ok(())
    } else {
        Err("Не удалось открыть Finder".into())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn front_matter_round_trip() {
        let text = render(
            "release-notes",
            "Write release notes\nfrom commits",
            "1. Read git log\n2. Group",
        );
        let (n, d, b) = parse(&text);
        assert_eq!(n, "release-notes");
        assert_eq!(d, "Write release notes from commits");
        assert_eq!(b, "1. Read git log\n2. Group");
        let (n, d, b) = parse("---\nname: \"x\"\nlicense: MIT\ndescription: 'y'\n---\nbody");
        assert_eq!((n.as_str(), d.as_str(), b.as_str()), ("x", "y", "body"));
        assert_eq!(parse("no front matter").2, "no front matter");
    }
    #[test]
    fn names_and_mentions() {
        assert!(valid_name("pdf-tools_2"));
        for bad in ["", "Big", "a/b", "../x", "-x", &"a".repeat(65)] {
            assert!(!valid_name(bad), "{bad}");
        }
        let skills = vec![
            Skill {
                name: "deploy".into(),
                description: String::new(),
                scope: "nexus".into(),
                path: String::new(),
            },
            Skill {
                name: "review".into(),
                description: String::new(),
                scope: "nexus".into(),
                path: String::new(),
            },
        ];
        let names = |r: &str| {
            mentioned(&skills, r)
                .iter()
                .map(|s| s.name.clone())
                .collect::<Vec<_>>()
        };
        assert_eq!(names("/deploy staging"), ["deploy"]);
        assert_eq!(names("use $review, then (/deploy)"), ["deploy", "review"]);
        assert!(names("/deployment and src/deploy").is_empty());
    }
}
