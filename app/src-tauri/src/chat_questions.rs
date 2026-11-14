use serde_json::{json, Value};
use std::{
    collections::HashMap,
    sync::{LazyLock, Mutex},
};
use tauri::Emitter;
use tokio::sync::oneshot;
type Pending = (String, oneshot::Sender<Value>, Option<(String, String)>);
static QUESTIONS: LazyLock<Mutex<HashMap<String, Pending>>> = LazyLock::new(|| Mutex::new(HashMap::new()));
struct Cleanup(String);
impl Drop for Cleanup {
    fn drop(&mut self) {
        if let Ok(mut q) = QUESTIONS.lock() {
            q.remove(&self.0);
        }
    }
}
pub async fn ask(app: &tauri::AppHandle, chat: &str, questions: Value) -> Result<Value, String> {
    let id = super::project_id();
    let (send, recv) = oneshot::channel();
    let block = json!({"questions":questions}).to_string();
    let message = super::append_chat_message(
        chat.into(),
        "assistant".into(),
        format!("```nexus-question\n{block}\n```"),
    )?;
    QUESTIONS
        .lock()
        .map_err(|_| "Question storage unavailable")?
        .insert(id.clone(), (chat.into(), send, Some((message.id, block))));
    let _cleanup = Cleanup(id.clone());
    app.emit(
        "chat-question",
        json!({"chatId":chat,"id":id,"questions":questions}),
    )
    .map_err(|e| e.to_string())?;
    let answer = tokio::time::timeout(std::time::Duration::from_secs(1800), recv)
        .await
        .map_err(|_| "Question expired")?
        .map_err(|_| "Question cancelled")?;
    let _ = app.emit("chat-question-closed", json!({"chatId":chat,"id":id}));
    Ok(answer)
}
#[tauri::command]
pub fn answer_agent_question(chat_id: String, id: String, answers: Value) -> Result<(), String> {
    if !answers.is_object() || answers.to_string().len() > 16000 {
        return Err("Invalid answer".into());
    }
    let mut pending = QUESTIONS.lock().map_err(|_| "Question storage unavailable")?;
    if pending.get(&id).map(|p| p.0.as_str()) != Some(chat_id.as_str()) {
        return Err("Question expired or belongs to another chat".into());
    }
    if let Some((message_id, block)) = pending.get(&id).and_then(|p| p.2.as_ref()) {
        if answers.as_object().map(|v| !v.is_empty()).unwrap_or(false) {
            super::question_history::save_question_selection(
                chat_id.clone(),
                message_id.clone(),
                block.clone(),
                answers.clone(),
            )?;
            let spec: Value = serde_json::from_str(block).map_err(|_| "Invalid stored question")?;
            let mut text = Vec::new();
            for (index, q) in spec["questions"]
                .as_array()
                .ok_or("Invalid question list")?
                .iter()
                .enumerate()
            {
                let key = q["id"]
                    .as_str()
                    .map(str::to_owned)
                    .unwrap_or_else(|| index.to_string());
                let chosen = answers[&key]["answers"]
                    .as_array()
                    .ok_or("Missing answer")?
                    .iter()
                    .filter_map(Value::as_str)
                    .collect::<Vec<_>>()
                    .join(", ");
                text.push(format!(
                    "{}: {}",
                    q["question"].as_str().unwrap_or("Выбор"),
                    chosen
                ));
            }
            super::append_chat_message(chat_id.clone(), "user".into(), text.join("\n"))?;
        }
    }
    let (_, sender, _) = pending.remove(&id).ok_or("Question already answered")?;
    sender
        .send(json!({"answers":answers}))
        .map_err(|_| "Question expired".into())
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn answers_are_scoped_single_use_and_stale_safe() {
        let id = super::super::project_id();
        let (tx, mut rx) = oneshot::channel();
        QUESTIONS
            .lock()
            .unwrap()
            .insert(id.clone(), ("test-chat".into(), tx, None));
        assert!(answer_agent_question("other-chat".into(), id.clone(), json!({})).is_err());
        assert!(
            answer_agent_question("test-chat".into(), id.clone(), json!({"q":{"answers":["A","B"]}})).is_ok()
        );
        assert_eq!(
            rx.try_recv().unwrap()["answers"]["q"]["answers"],
            json!(["A", "B"])
        );
        assert!(answer_agent_question("test-chat".into(), id, json!({})).is_err());
    }
}
