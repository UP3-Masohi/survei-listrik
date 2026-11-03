import './style.css'
import { registerSW } from 'virtual:pwa-register'
import { daftarSurvei } from './db.js'
import { tampilkanForm, LABEL_STATUS, formatTanggal } from './form.js'
import { tampilkanJumlahPending, jalankanSync } from './sync.js'
import { muatSesi, getSurveyor, sesiKedaluwarsa, adaPin, sudahTerbuka, kunci,
         tampilkanLogin, tampilkanBuatPin, tampilkanPin } from './auth.js'

// Minta penyimpanan permanen agar browser tidak menghapus data saat memori HP penuh
if (navigator.storage?.persist) navigator.storage.persist()

// ---------- Notifikasi kecil di bawah layar ----------
const elNotif = document.getElementById('notifikasi')

export function tampilkanNotifikasi(pesan, { label, aksi, durasiMs = 4000 } = {}) {
  elNotif.innerHTML = ''
  const teks = document.createElement('span')
  teks.textContent = pesan
  elNotif.appendChild(teks)
  if (label && aksi) {
    const tombol = document.createElement('button')
    tombol.textContent = label
    tombol.addEventListener('click', aksi)
    elNotif.appendChild(tombol)
  }
  elNotif.hidden = false
  clearTimeout(tampilkanNotifikasi._timer)
  if (durasiMs > 0) {
    tampilkanNotifikasi._timer = setTimeout(() => { elNotif.hidden = true }, durasiMs)
  }
}

// ---------- Service worker ----------
const perbaruiSW = registerSW({
  immediate: true,
  onNeedRefresh() {
    tampilkanNotifikasi('Versi baru siap, muat ulang', {
      label: 'Muat ulang', aksi: () => perbaruiSW(true), durasiMs: 0
    })
  },
  onOfflineReady() {
    tampilkanNotifikasi('Aplikasi siap dipakai tanpa sinyal')
  },
  onRegisterError(e) {
    console.error('Gagal mendaftarkan service worker', e)
  }
})

// ---------- Navigasi antar layar ----------
const layar = {}
const elApp = document.getElementById('app')
let layarAktif = null
let syncSudahDimulai = false   // sync.js tidak bisa membaca data sebelum PIN benar

export function daftarkanLayar(nama, render) {
  layar[nama] = render
}

export async function tampilkanLayar(nama, params = {}) {
  const render = layar[nama]
  if (!render) throw new Error(`Layar "${nama}" belum terdaftar`)
  // Layar data hanya boleh dibuka setelah PIN benar (kunci enkripsi ada di memori)
  const butuhKunci = !['login', 'buat-pin', 'pin'].includes(nama)
  if (butuhKunci && !sudahTerbuka()) {
    nama = getSurveyor() ? ((await adaPin()) ? 'pin' : 'buat-pin') : 'login'
    params = {}
  }
  layarAktif = nama
  document.getElementById('btn-kunci').hidden = !sudahTerbuka()
  document.getElementById('badge-pending').hidden = !sudahTerbuka()   // jumlah antrian hanya setelah PIN
  elApp.innerHTML = ''
  await layar[nama](elApp, params)
  window.scrollTo(0, 0)
  // Sekali setiap kali aplikasi dibuka dengan PIN: segarkan badge dan proses antrian
  if (butuhKunci && sudahTerbuka() && !syncSudahDimulai) {
    syncSudahDimulai = true
    tampilkanJumlahPending()
    jalankanSync()
  }
}

// Setelah antrian diproses, segarkan daftar agar status "Terkirim" langsung terlihat
document.addEventListener('sync-selesai', () => {
  if (layarAktif === 'beranda') tampilkanLayar('beranda')
})

// ---------- Beranda: daftar survei ----------
daftarkanLayar('beranda', async (el) => {
  const daftar = await daftarSurvei()
  el.innerHTML = `
    <button type="button" class="tombol" id="btn-survei-baru">+ Survei baru</button>
    <section class="daftar" id="daftar-survei"></section>
  `
  const wadah = el.querySelector('#daftar-survei')
  if (!daftar.length) {
    wadah.innerHTML = `
      <div class="kartu kosong">
        <p>Belum ada survei. Tekan <strong>Survei baru</strong> untuk mulai mengisi.</p>
      </div>`
  }
  for (const s of daftar) {
    const item = document.createElement('button')
    item.type = 'button'
    item.className = 'kartu item-survei'
    item.innerHTML = `
      <div class="item-judul"></div>
      <div class="item-sub"></div>
      <div class="item-bawah">
        <span class="item-waktu"></span>
        <span class="status status-${s.status}">${LABEL_STATUS[s.status] ?? s.status}</span>
      </div>`
    item.querySelector('.item-judul').textContent = s.ringkasan?.nama?.trim() || s.pelanggan?.nama?.trim() || 'Tanpa nama'
    item.querySelector('.item-sub').textContent = (s.ringkasan?.kelurahan || s.pelanggan?.kelurahan)
      ? `Kelurahan/Desa ${s.ringkasan?.kelurahan || s.pelanggan?.kelurahan}` : 'Kelurahan belum diisi'
    item.querySelector('.item-waktu').textContent = formatTanggal(s.updatedAt || s.createdAt)
    item.addEventListener('click', () => tampilkanLayar('form', { id: s.id }))
    wadah.appendChild(item)
  }
  el.querySelector('#btn-survei-baru').addEventListener('click',
    () => tampilkanLayar('form', { surveyorId: getSurveyor()?.id }))
})

daftarkanLayar('form', tampilkanForm)
daftarkanLayar('login', tampilkanLogin)
daftarkanLayar('buat-pin', tampilkanBuatPin)
daftarkanLayar('pin', tampilkanPin)

// Tombol Kunci: buang kunci enkripsi dari memori, kembali ke layar PIN
document.getElementById('btn-kunci').addEventListener('click', () => {
  kunci()
  syncSudahDimulai = false
  tampilkanLayar('pin')
})

// ---------- Alur mulai (Langkah 8) ----------
async function mulai() {
  await muatSesi()
  if (!getSurveyor()) return tampilkanLayar('login')
  if (sesiKedaluwarsa() && navigator.onLine) {
    return tampilkanLayar('login', { pesan: 'Sesi 7 hari sudah berakhir. Masuk lagi untuk melanjutkan.' })
  }
  tampilkanLayar((await adaPin()) ? 'pin' : 'buat-pin')
}
mulai()
