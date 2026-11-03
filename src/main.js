import './style.css'
import { registerSW } from 'virtual:pwa-register'

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

// ---------- Layar awal (sementara, diganti pada langkah berikutnya) ----------
daftarkanLayar('beranda', (el) => {
  const dukung = (ok) => ok
    ? '<span class="ya">tersedia</span>'
    : '<span class="tidak">tidak tersedia</span>'
  el.innerHTML = `
    <section class="kartu">
      <h2>Kerangka PWA siap</h2>
      <p>Aplikasi ini bisa dipasang ke layar utama dan terbuka tanpa sinyal.
         Form survei, foto, GPS, dan sinkronisasi ditambahkan pada langkah berikutnya.</p>
    </section>
    <section class="kartu">
      <h2>Dukungan perangkat</h2>
      <div class="status-baris"><span>Service worker</span>${dukung('serviceWorker' in navigator)}</div>
      <div class="status-baris"><span>IndexedDB</span>${dukung('indexedDB' in window)}</div>
      <div class="status-baris"><span>GPS</span>${dukung('geolocation' in navigator)}</div>
      <div class="status-baris"><span>Status jaringan</span><span id="status-jaringan"></span></div>
    </section>
  `
  const perbaruiJaringan = () => {
    const s = el.querySelector('#status-jaringan')
    if (s) s.innerHTML = navigator.onLine ? '<span class="ya">online</span>' : '<span class="tidak">offline</span>'
  }
  perbaruiJaringan()
  window.addEventListener('online', perbaruiJaringan)
  window.addEventListener('offline', perbaruiJaringan)
})

// Badge sementara; diisi oleh sync.js pada Langkah 6
document.getElementById('badge-pending').textContent = 'Belum ada survei'

tampilkanLayar('beranda')
