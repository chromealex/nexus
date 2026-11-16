//! Remote task bridge: a message from an allowed sender in Telegram/Discord/Slack/Email/iMessage becomes a regular
//! Nexus chat request. Progress, permission requests and the final answer go back to the same conversation.
//! Defaults are conservative: discussion mode, execution only if allowed per channel, every agent permission is
//! a one-time answer (/allow CODE) and never a stored grant.
use super::channel_adapters as adapters;
use super::*;
use std::collections::{HashSet, VecDeque};
use std::sync::LazyLock;
use std::time::Instant;
use tauri::{Emitter, Listener};

pub const KINDS: [&str; 10] = [
    "telegram", "discord", "slack", "email", "imessage", "github", "linear", "plugin", "api", "push",
];
/// Sources that are polled by `channel_loop`. `api` is served by `api_server`, `push` only sends.
pub const POLLED: [&str; 8] = [
    "telegram", "discord", "slack", "email", "imessage", "github", "linear", "plugin",
];

#[derive(Clone, Serialize, Deserialize, Default, Debug, PartialEq)]
#[serde(rename_all = "camelCase", default)]
pub struct Reply {
    pub to: String,
    pub thread: String,
    pub subject: String,
}
/// `dedupe`: process at most once (issues); `follow_up`: accept only inside an existing conversation (issue comments).
#[derive(Default)]
pub struct Incoming {
    pub conv: String,
    pub sender: String,
    pub text: String,
    pub reply: Reply,
    pub display: String,
    pub dedupe: Option<String>,
    pub follow_up: bool,
    /// Telegram callback query ID when the message is a tap on an inline button.
    pub callback: String,
}

#[derive(Clone, Serialize, Deserialize, Default, Debug)]
#[serde(rename_all = "camelCase", default)]
pub struct Config {
    pub kind: String,
    pub enabled: bool,
    pub project_id: String,
    pub allowed: Vec<String>,
    pub channel_id: String,
    pub imap_host: String,
    pub imap_port: u16,
    pub smtp_host: String,
    pub smtp_port: u16,
    pub username: String,
    pub from_address: String,
    pub allow_unsigned: bool,
    pub self_chat: bool,
    pub notify_progress: bool,
    pub allow_execute: bool,
    pub repo: String,
    pub label: String,
    pub port: u16,
    pub lan: bool,
    pub push_server: String,
    pub push_scope: String,
    pub mac_notify: bool,
    /// `plugin`: absolute path of the executable and its arguments (no shell).
    pub plugin_command: String,
    pub plugin_args: Vec<String>,
}
#[derive(Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase", default)]
struct Conv {
    project_id: String,
    chat_id: String,
    mode: String,
    model: String,
    reply: Reply,
}
#[derive(Serialize, Deserialize, Default)]
#[serde(default)]
struct Store {
    cursors: HashMap<String, String>,
    convs: HashMap<String, Conv>,
    seen: VecDeque<String>,
}

#[derive(Clone, Serialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct Status {
    state: String,
    detail: String,
    at: u64,
}
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Event {
    at: u64,
    kind: String,
    direction: String,
    summary: String,
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct View {
    config: Config,
    has_secret: bool,
    status: Status,
    needs_secret: bool,
}
struct Active {
    kind: String,
    key: String,
    request_id: String,
    title: String,
    stage: String,
    last_sent: Option<Instant>,
    sent: u32,
    /// Telegram private chats: the live draft of the answer (Bot API sendMessageDraft).
    draft_id: i64,
    draft_at: Option<Instant>,
    draft_len: usize,
}
struct PendingPermission {
    chat: String,
    id: String,
    key: String,
}

static LOCK: std::sync::Mutex<()> = std::sync::Mutex::new(());
static STATUS: LazyLock<Mutex<HashMap<String, Status>>> = LazyLock::new(|| Mutex::new(HashMap::new()));
static LOG: LazyLock<Mutex<VecDeque<Event>>> = LazyLock::new(|| Mutex::new(VecDeque::new()));
static ACTIVE: LazyLock<Mutex<HashMap<String, Active>>> = LazyLock::new(|| Mutex::new(HashMap::new()));
static CODES: LazyLock<Mutex<HashMap<String, PendingPermission>>> =
    LazyLock::new(|| Mutex::new(HashMap::new()));
static WARNED: LazyLock<Mutex<HashSet<String>>> = LazyLock::new(|| Mutex::new(HashSet::new()));
static RECENT: LazyLock<Mutex<VecDeque<(String, Instant)>>> = LazyLock::new(|| Mutex::new(VecDeque::new()));
static STARTED: AtomicBool = AtomicBool::new(false);
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OutMessage {
    pub seq: u64,
    pub conversation: String,
    pub text: String,
    pub at: u64,
}
static OUTBOX: LazyLock<Mutex<VecDeque<OutMessage>>> = LazyLock::new(|| Mutex::new(VecDeque::new()));
static OUT_SEQ: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(0);
pub fn outbox_after(conv: &str, after: u64) -> Vec<OutMessage> {
    OUTBOX
        .lock()
        .map(|o| {
            o.iter()
                .filter(|m| m.seq > after && (conv.is_empty() || m.conversation == conv))
                .cloned()
                .collect()
        })
        .unwrap_or_default()
}
pub fn outbox_seq() -> u64 {
    OUT_SEQ.load(Ordering::SeqCst)
}
pub fn is_busy(kind: &str, conv: &str) -> bool {
    active_for(&format!("{kind}:{conv}")).is_some()
}
pub fn is_remote_chat(chat: &str) -> bool {
    ACTIVE.lock().map(|a| a.contains_key(chat)).unwrap_or(false)
}
pub fn api_status(app: &tauri::AppHandle, state: &str, detail: &str) {
    set_status(app, "api", state, detail)
}
pub fn push_log(app: &tauri::AppHandle, text: &str) {
    log(app, "push", "error", text)
}
/// (project name, chat title, last task status, last assistant answer) for notifications.
pub fn chat_summary(chat: &str) -> Option<(String, String, String, String)> {
    let db = load_project_store().ok()?;
    let c = db.chats.iter().find(|c| c.id == chat)?;
    let p = db.projects.iter().find(|p| p.id == c.project_id)?;
    let task = db
        .tasks
        .iter()
        .filter(|t| t.chat_id == chat)
        .next_back()
        .map(|t| t.status.clone())
        .unwrap_or_default();
    let answer = db
        .messages
        .iter()
        .filter(|m| m.chat_id == chat && m.role == "assistant")
        .next_back()
        .map(|m| m.content.trim().to_string())
        .unwrap_or_default();
    Some((p.name.clone(), c.title.clone(), task, answer))
}

// Tokio's async Mutex is not used here: every critical section is short and never awaits.
type Mutex<T> = std::sync::Mutex<T>;

fn config_path() -> PathBuf {
    project_store_path().with_file_name("channels.json")
}
fn state_path() -> PathBuf {
    project_store_path().with_file_name("channel-state.json")
}
fn secret_id(kind: &str) -> String {
    format!("channel-{kind}")
}
fn now_secs() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs()
}
fn write_json<T: Serialize>(path: &PathBuf, value: &T) -> Result<(), String> {
    std::fs::create_dir_all(path.parent().ok_or("Invalid path")?).map_err(|e| e.to_string())?;
    let tmp = path.with_extension("json.tmp");
    std::fs::write(&tmp, serde_json::to_vec_pretty(value).map_err(|e| e.to_string())?)
        .map_err(|e| e.to_string())?;
    std::fs::rename(tmp, path).map_err(|e| e.to_string())
}
pub fn load_configs() -> Result<Vec<Config>, String> {
    let p = config_path();
    if !p.exists() {
        return Ok(vec![]);
    }
    serde_json::from_slice(&std::fs::read(p).map_err(|e| e.to_string())?)
        .map_err(|e| format!("channels.json повреждён: {e}"))
}
fn load_store() -> Store {
    std::fs::read(state_path())
        .ok()
        .and_then(|b| serde_json::from_slice(&b).ok())
        .unwrap_or_default()
}
fn with_store<R>(f: impl FnOnce(&mut Store) -> R) -> R {
    let _g = LOCK.lock();
    let mut s = load_store();
    let r = f(&mut s);
    let _ = write_json(&state_path(), &s);
    r
}
fn random_hex(bytes: usize) -> Result<String, String> {
    use std::io::Read;
    let mut b = vec![0u8; bytes];
    std::fs::File::open("/dev/urandom")
        .and_then(|mut f| f.read_exact(&mut b))
        .map_err(|_| "Нет источника случайных чисел")?;
    Ok(b.iter().map(|x| format!("{x:02x}")).collect())
}
/// Token for the local API and topic for push are generated by Nexus, never typed in.
pub fn generated_secret(kind: &str, regenerate: bool) -> Result<String, String> {
    if !["api", "push"].contains(&kind) {
        return Err("Ключ этого канала вводится вручную".into());
    }
    if !regenerate {
        if let Ok(s) = provider_connections::secrets::get(&secret_id(kind)) {
            return Ok(s);
        }
    }
    let s = if kind == "api" {
        random_hex(24)?
    } else {
        format!("nexus-{}", random_hex(12)?)
    };
    provider_connections::secrets::set(&secret_id(kind), &s)?;
    Ok(s)
}
pub(crate) fn secret(kind: &str) -> Result<String, String> {
    if kind == "imessage" {
        return Ok(String::new());
    }
    if kind == "api" {
        return generated_secret(kind, false);
    }
    if kind == "plugin" {
        // The plugin secret is optional: it is only handed to the plugin in its `hello` line.
        return Ok(provider_connections::secrets::get(&secret_id(kind)).unwrap_or_default());
    }
    provider_connections::secrets::get(&secret_id(kind))
}

