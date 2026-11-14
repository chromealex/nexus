//! Projects, chats and messages persisted in projects.json, and their Tauri commands.
//! Moved out of lib.rs; shared helpers come from the crate root.
use super::*;

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct NexusProject {
    pub(crate) id: String,
    pub(crate) name: String,
    pub(crate) workspace: String,
    pub(crate) created_at: String,
    #[serde(default)]
    pub(crate) contexts: Vec<project_context::Source>,
    #[serde(default)]
    pub(crate) system: bool,
}
#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct NexusChat {
    #[serde(default)]
    pub(crate) team_enabled: bool,
    #[serde(default)]
    pub(crate) routing_priority: Option<String>,
    #[serde(default)]
    pub(crate) model_choice: Option<String>,
    pub(crate) id: String,
    pub(crate) project_id: String,
    pub(crate) title: String,
    pub(crate) created_at: String,
    #[serde(default)]
    pub(crate) folder_id: Option<String>,
    #[serde(default)]
    pub(crate) parent_chat_id: Option<String>,
    #[serde(default)]
    pub(crate) archived: bool,
    #[serde(default)]
    pub(crate) deleted_at: Option<String>,
    #[serde(default)]
    pub(crate) unread: bool,
    #[serde(default)]
    pub(crate) running: bool,
}
#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct NexusMessage {
    pub(crate) id: String,
    pub(crate) chat_id: String,
    pub(crate) role: String,
    pub(crate) content: String,
    pub(crate) created_at: String,
    #[serde(default)]
    pub(crate) details: Option<String>,
    #[serde(default)]
    pub(crate) rating: Option<i8>,
    #[serde(default)]
    pub(crate) attachments: Vec<attachments::Attachment>,
    #[serde(default)]
    pub(crate) question_selections: HashMap<String, serde_json::Value>,
    #[serde(default)]
    pub(crate) stopped: bool,
    #[serde(default)]
    pub(crate) variants: Vec<chat_variants::Variant>,
    #[serde(default)]
    pub(crate) variant: usize,
    #[serde(default)]
    pub(crate) edited: bool,
}
#[derive(Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ProjectStore {
    pub(crate) projects: Vec<NexusProject>,
    pub(crate) chats: Vec<NexusChat>,
    pub(crate) messages: Vec<NexusMessage>,
    #[serde(default)]
    pub(crate) folders: Vec<project_context::Folder>,
    #[serde(default)]
    pub(crate) goals: Vec<project_board::Goal>,
    #[serde(default)]
    pub(crate) tasks: Vec<project_board::Task>,
}
pub(crate) static PROJECTS_LOCK: std::sync::Mutex<()> = std::sync::Mutex::new(());
pub(crate) fn project_store_path() -> PathBuf {
    home().join("Library/Application Support/NEXUS/projects.json")
}
pub(crate) fn load_project_store() -> Result<ProjectStore, String> {
    let path = project_store_path();
    if !path.exists() {
        return Ok(ProjectStore::default());
    }
    serde_json::from_slice(&std::fs::read(path).map_err(|e| e.to_string())?)
        .map_err(|e| format!("Projects database is invalid: {e}"))
}
pub(crate) fn save_project_store(store: &ProjectStore) -> Result<(), String> {
    let path = project_store_path();
    std::fs::create_dir_all(path.parent().ok_or("Invalid project storage path")?)
        .map_err(|e| e.to_string())?;
    let tmp = path.with_extension("json.tmp");
    std::fs::write(&tmp, serde_json::to_vec_pretty(store).map_err(|e| e.to_string())?)
        .map_err(|e| e.to_string())?;
    std::fs::rename(tmp, path).map_err(|e| e.to_string())
}
pub(crate) fn project_id() -> String {
    use std::time::{SystemTime, UNIX_EPOCH};
    static SEQUENCE: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(0);
    format!(
        "n{}-{}-{}",
        std::process::id(),
        SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_nanos(),
        SEQUENCE.fetch_add(1, Ordering::Relaxed)
    )
}
pub(crate) fn now_string() -> String {
    format!("{:?}", std::time::SystemTime::now())
}
pub(crate) fn validate_workspace(workspace: &str) -> Result<String, String> {
    let path = std::fs::canonicalize(workspace).map_err(|e| format!("Workspace does not exist: {e}"))?;
    if !path.is_dir() {
        return Err("Workspace must be a directory".into());
    }
    Ok(path.to_string_lossy().into_owned())
}
#[tauri::command]
pub(crate) fn list_projects() -> Result<Vec<NexusProject>, String> {
    let _guard = PROJECTS_LOCK.lock().map_err(|_| "Project storage lock failed")?;
    let mut db = load_project_store()?;
    if !db.projects.iter().any(|p| p.id == "nexus-system") {
        let workspace = home().join("Library/Application Support/NEXUS/system-workspace");
        std::fs::create_dir_all(&workspace).map_err(|e| e.to_string())?;
        db.projects.insert(
            0,
            NexusProject {
                id: "nexus-system".into(),
                name: "Nexus".into(),
                workspace: workspace.to_string_lossy().into_owned(),
                created_at: now_string(),
                contexts: vec![],
                system: true,
            },
        );
        db.chats.push(NexusChat {
            team_enabled: false,
            routing_priority: None,
            model_choice: None,
            id: project_id(),
            project_id: "nexus-system".into(),
            title: "Настройка Nexus".into(),
            created_at: now_string(),
            folder_id: None,
            parent_chat_id: None,
            archived: false,
            deleted_at: None,
            unread: false,
            running: false,
        });
        save_project_store(&db)?;
    }
    Ok(db.projects)
}
#[tauri::command]
pub(crate) fn create_project(
    name: String,
    workspace: String,
    contexts: Option<Vec<project_context::Source>>,
) -> Result<NexusProject, String> {
    let _guard = PROJECTS_LOCK.lock().map_err(|_| "Project storage lock failed")?;
    let name = name.trim();
    if name.is_empty() || name.len() > 120 {
        return Err("Project name must be 1–120 characters".into());
    }
    let workspace = validate_workspace(&workspace)?;
    // Context is validated before the project exists, so a bad path or link never leaves a half-created project.
    // Uploaded documents belong to a project and are attached by the UI right after creation.
    let contexts = contexts.unwrap_or_default();
    if contexts.iter().any(|s| s.kind == "attachment") {
        return Err("Загруженные документы добавляются после создания проекта".into());
    }
    let contexts = project_context::validate_sources(contexts)?;
    let mut db = load_project_store()?;
    if db.projects.iter().any(|p| p.workspace == workspace) {
        return Err("Project workspace already added".into());
    }
    let project = NexusProject {
        id: project_id(),
        name: name.into(),
        workspace,
        created_at: now_string(),
        contexts,
        system: false,
    };
    db.projects.push(project.clone());
    save_project_store(&db)?;
    Ok(project)
}
#[tauri::command]
pub(crate) fn remove_project(project_id: String) -> Result<(), String> {
    if project_id == "nexus-system" {
        return Err("Системный проект Nexus нельзя удалить".into());
    }
    let _guard = PROJECTS_LOCK.lock().map_err(|_| "Project storage lock failed")?;
    let mut db = load_project_store()?;
    if !db.projects.iter().any(|p| p.id == project_id) {
        return Err("Project not found".into());
    }
    let ids: Vec<String> = db
        .chats
        .iter()
        .filter(|c| c.project_id == project_id)
        .map(|c| c.id.clone())
        .collect();
    db.messages.retain(|m| !ids.contains(&m.chat_id));
    db.chats.retain(|c| c.project_id != project_id);
    db.projects.retain(|p| p.id != project_id);
    db.folders.retain(|f| f.project_id != project_id);
    db.goals.retain(|g| g.project_id != project_id);
    db.tasks.retain(|t| t.project_id != project_id);
    save_project_store(&db)
}
#[tauri::command]
pub(crate) fn list_project_chats(project_id: String) -> Result<Vec<NexusChat>, String> {
    let db = load_project_store()?;
    if !db.projects.iter().any(|p| p.id == project_id) {
        return Err("Project not found".into());
    }
    Ok(db
        .chats
        .into_iter()
        .filter(|c| c.project_id == project_id && !c.archived && c.deleted_at.is_none())
        .map(|mut c| {
            c.running = chat_runs::is_running(&c.id);
            c
        })
        .collect())
}
#[tauri::command]
pub(crate) fn create_project_chat(project_id_value: String, title: String) -> Result<NexusChat, String> {
    let _guard = PROJECTS_LOCK.lock().map_err(|_| "Project storage lock failed")?;
    let mut db = load_project_store()?;
    if !db.projects.iter().any(|p| p.id == project_id_value) {
        return Err("Project not found".into());
    }
    let title = title.trim();
    if title.is_empty() || title.len() > 120 {
        return Err("Chat title must be 1–120 characters".into());
    }
    let chat = NexusChat {
        team_enabled: false,
        routing_priority: None,
        model_choice: None,
        id: project_id(),
        project_id: project_id_value,
        title: title.into(),
        created_at: now_string(),
        folder_id: None,
        parent_chat_id: None,
        archived: false,
        deleted_at: None,
        unread: false,
        running: false,
    };
    db.chats.push(chat.clone());
    save_project_store(&db)?;
    Ok(chat)
}
#[tauri::command]
pub(crate) fn list_chat_messages(chat_id: String) -> Result<Vec<NexusMessage>, String> {
    let db = load_project_store()?;
    if !db.chats.iter().any(|c| c.id == chat_id) {
        return Err("Chat not found".into());
    }
    Ok(db.messages.into_iter().filter(|m| m.chat_id == chat_id).collect())
}
#[tauri::command]
pub(crate) fn append_chat_message(
    chat_id: String,
    role: String,
    content: String,
) -> Result<NexusMessage, String> {
    append_chat_record(chat_id, role, content, None)
}
pub(crate) fn append_chat_record(
    chat_id: String,
    role: String,
    content: String,
    details: Option<String>,
) -> Result<NexusMessage, String> {
    append_chat_record_status(chat_id, role, content, details, false)
}
pub(crate) fn append_chat_record_status(
    chat_id: String,
    role: String,
    content: String,
    details: Option<String>,
    stopped: bool,
) -> Result<NexusMessage, String> {
    let _guard = PROJECTS_LOCK.lock().map_err(|_| "Project storage lock failed")?;
    if !["user", "assistant", "system"].contains(&role.as_str()) {
        return Err("Invalid message role".into());
    }
    if content.trim().is_empty() || content.len() > 200000 {
        return Err("Message must be 1–200000 characters".into());
    }
    let mut db = load_project_store()?;
    if !db.chats.iter().any(|c| c.id == chat_id) {
        return Err("Chat not found".into());
    }
    let msg = NexusMessage {
        id: project_id(),
        chat_id,
        role,
        content,
        created_at: now_string(),
        details,
        rating: None,
        attachments: vec![],
        question_selections: HashMap::new(),
        stopped,
        variants: vec![],
        variant: 0,
        edited: false,
    };
    if msg.role == "user"
        && !db
            .messages
            .iter()
            .any(|m| m.chat_id == msg.chat_id && m.role == "user")
    {
        if let Some(chat) = db.chats.iter_mut().find(|c| c.id == msg.chat_id) {
            if chat.title == "Новый чат" || chat.title == "Подчат" {
                chat.title = msg.content.chars().take(46).collect();
            }
        }
    }
    if msg.role == "assistant" {
        if let Some(chat) = db.chats.iter_mut().find(|c| c.id == msg.chat_id) {
            chat.unread = true;
        }
    }
    db.messages.push(msg.clone());
    save_project_store(&db)?;
    Ok(msg)
}

