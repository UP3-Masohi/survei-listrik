// Uji rute API dengan pool tiruan (tanpa PostgreSQL). Jalankan: npm test

import { buatPoolTiruan } from './pool-tiruan.mjs'

import { buatApp } from '../src/app.js'

const { pool, tabel, disk, simpanKeStorage, bacaDariStorage, hapusDariStorage, surveyorId } = await buatPoolTiruan()

const app = buatApp({ pool, simpanKeStorage, bacaDariStorage, hapusDariStorage, corsOrigin: ['http://localhost:5173'] })
const server = app.listen(0)
const BASE = `http://127.0.0.1:${server.address().port}`
const hasil = []
const cek = (nama, kondisi, info = '') => hasil.push(`${kondisi ? 'LOLOS' : 'GAGAL'}  ${nama}${info ? '  (' + info + ')' : ''}`)
const json = async (r) => { try { return await r.json() } catch { return null } }

// 1. login salah -> 401, login benar -> token
let r = await fetch(`${BASE}/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: 'surveyor1', password: 'salah' }) })
cek('login password salah -> 401', r.status === 401)
r = await fetch(`${BASE}/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: 'surveyor1', password: 'rahasia123' }) })
const { token, surveyor } = await json(r)
cek('login benar -> 200 + token', r.status === 200 && typeof token === 'string' && surveyor?.nama === 'Surveyor Uji')
const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString())
cek('token berlaku 7 hari', Math.round((payload.exp - payload.iat) / 86400) === 7)
r = await fetch(`${BASE}/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: 'admin', password: 'admin123' }) })
const tokenAdmin = (await json(r)).token
const auth = (t = token) => ({ Authorization: `Bearer ${t}` })

// 2. tanpa token -> 401; token rusak -> 401
const id = '3f2a9c1e-1234-4abc-8def-0123456789ab'
const survei = { id, status: 'pending', createdAt: '2026-11-03T08:15:00Z', surveyorId: 'u-17',
  pelanggan: { nama: 'Budi', nik: '3201010101010001' }, permohonan: { dayaVA: 1300 }, teknis: {},
  lokasi: { lat: -3.3356, lng: 128.9182, accuracyM: 12, capturedAt: '2026-11-03T08:16:00Z', manual: false },
  persetujuan: { setuju: true, ttdPelangganPng: 'data:image/png;base64,iVBORw0KGgo=' } }
r = await fetch(`${BASE}/surveys/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(survei) })
cek('PUT survei tanpa token -> 401', r.status === 401)
r = await fetch(`${BASE}/surveys/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer abc.def.ghi' }, body: JSON.stringify(survei) })
cek('PUT survei token rusak -> 401', r.status === 401)

// 3. foto sebelum survei ada -> 404
const fd0 = new FormData(); fd0.append('file', new Blob([new Uint8Array(1000)], { type: 'image/jpeg' }), 'ktp.jpg')
r = await fetch(`${BASE}/surveys/${id}/photos/ktp`, { method: 'PUT', headers: auth(), body: fd0 })
cek('PUT foto sebelum survei ada -> 404', r.status === 404)

// 4. PUT survei: id tidak cocok -> 400, tanpa lokasi -> 400, benar -> 200, dua kali -> tetap 1 baris
r = await fetch(`${BASE}/surveys/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json', ...auth() }, body: JSON.stringify({ ...survei, id: 'ffffffff-ffff-4fff-8fff-ffffffffffff' }) })
cek('PUT survei id tidak cocok -> 400', r.status === 400)
r = await fetch(`${BASE}/surveys/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json', ...auth() }, body: JSON.stringify({ ...survei, lokasi: null }) })
cek('PUT survei tanpa lokasi -> 400', r.status === 400)
r = await fetch(`${BASE}/surveys/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json', ...auth() }, body: JSON.stringify(survei) })
cek('PUT survei benar -> 200', r.status === 200 && (await json(r))?.ok === true)
r = await fetch(`${BASE}/surveys/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json', ...auth() }, body: JSON.stringify({ ...survei, pelanggan: { ...survei.pelanggan, nama: 'Budi Santoso' } }) })
cek('PUT survei kedua (idempoten) -> 200, tetap 1 baris, data diperbarui', r.status === 200 && tabel.surveys.size === 1 && tabel.surveys.get(id).data.pelanggan.nama === 'Budi Santoso')
cek('surveyor_id diambil dari token, bukan body', tabel.surveys.get(id).surveyor_id === surveyorId)

// 5. foto: tipe salah -> 400, tanpa file -> 400, benar -> 200, > 2 MB -> 413, dua kali -> 1 entri
r = await fetch(`${BASE}/surveys/${id}/photos/selfie`, { method: 'PUT', headers: auth(), body: fd0 })
cek('PUT foto tipe salah -> 400', r.status === 400)
r = await fetch(`${BASE}/surveys/${id}/photos/ktp`, { method: 'PUT', headers: auth(), body: new FormData() })
cek('PUT foto tanpa file -> 400', r.status === 400)
const fotoBesar = new Blob([new Uint8Array(2 * 1024 * 1024 + 1)], { type: 'image/jpeg' })
const fdBesar = new FormData(); fdBesar.append('file', fotoBesar, 'ktp.jpg')
r = await fetch(`${BASE}/surveys/${id}/photos/ktp`, { method: 'PUT', headers: auth(), body: fdBesar })
cek('PUT foto > 2 MB -> 413', r.status === 413)
for (const tipe of ['ktp', 'kk', 'rumah']) {
  const fd = new FormData(); fd.append('file', new Blob([new Uint8Array(300 * 1024)], { type: 'image/jpeg' }), `${tipe}.jpg`)
  r = await fetch(`${BASE}/surveys/${id}/photos/${tipe}`, { method: 'PUT', headers: auth(), body: fd })
  cek(`PUT foto ${tipe} -> 200`, r.status === 200)
}
const fdUlang = new FormData(); fdUlang.append('file', new Blob([new Uint8Array(100 * 1024)], { type: 'image/jpeg' }), 'ktp.jpg')
r = await fetch(`${BASE}/surveys/${id}/photos/ktp`, { method: 'PUT', headers: auth(), body: fdUlang })
cek('PUT foto ktp kedua -> 200, tetap 3 entri, ukuran diperbarui', r.status === 200 && tabel.photos.size === 3 && tabel.photos.get(`${id}-ktp`).size === 100 * 1024)
cek('foto ditulis ke storage dengan path <id>/<type>.jpg', disk.has(`${id}/ktp.jpg`) && disk.has(`${id}/kk.jpg`) && disk.has(`${id}/rumah.jpg`))

// 6. GET /surveys: surveyor -> 403, admin -> 200 dengan foto
r = await fetch(`${BASE}/surveys`, { headers: auth() })
cek('GET /surveys oleh surveyor -> 403', r.status === 403)
r = await fetch(`${BASE}/surveys?from=2026-11-01&to=2026-11-30`, { headers: auth(tokenAdmin) })
const daftar = await json(r)
cek('GET /surveys oleh admin -> 200, 1 survei, 3 foto', r.status === 200 && daftar?.length === 1 && daftar[0].photos.length === 3 && daftar[0].surveyor === 'Surveyor Uji')

// 7. CORS: origin PWA diizinkan, origin lain tidak mendapat header
r = await fetch(`${BASE}/health`, { headers: { Origin: 'http://localhost:5173' } })
cek('CORS origin PWA diizinkan', r.headers.get('access-control-allow-origin') === 'http://localhost:5173')
r = await fetch(`${BASE}/health`, { headers: { Origin: 'https://situs-lain.id' } })
cek('CORS origin lain tidak diizinkan', r.headers.get('access-control-allow-origin') === null)

// 8. URL foto bertanda tangan (Langkah 8)
r = await fetch(`${BASE}/surveys/${id}/photos/ktp/url`, { headers: auth() })
cek('minta URL foto oleh surveyor -> 403', r.status === 403)
r = await fetch(`${BASE}/surveys/${id}/photos/ktp/url`, { headers: auth(tokenAdmin) })
const { url, expiresAt } = await json(r)
cek('minta URL foto oleh admin -> 200 + url + expiresAt', r.status === 200 && url?.startsWith(`/photos/${id}/ktp?`) && !!expiresAt)
r = await fetch(`${BASE}${url}`)
cek('buka URL bertanda tangan tanpa token -> 200 image/jpeg', r.status === 200 && r.headers.get('content-type') === 'image/jpeg' && (await r.arrayBuffer()).byteLength === 100 * 1024)
cek('akses foto tercatat di log dengan id admin', tabel.log.length === 1 && tabel.log[0].admin_id === '22222222-2222-4222-8222-222222222222')
r = await fetch(`${BASE}${url.replace(/sig=.{6}/, 'sig=000000')}`)
cek('tanda tangan diubah -> 403', r.status === 403)
r = await fetch(`${BASE}${url.replace(/exp=\d+/, 'exp=1000')}`)
cek('tautan kedaluwarsa -> 403', r.status === 403)
r = await fetch(`${BASE}/surveys/${id}/photos/kk/url`.replace(id, 'ffffffff-ffff-4fff-8fff-ffffffffffff'), { headers: auth(tokenAdmin) })
cek('URL foto survei tidak ada -> 404', r.status === 404)
r = await fetch(`${BASE}/photos/${id}/ktp`)
cek('foto tanpa parameter -> 400', r.status === 400)

// 9. DELETE /surveys/:id (admin)
r = await fetch(`${BASE}/surveys/${id}`, { method: 'DELETE', headers: auth() })
cek('DELETE survei oleh surveyor -> 403', r.status === 403)
r = await fetch(`${BASE}/surveys/${id}`, { method: 'DELETE', headers: auth(tokenAdmin) })
cek('DELETE survei oleh admin -> 200, baris, foto, log, dan file hilang', r.status === 200 && tabel.surveys.size === 0 && tabel.photos.size === 0 && tabel.log.length === 0 && disk.size === 0)
r = await fetch(`${BASE}/surveys/${id}`, { method: 'DELETE', headers: auth(tokenAdmin) })
cek('DELETE survei kedua kali -> 404', r.status === 404)

// 10. JSON rusak -> 400
r = await fetch(`${BASE}/surveys/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json', ...auth() }, body: '{rusak' })
cek('JSON rusak -> 400', r.status === 400)

server.close()
console.log(hasil.join('\n'))
const gagal = hasil.filter(h => h.startsWith('GAGAL')).length
console.log(`\n${hasil.length - gagal}/${hasil.length} lolos`)
process.exit(gagal ? 1 : 0)