fn emit(app: &tauri::AppHandle) {
    let _ = app.emit("channels-event", serde_json::json!({}));
}
fn set_status(app: &tauri::AppHandle, kind: &str, state: &str, detail: &str) {
    let changed = {
        let mut s = STATUS.lock().unwrap_or_else(|e| e.into_inner());
        let prev = s.get(kind).map(|v| (v.state.clone(), v.detail.clone()));
        s.insert(
            kind.into(),
            Status {
                state: state.into(),
                detail: detail.chars().take(400).collect(),
                at: now_secs(),
            },
        );
        prev != Some((state.into(), detail.chars().take(400).collect()))
    };
    if changed {
        emit(app)
    }
}
fn log(app: &tauri::AppHandle, kind: &str, direction: &str, summary: &str) {
    {
        let mut l = LOG.lock().unwrap_or_else(|e| e.into_inner());
        l.push_front(Event {
            at: now_secs(),
            kind: kind.into(),
            direction: direction.into(),
            summary: summary.chars().take(160).collect(),
        });
        l.truncate(120);
    }
    emit(app)
}

pub fn allowed(cfg: &Config, sender: &str) -> bool {
    if cfg.kind == "api" {
        return true;
    } // authenticated by the bearer token in api_server
    let norm = |s: &str| {
        if cfg.kind == "imessage" {
            adapters::normalize_handle(s)
        } else {
            s.trim().to_lowercase()
        }
    };
    let s = norm(sender);
    !s.is_empty() && cfg.allowed.iter().any(|a| norm(a) == s)
}

#[derive(Debug, PartialEq)]
pub enum Cmd {
    Help,
    Status,
    Projects,
    Project(String),
    Agent(String),
    Mode(String),
    New,
    Stop,
    Continue,
    Allow(String),
    Deny(String),
    Task(String),
}
pub fn parse(text: &str) -> Cmd {
    let t = text.trim();
    let lower = t.to_lowercase();
    if ["да", "yes", "ok", "/да", "/yes"].contains(&lower.as_str()) {
        return Cmd::Allow(String::new());
    }
    if ["нет", "no", "/нет", "/no"].contains(&lower.as_str()) {
        return Cmd::Deny(String::new());
    }
    match t {
        "📊 Статус" => return Cmd::Status,
        "📁 Проекты" => return Cmd::Projects,
        "🤖 Агент" => return Cmd::Agent(String::new()),
        "⚙️ Режим" => return Cmd::Mode("?".into()),
        "🆕 Новый чат" => return Cmd::New,
        "❓ Помощь" => return Cmd::Help,
        "⏹ Стоп" => return Cmd::Stop,
        "▶️ Продолжить" => return Cmd::Continue,
        _ => {}
    }
    if !t.starts_with('/') {
        return Cmd::Task(t.into());
    }
    let (head, rest) = t
        .split_once(char::is_whitespace)
        .map(|(a, b)| (a, b.trim()))
        .unwrap_or((t, ""));
    let head = head.split('@').next().unwrap_or(head).to_lowercase();
    let arg = rest.to_string();
    match head.as_str() {
        "/help" | "/start" | "/menu" | "/меню" | "/помощь" | "/команды" => Cmd::Help,
        "/status" | "/статус" | "/tasks" | "/задачи" => Cmd::Status,
        "/projects" | "/проекты" => Cmd::Projects,
        "/project" | "/проект" => {
            if arg.is_empty() {
                Cmd::Projects
            } else {
                Cmd::Project(arg)
            }
        }
        "/agent" | "/model" | "/агент" | "/модель" => Cmd::Agent(arg),
        "/mode" | "/режим" => Cmd::Mode(if arg.is_empty() {
            "?".into()
        } else {
            arg.to_lowercase()
        }),
        "/discuss" | "/обсуждение" => Cmd::Mode("discuss".into()),
        "/execute" | "/run" | "/выполнение" | "/выполнить" => Cmd::Mode("execute".into()),
        "/new" | "/новый" | "/reset" => Cmd::New,
        "/stop" | "/стоп" | "/cancel" => Cmd::Stop,
        "/continue" | "/продолжить" | "/дальше" => Cmd::Continue,
        "/allow" | "/approve" | "/разрешить" => Cmd::Allow(arg.to_uppercase()),
        "/deny" | "/reject" | "/запретить" | "/отклонить" => Cmd::Deny(arg.to_uppercase()),
        "/task" | "/задача" => {
            if arg.is_empty() {
                Cmd::Help
            } else {
                Cmd::Task(arg)
            }
        }
        _ => Cmd::Task(t.into()),
    }
}
pub fn help(cfg: &Config) -> String {
    let mut s=String::from("Nexus принимает задачи из этого чата.\n\nПросто напишите задачу — агент ответит здесь, а чат появится в Nexus. В Telegram действия доступны кнопками под полем ввода и в меню «/».\n\n/status — задачи проекта и текущий этап\n/stop — остановить текущую задачу\n/continue — дописать остановленный ответ\n/projects, /project <номер|имя> — выбрать проект\n/agent [auto|модель] — выбрать агента\n/mode discuss|execute — обсуждение или выполнение\n/new — следующая задача в новом чате\n/allow КОД, /deny КОД — ответ на запрос разрешения агента");
    if !cfg.allow_execute {
        s.push_str("\n\nРежим «Выполнение» для этого канала выключен в настройках Nexus.")
    }
    s
}
pub(crate) fn status_label(s: &str) -> &'static str {
    match s {
        "running" => "выполняется",
        "planning" => "планирование",
        "verifying" => "проверка",
        "review" => "нужна проверка",
        "failed" => "ошибка",
        "interrupted" => "прервана",
        "done" => "готово, проверки пройдены",
        "answered" => "ответ получен",
        "stopped" => "остановлена",
        _ => "—",
    }
}
fn mode_label(m: &str) -> &'static str {
    if m == "execute" {
        "Выполнение"
    } else {
        "Обсуждение"
    }
}
fn summarize_permission(kind: &str, details: &serde_json::Value) -> String {
    let pick = |k: &str| {
        details
            .get(k)
            .map(|v| v.as_str().map(String::from).unwrap_or_else(|| v.to_string()))
            .filter(|s| s != "null")
    };
    let what = match kind {
        "item/commandExecution/requestApproval" => "выполнить команду",
        "item/fileChange/requestApproval" => "изменить файлы",
        "item/permissions/requestApproval" => "расширить права доступа",
        "verification" => "запустить проверку проекта",
        "tool" => "вызвать инструмент",
        _ => "выполнить действие",
    };
    let detail = pick("command")
        .or_else(|| pick("tool_name"))
        .or_else(|| pick("grantRoot"))
        .or_else(|| pick("reason"))
        .or_else(|| pick("permissions"))
        .unwrap_or_default();
    format!(
        "{what}{}",
        if detail.is_empty() {
            String::new()
        } else {
            format!(":\n{}", detail.chars().take(600).collect::<String>())
        }
    )
}
/// Random one-time code for a remote permission answer (6 chars, ~30 bits from the OS RNG).
/// Codes must not be derivable from request ids: anyone who can post into a channel could otherwise guess them.
pub fn random_code() -> String {
    use std::io::Read;
    let a = b"ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    let mut b = [0u8; 6];
    let ok = std::fs::File::open("/dev/urandom")
        .and_then(|mut f| f.read_exact(&mut b))
        .is_ok();
    if !ok {
        let n = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_nanos())
            .unwrap_or(0);
        for (i, x) in b.iter_mut().enumerate() {
            *x = (n >> (i * 7)) as u8 ^ (std::process::id() as u8).wrapping_mul(i as u8 + 1)
        }
    }
    b.iter().map(|x| a[(*x & 31) as usize] as char).collect()
}
/// Channels where the sender id cannot be forged by the platform's users; only there a bare "да"/"yes" may answer a request.
pub fn bare_answer_allowed(kind: &str) -> bool {
    matches!(kind, "telegram" | "discord" | "slack" | "imessage" | "api")
}
#[allow(dead_code)]
pub fn short_code(id: &str) -> String {
    let mut h: u64 = 1469598103934665603;
    for b in id.bytes() {
        h ^= b as u64;
        h = h.wrapping_mul(1099511628211)
    }
    let a = b"ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    (0..4)
        .map(|i| a[((h >> (i * 5)) & 31) as usize] as char)
        .collect()
}

