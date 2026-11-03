import Dexie from 'dexie'

export const db = new Dexie('SurveiListrik')
db.version(1).stores({
  surveys: 'id, status, createdAt',   // id = UUID yang dibuat di HP
  photos:  'id, surveyId, type',      // type: ktp | kk | rumah
  outbox:  '++seq, surveyId'          // urutan kirim
})

export async function simpanSurvei(survei) {
  survei.updatedAt = new Date().toISOString()
  await db.transaction('rw', db.surveys, db.outbox, async () => {
    await db.surveys.put(survei)
    if (survei.status === 'pending') {
      const sudahAntri = await db.outbox.where('surveyId').equals(survei.id).count()
      if (!sudahAntri) await db.outbox.add({ surveyId: survei.id, attempts: 0 })
    }
  })
}
