use serde_json::{json, Value};
use tauri::Emitter;
use tokio::{
    io::{AsyncBufReadExt, AsyncReadExt, AsyncWriteExt, BufReader},
    process::Command,
};

fn publish(app: &tauri::AppHandle, chat: &str, text: &str) {
    let _ = app.emit("chat-text", json!({"chatId":chat,"text":text}));
}
async fn write(stdin: &mut tokio::process::ChildStdin, value: Value) -> Result<(), String> {
    stdin
        .write_all(format!("{value}\n").as_bytes())
        .await
        .map_err(|e| e.to_string())
}
async fn next_event<R: tokio::io::AsyncBufRead + Unpin>(
    lines: &mut tokio::io::Lines<R>,
    idle: std::time::Duration,
) -> Result<Option<String>, String> {
    tokio::time::timeout(idle, lines.next_line())
        .await
        .map_err(|_| "Agent idle timeout: no protocol events for 30 minutes".to_string())?
        .map_err(|e| e.to_string())
}
// Only answer text enters the chat; all other protocol events remain diagnostics.
pub async fn run(
    mut cmd: Command,
    provider: &str,
    prompt: &str,
    workspace: &str,
    app: &tauri::AppHandle,
    chat: &str,
    images: &[String],
    control: &super::chat_runs::Control,
) -> Result<(String, String), String> {
    if control.stopped() {
        return Err(super::chat_runs::STOPPED.into());
    }
    cmd.kill_on_drop(true)
        .stdin(std::process::Stdio::piped())
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped());
    #[cfg(unix)]
    cmd.process_group(0);
    let mut child = cmd.spawn().map_err(|e| e.to_string())?;
    let _group = super::process_group::Group::new(&child);
    let mut stdin = child.stdin.take().ok_or("Missing agent stdin")?;
    let mut lines = BufReader::new(child.stdout.take().ok_or("Missing agent stdout")?).lines();
    let mut stderr = child.stderr.take().ok_or("Missing agent stderr")?;
    let err_task = tokio::spawn(async move {
        let mut saved = Vec::new();
        let mut buf = [0u8; 4096];
        while let Ok(n) = stderr.read(&mut buf).await {
            if n == 0 {
                break;
            }
            let keep = n.min(20000usize.saturating_sub(saved.len()));
            saved.extend_from_slice(&buf[..keep]);
        }
        String::from_utf8_lossy(&saved).to_string()
    });
    let operation = async {
        let mut answer = String::new();
        let mut diagnostics = String::new();
        let mut completed = false;
        if provider == "codex" {
            write(&mut stdin,json!({"id":1,"method":"initialize","params":{"clientInfo":{"name":"nexus","version":"0.20.2"}}})).await?;
        }
        if provider == "claude" {
            write(
                &mut stdin,
                json!({"type":"user","message":{"role":"user","content":prompt}}),
            )
            .await?;
        }
        while let Some(line) = next_event(&mut lines, std::time::Duration::from_secs(1800)).await? {
            let v: Value = serde_json::from_str(&line).map_err(|_| "Invalid agent stream".to_string())?;
            if diagnostics.len() < 20000 {
                diagnostics.push_str(
                    &line
                        .chars()
                        .take(20000 - diagnostics.len().min(20000))
                        .collect::<String>(),
                );
                diagnostics.push('\n');
            }
            control.diagnostics(&diagnostics);
            if provider == "codex" {
                if let Some(error) = v.get("error") {
                    return Err(error.to_string());
                }
                match if v.get("method").is_none() {
                    v.get("id").and_then(Value::as_u64)
                } else {
                    None
                } {
                    Some(1) => {
                        write(&mut stdin, json!({"method":"initialized"})).await?;
                        write(&mut stdin,json!({"id":2,"method":"thread/start","params":{"model":control.model(),"cwd":workspace,"sandbox":"read-only","approvalPolicy":"on-request","ephemeral":true,"config":codex_config(control)}})).await?;
                    }
                    Some(2) => {
                        let id = v
                            .pointer("/result/thread/id")
                            .and_then(Value::as_str)
                            .ok_or("Missing agent thread")?;
                        let mut input = vec![json!({"type":"text","text":prompt})];
                        for path in images {
                            input.push(json!({"type":"localImage","path":path}))
                        }
                        write(&mut stdin,json!({"id":3,"method":"turn/start","params":{"threadId":id,"input":input,"model":control.model(),"effort":control.effort()}})).await?;
                    }
                    _ => {}
                }
                match v.get("method").and_then(Value::as_str).unwrap_or("") {
                    "item/agentMessage/delta" => {
                        if let Some(delta) = v.pointer("/params/delta").and_then(Value::as_str) {
                            answer.push_str(delta);
                            control.update(&answer);
                            publish(app, chat, &control.text());
                        }
                    }
                    // Browser calls are confirmed by the Nexus gateway itself; Codex pre-approves that one
                    // server, and its elicitation is accepted so the user is not asked twice.
                    "mcpServer/elicitation/request"
                        if control.browser().is_some()
                            && v.pointer("/params/serverName").and_then(Value::as_str)
                                == Some(super::browser_tools::SERVER) =>
                    {
                        write(
                            &mut stdin,
                            json!({"id":v["id"],"result":{"action":"accept","content":{}}}),
                        )
                        .await?;
                    }
                    "item/tool/requestUserInput" => {
                        let response = if control.is_specialist() {
                            json!({"answers":{}})
                        } else {
                            super::chat_questions::ask(app, chat, v["params"]["questions"].clone()).await?
                        };
                        write(&mut stdin, json!({"id":v["id"],"result":response})).await?;
                    }
                    "item/commandExecution/requestApproval"
                    | "item/fileChange/requestApproval"
                    | "item/permissions/requestApproval" => {
                        let kind = v["method"].as_str().unwrap();
                        let allow = if control.is_specialist() {
                            false
                        } else {
                            super::chat_permissions::ask(app, chat, "codex", kind, v["params"].clone())
                                .await?
                        };
                        if allow {
                            control.mark_permission();
                        }
                        write(&mut stdin,json!({"id":v["id"],"result":super::chat_permissions::codex_response(kind,&v["params"],allow)})).await?;
                    }
                    "turn/completed" => {
                        if v.pointer("/params/turn/status").and_then(Value::as_str) != Some("completed") {
                            return Err(v.pointer("/params/turn/error").unwrap_or(&v).to_string());
                        }
                        completed = true;
                        break;
                    }
                    "error" => {
                        if v.pointer("/params/willRetry").and_then(Value::as_bool) != Some(true) {
                            return Err(v["params"].to_string());
                        }
                    }
                    _ => {
                        if v.get("method").is_some() && v.get("id").is_some() {
                            write(&mut stdin,json!({"id":v["id"],"error":{"code":-32601,"message":"Interactive requests are not supported by read-only chat"}})).await?;
                        }
                    }
                }
            } else {
                if v["type"] == "control_request" {
                    let request = &v["request"];
                    if request["subtype"] == "can_use_tool" {
                        let gateway = control.browser().is_some()
                            && request["tool_name"].as_str().is_some_and(|name| {
                                name.starts_with(&format!("mcp__{}__", super::browser_tools::SERVER))
                            });
                        let allow = if control.is_specialist() {
                            false
                        } else if gateway {
                            true
                        } else {
                            super::chat_permissions::ask(app, chat, "claude", "tool", request.clone()).await?
                        };
                        if allow && !gateway {
                            control.mark_permission();
                        }
                        let response = if allow {
                            json!({"behavior":"allow","updatedInput":request["input"]})
                        } else {
                            json!({"behavior":"deny","message":"Пользователь отклонил действие."})
                        };
                        write(&mut stdin,json!({"type":"control_response","response":{"subtype":"success","request_id":v["request_id"],"response":response}})).await?;
                    } else {
                        write(&mut stdin,json!({"type":"control_response","response":{"subtype":"error","request_id":v["request_id"],"error":"Unsupported control request"}})).await?;
                    }
                }
                if v["type"] == "rate_limit_event" {
                    // Subscription windows reported by the official CLI; stored like statusLine readings.
                    if super::record_claude_rate_limit(&control.account(), &v["rate_limit_info"]) {
                        let _ = app.emit("claude-limits", json!({"accountId":control.account()}));
                    }
                }
                if v["type"] == "stream_event"
                    && v.pointer("/event/delta/type").and_then(Value::as_str) == Some("text_delta")
                {
                    if let Some(delta) = v.pointer("/event/delta/text").and_then(Value::as_str) {
                        answer.push_str(delta);
                        control.update(&answer);
                        publish(app, chat, &control.text());
                    }
                }
                if v["type"] == "result" {
                    if v["is_error"] == true {
                        return Err(v.to_string());
                    }
                    // The CLI reports the exact versions it used; aliases are matched to benchmarks by these IDs.
                    if let Some(usage) = v["modelUsage"].as_object().filter(|u| !u.is_empty()) {
                        let ids: Vec<&str> = usage.keys().map(String::as_str).collect();
                        diagnostics
                            .push_str(&format!("Фактические модели Claude Code: {}\n", ids.join(", ")));
                        control.diagnostics(&diagnostics);
                    }
                    if let Some(text) = v["result"].as_str() {
                        answer = text.to_string();
                        control.update(&answer);
                        publish(app, chat, &control.text());
                    }
                    completed = true;
                    break;
                }
            }
            if answer.len() > 190000 {
                return Err("Agent answer exceeded the chat limit".into());
            }
        }
        if !completed {
            return Err("Agent stream ended before completion".into());
        }
        if answer.trim().is_empty() {
            return Err("Agent returned no answer".into());
        }
        Ok((answer, diagnostics))
    };
    let result = tokio::select! {biased;_=control.cancelled()=>Err(super::chat_runs::STOPPED.into()),value=operation=>value};
    let _ = child.kill().await;
    let _ = child.wait().await;
    let mut err_task = err_task;
    let stderr = match tokio::time::timeout(std::time::Duration::from_secs(2), &mut err_task).await {
        Ok(value) => value.unwrap_or_default(),
        Err(_) => {
            err_task.abort();
            String::new()
        }
    };
    if result.as_ref().err().map(String::as_str) == Some(super::chat_runs::STOPPED) {
        return Err(super::chat_runs::STOPPED.into());
    }
    result
        .map(|(text, log)| (text, format!("{log}\n{stderr}")))
        .map_err(|e| format!("{e}\n{stderr}"))
}

