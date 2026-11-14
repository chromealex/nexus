# NEXUS v0.11 — Chrome extension usage bridge

This replaces the failed Playwright/Chromium strategy. Uses ordinary Chrome with a user-installed extension.

## Setup
1. Build NEXUS app and open Accounts > Claude > Details.
2. In Chrome, go to `chrome://extensions`, enable Developer mode, click Load unpacked, and select `chrome-extension` from this source archive.
3. In extension popup, paste the Claude profile ID and the bridge token shown in NEXUS.
4. Open `https://claude.ai/new#settings/usage` in regular Chrome, already logged into the correct account.
5. NEXUS will receive weekly usage via localhost `127.0.0.1:38471` when the Usage page is visible. The NEXUS UI polls every 15s.

## Limitations
- No background updates when the Usage page is closed. Chrome extension uses visible page text, not private APIs.
- The extension can only be configured for one profile at a time. For multiple profiles use separate Chrome profiles/extension installs.
- NEXUS cannot verify the Claude browser identity matches the selected CLI profile.
- Chrome content-script DOM matching is sensitive to site changes.
- Localhost port 38471 must be available. Another NEXUS process could already own it.
- Bridge token is a local shared secret, not a Claude credential. Do not share it.
- Source is not validated by macOS build or live Claude website in this environment.
