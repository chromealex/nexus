mod accounts;
mod adaptive;
mod agent_registry;
mod api_server;
mod attachments;
mod background;
mod browser_host;
mod browser_policy;
mod browser_tools;
mod channel_adapters;
mod chat_continuation;
mod chat_history;
mod chat_lifecycle;
mod chat_models;
mod chat_notify;
mod chat_permissions;
mod chat_questions;
mod chat_runs;
mod chat_send;
mod chat_stream;
mod chat_variants;
mod claude_usage;
mod custom_acp;
mod custom_agents;
mod file_preview;
mod gemini_auth;
mod installer;
mod native_install;
mod orchestration;
mod path_picker;
mod process_group;
mod project_board;
mod project_context;
mod project_icons;
mod project_import;
mod project_store;
mod provider_connections;
mod push_notify;
mod question_history;
mod remote_channels;
mod system_open;
mod verification;
mod window_state;
use accounts::*;
use adaptive::*;
use chat_send::*;
use claude_usage::*;
use installer::*;
use project_store::*;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::io::{Read, Write};
use std::net::{TcpListener, TcpStream};
use std::time::Duration;
use std::{
    path::PathBuf,
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc,
    },
};
use tauri::Emitter;
use tokio::{
    io::{AsyncBufReadExt, AsyncReadExt, BufReader},
    process::Command,
    sync::Mutex,
};

#[derive(Clone, Serialize)]
struct InstallEvent {
    id: String,
    phase: String,
    message: String,
    success: Option<bool>,
}
#[derive(Serialize)]
struct Agent {
    id: String,
    name: String,
    installed: bool,
    path: Option<String>,
    installable: bool,
}
#[derive(Clone, Serialize)]
struct InstallStatus {
    id: String,
    phase: String,
    message: String,
    success: Option<bool>,
}
struct State {
    install_lock: Arc<Mutex<()>>,
    jobs: Arc<Mutex<HashMap<String, InstallStatus>>>,
    cancels: Arc<Mutex<HashMap<String, Arc<AtomicBool>>>>,
    auth_jobs: Arc<Mutex<HashMap<String, AuthStatus>>>,
    auth_cancels: Arc<Mutex<HashMap<String, Arc<AtomicBool>>>>,
}

