//! Automations: prompts that run on a schedule (once, every N minutes, daily, on weekdays) in a project,
//! either in one chosen chat or in a new chat each time. A background loop checks every 20 seconds while
//! Nexus is open and sends the prompt through `unified_chat_send`, the same path as the interface and channels,
//! so routing, permissions and checks behave the same. Stored in `automations.json`.
use super::*;
use serde_json::{json, Value};
use std::sync::LazyLock;

#[derive(Clone, Serialize, Deserialize, Debug, PartialEq)]
#[serde(tag = "kind", rename_all = "lowercase")]
pub(crate) enum Schedule {
    /// Unix seconds.
    Once {
        at: u64,
    },
    Interval {
        minutes: u32,
    },
    /// Local time "HH:MM".
    Daily {
        time: String,
    },
    /// Local time and ISO weekdays (1 = Monday … 7 = Sunday).
    Weekly {
        time: String,
        days: Vec<u8>,
    },
}

#[derive(Clone, Serialize, Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
pub(crate) struct Automation {
    pub id: String,
    pub name: String,
    pub project_id: String,
    /// The chat that receives every run; `None` = a new chat for each run.
    #[serde(default)]
    pub chat_id: Option<String>,
    pub prompt: String,
    pub schedule: Schedule,
    /// "discuss" or "execute" (execution with permission cards). Never execution without permissions.
    #[serde(default = "discuss")]
    pub mode: String,
    #[serde(default)]
    pub model: Option<String>,
    /// New chats of this automation run on their own git branch.
    #[serde(default)]
    pub worktree: bool,
    #[serde(default = "yes")]
    pub enabled: bool,
    #[serde(default)]
    pub next_run: Option<u64>,
    #[serde(default)]
    pub last_run: Option<u64>,
    #[serde(default)]
    pub last_status: String,
    #[serde(default)]
    pub last_error: String,
    #[serde(default)]
    pub last_chat: Option<String>,
    #[serde(default)]
    pub runs: u32,
    #[serde(default)]
    pub created_at: String,
}
fn discuss() -> String {
    "discuss".into()
}
fn yes() -> bool {
    true
}

static LOCK: std::sync::Mutex<()> = std::sync::Mutex::new(());
static RUNNING: LazyLock<std::sync::Mutex<std::collections::HashSet<String>>> =
    LazyLock::new(|| std::sync::Mutex::new(Default::default()));
static STARTED: AtomicBool = AtomicBool::new(false);
const MAX_AUTOMATIONS: usize = 100;
const MIN_INTERVAL: u32 = 5;

fn path() -> PathBuf {
    project_store_path().with_file_name("automations.json")
}
pub(crate) fn load() -> Vec<Automation> {
    std::fs::read(path())
        .ok()
        .and_then(|b| serde_json::from_slice(&b).ok())
        .unwrap_or_default()
}
fn save(list: &[Automation]) -> Result<(), String> {
    let p = path();
    if let Some(dir) = p.parent() {
        std::fs::create_dir_all(dir).map_err(|e| e.to_string())?;
    }
    let tmp = p.with_extension("json.tmp");
    std::fs::write(&tmp, serde_json::to_vec_pretty(list).map_err(|e| e.to_string())?)
        .map_err(|e| e.to_string())?;
    std::fs::rename(tmp, p).map_err(|e| e.to_string())
}
fn update(id: &str, f: impl FnOnce(&mut Automation)) -> Result<Option<Automation>, String> {
    let _g = LOCK.lock().map_err(|_| "Automation lock failed")?;
    let mut list = load();
    let out = list.iter_mut().find(|a| a.id == id).map(|a| {
        f(a);
        a.clone()
    });
    save(&list)?;
    Ok(out)
}
pub(crate) fn enabled_count() -> usize {
    load().iter().filter(|a| a.enabled).count()
}

