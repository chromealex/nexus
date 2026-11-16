//! Per-chat git worktrees ("separate branch") and the chat's changes (git status and diff) for the side panel.
//! A chat in worktree mode runs its agents in `NEXUS/worktrees/<chat>/<repo>` on its own branch, so several
//! chats can change the same repository in parallel without touching the user's main checkout.
//! Records live in `worktrees.json`; the chat record itself is not changed.
use super::*;
use serde_json::{json, Value};
use std::path::Path;

#[derive(Clone, Serialize, Deserialize, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub(crate) struct Worktree {
    pub chat_id: String,
    /// Root of the worktree (what `git worktree add` created).
    pub root: String,
    /// Working folder of the agents: the project's folder inside the worktree (the project may be a subfolder).
    pub path: String,
    pub branch: String,
    /// Commit the branch started from; the Changes tab compares against it.
    pub base: String,
    /// Root of the user's main checkout.
    pub repo_root: String,
    pub created_at: String,
}

static LOCK: std::sync::Mutex<()> = std::sync::Mutex::new(());
const MAX_FILES: usize = 500;
const MAX_DIFF: usize = 400_000;

fn store_path() -> PathBuf {
    project_store_path().with_file_name("worktrees.json")
}
fn worktrees_dir() -> PathBuf {
    project_store_path().with_file_name("worktrees")
}
fn load() -> Vec<Worktree> {
    std::fs::read(store_path())
        .ok()
        .and_then(|b| serde_json::from_slice(&b).ok())
        .unwrap_or_default()
}
fn save(list: &[Worktree]) -> Result<(), String> {
    let path = store_path();
    if let Some(dir) = path.parent() {
        std::fs::create_dir_all(dir).map_err(|e| e.to_string())?;
    }
    let tmp = path.with_extension("json.tmp");
    std::fs::write(&tmp, serde_json::to_vec_pretty(list).map_err(|e| e.to_string())?)
        .map_err(|e| e.to_string())?;
    std::fs::rename(tmp, path).map_err(|e| e.to_string())
}
/// The chat's worktree, if it has one that still exists on disk.
pub(crate) fn for_chat(chat_id: &str) -> Option<Worktree> {
    load()
        .into_iter()
        .find(|w| w.chat_id == chat_id && Path::new(&w.path).is_dir())
}
/// Working folder for a chat's agents: its worktree, otherwise the project folder.
pub(crate) fn chat_workspace(chat: &NexusChat, project: &NexusProject) -> Result<String, String> {
    match for_chat(&chat.id) {
        Some(w) => validate_workspace(&w.path),
        None => validate_workspace(&project.workspace),
    }
}
/// Line for the agent prompt so it knows where it works.
pub(crate) fn prompt(chat_id: &str) -> String {
    match for_chat(chat_id) {
        Some(w) => format!(
            "\n\nWorking copy: a separate git worktree of this repository on branch `{}` at {}. The user's main checkout is not touched. Do not switch branches; commit only when the user asks.",
            w.branch, w.path
        ),
        None => String::new(),
    }
}

pub(crate) fn git(dir: &Path, args: &[&str]) -> Result<String, String> {
    git_ok(dir, args, &[0])
}
/// Runs git and accepts the listed exit codes (`diff --no-index` exits with 1 when files differ).
fn git_ok(dir: &Path, args: &[&str], ok: &[i32]) -> Result<String, String> {
    let out = std::process::Command::new("git")
        .arg("-C")
        .arg(dir)
        .args(["-c", "core.quotepath=off"])
        .args(args)
        .env("GIT_TERMINAL_PROMPT", "0")
        .output()
        .map_err(|e| format!("Не удалось запустить git: {e}"))?;
    if ok.contains(&out.status.code().unwrap_or(-1)) {
        Ok(String::from_utf8_lossy(&out.stdout).into_owned())
    } else {
        let err = String::from_utf8_lossy(&out.stderr);
        let err = err.trim();
        Err(if err.is_empty() {
            format!("git {} завершился с ошибкой", args.first().unwrap_or(&""))
        } else {
            err.chars().take(600).collect()
        })
    }
}