fn home() -> PathBuf {
    // Windows has no HOME; the profile folder plays the same role (data under …\Library\Application Support\NEXUS).
    std::env::var_os("HOME")
        .or_else(|| std::env::var_os("USERPROFILE"))
        .map(PathBuf::from)
        .unwrap_or_else(|| PathBuf::from("."))
}
/// tokio Command that never opens a console window on Windows (the app has no console of its own).
pub(crate) fn new_command<S: AsRef<std::ffi::OsStr>>(program: S) -> tokio::process::Command {
    #[allow(unused_mut)]
    let mut cmd = tokio::process::Command::new(program);
    #[cfg(windows)]
    cmd.creation_flags(0x0800_0000); // CREATE_NO_WINDOW
    cmd
}
/// curl shipped with the OS: /usr/bin/curl on macOS, curl.exe (System32) on Windows 10+.
pub(crate) fn curl_path() -> &'static str {
    if cfg!(windows) {
        "curl.exe"
    } else {
        "/usr/bin/curl"
    }
}
/// Executable names to try for a CLI: npm installs `name.cmd` shims on Windows.
pub(crate) fn exe_names(name: &str) -> Vec<String> {
    if cfg!(windows) {
        vec![format!("{name}.exe"), format!("{name}.cmd"), name.to_string()]
    } else {
        vec![name.to_string()]
    }
}
fn app_bin() -> PathBuf {
    home().join("Library/Application Support/NEXUS/bin")
}
fn node_bin() -> Option<PathBuf> {
    let mut candidates = Vec::new();
    let root = home().join(".nvm/versions/node");
    if let Ok(entries) = std::fs::read_dir(root) {
        for e in entries.flatten() {
            candidates.push(e.path().join("bin"));
        }
    }
    candidates.sort_by(|a, b| {
        let version = |p: &PathBuf| -> Vec<u32> {
            p.parent()
                .and_then(|x| x.file_name())
                .unwrap_or_default()
                .to_string_lossy()
                .trim_start_matches('v')
                .split('.')
                .map(|x| x.parse().unwrap_or(0))
                .collect()
        };
        version(b).cmp(&version(a))
    });
    candidates.extend([
        PathBuf::from("/opt/homebrew/bin"),
        PathBuf::from("/usr/local/bin"),
    ]);
    #[cfg(windows)]
    {
        if let Some(pf) = std::env::var_os("ProgramFiles") {
            candidates.push(PathBuf::from(pf).join("nodejs"));
        }
        if let Some(path) = std::env::var_os("PATH") {
            candidates.extend(std::env::split_paths(&path));
        }
    }
    candidates.into_iter().find(|p| {
        exe_names("node").iter().any(|n| p.join(n).is_file())
            && exe_names("npm").iter().any(|n| p.join(n).is_file())
    })
}
fn find_bin(name: &str) -> Option<PathBuf> {
    let mut dirs = vec![app_bin(), home().join(".local/bin")];
    if let Some(n) = node_bin() {
        dirs.push(n)
    }
    dirs.extend([
        PathBuf::from("/opt/homebrew/bin"),
        PathBuf::from("/usr/local/bin"),
    ]);
    if let Some(path) = std::env::var_os("PATH") {
        dirs.extend(std::env::split_paths(&path));
    }
    #[cfg(windows)]
    if let Some(appdata) = std::env::var_os("APPDATA") {
        dirs.push(PathBuf::from(appdata).join("npm"));
    }
    dirs.into_iter()
        .flat_map(|p| exe_names(name).into_iter().map(move |n| p.join(n)))
        .find(|p| p.is_file())
}
const AGENTS: &[(&str, &str, &str, Option<&str>)] = &[
    (
        "claude",
        "Claude Code",
        "claude",
        Some("@anthropic-ai/claude-code"),
    ),
    ("codex", "OpenAI Codex", "codex", Some("@openai/codex")),
    ("gemini", "Gemini CLI", "gemini", Some("@google/gemini-cli")),
    ("opencode", "OpenCode", "opencode", Some("opencode-ai")),
    ("qwen", "Qwen Code", "qwen", Some("@qwen-code/qwen-code")),
    ("aider", "Aider", "aider", None),
    ("goose", "Goose", "goose", None),
    ("grok", "Grok", "", None),
    ("antigravity", "Google Antigravity", "agy_acp_server.par", None),
];

