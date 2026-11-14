# Quota Monitor v0.7.3

- Codex: attempts `codex app-server` JSON-RPC `account/rateLimits/read` using each profile's `CODEX_HOME`. If the CLI version does not support the method or returns no recognizable primary/secondary windows, NEXUS displays **Quota unavailable** and a diagnostic reason.
- Claude: no supported reliable machine-readable subscription quota interface integrated. Displays **Quota unavailable** rather than inventing percentages.
- Refresh per profile; background refresh every 120 seconds while Accounts is open.
- Isolation diagnostics verify distinct expected config directories only. They **do not** prove distinct provider account identities.
- API token usage is never substituted for subscription allowance.
- Authentication credentials are not read, copied or logged.
- Build on macOS: `npm install && npx tauri build --bundles app`.
- Not verified against a running Codex app-server or macOS Tauri build. Rate-limit response schema can vary by CLI version.