async fn say(app: &tauri::AppHandle, cfg: &Config, reply: &Reply, text: &str) {
    if cfg.kind == "api" {
        let seq = OUT_SEQ.fetch_add(1, Ordering::SeqCst) + 1;
        if let Ok(mut o) = OUTBOX.lock() {
            o.push_back(OutMessage {
                seq,
                conversation: reply.to.clone(),
                text: text.into(),
                at: now_secs(),
            });
            while o.len() > 300 {
                o.pop_front();
            }
        }
        log(app, "api", "out", text.lines().next().unwrap_or(""));
        return;
    }
    let secret = match secret(&cfg.kind) {
        Ok(s) => s,
        Err(e) => {
            set_status(app, &cfg.kind, "error", &e);
            return;
        }
    };
    match adapters::send(cfg, &secret, reply, text).await {
        Ok(()) => log(app, &cfg.kind, "out", text.lines().next().unwrap_or("")),
        Err(e) => {
            log(app, &cfg.kind, "error", &format!("Не отправлено: {e}"));
            set_status(app, &cfg.kind, "error", &e)
        }
    }
}
async fn say_buttons(
    app: &tauri::AppHandle,
    cfg: &Config,
    reply: &Reply,
    text: &str,
    buttons: adapters::Buttons,
    menu: bool,
) {
    if cfg.kind != "telegram" {
        return say(app, cfg, reply, text).await;
    }
    let secret = match secret(&cfg.kind) {
        Ok(s) => s,
        Err(e) => return set_status(app, &cfg.kind, "error", &e),
    };
    match adapters::send_buttons(cfg, &secret, reply, text, &buttons, menu).await {
        Ok(()) => log(app, &cfg.kind, "out", text.lines().next().unwrap_or("")),
        Err(e) => {
            log(app, &cfg.kind, "error", &format!("Не отправлено: {e}"));
            set_status(app, &cfg.kind, "error", &e)
        }
    }
}
fn button(label: impl Into<String>, data: impl Into<String>) -> (String, String) {
    (label.into(), data.into())
}
fn active_for(key: &str) -> Option<(String, String, String, String)> {
    ACTIVE
        .lock()
        .ok()?
        .iter()
        .find(|(_, a)| a.key == key)
        .map(|(chat, a)| {
            (
                chat.clone(),
                a.request_id.clone(),
                a.title.clone(),
                a.stage.clone(),
            )
        })
}
fn resolve_project(db: &ProjectStore, conv: &Conv, cfg: &Config) -> Option<(String, String)> {
    [conv.project_id.as_str(), cfg.project_id.as_str()]
        .into_iter()
        .find_map(|id| {
            db.projects
                .iter()
                .find(|p| p.id == id && p.id != "nexus-system")
                .map(|p| (p.id.clone(), p.name.clone()))
        })
}

