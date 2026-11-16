use std::{
    collections::HashMap,
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc, LazyLock, Mutex,
    },
    time::Instant,
};
use tokio::sync::Notify;
pub const STOPPED: &str = "NEXUS_GENERATION_STOPPED";
pub struct Control {
    specialist: bool,
    pub request_id: String,
    pub chat_id: String,
    effort: Mutex<String>,
    model: Mutex<String>,
    account: Mutex<String>,
    manual_model: AtomicBool,
    permission_used: AtomicBool,
    started: AtomicBool,
    stopped: AtomicBool,
    wake: Notify,
    prefix: Mutex<String>,
    text: Mutex<String>,
    metadata: Mutex<String>,
    log: Mutex<String>,
    created: Instant,
    browser: Mutex<Option<super::browser_tools::Spec>>,
    auto_approve: AtomicBool,
    /// How the model was chosen (routing arbiter), shown as the first stages of the answer's progress.
    routing: Mutex<String>,
}
impl Control {
    fn new(chat_id: String, request_id: String) -> Self {
        Self {
            specialist: false,
            chat_id,
            request_id,
            effort: Mutex::new("low".into()),
            model: Mutex::new("default".into()),
            account: Mutex::new(String::new()),
            manual_model: AtomicBool::new(false),
            permission_used: AtomicBool::new(false),
            started: AtomicBool::new(false),
            stopped: AtomicBool::new(false),
            wake: Notify::new(),
            prefix: Mutex::new(String::new()),
            text: Mutex::new(String::new()),
            metadata: Mutex::new(String::new()),
            log: Mutex::new(String::new()),
            created: Instant::now(),
            browser: Mutex::new(None),
            auto_approve: AtomicBool::new(false),
            routing: Mutex::new(String::new()),
        }
    }
    pub fn specialist(chat: &str, effort: String) -> Self {
        let mut c = Self::new(chat.into(), super::project_id());
        c.specialist = true;
        c.set_effort(&effort);
        c.set_manual_model(true);
        c
    }
    pub fn is_specialist(&self) -> bool {
        self.specialist
    }
    /// «Выполнение · без разрешений»: agent requests of this generation are approved without a card.
    pub fn set_auto_approve(&self, value: bool) {
        self.auto_approve
            .store(value && !self.specialist, Ordering::SeqCst)
    }
    pub fn auto_approve(&self) -> bool {
        self.auto_approve.load(Ordering::SeqCst)
    }
    // Browser gateway of this generation; never set for read-only team specialists.
    pub fn set_browser(&self, spec: Option<super::browser_tools::Spec>) {
        if self.specialist {
            return;
        }
        if let Ok(mut browser) = self.browser.lock() {
            *browser = spec
        }
    }
    pub fn browser(&self) -> Option<super::browser_tools::Spec> {
        if self.specialist {
            return None;
        }
        self.browser.lock().ok().and_then(|b| b.clone())
    }
    pub fn set_effort(&self, value: &str) {
        if let Ok(mut effort) = self.effort.lock() {
            *effort = value.into()
        }
    }
    pub fn effort(&self) -> String {
        self.effort
            .lock()
            .map(|v| v.clone())
            .unwrap_or_else(|_| "low".into())
    }
    pub fn set_account(&self, id: &str) {
        if let Ok(mut value) = self.account.lock() {
            *value = id.into()
        }
    }
    pub fn account(&self) -> String {
        self.account.lock().map(|v| v.clone()).unwrap_or_default()
    }
    pub fn set_model(&self, value: &str) {
        if let Ok(mut model) = self.model.lock() {
            *model = value.into()
        }
    }
    pub fn model(&self) -> serde_json::Value {
        let model = self
            .model
            .lock()
            .map(|v| v.clone())
            .unwrap_or_else(|_| "default".into());
        if model == "default" {
            serde_json::Value::Null
        } else {
            serde_json::Value::String(model)
        }
    }
    pub fn set_manual_model(&self, value: bool) {
        self.manual_model.store(value, Ordering::SeqCst)
    }
    pub fn manual_model(&self) -> bool {
        self.manual_model.load(Ordering::SeqCst)
    }
    pub fn mark_permission(&self) {
        self.permission_used.store(true, Ordering::SeqCst)
    }
    pub fn permission_used(&self) -> bool {
        self.permission_used.load(Ordering::SeqCst)
    }
    pub fn stopped(&self) -> bool {
        self.stopped.load(Ordering::SeqCst)
    }
    pub fn stop(&self) {
        self.stopped.store(true, Ordering::SeqCst);
        self.wake.notify_waiters();
        self.wake.notify_one()
    }
    pub async fn cancelled(&self) {
        loop {
            let notified = self.wake.notified();
            tokio::pin!(notified);
            notified.as_mut().enable();
            if self.stopped() {
                return;
            }
            notified.await;
        }
    }
    pub fn prefix(&self) -> String {
        self.prefix.lock().map(|v| v.clone()).unwrap_or_default()
    }
    pub fn next_phase(&self, label: &str) {
        let text = self.text();
        if let Ok(mut prefix) = self.prefix.lock() {
            *prefix = format!("{}\n\n### {}\n\n", text, label)
        }
    }
    pub fn update(&self, text: &str) {
        let prefix = self.prefix();
        if let Ok(mut saved) = self.text.lock() {
            *saved = format!("{prefix}{text}")
        }
    }
    pub fn metadata(&self, value: &str) {
        if let Ok(mut s) = self.metadata.lock() {
            *s = value.into()
        }
    }
    pub fn diagnostics(&self, value: &str) {
        if let Ok(mut s) = self.log.lock() {
            *s = value.into()
        }
    }
    pub fn routing(&self) -> String {
        self.routing.lock().map(|s| s.clone()).unwrap_or_default()
    }
    pub fn details(&self) -> String {
        format!(
            "{}{}\n{}",
            self.routing.lock().map(|s| s.clone()).unwrap_or_default(),
            self.metadata.lock().map(|s| s.clone()).unwrap_or_default(),
            self.log.lock().map(|s| s.clone()).unwrap_or_default()
        )
    }
    pub fn text(&self) -> String {
        self.text.lock().map(|s| s.clone()).unwrap_or_default()
    }
}
static RUNS: LazyLock<Mutex<HashMap<String, Arc<Control>>>> = LazyLock::new(|| Mutex::new(HashMap::new()));
pub struct Run(pub Arc<Control>);
impl Drop for Run {
    fn drop(&mut self) {
        if let Ok(mut runs) = RUNS.lock() {
            runs.remove(&self.0.request_id);
        }
    }
}
fn valid(id: &str) -> bool {
    !id.is_empty() && id.len() <= 100 && id.chars().all(|c| c.is_ascii_alphanumeric() || c == '-')
}
pub fn begin(chat: &str, id: String) -> Result<Run, String> {
    if !valid(&id) {
        return Err("Invalid generation ID".into());
    }
    let mut runs = RUNS.lock().map_err(|_| "Generation registry unavailable")?;
    runs.retain(|_, c| c.started.load(Ordering::SeqCst) || c.created.elapsed().as_secs() < 900);
    if runs
        .values()
        .any(|c| c.chat_id == chat && c.started.load(Ordering::SeqCst))
    {
        return Err("This chat already has a running request".into());
    }
    let control = runs
        .entry(id.clone())
        .or_insert_with(|| Arc::new(Control::new(chat.into(), id)))
        .clone();
    if control.chat_id != chat || control.started.swap(true, Ordering::SeqCst) {
        return Err("Generation already started or belongs to another chat".into());
    }
    Ok(Run(control))
}
/// Attaches the routing steps (made in the interface before sending) to this generation, so they become the
/// first stages of the answer's progress. Lines are `Routing step: <title>|<detail>`; anything else is dropped.
#[tauri::command]
pub fn set_chat_route_note(
    chat_id: String,
    request_id: String,
    steps: Vec<(String, String)>,
) -> Result<(), String> {
    if !valid(&request_id) {
        return Err("Invalid generation ID".into());
    }
    let clean = |s: &str, n: usize| -> String {
        s.chars()
            .filter(|c| !c.is_control())
            .take(n)
            .collect::<String>()
            .replace('|', "/")
    };
    let note: String = steps
        .iter()
        .take(4)
        .map(|(t, d)| format!("Routing step: {}|{}\n", clean(t, 80), clean(d, 400)))
        .collect();
    let mut runs = RUNS.lock().map_err(|_| "Generation registry unavailable")?;
    runs.retain(|_, c| c.started.load(Ordering::SeqCst) || c.created.elapsed().as_secs() < 900);
    if runs.len() >= 128 && !runs.contains_key(&request_id) {
        return Err("Too many pending generations".into());
    }
    let c = runs
        .entry(request_id.clone())
        .or_insert_with(|| Arc::new(Control::new(chat_id.clone(), request_id)));
    if c.chat_id != chat_id {
        return Err("Generation belongs to another chat".into());
    }
    if let Ok(mut r) = c.routing.lock() {
        *r = note;
    }
    Ok(())
}
#[tauri::command]
pub fn cancel_chat_generation(chat_id: String, request_id: String) -> Result<(), String> {
    if !valid(&request_id) {
        return Err("Invalid generation ID".into());
    }
    if !super::load_project_store()?.chats.iter().any(|c| c.id == chat_id) {
        return Err("Chat not found".into());
    }
    stop(&chat_id, request_id)
}
fn stop(chat: &str, id: String) -> Result<(), String> {
    let mut runs = RUNS.lock().map_err(|_| "Generation registry unavailable")?;
    runs.retain(|_, c| c.started.load(Ordering::SeqCst) || c.created.elapsed().as_secs() < 900);
    if runs.len() >= 128 && !runs.contains_key(&id) {
        return Err("Too many pending generations".into());
    }
    let c = runs
        .entry(id.clone())
        .or_insert_with(|| Arc::new(Control::new(chat.into(), id)));
    if c.chat_id != chat {
        return Err("Generation belongs to another chat".into());
    }
    c.stop();
    Ok(())
}
#[cfg(test)]
mod tests {
    use super::*;
    #[tokio::test]
    async fn stop_before_start_is_scoped_and_retains_partial() {
        let id = super::super::project_id();
        stop("test-stop", id.clone()).unwrap();
        assert!(stop("another-chat", id.clone()).is_err());
        let run = begin("test-stop", id.clone()).unwrap();
        run.0.cancelled().await;
        run.0.update("Часть ответа 🐈");
        assert_eq!(run.0.text(), "Часть ответа 🐈");
        assert!(begin("test-stop", id.clone()).is_err());
        drop(run);
        assert!(!RUNS.lock().unwrap().contains_key(&id));
    }
    #[tokio::test]
    async fn running_stop_wakes_and_duplicate_stop_is_safe() {
        let id = super::super::project_id();
        let run = begin("test-running-stop", id.clone()).unwrap();
        stop("test-running-stop", id.clone()).unwrap();
        stop("test-running-stop", id).unwrap();
        tokio::time::timeout(std::time::Duration::from_millis(50), run.0.cancelled())
            .await
            .unwrap();
    }
    #[test]
    fn repair_phase_preserves_streamed_prefix_for_stop() {
        let control = Control::new("repair".into(), "repair-id".into());
        control.update("Первый ответ");
        control.next_phase("Исправление");
        control.update("");
        assert!(control.text().starts_with("Первый ответ"));
        control.update("Исправленная часть");
        assert_eq!(
            control.text(),
            "Первый ответ\n\n### Исправление\n\nИсправленная часть"
        );
        control.stop();
        assert!(control.text().contains("Исправленная часть"));
    }
}

pub fn is_running(chat: &str) -> bool {
    RUNS.lock()
        .map(|runs| {
            runs.values()
                .any(|c| c.chat_id == chat && c.started.load(Ordering::SeqCst))
        })
        .unwrap_or(false)
}

/// True while this chat runs a generation in «Выполнение · без разрешений».
pub fn auto_approved(chat: &str) -> bool {
    RUNS.lock()
        .map(|runs| {
            runs.values()
                .any(|c| c.chat_id == chat && c.started.load(Ordering::SeqCst) && c.auto_approve())
        })
        .unwrap_or(false)
}

/// Stops every running generation of a chat (local API and CLI «stop»). Returns whether one was running.
pub fn stop_chat(chat: &str) -> bool {
    let list: Vec<Arc<Control>> = RUNS
        .lock()
        .map(|runs| {
            runs.values()
                .filter(|c| c.chat_id == chat && c.started.load(Ordering::SeqCst))
                .cloned()
                .collect()
        })
        .unwrap_or_default();
    for c in &list {
        c.stop();
    }
    !list.is_empty()
}
