import Dexie from 'dexie'
import { enkripsi, dekripsi, dekripsiBytes } from './auth.js'

export const db = new Dexie('SurveiListrik')
db.version(1).stores({
  surveys: 'id, status, createdAt',   // id = UUID yang dibuat di HP
  photos:  'id, surveyId, type',      // type: ktp | kk | rumah
  outbox:  '++seq, surveyId'          // urutan kirim
})
// Langkah 8: tabel sesi (token 7 hari dan data PIN); tabel lain tidak berubah
db.version(2).stores({
  surveys: 'id, status, createdAt',
  photos:  'id, surveyId, type',
  outbox:  '++seq, surveyId',
  sesi:    'kunci'
})

export async function simpanSurvei(survei) {
  survei.updatedAt = new Date().toISOString()
  const terenkripsi = await enkripsiSurvei(survei)   // Langkah 8: dienkripsi sebelum masuk Dexie
  await db.transaction('rw', db.surveys, db.outbox, async () => {
    await db.surveys.put(terenkripsi)
    if (survei.status === 'pending') {
      const sudahAntri = await db.outbox.where('surveyId').equals(survei.id).count()
      if (!sudahAntri) await db.outbox.add({ surveyId: survei.id, attempts: 0 })
    }
  })
}

// ===================== Enkripsi record survei (Langkah 8) =====================
// Di IndexedDB hanya id, status, tanggal, dan ringkasan (nama, kelurahan) yang terbaca;
// pelanggan, permohonan, teknis, lokasi, persetujuan, surveyorId disimpan terenkripsi di `rahasia`.

const FIELD_TERBUKA = ['id', 'status', 'createdAt', 'updatedAt', 'sentAt']

export async function enkripsiSurvei(s) {
  const terbuka = {}
  const rahasia = {}
  for (const [k, v] of Object.entries(s)) {
    if (k === 'ringkasan' || k === 'rahasia') continue
    if (FIELD_TERBUKA.includes(k)) terbuka[k] = v
    else rahasia[k] = v
  }
  terbuka.ringkasan = { nama: s.pelanggan?.nama ?? s.ringkasan?.nama, kelurahan: s.pelanggan?.kelurahan ?? s.ringkasan?.kelurahan }
  terbuka.rahasia = await enkripsi(rahasia)
  return terbuka
}

export async function dekripsiSurvei(rec) {
  if (!rec?.rahasia) return rec   // sudah terkirim (hanya ringkasan) atau data lama tanpa enkripsi
  const { rahasia, ...terbuka } = rec
  return { ...terbuka, ...(await dekripsi(rahasia)) }
}

export async function bacaSurvei(id) {
  return dekripsiSurvei(await db.surveys.get(id))
}

// Daftar untuk beranda: tanpa dekripsi, cukup ringkasan
export function daftarSurvei() {
  return db.surveys.orderBy('createdAt').reverse().toArray()
}

// Foto dengan blob yang sudah didekripsi (foto disimpan terenkripsi oleh camera.js)
export async function daftarFoto(surveyId) {
  const daftar = await db.photos.where('surveyId').equals(surveyId).toArray()
  return Promise.all(daftar.map(async f => {
    if (!f.iv) return f
    const bytes = await dekripsiBytes({ iv: f.iv, data: await f.blob.arrayBuffer() })
    return { ...f, blob: new Blob([bytes], { type: 'image/jpeg' }) }
  }))
}

// Hapus survei beserta foto dan antriannya dari HP (untuk data salah input)
export function hapusSurvei(id) {
  return db.transaction('rw', db.surveys, db.photos, db.outbox, async () => {
    await db.photos.where('surveyId').equals(id).delete()
    await db.outbox.where('surveyId').equals(id).delete()
    await db.surveys.delete(id)
  })
}