pub(crate) async fn handle(app: tauri::AppHandle, cfg: Config, m: Incoming) {
    let key = format!("{}:{}", cfg.kind, m.conv);
    // Issue comments are follow-ups: only inside a conversation Nexus already started (never arbitrary threads).
    if m.follow_up && !load_store().convs.contains_key(&key) {
        return;
    }
    if !allowed(&cfg, &m.sender) {
        log(
            &app,
            &cfg.kind,
            "blocked",
            &format!(
                "Отправитель не в списке разрешённых: {}{}",
                m.sender,
                if m.display.is_empty() {
                    String::new()
                } else {
                    format!(" ({})", m.display)
                }
            ),
        );
        if ["telegram", "discord", "slack"].contains(&cfg.kind.as_str())
            && WARNED.lock().map(|mut w| w.insert(key.clone())).unwrap_or(false)
        {
            say(&app,&cfg,&m.reply,&format!("Nexus: ваш ID {} не в списке разрешённых. Владелец может добавить его в Nexus → Подключения → Каналы.",m.sender)).await;
        }
        return;
    }
    if let Some(d) = &m.dedupe {
        let k = format!("{}:{d}", cfg.kind);
        let fresh = with_store(|s| {
            if s.seen.contains(&k) {
                false
            } else {
                s.seen.push_back(k);
                while s.seen.len() > 1000 {
                    s.seen.pop_front();
                }
                true
            }
        });
        if !fresh {
            return;
        }
    }
    if cfg.kind == "imessage" {
        let sig = format!("{key}|{}", m.text);
        let mut r = RECENT.lock().unwrap_or_else(|e| e.into_inner());
        r.retain(|(_, t)| t.elapsed().as_secs() < 90);
        if r.iter().any(|(s, _)| s == &sig) {
            return;
        }
        r.push_back((sig, Instant::now()));
    }
    log(&app, &cfg.kind, "in", &m.text);
    let mut conv = with_store(|s| {
        let c = s.convs.entry(key.clone()).or_insert_with(|| Conv {
            project_id: cfg.project_id.clone(),
            mode: "discuss".into(),
            model: "auto".into(),
            ..Default::default()
        });
        c.reply = m.reply.clone();
        c.clone()
    });
    let save = |conv: &Conv| {
        let c = conv.clone();
        let k = key.clone();
        with_store(move |s| {
            s.convs.insert(k, c);
        })
    };
    let db = match load_project_store() {
        Ok(d) => d,
        Err(e) => {
            say(
                &app,
                &cfg,
                &m.reply,
                &format!("Nexus: не удалось открыть проекты: {e}"),
            )
            .await;
            return;
        }
    };
    let reply = m.reply.clone();
    let mut cmd = parse(&m.text);
    // A bare "да/нет" counts as an answer only while a permission is waiting; otherwise it is ordinary text.
    if matches!(&cmd,Cmd::Allow(c)|Cmd::Deny(c) if c.is_empty())
        && !CODES
            .lock()
            .map(|c| c.values().any(|p| p.key == key))
            .unwrap_or(false)
    {
        cmd = Cmd::Task(m.text.trim().into())
    }
    match cmd {
        Cmd::Help => say_buttons(&app, &cfg, &reply, &help(&cfg), vec![], true).await,
        Cmd::Projects => {
            let current = resolve_project(&db, &conv, &cfg).map(|x| x.0);
            let buttons: adapters::Buttons = db
                .projects
                .iter()
                .filter(|p| p.id != "nexus-system")
                .take(30)
                .enumerate()
                .map(|(i, p)| {
                    let mark = if Some(&p.id) == current.as_ref() {
                        "✓ "
                    } else {
                        ""
                    };
                    vec![button(format!("{mark}{}", p.name), format!("/project {}", i + 1))]
                })
                .collect();
            let rows: Vec<String> = db
                .projects
                .iter()
                .filter(|p| p.id != "nexus-system")
                .enumerate()
                .map(|(i, p)| {
                    format!(
                        "{}. {}{}",
                        i + 1,
                        p.name,
                        if Some(p.id.as_str()) == resolve_project(&db, &conv, &cfg).map(|x| x.0).as_deref() {
                            " ← текущий"
                        } else {
                            ""
                        }
                    )
                })
                .collect();
            say_buttons(
                &app,
                &cfg,
                &reply,
                &if rows.is_empty() {
                    "Проектов нет. Создайте проект в Nexus.".to_string()
                } else {
                    format!("Проекты:\n{}\n\n/project <номер или имя>", rows.join("\n"))
                },
                buttons,
                false,
            )
            .await
        }
        Cmd::Project(arg) => {
            let list: Vec<_> = db.projects.iter().filter(|p| p.id != "nexus-system").collect();
            let found = arg
                .parse::<usize>()
                .ok()
                .and_then(|n| list.get(n.wrapping_sub(1)).copied())
                .or_else(|| {
                    list.iter()
                        .copied()
                        .find(|p| p.name.to_lowercase() == arg.to_lowercase())
                })
                .or_else(|| {
                    let hits: Vec<_> = list
                        .iter()
                        .copied()
                        .filter(|p| p.name.to_lowercase().contains(&arg.to_lowercase()))
                        .collect();
                    if hits.len() == 1 {
                        Some(hits[0])
                    } else {
                        None
                    }
                });
            match found {
                Some(p) => {
                    conv.project_id = p.id.clone();
                    conv.chat_id.clear();
                    save(&conv);
                    say(
                        &app,
                        &cfg,
                        &reply,
                        &format!("Проект: «{}». Следующая задача начнётся в новом чате.", p.name),
                    )
                    .await
                }
                None => {
                    say(
                        &app,
                        &cfg,
                        &reply,
                        "Проект не найден или имя неоднозначно. /projects — список.",
                    )
                    .await
                }
            }
        }
        Cmd::Agent(arg) => {
            if arg.is_empty() {
                let models = chat_models::list_chat_models().await.unwrap_or_default();
                let rows: Vec<String> = models
                    .iter()
                    .take(25)
                    .map(|c| format!("• {} — /agent {}", c.label, c.id))
                    .collect();
                let current = conv.model.clone();
                let mut buttons: adapters::Buttons = vec![vec![button(
                    if current == "auto" || current.is_empty() {
                        "✓ Авто"
                    } else {
                        "Авто"
                    },
                    "/agent auto",
                )]];
                // Callback data is limited to 64 bytes; longer model IDs keep their text command.
                buttons.extend(models.iter().take(25).filter(|c| c.id.len() <= 56).map(|c| {
                    vec![button(
                        format!("{}{}", if c.id == current { "✓ " } else { "" }, c.label),
                        format!("/agent {}", c.id),
                    )]
                }));
                say_buttons(
                    &app,
                    &cfg,
                    &reply,
                    &format!(
                        "Агент сейчас: {}\n\n/agent auto — автовыбор\n{}",
                        if conv.model == "auto" || conv.model.is_empty() {
                            "Авто".to_string()
                        } else {
                            conv.model.clone()
                        },
                        if rows.is_empty() {
                            "Подключённых агентов не найдено.".into()
                        } else {
                            rows.join("\n")
                        }
                    ),
                    buttons,
                    false,
                )
                .await;
                return;
            }
            if arg == "auto" || arg == "авто" {
                conv.model = "auto".into();
                save(&conv);
                say(&app, &cfg, &reply, "Агент: автовыбор.").await;
                return;
            }
            let models = chat_models::list_chat_models().await.unwrap_or_default();
            let low = arg.to_lowercase();
            let hit = models.iter().find(|c| c.id == arg).or_else(|| {
                let h: Vec<_> = models
                    .iter()
                    .filter(|c| c.label.to_lowercase().contains(&low) || c.id.to_lowercase().contains(&low))
                    .collect();
                if h.len() == 1 {
                    Some(h[0])
                } else {
                    None
                }
            });
            match hit {
                Some(c) => {
                    conv.model = c.id.clone();
                    save(&conv);
                    say(&app,&cfg,&reply,&format!("Агент: {}. Ручной выбор не подменяется — если он недоступен, задача завершится ошибкой.",c.label)).await
                }
                None => {
                    say(
                        &app,
                        &cfg,
                        &reply,
                        "Агент не найден или совпадений несколько. /agent — список.",
                    )
                    .await
                }
            }
        }
        Cmd::Mode(arg) => {
            if arg == "?" {
                let now = if conv.mode == "execute" {
                    "execute"
                } else {
                    "discuss"
                };
                let mut buttons = vec![vec![button(
                    if now == "discuss" {
                        "✓ Обсуждение"
                    } else {
                        "Обсуждение"
                    },
                    "/mode discuss",
                )]];
                if cfg.allow_execute {
                    buttons.push(vec![button(
                        if now == "execute" {
                            "✓ Выполнение"
                        } else {
                            "Выполнение"
                        },
                        "/mode execute",
                    )]);
                }
                say_buttons(
                    &app,
                    &cfg,
                    &reply,
                    &format!(
                        "Режим сейчас: {}.\n\n/mode discuss — обсуждение\n/mode execute — выполнение{}",
                        mode_label(now),
                        if cfg.allow_execute {
                            ""
                        } else {
                            " (выключено в настройках канала)"
                        }
                    ),
                    buttons,
                    false,
                )
                .await;
                return;
            }
            let mode = match arg.as_str() {
                "execute" | "выполнение" | "run" => "execute",
                "discuss" | "обсуждение" | "" => "discuss",
                _ => {
                    say(&app, &cfg, &reply, "Режимы: /mode discuss или /mode execute").await;
                    return;
                }
            };
            if mode == "execute" && !cfg.allow_execute {
                say(&app,&cfg,&reply,"Режим «Выполнение» для этого канала выключен. Включите его в Nexus → Подключения → Каналы.").await;
                return;
            }
            conv.mode = mode.into();
            save(&conv);
            say(&app,&cfg,&reply,&if mode=="execute"{"Режим: Выполнение. Агент может менять файлы и запускать команды только после вашего /allow на каждый запрос.".to_string()}else{"Режим: Обсуждение. Агент отвечает и планирует, но не меняет файлы.".into()}).await
        }
        Cmd::New => {
            conv.chat_id.clear();
            save(&conv);
            say(&app, &cfg, &reply, "Следующая задача начнётся в новом чате.").await
        }
        Cmd::Status => {
            let mut out = Vec::new();
            if let Some((_, _, title, stage)) = active_for(&key) {
                out.push(format!(
                    "▶ Выполняется: {title}\nЭтап: {}",
                    if stage.is_empty() { "запуск" } else { &stage }
                ));
            }
            let codes: Vec<String> = CODES
                .lock()
                .map(|c| {
                    c.iter()
                        .filter(|(_, p)| p.key == key)
                        .map(|(k, _)| k.clone())
                        .collect()
                })
                .unwrap_or_default();
            if !codes.is_empty() {
                out.push(format!("🔐 Ждут ответа: {}", codes.join(", ")))
            }
            if let Some((pid, pname)) = resolve_project(&db, &conv, &cfg) {
                let tasks: Vec<String> = db
                    .tasks
                    .iter()
                    .filter(|t| t.project_id == pid)
                    .rev()
                    .take(6)
                    .map(|t| {
                        let status = if ["running", "planning", "verifying"].contains(&t.status.as_str())
                            && !chat_runs::is_running(&t.chat_id)
                        {
                            "interrupted"
                        } else {
                            t.status.as_str()
                        };
                        format!(
                            "• {} — {}",
                            t.title.chars().take(70).collect::<String>(),
                            status_label(status)
                        )
                    })
                    .collect();
                out.push(format!(
                    "Проект «{pname}» · режим {} · агент {}",
                    mode_label(&conv.mode),
                    if conv.model == "auto" || conv.model.is_empty() {
                        "Авто"
                    } else {
                        &conv.model
                    }
                ));
                out.push(if tasks.is_empty() {
                    "Задач пока нет.".into()
                } else {
                    format!("Последние задачи:\n{}", tasks.join("\n"))
                });
            } else {
                out.push("Проект не выбран: /projects".into())
            }
            say(&app, &cfg, &reply, &out.join("\n\n")).await
        }
        Cmd::Stop => match active_for(&key) {
            Some((chat, req, _, _)) => {
                let r = chat_runs::cancel_chat_generation(chat, req);
                say(
                    &app,
                    &cfg,
                    &reply,
                    &match r {
                        Ok(()) => "⏹ Останавливаю. Полученная часть ответа сохранится в Nexus.".to_string(),
                        Err(e) => format!("Не удалось остановить: {e}"),
                    },
                )
                .await
            }
            None => say(&app, &cfg, &reply, "Сейчас ничего не выполняется.").await,
        },
        Cmd::Allow(code) => answer_permission(&app, &cfg, &reply, &key, &code, true).await,
        Cmd::Deny(code) => answer_permission(&app, &cfg, &reply, &key, &code, false).await,
        Cmd::Continue => {
            if active_for(&key).is_some() {
                say(
                    &app,
                    &cfg,
                    &reply,
                    "Задача ещё выполняется. /status — этап, /stop — остановить.",
                )
                .await;
                return;
            }
            let stopped = db
                .messages
                .iter()
                .filter(|x| x.chat_id == conv.chat_id)
                .next_back()
                .filter(|x| x.role == "assistant" && x.stopped)
                .map(|x| x.id.clone());
            let Some(message_id) = stopped else {
                say(&app, &cfg, &reply, "Нет остановленного ответа для продолжения.").await;
                return;
            };
            let title = db
                .chats
                .iter()
                .find(|c| c.id == conv.chat_id)
                .map(|c| c.title.clone())
                .unwrap_or_default();
            start(
                app,
                cfg,
                conv,
                key,
                "(продолжение)".into(),
                Some(message_id),
                title,
            )
            .await
        }
        Cmd::Task(text) => {
            if let Some((_, _, title, _)) = active_for(&key) {
                say(
                    &app,
                    &cfg,
                    &reply,
                    &format!(
                        "Уже выполняется: {title}\nДождитесь ответа, /status — этап, /stop — остановить."
                    ),
                )
                .await;
                return;
            }
            if text.chars().count() > 12000 {
                say(
                    &app,
                    &cfg,
                    &reply,
                    "Задача длиннее 12 000 символов. Сократите текст.",
                )
                .await;
                return;
            }
            let Some((pid, pname)) = resolve_project(&db, &conv, &cfg) else {
                say(
                    &app,
                    &cfg,
                    &reply,
                    "Проект не выбран. /projects — список, /project <номер>.",
                )
                .await;
                return;
            };
            let reuse = db
                .chats
                .iter()
                .find(|c| {
                    c.id == conv.chat_id && c.project_id == pid && !c.archived && c.deleted_at.is_none()
                })
                .map(|c| c.title.clone());
            let title = match reuse {
                Some(t) => t,
                None => {
                    let t = format!(
                        "{} · {}",
                        adapters::label(&cfg.kind),
                        text.chars().take(60).collect::<String>().replace('\n', " ")
                    );
                    let t: String = t.chars().take(100).collect();
                    match create_project_chat(pid.clone(), t.clone()) {
                        Ok(c) => {
                            conv.chat_id = c.id;
                            conv.project_id = pid.clone();
                            save(&conv);
                            t
                        }
                        Err(e) => {
                            say(&app, &cfg, &reply, &format!("Не удалось создать чат: {e}")).await;
                            return;
                        }
                    }
                }
            };
            say(&app,&cfg,&reply,&format!("Принято ✓ Проект «{pname}» · {} · агент {}\nЧат в Nexus: «{title}»\n/status — этап, /stop — остановить",mode_label(&conv.mode),if conv.model=="auto"||conv.model.is_empty(){"Авто"}else{&conv.model})).await;
            start(app, cfg, conv, key, text, None, title).await
        }
    }
}

