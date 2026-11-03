import './style.css'
import { registerSW } from 'virtual:pwa-register'
import { daftarSurvei } from './db.js'
import { tampilkanForm, LABEL_STATUS, formatTanggal } from './form.js'
import { tampilkanJumlahPending, jalankanSync } from './sync.js'
import { muatSesi, getSurveyor, sesiKedaluwarsa, adaPin, sudahTerbuka, kunci,
         tampilkanLogin, tampilkanBuatPin, tampilkanPin } from './auth.js'
import { tampilkanDasbor } from './dasbor.js'

// Minta penyimpanan permanen agar browser tidak menghapus data saat memori HP penuh
if (navigator.storage?.persist) navigator.storage.persist()

// ---------- Ikon (SVG garis 24x24) ----------
const svg = (isi) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${isi}</svg>`
export const IKON = {
  petir: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M13 2 4 14h6l-1 8 9-12h-6l1-8z"/></svg>',
  kamera: svg('<path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/>'),
  lokasi: svg('<path d="M12 21s7-6.2 7-11a7 7 0 0 0-14 0c0 4.8 7 11 7 11z"/><circle cx="12" cy="10" r="2.5"/>'),
  tambah: svg('<path d="M12 5v14M5 12h14"/>'),
  cari: svg('<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>'),
  cek: svg('<path d="m5 12 5 5L20 7"/>'),
  peringatan: svg('<path d="M12 3 2 20h20L12 3z"/><path d="M12 10v5M12 18h.01"/>'),
  kirim: svg('<path d="M22 2 11 13"/><path d="M22 2 15 22l-4-9-9-4z"/>'),
  grafik: svg('<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>'),
  daftar: svg('<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>'),
  kembali: svg('<path d="m15 18-6-6 6-6"/>'),
  unduh: svg('<path d="M12 3v12M6 11l6 6 6-6M4 21h16"/>'),
  segarkan: svg('<path d="M21 12a9 9 0 1 1-2.6-6.4"/><path d="M21 3v6h-6"/>'),
  jam: svg('<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>'),
  simpan: svg('<path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><path d="M17 21v-8H7v8M7 3v5h8"/>'),
  hapus: svg('<path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14M10 11v6M14 11v6"/>')
}
export const ikon = (nama) => IKON[nama] ?? ''

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

export const adminAktif = () => getSurveyor()?.role === 'admin'
export const layarUtama = () => (adminAktif() ? 'dasbor' : 'beranda')

function perbaruiHeader() {
  const surveyor = getSurveyor()
  const terbuka = sudahTerbuka()
  document.getElementById('atas-sub').textContent = surveyor
    ? `${surveyor.nama}${surveyor.role === 'admin' ? ' · Admin' : ''}` : 'Listrik'
  document.getElementById('btn-kunci').hidden = !terbuka
  document.getElementById('badge-pending').hidden = !terbuka || adminAktif()
  const nav = document.getElementById('btn-nav')
  nav.hidden = !(terbuka && adminAktif())
  if (!nav.hidden) {
    nav.innerHTML = layarAktif === 'dasbor' ? `${ikon('daftar')}<span>Survei</span>` : `${ikon('grafik')}<span>Dasbor</span>`
  }
}

export async function tampilkanLayar(nama, params = {}) {
  if (!layar[nama]) throw new Error(`Layar "${nama}" belum terdaftar`)
  // Layar data hanya boleh dibuka setelah PIN benar (kunci enkripsi ada di memori)
  const butuhKunci = !['login', 'buat-pin', 'pin'].includes(nama)
  if (butuhKunci && !sudahTerbuka()) {
    nama = getSurveyor() ? ((await adaPin()) ? 'pin' : 'buat-pin') : 'login'
    params = {}
  }
  layarAktif = nama
  perbaruiHeader()
  elApp.classList.toggle('lebar', nama === 'dasbor')
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

// ---------- Beranda: ringkasan dan daftar survei ----------
const ILUSTRASI_KOSONG = `
  <svg viewBox="0 0 120 120" fill="none" aria-hidden="true">
    <circle cx="60" cy="60" r="52" fill="#e8f0fd"/>
    <rect x="34" y="30" width="52" height="64" rx="8" fill="#fff" stroke="#cfdffb" stroke-width="2"/>
    <rect x="44" y="44" width="32" height="4" rx="2" fill="#cfdffb"/>
    <rect x="44" y="56" width="24" height="4" rx="2" fill="#cfdffb"/>
    <rect x="44" y="68" width="28" height="4" rx="2" fill="#cfdffb"/>
    <path d="M64 20 55 34h7l-1 10 9-14h-7l1-10z" fill="#0b5ed7"/>
  </svg>`

const awalHari = (d = new Date()) => new Date(d.getFullYear(), d.getMonth(), d.getDate())

daftarkanLayar('beranda', async (el) => {
  const semua = await daftarSurvei()
  const hariIni = semua.filter(s => new Date(s.createdAt) >= awalHari()).length
  const menunggu = semua.filter(s => s.status === 'pending' || s.status === 'failed').length
  const terkirim = semua.filter(s => s.status === 'sent').length
  const surveyor = getSurveyor()
  const tanggal = new Date().toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })

  el.innerHTML = `
    <div class="sapaan">
      <h2>Halo, ${surveyor?.nama?.split(' ')[0] ?? 'Surveyor'}</h2>
      <p>${tanggal}</p>
    </div>
    <div class="ringkasan-grid">
      <div class="tile biru"><div class="tile-angka">${hariIni}</div><div class="tile-label">Survei hari ini</div></div>
      <div class="tile kuning"><div class="tile-angka">${menunggu}</div><div class="tile-label">Menunggu kirim</div></div>
      <div class="tile hijau"><div class="tile-angka">${terkirim}</div><div class="tile-label">Terkirim</div></div>
    </div>
    <label class="cari">${ikon('cari')}<input id="cari-survei" type="search" placeholder="Cari nama atau kelurahan" autocomplete="off"></label>
    <section class="daftar" id="daftar-survei"></section>
    <button type="button" class="fab" id="btn-survei-baru">${ikon('tambah')}<span>Survei baru</span></button>
  `
  const wadah = el.querySelector('#daftar-survei')

  const render = (kata = '') => {
    const q = kata.trim().toLowerCase()
    const daftar = q
      ? semua.filter(s => [s.ringkasan?.nama, s.ringkasan?.kelurahan, s.pelanggan?.nama].filter(Boolean).join(' ').toLowerCase().includes(q))
      : semua
    wadah.innerHTML = ''
    if (!daftar.length) {
      wadah.innerHTML = `
        <div class="kartu kosong">
          ${ILUSTRASI_KOSONG}
          <h3>${q ? 'Tidak ada yang cocok' : 'Belum ada survei'}</h3>
          <p>${q ? 'Coba kata kunci lain.' : 'Tekan <strong>Survei baru</strong> untuk mulai mengisi data calon pelanggan.'}</p>
        </div>`
      return
    }
    for (const s of daftar) {
      const item = document.createElement('button')
      item.type = 'button'
      item.className = `item-survei s-${s.status}`
      item.innerHTML = `
        <div class="item-judul"></div>
        <div class="item-sub"></div>
        <div class="item-waktu"></div>
        <span class="status status-${s.status}">${LABEL_STATUS[s.status] ?? s.status}</span>`
      item.querySelector('.item-judul').textContent = s.ringkasan?.nama?.trim() || s.pelanggan?.nama?.trim() || 'Tanpa nama'
      const kel = s.ringkasan?.kelurahan || s.pelanggan?.kelurahan
      item.querySelector('.item-sub').textContent = kel ? `Kelurahan/Desa ${kel}` : 'Kelurahan belum diisi'
      item.querySelector('.item-waktu').textContent = formatTanggal(s.updatedAt || s.createdAt)
      item.addEventListener('click', () => tampilkanLayar('form', { id: s.id }))
      wadah.appendChild(item)
    }
  }
  render()
  el.querySelector('#cari-survei').addEventListener('input', e => render(e.target.value))
  el.querySelector('#btn-survei-baru').addEventListener('click',
    () => tampilkanLayar('form', { surveyorId: surveyor?.id }))
})

daftarkanLayar('form', tampilkanForm)
daftarkanLayar('dasbor', tampilkanDasbor)
daftarkanLayar('login', tampilkanLogin)
daftarkanLayar('buat-pin', tampilkanBuatPin)
daftarkanLayar('pin', tampilkanPin)

// Tombol Kunci: buang kunci enkripsi dari memori, kembali ke layar PIN
document.getElementById('btn-kunci').addEventListener('click', () => {
  kunci()
  syncSudahDimulai = false
  tampilkanLayar('pin')
})

// Admin: berpindah antara dasbor dan daftar survei
document.getElementById('btn-nav').addEventListener('click', () => {
  tampilkanLayar(layarAktif === 'dasbor' ? 'beranda' : 'dasbor')
})

// ---------- Alur mulai (Langkah 8) ----------
async function mulai() {
  await muatSesi()
  perbaruiHeader()
  if (!getSurveyor()) return tampilkanLayar('login')
  if (sesiKedaluwarsa() && navigator.onLine) {
    return tampilkanLayar('login', { pesan: 'Sesi 7 hari sudah berakhir. Masuk lagi untuk melanjutkan.' })
  }
  tampilkanLayar((await adaPin()) ? 'pin' : 'buat-pin')
}
mulai()
