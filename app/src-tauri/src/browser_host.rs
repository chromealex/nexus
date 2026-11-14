//! Built-in chat browser: one invisible Google Chrome per chat (own persistent profile and tabs), run by
//! `browser_host.mjs` through the pinned Playwright install. The side pane shows its screencast and sends
//! the user's clicks and keys; agents drive the same browser through the Nexus gateway (CDP endpoint).
use super::*;
use serde_json::{json, Value};
use std::sync::LazyLock;
use tokio::io::AsyncWriteExt;

const HOST: &str = include_str!("browser_host.mjs");

struct Host {
    generation: u64,
    port: u16,
    stdin: Arc<Mutex<tokio::process::ChildStdin>>,
}
static HOSTS: LazyLock<std::sync::Mutex<HashMap<String, Host>>> =
    LazyLock::new(|| std::sync::Mutex::new(HashMap::new()));
static TABS: LazyLock<std::sync::Mutex<HashMap<String, Value>>> =
    LazyLock::new(|| std::sync::Mutex::new(HashMap::new()));
static STARTING: Mutex<()> = Mutex::const_new(());
static GENERATION: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(1);

fn safe(chat: &str) -> String {
    chat.chars()
        .filter(|c| c.is_ascii_alphanumeric() || *c == '-')
        .take(80)
        .collect()
}
fn chat_dir(chat: &str) -> PathBuf {
    home()
        .join("Library/Application Support/NEXUS/browsers")
        .join(safe(chat))
}

/// Starts the chat's browser if it is not running and returns its loopback DevTools port.
pub async fn ensure(app: &tauri::AppHandle, chat: &str) -> Result<u16, String> {
    if safe(chat).is_empty() {
        return Err("Некорректный чат".into());
    }
    if let Some(port) = HOSTS.lock().ok().and_then(|h| h.get(chat).map(|h| h.port)) {
        return Ok(port);
    }
    let _starting = STARTING.lock().await;
    if let Some(port) = HOSTS.lock().ok().and_then(|h| h.get(chat).map(|h| h.port)) {
        return Ok(port);
    }
    browser_tools::ready_for_host()?;
    let node = node_bin().ok_or("Node.js не найден")?.join("node");
    let dir = chat_dir(chat);
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let script = browser_tools::tools_root().join("nexus-browser-host.mjs");
    std::fs::write(&script, HOST).map_err(|e| e.to_string())?;
    let mut child = Command::new(node)
        .arg(&script)
        .env(
            "NEXUS_NODE_MODULES",
            browser_tools::tools_root().join("node_modules"),
        )
        .env("NEXUS_PROFILE_DIR", dir.join("profile"))
        .env("NEXUS_STATE_FILE", dir.join("tabs.json"))
        .stdin(std::process::Stdio::piped())
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::null())
        .kill_on_drop(false)
        .spawn()
        .map_err(|_| "Не удалось запустить браузер чата")?;
    let stdin = Arc::new(Mutex::new(
        child.stdin.take().ok_or("Нет входного канала браузера")?,
    ));
    let mut lines = BufReader::new(child.stdout.take().ok_or("Нет выходного канала браузера")?).lines();
    let ready = tokio::time::timeout(Duration::from_secs(45), async {
        while let Some(line) = lines.next_line().await.map_err(|e| e.to_string())? {
            let Ok(v) = serde_json::from_str::<Value>(&line) else {
                continue;
            };
            match v["type"].as_str() {
                Some("ready") => {
                    return v["port"]
                        .as_u64()
                        .map(|p| p as u16)
                        .ok_or("Нет порта".to_string())
                }
                Some("error") => return Err(v["message"].as_str().unwrap_or("Ошибка браузера").to_string()),
                _ => {}
            }
        }
        Err("Браузер чата не запустился. Проверьте, что установлен Google Chrome.".to_string())
    })
    .await
    .map_err(|_| "Браузер чата не запустился за 45 секунд".to_string())?;
    let port = match ready {
        Ok(port) => port,
        Err(e) => {
            let _ = child.kill().await;
            return Err(e);
        }
    };
    let generation = GENERATION.fetch_add(1, Ordering::SeqCst);
    HOSTS.lock().map_err(|_| "Реестр браузеров недоступен")?.insert(
        chat.to_string(),
        Host {
            generation,
            port,
            stdin,
        },
    );
    let (app, chat) = (app.clone(), chat.to_string());
    tokio::spawn(async move {
        while let Ok(Some(line)) = lines.next_line().await {
            if line.len() > 8_000_000 {
                continue;
            }
            let Ok(v) = serde_json::from_str::<Value>(&line) else {
                continue;
            };
            match v["type"].as_str() {
                Some("frame") => {
                    let _ = app.emit(
                        "browser-frame",
                        json!({"chatId":chat,"tab":v["tab"],"data":v["data"],"width":v["width"],"height":v["height"]}),
                    );
                }
                Some("tabs") => {
                    let state = json!({"chatId":chat,"running":true,"tabs":v["tabs"],"active":v["active"]});
                    if let Ok(mut tabs) = TABS.lock() {
                        tabs.insert(chat.clone(), state.clone());
                    }
                    let _ = app.emit("browser-tabs", state);
                }
                Some("notice") => {
                    let _ = app.emit("browser-notice", json!({"chatId":chat,"message":v["message"]}));
                }
                _ => {}
            }
        }
        let _ = child.wait().await;
        if let Ok(mut hosts) = HOSTS.lock() {
            if hosts.get(&chat).map(|h| h.generation) == Some(generation) {
                hosts.remove(&chat);
            }
        }
        let state = json!({"chatId":chat,"running":false,"tabs":[],"active":null});
        if let Ok(mut tabs) = TABS.lock() {
            if let Some(last) = tabs.get_mut(&chat) {
                last["running"] = json!(false);
            }
        }
        let _ = app.emit("browser-tabs", state);
    });
    Ok(port)
}

