//! Messaging adapters for remote tasks. Secrets travel through curl's stdin config, never argv or logs.
//! HTTP bots: Telegram Bot API, Discord REST, Slack Web API. Email: IMAP/SMTP over TLS. iMessage: local chat.db + Messages AppleScript.
use super::remote_channels::{Config, Incoming, Reply};
use serde_json::{json, Value};
use std::process::Stdio;
use tokio::{io::AsyncWriteExt, process::Command};

pub const IMESSAGE_PREFIX: &str = "Nexus · ";

pub fn label(kind: &str) -> &'static str {
    match kind {
        "github" => "GitHub",
        "linear" => "Linear",
        "api" => "Команды",
        "push" => "Уведомления",
        "telegram" => "Telegram",
        "discord" => "Discord",
        "slack" => "Slack",
        "email" => "Email",
        "imessage" => "iMessage",
        _ => "Канал",
    }
}
/// Poll interval in seconds between requests (Telegram uses long polling instead).
pub fn interval(kind: &str) -> u64 {
    match kind {
        "github" => 20,
        "linear" => 20,
        "telegram" => 1,
        "discord" => 3,
        "slack" => 4,
        "email" => 30,
        _ => 3,
    }
}
/// Maximum characters of one outgoing message for the channel.
pub fn chunk_limit(kind: &str) -> usize {
    match kind {
        "api" => 100000,
        "telegram" => 3900,
        "discord" => 1900,
        "slack" => 3500,
        "imessage" => 1800,
        _ => 60000,
    }
}

fn quoted(value: &str) -> String {
    format!(
        "\"{}\"",
        value
            .replace('\\', "\\\\")
            .replace('"', "\\\"")
            .replace('\n', "\\n")
            .replace('\r', "\\r")
            .replace('\t', "\\t")
    )
}
fn safe_token(s: &str) -> bool {
    !s.is_empty() && s.len() <= 300 && s.chars().all(|c| c.is_ascii_alphanumeric() || "-_.:".contains(c))
}
fn digits(s: &str) -> bool {
    !s.is_empty() && s.len() <= 32 && s.chars().all(|c| c.is_ascii_digit())
}
fn slack_id(s: &str) -> bool {
    !s.is_empty() && s.len() <= 32 && s.chars().all(|c| c.is_ascii_uppercase() || c.is_ascii_digit())
}
pub fn valid_host(s: &str) -> bool {
    !s.is_empty()
        && s.len() <= 253
        && s.chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '.' || c == '-')
        && !s.starts_with('-')
        && !s.starts_with('.')
}

pub struct CurlOut {
    pub code: u16,
    pub body: String,
    pub ok: bool,
    pub error: String,
}
/// Runs /usr/bin/curl with the whole request (including credentials) in a stdin config file.
async fn curl(config: String, proto: &str, timeout: u64, extra: &[&str]) -> Result<CurlOut, String> {
    let mut c = crate::new_command(super::curl_path());
    c.args([
        "--silent",
        "--show-error",
        "--max-time",
        &timeout.to_string(),
        "--connect-timeout",
        "15",
        "--max-filesize",
        "8388608",
        "--proto",
        proto,
        "--write-out",
        "\nNEXUS_STATUS:%{response_code}",
    ])
    .args(extra)
    .args(["--config", "-"])
    .kill_on_drop(true)
    .stdin(Stdio::piped())
    .stdout(Stdio::piped())
    .stderr(Stdio::piped());
    let mut child = c.spawn().map_err(|_| "Не удалось запустить HTTP-клиент curl")?;
    child
        .stdin
        .take()
        .ok_or("Нет входного канала curl")?
        .write_all(config.as_bytes())
        .await
        .map_err(|_| "Ошибка передачи запроса curl")?;
    let out = tokio::time::timeout(
        std::time::Duration::from_secs(timeout + 10),
        child.wait_with_output(),
    )
    .await
    .map_err(|_| "Сеть не ответила вовремя")?
    .map_err(|_| "Ошибка сети")?;
    let text = String::from_utf8_lossy(&out.stdout).to_string();
    let (body, status) = text
        .rsplit_once("\nNEXUS_STATUS:")
        .map(|(a, b)| (a.to_string(), b.trim().to_string()))
        .unwrap_or((text.clone(), "0".into()));
    let error = String::from_utf8_lossy(&out.stderr)
        .lines()
        .last()
        .unwrap_or("")
        .chars()
        .take(240)
        .collect::<String>();
    Ok(CurlOut {
        code: status.parse().unwrap_or(0),
        body,
        ok: out.status.success(),
        error,
    })
}
async fn http(
    method: &str,
    url: &str,
    auth: Option<&str>,
    body: Option<&Value>,
    timeout: u64,
) -> Result<Value, String> {
    let mut cfg = format!("url = {}\nrequest = {}\n", quoted(url), quoted(method));
    if let Some(a) = auth {
        cfg.push_str(&format!("header = {}\n", quoted(&format!("Authorization: {a}"))))
    }
    if let Some(b) = body {
        cfg.push_str(&format!(
            "header = {}\ndata-binary = {}\n",
            quoted("Content-Type: application/json; charset=utf-8"),
            quoted(&b.to_string())
        ))
    }
    let out = curl(cfg, "=https", timeout, &[]).await?;
    if out.code == 429 {
        return Err("Сервис ограничил частоту запросов (HTTP 429). Nexus повторит позже.".into());
    }
    if out.code == 401 || out.code == 403 {
        return Err(format!(
            "Сервис отклонил токен или права бота (HTTP {}). Проверьте токен и доступ к каналу.",
            out.code
        ));
    }
    if out.code == 404 {
        return Err("Канал или бот не найден (HTTP 404). Проверьте ID канала.".into());
    }
    if out.code == 409 {
        return Err(
            "Конфликт получения обновлений (HTTP 409): у бота включён webhook или запущен другой опрос."
                .into(),
        );
    }
    if !out.ok && out.code == 0 {
        return Err(format!(
            "Нет соединения: {}",
            if out.error.is_empty() {
                "сервис недоступен"
            } else {
                &out.error
            }
        ));
    }
    if !(200..300).contains(&out.code) {
        return Err(format!("Сервис ответил ошибкой HTTP {}", out.code));
    }
    serde_json::from_str(&out.body).map_err(|_| "Сервис вернул неподдерживаемый ответ".into())
}

/// Splits text on paragraph/line boundaries into chunks of at most `limit` characters.
pub fn split(text: &str, limit: usize) -> Vec<String> {
    let mut parts = Vec::new();
    let mut cur = String::new();
    for line in text.split_inclusive('\n') {
        if cur.chars().count() + line.chars().count() > limit && !cur.is_empty() {
            parts.push(std::mem::take(&mut cur).trim_end().to_string());
        }
        if line.chars().count() > limit {
            let chars: Vec<char> = line.chars().collect();
            for c in chars.chunks(limit) {
                let s: String = c.iter().collect();
                if cur.chars().count() + s.chars().count() > limit && !cur.is_empty() {
                    parts.push(std::mem::take(&mut cur));
                }
                cur.push_str(&s);
            }
        } else {
            cur.push_str(line);
        }
    }
    if !cur.trim().is_empty() {
        parts.push(cur.trim_end().to_string())
    }
    parts.into_iter().filter(|p| !p.trim().is_empty()).collect()
}

