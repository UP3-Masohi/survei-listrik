import { buatApp } from './app.js'
import { pool } from './db.js'
import { simpanKeStorage, bacaDariStorage } from './storage.js'

const PORT = Number(process.env.PORT || 3000)
const corsOrigin = (process.env.CORS_ORIGIN || 'http://localhost:5173').split(',').map(s => s.trim())

const app = buatApp({ pool, simpanKeStorage, bacaDariStorage, corsOrigin })
app.listen(PORT, () => console.log(`API survei berjalan di port ${PORT}`))
