# NEXUS v0.9 Claude Web Usage

This release provides a **browser-assisted manual usage snapshot**, not automatic scraping.
- Open official Claude Usage page in the default browser.
- Copy *visible text* from Usage settings and paste into the NEXUS Claude account details.
- Parse weekly percent, reset description, optional credits; store per NEXUS profile in WebView localStorage.
- No cookies, access tokens or browser credentials are collected.
- Browser account identity is NOT verified against CLI profile. User must check it manually.
- Snapshot is not live; timestamp is shown.
- Automated per-account browser collection is NOT implemented. Requires separately audited browser-session integration and provider permission.
