# Panduan Membangun PWA Survei Calon Pelanggan Listrik

Nov 3, 2026 · @Wannn

## Gambaran arsitektur

Aplikasi ini bekerja offline-first: setiap survei disimpan utuh di HP, lalu dikirim ke server lewat antrian sinkronisasi begitu ada koneksi. Surveyor tidak pernah menunggu jaringan, dan server hanya menerima survei yang sudah lengkap.

&#91;embedded content: arsitektur offline-first · 4 masukan, 1 antrian, 1 API\]

Empat masukan di kiri masuk ke IndexedDB; antrian mengirimnya ke API hanya saat online, dan foto baru dihapus dari HP setelah server mengonfirmasi.

Alur kerja surveyor di lapangan:

1. Login sekali saat online; sesi tersimpan untuk pemakaian offline.
2. Isi form data calon pelanggan.
3. Foto KTP, KK, dan tampak depan rumah.
4. Tag lokasi rumah dengan GPS, geser marker bila perlu.
5. Simpan: status survei menjadi "Menunggu kirim".
6. Saat sinyal ada, aplikasi mengirim otomatis dan status berubah "Terkirim".

Panduan ini memakai JavaScript biasa (Vite) agar mudah dipindahkan ke React atau Vue bila tim lebih terbiasa dengan salah satunya.

## Persiapan dan struktur proyek

Yang dibutuhkan: Node.js 20+, VS Code, Git, satu HP Android untuk uji coba, dan hosting HTTPS. PWA, kamera, dan GPS hanya diizinkan browser di HTTPS (kecuali `localhost` saat pengembangan).

| Pustaka | Fungsi | Perintah |
| --- | --- | --- |
| Vite + vite-plugin-pwa | build, manifest, service worker (Workbox) | `npm i -D vite-plugin-pwa` |
| Dexie.js | lapisan IndexedDB yang ringkas | `npm i dexie` |
| Leaflet | peta OpenStreetMap | `npm i leaflet` |
| uuid | ID unik dibuat di HP | `npm i uuid` |

Buat proyek:

```bash
npm create vite@latest survei-listrik -- --template vanilla
cd survei-listrik
npm install dexie leaflet uuid
npm install -D vite-plugin-pwa
npm run dev
```

Struktur folder `src/`:

```
src/
├── main.js      # inisialisasi, navigasi antar layar
├── db.js        # skema IndexedDB (Dexie)
├── form.js      # form survei + validasi
├── camera.js    # ambil dan kompres foto
├── geo.js       # GPS dan peta
├── sync.js      # antrian sinkronisasi
├── api.js       # panggilan ke backend
└── auth.js      # login, token, PIN
```

Tambahkan file `.env` berisi `VITE_API_URL=https://api.contoh.id` agar alamat server tidak ditulis di kode.

## Langkah 1: Kerangka PWA (manifest dan service worker)

Setelah langkah ini aplikasi bisa dipasang ke layar utama dan terbuka tanpa sinyal. vite-plugin-pwa membuat manifest dan service worker Workbox dari satu konfigurasi.

`vite.config.js`:

```js
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name: 'Survei Calon Pelanggan Listrik',
        short_name: 'Survei Listrik',
        start_url: '/',
        display: 'standalone',
        background_color: '#ffffff',
        theme_color: '#0b5ed7',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' }
        ]
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,png,svg,woff2}'],
        runtimeCaching: [{
          urlPattern: /^https:\/\/[abc]\.tile\.openstreetmap\.org\/.*/i,
          handler: 'CacheFirst',
          options: {
            cacheName: 'tile-peta',
            expiration: { maxEntries: 1000, maxAgeSeconds: 30 * 24 * 3600 }
          }
        }]
      }
    })
  ]
})
```

Yang terjadi: semua file hasil build di-precache sehingga aplikasi terbuka offline, tile peta yang pernah dilihat disimpan 30 hari, dan versi baru dipasang otomatis.

Lengkapi `index.html` dengan `<meta name="viewport" content="width=device-width, initial-scale=1">` dan `<meta name="theme-color" content="#0b5ed7">`, lalu taruh ikon 192 dan 512 px di `public/icons/`. Minta penyimpanan permanen agar browser tidak menghapus data saat memori HP penuh:

```js
// main.js
if (navigator.storage?.persist) navigator.storage.persist()
```

Uji: `npm run build && npm run preview`, buka di Chrome, lalu lihat tab Application → Service Workers; statusnya harus "activated".

