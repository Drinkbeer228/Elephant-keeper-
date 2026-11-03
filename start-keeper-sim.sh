#!/usr/bin/env bash
# Запуск «Дежурного кипера» с выбором старой или новой карты.
set -e
cd "$(dirname "$0")"

PORT=3000
BASE_URL="http://localhost:$PORT"

alive() {
  curl -sf -o /dev/null --max-time 2 "$BASE_URL/" 2>/dev/null
}

open_browser() {
  local url="$1"
  if command -v xdg-open >/dev/null 2>&1; then
    xdg-open "$url" >/dev/null 2>&1 || true
  elif command -v gio >/dev/null 2>&1; then
    gio open "$url" >/dev/null 2>&1 || true
  fi
}

if [ -t 0 ]; then
  while true; do
    printf 'Выберите карту:\n  1) Старая (64×48)\n  2) Новая (120×100)\n'
    read -r -p 'Ваш выбор [1/2]: ' choice
    case "$choice" in
      1|old) MAP_VERSION=old; break ;;
      2|new) MAP_VERSION=new; break ;;
      *) echo "Введите 1 или 2." ;;
    esac
  done
else
  MAP_VERSION=old
  echo "Терминальный ввод недоступен — запускаю рабочую карту с двумя ограждёнными слоновниками."
fi

URL="$BASE_URL/?map=$MAP_VERSION"

if alive; then
  echo "Сервер уже запущен — открываю $URL."
  open_browser "$URL"
  exit 0
fi

if [ ! -d node_modules ]; then
  echo "Первый запуск: ставлю зависимости (npm install)…"
  npm install
fi

echo "Поднимаю dev-сервер для выбранной карты: $URL (Ctrl+C — остановить)"
npm run dev -- --open "/?map=$MAP_VERSION"
