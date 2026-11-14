# NEXUS v0.14 — Native macOS Accessibility collector

Replaced `/usr/bin/swift` helper with Objective-C code compiled by Cargo's `cc` build dependency and linked into the NEXUS process. No separate Swift process is started.

1. Grant Accessibility permission to NEXUS in macOS System Settings.
2. Quit and reopen NEXUS after granting permission.
3. Open Accounts > Claude > Details > Open & read usage.
4. NEXUS attempts to launch/activate Claude Desktop, open Settings and Usage using accessible controls, and read the weekly percent.
5. On failure, it returns `permission_required`, `not_running`, `settings_not_found`, `usage_not_found`, or `usage_not_accessible` with details.

Caveats: Requires macOS compilation and live testing. AX UI controls may not be exposed by Claude Desktop, and accessibility permissions depend on signing/app identity. The Desktop account identity is not verified against any NEXUS CLI account; readings must not be assigned to Personal or Work automatically. No screenshot/OCR fallback. No private API or credential access. It may bring Claude Desktop to the foreground.
