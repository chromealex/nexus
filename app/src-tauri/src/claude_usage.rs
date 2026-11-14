//! Claude usage readers: localhost bridge, diagnostics, Accessibility and statusLine collector.
//! Moved out of lib.rs; shared helpers come from the crate root.
use super::*;

// Localhost-only Chrome extension bridge. No Claude cookies or OAuth tokens cross this boundary.
pub(crate) fn bridge_dir() -> PathBuf {
    home().join("Library/Application Support/NEXUS/usage-bridge")
}
pub(crate) fn bridge_token() -> Result<String, String> {
    let dir = bridge_dir();
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let file = dir.join("token");
    if let Ok(v) = std::fs::read_to_string(&file) {
        if v.len() == 64 && v.chars().all(|c| c.is_ascii_hexdigit()) {
            return Ok(v);
        }
    }
    let mut bytes = [0u8; 32];
    std::fs::File::open("/dev/urandom")
        .and_then(|mut f| f.read_exact(&mut bytes))
        .map_err(|e| e.to_string())?;
    let token = bytes.iter().map(|b| format!("{b:02x}")).collect::<String>();
    std::fs::write(&file, &token).map_err(|e| e.to_string())?;
    Ok(token)
}
#[derive(Deserialize, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub(crate) struct WebUsage {
    pub(crate) profile_id: String,
    pub(crate) used: f64,
    pub(crate) reset: Option<String>,
    pub(crate) recorded_at: String,
    pub(crate) source: String,
}
pub(crate) fn usage_path(id: &str) -> PathBuf {
    bridge_dir().join(format!("{id}.json"))
}
pub(crate) fn handle_usage_client(mut stream: TcpStream) {
    let _ = stream.set_read_timeout(Some(Duration::from_secs(5)));
    let mut buf = Vec::new();
    let mut tmp = [0u8; 4096];
    let mut header_end = None;
    while buf.len() < 32768 {
        let n = match stream.read(&mut tmp) {
            Ok(0) | Err(_) => break,
            Ok(n) => n,
        };
        buf.extend_from_slice(&tmp[..n]);
        if let Some(i) = buf.windows(4).position(|x| x == b"\r\n\r\n") {
            header_end = Some(i + 4);
            break;
        }
    }
    let mut code = "400 Bad Request";
    let mut message = "Bad request".to_string();
    if let Some(end) = header_end {
        let header = String::from_utf8_lossy(&buf[..end]);
        let size = header
            .lines()
            .find_map(|l| {
                l.to_ascii_lowercase()
                    .strip_prefix("content-length:")
                    .and_then(|v| v.trim().parse::<usize>().ok())
            })
            .unwrap_or(0);
        let token = header
            .lines()
            .find_map(|l| {
                l.strip_prefix("X-Nexus-Token:")
                    .or_else(|| l.strip_prefix("x-nexus-token:"))
                    .map(|v| v.trim().to_string())
            })
            .unwrap_or_default();
        if header.starts_with("POST /usage ") && size > 0 && size <= 4096 {
            while buf.len() - end < size {
                let n = match stream.read(&mut tmp) {
                    Ok(0) | Err(_) => break,
                    Ok(n) => n,
                };
                buf.extend_from_slice(&tmp[..n]);
            }
            if token != bridge_token().unwrap_or_default() {
                code = "403 Forbidden";
                message = "Invalid bridge token".into()
            } else if buf.len() - end >= size {
                let result = serde_json::from_slice::<WebUsage>(&buf[end..end + size]);
                match result {
                    Ok(usage) => {
                        let valid = usage.used.is_finite()
                            && (0.0..=100.0).contains(&usage.used)
                            && usage
                                .profile_id
                                .chars()
                                .all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_')
                            && usage.profile_id.len() < 100
                            && usage.reset.as_ref().map(|s| s.len() < 160).unwrap_or(true)
                            && usage.recorded_at.len() < 64
                            && usage.source.len() < 100;
                        let exists = load_profiles()
                            .unwrap_or_default()
                            .iter()
                            .any(|p| p.id == usage.profile_id && p.provider == "claude");
                        if valid && exists {
                            if std::fs::write(
                                usage_path(&usage.profile_id),
                                serde_json::to_vec(&usage).unwrap_or_default(),
                            )
                            .is_ok()
                            {
                                code = "200 OK";
                                message = "Saved".into()
                            } else {
                                code = "500 Internal Server Error";
                                message = "Could not save usage".into()
                            }
                        } else {
                            code = "422 Unprocessable Entity";
                            message = "Invalid or unknown Claude profile".into()
                        }
                    }
                    Err(_) => {
                        code = "422 Unprocessable Entity";
                        message = "Invalid usage JSON".into()
                    }
                }
            }
        }
    }
    let response=format!("HTTP/1.1 {code}\r\nContent-Type: text/plain\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{message}",message.len());
    let _ = stream.write_all(response.as_bytes());
}
pub(crate) fn start_usage_bridge() {
    std::thread::spawn(|| {
        if bridge_token().is_err() {
            return;
        }
        let listener = match TcpListener::bind("127.0.0.1:38471") {
            Ok(l) => l,
            Err(e) => {
                eprintln!("NEXUS usage bridge bind error: {e}");
                return;
            }
        };
        for stream in listener.incoming().flatten() {
            std::thread::spawn(move || handle_usage_client(stream));
        }
    });
}
#[tauri::command]
pub(crate) fn usage_bridge_token() -> Result<String, String> {
    bridge_token()
}
#[tauri::command]
pub(crate) fn usage_bridge_snapshot(id: String) -> Result<Option<WebUsage>, String> {
    let account = load_profiles()?
        .into_iter()
        .find(|a| a.id == id && a.provider == "claude")
        .ok_or("Claude profile not found")?;
    let _ = account;
    let path = usage_path(&id);
    if !path.exists() {
        return Ok(None);
    }
    let data = std::fs::read(path).map_err(|e| e.to_string())?;
    serde_json::from_slice(&data).map(Some).map_err(|e| e.to_string())
}