// ---------- Telegram ----------
pub fn parse_telegram(v: &Value) -> (Vec<Incoming>, Option<i64>) {
    let mut max = None;
    let mut rows = Vec::new();
    for u in v["result"].as_array().into_iter().flatten() {
        let Some(id) = u["update_id"].as_i64() else {
            continue;
        };
        max = Some(max.map_or(id, |m: i64| m.max(id)));
        // A tap on an inline button arrives as a callback query; its data is the command it stands for.
        let q = &u["callback_query"];
        if let (Some(data), Some(from), Some(chat)) = (
            q["data"].as_str(),
            q["from"]["id"].as_i64(),
            q["message"]["chat"]["id"].as_i64(),
        ) {
            if q["from"]["is_bot"] != true {
                rows.push(Incoming {
                    conv: chat.to_string(),
                    sender: from.to_string(),
                    text: data.into(),
                    reply: Reply {
                        to: chat.to_string(),
                        thread: String::new(),
                        subject: String::new(),
                    },
                    display: q["from"]["username"]
                        .as_str()
                        .map(|s| format!("@{s}"))
                        .unwrap_or_default(),
                    callback: q["id"].as_str().unwrap_or_default().into(),
                    ..Default::default()
                });
            }
            continue;
        }
        let m = &u["message"];
        let (Some(text), Some(from), Some(chat)) = (
            m["text"].as_str(),
            m["from"]["id"].as_i64(),
            m["chat"]["id"].as_i64(),
        ) else {
            continue;
        };
        if m["from"]["is_bot"] == true {
            continue;
        }
        rows.push(Incoming {
            conv: chat.to_string(),
            sender: from.to_string(),
            text: text.into(),
            reply: Reply {
                to: chat.to_string(),
                thread: String::new(),
                subject: String::new(),
            },
            display: m["from"]["username"]
                .as_str()
                .map(|s| format!("@{s}"))
                .unwrap_or_default(),
            ..Default::default()
        });
    }
    (rows, max)
}
async fn telegram_poll(token: &str, cursor: Option<&str>) -> Result<(Vec<Incoming>, String), String> {
    if !safe_token(token) {
        return Err("Некорректный токен Telegram-бота".into());
    }
    let init = cursor.is_none();
    let url=format!("https://api.telegram.org/bot{token}/getUpdates?timeout={}&offset={}&allowed_updates=%5B%22message%22%2C%22callback_query%22%5D",if init{0}else{25},cursor.unwrap_or("-1"));
    let v = http("GET", &url, None, None, 40).await?;
    if v["ok"] != true {
        return Err(format!(
            "Telegram: {}",
            v["description"].as_str().unwrap_or("ошибка API")
        ));
    }
    let (rows, max) = parse_telegram(&v);
    for r in rows.iter().filter(|r| !r.callback.is_empty()) {
        let (token, id) = (token.to_string(), r.callback.clone());
        tauri::async_runtime::spawn(async move {
            let _ = http(
                "POST",
                &format!("https://api.telegram.org/bot{token}/answerCallbackQuery"),
                None,
                Some(&json!({"callback_query_id": id})),
                15,
            )
            .await;
        });
    }
    if init {
        // The bot's “/” menu and the menu button list the same commands as the keyboard.
        let _ = http(
            "POST",
            &format!("https://api.telegram.org/bot{token}/setMyCommands"),
            None,
            Some(&json!({"commands": TELEGRAM_COMMANDS
                .iter()
                .map(|(c, d)| json!({"command": c, "description": d}))
                .collect::<Vec<_>>()})),
            15,
        )
        .await;
    }
    let next = max
        .map(|m| (m + 1).to_string())
        .unwrap_or_else(|| cursor.unwrap_or("0").to_string());
    Ok((if init { vec![] } else { rows }, next))
}
pub const TELEGRAM_COMMANDS: &[(&str, &str)] = &[
    ("menu", "Меню с кнопками"),
    ("status", "Задачи проекта и текущий этап"),
    ("projects", "Выбрать проект"),
    ("agent", "Выбрать агента"),
    ("mode", "Обсуждение или выполнение"),
    ("new", "Следующая задача в новом чате"),
    ("stop", "Остановить текущую задачу"),
    ("continue", "Дописать остановленный ответ"),
    ("help", "Как работать с ботом"),
];
/// The persistent keyboard under the input field: its labels are mapped back to commands by `parse`.
pub const TELEGRAM_MENU: &[&[&str]] = &[
    &["📊 Статус", "📁 Проекты", "🤖 Агент"],
    &["⚙️ Режим", "🆕 Новый чат", "❓ Помощь"],
    &["⏹ Стоп", "▶️ Продолжить"],
];
/// Buttons on a message: rows of (label, command sent back when tapped).
pub type Buttons = Vec<Vec<(String, String)>>;
fn telegram_markup(buttons: &Buttons, menu: bool) -> Option<Value> {
    if !buttons.is_empty() {
        Some(json!({"inline_keyboard": buttons
            .iter()
            .map(|row| row
                .iter()
                .map(|(label, data)| json!({"text": label, "callback_data": data.chars().take(60).collect::<String>()}))
                .collect::<Vec<_>>())
            .collect::<Vec<_>>()}))
    } else if menu {
        Some(json!({"keyboard": TELEGRAM_MENU
            .iter()
            .map(|row| row.iter().map(|l| json!({"text": l})).collect::<Vec<_>>())
            .collect::<Vec<_>>(),
            "resize_keyboard": true, "is_persistent": true,
            "input_field_placeholder": "Опишите задачу или выберите действие"}))
    } else {
        None
    }
}
/// Bot API 9.5: shows a live draft bubble in a private chat while the answer is being written.
/// The same `draft_id` updates the same bubble; it disappears when the final message is sent.
pub async fn telegram_draft(token: &str, chat: &str, draft_id: i64, text: &str) -> Result<(), String> {
    if !safe_token(token) || !chat.parse::<i64>().map(|c| c > 0).unwrap_or(false) || draft_id == 0 {
        return Err("Черновик доступен только в личном чате".into());
    }
    let v = http(
        "POST",
        &format!("https://api.telegram.org/bot{token}/sendMessageDraft"),
        None,
        Some(&json!({"chat_id": chat, "draft_id": draft_id, "text": text})),
        15,
    )
    .await?;
    if v["ok"] == true {
        Ok(())
    } else {
        Err(v["description"].as_str().unwrap_or("черновик не обновлён").into())
    }
}
async fn telegram_send(token: &str, reply: &Reply, text: &str) -> Result<(), String> {
    telegram_send_with(token, reply, text, None).await
}
async fn telegram_send_with(
    token: &str,
    reply: &Reply,
    text: &str,
    markup: Option<Value>,
) -> Result<(), String> {
    if !safe_token(token) {
        return Err("Некорректный токен Telegram-бота".into());
    }
    let mut body = json!({"chat_id":reply.to,"text":text,"disable_web_page_preview":true});
    if let Some(m) = markup {
        body["reply_markup"] = m;
    }
    let v = http(
        "POST",
        &format!("https://api.telegram.org/bot{token}/sendMessage"),
        None,
        Some(&body),
        30,
    )
    .await?;
    if v["ok"] == true {
        Ok(())
    } else {
        Err(format!(
            "Telegram: {}",
            v["description"].as_str().unwrap_or("сообщение не отправлено")
        ))
    }
}

// ---------- Discord ----------
pub fn parse_discord(v: &Value, channel: &str) -> (Vec<Incoming>, Option<u64>, bool) {
    let mut rows: Vec<(u64, Incoming)> = Vec::new();
    let mut max = None;
    let mut empty = false;
    for m in v.as_array().into_iter().flatten() {
        let Some(id) = m["id"].as_str().and_then(|s| s.parse::<u64>().ok()) else {
            continue;
        };
        max = Some(max.map_or(id, |x: u64| x.max(id)));
        if m["author"]["bot"] == true || m["webhook_id"].is_string() {
            continue;
        }
        if !matches!(m["type"].as_i64(), Some(0) | Some(19)) {
            continue;
        }
        let Some(author) = m["author"]["id"].as_str() else {
            continue;
        };
        let text = m["content"].as_str().unwrap_or("");
        if text.trim().is_empty() {
            empty = true;
            continue;
        }
        rows.push((
            id,
            Incoming {
                conv: format!("{channel}:{author}"),
                sender: author.into(),
                text: text.into(),
                reply: Reply {
                    to: channel.into(),
                    thread: id.to_string(),
                    subject: String::new(),
                },
                display: m["author"]["username"].as_str().unwrap_or("").into(),
                ..Default::default()
            },
        ));
    }
    rows.sort_by_key(|r| r.0);
    (rows.into_iter().map(|r| r.1).collect(), max, empty)
}
async fn discord_poll(
    token: &str,
    channel: &str,
    cursor: Option<&str>,
) -> Result<(Vec<Incoming>, String, bool), String> {
    if !safe_token(token) {
        return Err("Некорректный токен Discord-бота".into());
    }
    if !digits(channel) {
        return Err("ID канала Discord — число (включите режим разработчика → «Копировать ID»)".into());
    }
    let url = match cursor {
        Some(c) if digits(c) => {
            format!("https://discord.com/api/v10/channels/{channel}/messages?limit=50&after={c}")
        }
        _ => format!("https://discord.com/api/v10/channels/{channel}/messages?limit=1"),
    };
    let v = http("GET", &url, Some(&format!("Bot {token}")), None, 30).await?;
    let (rows, max, empty) = parse_discord(&v, channel);
    let next = max
        .map(|m| m.to_string())
        .unwrap_or_else(|| cursor.unwrap_or("0").to_string());
    Ok((if cursor.is_none() { vec![] } else { rows }, next, empty))
}
async fn discord_send(token: &str, reply: &Reply, text: &str, first: bool) -> Result<(), String> {
    if !safe_token(token) || !digits(&reply.to) {
        return Err("Некорректные данные Discord".into());
    }
    let mut body = json!({"content":text,"allowed_mentions":{"parse":[]}});
    if first && digits(&reply.thread) {
        body["message_reference"] = json!({"message_id":reply.thread,"fail_if_not_exists":false});
    }
    http(
        "POST",
        &format!("https://discord.com/api/v10/channels/{}/messages", reply.to),
        Some(&format!("Bot {token}")),
        Some(&body),
        30,
    )
    .await
    .map(|_| ())
}

