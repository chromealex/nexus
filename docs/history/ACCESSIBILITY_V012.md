# NEXUS v0.12 — Claude Desktop Accessibility prototype

This replaces the Chrome extension workflow with a **read-only macOS Accessibility collector**.

1. Start Claude Desktop and open Settings > Usage.
2. In NEXUS Accounts > Claude > Details, click Read usage.
3. macOS may request Accessibility permission for the **Swift interpreter/helper**, rather than NEXUS itself. Grant permission only if you trust the helper.
4. The collector reads accessible window text, extracts a percentage and a reset description, and returns status/error to NEXUS.
5. While Accounts is open, NEXUS tries again every 60 seconds.

**Important limitations:** This has NOT been compiled or tested on macOS, nor validated against Claude Desktop's actual accessibility tree. The Usage window may expose no text. The Swift interpreter may require a separate accessibility permission. The reading is NOT associated with a verified CLI account; it must not be interpreted as the Personal/Work profile's quota. Only the currently open Claude Desktop account can be observed. No screenshots, OCR, browser extensions, Playwright, private endpoints, or credential extraction are used. No guarantee of unattended refresh with the window closed.

If accessibility fails, use a macOS accessibility inspector to check what the Claude Desktop window exposes; do not infer quotas from other signals.
