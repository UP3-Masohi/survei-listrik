#!/usr/bin/env bash
# Pemasangan awal di VPS Ubuntu 22.04/24.04 (jalankan sebagai root atau dengan sudo), sekali saja.
#   bash deploy/setup-vps.sh survei.domain-anda.id
# Memasang Docker, Nginx, certbot, Node 22, mengkloning repo ke /opt/survei-listrik,
# membuat server/.env, memasang Nginx + HTTPS, lalu memanggil deploy.sh.
set -euo pipefail

DOMAIN="${1:-}"
REPO="${REPO:-https://github.com/UP3-Masohi/survei-listrik.git}"
APP_DIR="${APP_DIR:-/opt/survei-listrik}"
WEB_DIR="${WEB_DIR:-/var/www/survei-listrik}"

if [ -z "$DOMAIN" ]; then echo "Pakai: bash deploy/setup-vps.sh <domain>"; exit 1; fi
if [ "$(id -u)" -ne 0 ]; then echo "Jalankan sebagai root (sudo)."; exit 1; fi

echo "== Paket dasar"
apt-get update -y
apt-get install -y ca-certificates curl git nginx certbot python3-certbot-nginx ufw

echo "== Docker"
if ! command -v docker >/dev/null; then
  curl -fsSL https://get.docker.com | sh
fi
systemctl enable --now docker

echo "== Node.js 22 (untuk membangun aplikasi)"
if ! command -v node >/dev/null || [ "$(node -v | cut -c2-3)" -lt 20 ]; then
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
  apt-get install -y nodejs
fi

echo "== Kode"
if [ ! -d "$APP_DIR/.git" ]; then
  git clone "$REPO" "$APP_DIR"
fi
cd "$APP_DIR"

echo "== Rahasia server (server/.env)"
if [ ! -f server/.env ]; then
  cat > server/.env <<EOF
DB_PASSWORD=$(openssl rand -hex 24)
JWT_SECRET=$(openssl rand -hex 32)
CORS_ORIGIN=
EOF
  chmod 600 server/.env
  echo "server/.env dibuat dengan rahasia acak."
fi

echo "== Nginx"
sed "s/DOMAIN_ANDA/$DOMAIN/g" deploy/nginx.conf.example > /etc/nginx/sites-available/survei-listrik
ln -sf /etc/nginx/sites-available/survei-listrik /etc/nginx/sites-enabled/survei-listrik
rm -f /etc/nginx/sites-enabled/default
mkdir -p "$WEB_DIR"
nginx -t && systemctl reload nginx

echo "== Firewall"
ufw allow OpenSSH >/dev/null
ufw allow 'Nginx Full' >/dev/null
ufw --force enable >/dev/null

echo "== Deploy pertama"
DOMAIN="$DOMAIN" APP_DIR="$APP_DIR" WEB_DIR="$WEB_DIR" bash deploy/deploy.sh

echo "== HTTPS (Let's Encrypt)"
certbot --nginx -d "$DOMAIN" --non-interactive --agree-tos --register-unsafely-without-email --redirect || \
  echo "certbot gagal; pastikan DNS $DOMAIN sudah mengarah ke IP VPS ini, lalu jalankan: certbot --nginx -d $DOMAIN"

echo
echo "Selesai. Buat akun:"
echo "  cd $APP_DIR/server && docker compose exec api node scripts/buat-surveyor.js surveyor1 <password> \"Nama Surveyor\""
echo "  cd $APP_DIR/server && docker compose exec api node scripts/buat-surveyor.js admin <password> \"Admin\" admin"
echo "Aplikasi: https://$DOMAIN"
