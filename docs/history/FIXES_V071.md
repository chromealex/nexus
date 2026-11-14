# NEXUS Desktop v0.7.1 — auth UX fixes

- Codex device code is extracted from official CLI output and shown in the account panel.
- Open sign-in page uses the fixed official URL in the system browser (no embedded WebView, because OAuth providers may block embedded sign-in).
- Copy code, Cancel login, and 15-minute timeout.
- Remove uses an in-app confirmation; Rust refuses removal while an auth process is active. Existing credentials remain on disk.
- React event listener no longer resubscribes on every auth status update.
- Raw diagnostics redact one-time codes and URLs.

**Not yet implemented:** native OAuth redirect handling, secure account logout, account quota retrieval, Gemini login adapter. This build has not been validated on macOS.