pub(crate) fn now_secs() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0)
}
/// UTC offset of the computer's time zone in seconds (`date +%z`), 0 if it cannot be read.
pub(crate) fn local_offset() -> i64 {
    std::process::Command::new("date")
        .arg("+%z")
        .output()
        .ok()
        .and_then(|o| parse_offset(String::from_utf8_lossy(&o.stdout).trim()))
        .unwrap_or(0)
}
pub(crate) fn parse_offset(s: &str) -> Option<i64> {
    let (sign, rest) = match s.as_bytes().first()? {
        b'+' => (1, &s[1..]),
        b'-' => (-1, &s[1..]),
        _ => return None,
    };
    if rest.len() != 4 || !rest.bytes().all(|b| b.is_ascii_digit()) {
        return None;
    }
    let h: i64 = rest[..2].parse().ok()?;
    let m: i64 = rest[2..].parse().ok()?;
    Some(sign * (h * 3600 + m * 60))
}
pub(crate) fn parse_time(t: &str) -> Option<i64> {
    let (h, m) = t.trim().split_once(':')?;
    let (h, m): (i64, i64) = (h.parse().ok()?, m.parse().ok()?);
    ((0..24).contains(&h) && (0..60).contains(&m)).then_some(h * 3600 + m * 60)
}
/// Next run strictly after `now` (UTC seconds) for a local-time schedule; None when a one-time run has passed.
pub(crate) fn next_after(schedule: &Schedule, now: u64, offset: i64) -> Option<u64> {
    let local = now as i64 + offset;
    let day = local.div_euclid(86400);
    match schedule {
        Schedule::Once { at } => (*at > now).then_some(*at),
        Schedule::Interval { minutes } => Some(now + (*minutes).max(MIN_INTERVAL) as u64 * 60),
        Schedule::Daily { time } => {
            let t = parse_time(time)?;
            let mut at = day * 86400 + t;
            if at <= local {
                at += 86400;
            }
            Some((at - offset) as u64)
        }
        Schedule::Weekly { time, days } => {
            let t = parse_time(time)?;
            (0..8).find_map(|k| {
                let d = day + k;
                // 1970-01-01 was a Thursday (ISO 4).
                let weekday = ((d + 3).rem_euclid(7) + 1) as u8;
                let at = d * 86400 + t;
                (days.contains(&weekday) && at > local).then(|| (at - offset) as u64)
            })
        }
    }
}

fn validate(a: &mut Automation) -> Result<(), String> {
    a.name = a.name.trim().chars().take(80).collect();
    a.prompt = a.prompt.trim().to_string();
    if a.name.is_empty() {
        return Err("Укажите название".into());
    }
    if a.prompt.is_empty() || a.prompt.chars().count() > 12000 {
        return Err("Текст задания: от 1 до 12000 символов".into());
    }
    if !["discuss", "execute"].contains(&a.mode.as_str()) {
        return Err("Режим автоматизации: «Обсуждение» или «Выполнение · с разрешениями»".into());
    }
    match &mut a.schedule {
        Schedule::Interval { minutes } if *minutes < MIN_INTERVAL => {
            return Err(format!("Интервал не меньше {MIN_INTERVAL} минут"))
        }
        Schedule::Daily { time } | Schedule::Weekly { time, .. } if parse_time(time).is_none() => {
            return Err("Время в формате ЧЧ:ММ".into())
        }
        Schedule::Weekly { days, .. } => {
            days.retain(|d| (1..=7).contains(d));
            days.sort();
            days.dedup();
            if days.is_empty() {
                return Err("Выберите хотя бы один день недели".into());
            }
        }
        _ => {}
    }
    let db = load_project_store()?;
    if !db.projects.iter().any(|p| p.id == a.project_id) {
        return Err("Проект не найден".into());
    }
    if let Some(chat) = &a.chat_id {
        if !db
            .chats
            .iter()
            .any(|c| &c.id == chat && c.project_id == a.project_id && c.deleted_at.is_none())
        {
            return Err("Выбранный чат не найден в этом проекте".into());
        }
    }
    Ok(())
}

