use super::{load_project_store, save_project_store, NexusMessage, PROJECTS_LOCK};
use serde_json::Value;

pub fn validate(block: &str, answers: &Value) -> Result<(), String> {
    if block.len() > 16000 || answers.to_string().len() > 16000 {
        return Err("Question answer too large".into());
    }
    let spec: Value = serde_json::from_str(block).map_err(|_| "Invalid question")?;
    let rows = spec
        .get("questions")
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_else(|| vec![spec]);
    let values = answers.as_object().ok_or("Invalid answers")?;
    if rows.is_empty() || rows.len() > 6 || values.len() != rows.len() {
        return Err("Answer every question".into());
    }
    for (index, row) in rows.iter().enumerate() {
        let id = row
            .get("id")
            .and_then(Value::as_str)
            .map(str::to_owned)
            .unwrap_or_else(|| index.to_string());
        let selected = values
            .get(&id)
            .and_then(|v| v.get("answers"))
            .and_then(Value::as_array)
            .ok_or("Missing answer")?;
        let multiple = row.get("multiple").and_then(Value::as_bool) == Some(true)
            || row.get("multiSelect").and_then(Value::as_bool) == Some(true);
        if selected.is_empty()
            || selected.len() > if multiple { 9 } else { 1 }
            || selected.iter().any(|v| {
                v.as_str()
                    .map(|s| s.trim().is_empty() || s.len() > 8000)
                    .unwrap_or(true)
            })
        {
            return Err("Invalid selected answers".into());
        }
    }
    Ok(())
}
#[tauri::command]
pub fn save_question_selection(
    chat_id: String,
    message_id: String,
    block: String,
    answers: Value,
) -> Result<NexusMessage, String> {
    validate(&block, &answers)?;
    let _guard = PROJECTS_LOCK.lock().map_err(|_| "Project storage lock failed")?;
    let mut db = load_project_store()?;
    let m = db
        .messages
        .iter_mut()
        .find(|m| m.id == message_id && m.chat_id == chat_id && m.role == "assistant")
        .ok_or("Question not found in this chat")?;
    let belongs = m
        .content
        .split("```nexus-question")
        .skip(1)
        .any(|part| part.split("```").next().map(str::trim) == Some(block.trim()));
    if !belongs {
        return Err("Question does not belong to this message".into());
    }
    if let Some(existing) = m.question_selections.get(&block) {
        if existing != &answers {
            return Err("Question already answered".into());
        }
    }
    m.question_selections.insert(block, answers);
    let updated = m.clone();
    save_project_store(&db)?;
    Ok(updated)
}
#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;
    #[test]
    fn validates_single_multi_and_custom() {
        let single = r#"{"question":"Format?","options":["A","B"]}"#;
        assert!(validate(single, &json!({"0":{"answers":["A"]}})).is_ok());
        assert!(validate(single, &json!({"0":{"answers":["A","B"]}})).is_err());
        let multi = r#"{"question":"Format?","multiple":true,"options":["A","B"]}"#;
        assert!(validate(multi, &json!({"0":{"answers":["A","B","Custom"]}})).is_ok());
        assert!(validate(multi, &json!({"wrong":{"answers":["A"]}})).is_err());
        assert!(validate(multi, &json!({"0":{"answers":[]}})).is_err());
    }
    #[test]
    fn legacy_messages_and_selections_round_trip() {
        let old = r#"{"id":"m","chatId":"c","role":"assistant","content":"text","createdAt":"time"}"#;
        let mut message: super::super::NexusMessage = serde_json::from_str(old).unwrap();
        assert!(message.question_selections.is_empty());
        message
            .question_selections
            .insert("question".into(), json!({"0":{"answers":["A","B","Custom"]}}));
        let saved = serde_json::to_vec(&message).unwrap();
        let restored: super::super::NexusMessage = serde_json::from_slice(&saved).unwrap();
        assert_eq!(
            restored.question_selections["question"]["0"]["answers"],
            json!(["A", "B", "Custom"])
        );
    }
}