pub async fn send(chat: &str, message: Value) -> Result<(), String> {
    let stdin = HOSTS
        .lock()
        .map_err(|_| "Реестр браузеров недоступен")?
        .get(chat)
        .map(|h| h.stdin.clone())
        .ok_or("Браузер чата не запущен")?;
    let mut stdin = stdin.lock().await;
    stdin
        .write_all(format!("{message}\n").as_bytes())
        .await
        .map_err(|_| "Браузер чата закрылся".into())
}
pub fn running(chat: &str) -> bool {
    HOSTS.lock().map(|h| h.contains_key(chat)).unwrap_or(false)
}

/// Validated message from the pane to the host. Only these shapes ever reach the browser.
pub fn pane_message(action: &Value) -> Result<Value, String> {
    let kind = action["type"].as_str().unwrap_or("");
    let num = |key: &str, max: f64| -> Result<f64, String> {
        let v = action[key].as_f64().ok_or("Некорректные координаты")?;
        if !v.is_finite() || v.abs() > max {
            return Err("Некорректные координаты".into());
        }
        Ok(v)
    };
    let id = || action["id"].as_u64().ok_or("Нет вкладки".to_string());
    Ok(match kind {
        "back" | "forward" | "reload" => json!({"type":kind}),
        "navigate" | "newTab" => {
            let url = action["url"].as_str().unwrap_or("").trim();
            if url.chars().count() > 2000 || url.chars().any(char::is_control) {
                return Err("Слишком длинный адрес".into());
            }
            json!({"type":kind,"url":url})
        }
        "selectTab" | "closeTab" => json!({"type":kind,"id":id()?}),
        "click" => json!({"type":"click","x":num("x",20000.0)?,"y":num("y",20000.0)?,
            "button":if action["button"]=="right"{"right"}else{"left"},
            "clickCount":action["clickCount"].as_u64().unwrap_or(1).clamp(1,3)}),
        "move" => json!({"type":"move","x":num("x",20000.0)?,"y":num("y",20000.0)?}),
        "resize" => {
            let (w, h, s) = (
                num("width", 2400.0)?,
                num("height", 2000.0)?,
                num("scale", 4.0).unwrap_or(1.0),
            );
            if w < 320.0 || h < 240.0 {
                return Err("Слишком маленькое окно браузера".into());
            }
            json!({"type":"resize","width":w.round(),"height":h.round(),"scale":s.clamp(1.0, 2.0)})
        }
        "wheel" => json!({"type":"wheel","x":num("x",20000.0)?,"y":num("y",20000.0)?,
            "dx":num("dx",10000.0).unwrap_or(0.0),"dy":num("dy",10000.0).unwrap_or(0.0)}),
        "key" => {
            let key = action["key"].as_str().unwrap_or("");
            let allowed = key.len() <= 40
                && !key.is_empty()
                && key
                    .chars()
                    .all(|c| c.is_ascii_alphanumeric() || "+-_".contains(c));
            if !allowed {
                return Err("Неподдерживаемая клавиша".into());
            }
            json!({"type":"key","key":key})
        }
        "text" => {
            let text = action["text"].as_str().unwrap_or("");
            if text.is_empty() || text.chars().count() > 2000 {
                return Err("Некорректный текст".into());
            }
            json!({"type":"text","text":text})
        }
        _ => return Err("Неизвестное действие браузера".into()),
    })
}

