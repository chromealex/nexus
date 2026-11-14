//! Account profiles, sign-in, quota and account checks.
//! Moved out of lib.rs; shared helpers come from the crate root.
use super::*;

#[derive(Clone, Serialize, Deserialize)]
pub(crate) struct AccountProfile {
    pub(crate) id: String,
    pub(crate) provider: String,
    pub(crate) name: String,
    pub(crate) status: String,
    pub(crate) config_dir: String,
}
pub(crate) fn profiles_path() -> PathBuf {
    home().join("Library/Application Support/NEXUS/accounts.json")
}
pub(crate) fn load_profiles() -> Result<Vec<AccountProfile>, String> {
    let p = profiles_path();
    if !p.exists() {
        return Ok(Vec::new());
    }
    let data = std::fs::read_to_string(p).map_err(|e| e.to_string())?;
    serde_json::from_str(&data).map_err(|e| e.to_string())
}
pub(crate) fn save_profiles(items: &[AccountProfile]) -> Result<(), String> {
    let p = profiles_path();
    std::fs::create_dir_all(p.parent().ok_or("Invalid path")?).map_err(|e| e.to_string())?;
    let temp = p.with_extension("tmp");
    std::fs::write(
        &temp,
        serde_json::to_vec_pretty(items).map_err(|e| e.to_string())?,
    )
    .map_err(|e| e.to_string())?;
    std::fs::rename(temp, p).map_err(|e| e.to_string())
}
#[tauri::command]
pub(crate) fn list_accounts() -> Result<Vec<AccountProfile>, String> {
    load_profiles()
}
#[tauri::command]
pub(crate) fn add_account(provider: String, name: String) -> Result<AccountProfile, String> {
    if !["claude", "codex", "gemini"].contains(&provider.as_str()) {
        return Err("Account isolation not implemented for this provider".into());
    }
    if name.trim().is_empty() || name.len() > 60 {
        return Err("Profile name must be 1–60 characters".into());
    }
    let mut items = load_profiles()?;
    let id = format!("{}-{}", provider, project_id());
    let dir = home()
        .join("Library/Application Support/NEXUS/profiles")
        .join(&id);
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let item = AccountProfile {
        id,
        provider,
        name: name.trim().to_string(),
        status: "login_required".into(),
        config_dir: dir.to_string_lossy().to_string(),
    };
    items.push(item.clone());
    save_profiles(&items)?;
    Ok(item)
}
#[tauri::command]
pub(crate) async fn remove_account(state: tauri::State<'_, State>, id: String) -> Result<(), String> {
    // Refuse to delete a profile while its auth process is still running.
    {
        let jobs = state.auth_jobs.lock().await;
        if jobs
            .get(&id)
            .map(|j| j.phase == "starting" || j.phase == "waiting")
            .unwrap_or(false)
        {
            return Err("Cancel login and wait for it to stop before removing this profile".into());
        }
    }
    let mut items = load_profiles()?;
    let before = items.len();
    items.retain(|p| p.id != id);
    if items.len() == before {
        return Err("Account not found".into());
    }
    save_profiles(&items)?;
    state.auth_jobs.lock().await.remove(&id);
    state.auth_cancels.lock().await.remove(&id);
    // Credentials intentionally remain on disk; no other profile is affected.
    Ok(())
}
#[derive(Clone, Serialize)]
pub(crate) struct AuthEvent {
    pub(crate) id: String,
    pub(crate) phase: String,
    pub(crate) message: String,
}
#[derive(Clone, Serialize)]
pub(crate) struct AuthStatus {
    pub(crate) id: String,
    pub(crate) phase: String,
    pub(crate) log: String,
}
#[tauri::command]
pub(crate) async fn auth_status(state: tauri::State<'_, State>, id: String) -> Result<AuthStatus, String> {
    let jobs = state.auth_jobs.lock().await;
    jobs.get(&id).cloned().ok_or_else(|| "No login started".into())
}
pub(crate) async fn auth_update(
    app: &tauri::AppHandle,
    jobs: &Arc<Mutex<HashMap<String, AuthStatus>>>,
    id: &str,
    phase: &str,
    message: &str,
) {
    let mut all = jobs.lock().await;
    if let Some(job) = all.get_mut(id) {
        job.phase = phase.into();
        job.log.push_str(message);
        job.log.push('\n');
        if job.log.len() > 20000 {
            job.log = job
                .log
                .chars()
                .rev()
                .take(16000)
                .collect::<String>()
                .chars()
                .rev()
                .collect();
        }
    }
    let _ = app.emit(
        "auth-event",
        AuthEvent {
            id: id.into(),
            phase: phase.into(),
            message: message.into(),
        },
    );
}
#[tauri::command]
pub(crate) async fn account_login(
    app: tauri::AppHandle,
    state: tauri::State<'_, State>,
    id: String,
) -> Result<String, String> {
    let account = load_profiles()?
        .into_iter()
        .find(|a| a.id == id)
        .ok_or("Account not found")?;
    let bin = find_bin(&account.provider).ok_or("CLI is not installed")?;
    if !["claude", "codex", "gemini"].contains(&account.provider.as_str()) {
        return Err("Unsupported provider".into());
    }
    {
        let mut jobs = state.auth_jobs.lock().await;
        if jobs
            .get(&id)
            .map(|j| j.phase == "starting" || j.phase == "waiting")
            .unwrap_or(false)
        {
            return Err("Login already running".into());
        }
        jobs.insert(
            id.clone(),
            AuthStatus {
                id: id.clone(),
                phase: "starting".into(),
                log: "Starting official login flow...\n".into(),
            },
        );
    }
    let jobs = state.auth_jobs.clone();
    let cancel = Arc::new(AtomicBool::new(false));
    state.auth_cancels.lock().await.insert(id.clone(), cancel.clone());
    tauri::async_runtime::spawn(async move {
        if account.provider == "gemini" {
            auth_update(&app,&jobs,&id,"waiting","Завершите вход в аккаунт Google в браузере. После подтверждения Nexus подключит аккаунт автоматически.").await;
            match gemini_auth::authenticate(&account, cancel, true).await {
                Ok(()) => {
                    auth_update(
                        &app,
                        &jobs,
                        &id,
                        "ready",
                        "Google account connected successfully.",
                    )
                    .await
                }
                Err(e) if e == "cancelled" => {
                    auth_update(&app, &jobs, &id, "cancelled", "Authentication cancelled.").await
                }
                Err(e) => auth_update(&app, &jobs, &id, "error", &e).await,
            }
            return;
        }
        let mut cmd = Command::new(bin);
        match account.provider.as_str() {
            "claude" => {
                cmd.args(["auth", "login"]);
                cmd.env("CLAUDE_CONFIG_DIR", &account.config_dir);
            }
            "codex" => {
                cmd.args(["login", "--device-auth"]);
                cmd.env("CODEX_HOME", &account.config_dir);
            }
            _ => unreachable!(),
        }
        cmd.current_dir(home())
            .stdin(std::process::Stdio::null())
            .stdout(std::process::Stdio::piped())
            .stderr(std::process::Stdio::piped());
        // CLI login flows may open the provider's system browser. Never capture or persist tokens.
        match cmd.spawn() {
            Err(e) => auth_update(&app, &jobs, &id, "error", &format!("Cannot start login: {e}")).await,
            Ok(mut child) => {
                auth_update(&app,&jobs,&id,"waiting","Complete the official provider login in your browser. Codex device login may show a code below.").await;
                let stdout = child.stdout.take();
                let stderr = child.stderr.take();
                let app1 = app.clone();
                let jobs1 = jobs.clone();
                let id1 = id.clone();
                let t1 = tauri::async_runtime::spawn(async move {
                    if let Some(out) = stdout {
                        let mut reader = BufReader::new(out);
                        let mut buf = [0u8; 1024];
                        while let Ok(n) = reader.read(&mut buf).await {
                            if n == 0 {
                                break;
                            }
                            auth_update(
                                &app1,
                                &jobs1,
                                &id1,
                                "waiting",
                                &String::from_utf8_lossy(&buf[..n]),
                            )
                            .await;
                        }
                    }
                });
                let app2 = app.clone();
                let jobs2 = jobs.clone();
                let id2 = id.clone();
                let t2 = tauri::async_runtime::spawn(async move {
                    if let Some(out) = stderr {
                        let mut reader = BufReader::new(out);
                        let mut buf = [0u8; 1024];
                        while let Ok(n) = reader.read(&mut buf).await {
                            if n == 0 {
                                break;
                            }
                            auth_update(
                                &app2,
                                &jobs2,
                                &id2,
                                "waiting",
                                &String::from_utf8_lossy(&buf[..n]),
                            )
                            .await;
                        }
                    }
                });
                let result = tokio::time::timeout(Duration::from_secs(900), async {
                    loop {
                        if cancel.load(Ordering::Relaxed) {
                            let _ = child.kill().await;
                            return Err("cancelled".to_string());
                        }
                        match child.try_wait() {
                            Ok(Some(exit)) => return Ok(exit),
                            Ok(None) => tokio::time::sleep(Duration::from_millis(250)).await,
                            Err(e) => return Err(e.to_string()),
                        }
                    }
                })
                .await;
                if result.is_err() {
                    let _ = child.kill().await;
                }
                let _ = t1.await;
                let _ = t2.await;
                match result {
                    Ok(Ok(exit)) if exit.success() => {
                        let mut check = Command::new(find_bin(&account.provider).unwrap());
                        if account.provider == "claude" {
                            check
                                .args(["auth", "status"])
                                .env("CLAUDE_CONFIG_DIR", &account.config_dir);
                        } else {
                            check
                                .args(["login", "status"])
                                .env("CODEX_HOME", &account.config_dir);
                        }
                        let verified = tokio::time::timeout(Duration::from_secs(15), check.output())
                            .await
                            .ok()
                            .and_then(Result::ok)
                            .map(|o| {
                                if !o.status.success() {
                                    return false;
                                }
                                if account.provider == "claude" {
                                    serde_json::from_slice::<serde_json::Value>(&o.stdout)
                                        .ok()
                                        .and_then(|v| v.get("loggedIn").and_then(|x| x.as_bool()))
                                        .unwrap_or(false)
                                } else {
                                    true
                                }
                            })
                            .unwrap_or(false);
                        if verified {
                            auth_update(&app, &jobs, &id, "ready", "Login verified successfully.").await;
                        } else {
                            auth_update(
                                &app,
                                &jobs,
                                &id,
                                "error",
                                "Login process finished, but CLI authentication verification failed.",
                            )
                            .await;
                        }
                    }
                    Ok(Ok(exit)) => {
                        auth_update(
                            &app,
                            &jobs,
                            &id,
                            "error",
                            &format!("Login exited with {exit}. See messages above."),
                        )
                        .await
                    }
                    Ok(Err(e)) if e == "cancelled" => {
                        auth_update(&app, &jobs, &id, "cancelled", "Authentication cancelled.").await
                    }
                    Ok(Err(e)) => auth_update(&app, &jobs, &id, "error", &format!("Login failed: {e}")).await,
                    Err(_) => {
                        auth_update(&app, &jobs, &id, "error", "Login timed out after 15 minutes.").await
                    }
                }
            }
        }
    });
    Ok("Authentication started".into())
}
#[tauri::command]
pub(crate) async fn cancel_auth(state: tauri::State<'_, State>, id: String) -> Result<(), String> {
    let cancels = state.auth_cancels.lock().await;
    if let Some(flag) = cancels.get(&id) {
        flag.store(true, Ordering::Relaxed);
        Ok(())
    } else {
        Err("No active authentication".into())
    }
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct QuotaReport {
    pub(crate) status: String,
    pub(crate) source: String,
    pub(crate) detail: String,
    pub(crate) primary_used_percent: Option<f64>,
    pub(crate) primary_reset_at: Option<i64>,
    pub(crate) primary_window_minutes: Option<i64>,
    pub(crate) secondary_window_minutes: Option<i64>,
    pub(crate) secondary_used_percent: Option<f64>,
    pub(crate) secondary_reset_at: Option<i64>,
    pub(crate) checked_at: u64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) plan_type: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) credits_balance: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) credits_unlimited: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) limit_name: Option<String>,
}
pub(crate) fn quota_unavailable(source: &str, detail: &str) -> QuotaReport {
    QuotaReport {
        status: "unavailable".into(),
        source: source.into(),
        detail: detail.into(),
        primary_used_percent: None,
        primary_reset_at: None,
        primary_window_minutes: None,
        secondary_window_minutes: None,
        secondary_used_percent: None,
        secondary_reset_at: None,
        checked_at: std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_secs(),
        plan_type: None,
        credits_balance: None,
        credits_unlimited: None,
        limit_name: None,
    }
}
pub(crate) fn pct(v: &serde_json::Value) -> Option<f64> {
    v.as_f64().filter(|n| n.is_finite() && *n >= 0.0 && *n <= 100.0)
}
fn safe_label(v: Option<&serde_json::Value>) -> Option<String> {
    v.and_then(|v| v.as_str())
        .map(|s| s.chars().filter(|c| !c.is_control()).take(60).collect::<String>())
        .filter(|s| !s.is_empty())
}
fn window_used(w: Option<&serde_json::Value>) -> Option<f64> {
    w.and_then(|w| {
        w.get("usedPercent")
            .or_else(|| w.get("used_percent"))
            .and_then(pct)
    })
}
fn snapshot_windows(snap: &serde_json::Value) -> (Option<&serde_json::Value>, Option<&serde_json::Value>) {
    let pick = |a: &str, b: &str| {
        snap.get(a)
            .or_else(|| snap.get(b))
            .filter(|w| window_used(Some(w)).is_some())
    };
    (
        pick("primary", "primaryWindow"),
        pick("secondary", "secondaryWindow"),
    )
}
pub(crate) fn parse_codex_quota(value: &serde_json::Value) -> Option<QuotaReport> {
    // Codex app-server account/rateLimits/read. Business/Enterprise workspaces may report windows
    // only in rateLimitsByLimitId, or only credits. Never derive percentages from credits.
    let result = value.get("result")?;
    let main = result
        .get("rateLimits")
        .filter(|v| v.is_object())
        .unwrap_or(result);
    let mut chosen = main;
    let (mut window, mut weekly) = snapshot_windows(main);
    if window.is_none() && weekly.is_none() {
        if let Some(map) = result.get("rateLimitsByLimitId").and_then(|m| m.as_object()) {
            let mut keys: Vec<&String> = map.keys().collect();
            keys.sort_by_key(|k| (k.as_str() != "codex", k.to_string()));
            for k in keys {
                let snap = &map[k];
                let (p, s2) = snapshot_windows(snap);
                if p.is_some() || s2.is_some() {
                    chosen = snap;
                    window = p;
                    weekly = s2;
                    break;
                }
            }
        }
    }
    let credits = main
        .get("credits")
        .filter(|c| c.is_object())
        .or_else(|| chosen.get("credits").filter(|c| c.is_object()));
    let unlimited = credits.and_then(|c| c.get("unlimited")).and_then(|v| v.as_bool());
    let balance = credits
        .and_then(|c| c.get("balance"))
        .and_then(|v| {
            v.as_str()
                .map(String::from)
                .or_else(|| v.as_f64().map(|n| n.to_string()))
        })
        .filter(|s| {
            !s.is_empty() && s.len() < 32 && s.chars().all(|c| c.is_ascii_digit() || c == '.' || c == '-')
        });
    let used = window_used(window);
    let used2 = window_used(weekly);
    if used.is_none() && used2.is_none() && balance.is_none() && unlimited != Some(true) {
        return None;
    }
    let mins = |w: Option<&serde_json::Value>| {
        w.and_then(|w| {
            w.get("windowDurationMins")
                .or_else(|| w.get("window_minutes"))
                .and_then(|v| v.as_i64())
        })
        .filter(|v| *v > 0)
    };
    let reset = |w: Option<&serde_json::Value>| {
        w.and_then(|w| {
            w.get("resetsAt")
                .or_else(|| w.get("resets_at"))
                .and_then(|v| v.as_i64())
        })
    };
    let mut q = quota_unavailable(
        "Codex app-server: account/rateLimits/read",
        "Provider-reported rate limit windows",
    );
    q.status = "available".into();
    q.primary_window_minutes = mins(window);
    q.secondary_window_minutes = mins(weekly);
    q.primary_used_percent = used;
    q.secondary_used_percent = used2;
    q.primary_reset_at = reset(window);
    q.secondary_reset_at = reset(weekly);
    q.plan_type = safe_label(chosen.get("planType").or_else(|| main.get("planType")));
    q.limit_name = safe_label(chosen.get("limitName")).or_else(|| safe_label(chosen.get("limitId")));
    q.credits_balance = balance;
    q.credits_unlimited = unlimited;
    if used.is_none() && used2.is_none() {
        q.detail = "Provider reported credits only; no usage windows for this plan".into();
    }
    Some(q)
}
// Diagnostics: structure only (keys and null-ness), or the provider's error message. Never values.
pub(crate) fn codex_quota_shape(value: &serde_json::Value) -> String {
    if let Some(e) = value.get("error") {
        let msg = e
            .get("message")
            .and_then(|m| m.as_str())
            .unwrap_or("")
            .chars()
            .filter(|c| !c.is_control())
            .take(200)
            .collect::<String>();
        return format!("Provider error: {msg}");
    }
    fn keys(v: &serde_json::Value) -> String {
        v.as_object()
            .map(|o| {
                o.iter()
                    .map(|(k, v)| format!("{k}{}", if v.is_null() { "=null" } else { "" }))
                    .collect::<Vec<_>>()
                    .join(",")
            })
            .unwrap_or_else(|| "not an object".into())
    }
    let r = value.get("result").unwrap_or(&serde_json::Value::Null);
    let rl = r.get("rateLimits").map(keys).unwrap_or_else(|| "absent".into());
    let by = r
        .get("rateLimitsByLimitId")
        .and_then(|m| m.as_object())
        .map(|m| m.len())
        .unwrap_or(0);
    format!(
        "No usage windows or credits in provider response (result: {}; rateLimits: {}; rateLimitsByLimitId: {})",
        keys(r),
        rl,
        by
    )
}
#[tauri::command]
pub(crate) async fn account_quota(id: String) -> Result<QuotaReport, String> {
    let account = load_profiles()?
        .into_iter()
        .find(|a| a.id == id)
        .ok_or("Account not found")?;
    if account.provider != "codex" {
        let source = format!("{} CLI", account.provider);
        let detail = if account.provider == "claude" {
            "Claude limits come from rate_limit_event in Claude Code stream-json after a chat reply, or from statusLine in an interactive session. Auth status is independent of quota. Do not substitute API usage or estimated tokens."
        } else {
            "No verified machine-readable subscription quota interface for this provider."
        };
        return Ok(quota_unavailable(&source, detail));
    }
    let exe = match find_bin("codex") {
        Some(p) => p,
        None => return Ok(quota_unavailable("Codex app-server", "Codex CLI not installed")),
    };
    let mut child = match Command::new(exe)
        .arg("app-server")
        .env("CODEX_HOME", &account.config_dir)
        .current_dir(home())
        .stdin(std::process::Stdio::piped())
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::null())
        .spawn()
    {
        Ok(p) => p,
        Err(e) => {
            return Ok(quota_unavailable(
                "Codex app-server",
                &format!("Could not start: {e}"),
            ))
        }
    };
    let request = async {
        use tokio::io::AsyncWriteExt;
        let mut input = child.stdin.take().ok_or("No stdin")?;
        input.write_all(b"{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"initialize\",\"params\":{\"clientInfo\":{\"name\":\"nexus\",\"version\":\"0.7.3\"},\"capabilities\":{}}}\n").await.map_err(|_|"Initialize write failed")?;
        input
            .write_all(b"{\"jsonrpc\":\"2.0\",\"method\":\"initialized\"}\n")
            .await
            .map_err(|_| "Initialized write failed")?;
        input
            .write_all(
                b"{\"jsonrpc\":\"2.0\",\"id\":2,\"method\":\"account/rateLimits/read\",\"params\":{}}\n",
            )
            .await
            .map_err(|_| "Rate limits request failed")?;
        input.flush().await.map_err(|_| "Flush failed")?;
        let stdout = child.stdout.take().ok_or("No stdout")?;
        let mut lines = BufReader::new(stdout).lines();
        for _ in 0..100 {
            let line = lines
                .next_line()
                .await
                .map_err(|_| "Read failed")?
                .ok_or("Connection closed")?;
            if let Ok(value) = serde_json::from_str::<serde_json::Value>(&line) {
                if value.get("id").and_then(|v| v.as_i64()) == Some(2) {
                    return Ok::<Result<QuotaReport, String>, &str>(
                        parse_codex_quota(&value).ok_or_else(|| codex_quota_shape(&value)),
                    );
                }
            }
        }
        Err("No rate-limit response")
    };
    let result = tokio::time::timeout(Duration::from_secs(10), request).await;
    let _ = child.kill().await;
    let _ = child.wait().await;
    Ok(match result {
        Ok(Ok(Ok(report))) => report,
        Ok(Ok(Err(shape))) => quota_unavailable("Codex app-server", &shape),
        Ok(Err(e)) => quota_unavailable("Codex app-server", e),
        Err(_) => quota_unavailable("Codex app-server", "Timed out after 10 seconds"),
    })
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ProfileIsolation {
    pub(crate) profile_id: String,
    pub(crate) config_dir: String,
    pub(crate) isolated_directory: bool,
    pub(crate) identity_verified: bool,
    pub(crate) detail: String,
}
#[tauri::command]
pub(crate) fn account_isolation() -> Result<Vec<ProfileIsolation>, String> {
    let items = load_profiles()?;
    let mut seen = std::collections::HashSet::new();
    Ok(items.iter().map(|a|{
  let unique=seen.insert(a.config_dir.clone());
  let expected=home().join("Library/Application Support/NEXUS/profiles").join(&a.id);
  let matches=PathBuf::from(&a.config_dir)==expected;
  ProfileIsolation{profile_id:a.id.clone(),config_dir:a.config_dir.clone(),
   isolated_directory:unique&&matches,identity_verified:false,
   detail:"Config directory isolation checked. Account identity is not verified; two profiles may use the same login.".into()}
 }).collect())
}
#[derive(Serialize)]
pub(crate) struct AccountCheck {
    pub(crate) status: String,
    pub(crate) detail: String,
}
#[tauri::command]
pub(crate) async fn check_account(id: String) -> Result<AccountCheck, String> {
    let account = load_profiles()?
        .into_iter()
        .find(|a| a.id == id)
        .ok_or("Account not found")?;
    if account.provider == "gemini" {
        return Ok(gemini_auth::check(&account).await);
    }
    let exe = find_bin(&account.provider).ok_or("CLI is not installed")?;
    let mut cmd = Command::new(exe);
    match account.provider.as_str() {
        "claude" => {
            cmd.args(["auth", "status"]);
            cmd.env("CLAUDE_CONFIG_DIR", &account.config_dir);
        }
        "codex" => {
            cmd.args(["login", "status"]);
            cmd.env("CODEX_HOME", &account.config_dir);
        }
        _ => {
            return Ok(AccountCheck {
                status: "unknown".into(),
                detail: "Automatic authentication check is not supported for this CLI yet".into(),
            })
        }
    }
    cmd.current_dir(home());
    let result = tokio::time::timeout(Duration::from_secs(15), cmd.output()).await;
    match result {
        Ok(Ok(out)) => {
            let mut detail = format!(
                "{} {}",
                String::from_utf8_lossy(&out.stdout),
                String::from_utf8_lossy(&out.stderr)
            );
            detail = detail.chars().take(400).collect();
            let ok = if account.provider == "claude" {
                out.status.success()
                    && serde_json::from_slice::<serde_json::Value>(&out.stdout)
                        .ok()
                        .and_then(|v| v.get("loggedIn").and_then(|v| v.as_bool()))
                        .unwrap_or(false)
            } else {
                out.status.success()
                    && detail.to_lowercase().contains("logged in")
                    && !detail.to_lowercase().contains("not logged in")
            };
            Ok(AccountCheck {
                status: if ok { "ready" } else { "login_required" }.into(),
                detail: if detail.trim().is_empty() {
                    format!("CLI exited with {}", out.status)
                } else {
                    detail
                },
            })
        }
        Ok(Err(e)) => Ok(AccountCheck {
            status: "error".into(),
            detail: e.to_string(),
        }),
        Err(_) => Ok(AccountCheck {
            status: "unknown".into(),
            detail: "Status check timed out".into(),
        }),
    }
}
#[tauri::command]
pub(crate) async fn open_codex_device_page() -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        let status = Command::new("/usr/bin/open")
            .arg("https://auth.openai.com/codex/device")
            .status()
            .await
            .map_err(|e| e.to_string())?;
        if !status.success() {
            return Err(format!("Could not open browser: {status}"));
        }
        Ok(())
    }
    #[cfg(not(target_os = "macos"))]
    {
        Err("This browser launcher is currently implemented for macOS only".into())
    }
}
#[tauri::command]
pub(crate) async fn open_external(url: String) -> Result<(), String> {
    let allowed = [
        "https://claude.ai/",
        "https://code.claude.com/",
        "https://developers.openai.com/",
        "https://github.com/",
        "https://opencode.ai/",
        "https://aider.chat/",
        "https://block.github.io/",
        "https://docs.x.ai/",
        "https://platform.claude.com/",
        "https://ai.google.dev/",
        "https://huggingface.co/Qwen/",
        "https://artificialanalysis.ai/",
        "https://arena.ai/",
    ];
    if !allowed.iter().any(|p| url.starts_with(p)) {
        return Err("Untrusted URL".into());
    }
    let status = Command::new("open")
        .arg(&url)
        .status()
        .await
        .map_err(|e| e.to_string())?;
    if !status.success() {
        return Err(format!("Browser open failed: {}", status));
    }
    Ok(())
}
