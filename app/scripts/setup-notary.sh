#!/bin/bash
# One-time: stores notarization credentials in the macOS keychain as profile "nexus-notary".
# You need an Apple ID with a Developer Program membership, its Team ID, and an app-specific
# password (appleid.apple.com → Sign-In and Security → App-Specific Passwords).
# notarytool asks for the password itself; it is kept only in the keychain.
set -euo pipefail
read -r -p "Apple ID (email): " APPLE_ID
read -r -p "Team ID (10 символов, developer.apple.com → Membership): " TEAM_ID
xcrun notarytool store-credentials nexus-notary --apple-id "$APPLE_ID" --team-id "$TEAM_ID"
echo "Готово: профиль «nexus-notary» сохранён. Следующая npm run build:mac нотаризует приложение."