#[tauri::command]
pub async fn browser_pane_open(
    app: tauri::AppHandle,
    chat_id: String,
    view: String,
) -> Result<Value, String> {
    if !load_project_store()?.chats.iter().any(|c| c.id == chat_id) {
        return Err("Чат не найден".into());
    }
    let view = if view == "thumb" { "thumb" } else { "full" };
    ensure(&app, &chat_id).await?;
    send(&chat_id, json!({"type":"view","mode":view})).await?;
    Ok(browser_pane_state(chat_id))
}
/// Changes what the pane needs without starting a browser: "full", "thumb" (preview) or "none".
#[tauri::command]
pub async fn browser_pane_view(chat_id: String, view: String) -> Result<(), String> {
    let view = match view.as_str() {
        "full" | "thumb" => view,
        _ => "none".into(),
    };
    if running(&chat_id) {
        send(&chat_id, json!({"type":"view","mode":view})).await?;
    }
    Ok(())
}
#[tauri::command]
pub async fn browser_pane_input(chat_id: String, action: Value) -> Result<(), String> {
    let message = pane_message(&action)?;
    send(&chat_id, message).await
}
#[tauri::command]
pub fn browser_pane_state(chat_id: String) -> Value {
    let running = running(&chat_id);
    let mut state = TABS
        .lock()
        .ok()
        .and_then(|t| t.get(&chat_id).cloned())
        .unwrap_or_else(|| json!({"chatId":chat_id,"tabs":[],"active":null}));
    state["running"] = json!(running);
    state
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn pane_messages_are_whitelisted_and_bounded() {
        assert_eq!(pane_message(&json!({"type":"back"})).unwrap()["type"], "back");
        assert!(pane_message(&json!({"type":"shutdown"})).is_err());
        assert!(pane_message(&json!({"type":"eval","code":"x"})).is_err());
        let click = pane_message(&json!({"type":"click","x":10.5,"y":20,"clickCount":9,"extra":1})).unwrap();
        assert_eq!(click["clickCount"], 3);
        assert!(click.get("extra").is_none());
        assert!(pane_message(&json!({"type":"click","x":"a","y":1})).is_err());
        assert!(pane_message(&json!({"type":"click","x":1e9,"y":1})).is_err());
        assert!(pane_message(&json!({"type":"key","key":"Enter"})).is_ok());
        assert!(pane_message(&json!({"type":"key","key":"a;rm"})).is_err());
        assert!(pane_message(&json!({"type":"text","text":"x".repeat(3000)})).is_err());
        assert!(pane_message(&json!({"type":"navigate","url":"a\nb"})).is_err());
        assert_eq!(
            pane_message(&json!({"type":"selectTab","id":3})).unwrap()["id"],
            3
        );
        assert!(pane_message(&json!({"type":"closeTab"})).is_err());
        let r = pane_message(&json!({"type":"resize","width":480.4,"height":700,"scale":3})).unwrap();
        assert_eq!(
            (r["width"].as_f64(), r["scale"].as_f64()),
            (Some(480.0), Some(2.0))
        );
        assert!(pane_message(&json!({"type":"resize","width":100,"height":700})).is_err());
    }
    #[test]
    fn chat_dirs_are_sanitised() {
        assert!(chat_dir("../../etc").ends_with("browsers/etc"));
        assert_eq!(safe("a/b c"), "abc");
    }
}