#[tauri::command]
pub(crate) fn mark_chat_read(chat_id: String, message_id: Option<String>) -> Result<(), String> {
    let _guard = PROJECTS_LOCK.lock().map_err(|_| "Project storage lock failed")?;
    let mut db = load_project_store()?;
    if let Some(id) = message_id {
        if db
            .messages
            .iter()
            .rev()
            .find(|m| m.chat_id == chat_id && m.role == "assistant")
            .map(|m| m.id.as_str())
            != Some(id.as_str())
        {
            return Ok(());
        }
    }
    let chat = db
        .chats
        .iter_mut()
        .find(|c| c.id == chat_id)
        .ok_or("Chat not found")?;
    if chat.unread {
        chat.unread = false;
        save_project_store(&db)?;
    }
    Ok(())
}
#[tauri::command]
pub(crate) fn rate_chat_message(
    chat_id: String,
    message_id: String,
    rating: Option<i8>,
) -> Result<NexusMessage, String> {
    let _guard = PROJECTS_LOCK.lock().map_err(|_| "Project storage lock failed")?;
    if rating.is_some_and(|v| v != 1 && v != -1) {
        return Err("Invalid rating".into());
    }
    let mut db = load_project_store()?;
    let message = db
        .messages
        .iter_mut()
        .find(|m| m.id == message_id && m.chat_id == chat_id && m.role == "assistant")
        .ok_or("Answer not found")?;
    message.rating = rating;
    let updated = message.clone();
    save_project_store(&db)?;
    Ok(updated)
}

