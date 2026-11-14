#!/bin/bash
# Builds NEXUS.app and signs it with your key.
# Which identity is used (first match wins):
#   1. NEXUS_SIGNING_IDENTITY="Developer ID Application: Имя (TEAMID)" — explicit choice;
#   2. a "Developer ID Application: …" certificate in your keychain (Apple Developer account);
#   3. "Apple Development: …" certificate;
#   4. "NEXUS Local Signing" (scripts/setup-local-signing.sh);
#   5. ad-hoc (keychain prompts reappear after each rebuild).
# With a Developer ID the app is also notarized when a notarytool profile "nexus-notary" exists
# (once: bash scripts/setup-notary.sh). Passwords never go into this repo or the environment.
set -euo pipefail
cd "$(dirname "$0")/.."
APP="src-tauri/target/release/bundle/macos/NEXUS.app"
identities="$(security find-identity -v -p codesigning 2>/dev/null || true)"
pick() { printf '%s\n' "$identities" | sed -n "s/.*\"\\($1[^\"]*\\)\".*/\\1/p" | head -1; }
IDENTITY="${NEXUS_SIGNING_IDENTITY:-}"
[ -z "$IDENTITY" ] && IDENTITY="$(pick 'Developer ID Application: ')"
[ -z "$IDENTITY" ] && IDENTITY="$(pick 'Apple Development: ')"
[ -z "$IDENTITY" ] && IDENTITY="$(pick 'NEXUS Local Signing')"
if [ -n "$IDENTITY" ]; then
  if ! printf '%s\n' "$identities" | grep -qF "\"$IDENTITY\""; then
    echo "Подпись «$IDENTITY» не найдена в связке ключей. Доступные:"; printf '%s\n' "$identities"; exit 1
  fi
  export APPLE_SIGNING_IDENTITY="$IDENTITY"
  echo "Подпись: $IDENTITY"
else
  echo "Сертификат для подписи не найден — подпись ad-hoc. Добавьте Developer ID в связку ключей или запустите scripts/setup-local-signing.sh."
fi
npm run tauri:build -- --bundles app -- --offline
codesign --verify --deep --strict "$APP" && echo "Подпись проверена: codesign --verify --deep --strict"
codesign -dv "$APP" 2>&1 | grep -E "Authority|TeamIdentifier|Signature=|flags" || true

if [[ "${IDENTITY:-}" == "Developer ID Application: "* ]]; then
  if xcrun notarytool history --keychain-profile nexus-notary >/dev/null 2>&1; then
    echo "Нотаризация у Apple (несколько минут)…"
    ZIP="$(mktemp -d)/NEXUS.zip"
    ditto -c -k --keepParent "$APP" "$ZIP"
    xcrun notarytool submit "$ZIP" --keychain-profile nexus-notary --wait
    xcrun stapler staple "$APP"
    spctl --assess --type execute -v "$APP" && echo "Gatekeeper принимает приложение."
  else
    echo "Нотаризация пропущена: нет профиля «nexus-notary» (один раз: bash scripts/setup-notary.sh)."
  fi
fi