## Langkah 2: Penyimpanan lokal dengan IndexedDB (Dexie)

Tiga tabel cukup: `surveys` untuk isi form dan lokasi, `photos` untuk blob foto, dan `outbox` sebagai antrian kirim. Foto dipisah dari survei agar daftar survei tetap ringan dibuka.

`db.js`:

```js
import Dexie from 'dexie'

export const db = new Dexie('SurveiListrik')
db.version(1).stores({
  surveys: 'id, status, createdAt',   // id = UUID yang dibuat di HP
  photos:  'id, surveyId, type',      // type: ktp | kk | rumah
  outbox:  '++seq, surveyId'          // urutan kirim
})

export async function simpanSurvei(survei) {
  survei.updatedAt = new Date().toISOString()
  await db.transaction('rw', db.surveys, db.outbox, async () => {
    await db.surveys.put(survei)
    if (survei.status === 'pending') {
      const sudahAntri = await db.outbox.where('surveyId').equals(survei.id).count()
      if (!sudahAntri) await db.outbox.add({ surveyId: survei.id, attempts: 0 })
    }
  })
}
```

Bentuk satu record survei:

```js
{
  id: '3f2a9c1e-…',                  // uuid v4, dibuat saat form dibuka
  status: 'draft',                   // draft | pending | sent | failed
  createdAt: '2026-11-03T08:15:00Z',
  surveyorId: 'u-17',
  pelanggan: { nama, nik, noKK, noHp, alamat, rt, rw, kelurahan, kecamatan },
  permohonan: { dayaVA: 1300, tarif: 'R1', peruntukan: 'rumah tinggal' },
  teknis: { jarakTiangM: 35, perluTiangBaru: false, catatan: '' },
  lokasi: { lat, lng, accuracyM, capturedAt, manual: false },
  persetujuan: { setuju: true, ttdPelangganPng: 'data:image/png;base64,…' }
}
```

Dua aturan yang menjaga data tetap konsisten: ID selalu dibuat di HP dengan `uuid`, sehingga survei yang terkirim dua kali tidak menjadi ganda di server; dan status hanya bergerak maju draft → pending → sent (atau failed), tidak pernah mundur.

## Langkah 3: Form survei dan validasi

Form disimpan sebagai draft setiap kali surveyor mengetik, jadi aplikasi yang tertutup mendadak tidak kehilangan data. Validasi penuh dilakukan saat tombol "Simpan dan kirim" ditekan.

| Kelompok | Field | Aturan |
| --- | --- | --- |
| Pelanggan | nama, NIK, no. KK, no. HP, alamat, RT/RW, kelurahan, kecamatan | NIK dan KK 16 digit, HP diawali 08 |
| Permohonan | daya (VA), tarif, peruntukan | pilihan tetap lewat `<select>` |
| Teknis | jarak ke tiang terdekat (m), perlu tiang baru, catatan | angka ≥ 0 |
| Bukti | foto KTP, KK, rumah; lokasi GPS; persetujuan + tanda tangan | wajib ada semua |

`form.js` (inti):

```js
import { v4 as uuid } from 'uuid'
import { db, simpanSurvei } from './db.js'

export function surveiBaru(surveyorId) {
  return { id: uuid(), status: 'draft', createdAt: new Date().toISOString(), surveyorId,
           pelanggan: {}, permohonan: {}, teknis: {}, lokasi: null, persetujuan: {} }
}

export function validasi(s) {
  const err = {}
  if (!s.pelanggan.nama?.trim()) err.nama = 'Nama wajib diisi'
  if (!/^\d{16}$/.test(s.pelanggan.nik ?? '')) err.nik = 'NIK harus 16 digit'
  if (!/^\d{16}$/.test(s.pelanggan.noKK ?? '')) err.noKK = 'No. KK harus 16 digit'
  if (!/^08\d{8,11}$/.test(s.pelanggan.noHp ?? '')) err.noHp = 'Nomor HP tidak valid'
  if (!s.permohonan.dayaVA) err.daya = 'Pilih daya yang diajukan'
  if (!s.lokasi?.lat) err.lokasi = 'Lokasi rumah belum diambil'
  if (!s.persetujuan.setuju) err.setuju = 'Persetujuan pelanggan wajib dicentang'
  return err
}

// autosave draft, ditunda 500 ms setelah ketikan terakhir
let timer
export function autosave(s) {
  clearTimeout(timer)
  timer = setTimeout(() => simpanSurvei(s), 500)
}

export async function kirim(s) {
  const err = validasi(s)
  const jumlahFoto = await db.photos.where('surveyId').equals(s.id).count()
  if (jumlahFoto < 3) err.foto = 'Foto KTP, KK, dan rumah wajib'
  if (Object.keys(err).length) return err
  s.status = 'pending'
  await simpanSurvei(s)
  return null
}
```