/// Branch name from the chat title: `nexus/<slug>-<suffix>`.
pub(crate) fn branch_name(title: &str, chat_id: &str) -> String {
    let mut slug = String::new();
    for c in title.to_lowercase().chars() {
        let c = translit(c);
        for c in c.chars() {
            if c.is_ascii_alphanumeric() {
                slug.push(c)
            } else if !slug.ends_with('-') && !slug.is_empty() {
                slug.push('-')
            }
        }
        if slug.len() >= 40 {
            break;
        }
    }
    let slug = slug.trim_matches('-');
    let slug = if slug.is_empty() { "chat" } else { slug };
    let mut hash: u32 = 2166136261;
    for b in chat_id.bytes() {
        hash = (hash ^ b as u32).wrapping_mul(16777619);
    }
    format!("nexus/{slug}-{:06x}", hash & 0xffffff)
}
fn translit(c: char) -> String {
    const MAP: &[(char, &str)] = &[
        ('а', "a"),
        ('б', "b"),
        ('в', "v"),
        ('г', "g"),
        ('д', "d"),
        ('е', "e"),
        ('ё', "e"),
        ('ж', "zh"),
        ('з', "z"),
        ('и', "i"),
        ('й', "y"),
        ('к', "k"),
        ('л', "l"),
        ('м', "m"),
        ('н', "n"),
        ('о', "o"),
        ('п', "p"),
        ('р', "r"),
        ('с', "s"),
        ('т', "t"),
        ('у', "u"),
        ('ф', "f"),
        ('х', "h"),
        ('ц', "c"),
        ('ч', "ch"),
        ('ш', "sh"),
        ('щ', "sch"),
        ('ы', "y"),
        ('э', "e"),
        ('ю', "yu"),
        ('я', "ya"),
    ];
    MAP.iter()
        .find(|(k, _)| *k == c)
        .map(|(_, v)| v.to_string())
        .unwrap_or_else(|| c.to_string())
}
fn safe_id(id: &str) -> String {
    id.chars()
        .filter(|c| c.is_ascii_alphanumeric() || *c == '-')
        .take(80)
        .collect()
}

/// `.worktreeinclude` in the repository root lists untracked local files (`.env`, certificates…) that each
/// new worktree needs. One relative path per line, `#` comments; absolute paths and `..` are ignored.
pub(crate) fn include_list(text: &str) -> Vec<String> {
    text.lines()
        .map(|l| l.trim().trim_end_matches('/'))
        .filter(|l| {
            !l.is_empty()
                && !l.starts_with('#')
                && !l.starts_with('/')
                && !l.starts_with('~')
                && !l.split(['/', '\\']).any(|p| p == "..")
        })
        .map(String::from)
        .collect()
}
fn copy_tree(from: &Path, to: &Path, budget: &mut u64) -> std::io::Result<()> {
    let meta = std::fs::symlink_metadata(from)?;
    if meta.file_type().is_symlink() {
        return Ok(());
    }
    if meta.is_dir() {
        std::fs::create_dir_all(to)?;
        for e in std::fs::read_dir(from)?.flatten() {
            copy_tree(&e.path(), &to.join(e.file_name()), budget)?;
        }
        return Ok(());
    }
    if meta.len() > *budget {
        return Ok(());
    }
    *budget -= meta.len();
    if let Some(p) = to.parent() {
        std::fs::create_dir_all(p)?;
    }
    if !to.exists() {
        std::fs::copy(from, to)?;
    }
    Ok(())
}
fn copy_includes(repo: &Path, root: &Path) -> Vec<String> {
    let Ok(text) = std::fs::read_to_string(repo.join(".worktreeinclude")) else {
        return vec![];
    };
    let mut budget = 200_000_000u64;
    include_list(&text)
        .into_iter()
        .filter(|rel| {
            let src = repo.join(rel);
            src.exists() && copy_tree(&src, &root.join(rel), &mut budget).is_ok()
        })
        .collect()
}

