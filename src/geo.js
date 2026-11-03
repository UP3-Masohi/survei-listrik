import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import ikonMarker from 'leaflet/dist/images/marker-icon.png'
import ikonMarker2x from 'leaflet/dist/images/marker-icon-2x.png'
import bayanganMarker from 'leaflet/dist/images/marker-shadow.png'

// Vite tidak menemukan gambar marker bawaan Leaflet secara otomatis, jadi ditunjuk langsung.
// _getIconUrl dihapus agar Leaflet tidak menambahkan jalur deteksi otomatis di depan URL ini.
delete L.Icon.Default.prototype._getIconUrl
L.Icon.Default.mergeOptions({ iconUrl: ikonMarker, iconRetinaUrl: ikonMarker2x, shadowUrl: bayanganMarker })

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
