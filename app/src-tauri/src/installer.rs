//! Agent catalog detection and the queued CLI installer.
//! Moved out of lib.rs; shared helpers come from the crate root.
use super::*;

#[derive(Serialize)]
pub(crate) struct Integration {
    pub(crate) id: String,
    pub(crate) method: String,
    pub(crate) action: String,
    pub(crate) url: String,
}
#[tauri::command]
pub(crate) fn integrations() -> Vec<Integration> {
    [
        (
            "claude",
            "npm",
            "install",
            "https://code.claude.com/docs/en/setup",
        ),
        (
            "codex",
            "npm",
            "install",
            "https://developers.openai.com/codex/cli",
        ),
        (
            "gemini",
            "npm",
            "install",
            "https://github.com/google-gemini/gemini-cli",
        ),
        ("opencode", "npm", "install", "https://opencode.ai/docs/"),
        ("qwen", "npm", "install", "https://github.com/QwenLM/qwen-code"),
        ("aider", "uv", "install", "https://aider.chat/docs/install.html"),
        (
            "goose",
            "native",
            "guide",
            "https://block.github.io/goose/docs/getting-started/installation/",
        ),
        ("grok", "api", "connect", "https://docs.x.ai/"),
    ]
    .iter()
    .map(|(id, method, action, url)| Integration {
        id: id.to_string(),
        method: method.to_string(),
        action: action.to_string(),
        url: url.to_string(),
    })
    .collect()
}
#[tauri::command]
pub(crate) fn agents() -> Vec<Agent> {
    let mut items: Vec<Agent> = AGENTS
        .iter()
        .map(|(id, name, bin, pkg)| {
            let detected = if bin.is_empty() { None } else { find_bin(bin) };
            // Check NEXUS-managed installation directly even if the GUI process inherited an old PATH.
            let managed = if bin.is_empty() {
                None
            } else {
                let candidate = app_bin().join(bin);
                if candidate.is_file() {
                    Some(candidate)
                } else {
                    None
                }
            };
            let path = detected.or(managed);
            Agent {
                id: id.to_string(),
                name: name.to_string(),
                installed: path.is_some(),
                path: path.map(|p| p.display().to_string()),
                installable: pkg.is_some() || ["aider", "goose", "antigravity"].contains(id),
            }
        })
        .collect();
    for a in custom_agents::load()
        .unwrap_or_default()
        .into_iter()
        .filter(|a| a.verified)
    {
        items.push(Agent {
            id: a.id,
            name: a.manifest.name,
            installed: std::path::Path::new(&a.path).is_file(),
            path: Some(a.path),
            installable: false,
        });
    }
    items
}
pub(crate) fn emit(app: &tauri::AppHandle, id: &str, phase: &str, msg: &str, success: Option<bool>) {
    let _ = app.emit(
        "install-event",
        InstallEvent {
            id: id.into(),
            phase: phase.into(),
            message: msg.into(),
            success,
        },
    );
}
pub(crate) async fn update(
    app: &tauri::AppHandle,
    jobs: &Arc<Mutex<HashMap<String, InstallStatus>>>,
    id: &str,
    phase: &str,
    msg: &str,
    success: Option<bool>,
) {
    jobs.lock().await.insert(
        id.into(),
        InstallStatus {
            id: id.into(),
            phase: phase.into(),
            message: msg.into(),
            success,
        },
    );
    emit(app, id, phase, msg, success);
}
#[tauri::command]
pub(crate) async fn install_status(state: tauri::State<'_, State>) -> Result<Vec<InstallStatus>, String> {
    Ok(state.jobs.lock().await.values().cloned().collect())
}
#[tauri::command]
pub(crate) async fn cancel_install(state: tauri::State<'_, State>, id: String) -> Result<(), String> {
    let flags = state.cancels.lock().await;
    if let Some(flag) = flags.get(&id) {
        flag.store(true, Ordering::SeqCst);
        Ok(())
    } else {
        Err("No active installation".into())
    }
}
#[tauri::command]
pub(crate) async fn install_agent(
    app: tauri::AppHandle,
    state: tauri::State<'_, State>,
    id: String,
) -> Result<(), String> {
    if !AGENTS
        .iter()
        .any(|a| a.0 == id && (a.3.is_some() || ["aider", "goose", "antigravity"].contains(&a.0)))
    {
        return Err("No supported automatic installer".into());
    }
    {
        let jobs = state.jobs.lock().await;
        if jobs.get(&id).is_some_and(|j| {
            matches!(
                j.phase.as_str(),
                "queued" | "checking" | "installing" | "verifying"
            )
        }) {
            return Err("Installation already queued or running".into());
        }
    }
    let flag = Arc::new(AtomicBool::new(false));
    state.cancels.lock().await.insert(id.clone(), flag.clone());
    let jobs = state.jobs.clone();
    let lock = state.install_lock.clone();
    update(&app, &jobs, &id, "queued", "Waiting for installer lock", None).await;
    tauri::async_runtime::spawn(async move {
        let guard = lock.lock_owned().await;
        if flag.load(Ordering::SeqCst) {
            update(
                &app,
                &jobs,
                &id,
                "cancelled",
                "Cancelled before starting",
                Some(false),
            )
            .await;
            drop(guard);
            return;
        }
        update(&app, &jobs, &id, "checking", "Installer started", None).await;
        let result = install_agent_inner(&app, &id, flag.clone()).await;
        if let Err(reason) = result {
            let phase = if flag.load(Ordering::SeqCst) {
                "cancelled"
            } else {
                "failed"
            };
            update(&app, &jobs, &id, phase, &reason, Some(false)).await;
        } else {
            update(
                &app,
                &jobs,
                &id,
                "installed",
                "Installed successfully. Connect an account in Accounts.",
                Some(true),
            )
            .await;
        }
        drop(guard);
    });
    Ok(())
}
pub(crate) async fn install_agent_inner(
    app: &tauri::AppHandle,
    id: &str,
    cancel: Arc<AtomicBool>,
) -> Result<(), String> {
    if ["goose", "antigravity"].contains(&id) {
        return native_install::install(app, id, cancel).await;
    }
    if id == "aider" {
        emit(app, id, "checking", "Looking for uv package manager", None);
        let uv=find_bin("uv").ok_or("uv is not installed. Install uv from https://docs.astral.sh/uv/getting-started/installation/ then retry")?;
        emit(app, id, "installing", "Running uv tool install aider-chat", None);
        let mut cmd = Command::new(uv);
        cmd.args(["tool", "install", "aider-chat"])
            .current_dir(home())
            .stdout(std::process::Stdio::piped())
            .stderr(std::process::Stdio::piped());
        let result = tokio::time::timeout(Duration::from_secs(600), cmd.output())
            .await
            .map_err(|_| "Aider install timed out".to_string())?
            .map_err(|e| e.to_string())?;
        emit(
            app,
            id,
            "installing",
            &String::from_utf8_lossy(&result.stdout),
            None,
        );
        emit(
            app,
            id,
            "installing",
            &String::from_utf8_lossy(&result.stderr),
            None,
        );
        if !result.status.success() {
            return Err(format!("uv exited: {}", result.status));
        }
        emit(app, id, "verifying", "Checking Aider executable", None);
        if find_bin("aider").is_none() && !home().join(".local/bin/aider").exists() {
            return Err("Aider installed but executable not found; check ~/.local/bin".into());
        }
        return Ok(());
    }
    let (bin, pkg) = AGENTS
        .iter()
        .find(|a| a.0 == id)
        .and_then(|a| a.3.map(|p| (a.2, p)))
        .ok_or("No supported automatic installer")?;
    emit(app, id, "queued", "Waiting for the installation queue", None);
    emit(app, id, "checking", "Checking local Node.js and npm", None);
    let node =
        node_bin().ok_or("Node.js/npm not found. Install Node.js 22+ using nvm, then restart NEXUS.")?;
    let version = Command::new(node.join("node"))
        .arg("--version")
        .output()
        .await
        .map_err(|e| e.to_string())?;
    let v = String::from_utf8_lossy(&version.stdout);
    let major = v
        .trim()
        .trim_start_matches('v')
        .split('.')
        .next()
        .unwrap_or("0")
        .parse::<u32>()
        .unwrap_or(0);
    emit(
        app,
        id,
        "checking",
        &format!("Node.js {} detected", v.trim()),
        None,
    );
    if major < 22 {
        return Err(format!("Node.js 22+ required; detected {}", v.trim()));
    }
    let prefix = home().join("Library/Application Support/NEXUS");
    std::fs::create_dir_all(prefix.join("bin")).map_err(|e| e.to_string())?;
    emit(
        app,
        id,
        "installing",
        &format!("Installing {} using npm", pkg),
        None,
    );
    // Invoke npm's JS entrypoint with the selected Node binary. Avoid macOS GUI PATH/shebang problems.
    let npm_js = node.join("../lib/node_modules/npm/bin/npm-cli.js");
    if !npm_js.is_file() {
        return Err(format!("npm-cli.js not found at {}", npm_js.display()));
    }
    emit(
        app,
        id,
        "checking",
        &format!("Using npm {}", npm_js.display()),
        None,
    );
    let mut cmd = Command::new(node.join("node"));
    cmd.arg(&npm_js);
    cmd.args(["install", "-g", pkg, "--no-audit", "--no-fund"])
        .env("NPM_CONFIG_PREFIX", &prefix)
        .env(
            "PATH",
            format!("{}:{}", node.display(), std::env::var("PATH").unwrap_or_default()),
        )
        .current_dir(home())
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped());
    emit(app, id, "installing", "Starting npm process...", None);
    cmd.kill_on_drop(true);
    let mut child = cmd.spawn().map_err(|e| format!("Cannot start npm: {}", e))?;
    let stdout = child.stdout.take().ok_or("Missing stdout")?;
    let stderr = child.stderr.take().ok_or("Missing stderr")?;
    let a = app.clone();
    let ident = id.to_string();
    let output = tokio::spawn(async move {
        let mut r = BufReader::new(stdout).lines();
        while let Ok(Some(line)) = r.next_line().await {
            emit(&a, &ident, "installing", &line, None);
        }
    });
    let a = app.clone();
    let ident = id.to_string();
    let errors = tokio::spawn(async move {
        let mut r = BufReader::new(stderr).lines();
        while let Ok(Some(line)) = r.next_line().await {
            emit(&a, &ident, "installing", &line, None);
        }
    });
    let status: std::process::ExitStatus = {
        let mut ticker = tokio::time::interval(Duration::from_secs(2));
        let deadline = tokio::time::sleep(Duration::from_secs(600));
        tokio::pin!(deadline);
        loop {
            tokio::select! {
              r=child.wait()=>break r.map_err(|e|e.to_string())?,
              _=ticker.tick()=>{
                if cancel.load(Ordering::SeqCst){
                  let _=child.kill().await;
                  return Err("Installation cancelled".into())
                }
                emit(app,id,"installing","Still running; waiting for npm output...",None);
              },
              _=&mut deadline=>{
                let _=child.kill().await;
                return Err("Installation timed out after 10 minutes".into())
              }
            }
        }
    };
    let _ = output.await;
    let _ = errors.await;
    if !status.success() {
        return Err(format!("npm exited: {}", status));
    }
    emit(app, id, "verifying", "Verifying installed CLI executable", None);
    if !prefix.join("bin").join(bin).exists() {
        return Err("CLI executable not found after npm install".into());
    }
    emit(
        app,
        id,
        "installed",
        "Installed successfully. Login is still required.",
        Some(true),
    );
    Ok(())
}