async fn answer_permission(
    app: &tauri::AppHandle,
    cfg: &Config,
    reply: &Reply,
    key: &str,
    code: &str,
    allow: bool,
) {
    if code.is_empty() && !bare_answer_allowed(&cfg.kind) {
        say(
            app,
            cfg,
            reply,
            "Для этого канала ответ нужен с кодом: /allow КОД или /deny КОД. /status — список.",
        )
        .await;
        return;
    }
    let picked = {
        let codes = CODES.lock().unwrap_or_else(|e| e.into_inner());
        let mine: Vec<(&String, &PendingPermission)> = codes.iter().filter(|(_, p)| p.key == key).collect();
        if code.is_empty() {
            if mine.len() == 1 {
                Some((mine[0].0.clone(), mine[0].1.chat.clone(), mine[0].1.id.clone()))
            } else {
                None
            }
        } else {
            mine.into_iter()
                .find(|(c, _)| c.as_str() == code)
                .map(|(c, p)| (c.clone(), p.chat.clone(), p.id.clone()))
        }
    };
    let Some((code, chat, id)) = picked else {
        say(
            app,
            cfg,
            reply,
            if code.is_empty() {
                "Несколько запросов ждут ответа — укажите код: /allow КОД или /deny КОД. /status — список."
            } else {
                "Код не найден или запрос уже закрыт."
            },
        )
        .await;
        return;
    };
    // Remote answers are always one-time: remember=false, so nothing is stored as a permanent project grant.
    let r = chat_permissions::answer_agent_permission(chat, id, allow, Some(false));
    if let Ok(mut c) = CODES.lock() {
        c.remove(&code);
    }
    say(
        app,
        cfg,
        reply,
        &match r {
            Ok(()) => {
                if allow {
                    format!("✓ Разрешено однократно ({code}).")
                } else {
                    format!("✕ Отклонено ({code}). Агент получит отказ.")
                }
            }
            Err(e) => format!("Не удалось ответить: {e}"),
        },
    )
    .await
}

async fn start(
    app: tauri::AppHandle,
    cfg: Config,
    conv: Conv,
    key: String,
    text: String,
    continue_id: Option<String>,
    title: String,
) {
    let chat = conv.chat_id.clone();
    let request_id = project_id();
    if let Ok(mut a) = ACTIVE.lock() {
        a.insert(
            chat.clone(),
            Active {
                kind: cfg.kind.clone(),
                key: key.clone(),
                request_id: request_id.clone(),
                title: title.clone(),
                stage: String::new(),
                last_sent: None,
                sent: 0,
                draft_id: if cfg.kind == "telegram"
                    && conv.reply.to.parse::<i64>().map(|c| c > 0).unwrap_or(false)
                {
                    (now_secs() as i64 % 1_000_000_000).max(1)
                } else {
                    0
                },
                draft_at: None,
                draft_len: 0,
            },
        );
    }
    let mode = if conv.mode == "execute" && cfg.allow_execute {
        "execute"
    } else {
        "discuss"
    };
    let model = if conv.model.is_empty() || conv.model == "auto" {
        None
    } else {
        Some(conv.model.clone())
    };
    tauri::async_runtime::spawn(async move {
        let result = unified_chat_send(
            app.clone(),
            chat.clone(),
            text,
            "balanced".into(),
            None,
            Some(request_id),
            continue_id,
            None,
            model,
            Some(mode.into()),
            None,
            None,
        )
        .await;
        if let Ok(mut a) = ACTIVE.lock() {
            a.remove(&chat);
        }
        if let Ok(mut c) = CODES.lock() {
            c.retain(|_, p| p.chat != chat);
        }
        let board = load_project_store()
            .ok()
            .and_then(|db| db.tasks.into_iter().filter(|t| t.chat_id == chat).next_back());
        let footer = board
            .map(|t| {
                format!(
                    "\n\n— Статус: {}. {}",
                    status_label(&t.status),
                    t.verification.chars().take(300).collect::<String>()
                )
            })
            .unwrap_or_default();
        let body = match result {
            Ok(r) => {
                let content = r.message.content.trim().to_string();
                let limit = if cfg.kind == "email" { 60000 } else { 12000 };
                let clipped = if content.chars().count() > limit {
                    format!(
                        "{}…\n\n[Ответ сокращён — полный текст в Nexus]",
                        content.chars().take(limit).collect::<String>()
                    )
                } else {
                    content
                };
                format!("{clipped}\n\n· {} · {}{footer}", r.route, r.tier)
            }
            Err(e) if e == chat_runs::STOPPED => {
                format!("⏹ Остановлено. Полученная часть сохранена в Nexus. /continue — дописать.{footer}")
            }
            Err(e) if e == "NEXUS_ACCOUNT_UNAVAILABLE" => {
                "Нет доступного подключённого агента. Подключите аккаунт в Nexus → Подключения.".into()
            }
            Err(e) => format!(
                "Задача завершилась ошибкой: {}{footer}",
                e.chars().take(500).collect::<String>()
            ),
        };
        say(&app, &cfg, &conv.reply, &body).await;
    });
}

