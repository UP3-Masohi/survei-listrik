import express from 'express'
import cors from 'cors'
import multer from 'multer'
import { rutLogin, auth, hanyaAdmin } from './auth.js'

const TIPE_FOTO = new Set(['ktp', 'kk', 'rumah'])
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// pool dan simpanKeStorage disuntikkan agar aplikasi bisa diuji tanpa database sungguhan
export function buatApp({ pool, simpanKeStorage, corsOrigin }) {
  const app = express()
  app.disable('x-powered-by')
  app.use(cors({ origin: corsOrigin }))     // hanya domain PWA
  app.use(express.json({ limit: '2mb' }))   // tanda tangan PNG ikut di body

  const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 2 * 1024 * 1024 } })

  app.get('/health', (req, res) => res.json({ ok: true }))

  app.post('/auth/login', rutLogin(pool))

  app.put('/surveys/:id', auth, async (req, res) => {
    const s = req.body
    if (s.id !== req.params.id) return res.status(400).json({ error: 'id tidak cocok' })
    if (!UUID.test(s.id)) return res.status(400).json({ error: 'id bukan UUID' })
    if (!s.lokasi?.lat || !s.lokasi?.lng) return res.status(400).json({ error: 'lokasi belum ada' })
    await pool.query(`
      INSERT INTO surveys (id, surveyor_id, data, lat, lng, accuracy_m, created_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      ON CONFLICT (id) DO UPDATE
        SET data = EXCLUDED.data, lat = EXCLUDED.lat, lng = EXCLUDED.lng,
            accuracy_m = EXCLUDED.accuracy_m`,
      [s.id, req.user.id, s, s.lokasi.lat, s.lokasi.lng, s.lokasi.accuracyM, s.createdAt])
    res.json({ ok: true })
  })

  app.put('/surveys/:id/photos/:type', auth, upload.single('file'), async (req, res) => {
    if (!UUID.test(req.params.id)) return res.status(400).json({ error: 'id bukan UUID' })
    if (!TIPE_FOTO.has(req.params.type)) return res.status(400).json({ error: 'type harus ktp, kk, atau rumah' })
    if (!req.file) return res.status(400).json({ error: 'file foto tidak ada' })
    const { rowCount } = await pool.query(
      'SELECT 1 FROM surveys WHERE id = $1 AND surveyor_id = $2', [req.params.id, req.user.id])
    if (!rowCount) return res.status(404).json({ error: 'survei belum ada, kirim data survei dulu' })
    const path = `${req.params.id}/${req.params.type}.jpg`   // key di S3/MinIO atau path di disk
    await simpanKeStorage(path, req.file.buffer)
    await pool.query(`
      INSERT INTO photos (survey_id, type, path, size) VALUES ($1, $2, $3, $4)
      ON CONFLICT (survey_id, type) DO UPDATE SET path = EXCLUDED.path, size = EXCLUDED.size`,
      [req.params.id, req.params.type, path, req.file.size])
    res.json({ ok: true })
  })

  // Daftar survei untuk admin: ?from=YYYY-MM-DD&to=YYYY-MM-DD (berdasarkan created_at)
  app.get('/surveys', auth, hanyaAdmin, async (req, res) => {
    const { from, to } = req.query
    const { rows } = await pool.query(`
      SELECT s.id, s.surveyor_id, u.nama AS surveyor, s.data, s.lat, s.lng, s.accuracy_m,
             s.created_at, s.received_at,
             COALESCE(json_agg(json_build_object('type', p.type, 'size', p.size))
                      FILTER (WHERE p.survey_id IS NOT NULL), '[]') AS photos
      FROM surveys s
      LEFT JOIN surveyors u ON u.id = s.surveyor_id
      LEFT JOIN photos p ON p.survey_id = s.id
      WHERE ($1::timestamptz IS NULL OR s.created_at >= $1)
        AND ($2::timestamptz IS NULL OR s.created_at < $2::timestamptz + interval '1 day')
      GROUP BY s.id, u.nama
      ORDER BY s.created_at DESC
      LIMIT 1000`, [from || null, to || null])
    res.json(rows)
  })

  // Penanganan galat: multer (file terlalu besar), JSON rusak, dan galat lain
  app.use((err, req, res, next) => {
    if (err?.code === 'LIMIT_FILE_SIZE') return res.status(413).json({ error: 'foto maksimal 2 MB' })
    if (err?.type === 'entity.parse.failed') return res.status(400).json({ error: 'JSON tidak valid' })
    console.error(err)
    res.status(500).json({ error: 'galat server' })
  })

  return app
}
