# NEXUS v0.7.2 — Codex device login repair

- Corrects Codex one-time code parser from 4+4 to 4+5 characters.
- Reads auth subprocess stdout/stderr in chunks instead of waiting for newline.
- Disables opening the device-login page until a code has arrived.
- Redacts 4+5 device codes in the diagnostics panel.
- Keeps each account profile isolated using CODEX_HOME.

## Validation
Frontend build and Rust cargo check should be run on the target Mac. The real OAuth flow requires a user account and cannot be completed here.
