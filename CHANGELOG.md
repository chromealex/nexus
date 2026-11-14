# Changelog

Short history of NEXUS Desktop. The original per-version notes (in Russian) are in [docs/history](docs/history).

## Unreleased
- Interface languages: English, Russian, Spanish, German, French, Portuguese, Simplified Chinese and Japanese. The macOS language is used by default (English if it is not supported); a language picker sits at the bottom of the sidebar.
- New app icon, drawn in the macOS 26 squircle shape so Tahoe shows it without the grey plate; README banner and screenshot.
- AGENTS.md, CHANGELOG and release notes are now written in English.
- Import from Claude Code and Codex brings the conversations too: each session becomes a chat of the project (your messages and the agent's text answers; tool calls, injected context and keys are left out). Importing again adds only new sessions; already added projects can be picked to import their chats.
- Folders in the sidebar can be deleted; their chats and subfolders move one level up.
- Chat history dissolves at the top and bottom edges instead of a dark band (no fade at the very top), and the blur under messages still works.
- Visual cleanup: no neutral grey left in the theme, primary buttons (send, connect, import, choose model) use one accent glass style, no noise textures anywhere; large glass surfaces use a flat tint instead of a diagonal gradient that banded.
- Model picker: the list and the model details scroll separately; “Choose this model” is at the top right of the details.
- Sidebar scrollbar appears only when the list overflows and sits at the panel edge; on the start screen the goals block and the connections panel share the right edge.

## 0.21.0 (14 November 2026)
- First public builds: macOS (Apple Silicon and Intel, signed with Developer ID and notarized) and a Windows preview.
- Windows preview: chat with Codex / Claude Code / ACP agents, projects, files and history. Not available on Windows yet: the chat browser for agents, iMessage, macOS notifications and the native file picker; API keys need the macOS Keychain, so API connections are macOS-only for now.
- Chat browser: each chat has its own invisible Chrome with tabs and sign-ins; the side panel opens when an agent uses it, with a live view, clicks and typing; a preview while the panel is hidden. All agents (Claude, Codex, ACP, API) use it through one confirmation gateway.
- Side panel with files: paths in answers and attachments open on the right (code with lines, Markdown, sandboxed HTML, CSV, JSON, images, PDF, media).
- Execution modes: “Execution · with permissions” by default and “Execution · without permissions”.
- Notifications at the top of the window, one card surface with background blur, minimap instead of the scrollbar, scroll fades, project icons, draft new chats, import of projects from Claude Code and Codex, native file/folder pickers, iMessage setup buttons.
- The “Tools” window folded into the chat (task plan next to the paperclip) and project settings (remembered permissions).

## 0.21 (November 2026, earlier work)
- Task channels: Telegram, Discord, Slack, email (IMAP/SMTP), iMessage, GitHub Issues, Linear, a local HTTP API for Siri / Shortcuts, ntfy push and macOS notifications, background mode. See `app/CHANNELS_V021.md`.
- Channel security: random one-time permission codes, no bare "yes" answers from email/trackers, DMARC or aligned DKIM required for email, LAN API limited to discussion mode, API connection limit and request deadline.
- Chat: answer variants and regenerate, edit last request, per-chat drafts, chat search (⌘F), chat list search (⌘K), keyboard shortcuts, day separators, bookmarks, export to Markdown, code highlighting, Mermaid diagrams and chart widgets in answers (charts load on demand), minimap, adjustable text size.
- Projects: context sources (folders, files, links, notes, images) can be set when a project is created; up to 200 sources.
- UI review fixes: crash when opening connections from a chat, composer selectors hidden on narrow windows, fixed-size dialogs, two-step confirmation for destructive actions, consistent composer chips.
- Model selection: Claude Code aliases resolve to exact versions (unless settings override them), coding tasks use the AA Coding Agent Index of the same agent, the model card fills data extraction (GDP.pdf), tool reliability (AutomationBench-AA) and speed; Anthropic default fallback no longer excludes results; short plain questions skip ratings. See `docs/MODEL_BENCHMARKS.md`.
- Auto executors: in Auto, composite requests are split into parts and each part goes to the model rated best for its kind of work, at its own reasoning depth; new per-chat “Auto / Single agent / Team”. Claude Fable 5.2 added to Claude Code by exact ID (CLI 2.1.321+, Auto only with the Quality priority). See `app/UNIFIED_CHAT_V020.md`.
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
