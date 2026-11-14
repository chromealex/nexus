# NEXUS Desktop v0.15 — Diagnostics-first build

Accounts > Claude > Details > Run diagnostics

Reports:
- AXIsProcessTrusted() from the native NEXUS process
- NEXUS bundle ID, executable path, bundle path and PID
- Claude Desktop detection and PID
- AX window read error code, window count, number of readable AX elements and Usage labels
- Per-profile Claude Code authentication status with isolated CLAUDE_CONFIG_DIR (without raw auth output)

This button does not open or click Claude Desktop. The separate Open & read usage action is still experimental.

Security: the diagnostics deliberately omit auth tokens, browser credentials and raw Claude window text. Treat executable paths and profile IDs as personal data when sharing logs.

Limitations: native macOS compilation and actual Claude accessibility tree have NOT been verified here. If AXIsProcessTrusted is false despite NEXUS being enabled in System Settings, check the exact bundle path and signature of the running app, then toggle its permission and restart. Do not grant Accessibility to unrelated applications.
