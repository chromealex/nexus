use serde_json::{json, Value};
use std::{
    collections::HashMap,
    sync::{LazyLock, Mutex},
};
use tauri::Emitter;
use tokio::sync::oneshot;
struct Pending {
    chat: String,
    grant: Option<Grant>,
    send: oneshot::Sender<bool>,
}
#[derive(Clone, serde::Serialize, serde::Deserialize, PartialEq)]
struct Grant {
    project: String,
    provider: String,
    kind: String,
    scope: Value,
}
static GRANTS_LOCK: Mutex<()> = Mutex::new(());
fn grants_path() -> std::path::PathBuf {
    super::project_store_path().with_file_name("permission-grants.json")
}
fn load_grants() -> Result<Vec<Grant>, String> {
    let p = grants_path();
    if !p.exists() {
        return Ok(vec![]);
    }
    serde_json::from_slice(&std::fs::read(p).map_err(|e| e.to_string())?).map_err(|e| e.to_string())
}
fn save_grants(grants: &[Grant]) -> Result<(), String> {
    let p = grants_path();
    let tmp = p.with_extension("json.tmp");
    std::fs::create_dir_all(p.parent().ok_or("Invalid permissions path")?).map_err(|e| e.to_string())?;
    std::fs::write(&tmp, serde_json::to_vec(grants).map_err(|e| e.to_string())?)
        .map_err(|e| e.to_string())?;
    std::fs::rename(tmp, p).map_err(|e| e.to_string())
}
fn scope(kind: &str, params: &Value) -> Option<(Value, String)> {
    match kind {
        "item/permissions/requestApproval" => params
            .get("permissions")
            .filter(|v| v.is_object())
            .map(|v| (v.clone(), "Повторные запросы ровно этих прав доступа".into())),
        "item/fileChange/requestApproval" => Some((
            json!({"grantRoot":params.get("grantRoot")}),
            "Изменения файлов этим агентом, включая новые файлы".into(),
        )),
        "item/commandExecution/requestApproval" => Some((
            Value::Null,
            "Любые команды этого агента, включая команды с новыми аргументами".into(),
        )),
        "verification" => Some((
            json!({"command":params.get("command"),"cwd":params.get("cwd")}),
            "Повторный запуск этой команды проверки в этой папке".into(),
        )),
        "tool" => params.get("tool_name").and_then(Value::as_str).map(|name| {
            (
                json!({"tool":name}),
                format!("Любые вызовы инструмента {name}, включая новые параметры"),
            )
        }),
        _ => None,
    }
}
#[tauri::command]
pub fn reset_project_permissions(project_id: String) -> Result<(), String> {
    let _guard = GRANTS_LOCK.lock().map_err(|_| "Permission storage unavailable")?;
    let mut grants = load_grants()?;
    grants.retain(|g| g.project != project_id);
    save_grants(&grants)
}
static PENDING: LazyLock<Mutex<HashMap<String, Pending>>> = LazyLock::new(|| Mutex::new(HashMap::new()));
struct Cleanup {
    app: tauri::AppHandle,
    chat: String,
    id: String,
}
impl Drop for Cleanup {
    fn drop(&mut self) {
        if let Ok(mut entries) = PENDING.lock() {
            entries.remove(&self.id);
        }
        let _ = self
            .app
            .emit("chat-permission-closed", json!({"chatId":self.chat,"id":self.id}));
    }
}
pub async fn ask(
    app: &tauri::AppHandle,
    chat: &str,
    provider: &str,
    kind: &str,
    params: Value,
) -> Result<bool, String> {
    let project = super::load_project_store()?
        .chats
        .into_iter()
        .find(|c| c.id == chat)
        .ok_or("Chat not found")?
        .project_id;
    let rule = scope(kind, &params);
    let grant = rule.as_ref().map(|(scope, _)| Grant {
        project,
        provider: provider.into(),
        kind: kind.into(),
        scope: scope.clone(),
    });
    if let Some(g) = &grant {
        let _guard = GRANTS_LOCK.lock().map_err(|_| "Permission storage unavailable")?;
        if load_grants()?.contains(g) {
            return Ok(true);
        }
    }
    let id = super::project_id();
    let (tx, rx) = oneshot::channel();
    PENDING
        .lock()
        .map_err(|_| "Permission registry unavailable")?
        .insert(
            id.clone(),
            Pending {
                chat: chat.into(),
                grant,
                send: tx,
            },
        );
    let _cleanup = Cleanup {
        app: app.clone(),
        chat: chat.into(),
        id: id.clone(),
    };
    app.emit("chat-permission",json!({"id":id,"chatId":chat,"provider":provider,"kind":kind,"details":params,"rememberLabel":rule.map(|(_,label)|label)})).map_err(|e|e.to_string())?;
    tokio::time::timeout(std::time::Duration::from_secs(600), rx)
        .await
        .map_err(|_| "Permission request expired")?
        .map_err(|_| "Permission cancelled".into())
}
#[tauri::command]
pub fn answer_agent_permission(
    chat_id: String,
    id: String,
    allow: bool,
    remember: Option<bool>,
) -> Result<(), String> {
    let mut entries = PENDING.lock().map_err(|_| "Permission registry unavailable")?;
    if entries.get(&id).map(|p| p.chat.as_str()) != Some(chat_id.as_str()) {
        return Err("Permission expired or belongs to another chat".into());
    }
    if entries.get(&id).is_some_and(|p| p.send.is_closed()) {
        entries.remove(&id);
        return Err("Permission expired".into());
    }
    if allow && remember == Some(true) {
        let grant = entries
            .get(&id)
            .and_then(|p| p.grant.clone())
            .ok_or("Этот тип разрешения нельзя сохранить")?;
        let _guard = GRANTS_LOCK.lock().map_err(|_| "Permission storage unavailable")?;
        let mut grants = load_grants()?;
        if !grants.contains(&grant) {
            grants.push(grant);
            save_grants(&grants)?;
        }
    }
    entries
        .remove(&id)
        .ok_or("Permission already answered")?
        .send
        .send(allow)
        .map_err(|_| "Permission expired".into())
}
pub fn codex_response(kind: &str, params: &Value, allow: bool) -> Value {
    if kind == "item/permissions/requestApproval" {
        // Provider receives only this turn grant. Nexus stores explicit project-scoped rules separately.
        json!({"permissions":if allow {params["permissions"].clone()}else{json!({})},"scope":"turn"})
    } else {
        json!({"decision":if allow{"accept"}else{"decline"}})
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn scoped_single_use_and_denial() {
        let id = super::super::project_id();
        let (tx, mut rx) = oneshot::channel();
        PENDING.lock().unwrap().insert(
            id.clone(),
            Pending {
                chat: "c".into(),
                grant: None,
                send: tx,
            },
        );
        assert!(answer_agent_permission("wrong".into(), id.clone(), true, None).is_err());
        answer_agent_permission("c".into(), id.clone(), false, None).unwrap();
        assert!(!rx.try_recv().unwrap());
        assert!(answer_agent_permission("c".into(), id, true, None).is_err());
        assert_eq!(
            codex_response(
                "item/permissions/requestApproval",
                &json!({"permissions":{"network":{"enabled":true}}}),
                false
            )["permissions"],
            json!({})
        );
    }
}

#[cfg(test)]
mod persistent_scope_tests {
    use super::*;
    #[test]
    fn scopes_differ_and_never_store_command_text() {
        assert_eq!(
            scope(
                "item/commandExecution/requestApproval",
                &json!({"command":"secret one"})
            )
            .unwrap()
            .0,
            scope(
                "item/commandExecution/requestApproval",
                &json!({"command":"secret two"})
            )
            .unwrap()
            .0
        );
        assert_ne!(
            scope(
                "item/permissions/requestApproval",
                &json!({"permissions":{"network":true}})
            )
            .unwrap()
            .0,
            scope(
                "item/permissions/requestApproval",
                &json!({"permissions":{"fileSystem":{"write":["/other"]}}})
            )
            .unwrap()
            .0
        );
        assert_ne!(
            scope("tool", &json!({"tool_name":"Read"})).unwrap().0,
            scope("tool", &json!({"tool_name":"Write"})).unwrap().0
        );
        assert!(scope("unknown", &json!({})).is_none());
        assert!(scope("tool", &json!({})).is_none());
        let a = Grant {
            project: "p".into(),
            provider: "codex".into(),
            kind: "tool".into(),
            scope: Value::Null,
        };
        let mut b = a.clone();
        b.project = "other".into();
        assert!(a != b);
        b = a.clone();
        b.provider = "claude".into();
        assert!(a != b);
    }
}
