//! MCP servers the user connects once in Nexus (Atlassian/Jira, and any remote HTTPS server) and that
//! every agent then gets: Claude through `--mcp-config`, Codex through thread config. Remote servers are
//! reached through a pinned `mcp-remote` bridge (stdio ↔ Streamable HTTP with OAuth). Its sign-in opens
//! the provider's own page in the browser; tokens stay in `NEXUS/mcp-auth`, never in Nexus files or
//! the model's context. Tool calls are never pre-approved: Claude asks through `can_use_tool`, Codex
//! through an MCP elicitation, and both become a permission card in the chat.
use super::*;
use serde_json::{json, Value};

pub const PACKAGE: &str = "mcp-remote";
pub const VERSION: &str = "0.16.6";
static LOCK: std::sync::Mutex<()> = std::sync::Mutex::new(());
static INSTALL_LOCK: tokio::sync::Mutex<()> = tokio::sync::Mutex::const_new(());

#[derive(Clone, Serialize, Deserialize, Debug, PartialEq)]
#[serde(rename_all = "camelCase", default)]
pub struct McpServer {
    pub id: String,
    pub name: String,
    pub url: String,
    pub enabled: bool,
    /// Set after a successful sign-in through the bridge.
    pub signed_in: bool,
}
impl Default for McpServer {
    fn default() -> Self {
        Self {
            id: String::new(),
            name: String::new(),
            url: String::new(),
            enabled: true,
            signed_in: false,
        }
    }
}

/// Ready-made official servers offered with one click.
pub const PRESETS: &[(&str, &str, &str)] = &[(
    "atlassian",
    "Atlassian (Jira, Confluence)",
    "https://mcp.atlassian.com/v1/mcp/authv2",
)];

fn data() -> PathBuf {
    home().join("Library/Application Support/NEXUS")
}
fn store_path() -> PathBuf {
    data().join("mcp-servers.json")
}
fn root() -> PathBuf {
    data().join("tools/mcp-remote")
}
fn auth_dir() -> PathBuf {
    data().join("mcp-auth")
}
fn bin(name: &str) -> PathBuf {
    root().join("node_modules/mcp-remote/dist").join(name)
}
fn installed() -> bool {
    bin("proxy.js").is_file() && bin("client.js").is_file()
}

pub fn load() -> Vec<McpServer> {
    std::fs::read(store_path())
        .ok()
        .and_then(|b| serde_json::from_slice(&b).ok())
        .unwrap_or_default()
}
fn save(items: &[McpServer]) -> Result<(), String> {
    std::fs::create_dir_all(data()).map_err(|e| e.to_string())?;
    let tmp = store_path().with_extension("tmp");
    std::fs::write(&tmp, serde_json::to_vec_pretty(items).map_err(|e| e.to_string())?)
        .map_err(|e| e.to_string())?;
    std::fs::rename(tmp, store_path()).map_err(|e| e.to_string())
}

/// Server IDs become tool prefixes (`mcp__<id>__…`): lowercase letters, digits and dashes only.
pub fn valid_id(id: &str) -> bool {
    !id.is_empty()
        && id.len() <= 32
        && id
            .chars()
            .all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '-')
        && id != super::browser_tools::SERVER
}
/// Only remote HTTPS servers: no local commands from a pasted config, no credentials in the URL.
pub fn valid_url(url: &str) -> bool {
    let Some(rest) = url.strip_prefix("https://") else {
        return false;
    };
    let host = rest.split(['/', '?', '#']).next().unwrap_or("");
    !host.is_empty()
        && !host.contains('@')
        && url.len() <= 300
        && !url
            .chars()
            .any(|c| c.is_whitespace() || c.is_control() || c == '"' || c == '\'')
}

fn view() -> Value {
    json!({
        "servers": load(),
        "installed": installed(),
        "version": VERSION,
        "presets": PRESETS.iter().map(|(id, name, url)| json!({"id": id, "name": name, "url": url})).collect::<Vec<_>>(),
    })
}

#[tauri::command]
pub fn mcp_servers() -> Value {
    view()
}

