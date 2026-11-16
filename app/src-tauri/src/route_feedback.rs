//! What the user thinks of the answers of each model, per kind of task, so Auto can prefer the models
//! that work for this user among otherwise equal candidates. Signals: an explicit rating of an answer
//! (weight 2) or, when there is none, the reaction in the user's next message (weight 1). An explicit
//! rating replaces the implicit signal of the same answer. Stored in `route-feedback.json`.
use super::*;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::collections::HashMap;
use std::path::Path;
use std::sync::Mutex;

static LOCK: Mutex<()> = Mutex::new(());
const MAX_ANSWERS: usize = 4000;

#[derive(Serialize, Deserialize, Default, Clone)]
pub(crate) struct Answer {
    pub model: String,
    pub kind: String,
    /// +1 / −1 / 0 (no signal yet)
    #[serde(default)]
    pub signal: i8,
    #[serde(default)]
    pub explicit: bool,
    #[serde(default)]
    pub at: u64,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub project: Option<String>,
}
#[derive(Serialize, Deserialize, Default)]
struct Store {
    #[serde(default)]
    answers: HashMap<String, Answer>,
    /// Projects whose ratings are shared with the team through the project folder.
    #[serde(default)]
    shared: Vec<String>,
    /// Random install id naming this user's file in shared projects (no name or e-mail).
    #[serde(default)]
    install: String,
}
fn data() -> PathBuf {
    home().join("Library/Application Support/NEXUS")
}
fn path() -> PathBuf {
    data().join("route-feedback.json")
}
fn load() -> Store {
    std::fs::read_to_string(path())
        .ok()
        .and_then(|t| serde_json::from_str(&t).ok())
        .unwrap_or_default()
}
fn save(store: &Store) -> Result<(), String> {
    let text = serde_json::to_string(store).map_err(|e| e.to_string())?;
    std::fs::create_dir_all(data()).map_err(|e| e.to_string())?;
    let tmp = path().with_extension("json.tmp");
    std::fs::write(&tmp, text).map_err(|e| e.to_string())?;
    std::fs::rename(tmp, path()).map_err(|e| e.to_string())
}
fn clean(s: &str, n: usize) -> String {
    s.chars().filter(|c| !c.is_control()).take(n).collect()
}
fn now() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0)
}

/// Remembers which model answered a message and for what kind of task.
#[tauri::command]
pub fn note_answer_route(
    message_id: String,
    model_id: String,
    kind: String,
    project_id: Option<String>,
) -> Result<(), String> {
    if message_id.is_empty() || model_id.is_empty() {
        return Ok(());
    }
    let _g = LOCK.lock().map_err(|_| "Feedback store lock failed")?;
    let mut store = load();
    store.answers.insert(
        clean(&message_id, 80),
        Answer {
            model: clean(&model_id, 160),
            kind: clean(&kind, 24),
            signal: 0,
            explicit: false,
            at: now(),
            project: project_id.map(|p| clean(&p, 80)),
        },
    );
    if store.answers.len() > MAX_ANSWERS {
        let mut ages: Vec<(String, u64)> = store.answers.iter().map(|(k, a)| (k.clone(), a.at)).collect();
        ages.sort_by_key(|(_, at)| *at);
        for (k, _) in ages.into_iter().take(store.answers.len() - MAX_ANSWERS) {
            store.answers.remove(&k);
        }
    }
    save(&store)
}

