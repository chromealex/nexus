//! Browser for agents: a pinned Playwright MCP server behind Nexus's own confirmation gateway.
//! Each chat chooses: off, a separate Nexus browser profile, or the user's Chrome (Playwright MCP
//! Bridge extension, only by an explicit per-chat switch). The same gateway is given to Claude
//! (--mcp-config), Codex (thread/start config), ACP agents (session/new mcpServers) and API models
//! (Nexus runs the tool loop itself), so every browser action goes through one Nexus policy.
pub use super::browser_policy::*;
use super::*;
use serde_json::{json, Value};
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
pub const PACKAGE: &str = "@playwright/mcp";
pub const VERSION: &str = "0.0.85";
pub const EXTENSION_URL: &str =
    "https://chromewebstore.google.com/detail/playwright-mcp-bridge/mmlmfjhmonkocbjadbfplnigmagldckm";
const GATEWAY: &str = include_str!("browser_gateway.mjs");
static MODES_LOCK: std::sync::Mutex<()> = std::sync::Mutex::new(());
static INSTALL_LOCK: tokio::sync::Mutex<()> = tokio::sync::Mutex::const_new(());
static INSTALL_CANCEL: AtomicBool = AtomicBool::new(false);
static INSTALLING: AtomicBool = AtomicBool::new(false);

fn data() -> PathBuf {
    home().join("Library/Application Support/NEXUS")
}
fn root() -> PathBuf {
    data().join("tools/browser")
}
pub(crate) fn tools_root() -> PathBuf {
    root()
}
fn cli() -> PathBuf {
    root().join("node_modules/@playwright/mcp/cli.js")
}
fn modes_path() -> PathBuf {
    data().join("browser-chats.json")
}
fn chrome_installed() -> bool {
    std::path::Path::new("/Applications/Google Chrome.app").exists()
        || home().join("Applications/Google Chrome.app").exists()
}

fn load_modes() -> HashMap<String, String> {
    std::fs::read(modes_path())
        .ok()
        .and_then(|b| serde_json::from_slice(&b).ok())
        .unwrap_or_default()
}
/// The built-in browser is on by default; a chat can switch it off or to the user's own Chrome.
pub fn chat_mode(chat: &str) -> String {
    load_modes()
        .get(chat)
        .and_then(|m| normalize_mode(m))
        .unwrap_or("builtin")
        .to_string()
}
fn explicit_mode(chat: &str) -> bool {
    load_modes().contains_key(chat)
}
/// Everything the chat browser host needs, with a message the pane can show as is.
pub(crate) fn ready_for_host() -> Result<(), String> {
    if node_bin().is_none() {
        return Err("NEXUS_BROWSER_SETUP: Для браузера нужен Node.js 22+ (nvm или Homebrew).".into());
    }
    if !chrome_installed() {
        return Err("NEXUS_BROWSER_SETUP: Не найден Google Chrome в «Программах».".into());
    }
    if !installed() {
        return Err("NEXUS_BROWSER_SETUP: Нужно один раз установить Playwright.".into());
    }
    Ok(())
}

pub fn installed_version() -> Option<String> {
    let v: Value = serde_json::from_slice(
        &std::fs::read(root().join("node_modules/@playwright/mcp/package.json")).ok()?,
    )
    .ok()?;
    v["version"].as_str().map(String::from)
}
fn installed() -> bool {
    cli().is_file() && installed_version().as_deref() == Some(VERSION)
}

#[tauri::command]
pub fn browser_tools_status(chat_id: Option<String>) -> Value {
    json!({"mode":chat_id.as_deref().map(chat_mode).unwrap_or_else(||"builtin".into()),"installed":installed(),"version":VERSION,"installedVersion":installed_version(),
  "node":node_bin().is_some(),"chrome":chrome_installed(),"installing":INSTALLING.load(Ordering::SeqCst),"extensionUrl":EXTENSION_URL})
}