// An app started from Finder/Dock gets launchd's PATH (/usr/bin:/bin:/usr/sbin:/sbin).
// npm-installed CLIs such as Codex start with `#!/usr/bin/env node`, so without the
// Node.js directory on PATH every login/status/run fails with "env: node: No such file".
fn cli_search_path(current: Option<std::ffi::OsString>) -> Option<std::ffi::OsString> {
    let h = home();
    let mut dirs: Vec<PathBuf> = Vec::new();
    if let Some(n) = node_bin() {
        dirs.push(n)
    }
    dirs.extend([
        app_bin(),
        h.join(".local/bin"),
        h.join(".volta/bin"),
        h.join(".asdf/shims"),
        h.join("Library/pnpm"),
        h.join(".bun/bin"),
        PathBuf::from("/opt/homebrew/bin"),
        PathBuf::from("/usr/local/bin"),
    ]);
    let mut out: Vec<PathBuf> = Vec::new();
    for d in dirs {
        if d.is_dir() && !out.contains(&d) {
            out.push(d)
        }
    }
    if let Some(cur) = current {
        for d in std::env::split_paths(&cur) {
            if !out.contains(&d) {
                out.push(d)
            }
        }
    }
    for d in ["/usr/bin", "/bin", "/usr/sbin", "/sbin"].map(PathBuf::from) {
        if !out.contains(&d) {
            out.push(d)
        }
    }
    std::env::join_paths(out).ok()
}
pub fn run() {
    if let Some(path) = cli_search_path(std::env::var_os("PATH")) {
        std::env::set_var("PATH", path);
    }
    tauri::Builder::default()
        .setup(|app| {
            window_state::restore(app.handle());
            remote_channels::start_bridge(app.handle());
            Ok(())
        })
        .on_window_event(|window, event| {
            background::on_window_event(window, event);
            if matches!(
                event,
                tauri::WindowEvent::Moved(_)
                    | tauri::WindowEvent::Resized(_)
                    | tauri::WindowEvent::CloseRequested { .. }
            ) {
                window_state::save(window);
            }
        })
        .manage(State {
            install_lock: Arc::new(Mutex::new(())),
            jobs: Arc::new(Mutex::new(HashMap::new())),
            cancels: Arc::new(Mutex::new(HashMap::new())),
            auth_jobs: Arc::new(Mutex::new(HashMap::new())),
            auth_cancels: Arc::new(Mutex::new(HashMap::new())),
        })
        .invoke_handler(tauri::generate_handler![
            browser_tools::browser_tools_status,
            system_open::open_system_target,
            path_picker::pick_path,
            project_icons::project_icon,
            project_import::import_candidates,
            project_import::import_projects,
            project_icons::set_project_icon,
            file_preview::read_project_file,
            file_preview::reveal_project_file,
            browser_host::browser_pane_open,
            browser_host::browser_pane_view,
            browser_host::browser_pane_input,
            browser_host::browser_pane_state,
            browser_tools::save_chat_browser,
            browser_tools::install_browser_tools,
            browser_tools::cancel_browser_install,
            browser_tools::open_browser_extension_page,
            remote_channels::channels_secret,
            background::background_settings,
            background::background_save,
            remote_channels::channels_list,
            remote_channels::channels_save,
            remote_channels::channels_test,
            remote_channels::channels_remove,
            remote_channels::channels_log,
            provider_connections::local_qwen_status,
            chat_history::chat_message_page,
            chat_lifecycle::change_chat_state,
            chat_lifecycle::list_saved_chats,
            provider_connections::setup_local_qwen,
            provider_connections::cancel_local_qwen,
            custom_agents::cancel_agent_connection,
            agent_registry::agent_registry,
            project_board::project_board,
            project_board::save_project_goal,
            project_board::remove_project_goal,
            provider_connections::list_provider_connections,
            provider_connections::connect_provider,
            provider_connections::check_provider_connection,
            provider_connections::provider_limits,
            provider_connections::remove_provider_connection,
            provider_connections::pull_local_qwen,
            custom_agents::connect_agent_manifest,
            custom_agents::disconnect_custom_agent,
            custom_agents::list_custom_agents,
            custom_agents::connect_custom_agent,
            mark_chat_read,
            window_state::drag_main_window,
            chat_permissions::answer_agent_permission,
            chat_permissions::reset_project_permissions,
            chat_permissions::list_project_permissions,
            chat_permissions::revoke_project_permission,
            project_context::list_project_folders,
            project_context::save_project_settings,
            project_context::save_project_folder,
            project_context::organize_chat,
            agents,
            install_agent,
            install_status,
            cancel_install,
            run_task,
            run_task_account,
            auto_pick,
            list_accounts,
            add_account,
            remove_account,
            account_login,
            auth_status,
            cancel_auth,
            check_account,
            account_quota,
            account_isolation,
            integrations,
            open_external,
            open_codex_device_page,
            usage_bridge_token,
            usage_bridge_snapshot,
            claude_accessibility_usage,
            nexus_diagnostics,
            claude_statusline_install,
            claude_statusline_read,
            claude_limits_probe,
            claude_statusline_remove,
            adaptive_plan,
            adaptive_execute_step,
            list_projects,
            create_project,
            remove_project,
            list_project_chats,
            create_project_chat,
            list_chat_messages,
            append_chat_message,
            rate_chat_message,
            model_registry,
            ai_adaptive_plan,
            adaptive_execute_with_context,
            unified_chat_send,
            regenerate_chat_answer,
            chat_variants::edit_last_user_message,
            chat_variants::select_message_variant,
            chat_variants::save_chat_export,
            chat_variants::reveal_chat_export,
            chat_notify::notify_answer_ready,
            attachments::upload_attachment,
            attachments::read_attachment,
            chat_questions::answer_agent_question,
            question_history::save_question_selection,
            chat_runs::cancel_chat_generation,
            chat_models::list_chat_models,
            save_chat_model,
            save_chat_routing_priority,
            save_chat_team
        ])
        .build(tauri::generate_context!())
        .expect("NEXUS failed to start")
        .run(|app, event| background::on_run_event(app, &event));
}

