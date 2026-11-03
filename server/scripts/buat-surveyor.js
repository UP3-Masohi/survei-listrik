// Membuat akun surveyor/admin:
//   node scripts/buat-surveyor.js <username> <password> "<nama>" [surveyor|admin]
import { randomUUID } from 'node:crypto'
import bcrypt from 'bcryptjs'
import { pool } from '../src/db.js'

const [username, password, nama, role = 'surveyor'] = process.argv.slice(2)
if (!username || !password || !nama) {
  console.error('Pakai: node scripts/buat-surveyor.js <username> <password> "<nama>" [surveyor|admin]')
  process.exit(1)
}
if (!['surveyor', 'admin'].includes(role)) { console.error('role harus surveyor atau admin'); process.exit(1) }

const hash = await bcrypt.hash(password, 10)
const id = randomUUID()
await pool.query(`
  INSERT INTO surveyors (id, nama, username, password_hash, role) VALUES ($1, $2, $3, $4, $5)
  ON CONFLICT (username) DO UPDATE SET nama = EXCLUDED.nama, password_hash = EXCLUDED.password_hash, role = EXCLUDED.role`,
  [id, nama, username, hash, role])
console.log(`Akun ${role} "${username}" siap.`)
await pool.end()
