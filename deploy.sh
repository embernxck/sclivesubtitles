#!/usr/bin/env bash
#
# Разворачивает SCLiveSubtitles на чистом сервере одной командой:
#
#   curl -fsSL https://raw.githubusercontent.com/embernxck/sclivesubtitles/main/deploy.sh | bash
#
# Со своим доменом (заранее направив его A-записью на этот сервер):
#
#   curl -fsSL https://.../deploy.sh | DOMAIN=example.com bash
#
# Повторный запуск обновляет сервис до свежей версии и данные не трогает.

set -euo pipefail

REPO="https://github.com/embernxck/sclivesubtitles.git"
DIR="${SCLIVE_DIR:-/opt/sclivesubtitles}"

say() { printf '\n\033[1m==> %s\033[0m\n' "$1"; }
die() { printf '\n\033[31mОшибка: %s\033[0m\n' "$1" >&2; exit 1; }

[ "$(id -u)" -eq 0 ] || die "запусти от root (или через sudo)"

say "Проверяю, что установлено"
if ! command -v git > /dev/null 2>&1; then
  (apt-get update -qq && apt-get install -y -qq git) \
    || yum install -y git \
    || die "не смог поставить git"
fi

if ! command -v docker > /dev/null 2>&1; then
  say "Ставлю Docker"
  curl -fsSL https://get.docker.com | sh || die "не смог поставить Docker"
  systemctl enable --now docker 2>/dev/null || true
fi

docker compose version > /dev/null 2>&1 || die "нужен Docker с плагином compose"

say "Забираю свежую версию"
if [ -d "$DIR/.git" ]; then
  git -C "$DIR" fetch --depth 1 origin main
  git -C "$DIR" reset --hard origin/main
else
  git clone --depth 1 "$REPO" "$DIR"
fi
cd "$DIR"

# Адрес сайта. Без своего домена берём sslip.io: он превращает IP в имя,
# а на имя уже выдаётся обычный сертификат Let's Encrypt.
if [ -n "${DOMAIN:-}" ]; then
  SITE="$DOMAIN"
else
  IP="${PUBLIC_IP:-$(curl -fsS --max-time 10 https://api.ipify.org || true)}"
  [ -n "$IP" ] || die "не определил внешний IP — задай его сам: PUBLIC_IP=1.2.3.4 bash deploy.sh"
  SITE="${IP}.sslip.io"
fi

say "Адрес сайта: https://$SITE"

# Настройки переписываем каждый раз, кроме того, что владелец менял руками.
PUBLISH="${SCLIVE_LRCLIB_PUBLISH:-false}"
if [ -f .env ]; then
  PUBLISH="$(grep -E '^SCLIVE_LRCLIB_PUBLISH=' .env | cut -d= -f2- || echo "$PUBLISH")"
fi

cat > .env <<ENV
SITE_ADDRESS=$SITE
SCLIVE_PUBLIC_URL=https://$SITE
SCLIVE_LRCLIB_PUBLISH=$PUBLISH
ENV

say "Собираю и запускаю"
docker compose up -d --build

say "Жду, пока поднимется"
for _ in $(seq 1 60); do
  if curl -fsS -o /dev/null --max-time 5 "http://127.0.0.1/api/stats"; then
    printf '\n\033[32mГотово: https://%s\033[0m\n\n' "$SITE"
    printf 'Полезное:\n'
    printf '  docker compose -f %s/docker-compose.yml logs -f app   # логи\n' "$DIR"
    printf '  docker compose -f %s/docker-compose.yml down          # остановить\n\n' "$DIR"
    exit 0
  fi
  sleep 2
done

die "сайт не ответил. Смотри: docker compose -f $DIR/docker-compose.yml logs"