fn chat_and_project(chat_id: &str) -> Result<(NexusChat, NexusProject), String> {
    let db = load_project_store()?;
    let chat = db
        .chats
        .iter()
        .find(|c| c.id == chat_id && c.deleted_at.is_none())
        .ok_or("Чат не найден")?
        .clone();
    let project = db
        .projects
        .iter()
        .find(|p| p.id == chat.project_id)
        .ok_or("Проект не найден")?
        .clone();
    Ok((chat, project))
}

/// Used by automations for their new chats.
pub(crate) fn enable_for(chat_id: &str) -> Result<Value, String> {
    enable(chat_id)
}
fn enable(chat_id: &str) -> Result<Value, String> {
    let _guard = LOCK.lock().map_err(|_| "Worktree lock failed")?;
    if let Some(w) = for_chat(chat_id) {
        return Ok(json!({"worktree": w, "copied": []}));
    }
    let (chat, project) = chat_and_project(chat_id)?;
    if crate::chat_runs::is_running(chat_id) {
        return Err("Дождитесь окончания ответа, затем переключите рабочую копию".into());
    }
    let ws = PathBuf::from(validate_workspace(&project.workspace)?);
    let repo = git(&ws, &["rev-parse", "--show-toplevel"]).map_err(|_| {
        "Папка проекта не в git-репозитории. Отдельная ветка доступна только для git-проектов."
    })?;
    let repo = PathBuf::from(repo.trim())
        .canonicalize()
        .map_err(|e| e.to_string())?;
    let base = git(&repo, &["rev-parse", "HEAD"])
        .map_err(|_| "В репозитории ещё нет коммитов — сделайте первый коммит")?
        .trim()
        .to_string();
    let rel = ws.strip_prefix(&repo).map(Path::to_path_buf).unwrap_or_default();
    let mut branch = branch_name(&chat.title, chat_id);
    for n in 2..50 {
        if git(
            &repo,
            &[
                "rev-parse",
                "--verify",
                "--quiet",
                &format!("refs/heads/{branch}"),
            ],
        )
        .is_err()
        {
            break;
        }
        branch = format!("{}-{n}", branch_name(&chat.title, chat_id));
    }
    let name = repo
        .file_name()
        .map(|n| n.to_string_lossy().to_string())
        .unwrap_or_else(|| "repo".into());
    let root = worktrees_dir().join(safe_id(chat_id)).join(name);
    if root.exists() {
        return Err(format!(
            "Папка {} уже существует — удалите её или выберите другой чат",
            root.display()
        ));
    }
    std::fs::create_dir_all(root.parent().ok_or("Bad worktree path")?).map_err(|e| e.to_string())?;
    let root_text = root.to_string_lossy().to_string();
    git(&repo, &["worktree", "add", "-b", &branch, &root_text, &base])?;
    let copied = copy_includes(&repo, &root);
    let path = root.join(&rel);
    std::fs::create_dir_all(&path).map_err(|e| e.to_string())?;
    let w = Worktree {
        chat_id: chat_id.into(),
        root: root_text,
        path: path.to_string_lossy().to_string(),
        branch,
        base,
        repo_root: repo.to_string_lossy().to_string(),
        created_at: now_string(),
    };
    let mut list = load();
    list.retain(|x| x.chat_id != chat_id);
    list.push(w.clone());
    save(&list)?;
    Ok(json!({"worktree": w, "copied": copied}))
}

fn dirty(root: &Path) -> bool {
    git(root, &["status", "--porcelain"])
        .map(|s| !s.trim().is_empty())
        .unwrap_or(false)
}

