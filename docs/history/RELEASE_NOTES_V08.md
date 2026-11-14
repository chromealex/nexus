# NEXUS Desktop v0.8 — profile-aware execution

Changes:
- Task bar now supports explicit isolated Claude and Codex account selection.
- Tasks are refused if the selected profile is not authenticated.
- Per-profile CLI environment is passed to task execution (CLAUDE_CONFIG_DIR / CODEX_HOME).
- Quota UI distinguishes unavailable subscription data from auth status.
- Codex quota collector remains experimental; Claude subscription quota is **not available** through a verified supported machine-readable endpoint.

Limitations:
- This is source code, not a verified macOS binary.
- Real OAuth flows and macOS build have not been tested here.
- No reliable Claude subscription quota percentages are claimed.
- Legacy auto mode still selects an installed CLI, not a validated account.
- Only Claude and Codex read-only execution is implemented.
- Does not provide a multi-agent orchestrator yet.