#[tauri::command]
pub fn save_chat_browser(chat_id: String, mode: String) -> Result<Value, String> {
    let mode = normalize_mode(&mode).ok_or("Неизвестный режим браузера")?;
    if !load_project_store()?.chats.iter().any(|c| c.id == chat_id) {
        return Err("Чат не найден".into());
    }
    let _guard = MODES_LOCK.lock().map_err(|_| "Настройки браузера недоступны")?;
    let mut modes = load_modes();
    // "off" is stored too: without an entry a chat gets the built-in browser by default.
    modes.insert(chat_id.clone(), mode.into());
    if mode != "builtin" && browser_host::running(&chat_id) {
        let chat = chat_id.clone();
        tauri::async_runtime::spawn(async move {
            let _ = browser_host::send(&chat, json!({"type":"shutdown"})).await;
        });
    }
    let path = modes_path();
    std::fs::create_dir_all(data()).map_err(|e| e.to_string())?;
    let temp = path.with_extension("json.tmp");
    std::fs::write(
        &temp,
        serde_json::to_vec_pretty(&modes).map_err(|e| e.to_string())?,
    )
    .map_err(|e| e.to_string())?;
    std::fs::rename(temp, path).map_err(|e| e.to_string())?;
    Ok(browser_tools_status(Some(chat_id)))
}

#[tauri::command]
pub fn cancel_browser_install() {
    INSTALL_CANCEL.store(true, Ordering::SeqCst);
}
struct Installing;
impl Drop for Installing {
    fn drop(&mut self) {
        INSTALLING.store(false, Ordering::SeqCst);
    }
}
/// Installs exactly @playwright/mcp@VERSION (npm verifies registry integrity) without install scripts.
/// It drives the system Google Chrome, so no browser binaries are downloaded.
#[tauri::command]
pub async fn install_browser_tools(app: tauri::AppHandle) -> Result<Value, String> {
    let _guard = INSTALL_LOCK.try_lock().map_err(|_| "Установка уже идёт")?;
    if installed() {
        return Ok(browser_tools_status(None));
    }
    let node =
        node_bin().ok_or("Нужен Node.js 22+ (nvm или Homebrew). Установите его и перезапустите Nexus.")?;
    INSTALL_CANCEL.store(false, Ordering::SeqCst);
    INSTALLING.store(true, Ordering::SeqCst);
    let _installing = Installing;
    let dir = root();
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    std::fs::write(
        dir.join("package.json"),
        r#"{"name":"nexus-browser-tools","private":true}"#,
    )
    .map_err(|e| e.to_string())?;
    let _ = app.emit(
        "browser-install-progress",
        json!({"stage":format!("Загрузка {PACKAGE}@{VERSION}…")}),
    );
    let mut cmd = crate::new_command(node.join("npm"));
    cmd.args(["install", "--prefix"])
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
        .kill_on_drop(true);
    let child = cmd.spawn().map_err(|_| "Не удалось запустить npm")?;
    let cancelled = async {
        loop {
            if INSTALL_CANCEL.load(Ordering::SeqCst) {
                return;
            }
            tokio::time::sleep(Duration::from_millis(150)).await;
        }
    };
    let out = tokio::select! {biased;_=cancelled=>return Err("Установка отменена".into()),v=tokio::time::timeout(Duration::from_secs(600),child.wait_with_output())=>v.map_err(|_|"Установка заняла больше 10 минут и остановлена")?.map_err(|e|e.to_string())?};
    if !out.status.success() {
        let tail: String = String::from_utf8_lossy(&out.stderr)
            .chars()
            .rev()
            .take(600)
            .collect::<String>()
            .chars()
            .rev()
            .collect();
        return Err(format!("npm не установил пакет. {}", tail.trim()));
    }
    if !installed() {
        return Err(format!("После установки не найден {PACKAGE}@{VERSION}"));
    }
    let _ = app.emit("browser-install-progress", json!({"stage":"Готово"}));
    Ok(browser_tools_status(None))
}

#[tauri::command]
pub async fn open_browser_extension_page() -> Result<(), String> {
    let mut cmd = crate::new_command("open");
    if chrome_installed() {
        cmd.args(["-a", "Google Chrome"]);
    }
    let status = cmd.arg(EXTENSION_URL).status().await.map_err(|e| e.to_string())?;
    if status.success() {
        Ok(())
    } else {
        Err("Не удалось открыть страницу расширения".into())
    }
}

