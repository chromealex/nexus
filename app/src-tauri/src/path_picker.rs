//! Native «Choose file / folder» panel without an extra plugin: macOS `choose file` / `choose folder`
//! through osascript. The prompt goes in as an argument (never spliced into the script text).
use tokio::process::Command;

pub(crate) fn picker_script(kind: &str) -> Option<&'static str> {
    Some(match kind {
        "file" | "executable" => "on run argv\nreturn POSIX path of (choose file with prompt (item 1 of argv) with invisibles)\nend run",
        "folder" => "on run argv\nreturn POSIX path of (choose folder with prompt (item 1 of argv))\nend run",
        _ => return None,
    })
}

/// Returns the chosen path, or nothing if the user cancelled.
#[tauri::command]
pub async fn pick_path(kind: String, prompt: Option<String>) -> Result<Option<String>, String> {
    let script = picker_script(&kind).ok_or("Неизвестный тип выбора")?;
    if !cfg!(target_os = "macos") {
        return Err("Выбор файла доступен только в macOS".into());
    }
    let prompt: String = prompt
        .unwrap_or_else(|| {
            if kind == "folder" {
                "Выберите папку".into()
            } else {
                "Выберите файл".into()
            }
        })
        .chars()
        .filter(|c| !c.is_control())
        .take(120)
        .collect();
    let out = Command::new("osascript")
        .args(["-e", script, "--", &prompt])
        .output()
        .await
        .map_err(|e| e.to_string())?;
    if !out.status.success() {
        // -128 is «User canceled».
        let err = String::from_utf8_lossy(&out.stderr);
        return if err.contains("-128") {
            Ok(None)
        } else {
            Err("Не удалось открыть окно выбора".into())
        };
    }
    let path = String::from_utf8_lossy(&out.stdout).trim().to_string();
    let path = if kind == "folder" {
        path.trim_end_matches('/').to_string()
    } else {
        path
    };
    Ok((!path.is_empty()).then_some(path))
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn scripts_take_prompt_as_argument() {
        for kind in ["file", "executable", "folder"] {
            let s = picker_script(kind).unwrap();
            assert!(s.contains("item 1 of argv"));
        }
        assert!(picker_script("anything").is_none());
    }
}
