//! Custom channel plugins: a user-chosen executable that speaks newline-delimited JSON over stdio.
//! Nexus starts it without a shell and with a minimal environment; the secret travels only in the `hello` line on stdin.
//! Protocol (version 1), one JSON object per line:
//!   Nexus → plugin: {"type":"hello","protocol":1,"secret":"…","channelId":"…"}
//!                   {"type":"ping","id":N}
//!                   {"type":"send","id":N,"reply":{"to","thread","subject"},"text":"…"}
//!   plugin → Nexus: {"type":"ready","name":"…"}
//!                   {"type":"message","conversation":"…","sender":"…","text":"…","reply":{…},"display":"…"}
//!                   {"type":"result","id":N,"ok":true|false,"error":"…","name":"…"}
//!                   {"type":"log","text":"…"}
use super::remote_channels::{Config, Incoming, Reply};
use serde_json::{json, Value};
use std::collections::{HashMap, VecDeque};
use std::process::Stdio;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, LazyLock, Mutex as StdMutex};
use std::time::Duration;
use tokio::io::{AsyncBufReadExt, AsyncReadExt, AsyncWriteExt, BufReader};
use tokio::process::{Child, ChildStdin, Command};
use tokio::sync::{oneshot, Mutex};

pub const PROTOCOL: u32 = 1;
const MAX_LINE: usize = 256 * 1024;
const MAX_INBOX: usize = 200;
const MAX_TEXT: usize = 20_000;

type Waiters = Arc<StdMutex<HashMap<u64, oneshot::Sender<Value>>>>;
struct Proc {
    sig: String,
    _child: Child,
    stdin: ChildStdin,
    inbox: Arc<StdMutex<VecDeque<Incoming>>>,
    notes: Arc<StdMutex<Vec<String>>>,
    waiters: Waiters,
    alive: Arc<AtomicBool>,
    name: Arc<StdMutex<String>>,
    next: u64,
}
static PROC: LazyLock<Mutex<Option<Proc>>> = LazyLock::new(|| Mutex::new(None));

fn clean(s: &str, max: usize) -> String {
    s.chars()
        .filter(|c| !c.is_control() || *c == '\n' || *c == '\t')
        .take(max)
        .collect()
}
fn short(v: &Value, key: &str) -> String {
    clean(v[key].as_str().unwrap_or(""), 300).replace(['\n', '\t'], " ")
}

/// Checks the command before it is saved or started: an absolute path to an existing executable file, no shell.
pub fn validate(cfg: &Config) -> Result<(), String> {
    let p = std::path::Path::new(cfg.plugin_command.trim());
    if cfg.plugin_command.trim().is_empty() {
        return Err("Укажите исполняемый файл плагина".into());
    }
    if !p.is_absolute() {
        return Err("Путь к плагину должен быть абсолютным (/usr/local/bin/…)".into());
    }
    let meta = std::fs::metadata(p).map_err(|_| "Файл плагина не найден".to_string())?;
    if !meta.is_file() {
        return Err("Плагин должен быть файлом, а не папкой".into());
    }
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        if meta.permissions().mode() & 0o111 == 0 {
            return Err("Файл плагина не исполняемый (chmod +x)".into());
        }
    }
    if cfg.plugin_args.len() > 16
        || cfg
            .plugin_args
            .iter()
            .any(|a| a.len() > 400 || a.chars().any(|c| c.is_control()))
    {
        return Err("Аргументы плагина: до 16 значений без переводов строк".into());
    }
    Ok(())
}

fn signature(cfg: &Config, secret: &str) -> String {
    format!(
        "{}\u{0}{}\u{0}{}\u{0}{}",
        cfg.plugin_command,
        cfg.plugin_args.join("\u{1}"),
        cfg.channel_id,
        secret
    )
}

