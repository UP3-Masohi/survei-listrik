// Pool PostgreSQL tiruan di memori untuk uji tanpa database: mengenali query dari teks SQL-nya.
import bcrypt from 'bcryptjs'

export async function buatPoolTiruan() {
  const surveyorId = '11111111-1111-4111-8111-111111111111'
  const tabel = {
    surveyors: [{ id: surveyorId, nama: 'Surveyor Uji', username: 'surveyor1', password_hash: await bcrypt.hash('rahasia123', 4), role: 'surveyor' },
                { id: '22222222-2222-4222-8222-222222222222', nama: 'Admin', username: 'admin', password_hash: await bcrypt.hash('admin123', 4), role: 'admin' }],
    surveys: new Map(),
    photos: new Map(),
    log: [],
    hapusLog: []
  }
  const log = []
  const pool = {
    async query(sql, params = []) {
      log.push(sql.trim().split('\n')[0].slice(0, 40))
      if (sql.includes('FROM surveyors WHERE username')) return { rows: tabel.surveyors.filter(s => s.username === params[0]) }
      if (sql.includes('INSERT INTO surveys')) {
        const [id, surveyor_id, data, lat, lng, accuracy_m, created_at] = params
        const lama = tabel.surveys.get(id)
        tabel.surveys.set(id, { id, surveyor_id: lama?.surveyor_id ?? surveyor_id, data, lat, lng, accuracy_m, created_at, received_at: lama?.received_at ?? new Date().toISOString() })
        return { rowCount: 1, rows: [] }
      }
      if (sql.includes('SELECT 1 FROM surveys WHERE id = $1 AND surveyor_id')) { const s = tabel.surveys.get(params[0]); return { rowCount: s && s.surveyor_id === params[1] ? 1 : 0, rows: [] } }
      if (sql.includes('SELECT 1 FROM surveys WHERE id = $1') && !sql.includes('surveyor_id')) return { rowCount: tabel.surveys.has(params[0]) ? 1 : 0, rows: [] }
    if (sql.includes('SELECT s.data, s.surveyor_id')) { const s = tabel.surveys.get(params[0]); return { rows: s ? [{ data: s.data, surveyor_id: s.surveyor_id, surveyor: tabel.surveyors.find(u => u.id === s.surveyor_id)?.nama, created_at: s.created_at }] : [] } }
    if (sql.includes('INSERT INTO survey_deletion_log')) { const [survey_id, nama, kelurahan, surveyor_id, surveyor, survey_created_at, alasan, admin_id] = params; tabel.hapusLog.unshift({ id: tabel.hapusLog.length + 1, survey_id, nama, kelurahan, surveyor_id, surveyor, survey_created_at, alasan, admin_id, deleted_at: new Date().toISOString(), admin: tabel.surveyors.find(u => u.id === admin_id)?.nama }); return { rowCount: 1, rows: [] } }
    if (sql.includes('FROM survey_deletion_log')) return { rows: tabel.hapusLog.slice(0, 200) }
    if (sql.includes('DELETE FROM photo_access_log')) { tabel.log = tabel.log.filter(l => l.survey_id !== params[0]); return { rowCount: 1, rows: [] } }
    if (sql.includes('DELETE FROM photos')) { for (const k of [...tabel.photos.keys()]) if (k.startsWith(params[0] + '-')) tabel.photos.delete(k); return { rowCount: 1, rows: [] } }
    if (sql.includes('DELETE FROM surveys')) { tabel.surveys.delete(params[0]); return { rowCount: 1, rows: [] } }
    if (sql.includes('SELECT 1 FROM photos')) return { rowCount: tabel.photos.has(`${params[0]}-${params[1]}`) ? 1 : 0, rows: [] }
    if (sql.includes('SELECT path FROM photos')) { const p = tabel.photos.get(`${params[0]}-${params[1]}`); return { rows: p ? [{ path: p.path }] : [] } }
    if (sql.includes('INSERT INTO photo_access_log')) { tabel.log.push({ survey_id: params[0], type: params[1], admin_id: params[2], at: new Date().toISOString() }); return { rowCount: 1, rows: [] } }
    if (sql.includes('INSERT INTO photos')) { const [survey_id, type, path, size] = params; tabel.photos.set(`${survey_id}-${type}`, { survey_id, type, path, size }); return { rowCount: 1, rows: [] } }
      if (sql.includes('FROM surveys s')) {
        const rows = [...tabel.surveys.values()].map(s => ({ ...s, surveyor: tabel.surveyors.find(u => u.id === s.surveyor_id)?.nama,
          photos: [...tabel.photos.values()].filter(p => p.survey_id === s.id).map(p => ({ type: p.type, size: p.size })) }))
        return { rows }
      }
      throw new Error('query tidak dikenal: ' + sql.slice(0, 60))
    }
  }
  const disk = new Map()
  const simpanKeStorage = async (path, buf) => { disk.set(path, buf) }
  const bacaDariStorage = async (path) => { const b = disk.get(path); if (!b) throw new Error('tidak ada'); return b }
  const hapusDariStorage = async (folder) => { for (const k of [...disk.keys()]) if (k.startsWith(folder + '/')) disk.delete(k) }

  return { pool, tabel, disk, simpanKeStorage, bacaDariStorage, hapusDariStorage, surveyorId }
}