/// Applies a signal to an answer. `explicit` (a rating) always wins; an implicit one is ignored once the
/// answer was rated or already judged. `signal` 0 clears an explicit rating.
#[tauri::command]
pub fn record_route_feedback(
    message_id: String,
    signal: i8,
    explicit: bool,
    regression: Option<bool>,
) -> Result<bool, String> {
    let _g = LOCK.lock().map_err(|_| "Feedback store lock failed")?;
    let mut store = load();
    let Some(answer) = store.answers.get_mut(&message_id) else {
        return Ok(false);
    };
    if !apply(answer, signal.clamp(-1, 1), explicit, regression.unwrap_or(false)) {
        return Ok(false);
    }
    let project = answer.project.clone();
    save(&store)?;
    if let Some(project) = project.filter(|p| store.shared.contains(p)) {
        let _ = publish(&mut store, &project);
    }
    Ok(true)
}
/// `regression`: the user came back later saying what this answer did does not work — a reaction that
/// counted it as a success is taken back (an explicit rating stays).
pub(crate) fn apply(answer: &mut Answer, signal: i8, explicit: bool, regression: bool) -> bool {
    if explicit {
        answer.signal = signal;
        answer.explicit = signal != 0;
        true
    } else if regression && !answer.explicit && answer.signal >= 0 && signal < 0 {
        answer.signal = -1;
        true
    } else if answer.explicit || answer.signal != 0 || signal == 0 {
        false
    } else {
        answer.signal = signal;
        true
    }
}

/// Weighted counts per `model|kind` and `model|*`: explicit ratings count 2, reactions 1. With a project
/// whose ratings are shared, the teammates' files from its folder are added to this user's own counts.
#[tauri::command]
pub fn route_feedback_stats(project_id: Option<String>) -> Result<HashMap<String, Value>, String> {
    let store = load();
    let mut out = stats(store.answers.values());
    if let Some(dir) = project_id
        .as_deref()
        .filter(|p| store.shared.iter().any(|s| s == p))
        .and_then(team_dir)
    {
        for (key, up, down) in team_counts(&dir, &store.install) {
            let e = out.entry(key).or_insert_with(|| json!({"up": 0, "down": 0}));
            e["up"] = json!(e["up"].as_u64().unwrap_or(0) + up);
            e["down"] = json!(e["down"].as_u64().unwrap_or(0) + down);
        }
    }
    Ok(out)
}

/// `<project folder>/.nexus/model-ratings`: one file per teammate, committed with the project.
fn team_dir(project_id: &str) -> Option<PathBuf> {
    let db = load_project_store().ok()?;
    let p = db.projects.into_iter().find(|p| p.id == project_id)?;
    let root = PathBuf::from(&p.workspace);
    root.is_dir().then(|| root.join(".nexus").join("model-ratings"))
}
/// Counts from teammates' files (not this user's own, already counted). Malformed files are skipped.
fn team_counts(dir: &Path, own: &str) -> Vec<(String, u64, u64)> {
    let mut out = Vec::new();
    let Ok(entries) = std::fs::read_dir(dir) else {
        return out;
    };
    for e in entries.flatten().take(200) {
        let path = e.path();
        if path.extension().is_none_or(|x| x != "json") || path.file_stem().is_some_and(|s| s == own) {
            continue;
        }
        if path.metadata().map(|m| m.len() > 512 * 1024).unwrap_or(true) {
            continue;
        }
        let Some(v) = std::fs::read_to_string(&path)
            .ok()
            .and_then(|t| serde_json::from_str::<Value>(&t).ok())
        else {
            continue;
        };
        if let Some(map) = v["stats"].as_object() {
            for (key, c) in map.iter().take(2000) {
                let (up, down) = (
                    c["up"].as_u64().unwrap_or(0).min(10_000),
                    c["down"].as_u64().unwrap_or(0).min(10_000),
                );
                out.push((clean(key, 200), up, down));
            }
        }
    }
    out
}
/// Writes this user's counts for the project into its shared folder.
fn publish(store: &mut Store, project_id: &str) -> Result<(), String> {
    if store.install.is_empty() {
        store.install = random_install_id();
        save(store)?;
    }
    let dir = team_dir(project_id).ok_or("Папка проекта недоступна")?;
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let mine = stats(
        store
            .answers
            .values()
            .filter(|a| a.project.as_deref() == Some(project_id)),
    );
    let body = json!({
        "format": "nexus-model-ratings/1",
        "note": "Counts of positive/negative signals per model|kind from one Nexus user. No message text.",
        "updatedAt": now(),
        "stats": mine,
    });
    let file = dir.join(format!("{}.json", store.install));
    let tmp = file.with_extension("json.tmp");
    std::fs::write(
        &tmp,
        serde_json::to_string_pretty(&body).map_err(|e| e.to_string())?,
    )
    .map_err(|e| e.to_string())?;
    std::fs::rename(tmp, file).map_err(|e| e.to_string())
}
fn random_install_id() -> String {
    let mut bytes = [0u8; 8];
    if let Ok(mut f) = std::fs::File::open("/dev/urandom") {
        use std::io::Read;
        let _ = f.read_exact(&mut bytes);
    } else {
        bytes = (now() ^ std::process::id() as u64).to_le_bytes();
    }
    bytes.iter().map(|b| format!("{b:02x}")).collect()
}