pub fn parse_message(v: &Value) -> Option<Incoming> {
    let conv = short(v, "conversation");
    let sender = short(v, "sender");
    let text = clean(v["text"].as_str().unwrap_or(""), MAX_TEXT);
    if conv.is_empty() || sender.is_empty() || text.trim().is_empty() {
        return None;
    }
    let r = &v["reply"];
    let reply = Reply {
        to: if r["to"].is_string() {
            short(r, "to")
        } else {
            conv.clone()
        },
        thread: short(r, "thread"),
        subject: short(r, "subject"),
    };
    let display = short(v, "display");
    Some(Incoming {
        display: if display.is_empty() {
            sender.clone()
        } else {
            display
        },
        conv,
        sender,
        text,
        reply,
        ..Default::default()
    })
}

fn spawn(cfg: &Config, secret: &str) -> Result<Proc, String> {
    validate(cfg)?;
    let mut cmd = Command::new(cfg.plugin_command.trim());
    cmd.args(&cfg.plugin_args)
        .env_clear()
        .env(
            "PATH",
            "/usr/bin:/bin:/usr/sbin:/sbin:/usr/local/bin:/opt/homebrew/bin",
        )
        .env("LANG", "en_US.UTF-8")
        .env("NEXUS_CHANNEL_PROTOCOL", PROTOCOL.to_string())
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .kill_on_drop(true);
    if let Ok(h) = std::env::var("HOME") {
        cmd.env("HOME", h);
    }
    let mut child = cmd
        .spawn()
        .map_err(|e| format!("Не удалось запустить плагин: {e}"))?;
    let stdin = child.stdin.take().ok_or("Нет stdin у плагина")?;
    let stdout = child.stdout.take().ok_or("Нет stdout у плагина")?;
    let inbox: Arc<StdMutex<VecDeque<Incoming>>> = Default::default();
    let notes: Arc<StdMutex<Vec<String>>> = Default::default();
    let waiters: Waiters = Default::default();
    let alive = Arc::new(AtomicBool::new(true));
    let name: Arc<StdMutex<String>> = Default::default();
    let (i, n, w, a, nm) = (
        inbox.clone(),
        notes.clone(),
        waiters.clone(),
        alive.clone(),
        name.clone(),
    );
    tauri::async_runtime::spawn(async move {
        let mut lines = BufReader::new(stdout);
        let mut buf = Vec::new();
        loop {
            buf.clear();
            match (&mut lines)
                .take(MAX_LINE as u64 + 1)
                .read_until(b'\n', &mut buf)
                .await
            {
                Ok(0) | Err(_) => break,
                Ok(_) => {}
            }
            if buf.len() > MAX_LINE {
                if let Ok(mut n) = n.lock() {
                    n.push("Плагин прислал слишком длинную строку — она пропущена".into());
                }
                // Skip the rest of the oversized line.
                let mut rest = Vec::new();
                if lines.read_until(b'\n', &mut rest).await.unwrap_or(0) == 0 {
                    break;
                }
                continue;
            }
            let Ok(v) = serde_json::from_slice::<Value>(&buf) else {
                continue;
            };
            match v["type"].as_str().unwrap_or("") {
                "message" => {
                    if let (Some(m), Ok(mut q)) = (parse_message(&v), i.lock()) {
                        if q.len() < MAX_INBOX {
                            q.push_back(m)
                        }
                    }
                }
                "ready" => {
                    if let Ok(mut s) = nm.lock() {
                        *s = short(&v, "name")
                    }
                }
                "log" => {
                    if let Ok(mut q) = n.lock() {
                        if q.len() < 20 {
                            q.push(format!("Плагин: {}", short(&v, "text")))
                        }
                    }
                }
                "result" => {
                    if let Some(id) = v["id"].as_u64() {
                        if let Some(tx) = w.lock().ok().and_then(|mut m| m.remove(&id)) {
                            let _ = tx.send(v);
                        }
                    }
                }
                _ => {}
            }
        }
        a.store(false, Ordering::SeqCst);
        if let Ok(mut m) = w.lock() {
            m.clear()
        }
    });
    Ok(Proc {
        sig: signature(cfg, secret),
        _child: child,
        stdin,
        inbox,
        notes,
        waiters,
        alive,
        name,
        next: 1,
    })
}

