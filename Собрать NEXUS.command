#!/bin/zsh
# Двойной клик: ставит зависимости и собирает NEXUS.app (результат откроется в Finder).
cd "$(dirname "$0")/app" || exit 1
export PATH="$HOME/.nvm/versions/node/$(ls $HOME/.nvm/versions/node 2>/dev/null | sort -V | tail -1)/bin:/opt/homebrew/bin:/usr/local/bin:$HOME/.cargo/bin:$PATH"
echo "→ npm install"; npm install || { echo "npm install не удался"; read -k1; exit 1; }
echo "→ npm run build:mac"; npm run build:mac || { echo "Сборка не удалась — журнал выше"; read -k1; exit 1; }
open -R "src-tauri/target/release/bundle/macos/NEXUS.app"
echo "Готово."