fn remove(chat_id: &str, force: bool, delete_branch: bool) -> Result<(), String> {
    let _guard = LOCK.lock().map_err(|_| "Worktree lock failed")?;
    let mut list = load();
    let Some(w) = list.iter().find(|w| w.chat_id == chat_id).cloned() else {
        return Ok(());
    };
    if crate::chat_runs::is_running(chat_id) {
        return Err("Дождитесь окончания ответа, затем удалите рабочую копию".into());
    }
    let root = Path::new(&w.root);
    if root.is_dir() {
        if dirty(root) && !force {
            return Err("WORKTREE_DIRTY".into());
        }
        let mut args = vec!["worktree", "remove"];
        if force {
            args.push("--force");
        }
        args.push(&w.root);
        git(Path::new(&w.repo_root), &args)?;
    } else {
        let _ = git(Path::new(&w.repo_root), &["worktree", "prune"]);
    }
    if delete_branch {
        git(Path::new(&w.repo_root), &["branch", "-D", &w.branch])?;
    }
    list.retain(|x| x.chat_id != chat_id);
    save(&list)
}

/// Folder whose git state the Changes tab shows and the base to compare with.
fn changes_root(chat_id: &str) -> Result<(PathBuf, String, Option<Worktree>), String> {
    if let Some(w) = for_chat(chat_id) {
        return Ok((PathBuf::from(&w.root), w.base.clone(), Some(w)));
    }
    let (_, project) = chat_and_project(chat_id)?;
    let ws = PathBuf::from(validate_workspace(&project.workspace)?);
    let repo = git(&ws, &["rev-parse", "--show-toplevel"]).map_err(|_| "NOT_A_REPO")?;
    let head = git(&ws, &["rev-parse", "--verify", "--quiet", "HEAD"])
        .map(|s| s.trim().to_string())
        .unwrap_or_default();
    Ok((PathBuf::from(repo.trim()), head, None))
}

#[derive(Serialize, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub(crate) struct Change {
    pub path: String,
    /// A added, M modified, D deleted, T type change, ? untracked.
    pub status: String,
    pub added: Option<u64>,
    pub removed: Option<u64>,
}

/// Merges `git diff --numstat -z`, `--name-status -z` and untracked files into one list.
pub(crate) fn parse_changes(numstat: &str, name_status: &str, untracked: &str) -> Vec<Change> {
    let mut out: Vec<Change> = Vec::new();
    let mut parts = name_status.split('\0').filter(|s| !s.is_empty());
    while let (Some(status), Some(path)) = (parts.next(), parts.next()) {
        out.push(Change {
            path: path.into(),
            status: status.chars().next().unwrap_or('M').to_string(),
            added: None,
            removed: None,
        });
    }
    for rec in numstat.split('\0').filter(|s| !s.is_empty()) {
        let mut f = rec.splitn(3, '\t');
        let (Some(a), Some(r), Some(p)) = (f.next(), f.next(), f.next()) else {
            continue;
        };
        if let Some(c) = out.iter_mut().find(|c| c.path == p) {
            c.added = a.parse().ok();
            c.removed = r.parse().ok();
        }
    }
    for p in untracked.split('\0').filter(|s| !s.is_empty()) {
        if !out.iter().any(|c| c.path == p) {
            out.push(Change {
                path: p.into(),
                status: "?".into(),
                added: None,
                removed: None,
            });
        }
    }
    out.sort_by(|a, b| a.path.cmp(&b.path));
    out
}