// ---------- Slack ----------
fn slack_text(s: &str) -> String {
    s.replace("&lt;", "<").replace("&gt;", ">").replace("&amp;", "&")
}
fn ts_value(s: &str) -> f64 {
    s.parse().unwrap_or(0.0)
}
pub fn parse_slack(v: &Value, channel: &str) -> (Vec<Incoming>, Option<String>) {
    let mut rows: Vec<(f64, Incoming)> = Vec::new();
    let mut max: Option<String> = None;
    for m in v["messages"].as_array().into_iter().flatten() {
        let Some(ts) = m["ts"].as_str() else { continue };
        if max.as_deref().map_or(true, |x| ts_value(ts) > ts_value(x)) {
            max = Some(ts.into())
        }
        if m["bot_id"].is_string() || m["subtype"].is_string() {
            continue;
        }
        let (Some(user), Some(text)) = (m["user"].as_str(), m["text"].as_str()) else {
            continue;
        };
        if text.trim().is_empty() {
            continue;
        }
        let thread = m["thread_ts"].as_str().unwrap_or(ts).to_string();
        rows.push((
            ts_value(ts),
            Incoming {
                conv: format!("{channel}:{user}"),
                sender: user.into(),
                text: slack_text(text),
                reply: Reply {
                    to: channel.into(),
                    thread,
                    subject: String::new(),
                },
                display: String::new(),
                ..Default::default()
            },
        ));
    }
    rows.sort_by(|a, b| a.0.partial_cmp(&b.0).unwrap_or(std::cmp::Ordering::Equal));
    (rows.into_iter().map(|r| r.1).collect(), max)
}
fn slack_ok(v: &Value) -> Result<(), String> {
    if v["ok"] == true {
        Ok(())
    } else {
        Err(match v["error"].as_str().unwrap_or("ошибка API") {
            "not_in_channel" => "Slack: бот не добавлен в канал. Пригласите его: /invite @бот".to_string(),
            "channel_not_found" => "Slack: канал не найден, проверьте ID (C…/D…)".into(),
            "invalid_auth" | "not_authed" => "Slack: токен бота недействителен".into(),
            "missing_scope" => format!(
                "Slack: у бота нет нужного права ({})",
                v["needed"].as_str().unwrap_or("channels:history")
            ),
            "ratelimited" => "Slack ограничил запросы, Nexus повторит позже".into(),
            e => format!("Slack: {e}"),
        })
    }
}
async fn slack_poll(
    token: &str,
    channel: &str,
    cursor: Option<&str>,
) -> Result<(Vec<Incoming>, String), String> {
    if !token.starts_with("xoxb-") || !safe_token(token) {
        return Err("Нужен Bot User OAuth Token (xoxb-…)".into());
    }
    if !slack_id(channel) {
        return Err("ID канала Slack вида C0123ABC".into());
    }
    let valid_cursor = cursor.filter(|c| !c.is_empty() && c.chars().all(|x| x.is_ascii_digit() || x == '.'));
    let url=match valid_cursor{Some(c)=>format!("https://slack.com/api/conversations.history?channel={channel}&limit=50&oldest={c}&inclusive=false"),None=>format!("https://slack.com/api/conversations.history?channel={channel}&limit=1")};
    let v = http("GET", &url, Some(&format!("Bearer {token}")), None, 30).await?;
    slack_ok(&v)?;
    let (rows, max) = parse_slack(&v, channel);
    let next = max.unwrap_or_else(|| valid_cursor.unwrap_or("0").to_string());
    Ok((if valid_cursor.is_none() { vec![] } else { rows }, next))
}
async fn slack_send(token: &str, reply: &Reply, text: &str) -> Result<(), String> {
    let mut body = json!({"channel":reply.to,"text":text,"unfurl_links":false,"unfurl_media":false});
    if !reply.thread.is_empty() {
        body["thread_ts"] = json!(reply.thread)
    }
    let v = http(
        "POST",
        "https://slack.com/api/chat.postMessage",
        Some(&format!("Bearer {token}")),
        Some(&body),
        30,
    )
    .await?;
    slack_ok(&v)
}

// ---------- Email ----------
fn imap_url(cfg: &Config, path: &str) -> Result<(String, Vec<&'static str>), String> {
    if !valid_host(&cfg.imap_host) {
        return Err("Укажите сервер IMAP, например imap.gmail.com".into());
    }
    let port = if cfg.imap_port == 0 { 993 } else { cfg.imap_port };
    Ok(if port == 993 {
        (format!("imaps://{}:{port}/{path}", cfg.imap_host), vec![])
    } else {
        (
            format!("imap://{}:{port}/{path}", cfg.imap_host),
            vec!["--ssl-reqd"],
        )
    })
}
fn login_line(cfg: &Config, password: &str) -> Result<String, String> {
    if cfg.username.trim().is_empty() || cfg.username.contains(['\n', '\r']) || password.is_empty() {
        return Err("Укажите логин и пароль приложения".into());
    }
    Ok(format!(
        "user = {}\n",
        quoted(&format!("{}:{}", cfg.username.trim(), password))
    ))
}
async fn imap(cfg: &Config, password: &str, path: &str, request: Option<&str>) -> Result<String, String> {
    let (url, extra) = imap_url(cfg, path)?;
    let mut c = format!("url = {}\n{}", quoted(&url), login_line(cfg, password)?);
    if let Some(r) = request {
        c.push_str(&format!("request = {}\n", quoted(r)))
    }
    let out = curl(c, "=imap,imaps", 60, &extra).await?;
    if !out.ok {
        return Err(
            if out.error.to_lowercase().contains("login") || out.code == 0 && out.error.contains("denied") {
                "IMAP отклонил вход. Для Gmail/iCloud/Яндекса нужен пароль приложения.".into()
            } else {
                format!(
                    "IMAP: {}",
                    if out.error.is_empty() {
                        "ошибка соединения"
                    } else {
                        &out.error
                    }
                )
            },
        );
    }
    Ok(out.body)
}
pub fn parse_search(s: &str) -> Vec<u64> {
    s.lines()
        .filter_map(|l| l.trim().strip_prefix("* SEARCH"))
        .flat_map(|l| {
            l.split_whitespace()
                .filter_map(|n| n.parse().ok())
                .collect::<Vec<u64>>()
        })
        .collect()
}

