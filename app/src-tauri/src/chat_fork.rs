//! «Ответвить чат»: a new chat in the same project and folder with a copy of the conversation up to a
//! message. The source chat is not changed. Editing an earlier request uses it too: the branch stops just
//! before that request and the edited text is sent there.
use super::*;

pub(crate) fn fork(
    db: &mut ProjectStore,
    chat_id: &str,
    message_id: &str,
    inclusive: bool,
) -> Result<NexusChat, String> {
    let source = db
        .chats
        .iter()
        .find(|c| c.id == chat_id && c.deleted_at.is_none())
        .ok_or("Чат не найден")?
        .clone();
    let all: Vec<&NexusMessage> = db.messages.iter().filter(|m| m.chat_id == chat_id).collect();
    let index = all
        .iter()
        .position(|m| m.id == message_id)
        .ok_or("Сообщение не найдено — прокрутите историю и повторите")?;
    let end = if inclusive { index + 1 } else { index };
    let id = project_id();
    let title: String = source.title.chars().take(80).collect();
    let chat = NexusChat {
        id: id.clone(),
        title: format!("{title} · ветка"),
        created_at: now_string(),
        unread: false,
        running: false,
        archived: false,
        deleted_at: None,
        imported_from: None,
        ..source
    };
    let copies: Vec<NexusMessage> = all[..end]
        .iter()
        .map(|m| NexusMessage {
            id: project_id(),
            chat_id: id.clone(),
            ..(*m).clone()
        })
        .collect();
    db.chats.push(chat.clone());
    db.messages.extend(copies);
    Ok(chat)
}

#[tauri::command]
pub(crate) fn fork_chat(
    chat_id: String,
    message_id: String,
    inclusive: Option<bool>,
) -> Result<NexusChat, String> {
    let _guard = PROJECTS_LOCK.lock().map_err(|_| "Project storage lock failed")?;
    let mut db = load_project_store()?;
    let chat = fork(&mut db, &chat_id, &message_id, inclusive.unwrap_or(true))?;
    save_project_store(&db)?;
    Ok(chat)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn copies_history_up_to_the_message() {
        let mut db: ProjectStore = serde_json::from_value(serde_json::json!({
            "projects": [{"id": "p", "name": "P", "workspace": "/tmp", "createdAt": "0"}],
            "chats": [{"id": "c", "projectId": "p", "title": "Login", "createdAt": "0", "folderId": "f", "modelChoice": "auto", "running": true}],
            "messages": [
                {"id": "1", "chatId": "c", "role": "user", "content": "a", "createdAt": "0"},
                {"id": "2", "chatId": "c", "role": "assistant", "content": "b", "createdAt": "0", "rating": 1},
                {"id": "3", "chatId": "c", "role": "user", "content": "c", "createdAt": "0"},
                {"id": "x", "chatId": "other", "role": "user", "content": "z", "createdAt": "0"}
            ]
        }))
        .unwrap();
        let branch = fork(&mut db, "c", "2", true).unwrap();
        assert_eq!(branch.title, "Login · ветка");
        assert_eq!(branch.folder_id.as_deref(), Some("f"));
        assert_eq!(branch.model_choice.as_deref(), Some("auto"));
        assert!(!branch.running);
        let copied: Vec<_> = db.messages.iter().filter(|m| m.chat_id == branch.id).collect();
        assert_eq!(
            copied.iter().map(|m| m.content.as_str()).collect::<Vec<_>>(),
            ["a", "b"]
        );
        assert_eq!(copied[1].rating, Some(1));
        assert!(copied.iter().all(|m| !["1", "2"].contains(&m.id.as_str())));
        let before = fork(&mut db, "c", "3", false).unwrap();
        assert_eq!(db.messages.iter().filter(|m| m.chat_id == before.id).count(), 2);
        assert_eq!(db.messages.iter().filter(|m| m.chat_id == "c").count(), 3);
        assert!(fork(&mut db, "c", "missing", true).is_err());
    }
}