fn changes(chat_id: &str) -> Result<Value, String> {
    let (root, base, wt) = match changes_root(chat_id) {
        Ok(v) => v,
        Err(e) if e == "NOT_A_REPO" => return Ok(json!({"repo": false})),
        Err(e) => return Err(e),
    };
    let against = if base.is_empty() {
        // A repository without commits: compare with the empty tree.
        "4b825dc642cb6eb9a060e54bf8d69288fbee4904".to_string()
    } else {
        base.clone()
    };
    let numstat = git(&root, &["diff", "--no-renames", "--numstat", "-z", &against])?;
    let names = git(&root, &["diff", "--no-renames", "--name-status", "-z", &against])?;
    let untracked = git(&root, &["ls-files", "--others", "--exclude-standard", "-z"])?;
    let mut files = parse_changes(&numstat, &names, &untracked);
    for f in files.iter_mut().filter(|f| f.status == "?") {
        if let Ok(meta) = std::fs::metadata(root.join(&f.path)) {
            if meta.is_file() && meta.len() < 2_000_000 {
                if let Ok(text) = std::fs::read_to_string(root.join(&f.path)) {
                    f.added = Some(text.lines().count() as u64);
                    f.removed = Some(0);
                }
            }
        }
    }
    let total = files.len();
    files.truncate(MAX_FILES);
    let branch = git(&root, &["rev-parse", "--abbrev-ref", "HEAD"])
        .map(|s| s.trim().to_string())
        .unwrap_or_default();
    let commits = if base.is_empty() {
        0
    } else {
        git(&root, &["rev-list", "--count", &format!("{base}..HEAD")])
            .ok()
            .and_then(|s| s.trim().parse::<u64>().ok())
            .unwrap_or(0)
    };
    Ok(json!({
        "repo": true,
        "root": root.to_string_lossy(),
        "branch": branch,
        "base": base,
        "worktree": wt,
        "commits": commits,
        "uncommitted": dirty(&root),
        "files": files,
        "total": total,
    }))
}

/// A path from the Changes list: relative, inside the repository, no `..`.
pub(crate) fn safe_rel(path: &str) -> Result<String, String> {
    let p = path.trim();
    if p.is_empty()
        || p.starts_with('/')
        || p.starts_with('-')
        || p.contains('\0')
        || p.split(['/', '\\']).any(|s| s == "..")
    {
        return Err("Некорректный путь".into());
    }
    Ok(p.to_string())
}

fn file_diff(chat_id: &str, path: &str) -> Result<Value, String> {
    let rel = safe_rel(path)?;
    let (root, base, _) = changes_root(chat_id).map_err(|e| {
        if e == "NOT_A_REPO" {
            "Папка проекта не в git-репозитории".into()
        } else {
            e
        }
    })?;
    let tracked = git(&root, &["ls-files", "--error-unmatch", "--", &rel]).is_ok()
        || (!base.is_empty() && git(&root, &["cat-file", "-e", &format!("{base}:{rel}")]).is_ok());
    let mut text = if tracked {
        let against = if base.is_empty() {
            "4b825dc642cb6eb9a060e54bf8d69288fbee4904"
        } else {
            &base
        };
        git(&root, &["diff", "--no-renames", against, "--", &rel])?
    } else {
        git_ok(&root, &["diff", "--no-index", "--", "/dev/null", &rel], &[0, 1])?
    };
    let truncated = text.len() > MAX_DIFF;
    if truncated {
        let mut cut = MAX_DIFF;
        while !text.is_char_boundary(cut) {
            cut -= 1;
        }
        text.truncate(cut);
    }
    Ok(json!({"path": rel, "diff": text, "truncated": truncated}))
}

fn commit(chat_id: &str, message: &str) -> Result<Value, String> {
    let message = message.trim();
    if message.is_empty() || message.len() > 2000 {
        return Err("Напишите сообщение коммита (до 2000 символов)".into());
    }
    if crate::chat_runs::is_running(chat_id) {
        return Err("Дождитесь окончания ответа".into());
    }
    let (root, _, _) = changes_root(chat_id).map_err(|_| "Папка проекта не в git-репозитории")?;
    git(&root, &["add", "-A"])?;
    git(&root, &["commit", "-m", message])?;
    let sha = git(&root, &["rev-parse", "--short", "HEAD"])?;
    Ok(json!({"commit": sha.trim()}))
}

