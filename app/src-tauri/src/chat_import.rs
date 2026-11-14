//! Conversations from Claude Code and Codex, imported as chats of a Nexus project.
//! Only the visible conversation is transferred: the user's messages and the agent's text answers.
//! Tool calls and their output, injected instructions and system context are left out; keys and
//! agent settings are never read. Each imported chat remembers its source session, so importing again
//! adds only sessions that are new.
use super::*;
use serde_json::Value;
use std::collections::{HashMap, HashSet};
use std::io::{BufRead, Read};
use std::path::Path;

/// Sessions imported per project per run, newest first.
const MAX_SESSIONS: usize = 200;
/// Session files larger than this are skipped (long tool-heavy runs).
const MAX_FILE: u64 = 64 * 1024 * 1024;
const MAX_MESSAGE: usize = 200_000;

#[derive(Debug, Default, PartialEq)]
pub(crate) struct Session {
    pub key: String,
    pub title: String,
    /// (role, text, unix seconds)
    pub messages: Vec<(String, String, u64)>,
}

/// Seconds since the epoch for an RFC 3339 timestamp ("2026-11-14T10:20:30.123Z", offsets allowed).
pub(crate) fn parse_time(text: &str) -> Option<u64> {
    let b = text.as_bytes();
    if b.len() < 19 || b[4] != b'-' || b[7] != b'-' || b[13] != b':' {
        return None;
    }
    let num = |r: std::ops::Range<usize>| text.get(r)?.parse::<i64>().ok();
    let (y, m, d) = (num(0..4)?, num(5..7)?, num(8..10)?);
    let (hh, mm, ss) = (num(11..13)?, num(14..16)?, num(17..19)?);
    // Days from civil (Howard Hinnant).
    let y2 = if m <= 2 { y - 1 } else { y };
    let era = y2.div_euclid(400);
    let yoe = y2 - era * 400;
    let doy = (153 * (m + if m > 2 { -3 } else { 9 }) + 2) / 5 + d - 1;
    let doe = yoe * 365 + yoe / 4 - yoe / 100 + doy;
    let days = era * 146097 + doe - 719468;
    let mut secs = days * 86400 + hh * 3600 + mm * 60 + ss;
    let rest = &text[19..];
    let zone = rest.trim_start_matches(|c: char| c == '.' || c.is_ascii_digit());
    if let Some(sign) = zone.chars().next().filter(|c| *c == '+' || *c == '-') {
        let z = &zone[1..];
        let zh = z.get(0..2)?.parse::<i64>().ok()?;
        let zm = z
            .get(3..5)
            .or_else(|| z.get(2..4))
            .and_then(|v| v.parse::<i64>().ok())
            .unwrap_or(0);
        let off = zh * 3600 + zm * 60;
        secs -= if sign == '+' { off } else { -off };
    }
    u64::try_from(secs).ok()
}

pub(crate) fn time_string(secs: u64) -> String {
    format!("SystemTime {{ tv_sec: {secs}, tv_nsec: 0 }}")
}

fn texts(content: &Value, kinds: &[&str]) -> String {
    match content {
        Value::String(s) => s.clone(),
        Value::Array(items) => items
            .iter()
            .filter(|i| {
                i.get("type")
                    .and_then(Value::as_str)
                    .is_some_and(|t| kinds.contains(&t))
            })
            .filter_map(|i| i.get("text").and_then(Value::as_str))
            .collect::<Vec<_>>()
            .join("\n\n"),
        _ => String::new(),
    }
}

/// Removes `<system-reminder>…</system-reminder>`-style blocks the agents add to user turns.
fn strip_injected(text: &str) -> String {
    let mut out = text.to_string();
    for tag in ["system-reminder", "local-command-caveat"] {
        let (open, close) = (format!("<{tag}>"), format!("</{tag}>"));
        while let Some(start) = out.find(&open) {
            match out[start..].find(&close) {
                Some(end) => out.replace_range(start..start + end + close.len(), ""),
                None => break,
            }
        }
    }
    out.trim().to_string()
}

