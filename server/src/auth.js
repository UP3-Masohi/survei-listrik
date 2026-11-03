import jwt from 'jsonwebtoken'
import bcrypt from 'bcryptjs'

const JWT_SECRET = process.env.JWT_SECRET || 'ganti-dengan-rahasia-acak-yang-panjang'
const MASA_BERLAKU = '7d'

export function buatToken(surveyor) {
  return jwt.sign({ id: surveyor.id, nama: surveyor.nama, role: surveyor.role }, JWT_SECRET, { expiresIn: MASA_BERLAKU })
}

// POST /auth/login -> { token, surveyor }
export function rutLogin(pool) {
  return async (req, res) => {
    const { username, password } = req.body ?? {}
    if (!username || !password) return res.status(400).json({ error: 'username dan password wajib diisi' })
    const { rows } = await pool.query(
      'SELECT id, nama, username, password_hash, role FROM surveyors WHERE username = $1', [username])
    const s = rows[0]
    if (!s || !(await bcrypt.compare(password, s.password_hash))) {
      return res.status(401).json({ error: 'username atau password salah' })
    }
    res.json({ token: buatToken(s), surveyor: { id: s.id, nama: s.nama, role: s.role } })
  }
}

// Middleware: memeriksa Bearer token, mengisi req.user
export function auth(req, res, next) {
  const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '')
  if (!token) return res.status(401).json({ error: 'token tidak ada' })
  try {
    req.user = jwt.verify(token, JWT_SECRET)
    next()
  } catch {
    res.status(401).json({ error: 'token tidak valid atau kedaluwarsa' })
  }
}

export function hanyaAdmin(req, res, next) {
  if (req.user?.role !== 'admin') return res.status(403).json({ error: 'hanya admin' })
  next()
}