#[cfg(target_os = "macos")]
unsafe extern "C" {
    fn nexus_claude_ax_collect() -> *mut std::os::raw::c_char;
    fn nexus_claude_ax_free(ptr: *mut std::os::raw::c_char);
    fn nexus_claude_ax_diagnostics() -> *mut std::os::raw::c_char;
}
#[tauri::command]
pub(crate) async fn nexus_diagnostics() -> Result<serde_json::Value, String> {
    #[cfg(target_os = "macos")]
    {
        let ptr = unsafe { nexus_claude_ax_diagnostics() };
        if ptr.is_null() {
            return Err("Native diagnostics returned no data".into());
        }
        let json = unsafe { std::ffi::CStr::from_ptr(ptr).to_string_lossy().into_owned() };
        unsafe { nexus_claude_ax_free(ptr) };
        let mut v: serde_json::Value = serde_json::from_str(&json).map_err(|e| e.to_string())?;
        // CLI status per profile is checked with the same profile-specific environment
        // as the Accounts > Check button, not the user's default ~/.claude.
        let profiles = load_profiles()?;
        let mut checks = Vec::new();
        for p in profiles {
            if p.provider != "claude" {
                continue;
            }
            let check = check_account(p.id.clone()).await;
            checks.push(serde_json::json!({
             "profileId":p.id,"profileName":p.name,
             "configDir":p.config_dir,
             "configDirExists":PathBuf::from(&p.config_dir).is_dir(),
             "status":check.as_ref().map(|c|c.status.as_str()).unwrap_or("error"),
             "detail":check.as_ref().map(|c| {
               if c.status=="ready"{"Authenticated".to_string()}
               else if c.status=="login_required"{"CLI reports not logged in".to_string()}
               else{"CLI status check failed or timed out".to_string()}
             }).unwrap_or_else(|_|"Status check failed".into())
            }));
        }
        v["claudeProfiles"] = serde_json::json!(checks);
        Ok(v)
    }
    #[cfg(not(target_os = "macos"))]
    {
        Err("Diagnostics require macOS".into())
    }
}
#[tauri::command]
pub(crate) async fn claude_accessibility_usage() -> Result<serde_json::Value, String> {
    #[cfg(target_os = "macos")]
    {
        // Run on a blocking worker, not the Tauri UI thread.
        tauri::async_runtime::spawn_blocking(|| {
            let ptr = unsafe { nexus_claude_ax_collect() };
            if ptr.is_null() {
                return Err("Native Accessibility collector returned no data".into());
            }
            let json = unsafe { std::ffi::CStr::from_ptr(ptr) }
                .to_string_lossy()
                .into_owned();
            unsafe { nexus_claude_ax_free(ptr) };
            serde_json::from_str(&json).map_err(|e| format!("Invalid native collector response: {e}"))
        })
        .await
        .map_err(|e| e.to_string())?
    }
    #[cfg(not(target_os = "macos"))]
    {
        Err("Claude Accessibility requires macOS".into())
    }
}