/// User turns that are not something the person typed: slash-command plumbing, interruptions,
/// environment and instruction blocks.
fn injected_user_text(text: &str) -> bool {
    let t = text.trim_start();
    t.is_empty()
        || [
            "<command-name>",
            "<command-message>",
            "<command-args>",
            "<local-command-stdout>",
            "<local-command-stderr>",
            "<environment_context>",
            "<user_instructions>",
            "<permissions instructions>",
            "<INSTRUCTIONS>",
            "# AGENTS.md instructions",
            "Caveat: The messages below were generated",
            "[Request interrupted by user",
        ]
        .iter()
        .any(|p| t.starts_with(p))
}

fn push(messages: &mut Vec<(String, String, u64)>, role: &str, text: String, at: u64) {
    let text = text.trim().to_string();
    if text.is_empty() {
        return;
    }
    // An agent answer is often split by tool calls; it reads as one answer.
    if role == "assistant" {
        if let Some(last) = messages.last_mut().filter(|m| m.0 == "assistant") {
            last.1.push_str("\n\n");
            last.1.push_str(&text);
            return;
        }
    }
    messages.push((role.to_string(), text, at));
}

fn finish(mut s: Session) -> Option<Session> {
    if !s.messages.iter().any(|m| m.0 == "user") || !s.messages.iter().any(|m| m.0 == "assistant") {
        return None;
    }
    for m in s.messages.iter_mut() {
        if m.1.len() > MAX_MESSAGE {
            let mut cut = MAX_MESSAGE - 64;
            while !m.1.is_char_boundary(cut) {
                cut -= 1;
            }
            m.1.truncate(cut);
            m.1.push_str("\n\n… (сообщение сокращено при импорте)");
        }
    }
    if s.title.trim().is_empty() {
        s.title = s
            .messages
            .iter()
            .find(|m| m.0 == "user")
            .map(|m| m.1.clone())
            .unwrap_or_default();
    }
    let line = s
        .title
        .lines()
        .find(|l| !l.trim().is_empty())
        .unwrap_or("")
        .trim();
    let mut title: String = line.chars().take(80).collect();
    if line.chars().count() > 80 {
        title.push('…');
    }
    s.title = if title.is_empty() {
        "Импортированный чат".into()
    } else {
        title
    };
    Some(s)
}

/// A Claude Code session file (`~/.claude/projects/<folder>/<session>.jsonl`).
pub(crate) fn parse_claude(text: &str, fallback_id: &str) -> Option<Session> {
    let mut s = Session::default();
    let mut id = String::new();
    let mut last = 0;
    for line in text.lines() {
        let Ok(v) = serde_json::from_str::<Value>(line) else {
            continue;
        };
        let kind = v.get("type").and_then(Value::as_str).unwrap_or("");
        if kind == "summary" {
            if let Some(t) = v.get("summary").and_then(Value::as_str) {
                s.title = t.to_string();
            }
            continue;
        }
        if v.get("isSidechain").and_then(Value::as_bool) == Some(true)
            || v.get("isMeta").and_then(Value::as_bool) == Some(true)
        {
            continue;
        }
        if id.is_empty() {
            if let Some(sid) = v.get("sessionId").and_then(Value::as_str) {
                id = sid.to_string();
            }
        }
        let at = v
            .get("timestamp")
            .and_then(Value::as_str)
            .and_then(parse_time)
            .unwrap_or(last);
        last = at;
        let content = v.pointer("/message/content").unwrap_or(&Value::Null);
        match kind {
            "user" => {
                let text = strip_injected(&texts(content, &["text"]));
                if !injected_user_text(&text) {
                    push(&mut s.messages, "user", text, at);
                }
            }
            "assistant" => push(&mut s.messages, "assistant", texts(content, &["text"]), at),
            _ => {}
        }
    }
    s.key = format!("claude:{}", if id.is_empty() { fallback_id } else { &id });
    finish(s)
}

