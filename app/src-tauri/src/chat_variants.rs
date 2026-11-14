// Answer variants ("Повторить ответ"), editing the last request and chat export.
// The message keeps the shown answer in its usual fields; `variants` holds every version
// (including the shown one) once an answer has been regenerated at least once.
use super::{load_project_store, save_project_store, NexusMessage, ProjectStore, PROJECTS_LOCK};
use serde::{Deserialize, Serialize};
use std::path::PathBuf;

pub const MAX_VARIANTS: usize = 10;

#[derive(Clone, Serialize, Deserialize, Default, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Variant {
    pub content: String,
    #[serde(default)]
    pub details: Option<String>,
    #[serde(default)]
    pub rating: Option<i8>,
    #[serde(default)]
    pub stopped: bool,
    #[serde(default)]
    pub created_at: String,
}

fn snapshot(m: &NexusMessage) -> Variant {
    Variant {
        content: m.content.clone(),
        details: m.details.clone(),
        rating: m.rating,
        stopped: m.stopped,
        created_at: m.created_at.clone(),
    }
}
fn show(m: &mut NexusMessage, v: &Variant) {
    m.content = v.content.clone();
    m.details = v.details.clone();
    m.rating = v.rating;
    m.stopped = v.stopped;
}

/// Store the answer that is shown now, then add the new answer as the active variant.
pub(super) fn push_regenerated(
    m: &mut NexusMessage,
    content: String,
    details: String,
    stopped: bool,
    created_at: String,
) {
    if m.variants.is_empty() {
        m.variants.push(snapshot(m));
        m.variant = 0;
    } else if m.variant < m.variants.len() {
        m.variants[m.variant] = snapshot(m);
    }
    let v = Variant {
        content,
        details: Some(details),
        rating: None,
        stopped,
        created_at,
    };
    m.variants.push(v.clone());
    m.variant = m.variants.len() - 1;
    show(m, &v);
}

pub(super) fn select(m: &mut NexusMessage, index: usize) -> Result<(), String> {
    if index >= m.variants.len() {
        return Err("Вариант ответа не найден".into());
    }
    if m.variant < m.variants.len() {
        m.variants[m.variant] = snapshot(m);
    }
    let v = m.variants[index].clone();
    m.variant = index;
    show(m, &v);
    Ok(())
}

/// The answer that may be regenerated: the last non-system message of the chat, an assistant reply.
pub(super) fn regenerate_target<'a>(
    db: &'a ProjectStore,
    chat: &str,
    id: &str,
) -> Result<(usize, &'a NexusMessage), String> {
    let last = db
        .messages
        .iter()
        .enumerate()
        .filter(|(_, m)| m.chat_id == chat && m.role != "system")
        .last()
        .ok_or("В чате нет ответа")?;
    if last.1.id != id || last.1.role != "assistant" {
        return Err("Повторить можно только последний ответ".into());
    }
    if last.1.variants.len() >= MAX_VARIANTS {
        return Err(format!("Не больше {MAX_VARIANTS} вариантов одного ответа"));
    }
    Ok(last)
}

fn edit_in(db: &mut ProjectStore, chat: &str, id: &str, text: &str) -> Result<NexusMessage, String> {
    let index = db
        .messages
        .iter()
        .rposition(|m| m.chat_id == chat && m.role == "user")
        .ok_or("Запрос не найден")?;
    if db.messages[index].id != id {
        return Err("Изменить можно только последний запрос".into());
    }
    let m = &mut db.messages[index];
    m.content = text.to_string();
    m.edited = true;
    Ok(m.clone())
}

#[tauri::command]
pub fn edit_last_user_message(
    chat_id: String,
    message_id: String,
    text: String,
) -> Result<NexusMessage, String> {
    if text.trim().is_empty() || text.chars().count() > 12000 {
        return Err("Сообщение: от 1 до 12 000 символов".into());
    }
    if super::chat_runs::is_running(&chat_id) {
        return Err("Дождитесь окончания ответа".into());
    }
    let _guard = PROJECTS_LOCK.lock().map_err(|_| "Project storage lock failed")?;
    let mut db = load_project_store()?;
    let m = edit_in(&mut db, &chat_id, &message_id, &text)?;
    save_project_store(&db)?;
    Ok(m)
}

#[tauri::command]
pub fn select_message_variant(
    chat_id: String,
    message_id: String,
    index: usize,
) -> Result<NexusMessage, String> {
    if super::chat_runs::is_running(&chat_id) {
        return Err("Дождитесь окончания ответа".into());
    }
    let _guard = PROJECTS_LOCK.lock().map_err(|_| "Project storage lock failed")?;
    let mut db = load_project_store()?;
    let m = db
        .messages
        .iter_mut()
        .find(|m| m.id == message_id && m.chat_id == chat_id && m.role == "assistant")
        .ok_or("Ответ не найден")?;
    select(m, index)?;
    let result = m.clone();
    save_project_store(&db)?;
    Ok(result)
}

fn safe_name(name: &str) -> String {
    let cleaned: String = name
        .chars()
        .filter(|c| !matches!(c, '/' | '\\' | ':' | '\0') && !c.is_control())
        .take(80)
        .collect();
    let cleaned = cleaned.trim().trim_start_matches('.').trim().to_string();
    if cleaned.is_empty() {
        "Nexus chat".into()
    } else {
        cleaned
    }
}
fn downloads() -> Result<PathBuf, String> {
    Ok(PathBuf::from(std::env::var_os("HOME").ok_or("Домашняя папка не найдена")?).join("Downloads"))
}
fn free_path(dir: &std::path::Path, base: &str) -> Result<PathBuf, String> {
    let mut path = dir.join(format!("{base}.md"));
    let mut n = 2;
    while path.exists() {
        if n > 999 {
            return Err("Слишком много файлов с таким именем".into());
        }
        path = dir.join(format!("{base} ({n}).md"));
        n += 1;
    }
    Ok(path)
}

