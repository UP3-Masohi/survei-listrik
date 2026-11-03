# Survei Calon Pelanggan Listrik (PWA)

Aplikasi survei offline-first untuk surveyor di lapangan, dibangun mengikuti `PANDUAN.md`:
Vite + vanilla JS, vite-plugin-pwa, Dexie (IndexedDB), Leaflet, uuid. Backend ada di folder `server/`.

## Menjalankan di komputer

```bash
npm install
npm run dev          # http://localhost:5173 (tanpa service worker)
npm run build && npm run preview   # http://localhost:4173 (versi produksi, service worker aktif)
```

API harus berjalan di port 3000. Untuk mencoba tanpa PostgreSQL: `cd server && node test/server-tiruan.mjs`
(akun uji ada di komentar atas berkas itu). Untuk API sungguhan: lihat `server/README.md` (docker compose).

Aplikasi memanggil API lewat `/api/...` yang diteruskan Vite ke port 3000 (`vite.config.js`, bagian proxy),
jadi aplikasi dan API berbagi satu alamat dan tidak perlu CORS. Alamat ini diatur di `.env` (`VITE_API_URL=/api`).

## Membuka di HP (mode HP)

Service worker dan GPS hanya diizinkan browser di HTTPS, jadi HP perlu alamat HTTPS. Cara termudah
tanpa deploy: tunnel Cloudflare (`cloudflared`, gratis, tanpa akun).

Terminal 1, API:

```bash
cd server && node test/server-tiruan.mjs
```

Terminal 2, aplikasi versi produksi (build + preview, bisa diakses dari jaringan):

```bash
npm run hp
```

Terminal 3, tunnel HTTPS:

```bash
npm run tunnel
```

Salin alamat `https://....trycloudflare.com` yang muncul di terminal 3, buka di Chrome HP, login, buat PIN.
Untuk memasang ke layar utama: menu ⋮ → "Instal aplikasi" (Android) atau Bagikan → "Tambahkan ke Layar Utama" (iPhone).

Catatan:
- Alamat trycloudflare berganti setiap tunnel dijalankan ulang; data di HP terikat pada alamat, jadi HP akan
  meminta login dan PIN lagi untuk alamat baru.
- Setelah mengubah kode, jalankan ulang `npm run hp` agar build terbaru yang disajikan.
- Satu Wi-Fi tanpa tunnel: buka `http://<IP-Mac>:4173` di HP. Form dan kamera berjalan, tetapi mode offline
  dan GPS diblokir browser karena bukan HTTPS.

## Deploy ke GitHub Pages (hanya aplikasi, API terpisah)

Workflow `.github/workflows/pages.yml` membangun dan menayangkan `dist/` ke
`https://<akun>.github.io/survei-listrik/` setiap push ke `main`. Sekali saja di GitHub:

1. Settings → Pages → Source: **GitHub Actions**.
2. Settings → Secrets and variables → Actions → Variables → `VITE_API_URL` = alamat API yang bisa dijangkau HP,
   misalnya `https://api.domain-anda.id` atau sementara `https://<tunnel>.trycloudflare.com/api`.
3. Di server API, `CORS_ORIGIN` harus berisi `https://<akun>.github.io`.

Catatan: GitHub Pages pada repo privat memerlukan paket GitHub berbayar; pada paket gratis, repo harus publik.

## Deploy produksi di VPS (satu domain, HTTPS)

Berkas di folder `deploy/`:

| Berkas | Fungsi |
| --- | --- |
| `deploy/setup-vps.sh` | pemasangan awal sekali saja: Docker, Nginx, certbot, Node 22, clone repo, rahasia, HTTPS |
| `deploy/deploy.sh` | deploy ulang: `git pull`, build PWA, salin `dist/` ke Nginx, bangun ulang API, jalankan `schema.sql` |
| `deploy/nginx.conf.example` | Nginx melayani `dist/` dan meneruskan `/api/` ke API di port 3000 |
| `server/docker-compose.prod.yml` | lapisan produksi: password DB dan `JWT_SECRET` dari `server/.env`, restart otomatis |

Prasyarat: VPS Ubuntu 22.04/24.04 (1–2 GB RAM), akses SSH sebagai root, dan satu domain yang record A-nya
sudah mengarah ke IP VPS.

Pemasangan awal (di VPS, sebagai root):

```bash
git clone https://github.com/UP3-Masohi/survei-listrik.git /opt/survei-listrik && bash /opt/survei-listrik/deploy/setup-vps.sh survei.domain-anda.id
```

Lalu buat akun:

```bash
cd /opt/survei-listrik/server && docker compose exec api node scripts/buat-surveyor.js surveyor1 <password> "Nama Surveyor"
```

```bash
cd /opt/survei-listrik/server && docker compose exec api node scripts/buat-surveyor.js admin <password> "Admin" admin
```

Setiap ada perubahan di GitHub:

```bash
cd /opt/survei-listrik && bash deploy/deploy.sh
```

Catatan:
- `schema.sql` memakai `IF NOT EXISTS`, jadi tabel baru ikut terbuat di database lama saat deploy ulang.
- Port database dan API hanya didengarkan di `127.0.0.1`; dari luar hanya Nginx (80/443) yang terbuka.
- Rahasia ada di `server/.env` (dibuat otomatis oleh `setup-vps.sh`, tidak masuk git). Cadangkan file itu
  bersama volume `pgdata` dan `foto`.
- Jika aplikasi juga ditayangkan di GitHub Pages, isi `CORS_ORIGIN=https://<akun>.github.io` di `server/.env`
  dan variabel repo `VITE_API_URL=https://survei.domain-anda.id/api`.

## Struktur

```
src/main.js     inisialisasi, navigasi antar layar, beranda
src/db.js       skema IndexedDB (Dexie) + enkripsi record
src/form.js     form survei, autosave, validasi
src/camera.js   ambil dan kompres foto
src/geo.js      GPS dan peta
src/sync.js     antrian sinkronisasi
src/api.js      panggilan ke backend
src/auth.js     login, token, PIN, enkripsi
src/dasbor.js   dasbor admin (peta sebaran, tabel, ekspor CSV)
server/         API Express + PostgreSQL + docker-compose
```
