# NEXUS v0.16.1 — Claude Status Line fixes

- Fixed `used_percentage` parsing (verified by user on Claude Code 2.1.322).
- Shows weekly limit, optional five-hour limit, reset time in local timezone, and last received timestamp.
- Stale readings (>10 minutes) are labelled as last known rather than current.
- `fiveHour: null` is shown as Not provided, not `null%`.
- Existing collector file is updated only if it matches known bundled source; unknown modifications are preserved and require manual review.
- No Claude Desktop, Accessibility, Chromium or extension required for this collector.
- Status Line only emits updates while Claude Code is running; this does NOT implement unattended quota refresh.
- The user verified a real statusLine JSON: weekly 100%, resetAt 1794639600; no 5-hour value.
- Full Tauri/macOS build not verified in this environment.
