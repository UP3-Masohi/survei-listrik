# API Survei Listrik

Backend minimal (Langkah 7 panduan): Express + PostgreSQL, foto disimpan di disk.

## Menjalankan dengan Docker

```bash
cd server
docker compose up -d --build
docker compose exec api node scripts/buat-surveyor.js surveyor1 rahasia123 "Surveyor Satu"
docker compose exec api node scripts/buat-surveyor.js admin admin123 "Admin" admin
```

API tersedia di http://localhost:3000. Skema dibuat otomatis dari `schema.sql` saat database pertama kali dibuat.

## Menjalankan tanpa Docker

Butuh PostgreSQL yang sudah berjalan. Salin `.env.example` ke `.env`, sesuaikan `DATABASE_URL`, lalu:

```bash
psql "$DATABASE_URL" -f schema.sql
npm install
npm run buat-surveyor -- surveyor1 rahasia123 "Surveyor Satu"
npm start
```

## Endpoint

| Metode | Path | Fungsi |
| --- | --- | --- |
| POST | `/auth/login` | `{ username, password }` → `{ token, surveyor }`, JWT berlaku 7 hari |
| PUT | `/surveys/:id` | upsert survei (idempoten), butuh Bearer token |
| PUT | `/surveys/:id/photos/:type` | simpan foto `ktp` / `kk` / `rumah` (multipart `file`, maks 2 MB) |
| GET | `/surveys?from=&to=` | daftar survei untuk admin (role `admin`) |
| DELETE | `/surveys/:id` | admin menghapus survei salah input beserta foto dan log aksesnya |
| GET | `/surveys/:id/photos/:type/url` | admin meminta URL foto bertanda tangan (berlaku 10 menit) |
| GET | `/photos/:id/:type?exp=&oleh=&sig=` | mengunduh foto lewat URL bertanda tangan; setiap akses dicatat di `photo_access_log` |
| GET | `/health` | cek hidup |

## Keamanan dan privasi (Langkah 8)

- Surveyor (role `surveyor`) hanya bisa mengirim; membaca daftar dan foto butuh role `admin`.
- Foto tidak pernah disajikan lewat tautan publik, hanya lewat URL bertanda tangan HMAC yang kedaluwarsa 10 menit, dan tiap akses dicatat (siapa, foto mana, kapan).
- Jalankan API di balik HTTPS (Nginx + Let's Encrypt, atau layanan seperti Railway/Render). Tanpa HTTPS, browser menolak service worker, kamera, dan GPS di PWA.
- Ganti `JWT_SECRET` dengan string acak panjang sebelum produksi; rahasia yang sama dipakai untuk menandatangani URL foto.

## Masa simpan data

Tetapkan masa simpan, misalnya 2 tahun setelah pelanggan tersambung, lalu jalankan berkala (cron):

```sql
DELETE FROM photos WHERE survey_id IN (SELECT id FROM surveys WHERE received_at < now() - interval '2 years');
DELETE FROM surveys WHERE received_at < now() - interval '2 years';
```

Hapus juga file foto di `FOTO_DIR/<survey_id>/`. Untuk permintaan hapus atau koreksi dari pelanggan, hapus baris `surveys` dan `photos` berdasarkan `id` survei beserta file fotonya.

Di aplikasi PWA, isi `.env` dengan `VITE_API_URL=http://localhost:3000` (atau alamat server) sebelum build.