pub(crate) fn claude_statusline_dir() -> PathBuf {
    home().join("Library/Application Support/NEXUS/claude-statusline")
}
pub(crate) fn statusline_profile(id: &str) -> Result<AccountProfile, String> {
    load_profiles()?
        .into_iter()
        .find(|a| a.id == id && a.provider == "claude")
        .ok_or("Claude profile not found".into())
}
pub(crate) fn statusline_path(id: &str) -> PathBuf {
    claude_statusline_dir().join(format!("{id}.json"))
}
// Claude Code headless stream-json emits `rate_limit_event` per turn. Newer CLIs include
// `unifiedWindows.{five_hour,seven_day}.utilization` (fraction 0..1). Older ones only report
// status/resetsAt/rateLimitType; then only a `rejected` status is evidence (100% used).
// Never estimate a percentage that the CLI did not report.
pub(crate) fn rl_reset(v: Option<&serde_json::Value>) -> Option<i64> {
    let n = v?.as_i64().or_else(|| v?.as_f64().map(|f| f as i64))?;
    if n <= 0 {
        return None;
    }
    Some(if n > 1_000_000_000_000 { n / 1000 } else { n })
}
pub(crate) fn rl_window(v: &serde_json::Value) -> Option<serde_json::Value> {
    let u = v
        .get("utilization")
        .and_then(|n| n.as_f64())
        .filter(|n| n.is_finite() && (0.0..=1.0).contains(n))?;
    Some(
        serde_json::json!({"usedPercent":(u*1000.0).round()/10.0,"resetAt":rl_reset(v.get("resetsAt").or_else(||v.get("resets_at")))}),
    )
}
pub(crate) fn claude_rate_limit_windows(
    info: &serde_json::Value,
    previous: Option<&serde_json::Value>,
) -> Option<serde_json::Value> {
    let mut five = None;
    let mut seven = None;
    if let Some(w) = info.get("unifiedWindows").filter(|w| w.is_object()) {
        five = w.get("five_hour").and_then(rl_window);
        seven = w.get("seven_day").and_then(rl_window);
    }
    let kind = info.get("rateLimitType").and_then(|v| v.as_str()).unwrap_or("");
    let single = if info.get("utilization").is_some() {
        rl_window(info)
    } else if info.get("status").and_then(|v| v.as_str()) == Some("rejected") {
        Some(serde_json::json!({"usedPercent":100.0,"resetAt":rl_reset(info.get("resetsAt"))}))
    } else {
        None
    };
    if let Some(s) = single {
        match kind {
            "five_hour" if five.is_none() => five = Some(s),
            "seven_day" if seven.is_none() => seven = Some(s),
            _ => {}
        }
    }
    if five.is_none() && seven.is_none() {
        return None;
    }
    // A partial event keeps the other window only from a recent (<=10 min) previous reading.
    if let Some(p) = previous {
        if five.is_none() {
            five = p.get("fiveHour").filter(|v| !v.is_null()).cloned()
        }
        if seven.is_none() {
            seven = p.get("sevenDay").filter(|v| !v.is_null()).cloned()
        }
    }
    Some(serde_json::json!({"fiveHour":five,"sevenDay":seven}))
}
pub(crate) fn record_claude_rate_limit(id: &str, info: &serde_json::Value) -> bool {
    if id.is_empty()
        || !id
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_')
    {
        return false;
    }
    let path = statusline_path(id);
    let age = std::fs::metadata(&path)
        .ok()
        .and_then(|m| m.modified().ok())
        .and_then(|t| t.elapsed().ok())
        .map(|d| d.as_secs())
        .unwrap_or(u64::MAX);
    let previous = if age <= 600 {
        std::fs::read(&path)
            .ok()
            .and_then(|b| serde_json::from_slice::<serde_json::Value>(&b).ok())
    } else {
        None
    };
    let Some(mut data) = claude_rate_limit_windows(info, previous.as_ref()) else {
        return false;
    };
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default();
    let received = chrono_like_iso(now.as_secs());
    data["receivedAt"] = serde_json::json!(received);
    data["source"] = serde_json::json!("Claude Code stream-json rate_limit_event");
    let dir = claude_statusline_dir();
    if std::fs::create_dir_all(&dir).is_err() {
        return false;
    }
    let tmp = dir.join(format!("{id}.json.tmp.{}", std::process::id()));
    std::fs::write(&tmp, serde_json::to_vec(&data).unwrap_or_default()).is_ok()
        && std::fs::rename(&tmp, &path).is_ok()
}
// RFC 3339 UTC timestamp without an extra date crate.
pub(crate) fn chrono_like_iso(secs: u64) -> String {
    let days = (secs / 86400) as i64;
    let rem = secs % 86400;
    let z = days + 719468;
    let era = z.div_euclid(146097);
    let doe = z - era * 146097;
    let yoe = (doe - doe / 1460 + doe / 36524 - doe / 146096) / 365;
    let y = yoe + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = doy - (153 * mp + 2) / 5 + 1;
    let m = if mp < 10 { mp + 3 } else { mp - 9 };
    let y = if m <= 2 { y + 1 } else { y };
    format!(
        "{:04}-{:02}-{:02}T{:02}:{:02}:{:02}Z",
        y,
        m,
        d,
        rem / 3600,
        (rem % 3600) / 60,
        rem % 60
    )
}
#[tauri::command]
pub(crate) fn claude_statusline_install(id: String) -> Result<String, String> {
    let account = statusline_profile(&id)?;
    if !id
        .chars()
        .all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_')
    {
        return Err("Invalid profile ID".into());
    }
    let node = find_bin("node").ok_or("Node.js is required for the statusLine adapter")?;
    let dir = claude_statusline_dir();
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let helper = dir.join("collector.cjs");
    // Preserve user edits to a pre-existing collector; upgrades only replace the
    // adapter if its content matches the previous bundled version or our known fix.
    let bundled = include_str!("claude_statusline.cjs");
    if !helper.exists() {
        std::fs::write(&helper, bundled).map_err(|e| e.to_string())?;
    } else {
        let current = std::fs::read_to_string(&helper).map_err(|e| e.to_string())?;
        let old = bundled.replace("v.used_percentage??v.used_percent", "v.used_percent");
        if current == old || current == bundled {
            std::fs::write(&helper, bundled).map_err(|e| e.to_string())?;
        } else {
            return Err(
                "Collector was modified outside NEXUS. Back it up before replacing; no files were changed."
                    .into(),
            );
        }
    }
    let settings = PathBuf::from(&account.config_dir).join("settings.json");
    let mut data: serde_json::Value = if settings.exists() {
        serde_json::from_slice(&std::fs::read(&settings).map_err(|e| e.to_string())?)
            .map_err(|e| format!("Cannot parse Claude settings.json: {e}"))?
    } else {
        serde_json::json!({})
    };
    let object = data
        .as_object_mut()
        .ok_or("Claude settings.json must be an object")?;
    if let Some(existing) = object.get("statusLine") {
        if !existing
            .get("command")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .contains("claude-statusline/collector.cjs")
        {
            return Err("This Claude profile already has a statusLine configured. NEXUS will not overwrite it. Configure a wrapper manually or remove the existing statusLine after backing it up.".into());
        }
    }
    // Quote arguments for the shell used by Claude Code. Profile IDs are validated.
    fn shell_quote(v: &str) -> String {
        format!("'{}'", v.replace("'", "'\\''"))
    }
    let cmd = format!(
        "{} {} {} {}",
        shell_quote(&node.to_string_lossy()),
        shell_quote(&helper.to_string_lossy()),
        shell_quote(&id),
        shell_quote(&dir.to_string_lossy())
    );
    object.insert(
        "statusLine".into(),
        serde_json::json!({"type":"command","command":cmd,"padding":0}),
    );
    std::fs::create_dir_all(&account.config_dir).map_err(|e| e.to_string())?;
    if settings.exists() {
        let backup = settings.with_extension("json.nexus-backup");
        if !backup.exists() {
            std::fs::copy(&settings, &backup).map_err(|e| e.to_string())?;
        }
    }
    let tmp = settings.with_extension("json.nexus-tmp");
    std::fs::write(&tmp, serde_json::to_vec_pretty(&data).map_err(|e| e.to_string())?)
        .map_err(|e| e.to_string())?;
    std::fs::rename(&tmp, &settings).map_err(|e| e.to_string())?;
    Ok("Status Line collector configured. Start an interactive Claude Code session using this NEXUS profile; rate-limit data appears only if the CLI includes it in its statusLine payload.".into())
}
#[tauri::command]
pub(crate) fn claude_statusline_read(id: String) -> Result<serde_json::Value, String> {
    let _account = statusline_profile(&id)?;
    let path = statusline_path(&id);
    if !path.exists() {
        return Ok(
            serde_json::json!({"status":"waiting","detail":"Лимиты появятся после первого ответа Claude в чате Nexus. Если CLI не передаёт проценты, обновите Claude Code."}),
        );
    }
    let data: serde_json::Value = serde_json::from_slice(&std::fs::read(&path).map_err(|e| e.to_string())?)
        .map_err(|e| e.to_string())?;
    let last = data.get("receivedAt").and_then(|v| v.as_str()).unwrap_or("");
    // The frontend shows the actual timestamp and explicitly marks old values stale.
    if data.get("fiveHour").and_then(|v| v.get("usedPercent")).is_none()
        && data.get("sevenDay").and_then(|v| v.get("usedPercent")).is_none()
    {
        return Ok(
            serde_json::json!({"status":"waiting","detail":"No usable limits in latest statusLine payload"}),
        );
    }
    Ok(serde_json::json!({"status":"available","data":data,"receivedAt":last}))
}
#[tauri::command]
pub(crate) fn claude_statusline_remove(id: String) -> Result<String, String> {
    let account = statusline_profile(&id)?;
    let settings = PathBuf::from(&account.config_dir).join("settings.json");
    if !settings.exists() {
        return Ok("No settings file".into());
    }
    let mut data: serde_json::Value =
        serde_json::from_slice(&std::fs::read(&settings).map_err(|e| e.to_string())?)
            .map_err(|e| e.to_string())?;
    let obj = data.as_object_mut().ok_or("Invalid settings.json")?;
    let owned = obj
        .get("statusLine")
        .and_then(|v| v.get("command"))
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .contains("claude-statusline/collector.cjs");
    if !owned {
        return Err("Status Line is not managed by NEXUS; nothing changed".into());
    }
    obj.remove("statusLine");
    let tmp = settings.with_extension("json.nexus-tmp");
    std::fs::write(&tmp, serde_json::to_vec_pretty(&data).map_err(|e| e.to_string())?)
        .map_err(|e| e.to_string())?;
    std::fs::rename(tmp, settings).map_err(|e| e.to_string())?;
    Ok("NEXUS Status Line collector removed; other settings preserved".into())
}

