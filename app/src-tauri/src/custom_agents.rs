use super::*;
use tokio::io::AsyncWriteExt;
#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Manifest {
    pub name: String,
    pub executable: String,
    #[serde(default)]
    pub args: Vec<String>,
    #[serde(default)]
    pub npm_package: Option<String>,
    #[serde(default)]
    pub auth_method: Option<String>,
}
#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CustomAgent {
    #[serde(default)]
    pub supports_images: Option<bool>,
    pub id: String,
    pub manifest: Manifest,
    pub path: String,
    pub verified: bool,
}
static CONNECT_LOCK: tokio::sync::Mutex<()> = tokio::sync::Mutex::const_new(());
static LOCK: std::sync::Mutex<()> = std::sync::Mutex::new(());
pub(super) fn path() -> PathBuf {
    home().join("Library/Application Support/NEXUS/custom-agents.json")
}
pub fn load() -> Result<Vec<CustomAgent>, String> {
    if !path().exists() {
        return Ok(vec![]);
    }
    serde_json::from_slice(&std::fs::read(path()).map_err(|e| e.to_string())?).map_err(|e| e.to_string())
}
pub fn get(id: &str) -> Result<CustomAgent, String> {
    load()?
        .into_iter()
        .find(|a| a.id == id && a.verified)
        .ok_or("Пользовательский агент не найден".into())
}
fn valid_package(value: &str) -> bool {
    !value.is_empty()
        && value.len() < 180
        && !value.starts_with('-')
        && value
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || "@/._-".contains(c))
        && value.matches('/').count() <= 1
        && !value.contains("..")
}
pub fn validate(m: &Manifest) -> Result<(), String> {
    if m.name.trim().is_empty()
        || m.name.len() > 80
        || m.executable.is_empty()
        || m.executable.len() > 500
        || m.args.len() > 24
        || m.args.iter().any(|a| a.len() > 1000)
    {
        return Err("Некорректное описание агента".into());
    }
    let name = std::path::Path::new(&m.executable)
        .file_name()
        .unwrap_or_default()
        .to_string_lossy();
    if [
        "sh",
        "bash",
        "zsh",
        "fish",
        "node",
        "python",
        "python3",
        "curl",
        "npm",
        "npx",
        "env",
        "osascript",
    ]
    .contains(&name.as_ref())
        || m.args
            .iter()
            .any(|a| a.contains("bypassPermissions") || a.contains("skip-permissions") || a == "--yolo")
    {
        return Err(
            "Укажите исполняемый файл ACP-агента или официального адаптера без отключения разрешений".into(),
        );
    }
    if let Some(package) = &m.npm_package {
        if !valid_package(package) {
            return Err("Нужен пакет npm с необязательной версией, без URL и команд оболочки".into());
        }
    }
    Ok(())
}
pub fn command(agent: &CustomAgent, cwd: &str) -> Command {
    let mut cmd = Command::new(&agent.path);
    for key in [
        "OPENAI_API_KEY",
        "ANTHROPIC_API_KEY",
        "GEMINI_API_KEY",
        "GOOGLE_API_KEY",
        "XAI_API_KEY",
        "OPENAI_BASE_URL",
    ] {
        cmd.env_remove(key);
    }
    let profile = home()
        .join("Library/Application Support/NEXUS/custom-profiles")
        .join(&agent.id);
    let _ = std::fs::create_dir_all(&profile);
    let bin = std::path::Path::new(&agent.path)
        .file_name()
        .unwrap_or_default()
        .to_string_lossy();
    if bin == "qwen" {
        cmd.env("QWEN_HOME", &profile);
    }
    if bin == "goose" {
        cmd.env("GOOSE_PATH_ROOT", &profile)
            .env("GOOSE_PROVIDER", "ollama")
            .env("GOOSE_MODEL", "qwen3:4b");
    }
    cmd.args(&agent.manifest.args)
        .current_dir(cwd)
        .kill_on_drop(true)
        .process_group(0);
    if let Some(node) = node_bin() {
        let mut paths = vec![node, app_bin()];
        if let Some(path) = std::env::var_os("PATH") {
            paths.extend(std::env::split_paths(&path));
        }
        if let Ok(path) = std::env::join_paths(paths) {
            cmd.env("PATH", path);
        }
    }
    cmd
}
#[tauri::command]
pub fn list_custom_agents() -> Result<Vec<CustomAgent>, String> {
    load()
}
#[tauri::command]
pub fn disconnect_custom_agent(id: String) -> Result<(), String> {
    let _guard = LOCK.lock().map_err(|_| "Agent registry lock failed")?;
    let mut items = load()?;
    let a = items.iter_mut().find(|a| a.id == id).ok_or("Агент не найден")?;
    a.verified = false;
    let target = path();
    let temp = target.with_extension("tmp");
    std::fs::write(
        &temp,
        serde_json::to_vec_pretty(&items).map_err(|e| e.to_string())?,
    )
    .map_err(|e| e.to_string())?;
    std::fs::rename(temp, target).map_err(|e| e.to_string())
}
#[tauri::command]
pub async fn connect_custom_agent(
    chat_id: String,
    message_id: String,
    block: String,
) -> Result<CustomAgent, String> {
    let _connecting = CONNECT_LOCK
        .try_lock()
        .map_err(|_| "Подключение агента уже выполняется. Дождитесь завершения.")?;
    let db = load_project_store()?;
    let chat = db
        .chats
        .iter()
        .find(|c| c.id == chat_id && c.project_id == "nexus-system")
        .ok_or("Агенты подключаются только в проекте Nexus")?;
    let message = db
        .messages
        .iter()
        .find(|m| m.id == message_id && m.chat_id == chat.id && m.role == "assistant")
        .ok_or("Предложение агента не найдено")?;
    let spec: serde_json::Value = serde_json::from_str(&block).map_err(|_| "Неверный формат подключения")?;
    let exists = message
        .content
        .split("```nexus-agent")
        .skip(1)
        .filter_map(|s| s.split("```").next())
        .any(|s| serde_json::from_str::<serde_json::Value>(s.trim()).ok().as_ref() == Some(&spec));
    if !exists {
        return Err("Предложение подключения изменилось".into());
    }
    let manifest: Manifest = serde_json::from_value(spec).map_err(|e| e.to_string())?;
    connect(manifest, &chat_workspace(&db, chat)?).await
}
#[tauri::command]
pub async fn connect_agent_manifest(manifest: Manifest) -> Result<CustomAgent, String> {
    let _connecting = CONNECT_LOCK
        .try_lock()
        .map_err(|_| "Подключение агента уже выполняется")?;
    connect(manifest, &home().to_string_lossy()).await
}
static CANCEL_CONNECT: AtomicBool = AtomicBool::new(false);
#[tauri::command]
pub fn cancel_agent_connection() {
    CANCEL_CONNECT.store(true, Ordering::SeqCst);
}
async fn connect(manifest: Manifest, workspace: &str) -> Result<CustomAgent, String> {
    CANCEL_CONNECT.store(false, Ordering::SeqCst);
    let cancelled = async {
        loop {
            if CANCEL_CONNECT.load(Ordering::SeqCst) {
                return;
            }
            tokio::time::sleep(Duration::from_millis(100)).await;
        }
    };
    tokio::select! {biased;_=cancelled=>Err("Подключение отменено".into()),v=connect_inner(manifest,workspace)=>v}
}
async fn connect_inner(manifest: Manifest, workspace: &str) -> Result<CustomAgent, String> {
    validate(&manifest)?;
    use std::hash::{Hash, Hasher};
    let mut hasher = std::collections::hash_map::DefaultHasher::new();
    serde_json::to_string(&manifest)
        .map_err(|e| e.to_string())?
        .hash(&mut hasher);
    let id = format!("custom-{:x}", hasher.finish());
    let prefix = home().join("Library/Application Support/NEXUS/custom").join(&id);
    let bin = if let Some(package) = &manifest.npm_package {
        let node = node_bin().ok_or("Для установки нужен Node.js 22+")?;
        let npm = node.join("../lib/node_modules/npm/bin/npm-cli.js");
        if manifest.executable.contains('/') {
            return Err("Для npm-пакета укажите имя команды, а не путь".into());
        }
        let mut cmd = Command::new(node.join("node"));
        cmd.arg(npm)
            .args(["install", "-g", package, "--no-audit", "--no-fund"])
            .env("NPM_CONFIG_PREFIX", &prefix)
            .env(
                "PATH",
                format!("{}:{}", node.display(), std::env::var("PATH").unwrap_or_default()),
            )
            .kill_on_drop(true)
            .current_dir(home());
        let output = tokio::time::timeout(Duration::from_secs(180), cmd.output())
            .await
            .map_err(|_| "Установка превысила время ожидания")?
            .map_err(|e| e.to_string())?;
        if !output.status.success() {
            return Err(format!("Пакет не установлен ({})", output.status));
        }
        prefix.join("bin").join(&manifest.executable)
    } else if std::path::Path::new(&manifest.executable).is_absolute() {
        PathBuf::from(&manifest.executable)
    } else {
        find_bin(&manifest.executable).ok_or(
            "Агент не установлен. Укажите официальный npm-пакет или путь к установленному ACP-адаптеру.",
        )?
    };
    if !bin.is_file() {
        return Err("Исполняемый файл агента не найден".into());
    }
    if bin.file_name().and_then(|s| s.to_str()) == Some("qwen") {
        let profile = home()
            .join("Library/Application Support/NEXUS/custom-profiles")
            .join(&id);
        std::fs::create_dir_all(&profile).map_err(|e| e.to_string())?;
        let settings = profile.join("settings.json");
        if !settings.exists() {
            std::fs::write(settings,serde_json::to_vec_pretty(&serde_json::json!({"env":{"OLLAMA_API_KEY":"ollama"},"modelProviders":{"openai":[{"id":"qwen3:4b","name":"Qwen 3 4B · local","envKey":"OLLAMA_API_KEY","baseUrl":"http://127.0.0.1:11434/v1"}]},"security":{"auth":{"selectedType":"openai"}},"model":{"name":"qwen3:4b"}})).map_err(|e|e.to_string())?).map_err(|e|e.to_string())?;
        }
    }
    if matches!(bin.file_name().and_then(|s| s.to_str()), Some("qwen" | "goose")) {
        provider_connections::check_local_qwen().await?;
    }
    let mut agent = CustomAgent {
        supports_images: None,
        id,
        manifest,
        path: bin.to_string_lossy().into_owned(),
        verified: true,
    };
    let mut child = command(&agent, workspace)
        .stdin(std::process::Stdio::piped())
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::null())
        .spawn()
        .map_err(|e| e.to_string())?;
    let _group = process_group::Group::new(&child);
    let result=tokio::time::timeout(Duration::from_secs(if agent.manifest.auth_method.is_some(){300}else{25}),async{
  let mut input=child.stdin.take().ok_or("Missing stdin")?;let mut lines=BufReader::new(child.stdout.take().ok_or("Missing stdout")?).lines();
  input.write_all(format!("{}\n",serde_json::json!({"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":1,"clientCapabilities":{},"clientInfo":{"name":"nexus","version":"0.20.2"}}})).as_bytes()).await.map_err(|e|e.to_string())?;
  while let Some(line)=lines.next_line().await.map_err(|e|e.to_string())?{
   let Ok(v)=serde_json::from_str::<serde_json::Value>(&line)else{continue};
   if v.get("error").is_some(){return Err("Агент отклонил подключение. Проверьте команду, версию ACP и вход в аккаунт.".into())}
   if v["id"]==1{
    agent.supports_images=Some(v["result"]["agentCapabilities"]["promptCapabilities"]["image"]==true);
    if v["result"]["protocolVersion"]!=1{return Err("Агент не поддерживает ACP v1".into())}
    if let Some(method)=&agent.manifest.auth_method{input.write_all(format!("{}\n",serde_json::json!({"jsonrpc":"2.0","id":2,"method":"authenticate","params":{"methodId":method}})).as_bytes()).await.map_err(|e|e.to_string())?;}else{input.write_all(format!("{}\n",serde_json::json!({"jsonrpc":"2.0","id":3,"method":"session/new","params":{"cwd":workspace,"mcpServers":[]}})).as_bytes()).await.map_err(|e|e.to_string())?;}
   }else if v["id"]==2{input.write_all(format!("{}\n",serde_json::json!({"jsonrpc":"2.0","id":3,"method":"session/new","params":{"cwd":workspace,"mcpServers":[]}})).as_bytes()).await.map_err(|e|e.to_string())?;}
   else if v["id"]==3{if !v["result"]["sessionId"].as_str().unwrap_or("").is_empty(){return Ok(())}return Err("ACP не подтвердил готовность сессии".into())}
  }Err("Агент закрыл соединение до проверки совместимости".to_string())
 }).await.unwrap_or_else(|_|Err("Время подключения истекло".into()));
    let _ = child.kill().await;
    let _ = child.wait().await;
    result?;
    {
        let _guard = LOCK.lock().map_err(|_| "Agent registry lock failed")?;
        let mut items = load()?;
        std::fs::create_dir_all(path().parent().unwrap()).map_err(|e| e.to_string())?;
        if let Some(existing) = items.iter_mut().find(|a| a.id == agent.id) {
            *existing = agent.clone()
        } else {
            items.push(agent.clone())
        }
        let target = path();
        let temp = target.with_extension("tmp");
        std::fs::write(
            &temp,
            serde_json::to_vec_pretty(&items).map_err(|e| e.to_string())?,
        )
        .map_err(|e| e.to_string())?;
        std::fs::rename(temp, target).map_err(|e| e.to_string())?;
    }

    Ok(agent)
}
fn chat_workspace(db: &ProjectStore, chat: &NexusChat) -> Result<String, String> {
    db.projects
        .iter()
        .find(|p| p.id == chat.project_id)
        .map(|p| p.workspace.clone())
        .ok_or("Проект не найден".into())
}
pub fn prompt() -> String {
    format!(
        r#"
You are Nexus's management assistant inside its permanent Nexus project. Help the user connect agents not in the built-in list. Current custom registry (data): {}.
To connect an agent, investigate its official ACP v1 support and official CLI command or adapter. If the command/package is unknown, ask the user for a link or path; never invent package names or claim installation succeeded. When enough information is available, emit a nexus-agent fenced JSON block with keys name, executable, args (array), optional npmPackage (registry name with optional version), optional authMethod (official ACP auth method ID). Example format only: {{"name":"Example Agent","executable":"example-agent","args":["--acp"]}}. Do not use example commands as a real recommendation. The user will review and confirm this card; Nexus then installs the optional npm package, verifies the ACP handshake, and adds the agent to the model picker. The user can choose it manually or mention @AgentName in a project chat for explicit routing. No source-code rewrite is needed for compatible agents. Unsupported protocols need an official ACP adapter; explain this rather than pretending integration works. Do not run installers yourself or edit NEXUS files. Existing provider account login and quota are separate from protocol compatibility.
"#,
        serde_json::to_string(&load().unwrap_or_default()).unwrap_or_default()
    )
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn rejects_shells_and_package_injection() {
        let mut m = Manifest {
            name: "Test".into(),
            executable: "test-agent".into(),
            args: vec!["--acp".into()],
            npm_package: Some("@vendor/agent@1.2.3".into()),
            auth_method: None,
        };
        assert!(validate(&m).is_ok());
        m.npm_package = Some("pkg; touch /tmp/x".into());
        assert!(validate(&m).is_err());
        m.npm_package = None;
        m.executable = "bash".into();
        assert!(validate(&m).is_err());
    }
}
