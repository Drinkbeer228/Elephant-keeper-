#!/usr/bin/env bash
# npm run share — собрать игру, поднять vite preview и открыть публичную ссылку через cloudflared.
# Остановить — Ctrl+C. Ссылка живёт, пока работает скрипт.
# --protocol http2: QUIC (UDP) у некоторых провайдеров рвётся, туннель отдаёт 502
set -e
cd "$(dirname "$0")/.."
PORT="${PORT:-4173}"

CF="$(command -v cloudflared || true)"
[ -z "$CF" ] && [ -x "$HOME/.local/bin/cloudflared" ] && CF="$HOME/.local/bin/cloudflared"
if [ -z "$CF" ]; then
  echo "cloudflared не найден. Установка на Linux (без sudo):"
  echo "  mkdir -p ~/.local/bin && curl -L -o ~/.local/bin/cloudflared \\"
  echo "    https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64 \\"
  echo "    && chmod +x ~/.local/bin/cloudflared"
  exit 1
fi

npm run build
npx vite preview --host 127.0.0.1 --port "$PORT" --strictPort >/dev/null &
PREVIEW_PID=$!
trap 'kill $PREVIEW_PID 2>/dev/null' EXIT
sleep 1

echo
echo "Локально: http://localhost:$PORT/Elephant-keeper-/"
echo "Поднимаю туннель… ссылка для друзей:"
"$CF" tunnel --no-autoupdate --protocol http2 --url "http://127.0.0.1:$PORT" 2>&1 \
  | grep --line-buffered -oE 'https://[a-z0-9-]+\.trycloudflare\.com' \
  | sed -u 's#$#/Elephant-keeper-/#'
