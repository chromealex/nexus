# NEXUS v0.16 — Claude Code statusLine adapter (experimental)

1. In Accounts > Claude profile > Details, click **Enable collector**.
2. This changes only that profile's `settings.json` `statusLine` field. Existing non-NEXUS statusLine is never overwritten. A backup of an existing settings file is created as `settings.json.nexus-backup`.
3. Start an interactive Claude Code session using that profile's `CLAUDE_CONFIG_DIR` (not your global `~/.claude`).
4. The collector receives the Claude statusLine stdin JSON and persists **only** five-hour/seven-day utilization fields and reset timestamps if present. NEXUS reads every 30 seconds while Accounts is open.
5. **Disable** removes only the NEXUS-managed statusLine field.

**Important:** The exact availability and schema of `rate_limits` in Claude Code 2.1.322 is unverified. If the CLI doesn't provide these fields, the collector cannot show subscription quota. This is NOT an API quota reader and never extracts Claude credentials. It does not auto-start Claude sessions. Installing a statusLine changes the status line shown by Claude Code. The helper intentionally prints nothing; the normal status line may become blank.

macOS Tauri build and actual Claude Code statusLine payload have not been tested here.