fn unfold_headers(raw: &str) -> (Vec<(String, String)>, String) {
    let raw = raw.replace("\r\n", "\n");
    let (head, body) = raw
        .split_once("\n\n")
        .map(|(a, b)| (a.to_string(), b.to_string()))
        .unwrap_or((raw.clone(), String::new()));
    let mut out: Vec<(String, String)> = Vec::new();
    for line in head.lines() {
        if line.starts_with(' ') || line.starts_with('\t') {
            if let Some(last) = out.last_mut() {
                last.1.push(' ');
                last.1.push_str(line.trim());
            }
        } else if let Some((k, v)) = line.split_once(':') {
            out.push((k.trim().to_ascii_lowercase(), v.trim().to_string()));
        }
    }
    (out, body)
}
fn header<'a>(h: &'a [(String, String)], name: &str) -> Option<&'a str> {
    h.iter().find(|(k, _)| k == name).map(|(_, v)| v.as_str())
}
fn param(value: &str, name: &str) -> Option<String> {
    value.split(';').skip(1).find_map(|p| {
        let (k, v) = p.trim().split_once('=')?;
        (k.trim().eq_ignore_ascii_case(name)).then(|| v.trim().trim_matches('"').to_string())
    })
}
pub fn decode_qp(s: &str) -> Vec<u8> {
    let b = s.as_bytes();
    let mut out = Vec::new();
    let mut i = 0;
    while i < b.len() {
        if b[i] == b'=' {
            if i + 1 < b.len() && b[i + 1] == b'\n' {
                i += 2;
                continue;
            }
            if i + 2 < b.len() && b[i + 1] == b'\r' && b[i + 2] == b'\n' {
                i += 3;
                continue;
            }
            if i + 2 < b.len() {
                if let Ok(v) = u8::from_str_radix(&s[i + 1..i + 3], 16) {
                    out.push(v);
                    i += 3;
                    continue;
                }
            }
        }
        out.push(b[i]);
        i += 1;
    }
    out
}
fn decode_body(body: &str, encoding: &str) -> String {
    use base64::Engine;
    match encoding.to_ascii_lowercase().as_str() {
        "base64" => base64::engine::general_purpose::STANDARD
            .decode(body.split_whitespace().collect::<String>())
            .map(|b| String::from_utf8_lossy(&b).into_owned())
            .unwrap_or_default(),
        "quoted-printable" => String::from_utf8_lossy(&decode_qp(body)).into_owned(),
        _ => body.to_string(),
    }
}
/// Decodes RFC 2047 encoded words (UTF-8 B/Q) in headers.
pub fn decode_words(s: &str) -> String {
    use base64::Engine;
    let mut out = String::new();
    let mut rest = s;
    while let Some(start) = rest.find("=?") {
        let after = &rest[start + 2..];
        let parts: Vec<&str> = after.splitn(3, '?').collect();
        if parts.len() < 3 {
            break;
        }
        let Some(end) = parts[2].find("?=") else { break };
        let between = &rest[..start];
        if !(out.ends_with("?=") && between.trim().is_empty()) {
            out.push_str(between)
        }
        let data = &parts[2][..end];
        let bytes = match parts[1].to_ascii_uppercase().as_str() {
            "B" => base64::engine::general_purpose::STANDARD
                .decode(data)
                .unwrap_or_default(),
            _ => decode_qp(&data.replace('_', " ")),
        };
        out.push_str(&String::from_utf8_lossy(&bytes));
        out.push_str("?=");
        rest = &parts[2][end + 2..];
    }
    out.push_str(rest);
    out.replace("?=", "")
}
fn text_part(headers: &[(String, String)], body: &str, depth: u8) -> Option<String> {
    let ctype = header(headers, "content-type").unwrap_or("text/plain");
    let lower = ctype.to_ascii_lowercase();
    if lower.starts_with("multipart/") && depth < 4 {
        let boundary = param(ctype, "boundary")?;
        let marker = format!("--{boundary}");
        let mut html = None;
        for part in body.split(&marker).skip(1) {
            if part.starts_with("--") {
                break;
            }
            let (h, b) = unfold_headers(part.trim_start_matches(['\r', '\n']));
            let pt = header(&h, "content-type")
                .unwrap_or("text/plain")
                .to_ascii_lowercase();
            if pt.starts_with("text/plain") || pt.starts_with("multipart/") {
                if let Some(t) = text_part(&h, &b, depth + 1) {
                    return Some(t);
                }
            } else if pt.starts_with("text/html") && html.is_none() {
                html = Some(strip_html(&decode_body(
                    &b,
                    header(&h, "content-transfer-encoding").unwrap_or(""),
                )))
            }
        }
        return html;
    }
    if lower.starts_with("text/plain") {
        return Some(decode_body(
            body,
            header(headers, "content-transfer-encoding").unwrap_or(""),
        ));
    }
    if lower.starts_with("text/html") {
        return Some(strip_html(&decode_body(
            body,
            header(headers, "content-transfer-encoding").unwrap_or(""),
        )));
    }
    None
}
fn strip_html(s: &str) -> String {
    let mut out = String::new();
    let mut tag = false;
    for c in s
        .replace("<br>", "\n")
        .replace("<br/>", "\n")
        .replace("</p>", "\n")
        .chars()
    {
        match c {
            '<' => tag = true,
            '>' => tag = false,
            _ if !tag => out.push(c),
            _ => {}
        }
    }
    out.replace("&nbsp;", " ")
        .replace("&lt;", "<")
        .replace("&gt;", ">")
        .replace("&amp;", "&")
}
/// Drops quoted history so only the new request is executed.
pub fn strip_quoted(s: &str) -> String {
    let mut out = Vec::new();
    let normalized = s.replace("\r\n", "\n");
    for line in normalized.lines() {
        let t = line.trim();
        if t.starts_with('>')
            || line == "-- "
            || t.starts_with("-----Original Message")
            || (t.starts_with("On ") && t.ends_with("wrote:"))
            || (t.contains(" пишет") && t.ends_with(':'))
            || (t.contains("написал") && t.ends_with(':'))
        {
            break;
        }
        out.push(line)
    }
    out.join("\n").trim().to_string()
}
pub fn address(from: &str) -> String {
    let f = from.trim();
    let a = if let (Some(s), Some(e)) = (f.rfind('<'), f.rfind('>')) {
        &f[s + 1..e]
    } else {
        f
    };
    a.trim().to_ascii_lowercase()
}
pub struct Mail {
    pub from: String,
    pub subject: String,
    pub message_id: String,
    pub text: String,
    pub authenticated: bool,
    pub own_reply: bool,
}
/// The top Authentication-Results header (added by our own mail server) must show DMARC pass, or a DKIM pass
/// whose signing domain matches the From domain. A bare `dkim=pass` is not enough: any domain can sign a
/// message that claims to be From the owner.
pub fn mail_authenticated(auth: &str, from: &str) -> bool {
    let auth = auth.to_ascii_lowercase();
    let Some(domain) = from
        .rsplit_once('@')
        .map(|(_, d)| d.trim().trim_end_matches('>').to_string())
        .filter(|d| !d.is_empty())
    else {
        return false;
    };
    let aligned = |d: &str| {
        let d = d
            .trim()
            .trim_start_matches('@')
            .trim_end_matches(|c: char| c == ';' || c == ')' || c == ',');
        d.contains('.')
            && (domain == d || domain.ends_with(&format!(".{d}")) || d.ends_with(&format!(".{domain}")))
    };
    auth.split(';').any(|part| {
        let p = part.trim();
        if p.starts_with("dmarc=pass") {
            return p
                .split_whitespace()
                .find_map(|w| w.strip_prefix("header.from="))
                .map(aligned)
                .unwrap_or(true);
        }
        if p.starts_with("dkim=pass") {
            return p
                .split_whitespace()
                .find_map(|w| {
                    w.strip_prefix("header.d=").or_else(|| {
                        w.strip_prefix("header.i=")
                            .map(|i| i.rsplit('@').next().unwrap_or(i))
                    })
                })
                .map(aligned)
                .unwrap_or(false);
        }
        false
    })
}
pub fn parse_mail(raw: &str) -> Mail {
    let (h, body) = unfold_headers(raw);
    let auth = header(&h, "authentication-results")
        .unwrap_or("")
        .to_ascii_lowercase();
    Mail {
        from: address(&decode_words(header(&h, "from").unwrap_or(""))),
        subject: decode_words(header(&h, "subject").unwrap_or("")),
        message_id: header(&h, "message-id")
            .unwrap_or("")
            .chars()
            .filter(|c| !c.is_control())
            .take(300)
            .collect(),
        text: strip_quoted(&text_part(&h, &body, 0).unwrap_or_default()),
        authenticated: mail_authenticated(&auth, &address(&decode_words(header(&h, "from").unwrap_or("")))),
        own_reply: header(&h, "x-nexus-reply").is_some(),
    }
}
async fn email_poll(
    cfg: &Config,
    password: &str,
    cursor: Option<&str>,
) -> Result<(Vec<Incoming>, String, Vec<String>), String> {
    let last = cursor.and_then(|c| c.parse::<u64>().ok());
    let Some(last) = last else {
        let all = parse_search(&imap(cfg, password, "INBOX", Some("UID SEARCH ALL")).await?);
        return Ok((vec![], all.into_iter().max().unwrap_or(0).to_string(), vec![]));
    };
    let uids: Vec<u64> = parse_search(
        &imap(
            cfg,
            password,
            "INBOX",
            Some(&format!("UID SEARCH UID {}:*", last + 1)),
        )
        .await?,
    )
    .into_iter()
    .filter(|u| *u > last)
    .take(20)
    .collect();
    let mut rows = Vec::new();
    let mut skipped = Vec::new();
    let mut max = last;
    for uid in uids {
        max = max.max(uid);
        let raw = imap(cfg, password, &format!("INBOX;UID={uid}"), None).await?;
        let m = parse_mail(&raw);
        if m.own_reply {
            continue;
        }
        if !m.authenticated && !cfg.allow_unsigned {
            skipped.push(format!(
                "{}: письмо без подтверждённой подписи DKIM/DMARC пропущено",
                m.from
            ));
            continue;
        }
        let text = if m.text.trim().is_empty() {
            m.subject.clone()
        } else {
            m.text.clone()
        };
        if text.trim().is_empty() {
            continue;
        }
        let subject = if m.subject.to_ascii_lowercase().starts_with("re:") {
            m.subject.clone()
        } else {
            format!("Re: {}", if m.subject.is_empty() { "Nexus" } else { &m.subject })
        };
        rows.push(Incoming {
            conv: m.from.clone(),
            sender: m.from.clone(),
            text,
            reply: Reply {
                to: m.from,
                thread: m.message_id,
                subject,
            },
            display: String::new(),
            ..Default::default()
        });
    }
    Ok((rows, max.to_string(), skipped))
}
fn civil(days: i64) -> (i64, u32, u32) {
    let z = days + 719468;
    let era = z.div_euclid(146097);
    let doe = z - era * 146097;
    let yoe = (doe - doe / 1460 + doe / 36524 - doe / 146096) / 365;
    let y = yoe + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = (doy - (153 * mp + 2) / 5 + 1) as u32;
    let m = if mp < 10 { mp + 3 } else { mp - 9 } as u32;
    (if m <= 2 { y + 1 } else { y }, m, d)
}
pub fn rfc2822(secs: i64) -> String {
    let days = secs.div_euclid(86400);
    let rem = secs.rem_euclid(86400);
    let (y, m, d) = civil(days);
    let wd = ["Thu", "Fri", "Sat", "Sun", "Mon", "Tue", "Wed"][days.rem_euclid(7) as usize];
    let mn = [
        "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
    ][(m - 1) as usize];
    format!(
        "{wd}, {d:02} {mn} {y} {:02}:{:02}:{:02} +0000",
        rem / 3600,
        rem % 3600 / 60,
        rem % 60
    )
}
pub fn build_mail(from: &str, to: &str, subject: &str, in_reply_to: &str, text: &str, now: i64) -> String {
    use base64::Engine;
    let b64 = |s: &str| base64::engine::general_purpose::STANDARD.encode(s.as_bytes());
    let clean = |s: &str| s.chars().filter(|c| !c.is_control()).collect::<String>();
    let body = b64(text);
    let wrapped = body
        .as_bytes()
        .chunks(76)
        .map(|c| String::from_utf8_lossy(c).into_owned())
        .collect::<Vec<_>>()
        .join("\r\n");
    let mut m=format!("From: {}\r\nTo: {}\r\nSubject: =?UTF-8?B?{}?=\r\nDate: {}\r\nMIME-Version: 1.0\r\nContent-Type: text/plain; charset=utf-8\r\nContent-Transfer-Encoding: base64\r\nX-Nexus-Reply: 1\r\nAuto-Submitted: auto-replied\r\n",clean(from),clean(to),b64(&clean(subject)),rfc2822(now));
    if !in_reply_to.is_empty() {
        m.push_str(&format!(
            "In-Reply-To: {0}\r\nReferences: {0}\r\n",
            clean(in_reply_to)
        ))
    }
    m.push_str("\r\n");
    m.push_str(&wrapped);
    m.push_str("\r\n");
    m
}
async fn email_send(cfg: &Config, password: &str, reply: &Reply, text: &str) -> Result<(), String> {
    if !valid_host(&cfg.smtp_host) {
        return Err("Укажите сервер SMTP, например smtp.gmail.com".into());
    }
    let from = if cfg.from_address.trim().is_empty() {
        cfg.username.trim()
    } else {
        cfg.from_address.trim()
    };
    if !from.contains('@') || !reply.to.contains('@') || reply.to.contains(['\n', '\r', '<', '>']) {
        return Err("Некорректный адрес отправителя или получателя".into());
    }
    let port = if cfg.smtp_port == 0 { 465 } else { cfg.smtp_port };
    let (url, extra) = if port == 465 {
        (format!("smtps://{}:{port}", cfg.smtp_host), vec![])
    } else {
        (format!("smtp://{}:{port}", cfg.smtp_host), vec!["--ssl-reqd"])
    };
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0);
    let path = std::env::temp_dir().join(format!("nexus-mail-{}.eml", super::project_id()));
    {
        use std::io::Write;
        let mut opts = std::fs::OpenOptions::new();
        opts.write(true).create_new(true);
        #[cfg(unix)]
        {
            use std::os::unix::fs::OpenOptionsExt;
            opts.mode(0o600);
        }
        let mut f = opts.open(&path).map_err(|_| "Не удалось подготовить письмо")?;
        f.write_all(build_mail(from, &reply.to, &reply.subject, &reply.thread, text, now).as_bytes())
            .map_err(|_| "Не удалось подготовить письмо")?;
    }
    let cfgtext = format!(
        "url = {}\n{}mail-from = {}\nmail-rcpt = {}\nupload-file = {}\n",
        quoted(&url),
        login_line(cfg, password)?,
        quoted(from),
        quoted(&reply.to),
        quoted(&path.to_string_lossy())
    );
    let out = curl(cfgtext, "=smtp,smtps", 60, &extra).await;
    let _ = std::fs::remove_file(&path);
    let out = out?;
    if out.ok {
        Ok(())
    } else {
        Err(format!(
            "SMTP: {}",
            if out.error.is_empty() {
                "письмо не отправлено"
            } else {
                &out.error
            }
        ))
    }
}

