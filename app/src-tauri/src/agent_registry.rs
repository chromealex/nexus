use super::*;
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Entry {
    pub id: String,
    pub name: String,
    pub description: String,
    pub website: String,
    pub npm_package: Option<String>,
    pub args: Vec<String>,
    pub distribution: String,
}
#[tauri::command]
pub async fn agent_registry() -> Result<Vec<Entry>, String> {
    let mut cmd = Command::new("/usr/bin/curl");
    cmd.args([
        "--fail",
        "--silent",
        "--show-error",
        "--max-time",
        "25",
        "--max-filesize",
        "2097152",
        "--proto",
        "=https",
        "https://cdn.agentclientprotocol.com/registry/v1/latest/registry.json",
    ])
    .kill_on_drop(true);
    let out = tokio::time::timeout(Duration::from_secs(30), cmd.output())
        .await
        .map_err(|_| "Каталог ACP не ответил")?
        .map_err(|_| "Не удалось загрузить каталог ACP")?;
    if !out.status.success() {
        return Err(
            "Каталог ACP сейчас недоступен. Встроенные агенты и форма своего агента продолжают работать."
                .into(),
        );
    }
    let v: serde_json::Value =
        serde_json::from_slice(&out.stdout).map_err(|_| "Неподдерживаемый каталог ACP")?;
    Ok(v["agents"]
        .as_array()
        .ok_or("Нет списка агентов в каталоге ACP")?
        .iter()
        .take(300)
        .filter_map(|a| {
            let id = a["id"].as_str()?;
            let name = a["name"].as_str()?;
            if id.len() > 80
                || name.len() > 100
                || !id
                    .chars()
                    .all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '-')
            {
                return None;
            }
            let npm = &a["distribution"]["npx"];
            let pkg = npm["package"].as_str().map(String::from);
            let args = npm["args"]
                .as_array()
                .map(|a| a.iter().filter_map(|v| v.as_str().map(String::from)).collect())
                .unwrap_or_default();
            let website = a["website"]
                .as_str()
                .or(a["repository"].as_str())
                .filter(|s| s.starts_with("https://"))
                .unwrap_or("");
            Some(Entry {
                id: id.into(),
                name: name.into(),
                description: a["description"]
                    .as_str()
                    .unwrap_or("")
                    .chars()
                    .take(350)
                    .collect(),
                website: website.into(),
                npm_package: pkg,
                args,
                distribution: if npm.is_object() {
                    "npm"
                } else if a["distribution"]["binary"].is_object() {
                    "binary"
                } else {
                    "uvx"
                }
                .into(),
            })
        })
        .collect())
}
