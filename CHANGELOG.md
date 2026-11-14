# Changelog

Short history of NEXUS Desktop. The original per-version notes are in [docs/history](docs/history).

## 0.21 (in progress, November 2026)
- Task channels: Telegram, Discord, Slack, email (IMAP/SMTP), iMessage, GitHub Issues, Linear, a local HTTP API for Siri / Shortcuts, ntfy push and macOS notifications, background mode. See `app/CHANNELS_V021.md`.
- Channel security: random one-time permission codes, no bare "yes" answers from email/trackers, DMARC or aligned DKIM required for email, LAN API limited to discussion mode, API connection limit and request deadline.
- Chat: answer variants and regenerate, edit last request, per-chat drafts, chat search (⌘F), chat list search (⌘K), keyboard shortcuts, day separators, bookmarks, export to Markdown, code highlighting, Mermaid diagrams and chart widgets in answers (charts load on demand), minimap, adjustable text size.
- Projects: context sources (folders, files, links, notes, images) can be set when a project is created; up to 200 sources.
- UI review fixes: crash when opening connections from a chat, composer selectors hidden on narrow windows, fixed-size dialogs, two-step confirmation for destructive actions, consistent composer chips.
- Repository: English README, CI, single test runner, unused persona assets removed.

## 0.20 (November 2026)
- Unified chat with streaming, Stop / Continue, model and reasoning depth chosen independently with Auto, permission and question cards in the chat.
- Projects, folders, sub-chats, archive and trash; paged history.
- One connections dialog with catalog and accounts; Antigravity ACP, Gemini API, Grok API, local Qwen via Ollama, Goose, custom ACP agents; API keys in Keychain.
- Discussion / Execution modes, rule-based and AI planning, Team mode, post-run verification with one fix attempt.
- WebGL particle portrait built from the Hi3D head scan, thinking lightning, glass UI.
- 0.20.1 Claude Code installer; 0.20.2 immediate refresh after install.

## 0.19 (November 2026)
- Model/account registry from real profiles; Claude statusLine quota and Codex cooldown blocks; failover across up to three accounts on limit errors only.
- 0.19.1 AI planner (validated JSON plan of 1–12 read-only steps) and dependency context between steps.

## 0.17
- Adaptive orchestrator MVP: deterministic decomposition, model tiers, plan preview, sequential read-only execution.
- 0.17.1 quota-aware routing; 0.17.2 project workspaces and chats, Codex runner fixes.

## 0.12 – 0.16
- Experiments with reading Claude usage: Chrome extension bridge (0.11), Accessibility collector (0.12–0.15, native Objective-C in 0.14, diagnostics in 0.15).
- 0.16 Claude Code statusLine collector, the approach that stayed; 0.16.1 parsing fixes.

## 0.6 – 0.9
- 0.6 install actions for npm agents and Aider, account status checks.
- 0.6.1 background sign-in for Claude Code and Codex with isolated profiles.
- 0.7 compact account cards, cancellable auth; 0.7.1 Codex device code flow; 0.7.2 device code parser fix; 0.7.3 Codex quota via `account/rateLimits/read`.
- 0.8 profile-aware task execution.
- 0.9 manual Claude usage snapshot from the web page.

## 0.4 – 0.5
- 0.4.4 Rust compile fixes; 0.5 agent and account manager with isolated profiles.
