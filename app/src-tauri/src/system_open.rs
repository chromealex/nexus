//! Opens fixed macOS places from setup instructions (an app or a System Settings privacy pane), so the
//! user does not have to search for them. Only the names below are accepted; nothing comes from text.
use tokio::process::Command;

pub(crate) fn target_args(target: &str) -> Option<Vec<&'static str>> {
    Some(match target {
        "messages" => vec!["-a", "Messages"],
        "full-disk" => vec!["x-apple.systempreferences:com.apple.preference.security?Privacy_AllFiles"],
        "automation" => vec!["x-apple.systempreferences:com.apple.preference.security?Privacy_Automation"],
        "accessibility" => {
            vec!["x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility"]
        }
        "notifications" => vec!["x-apple.systempreferences:com.apple.Notifications-Settings.extension"],
        _ => return None,
    })
}

#[tauri::command]
pub async fn open_system_target(target: String) -> Result<(), String> {
    let args = target_args(&target).ok_or("Неизвестное место для открытия")?;
    let status = Command::new("open")
        .args(args)
        .status()
        .await
        .map_err(|e| e.to_string())?;
    if status.success() {
        Ok(())
    } else {
        Err("macOS не открыл нужный раздел. Откройте его вручную в «Системных настройках».".into())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn only_known_targets() {
        assert_eq!(target_args("messages").unwrap(), vec!["-a", "Messages"]);
        assert!(target_args("full-disk").unwrap()[0].ends_with("Privacy_AllFiles"));
        assert!(target_args("/Applications/Calculator.app").is_none());
        assert!(target_args("https://example.com").is_none());
    }
}