#[tauri::command]
pub(crate) fn save_chat_model(chat_id: String, model_choice: String) -> Result<NexusChat, String> {
    if model_choice != "auto" {
        chat_models::selected(&model_choice)?;
    }
    let _guard = PROJECTS_LOCK.lock().map_err(|_| "Project storage lock failed")?;
    let mut db = load_project_store()?;
    let chat = db
        .chats
        .iter_mut()
        .find(|c| c.id == chat_id && !c.archived && c.deleted_at.is_none())
        .ok_or("Чат недоступен")?;
    if chat.running {
        return Err("Дождитесь завершения ответа".into());
    }
    chat.model_choice = Some(model_choice);
    let updated = chat.clone();
    save_project_store(&db)?;
    Ok(updated)
}

#[tauri::command]
pub(crate) fn save_chat_routing_priority(chat_id: String, priority: String) -> Result<NexusChat, String> {
    if !["balanced", "quality", "economy", "speed"].contains(&priority.as_str()) {
        return Err("Неизвестный приоритет".into());
    }
    let _guard = PROJECTS_LOCK.lock().map_err(|_| "Project storage lock failed")?;
    let mut db = load_project_store()?;
    let chat = db
        .chats
        .iter_mut()
        .find(|c| c.id == chat_id && !c.archived && c.deleted_at.is_none())
        .ok_or("Чат недоступен")?;
    if chat.running {
        return Err("Дождитесь завершения ответа".into());
    }
    chat.routing_priority = Some(priority);
    let updated = chat.clone();
    save_project_store(&db)?;
    Ok(updated)
}

#[tauri::command]
pub(crate) fn save_chat_team(chat_id: String, enabled: bool) -> Result<NexusChat, String> {
    let _guard = PROJECTS_LOCK.lock().map_err(|_| "Project storage lock failed")?;
    let mut db = load_project_store()?;
    let chat = db
        .chats
        .iter_mut()
        .find(|c| c.id == chat_id && !c.archived && c.deleted_at.is_none())
        .ok_or("Чат недоступен")?;
    if chat_runs::is_running(&chat_id) {
        return Err("Дождитесь завершения ответа".into());
    }
    chat.team_enabled = enabled;
    let updated = chat.clone();
    save_project_store(&db)?;
    Ok(updated)
}
