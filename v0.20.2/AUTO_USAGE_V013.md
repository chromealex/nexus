# v0.13 Claude Desktop automatic navigation (experimental)

Click Accounts > Claude > Details > Open & read usage. macOS Accessibility permission is required. NEXUS attempts to launch/activate Claude Desktop, press Settings, press Usage, and read weekly percentage/reset from the accessibility tree. If it fails, it reports a stage-specific diagnostic. It does not use OCR or private APIs.

Limitations: UI accessibility varies by Claude Desktop version. macOS build/Swift compile and real Claude Desktop UI have not been tested here. The helper runs via `/usr/bin/swift` and Accessibility permission may need to be granted to that process. The collector can read only the currently active Desktop account, NOT each NEXUS CLI account. Auto-polling has been disabled to avoid stealing window focus. No password/cookie extraction.
