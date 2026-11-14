//! Official Gemini ACP authentication; OAuth and credential storage stay in the CLI.
use super::*;
use tokio::io::AsyncWriteExt;

fn response(line: &str, id: u64) -> Option<Result<serde_json::Value, String>> {
    let value: serde_json::Value = serde_json::from_str(line).ok()?;
    if value.get("id")?.as_u64()? != id {
        return None;
    }
    if let Some(error) = value.get("error") {
        // Provider errors can contain authorization URLs. Keep credentials out of diagnostics.
        let raw = error["message"]
            .as_str()
            .unwrap_or("Google sign-in was not completed.");
        let safe = raw
            .split_whitespace()
            .map(|w| {
                if w.contains("http") || w.contains("token") || w.contains("secret") || w.len() > 80 {
                    "[hidden]"
                } else {
                    w
                }
            })
            .collect::<Vec<_>>()
            .join(" ");
        return Some(Err(safe.chars().take(600).collect()));
    }
    value.get("result").cloned().map(Ok)
}

pub(super) async fn authenticate(
    account: &AccountProfile,
    cancel: Arc<AtomicBool>,
    interactive: bool,
) -> Result<(), String> {
    let bin = find_bin("gemini").ok_or("Gemini CLI is not installed")?;
    let mut cmd = crate::new_command(bin);
    cmd.arg("--acp")
        .env("GEMINI_CLI_HOME", &account.config_dir)
        .current_dir(&account.config_dir)
        .kill_on_drop(true)
        .stdin(std::process::Stdio::piped())
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::null());
    // Never inherit API credentials or another account's authentication mode.
    for key in [
        "GEMINI_API_KEY",
        "GOOGLE_API_KEY",
        "GOOGLE_GENAI_USE_VERTEXAI",
        "GOOGLE_GENAI_USE_GCA",
        "GOOGLE_APPLICATION_CREDENTIALS",
    ] {
        cmd.env_remove(key);
    }
    if interactive {
        cmd.env_remove("NO_BROWSER");
    } else {
        cmd.env("NO_BROWSER", "true");
    }
    if let Some(node) = node_bin() {
        let mut paths = vec![node];
        if let Some(path) = std::env::var_os("PATH") {
            paths.extend(std::env::split_paths(&path));
        }
        cmd.env("PATH", std::env::join_paths(paths).map_err(|e| e.to_string())?);
    }
    let mut child = cmd.spawn().map_err(|e| format!("Cannot start Gemini: {e}"))?;
    let mut input = child.stdin.take().ok_or("Gemini input unavailable")?;
    let mut lines = BufReader::new(child.stdout.take().ok_or("Gemini output unavailable")?).lines();
    let operation = async {
        for (id, method, params) in [
            (
                1,
                "initialize",
                serde_json::json!({"protocolVersion":1,"clientInfo":{"name":"nexus","version":"0.20.2"},"clientCapabilities":{}}),
            ),
            (
                2,
                "authenticate",
                serde_json::json!({"methodId":"oauth-personal"}),
            ),
        ] {
            let request = serde_json::json!({"jsonrpc":"2.0","id":id,"method":method,"params":params});
            input
                .write_all(format!("{request}\n").as_bytes())
                .await
                .map_err(|e| e.to_string())?;
            loop {
                let line = lines
                    .next_line()
                    .await
                    .map_err(|e| e.to_string())?
                    .ok_or("Gemini closed the connection. Update Gemini CLI and retry.")?;
                if let Some(result) = response(&line, id) {
                    let value = result?;
                    if id == 1
                        && !value
                            .get("authMethods")
                            .and_then(|v| v.as_array())
                            .map(|items| items.iter().any(|v| v["id"] == "oauth-personal"))
                            .unwrap_or(false)
                    {
                        return Err(
                            "This Gemini CLI does not support Google sign-in through ACP. Update the agent."
                                .into(),
                        );
                    }
                    break;
                }
            }
        }
        Ok(())
    };
    let cancelled = async {
        loop {
            if cancel.load(Ordering::Relaxed) {
                break;
            }
            tokio::time::sleep(Duration::from_millis(100)).await;
        }
    };
    let result = tokio::select! {
     result=tokio::time::timeout(Duration::from_secs(if interactive {360}else{20}),operation)=>result.unwrap_or_else(|_|Err("Google sign-in timed out. Retry connecting.".into())),
     _=cancelled=>Err("cancelled".into())
    };
    let _ = child.kill().await;
    let _ = child.wait().await;
    result
}

pub(super) async fn check(account: &AccountProfile) -> AccountCheck {
    // No browser is opened by a background status check.
    if !PathBuf::from(&account.config_dir)
        .join(".gemini/oauth_creds.json")
        .is_file()
    {
        return AccountCheck {
            status: "login_required".into(),
            detail: "Connect with your Google account to sign in.".into(),
        };
    }
    match authenticate(account, Arc::new(AtomicBool::new(false)), false).await {
        Ok(()) => AccountCheck {
            status: "ready".into(),
            detail: "Google sign-in verified by Gemini CLI.".into(),
        },
        Err(detail) => AccountCheck {
            status: "login_required".into(),
            detail,
        },
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn protocol_responses_are_scoped_and_errors_redacted() {
        assert!(response(r#"{"id":7,"result":{}}"#, 2).is_none());
        assert!(response("not json", 2).is_none());
        assert!(response(r#"{"id":2,"result":null}"#, 2).unwrap().is_ok());
        let error = response(r#"{"id":2,"error":{"message":"secret-token"}}"#, 2)
            .unwrap()
            .unwrap_err();
        assert!(!error.contains("secret-token"));
    }
}
