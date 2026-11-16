//! Structured part of the local API used by the `nexus` command and the Nexus MCP server:
//! projects, chats, messages, sending, stopping and automations. Same rules as the rest of the API
//! (bearer token, no browser origins); execution mode only when the API channel allows it, never over the LAN.
use super::remote_channels as rc;
use super::*;
use serde_json::{json, Value};

const WAIT_LIMIT: u64 = 300;

fn chat_json(c: &NexusChat) -> Value {
    json!({"id": c.id, "projectId": c.project_id, "title": c.title, "running": chat_runs::is_running(&c.id),
           "archived": c.archived, "folderId": c.folder_id, "parentChatId": c.parent_chat_id})
}
fn message_json(m: &NexusMessage) -> Value {
    json!({"id": m.id, "role": m.role, "content": m.content, "createdAt": m.created_at, "stopped": m.stopped})
}
fn last_answer(chat: &str) -> Option<Value> {
    let db = load_project_store().ok()?;
    db.messages
        .iter()
        .rev()
        .find(|m| m.chat_id == chat && m.role != "user")
        .map(message_json)
}
fn body(req: &super::api_server::Request) -> Result<Value, (u16, Value)> {
    serde_json::from_slice(&req.body).map_err(|_| (400, json!({"error": "Ожидается JSON"})))
}
/// "execute" only when the API channel allows execution; everything else is discussion.
pub(crate) fn mode_for(cfg: &rc::Config, asked: Option<&str>) -> &'static str {
    if asked == Some("execute") && cfg.allow_execute {
        "execute"
    } else {
        "discuss"
    }
}

fn send(
    app: &tauri::AppHandle,
    chat: &str,
    text: &str,
    mode: &str,
    model: Option<String>,
    wait: u64,
) -> (u16, Value) {
    if text.trim().is_empty() || text.chars().count() > 12000 {
        return (400, json!({"error": "Текст: от 1 до 12000 символов"}));
    }
    if chat_runs::is_running(chat) {
        return (
            409,
            json!({"error": "В этом чате уже идёт ответ", "chatId": chat}),
        );
    }
    let request = project_id();
    let (app2, chat2, text2, mode2, request2) = (
        app.clone(),
        chat.to_string(),
        text.to_string(),
        mode.to_string(),
        request.clone(),
    );
    tauri::async_runtime::spawn(async move {
        let _ = unified_chat_send(
            app2,
            chat2,
            text2,
            "balanced".into(),
            None,
            Some(request2),
            None,
            None,
            model.filter(|m| m != "auto" && !m.is_empty()),
            Some(mode2),
            None,
            None,
        )
        .await;
    });
    // Wait for the run to start, then (optionally) for it to finish.
    let started = std::time::Instant::now();
    while !chat_runs::is_running(chat) && started.elapsed() < Duration::from_secs(5) {
        std::thread::sleep(Duration::from_millis(100));
    }
    let deadline = std::time::Instant::now() + Duration::from_secs(wait.min(WAIT_LIMIT));
    while std::time::Instant::now() < deadline && chat_runs::is_running(chat) {
        std::thread::sleep(Duration::from_millis(400));
    }
    let running = chat_runs::is_running(chat);
    (
        if running { 202 } else { 200 },
        json!({"chatId": chat, "requestId": request, "running": running, "mode": mode,
               "answer": if running { Value::Null } else { last_answer(chat).unwrap_or(Value::Null) }}),
    )
}

