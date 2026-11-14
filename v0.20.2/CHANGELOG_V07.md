# NEXUS v0.7 stabilization patch

- Compact account cards, no raw stdout or JSON by default.
- Per-profile details and collapsible diagnostics; authorization URLs masked in logs.
- Cancellation for in-flight auth processes (polls every 250 ms); five-minute timeout remains.
- Claude status now validates `loggedIn` rather than process exit code alone.
- Codex status checks for positive login wording rather than exit code alone.
- Existing profile storage preserved; removal does not delete credentials.

## Known limitations
- Provider browser opening is CLI-dependent. Device-code link is not yet a native button.
- Gemini interactive login is not implemented.
- The cancel token remains in memory until app restart; repeat login overwrites it.
- Rust/Tauri macOS build and end-to-end OAuth were not verified in this environment.
- Sensitive output remains in memory in Rust diagnostics; avoid sharing logs containing OAuth codes.
