# NEXUS v0.6.1 — authentication changes

Claude Code: background `claude auth login` using isolated `CLAUDE_CONFIG_DIR`.
Codex: background `codex login --device-auth` using isolated `CODEX_HOME`.
Provider browser/device confirmation is required. CLI stdout/stderr streams into the account card; exit status is checked and a second CLI status command verifies login.
Gemini: interactive authentication remains unsupported in this build. NEXUS explicitly reports this instead of opening a broken Terminal launcher.

Security: no credentials are read, printed, or stored by NEXUS. Provider CLI manages its own credentials. Do not paste tokens or codes into logs shared publicly.

Known limitations: Some CLI versions may not support the listed login flags or may require a TTY. Browser launch behavior is provider-dependent. Test on macOS; this environment cannot run the macOS Tauri bundle. No automatic cancellation for auth jobs yet. Do not use the Account Manager for sensitive workloads until verified on your machine.
