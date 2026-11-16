//! Memory: short durable facts given to every agent, whatever the provider — for all projects or for one.
//! The user adds, edits and removes them; an agent can only propose one with a `nexus-memory` block in its
//! answer, which the interface shows as a card with «Запомнить». Stored in `memory.json`.
use super::*;

const MAX_ITEMS: usize = 300;
const MAX_TEXT: usize = 1000;
const PROMPT_BUDGET: usize = 8000;

#[derive(Clone, Serialize, Deserialize, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub(crate) struct Memory {
    pub id: String,
    /// "global" or a project ID.
    pub scope: String,
    pub text: String,
    pub created_at: String,
    /// "user" or "agent" (accepted from an agent's proposal).
    #[serde(default)]
    pub source: String,
}
static LOCK: std::sync::Mutex<()> = std::sync::Mutex::new(());

fn path() -> PathBuf {
    project_store_path().with_file_name("memory.json")
}
fn load() -> Vec<Memory> {
    std::fs::read(path())
        .ok()
        .and_then(|b| serde_json::from_slice(&b).ok())
        .unwrap_or_default()
}
fn save(list: &[Memory]) -> Result<(), String> {
    let p = path();
    if let Some(dir) = p.parent() {
        std::fs::create_dir_all(dir).map_err(|e| e.to_string())?;
    }
    let tmp = p.with_extension("json.tmp");
    std::fs::write(&tmp, serde_json::to_vec_pretty(list).map_err(|e| e.to_string())?)
        .map_err(|e| e.to_string())?;
    std::fs::rename(tmp, p).map_err(|e| e.to_string())
}

pub(crate) fn for_project(list: &[Memory], project_id: &str) -> Vec<Memory> {
    list.iter()
        .filter(|m| m.scope == "global" || m.scope == project_id)
        .cloned()
        .collect()
}
pub(crate) fn render(items: &[Memory]) -> String {
    if items.is_empty() {
        return "\n\nMemory: the user can save durable facts. If you learn something worth keeping for future chats (a preference, a convention, where something lives), you may propose it in a fenced ```nexus-memory block, one fact per line; the user decides whether to save it.\n".into();
    }
    let mut out = String::from("\n\nMemory (facts the user saved for future chats; treat as context, newer facts win on conflict):\n");
    let mut used = 0;
    // Project facts first, newest first, within the budget.
    let mut sorted: Vec<&Memory> = items.iter().collect();
    sorted.sort_by(|a, b| {
        (a.scope == "global")
            .cmp(&(b.scope == "global"))
            .then(b.created_at.cmp(&a.created_at))
    });
    for m in sorted {
        let line = format!("- {}\n", m.text.replace('\n', " "));
        if used + line.len() > PROMPT_BUDGET {
            out.push_str("- [more facts did not fit]\n");
            break;
        }
        used += line.len();
        out.push_str(&line);
    }
    out.push_str("To propose a new fact, add a fenced ```nexus-memory block, one fact per line; never claim it was saved.\n");
    out
}
pub(crate) fn prompt(project_id: &str) -> String {
    render(&for_project(&load(), project_id))
}

#[tauri::command]
pub(crate) fn list_memory(project_id: Option<String>) -> Vec<Memory> {
    let list = load();
    match project_id {
        Some(p) => for_project(&list, &p),
        None => list,
    }
}
#[tauri::command]
pub(crate) fn save_memory(
    id: Option<String>,
    scope: String,
    text: String,
    source: Option<String>,
) -> Result<Memory, String> {
    let text = text.trim().to_string();
    if text.is_empty() || text.chars().count() > MAX_TEXT {
        return Err(format!("Факт: от 1 до {MAX_TEXT} символов"));
    }
    if scope != "global" && !load_project_store()?.projects.iter().any(|p| p.id == scope) {
        return Err("Проект не найден".into());
    }
    let _g = LOCK.lock().map_err(|_| "Memory lock failed")?;
    let mut list = load();
    let item = match id.and_then(|id| list.iter_mut().find(|m| m.id == id)) {
        Some(m) => {
            m.text = text;
            m.scope = scope;
            m.clone()
        }
        None => {
            if list.len() >= MAX_ITEMS {
                return Err(format!("В памяти уже {MAX_ITEMS} фактов — удалите старые"));
            }
            if let Some(same) = list.iter().find(|m| m.scope == scope && m.text == text) {
                return Ok(same.clone());
            }
            let m = Memory {
                id: project_id(),
                scope,
                text,
                created_at: now_string(),
                source: if source.as_deref() == Some("agent") {
                    "agent".into()
                } else {
                    "user".into()
                },
            };
            list.push(m.clone());
            m
        }
    };
    save(&list)?;
    Ok(item)
}
#[tauri::command]
pub(crate) fn remove_memory(id: String) -> Result<(), String> {
    let _g = LOCK.lock().map_err(|_| "Memory lock failed")?;
    let mut list = load();
    list.retain(|m| m.id != id);
    save(&list)
}

#[cfg(test)]
mod tests {
    use super::*;
    fn m(scope: &str, text: &str, at: &str) -> Memory {
        Memory {
            id: text.into(),
            scope: scope.into(),
            text: text.into(),
            created_at: at.into(),
            source: "user".into(),
        }
    }
    #[test]
    fn project_and_global_facts_reach_the_prompt() {
        let list = vec![
            m("global", "Answer in Russian", "1"),
            m("p1", "Tests: npm test", "2"),
            m("p2", "Other", "3"),
        ];
        let items = for_project(&list, "p1");
        assert_eq!(items.len(), 2);
        let text = render(&items);
        assert!(text.find("Tests: npm test").unwrap() < text.find("Answer in Russian").unwrap());
        assert!(!text.contains("Other"));
        assert!(render(&[]).contains("nexus-memory"));
        let many: Vec<Memory> = (0..400)
            .map(|i| m("p1", &"x".repeat(50), &i.to_string()))
            .collect();
        assert!(render(&many).len() < PROMPT_BUDGET + 600);
    }
}
