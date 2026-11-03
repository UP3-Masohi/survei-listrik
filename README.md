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

## Deploy produksi

1. Jalankan API dengan `docker compose up -d --build` di `server/` pada VPS, atau Railway/Render, di balik HTTPS.
2. Isi `.env` dengan `VITE_API_URL=https://api.domain-anda.id`, lalu `npm run build`.
3. Unggah folder `dist/` ke hosting statis HTTPS (Cloudflare Pages, Netlify, Vercel, atau Nginx).
4. Isi `CORS_ORIGIN` di server dengan domain aplikasi, dan ganti `JWT_SECRET`.

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
