//! What the user thinks of the answers of each model, per kind of task, so Auto can prefer the models
//! that work for this user among otherwise equal candidates. Signals: an explicit rating of an answer
//! (weight 2) or, when there is none, the reaction in the user's next message (weight 1). An explicit
//! rating replaces the implicit signal of the same answer. Stored in `route-feedback.json`.
use super::*;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::collections::HashMap;
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
}
#[derive(Serialize, Deserialize, Default)]
struct Store {
    #[serde(default)]
    answers: HashMap<String, Answer>,
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
pub fn note_answer_route(message_id: String, model_id: String, kind: String) -> Result<(), String> {
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
    save(&store)?;
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

/// Weighted counts per `model|kind` and `model|*`: explicit ratings count 2, reactions 1.
#[tauri::command]
pub fn route_feedback_stats() -> Result<HashMap<String, Value>, String> {
    Ok(stats(load().answers.values()))
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