pub struct Prepared {
    mode: String,
}
/// Called before a generation starts: fails early with a clear message when the chat wants a browser
/// but the tools are missing.
pub fn prepare(chat: &str) -> Result<Option<Prepared>, String> {
    let mode = chat_mode(chat);
    // The gateway talks to Nexus over a Unix socket; on other systems agents run without the browser.
    if mode == "off" || cfg!(not(unix)) {
        return Ok(None);
    }
    // On by default: until the browser is set up, chats simply run without it. A browser the user
    // chose explicitly for this chat fails early with an explanation instead.
    if ready_for_host().is_err() && !explicit_mode(chat) {
        return Ok(None);
    }
    if node_bin().is_none() {
        return Err(
            "Для браузера агента нужен Node.js 22+. Установите его или выключите браузер в «Параметрах»."
                .into(),
        );
    }
    if !installed() {
        return Err("Браузер для агента не установлен. Откройте «Параметры → Браузер» и нажмите «Установить», или выключите браузер.".into());
    }
    if !chrome_installed() {
        return Err("Не найден Google Chrome в /Applications. Установите Chrome или выключите браузер в «Параметрах».".into());
    }
    Ok(Some(Prepared { mode }))
}

pub struct Session {
    pub spec: Spec,
    task: tokio::task::JoinHandle<()>,
    dir: PathBuf,
    chat: Option<String>,
}
impl Drop for Session {
    fn drop(&mut self) {
        self.task.abort();
        let _ = std::fs::remove_dir_all(&self.dir);
        if let Some(chat) = self.chat.take() {
            tauri::async_runtime::spawn(async move {
                let _ = browser_host::send(&chat, json!({"type":"agent","active":false})).await;
            });
        }
    }
}
fn token() -> String {
    let mut b = [0u8; 24];
    if std::fs::File::open("/dev/urandom")
        .and_then(|mut f| {
            use std::io::Read;
            f.read_exact(&mut b)
        })
        .is_err()
    {
        let t = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_nanos();
        b[..16].copy_from_slice(&t.to_le_bytes());
    }
    b.iter().map(|x| format!("{x:02x}")).collect()
}
#[cfg(not(unix))]
impl Prepared {
    pub async fn start(
        self,
        _app: &tauri::AppHandle,
        _chat: &str,
        _control: std::sync::Arc<chat_runs::Control>,
    ) -> Result<Session, String> {
        let _ = self.mode;
        Err("Браузер для агентов пока доступен только в macOS".into())
    }
}
#[cfg(unix)]
impl Prepared {
    pub async fn start(
        self,
        app: &tauri::AppHandle,
        chat: &str,
        control: std::sync::Arc<chat_runs::Control>,
    ) -> Result<Session, String> {
        use std::os::unix::fs::PermissionsExt;
        let node = node_bin().ok_or("Node.js не найден")?.join("node");
        let id = project_id();
        let dir = data().join("run").join(format!(
            "b-{}",
            &id.chars()
                .filter(|c| c.is_ascii_alphanumeric())
                .take(10)
                .collect::<String>()
        ));
        std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
        std::fs::set_permissions(&dir, std::fs::Permissions::from_mode(0o700)).map_err(|e| e.to_string())?;
        let gateway = dir.join("gateway.mjs");
        std::fs::write(&gateway, GATEWAY).map_err(|e| e.to_string())?;
        let socket = dir.join("s.sock");
        let listener = tokio::net::UnixListener::bind(&socket)
            .map_err(|e| format!("Не удалось открыть канал браузера: {e}"))?;
        std::fs::set_permissions(&socket, std::fs::Permissions::from_mode(0o600))
            .map_err(|e| e.to_string())?;
        // The built-in browser belongs to the chat and outlives the answer; the agent only connects to it.
        let port = if self.mode == "builtin" {
            let port = browser_host::ensure(app, chat).await?;
            let _ = browser_host::send(chat, json!({"type":"agent","active":true})).await;
            Some(port)
        } else {
            None
        };
        let output = data().join("browser-output").join(
            chat.chars()
                .filter(|c| c.is_ascii_alphanumeric() || *c == '-')
                .take(80)
                .collect::<String>(),
        );
        let _ = std::fs::create_dir_all(&output);
        let args = playwright_args(&self.mode, port, &output);
        let secret = token();
        let env = vec![
            (
                "NEXUS_GATEWAY_SOCKET".to_string(),
                socket.to_string_lossy().to_string(),
            ),
            ("NEXUS_GATEWAY_TOKEN".into(), secret.clone()),
            ("NEXUS_BROWSER_CLI".into(), cli().to_string_lossy().into()),
            (
                "NEXUS_BROWSER_ARGS".into(),
                serde_json::to_string(&args).map_err(|e| e.to_string())?,
            ),
        ];
        let mut spec = Spec {
            command: node.to_string_lossy().into(),
            args: vec![gateway.to_string_lossy().into()],
            env,
            mode: self.mode.clone(),
            claude_config: String::new(),
        };
        // Claude reads MCP servers from a file; it holds the session token, so it is private and removed with the session.
        let config = dir.join("claude-mcp.json");
        std::fs::write(&config,serde_json::to_vec(&json!({"mcpServers":{SERVER:{"type":"stdio","command":spec.command,"args":spec.args,"env":spec.env_map()}}})).map_err(|e|e.to_string())?).map_err(|e|e.to_string())?;
        std::fs::set_permissions(&config, std::fs::Permissions::from_mode(0o600))
            .map_err(|e| e.to_string())?;
        spec.claude_config = config.to_string_lossy().into();
        let chat_name = chat.to_string();
        let (app, chat, mode) = (app.clone(), chat.to_string(), self.mode.clone());
        let task = tokio::spawn(async move {
            let mut running = tokio::task::JoinSet::new();
            loop {
                let Ok((stream, _)) = listener.accept().await else {
                    break;
                };
                let (app, chat, mode, secret, control) = (
                    app.clone(),
                    chat.clone(),
                    mode.clone(),
                    secret.clone(),
                    control.clone(),
                );
                running.spawn(async move {
                    let _ = serve(stream, &app, &chat, &mode, &secret, &control).await;
                });
                while running.try_join_next().is_some() {}
            }
        });
        Ok(Session {
            spec,
            task,
            dir,
            chat: port.map(|_| chat_name),
        })
    }
}
#[cfg(unix)]
async fn serve(
    stream: tokio::net::UnixStream,
    app: &tauri::AppHandle,
    chat: &str,
    mode: &str,
    secret: &str,
    control: &chat_runs::Control,
) -> Result<(), String> {
    let (read, mut write) = stream.into_split();
    let mut line = String::new();
    let mut reader = BufReader::new(read.take(1_048_576));
    tokio::time::timeout(Duration::from_secs(10), reader.read_line(&mut line))
        .await
        .map_err(|_| "timeout")?
        .map_err(|e| e.to_string())?;
    let request: Value = serde_json::from_str(&line).map_err(|_| "bad request")?;
    let reply = if !same(request["token"].as_str().unwrap_or(""), secret) {
        json!({"allow":false,"message":"Неверный ключ сеанса браузера."})
    } else {
        let tool = request["tool"].as_str().unwrap_or("");
        let args = &request["arguments"];
        let decision = decide(tool, args);
        // The pane and its preview show what the agent is doing in the browser right now.
        let _ = app.emit(
            "browser-activity",
            json!({"chatId":chat,"tool":tool,"text":activity(tool,&decision),"asks":matches!(decision,Decision::Ask(_))}),
        );
        match decision {
            Decision::Allow => json!({"allow":true}),
            Decision::Deny(message) => json!({"allow":false,"message":message}),
            Decision::Ask(summary) => {
                let _ = app.emit(
                    "chat-progress",
                    json!({"chatId":chat,"stage":format!("Браузер: {summary}")}),
                );
                let details = json!({"tool":tool,"summary":summary,"mode":mode,"host":args["url"].as_str().and_then(host),"arguments":args});
                match chat_permissions::ask(app, chat, "browser", "browser", details).await {
                    Ok(true) => {
                        control.mark_permission();
                        json!({"allow":true})
                    }
                    Ok(false) => {
                        json!({"allow":false,"message":"Пользователь отклонил это действие в браузере. Не повторяйте его без новой просьбы пользователя."})
                    }
                    Err(e) => json!({"allow":false,"message":format!("Разрешение не получено: {e}")}),
                }
            }
        }
    };
    write
        .write_all(format!("{reply}\n").as_bytes())
        .await
        .map_err(|e| e.to_string())
}
use tokio::io::AsyncReadExt;

