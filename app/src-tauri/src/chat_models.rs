use serde::Serialize;
use serde_json::{json, Value};
use std::sync::{LazyLock, Mutex};
use tokio::{
    io::{AsyncBufReadExt, AsyncWriteExt, BufReader},
    process::Command,
};
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Choice {
    pub id: String,
    pub label: String,
    pub provider: String,
    pub model: String,
    pub is_default: bool,
    pub images: Option<bool>,
    /// Exact version a Claude Code alias resolves to (official alias table), when no
    /// provider/env override can change it. Benchmarks are matched by this ID only.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub resolved: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub resolved_note: Option<String>,
    /// Why this model cannot be chosen right now (shown in the picker); None = available.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub unavailable: Option<String>,
}
/// Claude Fable 5.2 — exact model ID accepted by Claude Code next to the haiku/sonnet/opus aliases.
pub const FABLE_5_2: &str = "claude-fable-5-2";
static CHOICES: LazyLock<Mutex<Vec<Choice>>> = LazyLock::new(|| Mutex::new(Vec::new()));
fn valid_model(model: &str) -> bool {
    !model.is_empty()
        && model.len() <= 120
        && model
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_' || c == '.' || c == ':')
}
fn parse_models(data: &Value) -> Vec<Choice> {
    data.as_array()
        .into_iter()
        .flatten()
        .filter_map(|v| {
            let model = v.get("model").and_then(Value::as_str)?;
            if v["hidden"] == true || !valid_model(model) {
                return None;
            }
            Some(Choice {
                resolved: None,
                resolved_note: None,
                unavailable: None,
                id: format!("codex/{model}"),
                label: format!("Codex · {}", v["displayName"].as_str().unwrap_or(model)),
                provider: "codex".into(),
                model: model.into(),
                images: Some(true),
                is_default: v["isDefault"] == true,
            })
        })
        .collect()
}
async fn codex_models(config: &str) -> Result<Vec<Choice>, String> {
    let exe = super::find_bin("codex").ok_or("Codex не установлен")?;
    let mut child = Command::new(exe)
        .arg("app-server")
        .env("CODEX_HOME", config)
        .kill_on_drop(true)
        .stdin(std::process::Stdio::piped())
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::null())
        .spawn()
        .map_err(|e| e.to_string())?;
    let mut input = child.stdin.take().ok_or("Missing stdin")?;
    let mut lines = BufReader::new(child.stdout.take().ok_or("Missing stdout")?).lines();
    let operation = async {
        let mut all = Vec::new();
        let mut cursors = std::collections::HashSet::new();
        input.write_all(format!("{}\n",json!({"id":1,"method":"initialize","params":{"clientInfo":{"name":"nexus","version":"0.20.2"}}})).as_bytes()).await.map_err(|e|e.to_string())?;
        while let Some(line) = lines.next_line().await.map_err(|e| e.to_string())? {
            let v: Value = serde_json::from_str(&line).map_err(|e| e.to_string())?;
            if let Some(error) = v.get("error") {
                return Err(error.to_string());
            }
            if v["id"] == 1 {
                input
                    .write_all(
                        format!(
                            "{}\n{}\n",
                            json!({"method":"initialized"}),
                            json!({"id":2,"method":"model/list","params":{"limit":100,"includeHidden":false}})
                        )
                        .as_bytes(),
                    )
                    .await
                    .map_err(|e| e.to_string())?;
            }
            if v["id"] == 2 {
                for row in parse_models(&v["result"]["data"]) {
                    if !all.iter().any(|r: &Choice| r.id == row.id) {
                        all.push(row)
                    }
                }
                if let Some(cursor) = v["result"]["nextCursor"].as_str().filter(|s| !s.is_empty()) {
                    if cursors.len() >= 20 || !cursors.insert(cursor.to_string()) {
                        return Err("Каталог моделей вернул неверную пагинацию".into());
                    }
                    input.write_all(format!("{}\n",json!({"id":2,"method":"model/list","params":{"limit":100,"includeHidden":false,"cursor":cursor}})).as_bytes()).await.map_err(|e|e.to_string())?;
                } else {
                    return Ok(all);
                }
            }
        }
        Err("Codex не вернул список моделей".into())
    };
    let result = tokio::time::timeout(std::time::Duration::from_secs(20), operation)
        .await
        .unwrap_or_else(|_| Err("Не удалось загрузить модели Codex: время ожидания истекло".into()));
    let _ = child.kill().await;
    let _ = child.wait().await;
    result
}
/// Claude Code docs (code.claude.com/docs/en/model-config), alias table for the Anthropic API.
pub(crate) const CLAUDE_ALIAS_DATE: &str = "2026-11-14";
pub(crate) fn claude_alias_target(alias: &str) -> Option<&'static str> {
    match alias {
        "haiku" => Some("claude-haiku-5-5"),
        "sonnet" => Some("claude-sonnet-5-5"),
        "opus" => Some("claude-opus-5-5"),
        _ => None,
    }
}
/// Settings that make aliases resolve to another version (other providers, pinned models).
const CLAUDE_ALIAS_OVERRIDES: [&str; 9] = [
    "ANTHROPIC_DEFAULT_HAIKU_MODEL",
    "ANTHROPIC_DEFAULT_SONNET_MODEL",
    "ANTHROPIC_DEFAULT_OPUS_MODEL",
    "ANTHROPIC_MODEL",
    "ANTHROPIC_BASE_URL",
    "CLAUDE_CODE_USE_BEDROCK",
    "CLAUDE_CODE_USE_VERTEX",
    "CLAUDE_CODE_USE_FOUNDRY",
    "CLAUDE_CODE_USE_ANTHROPIC_AWS",
];
fn override_in(env: &Value) -> Option<&'static str> {
    CLAUDE_ALIAS_OVERRIDES.iter().copied().find(|k| {
        env.get(*k)
            .map(|v| !v.is_null() && v != "" && v != "0")
            .unwrap_or(false)
    })
}
/// Only names of settings are reported, never their values.
pub(crate) fn claude_alias_override_from(
    process_env: &[(String, String)],
    settings: &[Value],
) -> Option<String> {
    if let Some((k, _)) = process_env
        .iter()
        .find(|(k, v)| CLAUDE_ALIAS_OVERRIDES.contains(&k.as_str()) && !v.is_empty() && v != "0")
    {
        return Some(format!(
            "Алиас переопределён переменной {k}; точная версия неизвестна, внешние сравнения не применяются"
        ));
    }
    for s in settings {
        if let Some(k) = override_in(&s["env"]) {
            return Some(format!("Алиас переопределён в settings.json ({k}); точная версия неизвестна, внешние сравнения не применяются"));
        }
        if s.get("model")
            .and_then(Value::as_str)
            .is_some_and(|m| !m.is_empty())
            && s.get("availableModels").is_some()
        {
            return Some(
                "В settings.json задан список моделей организации; точная версия алиасов не подтверждена"
                    .into(),
            );
        }
    }
    None
}
fn claude_alias_override(config_dirs: &[String]) -> Option<String> {
    let env: Vec<(String, String)> = std::env::vars().collect();
    let settings: Vec<Value> = config_dirs
        .iter()
        .filter_map(|d| std::fs::read_to_string(std::path::Path::new(d).join("settings.json")).ok())
        .filter_map(|t| serde_json::from_str(&t).ok())
        .collect();
    claude_alias_override_from(&env, &settings)
}
#[tauri::command]
pub async fn list_chat_models() -> Result<Vec<Choice>, String> {
    let candidates = super::routing_candidates().await;
    let mut result = Vec::new();
    let mut codex_error = None;
    if candidates.iter().any(|c| c.account.provider == "claude") {
        let claude_dirs: Vec<String> = candidates
            .iter()
            .filter(|c| c.account.provider == "claude")
            .map(|c| c.account.config_dir.clone())
            .collect();
        let override_note = claude_alias_override(&claude_dirs);
        for (model, label) in [("haiku", "Haiku"), ("sonnet", "Sonnet"), ("opus", "Opus")] {
            let (resolved, resolved_note) = match &override_note {
                None => (
                    claude_alias_target(model).map(String::from),
                    Some(format!("Алиас Claude Code → {} по официальной таблице алиасов для Anthropic API ({CLAUDE_ALIAS_DATE})", claude_alias_target(model).unwrap_or("?"))),
                ),
                Some(note) => (None, Some(note.clone())),
            };
            result.push(Choice {
                unavailable: None,
                resolved,
                resolved_note,
                id: format!("claude/{model}"),
                label: format!("Claude · {label}"),
                provider: "claude".into(),
                model: model.into(),
                images: Some(true),
                is_default: model == "sonnet",
            });
        }
        // Fable is an exact version, not an alias; on some plans it uses separately bought credits.
        result.push(Choice {
            unavailable: None,
            resolved: Some(FABLE_5_2.into()),
            resolved_note: Some("Точная версия модели, не алиас".into()),
            id: format!("claude/{FABLE_5_2}"),
            label: "Claude · Fable 5.2".into(),
            provider: "claude".into(),
            model: FABLE_5_2.into(),
            images: Some(true),
            is_default: false,
        });
    }
    for candidate in candidates.iter().filter(|c| c.account.provider == "codex") {
        match codex_models(&candidate.account.config_dir).await {
            Ok(rows) => {
                for row in rows {
                    if !result.iter().any(|r| r.id == row.id) {
                        result.push(row)
                    }
                }
            }
            Err(e) => codex_error = Some(e),
        }
    }
    for a in super::custom_agents::load()? {
        if a.verified {
            result.push(Choice {
                resolved: None,
                resolved_note: None,
                unavailable: None,
                id: format!("{}/default", a.id),
                label: format!("{} · Модель агента", a.manifest.name),
                provider: a.id,
                model: "default".into(),
                is_default: true,
                images: a.supports_images,
            });
        }
    }
    result.extend(super::provider_connections::choices()?);
    if result.is_empty() {
        if let Some(error) = codex_error {
            return Err(error);
        }
    }
    *CHOICES.lock().map_err(|_| "Model registry unavailable")? = result.clone();
    Ok(result)
}
pub fn selected(id: &str) -> Result<Option<Choice>, String> {
    if id == "auto" {
        return Ok(None);
    }
    if id.starts_with("agent-auto:custom-") {
        return Err("Пользовательский ACP доступен только при ручном выборе модели: проверен протокол, а не генерация.".into());
    }
    let rows = CHOICES.lock().map_err(|_| "Model registry unavailable")?;
    let found = if let Some(provider) = id.strip_prefix("agent-auto:") {
        preferred(&rows, provider)
    } else {
        rows.iter().find(|c| c.id == id)
    };
    found
        .filter(|m| chat_compatible(&m.model))
        .cloned()
        .map(Some)
        .ok_or_else(|| "Выбранная модель недоступна. Обновите список моделей или выберите «Авто».".into())
}
pub fn chat_compatible(model: &str) -> bool {
    let m = model.to_lowercase();
    ![
        "imagine",
        "embedding",
        "tts",
        "transcri",
        "whisper",
        "dall-e",
        "gpt-image",
        "veo",
        "imagen",
        "multi-agent",
        "codex-auto-review",
    ]
    .iter()
    .any(|s| m.contains(s))
}
fn preferred<'a>(rows: &'a [Choice], provider: &str) -> Option<&'a Choice> {
    rows.iter()
        .filter(|m| m.provider == provider && chat_compatible(&m.model))
        .min_by_key(|m| (!m.is_default, m.model != "default", m.id.as_str()))
}
pub fn automatic_codex(tier: &str) -> String {
    let rows = CHOICES.lock().ok();
    let models = rows
        .as_ref()
        .map(|v| v.iter().filter(|m| m.provider == "codex").collect::<Vec<_>>())
        .unwrap_or_default();
    let chosen = if tier == "economy" {
        models.iter().find(|m| m.model.contains("mini")).copied()
    } else {
        None
    }
    .or_else(|| models.iter().find(|m| m.is_default).copied());
    chosen
        .map(|m| m.model.clone())
        .unwrap_or_else(|| "default".into())
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn defaults_are_order_independent_and_scoped() {
        let rows = parse_models(&json!([{"model":"a"},{"model":"z","isDefault":true}]));
        assert_eq!(preferred(&rows, "codex").unwrap().model, "z");
        assert!(preferred(&rows, "claude").is_none());
        let mut reverse = rows.clone();
        reverse.reverse();
        assert_eq!(preferred(&reverse, "codex").unwrap().model, "z");
        assert!(!chat_compatible("grok-imagine-video"));
        assert!(!chat_compatible("grok-4.20-multi-agent-0309"));
        assert!(chat_compatible("grok-4.7"));
    }
    #[test]
    fn filters_hidden_invalid_and_uses_provider_identity() {
        let rows = parse_models(
            &json!([{"model":"gpt-test","displayName":"Test","isDefault":true},{"model":"hidden","hidden":true},{"model":"bad/model"}]),
        );
        assert_eq!(rows.len(), 1);
        assert_eq!(rows[0].id, "codex/gpt-test");
        assert!(rows[0].is_default);
        assert!(selected("auto").unwrap().is_none());
        assert!(selected("unknown/model").is_err());
        assert!(selected("agent-auto:custom-test")
            .err()
            .unwrap()
            .contains("ручном"));
    }
}

#[cfg(test)]
mod alias_tests {
    use super::*;
    #[test]
    fn aliases_resolve_only_without_overrides() {
        assert_eq!(claude_alias_target("opus"), Some("claude-opus-5-5"));
        assert_eq!(claude_alias_target("default"), None);
        assert!(claude_alias_override_from(&[], &[json!({"theme":"dark"})]).is_none());
        let env = vec![("CLAUDE_CODE_USE_BEDROCK".to_string(), "1".to_string())];
        assert!(claude_alias_override_from(&env, &[])
            .unwrap()
            .contains("CLAUDE_CODE_USE_BEDROCK"));
        let settings = json!({"env":{"ANTHROPIC_DEFAULT_OPUS_MODEL":"secret-arn"}});
        let note = claude_alias_override_from(&[], &[settings]).unwrap();
        assert!(note.contains("ANTHROPIC_DEFAULT_OPUS_MODEL") && !note.contains("secret-arn"));
    }
}