fn discard(chat_id: &str, path: &str) -> Result<(), String> {
    let rel = safe_rel(path)?;
    let (root, _, _) = changes_root(chat_id).map_err(|_| "Папка проекта не в git-репозитории")?;
    if git(&root, &["ls-files", "--error-unmatch", "--", &rel]).is_ok() {
        git(
            &root,
            &["restore", "--source=HEAD", "--staged", "--worktree", "--", &rel],
        )?;
        return Ok(());
    }
    let target = root.join(&rel);
    let real = target.canonicalize().map_err(|e| e.to_string())?;
    if !real.starts_with(root.canonicalize().map_err(|e| e.to_string())?) {
        return Err("Файл вне репозитория".into());
    }
    if real.is_dir() {
        std::fs::remove_dir_all(real).map_err(|e| e.to_string())
    } else {
        std::fs::remove_file(real).map_err(|e| e.to_string())
    }
}

/// Merges the chat branch into the branch checked out in the main checkout (`--no-ff`).
/// The worktree must be committed; on a conflict the merge is aborted and nothing changes.
fn merge(chat_id: &str) -> Result<Value, String> {
    let w = for_chat(chat_id).ok_or("У чата нет отдельной ветки")?;
    if crate::chat_runs::is_running(chat_id) {
        return Err("Дождитесь окончания ответа".into());
    }
    if dirty(Path::new(&w.root)) {
        return Err("В ветке чата есть незакоммиченные изменения — сначала сделайте коммит".into());
    }
    let repo = Path::new(&w.repo_root);
    let target = git(repo, &["rev-parse", "--abbrev-ref", "HEAD"])?
        .trim()
        .to_string();
    if target == "HEAD" {
        return Err("В основной копии не выбрана ветка (detached HEAD)".into());
    }
    match git(
        repo,
        &[
            "merge",
            "--no-ff",
            "-m",
            &format!("Merge {} (Nexus chat)", w.branch),
            &w.branch,
        ],
    ) {
        Ok(_) => Ok(json!({"into": target})),
        Err(e) => {
            let _ = git(repo, &["merge", "--abort"]);
            Err(format!("Слияние не выполнено, изменения отменены: {e}"))
        }
    }
}

