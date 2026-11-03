import { db, daftarFoto } from './db.js'
import { enkripsiBytes } from './auth.js'

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
  // Langkah 8: foto KTP/KK berisi NIK, jadi disimpan terenkripsi (AES-GCM) di IndexedDB
  const { iv, data } = await enkripsiBytes(await blob.arrayBuffer())
  await db.photos.put({ id: `${surveyId}-${tipe}`, surveyId, type: tipe, blob: new Blob([data]), iv, size: blob.size })
  return URL.createObjectURL(blob)   // untuk pratinjau
}

// ===================== Pratinjau dan pengikatan input =====================

export const JENIS_FOTO = [
  ['ktp', 'Foto KTP'],
  ['kk', 'Foto KK'],
  ['rumah', 'Foto tampak depan rumah']
]

const urlAktif = {}   // object URL per tipe, dicabut saat diganti

function tampilkanPratinjau(root, tipe, url, size) {
  if (urlAktif[tipe]) URL.revokeObjectURL(urlAktif[tipe])
  urlAktif[tipe] = url
  const img = root.querySelector(`#pratinjau-${tipe}`)
  if (img) {
    img.src = url
    img.hidden = false
    const tile = img.closest('.foto-tile')
    if (tile) {
      tile.classList.add('ada')
      const cek = tile.querySelector('.cek')
      if (cek) cek.hidden = false
    }
  }
  const ket = root.querySelector(`[data-ket-foto="${tipe}"]`)
  if (ket) ket.textContent = `${Math.round(size / 1024)} KB`
}

// Tampilkan foto yang sudah ada di IndexedDB (saat draf dibuka kembali)
export async function muatPratinjau(root, surveyId) {
  const daftar = await daftarFoto(surveyId)
  for (const f of daftar) tampilkanPratinjau(root, f.type, URL.createObjectURL(f.blob), f.size)
  return daftar.length
}

// surveiAktif = record survei yang sedang diisi (dari form.js).
// Form dibuat dinamis, jadi pengikatan dilakukan setelah form dirender, bukan saat modul dimuat.
export function pasangInputFoto(root, surveiAktif, onTersimpan) {
  root.querySelectorAll('input[type=file]').forEach(el =>
    el.addEventListener('change', async e => {
      const file = e.target.files[0]
      if (!file) return
      const tipe = el.dataset.tipe
      const ket = root.querySelector(`[data-ket-foto="${tipe}"]`)
      if (ket) ket.textContent = 'Memproses foto…'
      try {
        const url = await simpanFoto(surveiAktif.id, tipe, file)
        const rekam = await db.photos.get(`${surveiAktif.id}-${tipe}`)
        tampilkanPratinjau(root, tipe, url, rekam?.size ?? 0)
        onTersimpan?.(tipe)
      } catch (err) {
        console.error('Gagal memproses foto', err)
        if (ket) ket.textContent = 'Gagal memproses foto, coba lagi'
      } finally {
        el.value = ''   // agar memilih file yang sama memicu change lagi
      }
    }))
}