#[cfg(test)]
mod system_project_tests {
    use super::*;
    #[test]
    fn system_project_cannot_be_removed() {
        assert!(remove_project("nexus-system".into())
            .unwrap_err()
            .contains("нельзя удалить"));
    }
    #[test]
    fn legacy_chat_defaults_are_read_and_idle() {
        let c: NexusChat = serde_json::from_value(
            serde_json::json!({"id":"c","projectId":"p","title":"Old","createdAt":""}),
        )
        .unwrap();
        assert!(!c.team_enabled);
        assert_eq!(project_store::team_mode(&c), "auto");
        assert!(!c.unread);
        assert!(!c.running);
        assert!(c.folder_id.is_none());
        assert!(c.model_choice.is_none());
        assert!(c.routing_priority.is_none());
        let mut a = c.clone();
        a.team_enabled = true;
        a.routing_priority = Some("economy".into());
        a.model_choice = Some("agent-auto:codex".into());
        let restored: NexusChat = serde_json::from_value(serde_json::to_value(&a).unwrap()).unwrap();
        assert!(restored.team_enabled);
        assert_eq!(project_store::team_mode(&restored), "team");
        assert_eq!(restored.routing_priority.as_deref(), Some("economy"));
        assert_eq!(restored.model_choice.as_deref(), Some("agent-auto:codex"));
        assert!(c.model_choice.is_none());
    }
}

