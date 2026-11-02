#!/usr/bin/env bash
# Запуск «Дежурного кипера»: если сервер уже живёт — просто открыть игру в браузере,
# иначе поднять dev-сервер Vite (npm run dev -- --open) и открыть браузер.
set -e
cd "$(dirname "$0")"

PORT=3000
URL="http://localhost:$PORT/"

alive() {
  curl -sf -o /dev/null --max-time 2 "$URL" 2>/dev/null
}

open_browser() {
  if command -v xdg-open >/dev/null 2>&1; then
    xdg-open "$URL" >/dev/null 2>&1 || true
  elif command -v gio >/dev/null 2>&1; then
    gio open "$URL" >/dev/null 2>&1 || true
  fi
}

if alive; then
  echo "Сервер уже запущен: $URL — открываю игру."
  open_browser
  exit 0
fi

if [ ! -d node_modules ]; then
  echo "Первый запуск: ставлю зависимости (npm install)…"
  npm install
fi

echo "Поднимаю dev-сервер: $URL (Ctrl+C — остановить)"
npm run dev -- --open