/// Streams the answer into a Telegram draft bubble (private chats), at most every 0.8 s.
fn on_text(app: &tauri::AppHandle, payload: &str) {
    let Ok(v) = serde_json::from_str::<serde_json::Value>(payload) else {
        return;
    };
    let (Some(chat), Some(text)) = (v["chatId"].as_str(), v["text"].as_str()) else {
        return;
    };
    let job = {
        let mut a = ACTIVE.lock().unwrap_or_else(|e| e.into_inner());
        let Some(run) = a.get_mut(chat) else { return };
        let len = text.chars().count();
        if run.draft_id == 0 || len == run.draft_len || text.trim().is_empty() {
            return;
        }
        if run.draft_at.is_some_and(|t| t.elapsed().as_millis() < 800) {
            return;
        }
        run.draft_at = Some(Instant::now());
        run.draft_len = len;
        Some((run.key.clone(), run.draft_id))
    };
    let Some((key, draft_id)) = job else { return };
    // A draft holds up to 4096 characters: show the latest part of a long answer.
    let shown: String = if text.chars().count() > 3900 {
        let tail: String = text
            .chars()
            .rev()
            .take(3890)
            .collect::<Vec<_>>()
            .into_iter()
            .rev()
            .collect();
        format!("…{tail}")
    } else {
        text.to_string()
    };
    let app = app.clone();
    tauri::async_runtime::spawn(async move {
        let Ok(token) = secret("telegram") else { return };
        let Some(reply) = load_store().convs.get(&key).map(|c| c.reply.clone()) else {
            return;
        };
        if let Err(e) = adapters::telegram_draft(&token, &reply.to, draft_id, &shown).await {
            // Older clients or API errors: stop drafting for this run, the final message still comes.
            if let Ok(mut a) = ACTIVE.lock() {
                if let Some(run) = a.values_mut().find(|r| r.draft_id == draft_id) {
                    run.draft_id = 0;
                }
            }
            log(
                &app,
                "telegram",
                "error",
                &format!("Черновик ответа не обновлён: {e}"),
            );
        }
    });
}
fn on_progress(app: &tauri::AppHandle, payload: &str) {
    let Ok(v) = serde_json::from_str::<serde_json::Value>(payload) else {
        return;
    };
    let (Some(chat), Some(stage)) = (v["chatId"].as_str(), v["stage"].as_str()) else {
        return;
    };
    let send = {
        let mut a = ACTIVE.lock().unwrap_or_else(|e| e.into_inner());
        let Some(run) = a.get_mut(chat) else { return };
        if run.stage == stage {
            return;
        }
        run.stage = stage.chars().take(200).collect();
        let due = run.last_sent.map_or(true, |t| t.elapsed().as_secs() >= 20) && run.sent < 12;
        if due {
            run.last_sent = Some(Instant::now());
            run.sent += 1;
            Some((run.kind.clone(), run.key.clone(), run.stage.clone()))
        } else {
            None
        }
    };
    if let Some((kind, key, stage)) = send {
        let app = app.clone();
        tauri::async_runtime::spawn(async move {
            let Some(cfg) = load_configs()
                .ok()
                .and_then(|c| c.into_iter().find(|c| c.kind == kind))
                .filter(|c| c.notify_progress)
            else {
                return;
            };
            let Some(reply) = load_store().convs.get(&key).map(|c| c.reply.clone()) else {
                return;
            };
            say(&app, &cfg, &reply, &format!("… {stage}")).await;
        });
    }
}
fn on_permission(app: &tauri::AppHandle, payload: &str) {
    let Ok(v) = serde_json::from_str::<serde_json::Value>(payload) else {
        return;
    };
    let (Some(chat), Some(id)) = (v["chatId"].as_str(), v["id"].as_str()) else {
        return;
    };
    let Some((kind, key)) = ACTIVE
        .lock()
        .ok()
        .and_then(|a| a.get(chat).map(|r| (r.kind.clone(), r.key.clone())))
    else {
        return;
    };
    let code = {
        let mut c = CODES.lock().unwrap_or_else(|e| e.into_inner());
        let mut code = random_code();
        while c.contains_key(&code) {
            code = random_code()
        }
        c.insert(
            code.clone(),
            PendingPermission {
                chat: chat.into(),
                id: id.into(),
                key: key.clone(),
            },
        );
        code
    };
    let text=format!("🔐 Агент {} просит {}\n\nОтветьте /allow {code} или /deny {code} (действует 10 минут, разрешение однократное).",v["provider"].as_str().unwrap_or(""),summarize_permission(v["kind"].as_str().unwrap_or(""),&v["details"]));
    let app = app.clone();
    tauri::async_runtime::spawn(async move {
        let Some(cfg) = load_configs()
            .ok()
            .and_then(|c| c.into_iter().find(|c| c.kind == kind))
        else {
            return;
        };
        let Some(reply) = load_store().convs.get(&key).map(|c| c.reply.clone()) else {
            return;
        };
        say_buttons(
            &app,
            &cfg,
            &reply,
            &text,
            vec![vec![
                button("✅ Разрешить", format!("/allow {code}")),
                button("⛔ Запретить", format!("/deny {code}")),
            ]],
            false,
        )
        .await;
    });
}
fn on_question(app: &tauri::AppHandle, payload: &str) {
    let Ok(v) = serde_json::from_str::<serde_json::Value>(payload) else {
        return;
    };
    let Some(chat) = v["chatId"].as_str() else { return };
    let Some((kind, key)) = ACTIVE
        .lock()
        .ok()
        .and_then(|a| a.get(chat).map(|r| (r.kind.clone(), r.key.clone())))
    else {
        return;
    };
    let qs: Vec<String> = v["questions"]
        .as_array()
        .into_iter()
        .flatten()
        .filter_map(|q| q["question"].as_str().or(q["header"].as_str()).map(String::from))
        .take(4)
        .collect();
    let text = format!(
        "❓ Агент задаёт вопрос{}\n\nОтветить на него можно в приложении Nexus.",
        if qs.is_empty() {
            String::new()
        } else {
            format!(":\n{}", qs.join("\n"))
        }
    );
    let app = app.clone();
    tauri::async_runtime::spawn(async move {
        let Some(cfg) = load_configs()
            .ok()
            .and_then(|c| c.into_iter().find(|c| c.kind == kind))
        else {
            return;
        };
        let Some(reply) = load_store().convs.get(&key).map(|c| c.reply.clone()) else {
            return;
        };
        say(&app, &cfg, &reply, &text).await;
    });
}

async fn channel_loop(app: tauri::AppHandle, kind: &'static str) {
    let mut failures: u32 = 0;
    loop {
        let cfg = load_configs()
            .ok()
            .and_then(|c| c.into_iter().find(|c| c.kind == kind));
        let Some(cfg) = cfg.filter(|c| c.enabled) else {
            set_status(&app, kind, "off", "Выключен");
            tokio::time::sleep(Duration::from_secs(4)).await;
            continue;
        };
        let secret = match secret(kind) {
            Ok(s) => s,
            Err(e) => {
                set_status(&app, kind, "error", &e);
                tokio::time::sleep(Duration::from_secs(15)).await;
                continue;
            }
        };
        let cursor = load_store().cursors.get(kind).cloned();
        match adapters::poll(&cfg, &secret, cursor.as_deref()).await {
            Ok(p) => {
                failures = 0;
                // Re-check after the (possibly long) poll so a channel switched off meanwhile never executes anything.
                let still = load_configs()
                    .ok()
                    .and_then(|c| c.into_iter().find(|c| c.kind == kind))
                    .filter(|c| c.enabled);
                with_store(|s| {
                    s.cursors.insert(kind.into(), p.cursor.clone());
                });
                if cursor.is_none() {
                    log(
                        &app,
                        kind,
                        "info",
                        "Канал подключён: старые сообщения пропущены, ждём новые",
                    )
                }
                for n in &p.notes {
                    log(&app, kind, "info", n)
                }
                set_status(
                    &app,
                    kind,
                    "running",
                    if p.notes.is_empty() {
                        "Принимает задачи"
                    } else {
                        &p.notes[0]
                    },
                );
                if let Some(cfg) = still {
                    for m in p.messages {
                        handle(app.clone(), cfg.clone(), m).await
                    }
                }
            }
            Err(e) => {
                failures += 1;
                set_status(&app, kind, "error", &e);
                if failures == 1 || failures % 20 == 0 {
                    log(&app, kind, "error", &e)
                }
                tokio::time::sleep(Duration::from_secs((5 * failures as u64).min(120))).await;
                continue;
            }
        }
        tokio::time::sleep(Duration::from_secs(adapters::interval(kind))).await;
    }
}

