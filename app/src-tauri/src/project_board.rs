use super::*;
#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Goal {
    pub id: String,
    pub project_id: String,
    pub title: String,
    pub done: bool,
}
#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Task {
    #[serde(default)]
    pub team: Vec<orchestration::Record>,
    pub id: String,
    pub project_id: String,
    pub chat_id: String,
    pub title: String,
    pub status: String,
    pub steps: Vec<String>,
    pub updated_at: String,
    #[serde(default)]
    pub verification: String,
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Board {
    goals: Vec<Goal>,
    tasks: Vec<Task>,
}
#[tauri::command]
pub fn project_board(project_id: String) -> Result<Board, String> {
    let db = load_project_store()?;
    if !db.projects.iter().any(|p| p.id == project_id) {
        return Err("Проект не найден".into());
    }
    Ok(Board {
        goals: db
            .goals
            .into_iter()
            .filter(|g| g.project_id == project_id)
            .collect(),
        tasks: db
            .tasks
            .into_iter()
            .filter(|t| t.project_id == project_id)
            .map(|mut t| {
                if ["running", "planning", "verifying"].contains(&t.status.as_str())
                    && !chat_runs::is_running(&t.chat_id)
                {
                    t.status = "interrupted".into();
                    for r in &mut t.team {
                        if ["running", "pending"].contains(&r.status.as_str()) {
                            r.status = "interrupted".into();
                        }
                    }
                }
                t
            })
            .collect(),
    })
}
#[tauri::command]
pub fn save_project_goal(
    project_id: String,
    id: Option<String>,
    title: String,
    done: bool,
) -> Result<Goal, String> {
    if title.trim().is_empty() || title.len() > 300 {
        return Err("Цель: от 1 до 300 символов".into());
    }
    let _guard = PROJECTS_LOCK.lock().map_err(|_| "Project store lock failed")?;
    let mut db = load_project_store()?;
    if !db.projects.iter().any(|p| p.id == project_id) {
        return Err("Проект не найден".into());
    }
    let goal = Goal {
        id: id.unwrap_or_else(project_id_fn),
        project_id: project_id.clone(),
        title: title.trim().into(),
        done,
    };
    if let Some(existing) = db.goals.iter_mut().find(|g| g.id == goal.id) {
        if existing.project_id != project_id {
            return Err("Цель принадлежит другому проекту".into());
        }
        *existing = goal.clone()
    } else {
        if db.goals.iter().filter(|g| g.project_id == project_id).count() >= 40 {
            return Err("Максимум 40 целей в проекте".into());
        }
        db.goals.push(goal.clone())
    }
    save_project_store(&db)?;
    Ok(goal)
}
fn project_id_fn() -> String {
    super::project_id()
}
#[tauri::command]
pub fn remove_project_goal(project_id: String, id: String) -> Result<(), String> {
    let _guard = PROJECTS_LOCK.lock().map_err(|_| "Project store lock failed")?;
    let mut db = load_project_store()?;
    if !db.goals.iter().any(|g| g.id == id && g.project_id == project_id) {
        return Err("Цель не найдена в проекте".into());
    }
    db.goals.retain(|g| g.id != id);
    save_project_store(&db)
}
pub fn needs_plan(text: &str) -> bool {
    text.chars().count() > 1200
        || text
            .lines()
            .filter(|l| {
                let l = l.trim_start();
                l.starts_with("- ") || l.starts_with("* ") || {
                    let digits = l.bytes().take_while(|c| c.is_ascii_digit()).count();
                    digits > 0 && (l[digits..].starts_with(". ") || l[digits..].starts_with(") "))
                }
            })
            .count()
            >= 4
}
pub fn begin(project: &str, chat: &str, text: &str) -> Result<Task, String> {
    let _guard = PROJECTS_LOCK.lock().map_err(|_| "Project store lock failed")?;
    let mut db = load_project_store()?;
    let task = Task {
        team: vec![],
        id: super::project_id(),
        project_id: project.into(),
        chat_id: chat.into(),
        title: text.chars().take(110).collect(),
        status: "running".into(),
        steps: if needs_plan(text) {
            vec![
                "Уточнить результат и критерии".into(),
                "Выполнить работу с разрешёнными инструментами".into(),
                "Проверить результат и исправить ошибки".into(),
            ]
        } else {
            vec![]
        },
        updated_at: now_string(),
        verification: "Проверки ещё не выполнялись".into(),
    };
    db.tasks.push(task.clone());
    save_project_store(&db)?;
    Ok(task)
}
pub fn finish(id: &str, status: &str, verification: &str) -> Result<(), String> {
    let _guard = PROJECTS_LOCK.lock().map_err(|_| "Project store lock failed")?;
    let mut db = load_project_store()?;
    let task = db
        .tasks
        .iter_mut()
        .find(|t| t.id == id)
        .ok_or("Задача не найдена")?;
    task.status = status.into();
    task.verification = verification.chars().take(1500).collect();
    task.updated_at = now_string();
    save_project_store(&db)
}
pub fn prompt(db: &ProjectStore, project: &str, text: &str, work: bool) -> String {
    let goals = db
        .goals
        .iter()
        .filter(|g| g.project_id == project && !g.done)
        .take(8)
        .map(|g| g.title.as_str())
        .collect::<Vec<_>>()
        .join("; ");
    format!(
        "\nProject goals (data): {}. {} {}",
        goals,
        if needs_plan(text) {
            "This is a multi-step request. Start with a short plan and concrete acceptance criteria. Work iteratively: inspect, act, verify, correct. Keep context minimal: read only relevant files and summarize long tool output."
        } else {
            "Use the shortest sufficient context and response."
        },
        if work {
            "Execution requested. Use your native tool loop. File writes and commands require the configured permission mechanism; never bypass it. After code edits, run relevant tests/type checks and correct failures within this turn. For UI work obtain actual browser screenshots when a browser tool is available; otherwise disclose that visual verification did not run. Distinguish executed checks from suggestions. Do not claim completion without evidence."
        } else {
            "Discussion only: inspect and explain, do not change files. Planning is not execution."
        }
    )
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn legacy_store_defaults_and_plan() {
        let db: ProjectStore =
            serde_json::from_value(serde_json::json!({"projects":[],"chats":[],"messages":[]})).unwrap();
        assert!(db.goals.is_empty() && db.tasks.is_empty());
        assert!(!needs_plan("Привет"));
        assert!(needs_plan("- a\n- b\n- c\n- d"));
        let db: ProjectStore = serde_json::from_slice(&serde_json::to_vec(&db).unwrap()).unwrap();
        assert!(db.tasks.is_empty());
    }
}