// Background probe: when there is no recent (<=10 min) Claude reading, send one tiny Haiku request
// with the profile's own CLI login and keep only the rate_limit_event. At most once per 10 minutes
// per profile; it uses a small part of the subscription quota. Runs in an empty folder so no
// project files or CLAUDE.md enter the request.
static CLAUDE_PROBES: std::sync::Mutex<Option<HashMap<String, u64>>> = std::sync::Mutex::new(None);
pub(crate) fn claude_probe_due(id: &str, at: u64) -> bool {
    let Ok(mut m) = CLAUDE_PROBES.lock() else {
        return false;
    };
    let map = m.get_or_insert_with(Default::default);
    if map.get(id).map(|t| at.saturating_sub(*t) < 600).unwrap_or(false) {
        return false;
    }
    map.insert(id.into(), at);
    true
}
fn claude_reading_fresh(id: &str) -> bool {
    let path = statusline_path(id);
    let recent = std::fs::metadata(&path)
        .ok()
        .and_then(|m| m.modified().ok())
        .and_then(|t| t.elapsed().ok())
        .map(|d| d.as_secs() <= 600)
        .unwrap_or(false);
    recent
        && std::fs::read(&path)
            .ok()
            .and_then(|b| serde_json::from_slice::<serde_json::Value>(&b).ok())
            .map(|v| {
                v.pointer("/fiveHour/usedPercent").is_some() || v.pointer("/sevenDay/usedPercent").is_some()
            })
            .unwrap_or(false)
}
#[tauri::command]
pub(crate) async fn claude_limits_probe(id: String) -> Result<bool, String> {
    let account = statusline_profile(&id)?;
    if claude_reading_fresh(&id) {
        return Ok(false);
    }
    let at = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs();
    if !claude_probe_due(&id, at) {
        return Ok(false);
    }
    let exe = find_bin("claude").ok_or("Claude Code не установлен")?;
    let dir = home().join("Library/Application Support/NEXUS/limit-probe");
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let mut child = Command::new(exe)
        .args([
            "-p",
            "Reply with OK",
            "--model",
            "haiku",
            "--output-format",
            "stream-json",
            "--verbose",
            "--max-turns",
            "1",
            "--permission-mode",
            "plan",
        ])
        .env("CLAUDE_CONFIG_DIR", &account.config_dir)
        .current_dir(&dir)
        .kill_on_drop(true)
        .stdin(std::process::Stdio::null())
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::null())
        .spawn()
        .map_err(|e| format!("Не удалось запустить Claude Code: {e}"))?;
    let stdout = child.stdout.take().ok_or("No stdout")?;
    let mut lines = BufReader::new(stdout).lines();
    let read = async {
        let mut got = false;
        while let Ok(Some(line)) = lines.next_line().await {
            let Ok(v) = serde_json::from_str::<serde_json::Value>(&line) else {
                continue;
            };
            if v["type"] == "rate_limit_event" && record_claude_rate_limit(&id, &v["rate_limit_info"]) {
                got = true;
            }
            if v["type"] == "result" {
                break;
            }
        }
        got
    };
    let got = tokio::time::timeout(Duration::from_secs(90), read)
        .await
        .unwrap_or(false);
    let _ = child.kill().await;
    let _ = child.wait().await;
    Ok(got)
}
