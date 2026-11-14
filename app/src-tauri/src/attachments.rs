use base64::{engine::general_purpose::STANDARD, Engine};
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Attachment {
    pub id: String,
    pub name: String,
    pub mime: String,
    pub size: usize,
    pub project_id: String,
    pub stored_name: String,
}
fn root() -> PathBuf {
    super::home().join("Library/Application Support/NEXUS/attachments")
}
fn dir(id: &str) -> Result<PathBuf, String> {
    if id.len() > 80 || !id.starts_with('n') || !id.chars().all(|c| c.is_ascii_alphanumeric()) {
        return Err("Invalid attachment ID".into());
    }
    Ok(root().join(id))
}
pub fn load(id: &str) -> Result<Attachment, String> {
    serde_json::from_slice(&std::fs::read(dir(id)?.join("meta.json")).map_err(|e| e.to_string())?)
        .map_err(|e| e.to_string())
}
pub fn path(a: &Attachment) -> Result<PathBuf, String> {
    let p = std::fs::canonicalize(dir(&a.id)?.join(&a.stored_name)).map_err(|e| e.to_string())?;
    if !p.starts_with(std::fs::canonicalize(root()).map_err(|e| e.to_string())?) {
        return Err("Attachment outside storage".into());
    }
    Ok(p)
}
#[tauri::command]
pub fn upload_attachment(
    project_id: String,
    name: String,
    mime: String,
    data: String,
) -> Result<Attachment, String> {
    if !super::load_project_store()?
        .projects
        .iter()
        .any(|p| p.id == project_id)
    {
        return Err("Project not found".into());
    }
    if name.is_empty() || name.len() > 512 || mime.len() > 160 || data.len() > 28_000_000 {
        return Err("Файл слишком большой: максимум 20 МБ".into());
    }
    let bytes = STANDARD.decode(data).map_err(|_| "Invalid file encoding")?;
    if bytes.len() > 20_000_000 {
        return Err("Файл слишком большой: максимум 20 МБ".into());
    }
    let id = super::project_id();
    let extension = PathBuf::from(&name)
        .extension()
        .and_then(|v| v.to_str())
        .unwrap_or("")
        .chars()
        .filter(|c| c.is_ascii_alphanumeric())
        .take(12)
        .collect::<String>();
    let stored_name = if extension.is_empty() {
        "file".into()
    } else {
        format!("file.{extension}")
    };
    let a = Attachment {
        id: id.clone(),
        name,
        mime,
        size: bytes.len(),
        project_id,
        stored_name,
    };
    let d = dir(&id)?;
    std::fs::create_dir_all(&d).map_err(|e| e.to_string())?;
    std::fs::write(d.join(&a.stored_name), bytes).map_err(|e| e.to_string())?;
    std::fs::write(
        d.join("meta.json"),
        serde_json::to_vec(&a).map_err(|e| e.to_string())?,
    )
    .map_err(|e| e.to_string())?;
    Ok(a)
}
#[tauri::command]
pub fn read_attachment(id: String) -> Result<String, String> {
    let a = load(&id)?;
    let bytes = std::fs::read(path(&a)?).map_err(|e| e.to_string())?;
    if bytes.len() > 20_000_000 {
        return Err("Preview size limit".into());
    }
    Ok(STANDARD.encode(bytes))
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn rejects_path_traversal() {
        for id in ["../file", "n../../secret", "/tmp/nfile", "n/secret", ""] {
            assert!(dir(id).is_err())
        }
        assert!(dir("n123456").is_ok());
    }
}