#[cfg(test)]
mod cli_path_tests {
    use super::*;
    #[test]
    fn keeps_system_dirs_and_existing_path_without_duplicates() {
        let p = cli_search_path(Some(std::ffi::OsString::from("/usr/bin:/custom/bin"))).unwrap();
        let v: Vec<_> = std::env::split_paths(&p).collect();
        assert!(v.contains(&PathBuf::from("/custom/bin")));
        assert_eq!(v.iter().filter(|d| **d == PathBuf::from("/usr/bin")).count(), 1);
        assert!(v.contains(&PathBuf::from("/bin")));
    }
}
#[cfg(test)]
mod claude_rate_limit_tests {
    use super::*;
    #[test]
    fn unified_windows_become_percentages() {
        let v=claude_rate_limit_windows(&serde_json::json!({"status":"allowed","resetsAt":1790578200,"rateLimitType":"five_hour","unifiedWindows":{"five_hour":{"utilization":0.09,"resetsAt":1790578200},"seven_day":{"utilization":0.15,"resetsAt":1791036000}}}),None).unwrap();
        assert_eq!(v.pointer("/fiveHour/usedPercent").unwrap().as_f64(), Some(9.0));
        assert_eq!(v.pointer("/sevenDay/usedPercent").unwrap().as_f64(), Some(15.0));
        assert_eq!(v.pointer("/sevenDay/resetAt").unwrap().as_i64(), Some(1791036000));
    }
    #[test]
    fn status_only_event_is_not_a_percentage() {
        assert!(claude_rate_limit_windows(
            &serde_json::json!({"status":"allowed","resetsAt":1784283600,"rateLimitType":"five_hour"}),
            None
        )
        .is_none());
        let v = claude_rate_limit_windows(
            &serde_json::json!({"status":"rejected","resetsAt":1784283600000i64,"rateLimitType":"seven_day"}),
            None,
        )
        .unwrap();
        assert_eq!(v.pointer("/sevenDay/usedPercent").unwrap().as_f64(), Some(100.0));
        assert_eq!(v.pointer("/sevenDay/resetAt").unwrap().as_i64(), Some(1784283600));
        assert!(v["fiveHour"].is_null());
    }
    #[test]
    fn single_window_keeps_recent_other_window_and_rejects_bad_units() {
        let prev = serde_json::json!({"fiveHour":{"usedPercent":40.0,"resetAt":1},"sevenDay":null});
        let v=claude_rate_limit_windows(&serde_json::json!({"status":"allowed_warning","utilization":0.85,"rateLimitType":"seven_day","resetsAt":5}),Some(&prev)).unwrap();
        assert_eq!(v.pointer("/sevenDay/usedPercent").unwrap().as_f64(), Some(85.0));
        assert_eq!(v.pointer("/fiveHour/usedPercent").unwrap().as_f64(), Some(40.0));
        assert!(claude_rate_limit_windows(
            &serde_json::json!({"utilization":85,"rateLimitType":"five_hour"}),
            None
        )
        .is_none());
        assert_eq!(chrono_like_iso(1790578200), "2026-09-28T06:50:00Z");
    }
}
#[cfg(test)]
mod quota_window_tests {
    use super::*;
    #[test]
    fn provider_windows_keep_zero_usage_and_reported_durations() {
        let report=parse_codex_quota(&serde_json::json!({"result":{"rateLimits":{"primary":{"usedPercent":0,"windowDurationMins":300,"resetsAt":12345},"secondary":{"usedPercent":100,"windowDurationMins":10080}}}})).unwrap();
        assert_eq!(report.primary_used_percent, Some(0.0));
        assert_eq!(report.secondary_used_percent, Some(100.0));
        assert_eq!(report.primary_window_minutes, Some(300));
        assert_eq!(report.secondary_window_minutes, Some(10080));
        let value = serde_json::to_value(report).unwrap();
        assert_eq!(value["primaryWindowMinutes"], 300);
        assert_eq!(value["secondaryWindowMinutes"], 10080);
        assert!(parse_codex_quota(
            &serde_json::json!({"result":{"rateLimits":{"primary":{"usedPercent":null}}}})
        )
        .is_none());
    }
}

#[cfg(test)]
mod routing_error_tests {
    use super::*;
    #[test]
    fn quota_requires_specific_error_evidence() {
        assert!(!is_limit_error("Your weekly limit is not exhausted"));
        assert!(!is_limit_error(
            r#"{"is_error":false,"result":"usage limit reached"}"#
        ));
        assert!(!is_limit_error(
            r#"{"is_error":true,"result":"Network disconnected","metadata":"usage limit reached"}"#
        ));
        assert!(is_limit_error(
            r#"{"is_error":true,"result":"You've hit your limit"}"#
        ));
        assert!(is_limit_error(r#"{"error":{"type":"rate_limit_error"}}"#));
    }
}

#[cfg(test)]
mod quota_routing_tests {
    use super::*;
    #[test]
    fn unknown_and_stale_quotas_remain_eligible() {
        for data in [
            serde_json::json!({}),
            serde_json::json!({"sevenDay":{"usedPercent":null}}),
            serde_json::json!({"sevenDay":{"usedPercent":0}}),
        ] {
            assert!(!quota_reading_state(&data, 0, 1000).0);
        }
        assert!(!quota_reading_state(&serde_json::json!({"sevenDay":{"usedPercent":100}}), 601, 1000).0);
        assert!(
            quota_reading_state(
                &serde_json::json!({"sevenDay":{"usedPercent":100,"resetAt":2000}}),
                601,
                1000
            )
            .0
        );
        assert!(
            !quota_reading_state(
                &serde_json::json!({"sevenDay":{"usedPercent":100,"resetAt":900}}),
                601,
                1000
            )
            .0
        );
    }
}