#[tauri::command]
pub fn mcp_server_save(id: String, name: String, url: String) -> Result<Value, String> {
    let id = id.trim().to_lowercase();
    let (name, url) = (name.trim().to_string(), url.trim().to_string());
    if !valid_id(&id) {
        return Err("Идентификатор: латинские строчные буквы, цифры и дефис, до 32 символов".into());
    }
    if !valid_url(&url) {
        return Err("Нужен адрес сервера вида https://… без логина и пароля".into());
    }
    if name.is_empty() || name.chars().count() > 60 {
        return Err("Название должно быть от 1 до 60 символов".into());
    }
    let _guard = LOCK.lock().map_err(|_| "Хранилище занято")?;
    let mut items = load();
    match items.iter_mut().find(|s| s.id == id) {
        Some(s) => {
            if s.url != url {
                s.signed_in = false;
            }
            s.name = name;
            s.url = url;
        }
        None => items.push(McpServer {
            id,
            name,
            url,
            ..Default::default()
        }),
    }
    save(&items)?;
    Ok(view())
}

#[tauri::command]
pub fn mcp_server_toggle(id: String, enabled: bool) -> Result<Value, String> {
    let _guard = LOCK.lock().map_err(|_| "Хранилище занято")?;
    let mut items = load();
    items
        .iter_mut()
        .find(|s| s.id == id)
        .ok_or("Сервер не найден")?
        .enabled = enabled;
    save(&items)?;
    Ok(view())
}

#[tauri::command]
pub fn mcp_server_remove(id: String) -> Result<Value, String> {
    let _guard = LOCK.lock().map_err(|_| "Хранилище занято")?;
    let mut items = load();
    items.retain(|s| s.id != id);
    save(&items)?;
    Ok(view())
}

/// Installs exactly mcp-remote@VERSION (npm checks the registry integrity) without install scripts.
async fn ensure_installed(app: &tauri::AppHandle) -> Result<(), String> {
    let _guard = INSTALL_LOCK.lock().await;
    if installed() {
        return Ok(());
    }
    let node =
        node_bin().ok_or("Нужен Node.js 22+ (nvm или Homebrew). Установите его и перезапустите Nexus.")?;
    let dir = root();
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    std::fs::write(
        dir.join("package.json"),
        r#"{"name":"nexus-mcp-remote","private":true}"#,
    )
    .map_err(|e| e.to_string())?;
    let _ = app.emit(
        "mcp-progress",
        json!({"stage": format!("Загрузка {PACKAGE}@{VERSION}…")}),
    );
    let out = crate::new_command(node.join("npm"))
        .args(["install", "--prefix"])
        .arg(&dir)
        .args([
            "--no-audit",
            "--no-fund",
            "--ignore-scripts",
            "--save-exact",
            "--loglevel",
            "error",
            &format!("{PACKAGE}@{VERSION}"),
        ])
        .env(
            "PATH",
            std::env::join_paths([node.clone(), PathBuf::from("/usr/bin"), PathBuf::from("/bin")])
                .map_err(|e| e.to_string())?,
        )
        .current_dir(&dir)
        .stdin(std::process::Stdio::null())
        .stdout(std::process::Stdio::null())
        .stderr(std::process::Stdio::piped())
        .kill_on_drop(true)
        .output();
    let out = tokio::time::timeout(Duration::from_secs(600), out)
        .await
        .map_err(|_| "Установка заняла больше 10 минут и остановлена")?
        .map_err(|_| "Не удалось запустить npm")?;
    if !out.status.success() || !installed() {
        let tail: String = String::from_utf8_lossy(&out.stderr).chars().take(400).collect();
        return Err(format!("npm не установил {PACKAGE}@{VERSION}. {}", tail.trim()));
    }
    Ok(())
}