Di HTML, beri `inputmode="numeric"` pada NIK, KK, dan HP agar keyboard angka langsung muncul. Tanda tangan cukup sebuah `<canvas>` yang menggambar jejak sentuhan dan menyimpan `canvas.toDataURL('image/png')` ke `persetujuan.ttdPelangganPng`; pustaka `signature_pad` menyediakan ini siap pakai.

## Langkah 4: Foto KTP, KK, dan rumah

Foto diambil lewat input file beratribut `capture`, dikecilkan ke maksimal 1280 px, lalu disimpan sebagai blob JPEG sekitar 200–400 KB. Ukuran ini masih terbaca untuk verifikasi KTP, dan tiga foto per survei tetap ringan saat dikirim lewat sinyal lemah.

HTML, satu blok per jenis foto:

```html
<label>Foto KTP
  <input type="file" accept="image/*" capture="environment" data-tipe="ktp">
</label>
<img id="pratinjau-ktp" alt="">
```

`camera.js`:

```js
import { db } from './db.js'

export async function kompresFoto(file, maxPx = 1280, mutu = 0.8) {
  const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' })
  const skala = Math.min(1, maxPx / Math.max(bmp.width, bmp.height))
  const c = document.createElement('canvas')
  c.width = Math.round(bmp.width * skala)
  c.height = Math.round(bmp.height * skala)
  c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height)
  bmp.close()
  return new Promise(res => c.toBlob(res, 'image/jpeg', mutu))
}

export async function simpanFoto(surveyId, tipe, file) {
  const blob = await kompresFoto(file)
  await db.photos.put({ id: `${surveyId}-${tipe}`, surveyId, type: tipe, blob, size: blob.size })
  return URL.createObjectURL(blob)   // untuk pratinjau
}

// surveiAktif = record survei yang sedang diisi (dari form.js)
document.querySelectorAll('input[type=file]').forEach(el =>
  el.addEventListener('change', async e => {
    const url = await simpanFoto(surveiAktif.id, el.dataset.tipe, e.target.files[0])
    document.getElementById(`pratinjau-${el.dataset.tipe}`).src = url
  }))
```

Tiga catatan:

- `imageOrientation: 'from-image'` memperbaiki foto yang tampil terputar karena data EXIF kamera.
- Tampilkan bingkai panduan berbentuk kartu di atas layar kamera (overlay CSS) agar KTP difoto rata dan memenuhi bingkai.
- Bila nanti ingin NIK dan nama terisi otomatis lewat OCR, simpan foto KTP di 1600 px dan jalankan Tesseract.js di HP atau OCR di server; mulai tanpa OCR dulu agar aplikasi cepat dipakai.

## Langkah 5: Geotagging lokasi rumah dan peta

GPS tetap bekerja tanpa internet karena memakai sinyal satelit; yang butuh koneksi hanya tile peta, dan itu sudah di-cache oleh service worker di Langkah 1. Terima titik hanya bila akurasi ≤ 30 m, lalu biarkan surveyor menggeser marker ke posisi rumah yang tepat.

`geo.js`:

```js
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'

export function ambilLokasi(maksAkurasiM = 30) {
  return new Promise((res, rej) => {
    navigator.geolocation.getCurrentPosition(p => {
      const akurasi = Math.round(p.coords.accuracy)
      if (akurasi > maksAkurasiM) return rej(new Error(`Akurasi ${akurasi} m, coba lagi di tempat terbuka`))
      res({ lat: p.coords.latitude, lng: p.coords.longitude, accuracyM: akurasi,
            capturedAt: new Date().toISOString(), manual: false })
    }, rej, { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 })
  })
}

export function tampilkanPeta(elId, lokasi, onGeser) {
  const peta = L.map(elId).setView([lokasi.lat, lokasi.lng], 18)
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    { maxZoom: 19, attribution: '© OpenStreetMap' }).addTo(peta)
  L.circle([lokasi.lat, lokasi.lng], { radius: lokasi.accuracyM }).addTo(peta)
  const marker = L.marker([lokasi.lat, lokasi.lng], { draggable: true }).addTo(peta)
  marker.on('dragend', e => onGeser({ ...lokasi, ...e.target.getLatLng(), manual: true }))
  return peta
}
```