/// Saves a Markdown export into ~/Downloads without overwriting existing files.
#[tauri::command]
pub fn save_chat_export(file_name: String, content: String) -> Result<String, String> {
    if content.trim().is_empty() || content.len() > 20_000_000 {
        return Err("Экспорт пуст или больше 20 МБ".into());
    }
    let dir = downloads()?;
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let path = free_path(&dir, &safe_name(&file_name))?;
    std::fs::write(&path, content).map_err(|e| e.to_string())?;
    Ok(path.to_string_lossy().into_owned())
}

/// Shows an exported file in Finder. Only Markdown files inside ~/Downloads are accepted.
#[tauri::command]
pub fn reveal_chat_export(path: String) -> Result<(), String> {
    let file = std::fs::canonicalize(&path).map_err(|_| "Файл не найден")?;
    let dir = std::fs::canonicalize(downloads()?).map_err(|_| "Папка «Загрузки» не найдена")?;
    if !file.starts_with(&dir) || file.extension().and_then(|e| e.to_str()) != Some("md") {
        return Err("Можно показать только экспорт чата".into());
    }
    std::process::Command::new("open")
        .arg("-R")
        .arg(&file)
        .status()
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    fn db() -> ProjectStore {
        serde_json::from_value(serde_json::json!({"projects":[],"chats":[],"messages":[
  {"id":"u1","chatId":"c","role":"user","content":"Первый","createdAt":"t"},
  {"id":"a1","chatId":"c","role":"assistant","content":"Ответ 1","createdAt":"t"},
  {"id":"u2","chatId":"c","role":"user","content":"Второй","createdAt":"t"},
  {"id":"a2","chatId":"c","role":"assistant","content":"Ответ A","details":"d","rating":1,"createdAt":"t"},
  {"id":"s","chatId":"c","role":"system","content":"Agent error","createdAt":"t"},
  {"id":"x","chatId":"other","role":"assistant","content":"Чужой","createdAt":"t"}]}))
        .unwrap()
    }
    #[test]
    fn legacy_messages_have_no_variants() {
        let d = db();
        assert!(d.messages[3].variants.is_empty());
        assert_eq!(d.messages[3].variant, 0);
        assert!(!d.messages[0].edited);
    }
    #[test]
    fn only_last_answer_can_be_regenerated() {
        let d = db();
        assert_eq!(
            regenerate_target(&d, "c", "a2").unwrap().0,
            3,
            "system messages after the answer are ignored"
        );
        assert!(regenerate_target(&d, "c", "a1").is_err());
        assert!(regenerate_target(&d, "other", "a2").is_err());
        assert!(regenerate_target(&d, "c", "u2").is_err());
    }
    #[test]
    fn regenerate_keeps_previous_answers_and_switches() {
        let mut d = db();
        let m = &mut d.messages[3];
        push_regenerated(m, "Ответ B".into(), "d2".into(), false, "t2".into());
        assert_eq!(m.content, "Ответ B");
        assert_eq!(m.variants.len(), 2);
        assert_eq!(m.variant, 1);
        assert_eq!(m.rating, None, "new variant starts unrated");
        assert_eq!(m.variants[0].content, "Ответ A");
        assert_eq!(m.variants[0].rating, Some(1));
        m.rating = Some(-1);
        select(m, 0).unwrap();
        assert_eq!(m.content, "Ответ A");
        assert_eq!(m.rating, Some(1));
        assert_eq!(m.details.as_deref(), Some("d"));
        assert_eq!(
            m.variants[1].rating,
            Some(-1),
            "rating of the hidden variant is kept"
        );
        push_regenerated(m, "Ответ C".into(), "d3".into(), true, "t3".into());
        assert_eq!(m.variants.len(), 3);
        assert_eq!(m.variant, 2);
        assert!(m.stopped);
        assert_eq!(m.variants[0].content, "Ответ A");
        assert!(select(m, 7).is_err());
    }
    #[test]
    fn variant_limit() {
        let mut d = db();
        for i in 0..MAX_VARIANTS {
            push_regenerated(
                &mut d.messages[3],
                format!("v{i}"),
                String::new(),
                false,
                String::new(),
            );
        }
        assert!(regenerate_target(&d, "c", "a2").is_err());
    }
    #[test]
    fn edit_only_last_request() {
        let mut d = db();
        assert!(edit_in(&mut d, "c", "u1", "x").is_err());
        let m = edit_in(&mut d, "c", "u2", "Второй, уточнённый").unwrap();
        assert_eq!(m.content, "Второй, уточнённый");
        assert!(m.edited);
        assert!(edit_in(&mut d, "other", "u2", "x").is_err());
    }
    #[test]
    fn export_names_are_safe_and_unique() {
        assert_eq!(safe_name("../../etc/passwd"), "etcpasswd");
        assert_eq!(safe_name("  .hidden "), "hidden");
        assert_eq!(safe_name("\u{0}"), "Nexus chat");
        assert_eq!(safe_name("Чат: план/итог"), "Чат планитог");
        let dir = std::env::temp_dir().join(format!("nexus-export-test-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let first = free_path(&dir, "Чат").unwrap();
        std::fs::write(&first, "x").unwrap();
        let second = free_path(&dir, "Чат").unwrap();
        assert!(second.ends_with("Чат (2).md"));
        std::fs::remove_dir_all(&dir).unwrap();
    }
}