async fn write_line(p: &mut Proc, v: &Value) -> Result<(), String> {
    let mut line = serde_json::to_vec(v).map_err(|e| e.to_string())?;
    line.push(b'\n');
    p.stdin
        .write_all(&line)
        .await
        .map_err(|_| "Плагин закрыл stdin".to_string())?;
    p.stdin
        .flush()
        .await
        .map_err(|_| "Плагин закрыл stdin".to_string())
}

async fn ensure<'a>(slot: &'a mut Option<Proc>, cfg: &Config, secret: &str) -> Result<&'a mut Proc, String> {
    let sig = signature(cfg, secret);
    let stale = slot
        .as_ref()
        .is_none_or(|p| p.sig != sig || !p.alive.load(Ordering::SeqCst));
    if stale {
        *slot = None;
        let mut p = spawn(cfg, secret)?;
        write_line(
            &mut p,
            &json!({"type": "hello", "protocol": PROTOCOL, "secret": secret, "channelId": cfg.channel_id}),
        )
        .await?;
        *slot = Some(p);
    }
    Ok(slot.as_mut().unwrap())
}

async fn request(cfg: &Config, secret: &str, mut msg: Value, secs: u64) -> Result<Value, String> {
    let rx = {
        let mut g = PROC.lock().await;
        let p = ensure(&mut g, cfg, secret).await?;
        let id = p.next;
        p.next += 1;
        msg["id"] = json!(id);
        let (tx, rx) = oneshot::channel();
        p.waiters.lock().map_err(|_| "lock")?.insert(id, tx);
        write_line(p, &msg).await?;
        rx
    };
    let v = tokio::time::timeout(Duration::from_secs(secs), rx)
        .await
        .map_err(|_| format!("Плагин не ответил за {secs} с"))?
        .map_err(|_| "Плагин завершился, не ответив".to_string())?;
    if v["ok"] == true {
        Ok(v)
    } else {
        let e = short(&v, "error");
        Err(if e.is_empty() {
            "Плагин вернул ошибку".into()
        } else {
            format!("Плагин: {e}")
        })
    }
}

pub async fn poll(cfg: &Config, secret: &str) -> Result<(Vec<Incoming>, Vec<String>), String> {
    let mut g = PROC.lock().await;
    let p = ensure(&mut g, cfg, secret).await?;
    let messages: Vec<Incoming> = p
        .inbox
        .lock()
        .map(|mut q| q.drain(..).collect())
        .unwrap_or_default();
    let notes = p
        .notes
        .lock()
        .map(|mut n| std::mem::take(&mut *n))
        .unwrap_or_default();
    if messages.is_empty() && !p.alive.load(Ordering::SeqCst) {
        *g = None;
        return Err("Плагин завершился; перезапуск при следующем опросе".into());
    }
    Ok((messages, notes))
}

pub async fn send(cfg: &Config, secret: &str, reply: &Reply, text: &str) -> Result<(), String> {
    request(
        cfg,
        secret,
        json!({"type": "send", "reply": reply, "text": text}),
        60,
    )
    .await
    .map(|_| ())
}

pub async fn test(cfg: &Config, secret: &str) -> Result<String, String> {
    stop().await;
    let v = request(cfg, secret, json!({"type": "ping"}), 15).await;
    let name = {
        let g = PROC.lock().await;
        g.as_ref()
            .and_then(|p| p.name.lock().ok().map(|s| s.clone()))
            .unwrap_or_default()
    };
    stop().await;
    let v = v?;
    let name = if name.is_empty() { short(&v, "name") } else { name };
    Ok(if name.is_empty() {
        "Плагин отвечает по протоколу Nexus".into()
    } else {
        format!("Плагин «{name}» отвечает по протоколу Nexus")
    })
}