Tips lapangan:

- GPS biasanya butuh 5–20 detik untuk mengunci posisi; tampilkan indikator "mencari sinyal GPS" dan tombol "coba lagi".
- Simpan `accuracyM` dan `manual` apa adanya agar admin tahu kualitas tiap titik.
- Untuk wilayah yang tidak pernah punya sinyal, buka peta wilayah itu saat masih online pada zoom 15–18 supaya tile-nya tersimpan di cache.
- Server tile OpenStreetMap publik membatasi pemakaian besar; untuk ratusan surveyor, pakai layanan tile seperti MapTiler atau server tile sendiri.

## Langkah 6: Sinkronisasi offline ke online

Antrian `outbox` diproses setiap kali HP kembali online dan tiap 60 detik. Setiap survei dikirim dengan `PUT` memakai ID dari HP, jadi pengiriman ulang aman dan tidak menggandakan data di server; foto dihapus dari HP hanya setelah server mengonfirmasi.

`api.js`:

```js
import { getToken } from './auth.js'

const BASE = import.meta.env.VITE_API_URL
const auth = () => ({ Authorization: `Bearer ${getToken()}` })

export async function kirimSurvei(s) {
  const r = await fetch(`${BASE}/surveys/${s.id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', ...auth() },
    body: JSON.stringify(s)
  })
  if (!r.ok) throw new Error(`HTTP ${r.status}`)
}

export async function kirimFoto(surveyId, tipe, blob) {
  const fd = new FormData()
  fd.append('file', blob, `${tipe}.jpg`)
  const r = await fetch(`${BASE}/surveys/${surveyId}/photos/${tipe}`,
    { method: 'PUT', headers: auth(), body: fd })
  if (!r.ok) throw new Error(`HTTP ${r.status}`)
}
```

`sync.js`:

```js
import { db } from './db.js'
import { kirimSurvei, kirimFoto } from './api.js'

let sibuk = false
const MAKS_PERCOBAAN = 5

export async function jalankanSync() {
  if (sibuk || !navigator.onLine) return
  sibuk = true
  try {
    for (const item of await db.outbox.orderBy('seq').toArray()) {
      const s = await db.surveys.get(item.surveyId)
      try {
        await kirimSurvei(s)
        for (const f of await db.photos.where('surveyId').equals(s.id).toArray())
          await kirimFoto(s.id, f.type, f.blob)
        await db.transaction('rw', db.surveys, db.outbox, db.photos, async () => {
          await db.surveys.update(s.id, { status: 'sent', sentAt: new Date().toISOString() })
          await db.outbox.delete(item.seq)
          await db.photos.where('surveyId').equals(s.id).delete()   // bersihkan foto dari HP
        })
      } catch (e) {
        const n = item.attempts + 1
        await db.outbox.update(item.seq, { attempts: n, lastError: String(e) })
        if (n >= MAKS_PERCOBAAN) await db.surveys.update(s.id, { status: 'failed' })
      }
    }
  } finally { sibuk = false }
  tampilkanJumlahPending()
}

export async function tampilkanJumlahPending() {
  const n = await db.outbox.count()
  document.getElementById('badge-pending').textContent = n ? `${n} menunggu kirim` : 'Semua terkirim'
}