#[tauri::command]
pub(crate) fn list_automations() -> Vec<Automation> {
    let running = RUNNING.lock().map(|r| r.clone()).unwrap_or_default();
    load()
        .into_iter()
        .map(|mut a| {
            if running.contains(&a.id) {
                a.last_status = "running".into()
            }
            a
        })
        .collect()
}
#[tauri::command]
pub(crate) fn save_automation(app: tauri::AppHandle, automation: Automation) -> Result<Automation, String> {
    let mut a = automation;
    validate(&mut a)?;
    let _g = LOCK.lock().map_err(|_| "Automation lock failed")?;
    let mut list = load();
    if a.id.is_empty() {
        if list.len() >= MAX_AUTOMATIONS {
            return Err(format!("Не больше {MAX_AUTOMATIONS} автоматизаций"));
        }
        a.id = project_id();
        a.created_at = now_string();
    }
    let previous = list.iter().find(|x| x.id == a.id).cloned();
    // Statistics are kept by Nexus; the schedule decides the next run again on every save.
    if let Some(p) = &previous {
        a.last_run = p.last_run;
        a.last_status = p.last_status.clone();
        a.last_error = p.last_error.clone();
        a.last_chat = p.last_chat.clone();
        a.runs = p.runs;
        a.created_at = p.created_at.clone();
    }
    a.next_run = if a.enabled {
        next_after(&a.schedule, now_secs(), local_offset())
    } else {
        None
    };
    if a.enabled && a.next_run.is_none() {
        return Err("Время разового запуска уже прошло".into());
    }
    list.retain(|x| x.id != a.id);
    list.push(a.clone());
    save(&list)?;
    drop(_g);
    super::background::apply();
    let _ = app.emit("automations-event", json!({}));
    Ok(a)
}
#[tauri::command]
pub(crate) fn toggle_automation(
    app: tauri::AppHandle,
    id: String,
    enabled: bool,
) -> Result<Automation, String> {
    let a = update(&id, |a| {
        a.enabled = enabled;
        a.next_run = if enabled {
            next_after(&a.schedule, now_secs(), local_offset())
        } else {
            None
        };
        if enabled && a.next_run.is_none() {
            a.enabled = false
        }
    })?
    .ok_or("Автоматизация не найдена")?;
    super::background::apply();
    let _ = app.emit("automations-event", json!({}));
    if enabled && !a.enabled {
        return Err("Время разового запуска уже прошло — измените дату".into());
    }
    Ok(a)
}
#[tauri::command]
pub(crate) fn remove_automation(app: tauri::AppHandle, id: String) -> Result<(), String> {
    let _g = LOCK.lock().map_err(|_| "Automation lock failed")?;
    let mut list = load();
    list.retain(|a| a.id != id);
    save(&list)?;
    drop(_g);
    super::background::apply();
    let _ = app.emit("automations-event", json!({}));
    Ok(())
}
#[tauri::command]
pub(crate) fn run_automation_now(app: tauri::AppHandle, id: String) -> Result<(), String> {
    let a = load()
        .into_iter()
        .find(|a| a.id == id)
        .ok_or("Автоматизация не найдена")?;
    if RUNNING.lock().map(|r| r.contains(&id)).unwrap_or(false) {
        return Err("Эта автоматизация уже выполняется".into());
    }
    tauri::async_runtime::spawn(run(app, a, false));
    Ok(())
}

fn target_chat(a: &Automation) -> Result<String, String> {
    if let Some(id) = &a.chat_id {
        let db = load_project_store()?;
        if db
            .chats
            .iter()
            .any(|c| &c.id == id && c.deleted_at.is_none() && !c.archived)
        {
            return Ok(id.clone());
        }
        return Err("Чат автоматизации удалён или в архиве".into());
    }
    let title = format!("⏱ {}", a.name).chars().take(100).collect::<String>();
    let chat = create_project_chat(a.project_id.clone(), title)?;
    if a.worktree {
        // A project outside git keeps the project folder; the run itself still happens.
        let _ = chat_worktree::enable_for(&chat.id);
    }
    Ok(chat.id)
}

async fn run(app: tauri::AppHandle, a: Automation, scheduled: bool) {
    if let Ok(mut r) = RUNNING.lock() {
        if !r.insert(a.id.clone()) {
            return;
        }
    }
    let _ = app.emit("automations-event", json!({}));
    let chat = match target_chat(&a) {
        Ok(c) => c,
        Err(e) => {
            finish(&app, &a, scheduled, None, "error", &e);
            return;
        }
    };
    if chat_runs::is_running(&chat) {
        // The chat is busy with another answer: try again in a minute instead of interrupting it.
        let _ = update(&a.id, |x| {
            x.next_run = Some(now_secs() + 60);
            x.last_status = "waiting".into();
            x.last_error = "Чат занят другим ответом — повтор через минуту".into();
        });
        if let Ok(mut r) = RUNNING.lock() {
            r.remove(&a.id);
        }
        let _ = app.emit("automations-event", json!({}));
        return;
    }
    let result = unified_chat_send(
        app.clone(),
        chat.clone(),
        a.prompt.clone(),
        "balanced".into(),
        None,
        Some(project_id()),
        None,
        None,
        a.model.clone().filter(|m| m != "auto" && !m.is_empty()),
        Some(a.mode.clone()),
        None,
        None,
    )
    .await;
    let (status, error) = match &result {
        Ok(r) if r.message.stopped => ("stopped", String::new()),
        Ok(_) => ("ok", String::new()),
        Err(e) if e == "NEXUS_ACCOUNT_UNAVAILABLE" => ("error", "Нет доступного подключённого агента".into()),
        Err(e) => ("error", e.chars().take(400).collect()),
    };
    finish(&app, &a, scheduled, Some(chat), status, &error);
}

fn finish(
    app: &tauri::AppHandle,
    a: &Automation,
    scheduled: bool,
    chat: Option<String>,
    status: &str,
    error: &str,
) {
    let now = now_secs();
    let _ = update(&a.id, |x| {
        x.last_run = Some(now);
        x.last_status = status.into();
        x.last_error = error.into();
        x.runs = x.runs.saturating_add(1);
        if chat.is_some() {
            x.last_chat = chat.clone();
        }
        if scheduled || x.next_run.is_some_and(|n| n <= now) {
            x.next_run = if x.enabled {
                next_after(&x.schedule, now, local_offset())
            } else {
                None
            };
            if x.next_run.is_none() {
                x.enabled = false
            }
        }
    });
    if let Ok(mut r) = RUNNING.lock() {
        r.remove(&a.id);
    }
    super::background::apply();
    let _ = app.emit("automations-event", json!({}));
}

