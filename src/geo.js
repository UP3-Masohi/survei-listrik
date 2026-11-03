import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import ikonMarker from 'leaflet/dist/images/marker-icon.png'
import ikonMarker2x from 'leaflet/dist/images/marker-icon-2x.png'
import bayanganMarker from 'leaflet/dist/images/marker-shadow.png'

// Vite tidak menemukan gambar marker bawaan Leaflet secara otomatis, jadi ditunjuk langsung.
// _getIconUrl dihapus agar Leaflet tidak menambahkan jalur deteksi otomatis di depan URL ini.
delete L.Icon.Default.prototype._getIconUrl
L.Icon.Default.mergeOptions({ iconUrl: ikonMarker, iconRetinaUrl: ikonMarker2x, shadowUrl: bayanganMarker })

// Tingkat akurasi GPS (meter). Di permukiman padat 20-50 m lazim; >100 m tidak layak dipakai.
export const TINGKAT_AKURASI = [
  { maks: 20, kode: 'baik', label: 'Akurasi baik', pesan: 'Titik siap dipakai, geser marker bila perlu.' },
  { maks: 50, kode: 'sedang', label: 'Akurasi sedang', pesan: 'Geser marker ke posisi rumah bila titik meleset.' },
  { maks: 100, kode: 'rendah', label: 'Akurasi rendah', pesan: 'Wajib geser marker ke posisi rumah sebelum kirim.' },
  { maks: Infinity, kode: 'buruk', label: 'Akurasi buruk', pesan: 'Pindah ke tempat terbuka lalu ambil ulang.' }
]
export const MAKS_AKURASI_DITERIMA_M = 100     // di atas ini ditolak
export const MAKS_AKURASI_TANPA_GESER_M = 50   // di atas ini marker wajib digeser manual
export const TARGET_AKURASI_M = 20             // berhenti mencari lebih awal bila sudah sebaik ini

export function tingkatAkurasi(akurasiM) {
  return TINGKAT_AKURASI.find(t => akurasiM <= t.maks)
}

// Membaca GPS sampai maksDetik dan mengambil pembacaan dengan akurasi terbaik.
// Saat offline, pembacaan pertama sering 50-100 m lalu membaik, jadi sekali baca tidak cukup.
// onUpdate(akurasiSekarang, akurasiTerbaik) dipanggil tiap pembacaan untuk indikator di layar.
export function ambilLokasi(maksAkurasiM = MAKS_AKURASI_DITERIMA_M,
                            { targetM = TARGET_AKURASI_M, maksDetik = 30, onUpdate } = {}) {
  return new Promise((res, rej) => {
    if (!navigator.geolocation) return rej(new Error('Perangkat ini tidak mendukung GPS.'))
    let terbaik = null
    let idWatch = null
    let timer = null
    const selesai = (galat) => {
      if (idWatch !== null) navigator.geolocation.clearWatch(idWatch)
      clearTimeout(timer)
      if (galat) return rej(galat)
      if (!terbaik) return rej(new Error(`Sinyal GPS tidak didapat dalam ${maksDetik} detik, coba lagi di tempat terbuka`))
      if (terbaik.accuracyM > maksAkurasiM) {
        return rej(new Error(`Akurasi ${terbaik.accuracyM} m, coba lagi di tempat terbuka`))
      }
      res(terbaik)
    }
    idWatch = navigator.geolocation.watchPosition(p => {
      const akurasi = Math.round(p.coords.accuracy)
      if (!terbaik || akurasi < terbaik.accuracyM) {
        terbaik = { lat: p.coords.latitude, lng: p.coords.longitude, accuracyM: akurasi,
                    capturedAt: new Date().toISOString(), manual: false }
      }
      onUpdate?.(akurasi, terbaik.accuracyM)
      if (terbaik.accuracyM <= targetM) selesai()
    }, e => {
      if (e.code === 1) selesai(e)   // izin ditolak: berhenti; galat lain: tunggu sampai waktu habis
    }, { enableHighAccuracy: true, timeout: maksDetik * 1000, maximumAge: 0 })
    timer = setTimeout(() => selesai(), maksDetik * 1000)
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

// Pesan ramah untuk galat GPS
export function pesanGalatLokasi(e) {
  if (!navigator.geolocation) return 'Perangkat ini tidak mendukung GPS.'
  switch (e?.code) {
    case 1: return 'Izin lokasi ditolak. Izinkan akses lokasi untuk aplikasi ini.'
    case 2: return 'Posisi tidak tersedia. Pastikan GPS aktif.'
    case 3: return 'Waktu habis mencari sinyal GPS.'
    default: return e?.message || 'Gagal mengambil lokasi.'
  }
}