window.addEventListener('online', jalankanSync)
setInterval(jalankanSync, 60_000)
jalankanSync()
```

Yang perlu diperhatikan:

- `navigator.onLine` bisa `true` padahal sinyal lemah; `fetch` yang gagal masuk hitungan percobaan dan dicoba lagi pada putaran berikutnya.
- Survei berstatus `failed` tetap ada di HP; sediakan tombol "Kirim ulang" yang mengembalikan `attempts` ke 0 dan statusnya ke `pending`.
- Respons HTTP 401 berarti token kedaluwarsa: hentikan sync dan minta login ulang, jangan dihitung sebagai percobaan gagal.
- Background Sync API (Chrome Android) bisa mengirim saat aplikasi tertutup; tambahkan nanti sebagai bonus, jangan dijadikan andalan karena iPhone tidak mendukungnya.

## Langkah 7: Backend minimal

Satu API kecil dengan empat endpoint, PostgreSQL untuk data, dan bucket atau folder untuk foto sudah cukup untuk tahap awal. Contoh di bawah memakai Node.js + Express; polanya sama bila tim lebih terbiasa dengan Laravel atau Go.

Skema database:

```sql
CREATE TABLE surveyors (
  id uuid PRIMARY KEY, nama text, username text UNIQUE, password_hash text
);
CREATE TABLE surveys (
  id uuid PRIMARY KEY,                        -- UUID dari aplikasi
  surveyor_id uuid REFERENCES surveyors(id),
  data jsonb NOT NULL,                        -- isi form apa adanya
  lat double precision, lng double precision, accuracy_m int,
  created_at timestamptz, received_at timestamptz DEFAULT now()
);
CREATE TABLE photos (
  survey_id uuid REFERENCES surveys(id), type text, path text, size int,
  PRIMARY KEY (survey_id, type)
);
```

| Metode | Path | Fungsi |
| --- | --- | --- |
| POST | `/auth/login` | mengembalikan JWT berlaku 7 hari |
| PUT | `/surveys/:id` | upsert survei (idempoten) |
| PUT | `/surveys/:id/photos/:type` | simpan foto ke storage |
| GET | `/surveys?from=&to=` | daftar survei untuk admin |

Inti dua endpoint yang dipanggil aplikasi:

```js
app.put('/surveys/:id', auth, async (req, res) => {
  const s = req.body
  if (s.id !== req.params.id) return res.status(400).json({ error: 'id tidak cocok' })
  await pool.query(`
    INSERT INTO surveys (id, surveyor_id, data, lat, lng, accuracy_m, created_at)
    VALUES ($1, $2, $3, $4, $5, $6, $7)
    ON CONFLICT (id) DO UPDATE
      SET data = EXCLUDED.data, lat = EXCLUDED.lat, lng = EXCLUDED.lng,
          accuracy_m = EXCLUDED.accuracy_m`,
    [s.id, req.user.id, s, s.lokasi.lat, s.lokasi.lng, s.lokasi.accuracyM, s.createdAt])
  res.json({ ok: true })
})

