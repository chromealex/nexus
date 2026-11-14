#!/bin/bash
# Builds NEXUS.app signed with a stable local identity when it exists (see setup-local-signing.sh);
# otherwise falls back to ad-hoc signing (keychain prompts will reappear after each rebuild).
set -euo pipefail
cd "$(dirname "$0")/.."
NAME="NEXUS Local Signing"
if security find-identity -v -p codesigning | grep -q "\"$NAME\""; then export APPLE_SIGNING_IDENTITY="$NAME"; echo "Подпись: $NAME"
else echo "Сертификат «$NAME» не найден — подпись ad-hoc. Запустите scripts/setup-local-signing.sh один раз."; fi
npm run tauri:build -- --bundles app -- --offline
codesign -dv src-tauri/target/release/bundle/macos/NEXUS.app 2>&1 | grep -E "Authority|Signature=" || true
