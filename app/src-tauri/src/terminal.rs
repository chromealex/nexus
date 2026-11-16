//! «Терминал» tab: commands the user types run in the chat's working folder (its worktree when it has one).
//! Each command is `zsh -lc` (`sh -c` off macOS) in its own process group; output streams to the interface as
//! `terminal-output` events and ends with `terminal-exit`. Stop kills the whole group. Agents never use this.
use super::*;
use serde_json::json;
use std::sync::LazyLock;
use tokio::io::AsyncReadExt as _;

const MAX_OUTPUT: usize = 4_000_000;
const MAX_PER_CHAT: usize = 4;

struct Running {
    chat_id: String,
    pid: Option<u32>,
}
static RUNS: LazyLock<std::sync::Mutex<HashMap<String, Running>>> =
    LazyLock::new(|| std::sync::Mutex::new(HashMap::new()));

fn shell() -> (&'static str, &'static str) {
    if cfg!(target_os = "macos") {
        ("/bin/zsh", "-lc")
    } else if cfg!(windows) {
        ("cmd.exe", "/C")
    } else {
        ("/bin/sh", "-c")
    }
}

pub(crate) fn chat_folder(chat_id: &str) -> Result<String, String> {
    let db = load_project_store()?;
    let chat = db
        .chats
        .iter()
        .find(|c| c.id == chat_id && c.deleted_at.is_none())
        .ok_or("Чат не найден")?;
    let project = db
        .projects
        .iter()
        .find(|p| p.id == chat.project_id)
        .ok_or("Проект не найден")?;
    chat_worktree::chat_workspace(chat, project)
}

#[tauri::command]
pub(crate) fn terminal_cwd(chat_id: String) -> Result<String, String> {
    chat_folder(&chat_id)
}

#[tauri::command]
pub(crate) async fn terminal_run(
    app: tauri::AppHandle,
    chat_id: String,
    command: String,
) -> Result<String, String> {
    let command = command.trim().to_string();
    if command.is_empty() || command.len() > 8000 {
        return Err("Команда пустая или длиннее 8000 символов".into());
    }
    let cwd = chat_folder(&chat_id)?;
    {
        let runs = RUNS.lock().map_err(|_| "Terminal lock failed")?;
        if runs.values().filter(|r| r.chat_id == chat_id).count() >= MAX_PER_CHAT {
            return Err(format!("В этом чате уже выполняется {MAX_PER_CHAT} команды"));
        }
    }
    let (sh, flag) = shell();
    let mut cmd = new_command(sh);
    cmd.arg(flag)
        .arg(&command)
        .current_dir(&cwd)
        .env("TERM", "dumb")
        .env("NO_COLOR", "1")
        .env("NEXUS_CHAT_ID", &chat_id)
        .stdin(std::process::Stdio::null())
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped())
        .kill_on_drop(true);
    #[cfg(unix)]
    cmd.process_group(0);
    let mut child = cmd
        .spawn()
        .map_err(|e| format!("Не удалось запустить {sh}: {e}"))?;
    let run_id = project_id();
    RUNS.lock().map_err(|_| "Terminal lock failed")?.insert(
        run_id.clone(),
        Running {
            chat_id: chat_id.clone(),
            pid: child.id(),
        },
    );
    let started = std::time::Instant::now();
    let total = Arc::new(std::sync::atomic::AtomicUsize::new(0));
    let mut readers = Vec::new();
    for (name, stream) in [
        (
            "stdout",
            child
                .stdout
                .take()
                .map(|s| Box::new(s) as Box<dyn tokio::io::AsyncRead + Unpin + Send>),
        ),
        (
            "stderr",
            child
                .stderr
                .take()
                .map(|s| Box::new(s) as Box<dyn tokio::io::AsyncRead + Unpin + Send>),
        ),
    ] {
        let Some(mut stream) = stream else { continue };
        let (app, chat, run, total) = (app.clone(), chat_id.clone(), run_id.clone(), total.clone());
        readers.push(tokio::spawn(async move {
            let mut buf = vec![0u8; 16384];
            let mut pending: Vec<u8> = Vec::new();
            loop {
                let n = match stream.read(&mut buf).await {
                    Ok(0) | Err(_) => break,
                    Ok(n) => n,
                };
                let before = total.fetch_add(n, Ordering::SeqCst);
                if before >= MAX_OUTPUT {
                    continue;
                }
                pending.extend_from_slice(&buf[..n]);
                // Keep an incomplete UTF-8 sequence for the next chunk.
                let cut = match std::str::from_utf8(&pending) {
                    Ok(_) => pending.len(),
                    Err(e) if e.error_len().is_none() => e.valid_up_to(),
                    Err(_) => pending.len(),
                };
                let text = String::from_utf8_lossy(&pending[..cut]).into_owned();
                pending.drain(..cut);
                if !text.is_empty() {
                    let _ = app.emit(
                        "terminal-output",
                        json!({"chatId": chat, "runId": run, "stream": name, "text": text}),
                    );
                }
                if before + n >= MAX_OUTPUT {
                    let _ = app.emit("terminal-output", json!({"chatId": chat, "runId": run, "stream": "meta", "text": "\n[вывод больше 4 МБ — дальше не показывается]\n"}));
                }
            }
        }));
    }
    let (app2, chat2, run2) = (app.clone(), chat_id.clone(), run_id.clone());
    tokio::spawn(async move {
        let status = child.wait().await;
        for r in readers {
            let _ = r.await;
        }
        if let Ok(mut runs) = RUNS.lock() {
            runs.remove(&run2);
        }
        let code = status.ok().and_then(|s| s.code());
        let _ = app2.emit(
            "terminal-exit",
            json!({"chatId": chat2, "runId": run2, "code": code, "ms": started.elapsed().as_millis() as u64}),
        );
    });
    Ok(run_id)
}

#[tauri::command]
pub(crate) fn terminal_stop(run_id: String) -> Result<(), String> {
    let pid = RUNS
        .lock()
        .map_err(|_| "Terminal lock failed")?
        .get(&run_id)
        .and_then(|r| r.pid);
    #[cfg(unix)]
    if let Some(pid) = pid {
        unsafe extern "C" {
            fn kill(pid: i32, signal: i32) -> i32;
        }
        unsafe {
            kill(-(pid as i32), 15);
        }
        std::thread::spawn(move || {
            std::thread::sleep(Duration::from_secs(2));
            // Only a group that is still ours: the record disappears as soon as the command exits.
            if RUNS.lock().map(|r| r.contains_key(&run_id)).unwrap_or(false) {
                unsafe {
                    kill(-(pid as i32), 9);
                }
            }
        });
    }
    #[cfg(not(unix))]
    let _ = pid;
    Ok(())
}