/// Due automations at `now`: enabled, with a next run that has come.
pub(crate) fn due(list: &[Automation], now: u64) -> Vec<Automation> {
    list.iter()
        .filter(|a| a.enabled && a.next_run.is_some_and(|n| n <= now))
        .cloned()
        .collect()
}

pub(crate) fn start(app: &tauri::AppHandle) {
    if STARTED.swap(true, Ordering::SeqCst) {
        return;
    }
    let app = app.clone();
    tauri::async_runtime::spawn(async move {
        // A run missed while Nexus was closed happens once after start, not once per missed slot.
        tokio::time::sleep(Duration::from_secs(15)).await;
        loop {
            let running = RUNNING.lock().map(|r| r.clone()).unwrap_or_default();
            for a in due(&load(), now_secs()) {
                if !running.contains(&a.id) {
                    tauri::async_runtime::spawn(run(app.clone(), a, true));
                }
            }
            tokio::time::sleep(Duration::from_secs(20)).await;
        }
    });
}

#[tauri::command]
pub(crate) fn automation_preview(schedule: Schedule) -> Value {
    let offset = local_offset();
    let mut at = now_secs();
    let mut out = Vec::new();
    for _ in 0..3 {
        match next_after(&schedule, at, offset) {
            Some(n) => {
                out.push(n);
                at = n;
            }
            None => break,
        }
    }
    json!({"next": out})
}

#[cfg(test)]
mod tests {
    use super::*;
    // 2026-11-16 13:33:00 UTC is a Monday.
    const NOW: u64 = 1_794_836_000 - (1_794_836_000 % 60);
    #[test]
    fn offsets_and_times() {
        assert_eq!(parse_offset("+0300"), Some(10800));
        assert_eq!(parse_offset("-0530"), Some(-19800));
        assert_eq!(parse_offset("0300"), None);
        assert_eq!(parse_time("09:05"), Some(9 * 3600 + 300));
        assert_eq!(parse_time("24:00"), None);
        assert_eq!(parse_time("9"), None);
    }
    #[test]
    fn daily_and_weekly_use_local_time() {
        let offset = 3 * 3600;
        let local = |t: u64| ((t as i64 + offset).rem_euclid(86400)) / 60;
        let next = next_after(&Schedule::Daily { time: "09:00".into() }, NOW, offset).unwrap();
        assert!(next > NOW && next - NOW <= 86400);
        assert_eq!(local(next), 9 * 60);
        // Weekly on Monday at 23:00 local is later today (Monday) in Moscow.
        let mon = next_after(
            &Schedule::Weekly {
                time: "23:00".into(),
                days: vec![1],
            },
            NOW,
            offset,
        )
        .unwrap();
        assert!(mon - NOW < 86400);
        let sat = next_after(
            &Schedule::Weekly {
                time: "10:00".into(),
                days: vec![6],
            },
            NOW,
            offset,
        )
        .unwrap();
        assert!(sat - NOW > 4 * 86400 && sat - NOW < 6 * 86400);
        assert_eq!(local(sat), 600);
    }
    #[test]
    fn once_and_interval() {
        assert_eq!(
            next_after(&Schedule::Once { at: NOW + 10 }, NOW, 0),
            Some(NOW + 10)
        );
        assert_eq!(next_after(&Schedule::Once { at: NOW }, NOW, 0), None);
        assert_eq!(
            next_after(&Schedule::Interval { minutes: 1 }, NOW, 0),
            Some(NOW + 300)
        );
        assert_eq!(
            next_after(&Schedule::Interval { minutes: 60 }, NOW, 0),
            Some(NOW + 3600)
        );
    }
    #[test]
    fn due_and_storage_format() {
        let a: Automation = serde_json::from_value(json!({
            "id": "a", "name": "Report", "projectId": "p", "prompt": "x",
            "schedule": {"kind": "weekly", "time": "09:00", "days": [1, 5]}, "nextRun": NOW - 1
        }))
        .unwrap();
        assert!(a.enabled);
        assert_eq!(a.mode, "discuss");
        assert_eq!(due(std::slice::from_ref(&a), NOW).len(), 1);
        let mut off = a.clone();
        off.enabled = false;
        assert!(due(&[off], NOW).is_empty());
        let back = serde_json::to_value(&a).unwrap();
        assert_eq!(back["schedule"]["kind"], "weekly");
    }
}