#[tauri::command]
pub(crate) async fn chat_worktree_enable(chat_id: String) -> Result<Value, String> {
    tokio::task::spawn_blocking(move || enable(&chat_id))
        .await
        .map_err(|e| e.to_string())?
}
#[tauri::command]
pub(crate) async fn chat_worktree_remove(
    chat_id: String,
    force: Option<bool>,
    delete_branch: Option<bool>,
) -> Result<(), String> {
    tokio::task::spawn_blocking(move || {
        remove(&chat_id, force.unwrap_or(false), delete_branch.unwrap_or(false))
    })
    .await
    .map_err(|e| e.to_string())?
}
#[tauri::command]
pub(crate) async fn chat_worktree_status(chat_id: String) -> Result<Value, String> {
    tokio::task::spawn_blocking(move || {
        let w = for_chat(&chat_id);
        let repo = match &w {
            Some(_) => true,
            None => chat_and_project(&chat_id)
                .ok()
                .and_then(|(_, p)| validate_workspace(&p.workspace).ok())
                .is_some_and(|ws| git(Path::new(&ws), &["rev-parse", "--show-toplevel"]).is_ok()),
        };
        Ok(json!({"repo": repo, "worktree": w}))
    })
    .await
    .map_err(|e| e.to_string())?
}
#[tauri::command]
pub(crate) async fn chat_changes(chat_id: String) -> Result<Value, String> {
    tokio::task::spawn_blocking(move || changes(&chat_id))
        .await
        .map_err(|e| e.to_string())?
}
#[tauri::command]
pub(crate) async fn chat_file_diff(chat_id: String, path: String) -> Result<Value, String> {
    tokio::task::spawn_blocking(move || file_diff(&chat_id, &path))
        .await
        .map_err(|e| e.to_string())?
}
#[tauri::command]
pub(crate) async fn chat_changes_commit(chat_id: String, message: String) -> Result<Value, String> {
    tokio::task::spawn_blocking(move || commit(&chat_id, &message))
        .await
        .map_err(|e| e.to_string())?
}
#[tauri::command]
pub(crate) async fn chat_changes_discard(chat_id: String, path: String) -> Result<(), String> {
    tokio::task::spawn_blocking(move || discard(&chat_id, &path))
        .await
        .map_err(|e| e.to_string())?
}
#[tauri::command]
pub(crate) async fn chat_worktree_merge(chat_id: String) -> Result<Value, String> {
    tokio::task::spawn_blocking(move || merge(&chat_id))
        .await
        .map_err(|e| e.to_string())?
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn branch_names_are_safe_and_stable() {
        let a = branch_name("Починить логин / OAuth!", "chat-1");
        assert!(a.starts_with("nexus/pochinit-login-oauth-"));
        assert_eq!(a, branch_name("Починить логин / OAuth!", "chat-1"));
        assert_ne!(a, branch_name("Починить логин / OAuth!", "chat-2"));
        assert!(branch_name("???", "x").starts_with("nexus/chat-"));
        assert!(branch_name(&"a".repeat(200), "x").len() < 70);
    }
    #[test]
    fn include_list_skips_unsafe_lines() {
        assert_eq!(
            include_list("# local\n.env\n config/dev.pem \n/etc/passwd\n../x\na/../../b\n~/k\ncerts/\n"),
            vec![".env", "config/dev.pem", "certs"]
        );
    }
    #[test]
    fn relative_paths_only() {
        assert!(safe_rel("src/a.rs").is_ok());
        for bad in ["", "/etc/passwd", "../a", "a/../../b", "-rf", "a\0b"] {
            assert!(safe_rel(bad).is_err(), "{bad}");
        }
    }
    #[test]
    fn merges_numstat_status_and_untracked() {
        let files = parse_changes(
            "3\t1\tsrc/a.rs\0-\t-\timg.png\0",
            "M\0src/a.rs\0A\0img.png\0D\0old.txt\0",
            "new.md\0src/a.rs\0",
        );
        assert_eq!(files.len(), 4);
        assert_eq!(files[0].path, "img.png");
        assert_eq!(files[0].added, None);
        assert_eq!(files[1].path, "new.md");
        assert_eq!(files[1].status, "?");
        assert_eq!(files[2].status, "D");
        assert_eq!(files[3].added, Some(3));
        assert_eq!(files[3].removed, Some(1));
    }
    #[test]
    fn real_repository_round_trip() {
        let dir = std::env::temp_dir().join(format!("nexus-wt-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        let run = |args: &[&str]| git(&dir, args).unwrap();
        run(&["init", "-q", "-b", "main"]);
        run(&["config", "user.email", "t@e.st"]);
        run(&["config", "user.name", "t"]);
        std::fs::write(dir.join("a.txt"), "one\n").unwrap();
        run(&["add", "-A"]);
        run(&["commit", "-qm", "init"]);
        let base = run(&["rev-parse", "HEAD"]).trim().to_string();
        let root = dir.join("wt");
        run(&[
            "worktree",
            "add",
            "-q",
            "-b",
            "nexus/t",
            root.to_str().unwrap(),
            &base,
        ]);
        std::fs::write(root.join("a.txt"), "one\ntwo\n").unwrap();
        std::fs::write(root.join("b.txt"), "x\n").unwrap();
        let files = parse_changes(
            &git(&root, &["diff", "--no-renames", "--numstat", "-z", &base]).unwrap(),
            &git(&root, &["diff", "--no-renames", "--name-status", "-z", &base]).unwrap(),
            &git(&root, &["ls-files", "--others", "--exclude-standard", "-z"]).unwrap(),
        );
        assert_eq!(files.len(), 2);
        assert_eq!((files[0].added, files[0].status.as_str()), (Some(1), "M"));
        assert_eq!(files[1].status, "?");
        let diff = git_ok(
            &root,
            &["diff", "--no-index", "--", "/dev/null", "b.txt"],
            &[0, 1],
        )
        .unwrap();
        assert!(diff.contains("+x"));
        assert!(dirty(&root));
        let _ = std::fs::remove_dir_all(&dir);
    }
}
