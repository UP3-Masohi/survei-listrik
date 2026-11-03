import { db, bacaSurvei, daftarFoto } from './db.js'
import { kirimSurvei, kirimFoto } from './api.js'
import { tampilkanNotifikasi } from './main.js'
import { sudahTerbuka } from './auth.js'

let sibuk = false
const MAKS_PERCOBAAN = 5

export async function jalankanSync() {
  if (sibuk || !navigator.onLine || !sudahTerbuka()) return   // terkunci: data tidak bisa didekripsi
  sibuk = true
  try {
    for (const item of await db.outbox.orderBy('seq').toArray()) {
      if (item.attempts >= MAKS_PERCOBAAN) continue   // survei "failed" menunggu tombol Kirim ulang
      const s = await bacaSurvei(item.surveyId)
      try {
        await kirimSurvei(s)
        for (const f of await daftarFoto(s.id))
          await kirimFoto(s.id, f.type, f.blob)
        await db.transaction('rw', db.surveys, db.outbox, db.photos, async () => {
          // Langkah 8: isi form dihapus dari HP, sisakan ringkasan nama dan status tanpa NIK
          await db.surveys.update(s.id, { status: 'sent', sentAt: new Date().toISOString(), rahasia: undefined })
          await db.outbox.delete(item.seq)
          await db.photos.where('surveyId').equals(s.id).delete()   // bersihkan foto dari HP
        })
      } catch (e) {
        if (/HTTP 401/.test(String(e))) {
          // Token kedaluwarsa: hentikan sync, jangan dihitung sebagai percobaan gagal
          tampilkanNotifikasi('Sesi berakhir, silakan login ulang untuk mengirim survei', { durasiMs: 8000 })
          break
        }
        const n = item.attempts + 1
        await db.outbox.update(item.seq, { attempts: n, lastError: String(e) })
        if (n >= MAKS_PERCOBAAN) await db.surveys.update(s.id, { status: 'failed' })
      }
    }
  } finally { sibuk = false }
  tampilkanJumlahPending()
  document.dispatchEvent(new Event('sync-selesai'))
}

export async function tampilkanJumlahPending() {
  const n = await db.outbox.count()
  document.getElementById('badge-pending').textContent = n ? `${n} menunggu kirim` : 'Semua terkirim'
}

// Survei berstatus failed: kembalikan attempts ke 0 dan status ke pending, lalu coba kirim lagi
export async function kirimUlang(surveyId) {
  await db.transaction('rw', db.surveys, db.outbox, async () => {
    await db.outbox.where('surveyId').equals(surveyId).modify({ attempts: 0, lastError: null })
    await db.surveys.update(surveyId, { status: 'pending' })
  })
  await tampilkanJumlahPending()
  jalankanSync()
}

export function ambilGalatTerakhir(surveyId) {
  return db.outbox.where('surveyId').equals(surveyId).first()
}

window.addEventListener('online', jalankanSync)
setInterval(jalankanSync, 60_000)
// Ditunda satu microtask: sync.js, auth.js, dan main.js saling mengimpor, jadi pemanggilan
// langsung saat modul dimuat bisa berjalan sebelum auth.js selesai dievaluasi.
queueMicrotask(jalankanSync)