// ---------- iMessage ----------
fn chat_db() -> std::path::PathBuf {
    super::home().join("Library/Messages/chat.db")
}
pub fn normalize_handle(s: &str) -> String {
    let t = s.trim().to_lowercase();
    if t.contains('@') {
        t
    } else {
        t.chars().filter(|c| c.is_ascii_digit() || *c == '+').collect()
    }
}
/// Extracts plain text from the NSAttributedString typedstream in `message.attributedBody`.
pub fn attributed_text(hex: &str) -> Option<String> {
    let bytes: Vec<u8> = (0..hex.len() / 2)
        .filter_map(|i| u8::from_str_radix(hex.get(i * 2..i * 2 + 2)?, 16).ok())
        .collect();
    let pos = bytes.windows(8).position(|w| w == b"NSString")?;
    let mut i = pos + 8;
    let end = (i + 16).min(bytes.len());
    while i < end && bytes[i] != 0x2b {
        i += 1
    }
    if i >= end {
        return None;
    }
    i += 1;
    let (len, skip) = match *bytes.get(i)? {
        0x81 => (
            u16::from_le_bytes([*bytes.get(i + 1)?, *bytes.get(i + 2)?]) as usize,
            3,
        ),
        0x82 => (
            u32::from_le_bytes([
                *bytes.get(i + 1)?,
                *bytes.get(i + 2)?,
                *bytes.get(i + 3)?,
                *bytes.get(i + 4)?,
            ]) as usize,
            5,
        ),
        n => (n as usize, 1),
    };
    let start = i + skip;
    let text = bytes.get(start..start + len)?;
    Some(String::from_utf8_lossy(text).into_owned())
}
async fn sqlite(query: &str) -> Result<Value, String> {
    let db = chat_db();
    let out = tokio::time::timeout(
        std::time::Duration::from_secs(20),
        crate::new_command("/usr/bin/sqlite3")
            .arg("-readonly")
            .arg("-json")
            .arg(&db)
            .arg(query)
            .kill_on_drop(true)
            .stdin(Stdio::null())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .output(),
    )
    .await
    .map_err(|_| "База сообщений не ответила вовремя")?
    .map_err(|_| "Не удалось запустить sqlite3")?;
    if !out.status.success() {
        let e = String::from_utf8_lossy(&out.stderr).to_lowercase();
        return Err(
            if e.contains("authorization denied")
                || e.contains("unable to open")
                || e.contains("not permitted")
            {
                "Нет доступа к сообщениям. Откройте «Системные настройки → Конфиденциальность и безопасность → Полный доступ к диску» и включите NEXUS, затем перезапустите Nexus.".into()
            } else {
                format!(
                    "Ошибка чтения базы сообщений: {}",
                    e.chars().take(200).collect::<String>()
                )
            },
        );
    }
    let s = String::from_utf8_lossy(&out.stdout);
    if s.trim().is_empty() {
        return Ok(json!([]));
    }
    serde_json::from_str(&s).map_err(|_| "Неожиданный формат базы сообщений".into())
}
pub fn parse_imessage(rows: &Value, cfg: &Config) -> (Vec<Incoming>, Option<i64>) {
    let allowed: Vec<String> = cfg.allowed.iter().map(|a| normalize_handle(a)).collect();
    let mut out = Vec::new();
    let mut max = None;
    for r in rows.as_array().into_iter().flatten() {
        let Some(id) = r["id"].as_i64() else { continue };
        max = Some(max.map_or(id, |m: i64| m.max(id)));
        if r["style"].as_i64().is_some_and(|s| s != 45) {
            continue;
        }
        let text = r["text"]
            .as_str()
            .filter(|t| !t.trim().is_empty())
            .map(String::from)
            .or_else(|| r["body"].as_str().and_then(attributed_text))
            .unwrap_or_default();
        let text = text.replace('\u{fffc}', "").trim().to_string();
        if text.is_empty() || text.starts_with(IMESSAGE_PREFIX.trim()) {
            continue;
        }
        let me = r["me"].as_i64() == Some(1);
        let handle = r["handle"].as_str().unwrap_or("");
        let chat_ident = r["chatIdentifier"].as_str().unwrap_or(handle);
        let who = if me {
            if !cfg.self_chat {
                continue;
            }
            normalize_handle(chat_ident)
        } else {
            normalize_handle(handle)
        };
        if me && !allowed.contains(&who) {
            continue;
        }
        out.push(Incoming {
            conv: who.clone(),
            sender: who.clone(),
            text,
            reply: Reply {
                to: if me {
                    chat_ident.to_string()
                } else {
                    handle.to_string()
                },
                thread: r["chat"].as_str().unwrap_or("").into(),
                subject: String::new(),
            },
            display: String::new(),
            ..Default::default()
        });
    }
    (out, max)
}
async fn imessage_poll(cfg: &Config, cursor: Option<&str>) -> Result<(Vec<Incoming>, String), String> {
    let Some(last) = cursor.and_then(|c| c.parse::<i64>().ok()) else {
        let v = sqlite("SELECT max(ROWID) AS id FROM message;").await?;
        return Ok((vec![], v[0]["id"].as_i64().unwrap_or(0).to_string()));
    };
    let q=format!("SELECT m.ROWID AS id, m.text AS text, hex(m.attributedBody) AS body, m.is_from_me AS me, h.id AS handle, c.guid AS chat, c.chat_identifier AS chatIdentifier, c.style AS style FROM message m LEFT JOIN handle h ON h.ROWID=m.handle_id LEFT JOIN chat_message_join j ON j.message_id=m.ROWID LEFT JOIN chat c ON c.ROWID=j.chat_id WHERE m.ROWID > {last} AND m.item_type=0 ORDER BY m.ROWID LIMIT 50;");
    let rows = sqlite(&q).await?;
    let (msgs, max) = parse_imessage(&rows, cfg);
    Ok((msgs, max.unwrap_or(last).to_string()))
}
const SEND_SCRIPT: &str = r#"on run argv
set p to item 1 of argv
set raw to read (POSIX file p) as «class utf8»
set AppleScript's text item delimiters to (ASCII character 30)
set parts to text items of raw
set AppleScript's text item delimiters to ""
set chatGuid to item 1 of parts
set targetHandle to item 2 of parts
set msg to item 3 of parts
tell application "Messages"
if chatGuid is not "" then
try
send msg to chat id chatGuid
return "ok"
end try
end if
set svc to 1st account whose service type = iMessage
send msg to participant targetHandle of svc
end tell
return "ok"
end run"#;
async fn osascript(args: &[&str]) -> Result<String, String> {
    let out = tokio::time::timeout(
        std::time::Duration::from_secs(40),
        crate::new_command("/usr/bin/osascript")
            .args(args)
            .kill_on_drop(true)
            .stdin(Stdio::null())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .output(),
    )
    .await
    .map_err(|_| "Сообщения не ответили вовремя")?
    .map_err(|_| "Не удалось запустить osascript")?;
    if out.status.success() {
        return Ok(String::from_utf8_lossy(&out.stdout).trim().to_string());
    }
    let e = String::from_utf8_lossy(&out.stderr);
    Err(if e.contains("-1743") || e.contains("Not authorized") {
        "Nexus не может управлять «Сообщениями». Разрешите: «Системные настройки → Конфиденциальность и безопасность → Автоматизация → NEXUS → Сообщения».".into()
    } else {
        format!("Сообщения: {}", e.trim().chars().take(200).collect::<String>())
    })
}
async fn imessage_send(reply: &Reply, text: &str) -> Result<(), String> {
    let sep = '\u{1e}';
    let clean = |s: &str| s.replace(sep, "");
    let path = std::env::temp_dir().join(format!("nexus-imessage-{}.txt", super::project_id()));
    {
        use std::io::Write;
        let mut opts = std::fs::OpenOptions::new();
        opts.write(true).create_new(true);
        #[cfg(unix)]
        {
            use std::os::unix::fs::OpenOptionsExt;
            opts.mode(0o600);
        }
        let mut f = opts.open(&path).map_err(|_| "Не удалось подготовить сообщение")?;
        f.write_all(
            format!(
                "{}{sep}{}{sep}{}{}",
                clean(&reply.thread),
                clean(&reply.to),
                IMESSAGE_PREFIX,
                clean(text)
            )
            .as_bytes(),
        )
        .map_err(|_| "Не удалось подготовить сообщение")?;
    }
    let r = osascript(&["-e", SEND_SCRIPT, &path.to_string_lossy()]).await;
    let _ = std::fs::remove_file(&path);
    r.map(|_| ())
}