/// Handles `/v1/projects`, `/v1/chats…` and `/v1/automations…`; None for other paths.
pub(crate) fn route(
    app: &tauri::AppHandle,
    cfg: &rc::Config,
    req: &super::api_server::Request,
) -> Option<(u16, Value)> {
    let parts: Vec<&str> = req
        .path
        .trim_end_matches('/')
        .split('/')
        .filter(|p| !p.is_empty())
        .collect();
    let wait = |v: &Value| {
        v["wait"]
            .as_u64()
            .or(req.param("wait").and_then(|w| w.parse().ok()))
            .unwrap_or(0)
    };
    Some(match (req.method.as_str(), parts.as_slice()) {
        ("GET", ["v1", "projects"]) => match load_project_store() {
            Ok(db) => (
                200,
                json!({"projects": db.projects.iter().map(|p| json!({"id": p.id, "name": p.name, "workspace": p.workspace, "system": p.system})).collect::<Vec<_>>()}),
            ),
            Err(e) => (500, json!({"error": e})),
        },
        ("GET", ["v1", "chats"]) => match load_project_store() {
            Ok(db) => {
                let project = req.param("project");
                let list: Vec<Value> = db
                    .chats
                    .iter()
                    .filter(|c| {
                        c.deleted_at.is_none() && !c.archived && project.is_none_or(|p| c.project_id == p)
                    })
                    .map(chat_json)
                    .collect();
                (200, json!({"chats": list}))
            }
            Err(e) => (500, json!({"error": e})),
        },
        ("POST", ["v1", "chats"]) => {
            let v = match body(req) {
                Ok(v) => v,
                Err(e) => return Some(e),
            };
            let (Some(project), Some(text)) = (v["project"].as_str(), v["text"].as_str()) else {
                return Some((400, json!({"error": "Нужны поля project и text"})));
            };
            let title = v["title"]
                .as_str()
                .map(String::from)
                .unwrap_or_else(|| text.chars().take(30).collect());
            match create_project_chat(project.into(), title) {
                Ok(chat) => {
                    if v["worktree"].as_bool() == Some(true) {
                        if let Err(e) = chat_worktree::enable_for(&chat.id) {
                            return Some((400, json!({"error": e, "chatId": chat.id})));
                        }
                    }
                    let _ = app.emit(
                        "chat-activity",
                        json!({"chatId": chat.id, "projectId": chat.project_id, "status": "ready"}),
                    );
                    send(
                        app,
                        &chat.id,
                        text,
                        mode_for(cfg, v["mode"].as_str()),
                        v["model"].as_str().map(String::from),
                        wait(&v),
                    )
                }
                Err(e) => (400, json!({"error": e})),
            }
        }
        ("GET", ["v1", "chats", id]) => match load_project_store() {
            Ok(db) => match db.chats.iter().find(|c| c.id == *id && c.deleted_at.is_none()) {
                Some(c) => (200, chat_json(c)),
                None => (404, json!({"error": "Чат не найден"})),
            },
            Err(e) => (500, json!({"error": e})),
        },
        ("GET", ["v1", "chats", id, "messages"]) => match load_project_store() {
            Ok(db) => {
                let limit = req
                    .param("limit")
                    .and_then(|l| l.parse().ok())
                    .unwrap_or(20usize)
                    .min(200);
                let all: Vec<&NexusMessage> = db
                    .messages
                    .iter()
                    .filter(|m| m.chat_id == *id && m.role != "system")
                    .collect();
                let start = all.len().saturating_sub(limit);
                (
                    200,
                    json!({"chatId": id, "running": chat_runs::is_running(id), "messages": all[start..].iter().map(|m| message_json(m)).collect::<Vec<_>>()}),
                )
            }
            Err(e) => (500, json!({"error": e})),
        },
        ("POST", ["v1", "chats", id, "messages"]) => {
            let v = match body(req) {
                Ok(v) => v,
                Err(e) => return Some(e),
            };
            if !load_project_store()
                .map(|db| {
                    db.chats
                        .iter()
                        .any(|c| c.id == *id && c.deleted_at.is_none() && !c.archived)
                })
                .unwrap_or(false)
            {
                return Some((404, json!({"error": "Чат не найден или в архиве"})));
            }
            send(
                app,
                id,
                v["text"].as_str().unwrap_or(""),
                mode_for(cfg, v["mode"].as_str()),
                v["model"].as_str().map(String::from),
                wait(&v),
            )
        }
        ("POST", ["v1", "chats", id, "stop"]) => (200, json!({"stopped": chat_runs::stop_chat(id)})),
        ("GET", ["v1", "automations"]) => (200, json!({"automations": automations::list_automations()})),
        ("POST", ["v1", "automations", id, "run"]) => {
            match automations::run_automation_now(app.clone(), id.to_string()) {
                Ok(()) => (202, json!({"started": true})),
                Err(e) => (400, json!({"error": e})),
            }
        }
        _ => return None,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn execution_needs_the_channel_switch() {
        let mut cfg: rc::Config = serde_json::from_value(json!({"kind": "api"})).unwrap();
        assert_eq!(mode_for(&cfg, Some("execute")), "discuss");
        cfg.allow_execute = true;
        assert_eq!(mode_for(&cfg, Some("execute")), "execute");
        assert_eq!(mode_for(&cfg, Some("auto")), "discuss");
        assert_eq!(mode_for(&cfg, None), "discuss");
    }
}
