# v0.20.2 — immediate post-install refresh

- Detect NEXUS-managed CLI binaries directly in the backend.
- On successful installation, immediately refresh agent detection and accounts.
- On polling a completed installation, also refresh detection (handles missed events).
- Optimistically show **INSTALLED** after verified installer success, even before a refreshed scan resolves.
- Freeze elapsed time on completion and automatically collapse the completed installation panel.
- Show **Connect account** for installed Claude/Codex/Gemini when no profile is configured.
- No application restart should be necessary.

**Limitations:** No macOS Tauri compilation or live install test performed here.