// ---------- GitHub Issues ----------
pub const GITHUB_MARK: &str = "<!-- nexus -->";
pub const LINEAR_PREFIX: &str = "Nexus · ";
pub fn iso8601(secs: i64) -> String {
    let days = secs.div_euclid(86400);
    let rem = secs.rem_euclid(86400);
    let (y, m, d) = civil(days);
    format!(
        "{y:04}-{m:02}-{d:02}T{:02}:{:02}:{:02}Z",
        rem / 3600,
        rem % 3600 / 60,
        rem % 60
    )
}
fn now_iso() -> String {
    iso8601(
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_secs() as i64)
            .unwrap_or(0),
    )
}
#[derive(serde::Serialize, serde::Deserialize, Default, Debug, PartialEq)]
#[serde(default)]
pub struct IssueCursor {
    pub since: String,
    pub comment: String,
}
fn issue_cursor(c: Option<&str>) -> Option<IssueCursor> {
    c.and_then(|c| serde_json::from_str::<IssueCursor>(c).ok())
        .filter(|c| !c.since.is_empty())
}
fn valid_repo(r: &str) -> bool {
    let p: Vec<&str> = r.split('/').collect();
    p.len() == 2
        && p.iter().all(|s| {
            !s.is_empty()
                && s.len() <= 100
                && s.chars().all(|c| c.is_ascii_alphanumeric() || "-_.".contains(c))
                && *s != "."
                && *s != ".."
        })
}
fn label_ok(l: &str) -> bool {
    !l.is_empty() && l.len() <= 50 && !l.chars().any(|c| c.is_control() || "&?#/\\".contains(c))
}
fn url_part(s: &str) -> String {
    s.bytes()
        .map(|b| {
            if b.is_ascii_alphanumeric() || b"-_.~".contains(&b) {
                (b as char).to_string()
            } else {
                format!("%{b:02X}")
            }
        })
        .collect()
}
pub fn issue_text(title: &str, body: &str) -> String {
    let body = body.trim();
    if body.is_empty() {
        title.trim().into()
    } else {
        format!("{}\n\n{}", title.trim(), body)
    }
}
pub fn parse_github_issues(v: &Value, since: &str) -> Vec<Incoming> {
    let mut rows: Vec<(i64, Incoming)> = v
        .as_array()
        .into_iter()
        .flatten()
        .filter(|i| {
            i["pull_request"].is_null()
                && i["created_at"].as_str().is_some_and(|c| c > since)
                && i["user"]["type"] != "Bot"
        })
        .filter_map(|i| {
            let n = i["number"].as_i64()?;
            let login = i["user"]["login"].as_str()?;
            Some((
                n,
                Incoming {
                    conv: format!("#{n}"),
                    sender: login.into(),
                    text: issue_text(
                        i["title"].as_str().unwrap_or(""),
                        i["body"].as_str().unwrap_or(""),
                    ),
                    reply: Reply {
                        to: n.to_string(),
                        ..Default::default()
                    },
                    display: format!("#{n}"),
                    dedupe: Some(format!("issue-{n}")),
                    follow_up: false,
                    callback: String::new(),
                },
            ))
        })
        .collect();
    rows.sort_by_key(|r| r.0);
    rows.into_iter().map(|r| r.1).collect()
}
pub fn parse_github_comments(v: &Value, after: u64) -> (Vec<Incoming>, u64) {
    let mut max = after;
    let mut rows: Vec<(u64, Incoming)> = Vec::new();
    for c in v.as_array().into_iter().flatten() {
        let Some(id) = c["id"].as_u64() else { continue };
        if id <= after {
            continue;
        }
        max = max.max(id);
        let body = c["body"].as_str().unwrap_or("").trim();
        if body.is_empty() || body.starts_with(GITHUB_MARK) || c["user"]["type"] == "Bot" {
            continue;
        }
        let (Some(login), Some(n)) = (
            c["user"]["login"].as_str(),
            c["issue_url"]
                .as_str()
                .and_then(|u| u.rsplit('/').next())
                .and_then(|n| n.parse::<i64>().ok()),
        ) else {
            continue;
        };
        rows.push((
            id,
            Incoming {
                conv: format!("#{n}"),
                sender: login.into(),
                text: body.into(),
                reply: Reply {
                    to: n.to_string(),
                    ..Default::default()
                },
                display: format!("#{n}"),
                dedupe: None,
                follow_up: true,
                callback: String::new(),
            },
        ));
    }
    rows.sort_by_key(|r| r.0);
    (rows.into_iter().map(|r| r.1).collect(), max)
}
fn gh_auth(token: &str) -> String {
    format!("Bearer {token}")
}
async fn github_poll(
    cfg: &Config,
    token: &str,
    cursor: Option<&str>,
) -> Result<(Vec<Incoming>, String), String> {
    if !safe_token(token) {
        return Err("Некорректный токен GitHub".into());
    }
    if !valid_repo(&cfg.repo) {
        return Err("Репозиторий в формате owner/name".into());
    }
    let label = if cfg.label.trim().is_empty() {
        "nexus"
    } else {
        cfg.label.trim()
    };
    if !label_ok(label) {
        return Err("Некорректная метка".into());
    }
    let Some(mut cur) = issue_cursor(cursor) else {
        return Ok((
            vec![],
            serde_json::to_string(&IssueCursor {
                since: now_iso(),
                comment: "0".into(),
            })
            .unwrap_or_default(),
        ));
    };
    let issues=http("GET",&format!("https://api.github.com/repos/{}/issues?labels={}&state=open&sort=created&direction=desc&per_page=30",cfg.repo,url_part(label)),Some(&gh_auth(token)),None,30).await?;
    let mut rows = parse_github_issues(&issues, &cur.since);
    let comments=http("GET",&format!("https://api.github.com/repos/{}/issues/comments?since={}&sort=created&direction=asc&per_page=100",cfg.repo,cur.since),Some(&gh_auth(token)),None,30).await?;
    let (more, max) = parse_github_comments(&comments, cur.comment.parse().unwrap_or(0));
    rows.extend(more);
    cur.comment = max.to_string();
    Ok((rows, serde_json::to_string(&cur).unwrap_or_default()))
}
async fn github_send(cfg: &Config, token: &str, reply: &Reply, text: &str) -> Result<(), String> {
    if !valid_repo(&cfg.repo) || !digits(&reply.to) {
        return Err("Некорректный репозиторий или номер задачи".into());
    }
    http(
        "POST",
        &format!(
            "https://api.github.com/repos/{}/issues/{}/comments",
            cfg.repo, reply.to
        ),
        Some(&gh_auth(token)),
        Some(&json!({"body":format!("{GITHUB_MARK}\n{text}")})),
        30,
    )
    .await
    .map(|_| ())
}

// ---------- Linear ----------
const LINEAR_POLL:&str="query($label:String!,$since:DateTimeOrDuration!,$csince:DateTimeOrDuration!){issues(first:30,filter:{labels:{name:{eqIgnoreCase:$label}},createdAt:{gt:$since}}){nodes{id identifier title description createdAt creator{id email}}} comments(first:50,filter:{createdAt:{gt:$csince}}){nodes{id body createdAt user{id email} issue{id identifier}}}}";
async fn linear(token: &str, query: &str, vars: Value) -> Result<Value, String> {
    if !safe_token(token) {
        return Err("Некорректный API-ключ Linear".into());
    }
    let v = http(
        "POST",
        "https://api.linear.app/graphql",
        Some(token),
        Some(&json!({"query":query,"variables":vars})),
        30,
    )
    .await?;
    if let Some(e) = v["errors"].as_array().and_then(|e| e.first()) {
        return Err(format!(
            "Linear: {}",
            e["message"].as_str().unwrap_or("ошибка API")
        ));
    }
    Ok(v["data"].clone())
}
pub fn parse_linear(d: &Value, cur: &mut IssueCursor) -> Vec<Incoming> {
    let mut rows: Vec<(String, Incoming)> = Vec::new();
    for i in d["issues"]["nodes"].as_array().into_iter().flatten() {
        let (Some(id), Some(ident), Some(created)) = (
            i["id"].as_str(),
            i["identifier"].as_str(),
            i["createdAt"].as_str(),
        ) else {
            continue;
        };
        let who = i["creator"]["email"]
            .as_str()
            .or(i["creator"]["id"].as_str())
            .unwrap_or("");
        rows.push((
            created.into(),
            Incoming {
                conv: ident.into(),
                sender: who.into(),
                text: issue_text(
                    i["title"].as_str().unwrap_or(""),
                    i["description"].as_str().unwrap_or(""),
                ),
                reply: Reply {
                    to: id.into(),
                    ..Default::default()
                },
                display: ident.into(),
                dedupe: Some(format!("issue-{id}")),
                follow_up: false,
                callback: String::new(),
            },
        ));
    }
    for c in d["comments"]["nodes"].as_array().into_iter().flatten() {
        let Some(created) = c["createdAt"].as_str() else {
            continue;
        };
        if created > cur.comment.as_str() {
            cur.comment = created.into()
        }
        let body = c["body"].as_str().unwrap_or("").trim();
        if body.is_empty() || body.starts_with(LINEAR_PREFIX.trim()) {
            continue;
        }
        let (Some(issue), Some(ident)) = (c["issue"]["id"].as_str(), c["issue"]["identifier"].as_str())
        else {
            continue;
        };
        let who = c["user"]["email"]
            .as_str()
            .or(c["user"]["id"].as_str())
            .unwrap_or("");
        if who.is_empty() {
            continue;
        }
        rows.push((
            created.into(),
            Incoming {
                conv: ident.into(),
                sender: who.into(),
                text: body.into(),
                reply: Reply {
                    to: issue.into(),
                    ..Default::default()
                },
                display: ident.into(),
                dedupe: None,
                follow_up: true,
                callback: String::new(),
            },
        ));
    }
    rows.sort_by(|a, b| a.0.cmp(&b.0));
    rows.into_iter().map(|r| r.1).collect()
}
async fn linear_poll(
    cfg: &Config,
    token: &str,
    cursor: Option<&str>,
) -> Result<(Vec<Incoming>, String), String> {
    let label = if cfg.label.trim().is_empty() {
        "nexus"
    } else {
        cfg.label.trim()
    };
    if !label_ok(label) {
        return Err("Некорректная метка".into());
    }
    let Some(mut cur) = issue_cursor(cursor) else {
        let now = now_iso();
        return Ok((
            vec![],
            serde_json::to_string(&IssueCursor {
                since: now.clone(),
                comment: now,
            })
            .unwrap_or_default(),
        ));
    };
    let d = linear(
        token,
        LINEAR_POLL,
        json!({"label":label,"since":cur.since,"csince":cur.comment}),
    )
    .await?;
    let rows = parse_linear(&d, &mut cur);
    Ok((rows, serde_json::to_string(&cur).unwrap_or_default()))
}
async fn linear_send(token: &str, reply: &Reply, text: &str) -> Result<(), String> {
    let d = linear(
        token,
        "mutation($id:String!,$body:String!){commentCreate(input:{issueId:$id,body:$body}){success}}",
        json!({"id":reply.to,"body":format!("{LINEAR_PREFIX}{text}")}),
    )
    .await?;
    if d["commentCreate"]["success"] == true {
        Ok(())
    } else {
        Err("Linear не сохранил комментарий".into())
    }
}

