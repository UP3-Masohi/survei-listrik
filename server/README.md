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
| GET | `/health` | cek hidup |

Di aplikasi PWA, isi `.env` dengan `VITE_API_URL=http://localhost:3000` (atau alamat server) sebelum build.