/// Starts background polling and event forwarding once per app process.
pub fn start_bridge(app: &tauri::AppHandle) {
    if STARTED.swap(true, Ordering::SeqCst) {
        return;
    }
    let a = app.clone();
    app.listen_any("chat-progress", move |e| on_progress(&a, e.payload()));
    let a = app.clone();
    app.listen_any("chat-permission", move |e| on_permission(&a, e.payload()));
    app.listen_any("chat-permission-closed", |e| {
        if let Some(id) = serde_json::from_str::<serde_json::Value>(e.payload())
            .ok()
            .and_then(|v| v["id"].as_str().map(String::from))
        {
            if let Ok(mut c) = CODES.lock() {
                c.retain(|_, p| p.id != id);
            }
        }
    });
    let a = app.clone();
    app.listen_any("chat-text", move |e| on_text(&a, e.payload()));
    let a = app.clone();
    app.listen_any("chat-question", move |e| on_question(&a, e.payload()));
    for kind in POLLED {
        let a = app.clone();
        tauri::async_runtime::spawn(channel_loop(a, kind));
    }
    super::api_server::start(app);
    super::push_notify::start(app);
    super::background::apply();
}

fn validate(cfg: &mut Config) -> Result<(), String> {
    if !KINDS.contains(&cfg.kind.as_str()) {
        return Err("Неизвестный канал".into());
    }
    cfg.allowed = cfg
        .allowed
        .iter()
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
        .collect();
    cfg.allowed.dedup();
    if cfg.allowed.len() > 50
        || cfg
            .allowed
            .iter()
            .any(|s| s.len() > 200 || s.chars().any(|c| c.is_control()))
    {
        return Err("Список разрешённых: до 50 значений без переводов строк".into());
    }
    if cfg.enabled && POLLED.contains(&cfg.kind.as_str()) && cfg.allowed.is_empty() {
        return Err(
            "Добавьте хотя бы одного разрешённого отправителя: без списка канал не принимает задачи.".into(),
        );
    }
    cfg.repo = cfg.repo.trim().into();
    cfg.label = cfg.label.trim().into();
    cfg.push_server = cfg.push_server.trim().trim_end_matches('/').into();
    if cfg.kind == "push" {
        if !["remote", "all"].contains(&cfg.push_scope.as_str()) {
            cfg.push_scope = "remote".into()
        }
        if !cfg.push_server.is_empty() {
            let ok = tauri::Url::parse(&cfg.push_server).ok().is_some_and(|u| {
                u.scheme() == "https"
                    && u.host_str().is_some()
                    && u.username().is_empty()
                    && u.password().is_none()
                    && u.query().is_none()
            });
            if !ok {
                return Err("Сервер уведомлений: адрес https://… без логина и параметров".into());
            }
        }
        return Ok(());
    }
    if cfg.kind == "api" {
        if cfg.port < 1024 {
            cfg.port = 4719
        }
        return if cfg.enabled
            && !load_project_store()?
                .projects
                .iter()
                .any(|p| p.id == cfg.project_id && p.id != "nexus-system")
        {
            Err("Выберите проект для задач".into())
        } else {
            Ok(())
        };
    }
    cfg.channel_id = cfg.channel_id.trim().into();
    cfg.imap_host = cfg.imap_host.trim().into();
    cfg.smtp_host = cfg.smtp_host.trim().into();
    cfg.username = cfg.username.trim().into();
    cfg.from_address = cfg.from_address.trim().into();
    if [
        &cfg.channel_id,
        &cfg.username,
        &cfg.from_address,
        &cfg.repo,
        &cfg.label,
        &cfg.push_server,
    ]
    .iter()
    .any(|s| s.len() > 320 || s.chars().any(|c| c.is_control()))
    {
        return Err("Слишком длинное или некорректное значение".into());
    }
    if cfg.enabled {
        let db = load_project_store()?;
        if !db
            .projects
            .iter()
            .any(|p| p.id == cfg.project_id && p.id != "nexus-system")
        {
            return Err("Выберите проект для задач из канала".into());
        }
        match cfg.kind.as_str() {
            "discord" => {
                if cfg.channel_id.is_empty() || !cfg.channel_id.chars().all(|c| c.is_ascii_digit()) {
                    return Err("Укажите числовой ID канала Discord".into());
                }
            }
            "slack" => {
                if cfg.channel_id.is_empty()
                    || !cfg
                        .channel_id
                        .chars()
                        .all(|c| c.is_ascii_uppercase() || c.is_ascii_digit())
                {
                    return Err("Укажите ID канала Slack (C0123ABC)".into());
                }
            }
            "github" => {
                if cfg.repo.split('/').count() != 2 {
                    return Err("Укажите репозиторий в формате owner/name".into());
                }
            }
            "email" => {
                if !adapters::valid_host(&cfg.imap_host) || !adapters::valid_host(&cfg.smtp_host) {
                    return Err("Укажите серверы IMAP и SMTP".into());
                }
                if !cfg.username.contains('@') && !cfg.from_address.contains('@') {
                    return Err("Укажите адрес почты отправителя".into());
                }
            }
            _ => {}
        }
    }
    if cfg.kind != "email" {
        cfg.allow_unsigned = false
    }
    if cfg.kind == "plugin" {
        cfg.plugin_command = cfg.plugin_command.trim().into();
        cfg.plugin_args.retain(|a| !a.trim().is_empty());
        if cfg.enabled || !cfg.plugin_command.is_empty() {
            super::channel_plugin::validate(cfg)?;
        }
    } else {
        cfg.plugin_command.clear();
        cfg.plugin_args.clear();
    }
    Ok(())
}
fn view(cfg: Config) -> View {
    let needs = !["imessage", "api", "push"].contains(&cfg.kind.as_str());
    let has = !needs || provider_connections::secrets::get(&secret_id(&cfg.kind)).is_ok();
    let status = if cfg.kind == "push" {
        Some(Status {
            state: if cfg.enabled {
                "running".into()
            } else {
                "off".into()
            },
            detail: String::new(),
            at: 0,
        })
    } else {
        None
    }
    .or_else(|| STATUS.lock().ok().and_then(|s| s.get(&cfg.kind).cloned()))
    .unwrap_or(Status {
        state: if cfg.enabled {
            "starting".into()
        } else {
            "off".into()
        },
        detail: String::new(),
        at: 0,
    });
    View {
        config: cfg,
        has_secret: has,
        status,
        needs_secret: needs,
    }
}
#[tauri::command]
pub fn channels_list(app: tauri::AppHandle) -> Result<Vec<View>, String> {
    start_bridge(&app);
    let saved = load_configs()?;
    Ok(KINDS
        .iter()
        .map(|k| {
            saved.iter().find(|c| c.kind == *k).cloned().unwrap_or(Config {
                kind: (*k).into(),
                notify_progress: !["email", "github", "linear"].contains(k),
                imap_port: 993,
                smtp_port: 465,
                label: "nexus".into(),
                port: 4719,
                push_server: "https://ntfy.sh".into(),
                push_scope: "remote".into(),
                mac_notify: true,
                ..Default::default()
            })
        })
        .map(view)
        .collect())
}
#[tauri::command]
pub fn channels_save(app: tauri::AppHandle, config: Config, secret: Option<String>) -> Result<View, String> {
    let mut cfg = config;
    validate(&mut cfg)?;
    if let Some(s) = secret.map(|s| s.trim().to_string()).filter(|s| !s.is_empty()) {
        if s.len() > 4096 || s.chars().any(|c| c.is_control()) {
            return Err("Некорректный токен или пароль".into());
        }
        if cfg.kind == "imessage" {
            return Err("iMessage не использует токен".into());
        }
        if ["api", "push"].contains(&cfg.kind.as_str()) {
            return Err("Этот ключ создаёт Nexus".into());
        }
        provider_connections::secrets::set(&secret_id(&cfg.kind), &s)?;
    }
    if cfg.kind == "api" || cfg.kind == "push" {
        generated_secret(&cfg.kind, false)?;
    }
    if cfg.enabled
        && !["imessage", "plugin"].contains(&cfg.kind.as_str())
        && provider_connections::secrets::get(&secret_id(&cfg.kind)).is_err()
    {
        return Err(if cfg.kind == "email" {
            "Укажите пароль приложения почты".into()
        } else {
            "Укажите токен бота".into()
        });
    }
    let previous = {
        let _g = LOCK.lock();
        let mut all = load_configs()?;
        let prev = all.iter().find(|c| c.kind == cfg.kind).cloned();
        all.retain(|c| c.kind != cfg.kind);
        all.push(cfg.clone());
        write_json(&config_path(), &all)?;
        prev
    };
    // Turning a channel on (or pointing it elsewhere) skips history: only messages sent after this moment become tasks.
    let moved = previous.as_ref().map_or(true, |p| {
        !p.enabled
            || p.channel_id != cfg.channel_id
            || p.imap_host != cfg.imap_host
            || p.username != cfg.username
            || p.repo != cfg.repo
            || p.label != cfg.label
    });
    if cfg.enabled && moved {
        with_store(|s| {
            s.cursors.remove(&cfg.kind);
        });
    }
    if cfg.kind == "plugin" && !cfg.enabled {
        tauri::async_runtime::spawn(super::channel_plugin::stop());
    }
    start_bridge(&app);
    super::background::apply();
    log(
        &app,
        &cfg.kind,
        "info",
        if cfg.enabled {
            "Настройки сохранены, канал включён"
        } else {
            "Настройки сохранены, канал выключен"
        },
    );
    Ok(view(cfg))
}
#[tauri::command]
pub async fn channels_test(config: Config, secret: Option<String>) -> Result<String, String> {
    let mut cfg = config;
    let enabled = cfg.enabled;
    cfg.enabled = false;
    validate(&mut cfg)?;
    cfg.enabled = enabled;
    if cfg.kind == "api" {
        let token = generated_secret("api", false)?;
        return Ok(format!(
            "{} Адрес: {}/v1/status · токен {}…",
            if super::api_server::listening() {
                "Сервер запущен."
            } else {
                "Сервер не запущен: включите канал и сохраните."
            },
            super::api_server::base_url(&cfg),
            &token[..6]
        ));
    }
    if cfg.kind == "push" {
        let topic = generated_secret("push", false)?;
        return super::push_notify::send(
            &cfg,
            &topic,
            "Nexus",
            "Тестовое уведомление: всё настроено",
            "default",
        )
        .await
        .map(|_| format!("Отправлено в тему {topic}. Подпишитесь на неё в приложении ntfy."));
    }
    let s = match secret.map(|s| s.trim().to_string()).filter(|s| !s.is_empty()) {
        Some(s) => s,
        None => self::secret(&cfg.kind).map_err(|_| {
            if cfg.kind == "email" {
                "Укажите пароль приложения".to_string()
            } else {
                "Укажите токен бота".to_string()
            }
        })?,
    };
    adapters::test(&cfg, &s).await
}
#[tauri::command]
pub fn channels_remove(app: tauri::AppHandle, kind: String) -> Result<(), String> {
    if !KINDS.contains(&kind.as_str()) {
        return Err("Неизвестный канал".into());
    }
    {
        let _g = LOCK.lock();
        let mut all = load_configs()?;
        all.retain(|c| c.kind != kind);
        write_json(&config_path(), &all)?;
    }
    if kind == "plugin" {
        tauri::async_runtime::spawn(super::channel_plugin::stop());
        let _ = provider_connections::secrets::delete(&secret_id(&kind));
    } else if kind != "imessage" {
        provider_connections::secrets::delete(&secret_id(&kind))?;
    }
    if kind == "api" {
        if let Ok(mut o) = OUTBOX.lock() {
            o.clear();
        }
    }
    with_store(|s| {
        s.cursors.remove(&kind);
        s.convs.retain(|k, _| !k.starts_with(&format!("{kind}:")));
    });
    log(&app, &kind, "info", "Канал удалён, токен стёрт из связки ключей");
    Ok(())
}
#[tauri::command]
pub fn channels_secret(kind: String, regenerate: bool) -> Result<String, String> {
    generated_secret(&kind, regenerate)
}
#[tauri::command]
pub fn channels_log() -> Vec<Event> {
    LOG.lock()
        .map(|l| l.iter().cloned().collect())
        .unwrap_or_default()
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn commands_parse() {
        assert_eq!(parse("/status@NexusBot"), Cmd::Status);
        assert_eq!(parse("/стоп"), Cmd::Stop);
        assert_eq!(parse("/allow ab12"), Cmd::Allow("AB12".into()));
        assert_eq!(parse("Да"), Cmd::Allow(String::new()));
        assert_eq!(parse("/project 2"), Cmd::Project("2".into()));
        assert_eq!(parse("/project"), Cmd::Projects);
        assert_eq!(parse("/mode Execute"), Cmd::Mode("execute".into()));
        assert_eq!(parse("/mode"), Cmd::Mode("?".into()));
        assert_eq!(parse("⚙️ Режим"), Cmd::Mode("?".into()));
        assert_eq!(parse("📊 Статус"), Cmd::Status);
        assert_eq!(parse("/menu"), Cmd::Help);
        assert_eq!(
            parse("Почини тест\nв модуле"),
            Cmd::Task("Почини тест\nв модуле".into())
        );
        assert_eq!(parse("/unknown x"), Cmd::Task("/unknown x".into()));
        assert_eq!(parse("/task сделай"), Cmd::Task("сделай".into()));
    }
    #[test]
    fn allowlist_is_strict() {
        let mut c = Config {
            kind: "telegram".into(),
            allowed: vec!["42".into()],
            ..Default::default()
        };
        assert!(allowed(&c, "42"));
        assert!(!allowed(&c, "421"));
        assert!(!allowed(&c, ""));
        c.allowed.clear();
        assert!(!allowed(&c, "42"));
        let c = Config {
            kind: "imessage".into(),
            allowed: vec!["+7 999 123-45-67".into()],
            ..Default::default()
        };
        assert!(allowed(&c, "+79991234567"));
        let c = Config {
            kind: "email".into(),
            allowed: vec!["Me@X.ru".into()],
            ..Default::default()
        };
        assert!(allowed(&c, "me@x.ru"));
    }
    #[test]
    fn codes_are_random() {
        let a = random_code();
        let b = random_code();
        assert_eq!(a.len(), 6);
        assert_ne!(a, b);
        assert!(a.chars().all(|c| c.is_ascii_uppercase() || c.is_ascii_digit()));
        assert!(bare_answer_allowed("telegram") && bare_answer_allowed("api"));
        assert!(
            !bare_answer_allowed("email") && !bare_answer_allowed("github") && !bare_answer_allowed("linear")
        );
    }
    #[test]
    fn codes_are_short_and_stable() {
        let a = short_code("n1-2-3");
        assert_eq!(a.len(), 4);
        assert_eq!(a, short_code("n1-2-3"));
        assert_ne!(a, short_code("n1-2-4"));
        assert!(a.chars().all(|c| c.is_ascii_uppercase() || c.is_ascii_digit()));
    }
    #[test]
    fn permission_summary_is_bounded() {
        let s = summarize_permission(
            "item/commandExecution/requestApproval",
            &serde_json::json!({"command":"x".repeat(2000)}),
        );
        assert!(s.starts_with("выполнить команду"));
        assert!(s.chars().count() < 700);
        assert_eq!(
            summarize_permission("tool", &serde_json::json!({"tool_name":"Write"})),
            "вызвать инструмент:\nWrite"
        );
    }
    #[test]
    fn legacy_config_defaults() {
        let c: Config = serde_json::from_value(serde_json::json!({"kind":"slack"})).unwrap();
        assert!(!c.enabled && !c.allow_execute && c.allowed.is_empty());
        let s: Store = serde_json::from_value(serde_json::json!({})).unwrap();
        assert!(s.convs.is_empty());
    }
    #[test]
    fn validation_requires_allowlist_when_enabled() {
        let mut c = Config {
            kind: "telegram".into(),
            enabled: true,
            ..Default::default()
        };
        assert!(validate(&mut c).unwrap_err().contains("разрешённого"));
        let mut c = Config {
            kind: "fax".into(),
            ..Default::default()
        };
        assert!(validate(&mut c).is_err());
        let mut c = Config {
            kind: "slack".into(),
            allowed: vec![" U1 ".into(), "".into()],
            ..Default::default()
        };
        validate(&mut c).unwrap();
        assert_eq!(c.allowed, vec!["U1"]);
    }
}