/// Codex thread config: reasoning effort, plus the Nexus browser gateway when this chat has one.
fn codex_config(control: &super::chat_runs::Control) -> Value {
    let mut config = json!({"model_reasoning_effort":control.effort()});
    if let Some(browser) = control.browser() {
        config[format!("mcp_servers.{}", super::browser_tools::SERVER)] = browser.codex_config();
    }
    config
}
#[cfg(test)]
mod idle_tests {
    use super::*;
    #[tokio::test]
    async fn activity_resets_wait_and_silent_stream_expires() {
        let (mut writer, reader) = tokio::io::duplex(256);
        let mut lines = BufReader::new(reader).lines();
        let send = tokio::spawn(async move {
            for _ in 0..4 {
                tokio::time::sleep(std::time::Duration::from_millis(40)).await;
                writer.write_all(b"event\n").await.unwrap();
            }
            writer
        });
        for _ in 0..4 {
            assert_eq!(
                next_event(&mut lines, std::time::Duration::from_millis(120))
                    .await
                    .unwrap()
                    .as_deref(),
                Some("event")
            );
        }
        let _writer = send.await.unwrap();
        assert!(next_event(&mut lines, std::time::Duration::from_millis(10))
            .await
            .unwrap_err()
            .contains("idle timeout"));
    }
}