// ---------- Dispatch ----------
pub struct Polled {
    pub messages: Vec<Incoming>,
    pub cursor: String,
    pub notes: Vec<String>,
}
pub async fn poll(cfg: &Config, secret: &str, cursor: Option<&str>) -> Result<Polled, String> {
    Ok(match cfg.kind.as_str() {
        "telegram" => {
            let (m, c) = telegram_poll(secret, cursor).await?;
            Polled {
                messages: m,
                cursor: c,
                notes: vec![],
            }
        }
        "discord" => {
            let (m, c, empty) = discord_poll(secret, &cfg.channel_id, cursor).await?;
            Polled {
                messages: m,
                cursor: c,
                notes: if empty {
                    vec!["Discord вернул сообщение без текста: включите Message Content Intent для бота в Developer Portal.".into()]
                } else {
                    vec![]
                },
            }
        }
        "slack" => {
            let (m, c) = slack_poll(secret, &cfg.channel_id, cursor).await?;
            Polled {
                messages: m,
                cursor: c,
                notes: vec![],
            }
        }
        "email" => {
            let (m, c, n) = email_poll(cfg, secret, cursor).await?;
            Polled {
                messages: m,
                cursor: c,
                notes: n,
            }
        }
        "imessage" => {
            let (m, c) = imessage_poll(cfg, cursor).await?;
            Polled {
                messages: m,
                cursor: c,
                notes: vec![],
            }
        }
        "github" => {
            let (m, c) = github_poll(cfg, secret, cursor).await?;
            Polled {
                messages: m,
                cursor: c,
                notes: vec![],
            }
        }
        "linear" => {
            let (m, c) = linear_poll(cfg, secret, cursor).await?;
            Polled {
                messages: m,
                cursor: c,
                notes: vec![],
            }
        }
        _ => return Err("Неизвестный канал".into()),
    })
}
/// Like `send`, but in Telegram the last part carries inline buttons (or, with `menu`, the persistent
/// keyboard). Other channels get the plain text, which always names the matching commands.
pub async fn send_buttons(
    cfg: &Config,
    secret: &str,
    reply: &Reply,
    text: &str,
    buttons: &Buttons,
    menu: bool,
) -> Result<(), String> {
    if cfg.kind != "telegram" {
        return send(cfg, secret, reply, text).await;
    }
    let parts = split(text, chunk_limit("telegram"));
    let last = parts.len().saturating_sub(1);
    for (i, part) in parts.iter().enumerate() {
        let markup = if i == last {
            telegram_markup(buttons, menu)
        } else {
            None
        };
        telegram_send_with(secret, reply, part, markup).await?;
    }
    Ok(())
}
pub async fn send(cfg: &Config, secret: &str, reply: &Reply, text: &str) -> Result<(), String> {
    match cfg.kind.as_str() {
        "email" => return email_send(cfg, secret, reply, text).await,
        "github" => return github_send(cfg, secret, reply, text).await,
        "linear" => return linear_send(secret, reply, text).await,
        _ => {}
    }
    for (i, part) in split(text, chunk_limit(&cfg.kind)).iter().enumerate() {
        match cfg.kind.as_str() {
            "telegram" => telegram_send(secret, reply, part).await?,
            "discord" => discord_send(secret, reply, part, i == 0).await?,
            "slack" => slack_send(secret, reply, part).await?,
            "imessage" => imessage_send(reply, part).await?,
            _ => return Err("Неизвестный канал".into()),
        }
    }
    Ok(())
}
pub async fn test(cfg: &Config, secret: &str) -> Result<String, String> {
    match cfg.kind.as_str() {
        "telegram" => {
            if !safe_token(secret) {
                return Err("Некорректный токен Telegram-бота".into());
            }
            let v = http(
                "GET",
                &format!("https://api.telegram.org/bot{secret}/getMe"),
                None,
                None,
                30,
            )
            .await?;
            if v["ok"] != true {
                return Err("Telegram отклонил токен".into());
            }
            Ok(format!(
                "Бот @{} готов. Напишите ему /start — бот ответит вашим ID для списка разрешённых.",
                v["result"]["username"].as_str().unwrap_or("?")
            ))
        }
        "discord" => {
            if !safe_token(secret) {
                return Err("Некорректный токен Discord-бота".into());
            }
            if !digits(&cfg.channel_id) {
                return Err("Укажите числовой ID канала Discord".into());
            }
            let me = http(
                "GET",
                "https://discord.com/api/v10/users/@me",
                Some(&format!("Bot {secret}")),
                None,
                30,
            )
            .await?;
            let ch = http(
                "GET",
                &format!("https://discord.com/api/v10/channels/{}", cfg.channel_id),
                Some(&format!("Bot {secret}")),
                None,
                30,
            )
            .await?;
            Ok(format!(
                "Бот {} видит канал #{}. Проверьте, что включён Message Content Intent.",
                me["username"].as_str().unwrap_or("?"),
                ch["name"].as_str().unwrap_or("?")
            ))
        }
        "slack" => {
            if !secret.starts_with("xoxb-") || !safe_token(secret) {
                return Err("Нужен Bot User OAuth Token (xoxb-…)".into());
            }
            let a = http(
                "GET",
                "https://slack.com/api/auth.test",
                Some(&format!("Bearer {secret}")),
                None,
                30,
            )
            .await?;
            slack_ok(&a)?;
            if !slack_id(&cfg.channel_id) {
                return Err("Укажите ID канала Slack вида C0123ABC".into());
            }
            let h = http(
                "GET",
                &format!(
                    "https://slack.com/api/conversations.history?channel={}&limit=1",
                    cfg.channel_id
                ),
                Some(&format!("Bearer {secret}")),
                None,
                30,
            )
            .await?;
            slack_ok(&h)?;
            Ok(format!(
                "Бот {} в пространстве {} читает канал.",
                a["user"].as_str().unwrap_or("?"),
                a["team"].as_str().unwrap_or("?")
            ))
        }
        "email" => {
            let s = imap(cfg, secret, "INBOX", Some("UID SEARCH ALL")).await?;
            if !valid_host(&cfg.smtp_host) {
                return Err("Укажите сервер SMTP".into());
            }
            Ok(format!(
                "IMAP: вход выполнен, писем во «Входящих»: {}. SMTP проверится при первом ответе.",
                parse_search(&s).len()
            ))
        }
        "github" => {
            if !safe_token(secret) {
                return Err("Некорректный токен GitHub".into());
            }
            if !valid_repo(&cfg.repo) {
                return Err("Укажите репозиторий owner/name".into());
            }
            let r = http(
                "GET",
                &format!("https://api.github.com/repos/{}", cfg.repo),
                Some(&gh_auth(secret)),
                None,
                30,
            )
            .await?;
            let label = if cfg.label.trim().is_empty() {
                "nexus"
            } else {
                cfg.label.trim()
            };
            Ok(format!("Репозиторий {} доступен{}. Задачи — открытые issues с меткой «{label}», созданные после включения; ответы — комментариями.",r["full_name"].as_str().unwrap_or("?"),if r["permissions"]["push"]==false{" только для чтения: комментарии могут не сохраниться"}else{""}))
        }
        "linear" => {
            let d = linear(
                secret,
                "query{viewer{name email} teams(first:5){nodes{key}}}",
                json!({}),
            )
            .await?;
            Ok(format!(
                "Linear: вход как {} · команды: {}. Задачи — issues с меткой «{}».",
                d["viewer"]["name"].as_str().unwrap_or("?"),
                d["teams"]["nodes"]
                    .as_array()
                    .map(|t| t
                        .iter()
                        .filter_map(|x| x["key"].as_str())
                        .collect::<Vec<_>>()
                        .join(", "))
                    .unwrap_or_default(),
                if cfg.label.trim().is_empty() {
                    "nexus"
                } else {
                    cfg.label.trim()
                }
            ))
        }
        "imessage" => {
            let v = sqlite("SELECT count(*) AS n FROM message;").await?;
            osascript(&["-e", "tell application \"Messages\" to count accounts"]).await?;
            Ok(format!(
                "База сообщений доступна (сообщений: {}), управление «Сообщениями» разрешено.",
                v[0]["n"].as_i64().unwrap_or(0)
            ))
        }
        _ => Err("Неизвестный канал".into()),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    fn cfg(kind: &str) -> Config {
        Config {
            kind: kind.into(),
            ..Default::default()
        }
    }
    #[test]
    fn split_respects_limits_and_keeps_text() {
        let t = "строка один\n".repeat(50);
        let p = split(&t, 100);
        assert!(p.iter().all(|s| s.chars().count() <= 100));
        assert_eq!(p.join("\n").replace('\n', ""), t.replace('\n', ""));
        let long = "я".repeat(250);
        let p = split(&long, 100);
        assert_eq!(p.len(), 3);
        assert!(split("  ", 10).is_empty());
    }
    #[test]
    fn telegram_parses_text_and_skips_bots() {
        let v = json!({"ok":true,"result":[{"update_id":5,"message":{"text":"/status","from":{"id":42,"username":"alex"},"chat":{"id":42}}},{"update_id":7,"message":{"text":"x","from":{"id":1,"is_bot":true},"chat":{"id":1}}},{"update_id":6,"edited_message":{}}]});
        let (r, max) = parse_telegram(&v);
        assert_eq!(max, Some(7));
        assert_eq!(r.len(), 1);
        assert_eq!(r[0].sender, "42");
        assert_eq!(r[0].reply.to, "42");
    }
    #[test]
    fn discord_sorts_and_filters() {
        let v = json!([{"id":"30","type":0,"author":{"id":"9"},"content":"второе"},{"id":"20","type":0,"author":{"id":"9"},"content":"первое"},{"id":"40","type":0,"author":{"id":"1","bot":true},"content":"bot"},{"id":"50","type":0,"author":{"id":"9"},"content":""}]);
        let (r, max, empty) = parse_discord(&v, "777");
        assert_eq!(max, Some(50));
        assert!(empty);
        assert_eq!(
            r.iter().map(|m| m.text.as_str()).collect::<Vec<_>>(),
            ["первое", "второе"]
        );
        assert_eq!(r[0].conv, "777:9");
        assert_eq!(r[0].reply.thread, "20");
    }
    #[test]
    fn slack_unescapes_and_threads() {
        let v = json!({"ok":true,"messages":[{"ts":"2.5","user":"U1","text":"a &amp; b","thread_ts":"1.0"},{"ts":"3.0","bot_id":"B","text":"bot"},{"ts":"1.5","user":"U1","text":"раньше"}]});
        let (r, max) = parse_slack(&v, "C1");
        assert_eq!(max.as_deref(), Some("3.0"));
        assert_eq!(r[0].text, "раньше");
        assert_eq!(r[1].text, "a & b");
        assert_eq!(r[1].reply.thread, "1.0");
    }
    #[test]
    fn email_parsing() {
        let raw="Authentication-Results: mx.example; dkim=pass header.d=example.com\r\nFrom: =?UTF-8?B?0JDQu9C10LrRgQ==?= <Alex@Example.com>\r\nSubject: =?UTF-8?Q?=D0=97=D0=B0=D0=B4=D0=B0=D1=87=D0=B0?=\r\nMessage-ID: <abc@x>\r\nContent-Type: multipart/alternative; boundary=\"b1\"\r\n\r\n--b1\r\nContent-Type: text/plain; charset=utf-8\r\nContent-Transfer-Encoding: quoted-printable\r\n\r\n=D0=9F=D1=80=D0=B8=D0=B2=D0=B5=D1=82 \r\n\r\n> old\r\n--b1\r\nContent-Type: text/html\r\n\r\n<p>x</p>\r\n--b1--\r\n";
        let m = parse_mail(raw);
        assert_eq!(m.from, "alex@example.com");
        assert_eq!(m.subject, "Задача");
        assert_eq!(m.text, "Привет");
        assert!(m.authenticated);
        assert!(!m.own_reply);
        assert_eq!(m.message_id, "<abc@x>");
        assert!(mail_authenticated(
            "mx.example; dkim=pass header.d=example.com",
            "alex@example.com"
        ));
        assert!(mail_authenticated("mx.google.com; dkim=pass header.i=@mail.example.com; dmarc=pass (p=NONE) header.from=example.com","alex@example.com"));
        assert!(!mail_authenticated(
            "mx.example; dkim=pass header.d=attacker.net; spf=pass",
            "alex@example.com"
        ));
        assert!(!mail_authenticated("mx.example; dkim=pass", "alex@example.com"));
        assert!(!mail_authenticated(
            "mx.example; dmarc=pass header.from=attacker.net",
            "alex@example.com"
        ));
        assert!(!mail_authenticated(
            "mx.example; dkim=fail header.d=example.com",
            "alex@example.com"
        ));
        assert!(!mail_authenticated(
            "mx.example; dkim=pass header.d=notexample.com",
            "alex@example.com"
        ));
        let forged = parse_mail("From: a@b.c\r\nSubject: hi\r\nX-Nexus-Reply: 1\r\n\r\nbody");
        assert!(!forged.authenticated);
        assert!(forged.own_reply);
        assert_eq!(parse_search("* SEARCH 3 10 11\r\nA OK"), vec![3, 10, 11]);
        assert_eq!(address("Имя <X@Y.ru>"), "x@y.ru");
        assert_eq!(
            strip_quoted("Сделай тест\n\nOn Mon, Alex wrote:\n> старое"),
            "Сделай тест"
        );
    }
    #[test]
    fn mail_is_encoded_and_marked() {
        let m = build_mail("me@x.ru", "you@y.ru", "Re: Задача", "<id@x>", "Готово ✓", 0);
        assert!(m.contains("X-Nexus-Reply: 1"));
        assert!(m.contains("In-Reply-To: <id@x>"));
        assert!(m.contains("Date: Thu, 01 Jan 1970 00:00:00 +0000"));
        assert!(!m.contains("Готово"));
        assert_eq!(rfc2822(1794641106), "Sat, 14 Nov 2026 07:25:06 +0000");
    }
    #[test]
    fn imessage_attributed_body_and_filters() {
        let mut b=b"\x04\x0bstreamtyped\x81\xe8\x03\x84\x01@\x84\x84\x84\x12NSAttributedString\x00\x84\x84\x08NSObject\x00\x85\x92\x84\x84\x84\x08NSString\x01\x94\x84\x01+".to_vec();
        let text = "Сделай отчёт".as_bytes();
        b.push(text.len() as u8);
        b.extend_from_slice(text);
        b.extend_from_slice(b"\x86\x84");
        let hex: String = b.iter().map(|x| format!("{x:02X}")).collect();
        assert_eq!(attributed_text(&hex).as_deref(), Some("Сделай отчёт"));
        let mut long = b"NSString\x01\x94\x84\x01+\x81".to_vec();
        let t = "ж".repeat(200);
        long.extend_from_slice(&(t.len() as u16).to_le_bytes());
        long.extend_from_slice(t.as_bytes());
        let hex: String = long.iter().map(|x| format!("{x:02X}")).collect();
        assert_eq!(attributed_text(&hex).unwrap(), t);
        let mut c = cfg("imessage");
        c.allowed = vec!["+7 (999) 123-45-67".into()];
        let rows = json!([{"id":10,"text":"привет","me":0,"handle":"+79991234567","chat":"iMessage;-;+79991234567","style":45},{"id":11,"text":"Nexus · ответ","me":1,"handle":"+79991234567","style":45},{"id":12,"text":"группа","me":0,"handle":"+79991234567","style":43},{"id":13,"text":"свой","me":1,"chatIdentifier":"+79991234567","style":45}]);
        let (r, max) = parse_imessage(&rows, &c);
        assert_eq!(max, Some(13));
        assert_eq!(r.len(), 1);
        assert_eq!(r[0].reply.thread, "iMessage;-;+79991234567");
        c.self_chat = true;
        let (r, _) = parse_imessage(&rows, &c);
        assert_eq!(r.len(), 2);
        assert_eq!(normalize_handle(" Me@iCloud.com "), "me@icloud.com");
    }
    #[test]
    fn github_issues_and_comments() {
        let v = json!([{"number":12,"title":"Почини тест","body":"падает","created_at":"2026-11-14T08:00:00Z","user":{"login":"Alex","type":"User"}},{"number":11,"title":"старое","created_at":"2026-11-13T08:00:00Z","user":{"login":"Alex"}},{"number":13,"title":"PR","created_at":"2026-11-14T09:00:00Z","pull_request":{},"user":{"login":"Alex"}}]);
        let r = parse_github_issues(&v, "2026-11-14T07:00:00Z");
        assert_eq!(r.len(), 1);
        assert_eq!(r[0].text, "Почини тест\n\nпадает");
        assert_eq!(r[0].dedupe.as_deref(), Some("issue-12"));
        assert_eq!(r[0].reply.to, "12");
        let c = json!([{"id":5,"body":"/status","issue_url":"https://api.github.com/repos/a/b/issues/12","user":{"login":"Alex"}},{"id":6,"body":"<!-- nexus -->\nответ","issue_url":"x/12","user":{"login":"Alex"}},{"id":3,"body":"old","issue_url":"x/12","user":{"login":"a"}}]);
        let (r, max) = parse_github_comments(&c, 4);
        assert_eq!(max, 6);
        assert_eq!(r.len(), 1);
        assert!(r[0].follow_up);
        assert_eq!(r[0].conv, "#12");
        assert!(valid_repo("owner/re-po.1"));
        assert!(!valid_repo("a/../b"));
        assert!(!valid_repo("a"));
        assert_eq!(url_part("to do"), "to%20do");
        assert_eq!(iso8601(0), "1970-01-01T00:00:00Z");
    }
    #[test]
    fn linear_issues_and_comments() {
        let d = json!({"issues":{"nodes":[{"id":"u1","identifier":"NEX-7","title":"Отчёт","description":"","createdAt":"2026-11-14T08:00:00Z","creator":{"email":"a@x.ru"}}]},"comments":{"nodes":[{"id":"c2","body":"Nexus · готово","createdAt":"2026-11-14T08:02:00Z","user":{"email":"a@x.ru"},"issue":{"id":"u1","identifier":"NEX-7"}},{"id":"c1","body":"/stop","createdAt":"2026-11-14T08:01:00Z","user":{"email":"a@x.ru"},"issue":{"id":"u1","identifier":"NEX-7"}}]}});
        let mut cur = IssueCursor {
            since: "2026-11-14T07:00:00Z".into(),
            comment: "2026-11-14T07:00:00Z".into(),
        };
        let r = parse_linear(&d, &mut cur);
        assert_eq!(r.len(), 2);
        assert_eq!(r[0].text, "Отчёт");
        assert!(!r[0].follow_up);
        assert_eq!(r[1].text, "/stop");
        assert!(r[1].follow_up);
        assert_eq!(cur.comment, "2026-11-14T08:02:00Z");
        assert_eq!(r[1].reply.to, "u1");
    }
    #[test]
    fn quoting_and_validation() {
        assert_eq!(quoted("a\"b\\c\nd"), "\"a\\\"b\\\\c\\nd\"");
        assert!(!safe_token("abc/../x"));
        assert!(safe_token("123:ABC-def_x"));
        assert!(valid_host("imap.gmail.com"));
        assert!(!valid_host("-x"));
        assert!(!valid_host("a b"));
        assert!(!digits("12a"));
    }
}