/// Signs in to the server: the bridge opens the provider's sign-in page in the default browser and
/// waits for the redirect. Nexus never sees the tokens.
#[tauri::command]
pub async fn mcp_server_login(app: tauri::AppHandle, id: String) -> Result<Value, String> {
    let server = load()
        .into_iter()
        .find(|s| s.id == id)
        .ok_or("Сервер не найден")?;
    ensure_installed(&app).await?;
    let node = node_bin().ok_or("Node.js не найден")?.join("node");
    std::fs::create_dir_all(auth_dir()).map_err(|e| e.to_string())?;
    let _ = app.emit(
        "mcp-progress",
        json!({"id": id, "stage": "Откроется страница входа — подтвердите доступ в браузере"}),
    );
    let out = crate::new_command(node)
        .arg(bin("client.js"))
        .arg(&server.url)
        .env("MCP_REMOTE_CONFIG_DIR", auth_dir())
        .stdin(std::process::Stdio::null())
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped())
        .kill_on_drop(true)
        .output();
    let out = tokio::time::timeout(Duration::from_secs(300), out)
        .await
        .map_err(|_| "Вход не подтверждён за 5 минут")?
        .map_err(|_| "Не удалось запустить вход")?;
    let log = format!(
        "{}\n{}",
        String::from_utf8_lossy(&out.stdout),
        String::from_utf8_lossy(&out.stderr)
    );
    // The client lists the server's tools after connecting; that is the proof the sign-in worked.
    let ok = out.status.success() && !log.to_lowercase().contains("error");
    {
        let _guard = LOCK.lock().map_err(|_| "Хранилище занято")?;
        let mut items = load();
        if let Some(s) = items.iter_mut().find(|s| s.id == id) {
            s.signed_in = ok;
        }
        save(&items)?;
    }
    if !ok {
        return Err("Сервер не подтвердил вход. Попробуйте ещё раз; если окно входа не открылось, проверьте браузер по умолчанию.".into());
    }
    let _ = app.emit("mcp-progress", json!({"id": id, "stage": "Готово"}));
    Ok(view())
}

/// Enabled, signed-in servers as stdio launch specs for agents: (id, command, args, env).
pub fn launch_specs() -> Vec<(String, String, Vec<String>, Vec<(String, String)>)> {
    let (Some(node), true) = (node_bin(), installed()) else {
        return vec![];
    };
    load()
        .into_iter()
        .filter(|s| s.enabled && s.signed_in && valid_id(&s.id) && valid_url(&s.url))
        .map(|s| {
            (
                s.id,
                node.join("node").to_string_lossy().to_string(),
                vec![bin("proxy.js").to_string_lossy().to_string(), s.url],
                vec![(
                    "MCP_REMOTE_CONFIG_DIR".to_string(),
                    auth_dir().to_string_lossy().to_string(),
                )],
            )
        })
        .collect()
}

/// Claude: a private `--mcp-config` file for this run (no secrets inside; removed by the caller).
/// `base` is the browser gateway's config for this run, merged in so Claude gets one file.
pub fn claude_config_file(base: Option<&str>) -> Option<PathBuf> {
    let specs = launch_specs();
    if specs.is_empty() {
        return None;
    }
    let mut merged = base
        .and_then(|p| std::fs::read(p).ok())
        .and_then(|b| serde_json::from_slice::<Value>(&b).ok())
        .and_then(|v| v["mcpServers"].as_object().cloned())
        .unwrap_or_default();
    let servers: serde_json::Map<String, Value> = specs
        .into_iter()
        .map(|(id, command, args, env)| {
            let env: serde_json::Map<String, Value> =
                env.into_iter().map(|(k, v)| (k, Value::String(v))).collect();
            (
                id,
                json!({"type": "stdio", "command": command, "args": args, "env": env}),
            )
        })
        .collect();
    merged.extend(servers);
    let servers = merged;
    let path = data().join("run").join(format!("mcp-{}.json", project_id()));
    std::fs::create_dir_all(path.parent()?).ok()?;
    std::fs::write(&path, serde_json::to_vec(&json!({"mcpServers": servers})).ok()?).ok()?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let _ = std::fs::set_permissions(&path, std::fs::Permissions::from_mode(0o600));
    }
    Some(path)
}

/// Codex: `mcp_servers.<id>` thread config entries. Tool calls are not pre-approved.
pub fn codex_entries() -> Vec<(String, Value)> {
    launch_specs()
        .into_iter()
        .map(|(id, command, args, env)| {
            let env: serde_json::Map<String, Value> =
                env.into_iter().map(|(k, v)| (k, Value::String(v))).collect();
            (
                format!("mcp_servers.{id}"),
                json!({"command": command, "args": args, "env": env, "startup_timeout_sec": 60, "tool_timeout_sec": 300}),
            )
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn only_remote_https_urls_and_safe_ids() {
        assert!(valid_url("https://mcp.atlassian.com/v1/mcp/authv2"));
        assert!(!valid_url("http://mcp.example.com"));
        assert!(!valid_url("https://user:pw@example.com/mcp"));
        assert!(!valid_url("https://example.com/a b"));
        assert!(valid_id("atlassian"));
        assert!(!valid_id("Atlassian"));
        assert!(!valid_id("a/b"));
        assert!(!valid_id(super::super::browser_tools::SERVER));
    }
}
