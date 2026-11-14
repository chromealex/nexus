# NEXUS v0.17.2 — Project workspaces, chats, Codex runner fix

- Codex `exec` uses `--skip-git-repo-check` with an explicitly entered/saved existing workspace. Runs in `--sandbox read-only`.
- All Codex and Claude subprocesses receive closed stdin (`Stdio::null()`) to prevent waiting for interactive input.
- Claude remains in `--permission-mode plan` and does not need `--skip-git-repo-check`.
- Projects are persisted in `~/Library/Application Support/NEXUS/projects.json`. A project is a reference to an existing directory, not a copy.
- Each project has separately persisted chats and messages. The basic Execute action and adaptive step results append to the selected chat.
- Project deletion removes NEXUS metadata and chat history only; project files remain untouched. Two clicks required to confirm.
- No project is automatically deleted from disk. Chats are saved logs, **not yet injected as conversational context** into subsequent CLI requests.
- The quota-aware account router and Claude statusLine collector are inherited from v0.17.1.
- Note: `--skip-git-repo-check` disables a Codex safety check; NEXUS validates that the workspace exists and uses read-only sandbox, but it is still best to choose a trusted directory.
- Full macOS/Tauri build not validated in this environment.