/// A Codex session file (`~/.codex/sessions/YYYY/MM/DD/rollout-*.jsonl`).
pub(crate) fn parse_codex(text: &str, fallback_id: &str) -> Option<Session> {
    let rows: Vec<Value> = text
        .lines()
        .filter_map(|l| serde_json::from_str(l).ok())
        .collect();
    let payload = |v: &Value| v.get("payload").cloned().unwrap_or(Value::Null);
    // Typed user messages are recorded as `event_msg/user_message`; the `response_item` user turns also
    // carry injected context, so they are only a fallback for old files.
    let typed = rows.iter().any(|v| {
        v.get("type").and_then(Value::as_str) == Some("event_msg")
            && payload(v).get("type").and_then(Value::as_str) == Some("user_message")
    });
    let mut s = Session::default();
    let mut id = String::new();
    let mut last = 0;
    for v in &rows {
        let p = payload(v);
        let at = v
            .get("timestamp")
            .and_then(Value::as_str)
            .and_then(parse_time)
            .unwrap_or(last);
        last = at;
        match (
            v.get("type").and_then(Value::as_str),
            p.get("type").and_then(Value::as_str),
        ) {
            (Some("session_meta"), _) => {
                if let Some(i) = p.get("id").and_then(Value::as_str) {
                    id = i.to_string();
                }
            }
            (Some("event_msg"), Some("user_message")) => {
                let text = p.get("message").and_then(Value::as_str).unwrap_or("").to_string();
                if !injected_user_text(&text) {
                    push(&mut s.messages, "user", text, at);
                }
            }
            (Some("response_item"), Some("message")) => match p.get("role").and_then(Value::as_str) {
                Some("assistant") => push(
                    &mut s.messages,
                    "assistant",
                    texts(p.get("content").unwrap_or(&Value::Null), &["output_text", "text"]),
                    at,
                ),
                Some("user") if !typed => {
                    let text = texts(p.get("content").unwrap_or(&Value::Null), &["input_text", "text"]);
                    if !injected_user_text(&text) {
                        push(&mut s.messages, "user", text, at);
                    }
                }
                _ => {}
            },
            _ => {}
        }
    }
    s.key = format!("codex:{}", if id.is_empty() { fallback_id } else { &id });
    finish(s)
}

fn read_limited(path: &Path) -> Option<String> {
    if path.metadata().ok()?.len() > MAX_FILE {
        return None;
    }
    std::fs::read_to_string(path).ok()
}

fn mtime(path: &Path) -> u64 {
    path.metadata()
        .and_then(|m| m.modified())
        .ok()
        .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
        .map(|d| d.as_secs())
        .unwrap_or(0)
}

/// Claude Code and Codex data folders: the user's own and those of Nexus account profiles.
fn agent_dirs() -> (Vec<PathBuf>, Vec<PathBuf>) {
    let home_dir = home();
    let (mut claude, mut codex) = (vec![home_dir.join(".claude")], vec![home_dir.join(".codex")]);
    for profile in load_profiles().unwrap_or_default() {
        match profile.provider.as_str() {
            "claude" => claude.push(PathBuf::from(&profile.config_dir)),
            "codex" => codex.push(PathBuf::from(&profile.config_dir)),
            _ => {}
        }
    }
    (claude, codex)
}

fn codex_files(dir: &Path) -> Vec<PathBuf> {
    let mut files = Vec::new();
    let mut stack = vec![(dir.join("sessions"), 0)];
    while let Some((d, depth)) = stack.pop() {
        let Ok(entries) = std::fs::read_dir(&d) else {
            continue;
        };
        for e in entries.flatten() {
            let p = e.path();
            if p.is_dir() && depth < 4 {
                stack.push((p, depth + 1));
            } else if p.extension().is_some_and(|x| x == "jsonl") {
                files.push(p);
            }
        }
    }
    files
}

fn first_line(path: &Path) -> String {
    let mut line = String::new();
    if let Ok(f) = std::fs::File::open(path) {
        let _ = std::io::BufReader::new(f.take(64 * 1024)).read_line(&mut line);
    }
    line
}

fn same_path(a: &str, b: &str) -> bool {
    let canon = |p: &str| {
        std::fs::canonicalize(p)
            .map(|c| c.to_string_lossy().into_owned())
            .unwrap_or_else(|_| p.trim_end_matches('/').to_string())
    };
    a.trim_end_matches('/') == b.trim_end_matches('/') || canon(a) == canon(b)
}

