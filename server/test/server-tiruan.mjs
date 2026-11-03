// API dengan pool tiruan di port 3000, untuk mencoba PWA tanpa PostgreSQL.
// Akun: surveyor1 / rahasia123 (surveyor), admin / admin123 (admin). Jalankan: node test/server-tiruan.mjs
// PIN uji yang dipakai di browser pane saat pengembangan: 654321 (sesi admin), 123456 (sesi surveyor).
// PIN hanya tersimpan di HP/browser masing-masing; lupa PIN -> "Masuk dengan akun lain" di layar PIN, lalu buat PIN baru.
import { buatApp } from '../src/app.js'
import { buatPoolTiruan } from './pool-tiruan.mjs'

const { pool, tabel, disk, simpanKeStorage, bacaDariStorage } = await buatPoolTiruan()
const app = buatApp({ pool, simpanKeStorage, bacaDariStorage, corsOrigin: ['http://localhost:5173', 'http://localhost:4173'] })
app.get('/_tiruan', (req, res) => res.json({ surveys: [...tabel.surveys.values()], photos: [...tabel.photos.values()], disk: [...disk.entries()].map(([k, v]) => [k, v.length]), log: tabel.log }))
const PORT = Number(process.env.PORT || 3000)
app.listen(PORT, () => console.log(`API tiruan (tanpa database) di port ${PORT}`))