/// Shares (or stops sharing) this user's ratings for the project with the team through its folder.
#[tauri::command]
pub fn set_project_ratings_shared(project_id: String, shared: bool) -> Result<Value, String> {
    let _g = LOCK.lock().map_err(|_| "Feedback store lock failed")?;
    let mut store = load();
    store.shared.retain(|p| p != &project_id);
    if shared {
        store.shared.push(project_id.clone());
        save(&store)?;
        publish(&mut store, &project_id)?;
    } else {
        save(&store)?;
    }
    project_ratings_info(&store, &project_id)
}
#[tauri::command]
pub fn project_ratings_sharing(project_id: String) -> Result<Value, String> {
    project_ratings_info(&load(), &project_id)
}
fn project_ratings_info(store: &Store, project_id: &str) -> Result<Value, String> {
    let shared = store.shared.iter().any(|p| p == project_id);
    let dir = team_dir(project_id);
    let teammates = dir
        .as_ref()
        .and_then(|d| std::fs::read_dir(d).ok())
        .map(|it| {
            it.flatten()
                .filter(|e| {
                    let p = e.path();
                    p.extension().is_some_and(|x| x == "json")
                        && p.file_stem().is_some_and(|s| s != store.install.as_str())
                })
                .count()
        })
        .unwrap_or(0);
    let mine = store
        .answers
        .values()
        .filter(|a| a.project.as_deref() == Some(project_id) && a.signal != 0)
        .count();
    Ok(json!({"shared": shared, "teammates": teammates, "rated": mine, "folder": ".nexus/model-ratings"}))
}
pub(crate) fn stats<'a>(answers: impl Iterator<Item = &'a Answer>) -> HashMap<String, Value> {
    let mut counts: HashMap<String, (u32, u32)> = HashMap::new();
    for a in answers.filter(|a| a.signal != 0) {
        let w = if a.explicit { 2 } else { 1 };
        for key in [format!("{}|{}", a.model, a.kind), format!("{}|*", a.model)] {
            let e = counts.entry(key).or_default();
            if a.signal > 0 {
                e.0 += w
            } else {
                e.1 += w
            }
        }
    }
    counts
        .into_iter()
        .map(|(k, (up, down))| (k, json!({"up": up, "down": down})))
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn explicit_ratings_override_reactions() {
        let mut a = Answer {
            model: "m".into(),
            kind: "code".into(),
            ..Default::default()
        };
        assert!(apply(&mut a, -1, false, false));
        assert!(!apply(&mut a, 1, false, false)); // one reaction per answer
        assert!(apply(&mut a, 1, true, false));
        assert!(!apply(&mut a, -1, false, true)); // a rating is not overwritten, not even by a regression
        let mut moved_on = Answer {
            signal: 1,
            ..Default::default()
        };
        assert!(apply(&mut moved_on, -1, false, true)); // “this no longer works” takes the success back
        assert_eq!(moved_on.signal, -1);
        let b = Answer {
            model: "m".into(),
            kind: "text".into(),
            signal: -1,
            ..Default::default()
        };
        let s = stats([a.clone(), b].iter());
        assert_eq!(s["m|code"], json!({"up": 2, "down": 0}));
        assert_eq!(s["m|*"], json!({"up": 2, "down": 1}));
    }
}
