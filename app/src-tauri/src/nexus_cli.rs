//! Installs the `nexus` command (and with it `nexus mcp`, the Nexus MCP server) from the copy bundled with the app:
//! the script goes to `NEXUS/bin/nexus-cli.mjs`, a small launcher to `~/.local/bin/nexus`. An existing `nexus`
//! that Nexus did not write is never overwritten.
use super::*;
use serde_json::{json, Value};

const SCRIPT: &str = include_str!("../../scripts/nexus-cli.mjs");
const MARKER: &str = "# nexus-desktop-cli";

pub(crate) fn launcher(node: &str, script: &str) -> String {
    let q = |s: &str| format!("'{}'", s.replace('\'', "'\\''"));
    format!("#!/bin/sh\n{MARKER}\nexec {} {} \"$@\"\n", q(node), q(script))
}

#[tauri::command]
pub(crate) fn install_nexus_cli() -> Result<Value, String> {
    let node = node_bin()
        .map(|d| d.join("node"))
        .or_else(|| find_bin("node"))
        .ok_or("Нужен Node.js 18 или новее — установите его и повторите")?;
    let node = node.to_string_lossy().to_string();
    let dir = app_bin();
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let script = dir.join("nexus-cli.mjs");
    std::fs::write(&script, SCRIPT).map_err(|e| e.to_string())?;
    let script_text = script.to_string_lossy().to_string();
    let bin_dir = home().join(".local/bin");
    std::fs::create_dir_all(&bin_dir).map_err(|e| e.to_string())?;
    let command = bin_dir.join("nexus");
    if let Ok(existing) = std::fs::read_to_string(&command) {
        if !existing.contains(MARKER) {
            return Err(format!(
                "{} уже существует и создан не Nexus — переименуйте его, чтобы установить команду",
                command.display()
            ));
        }
    } else if command.exists() {
        return Err(format!("{} уже существует — переименуйте его", command.display()));
    }
    std::fs::write(&command, launcher(&node, &script_text)).map_err(|e| e.to_string())?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        std::fs::set_permissions(&command, std::fs::Permissions::from_mode(0o755))
            .map_err(|e| e.to_string())?;
    }
    let on_path = std::env::var_os("PATH")
        .map(|p| std::env::split_paths(&p).any(|d| d == bin_dir))
        .unwrap_or(false);
    Ok(json!({
        "command": command,
        "script": script_text,
        "onPath": on_path,
        "mcp": {"mcpServers": {"nexus": {"command": node, "args": [script_text, "mcp"]}}},
    }))
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn launcher_quotes_paths() {
        let l = launcher(
            "/opt/node/bin/node",
            "/Users/a b/Library/Application Support/NEXUS/bin/nexus-cli.mjs",
        );
        assert!(l.starts_with("#!/bin/sh\n# nexus-desktop-cli\n"));
        assert!(l.contains("exec '/opt/node/bin/node' '/Users/a b/Library/Application Support/NEXUS/bin/nexus-cli.mjs' \"$@\""));
        assert!(launcher("/n", "/it's").contains("'/it'\\''s'"));
        assert!(SCRIPT.contains("nexus_start_task"));
    }
}