app.put('/surveys/:id/photos/:type', auth, upload.single('file'), async (req, res) => {
  const path = `${req.params.id}/${req.params.type}.jpg`   // key di S3/MinIO atau path di disk
  await simpanKeStorage(path, req.file.buffer)
  await pool.query(`
    INSERT INTO photos (survey_id, type, path, size) VALUES ($1, $2, $3, $4)
    ON CONFLICT (survey_id, type) DO UPDATE SET path = EXCLUDED.path, size = EXCLUDED.size`,
    [req.params.id, req.params.type, path, req.file.size])
  res.json({ ok: true })
})
```

`upload` adalah multer dengan `memoryStorage()` dan batas 2 MB per file; `simpanKeStorage` menulis ke MinIO/S3 lewat SDK atau ke disk dengan `fs.promises.writeFile`. Aktifkan CORS hanya untuk domain PWA. Untuk dashboard admin tahap awal, Metabase yang dihubungkan langsung ke PostgreSQL sudah memberi tabel, filter, dan peta sebaran tanpa menulis kode.

## Langkah 8: Keamanan dan privasi data KTP/KK

NIK, nomor KK, dan foto identitas adalah data pribadi yang diatur UU 27/2022 (UU PDP), jadi aplikasi harus meminimalkan berapa lama data itu ada di HP dan siapa yang bisa melihatnya di server.

Di HP:

- Login dengan JWT saat online; token berlaku 7 hari dan disimpan di IndexedDB agar aplikasi tetap bisa dipakai offline.
- PIN 6 digit untuk membuka aplikasi tanpa sinyal; salah 5 kali berturut-turut, data lokal dihapus dan wajib login ulang.
- Enkripsi record survei dengan Web Crypto (AES-GCM, kunci diturunkan dari PIN lewat PBKDF2) sebelum disimpan ke Dexie, sehingga HP yang hilang tidak membuka NIK siapa pun.
- Foto dan isi form dihapus dari HP begitu server mengonfirmasi (sudah dilakukan di `sync.js`); sisakan ringkasan nama dan status tanpa NIK.

Di server:

- HTTPS wajib di PWA dan API; tanpa HTTPS browser menolak service worker, kamera, dan GPS.
- Foto disajikan lewat URL bertanda tangan (signed URL) yang kedaluwarsa, bukan tautan publik.
- Batasi hak akses: surveyor hanya bisa mengirim, admin yang membaca; catat log siapa membuka foto siapa dan kapan.
- Tetapkan masa simpan (misalnya 2 tahun setelah pelanggan tersambung) dan prosedur hapus atau koreksi atas permintaan pelanggan.

Di form: tambahkan kotak centang "Saya setuju data saya dipakai untuk permohonan sambungan listrik" beserta tanda tangan; persetujuan ini adalah dasar pemrosesan data menurut UU PDP, dan sudah divalidasi di Langkah 3.

## Langkah 9: Uji coba offline, deploy, dan instalasi di HP

Uji di laptop dulu, lalu di HP dengan mode pesawat; setelah lolos, aplikasi tinggal di-build dan ditaruh di hosting statis HTTPS.

Skenario uji minimal:

- [ ] Chrome DevTools → Network → Offline: aplikasi tetap terbuka, form bisa diisi, survei tersimpan.
- [ ] Mode pesawat di HP: foto dan GPS tetap berjalan, badge "menunggu kirim" bertambah.
- [ ] Matikan mode pesawat: survei terkirim sendiri dalam 1 menit dan foto hilang dari IndexedDB (DevTools → Application → IndexedDB).
- [ ] Kirim survei yang sama dua kali: server tetap punya satu baris.
- [ ] Lighthouse → kategori PWA: lolos "Installable".

Deploy:

1. `npm run build` menghasilkan folder `dist/`.
2. Unggah `dist/` ke hosting statis HTTPS: Cloudflare Pages, Netlify, Vercel, atau Nginx di VPS yang sama dengan API.
3. Jalankan API di VPS (Docker + PostgreSQL) atau layanan seperti Railway/Render; isi `VITE_API_URL` sebelum build.
4. Pasang sertifikat HTTPS (Let's Encrypt) untuk domain aplikasi dan domain API.

Instalasi di HP Android: buka alamat aplikasi di Chrome → menu ⋮ → "Instal aplikasi" atau "Tambahkan ke layar utama". Bila nanti perlu masuk Play Store, bungkus PWA sebagai Trusted Web Activity dengan PWABuilder atau Bubblewrap tanpa mengubah kode.

Pembaruan: dengan `registerType: 'autoUpdate'`, versi baru terpasang saat aplikasi dibuka berikutnya. Tampilkan pesan "Versi baru siap, muat ulang" lewat `virtual:pwa-register` agar surveyor tahu kenapa aplikasi memuat ulang.

## Keterbatasan PWA dan checklist akhir

Utamakan Android untuk surveyor; di iPhone PWA tetap jalan, tetapi tanpa Background Sync dan dengan kuota penyimpanan lebih kecil.

| Kemampuan | Android (Chrome) | iPhone (Safari) |
| --- | --- | --- |
| Instal ke layar utama | ya, lewat menu | ya, lewat tombol Bagikan |
| Kamera lewat `capture` | ya | ya |
| GPS | ya | ya |
| Background Sync saat aplikasi tertutup | ya | tidak |
| Kuota IndexedDB | besar, sebagian dari ruang kosong HP | sekitar 1 GB; bisa dihapus bila situs tak dibuka 7 hari, kecuali sudah dipasang ke layar utama |
| Notifikasi push | ya | hanya setelah dipasang ke layar utama |

Angka kuota di atas perkiraan dan berubah antarversi browser; yang pasti, tiga foto 300 KB per survei berarti ratusan survei tersimpan tanpa masalah di kedua platform.

Checklist sebelum uji lapangan:

- [ ] Survei tersimpan dan terbuka kembali dalam mode pesawat
- [ ] Tiga foto terkompres, masing-masing di bawah 500 KB
- [ ] Titik GPS tercatat dengan akurasi ≤ 30 m dan bisa digeser
- [ ] Pengiriman ulang tidak menggandakan data di server
- [ ] Foto terhapus dari HP setelah status "Terkirim"
- [ ] Login dan PIN offline berfungsi; HTTPS aktif di aplikasi dan API
- [ ] Persetujuan dan tanda tangan pelanggan tersimpan

Urutan pengerjaan yang disarankan:

1. Kerangka PWA, form, dan IndexedDB (Langkah 1–3)
2. Foto dan GPS (Langkah 4–5)
3. Backend dan sinkronisasi (Langkah 6–7)
4. Keamanan, uji lapangan bersama 2–3 surveyor, lalu deploy (Langkah 8–9)