/// Session files per project folder: Claude Code by its folder naming, Codex by the `cwd` in the first line.
pub(crate) struct SessionIndex {
    claude_dirs: Vec<PathBuf>,
    codex: Vec<(String, PathBuf)>,
}
impl SessionIndex {
    pub(crate) fn scan() -> Self {
        let (claude_dirs, codex_dirs) = agent_dirs();
        let codex = codex_dirs
            .iter()
            .flat_map(|d| codex_files(d))
            .filter_map(|f| {
                let cwd = project_import::codex_session_cwd(&first_line(&f))?;
                Some((cwd, f))
            })
            .collect();
        SessionIndex { claude_dirs, codex }
    }
    pub(crate) fn files(&self, workspace: &str) -> Vec<(&'static str, PathBuf)> {
        let mut out: Vec<(&'static str, PathBuf)> = Vec::new();
        let mut names = vec![project_import::claude_folder_name(
            workspace.trim_end_matches('/'),
        )];
        if let Ok(c) = std::fs::canonicalize(workspace) {
            let n = project_import::claude_folder_name(&c.to_string_lossy());
            if !names.contains(&n) {
                names.push(n);
            }
        }
        for dir in &self.claude_dirs {
            for name in &names {
                if let Ok(entries) = std::fs::read_dir(dir.join("projects").join(name)) {
                    out.extend(
                        entries
                            .flatten()
                            .map(|e| e.path())
                            .filter(|p| p.extension().is_some_and(|x| x == "jsonl"))
                            .map(|p| ("claude", p)),
                    );
                }
            }
        }
        out.extend(
            self.codex
                .iter()
                .filter(|(cwd, _)| same_path(cwd, workspace))
                .map(|(_, f)| ("codex", f.clone())),
        );
        out.sort_by_key(|(_, p)| std::cmp::Reverse(mtime(p)));
        out.dedup_by(|a, b| a.1 == b.1);
        out
    }
}

pub(crate) fn parse_file(source: &str, path: &Path) -> Option<Session> {
    let text = read_limited(path)?;
    let stem = path
        .file_stem()
        .map(|s| s.to_string_lossy().into_owned())
        .unwrap_or_default();
    match source {
        "claude" => parse_claude(&text, &stem),
        _ => parse_codex(&text, &stem),
    }
}

/// Adds sessions to a project as chats, skipping ones imported before. Returns the number of new chats.
pub(crate) fn import_sessions(project_id_value: &str, sessions: Vec<Session>) -> Result<usize, String> {
    let _guard = PROJECTS_LOCK.lock().map_err(|_| "Project storage lock failed")?;
    let mut db = load_project_store()?;
    if !db.projects.iter().any(|p| p.id == project_id_value) {
        return Err("Проект не найден".into());
    }
    let known: HashSet<String> = db.chats.iter().filter_map(|c| c.imported_from.clone()).collect();
    let mut added = 0;
    for s in sessions {
        if known.contains(&s.key) {
            continue;
        }
        let chat_id = project_id();
        let started = s.messages.first().map(|m| m.2).unwrap_or(0);
        db.chats.push(NexusChat {
            team_enabled: false,
            team_mode: None,
            routing_priority: None,
            model_choice: None,
            id: chat_id.clone(),
            project_id: project_id_value.to_string(),
            title: s.title.clone(),
            created_at: if started > 0 {
                time_string(started)
            } else {
                now_string()
            },
            folder_id: None,
            parent_chat_id: None,
            archived: false,
            deleted_at: None,
            unread: false,
            running: false,
            imported_from: Some(s.key.clone()),
        });
        for (role, content, at) in s.messages {
            db.messages.push(NexusMessage {
                id: project_id(),
                chat_id: chat_id.clone(),
                role,
                content,
                created_at: if at > 0 { time_string(at) } else { now_string() },
                details: None,
                rating: None,
                attachments: vec![],
                question_selections: HashMap::new(),
                stopped: false,
                variants: vec![],
                variant: 0,
                edited: false,
            });
        }
        added += 1;
    }
    if added > 0 {
        save_project_store(&db)?;
    }
    Ok(added)
}

/// Keys of sessions already imported into the project with this workspace.
pub(crate) fn imported_keys() -> HashSet<String> {
    load_project_store()
        .map(|db| db.chats.into_iter().filter_map(|c| c.imported_from).collect())
        .unwrap_or_default()
}

/// Reads the sessions of a workspace that are not imported yet, newest first.
pub(crate) fn new_sessions(index: &SessionIndex, workspace: &str, known: &HashSet<String>) -> Vec<Session> {
    let mut seen = HashSet::new();
    index
        .files(workspace)
        .into_iter()
        .filter_map(|(source, path)| parse_file(source, &path))
        .filter(|s| !known.contains(&s.key) && seen.insert(s.key.clone()))
        .take(MAX_SESSIONS)
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_times() {
        assert_eq!(parse_time("1970-01-01T00:00:00Z"), Some(0));
        assert_eq!(parse_time("2026-11-14T10:20:30.123Z"), Some(1794651630));
        assert_eq!(parse_time("2026-11-14T13:20:30+03:00"), Some(1794651630));
        assert_eq!(parse_time("nope"), None);
    }

    #[test]
    fn claude_session_keeps_only_the_conversation() {
        let text = [
            r#"{"type":"summary","summary":"Fix the build","leafUuid":"x"}"#,
            r#"{"type":"user","sessionId":"s1","timestamp":"2026-11-14T10:00:00Z","message":{"role":"user","content":"<command-name>/clear</command-name>"}}"#,
            r#"{"type":"user","sessionId":"s1","timestamp":"2026-11-14T10:00:01Z","message":{"role":"user","content":"Why does it fail?<system-reminder>ctx</system-reminder>"}}"#,
            r#"{"type":"assistant","sessionId":"s1","timestamp":"2026-11-14T10:00:02Z","message":{"role":"assistant","content":[{"type":"text","text":"Let me look."},{"type":"tool_use","id":"t","name":"Read","input":{}}]}}"#,
            r#"{"type":"user","sessionId":"s1","timestamp":"2026-11-14T10:00:03Z","message":{"role":"user","content":[{"type":"tool_result","tool_use_id":"t","content":"file"}]}}"#,
            r#"{"type":"assistant","sessionId":"s1","timestamp":"2026-11-14T10:00:04Z","message":{"role":"assistant","content":[{"type":"thinking","thinking":"hm"},{"type":"text","text":"A missing import."}]}}"#,
            r#"{"type":"assistant","isSidechain":true,"sessionId":"s1","message":{"role":"assistant","content":[{"type":"text","text":"subagent"}]}}"#,
        ]
        .join("\n");
        let s = parse_claude(&text, "file").unwrap();
        assert_eq!(s.key, "claude:s1");
        assert_eq!(s.title, "Fix the build");
        assert_eq!(s.messages.len(), 2);
        assert_eq!(s.messages[0].1, "Why does it fail?");
        assert_eq!(s.messages[1].1, "Let me look.\n\nA missing import.");
        assert_eq!(s.messages[0].2, parse_time("2026-11-14T10:00:01Z").unwrap());
    }

    #[test]
    fn codex_session_uses_typed_messages() {
        let text = [
            r#"{"timestamp":"2026-11-14T10:00:00Z","type":"session_meta","payload":{"id":"abc","cwd":"/Users/a/game"}}"#,
            r#"{"timestamp":"2026-11-14T10:00:01Z","type":"response_item","payload":{"type":"message","role":"user","content":[{"type":"input_text","text":"<environment_context>cwd</environment_context>"}]}}"#,
            r#"{"timestamp":"2026-11-14T10:00:01Z","type":"response_item","payload":{"type":"message","role":"user","content":[{"type":"input_text","text":"Add a menu\nwith options"}]}}"#,
            r#"{"timestamp":"2026-11-14T10:00:01Z","type":"event_msg","payload":{"type":"user_message","message":"Add a menu\nwith options"}}"#,
            r#"{"timestamp":"2026-11-14T10:00:05Z","type":"response_item","payload":{"type":"function_call","name":"shell","arguments":"{}"}}"#,
            r#"{"timestamp":"2026-11-14T10:00:09Z","type":"response_item","payload":{"type":"message","role":"assistant","content":[{"type":"output_text","text":"Done."}]}}"#,
        ]
        .join("\n");
        let s = parse_codex(&text, "rollout").unwrap();
        assert_eq!(s.key, "codex:abc");
        assert_eq!(s.title, "Add a menu");
        assert_eq!(
            s.messages
                .iter()
                .map(|m| (m.0.as_str(), m.1.as_str()))
                .collect::<Vec<_>>(),
            vec![("user", "Add a menu\nwith options"), ("assistant", "Done.")]
        );
    }

    #[test]
    fn sessions_without_an_answer_are_skipped() {
        let text = r#"{"type":"user","sessionId":"s","message":{"role":"user","content":"hi"}}"#;
        assert!(parse_claude(text, "f").is_none());
    }
}
