import './style.css'
import { registerSW } from 'virtual:pwa-register'
import { db } from './db.js'
import { tampilkanForm, LABEL_STATUS, formatTanggal } from './form.js'

// Minta penyimpanan permanen agar browser tidak menghapus data saat memori HP penuh
if (navigator.storage?.persist) navigator.storage.persist()

// Sementara: ID surveyor tetap; diganti oleh auth.js pada Langkah 8
const SURVEYOR_ID = 'u-lokal'

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

// ---------- Badge jumlah menunggu kirim ----------
// Sementara; pada Langkah 6 digantikan tampilkanJumlahPending() dari sync.js
export async function perbaruiBadge() {
  const n = await db.outbox.count()
  document.getElementById('badge-pending').textContent = n ? `${n} menunggu kirim` : 'Semua terkirim'
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

export function daftarkanLayar(nama, render) {
  layar[nama] = render
}

export async function tampilkanLayar(nama, params = {}) {
  const render = layar[nama]
  if (!render) throw new Error(`Layar "${nama}" belum terdaftar`)
  elApp.innerHTML = ''
  await render(elApp, params)
  window.scrollTo(0, 0)
}

// ---------- Beranda: daftar survei ----------
daftarkanLayar('beranda', async (el) => {
  const daftar = await db.surveys.orderBy('createdAt').reverse().toArray()
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
    item.querySelector('.item-judul').textContent = s.pelanggan?.nama?.trim() || 'Tanpa nama'
    item.querySelector('.item-sub').textContent = [s.pelanggan?.alamat, s.pelanggan?.kelurahan]
      .filter(Boolean).join(', ') || 'Alamat belum diisi'
    item.querySelector('.item-waktu').textContent = formatTanggal(s.updatedAt || s.createdAt)
    item.addEventListener('click', () => tampilkanLayar('form', { id: s.id }))
    wadah.appendChild(item)
  }
  el.querySelector('#btn-survei-baru').addEventListener('click',
    () => tampilkanLayar('form', { surveyorId: SURVEYOR_ID }))
})

daftarkanLayar('form', tampilkanForm)

perbaruiBadge()
tampilkanLayar('beranda')
