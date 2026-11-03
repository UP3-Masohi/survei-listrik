#!/usr/bin/env bash
# Deploy ulang di VPS setelah ada perubahan di GitHub:
#   cd /opt/survei-listrik && bash deploy/deploy.sh
# Menarik kode terbaru, membangun aplikasi, menyalin dist/ ke folder Nginx,
# membangun ulang API, dan menjalankan schema.sql (aman diulang).
set -euo pipefail

APP_DIR="${APP_DIR:-/opt/survei-listrik}"
WEB_DIR="${WEB_DIR:-/var/www/survei-listrik}"
cd "$APP_DIR"

echo "== Kode terbaru"
git pull --ff-only

echo "== Aplikasi PWA"
echo "VITE_API_URL=/api" > .env
npm ci --no-audit --no-fund
npm run build
mkdir -p "$WEB_DIR"
rsync -a --delete dist/ "$WEB_DIR"/

echo "== API + PostgreSQL"
cd server
if [ ! -f .env ]; then echo "server/.env belum ada (lihat .env.prod.example)"; exit 1; fi
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build
echo "   menunggu database siap..."
for i in $(seq 1 30); do
  docker compose exec -T db pg_isready -U survei -d survei >/dev/null 2>&1 && break
  sleep 2
done
docker compose exec -T db psql -U survei -d survei -v ON_ERROR_STOP=1 -q < schema.sql

echo "== Status"
docker compose ps
curl -fsS http://127.0.0.1:3000/health && echo
echo "Deploy selesai."