/// Stops the running plugin process (on disable, removal or before a test).
pub async fn stop() {
    *PROC.lock().await = None;
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn parses_messages_and_rejects_incomplete() {
        let m =
            parse_message(&json!({"type":"message","conversation":"room-1","sender":"u1","text":"hi\u{7}"}))
                .unwrap();
        assert_eq!(
            (m.conv.as_str(), m.sender.as_str(), m.text.as_str()),
            ("room-1", "u1", "hi")
        );
        assert_eq!(m.reply.to, "room-1");
        assert_eq!(m.display, "u1");
        assert!(parse_message(&json!({"conversation":"c","sender":"","text":"x"})).is_none());
        assert!(parse_message(&json!({"conversation":"c","sender":"s","text":"  "})).is_none());
        let long = "a".repeat(MAX_TEXT + 50);
        assert_eq!(
            parse_message(&json!({"conversation":"c","sender":"s","text":long}))
                .unwrap()
                .text
                .len(),
            MAX_TEXT
        );
    }
    #[test]
    fn validates_command() {
        let mut c = Config {
            plugin_command: "plugin".into(),
            ..Default::default()
        };
        assert!(validate(&c).is_err());
        c.plugin_command = "/definitely/missing".into();
        assert!(validate(&c).is_err());
        c.plugin_command = "/bin/sh".into();
        assert!(validate(&c).is_ok());
        c.plugin_args = vec!["a\nb".into()];
        assert!(validate(&c).is_err());
    }
    #[cfg(unix)]
    #[test]
    fn round_trip_with_a_real_process() {
        use std::os::unix::fs::PermissionsExt;
        let dir = std::env::temp_dir().join(format!("nexus-plugin-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let script = dir.join("echo-plugin");
        // Reads hello, announces itself, emits one message, answers ping/send.
        std::fs::write(
            &script,
            "#!/usr/bin/env python3\nimport sys, json\nfor line in sys.stdin:\n    m = json.loads(line)\n    t = m.get('type')\n    if t == 'hello':\n        ok = m.get('secret') == 's3' and m.get('channelId') == 'room'\n        print(json.dumps({'type':'ready','name':'echo'}), flush=True)\n        print(json.dumps({'type':'message','conversation':'room','sender':'u1','text':'hi' if ok else 'bad'}), flush=True)\n    elif t == 'ping':\n        print(json.dumps({'type':'result','id':m['id'],'ok':True}), flush=True)\n    elif t == 'send':\n        good = m['text'] == 'answer' and m['reply']['to'] == 'room'\n        print(json.dumps({'type':'result','id':m['id'],'ok':good,'error':'mismatch'}), flush=True)\n",
        )
        .unwrap();
        std::fs::set_permissions(&script, std::fs::Permissions::from_mode(0o755)).unwrap();
        let cfg = Config {
            kind: "plugin".into(),
            channel_id: "room".into(),
            plugin_command: script.to_string_lossy().into(),
            ..Default::default()
        };
        tauri::async_runtime::block_on(async {
            assert!(test(&cfg, "s3").await.unwrap().contains("echo"));
            let mut got = vec![];
            for _ in 0..50 {
                let (m, _) = poll(&cfg, "s3").await.unwrap();
                got.extend(m);
                if !got.is_empty() {
                    break;
                }
                tokio::time::sleep(Duration::from_millis(50)).await;
            }
            assert_eq!(got.len(), 1);
            assert_eq!(got[0].text, "hi");
            send(&cfg, "s3", &got[0].reply, "answer").await.unwrap();
            assert!(send(&cfg, "s3", &got[0].reply, "other")
                .await
                .unwrap_err()
                .contains("mismatch"));
            stop().await;
        });
        let _ = std::fs::remove_dir_all(dir);
    }
}