/// Minimal MCP stdio client used by Nexus itself for API models (which have no native MCP support).
pub struct Client {
    child: tokio::process::Child,
    input: tokio::process::ChildStdin,
    lines: tokio::io::Lines<BufReader<tokio::process::ChildStdout>>,
    next: u64,
}
impl Client {
    pub async fn connect(spec: &Spec) -> Result<Self, String> {
        let mut cmd = crate::new_command(&spec.command);
        cmd.args(&spec.args)
            .envs(spec.env.iter().cloned())
            .kill_on_drop(true)
            .stdin(std::process::Stdio::piped())
            .stdout(std::process::Stdio::piped())
            .stderr(std::process::Stdio::null());
        let mut child = cmd.spawn().map_err(|_| "Не удалось запустить браузер агента")?;
        let input = child.stdin.take().ok_or("Нет входного канала браузера")?;
        let lines = BufReader::new(child.stdout.take().ok_or("Нет выходного канала браузера")?).lines();
        let mut client = Client {
            child,
            input,
            lines,
            next: 1,
        };
        client.request("initialize",json!({"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"nexus","version":"0.20.2"}}),Duration::from_secs(60)).await?;
        client
            .send(json!({"jsonrpc":"2.0","method":"notifications/initialized"}))
            .await?;
        Ok(client)
    }
    async fn send(&mut self, v: Value) -> Result<(), String> {
        self.input
            .write_all(format!("{v}\n").as_bytes())
            .await
            .map_err(|_| "Браузер агента закрыл соединение".into())
    }
    async fn request(&mut self, method: &str, params: Value, wait: Duration) -> Result<Value, String> {
        let id = self.next;
        self.next += 1;
        self.send(json!({"jsonrpc":"2.0","id":id,"method":method,"params":params}))
            .await?;
        let lines = &mut self.lines;
        tokio::time::timeout(wait, async {
            while let Some(line) = lines.next_line().await.map_err(|e| e.to_string())? {
                if line.len() > 12_000_000 {
                    return Err("Слишком большой ответ браузера".to_string());
                }
                let Ok(v) = serde_json::from_str::<Value>(&line) else {
                    continue;
                };
                if v["id"] == id && v.get("method").is_none() {
                    if let Some(e) = v.get("error") {
                        return Err(format!("Браузер: {}", e["message"].as_str().unwrap_or("ошибка")));
                    }
                    return Ok(v["result"].clone());
                }
            }
            Err("Браузер агента завершился".to_string())
        })
        .await
        .map_err(|_| "Браузер агента не ответил вовремя".to_string())?
    }
    /// Tools in OpenAI function-calling form.
    pub async fn tools(&mut self) -> Result<Vec<Value>, String> {
        let result = self
            .request("tools/list", json!({}), Duration::from_secs(60))
            .await?;
        Ok(openai_tools(&result))
    }
    pub async fn call(&mut self, name: &str, arguments: Value) -> Result<String, String> {
        let result = self
            .request(
                "tools/call",
                json!({"name":name,"arguments":arguments}),
                Duration::from_secs(660),
            )
            .await?;
        Ok(tool_text(&result))
    }
    pub async fn close(mut self) {
        drop(self.input);
        let _ = tokio::time::timeout(Duration::from_secs(3), self.child.wait()).await;
        let _ = self.child.kill().await;
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn session_token_is_long_hex() {
        let t = token();
        assert_eq!(t.len(), 48);
        assert!(t.chars().all(|c| c.is_ascii_hexdigit()));
    }
}
