# NEXUS Desktop v0.5 — Agent & Account Manager

Based on the supplied v0.4.4 project.

## Added
- Qwen Code automatic npm installation via the existing queued installer.
- Accounts tab: add, list, remove multiple isolated profiles for Claude, Codex, Gemini.
- Login button opens the provider CLI in Terminal with isolated configuration.
- Account registry persisted at `~/Library/Application Support/NEXUS/accounts.json`.
- Clear status labels: authentication not verified, quota unavailable.

## Limitations
- Login is interactive in Terminal, not embedded in the app.
- Auth verification, quota monitoring, automatic account routing and per-account task execution are **not implemented**.
- Gemini isolation uses a dedicated HOME and may not isolate all macOS Keychain state.
- Aider, Goose, Grok still require separate provider-specific adapters; they are catalog entries only.
- No migration needed for previous NEXUS installations; existing agent installs remain discoverable.

## Build on macOS
```
nvm use 22
npm install
npx tauri build --bundles app
```

This archive is source code; native macOS build and runtime integration have not been verified here.


## v0.6 changes
- Agent Marketplace exposes install actions for npm agents and Aider via `uv tool install aider-chat`.
- Goose/Claude native installers and Grok API show official setup links instead of an inert dash.
- Accounts have a Check status action for Claude Code (`claude auth status`) and Codex (`codex login status`) using isolated profile directories. Gemini status remains unknown until a supported adapter is implemented.
- No fake quota percentages, no silent OAuth token extraction, and no arbitrary shell commands.
- CLI authentication still uses the prior Terminal launcher: browser-only login without a supported callback cannot be safely assumed.
- Build: `nvm use 22 && npm install && npx tauri build --bundles app`.
- macOS native compilation and real provider authentication were not verified here.
